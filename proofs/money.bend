import Base

# The money rules of the backend, with credits as Nat (they are whole and never negative
# there too). Each def names the TypeScript it models, in backend/src/services/.

# One user's balance and one market's escrow, before or after a step.
type Book is Data:
  Book{user: Nat, escrow: Nat}

# Every credit in this book: what the proofs show never changes.
def total(b: Book) -> Nat:
  match b:
    case Book{u, e}:
      Nat.add(u, e)

# A buy (trading.ts trade, side "buy"): the user pays `cost` into the market's escrow, as one
# ledger row and one escrow update in one transaction. Refused when the balance is short
# (insufficient_balance): then nothing moves. `ok` is that balance check.
def buy_if(ok: Bool, u: Nat, e: Nat, +cost: Nat) -> Book:
  match ok:
    case True{}:
      Book{Nat.sub(u, cost), Nat.add(e, cost)}
    case False{}:
      Book{u, e}

def buy(+u: Nat, e: Nat, +cost: Nat) -> Book:
  buy_if(Nat.is_le(cost, u), u, e, cost)

# A sell (trade, side "sell"): the escrow pays `proceeds` to the user. The escrow covers it
# because LMSR proceeds never exceed what buys put in (tested, not proven here: LMSR uses
# floating point); if it did not, nothing would move.
def sell_if(ok: Bool, u: Nat, e: Nat, +proceeds: Nat) -> Book:
  match ok:
    case True{}:
      Book{Nat.add(u, proceeds), Nat.sub(e, proceeds)}
    case False{}:
      Book{u, e}

def sell(u: Nat, +e: Nat, +proceeds: Nat) -> Book:
  sell_if(Nat.is_le(proceeds, e), u, e, proceeds)

type Trade is Data:
  Buy{cost: Nat}
  Sell{proceeds: Nat}

def step(t: Trade, b: Book) -> Book:
  match t:
    case Buy{c}:
      match b:
        case Book{u, e}:
          buy(u, e, c)
    case Sell{p}:
      match b:
        case Book{u, e}:
          sell(u, e, p)

# Any number of trades, in order, accepted or refused.
def run(ts: List<Trade>, b: Book) -> Book:
  match ts:
    case Nil{}:
      b
    case Con{t, rest}:
      run(rest, step(t, b))

# Settlement (resolution.ts settle): each winning share pays SHARE_PAYOUT = 100 credits,
# then the creator gets what is left in escrow, and the escrow ends at 0.
def paid(ws: +List<Nat>) -> Nat:
  match ws:
    case Nil{}:
      0n
    case Con{s, rest}:
      Nat.add(Nat.mul(s, 100n), paid(rest))

def shares(ws: +List<Nat>) -> Nat:
  match ws:
    case Nil{}:
      0n
    case Con{s, rest}:
      Nat.add(s, shares(rest))

# (credits to winners, credits to the creator)
def split(e: Nat, +p: Nat) -> Book:
  Book{p, Nat.sub(e, p)}

def settle(e: Nat, ws: +List<Nat>) -> Book:
  split(e, paid(ws))
