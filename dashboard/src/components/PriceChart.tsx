"use client";

import { Area, AreaChart, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { clock } from "@/lib/format";
import type { PricePoint } from "@/lib/market";

const YES = "#34d399";
const NO = "#f87171";

/** YES and NO share prices over time, in cents. */
export function PriceChart({ points, height = 260 }: { points: PricePoint[]; height?: number }) {
  return (
    <ResponsiveContainer width="100%" height={height}>
      <LineChart data={points} margin={{ top: 8, right: 12, bottom: 0, left: -12 }}>
        <XAxis
          dataKey="t"
          type="number"
          domain={["dataMin", "dataMax"]}
          tickFormatter={(v) => clock(v)}
          stroke="#ffffff40"
          fontSize={11}
        />
        <YAxis domain={[0, 100]} tickFormatter={(v) => `${v}¢`} stroke="#ffffff40" fontSize={11} />
        <Tooltip
          contentStyle={{ background: "#111827", border: "1px solid #ffffff20", borderRadius: 8 }}
          labelFormatter={(v) => clock(v as number)}
          formatter={(v, name) => [`${Math.round(v as number)}¢`, String(name).toUpperCase()]}
        />
        <Line
          type="stepAfter"
          dataKey="yes"
          stroke={YES}
          strokeWidth={2.5}
          dot={false}
          isAnimationActive={false}
        />
        <Line
          type="stepAfter"
          dataKey="no"
          stroke={NO}
          strokeWidth={1.5}
          strokeDasharray="4 3"
          dot={false}
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
      <AreaChart data={points} margin={{ top: 2, right: 0, bottom: 0, left: 0 }}>
        <defs>
          <linearGradient id={id} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={color} stopOpacity={0.35} />
            <stop offset="100%" stopColor={color} stopOpacity={0} />
          </linearGradient>
        </defs>
        <XAxis dataKey="t" type="number" domain={["dataMin", "dataMax"]} hide />
        <YAxis domain={[0, 100]} hide />
        <Area
          type="stepAfter"
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
