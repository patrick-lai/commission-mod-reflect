# Reflect

A built-in [CommissionAI](https://github.com/patrick-lai) mod (protocol 3). Offers to keep a correction or convention for later sessions.

When you correct the agent or state a convention, Laya or JEV (through the daemon, no keys in the mod) classifies the message; above the 0.8 floor a band appears over the composer: Save as coding rule, Save to Context, Edit or Skip. Below the floor it stays quiet. Repeats merge into one band with a count. A lesson you skip is not offered again in that repository, including similar wording and after a restart: Reflect keeps a short list through the daemon's `mod.store`, so it needs an app that has that capability. Save to Context appends to the best-fitting agent-managed note or starts a new one; it never touches notes you wrote, AGENTS.md or CLAUDE.md. `eval/` holds the frozen eval and its protocol (`node eval/run.mjs`).

## Rules it follows
- It only adds beside a core surface; with it off, crashed or outdated, the app looks and behaves exactly as without it.
- It never allows, rejects or delays anything, and never saves anything without a button the person presses.

## Develop
```sh
node --test 'mods/reflect/test/*.test.mjs'
COMMISSION_MODS_DIR=$PWD/mods   # point a dev daemon at this checkout; edits show on the next event or refresh
```
Node 20 or newer, no npm dependencies. The contract (manifest, worker protocol, hooks, capabilities, slots) is in CommissionAI's `docs/mods.md`, section "Protocol 3".

## Ship
CommissionAI registers this repository as a built-in pack and follows its head: push to `main` and every install picks it up within a day, without an app release.
