FROM node:22-alpine AS build

WORKDIR /app
RUN corepack enable && corepack prepare pnpm@10.0.0 --activate

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml turbo.json tsconfig.base.json ./
COPY apps/hosted-sites ./apps/hosted-sites
COPY packages/scoring ./packages/scoring

RUN pnpm install --filter hosted-sites... --frozen-lockfile
RUN pnpm --filter @agentbench/scoring build
RUN pnpm --filter hosted-sites build

FROM node:22-alpine AS runtime

WORKDIR /app
RUN corepack enable && corepack prepare pnpm@10.0.0 --activate

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml turbo.json tsconfig.base.json ./
COPY apps/hosted-sites ./apps/hosted-sites
COPY packages/scoring ./packages/scoring
COPY --from=build /app/apps/hosted-sites/dist ./apps/hosted-sites/dist
COPY --from=build /app/packages/scoring/dist ./packages/scoring/dist

RUN pnpm install --filter hosted-sites... --prod --frozen-lockfile

EXPOSE 3003
CMD ["pnpm", "--filter", "hosted-sites", "start"]
