# Build stage
FROM node:20-alpine AS build

WORKDIR /app

# Copy package files
COPY package*.json ./
COPY tsconfig*.json ./
COPY nest-cli.json ./

# Install ALL dependencies (including devDependencies for Nest CLI)
RUN npm install

# Copy source code
COPY src ./src
COPY prisma ./prisma
COPY prisma.config.ts ./prisma.config.ts

# Generate Prisma client
RUN npx prisma generate

# Build application
RUN npm run build:api

# Production stage — use slim (not alpine) for Playwright compatibility
FROM node:20-slim

WORKDIR /app

# Install Playwright system dependencies (Chromium needs these libs)
RUN apt-get update && apt-get install -y --no-install-recommends \
    wget \
    ca-certificates \
    fonts-liberation \
    libasound2 \
    libatk-bridge2.0-0 \
    libatk1.0-0 \
    libcups2 \
    libdbus-1-3 \
    libdrm2 \
    libgbm1 \
    libgtk-3-0 \
    libnspr4 \
    libnss3 \
    libx11-xcb1 \
    libxcomposite1 \
    libxdamage1 \
    libxrandr2 \
    xdg-utils \
    && rm -rf /var/lib/apt/lists/*

# Copy built application
COPY --from=build /app/dist ./dist
COPY --from=build /app/package*.json ./

# Copy prisma schema (needed for migrations during deploy)
COPY --from=build /app/prisma ./prisma
COPY --from=build /app/prisma.config.ts ./prisma.config.ts

# Install only production dependencies
RUN npm ci --omit=dev

# Re-generate prisma client for production
RUN npx prisma generate

# Install Playwright Chromium browser
RUN npx playwright install chromium

# Expose API port
EXPOSE 3000

# Start API server
CMD ["node", "dist/apps/api/main.js"]
