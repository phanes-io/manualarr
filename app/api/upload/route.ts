import { NextRequest, NextResponse } from "next/server";
import { saveUploads, listStaging, sweepStaging, writeCover } from "@/lib/staging";
import { readTags, readEmbeddedCover } from "@/lib/metadata";
import { coverExtFromMime } from "@/lib/staging";
import { config } from "@/lib/config";
import { primaryArtist } from "@/lib/artist";
import type { ParsedTrack, ParsedUpload } from "@/lib/types";

export const runtime = "nodejs";
export const maxDuration = 300;

export async function POST(req: NextRequest) {
  try {
    // Opportunistic GC of stale staging dirs left by failed runs.
    void sweepStaging(config.library.stagingTtlHours * 3600_000).catch(() => {});

    const form = await req.formData();
    const files = form.getAll("files").filter((f): f is File => f instanceof File);
    if (files.length === 0) {
      return NextResponse.json({ error: "No files uploaded" }, { status: 400 });
    }

    const { id, saved, cover } = await saveUploads(files);
    if (saved.length === 0) {
      return NextResponse.json(
        { error: "No supported audio files in upload (ZIPs are unpacked automatically)" },
        { status: 400 },
      );
    }

    const tagged = await Promise.all(saved.map((f) => readTags(id, f)));
    tagged.sort((a, b) => (a.disc - b.disc) || (a.track - b.track) || a.file.localeCompare(b.file));

    // No loose/zip cover? Fall back to embedded art from the first track that has it.
    let hasCover = cover;
    if (!hasCover) {
      const withPic = tagged.find((t) => t.hasPicture);
      if (withPic) {
        const pic = await readEmbeddedCover(id, withPic.file);
        if (pic) {
          await writeCover(id, coverExtFromMime(pic.mime), pic.data);
          hasCover = true;
        }
      }
    }

    // Album-level fields: take the most common album/artist/year across tracks.
    const album = mode(tagged.map((t) => t.album).filter(Boolean));
    // The credit shown to the user defaults to the most common track ARTIST.
    const artist = mode(tagged.map((t) => t.artist).filter(Boolean)) || mode(tagged.map((t) => t.albumArtist).filter(Boolean));
    // Album artist = lead performer, derived from the album's most common credit.
    // Source ALBUMARTIST tags are often the full feature string (and can even
    // differ per track), so we collapse to a single primary as the default.
    const albumArtist =
      primaryArtist(mode(tagged.map((t) => t.albumArtist).filter(Boolean)) || artist) || artist;
    const year = mode(tagged.map((t) => t.year).filter(Boolean));

    const tracks: ParsedTrack[] = tagged.map((t) => ({
      file: t.file,
      title: t.title,
      artist: t.artist || artist,
      track: t.track,
      disc: t.disc,
      durationSec: t.durationSec,
      ext: t.ext,
    }));

    // Sum the staged files on disk — a zip's compressed size isn't the real total.
    const totalBytes = (await listStaging(id)).reduce((n, f) => n + f.bytes, 0);
    const payload: ParsedUpload = { stagingId: id, artist, albumArtist, album, year, tracks, totalBytes, cover: hasCover };
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
