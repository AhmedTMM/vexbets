import {
  ContractError,
  type EndpointName,
  type Endpoints,
  endpoints,
  Id,
  type ResponseOf,
} from "@vexbets/contract";
import type { z } from "zod";
import type { Deps } from "./deps";

/**
 * One router for every contract endpoint. Next.js calls it from app/api/v1/[...path], and
 * tests call it directly by handing `api.fetch` to the contract's createClient, so tests go
 * through exactly the same parsing, auth and error handling as production.
 */

type Input<S> = S extends z.ZodType ? z.output<S> : undefined;

export interface Ctx<K extends EndpointName> {
  deps: Deps;
  req: Request;
  params: Record<string, string>;
  query: Input<Endpoints[K]["query"]>;
  body: Input<Endpoints[K]["body"]>;
  /** The caller's email from `Authorization: Bearer <email>`, or a 401. */
  email(): string;
}

export type Handler<K extends EndpointName> = (ctx: Ctx<K>) => Promise<ResponseOf<K>>;
export type Handlers = { [K in EndpointName]?: Handler<K> };

interface Route {
  name: EndpointName;
  method: string;
  pattern: RegExp;
  keys: string[];
}

const routes: Route[] = (Object.keys(endpoints) as EndpointName[]).map((name) => {
  const ep = endpoints[name];
  const keys: string[] = [];
  const pattern = new RegExp(
    `^${ep.path.replace(/:([A-Za-z]+)/g, (_, k: string) => {
      keys.push(k);
      return "([^/]+)";
    })}/?$`,
  );
  return { name, method: ep.method, pattern, keys };
});

export function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function errorResponse(err: ContractError): Response {
  return json(err.toBody(), err.status);
}

/**
 * Who is calling: `Authorization: Bearer <name>`, URL-encoded (so any name fits in a
 * header). No password, no format check: a demo with play money. Same name, same account.
 */
export function emailFrom(req: Request): string {
  const raw = (req.headers.get("authorization") ?? "").replace(/^Bearer(\s+|$)/i, "").trim();
  let name = raw;
  try {
    name = decodeURIComponent(raw);
  } catch {}
  name = name.trim().toLowerCase().slice(0, 64);
  if (!name) throw new ContractError("unauthorized", "send Authorization: Bearer <your name>");
  return name;
}

export function createApi(deps: Deps, handlers: Handlers) {
  async function handle(req: Request): Promise<Response> {
    const url = new URL(req.url);
    try {
      let methodMismatch = false;
      for (const route of routes) {
        const m = route.pattern.exec(url.pathname);
        if (!m) continue;
        if (route.method !== req.method) {
          methodMismatch = true;
          continue;
        }
        const handler = handlers[route.name] as Handler<EndpointName> | undefined;
        if (!handler) throw new ContractError("not_found", `${route.name} is not implemented yet`);

        const ep = endpoints[route.name];
        const params = Object.fromEntries(route.keys.map((k, i) => [k, decodeURIComponent(m[i + 1] ?? "")]));
        for (const [k, v] of Object.entries(params)) {
          if (k.endsWith("Id") && !Id.safeParse(v).success)
            throw new ContractError("not_found", `no such ${k}`);
        }

        let query: unknown;
        if (ep.query) {
          const parsed = ep.query.safeParse(Object.fromEntries(url.searchParams));
          if (!parsed.success)
            throw new ContractError("bad_request", "invalid query", 400, parsed.error.issues);
          query = parsed.data;
        }

        let body: unknown;
        if (ep.body) {
          const raw: unknown = await req.json().catch(() => {
            throw new ContractError("bad_request", "body must be JSON");
          });
          const parsed = ep.body.safeParse(raw);
          if (!parsed.success)
            throw new ContractError("bad_request", "invalid body", 400, parsed.error.issues);
          body = parsed.data;
        }

        const result = await handler({
          deps,
          req,
          params,
          query: query as never,
          body: body as never,
          email: () => emailFrom(req),
        });
        // Our own responses go through the contract too: drift fails loudly in tests.
        return json(ep.response.parse(result));
      }
      if (methodMismatch) throw new ContractError("bad_request", `method ${req.method} not allowed`, 405);
      throw new ContractError("not_found", `no route for ${req.method} ${url.pathname}`);
    } catch (err) {
      if (err instanceof ContractError) return errorResponse(err);
      deps.log.error(err);
      return errorResponse(new ContractError("internal", "internal error"));
    }
  }

  return {
    handle,
    /** A fetch function for createClient({ baseUrl: "http://test", fetch: api.fetch }). */
    fetch: ((input: RequestInfo | URL, init?: RequestInit) =>
      handle(new Request(input, init))) as typeof fetch,
  };
}

export type Api = ReturnType<typeof createApi>;
