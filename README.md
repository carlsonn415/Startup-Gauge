# Biz Viability

AI-powered business viability calculator. Next.js 14 + Tailwind + Prisma (Postgres/Neon). Deployed with AWS Amplify Hosting.

## Quick start

1. Install deps
```bash
pnpm i # or npm i / yarn
```
2. Configure env
- Create `.env` with `DATABASE_URL` (Neon recommended)
- Add `OPENAI_API_KEY`

3. Prisma
```bash
npx prisma migrate dev --name init
```

4. Dev
```bash
npm run dev
```

## Directories
- `app/` Next.js App Router
- `app/api/viability/` API route (placeholder)
- `prisma/` Prisma schema
- `lib/db/` Prisma client

## Deploy (Amplify Hosting)
- Connect GitHub repo in Amplify console
- Build command: `npm ci && npm run build`
- Start command: `npm start`
- Add env vars in Amplify: `DATABASE_URL`, `OPENAI_API_KEY`

## Next steps
- Wire viability API to OpenAI with Zod validation
- Add projects persistence and Amplify Auth (Cognito)
- Add Stripe payments and RAG uploads

