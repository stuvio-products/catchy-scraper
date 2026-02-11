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

# Production stage
FROM node:20-alpine

WORKDIR /app

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

# Expose API port
EXPOSE 3000

# Start API server
CMD ["node", "dist/apps/api/main.js"]
