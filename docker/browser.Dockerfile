# Build stage
FROM node:20-bullseye AS build

WORKDIR /app

# Copy package files
COPY package*.json ./
COPY tsconfig*.json ./
COPY nest-cli.json ./

# Install ALL dependencies
RUN npm install

# Copy source code
COPY src ./src
COPY prisma ./prisma

# Generate Prisma client
RUN npx prisma generate

# Build application
RUN npm run build:browser

# Production stage
FROM node:20-bullseye

WORKDIR /app

# Install Playwright dependencies and browsers
RUN npx -y playwright@1.40.1 install --with-deps chromium

# Copy built application
COPY --from=build /app/dist ./dist
COPY --from=build /app/package*.json ./

# Install only production dependencies
RUN npm ci --omit=dev

# Expose browser service port (internal only)
EXPOSE 3001

# Start browser service
CMD ["node", "dist/apps/browser-service/main.js"]
