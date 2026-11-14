// A stand-in for the backend that answers the contract's endpoints inside the browser, so
// the dashboard can be built and demoed before backend/ is deployed. It follows the
// backend's rules where they are known (10,000 starting credits, trades newest first,
// retried segment batches skipped). Data lives in localStorage, shared by all tabs.
//
// The judge here is a toy: it settles a market when a phrase written in quotes in the
// criteria ("says 'my ex'") appears in the transcript. The real judge is Gemini.

import {
  AppendSegmentsRequest,
  ContractError,
  CreateMarketRequest,
  type Decision,
  type EndpointName,
  endpoints,
  GENESIS_HASH,
  hashSegment,
  type ListenSession,
  lmsr,
  type Market,
  type Payout,
  type Position,
  QuoteRequest,
  SHARE_PAYOUT,
  StartSessionRequest,
  type Trade,
  TradeRequest,
  type TranscriptSegment,
  type UserSummary,
} from "@vexbets/contract";
import type { z } from "zod";

const STORE = "vexbets.mock.v1";
const STARTING_BALANCE = 10_000;

interface UserRow extends UserSummary {
  email: string;
  balance: number;
}
interface PositionRow extends Position {
  userId: string;
}
type TradeResponse = { trade: Trade; balance: number; position: Position };
interface State {
  users: UserRow[];
  markets: Market[];
  trades: Trade[];
  positions: PositionRow[];
  sessions: ListenSession[];
  segments: TranscriptSegment[];
  idempotency: Record<string, TradeResponse>;
}

const uuid = () => crypto.randomUUID();
const nowIso = () => new Date().toISOString();

function load(): State {
  try {
    const raw = localStorage.getItem(STORE);
    if (raw) return JSON.parse(raw) as State;
  } catch {
    /* start fresh */
  }
  return { users: [], markets: [], trades: [], positions: [], sessions: [], segments: [], idempotency: {} };
}

function save(s: State): void {
  try {
    localStorage.setItem(STORE, JSON.stringify(s));
  } catch {
    /* full or blocked */
  }
}

export function resetMock(): void {
  localStorage.removeItem(STORE);
}

// ---------------------------------------------------------------- helpers

function userFor(s: State, email: string): UserRow {
  const found = s.users.find((u) => u.email === email);
  if (found) return found;
  let handle = (email.split("@")[0] ?? "")
    .toLowerCase()
    .replace(/[^a-z0-9_]/g, "_")
    .slice(0, 19);
  if (handle.length < 2) handle = `user_${handle}`;
  if (s.users.some((u) => u.handle === handle))
    handle = `${handle}_${Math.floor(1000 + Math.random() * 9000)}`;
  const u: UserRow = {
    id: uuid(),
    email,
    handle,
    displayName: email.split("@")[0] || email,
    balance: STARTING_BALANCE,
  };
  s.users.push(u);
  return u;
}

const summary = (u: UserRow): UserSummary => ({ id: u.id, handle: u.handle, displayName: u.displayName });

function marketOr404(s: State, id: string): Market {
  const m = s.markets.find((x) => x.id === id);
  if (!m) throw new ContractError("not_found", "no such market");
  return m;
}

function positionRow(s: State, userId: string, marketId: string, outcomeId: string): PositionRow {
  let p = s.positions.find(
    (x) => x.userId === userId && x.marketId === marketId && x.outcomeId === outcomeId,
  );
  if (!p) {
    p = { userId, marketId, outcomeId, shares: 0, costBasis: 0 };
    s.positions.push(p);
  }
  return p;
}

const strip = ({ userId: _u, ...p }: PositionRow): Position => p;

function quoteFor(m: Market, body: z.output<typeof QuoteRequest>) {
  if (m.status !== "open" || Date.now() >= Date.parse(m.closesAt)) {
    throw new ContractError("market_closed", "this market is not taking trades");
  }
  const i = m.outcomes.findIndex((o) => o.id === body.outcomeId);
  if (i < 0) throw new ContractError("bad_request", "unknown outcome");
  try {
    const q = lmsr.quoteTrade(
      m.outcomes.map((o) => o.shares),
      m.liquidityB,
      i,
      body.side,
      body.shares,
    );
    return { i, q };
  } catch (e) {
    throw new ContractError("insufficient_shares", (e as Error).message);
  }
}

// ---------------------------------------------------------------- toy judge

