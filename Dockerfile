# syntax=docker/dockerfile:1

FROM node:26-bookworm-slim AS dependencies

WORKDIR /app/apps/web-ui

COPY apps/web-ui/package.json apps/web-ui/package-lock.json ./
RUN --mount=type=cache,target=/root/.npm npm i

FROM dependencies AS build

COPY apps/web-ui/ ./
RUN npm run build

FROM node:26-bookworm-slim AS runtime

ENV NODE_ENV=production \
  PORT=8000 \
  DATABASE_PATH=/app/data/db.sqlite \
  AI_BOOK_COVERTER_BOOKS_PATH=/app/data/books

WORKDIR /app/apps/web-ui

RUN mkdir -p /app/data/books /app/apps/web-ui/uploads \
  && chown -R node:node /app

COPY --from=build --chown=node:node /app/apps/web-ui/package.json ./package.json
COPY --from=build --chown=node:node /app/apps/web-ui/node_modules ./node_modules
COPY --from=build --chown=node:node /app/apps/web-ui/dist ./dist

USER node

EXPOSE 8000
VOLUME ["/app/data"]

CMD ["node", "dist/server.js"]
