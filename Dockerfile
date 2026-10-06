# Stage 1: Build
FROM node:20-slim AS builder
WORKDIR /app
COPY package*.json ./
RUN npm install
COPY . .
RUN npm run build

# Stage 2: Runtime
FROM node:20-slim
WORKDIR /app
COPY --from=builder /app/package*.json ./
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/server ./server
COPY --from=builder /app/contracts ./contracts
COPY --from=builder /app/db ./db
COPY --from=builder /app/scripts ./scripts

# El bot guarda la sesión en esta carpeta
RUN mkdir -p .wa-auth

EXPOSE 3000
CMD ["npm", "start"]
