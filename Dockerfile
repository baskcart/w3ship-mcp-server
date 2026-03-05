# -- Build stage --
FROM node:22-alpine AS builder

WORKDIR /app

# Install dependencies
COPY package.json package-lock.json ./
RUN npm ci --ignore-scripts

# Copy source and build
COPY tsconfig.json ./
COPY src/ ./src/
RUN npm run build

# -- Runtime stage --
FROM node:22-alpine

WORKDIR /app

# Only copy production deps + compiled output
COPY package.json package-lock.json ./
RUN npm ci --omit=dev --ignore-scripts

COPY --from=builder /app/dist ./dist
COPY LICENSE README.md ./

# MCP servers use stdio transport — the container's entrypoint IS the server
ENTRYPOINT ["node", "dist/index.js"]
