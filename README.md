# manualarr

Hand-add albums & singles to a **Lidarr** / **Navidrome** music library.

Some releases you can only get by hand — a FLAC you grabbed from a browser-only
source (e.g. squid.wtf, behind a captcha), a bandcamp download, or an album that
isn't on MusicBrainz yet. manualarr is a tiny single-page app to drop those files
in and have them land in the right place: correct folder layout, Lidarr refreshed
so the album shows as owned, and Navidrome rescanned so it's instantly playable.

> One page. No login. No landing page. Just the tool.

![status](https://github.com/phanes-io/manualarr/actions/workflows/docker-build.yml/badge.svg)

## What it does

1. **Drop** an album folder or single (FLAC / MP3 / M4A / OGG / Opus / …).
2. It **reads the embedded tags** and pre-fills artist, album, year and the track list — all editable.
3. Pick a destination:
   - **Match in Lidarr** — searches Lidarr/MusicBrainz, adds the artist if new, places the files into the library and triggers a refresh so Lidarr marks the album as owned.
   - **Library only (non-MB)** — for albums not on MusicBrainz: files go straight into the library; Navidrome serves them, Lidarr is skipped.
4. Files are placed as `‹root›/‹Artist›/‹(Year) Album›/‹NN Title.ext›` and Navidrome is rescanned.

Optionally rewrites FLAC tags from your edits (needs the `flac`/`metaflac` tool — bundled in the Docker image).

## Stack

Single **Next.js 16** app (App Router, React 19, TypeScript, Tailwind v4). No database.
State is the Lidarr API + the filesystem. Built to a small standalone Docker image via GitHub Actions.

## Run with Docker

```bash
cp .env.example .env   # set LIDARR_API_KEY etc.
docker compose -f docker-compose.example.yml up -d
```

Mount the **same** music library share Lidarr writes to, at `MUSIC_LIBRARY_PATH`.
See [`docker-compose.example.yml`](./docker-compose.example.yml).

## Configuration

| Env | Default | Notes |
|---|---|---|
| `LIDARR_URL` | `http://lidarr:8686` | Lidarr base URL |
| `LIDARR_API_KEY` | — | Settings → General in Lidarr |
| `MUSIC_LIBRARY_PATH` | `/music` | Library root inside the container |
| `STAGING_PATH` | `/staging` | Scratch space for in-progress uploads |
| `ALBUM_FOLDER_FORMAT` | `({year}) {album}` | tokens: `{artist} {album} {year}` |
| `TRACK_FILE_FORMAT` | `{track} {title}.{ext}` | tokens: `{track} {title} {ext}` |
| `LIDARR_ROOT_FOLDER` | auto | only for adding new artists |
| `LIDARR_QUALITY_PROFILE_ID` | auto | only for adding new artists |
| `LIDARR_METADATA_PROFILE_ID` | auto | only for adding new artists |
| `NAVIDROME_URL` / `NAVIDROME_USER` / `NAVIDROME_PASS` | — | optional rescan trigger |

## Develop

```bash
npm install
npm run dev   # http://localhost:3000
```

## Notes / limitations (MVP)

- Uploads are buffered in memory by the route handler — fine for normal album sizes; streaming-to-disk is a future improvement.
- Runs as root in the image so it can write to NFS mounts. Set `user:` in compose to match your PUID/PGID instead.
- No auth — intended for a trusted LAN. Put it behind your reverse proxy / auth if exposed.

## License

MIT
