import "server-only";
import { config, assertLidarrConfigured } from "./config";
import type { LidarrArtistMatch } from "./types";

async function api<T>(path: string, init?: RequestInit): Promise<T> {
  assertLidarrConfigured();
  const res = await fetch(`${config.lidarr.url}/api/v1${path}`, {
    ...init,
    headers: {
      "X-Api-Key": config.lidarr.apiKey,
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
    cache: "no-store",
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Lidarr ${path} → ${res.status} ${res.statusText} ${body.slice(0, 200)}`);
  }
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

type RawArtist = {
  id?: number;
  artistName: string;
  foreignArtistId?: string;
  disambiguation?: string;
};

/**
 * Find matching artists for a free-text term.
 *
 * Combines two sources so nothing gets lost:
 *  1. Lidarr's *local* artist list (`/artist`) — artists already added to the
 *     library. MusicBrainz lookup can be stale/cached for minutes after you add
 *     an artist on MB, so a freshly-added artist may be missing from `lookup`
 *     even though it sits in Lidarr. Local results guarantee it still shows up.
 *  2. MusicBrainz-backed `/artist/lookup` — addable matches not yet in Lidarr.
 *
 * Local matches win on dedupe (they carry the real Lidarr `id`) and are listed
 * first. Match is by foreignArtistId, falling back to a name substring.
 */
export async function searchArtists(term: string): Promise<LidarrArtistMatch[]> {
  const t = term.trim();
  if (!t) return [];
  const q = encodeURIComponent(t);
  const needle = t.toLowerCase();

  const [local, lookup] = await Promise.all([
    api<RawArtist[]>("/artist").catch(() => [] as RawArtist[]),
    api<RawArtist[]>(`/artist/lookup?term=${q}`).catch(() => [] as RawArtist[]),
  ]);

  const out: LidarrArtistMatch[] = [];
  const seenMbid = new Set<string>();
  const seenName = new Set<string>();

  const push = (a: RawArtist, existing: boolean) => {
    const mbid = a.foreignArtistId ?? null;
    if (mbid && seenMbid.has(mbid)) return;
    const nameKey = a.artistName.toLowerCase();
    if (!mbid && seenName.has(nameKey)) return;
    if (mbid) seenMbid.add(mbid);
    seenName.add(nameKey);
    out.push({
      id: a.id && a.id > 0 ? a.id : null,
      artistName: a.artistName,
      foreignArtistId: mbid,
      disambiguation: a.disambiguation,
      existing,
    });
  };

  // Local first — filtered to the search term, marked as in-library.
  for (const a of local) {
    if (!a.artistName) continue;
    if (a.artistName.toLowerCase().includes(needle)) push(a, true);
  }
  // Then MB lookup matches not already covered.
  for (const a of lookup) {
    push(a, Boolean(a.id && a.id > 0));
  }

  return out.slice(0, 20);
}

export async function getArtist(id: number): Promise<RawArtist & { path: string }> {
  return api(`/artist/${id}`);
}

type RootFolder = { id: number; path: string };
type Profile = { id: number; name: string };

async function pickDefaults(): Promise<{ rootFolderPath: string; qualityProfileId: number; metadataProfileId: number }> {
  const [roots, quality, metadata] = await Promise.all([
    api<RootFolder[]>("/rootfolder"),
    api<Profile[]>("/qualityprofile"),
    api<Profile[]>("/metadataprofile"),
  ]);
  const rootFolderPath = config.lidarr.rootFolder ?? roots[0]?.path;
  const qualityProfileId = config.lidarr.qualityProfileId ?? quality[0]?.id;
  // Prefer a non-"None" metadata profile when present.
  const metaDefault = metadata.find((m) => m.name !== "None") ?? metadata[0];
  const metadataProfileId = config.lidarr.metadataProfileId ?? metaDefault?.id;
  if (!rootFolderPath || !qualityProfileId || !metadataProfileId) {
    throw new Error("Could not resolve Lidarr root folder / profiles — set them in env");
  }
  return { rootFolderPath, qualityProfileId, metadataProfileId };
}

/**
 * Add an artist to Lidarr by MusicBrainz id, monitored, and trigger a refresh.
 * Returns the new Lidarr artistId.
 */
export async function addArtist(foreignArtistId: string): Promise<number> {
  const lookup = await api<RawArtist[]>(`/artist/lookup?term=${encodeURIComponent("lidarr:" + foreignArtistId)}`)
    .catch(() => [] as RawArtist[]);
  const found = lookup.find((a) => a.foreignArtistId === foreignArtistId) ?? lookup[0];
  if (!found) throw new Error(`Artist ${foreignArtistId} not found in Lidarr lookup`);
  if (found.id && found.id > 0) return found.id; // already added

  const defaults = await pickDefaults();
  const created = await api<{ id: number }>("/artist", {
    method: "POST",
    body: JSON.stringify({
      ...found,
      qualityProfileId: defaults.qualityProfileId,
      metadataProfileId: defaults.metadataProfileId,
      rootFolderPath: defaults.rootFolderPath,
      monitored: true,
      addOptions: { monitor: "all", searchForMissingAlbums: false },
    }),
  });
  return created.id;
}

/** Refresh + rescan an artist so Lidarr detects newly-placed files. */
export async function refreshArtist(artistId: number): Promise<void> {
  await api("/command", { method: "POST", body: JSON.stringify({ name: "RefreshArtist", artistId }) });
}

export async function ping(): Promise<boolean> {
  try {
    await api("/system/status");
    return true;
  } catch {
    return false;
  }
}
