"use client";

import {
  Area,
  AreaChart,
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { PricePoint } from "@/lib/market";
import { resampleSeries } from "@/lib/series";

const YES = "#00d394";
const NO = "#ff4f6a";
const AXIS = "#6b727a";
const GRID = "#2f343a";

interface DotProps {
  cx?: number;
  cy?: number;
  index?: number;
}

/** A filled dot (with a soft halo) on the last point of a line. */
function renderEnd({ cx, cy, index }: DotProps, lastIndex: number, color: string, key: string) {
  const k = `end-${key}-${index}`;
  if (index !== lastIndex || cx === undefined || cy === undefined) return <g key={k} />;
  return (
    <g key={k}>
      <circle cx={cx} cy={cy} r={7} fill={color} opacity={0.18} />
      <circle cx={cx} cy={cy} r={3.5} fill={color} />
    </g>
  );
}

const MIN = 60_000;
const HOUR = 60 * MIN;
const DAY = 24 * HOUR;
const STEPS = [
  10_000,
  15_000,
  30_000,
  MIN,
  2 * MIN,
  5 * MIN,
  10 * MIN,
  15 * MIN,
  30 * MIN,
  HOUR,
  2 * HOUR,
  3 * HOUR,
  6 * HOUR,
  12 * HOUR,
  DAY,
  2 * DAY,
  7 * DAY,
];

/** Round-clock ticks (every 5m, 1h, 1d...) inside [from, to], about `want` of them. */
function timeTicks(from: number, to: number, want: number): { ticks: number[]; step: number } {
  const span = Math.max(to - from, 1);
  const step = STEPS.find((s) => span / s <= want) ?? (STEPS.at(-1) as number);
  // Align to local time so hour ticks land on the hour.
  const offset = new Date(from).getTimezoneOffset() * MIN;
  const ticks: number[] = [];
  for (let t = Math.ceil((from - offset) / step) * step + offset; t <= to; t += step) ticks.push(t);
  return { ticks, step };
}

/** "2:05pm", "2:05:30pm" for sub-minute steps, or "Nov 14" for day steps. */
function tickLabel(t: number, step: number): string {
  const d = new Date(t);
  if (step >= DAY) return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
  const s = d
    .toLocaleTimeString("en-US", {
      hour: "numeric",
      minute: "2-digit",
      second: step < MIN ? "2-digit" : undefined,
    })
    .replace(/\s/g, "")
    .toLowerCase();
  return s;
}

interface TipProps {
  active?: boolean;
  label?: number;
  payload?: { dataKey?: string; value?: number }[];
}

function Tip({ active, label, payload }: TipProps) {
  if (!active || !payload?.length || label === undefined) return null;
  const v = (k: string) => Math.round(payload.find((p) => p.dataKey === k)?.value ?? 0);
  const d = new Date(label);
  return (
    <div className="rounded-lg bg-raised/95 px-2.5 py-1.5 text-xs shadow-lg">
      <div className="meta text-[11px]!">
        {d.toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}
      </div>
      <div className="num mt-0.5 flex gap-3 font-semibold">
        <span className="text-yes">Yes {v("yes")}%</span>
        <span className="text-no">No {v("no")}%</span>
      </div>
    </div>
  );
}

/**
 * YES and NO chance over time as two thin lines, a dotted grid every 25%, the % axis on
 * the right and a filled dot where each line ends. No box: it sits on the page.
 */
export function PriceChart({
  points,
  height = 280,
}: {
  points: PricePoint[];
  /** Pixels, or "100%" to fill a parent with a (responsive) height. */
  height?: number | `${number}%`;
}) {
  // Drawn on an even grid so a few trades still make a full, hoverable line.
  const dense = resampleSeries(points, 120);
  const last = dense.length - 1;
  const from = dense[0]?.t ?? 0;
  const to = dense[last]?.t ?? 0;
  const { ticks, step } = timeTicks(from, to, 5);

  return (
    <ResponsiveContainer width="100%" height={height}>
      <LineChart data={dense} margin={{ top: 10, right: 0, bottom: 0, left: 0 }}>
        <CartesianGrid stroke={GRID} strokeDasharray="1 5" strokeLinecap="round" vertical={false} />
        <XAxis
          dataKey="t"
          type="number"
          domain={[from, to]}
          ticks={ticks}
          tickFormatter={(v) => tickLabel(v as number, step)}
          stroke={AXIS}
          tickLine={false}
          axisLine={false}
          tickMargin={10}
          fontSize={11}
          minTickGap={24}
        />
        <YAxis
          orientation="right"
          domain={[0, 100]}
          ticks={[0, 25, 50, 75, 100]}
          tickFormatter={(v) => `${v}%`}
          stroke={AXIS}
          tickLine={false}
          axisLine={false}
          tickMargin={8}
          width={44}
          fontSize={11}
        />
        <Tooltip content={<Tip />} cursor={{ stroke: "#4a5058", strokeWidth: 1 }} isAnimationActive={false} />
        <Line
          type="monotone"
          dataKey="no"
          stroke={NO}
          strokeWidth={2}
          dot={(p: DotProps) => renderEnd(p, last, NO, "no")}
          activeDot={{ r: 4, fill: NO, stroke: "#0e0f11", strokeWidth: 2 }}
          isAnimationActive={false}
        />
        <Line
          type="monotone"
          dataKey="yes"
          stroke={YES}
          strokeWidth={2}
          dot={(p: DotProps) => renderEnd(p, last, YES, "yes")}
          activeDot={{ r: 4, fill: YES, stroke: "#0e0f11", strokeWidth: 2 }}
          isAnimationActive={false}
        />
      </LineChart>
    </ResponsiveContainer>
  );
}

/** Small YES sparkline for market cards. */
export function Sparkline({ points, height = 56 }: { points: PricePoint[]; height?: number }) {
  const up = (points.at(-1)?.yes ?? 50) >= (points[0]?.yes ?? 50);
  const color = up ? YES : NO;
  const id = `spark-${up ? "up" : "down"}`;
  return (
    <ResponsiveContainer width="100%" height={height}>
      <AreaChart data={resampleSeries(points, 60)} margin={{ top: 2, right: 0, bottom: 0, left: 0 }}>
        <defs>
          <linearGradient id={id} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={color} stopOpacity={0.2} />
            <stop offset="100%" stopColor={color} stopOpacity={0} />
          </linearGradient>
        </defs>
        <XAxis dataKey="t" type="number" domain={["dataMin", "dataMax"]} hide />
        <YAxis domain={[0, 100]} hide />
        <Area
          type="monotone"
          dataKey="yes"
          stroke={color}
          strokeWidth={2}
          fill={`url(#${id})`}
          isAnimationActive={false}
        />
      </AreaChart>
    </ResponsiveContainer>
  );
}
