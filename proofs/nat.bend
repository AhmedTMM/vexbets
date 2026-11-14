import Base

# Small facts about Nat that Base does not ship. Each law is proven by the def below it.

law add_zero:
  for +x: Nat
  {Nat.add(x, 0n) == x : Nat}

def add_zero(x):
  match x:
    case 0n:
      {==}
    case 1n+p:
      %add_zero(p) : {1n+Nat.add(p, 0n) == 1n+_ : Nat}
      {==}

law add_succ:
  for +x: Nat
  for +y: Nat
  {Nat.add(x, 1n+y) == 1n+Nat.add(x, y) : Nat}

def add_succ(x, y):
  match x:
    case 0n:
      {==}
    case 1n+p:
      %add_succ(p, y) : {1n+Nat.add(p, 1n+y) == 1n+_ : Nat}
      {==}

law add_comm:
  for +a: Nat
  for +b: Nat
  {Nat.add(a, b) == Nat.add(b, a) : Nat}

def add_comm(a, b):
  match a:
    case 0n:
      %Equal.sym(Nat, Nat.add(b, 0n), b, add_zero(b)) : {b == _ : Nat}
      {==}
    case 1n+p:
      %Equal.sym(Nat, Nat.add(b, 1n+p), 1n+Nat.add(b, p), add_succ(b, p)) : {1n+Nat.add(p, b) == _ : Nat}
      %add_comm(p, b) : {1n+Nat.add(p, b) == 1n+_ : Nat}
      {==}

law add_assoc:
  for +a: Nat
  for +b: Nat
  for +c: Nat
  {Nat.add(Nat.add(a, b), c) == Nat.add(a, Nat.add(b, c)) : Nat}

def add_assoc(a, b, c):
  match a:
    case 0n:
      {==}
    case 1n+p:
      %add_assoc(p, b, c) : {1n+Nat.add(Nat.add(p, b), c) == 1n+_ : Nat}
      {==}

# Is True / False, as a type: used to refute a False == True hypothesis.
def bool_disc(b: Bool) -> Type:
  match b:
    case False{}:
      Unit
    case True{}:
      Empty

def false_is_not_true(h: {False{} == True{} : Bool}) -> Empty:
  %h : bool_disc(_)
  Unit{}

def from_empty(-P: Type, e: Empty) -> P:
  match e:

# Taking c out of u and adding it back gives u, when c fits in u.
law sub_add:
  for +c: Nat
  for +u: Nat
  for h: {Nat.is_le(c, u) == True{} : Bool}
  {Nat.add(c, Nat.sub(u, c)) == u : Nat}

def sub_add(c, u, h):
  match c u:
    case 0n 0n:
      {==}
    case 0n 1n+up:
      {==}
    case 1n+cp 0n:
      from_empty({Nat.add(1n+cp, Nat.sub(0n, 1n+cp)) == 0n : Nat}, false_is_not_true(h))
    case 1n+cp 1n+up:
      %sub_add(cp, up, h) : {1n+Nat.add(cp, Nat.sub(up, cp)) == 1n+_ : Nat}
      {==}

law mul_add:
  for +a: Nat
  for +b: Nat
  for +k: Nat
  {Nat.mul(Nat.add(a, b), k) == Nat.add(Nat.mul(a, k), Nat.mul(b, k)) : Nat}

def mul_add(a, b, k):
  match a:
    case 0n:
      {==}
    case 1n+p:
      %Equal.sym(Nat, Nat.mul(Nat.add(p, b), k), Nat.add(Nat.mul(p, k), Nat.mul(b, k)), mul_add(p, b, k)) : {Nat.add(k, _) == Nat.add(Nat.add(k, Nat.mul(p, k)), Nat.mul(b, k)) : Nat}
      %Equal.sym(Nat, Nat.add(Nat.add(k, Nat.mul(p, k)), Nat.mul(b, k)), Nat.add(k, Nat.add(Nat.mul(p, k), Nat.mul(b, k))), add_assoc(k, Nat.mul(p, k), Nat.mul(b, k))) : {Nat.add(k, Nat.add(Nat.mul(p, k), Nat.mul(b, k))) == _ : Nat}
      {==}
