/**
 * Check a market's proof yourself: the transcript hash chain, and that every quote the judge
 * used is really in the transcript, inside the market's window.
 *
 *   curl <backend>/api/v1/markets/<id>/proof -H 'authorization: Bearer you@x.com' > proof.json
 *   npx tsx scripts/verify-proof.ts proof.json
 */
import { readFileSync } from "node:fs";
import { ProofBundle, verifyProof } from "@vexbets/contract";

const file = process.argv[2];
if (!file) {
  console.error("usage: verify-proof.ts <proof.json>");
  process.exit(1);
}
const bundle = ProofBundle.parse(JSON.parse(readFileSync(file, "utf8")));
const result = await verifyProof(bundle);
console.log(`${bundle.segments.length} segments:`, result.ok ? "proof OK" : result.problems.join("\n"));
process.exit(result.ok ? 0 : 1);
