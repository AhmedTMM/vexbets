# dashboard

Next.js (TypeScript) on Vercel. Not built yet.

Pages:

- Markets list and market page (create, quote, trade, see proof) using `createClient` from
  `@vexbets/contract`.
- `/listen`: connects to the team's band with the kit's browser library
  (`vexo-open-kit/js/src`, copied in so Vercel can build it), streams audio to STT and sends
  final segments with `appendSegments`. Chrome or Edge only (Web Bluetooth).
