"use client";

import { Area, AreaChart, CartesianGrid, Line, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { clock } from "@/lib/format";
import type { PricePoint } from "@/lib/market";

const YES = "#00d394";
const NO = "#ff4f6a";
const AXIS = "#6b727a";

/** YES price as a filled line (the "stock"), NO as a dashed line, in cents. */
export function PriceChart({
  points,
  height = 260,
  timeFormat = clock,
}: {
  points: PricePoint[];
  height?: number;
  timeFormat?: (t: number) => string;
}) {
  return (
    <ResponsiveContainer width="100%" height={height}>
      <AreaChart data={points} margin={{ top: 8, right: 8, bottom: 0, left: -18 }}>
        <defs>
          <linearGradient id="yes-fill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={YES} stopOpacity={0.28} />
            <stop offset="100%" stopColor={YES} stopOpacity={0} />
          </linearGradient>
        </defs>
        <CartesianGrid stroke="#2a2f35" strokeDasharray="2 4" vertical={false} />
        <XAxis
          dataKey="t"
          type="number"
          domain={["dataMin", "dataMax"]}
          tickFormatter={(v) => timeFormat(v)}
          stroke={AXIS}
          tickLine={false}
          axisLine={{ stroke: "#25292e" }}
          fontSize={11}
          fontFamily="var(--font-mono)"
          minTickGap={40}
        />
        <YAxis
          domain={[0, 100]}
          ticks={[0, 25, 50, 75, 100]}
          tickFormatter={(v) => `${v}¢`}
          stroke={AXIS}
          tickLine={false}
          axisLine={false}
          fontSize={11}
          fontFamily="var(--font-mono)"
        />
        <Tooltip
          contentStyle={{
            background: "#1d2024",
            border: "1px solid #343a41",
            color: "#f2f4f5",
            borderRadius: 10,
            fontFamily: "var(--font-mono)",
            fontSize: 12,
          }}
          labelFormatter={(v) => timeFormat(v as number)}
          formatter={(v, name) => [`${Math.round(v as number)}¢`, String(name).toUpperCase()]}
        />
        <Area
          type="stepAfter"
          dataKey="yes"
          stroke={YES}
          strokeWidth={2.5}
          fill="url(#yes-fill)"
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
      </AreaChart>
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
            <stop offset="0%" stopColor={color} stopOpacity={0.2} />
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
