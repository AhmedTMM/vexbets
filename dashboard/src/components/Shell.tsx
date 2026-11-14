"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { type ReactNode, useState } from "react";
import { API_MODE, refreshAll } from "@/lib/api";
import { credits } from "@/lib/format";
import { useMe } from "@/lib/hooks";
import { ListenerProvider } from "@/lib/listener";
import { setEmail } from "@/lib/session";
import { ListenBar } from "./ListenBar";
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
      <div className="min-h-dvh min-[1100px]:grid min-[1100px]:grid-cols-[260px_minmax(0,1fr)]">
        <aside className="border-line border-b bg-[#0b0c0e] min-[1100px]:sticky min-[1100px]:top-0 min-[1100px]:h-dvh min-[1100px]:border-r min-[1100px]:border-b-0">
          <div className="scroll-y flex h-full flex-col gap-6 p-6">
            <Link href="/" className="flex items-center gap-3 rounded-lg">
              <Mark />
              <span className="font-bold text-xl tracking-[0.04em]">
                <span className="text-yes">VEX</span>BETS
              </span>
            </Link>

            <nav className="flex gap-1 rounded-full border border-line bg-surface p-1" aria-label="Pages">
              {PAGES.map((p) => {
                const active = p.href === "/" ? path === "/" : path.startsWith(p.href);
                return (
                  <Link
                    key={p.href}
                    href={p.href}
                    aria-current={active ? "page" : undefined}
                    className={`flex h-9 flex-1 items-center justify-center rounded-full text-sm transition-colors duration-150 ${active ? "bg-raised font-bold text-ink" : "font-medium text-muted hover:text-ink"}`}
                  >
                    {p.label}
                  </Link>
                );
              })}
            </nav>

            <div className="panel space-y-3 p-4">
              <div className="flex items-center justify-between">
                <span className="font-medium text-sm">@{me.handle}</span>
                <button
                  type="button"
                  onClick={() => setEmail(null)}
                  className="rounded-md px-1.5 text-muted text-sm transition-colors duration-150 hover:text-ink"
                >
                  Switch
                </button>
              </div>
              <div>
                <div className="label">Balance</div>
                <div className="num font-semibold text-2xl tracking-tight">{credits(me.balance)}</div>
              </div>
            </div>
          </div>
        </aside>

        <div className="min-w-0">
          <main className="mx-auto max-w-[1500px] space-y-6 p-6 min-[1100px]:p-10">
            <header className="panel flex flex-wrap items-center justify-between gap-4 px-6 py-5">
              <div>
                <h1 className="font-bold text-3xl tracking-[0.02em]">VEXBETS</h1>
                <p className="meta mt-1">
                  prediction markets on what your friends say · settled by a Vexo band
                </p>
              </div>
              <span
                className={`num inline-flex items-center gap-2 rounded-full border px-3.5 py-1.5 text-[13px] ${API_MODE === "mock" ? "border-mock/30 bg-mock/10 text-mock" : "border-line bg-surface text-ink"}`}
              >
                <span
                  aria-hidden="true"
                  className={`h-2 w-2 rounded-full ${API_MODE === "mock" ? "bg-mock" : "bg-yes"}`}
                />
                {API_MODE === "mock" ? "mock backend · in this browser" : "backend connected"}
              </span>
            </header>
            <ListenBar />
            {children}
          </main>
        </div>
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
          <span className="font-bold text-2xl tracking-[0.04em]">VEXBETS</span>
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
