import Base
import ./money.bend as M

# What must hold about credits. Humans state these; PROOF.bend proves them.

# 1. A buy, accepted or refused, never creates or destroys a credit.
law buy_conserves:
  for +u: Nat
  for +e: Nat
  for +c: Nat
  {M.total(M.buy(u, e, c)) == Nat.add(u, e) : Nat}

# 2. Nor does a sell.
law sell_conserves:
  for +u: Nat
  for +e: Nat
  for +p: Nat
  {M.total(M.sell(u, e, p)) == Nat.add(u, e) : Nat}

# 3. Nor does any sequence of trades, however long.
law run_conserves:
  for ts: List<M.Trade>
  for +b: M.Book
  {M.total(M.run(ts, b)) == M.total(b) : Nat}

# 4. Settlement pays exactly 100 credits per winning share.
law payout_exact:
  for +ws: +List<Nat>
  {M.paid(ws) == Nat.mul(M.shares(ws), 100n) : Nat}

# 5. Settlement hands out exactly the escrow: winners plus creator get all of it, no more,
#    whenever the escrow covers the payouts (the backend refuses to settle otherwise).
law settle_conserves:
  for +e: Nat
  for +ws: +List<Nat>
  for covered: {Nat.is_le(M.paid(ws), e) == True{} : Bool}
  {M.total(M.settle(e, ws)) == e : Nat}
