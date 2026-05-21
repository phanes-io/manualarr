"use client";
import { useEffect, useRef, useState } from "react";
import type { LidarrArtistMatch } from "@/lib/types";
import { SearchIcon, SpinnerIcon, CheckIcon } from "./Icons";

export function ArtistSearch({
  initialTerm,
  selected,
  onSelect,
}: {
  initialTerm: string;
  selected: LidarrArtistMatch | null;
  onSelect: (m: LidarrArtistMatch | null) => void;
}) {
  const [term, setTerm] = useState(initialTerm);
  const [results, setResults] = useState<LidarrArtistMatch[]>([]);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const boxRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (selected) return; // don't re-search after a pick
    const t = term.trim();
    if (t.length < 2) {
      setResults([]);
      return;
    }
    const ctl = new AbortController();
    const id = setTimeout(async () => {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch(`/api/lidarr/search?term=${encodeURIComponent(t)}`, { signal: ctl.signal });
        const data = await res.json();
        if (data.error) setError(data.error);
        setResults(data.results ?? []);
        setOpen(true);
      } catch (e) {
        if ((e as Error).name !== "AbortError") setError((e as Error).message);
      } finally {
        setLoading(false);
      }
    }, 350);
    return () => {
      clearTimeout(id);
      ctl.abort();
    };
  }, [term, selected]);

  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, []);

  if (selected) {
    return (
      <div className="glass-card flex items-center justify-between gap-3 px-4 py-3">
        <div className="flex items-center gap-3 min-w-0">
          <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-[rgba(139,92,246,0.18)] text-violet-300">
            <CheckIcon className="h-4 w-4" />
          </span>
          <div className="min-w-0">
            <div className="truncate text-sm font-medium">{selected.artistName}</div>
            <div className="text-xs text-zinc-500">
              {selected.existing ? "already in Lidarr" : "new — will be added to Lidarr"}
              {selected.disambiguation ? ` · ${selected.disambiguation}` : ""}
            </div>
          </div>
        </div>
        <button className="btn btn-ghost px-3 py-1.5 text-xs" onClick={() => onSelect(null)}>
          change
        </button>
      </div>
    );
  }

  return (
    <div ref={boxRef} className="relative">
      <div className="relative">
        <SearchIcon className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-500" />
        <input
          className="input-glass w-full py-2.5 pl-9 pr-9 text-sm"
          placeholder="Search artist in Lidarr / MusicBrainz…"
          value={term}
          onChange={(e) => setTerm(e.target.value)}
          onFocus={() => results.length && setOpen(true)}
        />
        {loading && <SpinnerIcon className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-500" />}
      </div>

      {open && (results.length > 0 || error) && (
        <div className="scrollbar-styled glass-card absolute z-20 mt-2 max-h-72 w-full overflow-y-auto p-1.5">
          {error && <div className="px-3 py-2 text-xs text-red-400">{error}</div>}
          {results.map((r, i) => (
            <button
              key={`${r.foreignArtistId ?? r.artistName}-${i}`}
              className="glass-card-hover flex w-full items-center justify-between gap-2 rounded-xl px-3 py-2 text-left"
              onClick={() => {
                onSelect(r);
                setOpen(false);
              }}
            >
              <span className="min-w-0">
                <span className="block truncate text-sm">{r.artistName}</span>
                {r.disambiguation && <span className="block truncate text-xs text-zinc-500">{r.disambiguation}</span>}
              </span>
              <span
                className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] ${
                  r.existing ? "bg-emerald-500/15 text-emerald-300" : "bg-zinc-500/15 text-zinc-400"
                }`}
              >
                {r.existing ? "in library" : "new"}
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