/** Phrases in quotes: "my ex", 'no cap', ‘lol’. Apostrophes inside words are not quotes. */
export function quotedPhrases(text: string): string[] {
  const out: string[] = [];
  const re = /"([^"]{2,80})"|“([^”]{2,80})”|(?:^|[\s(])['‘]([^'’\n]{2,80})['’](?=$|[\s.,;:!?)])/g;
  for (const m of text.matchAll(re)) {
    const phrase = (m[1] ?? m[2] ?? m[3] ?? "").trim().toLowerCase();
    if (phrase) out.push(phrase);
  }
  return out;
}

function windowSegments(s: State, m: Market): TranscriptSegment[] {
  const opens = Date.parse(m.opensAt);
  const closes = Date.parse(m.closesAt);
  const sessions = new Set(s.sessions.filter((x) => x.bandNumber === m.bandNumber).map((x) => x.id));
  return s.segments.filter((g) => sessions.has(g.sessionId) && g.startMs >= opens && g.endMs <= closes);
}

function latestHead(s: State, m: Market): string {
  const sessions = s.sessions
    .filter((x) => x.bandNumber === m.bandNumber && x.segmentCount > 0)
    .sort((a, b) => a.startedAt.localeCompare(b.startedAt));
  return sessions.at(-1)?.headHash ?? GENESIS_HASH;
}

function resolve(s: State, m: Market, decision: Decision, outcomeId: string, via: "evidence" | "fallback") {
  const payouts: Payout[] = [];
  for (const p of s.positions.filter(
    (x) => x.marketId === m.id && x.outcomeId === outcomeId && x.shares > 0,
  )) {
    const credits = p.shares * SHARE_PAYOUT;
    payouts.push({ userId: p.userId, shares: p.shares, credits });
    const u = s.users.find((x) => x.id === p.userId);
    if (u) u.balance += credits;
  }
  m.status = "resolved";
  m.resolution = { marketId: m.id, outcomeId, via, decision, payouts, resolvedAt: nowIso() };
}

function judge(s: State): void {
  const now = Date.now();
  for (const m of s.markets) {
    if (m.status !== "open") continue;
    const closed = now >= Date.parse(m.closesAt);
    if (!closed && !m.resolveEarly) continue;

    const segs = windowSegments(s, m);
    const others = m.outcomes.filter((o) => o.id !== m.fallbackOutcomeId);
    let found: { outcomeId: string; seg: TranscriptSegment; phrase: string } | null = null;
    for (const o of others) {
      let phrases = quotedPhrases(o.criteria ?? "");
      if (phrases.length === 0 && others.length === 1) phrases = quotedPhrases(`${m.criteria} ${m.question}`);
      for (const seg of segs) {
        const phrase = phrases.find((p) => seg.text.toLowerCase().includes(p));
        if (phrase) {
          found = { outcomeId: o.id, seg, phrase };
          break;
        }
      }
      if (found) break;
    }

    if (found) {
      const session = s.sessions.find((x) => x.id === found.seg.sessionId);
      const outcome = m.outcomes.find((o) => o.id === found.outcomeId);
      resolve(
        s,
        m,
        {
          status: "decided",
          marketId: m.id,
          model: "mock-judge",
          confidence: 0.9,
          rationale: `The transcript contains "${found.phrase}", which the criteria for "${outcome?.label}" ask for.`,
          headHash: session?.headHash ?? found.seg.hash,
          decidedAt: nowIso(),
          outcomeId: found.outcomeId,
          evidence: [{ segmentId: found.seg.id, quote: found.phrase }],
        },
        found.outcomeId,
        "evidence",
      );
    } else if (closed) {
      resolve(
        s,
        m,
        {
          status: "undetermined",
          marketId: m.id,
          model: "mock-judge",
          confidence: 0.5,
          rationale: "Nothing decisive was heard before the window closed.",
          headHash: latestHead(s, m),
          decidedAt: nowIso(),
          outcomeId: null,
          evidence: [],
        },
        m.fallbackOutcomeId,
        "fallback",
      );
    }
  }
}

// ---------------------------------------------------------------- endpoints

interface Ctx {
  s: State;
  email: () => string;
  params: Record<string, string>;
  query: URLSearchParams;
  body: unknown;
}

