---
name: snapshot-jump
description: Skip ahead in the Last Seat demo by moving to a snapshot tag (snapshot-01 to snapshot-19) on a new branch. Use when the user is stuck or short of time and wants to continue from a later known-good state. Trigger, /snapshot-jump [number].
---

# Snapshot jump

Move the user to a known-good snapshot of the Last Seat demo without losing their current work.

Snapshots are Git tags named `snapshot-NN`. Each tag is one commit on `dry-run/last-seat`.
Each snapshot also has a twin tag `snapshot-NN-nwave`. It is the same snapshot plus one commit that adds `nwave-state/`: the nWave DES state for that stage (handover, turn records, verify evidence). Jump to the twin tag so the nWave steps start from the right place.

## Snapshot map

| Tag | State |
|---|---|
| `snapshot-01` | DISCUSS brief |
| `snapshot-02`, `snapshot-03` | DESIGN (Quint, TLA+, Agda models; acceptance-owned test substrate) |
| `snapshot-04` to `snapshot-07` | Acceptance oracles for values 1 to 4 |
| `snapshot-08` to `snapshot-10` | Session tracker and recorded sessions |
| `snapshot-11` | Value 1 delivered: hold a free seat |
| `snapshot-13` | Value 2 delivered: confirm a held seat |
| `snapshot-15` | Handover for value 3 |
| `snapshot-16` | Value 4 delivered (cancel a held seat), then value 3 recorded |
| `snapshot-17`, `snapshot-18` | Handover and verify session |
| `snapshot-19` | Seat demo UI |

If the map is out of date, run `git tag -l 'snapshot-*' -n1` or `git log --oneline --grep='^snapshot'`.

## Steps

1. **Pick the target.**
   - If the user gave a number, use `snapshot-NN`.
   - If not, ask which step they want to reach. Recommend the snapshot just after the step they are stuck on, so the demo keeps its order.
   - Use `snapshot-NN-nwave` when it exists. Use `snapshot-NN` only when it does not.
   - Check the tag exists: `git rev-parse --verify snapshot-NN-nwave^{commit}`. If it is missing, run `git fetch --tags` and check again.

2. **Look at the current state.** Run `git status -sb` and `git branch --show-current`.

3. **Park the current work.** Never discard it without an explicit yes.
   - Clean tree: nothing to do.
   - Dirty tree: ask the user to choose.
     - **Commit** (default): `git add -A && git commit -m "wip: stuck before snapshot-NN"`
     - **Stash**: `git stash push -u -m "stuck before snapshot-NN"`
     - **Discard**: only if the user says so. Show `git status --short` first.

4. **Create the new branch from the tag.**
   ```
   git switch -c demo-from-snapshot-NN snapshot-NN-nwave
   ```
   If that branch name is taken, add a suffix such as `-2`. Do not use a detached `git checkout snapshot-NN`. Commits made there are easy to lose.

5. **Restore the nWave state.** If `nwave-state/restore.sh` exists, run `sh nwave-state/restore.sh`. It parks the user's current DES records under `refs/nwave-backup/<time>` and `.nwave/restore-backup/<time>`, then installs the `.nwave/des` state and `refs/nwave` turn records for this stage. Then run `des state --repo-root "$(pwd -P)"` and tell the user the next step it names. The restore touches only ignored local DES state and `refs/nwave*`, never a branch or a tag.

6. **Confirm.** Run `git log --oneline -1` and tell the user:
   - the branch they are on,
   - the branch that holds their parked work (or the stash name),
   - how to get a single file back: `git checkout <old-branch> -- <path>`.

## Rules

- Do not push, delete branches, or rewrite history.
- Do not move the old branch.
- If the user wants one or two of their own commits on the new branch, use `git cherry-pick <commit>`.
- If the user is on another machine, run `git fetch --tags` first.
