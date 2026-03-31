# Use node for dependency install (reliable npm ci) and bun for building.
# WORKDIR /src (not /app) so Vite alias "/app" -> resolve(cwd,"app") => /src/app.
FROM node:20-bookworm-slim AS production-dependencies-env
WORKDIR /src
COPY package.json package-lock.json* ./
RUN npm ci --only=production

FROM oven/bun:1 AS build-env
WORKDIR /src
ARG VITE_CONTROL_PLANE_URL=http://localhost:8080
ENV VITE_CONTROL_PLANE_URL=${VITE_CONTROL_PLANE_URL}
COPY package.json package-lock.json* ./
RUN bun install --no-save
COPY . .
RUN bun run build

# Run with Node: React Router server uses renderToPipeableStream etc.
FROM node:20-bookworm-slim
WORKDIR /src
ENV PORT=3001
COPY --from=production-dependencies-env /src/node_modules /src/node_modules
RUN npm install -g typescript
COPY --from=build-env /src/build ./build
COPY --from=build-env /src/public ./public
EXPOSE 3001
CMD ["npx", "react-router-serve", "./build/server/index.js"]
