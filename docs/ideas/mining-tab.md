# Mining tab (idea, not started)

Status: parked on 2026-10-24, to revisit. Nothing below is implemented yet.

## Why

Since Cycle 7 one composite asteroid yields several ores, so "how much of what did I mine" is no
longer the same question as "how far along is my build". A separate Mining tab would track mining on
its own, and could collect real data on what each asteroid kind yields.

## What the logs give us

- **Gamelogs** (already read by `packages/electron-shell/src/log/miningLogReader.ts`, parsed by
  `packages/core/src/log/parseMiningLine.ts`): one line per mined chunk with time, ore name and units:
  `[ 2026.10.24 07:59:01 ] (mining) You mined 18 units of Crustal Anorthosite Crystals`.
  Today these only feed build tracking (`mining-log-state.json`, per build).
- **No asteroid identity anywhere.** Mining lines carry no asteroid ID or kind (Pitch, Ingot, ...).
  LogLite only mentions composite asteroid IDs in sporadic render warnings
  (`composite asteroid 9223...: effect param BodyMeanColor absent`), which is not usable.
  So switching to a new asteroid has to be a click.
- **Scooping into the cargo hold is not logged.** Successful pickups leave no line in Gamelogs or
  LogLite; only failures do (`(info) 15.00 cargo units would be required ...`,
  `The cargo bay is overloaded and cannot be made to fit <ore> ...`). So "mined" means mined into
  space, not collected. (Checked with LogLite captures on 2026-10-23/24.)
- Asteroid kinds and which ores they carry come from ore descriptions (Cycle 7), see
  `data/stripped/ore_hints.json` (built by `scripts/strip-data.js`). The kind -> belt mapping is
  server-side (`res:/resource_substrate/*.json`, not shipped with the client).

## Proposal

1. **Session view.** Start/stop independent of builds. Per session: ore, units, m³, share %, rate per
   hour, duration. Fully automatic from Gamelogs; build tracking keeps reading the same lines.
2. **Per-asteroid records.** "New asteroid" button: everything mined after it goes to the current
   asteroid. Optional asteroid kind (Pitch, Ingot, ... picked by click, no typing) and system (from the
   Local chat log, as Scout does). "Done" saves the record.
3. **Stats per asteroid kind.** Average total yield per asteroid and ore proportions; compare with what
   the ore descriptions claim.
4. **Small mining overlay.** Current asteroid and what it has given so far, "New asteroid" / "Done",
   kind picker. Click-only, because overlays are non-focusable on Windows (no typing).

## Open questions

- Does the game show the asteroid kind (name, overview, hover)? If not, drop the kind picker and keep
  records as "asteroid #N, system, composition".
- Ship order: session view first (1), then asteroid records, stats and overlay (2-4)?
