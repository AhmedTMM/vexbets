"use client";

import { type ReactNode, useEffect, useRef, useState } from "react";

/** Wraps a number that flashes green when `value` rises and red when it falls. Visual only. */
export function Flash({
  value,
  children,
  className = "",
}: {
  value: number;
  children: ReactNode;
  className?: string;
}) {
  const prev = useRef(value);
  const [dir, setDir] = useState<{ d: "up" | "down"; n: number } | null>(null);

  useEffect(() => {
    if (value > prev.current) setDir((x) => ({ d: "up", n: (x?.n ?? 0) + 1 }));
    else if (value < prev.current) setDir((x) => ({ d: "down", n: (x?.n ?? 0) + 1 }));
    prev.current = value;
  }, [value]);

  useEffect(() => {
    if (!dir) return;
    const t = setTimeout(() => setDir(null), 700);
    return () => clearTimeout(t);
  }, [dir]);

  return (
    <span key={dir?.n ?? 0} className={`${className} ${dir ? `flash-${dir.d}` : ""}`}>
      {children}
    </span>
  );
}
