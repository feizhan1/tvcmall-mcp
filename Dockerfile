FROM node:20-bookworm-slim AS build

WORKDIR /app

# keytar may need native compilation when a prebuilt binary is unavailable.
RUN apt-get update \
  && apt-get install -y --no-install-recommends build-essential libsecret-1-dev pkg-config python3 \
  && rm -rf /var/lib/apt/lists/*

COPY package.json package-lock.json ./
RUN npm ci

COPY tsconfig.json tsconfig.test.json ./
COPY src ./src
RUN npm run build && npm prune --omit=dev

FROM node:20-bookworm-slim AS runtime

WORKDIR /app
ENV NODE_ENV=production
ENV TVCMALL_MCP_HOST=0.0.0.0

# keytar is loaded by the legacy stdio/token-store modules at runtime.
RUN apt-get update \
  && apt-get install -y --no-install-recommends libsecret-1-0 \
  && rm -rf /var/lib/apt/lists/*

COPY --from=build /app/package.json /app/package-lock.json ./
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist

USER node
EXPOSE 3000

CMD ["node", "dist/index.js"]
