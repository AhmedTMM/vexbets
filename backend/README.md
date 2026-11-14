# backend

Next.js route handlers on Vercel, Postgres through Drizzle. Implements every endpoint in
[`contract/src/api.ts`](../contract/src/api.ts) behind one router (`src/http.ts`).

## Run it

    npm install            # in the repo root
    npm run dev -w backend # http://localhost:3001, data in backend/.pglite (no setup)
    curl localhost:3001/api/health

With no `DATABASE_URL`, the backend runs PGlite: a real Postgres engine inside Node, kept
on disk in `backend/.pglite`. Delete that folder to start over.

## Test it

    npm test -w backend                                    # in-memory PGlite
    TEST_DATABASE_URL=postgres://... npm test -w backend   # a real Postgres server

Tests start the whole backend in-process (`test/harness.ts`) and call it through the
contract's typed client, so they cover the same parsing, auth and errors as production.
The clock is fake (`b.advance(ms)`).

## Database

    npm run db:generate -w backend   # after editing src/db/schema.ts: writes drizzle/*.sql
    DATABASE_URL=... npm run db:migrate -w backend

On Vercel, `vercel-build` applies migrations before `next build`.

## Auth

`Authorization: Bearer <email>`. No password, no security: it is a demo with play money.
