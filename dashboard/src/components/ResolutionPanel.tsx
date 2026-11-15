"use client";

import { Button } from "@heroui/react";
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
    <section aria-label="Resolution" className="border-line border-t pt-6">
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <h2 className="headline text-[26px]">
          Settled <span className={yes ? "text-yes" : "text-no"}>{yes ? "YES" : "NO"}</span>
        </h2>
        {mine && <div className="num font-semibold text-yes">You were paid {credits(mine.credits)}</div>}
      </div>
      <p className="meta mt-1">
        {clock(r.resolvedAt)} ·{" "}
        {r.via === "evidence" ? "the judge found proof" : "nothing heard before close"} · {r.decision.model} ·
        confidence {Math.round(r.decision.confidence * 100)}%
      </p>
      <p className="mt-3 text-[15px] text-ink leading-relaxed">{r.decision.rationale}</p>
      {r.decision.evidence.length > 0 && (
        <ul className="mt-3 space-y-1.5">
          {r.decision.evidence.map((e) => (
            <li
              key={`${e.segmentId}-${e.quote}`}
              className="border-yes/60 border-l-2 pl-3 text-[15px] text-ink italic"
            >
              “{e.quote}”
            </li>
          ))}
        </ul>
      )}

      <div className="mt-4 flex flex-wrap items-center gap-3">
        <Button
          size="sm"
          variant="outline"
          className="rounded-full"
          isPending={busy}
          onPress={() => void verify()}
        >
          {busy ? "Checking…" : "Verify proof"}
        </Button>
        {check?.ok && <span className="text-sm text-yes">✓ Transcript chain and quotes check out</span>}
        {check && !check.ok && <span className="text-sm text-no">✗ {check.problems.join("; ")}</span>}
        {err && <span className="text-sm text-no">{err}</span>}
      </div>

      {segments && segments.length > 0 && (
        <div className="scroll-y mt-4 max-h-56 space-y-1 border-line border-y py-3 text-sm">
          {[...segments]
            .sort((a, b) => a.startMs - b.startMs)
            .map((s) => (
              <p
                key={s.id}
                className={quoted.has(s.id) ? "rounded bg-yes/10 px-1 text-ink" : "px-1 text-muted"}
              >
                <span className="num mr-2 text-muted text-xs">{clock(s.startMs)}</span>
                {s.text}
              </p>
            ))}
        </div>
      )}
    </section>
  );
}
