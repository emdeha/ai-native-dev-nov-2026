
## nWave state per snapshot

Each snapshot has a twin tag `snapshot-NN-nwave`. It is the same snapshot plus one commit that adds `nwave-state/`. That folder holds the nWave DES state for the stage: the handover, the turn records (oracle, craft, verify) and any verify evidence. Git ignores the live state in `.nwave/des` and does not carry `refs/nwave`, so a plain checkout loses it.

```sh
git switch -c demo-from-snapshot-11 snapshot-11-nwave
sh nwave-state/restore.sh
des state --repo-root "$(pwd -P)"
```

The restore parks your current DES records under `refs/nwave-backup/<time>` and `.nwave/restore-backup/<time>` before it installs the ones for the stage. Snapshots 02 to 08 use the handover from snapshot 09 (design only for 02 and 03). Snapshot 01 has no DES state. Snapshots 17 to 19 keep the verify evidence, but the reviewer step stays unavailable there, because their candidate is the commit itself.
