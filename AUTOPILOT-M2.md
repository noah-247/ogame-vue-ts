# Autopilot M2

## Steward alerts

Enabled planetary autopilots keep monitoring even while construction is paused or in execute mode. The panel badge counts active alerts across enabled planets. In-app and browser notifications follow the existing notification settings; an unchanged alert is not repeated, escalation notifies immediately, and a resolved key must remain absent for 30 game minutes before recurrence rearms it. Notification state is session-local. Silent time skips update alert/reminder state but group fresh notifications into the single skip-summary toast instead of delivering individual in-app or browser notifications.

Ore warnings estimate the time to the existing 5% decay boundary, not complete exhaustion. The forecast uses actual production (including the 20% depleted yield), regeneration, mining technology, and geological facilities. Missing deposits, moons, and nonpositive net depletion (including deposits recovering inside the decay region) are ignored.

Warehouse warnings use current net production and officer-adjusted storage capacity. Full or overflowing storage reports zero hours, including when production is stopped. Expiring storage bonuses conservatively shrink capacity to its unboosted value at the earliest storage-officer expiry; the forecast takes the earlier of filling current storage and filling the smaller storage no earlier than expiry.

Power warnings follow the game's binary production switch: current energy production below consumption is immediately critical (0 hours), regardless of stored energy. Harmful active construction/demolition completions are accumulated in end-time order; the first negative balance gives the outage timestamp. Expiring energy bonuses are conservatively removed at expiry, including their interaction with harmful construction. Pending energy producers are not credited in advance. If only waiting jobs threaten the balance, a warning uses the earliest active building-slot release (or 0 hours with unknown start time and no active construction), never a fabricated buffer-drain estimate.

Per-planet warning windows default to 24 hours for ore and 6 hours for warehouse/power, adjustable from 0 to 720 hours. Zero means only an already reached limit warns, except an unknown-start waiting power risk may still warn at 0 hours. Resource-rate predictions use the current game speed. Construction and officer-expiry timestamps are already game-clock times and are never scaled by game speed, including at speed zero. Resource-rate forecasts remain estimates, not full future-production simulations.

## Transport suggestions

The panel recalculates suggestions from live state, including building prerequisites and empire research at the selected laboratory. Suggestions match overflow risk to target shortages, retain the donor's target costs and resource reserves, and cap deliveries to recipient storage space. Outbound transport cargo is deducted from recipient shortages and free storage before discounting; destination IDs take precedence, with position plus moon identity used for manual/legacy missions without an ID. Returning cargo and other mission types do not count. Each remaining amount is discounted to 80% as a production-estimate margin. Suggestions are never saved. Reconfirming the same stale amount after dispatch fails revalidation; a smaller residual suggestion may remain.

One-click confirmation revalidates the suggestion, cargo ships, mission slots, cargo plus fuel, and available resources synchronously. It dispatches through the existing fleet validation, dispatch, and transport mission logic, including moon destinations and fuel statistics. A stale suggestion fails without side effects; no automatic dispatch occurs.

## Expedition reminders

Only the player's returning expeditions from enabled origins qualify. Each planet has a reminder window, defaulting to 30 minutes; zero disables it. Reminders use the mission's actual return timestamp (already incorporating expedition zone travel), never alter dispatch or settlement, and do not emit overdue reminders after offline jumps. Each mission reminds once per app session, regardless of subsequent changes to the window.

## Incoming fleets

The autopilot header opens the same existing enemy-alert notification panel as the global IncomingFleetAlerts banner. It adds no hostile-fleet detection or dispatch logic.

## First-enable monitoring

First enable examines the next single level of unfinished building goals, counting strictly more-than-limit jobs against a strict majority. When there are no unfinished goals, existing mines provide the maturity baseline without injecting new goals. Factories, nanites, officer speed bonuses, the selected 2/4/8-hour limit, moon compatibility, and completed goals are respected. An established M1 autopilot with planning history keeps its existing mode.

A mature first-time user enters explicit monitoring mode: alerts, reminders, and goal reconciliation remain enabled, but no automatic building actions run on monitored planets. Empire research also stops automatic actions when the selected laboratory is in monitoring mode. Promotion of persisted autopilot waiting buildings/research is blocked before the planning tick, and identifiable autopilot waiting jobs are withdrawn. Active jobs and manual/legacy waiting jobs remain intact. Changing factories or toggling enable never silently exits monitoring. The player must explicitly confirm execution of approved goals. First-enable time and mode persist with the planet; transport suggestions do not.

Transport-suggestion computation throttling (review m-6) is deferred to M2.1.

## Verification

M2 initially added 111 tests; this review patch adds another 46 regression cases, bringing the suite to 343 tests across 15 files. Coverage includes timestamp-based power outages, outbound cargo/repeated confirmation, alert resolution cooldown, recovering deposits, monitoring reconciliation and research boundaries, officer-adjusted arrival storage and storage expiry, and silent notification aggregation. Eight locale dictionaries each have 108 `autopilot` leaf keys (27 added in M2); the cross-check validates key and interpolation-placeholder parity.

The VM's pnpm 12 dependency preflight rejects the existing package.json/lockfile override layout. Without modifying dependencies or lockfiles, validation runs with that preflight disabled:

```sh
pnpm --config.verifyDepsBeforeRun=false vitest run
pnpm --config.verifyDepsBeforeRun=false exec vue-tsc -b
```
