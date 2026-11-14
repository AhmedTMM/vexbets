"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { type ReactNode, useState } from "react";
import { API_MODE, refreshAll } from "@/lib/api";
import { credits } from "@/lib/format";
import { useMe } from "@/lib/hooks";
import { ListenerProvider } from "@/lib/listener";
import { setEmail } from "@/lib/session";
import { WinToaster } from "./WinToaster";

/** The mark: the Vexo three-triangle logo, with a poker chip in the bottom corner. */
function Mark({ size = 44 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 48 48" aria-hidden="true">
      {/* Vexo tile: cream with three rounded black triangles. */}
      <rect x="0" y="0" width="40" height="40" rx="10" fill="#f1efea" />
      <g fill="#111" stroke="#111" strokeWidth="3.6" strokeLinejoin="round">
        <path d="M20 9.5 L25.2 18 L14.8 18 Z" />
        <path d="M13 21.5 L18.2 30 L7.8 30 Z" />
        <path d="M27 21.5 L32.2 30 L21.8 30 Z" />
      </g>
      {/* Poker chip: green, with a white edge ring and centre. */}
      <circle cx="38.5" cy="38.5" r="9" fill="#00d394" stroke="#0b0c0e" strokeWidth="2.5" />
      <circle
        cx="38.5"
        cy="38.5"
        r="6.6"
        fill="none"
        stroke="#fff"
        strokeWidth="2.2"
        strokeDasharray="3.4 3.5"
      />
      <circle cx="38.5" cy="38.5" r="3.6" fill="#00d394" stroke="#fff" strokeWidth="1.2" />
    </svg>
  );
}

/** VEXBETS set tight in the condensed display face, VEX in YES green. */
function Wordmark({ size = 28 }: { size?: number }) {
  return (
    <span
      className="display uppercase italic"
      style={{ fontSize: size, fontWeight: 700, letterSpacing: "0.01em" }}
    >
      <span className="text-yes">Vex</span>bets
    </span>
  );
}

const PAGES = [
  { href: "/", label: "Dashboard" },
  { href: "/portfolio", label: "Portfolio" },
];

export function Shell({ children }: { children: ReactNode }) {
  const { data: me, error } = useMe();
  const path = usePathname();

  if (me === undefined && !error) return null;
  if (!me) return <SignIn problem={error?.message} />;

  return (
    <ListenerProvider>
      <div className="min-h-dvh">
        <header className="sticky top-0 z-30 border-line border-b bg-bg/90 backdrop-blur-md">
          <div className="flex h-16 items-center gap-6 px-6">
            <Link href="/" aria-label="Vexbets home" className="flex items-center gap-2.5 rounded-lg">
              <Mark size={36} />
              <Wordmark />
            </Link>

            <nav className="flex gap-1" aria-label="Pages">
              {PAGES.map((p) => {
                const active = p.href === "/" ? path === "/" : path.startsWith(p.href);
                return (
                  <Link
                    key={p.href}
                    href={p.href}
                    aria-current={active ? "page" : undefined}
                    className={`flex h-9 items-center rounded-full px-4 text-[15px] transition-colors duration-150 ${active ? "bg-raised font-semibold text-ink" : "text-muted hover:text-ink"}`}
                  >
                    {p.label}
                  </Link>
                );
              })}
            </nav>

            <div className="ml-auto flex items-center gap-4">
              {API_MODE === "mock" && (
                <span
                  title="Running on the in-browser stand-in backend"
                  className="meta rounded-full border border-mock/30 bg-mock/10 px-2.5 py-0.5 text-mock"
                >
                  mock backend
                </span>
              )}
              <span className="text-muted text-sm">@{me.handle}</span>
              <Link
                href="/portfolio"
                title="Your portfolio"
                className="display rounded-lg border border-yes/25 bg-yes/10 px-3 py-1.5 text-[22px] text-yes transition-colors duration-150 hover:bg-yes/20"
              >
                {credits(me.balance)}
              </Link>
              <button
                type="button"
                onClick={() => setEmail(null)}
                className="btn btn-ghost h-9 px-3 text-[13px]"
              >
                Switch
              </button>
            </div>
          </div>
        </header>
        <main className="mx-auto max-w-[1720px] p-6">{children}</main>
        <WinToaster meId={me.id} />
      </div>
    </ListenerProvider>
  );
}

function SignIn({ problem }: { problem?: string }) {
  const [email, setValue] = useState("");
  return (
    <div className="flex min-h-dvh items-center justify-center px-4">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (email.includes("@")) {
            setEmail(email);
            refreshAll();
          }
        }}
        className="panel w-full max-w-sm space-y-5 p-8"
      >
        <div className="flex items-center gap-3">
          <Mark />
          <Wordmark size={34} />
        </div>
        <p className="text-muted text-sm leading-relaxed">
          Trade YES and NO shares on what your friends will say. A Vexo band listens and settles the market.
          New players get $100 of play money.
        </p>
        <label className="block">
          <span className="label mb-1.5 block">Email</span>
          <input
            type="email"
            required
            value={email}
            onChange={(e) => setValue(e.target.value)}
            placeholder="you@example.com"
            className="field"
          />
        </label>
        <p className="meta">no password · play-money demo</p>
        {problem && <p className="text-no text-sm">{problem}</p>}
        <button type="submit" className="btn btn-primary h-11 w-full">
          Start trading
        </button>
      </form>
    </div>
  );
}
