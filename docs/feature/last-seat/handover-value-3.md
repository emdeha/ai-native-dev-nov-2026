# Handover: deliver Last Seat value 3

For the next agent. Route: nWave spine waves. Task: DELIVER value 3 only.
Report in ASD-STE100 Simplified Technical English. Say which route you take.

## Start here

1. Read `CLAUDE.md` (project) and `~/.claude/skills/nw-typesafe-system-one/SKILL.md`.
2. Run `des state --repo-root "$(pwd -P)"`. Expect VALUE-1 and VALUE-2 craft=recorded, VALUE-3 and VALUE-4 craft=absent.
3. Branch: `dry-run/last-seat`. Last commit: snapshot 15 (this handover).

## Value 3

"Through the HTTP API, a second booker is refused a seat that is held or sold, and only the holder of the hold reference can confirm it, so the seat is never sold twice."

- Oracle (recorded RED, do not edit): `tests/acceptance/one-seat-is-never-sold-twice.test.ts` (3 tests).
- Supports: `tests/acceptance/support/`. Architecture test: `tests/architecture/dependency-direction.test.ts`.
- Design: `docs/feature/last-seat/architecture/brief.md`, sections "Shared design" and "Value 3" (starts near line 4174). Acceptance: `docs/feature/last-seat/acceptance/brief.md`. Models: `docs/feature/last-seat/model/`.
- Value 3 design targets (all exist, value 3 extends them): `src/domain/seat-transition.ts`, `src/adapter/http/wire.ts`, `src/adapter/http/seat-routes.ts`. Value 3 adds no port and no shared decision.

## Measured state at handover

Value 2 craft already built most refusal behaviour. Run result before any value 3 work:

| Oracle | Result |
|---|---|
| hold-a-free-seat (value 1) | GREEN, 17 tests |
| confirm-a-held-seat (value 2) | GREEN, 13 tests |
| dependency-direction | GREEN |
| one-seat-is-never-sold-twice (value 3) | 2 pass, 1 FAIL |
| every-hold-is-released (value 4) | 5 fail, 8 pass (not your task) |

The failing value 3 test is the property test "whatever order bookers ask, buy, give up and wait, no seat is ever sold to two bookers". It names `law-only-the-holder-acts` and `law-sold-is-absorbing`. "Give up" means cancel. The cancel route is value 4 work and does not exist yet.
Do not guess. Run the test, read the failure, and decide whether value 3 can turn it GREEN without the cancel route.
If it cannot, the oracle needs value 4 code. In that case do not edit the test. Stop and report the exact test and reason.
Route to the acceptance designer with `des prepare-role --role acceptance-designer --task selected-revision-recovery`.

## Steps

1. Put the host context below in a file in the scratchpad.
2. Render the prompt: `des handoff --repo-root "$(pwd -P)" prompt --role nw-functional-software-crafter --value 3 --root-context FILE > PROMPT_FILE`. Never paste the rendered prompt (about 80 KB) inline.
3. Invoke Agent with `subagent_type: nw-functional-software-crafter`. Task: "read PROMPT_FILE whole and do what it says; deliver value 3 only". Tell it to write production files early and report by turn 35. If it stops at its turn limit, resume it with SendMessage and ask for the final report.
4. Record: `des craft --repo-root "$(pwd -P)" --value 3 --input -` with `{"structured_output":{"outcome":"accepted","diagnostic":"...","blocked_by":null}}` on stdin. It must record the oracle GREEN.
5. Run `npx tsc --noEmit` and `npx vitest run tests/acceptance/one-seat-is-never-sold-twice.test.ts tests/acceptance/confirm-a-held-seat.test.ts tests/acceptance/hold-a-free-seat.test.ts tests/architecture/dependency-direction.test.ts`. Values 1 and 2 must stay GREEN.
6. Ask the `session-tracker` agent to sync `sessions/`. Unnamed sessions need the user to confirm `--include-unnamed <id-prefix>`.
7. Commit only owned files as the next `snapshot-NN` (snapshot 16). Never `git add -A`. Never stage `.nwave/des/**`.
8. Stop. `des verify`, the independent review, EXAMINE and `des integrate` are Request-wide and run once, after value 4 is crafted.

## Host context (copy into the root-context file)

- Typesafe: Jev is authorized for this repo by the human (minimal state, never secrets).
- User standards: strict TypeScript, no `any`, no type assertions (`as`), no comments, immutable data, small pure functions, options objects, functional paradigm, TDD (the oracle is already RED; write the minimum code to turn it GREEN). Do not edit the oracle, supports (`tests/**`, `vitest.config.ts`, `tsconfig.json`, `package.json`) or design documents. If the oracle looks wrong, stop and report the exact test and reason.
- Wire contract (accepted, final): `node src/main.ts` with env `SEAT_INVENTORY`, `HOLD_DURATION_SECONDS`, `PORT` on 127.0.0.1; seat report `{seatId,status,holder|owner,deadline}`; confirm and cancel 200 answer the seat report; refusal `{reason,message}`; demo clock answer `{now}` only; no read-only clock route; the hold reference never appears in a seat report. Expiry is lazy; the deadline is authoritative: a confirm at or after it is refused with reason `hold-expired`. The reason code for cancel on a sold seat is undeclared (only refusal plus no change is asserted).
- Node 24.9 runs `.ts` natively: explicit `.ts` import specifiers, erasable syntax only (no enums, no parameter properties).
- `src/domain` imports nothing from `src/app` or `src/adapter` (the architecture test enforces it).
- The sandbox blocks the network; `node_modules` is installed. Do not install packages.

## Facts from value 2 the crafter must know

- `src/domain/seat-state.ts` has `FreeSeat`, `HeldSeat`, `SoldSeat` and the `sold` outcome. `SoldSeat` has an owner only, no deadline, no hold reference, by construction.
- `src/domain/seat-transition.ts`: `step` takes a `Command` union (`HoldCommand | ConfirmCommand`). A cancel command will extend this union in value 4.
- `src/app/seat-service.ts`: private `commanded` does read, decide and write in one turn. A refusal writes nothing.
- `src/adapter/http/wire.ts`: `outcomeAnswer` is the single map from outcome to HTTP answer. `holdPathSchema` parses the hold reference and names the field `holdRef` on failure.
- The confirm transition reads the stored record one time, only to name the refusal: `hold-expired` when the stored hold carries the presented reference, `no-such-hold` otherwise. The projection (`view`) alone decides grant or refuse.

## Open risks and residuals (do not fix silently)

- A refused hold draws one random UUID from the HoldReferences port before the domain step decides. Not visible through HTTP. Left for review.
- The confirm refusal-naming read must be accepted by the reviewer as consistent with the single projection rule.
- Backwards host clock (owner: user). Demo clock open to anyone (owner: user). Single-process assumption (owner: architect). A future direct store read that skips the expiry check (owner: review).
- Value 1 files outside the design target list: `src/main.ts`, `src/app/ports.ts`, `src/adapter/clock.ts`, `src/adapter/memory/in-memory-seat-store.ts`.

## Git rules

- Do not delete branch `backup/pre-snapshot-rewrite` or tag `backup-pre-snapshot-rewrite`.
- Do not push unless the user asks. `dry-run/last-seat` was force-pushed to origin at snapshot 15 at the user's request.
