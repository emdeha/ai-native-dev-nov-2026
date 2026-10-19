# Product brief

## Request
    Last Seat: a seat reservation service with expiring holds. A user can hold a seat for a limited time, then confirm it, cancel it or let it expire. One seat is never sold twice, and every hold is eventually released.

## Outcomes
-     A booker holds a free seat and sees the seat reported as held for them until a stated deadline.
-     A booker confirms their held seat before the deadline and sees the seat reported as sold to them.
-     A booker cancels their hold and sees the seat reported as free again.
-     A booker who does nothing has their hold released automatically at the deadline, and the seat is reported as free again.
-     A second booker is refused a seat that is held or sold, so one seat is never sold twice.
-     Open: no business motivation was supplied in the Request; the benefit behind these outcomes is not yet stated.

## Scope

### In scope
-     A tiny HTTP API as the public port for every operation and every observation.
-     Hold one named seat from a fixed seat inventory for a limited time.
-     Confirm a held seat before its deadline.
-     Cancel a held seat before its deadline.
-     Release a hold automatically when its deadline passes.
-     Report every seat as free, held (with holder reference and deadline) or sold.
-     Refuse any hold or confirmation that would sell one seat twice.
-     A clearly marked demo-only HTTP operation that advances the clock, so expiry is observable during the workshop.
-     A single event with one seating area, loaded at start.

### Out of scope
Applicability: applicable
Reason:     The Request names only hold, confirm, cancel and expire for one seat, and the work must stay small enough to deliver live.
-     Payment, pricing and refunds.
-     User accounts, login and roles.
-     Waitlists and any fairness guarantee about who gets a released seat.
-     Seat maps and any graphical or web user interface, including the Svelte client the human mentioned.
-     Multiple events, venues or seating areas.
-     Notifications to the booker.
-     Storage that survives a process restart.
-     Extension or renewal of a hold.
-     Organizer or administrator override of another person's hold.

## Jobs to be done

### Human
- [proposed] When I have found the seat I want, I want to keep it for a short time before I commit, so I can decide without losing the seat to someone else.
- [proposed] When I am ready, I want to confirm that the seat is mine, so I can be certain nobody else receives the same seat.
- [proposed] When a seat is no longer wanted, I want it to return to the pool quickly, so the seat is not blocked by somebody who walked away.

### LLM
_Not explored._

## User journey

| Step | Human emotion | Status |
| --- | --- | --- |
| The booker asks the HTTP API for the seats and sees which seats are free. | not explored | proposed |
| The booker holds one free seat and receives a hold reference and a deadline. | not explored | proposed |
| The booker decides while the hold is active; other bookers are refused that seat. | not explored | proposed |
| The booker confirms the seat before the deadline, and the seat becomes sold to them. | not explored | proposed |
| Or the booker cancels, and the seat becomes free at once. | not explored | proposed |
| Or the booker does nothing, and the hold is released at the deadline, so the seat becomes free again. | not explored | proposed |

Qualitative journey arc (stated emotions; NOT measured intensity)
```text
[proposed] 1. The booker asks the HTTP API for the seats and sees which seats are free.
    emotion: UNKNOWN (not explored)
    |
    v
[proposed] 2. The booker holds one free seat and receives a hold reference and a deadline.
    emotion: UNKNOWN (not explored)
    |
    v
[proposed] 3. The booker decides while the hold is active; other bookers are refused that seat.
    emotion: UNKNOWN (not explored)
    |
    v
[proposed] 4. The booker confirms the seat before the deadline, and the seat becomes sold to them.
    emotion: UNKNOWN (not explored)
    |
    v
[proposed] 5. Or the booker cancels, and the seat becomes free at once.
    emotion: UNKNOWN (not explored)
    |
    v
[proposed] 6. Or the booker does nothing, and the hold is released at the deadline, so the seat becomes free again.
    emotion: UNKNOWN (not explored)
```

## Gherkin scenarios

### A booker holds a free seat (proposed)
```gherkin
Given seat 12 is free
When booker A sends an HTTP request to hold seat 12
Then the response gives booker A a hold reference and a deadline
And seat 12 is reported as held for booker A
```

### The last seat is not given to a second booker (proposed)
```gherkin
Given seat 12 is held for booker A
When booker B sends an HTTP request to hold seat 12
Then booker B is refused because the seat is held
And seat 12 is still reported as held for booker A
```

### A sold seat is never sold again (proposed)
```gherkin
Given booker A has confirmed seat 12
When booker B sends an HTTP request to hold or confirm seat 12
Then booker B is refused because the seat is sold
And seat 12 is still reported as sold to booker A
```

### A hold that nobody uses is released at its deadline (proposed)
```gherkin
Given seat 12 is held for booker A
When the deadline of the hold passes and booker A did nothing
Then seat 12 is reported as free
And booker B can hold seat 12
```

