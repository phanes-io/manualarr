// Multi-artist helpers. A "credit" is the full performer string as embedded in a
// track's ARTIST tag (e.g. "LOST, iiven, Niqu & Junio feat. Cardie"); the
// "primary" (album) artist is the lead used for the library folder and the
// ALBUMARTIST tag so Navidrome/Lidarr group the album under one artist.

/**
 * Separators between performers in a credit string. Ordered list of either a
 * literal or a word-boundary keyword. We deliberately keep this conservative —
 * a name containing "&" ("Earth, Wind & Fire") will be mis-split, so the derived
 * primary is only a *default*: the UI lets the user override it.
 */
const SEP = /\s*(?:,|;|&|\/|\bfeat\.?\b|\bft\.?\b|\bfeaturing\b|\bwith\b|\bvs\.?\b|\bx\b)\s*/i;

/** Split a credit into its individual performer names, in order. */
export function splitArtists(credit: string): string[] {
  return credit
    .split(SEP)
    .map((s) => s.trim())
    .filter(Boolean);
}

/**
 * Best-effort lead artist from a credit string. Returns the first performer, or
 * the trimmed input if it has no recognizable separator. Used as the default
 * album artist for multi-artist releases.
 */
export function primaryArtist(credit: string): string {
  const s = credit.trim();
  if (!s) return "";
  return splitArtists(s)[0] || s;
}
