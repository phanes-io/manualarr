"use client";
import { useCallback, useRef, useState } from "react";
import type { IngestMode, IngestResult, LidarrArtistMatch, ParsedTrack, ParsedUpload } from "@/lib/types";
import { ArtistSearch } from "./ArtistSearch";
import { UploadIcon, SpinnerIcon, CheckIcon, XIcon, FolderIcon, MusicIcon } from "./Icons";

type Step = "idle" | "uploading" | "review" | "ingesting" | "done";

function fmtBytes(n: number): string {
  if (n > 1e9) return `${(n / 1e9).toFixed(2)} GB`;
  if (n > 1e6) return `${(n / 1e6).toFixed(1)} MB`;
  return `${(n / 1e3).toFixed(0)} KB`;
}
function fmtDur(s: number | null): string {
  if (!s) return "";
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

export function Ingest() {
  const [step, setStep] = useState<Step>("idle");
  const [parsed, setParsed] = useState<ParsedUpload | null>(null);
  const [artist, setArtist] = useState("");
  const [album, setAlbum] = useState("");
  const [year, setYear] = useState("");
  const [tracks, setTracks] = useState<ParsedTrack[]>([]);
  const [mode, setMode] = useState<IngestMode>("lidarr");
  const [selectedArtist, setSelectedArtist] = useState<LidarrArtistMatch | null>(null);
  const [writeTags, setWriteTags] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<IngestResult | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const reset = () => {
    setStep("idle");
    setParsed(null);
    setArtist("");
    setAlbum("");
    setYear("");
    setTracks([]);
    setSelectedArtist(null);
    setResult(null);
    setError(null);
    setWriteTags(false);
    setMode("lidarr");
  };

  const upload = useCallback(async (files: FileList | File[]) => {
    const arr = Array.from(files);
    if (arr.length === 0) return;
    setError(null);
    setStep("uploading");
    const fd = new FormData();
    for (const f of arr) fd.append("files", f);
    try {
      const res = await fetch("/api/upload", { method: "POST", body: fd });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Upload failed");
      const p = data as ParsedUpload;
      setParsed(p);
      setArtist(p.artist);
      setAlbum(p.album);
      setYear(p.year);
      setTracks(p.tracks);
      setStep("review");
    } catch (e) {
      setError((e as Error).message);
      setStep("idle");
    }
  }, []);

  const submit = async () => {
    if (!parsed) return;
    setError(null);
    setStep("ingesting");
    try {
      const res = await fetch("/api/ingest", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          stagingId: parsed.stagingId,
          mode,
          artist: artist.trim(),
          album: album.trim(),
          year: year.trim(),
          tracks,
          lidarrArtistId: mode === "lidarr" ? selectedArtist?.id ?? null : null,
          foreignArtistId: mode === "lidarr" ? selectedArtist?.foreignArtistId ?? null : null,
          writeTags,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Ingest failed");
      setResult(data as IngestResult);
      setStep("done");
    } catch (e) {
      setError((e as Error).message);
      setStep("review");
    }
  };

  const updateTrack = (i: number, patch: Partial<ParsedTrack>) =>
    setTracks((ts) => ts.map((t, idx) => (idx === i ? { ...t, ...patch } : t)));

  const canSubmit =
    artist.trim().length > 0 &&
    album.trim().length > 0 &&
    tracks.length > 0 &&
    (mode === "library" || selectedArtist !== null);

  // ── DONE ──
  if (step === "done" && result) {
    return (
      <div className="glass-card p-6 sm:p-8">
        <div className="mb-5 flex items-center gap-3">
          <span className="grid h-10 w-10 place-items-center rounded-full bg-emerald-500/15 text-emerald-400">
            <CheckIcon className="h-5 w-5" />
          </span>
          <div>
            <h2 className="text-lg font-semibold">Added to library</h2>
            <p className="text-sm text-zinc-500">{result.filesPlaced} file(s) placed</p>
          </div>
        </div>
        <dl className="space-y-2 text-sm">
          <Row label="Folder" mono>{result.targetDir}</Row>
          <Row label="Lidarr">{result.lidarr}</Row>
          <Row label="Navidrome">{result.navidrome}</Row>
        </dl>
        {result.warnings.length > 0 && (
          <div className="mt-4 rounded-xl border border-amber-500/20 bg-amber-500/5 p-3 text-xs text-amber-300/90">
            {result.warnings.map((w, i) => (
              <div key={i}>• {w}</div>
            ))}
          </div>
        )}
        <button className="btn btn-primary mt-6 w-full py-2.5 text-sm" onClick={reset}>
          Add another
        </button>
      </div>
    );
  }

  // ── IDLE / UPLOADING ──
  if (step === "idle" || step === "uploading") {
    return (
      <>
        <div
          className={`drop-zone grid place-items-center px-6 py-16 text-center ${dragging ? "drop-zone-active" : ""} ${
            step === "uploading" ? "drop-zone-disabled" : ""
          }`}
          onClick={() => step === "idle" && inputRef.current?.click()}
          onDragOver={(e) => {
            e.preventDefault();
            setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragging(false);
            if (step === "idle") upload(e.dataTransfer.files);
          }}
        >
          {step === "uploading" ? (
            <>
              <SpinnerIcon className="mb-4 h-8 w-8 text-violet-400" />
              <p className="text-sm text-zinc-400">Reading tags…</p>
            </>
          ) : (
            <>
              <span className="mb-4 grid h-14 w-14 place-items-center rounded-2xl bg-[rgba(139,92,246,0.12)] text-violet-300">
                <UploadIcon className="h-6 w-6" />
              </span>
              <p className="text-base font-medium">Drop an album or single here</p>
              <p className="mt-1 text-sm text-zinc-500">FLAC, MP3, M4A, OGG, Opus… — or click to browse</p>
            </>
          )}
          <input
            ref={inputRef}
            type="file"
            multiple
            accept="audio/*,.flac,.m4a,.opus,.aiff,.alac"
            className="hidden"
            onChange={(e) => e.target.files && upload(e.target.files)}
          />
        </div>
        {error && <ErrorBox msg={error} onClose={() => setError(null)} />}
      </>
    );
  }

  // ── REVIEW / INGESTING ──
  return (
    <div className="glass-card p-5 sm:p-6">
      <div className="mb-5 flex items-center gap-3">
        <span className="grid h-10 w-10 place-items-center rounded-xl bg-[rgba(139,92,246,0.12)] text-violet-300">
          <MusicIcon className="h-5 w-5" />
        </span>
        <div className="min-w-0 flex-1">
          <h2 className="text-base font-semibold">Review release</h2>
          <p className="text-xs text-zinc-500">
            {tracks.length} track(s) · {fmtBytes(parsed?.totalBytes ?? 0)}
          </p>
        </div>
        <button className="btn btn-ghost px-3 py-1.5 text-xs" onClick={reset} disabled={step === "ingesting"}>
          discard
        </button>
      </div>

      {/* album fields */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-[1fr_1fr_120px]">
        <Field label="Album artist">
          <input className="input-glass w-full px-3 py-2 text-sm" value={artist} onChange={(e) => setArtist(e.target.value)} />
        </Field>
        <Field label="Album">
          <input className="input-glass w-full px-3 py-2 text-sm" value={album} onChange={(e) => setAlbum(e.target.value)} />
        </Field>
        <Field label="Year">
          <input
            className="input-glass w-full px-3 py-2 text-sm"
            value={year}
            inputMode="numeric"
            maxLength={4}
            onChange={(e) => setYear(e.target.value.replace(/\D/g, "").slice(0, 4))}
          />
        </Field>
      </div>

      {/* mode */}
      <div className="mt-5">
        <Label>Destination</Label>
        <div className="seg mt-1.5 grid grid-cols-2 gap-1">
          <button
            className={`seg-btn px-3 py-2 ${mode === "lidarr" ? "seg-btn-active" : ""}`}
            onClick={() => setMode("lidarr")}
          >
            Match in Lidarr
          </button>
          <button
            className={`seg-btn px-3 py-2 ${mode === "library" ? "seg-btn-active" : ""}`}
            onClick={() => setMode("library")}
          >
            Library only (non-MB)
          </button>
        </div>
        <p className="mt-1.5 text-xs text-zinc-500">
          {mode === "lidarr"
            ? "Files placed in the library, artist added/refreshed in Lidarr so the album shows as owned."
            : "Files placed straight into the library for albums not on MusicBrainz. Navidrome picks them up; Lidarr is skipped."}
        </p>
      </div>

      {mode === "lidarr" && (
        <div className="mt-3">
          <ArtistSearch initialTerm={artist} selected={selectedArtist} onSelect={setSelectedArtist} />
        </div>
      )}

      {/* tracks */}
      <div className="mt-5">
        <Label>Tracks</Label>
        <div className="scrollbar-styled mt-1.5 max-h-72 space-y-1 overflow-y-auto pr-1">
          {tracks.map((t, i) => (
            <div key={t.file} className="flex items-center gap-2 rounded-lg bg-white/[0.02] px-2 py-1.5">
              <input
                className="input-glass w-12 shrink-0 px-2 py-1.5 text-center text-xs"
                value={t.track || ""}
                placeholder={String(i + 1)}
                onChange={(e) => updateTrack(i, { track: Number(e.target.value.replace(/\D/g, "")) || 0 })}
              />
              <input
                className="input-glass min-w-0 flex-1 px-2 py-1.5 text-sm"
                value={t.title}
                onChange={(e) => updateTrack(i, { title: e.target.value })}
              />
              <span className="hidden w-12 shrink-0 text-right text-xs tabular-nums text-zinc-500 sm:block">
                {fmtDur(t.durationSec)}
              </span>
              <span className="hidden max-w-[120px] shrink-0 truncate text-right font-mono text-[10px] text-zinc-600 md:block">
                {t.file}
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* options */}
      <label className="mt-4 flex cursor-pointer items-start gap-2.5 text-sm">
        <input
          type="checkbox"
          className="mt-0.5 h-4 w-4 accent-violet-500"
          checked={writeTags}
          onChange={(e) => setWriteTags(e.target.checked)}
        />
        <span>
          Rewrite FLAC tags from the fields above
          <span className="block text-xs text-zinc-500">Requires the `flac` (metaflac) tool. Off = keep embedded tags as-is.</span>
        </span>
      </label>

      {error && <ErrorBox msg={error} onClose={() => setError(null)} />}

      <div className="mt-6 flex items-center gap-2">
        <button className="btn btn-primary flex-1 py-2.5 text-sm" disabled={!canSubmit || step === "ingesting"} onClick={submit}>
          {step === "ingesting" ? (
            <span className="inline-flex items-center justify-center gap-2">
              <SpinnerIcon className="h-4 w-4" /> Adding…
            </span>
          ) : (
            <span className="inline-flex items-center justify-center gap-2">
              <FolderIcon className="h-4 w-4" /> Add to library
            </span>
          )}
        </button>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <Label>{label}</Label>
      <div className="mt-1.5">{children}</div>
    </label>
  );
}
function Label({ children }: { children: React.ReactNode }) {
  return <span className="text-xs font-medium uppercase tracking-wide text-zinc-500">{children}</span>;
}
function Row({ label, children, mono }: { label: string; children: React.ReactNode; mono?: boolean }) {
  return (
    <div className="flex gap-3">
      <dt className="w-24 shrink-0 text-zinc-500">{label}</dt>
      <dd className={`min-w-0 break-words text-zinc-300 ${mono ? "font-mono text-xs" : ""}`}>{children}</dd>
    </div>
  );
}
function ErrorBox({ msg, onClose }: { msg: string; onClose: () => void }) {
  return (
    <div className="mt-4 flex items-start gap-2 rounded-xl border border-red-500/25 bg-red-500/5 p-3 text-sm text-red-300">
      <span className="flex-1 break-words">{msg}</span>
      <button onClick={onClose} className="shrink-0 text-red-400/70 hover:text-red-300">
        <XIcon className="h-4 w-4" />
      </button>
    </div>
  );
}
