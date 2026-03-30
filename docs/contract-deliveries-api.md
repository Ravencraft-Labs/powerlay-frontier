# Contract deliveries API (backend)

The desktop app signs a Sui PTB that calls `powerlay_storage::deliver_personal_to_owner_primary`, then calls the Powerlay HTTP API to **record** the delivery (token payout + line progress). That HTTP step must live on your FastAPI (or equivalent) service; it is not implemented in this repository.

## Endpoint

`POST /contracts/{contract_id}/deliveries`

Same auth headers as other contract routes (`X-User-Id`, `X-Wallet-Address`, `X-Tribe-Id`, `X-Nickname` as applicable).

## Request body (JSON)

| Field | Type | Description |
| --- | --- | --- |
| `line_id` | string | Contract line UUID |
| `quantity` | number | Units delivered (must match what was moved on-chain) |
| `sui_tx_digest` | string | Successful transaction digest from the wallet |
| `ssu_object_id` | string | Target `StorageUnit` object id (0x…) |

## Server responsibilities (single DB transaction)

1. **Authorize** — caller is a **participant** on the contract (or your stricter rule).
2. **Verify Sui tx** — transaction succeeded; inspect programmable transaction for a call to `deliver_personal_to_owner_primary` on the expected Powerlay package; `StorageUnit` and digest are consistent with `ssu_object_id` and contract `target_ssu_id`.
3. **Validate line** — `line_id` belongs to `contract_id`; `quantity` and resource `type_id` implied by the chain match remaining need (implementation-specific).
4. **Mutate balances** — debit creator reserve, credit deliverer app-layer balance, update `delivered_amount` / `paid_reward_amount` (or equivalent).
5. **Idempotency** — unique constraint on `sui_tx_digest` so retries do not double-credit.

## Response

Return the same **contract detail** JSON shape as `GET /contracts/{contract_id}` so the desktop can refresh the UI without a second round-trip (the client maps it with the same mapper as `get`).

## Environment (desktop)

- **`POWERLAY_SUI_RPC_URL`** — JSON-RPC base used to resolve `StorageConfig` from the stored connect-transaction digest (default `https://rpc.testnet.sui.io`).

The sign-tx page uses `character::borrow_owner_cap<Character>` when the pending payload has `useCharacterCapBorrow: true` (default from IPC unless overridden).

## On-chain reference

Move entry: `packages/move/powerlay-storage/sources/powerlay_storage.move` — `deliver_personal_to_owner_primary`.

After republishing the Move package, update `POWERLAY_STORAGE_PACKAGE_ID` in `packages/electron-shell/src/storage/storageConfig.ts` and the matching constant in `packages/ui-desktop/src/services/storage/storageTransactionBuilder.ts`.