### A confirmation after the deadline is refused (confirmed)
```gherkin
Given seat 12 was held for booker A and the deadline has passed
When booker A sends an HTTP request to confirm seat 12 with the hold reference
Then booker A is refused because the hold expired
And seat 12 is reported as free
```

### The holder cancels and frees the seat at once (proposed)
```gherkin
Given seat 12 is held for booker A
When booker A sends an HTTP request to cancel the hold with the hold reference
Then seat 12 is reported as free before the deadline
```

## Quint scenarios

_Not run: no Quint model was executed for this brief._

## Observations
-     Through the HTTP API, a booker holds a free seat and the seat is then reported as held for that booker until a stated deadline.
-     Through the HTTP API, the holder confirms their held seat before its deadline and the seat is then reported as sold to that holder.
-     Through the HTTP API, a second booker is refused a seat that is held or sold, and only the holder of the hold reference can confirm it, so the seat is never sold twice.
-     Through the HTTP API, an unconfirmed hold is released - at once when the holder cancels, and automatically when its deadline passes - and the seat is then reported as free, while a sold seat is never released.

## Decisions
-     Confirmed by the human in the Request: a seat can be held for a limited time, then confirmed, cancelled or left to expire.
-     Confirmed by the human in the Request: safety - one seat is never sold twice.
-     Confirmed by the human in the Request: liveness - every hold is eventually released unless it is confirmed or cancelled.
-     Confirmed by the human: one fixed hold duration for all seats, set at start, default 2 minutes. A hold cannot be extended or renewed.
-     Confirmed by the human: the deadline is authoritative. A confirm that arrives at or after the deadline is refused with 'hold expired' and the seat is free. There is no grace window.
-     Confirmed by the human: holding returns a hold reference, and only the holder of that reference may confirm or cancel that hold. There are no accounts and no organizer override.
-     Confirmed by the human: the public port is a tiny HTTP API, not a command line interface.
-     Confirmed by the human: the HTTP API offers a clearly marked demo-only operation that advances the clock, so expiry is observable during a 90-minute demo.
-     Proposal: every HTTP response is structured data that a browser client can consume directly, not prose text.
-     Open: the human mentioned a thin Svelte user interface on top of the API. It is not in scope for this feature. It is undecided whether it becomes a later value, a follow-up feature or work outside nWave delivery.
-     Proposal: after a hold is released, the seat goes to whoever asks first, including the previous holder. There is no queue and no fairness promise.
-     Proposal: the seat inventory is fixed when the service starts and cannot be changed while it runs.
-     Assumption: a single process holds all state in memory; nothing survives a restart.
-     Open: no business motivation was supplied for the feature.
-     Open: the confirm-versus-expiry race has not been explored with generated scenarios; no Quint model was run in this turn.

## Values
| Observation | Dependencies |
| --- | --- |
| Through the HTTP API, a booker holds a free seat and the seat is then reported as held for that booker until a stated deadline. |  |
| Through the HTTP API, the holder confirms their held seat before its deadline and the seat is then reported as sold to that holder. | Through the HTTP API, a booker holds a free seat and the seat is then reported as held for that booker until a stated deadline. |
| Through the HTTP API, a second booker is refused a seat that is held or sold, and only the holder of the hold reference can confirm it, so the seat is never sold twice. | Through the HTTP API, a booker holds a free seat and the seat is then reported as held for that booker until a stated deadline., Through the HTTP API, the holder confirms their held seat before its deadline and the seat is then reported as sold to that holder. |
| Through the HTTP API, an unconfirmed hold is released - at once when the holder cancels, and automatically when its deadline passes - and the seat is then reported as free, while a sold seat is never released. | Through the HTTP API, a booker holds a free seat and the seat is then reported as held for that booker until a stated deadline., Through the HTTP API, the holder confirms their held seat before its deadline and the seat is then reported as sold to that holder. |

## Change intent
| Observation | Type | Description |
| --- | --- | --- |
| Through the HTTP API, a booker holds a free seat and the seat is then reported as held for that booker until a stated deadline. | feat | Hold a free seat for a limited time and report its holder and deadline |
| Through the HTTP API, the holder confirms their held seat before its deadline and the seat is then reported as sold to that holder. | feat | Confirm a held seat so that the seat becomes sold to its holder |
| Through the HTTP API, a second booker is refused a seat that is held or sold, and only the holder of the hold reference can confirm it, so the seat is never sold twice. | feat | Refuse every hold or confirmation that would sell one seat twice |
| Through the HTTP API, an unconfirmed hold is released - at once when the holder cancels, and automatically when its deadline passes - and the seat is then reported as free, while a sold seat is never released. | feat | Release every unconfirmed hold by cancellation or by deadline expiry |
