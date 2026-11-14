"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { type ReactNode, useState } from "react";
import { API_MODE, refreshAll } from "@/lib/api";
import { credits } from "@/lib/format";
import { useMe } from "@/lib/hooks";
import { setEmail } from "@/lib/session";
import { WinToaster } from "./WinToaster";

const NAV = [
  { href: "/", label: "Markets" },
  { href: "/markets/new", label: "New market" },
  { href: "/portfolio", label: "Portfolio" },
  { href: "/listen", label: "Listen" },
];

export function Shell({ children }: { children: ReactNode }) {
  const { data: me, error } = useMe();
  const path = usePathname();

  if (me === undefined && !error) return null;
  if (!me) return <SignIn problem={error?.message} />;

  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-20 border-b border-white/10 bg-[#0b0f14]/90 backdrop-blur">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-6 gap-y-2 px-4 py-3">
          <Link href="/" className="font-semibold tracking-wide">
            <span className="text-sky-400">VEX</span>BETS
          </Link>
          <nav className="flex flex-wrap gap-1 text-sm">
            {NAV.map((n) => {
              const active = n.href === "/" ? path === "/" : path.startsWith(n.href);
              return (
                <Link
                  key={n.href}
                  href={n.href}
                  className={`rounded-md px-3 py-1.5 ${active ? "bg-white/10 text-white" : "text-white/60 hover:text-white"}`}
                >
                  {n.label}
                </Link>
              );
            })}
          </nav>
          <div className="ml-auto flex items-center gap-3 text-sm">
            {API_MODE === "mock" && (
              <span
                title="Running on the in-browser stand-in backend"
                className="rounded bg-amber-400/15 px-2 py-0.5 text-xs text-amber-300"
              >
                mock
              </span>
            )}
            <span className="text-white/60">@{me.handle}</span>
            <span className="rounded-md bg-emerald-500/15 px-2 py-1 font-mono text-emerald-300">
              {credits(me.balance)}
            </span>
            <button type="button" onClick={() => setEmail(null)} className="text-white/40 hover:text-white">
              Switch
            </button>
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-4 py-6">{children}</main>
      <WinToaster meId={me.id} />
    </div>
  );
}

function SignIn({ problem }: { problem?: string }) {
  const [email, setValue] = useState("");
  return (
    <div className="flex min-h-screen items-center justify-center px-4">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (email.includes("@")) {
            setEmail(email);
            refreshAll();
          }
        }}
        className="w-full max-w-sm space-y-4 rounded-2xl border border-white/10 bg-white/5 p-6"
      >
        <h1 className="text-2xl font-semibold">
          <span className="text-sky-400">VEX</span>BETS
        </h1>
        <p className="text-sm text-white/60">
          Trade YES and NO shares on what your friends will say. A Vexo band listens and settles the market.
          New players get 10,000 play credits.
        </p>
        <label className="block space-y-1.5">
          <span className="text-sm text-white/70">Email</span>
          <input
            type="email"
            required
            value={email}
            onChange={(e) => setValue(e.target.value)}
            placeholder="you@example.com"
            className="w-full rounded-lg border border-white/15 bg-black/30 px-3 py-2 outline-none focus:border-sky-400"
          />
        </label>
        <p className="text-xs text-white/40">No password: this is a play-money demo.</p>
        {problem && <p className="text-sm text-rose-400">{problem}</p>}
        <button
          type="submit"
          className="w-full rounded-lg bg-sky-500 py-2 font-medium text-black hover:bg-sky-400"
        >
          Start trading
        </button>
      </form>
    </div>
  );
}
