# Bun-based build and runtime. Uses Debian (glibc) to avoid rollup optional-deps / musl issues.
# WORKDIR /src (not /app) so Vite alias "/app" -> resolve(cwd,"app") => /src/app, avoiding /app/app/app path clash.
FROM oven/bun:1 AS production-dependencies-env
WORKDIR /src
COPY package.json bun.lockb* package-lock.json* ./
RUN bun install --frozen-lockfile --production || npm ci --only=production || true

FROM oven/bun:1 AS build-env
WORKDIR /src
ARG VITE_CONTROL_PLANE_URL=http://localhost:8080
ENV VITE_CONTROL_PLANE_URL=${VITE_CONTROL_PLANE_URL}
COPY package.json bun.lockb* package-lock.json* ./
RUN bun install --frozen-lockfile || npm ci || true
COPY . .
RUN bun run build || npm run build

# Run with Node: React Router server uses renderToPipeableStream etc.; Bun's react-dom/server stub lacks them.
FROM node:20-bookworm-slim
WORKDIR /src
ENV PORT=3001
COPY package.json bun.lockb* package-lock.json* ./
COPY --from=production-dependencies-env /src/node_modules /src/node_modules
# Install typescript globally (needed for tsconfig)
RUN npm install -g typescript
COPY --from=build-env /src/build ./build
# Ensure public assets are available
COPY --from=build-env /src/public ./public
EXPOSE 3001
CMD ["npx", "react-router-serve", "./build/server/index.js"]

