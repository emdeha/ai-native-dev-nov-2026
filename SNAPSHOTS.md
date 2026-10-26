# Snapshots

Each commit on `dry-run/last-seat` is a snapshot. It holds the project state and the Claude Code sessions recorded up to that point. `sessions/INDEX.md` and the session briefs show only what had happened by then.

| Tag | What the state holds |
|---|---|
| `snapshot-01` | DISCUSS brief |
| `snapshot-02` | DESIGN with Quint, TLA+ and Agda models |
| `snapshot-03` | DESIGN amendment: test substrate becomes acceptance-owned |
| `snapshot-04` | Value 1 oracle (hold a free seat), toolchain, lockfile |
| `snapshot-05` | Value 2 oracle (confirm a held seat) |
| `snapshot-06` | Value 3 oracle (one seat is never sold twice) |
| `snapshot-07` | Value 4 oracle (every hold is released) |
| `snapshot-08` | Session tracker complete, sessions up to date |

## Move between snapshots

```sh
git checkout snapshot-04
git checkout dry-run/last-seat
```

Run `npm install` after a checkout that has a `package.json`. Run `git checkout dry-run/last-seat` to return to the latest state.

## Record sessions

The `session-tracker` agent runs `python3 -I sessions/update-sessions.py`. Claude Code loads agents at session start, so start a new session before you call it. Add `--include-unnamed ID...` to record sessions that have no custom name.

The commit history before the snapshots is kept as `backup/pre-snapshot-rewrite` and the tag `backup-pre-snapshot-rewrite`.

## nWave state per snapshot

Each snapshot has a twin tag `snapshot-NN-nwave`. It is the same snapshot plus one commit that adds `nwave-state/`. That folder holds the nWave DES state for the stage: the handover, the turn records (oracle, craft, verify) and any verify evidence. Git ignores the live state in `.nwave/des` and does not carry `refs/nwave`, so a plain checkout loses it.

```sh
git switch -c demo-from-snapshot-11 snapshot-11-nwave
sh nwave-state/restore.sh
des state --repo-root "$(pwd -P)"
```

The restore parks your current DES records under `refs/nwave-backup/<time>` and `.nwave/restore-backup/<time>` before it installs the ones for the stage. Snapshots 02 to 08 use the handover from snapshot 09 (design only for 02 and 03). Snapshot 01 has no DES state. Snapshots 17 to 19 keep the verify evidence, but the reviewer step stays unavailable there, because their candidate is the commit itself.
