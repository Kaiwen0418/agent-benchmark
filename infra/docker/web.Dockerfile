FROM node:22-alpine AS build

WORKDIR /app
RUN corepack enable && corepack prepare pnpm@10.0.0 --activate

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml turbo.json tsconfig.base.json ./
COPY scripts ./scripts
COPY apps/web ./apps/web
COPY packages/database ./packages/database
COPY packages/protocol ./packages/protocol
COPY packages/shared ./packages/shared
COPY packages/test-cases ./packages/test-cases

RUN pnpm install --filter web... --frozen-lockfile
RUN pnpm --filter @agentbench/test-cases build
RUN pnpm --filter web build

FROM node:22-alpine AS runtime

ENV HOSTNAME=0.0.0.0
ENV NODE_ENV=production
ENV PORT=3000

WORKDIR /app/apps/web

RUN addgroup --system --gid 1001 nodejs \
  && adduser --system --uid 1001 nextjs \
  && mkdir -p .runner-artifacts \
  && chown nextjs:nodejs .runner-artifacts

COPY --from=build --chown=nextjs:nodejs /app/apps/web/.next/standalone ./standalone
COPY --from=build --chown=nextjs:nodejs /app/apps/web/.next/static ./standalone/apps/web/.next/static

USER nextjs

EXPOSE 3000

CMD ["node", "standalone/apps/web/server.js"]
