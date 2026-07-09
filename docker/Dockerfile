FROM node:20-alpine AS base
RUN corepack enable && corepack prepare pnpm@latest --activate

FROM base AS deps
WORKDIR /app
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml* ./
COPY apps/web/package.json ./apps/web/
COPY packages/core/package.json ./packages/core/
COPY packages/cloud-adapters/package.json ./packages/cloud-adapters/
COPY packages/cli/package.json ./packages/cli/
RUN pnpm install --frozen-lockfile || pnpm install

FROM base AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN pnpm --filter @langtube/core build
RUN pnpm --filter @langtube/cloud-adapters build
RUN pnpm --filter @langtube/web build

FROM base AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV LANGTUBE_DATA_DIR=/data
ENV PORT=3000

COPY --from=builder /app ./
EXPOSE 3000

CMD ["pnpm", "--filter", "@langtube/web", "start"]
