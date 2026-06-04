import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { placeIntoLibrary } from "@/lib/library";
import { cleanupStaging } from "@/lib/staging";
import { addArtist, refreshArtist } from "@/lib/lidarr";
import { triggerScan } from "@/lib/navidrome";
import type { IngestResult } from "@/lib/types";

export const runtime = "nodejs";
export const maxDuration = 300;

const trackSchema = z.object({
  file: z.string().min(1),
  title: z.string(),
  track: z.number().int().min(0),
  disc: z.number().int().min(0),
  durationSec: z.number().nullable(),
  ext: z.string(),
});

const bodySchema = z.object({
  stagingId: z.string().uuid(),
  mode: z.enum(["lidarr", "library"]),
  artist: z.string().min(1),
  album: z.string().min(1),
  year: z.string().regex(/^\d{0,4}$/),
  tracks: z.array(trackSchema).min(1),
  lidarrArtistId: z.number().int().nullable().optional(),
  foreignArtistId: z.string().nullable().optional(),
  writeTags: z.boolean(),
});

export async function POST(req: NextRequest) {
  let body: z.infer<typeof bodySchema>;
  try {
    body = bodySchema.parse(await req.json());
  } catch (e) {
    return NextResponse.json({ error: `Invalid request: ${(e as Error).message}` }, { status: 400 });
  }

  const warnings: string[] = [];
  try {
    const placed = await placeIntoLibrary({
      stagingId: body.stagingId,
      artist: body.artist,
      album: body.album,
      year: body.year,
      albumArtist: body.artist,
      tracks: body.tracks,
      writeTags: body.writeTags,
    });
    warnings.push(...placed.warnings);

    // Nothing landed (all staged files missing) — keep staging for a retry.
    if (placed.placed === 0) {
      return NextResponse.json(
        { error: "No files were placed — staged files missing. Staging kept for retry.", warnings },
        { status: 500 },
      );
    }
    if (placed.placed < body.tracks.length) {
      warnings.push(`only ${placed.placed}/${body.tracks.length} tracks placed`);
    }

    // ── Lidarr ──
    let lidarrMsg = "skipped (library-only mode)";
    if (body.mode === "lidarr") {
      try {
        let artistId = body.lidarrArtistId ?? null;
        if (!artistId && body.foreignArtistId) {
          artistId = await addArtist(body.foreignArtistId);
          lidarrMsg = `added artist (id ${artistId}), refreshing`;
        }
        if (artistId) {
          await refreshArtist(artistId);
          lidarrMsg = lidarrMsg.startsWith("added") ? lidarrMsg : `refreshed artist ${artistId}`;
        } else {
          lidarrMsg = "no Lidarr artist resolved — files placed, not tracked";
          warnings.push(lidarrMsg);
        }
      } catch (e) {
        lidarrMsg = `Lidarr error: ${(e as Error).message}`;
        warnings.push(lidarrMsg);
      }
    }

    // ── Navidrome ──
    const navidromeMsg = await triggerScan();

    // Files are safely in the library — drop the staging copy.
    await cleanupStaging(body.stagingId).catch(() => warnings.push("staging cleanup failed"));

    const result: IngestResult = {
      ok: true,
      targetDir: placed.dir,
      filesPlaced: placed.placed,
      lidarr: lidarrMsg,
      navidrome: navidromeMsg,
      warnings,
    };
    return NextResponse.json(result);
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message, warnings }, { status: 500 });
  }
}
