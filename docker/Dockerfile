FROM node:20-alpine AS base
RUN apk add --no-cache libc6-compat
RUN corepack enable && corepack prepare pnpm@9 --activate

FROM base AS builder
WORKDIR /app

# Install dependencies (cache layer)
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml tsconfig.base.json ./
COPY apps/web/package.json ./apps/web/
COPY apps/desktop/package.json ./apps/desktop/
COPY packages/core/package.json ./packages/core/
COPY packages/cloud-adapters/package.json ./packages/cloud-adapters/
COPY packages/cli/package.json ./packages/cli/
RUN pnpm install --frozen-lockfile

# Copy source and build
COPY apps/web ./apps/web
COPY packages ./packages
COPY data ./data
COPY schemas ./schemas

ENV NEXT_TELEMETRY_DISABLED=1
RUN pnpm --filter @langtube/core build
RUN pnpm --filter @langtube/cloud-adapters build
RUN pnpm --filter @langtube/web build

FROM base AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV LANGTUBE_DATA_DIR=/data
ENV PORT=3000
ENV HOSTNAME=0.0.0.0
ENV NEXT_TELEMETRY_DISABLED=1

RUN addgroup --system --gid 1001 nodejs \
  && adduser --system --uid 1001 nextjs

COPY --from=builder /app/data ./data
COPY --from=builder /app/apps/web/public ./apps/web/public
COPY --from=builder --chown=nextjs:nodejs /app/apps/web/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/apps/web/.next/static ./apps/web/.next/static

USER nextjs
EXPOSE 3000
CMD ["node", "apps/web/server.js"]
