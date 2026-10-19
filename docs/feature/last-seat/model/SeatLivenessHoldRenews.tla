---------------------------- MODULE SeatLivenessHoldRenews ----------------------------
(***************************************************************************)
(* Last Seat -- the liveness slice.                                        *)
(*                                                                         *)
(* The Quint model carries absolute time and is bounded by a horizon, so a *)
(* hold that is never released cannot be told from a clock that has hit    *)
(* its ceiling. This slice replaces absolute time with a countdown of      *)
(* abstract ticks, so the state space is finite without a time ceiling and *)
(* weak fairness of the tick is the only progress assumption.              *)
(*                                                                         *)
(* Projection limits: a tick is an abstract step, never a second. This     *)
(* model says nothing about elapsed time, about a scheduler, or about who  *)
(* calls the demo clock operation. It keeps only the state the temporal    *)
(* property needs: per seat a status, a holder and the ticks the hold has  *)
(* left. Hold references and refusal reasons are projected away; they are  *)
(* carried by the Quint model instead.                                     *)
(***************************************************************************)
EXTENDS Naturals

CONSTANTS Seats, Bookers, HoldTicks, NoBooker

VARIABLES status, holder, remaining

vars == <<status, holder, remaining>>

TypeOK ==
  /\ status \in [Seats -> {"free", "held", "sold"}]
  /\ holder \in [Seats -> Bookers \cup {NoBooker}]
  /\ remaining \in [Seats -> 0..HoldTicks]

(* The lazily expired view: a hold whose countdown has reached zero is     *)
(* free at every observation and for every command.                        *)
Effective(s) ==
  IF status[s] = "held" /\ remaining[s] = 0 THEN "free" ELSE status[s]

IsHeld(s) == Effective(s) = "held"

Init ==
  /\ status = [s \in Seats |-> "free"]
  /\ holder = [s \in Seats |-> NoBooker]
  /\ remaining = [s \in Seats |-> 0]

\* MUTANT m7-hold-renews-existing-hold: a hold request on a seat that is
\* already held renews that hold instead of being refused, so the hold is
\* extended for ever and is never released.
Hold(s, b) ==
  /\ Effective(s) \in {"free", "held"}
  /\ status' = [status EXCEPT ![s] = "held"]
  /\ holder' = [holder EXCEPT ![s] = b]
  /\ remaining' = [remaining EXCEPT ![s] = HoldTicks]

Confirm(s) ==
  /\ Effective(s) = "held"
  /\ status' = [status EXCEPT ![s] = "sold"]
  /\ remaining' = [remaining EXCEPT ![s] = 0]
  /\ UNCHANGED holder

Cancel(s) ==
  /\ Effective(s) = "held"
  /\ status' = [status EXCEPT ![s] = "free"]
  /\ holder' = [holder EXCEPT ![s] = NoBooker]
  /\ remaining' = [remaining EXCEPT ![s] = 0]

TickEnabled == \E s \in Seats : status[s] = "held" /\ remaining[s] > 0

(* One step of the clock. Every live hold loses one tick. *)
Tick ==
  /\ TickEnabled
  /\ remaining' = [s \in Seats |->
       IF status[s] = "held" /\ remaining[s] > 0 THEN remaining[s] - 1
       ELSE remaining[s]]
  /\ UNCHANGED <<status, holder>>

Next ==
  \/ \E s \in Seats, b \in Bookers : Hold(s, b)
  \/ \E s \in Seats : Confirm(s)
  \/ \E s \in Seats : Cancel(s)
  \/ Tick

(* Weak fairness of Tick assumes the clock keeps moving while some hold    *)
(* still has time left. In the delivered service that obligation belongs   *)
(* to whoever advances the clock: the operating system clock in normal     *)
(* use, and the demo-only advance operation during the workshop.           *)
Spec == Init /\ [][Next]_vars /\ WF_vars(Tick)

SpecNoFairness == Init /\ [][Next]_vars

(* Every hold is eventually released: a seat reported as held stops being  *)
(* reported as held -- by confirmation, by cancellation or by expiry.      *)
EveryHoldIsReleased == \A s \in Seats : [](IsHeld(s) => <>(~IsHeld(s)))

(* A sold seat is never released. *)
SoldIsAbsorbing == \A s \in Seats : status[s] = "sold" => Effective(s) = "sold"
=============================================================================
