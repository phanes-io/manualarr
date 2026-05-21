import { NextRequest, NextResponse } from "next/server";
import { saveUploads } from "@/lib/staging";
import { readTags } from "@/lib/metadata";
import type { ParsedTrack, ParsedUpload } from "@/lib/types";

export const runtime = "nodejs";
export const maxDuration = 300;

export async function POST(req: NextRequest) {
  try {
    const form = await req.formData();
    const files = form.getAll("files").filter((f): f is File => f instanceof File);
    if (files.length === 0) {
      return NextResponse.json({ error: "No files uploaded" }, { status: 400 });
    }

    const { id, saved } = await saveUploads(files);
    if (saved.length === 0) {
      return NextResponse.json({ error: "No supported audio files in upload" }, { status: 400 });
    }

    const tagged = await Promise.all(saved.map((f) => readTags(id, f)));
    tagged.sort((a, b) => (a.disc - b.disc) || (a.track - b.track) || a.file.localeCompare(b.file));

    // Album-level fields: take the most common album/artist/year across tracks.
    const album = mode(tagged.map((t) => t.album).filter(Boolean));
    const artist = mode(tagged.map((t) => t.albumArtist).filter(Boolean)) || mode(tagged.map((t) => t.artist).filter(Boolean));
    const year = mode(tagged.map((t) => t.year).filter(Boolean));

    const tracks: ParsedTrack[] = tagged.map((t) => ({
      file: t.file,
      title: t.title,
      track: t.track,
      disc: t.disc,
      durationSec: t.durationSec,
      ext: t.ext,
    }));

    const totalBytes = files.reduce((n, f) => n + f.size, 0);
    const payload: ParsedUpload = { stagingId: id, artist, album, year, tracks, totalBytes };
    return NextResponse.json(payload);
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}

function mode(values: string[]): string {
  if (values.length === 0) return "";
  const counts = new Map<string, number>();
  for (const v of values) counts.set(v, (counts.get(v) ?? 0) + 1);
  return [...counts.entries()].sort((a, b) => b[1] - a[1])[0][0];
}
