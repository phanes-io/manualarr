// Shared types between server and client.

export type ParsedTrack = {
  /** staging-relative filename, used as the stable id for this file */
  file: string;
  title: string;
  /** 1-based track number; 0 if unknown */
  track: number;
  /** 1-based disc number; 0 if unknown */
  disc: number;
  durationSec: number | null;
  ext: string;
};

export type ParsedUpload = {
  stagingId: string;
  artist: string;
  album: string;
  /** 4-digit year or "" */
  year: string;
  tracks: ParsedTrack[];
  /** sum of file sizes in bytes */
  totalBytes: number;
  /** true if a cover image was found (embedded, loose, or in the zip) */
  cover: boolean;
};

export type LidarrArtistMatch = {
  /** Lidarr artistId if this artist already exists in the library, else null */
  id: number | null;
  artistName: string;
  /** MusicBrainz artist id, if known */
  foreignArtistId: string | null;
  disambiguation?: string;
  /** true if found via MusicBrainz lookup (addable), false/omitted otherwise */
  existing: boolean;
};

export type IngestMode = "lidarr" | "library";

export type IngestRequest = {
  stagingId: string;
  mode: IngestMode;
  artist: string;
  album: string;
  year: string;
  tracks: ParsedTrack[];
  /** when mode === "lidarr" and matching an existing artist */
  lidarrArtistId?: number | null;
  /** when mode === "lidarr" and adding a new artist from MB */
  foreignArtistId?: string | null;
  /** rewrite embedded FLAC tags from the (possibly edited) metadata */
  writeTags: boolean;
};

export type IngestResult = {
  ok: boolean;
  targetDir: string;
  filesPlaced: number;
  lidarr: string;
  navidrome: string;
  warnings: string[];
};
