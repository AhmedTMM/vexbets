"use client";

import { Button, Input, Label, TextField } from "@heroui/react";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { type ReactNode, Suspense, useState } from "react";
import { API_MODE, refreshAll } from "@/lib/api";
import { credits } from "@/lib/format";
import { useMe } from "@/lib/hooks";
import { ListenerProvider } from "@/lib/listener";
import { setEmail } from "@/lib/session";
import { ListenBar } from "./ListenBar";
import { LiveCaptions } from "./LiveCaptions";
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
function Wordmark({ size = 28, className = "" }: { size?: number; className?: string }) {
  return (
    <span
      className={`display uppercase italic ${className}`}
      style={{ fontSize: size, fontWeight: 700, letterSpacing: "0.01em" }}
    >
      <span className="text-yes">Vex</span>bets
    </span>
  );
}

/** The category row: Markets (all), Open and Settled filter the home grid; Portfolio. */
function Tabs() {
  const path = usePathname();
  const tab = useSearchParams().get("tab");
  const home = path === "/";
  const items = [
    { href: "/", label: "Markets", active: home && tab !== "open" && tab !== "settled", scroll: true },
    { href: "/?tab=open", label: "Open", active: home && tab === "open", scroll: false },
    { href: "/?tab=settled", label: "Settled", active: home && tab === "settled", scroll: false },
    { href: "/portfolio", label: "Portfolio", active: path.startsWith("/portfolio"), scroll: true },
  ];
  return (
    <nav aria-label="Pages" className="no-scrollbar -mx-4 overflow-x-auto px-4 sm:mx-0 sm:px-0">
      <ul className="flex gap-6 sm:gap-7">
        {items.map((t) => (
          <li key={t.href}>
            <Link
              href={t.href}
              scroll={t.scroll}
              aria-current={t.active ? "page" : undefined}
              className="tab h-11"
            >
              {t.label}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}

export function Shell({ children }: { children: ReactNode }) {
  const { data: me, error } = useMe();

  if (me === undefined && !error) return null;
  if (!me) return <SignIn problem={error?.message} />;

  return (
    <ListenerProvider>
      <div className="min-h-dvh">
        <header className="sticky top-0 z-30 border-line border-b bg-bg/95 backdrop-blur-md">
          <div className="page-x">
            <div className="flex h-14 items-center gap-3">
              <Link
                href="/"
                aria-label="Vexbets home"
                className="flex h-11 shrink-0 items-center gap-2 rounded-lg"
              >
                <Mark size={32} />
                <Wordmark size={26} className="max-[399px]:text-[22px]! max-[374px]:hidden" />
              </Link>

              <div className="ml-auto flex items-center gap-2 sm:gap-3">
                {API_MODE === "mock" && (
                  <span
                    title="Running on the in-browser stand-in backend"
                    className="meta rounded-full max-lg:hidden border border-mock/30 bg-mock/10 px-2.5 py-0.5 text-mock"
                  >
                    mock backend
                  </span>
                )}
                <span className="text-muted text-sm max-lg:hidden">@{me.handle}</span>
                <Link
                  href="/portfolio"
                  title="Your portfolio"
                  className="display inline-flex h-10 items-center whitespace-nowrap rounded-full bg-raised px-4 text-[19px] text-ink transition-colors duration-150 hover:bg-line"
                >
                  {credits(me.balance)}
                </Link>
                <Button variant="tertiary" onPress={() => setEmail(null)} className="h-10 rounded-full px-4">
                  Switch
                </Button>
              </div>
            </div>
            <Suspense fallback={<div className="h-11" />}>
              <Tabs />
            </Suspense>
          </div>
        </header>
        <ListenBar />
        <main className="page-x pt-6 pb-16 sm:pt-8">{children}</main>
        <LiveCaptions />
        <WinToaster meId={me.id} />
      </div>
    </ListenerProvider>
  );
}

function SignIn({ problem }: { problem?: string }) {
  const [email, setValue] = useState("");
  return (
    <div className="flex min-h-dvh items-center justify-center px-4 py-10">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (email.includes("@")) {
            setEmail(email);
            refreshAll();
          }
        }}
        className="w-full max-w-sm space-y-6"
      >
        <div className="flex items-center gap-2.5">
          <Mark size={36} />
          <Wordmark size={30} />
        </div>
        <div className="space-y-3">
          <h1 className="headline text-[40px] sm:text-[48px]">Trade on what your friends will say.</h1>
          <p className="text-muted text-[15px] leading-relaxed">
            A Vexo band listens and settles the market. New players get $100 of play money.
          </p>
        </div>
        <TextField isRequired value={email} onChange={setValue} type="email">
          <Label className="label mb-1.5 block">Email</Label>
          <Input placeholder="you@example.com" className="h-11 w-full text-base" />
        </TextField>
        {problem && <p className="text-no text-sm">{problem}</p>}
        <div className="space-y-3">
          <Button type="submit" size="lg" fullWidth className="rounded-full font-semibold">
            Start trading
          </Button>
          <p className="meta text-center">no password · play-money demo</p>
        </div>
      </form>
    </div>
  );
}
