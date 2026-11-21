FROM node:20-alpine AS build
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN apk add --no-cache espeak-ng && npm run build && node scripts/test_tts_server.mjs

FROM node:20-alpine
WORKDIR /app
RUN apk add --no-cache espeak-ng python3 py3-pip \
  && python3 -m venv /opt/edge-tts \
  && /opt/edge-tts/bin/pip install --no-cache-dir edge-tts==7.3.1
ENV NODE_ENV=production \
    PORT=3000 \
    HOST=0.0.0.0 \
    EDGE_TTS_BIN=/opt/edge-tts/bin/edge-tts \
    TTS_ENGINE=edge-tts
# Build estático, servidor HTTP, sorteio local e vozes neurais Microsoft PT/EN.
COPY --from=build /app/dist ./dist
COPY --from=build /app/server ./server
COPY --from=build /app/src/data ./src/data
COPY --from=build /app/package.json ./package.json
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s \
  CMD ["node", "server/healthProbe.mjs"]
CMD ["node", "server/index.mjs"]

