# Last Seat

Workshop project: follow one idea from a sentence to working, verified code with nWave.

## The spec

> **Last Seat**: a seat reservation service with expiring holds. A user can hold a seat for a limited time, then confirm it, cancel it or let it expire. One seat is never sold twice, and every hold is eventually released.

Two guarantees drive the work:

- **Safety**: one seat is never sold twice.
- **Liveness**: every hold is eventually released, unless it is confirmed or cancelled.

Starting constraints:

- Language: TypeScript, strict mode.
- Public port: a tiny HTTP API. A thin UI on top of it is optional and comes last.
- Everything else (hold length, who may cancel, what happens at the deadline) is decided in DISCUSS.

## Before you start

Run these checks. Each must print a version.

```sh
node --version        # Node.js
java -version         # Java 21 is required by the Quint backend (Apalache)
quint --version       # npm install -g @informalsystems/quint
agda --version        # brew install agda
ls tla2tools.jar      # TLC, download from github.com/tlaplus/tlaplus/releases
```

Run TLC with `java -jar tla2tools.jar -config M.cfg M.tla`. A sandboxed shell needs a writable temp directory: add `-Djava.io.tmpdir=<dir>`.

## The waves

Open Claude Code in this folder and run one wave at a time. Each wave leaves a document that the next wave must respect.

| Wave | Command | What it produces |
|---|---|---|
| DISCUSS | `/nw-discuss` | The product brief: outcomes, scope, ordered increments, scenarios |
| DESIGN | `/nw-design` | Architecture, plus Quint, TLA+ and Agda models that check the design |
| DISTILL | `/nw-distill` | Executable acceptance tests that fail before any code exists |
| DELIVER | `/nw-deliver` | The implementation, measured against those tests |

Start DISCUSS with the spec above, word for word.

## Stuck or short of time

Known-good states are saved as Git tags `snapshot-01` to `snapshot-19` on the branch `dry-run/last-seat`. Run `/snapshot-jump <number>` to move to one on a new branch. Your own work is kept.

## What to look for

- Each step produces constraints for the next. Nothing relies on an agent remembering earlier context.
- A refused step writes nothing. Read the reason and fix the input.
- Human judgment stays with you: hold length, the deadline rule and scope are your decisions, not the tools'.
