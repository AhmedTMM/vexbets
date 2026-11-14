import Base
import ./LAWS.bend as Laws
import ./money.bend as M
import ./nat.bend as N

# Proofs of LAWS.bend. `bend PROOF.bend` prints ALL PROOFS CHECK once every law holds.

# Moving c from a to b, when c fits in a, keeps a + b.
law move_in:
  for +a: Nat
  for +b: Nat
  for +c: Nat
  for h: {Nat.is_le(c, a) == True{} : Bool}
  {Nat.add(Nat.sub(a, c), Nat.add(b, c)) == Nat.add(a, b) : Nat}

def move_in(a, b, c, h):
  %N.add_comm(c, b) : {Nat.add(Nat.sub(a, c), _) == Nat.add(a, b) : Nat}
  %N.add_assoc(Nat.sub(a, c), c, b) : {_ == Nat.add(a, b) : Nat}
  %N.add_comm(c, Nat.sub(a, c)) : {Nat.add(_, b) == Nat.add(a, b) : Nat}
  %N.sub_add(c, a, h) : {Nat.add(Nat.add(c, Nat.sub(a, c)), b) == Nat.add(_, b) : Nat}
  {==}

law move_out:
  for +a: Nat
  for +b: Nat
  for +c: Nat
  for h: {Nat.is_le(c, b) == True{} : Bool}
  {Nat.add(Nat.add(a, c), Nat.sub(b, c)) == Nat.add(a, b) : Nat}

def move_out(a, b, c, h):
  %Equal.sym(Nat, Nat.add(Nat.add(a, c), Nat.sub(b, c)), Nat.add(a, Nat.add(c, Nat.sub(b, c))), N.add_assoc(a, c, Nat.sub(b, c))) : {_ == Nat.add(a, b) : Nat}
  %N.sub_add(c, b, h) : {Nat.add(a, Nat.add(c, Nat.sub(b, c))) == Nat.add(a, _) : Nat}
  {==}

law buy_if_conserves:
  for ok: Bool
  for +u: Nat
  for +e: Nat
  for +c: Nat
  for h: {Nat.is_le(c, u) == ok : Bool}
  {M.total(M.buy_if(ok, u, e, c)) == Nat.add(u, e) : Nat}

def buy_if_conserves(ok, u, e, c, h):
  match ok:
    case True{}:
      move_in(u, e, c, h)
    case False{}:
      {==}

law sell_if_conserves:
  for ok: Bool
  for +u: Nat
  for +e: Nat
  for +p: Nat
  for h: {Nat.is_le(p, e) == ok : Bool}
  {M.total(M.sell_if(ok, u, e, p)) == Nat.add(u, e) : Nat}

def sell_if_conserves(ok, u, e, p, h):
  match ok:
    case True{}:
      move_out(u, e, p, h)
    case False{}:
      {==}

def Laws.buy_conserves(u, e, c):
  buy_if_conserves(Nat.is_le(c, u), u, e, c, {==})

def Laws.sell_conserves(u, e, p):
  sell_if_conserves(Nat.is_le(p, e), u, e, p, {==})

law step_conserves:
  for t: M.Trade
  for b: M.Book
  {M.total(M.step(t, b)) == M.total(b) : Nat}

def step_conserves(t, b):
  match t:
    case M.Buy{c}:
      match b:
        case M.Book{u, e}:
          Laws.buy_conserves(u, e, c)
    case M.Sell{p}:
      match b:
        case M.Book{u, e}:
          Laws.sell_conserves(u, e, p)

def Laws.run_conserves(ts, b):
  match ts:
    case Nil{}:
      {==}
    case Con{+t, rest}:
      Equal.trans(Nat, M.total(M.run(rest, M.step(t, b))), M.total(M.step(t, b)), M.total(b), Laws.run_conserves(rest, M.step(t, b)), step_conserves(t, b))

def Laws.payout_exact(ws):
  match ws:
    case Nil{}:
      {==}
    case Con{s, rest}:
      %Equal.sym(Nat, Nat.mul(Nat.add(s, M.shares(rest)), 100n), Nat.add(Nat.mul(s, 100n), Nat.mul(M.shares(rest), 100n)), N.mul_add(s, M.shares(rest), 100n)) : {Nat.add(Nat.mul(s, 100n), M.paid(rest)) == _ : Nat}
      %Laws.payout_exact(rest) : {Nat.add(Nat.mul(s, 100n), M.paid(rest)) == Nat.add(Nat.mul(s, 100n), _) : Nat}
      {==}

def Laws.settle_conserves(e, ws, covered):
  N.sub_add(M.paid(ws), e, covered)
