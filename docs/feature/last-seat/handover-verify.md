# Handover: run `des verify` for Last Seat

For the next agent. Route: nWave spine waves. Task: run the VERIFY step for the whole Request, and only that step.
Report in ASD-STE100 Simplified Technical English. Say which route you take.

## Start here

1. Read `CLAUDE.md` (project) and `~/.claude/skills/nw-typesafe-system-one/SKILL.md`.
2. Run `des state --repo-root "$(pwd -P)"`. Expect VALUE-1 to VALUE-4 all `craft=recorded` and `NEXT: des verify --repo-root ...`.
3. Branch: `dry-run/last-seat`. Last commit: snapshot 17 (this handover), on top of snapshot 16 (`57a3c57`). Both are force-pushed to origin at the user's request.

## State at handover

- All four values are crafted and recorded. All oracles are GREEN: 5 test files, 44 tests. `npx tsc --noEmit` is clean.
- Order of work: value 4 was crafted before value 3. The value 3 oracle walk sends cancel commands, and value 4 owns the cancel route. Value 3 needed no production code of its own and was recorded with that diagnostic.
- Values 1 and 2 were re-recorded after value 4 changed shared files (they had shown `craft=bytes moved`).

## Steps

1. Run `des verify --repo-root "$(pwd -P)"`. Read the whole answer. Do not use `--fresh` unless DES asks for it or the first answer is stale.
2. If DES refuses, report the exact WHAT, WHY and HOW. Do not edit `tests/**`, `vitest.config.ts`, `tsconfig.json`, `package.json` or design documents to get past a refusal.
3. If verify succeeds, run `npx tsc --noEmit` and `npx vitest run`. All 44 tests must stay GREEN.
4. Follow the printed `NEXT` as advice only. The host chooses the route. The independent review (`/nw-review`), source-blind EXAMINE and `des integrate --candidate SHA` come after verify. Do them only if the user asks.
5. Commit only owned files as the next `snapshot-NN` (snapshot 18). Never `git add -A`. Never stage `.nwave/des/**`. Do not push unless the user asks.

## Open items for the review step (do not fix silently)

- **Design deviation (architect).** `ReleasedHold` and `CommandOutcome` are declared in `src/domain/seat-transition.ts`, because `src/domain/seat-state.ts` is not an owned target. Fix: move `ReleasedHold` into `Outcome` in `seat-state.ts` and add that file to the targets. The move changes no behaviour.
- **Cancel on a sold seat** answers `409 seat-sold`. `D-cancel-on-sold-reason-undeclared` leaves the reason open. The oracle asserts only refusal plus no change.
- **Authority conflict.** The acceptance brief puts cancel inside the value 3 walk. The design puts cancel in value 4. DES says value 3 is "already aligned" and offers no recovery step. A human must decide if this needs a DISTILL change.
- A refused hold draws one random UUID from the HoldReferences port before the domain step decides. Not visible through HTTP.
- The confirm and cancel refusal-naming read of the stored record must be accepted by the reviewer as consistent with the single projection rule (`view` alone decides grant or refuse).
- Backwards host clock (owner: user). Demo clock open to anyone (owner: user). Single-process assumption (owner: architect). A future direct store read that skips the expiry check (owner: review).
- Unnamed session `3ae1e734` is not recorded in `sessions/`. Recording it needs the user to confirm `--include-unnamed 3ae1e734`.

## Git rules

- Do not delete branch `backup/pre-snapshot-rewrite` or tag `backup-pre-snapshot-rewrite`.
- Do not push unless the user asks.
