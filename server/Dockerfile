# AI Scenario English Trainer — API server image.
# Runs the Fastify app via tsx (TS executed directly). Deployed on the shared
# BWH host, joined to the 9relay_default network to reach 9relay-postgres.
FROM node:22-slim

WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

COPY . .

ENV NODE_ENV=production
ENV HOST=0.0.0.0
ENV PORT=8101
EXPOSE 8101

# Health: Fastify /health returns the {data,error,meta} envelope.
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:8101/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "--import", "tsx", "src/server.ts"]
