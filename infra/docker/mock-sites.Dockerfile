FROM node:22-alpine AS build

WORKDIR /app
RUN corepack enable && corepack prepare pnpm@10.0.0 --activate

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml turbo.json tsconfig.base.json ./
COPY apps/mock-sites ./apps/mock-sites

RUN pnpm install --filter mock-sites --frozen-lockfile
RUN pnpm --filter mock-sites build

FROM node:22-alpine AS runtime

WORKDIR /app
RUN corepack enable && corepack prepare pnpm@10.0.0 --activate

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml turbo.json tsconfig.base.json ./
COPY apps/mock-sites ./apps/mock-sites
COPY --from=build /app/apps/mock-sites/dist ./apps/mock-sites/dist

RUN pnpm install --filter mock-sites --prod --frozen-lockfile

EXPOSE 3001
CMD ["pnpm", "--filter", "mock-sites", "start"]
