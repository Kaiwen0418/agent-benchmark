FROM node:22-alpine AS build

WORKDIR /app
RUN corepack enable && corepack prepare pnpm@10.0.0 --activate

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml turbo.json tsconfig.base.json ./
COPY apps/hosted-orchestrator ./apps/hosted-orchestrator
COPY apps/hosted-sites ./apps/hosted-sites
COPY packages/scoring ./packages/scoring
COPY packages/shared ./packages/shared

RUN pnpm install --frozen-lockfile
RUN pnpm --filter @agentbench/scoring build
RUN pnpm --filter hosted-orchestrator build

FROM node:22-alpine AS runtime

WORKDIR /app
RUN corepack enable && corepack prepare pnpm@10.0.0 --activate

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml turbo.json tsconfig.base.json ./
COPY apps/hosted-orchestrator ./apps/hosted-orchestrator
COPY packages/scoring ./packages/scoring
COPY packages/shared ./packages/shared
COPY --from=build /app/apps/hosted-orchestrator/dist ./apps/hosted-orchestrator/dist
COPY --from=build /app/packages/scoring/dist ./packages/scoring/dist

RUN pnpm install --prod --frozen-lockfile

EXPOSE 3004
CMD ["pnpm", "--filter", "hosted-orchestrator", "start"]
