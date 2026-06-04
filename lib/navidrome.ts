import "server-only";
import { createHash, randomBytes } from "node:crypto";
import { config } from "./config";
import { withRetry, RetryableError } from "./retry";

/**
 * Trigger a Navidrome library rescan via the Subsonic API.
 * Navidrome scans the filesystem independently of Lidarr/MusicBrainz, so this is what
 * actually makes hand-added (and non-MB) albums show up for playback.
 */
export async function triggerScan(): Promise<string> {
  if (!config.navidrome.enabled) return "skipped (not configured)";
  const salt = randomBytes(6).toString("hex");
  const token = createHash("md5").update(config.navidrome.pass + salt).digest("hex");
  const params = new URLSearchParams({
    u: config.navidrome.user,
    t: token,
    s: salt,
    v: "1.16.1",
    c: "manualarr",
    f: "json",
  });
  try {
    return await withRetry(async () => {
      const res = await fetch(`${config.navidrome.url}/rest/startScan?${params}`, { cache: "no-store" });
      if (res.status >= 500) throw new RetryableError(`failed (${res.status})`);
      if (!res.ok) return `failed (${res.status})`;
      const data = (await res.json()) as { "subsonic-response"?: { status?: string } };
      return data["subsonic-response"]?.status === "ok" ? "scan triggered" : "unexpected response";
    });
  } catch (e) {
    return `error: ${(e as Error).message}`;
  }
}
