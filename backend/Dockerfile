# Build context must be the monorepo root
FROM node:20-alpine AS builder

# Install OpenSSL for Prisma engine
RUN apk add --no-cache openssl

WORKDIR /app

# Copy shared package first and build it
COPY shared/package*.json shared/
COPY shared/tsconfig.json shared/
COPY shared/src shared/src
RUN cd shared && npm install && npm run build

# Copy backend package.json and install deps
COPY backend/package*.json backend/
RUN cd backend && npm install

# Generate Prisma client for linux-musl (Alpine)
COPY backend/prisma backend/prisma
RUN cd backend && npx prisma generate

# Build backend
COPY backend/tsconfig.json backend/
COPY backend/src backend/src
RUN cd backend && npm run build

# Production image
FROM node:20-alpine

# Install OpenSSL for Prisma runtime
RUN apk add --no-cache openssl

WORKDIR /app

# Copy shared (needed at runtime for the file: dependency)
COPY --from=builder /app/shared /app/shared

# Copy backend
WORKDIR /app/backend
COPY --from=builder /app/backend/dist ./dist
COPY --from=builder /app/backend/node_modules ./node_modules
COPY --from=builder /app/backend/package.json ./
COPY --from=builder /app/backend/prisma ./prisma

EXPOSE 3001
CMD ["sh", "-c", "npx prisma migrate deploy && node dist/server.js"]
