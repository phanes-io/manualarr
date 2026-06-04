import { NextRequest, NextResponse } from "next/server";
import { readFile } from "node:fs/promises";
import { findCover, writeCover, normalizeImageExt, isImage } from "@/lib/staging";

export const runtime = "nodejs";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const mimeFor = (ext: string): string =>
  ext === "png" ? "image/png" : ext === "webp" ? "image/webp" : ext === "gif" ? "image/gif" : "image/jpeg";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!UUID.test(id)) return NextResponse.json({ error: "bad id" }, { status: 400 });
  const cover = await findCover(id);
  if (!cover) return NextResponse.json({ error: "no cover" }, { status: 404 });
  const data = await readFile(cover.path);
  return new NextResponse(new Uint8Array(data), {
    headers: { "Content-Type": mimeFor(cover.ext), "Cache-Control": "no-store" },
  });
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!UUID.test(id)) return NextResponse.json({ error: "bad id" }, { status: 400 });
  const form = await req.formData();
  const file = form.get("file");
  if (!(file instanceof File) || !isImage(file.name)) {
    return NextResponse.json({ error: "expected an image file" }, { status: 400 });
  }
  const ext = normalizeImageExt(file.name.split(".").pop() ?? "jpg");
  await writeCover(id, ext, Buffer.from(await file.arrayBuffer()));
  return NextResponse.json({ ok: true });
}
