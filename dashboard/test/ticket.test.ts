import { lmsr } from "@vexbets/contract";
import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { buyCost, cleanDollars, dollarsToCredits, sharesForBudget } from "@/lib/ticket";

describe("sharesForBudget", () => {
  const q = [0, 0];
  const b = 30;

  it("is exact at the boundary", () => {
    for (const n of [1, 2, 7, 12, 50, 333]) {
      const c = buyCost(q, b, 0, n);
      expect(sharesForBudget(q, b, 0, c)).toBe(n);
      expect(sharesForBudget(q, b, 0, c - 1)).toBe(n - 1);
    }
  });

  it("is 0 when the budget is too small for one share", () => {
    const one = buyCost(q, b, 0, 1);
    expect(sharesForBudget(q, b, 0, one - 1)).toBe(0);
    expect(sharesForBudget(q, b, 0, 0)).toBe(0);
    expect(sharesForBudget(q, b, 0, -5)).toBe(0);
  });

  it("caps at max", () => {
    expect(sharesForBudget(q, b, 0, 1e12, 1000)).toBe(1000);
  });

  it("is the largest affordable count for random markets", () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: 400 }),
        fc.integer({ min: 0, max: 400 }),
        fc.integer({ min: 5, max: 200 }),
        fc.integer({ min: 0, max: 1 }),
        fc.integer({ min: 0, max: 50_000 }),
        (y, n, bb, i, budget) => {
          const qq = [y, n];
          const s = sharesForBudget(qq, bb, i, budget);
          if (s > 0) expect(lmsr.quoteTrade(qq, bb, i, "buy", s).credits).toBeLessThanOrEqual(budget);
          expect(lmsr.quoteTrade(qq, bb, i, "buy", s + 1).credits).toBeGreaterThan(budget);
        },
      ),
    );
  });
});

describe("dollar text", () => {
  it("parses to whole credits", () => {
    expect(dollarsToCredits("8.40")).toBe(840);
    expect(dollarsToCredits("$8.4")).toBe(840);
    expect(dollarsToCredits("12")).toBe(1200);
    expect(dollarsToCredits(".05")).toBe(5);
    expect(dollarsToCredits("1.999")).toBe(199);
    expect(dollarsToCredits("")).toBe(0);
    expect(dollarsToCredits(".")).toBe(0);
    expect(dollarsToCredits("abc")).toBe(0);
  });

  it("cleans input", () => {
    expect(cleanDollars("$1a2.3.45")).toBe("12.34");
    expect(cleanDollars("5.")).toBe("5.");
  });
});
