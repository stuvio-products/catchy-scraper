# =============================================================================
# Stage 1: Base — shared across all targets
# =============================================================================
FROM node:20-slim AS base

# Install system deps for Prisma + Playwright
RUN apt-get update && apt-get install -y \
    openssl \
    ca-certificates \
    tini \
    && rm -rf /var/lib/apt/lists/*

ENTRYPOINT ["/usr/bin/tini", "--"]

WORKDIR /app

COPY package.json package-lock.json ./
COPY prisma ./prisma/
COPY prisma.config.ts ./
COPY src/shared/config/load-env.ts ./src/shared/config/load-env.ts

# =============================================================================
# Stage 2: Dependencies — install all node_modules
# =============================================================================
FROM base AS deps

RUN npm ci
RUN npx prisma generate

# =============================================================================
# Stage 3: Development — hot-reload with source mounting
# =============================================================================
FROM deps AS development

# Install Playwright system deps and Chromium (so all services can run browsers if needed)
RUN npx playwright install-deps chromium && \
    npx playwright install chromium

COPY . .

# Default command (overridden per service in compose)
CMD ["npm", "run", "dev:api"]

# =============================================================================
# Stage 4: Builder — compile TypeScript for production
# =============================================================================
FROM deps AS builder

COPY . .
RUN npm run build

# =============================================================================
# Stage 5: Production — minimal runtime image
# =============================================================================
FROM node:20-slim AS production

RUN apt-get update && apt-get install -y \
    openssl \
    ca-certificates \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Copy only production dependencies
COPY package.json package-lock.json ./
RUN npm ci --omit=dev

# Install Playwright system deps and Chromium (so all services can run browsers)
RUN npx playwright install-deps chromium && \
    npx playwright install chromium

# Copy Prisma schema + generated client
COPY prisma ./prisma/
COPY prisma.config.ts ./
COPY --from=builder /app/node_modules/.prisma ./node_modules/.prisma
COPY --from=builder /app/node_modules/@prisma ./node_modules/@prisma

# Copy compiled output
COPY --from=builder /app/dist ./dist

# Copy scripts and SQL
COPY scripts ./scripts/

# Default command (overridden per service in compose)
CMD ["node", "dist/src/apps/api/main"]
