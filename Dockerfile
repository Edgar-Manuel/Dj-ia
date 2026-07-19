# Multi-stage build for the single-process deployment (Express serves the
# API and the built client from one container — see server/src/app.ts).
# Directory layout must survive into the runtime image: app.ts resolves the
# client bundle as `server/dist/../../client/dist`, and the @ai-dj/shared
# workspace is consumed via its npm-workspaces symlink. ffmpeg is required
# by stemService.ts (phase-cancellation vocal/instrumental split).

FROM node:20-alpine AS builder
WORKDIR /app
COPY package.json package-lock.json tsconfig.base.json ./
COPY shared/package.json shared/package.json
COPY server/package.json server/package.json
COPY client/package.json client/package.json
RUN npm ci
COPY . .
RUN npm run build

FROM node:20-alpine AS runtime
WORKDIR /app
RUN apk add --no-cache ffmpeg
ENV NODE_ENV=production
COPY --from=builder /app/package.json /app/package-lock.json ./
COPY --from=builder /app/shared/package.json shared/package.json
COPY --from=builder /app/server/package.json server/package.json
COPY --from=builder /app/client/package.json client/package.json
RUN npm ci --omit=dev
COPY --from=builder /app/shared/dist shared/dist
COPY --from=builder /app/server/dist server/dist
COPY --from=builder /app/client/dist client/dist

EXPOSE 4000
CMD ["npm", "start"]
