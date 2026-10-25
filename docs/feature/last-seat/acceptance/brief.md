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
###     Through the HTTP API, the holder confirms their held seat before its deadline and the seat is then reported as sold to that holder.

## Acceptance Obligations
| ID | Stimulus | Expected result |
| --- | --- | --- |
| V2-obs | The booker holding a seat confirms it one second before the deadline, and the clock then moves far past that old deadline. | The confirmation reports the seat sold to that booker, the seat report says sold with the owner named, no deadline and no hold reference, and the report long after the old deadline is identical. |
| law-deadline-is-authoritative | A confirmation of a held seat sent at a generated moment, including exactly one second before the deadline, exactly at the deadline and long after it. | Before the deadline the seat is sold to the holder; from the deadline second on the confirmation is refused as expired, the seat is reported free and the seating area is unchanged. |
| law-only-the-holder-acts | A booker who holds one seat confirms another booker's seat with the reference of their own hold. | The confirmation is refused as an unknown hold, the other booker keeps the seat held until the same deadline, and the seating area is unchanged. |
| law-sold-is-absorbing | After a sale, a hold by another booker, a second confirmation with the old reference and a clock advance follow in a generated order. | After every one of those commands the seat is still reported sold to the first owner, with no deadline and no holder. |
| cc-sold-has-no-deadline | The seat report and the seating area are read right after a sale and again long after the deadline the hold had. | A sold seat carries an owner only: no deadline and no hold reference appear in any answer, so no expiry can ever release it. |
| law-wire-shape:W-case-confirmed | A confirmation sent by the holder before the deadline. | HTTP 200 with the report of that seat as sold to the holder. |
| law-wire-shape:W-case-no-hold | A confirmation carrying a reference the seating service never granted. | HTTP 404 with reason code no-such-hold, no reference of any live hold in the answer, and an unchanged seating area. |
| law-wire-shape:W-case-no-seat | A confirmation naming a seat the seating area does not have. | HTTP 404 with reason code no-such-seat and the identifier that was sent. |
| law-wire-shape:W-case-sold | A second confirmation of a sold seat, and a hold asked for that sold seat by another booker. | HTTP 409 with reason code seat-sold in both cases, and the seat still reported sold to its owner. |
| law-refusal-is-inert | Every refused confirmation of this value: expired, wrong reference, unknown reference, already sold. | The seating area read after the refusal is identical to the one read immediately before it. |
| D-restart-loses-state | The service is restarted after a seat was bought. | Every seat is free again and the bought seat cannot be told from a seat nobody ever bought. |

## Oracle
`tests/acceptance/confirm-a-held-seat.test.ts`

## Supports
- `package-lock.json`
- `package.json`
- `tests/acceptance/support/seat-api-client.ts`
- `tests/acceptance/support/start-test-service.ts`
- `tsconfig.json`
- `vitest.config.ts`
- `tests/architecture/dependency-direction.test.ts`
###     Through the HTTP API, a second booker is refused a seat that is held or sold, and only the holder of the hold reference can confirm it, so the seat is never sold twice.

## Acceptance Obligations
| ID | Stimulus | Expected result |
| --- | --- | --- |
| V3-obs | A booker holds a seat; a second booker asks for it and a stranger confirms it with a reference nobody was given; the holder then confirms with their own reference; the second booker asks again and the spent reference is presented again. | Both early requests are refused and the seating area reads byte for byte as it did before them; the holder's confirmation sells the seat to them alone; the later hold and the repeated confirmation are both refused as sold, and the seating area reads byte for byte as it did right after the sale. |
| cc-one-holder | Generated walks of three to eight holds, confirmations, cancellations and clock advances by three bookers over three seats, including two bookers racing for one seat. | No seat is ever reported sold to more than one booker during the walk, and every seat is reported once, in the configured order, with one holder or one owner at a time. |
| law-hold-only-on-free | In each generated walk, a hold asked for a seat the walk already made held or sold, and a hold asked after a cancellation or an expiry freed it. | The hold is granted only when the seat reads free at that moment, with the deadline the clock and the configured duration give; otherwise it is refused as held or as sold and nothing changes. |
| law-only-the-holder-acts | In the journey and in each generated walk, confirmations and cancellations carrying the reference of another seat's hold or a reference nobody was ever given. | Each is refused as an unknown hold, the holder keeps the seat with the same deadline, and the seating area answer is unchanged. |
| law-sold-is-absorbing | In each generated walk, holds, confirmations, cancellations and clock advances that follow a sale, over several seats at once. | Every later report names the same single owner for that seat, with no holder and no deadline, and every command on it is refused. |
| law-refusal-is-inert | Every refused command of the journey and of each generated walk: held, sold, unknown reference, expired hold. | The seating area answer taken after the refusal is byte for byte the answer taken immediately before it, and the time the service reports moves only by the seconds a demonstration advance asked for. |
| law-deadline-is-authoritative | In the generated walks, confirmations and cancellations that land one second before the deadline, exactly on the deadline second, and after a clock jump far past several hold durations. | Before the deadline the holder's command succeeds; from the deadline second on it is refused as expired, the seat reads free and the next booker can hold it. |
| law-wire-shape:W-case-held | A second booker asking for a seat somebody is holding. | HTTP 409 with reason code seat-held, and the holder keeps the seat. |
| law-wire-shape:W-case-sold | A hold asked for a sold seat, and the spent hold reference of that sold seat presented again. | HTTP 409 with reason code seat-sold in both cases, never a reason that hides the sale behind an unknown reference. |
| law-wire-shape:W-case-no-hold | Two confirmations of one held seat: one carrying a reference nobody was ever given and one carrying the live reference of another booker's hold on another seat. | Both answer HTTP 404 with reason code no-such-hold and the same body, so a stranger cannot tell a live reference from one that never existed. |
| law-wire-shape:W-case-cancelled | The holder of a seat giving the hold up with their own reference inside a generated walk. | HTTP 200 with that seat reported free, and the next booker who asks for it is granted the hold. |
| arch-dependency-direction | Every module under the domain folder is read for the modules it imports. | No domain module imports an application or adapter module, so the pure transition stays testable on its own. |

