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
position and moon fields. Each player includes the actual outputs of
`initializeAchievementStats()` and `initializeAchievements()`; optional ore deposits
are omitted. The legacy fixture still has no version field.
Queue timestamps are fixed milliseconds, so fixtures are deterministic.

`types.ts` derives the fixture player schema from `Player`, allowing the sparse
record maps already used by the store and widening JSON-imported string values.
The save tests check required fields and values in that schema, plus a reverse
`Record<Exclude<keyof typeof fixture.player, keyof Player>, never>` check for unknown
player field names. Literal `Player` ↔ `typeof fixture.player` assignments cannot
type-check: `Player` declares complete record maps, JSON empty arrays infer as
`never[]`, and optional player fields are required in the fixture's inferred type.
The adapter is test-only; no gameplay types or fixture business values are changed.

## M0 infrastructure boundaries

Run `pnpm test` or `pnpm test:watch`; tests use the Node environment and an in-memory
Storage implementation where needed. Type checking includes the test suite via
`tsconfig.test.json`. Global setup restores timers and stubbed globals after every
case; existing `afterEach(restore)` registrations remain safe and idempotent.

The save pipeline is decrypt, migrate, then validate. Only the version envelope is
validated; M0 does not add gameplay validation, repair fields, change time handling,
or introduce autopilot state. Add each future version step to the migration registry
in `src/logic/saveMigration.ts` and cover it with fixtures before raising `SAVE_VERSION`.

`decryptData` retains its existing logging and `{}` fallback for legacy callers;
the save pipeline opts into strict errors. `parseSave` throws typed `SaveError`
subclasses. The store adapter catches load errors, preserves the exact ciphertext
under `ogame-vue-ts.corrupted.<timestamp>` (with a suffix on collisions), reports the
error and returns `{}` so Pinia keeps its default state. It does not remove or
overwrite the original key during hydration. A failed hydration also locks future
serialization: mutations keep working in memory, but automatic persistence refuses
to overwrite the original key until reload. The adapter shows the existing Sonner
error toast once, using locale data without importing the store-dependent i18n
composable. `resetSaveLock()` resets both flags for tests only. Successful hydration
removes the version envelope before passing state to Pinia; the first subsequent
mutation writes the migrated v1 envelope. The installed persistedstate 4.7.1
plugin catches hydration exceptions and logs only when `debug` is enabled, so the
adapter reports failures explicitly. If localStorage refuses the backup, the adapter
reports both errors and still avoids a startup crash; durable recovery then depends
on the original key remaining available. AES and the storage key are unchanged.

## Restart-safe execution

The five test files run independently with fixed timestamps and fixtures. After an
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

## M0 review corrections validation on 2026-10-16

The corrected suite passes all 64 cases in five files, up from the 49-case baseline
(15 additional cases), and `pnpm exec vue-tsc -b` completes without errors.
Validation still uses cached pnpm 9.11.0 and Vitest 3.2.4: the system pnpm rejects
the existing manifest overrides, and the network proxy remains unreachable.
The one-off fixture generator used `node_modules/.bin/vite-node` with
`--config vitest.config.ts` to retain the same `@` alias, because the cached PWA
plugin used by `vite.config.ts` lacks `tinyglobby`. The generator was removed after
preserving the fixtures' two-space indentation and trailing newlines.

## 已知缺口（M1 处理）

1. universe/npc 双 key 无版本信封、无迁移链，本次保持原有读写行为。
2. 云存档/WebDAV 走独立通道、无严格校验，缺少 `parseSave` 级别的校验。

本次 M0 只覆盖主 key（`pkg.name`）的加解密/迁移/版本校验与写保护。
Settings 本地导入的三个主 key 写入入口会先调用 `parseSave`，失败时提示并返回，
不写主 key；上述独立通道和辅助 key 留到 M1 处理。
