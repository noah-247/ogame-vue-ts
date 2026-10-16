# Save fixtures

All fixtures contain plaintext JSON, not ciphertext. They model persisted Pinia
state subsets rather than `GameState`, which also includes a non-persisted universe.

| File | Version | Purpose | Tests |
| --- | --- | --- | --- |
| `new-game.json` | v1 | Default-like state with empty planets and technologies | Encryption round trip, migration, store serializer |
| `new-game-v0.json` | v0 (no version field) | The same state before save versioning | Migration, legacy ciphertext hydration |
| `mid-game.json` | v1 | One planet, several building/research levels and two active build items | Encryption round trip, migration, store serializer |

Planet and player field names follow `src/types/game.ts`. Record maps are sparse,
as in the initial store; omitted levels/counts are not invented by migration.
The mid-game planet includes the required resources, queue, timestamp, capacity,
position and moon fields. Optional achievements and ore deposits are omitted.
Queue timestamps are fixed milliseconds, so fixtures are deterministic.

## M0 infrastructure boundaries

Run `pnpm test` or `pnpm test:watch`; tests use the Node environment and an in-memory
Storage implementation where needed. Type checking includes the test suite via
`tsconfig.test.json`. Register `afterEach(restore)` when using `test/utils/time.ts`.

The save pipeline is decrypt, migrate, then validate. Only the version envelope is
validated; M0 does not add gameplay validation, repair fields, change time handling,
or introduce autopilot state. Add each future version step to the migration registry
in `src/logic/saveMigration.ts` and cover it with fixtures before raising `SAVE_VERSION`.

`decryptData` retains its existing logging and `{}` fallback for legacy callers;
the save pipeline opts into strict errors. `parseSave` throws typed `SaveError`
subclasses. The store adapter catches load errors, preserves the exact ciphertext
under `ogame-vue-ts.corrupted.<timestamp>` (with a suffix on collisions), reports the
error and returns `{}` so Pinia keeps its default state. It does not remove or
overwrite the original key during hydration. The installed persistedstate 4.7.1
plugin catches hydration exceptions and logs only when `debug` is enabled, so the
adapter reports failures explicitly. If localStorage refuses the backup, the adapter
reports both errors and still avoids a startup crash; durable recovery then depends
on the original key remaining available. AES and the storage key are unchanged.

## Restart-safe execution

The four test files run independently with fixed timestamps and fixtures. After an
interruption, rerun an individual file with `pnpm vitest run test/save/migrate.test.ts`
or rerun the whole short M0 suite. No test depends on another file's memory, a live
clock or network services. Long-running stage/seed manifests belong to later
simulation work, not this small infrastructure suite.

## Local validation on 2026-10-16

The manifest and lockfile target Vitest 3.2.7, the V3 release in the available
registry metadata. The network proxy was unreachable and that tarball was not
cached, so a complete installation of the target version could not be verified.
The suite passed with the cached Vitest 3.2.4 against rolldown-vite 7.2.5:
4 test files and 49 test cases. Full `vue-tsc -b` passed with TypeScript 5.9.3
and vue-tsc 3.1.8, including the test project.

Validation used cached pnpm 9.11.0 because the preinstalled pnpm 11/12 ignores
the existing `package.json` pnpm overrides. Once network access is restored, use
a compatible pnpm version to install the declared dependencies and rerun
`pnpm vitest run` and `pnpm exec vue-tsc -b`; Vitest 3.2.7 acceptance remains pending.
