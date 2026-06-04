import "server-only";
import { parseFile } from "music-metadata";
import { spawn } from "node:child_process";
import { rename } from "node:fs/promises";
import { join } from "node:path";
import type { ParsedTrack } from "./types";
import { stagingDir } from "./staging";

/** Read embedded tags from one staged audio file. */
export async function readTags(stagingId: string, file: string): Promise<ParsedTrack & {
  artist: string;
  albumArtist: string;
  album: string;
  year: string;
  hasPicture: boolean;
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
      hasPicture: Boolean(common.picture && common.picture.length > 0),
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
      hasPicture: false,
    };
  }
}

/** Extract the first embedded cover image from a staged file, if present. */
export async function readEmbeddedCover(
  stagingId: string,
  file: string,
): Promise<{ data: Buffer; mime: string } | null> {
  try {
    const { common } = await parseFile(join(stagingDir(stagingId), file));
    const pic = common.picture?.[0];
    if (!pic) return null;
    return { data: Buffer.from(pic.data), mime: pic.format || "image/jpeg" };
  } catch {
    return null;
  }
}

function stripExt(name: string): string {
  return name.replace(/\.[^.]+$/, "");
}

type Tags = {
  artist: string;
  albumArtist: string;
  album: string;
  year: string;
  title: string;
  track: number;
  disc: number;
};

/**
 * Best-effort tag rewrite. FLAC goes through `metaflac` (in-place, no re-mux);
 * everything else through `ffmpeg -c copy` (no re-encode). Returns a warning
 * string on failure (or skip) instead of throwing, so ingest stays resilient.
 */
export async function writeAudioTags(absPath: string, tags: Tags): Promise<string | null> {
  const ext = absPath.split(".").pop()?.toLowerCase() ?? "";
  if (ext === "flac") return writeFlacTags(absPath, tags);
  return writeFfmpegTags(absPath, ext, tags);
}

function writeFlacTags(absPath: string, tags: Tags): Promise<string | null> {
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

/**
 * Rewrite tags on non-FLAC files via ffmpeg. `-c copy` + `-map 0` preserves the
 * audio (and any embedded art) bit-for-bit; only the container metadata changes.
 * ffmpeg can't edit in place, so we write a temp file and rename it over the
 * original on success.
 */
function writeFfmpegTags(absPath: string, ext: string, tags: Tags): Promise<string | null> {
  const tmp = `${absPath}.tagtmp.${ext}`;
  const meta: string[] = [];
  const add = (k: string, v: string | number) => {
    if (v !== "" && v !== 0) meta.push("-metadata", `${k}=${v}`);
  };
  add("title", tags.title);
  add("artist", tags.artist);
  add("album_artist", tags.albumArtist);
  add("album", tags.album);
  add("date", tags.year);
  add("track", tags.track);
  add("disc", tags.disc);

  const args = ["-y", "-i", absPath, "-map", "0", "-map_metadata", "-1", "-c", "copy", ...meta, tmp];

  return new Promise((resolve) => {
    const p = spawn("ffmpeg", args);
    let err = "";
    p.stderr.on("data", (d) => (err += d));
    p.on("error", () => resolve("ffmpeg not installed — tags left as-is"));
    p.on("close", async (code) => {
      if (code !== 0) return resolve(`ffmpeg exit ${code}: ${err.trim().slice(-200)}`);
      try {
        await rename(tmp, absPath);
        resolve(null);
      } catch (e) {
        resolve(`tag rewrite move failed: ${(e as Error).message}`);
      }
    });
  });
}
