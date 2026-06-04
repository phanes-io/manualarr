import "server-only";
import { randomUUID } from "node:crypto";
import { mkdir, rm, readdir, stat, writeFile } from "node:fs/promises";
import { createWriteStream } from "node:fs";
import { inflateRawSync } from "node:zlib";
import { basename, join } from "node:path";
import { Readable } from "node:stream";
import { config } from "./config";

const AUDIO_EXT = new Set(["flac", "mp3", "m4a", "aac", "ogg", "opus", "wav", "aiff", "alac"]);
const IMAGE_EXT = new Set(["jpg", "jpeg", "png", "webp", "gif"]);

/** Basename (no ext) of the single staged cover image, kept apart from tracks. */
export const COVER_BASE = "__cover";

function ext(name: string): string {
  return name.split(".").pop()?.toLowerCase() ?? "";
}

export function isAudio(name: string): boolean {
  return AUDIO_EXT.has(ext(name));
}

export function isImage(name: string): boolean {
  return IMAGE_EXT.has(ext(name));
}

export function isZip(name: string): boolean {
  return ext(name) === "zip";
}

/** Normalize an image extension to what we store on disk (jpeg → jpg). */
export function normalizeImageExt(e: string): string {
  const x = e.toLowerCase();
  if (x === "jpeg") return "jpg";
  return IMAGE_EXT.has(x) ? x : "jpg";
}

/** Map an embedded-picture mime ("image/jpeg") to a stored extension. */
export function coverExtFromMime(mime: string): string {
  return normalizeImageExt(mime.split("/").pop() ?? "jpg");
}

export function stagingDir(id: string): string {
  // id is a generated uuid; never derived from user input.
  return join(config.library.staging, id);
}

/** Lower rank = more likely to be the real album cover. */
function coverRank(name: string): number {
  return /^(cover|folder|front|album|albumart)/i.test(basename(name)) ? 0 : 1;
}

/**
 * Persist uploaded audio (and any cover image) to a fresh staging dir.
 * Images — loose or inside a zip — are reduced to a single `__cover.<ext>`.
 * Returns the staging id, saved audio names, and whether a cover was stored.
 */
export async function saveUploads(files: File[]): Promise<{ id: string; saved: string[]; cover: boolean }> {
  const id = randomUUID();
  const dir = stagingDir(id);
  await mkdir(dir, { recursive: true });

  const saved: string[] = [];
  const claim = (name: string): string => {
    // Avoid collisions when several files/zip entries share a basename.
    let base = sanitizeFilename(name);
    if (!saved.includes(base)) return base;
    const dot = base.lastIndexOf(".");
    const stem = dot > 0 ? base.slice(0, dot) : base;
    const e = dot > 0 ? base.slice(dot) : "";
    let n = 2;
    while (saved.includes((base = `${stem} (${n})${e}`))) n++;
    return base;
  };

  const imageCandidates: { name: string; data: Buffer }[] = [];

  for (const file of files) {
    if (isZip(file.name)) {
      const buf = Buffer.from(await file.arrayBuffer());
      for (const entry of extractZipEntries(buf)) {
        if (isAudio(entry.name)) {
          const base = claim(basename(entry.name));
          await writeFile(join(dir, base), entry.data);
          saved.push(base);
        } else if (isImage(entry.name)) {
          imageCandidates.push({ name: basename(entry.name), data: entry.data });
        }
      }
      continue;
    }
    if (isImage(file.name)) {
      imageCandidates.push({ name: file.name, data: Buffer.from(await file.arrayBuffer()) });
      continue;
    }
    const base = claim(file.name);
    if (!isAudio(base)) continue;
    const dest = join(dir, base);
    await new Promise<void>((resolve, reject) => {
      const ws = createWriteStream(dest);
      Readable.fromWeb(file.stream() as never)
        .pipe(ws)
        .on("finish", () => resolve())
        .on("error", reject);
    });
    saved.push(base);
  }

  // Pick the best image (named cover/folder/front first) as the cover.
  let cover = false;
  if (imageCandidates.length > 0) {
    const best = imageCandidates.sort((a, b) => coverRank(a.name) - coverRank(b.name))[0];
    await writeCover(id, normalizeImageExt(ext(best.name)), best.data);
    cover = true;
  }

  return { id, saved, cover };
}

/** Write/replace the staged cover image. */
export async function writeCover(id: string, imageExt: string, data: Buffer): Promise<void> {
  const dir = stagingDir(id);
  await mkdir(dir, { recursive: true });
  for (const n of await readdir(dir).catch(() => [])) {
    if (n.startsWith(COVER_BASE + ".")) await rm(join(dir, n), { force: true });
  }
  await writeFile(join(dir, `${COVER_BASE}.${normalizeImageExt(imageExt)}`), data);
}

