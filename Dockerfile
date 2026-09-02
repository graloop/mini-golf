# Ultra-lightweight Mini-Golf 2D Server
FROM node:20-alpine

# Set working directory
WORKDIR /app

# Install dependencies first for efficient caching
COPY package*.json ./
RUN npm ci --only=production

# Copy server code and client static assets
COPY server/ ./server/
COPY public/ ./public/

# Use non-root node user for security
USER node

# Environment defaults
ENV PORT=3000
ENV APP_PASSWORD=""
ENV NODE_ENV=production

EXPOSE 3000

# Start server
CMD ["node", "server/index.js"]
