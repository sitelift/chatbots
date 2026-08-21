FROM node:22-slim AS base
ENV PNPM_HOME=/pnpm
ENV PATH="$PNPM_HOME:$PATH"
RUN corepack enable
WORKDIR /app

FROM base AS build
COPY . .
RUN pnpm install --frozen-lockfile
RUN pnpm --filter @sitelift/widget build
RUN pnpm --filter @sitelift/dashboard build

FROM base AS prod-deps
COPY . .
RUN pnpm deploy --filter @sitelift/server --prod /out

FROM node:22-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production \
    HOST=0.0.0.0 \
    PORT=3000 \
    DATABASE_PATH=/app/data/sitelift.db \
    WIDGET_DIST_PATH=/app/public/embed.js \
    DASHBOARD_DIST_PATH=/app/public/admin

COPY --from=prod-deps /out ./
COPY apps/server/drizzle ./drizzle
COPY apps/server/tsconfig.json ./
COPY packages/shared ./node_modules/@sitelift/shared
COPY --from=build /app/packages/widget/dist/embed.js ./public/embed.js
COPY --from=build /app/apps/dashboard/dist ./public/admin
RUN mkdir -p /app/data

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:3000/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["./node_modules/.bin/tsx", "src/start.ts"]
