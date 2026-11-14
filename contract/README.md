# @vexbets/contract

The one source of truth between `dashboard/` and `backend/`. Both import it:

```ts
import { createClient, CreateMarketRequest, lmsr, verifyProof } from "@vexbets/contract";
```

Change the contract first, then the code on both sides. CI fails if either side drifts.

## How a market flows

```
dashboard                         backend (Vercel + Postgres)                 judge
─────────                         ───────────────────────────                 ─────
createMarket  ──────────────────▶ store market, seed LMSR (liquidityB)
quote / trade ──────────────────▶ price with lmsr.ts, write trade, move balance
                                                                               
listener tab (band connected over Web Bluetooth)
  startSession (consent: true) ─▶ open a ListenSession for the band
  sttToken ─────────────────────▶ short-lived STT token (real key stays on server)
  audio ──▶ STT provider ──▶ final text
  appendSegments ───────────────▶ hash-chain each segment, store  ──────────▶ Gemini reads the
                                                                               window's transcript,
                                  Resolution + payouts ◀── JudgeOutput ─────  returns verdict +
getProof ◀──────────────────────  market + every segment in the window         quoted evidence
verifyProof(bundle)  (anyone can re-check the chain and the quotes)
```

## Files

| File            | What it defines                                                                                        |
| --------------- | ------------------------------------------------------------------------------------------------------ |
| `common.ts`     | Ids, timestamps, credits, basis points, band number, `Me`                                              |
| `markets.ts`    | `Market`, `Outcome`, `CreateMarketRequest` (question, tagline, success criteria, outcomes, fallback)   |
| `trading.ts`    | `QuoteRequest`, `Quote`, `TradeRequest` (with slippage limit and idempotency key), `Trade`, `Position` |
| `lmsr.ts`       | Pricing math shared by both sides. One winning share pays `SHARE_PAYOUT` = 100 credits                 |
| `ingest.ts`     | Listener sessions, transcript segments, STT token                                                      |
| `resolution.ts` | `JudgeOutput` (the model's response schema), `Decision`, `Resolution`, `Payout`                        |
| `evidence.ts`   | `hashSegment`, `ProofBundle`, `verifyProof`                                                            |
| `errors.ts`     | Error codes, HTTP statuses, `ContractError`                                                            |
| `api.ts`        | Every endpoint (method, path, schemas) and the typed `createClient`                                    |

## Rules both sides keep

- Credits are play money and always integers. Buys round up, sells round down.
- Transcript times are epoch ms, so hashes never depend on how Postgres formats a date.
  Store `text`, `speaker`, `startMs`, `endMs` exactly as received.
- Only **final** STT segments are ingested, in `seq` order with no gaps
  (`segment_out_of_order` otherwise).
- The judge only sees segments inside `[opensAt, closesAt]` for the market's band.
  No decisive proof by `closesAt` → the `fallbackOutcomeId` wins (`via: "fallback"`).
- A listening session needs `consentConfirmed: true`. The band's light is solid blue while
  the microphone is on.
