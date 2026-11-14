# dashboard

Next.js (TypeScript) on Vercel. The trading UI for YES / NO share markets and the band
listener page. Every backend call goes through `createClient` from `@vexbets/contract`.

## Run it

    npm install                  # in the repo root
    npm run dev -w dashboard     # http://localhost:3000

By default it runs on a **mock backend inside the browser** (`src/lib/mock/server.ts`): it
answers the contract's endpoints from localStorage, so everything works with no backend.
Sign in with any email. Each browser tab is its own user, so two tabs can be two friends.

### Against the real backend

    # terminal 1
    npm run dev -w backend       # http://localhost:3001
    # terminal 2
    NEXT_PUBLIC_API_MODE=live BACKEND_URL=http://localhost:3001 npm run dev -w dashboard

The dashboard forwards `/api/v1/*` to `BACKEND_URL` (see `next.config.ts`), so the browser
only talks to its own origin and there is no CORS to set up. On Vercel, set the same two
env vars on the dashboard project, with `BACKEND_URL` set to the backend's URL.

## Pages

| Route           | What                                                                                                                                                                |
| --------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `/`             | Markets: YES / NO prices, sparkline, volume, time left                                                                                                              |
| `/markets/new`  | Create a YES / NO market (No is the fallback outcome)                                                                                                               |
| `/markets/[id]` | Price chart, buy / sell YES or NO shares, your shares, trade tape, resolution + proof check                                                                         |
| `/portfolio`    | Cash, holdings per market, gains                                                                                                                                    |
| `/listen`       | Connects to the band (Web Bluetooth, Chrome/Edge), speech-to-text, `appendSegments`. Doubles as the projector screen. Has a "type a line" box to test with no band. |

Trades: preview with `lmsr.quoteTrade`, then `quote` and `trade` with a 3% slippage limit
and a fresh `idempotencyKey`. No push channel, so pages poll every 1.5–3 s.

## Files

| Path                     | What                                                                             |
| ------------------------ | -------------------------------------------------------------------------------- |
| `src/lib/api.ts`         | The contract client (mock or live) with `Authorization: Bearer <email>`          |
| `src/lib/mock/server.ts` | Mock backend; its toy judge settles on phrases written in quotes in the criteria |
| `src/lib/market.ts`      | YES / NO view of a contract `Market`, price history                              |
| `src/lib/segments.ts`    | Sends final transcript lines in `seq` order, retries failures                    |
| `src/vendor/vexo-open/`  | The kit's browser library, copied so Vercel can build it                         |
| `test/`                  | Mock speaks the contract (incl. `verifyProof`), segment queue                    |

## Needs from the backend / contract

1. `sttToken` must return `provider: "deepgram"` and a token. `/listen` uses a token
   containing a `.` (a short-lived JWT from Deepgram's grant API) as `bearer`, anything else
   as an API key. Until then, `/listen` asks for a key or takes typed lines.
2. No endpoint returns the live transcript, so the market page shows transcript lines only
   in the proof after resolution. The live view is on `/listen`, the tab connected to the band.
3. A market that resolves by fallback with no transcript at all has a `headHash` that
   `verifyProof` can't find (GENESIS is not added to `heads`), so its proof check fails.
