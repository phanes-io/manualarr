import { NextResponse } from "next/server";
import { ping } from "@/lib/lidarr";
import { config } from "@/lib/config";

export const runtime = "nodejs";

export async function GET() {
  const lidarr = await ping();
  return NextResponse.json({
    ok: true,
    lidarr,
    navidrome: config.navidrome.enabled,
    library: config.library.root,
  });
}
