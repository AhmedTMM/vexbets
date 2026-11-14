/**
 * Any time series on an even grid: `n` samples from the first to the last point, each
 * carrying the value of the latest real point at or before it, plus every real point, so
 * a jump lands exactly when it happened. A few events still draw a full, hoverable line,
 * and no value is ever invented.
 */
export function resampleSeries<P extends { t: number }>(points: P[], n: number): P[] {
  const first = points[0];
  const lastPt = points.at(-1);
  if (!first || !lastPt || points.length < 2 || lastPt.t <= first.t) return points;
  const step = (lastPt.t - first.t) / (n - 1);
  const out: P[] = [];
  let i = 0;
  for (let k = 0; k < n; k++) {
    const t = first.t + k * step;
    while (i + 1 < points.length && (points[i + 1] as P).t <= t) {
      i++;
      out.push(points[i] as P);
    }
    out.push({ ...(points[i] as P), t });
  }
  out.sort((a, b) => a.t - b.t);
  return out.filter((p, j) => j === 0 || p.t !== (out[j - 1] as P).t);
}
