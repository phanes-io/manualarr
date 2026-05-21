import "server-only";
import { parseFile } from "music-metadata";
import { spawn } from "node:child_process";
import { join } from "node:path";
import type { ParsedTrack } from "./types";
import { stagingDir } from "./staging";

/** Read embedded tags from one staged audio file. */
export async function readTags(stagingId: string, file: string): Promise<ParsedTrack & {
  artist: string;
  albumArtist: string;
  album: string;
  year: string;
}> {
  const path = join(stagingDir(stagingId), file);
  const ext = file.split(".").pop()?.toLowerCase() ?? "flac";
  try {
    const { common, format } = await parseFile(path, { duration: true });
    return {
      file,
      title: common.title?.trim() || stripExt(file),
      track: common.track?.no ?? 0,
      disc: common.disk?.no ?? 0,
      durationSec: format.duration ? Math.round(format.duration) : null,
      ext,
      artist: common.artist?.trim() || "",
      albumArtist: common.albumartist?.trim() || common.artist?.trim() || "",
      album: common.album?.trim() || "",
      year: common.year ? String(common.year) : "",
    };
  } catch {
    return {
      file,
      title: stripExt(file),
      track: 0,
      disc: 0,
      durationSec: null,
      ext,
      artist: "",
      albumArtist: "",
      album: "",
      year: "",
    };
  }
}

function stripExt(name: string): string {
  return name.replace(/\.[^.]+$/, "");
}

/**
 * Best-effort tag rewrite for FLAC via the `metaflac` CLI (package: flac).
 * No-op for non-flac or when metaflac is unavailable; returns a warning string instead of throwing.
 */
export async function writeFlacTags(
  absPath: string,
  tags: { artist: string; albumArtist: string; album: string; year: string; title: string; track: number; disc: number },
): Promise<string | null> {
  if (!absPath.toLowerCase().endsWith(".flac")) return "skip: not FLAC";
  const args = [
    "--remove-tag=ARTIST",
    "--remove-tag=ALBUMARTIST",
    "--remove-tag=ALBUM",
    "--remove-tag=DATE",
    "--remove-tag=TITLE",
    "--remove-tag=TRACKNUMBER",
    "--remove-tag=DISCNUMBER",
    `--set-tag=ARTIST=${tags.artist}`,
    `--set-tag=ALBUMARTIST=${tags.albumArtist}`,
    `--set-tag=ALBUM=${tags.album}`,
    ...(tags.year ? [`--set-tag=DATE=${tags.year}`] : []),
    `--set-tag=TITLE=${tags.title}`,
    ...(tags.track ? [`--set-tag=TRACKNUMBER=${tags.track}`] : []),
    ...(tags.disc ? [`--set-tag=DISCNUMBER=${tags.disc}`] : []),
    absPath,
  ];
  return new Promise((resolve) => {
    const p = spawn("metaflac", args);
    let err = "";
    p.stderr.on("data", (d) => (err += d));
    p.on("error", () => resolve("metaflac not installed — tags left as-is"));
    p.on("close", (code) => resolve(code === 0 ? null : `metaflac exit ${code}: ${err.trim()}`));
  });
}
