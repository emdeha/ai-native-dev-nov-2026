---
name: snapshot-jump
description: Skip ahead in the Last Seat demo by moving to a snapshot tag (snapshot-01 to snapshot-19) on a new branch, with the nWave DES state for that stage restored. Use when the user is stuck or short of time and wants to continue from a later known-good state, or wants the next snapshot. Trigger, /snapshot-jump [number|next].
---

# Snapshot jump

Move the user to a known-good snapshot of the Last Seat demo without losing their current work. The user lands on a state where the nWave steps (`des state`, `/nw-distill`, `/nw-deliver`) start from the right place.

Snapshots are Git tags named `snapshot-NN`. Each tag is one commit on `dry-run/last-seat`.

Each snapshot also has a twin tag `snapshot-NN-nwave`. It is the same snapshot plus one commit that adds `nwave-state/`: the nWave DES state for that stage (handover, turn records, verify evidence) and `restore.sh`. Git ignores `.nwave/des` and does not carry `refs/nwave`, so a plain checkout of `snapshot-NN` loses that state. Always jump to the twin tag.

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

If the map is out of date, run `git tag -l 'snapshot-*' -n1`.

## Steps

1. **Pick the target.**
   - A number `NN` means `snapshot-NN`.
   - `next`, or no argument, means the snapshot after the one the user is on. Do not ask which one.
     - Find the current snapshot: `git describe --tags --abbrev=0 --match 'snapshot-[0-9][0-9]-nwave' HEAD`. If that fails, use `--match 'snapshot-[0-9][0-9]'`.
     - List the order: `git tag -l 'snapshot-[0-9][0-9]-nwave' | sort`. The target is the entry after the current one.
     - If the user is on the last snapshot, or no snapshot tag is an ancestor of `HEAD`, say so and ask which snapshot they want. Do not guess.
   - Use `snapshot-NN-nwave`. Use plain `snapshot-NN` only if the twin does not exist, and tell the user that the nWave state will not be restored.
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
   If that branch name is taken, add a suffix such as `-2`. Do not use a detached `git checkout`. Commits made there are easy to lose.

5. **Restore the nWave state.** If `nwave-state/restore.sh` exists, run `sh nwave-state/restore.sh`. It parks the user's current DES records under `refs/nwave-backup/<time>` and `.nwave/restore-backup/<time>`, then installs the `.nwave/des` state and `refs/nwave` turn records for this stage. It touches only ignored local DES state and `refs/nwave*`, never a branch or a tag. DES commands that build a candidate write under `.claude/`, so a sandboxed shell can refuse them. Run `restore.sh` and `des state` outside the sandbox if that happens.
   Then run `des state --repo-root "$(pwd -P)"` and read the next step it names. `NEXT` is advice only.

6. **Confirm.** Run `git log --oneline -1` and tell the user:
   - the branch they are on,
   - the branch that holds their parked work (or the stash name),
   - what `des state` shows and the next step it names,
   - how to get a single file back: `git checkout <old-branch> -- <path>`.

## Rules

- Do not push, delete branches, or rewrite history.
- Do not move the old branch or any snapshot tag.
- Run `npm ci` only if the user asks. A `package.json` appears from snapshot 04.
- If the user wants one or two of their own commits on the new branch, use `git cherry-pick <commit>`.
- If the user is on another machine, run `git fetch --tags` first. The `-nwave` tags are local until someone pushes them.
