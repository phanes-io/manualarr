// Central runtime config, read from env. Server-only.
import "server-only";

function req(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Missing required env var: ${name}`);
  return v;
}

export const config = {
  lidarr: {
    url: (process.env.LIDARR_URL ?? "http://lidarr:8686").replace(/\/+$/, ""),
    apiKey: process.env.LIDARR_API_KEY ?? "",
    rootFolder: process.env.LIDARR_ROOT_FOLDER || undefined,
    qualityProfileId: process.env.LIDARR_QUALITY_PROFILE_ID
      ? Number(process.env.LIDARR_QUALITY_PROFILE_ID)
      : undefined,
    metadataProfileId: process.env.LIDARR_METADATA_PROFILE_ID
      ? Number(process.env.LIDARR_METADATA_PROFILE_ID)
      : undefined,
  },
  library: {
    root: process.env.MUSIC_LIBRARY_PATH ?? "/music",
    staging: process.env.STAGING_PATH ?? "/staging",
    albumFolderFormat: process.env.ALBUM_FOLDER_FORMAT ?? "({year}) {album}",
    trackFileFormat: process.env.TRACK_FILE_FORMAT ?? "{track} {title}.{ext}",
  },
  navidrome: {
    url: (process.env.NAVIDROME_URL ?? "").replace(/\/+$/, ""),
    user: process.env.NAVIDROME_USER ?? "",
    pass: process.env.NAVIDROME_PASS ?? "",
    enabled: Boolean(process.env.NAVIDROME_URL && process.env.NAVIDROME_USER),
  },
};

export function assertLidarrConfigured() {
  if (!config.lidarr.apiKey) throw new Error("LIDARR_API_KEY is not set");
}

export { req };
