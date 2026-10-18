# Ultra-lightweight Mini-Golf 2D Server
FROM node:24-alpine

WORKDIR /app
ENV NODE_ENV=production

# Install dependencies first for efficient caching
COPY package*.json ./
RUN npm ci --omit=dev && npm cache clean --force

# Copy server code and client static assets (read-only for the runtime user)
COPY --chown=root:root server/ ./server/
COPY --chown=root:root public/ ./public/

# Run as the unprivileged node user
USER node

# Listen on all interfaces *inside* the container; docker-compose only
# publishes the port on the host's loopback interface.
ENV HOST=0.0.0.0
ENV PORT=3000
EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD wget -q -O /dev/null http://127.0.0.1:3000/healthz || exit 1

CMD ["node", "server/index.js"]
