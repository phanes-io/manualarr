import { Ingest } from "@/components/Ingest";
import { MusicIcon } from "@/components/Icons";

export default function Page() {
  return (
    <main className="mx-auto flex min-h-screen max-w-2xl flex-col px-4 py-10 sm:py-16">
      <header className="mb-8 flex items-center gap-3">
        <span className="grid h-9 w-9 place-items-center rounded-xl bg-[rgba(139,92,246,0.15)] text-violet-300">
          <MusicIcon className="h-5 w-5" />
        </span>
        <div>
          <h1 className="text-lg font-semibold tracking-tight">manualarr</h1>
          <p className="text-xs text-zinc-500">Hand-add albums &amp; singles to Lidarr / Navidrome</p>
        </div>
      </header>

      <Ingest />

      <footer className="mt-auto pt-10 text-center text-xs text-zinc-600">
        manualarr · open source · drop the FLAC you grabbed by hand
      </footer>
    </main>
  );
}
