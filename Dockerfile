# ---- deps ----
FROM node:22-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json* pnpm-lock.yaml* ./
RUN corepack enable \
 && if [ -f pnpm-lock.yaml ]; then pnpm i --frozen-lockfile; \
    elif [ -f package-lock.json ]; then npm ci; \
    else npm i; fi

# ---- build ----
FROM node:22-alpine AS build
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
ENV NEXT_TELEMETRY_DISABLED=1
RUN npm run build

# ---- runtime ----
FROM node:22-alpine AS run
WORKDIR /app
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    PORT=3000 \
    HOSTNAME=0.0.0.0 \
    MUSIC_LIBRARY_PATH=/music \
    STAGING_PATH=/staging
# metaflac (package: flac) powers the optional FLAC tag-rewrite feature.
RUN apk add --no-cache flac
COPY --from=build /app/public ./public
COPY --from=build /app/.next/standalone ./
COPY --from=build /app/.next/static ./.next/static
RUN mkdir -p /staging /music
EXPOSE 3000
# Runs as root by default so it can write to NFS mounts; override with `user:` in compose to match your PUID/PGID.
CMD ["node", "server.js"]
