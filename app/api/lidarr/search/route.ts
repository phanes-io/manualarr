import { NextRequest, NextResponse } from "next/server";
import { searchArtists } from "@/lib/lidarr";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const term = req.nextUrl.searchParams.get("term") ?? "";
  if (term.trim().length < 2) return NextResponse.json({ results: [] });
  try {
    const results = await searchArtists(term);
    return NextResponse.json({ results });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message, results: [] }, { status: 502 });
  }
}
