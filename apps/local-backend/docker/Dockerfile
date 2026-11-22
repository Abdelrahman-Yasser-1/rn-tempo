# Tempo Local Backend team server. Build from the repository root:
#   docker build -f apps/local-backend/docker/Dockerfile -t tempo-local-backend .
#
# Stage 1 builds the web dashboard and bundles the engine into one file (every dependency inlined). Stage 2 is the
# official Node image with only that file, the dashboard and the four Swagger UI files: no node_modules, no yarn, no
# build tools. It runs as the unprivileged `node` user, keeps everything it writes in /data, and works with a read-only
# root file system (compose sets it, with a tmpfs for /tmp).

# Node 24 matches `engines` (>=24.3.0). The exact tag is pinned; node:24.22.3-alpine3.24 on Docker Hub.
FROM node:24.22.3-alpine3.24 AS build
ENV CI=1 YARN_ENABLE_TELEMETRY=0
RUN corepack enable
WORKDIR /repo
COPY . .
# Only the engine, the dashboard app and what they depend on (not the docs, the template or the CLI).
RUN yarn workspaces focus @rn-tempo/local-backend @rn-tempo/local-backend-app
RUN yarn workspace @rn-tempo/local-backend build:dashboard \
 && cd apps/local-backend/engine \
 && npx tsdown -c tsdown.sea.config.ts \
 && mkdir -p /out/dist/swagger-ui /out/dashboard \
 && cp dist-sea/cli.mjs /out/dist/cli.mjs \
 && cp -r dashboard/. /out/dashboard/ \
 && for f in swagger-ui.css swagger-ui-bundle.js favicon-16x16.png favicon-32x32.png; do cp /repo/node_modules/swagger-ui-dist/$f /out/dist/swagger-ui/$f; done

FROM node:24.22.3-alpine3.24
LABEL org.opencontainers.image.title="Tempo Local Backend (team server)" \
      org.opencontainers.image.source="https://github.com/Abdelrahman-Yasser-1/rn-tempo" \
      org.opencontainers.image.licenses="MIT"
ENV NODE_ENV=production \
    TEMPO_DATA_DIR=/data \
    PORT=8080
WORKDIR /app
COPY --from=build /out/ /app/
# `docker exec <container> tempo-local-backend server owner create --email you@example.com --password-stdin`
# The server needs only the node binary. npm, npx, corepack and yarn ship with the base image but are never used at
# runtime, and their bundled dependencies are what vulnerability scans flag, so they are removed.
RUN rm -rf /usr/local/lib/node_modules/npm /usr/local/lib/node_modules/corepack /opt/yarn-* \
      /usr/local/bin/npm /usr/local/bin/npx /usr/local/bin/corepack /usr/local/bin/yarn /usr/local/bin/yarnpkg \
 && printf '#!/bin/sh\nexec node /app/dist/cli.mjs "$@"\n' > /usr/local/bin/tempo-local-backend \
 && chmod 0755 /usr/local/bin/tempo-local-backend \
 && mkdir -p /data \
 && chown node:node /data
USER node
VOLUME ["/data"]
# The one port: dashboard, admin API (behind sign-in) and every backend's public API under /b/<id>. Plain HTTP:
# put the TLS proxy (Caddy) in front and publish only that.
EXPOSE 8080
HEALTHCHECK --interval=15s --timeout=3s --start-period=10s --retries=3 \
  CMD wget -q -O /dev/null http://127.0.0.1:8080/__health || exit 1
ENTRYPOINT ["tempo-local-backend"]
CMD ["server"]
