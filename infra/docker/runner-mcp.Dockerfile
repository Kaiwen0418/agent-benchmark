FROM node:22-alpine AS build

WORKDIR /app
RUN corepack enable && corepack prepare pnpm@10.0.0 --activate

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml turbo.json tsconfig.base.json ./
COPY apps/runner ./apps/runner
COPY packages/mcp-tools ./packages/mcp-tools
COPY packages/protocol ./packages/protocol

RUN pnpm install --filter runner... --frozen-lockfile
RUN pnpm --filter runner build

FROM node:22-alpine AS runtime

WORKDIR /app
RUN corepack enable && corepack prepare pnpm@10.0.0 --activate

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml turbo.json tsconfig.base.json ./
COPY apps/runner ./apps/runner
COPY packages/mcp-tools ./packages/mcp-tools
COPY packages/protocol ./packages/protocol
COPY --from=build /app/apps/runner/dist ./apps/runner/dist

RUN pnpm install --filter runner... --prod --frozen-lockfile

EXPOSE 8080
CMD ["pnpm", "--filter", "runner", "start:mcp:http"]
