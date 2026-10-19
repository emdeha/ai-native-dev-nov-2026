# Acceptance brief

## Request
    Last Seat: a seat reservation service with expiring holds. A user can hold a seat for a limited time, then confirm it, cancel it or let it expire. One seat is never sold twice, and every hold is eventually released.

## Value Observations
###     Through the HTTP API, a booker holds a free seat and the seat is then reported as held for that booker until a stated deadline.

## Acceptance Obligations
| ID | Stimulus | Expected result |
| --- | --- | --- |
| hold-a-free-seat | A booker holds a free seat of the started seating area through the HTTP API and then reads that seat and the whole seating area, while the demonstration clock stands one second before the deadline. | The hold is granted with an opaque hold reference and a deadline equal to the time of the grant plus the configured hold duration; the seat is reported held for that booker with that deadline, before and one second before the deadline; the other configured seats stay free; no seat report and no seating-area answer carries the hold reference. |
| law-deadline-is-now-plus-duration | For generated seats, bookers, hold durations and clock positions, a booker holds a free seat after the clock has been moved on. | The deadline answered equals the time read from the demonstration clock immediately before the hold plus the configured hold duration in seconds, computed by the test itself. |
| law-hold-only-on-free | For generated seats, booker pairs and clock positions, a second booker holds a seat the first booker already holds. | The second booker is refused with HTTP 409 and the reason code seat-held, and the seat is still reported held for the first booker with the unchanged deadline. |
| law-refusal-is-inert | For generated seats, bookers and clock positions, a refused hold is sent, either for a seat the seating area does not have or without naming the booker. | The seating-area observation after the refusal equals the one taken before it, and the time the service reports moves only by the seconds the demonstration clock was given. |
| law-report-is-idempotent | For generated seats, bookers and clock positions, the seating area is read twice in a row with no command and no clock move between the readings. | The two readings are equal. |
| law-every-hold-is-released | For generated seats, bookers, hold durations and moments strictly before the deadline, including exactly one second before it, the seat held by a booker is read. | The seat is still reported held for that booker with the same deadline at every moment before the deadline. |
| cc-opaque-reference | For generated seat pairs and a booker, the same booker holds two free seats and the seats are then read. | Each hold reference has opaque UUID shape, the two references differ, neither contains the seat identifier or the booker name, and neither appears in a seat report or in the seating-area answer. |
| law-wire-shape-no-such-seat | A booker holds a seat identifier that is not in the fixed seating area. | HTTP 404 with the reason code no-such-seat, a human message and the identifier that was sent. |
| law-wire-shape-invalid-request | A hold is sent for a configured seat without naming the booker. | HTTP 400 with the reason code invalid-request, a human message and the path of the field that failed. |
| restart-loses-every-hold | A booker holds a seat, the service process stops and a service with the same seating area starts again. | The seating area is reported with every configured seat free, so no hold survives the restart. |
| arch-dependency-direction | Every module under src/domain is read, including modules added after this change, and its import specifiers are resolved. | The set of seat-rule modules is not empty and no specifier resolves into src/app or src/adapter. |

## Oracle
`tests/acceptance/hold-a-free-seat.test.ts`

## Supports
- `package-lock.json`
- `package.json`
- `tests/acceptance/support/seat-api-client.ts`
- `tests/acceptance/support/start-test-service.ts`
- `tests/architecture/dependency-direction.test.ts`
- `tsconfig.json`
- `vitest.config.ts`
