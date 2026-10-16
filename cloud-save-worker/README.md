# Cloud save / ogame-save

## Deployment

1. Create a Workers KV namespace and replace `REPLACE_WITH_KV_NAMESPACE_ID` in `wrangler.toml` with its ID.
2. Deploy from this directory with Wrangler (`wrangler deploy`). The Worker is plain JavaScript and has no build dependencies.
3. The client defaults to `https://ogame-save.pagi.workers.dev`. A different HTTPS base URL can be saved under Settings → Cloud Save → Advanced settings. HTTP is allowed only for localhost development.
4. Check `GET /health`; cross-origin GET/PUT and OPTIONS requests are supported.

## Protocol (version 2)

- `PUT /save/:username`: JSON `{ciphertext, clientHash, auth}`; ciphertext is limited to 1 MiB of UTF-8 bytes **after compression and encryption**. Returns `{ok, updatedAt, remainingToday, retryAfter}`. `auth` is a 64-character lowercase hex key; the first PUT registers the username with `authHash = SHA-256(auth)`.
- `GET /save/:username`: requires `Authorization: Bearer <authKeyHex>` and returns `{ciphertext, clientHash, updatedAt}`, or HTTP 404 `{error: "not_found"}`. Auth is never put in query parameters. Downloads do not consume upload quota.
- Both methods require valid auth. Existing records are checked using a byte-wise XOR accumulator over the 32-byte hash, before applying upload quotas. Missing/wrong auth returns HTTP 401 `{error: "unauthorized"}` without a KV write. CORS permits the `Authorization` header.
- Usernames match `/^[a-zA-Z0-9_-]{3,20}$/` at input and are converted to lowercase on **both** client and Worker, including key derivation, request paths, local sync metadata and KV keys.
- The KV value at `save:<username>` contains `{authHash, ciphertext, clientHash, updatedAt, syncTimes}`. Neither password nor raw auth key is stored in KV. Timestamps are Unix milliseconds; `retryAfter` is seconds.
- PUT permits five successful writes in a **rolling 24-hour window**, at least 30 minutes apart. HTTP 429 returns `{error: "rate_limited", reason, retryAfter, remainingToday}` and a `Retry-After` header. Each accepted upload writes KV exactly once; reads and rejected uploads do not write.

## Client storage and encryption

All three persisted stores are transferred together: `ogame-vue-ts`, `ogame-vue-ts-universe`, and `ogame-vue-ts-npcs`. The existing local serializer decrypts each into a state object; missing keys become `{}`. The client packages these as `{game, universe, npcs}`, hashes the uncompressed JSON with SHA-256, then compresses it with native asynchronous `CompressionStream('gzip')` **before** encryption. No compression dependency is added.

The encryption key remains CryptoJS PBKDF2-SHA256(password, lowercase username, 256 bits, 10,000 iterations). A separate authentication key is CryptoJS PBKDF2(password, `"auth:" + lowercase username`, `{keySize: 256/32, iterations: 10000}`), encoded as hex. AES-CBC encrypts the compressed bytes with a fresh random 128-bit IV on every upload. The opaque ciphertext string is `{version: 2, compression: "gzip", iv, data}`; the Worker never parses it. Downloads decrypt, decompress with `DecompressionStream('gzip')`, verify `clientHash`, and require all three bundled states to be non-null, non-array objects (including `game`).

Before fetching a download, the client pauses `gameStore.isPaused` and copies all three local encrypted saves into `<persist-key>-cloudbackup-<timestamp>` keys (Unix milliseconds; missing keys are backed up as encrypted `{}`). A failed backup aborts the download. Fetching/decompression are asynchronous, but **after** preparing all three locally encrypted replacements, writing the three persist keys and calling `window.location.reload()` are synchronous with no intervening `await`. The persistence plugin exposes no subscription pause handle, so this avoids yielding to its queued watchers or game ticks after replacement. On failure, the previous pause state is restored. Backups are retained locally; export/clean them up manually when no longer needed.

The cloud password and raw auth key exist only in component/request memory and are not persisted locally. Only the derived auth key is transmitted, over HTTPS; treat it as a password-equivalent bearer credential and do not log request bodies or Authorization headers. The endpoint override and upload hash/rate-limit metadata are stored under `cloudSave.*`, scoped to the lowercase username and endpoint. `lastSyncAt`, `day` (UTC), and `dayCount` record successful uploads; `syncTimes` prevents midnight from resetting the rolling limit. The displayed quota reflects this browser and its last server response, not live activity on other devices; the server remains authoritative. HTTP status is handled before JSON parsing, so HTML error pages still produce 401/404/413 messages and 429 countdowns using `Retry-After` when available.

## 已知限制

- **No WebCrypto migration:** the client intentionally retains CryptoJS key derivation and AES-CBC; only the cloud protocol/envelope is upgraded from v1 to v2 in this round. AES-CBC plus an unkeyed hash is not authenticated encryption. The specified 10,000 PBKDF2 iterations still require a strong dedicated password. Native gzip/decompression support is required.
- **No automatic v1 migration:** old records without `authHash` fail closed with 401; they cannot be claimed by sending a new auth key. Preserve/export the original local save and have the operator remove the old KV entry before registering again. Old mixed-case KV keys are not automatically renamed. v1 ciphertext is not accepted by the v2 client.
- **No multi-device conflict/409 UI:** simultaneous edits have no revision/precondition check; the last accepted write wins. Coordinate devices manually and keep backups.
- **No IP-level rate limiting:** quotas apply per username only. Creating many usernames can consume storage/request capacity; deployment-level abuse controls remain necessary.
- **KV eventual consistency and races:** reads/writes are not atomic and may be eventually consistent across locations. Concurrent first registration, save updates, and quota read-check-write are best-effort. Strict ownership registration and quota enforcement require a serialized/transactional coordinator such as a Durable Object, outside this KV-only round.
- CORS `*` is intentional, not authentication. The Worker emits no application logs and applies `Cache-Control: no-store` to responses.
- No password reset/change, server-side version history, prior username reservation or automatic synchronization is provided. First successful PUT claims a username; changing the password changes both keys and cannot overwrite an existing record. Keep the original password or use a new username. An unchanged-state upload is skipped locally, not a credential verification request.
- Automatic local backups consume browser storage and are not pruned automatically. Backup/storage failures abort the operation; failed replacement writes attempt to restore the original three keys synchronously (browser storage is not transactional). Retained backups can be recovered with the existing local serializer/import tooling.

## Local verification

From the repository root:

```sh
node scripts/run-cloud-save-tests.mjs
pnpm exec vue-tsc -b
pnpm build
```

The regression runner uses the already installed Vite and Node test runner, builds into ignored `node_modules/.tmp`, and mocks KV, fetch, localStorage and reload. No new dependency or deployed service is required.
