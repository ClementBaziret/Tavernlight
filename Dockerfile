# Tavernlight: API + built web app in one image (see docker-compose.yml).
FROM node:22-bookworm-slim AS build
RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates && rm -rf /var/lib/apt/lists/*
RUN corepack enable
WORKDIR /app

# Dependencies first (better layer caching).
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml .npmrc turbo.json tsconfig.base.json ./
COPY packages/dice/package.json packages/dice/
COPY packages/engine/package.json packages/engine/
COPY packages/shared/package.json packages/shared/
COPY apps/server/package.json apps/server/
COPY apps/web/package.json apps/web/
COPY apps/mobile/package.json apps/mobile/
RUN pnpm install --frozen-lockfile --filter "@tavernlight/server..." --filter "@tavernlight/web..."

COPY packages packages
COPY apps/server apps/server
COPY apps/web apps/web
RUN pnpm --filter "./packages/*" build \
 && pnpm --filter @tavernlight/server exec prisma generate \
 && pnpm --filter @tavernlight/server build \
 && pnpm --filter @tavernlight/web build

FROM node:22-bookworm-slim AS run
RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates && rm -rf /var/lib/apt/lists/*
WORKDIR /app
ENV NODE_ENV=production TAVERNLIGHT_ROOT=/app
COPY --from=build /app /app
COPY data data
WORKDIR /app/apps/server
EXPOSE 3000
# Apply migrations, then start (BOOTSTRAP=true imports the SRD and the demo campaign).
CMD ["sh", "-c", "node /app/node_modules/prisma/build/index.js migrate deploy && node dist/main.js"]
