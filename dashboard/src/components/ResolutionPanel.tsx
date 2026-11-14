"use client";

import { type Market, type ProofResult, type TranscriptSegment, verifyProof } from "@vexbets/contract";
import { useState } from "react";
import { api } from "@/lib/api";
import { clock, credits, errorText } from "@/lib/format";
import type { YesNo } from "@/lib/market";

/** Why the market settled: the judge's verdict, the quoted lines, and a proof anyone can re-check. */
export function ResolutionPanel({ market, yn, meId }: { market: Market; yn: YesNo; meId: string }) {
  const r = market.resolution;
  const [segments, setSegments] = useState<TranscriptSegment[] | null>(null);
  const [check, setCheck] = useState<ProofResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  if (!r) return null;

  const yes = r.outcomeId === yn.yes.id;
  const mine = r.payouts.find((p) => p.userId === meId);

  const verify = async () => {
    setBusy(true);
    setErr("");
    try {
      const bundle = await api("getProof", { params: { marketId: market.id } });
      setSegments(bundle.segments);
      setCheck(await verifyProof(bundle));
    } catch (e) {
      setErr(errorText(e));
    } finally {
      setBusy(false);
    }
  };

  const quoted = new Set(r.decision.evidence.map((e) => e.segmentId));

  return (
    <div
      className={`rounded-[14px] border p-4 ${yes ? "border-yes/30 bg-yes/[0.07]" : "border-no/30 bg-no/[0.07]"}`}
    >
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <div className="text-lg font-semibold">
          Settled {yes ? "YES" : "NO"}{" "}
          <span className="text-sm font-normal text-muted">
            at {clock(r.resolvedAt)} ·{" "}
            {r.via === "evidence" ? "the judge found proof" : "nothing heard before close"}
          </span>
        </div>
        {mine && <div className="num text-yes">You were paid {credits(mine.credits)}</div>}
      </div>
      <p className="mt-2 text-sm text-ink">{r.decision.rationale}</p>
      {r.decision.evidence.length > 0 && (
        <ul className="mt-3 space-y-1">
          {r.decision.evidence.map((e) => (
            <li key={`${e.segmentId}-${e.quote}`} className="border-l-2 border-mock/60 pl-3 text-sm italic">
              “{e.quote}”
            </li>
          ))}
        </ul>
      )}
      <div className="mt-2 text-xs text-muted">
        Judge: {r.decision.model} · confidence {Math.round(r.decision.confidence * 100)}%
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={verify}
          disabled={busy}
          className="rounded-lg border border-line-strong px-3 py-1.5 text-sm hover:bg-raised disabled:opacity-50"
        >
          {busy ? "Checking…" : "Verify proof"}
        </button>
        {check?.ok && <span className="text-sm text-yes">✓ Transcript chain and quotes check out</span>}
        {check && !check.ok && <span className="text-sm text-no">✗ {check.problems.join("; ")}</span>}
        {err && <span className="text-sm text-no">{err}</span>}
      </div>

      {segments && segments.length > 0 && (
        <div className="mt-3 max-h-56 space-y-1 overflow-y-auto rounded-lg bg-bg p-3 text-sm">
          {[...segments]
            .sort((a, b) => a.startMs - b.startMs)
            .map((s) => (
              <p key={s.id} className={quoted.has(s.id) ? "rounded bg-mock/15 px-1 text-ink" : "text-muted"}>
                <span className="mr-2 num text-xs text-muted">{clock(s.startMs)}</span>
                {s.text}
              </p>
            ))}
        </div>
      )}
    </div>
  );
}
