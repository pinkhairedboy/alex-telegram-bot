# Build stage
FROM node:22-alpine AS builder

RUN apk add --no-cache python3 make g++
WORKDIR /app
COPY package*.json ./
RUN npm ci

# Production stage
FROM node:22-alpine

ENV NODE_ENV=production
WORKDIR /app
COPY package*.json ./
COPY --from=builder /app/node_modules ./node_modules
COPY . .

VOLUME ["/app/.env"]

CMD ["npm", "start"]
