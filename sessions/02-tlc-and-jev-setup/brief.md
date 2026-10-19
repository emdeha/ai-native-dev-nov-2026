# TLC and Jev setup

- Session ID: `2f8424fe-9ae3-4f8e-8870-b79196bf3aaf`
- Started: 2026-10-19T21:09:56.309Z
- Last activity: 2026-10-19T21:48:17.918Z
- Human prompts: 14

## Prompt 1

<command-message>nw-buddy</command-message>
<command-name>/nw-buddy</command-name>
<command-args>I have 1.5 hours to do a workshop that showcases nwave's 6-wave flow and how it focuses on determinism. This is the exact topic.

AI coding agents are surprisingly good at writing code. The problem is keeping them aligned with what you actually asked for as a project grows.

In this 90-minute hands-on workshop, we'll build an application with nWave and follow an idea all the way to working code. We'll see how nWave turns expectations into executable checks, uses Agda and TLA+ to verify design decisions, and runs implementation through a deterministic execution system designed to prevent context drift between intent, design, code, and validation.

Rather than prompting an agent and reviewing what comes back, we'll work through an expectation-driven development loop where each step produces constraints for the next. Along the way, we'll examine the generated code, tests, and verification artifacts to understand what the system can guarantee — and where human judgment still belongs.

You'll leave with a working application and a concrete model for building agentic development workflows where correctness doesn't depend on an agent remembering the right context.



Let's figure out building what application will show nwave's capabilities best. And will fit in 1.5 hours. Fitting in the timeslot isn't a must as I can have snapshots in case time doesn't permit.</command-args>

## Prompt 2

Go with Option A and Last Seat. Install TLC first and the dry run. Also let's set up Jev as it's also configured. Walk me through this set up

## Prompt 3

stored jev's key in a gitignored .env

## Prompt 4

okay, how should I change the local claude code config exactly?

## Prompt 5

<bash-input> [ -n "$TYPESAFE_API_KEY" ] && echo "key present" || echo "key MISSING"</bash-input>

## Prompt 6

<bash-stdout>key present</bash-stdout><bash-stderr></bash-stderr>

## Prompt 7

saved

## Prompt 8

1. Jev may receive task text and public design and test fragments for Last Seat, but no secrets, personal data or source-blind EXAMINE material.
2. I've installed them by hand. verify
3. deleted .env

## Prompt 9

let's go with Option B

## Prompt 10

done

## Prompt 11

done

## Prompt 12

done

## Prompt 13

Run the dry run in a separate branch. Once we're ready with all the waves and stuff, we'll rebase main on it and save proper git snapshots

## Prompt 14

great, let's commit the discuss result so we can have a snapshot. and push all to the branch. then I'll execute DESIGN in a separate claude session to clear the context
