FROM node:22-alpine

WORKDIR /app

# Copy package files and patches
COPY package.json package-lock.json ./
COPY patches/ ./patches/

# Install dependencies (postinstall applies patches)
RUN npm ci

# Copy source
COPY . .

# Build the indexer
RUN npm run build

# Check DNA server and start indexer
CMD npm run check-dna && npm run start -- --indexer=denshokan
