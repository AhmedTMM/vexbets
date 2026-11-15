import { ContractError, createClient } from "@vexbets/contract";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { health } from "../src/health";
import { createApi, emailFrom } from "../src/http";
import { type Backend, startBackend } from "./harness";

let b: Backend;
beforeAll(async () => {
  b = await startBackend();
});
afterAll(() => b.close());

describe("skeleton", () => {
  it("talks to the database", async () => {
    expect(await health(b.deps)).toEqual({ ok: true, time: "2026-11-14T20:00:00.000Z" });
  });

  it("answers unknown routes with a contract error", async () => {
    const res = await b.api.handle(new Request("http://backend.test/api/v1/nope"));
    expect(res.status).toBe(404);
    expect(await res.json()).toMatchObject({ error: { code: "not_found" } });
  });

  it("answers contract endpoints that are not built yet with not_found", async () => {
    const empty = createApi(b.deps, {});
    const call = createClient({ baseUrl: "http://backend.test", fetch: empty.fetch });
    await expect(call("getMe")).rejects.toMatchObject({ code: "not_found", status: 404 });
  });

  it("reads the caller's email from the bearer header", () => {
    const req = (auth?: string) =>
      new Request("http://x", auth ? { headers: { authorization: auth } } : undefined);
    expect(emailFrom(req("Bearer Sam@Example.com "))).toBe("sam@example.com");
    expect(emailFrom(req("Bearer Sam"))).toBe("sam");
    expect(emailFrom(req(`Bearer ${encodeURIComponent("Zoë 🎉")}`))).toBe("zoë 🎉");
    expect(() => emailFrom(req())).toThrow(ContractError);
    expect(() => emailFrom(req("Bearer   "))).toThrow(ContractError);
  });
});
