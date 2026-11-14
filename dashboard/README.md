# dashboard

Next.js (TypeScript) on Vercel. YES / NO share markets on what your friends say, settled
when their Vexo band hears it. Every backend call goes through `createClient` from
`@vexbets/contract`. Prices show in cents and money in dollars (1 contract credit = 1¢).

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

| Route           | What                                                                                                                                                                               |
| --------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `/`             | The selected market full width (empty until one is opened): chart, buy YES / NO, your shares with Sell. Below: open markets, with the New market form folded under "+ New market". |
| `/portfolio`    | Total balance with its change and a graph, then Positions (sell from here), History and Fills.                                                                                     |
| `/markets/[id]` | Full market page: chart, buy, your shares, trade tape, resolution and proof check.                                                                                                 |
| `/markets/new`  | The New market form on its own.                                                                                                                                                    |
| `/listen`       | Redirects to the dashboard: listening is the Listen bar at the top of every page.                                                                                                  |

Listening is market agnostic: the **Listen bar** at the top of every page (`ListenBar.tsx`)
listens to the team's band (`TEAM_BAND` in `src/lib/band.ts`), and every market on that band
settles from what it hears. One click (after the consent box) connects the band, opens a
session and starts speech-to-text; it keeps running while you browse. When a market settles,
a banner shows once (click, Esc or 6 s closes it; it is not replayed on reload), plus a
browser notification if you allowed them. No band at hand: type a line in the bar's test box.

Markets use the contract's default liquidity, b = 30. Like the backend, the creator puts up
the market maker's worst-case loss (`maxSubsidy(30, 2)` = $20.80) when it opens; trades flow
in and out of that escrow, winners are paid from it, and the creator gets the rest back.
The portfolio counts the deposit as yours until the market settles.

Trades: preview with `lmsr.quoteTrade`, then `quote` and `trade` with a 3% slippage limit
and a fresh `idempotencyKey` (`src/lib/trade.ts`). There is no push channel, so pages poll
every 1.5 to 3 s.

## Files

| Path                           | What                                                                        |
| ------------------------------ | --------------------------------------------------------------------------- |
| `src/lib/api.ts`               | The contract client (mock or live) with `Authorization: Bearer <email>`     |
| `src/lib/mock/server.ts`       | Mock backend; its toy judge settles on phrases written in quotes            |
| `src/lib/listener.tsx`         | Band to speech-to-text to `appendSegments`; settled banner and notification |
| `src/lib/band-audio.ts`        | The band's microphone as 24 kHz PCM for the OpenAI engine                   |
| `src/components/ListenBar.tsx` | Listen / Stop, consent, mic level, last line, test box                      |
| `src/lib/market.ts`            | YES / NO view of a contract `Market`, price history                         |
| `src/lib/portfolio.ts`         | Balance-over-time series for the portfolio graph                            |
| `src/lib/segments.ts`          | Sends final transcript lines in `seq` order, retries failures               |
| `src/lib/trade.ts`             | Quote then trade, shared by Buy and every Sell button                       |
| `src/vendor/vexo-open/`        | The kit's browser library, copied so Vercel can build it                    |
| `test/`                        | Contract round trip, segment queue, property tests (below)                  |

## Needs from the backend / contract

1. Speech-to-text follows the backend's `sttToken`: `openai` runs OpenAI Realtime
   transcription with `@vexbets/vexo/openai-stt` (the engine tested on the real band);
   `deepgram`, or a pasted Deepgram key, runs the kit's Deepgram link.
2. No endpoint returns the live transcript, so other tabs see transcript lines only in the
   proof after resolution. Live lines show in the Listen bar of the tab connected to the band.
3. The tagline and YES criteria should be written by the backend's reasoning model. The
   contract still requires both, so the dashboard sends the question for each for now.

## Verification: property tests

`npm test -w dashboard` runs fast-check property tests on the real code (each run draws new
random cases; failures shrink to the smallest example).

- `test/lmsr.properties.test.ts`: the contract's `lmsr.ts`, ~36,000 random markets and
  trades per run. Prices are probabilities summing to 1; rounded prices sum to 10,000 ± 1
  bp; buying moves the price the right way; a buy costs between the before and after
  price × shares; rounding favours the house; buy-then-sell never profits; trade paths
  cost the same in exact arithmetic; a full YES+NO set costs at least $1 a share; selling
  more than outstanding is refused; the house never loses more than `maxSubsidy(b)`.
- `test/accounting.properties.test.ts`: 400 random 3-player sessions (buys, sells, oversells,
  retries) through the contract client against the mock, checked against an independent
  model after every step: quotes match `lmsr.ts`, balances and positions match, money is
  conserved, retries never double-charge, payouts are exactly $1 per winning share either
  way it settles, the proof verifies. Also the dollar formatting and the portfolio graph.
  Planting a 1¢ bug in payouts or sells makes it fail with a 2 to 3 trade example.

Finding for the contract (low severity): `quoteTrade` rounds buys with `ceil(raw − 1e-9)`,
so once one side leads by about 25 × b shares (price < 1e-9) a buy, or each half of a split
order, can cost 0¢ (returned as `-0`). At b = 100 that lead costs about $2,470 to build and
yields a few free shares. Suggested fix in `contract/src/lmsr.ts`:
`credits = side === "buy" ? Math.max(1, Math.ceil(raw - eps)) : Math.max(0, Math.floor(-raw + eps))`.