const handlers: Partial<Record<EndpointName, (c: Ctx) => unknown | Promise<unknown>>> = {
  getMe({ s, email }) {
    const u = userFor(s, email());
    return { ...summary(u), balance: u.balance };
  },

  listMarkets({ s, query }) {
    const status = query.get("status");
    const markets = s.markets
      .filter((m) => !status || m.status === status)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    return { markets, nextCursor: null };
  },

  getMarket({ s, params }) {
    return marketOr404(s, params.marketId ?? "");
  },

  createMarket({ s, email, body }) {
    const u = userFor(s, email());
    const r = CreateMarketRequest.parse(body);
    const ids = r.outcomes.map(() => uuid());
    const even = lmsr.pricesBps(
      r.outcomes.map(() => 0),
      r.liquidityB,
    );
    const m: Market = {
      id: uuid(),
      creator: summary(u),
      question: r.question,
      tagline: r.tagline,
      criteria: r.criteria,
      outcomes: r.outcomes.map((o, i) => ({
        id: ids[i] as string,
        label: o.label,
        criteria: o.criteria ?? null,
        shares: 0,
        priceBps: even[i] ?? 0,
      })),
      fallbackOutcomeId: ids[r.fallbackOutcomeIndex] as string,
      resolveEarly: r.resolveEarly,
      bandNumber: r.bandNumber,
      subjectName: r.subjectName,
      opensAt: r.opensAt ?? nowIso(),
      closesAt: new Date(r.closesAt).toISOString(),
      liquidityB: r.liquidityB,
      status: "open",
      volumeCredits: 0,
      createdAt: nowIso(),
      resolution: null,
    };
    s.markets.push(m);
    return m;
  },

  quote({ s, params, body }) {
    const m = marketOr404(s, params.marketId ?? "");
    const r = QuoteRequest.parse(body);
    const { q } = quoteFor(m, r);
    return {
      ...r,
      credits: q.credits,
      avgPriceBps: q.avgPriceBps,
      priceBeforeBps: q.priceBeforeBps,
      priceAfterBps: q.priceAfterBps,
    };
  },

  trade({ s, email, params, body }) {
    const u = userFor(s, email());
    const r = TradeRequest.parse(body);
    const done = s.idempotency[r.idempotencyKey];
    if (done) return done;
    const m = marketOr404(s, params.marketId ?? "");
    const { i, q } = quoteFor(m, r);
    const pos = positionRow(s, u.id, m.id, r.outcomeId);

    if (r.side === "buy") {
      if (q.credits > r.limitCredits) {
        throw new ContractError("price_moved", `costs ${q.credits} now, limit was ${r.limitCredits}`);
      }
      if (u.balance < q.credits) throw new ContractError("insufficient_balance", "not enough credits");
      u.balance -= q.credits;
      pos.shares += r.shares;
      pos.costBasis += q.credits;
    } else {
      if (pos.shares < r.shares) throw new ContractError("insufficient_shares", "you do not hold that many");
      if (q.credits < r.limitCredits) {
        throw new ContractError("price_moved", `pays ${q.credits} now, limit was ${r.limitCredits}`);
      }
      u.balance += q.credits;
      pos.shares -= r.shares;
      pos.costBasis -= q.credits;
    }
    m.outcomes.forEach((o, k) => {
      o.shares = q.after[k] ?? o.shares;
      o.priceBps = q.priceAfterBps[k] ?? o.priceBps;
    });
    void i;
    m.volumeCredits += q.credits;
    const trade: Trade = {
      id: uuid(),
      marketId: m.id,
      user: summary(u),
      outcomeId: r.outcomeId,
      side: r.side,
      shares: r.shares,
      credits: q.credits,
      priceAfterBps: q.priceAfterBps,
      createdAt: nowIso(),
    };
    s.trades.push(trade);
    const res: TradeResponse = { trade, balance: u.balance, position: strip(pos) };
    s.idempotency[r.idempotencyKey] = res;
    return res;
  },

  listTrades({ s, params }) {
    const trades = s.trades
      .filter((t) => t.marketId === params.marketId)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    return { trades, nextCursor: null };
  },

  listPositions({ s, email }) {
    const u = userFor(s, email());
    return { positions: s.positions.filter((p) => p.userId === u.id).map(strip) };
  },

  getProof({ s, params }) {
    const m = marketOr404(s, params.marketId ?? "");
    const opens = Date.parse(m.opensAt);
    const closes = Date.parse(m.closesAt);
    const sessions = new Set(
      s.sessions
        .filter(
          (x) =>
            x.bandNumber === m.bandNumber &&
            Date.parse(x.startedAt) <= closes &&
            (!x.endedAt || Date.parse(x.endedAt) >= opens),
        )
        .map((x) => x.id),
    );
    return { market: m, segments: s.segments.filter((g) => sessions.has(g.sessionId)) };
  },

  startSession({ s, email, body }) {
    userFor(s, email());
    const r = StartSessionRequest.parse(body);
    const session: ListenSession = {
      id: uuid(),
      bandNumber: r.bandNumber,
      subjectName: r.subjectName,
      startedAt: nowIso(),
      endedAt: null,
      segmentCount: 0,
      headHash: GENESIS_HASH,
    };
    s.sessions.push(session);
    return session;
  },

  async appendSegments({ s, email, params, body }) {
    email();
    const session = s.sessions.find((x) => x.id === params.sessionId);
    if (!session) throw new ContractError("not_found", "no such session");
    if (session.endedAt) throw new ContractError("conflict", "this session has ended");
    const r = AppendSegmentsRequest.parse(body);
    let accepted = 0;
    for (const seg of [...r.segments].sort((a, b) => a.seq - b.seq)) {
      if (seg.seq < session.segmentCount) {
        const stored = s.segments.find((g) => g.sessionId === session.id && g.seq === seg.seq);
        if (stored?.text === seg.text && stored.startMs === seg.startMs) continue; // a retry
        throw new ContractError(
          "segment_out_of_order",
          `seq ${seg.seq} was already accepted with other content`,
        );
      }
      if (seg.seq !== session.segmentCount) {
        throw new ContractError(
          "segment_out_of_order",
          `expected seq ${session.segmentCount}, got ${seg.seq}`,
        );
      }
      const prevHash = session.headHash;
      const hash = await hashSegment({ ...seg, sessionId: session.id }, prevHash);
      s.segments.push({ id: uuid(), sessionId: session.id, ...seg, prevHash, hash });
      session.headHash = hash;
      session.segmentCount += 1;
      accepted += 1;
    }
    return { accepted, segmentCount: session.segmentCount, headHash: session.headHash };
  },

  endSession({ s, email, params }) {
    email();
    const session = s.sessions.find((x) => x.id === params.sessionId);
    if (!session) throw new ContractError("not_found", "no such session");
    session.endedAt ??= nowIso();
    return session;
  },

  sttToken({ s, email, body }) {
    email();
    const id = (body as { sessionId?: string }).sessionId;
    if (!s.sessions.some((x) => x.id === id)) throw new ContractError("not_found", "no such session");
    // No speech-to-text provider in mock mode: /listen asks for a key or typed lines.
    return { provider: "none", token: "mock", expiresAt: new Date(Date.now() + 60_000).toISOString() };
  },
};

