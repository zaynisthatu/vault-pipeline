# Stage 1: Build stage
FROM node:20-slim AS builder
WORKDIR /app

ENV NODE_ENV=development

# Install required build tools for better-sqlite3 compilation
RUN apt-get update && apt-get install -y python3 make g++ && rm -rf /var/lib/apt/lists/*

COPY package*.json ./
RUN npm ci

COPY . .
RUN npm run build

# Stage 2: Production runtime stage
FROM node:20-slim
WORKDIR /app

# Re-install tools for native module runtime dependencies
RUN apt-get update && apt-get install -y python3 make g++ && rm -rf /var/lib/apt/lists/*

COPY package*.json ./
RUN npm ci --omit=dev

# Copy generated builds from builder stage
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/index.html ./index.html

# MAGIC FIX: Dockerfile ke andar hi ek small package.json dist folder mein daal rahe hain
# Jo Node.js ko bataye ke dist ke andar saari files CommonJS (CJS) hain. 
# Is se tumhara original package.json bilkul change nahi hoga!
RUN echo '{"type": "commonjs"}' > ./dist/package.json

ENV NODE_ENV=production
ENV PORT=7860
EXPOSE 7860
CMD ["node", "dist/server.cjs"]