## Oracle
`tests/acceptance/one-seat-is-never-sold-twice.test.ts`

## Supports
- `package-lock.json`
- `package.json`
- `tests/acceptance/support/seat-api-client.ts`
- `tests/acceptance/support/start-test-service.ts`
- `tsconfig.json`
- `vitest.config.ts`
- `tests/architecture/dependency-direction.test.ts`
###     Through the HTTP API, an unconfirmed hold is released - at once when the holder cancels, and automatically when its deadline passes - and the seat is then reported as free, while a sold seat is never released.

## Acceptance Obligations
| ID | Stimulus | Expected result |
| --- | --- | --- |
| the-holder-gives-the-seat-up | The booker holding a seat sends the cancellation of that hold with the reference the hold was granted with, well before its deadline. | The cancellation answers the seat as free, the seat report is free with no holder and no deadline, and the next booker is granted it with a reference of their own and a deadline of the time of that grant plus the hold duration. |
| a-hold-nobody-confirms-ends-by-itself | A booker holds a seat and nobody acts until the time the service reports has reached the deadline of that hold. | On the deadline second the seat is reported free, and whoever asks first - including the booker who held it before - is granted it with a new reference and a new deadline. |
| the-reference-of-a-hold-that-ran-out-buys-nothing | The booker who was holding the seat sends a confirmation carrying their own reference on the deadline second of that hold. | The confirmation is refused with HTTP 409 and the reason code hold-expired, and the seating area reads exactly as it did before. |
| a-late-cancellation-is-refused | The booker who was holding the seat sends a cancellation carrying their own reference five seconds after the deadline of that hold. | The cancellation is refused with HTTP 409 and the reason code hold-expired, and the seating area reads exactly as it did before. |
| only-the-hold-s-own-reference-releases-it | A cancellation of a held seat carries the reference of a hold on another seat, and then a reference the service never granted. | Both are refused with HTTP 404 and the reason code no-such-hold, the seat is still held for its booker with the same deadline, and the seating area reads exactly as it did before. |
| a-refused-hold-never-lengthens-the-hold | A second booker asks halfway through a hold for the seat that is held, is refused, and then the time reaches the deadline the first hold was granted with. | On that deadline second the seat is reported free, and the second booker is then granted it with a deadline of the time of their grant plus the hold duration. |
| a-bought-seat-is-never-released | A booker buys a seat, the clock moves on by an hour, and a cancellation presenting the reference that bought it is sent. | The seat is still reported sold to its owner with no holder and no deadline, the cancellation is refused, and the seating area reads exactly as it did before. |
| every-hold-is-released-and-every-sale-survives | Any walk of holds, confirmations, cancellations and clock advances over the configured seats, followed by a wait long enough for every granted hold to run out. | Every seat whose granted deadline the time has reached is reported free, and every seat that was bought is still reported sold to the same booker. |

## Oracle
`tests/acceptance/every-hold-is-released.test.ts`

## Supports
- `package-lock.json`
- `package.json`
- `tests/acceptance/support/seat-api-client.ts`
- `tests/acceptance/support/start-test-service.ts`
- `tsconfig.json`
- `vitest.config.ts`
- `tests/architecture/dependency-direction.test.ts`