// ---------------------------------------------------------------- fetch

const routes = (Object.keys(endpoints) as EndpointName[]).map((name) => {
  const ep = endpoints[name];
  const keys: string[] = [];
  const pattern = ep.path.replace(/:([A-Za-z]+)/g, (_, k: string) => {
    keys.push(k);
    return "([^/]+)";
  });
  return { name, method: ep.method, re: new RegExp(`^${pattern}$`), keys };
});

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

/** Drop-in `fetch` for createClient: answers /api/v1/* from localStorage. */
export async function mockFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  const url = new URL(typeof input === "string" ? input : input.toString(), "http://mock.local");
  const method = (init?.method ?? "GET").toUpperCase();
  const route = routes.find((r) => r.method === method && r.re.test(url.pathname));
  if (!route) return json(404, new ContractError("not_found", `no route ${method} ${url.pathname}`).toBody());
  const handler = handlers[route.name];
  if (!handler) return json(500, new ContractError("internal", `${route.name} not in the mock`).toBody());

  const match = url.pathname.match(route.re) ?? [];
  const params: Record<string, string> = {};
  route.keys.forEach((k, i) => {
    params[k] = decodeURIComponent(match[i + 1] ?? "");
  });
  const headers = new Headers(init?.headers);
  const auth = (headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "").trim();

  // Feels like a network call, and lets the UI show its busy states.
  if (process.env.NODE_ENV !== "test") await new Promise((r) => setTimeout(r, 120));

  const s = load();
  try {
    judge(s);
    const result = await handler({
      s,
      params,
      query: url.searchParams,
      body: init?.body ? JSON.parse(String(init.body)) : undefined,
      email: () => {
        if (!auth.includes("@"))
          throw new ContractError("unauthorized", "send Authorization: Bearer <your email>");
        return auth.toLowerCase();
      },
    });
    judge(s);
    save(s);
    return json(200, result);
  } catch (e) {
    const err =
      e instanceof ContractError
        ? e
        : e instanceof Error && e.name === "ZodError"
          ? new ContractError("bad_request", "invalid request", 400, (e as { issues?: unknown }).issues)
          : new ContractError("internal", (e as Error).message ?? "error");
    return json(err.status, err.toBody());
  }
}
