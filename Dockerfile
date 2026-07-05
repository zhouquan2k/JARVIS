# syntax=docker/dockerfile:1

FROM node:22-bookworm-slim AS build
WORKDIR /app

RUN corepack enable

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/server/package.json apps/server/package.json
COPY apps/web2/package.json apps/web2/package.json
COPY packages/core/package.json packages/core/package.json
COPY packages/node/package.json packages/node/package.json
COPY packages/ui/package.json packages/ui/package.json
COPY plugins/ai-agent/package.json plugins/ai-agent/package.json
COPY plugins/task-mgr/package.json plugins/task-mgr/package.json

RUN pnpm install --frozen-lockfile

COPY . .

RUN pnpm --filter server exec esbuild src/index.ts \
    --bundle \
    --platform=node \
    --format=esm \
    --external:@hono/node-server \
    --external:@hono/node-server/* \
    --external:hono \
    --external:hono/* \
    --external:better-sqlite3 \
    --outfile=dist/index.js
RUN VITE_SYNC_BASE_URL=/api/sync pnpm --filter web2 exec vite build

FROM node:22-bookworm-slim
WORKDIR /app

COPY --from=build /app/node_modules /app/node_modules
COPY --from=build /app/apps/server/package.json /app/apps/server/package.json
COPY --from=build /app/apps/server/node_modules /app/apps/server/node_modules
COPY --from=build /app/apps/server/dist /app/apps/server/dist
COPY --from=build /app/apps/web2/dist /app/apps/web2/dist

ENV NODE_ENV=production
ENV PORT=8787
ENV CHATPRISM_SYNC_DB_PATH=/data/sync.sqlite
ENV CHATPRISM_KNOWLEDGE_ROOT=/knowledge
ENV CHATPRISM_RENDERER_DIST=/app/apps/web2/dist

EXPOSE 8787

CMD ["node", "apps/server/dist/index.js"]
