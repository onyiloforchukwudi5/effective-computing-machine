# Mail CRM

Next.js (App Router) + Postgres (Prisma) + Redis + a separate BullMQ worker (`worker/index.ts`).

## Local

```
cp .env.example .env   # set ENCRYPTION_KEY (openssl rand -base64 32), SIGNING_SECRET
npm install && npx prisma db push
npm run dev            # web
npm run worker         # worker (separate terminal)
```

## Docker

One image, two roles chosen by `SERVICE`:

```
docker build -t mailcrm .
docker run -e SERVICE=web    ... mailcrm     # runs `prisma db push`, then Next.js on $PORT
docker run -e SERVICE=worker ... mailcrm     # BullMQ worker
```

Health check: `GET /api/health` (checks Postgres and Redis).

## Deploy notes (create: web service, worker service, Postgres, Redis; share the same env vars on both services)

**Railway** – add Postgres and Redis plugins; create two services from this repo (Dockerfile). Web: `SERVICE=web`, health check `/api/health`. Worker: `SERVICE=worker`. Reference `DATABASE_URL` / `REDIS_URL` from the plugins.

**Render** – create a Postgres and a Key Value (Redis) instance; one *Web Service* (Docker, `SERVICE=web`, health path `/api/health`) and one *Background Worker* (Docker, `SERVICE=worker`).

**Fly.io** – `fly postgres create`, Upstash Redis (`fly redis create`); one app with two process groups in `fly.toml`:
`[processes] web = "sh -c 'SERVICE=web ...'"`, `worker = "sh -c 'SERVICE=worker ...'"` (or two apps with different `SERVICE`). Set secrets with `fly secrets set`.

Required env: `DATABASE_URL`, `REDIS_URL`, `ENCRYPTION_KEY`, `SIGNING_SECRET`, `APP_URL`. See `.env.example` for the rest.

**Port 25 warning:** email verification (SMTP handshake) needs outbound port 25, which Railway/Render/Fly commonly block. The Contacts page shows a warning when the worker's self-test fails.

## Security notes

Mailbox passwords, OAuth tokens, SMTP passwords and user AI keys are encrypted with AES-256-GCM (`lib/crypto.ts`) and never returned to the client (masked). Everything is scoped by `userId` server-side.
