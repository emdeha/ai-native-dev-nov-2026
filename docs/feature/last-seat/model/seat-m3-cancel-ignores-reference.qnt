// MUTANT m3-cancel-ignores-reference: cancel accepts any hold reference, so a booker who is not the holder cancels the hold.
// Last Seat -- one seat, expiring holds, lazy deadline evaluation.
//
// The stored state keeps a hold until it is replaced. Every command and every
// report reads the seat through viewOf, which projects a hold whose deadline
// has passed to Free. The deadline is therefore authoritative at every
// observation, and no background sweep writes to the store.
module seat {
  type Booker = str
  type SeatId = str

  type Hold = { holder: Booker, ref: int, deadline: int }

  type SeatState =
    | Free
    | Held(Hold)
    | Sold(Booker)

  type Outcome =
    | Start
    | HoldGranted({ seat: SeatId, holder: Booker, ref: int, deadline: int, priorFree: bool })
    | Confirmed({ seat: SeatId, owner: Booker, at: int, deadline: int, presented: int, required: int })
    | Cancelled({ seat: SeatId, at: int, deadline: int, presented: int, required: int })
    | Refused({ seat: SeatId, reason: str, at: int, deadline: int })
    | ClockAdvanced(int)

  pure val SEATS: Set[SeatId] = Set("s12")
  pure val BOOKERS: Set[Booker] = Set("A", "B")
  pure val REFS: Set[int] = Set(1, 2, 3)
  pure val DELTAS: Set[int] = Set(1, 2)
  pure val HOLD_DURATION: int = 2
  pure val HORIZON: int = 6
  pure val NO_OWNER: Booker = ""

  var stored: SeatId -> SeatState
  var clock: int
  var nextRef: int
  var last: Outcome
  var soldOwner: SeatId -> Booker
  var priorStored: SeatId -> SeatState
  var priorSold: SeatId -> Booker
  var priorNextRef: int

  pure def expired(h: Hold, t: int): bool = t >= h.deadline

  pure def viewOf(s: SeatState, t: int): SeatState =
    match s {
    | Held(h) => if (expired(h, t)) Free else s
    | _ => s
    }

  def effective(id: SeatId): SeatState = viewOf(stored.get(id), clock)

  def storedIsHeld(id: SeatId): bool =
    match stored.get(id) {
    | Held(_) => true
    | _ => false
    }

  def storedDeadline(id: SeatId): int =
    match stored.get(id) {
    | Held(h) => h.deadline
    | _ => -1
    }

  pure def holdAllowed(cur: SeatState): bool = cur == Free

  pure def holdRefusal(cur: SeatState): str =
    match cur {
    | Sold(_) => "seat sold"
    | _ => "seat held"
    }

  action keepPrior = all {
    priorStored' = stored,
    priorSold' = soldOwner,
    priorNextRef' = nextRef,
  }

  action refuse(id: SeatId, why: str): bool = all {
    keepPrior,
    clock' = clock,
    nextRef' = nextRef,
    stored' = stored,
    soldOwner' = soldOwner,
    last' = Refused({ seat: id, reason: why, at: clock, deadline: storedDeadline(id) }),
  }

