import type { Metadata, Viewport } from "next";
import { Geist_Mono, Instrument_Sans } from "next/font/google";
import type { ReactNode } from "react";
import { Shell } from "@/components/Shell";
import "./globals.css";

/** Everything: Instrument Sans, a crisp, slightly warm grotesk. Big prices use its tabular
 *  figures (see .display), so the same family carries the text and the numbers. */
const sans = Instrument_Sans({
  variable: "--font-ui",
  subsets: ["latin"],
  // Variable weight plus the width axis: .headline and .display use its condensed cut.
  axes: ["wdth"],
});
/** Small details: band numbers, times, statuses. */
const mono = Geist_Mono({ variable: "--font-code", subsets: ["latin"], weight: ["400", "500"] });

export const metadata: Metadata = {
  title: "Vexbets",
  description: "Trade YES and NO shares on what your friends will say. A Vexo band listens and settles it.",
};

/** Phone-friendly: device width, no zoom-out, and the browser bar in the page colour. */
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#0e0f11",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" className="dark" data-theme="dark">
      <body className={`${sans.variable} ${mono.variable} antialiased`}>
        <Shell>{children}</Shell>
      </body>
    </html>
  );
}
