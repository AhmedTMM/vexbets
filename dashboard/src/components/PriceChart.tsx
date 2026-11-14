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
import { clock } from "@/lib/format";
import type { PricePoint } from "@/lib/market";

const YES = "#00d394";
const NO = "#ff4f6a";
const AXIS = "#6b727a";

interface DotProps {
  cx?: number;
  cy?: number;
  index?: number;
}

/**
 * The end of a line, Kalshi style: a dot on the last point with the side and its price
 * next to it. `nudge` moves the label up or down when YES and NO end close together.
 */
function renderEnd(
  { cx, cy, index }: DotProps,
  lastIndex: number,
  color: string,
  label: string,
  nudge: number,
) {
  const key = `end-${label}-${index}`;
  if (index !== lastIndex || cx === undefined || cy === undefined) return <g key={key} />;
  return (
    <g key={key}>
      <circle cx={cx} cy={cy} r={8} fill={color} opacity={0.2} />
      <circle cx={cx} cy={cy} r={4} fill={color} />
      <text
        x={cx + 12}
        y={cy + nudge}
        dy="0.35em"
        fill={color}
        fontFamily="var(--font-display)"
        fontWeight={700}
        fontSize={18}
      >
        {label}
      </text>
    </g>
  );
}

/** YES and NO prices over time as two lines, each labelled at its latest price, in cents. */
export function PriceChart({
  points,
  height = 260,
  timeFormat = clock,
}: {
  points: PricePoint[];
  /** Pixels, or "100%" to fill a parent with a (responsive) height. */
  height?: number | `${number}%`;
  timeFormat?: (t: number) => string;
}) {
  const last = points.length - 1;
  const yes = Math.round(points[last]?.yes ?? 50);
  const no = Math.round(points[last]?.no ?? 50);
  // Keep the two end labels from overlapping when the prices are close.
  const gap = Math.abs(yes - no);
  // The nudge is in pixels; a "100%" chart is about as tall as the default one.
  const px = typeof height === "number" ? height : 260;
  const push = gap < 12 ? Math.ceil(((12 - gap) / 100) * px * 0.5) + 2 : 0;
  const yesNudge = yes >= no ? -push : push;
  const noNudge = yes >= no ? push : -push;

  return (
    <ResponsiveContainer width="100%" height={height}>
      <LineChart data={points} margin={{ top: 12, right: 92, bottom: 0, left: -18 }}>
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
        <Line
          type="monotone"
          dataKey="no"
          stroke={NO}
          strokeWidth={2.5}
          dot={(p: DotProps) => renderEnd(p, last, NO, `NO ${no}¢`, noNudge)}
          activeDot={{ r: 4, fill: NO, stroke: "none" }}
          isAnimationActive={false}
        />
        <Line
          type="monotone"
          dataKey="yes"
          stroke={YES}
          strokeWidth={2.5}
          dot={(p: DotProps) => renderEnd(p, last, YES, `YES ${yes}¢`, yesNudge)}
          activeDot={{ r: 4, fill: YES, stroke: "none" }}
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
