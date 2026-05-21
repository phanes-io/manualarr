import "server-only";
import { randomUUID } from "node:crypto";
import { mkdir, rm, readdir, stat } from "node:fs/promises";
import { createWriteStream } from "node:fs";
import { join } from "node:path";
import { Readable } from "node:stream";
import { config } from "./config";

const AUDIO_EXT = new Set(["flac", "mp3", "m4a", "aac", "ogg", "opus", "wav", "aiff", "alac"]);

export function isAudio(name: string): boolean {
  const ext = name.split(".").pop()?.toLowerCase() ?? "";
  return AUDIO_EXT.has(ext);
}

export function stagingDir(id: string): string {
  // id is a generated uuid; never derived from user input.
  return join(config.library.staging, id);
}

/** Persist uploaded audio files to a fresh staging dir. Returns the staging id + saved names. */
export async function saveUploads(files: File[]): Promise<{ id: string; saved: string[] }> {
  const id = randomUUID();
  const dir = stagingDir(id);
  await mkdir(dir, { recursive: true });

  const saved: string[] = [];
  for (const file of files) {
    const base = sanitizeFilename(file.name);
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
  return { id, saved };
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

/** Strip path separators and characters that break filesystems. */
export function sanitizeFilename(name: string): string {
  return name
    .replace(/[/\\]/g, "_")
    .replace(/[<>:"|?*\x00-\x1f]/g, "")
    .replace(/^\.+/, "")
    .slice(0, 255)
    .trim();
}
