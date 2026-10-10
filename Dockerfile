FROM node:22-slim AS base
RUN apt-get update -y && apt-get install -y openssl python3 make g++ && rm -rf /var/lib/apt/lists/*
WORKDIR /app

FROM base AS build
COPY package.json package-lock.json* ./
RUN npm ci
COPY . .
RUN npx prisma generate && npm run build

FROM base AS run
ENV NODE_ENV=production
COPY --from=build /app /app
# SERVICE=web (default) runs Next.js, SERVICE=worker runs the BullMQ worker
CMD ["sh", "-c", "if [ \"$SERVICE\" = \"worker\" ]; then npx tsx worker/index.ts; else npx prisma db push --skip-generate && npx tsx scripts/backfill-email-verified.ts && npm run start; fi"]
