# Deploy — AI Scenario English Trainer (BWH, multi-tenant)

The app coexists with 9relay + BillMind on the BWH host. **Never edit the
9relay/BillMind config; only add.** Reuses the shared `9relay-postgres` (own
DB + role) and the `9relay_default` network; binds `127.0.0.1:8101`; Caddy
fronts it.

## One-time
1. **DB role + database** (run in the shared Postgres):
   ```sh
   docker exec 9relay-postgres psql -U "$PGSUPER" -v ON_ERROR_STOP=1 \
     -c "CREATE ROLE scenario_english LOGIN PASSWORD '<gen>';" \
     -c "CREATE DATABASE scenario_english OWNER scenario_english;"
   ```
2. **Secrets** at `/opt/scenario-english/.env` (chmod 600), from `server/.env.example`:
   `DATABASE_URL=postgres://scenario_english:<gen>@9relay-postgres:5432/scenario_english`,
   `JWT_SECRET`/`JWT_REFRESH_SECRET` (openssl rand), `OPENAI_API_KEY` (official key),
   `WEB_ORIGIN=https://english.daichenlab.com`, `NODE_ENV=production`, `HOST=0.0.0.0`, `PORT=8101`.
3. **Clone** the repo to `/opt/scenario-english/app` (public).
4. **Caddy**: append `ops/caddy-english.snippet` to `/opt/9relay/Caddyfile`; validate + reload.
5. **DNS**: `english` + `api.english` A records → host IP, DNS-only (Cloudflare).

## Each deploy
```sh
cd /opt/scenario-english/app && git pull
docker compose -f ops/scenario-compose.yml up -d --build
docker compose -f ops/scenario-compose.yml exec api npm run db:migrate
docker compose -f ops/scenario-compose.yml exec api npm run seed   # idempotent
docker exec 9relay-caddy caddy reload --config /etc/caddy/Caddyfile   # only if vhosts changed
curl -fsS https://api.english.daichenlab.com/health
```

## Coexistence guardrails
- Unique names (`scenario-english-*`), own DB+role, own localhost port, resource caps.
- Back up only this app's DB. Don't touch other tenants' volumes/limits/vhosts.
