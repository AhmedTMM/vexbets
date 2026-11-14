import type { Metadata } from "next";
import { Barlow_Condensed, JetBrains_Mono, Schibsted_Grotesk } from "next/font/google";
import type { ReactNode } from "react";
import { Shell } from "@/components/Shell";
import "./globals.css";

/** Interface text: a crisp grotesk with some character. */
const sans = Schibsted_Grotesk({
  variable: "--font-ui",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
});
/** Big numbers and the wordmark: tall condensed figures, like a trading terminal. */
const display = Barlow_Condensed({
  variable: "--font-numbers",
  subsets: ["latin"],
  weight: ["500", "600", "700"],
});
/** Small details: band numbers, times, statuses. */
const mono = JetBrains_Mono({ variable: "--font-code", subsets: ["latin"], weight: ["400", "500"] });

export const metadata: Metadata = {
  title: "Vexbets",
  description: "Trade YES and NO shares on what your friends will say. A Vexo band listens and settles it.",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" className="dark" data-theme="dark">
      <body className={`${sans.variable} ${display.variable} ${mono.variable} antialiased`}>
        <Shell>{children}</Shell>
      </body>
    </html>
  );
}
