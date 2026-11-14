# proofs

Machine-checked proofs, in [Bend 2](https://bend-lang.com), that the backend's money rules
never create or destroy a credit.

| File         | Who writes it | What it is                                                                            |
| ------------ | ------------- | ------------------------------------------------------------------------------------- |
| `money.bend` | code          | The money rules of `backend/src/services/` (trades, settlement) as Bend code          |
| `LAWS.bend`  | **humans**    | The claims. Review these: they are the spec                                           |
| `PROOF.bend` | AI            | A proof of every law; the checker refuses anything false                              |
| `nat.bend`   | AI            | Arithmetic lemmas Base does not ship (commutativity, `c <= u` ⇒ `c + (u - c) = u`, …) |

## The laws

1. **A buy never creates or destroys a credit**, whether it is accepted or refused for an
   insufficient balance.
2. **Nor does a sell.**
3. **Nor does any sequence of trades**, of any length (induction over the list).
4. **Settlement pays exactly 100 credits per winning share.**
5. **Settlement hands out exactly the escrow**: winners plus creator receive all of it, no
   more, whenever the escrow covers the payouts (the backend refuses to settle otherwise).

The balance check matters: without it, a user with 5 credits buying for 8 leaves 8 credits
in the book (Nat subtraction stops at 0). The checker refuses that law.

## Check them

    curl -fsSL https://bend-lang.com/install.sh | sh     # or see CI for a pinned install
    bend proofs/PROOF.bend          # ALL PROOFS CHECK
    bend proofs/PROOF.bend --verdict   # also recheck with the Lean-proven kernel (needs Lean 4.34)

## What is not proven here

- **LMSR pricing** (`contract/src/lmsr.ts`) uses floating-point `exp`/`log`. That a sell
  never pays more than the escrow holds, and that settlement is always covered, follow from
  the LMSR bound; they are assumptions here (law 2's check, law 5's `covered`) and are
  covered by tests (`backend/test/trading.test.ts`, `e2e.test.ts`) instead.
- **The model is not the TypeScript.** `money.bend` mirrors it by hand; each def names the
  code it models. A change to the money code should change this model and re-run the proofs.
