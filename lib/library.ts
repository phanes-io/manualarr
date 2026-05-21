import "server-only";
import { mkdir, copyFile, rm, stat } from "node:fs/promises";
import { join } from "node:path";
import { config } from "./config";
import { stagingDir, sanitizeFilename } from "./staging";
import { writeFlacTags } from "./metadata";
import type { ParsedTrack } from "./types";

/** Sanitize a path *segment* (artist or album folder name). */
function seg(name: string): string {
  const clean = sanitizeFilename(name).replace(/\.+$/, "").trim();
  return clean || "Unknown";
}

function pad(n: number): string {
  return n > 0 ? String(n).padStart(2, "0") : "00";
}

function applyFormat(fmt: string, vars: Record<string, string>): string {
  return fmt.replace(/\{(\w+)\}/g, (_, k: string) => vars[k] ?? "");
}

export function albumFolderName(album: string, year: string): string {
  return seg(applyFormat(config.library.albumFolderFormat, { album: seg(album), year }));
}

export function trackFileName(t: ParsedTrack, fallbackIndex: number): string {
  const track = t.track > 0 ? t.track : fallbackIndex;
  const name = applyFormat(config.library.trackFileFormat, {
    track: pad(track),
    title: t.title || `Track ${pad(track)}`,
    ext: t.ext || "flac",
  });
  return sanitizeFilename(name);
}

export function targetDir(artist: string, album: string, year: string): string {
  return join(config.library.root, seg(artist), albumFolderName(album, year));
}

export type PlaceArgs = {
  stagingId: string;
  artist: string;
  album: string;
  year: string;
  albumArtist: string;
  tracks: ParsedTrack[];
  writeTags: boolean;
};

export type PlaceResult = { dir: string; placed: number; warnings: string[] };

/**
 * Copy staged audio into the final library layout: <root>/<Artist>/<(Year) Album>/<NN Title.ext>.
 * Copy (not move) so a failure leaves staging intact for retry; staging is cleaned by the caller on success.
 */
export async function placeIntoLibrary(args: PlaceArgs): Promise<PlaceResult> {
  const dir = targetDir(args.artist, args.album, args.year);
  await mkdir(dir, { recursive: true });
  const warnings: string[] = [];
  let placed = 0;

  for (let i = 0; i < args.tracks.length; i++) {
    const t = args.tracks[i];
    const src = join(stagingDir(args.stagingId), t.file);
    try {
      await stat(src);
    } catch {
      warnings.push(`missing staged file: ${t.file}`);
      continue;
    }
    const destName = trackFileName(t, i + 1);
    const dest = join(dir, destName);
    await copyFile(src, dest);

    if (args.writeTags) {
      const w = await writeFlacTags(dest, {
        artist: args.artist,
        albumArtist: args.albumArtist || args.artist,
        album: args.album,
        year: args.year,
        title: t.title,
        track: t.track > 0 ? t.track : i + 1,
        disc: t.disc,
      });
      if (w && !w.startsWith("skip")) warnings.push(`${destName}: ${w}`);
    }
    placed++;
  }

  return { dir, placed, warnings };
}

/** Delete a previously-ingested album folder (used by an undo, not wired into MVP UI). */
export async function removeAlbumDir(dir: string): Promise<void> {
  if (!dir.startsWith(config.library.root)) throw new Error("refusing to delete outside library root");
  await rm(dir, { recursive: true, force: true });
}
