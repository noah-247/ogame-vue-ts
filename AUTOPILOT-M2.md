# Autopilot M2

## Steward alerts

Enabled planetary autopilots keep monitoring even while construction is paused or in execute mode. The panel badge counts active alerts across enabled planets. In-app and browser notifications follow the existing notification settings; an unchanged alert is not repeated, but escalation or resolution followed by recurrence rearms it.

Ore warnings estimate the time to the existing 5% decay boundary, not complete exhaustion. The forecast uses actual production (including the 20% depleted yield), regeneration, mining technology, and geological facilities. Missing deposits and moons are ignored.

Warehouse warnings use current net production and officer-adjusted storage capacity. Full or overflowing storage reports zero hours, including when production is stopped. Power warnings estimate buffer exhaustion using M1's conservative worst-order check, including waiting jobs and loss of expiring officer bonuses. Pending energy producers are not credited in advance.

Per-planet warning windows default to 24 hours for ore and 6 hours for warehouse/power, adjustable from 0 to 720 hours. Zero means only an already reached limit warns. Predictions use the current game speed; paused resource production does not drain buffers. These are current-rate estimates, not event-by-event simulations of future construction.

## Transport suggestions

The panel recalculates suggestions from live state, including building prerequisites and empire research at the selected laboratory. Suggestions match overflow risk to target shortages, retain the donor's target costs and resource reserves, and cap deliveries to recipient storage space. Each amount is discounted to 80%; in-flight cargo is not precisely deducted, so the UI explicitly labels estimates conservative. Suggestions are never saved.

One-click confirmation revalidates the suggestion, cargo ships, mission slots, cargo plus fuel, and available resources synchronously. It dispatches through the existing fleet validation, dispatch, and transport mission logic, including moon destinations and fuel statistics. A stale suggestion fails without side effects; no automatic dispatch occurs.

## Expedition reminders

Only the player's returning expeditions from enabled origins qualify. Each planet has a reminder window, defaulting to 30 minutes; zero disables it. Reminders use the mission's actual return timestamp (already incorporating expedition zone travel), never alter dispatch or settlement, and do not emit overdue reminders after offline jumps. Each mission reminds once per app session, regardless of subsequent changes to the window.

## Incoming fleets

The autopilot header opens the same existing enemy-alert notification panel as the global IncomingFleetAlerts banner. It adds no hostile-fleet detection or dispatch logic.

## First-enable monitoring

First enable examines the next single level of unfinished building goals, counting strictly more-than-limit jobs against a strict majority. When there are no unfinished goals, existing mines provide the maturity baseline without injecting new goals. Factories, nanites, officer speed bonuses, the selected 2/4/8-hour limit, moon compatibility, and completed goals are respected. An established M1 autopilot with planning history keeps its existing mode.

A mature first-time user enters explicit monitoring mode: alerts and reminders remain enabled, but new automatic buildings and promotion of persisted autopilot waiting jobs are blocked. Only identifiable autopilot waiting buildings are withdrawn; active jobs and manual/legacy waiting jobs remain intact. Changing factories or toggling enable never silently exits monitoring. The player must explicitly confirm execution of approved goals. First-enable time and mode persist with the planet; transport suggestions do not.

## Verification

M2 adds 111 tests, bringing the suite to 297 tests across 14 files. Eight locale dictionaries each have 108 `autopilot` leaf keys (27 added in M2); the cross-check validates key and interpolation-placeholder parity.

The VM's pnpm 12 dependency preflight rejects the existing package.json/lockfile override layout. Without modifying dependencies or lockfiles, validation runs with that preflight disabled:

```sh
pnpm --config.verifyDepsBeforeRun=false vitest run
pnpm --config.verifyDepsBeforeRun=false exec vue-tsc -b
```