  action hold(id: SeatId, b: Booker): bool = {
    val cur = effective(id)
    val wasFree = cur == Free
    if (holdAllowed(cur))
      all {
        keepPrior,
        clock' = clock,
        soldOwner' = soldOwner,
        stored' = stored.set(id, Held({ holder: b, ref: nextRef, deadline: clock + HOLD_DURATION })),
        nextRef' = nextRef + 1,
        last' = HoldGranted({ seat: id, holder: b, ref: nextRef,
                              deadline: clock + HOLD_DURATION, priorFree: wasFree }),
      }
    else refuse(id, holdRefusal(cur))
  }

  // The state a command decides on. Base: the lazily expired view.
  def decided(id: SeatId): SeatState = effective(id)

  action confirm(id: SeatId, r: int): bool = {
    match decided(id) {
    | Held(h) =>
        if (h.ref == r)
          all {
            keepPrior,
            clock' = clock,
            nextRef' = nextRef,
            stored' = stored.set(id, Sold(h.holder)),
            soldOwner' = if (soldOwner.get(id) == NO_OWNER) soldOwner.set(id, h.holder) else soldOwner,
            last' = Confirmed({ seat: id, owner: h.holder, at: clock, deadline: h.deadline,
                                presented: r, required: h.ref }),
          }
        else refuse(id, "not the holder")
    | Free => refuse(id, if (storedIsHeld(id)) "hold expired" else "no hold")
    | Sold(_) => refuse(id, "seat sold")
    }
  }

  action cancel(id: SeatId, r: int): bool = {
    match decided(id) {
    | Held(h) =>
        if (true)
          all {
            keepPrior,
            clock' = clock,
            nextRef' = nextRef,
            stored' = stored.set(id, Free),
            soldOwner' = soldOwner,
            last' = Cancelled({ seat: id, at: clock, deadline: h.deadline,
                                presented: r, required: h.ref }),
          }
        else refuse(id, "not the holder")
    | Free => refuse(id, if (storedIsHeld(id)) "hold expired" else "no hold")
    | Sold(_) => refuse(id, "seat sold")
    }
  }

  action advance(d: int): bool = all {
    clock + d <= HORIZON,
    keepPrior,
    clock' = clock + d,
    stored' = stored,
    nextRef' = nextRef,
    soldOwner' = soldOwner,
    last' = ClockAdvanced(clock + d),
  }

  action anyHold = {
    nondet id = SEATS.oneOf()
    nondet b = BOOKERS.oneOf()
    hold(id, b)
  }

  action anyConfirm = {
    nondet id = SEATS.oneOf()
    nondet r = REFS.oneOf()
    confirm(id, r)
  }

  action anyCancel = {
    nondet id = SEATS.oneOf()
    nondet r = REFS.oneOf()
    cancel(id, r)
  }

  action anyAdvance = {
    nondet d = DELTAS.oneOf()
    advance(d)
  }

  action init = all {
    stored' = SEATS.mapBy(_ => Free),
    clock' = 0,
    nextRef' = 1,
    last' = Start,
    soldOwner' = SEATS.mapBy(_ => NO_OWNER),
    priorStored' = SEATS.mapBy(_ => Free),
    priorSold' = SEATS.mapBy(_ => NO_OWNER),
    priorNextRef' = 1,
  }

  action step = any {
    anyHold,
    anyConfirm,
    anyCancel,
    anyAdvance,
  }

  // ---- safety properties ----

  // A seat that has been sold stays sold to its first buyer, for ever.
  val SoldStable: bool =
    SEATS.forall(id =>
      soldOwner.get(id) != NO_OWNER implies effective(id) == Sold(soldOwner.get(id)))

  // A seat reported as held has a deadline that is still in the future.
  val HeldIsActive: bool =
    SEATS.forall(id =>
      match effective(id) {
      | Held(h) => clock < h.deadline
      | _ => true
      })

  // Only the holder of the hold reference confirms or cancels that hold.
  val AuthorizedOnly: bool =
    match last {
    | Confirmed(c) => c.presented == c.required
    | Cancelled(c) => c.presented == c.required
    | _ => true
    }

  // A confirm or a cancel that took effect happened strictly before the deadline.
  val DeadlineAuthoritative: bool =
    match last {
    | Confirmed(c) => c.at < c.deadline
    | Cancelled(c) => c.at < c.deadline
    | _ => true
    }

  // A hold is granted only on a seat that was free.
  val HoldOnlyWhenFree: bool =
    match last {
    | HoldGranted(g) => g.priorFree
    | _ => true
    }

  // A refused command changes nothing.
  val RefusalIsInert: bool =
    match last {
    | Refused(_) => and {
        stored == priorStored,
        soldOwner == priorSold,
        nextRef == priorNextRef,
      }
    | _ => true
    }

  val Safety: bool = and {
    SoldStable,
    HeldIsActive,
    AuthorizedOnly,
    DeadlineAuthoritative,
    HoldOnlyWhenFree,
    RefusalIsInert,
  }

  // ---- witness predicates ----
  // A witness denies a situation the design allows. Its counterexample is a
  // real trace of this model that reaches that situation, so the trace is the
  // scenario a human reads. A witness is never a safety claim.

  // The confirm that just makes it: one tick before the deadline.
  val NoConfirmOneTickBeforeDeadline: bool =
    match last {
    | Confirmed(c) => c.at != c.deadline - 1
    | _ => true
    }

  // The confirm that just misses: exactly at the deadline, refused.
  val NoConfirmExactlyAtDeadline: bool =
    match last {
    | Refused(r) => not(r.reason == "hold expired" and r.at == r.deadline)
    | _ => true
    }

  // A sold seat is still sold long after the old hold deadline.
  val NoSoldSeatAfterTheDeadline: bool =
    not(SEATS.exists(id => soldOwner.get(id) != NO_OWNER and clock >= 4))

  // A second booker is refused a seat that is held.
  val NoSecondBookerRefused: bool =
    match last {
    | Refused(r) => r.reason != "seat held"
    | _ => true
    }
}