/** Locate the staged cover image, if any. */
export async function findCover(id: string): Promise<{ name: string; ext: string; path: string } | null> {
  const dir = stagingDir(id);
  for (const n of await readdir(dir).catch(() => [])) {
    if (n.startsWith(COVER_BASE + ".")) return { name: n, ext: ext(n), path: join(dir, n) };
  }
  return null;
}

/**
 * Minimal ZIP reader: walks the central directory and inflates each audio or
 * image entry. Supports stored (0) and deflate (8) — the only methods real-world
 * music archives use. No external dependency. Skips directories and anything it
 * can't decode (e.g. zip64/encrypted).
 */
function extractZipEntries(buf: Buffer): { name: string; data: Buffer }[] {
  const EOCD_SIG = 0x06054b50;
  const CEN_SIG = 0x02014b50;
  const LOC_SIG = 0x04034b50;

  // Find End Of Central Directory record (scan back over optional comment).
  let eocd = -1;
  for (let i = buf.length - 22; i >= 0 && i >= buf.length - 22 - 0xffff; i--) {
    if (buf.readUInt32LE(i) === EOCD_SIG) {
      eocd = i;
      break;
    }
  }
  if (eocd < 0) throw new Error("Not a valid ZIP file (no EOCD record)");

  const total = buf.readUInt16LE(eocd + 10);
  let p = buf.readUInt32LE(eocd + 16); // central directory offset

  const out: { name: string; data: Buffer }[] = [];
  for (let i = 0; i < total && p + 46 <= buf.length; i++) {
    if (buf.readUInt32LE(p) !== CEN_SIG) break;
    const method = buf.readUInt16LE(p + 10);
    const compSize = buf.readUInt32LE(p + 20);
    const nameLen = buf.readUInt16LE(p + 28);
    const extraLen = buf.readUInt16LE(p + 30);
    const commentLen = buf.readUInt16LE(p + 32);
    const localOff = buf.readUInt32LE(p + 42);
    const name = buf.toString("utf8", p + 46, p + 46 + nameLen);
    p += 46 + nameLen + extraLen + commentLen;

    if (name.endsWith("/") || (!isAudio(name) && !isImage(name))) continue;
    if (basename(name).startsWith("._")) continue; // macOS resource forks

    // Local header has its own (possibly different) name/extra lengths.
    if (buf.readUInt32LE(localOff) !== LOC_SIG) continue;
    const lNameLen = buf.readUInt16LE(localOff + 26);
    const lExtraLen = buf.readUInt16LE(localOff + 28);
    const dataStart = localOff + 30 + lNameLen + lExtraLen;
    const raw = buf.subarray(dataStart, dataStart + compSize);

    try {
      const data = method === 0 ? Buffer.from(raw) : method === 8 ? inflateRawSync(raw) : null;
      if (data) out.push({ name, data });
    } catch {
      // Skip entries we can't decode rather than failing the whole upload.
    }
  }
  return out;
}

export async function listStaging(id: string): Promise<{ name: string; bytes: number }[]> {
  const dir = stagingDir(id);
  const names = await readdir(dir);
  const out: { name: string; bytes: number }[] = [];
  for (const name of names) {
    if (!isAudio(name)) continue;
    const s = await stat(join(dir, name));
    out.push({ name, bytes: s.size });
  }
  return out;
}

export async function cleanupStaging(id: string): Promise<void> {
  await rm(stagingDir(id), { recursive: true, force: true });
}

/**
 * Best-effort GC: delete staging dirs older than maxAgeMs. Failed uploads/ingests
 * leave dirs behind otherwise, slowly filling the staging volume. Called
 * opportunistically on upload; errors are non-fatal.
 */
export async function sweepStaging(maxAgeMs: number): Promise<number> {
  const root = config.library.staging;
  const now = Date.now();
  let removed = 0;
  for (const name of await readdir(root).catch(() => [])) {
    const dir = join(root, name);
    try {
      const s = await stat(dir);
      if (s.isDirectory() && now - s.mtimeMs > maxAgeMs) {
        await rm(dir, { recursive: true, force: true });
        removed++;
      }
    } catch {
      // ignore races / permission issues on individual dirs
    }
  }
  return removed;
}

/** Strip path separators and characters that break filesystems. */
export function sanitizeFilename(name: string): string {
  return name
    .replace(/[/\\]/g, "_")
    .replace(/[<>:"|?*\x00-\x1f]/g, "")
    .replace(/^\.+/, "")
    .slice(0, 255)
    .trim();
}
