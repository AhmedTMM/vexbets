import type { z } from "zod";
import { Me } from "./common";
import { ApiErrorBody, ContractError } from "./errors";
import { ProofBundle } from "./evidence";
import {
  AppendSegmentsRequest,
  AppendSegmentsResponse,
  ListenSession,
  StartSessionRequest,
  SttToken,
  SttTokenRequest,
} from "./ingest";
import { CreateMarketRequest, ListMarketsQuery, ListMarketsResponse, Market } from "./markets";
import {
  ListPositionsResponse,
  ListTradesQuery,
  ListTradesResponse,
  Quote,
  QuoteRequest,
  TradeRequest,
  TradeResponse,
} from "./trading";

/**
 * Every HTTP endpoint between dashboard/ and backend/. All requests and responses are JSON.
 * Auth: `Authorization: Bearer <token>` on every call (user session for /markets and /me,
 * listener device token for /ingest). Errors use ApiErrorBody.
 */

type Method = "GET" | "POST";
type Schema = z.ZodType;

export interface Endpoint<
  P extends string = string,
  Q extends Schema | undefined = Schema | undefined,
  B extends Schema | undefined = Schema | undefined,
  R extends Schema = Schema,
> {
  method: Method;
  path: P;
  query: Q;
  body: B;
  response: R;
}

function endpoint<
  const P extends string,
  R extends Schema,
  Q extends Schema | undefined = undefined,
  B extends Schema | undefined = undefined,
>(e: { method: Method; path: P; response: R; query?: Q; body?: B }): Endpoint<P, Q, B, R> {
  return { method: e.method, path: e.path, response: e.response, query: e.query as Q, body: e.body as B };
}

export const endpoints = {
  // Markets
  listMarkets: endpoint({
    method: "GET",
    path: "/api/v1/markets",
    query: ListMarketsQuery,
    response: ListMarketsResponse,
  }),
  createMarket: endpoint({
    method: "POST",
    path: "/api/v1/markets",
    body: CreateMarketRequest,
    response: Market,
  }),
  getMarket: endpoint({ method: "GET", path: "/api/v1/markets/:marketId", response: Market }),

  // Trading
  quote: endpoint({
    method: "POST",
    path: "/api/v1/markets/:marketId/quote",
    body: QuoteRequest,
    response: Quote,
  }),
  trade: endpoint({
    method: "POST",
    path: "/api/v1/markets/:marketId/trades",
    body: TradeRequest,
    response: TradeResponse,
  }),
  listTrades: endpoint({
    method: "GET",
    path: "/api/v1/markets/:marketId/trades",
    query: ListTradesQuery,
    response: ListTradesResponse,
  }),

  // Proof of resolution
  getProof: endpoint({ method: "GET", path: "/api/v1/markets/:marketId/proof", response: ProofBundle }),

  // Me
  getMe: endpoint({ method: "GET", path: "/api/v1/me", response: Me }),
  listPositions: endpoint({ method: "GET", path: "/api/v1/me/positions", response: ListPositionsResponse }),

  // Ingest (listener tab -> backend)
  startSession: endpoint({
    method: "POST",
    path: "/api/v1/ingest/sessions",
    body: StartSessionRequest,
    response: ListenSession,
  }),
  appendSegments: endpoint({
    method: "POST",
    path: "/api/v1/ingest/sessions/:sessionId/segments",
    body: AppendSegmentsRequest,
    response: AppendSegmentsResponse,
  }),
  endSession: endpoint({
    method: "POST",
    path: "/api/v1/ingest/sessions/:sessionId/end",
    response: ListenSession,
  }),
  sttToken: endpoint({
    method: "POST",
    path: "/api/v1/ingest/stt-token",
    body: SttTokenRequest,
    response: SttToken,
  }),
} as const;

export type Endpoints = typeof endpoints;
export type EndpointName = keyof Endpoints;

type PathParam<P extends string> = P extends `${string}:${infer Name}/${infer Rest}`
  ? Name | PathParam<`/${Rest}`>
  : P extends `${string}:${infer Name}`
    ? Name
    : never;

export type CallArgs<E extends Endpoint> = ([PathParam<E["path"]>] extends [never]
  ? unknown
  : { params: Record<PathParam<E["path"]>, string> }) &
  ([E["query"]] extends [Schema] ? { query?: z.input<E["query"]> } : unknown) &
  ([E["body"]] extends [Schema] ? { body: z.input<E["body"]> } : unknown) & {
    headers?: Record<string, string>;
    signal?: AbortSignal;
  };

type ArgsTuple<E extends Endpoint> =
  Record<string, never> extends CallArgs<E> ? [args?: CallArgs<E>] : [args: CallArgs<E>];

export type ResponseOf<K extends EndpointName> = z.output<Endpoints[K]["response"]>;

/** Fill `:param` placeholders in an endpoint path. */
export function buildPath(path: string, params: Record<string, string> = {}): string {
  return path.replace(/:([A-Za-z]+)/g, (_, name: string) => {
    const value = params[name];
    if (value === undefined) throw new Error(`missing path param "${name}" for ${path}`);
    return encodeURIComponent(value);
  });
}

export interface ClientOptions {
  /** e.g. "https://vexbets-backend.vercel.app", or "" for same origin. */
  baseUrl: string;
  fetch?: typeof fetch;
  /** Called before every request, e.g. to add the Authorization header. */
  headers?: () => Record<string, string> | Promise<Record<string, string>>;
}

/** Typed client: validates the request before sending and the response after receiving. */
export function createClient(opts: ClientOptions) {
  const doFetch = opts.fetch ?? globalThis.fetch.bind(globalThis);

  return async function call<K extends EndpointName>(
    name: K,
    ...[args]: ArgsTuple<Endpoints[K]>
  ): Promise<ResponseOf<K>> {
    const ep: Endpoint = endpoints[name];
    const a = (args ?? {}) as {
      params?: Record<string, string>;
      query?: unknown;
      body?: unknown;
      headers?: Record<string, string>;
      signal?: AbortSignal;
    };

    let url = opts.baseUrl.replace(/\/$/, "") + buildPath(ep.path, a.params);
    if (ep.query && a.query !== undefined) {
      const q = ep.query.parse(a.query) as Record<string, unknown>;
      const search = new URLSearchParams();
      for (const [k, v] of Object.entries(q)) if (v !== undefined) search.set(k, String(v));
      const s = search.toString();
      if (s) url += `?${s}`;
    }

    const headers: Record<string, string> = {
      accept: "application/json",
      ...(await opts.headers?.()),
      ...a.headers,
    };
    let body: string | undefined;
    if (ep.body) {
      body = JSON.stringify(ep.body.parse(a.body));
      headers["content-type"] = "application/json";
    }

    const res = await doFetch(url, { method: ep.method, headers, body, signal: a.signal });
    const json: unknown = await res.json().catch(() => undefined);
    if (!res.ok) {
      const err = ApiErrorBody.safeParse(json);
      if (err.success) {
        throw new ContractError(
          err.data.error.code,
          err.data.error.message,
          res.status,
          err.data.error.details,
        );
      }
      throw new ContractError("internal", `HTTP ${res.status} from ${ep.method} ${ep.path}`, res.status);
    }
    return ep.response.parse(json) as ResponseOf<K>;
  };
}

export type Client = ReturnType<typeof createClient>;
