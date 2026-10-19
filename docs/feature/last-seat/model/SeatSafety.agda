-- Last Seat -- machine-checked properties of the pure seat transition.
--
-- What is proved here: the transition is a TOTAL function (Agda's coverage
-- and termination checkers accept it with no postulate and no hole), a sold
-- seat is absorbing under every command, a confirmation that takes effect
-- happened strictly before its deadline and was presented with the holder's
-- own reference, a hold is granted only on a seat whose effective state is
-- free, and the expiry projection is idempotent.
--
-- What is NOT proved here: anything about the HTTP shell, about concurrency,
-- about elapsed wall-clock time, about the store, or about the service as a
-- running process. Those are the Quint model's, the TLA+ slice's and the
-- acceptance oracle's obligations.

module SeatSafety where

data Bool : Set where
  true  : Bool
  false : Bool

data ⊥ : Set where

⊥-elim : {A : Set} → ⊥ → A
⊥-elim ()

data ℕ : Set where
  zero : ℕ
  suc  : ℕ → ℕ
{-# BUILTIN NATURAL ℕ #-}

_+_ : ℕ → ℕ → ℕ
zero  + n = n
suc m + n = suc (m + n)

data _≡_ {A : Set} (x : A) : A → Set where
  refl : x ≡ x
infix 4 _≡_
{-# BUILTIN EQUALITY _≡_ #-}

data _≤_ : ℕ → ℕ → Set where
  z≤n : {n : ℕ} → zero ≤ n
  s≤s : {m n : ℕ} → m ≤ n → suc m ≤ suc n

≤-trans : {a b c : ℕ} → a ≤ b → b ≤ c → a ≤ c
≤-trans z≤n _ = z≤n
≤-trans (s≤s p) (s≤s q) = s≤s (≤-trans p q)

n≮n : {n : ℕ} → suc n ≤ n → ⊥
n≮n {zero} ()
n≮n {suc n} (s≤s p) = n≮n p

before-and-after-absurd : {t d : ℕ} → suc t ≤ d → d ≤ t → ⊥
before-and-after-absurd p q = n≮n (≤-trans p q)

-- A decision with its evidence. The negative branch carries evidence too,
-- so no caller has to re-decide what the constructor already knows.
data Cmp (m n : ℕ) : Set where
  less    : suc m ≤ n → Cmp m n
  notless : n ≤ m → Cmp m n

cmp : (m n : ℕ) → Cmp m n
cmp zero zero = notless z≤n
cmp zero (suc n) = less (s≤s z≤n)
cmp (suc m) zero = notless z≤n
cmp (suc m) (suc n) with cmp m n
... | less p    = less (s≤s p)
... | notless p = notless (s≤s p)

data RefCmp (m n : ℕ) : Set where
  same : m ≡ n → RefCmp m n
  diff : RefCmp m n

refCmp : (m n : ℕ) → RefCmp m n
refCmp zero zero = same refl
refCmp zero (suc n) = diff
refCmp (suc m) zero = diff
refCmp (suc m) (suc n) with refCmp m n
... | same refl = same refl
... | diff      = diff

Booker : Set
Booker = ℕ

Ref : Set
Ref = ℕ

record Hold : Set where
  constructor mkHold
  field
    holder   : Booker
    ref      : Ref
    deadline : ℕ
open Hold

data SeatState : Set where
  free : SeatState
  held : Hold → SeatState
  sold : Booker → SeatState

data Refusal : Set where
  holdExpired  : Refusal
  notTheHolder : Refusal
  seatHeld     : Refusal
  seatSold     : Refusal

data Outcome : Set where
  granted   : Ref → ℕ → Outcome
  confirmed : Booker → Outcome
  cancelled : Outcome
  refused   : Refusal → Outcome

data Command : Set where
  holdFor : Booker → Ref → ℕ → Command
  confirm : Ref → Command
  cancel  : Ref → Command

record Step : Set where
  constructor _,_
  field
    next : SeatState
    out  : Outcome
open Step

-- The expiry projection. A hold whose deadline has been reached is free at
-- every observation and for every command: the deadline is authoritative.
viewHold : {m n : ℕ} → Cmp m n → Hold → SeatState
viewHold (less _) h    = held h
viewHold (notless _) _ = free

view : ℕ → SeatState → SeatState
view _ free     = free
view _ (sold o) = sold o
view t (held h) = viewHold (cmp t (deadline h)) h

holdOn : Booker → Ref → ℕ → SeatState → Step
holdOn b r d free     = held (mkHold b r d) , granted r d
holdOn _ _ _ (held h) = held h , refused seatHeld
holdOn _ _ _ (sold o) = sold o , refused seatSold

confirmHeld : {m n : ℕ} → RefCmp m n → Hold → Step
confirmHeld (same _) h = sold (holder h) , confirmed (holder h)
confirmHeld diff h     = held h , refused notTheHolder

confirmOn : Ref → SeatState → Step
confirmOn _ free     = free , refused holdExpired
confirmOn r (held h) = confirmHeld (refCmp r (ref h)) h
confirmOn _ (sold o) = sold o , refused seatSold

cancelHeld : {m n : ℕ} → RefCmp m n → Hold → Step
cancelHeld (same _) _ = free , cancelled
cancelHeld diff h     = held h , refused notTheHolder

cancelOn : Ref → SeatState → Step
cancelOn _ free     = free , refused holdExpired
cancelOn r (held h) = cancelHeld (refCmp r (ref h)) h
cancelOn _ (sold o) = sold o , refused seatSold

-- The whole transition. Total: every command on every state has exactly one
-- result, and no outcome escapes through an exception.
step : ℕ → Command → SeatState → Step
step t (holdFor b r dur) s = holdOn b r (t + dur) (view t s)
step t (confirm r) s       = confirmOn r (view t s)
step t (cancel r) s        = cancelOn r (view t s)

refused≢confirmed : {x : Refusal} {b : Booker} → refused x ≡ confirmed b → ⊥
refused≢confirmed ()

refused≢granted : {x : Refusal} {r d : ℕ} → refused x ≡ granted r d → ⊥
refused≢granted ()

refused≢cancelled : {x : Refusal} → refused x ≡ cancelled → ⊥
refused≢cancelled ()

-- PROPERTY 1. A sold seat is absorbing: no command changes it.
sold-is-absorbing : (t : ℕ) (c : Command) (o : Booker) → next (step t c (sold o)) ≡ sold o
sold-is-absorbing _ (holdFor _ _ _) _ = refl
sold-is-absorbing _ (confirm _) _     = refl
sold-is-absorbing _ (cancel _) _      = refl

-- PROPERTY 2. A confirmation that takes effect happened strictly before the
-- deadline. This is the deadline-authoritative decision, machine-checked.
confirm-respects-deadline :
  (t : ℕ) (h : Hold) (r : Ref) (b : Booker) →
  out (step t (confirm r) (held h)) ≡ confirmed b → suc t ≤ deadline h
confirm-respects-deadline t h r b eq with cmp t (deadline h)
... | less q    = q
... | notless _ = ⊥-elim (refused≢confirmed eq)

-- PROPERTY 3. A confirmation that takes effect presented the holder's own
-- reference.
confirm-only-by-the-holder :
  (t : ℕ) (h : Hold) (r : Ref) (b : Booker) →
  out (step t (confirm r) (held h)) ≡ confirmed b → r ≡ ref h
confirm-only-by-the-holder t h r b eq with cmp t (deadline h)
... | notless _ = ⊥-elim (refused≢confirmed eq)
... | less _ with refCmp r (ref h)
...   | same q = q
...   | diff   = ⊥-elim (refused≢confirmed eq)

-- PROPERTY 4. A cancellation that takes effect happened strictly before the
-- deadline and presented the holder's own reference.
cancel-respects-deadline :
  (t : ℕ) (h : Hold) (r : Ref) →
  out (step t (cancel r) (held h)) ≡ cancelled → suc t ≤ deadline h
cancel-respects-deadline t h r eq with cmp t (deadline h)
... | less q    = q
... | notless _ = ⊥-elim (refused≢cancelled eq)

cancel-only-by-the-holder :
  (t : ℕ) (h : Hold) (r : Ref) →
  out (step t (cancel r) (held h)) ≡ cancelled → r ≡ ref h
cancel-only-by-the-holder t h r eq with cmp t (deadline h)
... | notless _ = ⊥-elim (refused≢cancelled eq)
... | less _ with refCmp r (ref h)
...   | same q = q
...   | diff   = ⊥-elim (refused≢cancelled eq)

-- PROPERTY 5. A hold is granted only on a seat whose effective state is free.
hold-only-when-free :
  (t : ℕ) (b : Booker) (r : Ref) (dur : ℕ) (s : SeatState) (r' d' : ℕ) →
  out (step t (holdFor b r dur) s) ≡ granted r' d' → view t s ≡ free
hold-only-when-free t b r dur s r' d' eq with view t s
... | free    = refl
... | held _  = ⊥-elim (refused≢granted eq)
... | sold _  = ⊥-elim (refused≢granted eq)

-- PROPERTY 6. The expiry projection is idempotent: reading the seat twice at
-- the same time gives the same answer as reading it once.
view-is-idempotent : (t : ℕ) (s : SeatState) → view t (view t s) ≡ view t s
view-is-idempotent _ free     = refl
view-is-idempotent _ (sold _) = refl
view-is-idempotent t (held h) with cmp t (deadline h) in eq
... | less _    rewrite eq = refl
... | notless _ = refl
