# Move Smart Contracts

Sui Move package for Powerlay Frontier on EVE Frontier (Sui testnet).

Two deployed environments:
- **testnet_utopia** — Utopia world
- **testnet_stillness** — Stillness world

---

## View latest deployed contract on-chain

```bash
# View package object (replace <ENV> with testnet_utopia or testnet_stillness)
sui client object <published-at-address>

# Addresses from Published.toml:
# testnet_utopia:    0x95a12684424d9b10d6ad602be7112159aa1b4e165bd3853653f025049f2a4c76
# testnet_stillness: 0xb5b0006235c1f27542c6efc1d60778e719f71e254ea3000fca131f8f92f19522

# Or explore via Sui explorer:
# https://suiscan.xyz/testnet/object/<published-at-address>
```

---

## Build

```bash
cd packages/move/powerlay-storage

# Build for Utopia
sui move build --build-env testnet_utopia

# Build for Stillness
sui move build --build-env testnet_stillness
```

The `build/` directory is generated output — it is gitignored and safe to delete.

---

## Test

```bash
cd packages/move/powerlay-storage

sui move test
```

---

## Publish (first deploy)

```bash
cd packages/move/powerlay-storage

# Publish to Utopia
sui client publish --build-env testnet_utopia

# Publish to Stillness
sui client publish --build-env testnet_stillness
```

After publishing, commit the updated `Published.toml` which contains the new package address and upgrade capability.

---

## Upgrade (after changes)

```bash
cd packages/move/powerlay-storage

# Upgrade on Utopia (uses upgrade-capability from Published.toml)
sui client upgrade --build-env testnet_utopia

# Upgrade on Stillness
sui client upgrade --build-env testnet_stillness
```

> **Note:** If the UpgradeCap was transferred to a multisig address, the commands above will fail.
> You must add `--sender <multisig-address>` and follow the multisig upgrade flow in the section below.

After upgrading, commit the updated `Published.toml` (version will increment).

---

## Team access — multisig UpgradeCap

The right to upgrade a contract belongs to whoever holds the `UpgradeCap` object.
To share that right with teammates, transfer it to a shared multisig address.

### Step 1 — collect public keys

Each team member runs:

```bash
sui keytool list
```

Copy the `suiPublicKey` value (starts with `suipubkey...`) for each person.

### Step 2 — create the multisig address

**bash/macOS/Linux:**
```bash
sui keytool multi-sig-address \
  --pks <pubkey-1> <pubkey-2> \
  --weights 1 1 \
  --threshold 1
```

**PowerShell (Windows):**
```powershell
sui keytool multi-sig-address `
  --pks <pubkey-1> <pubkey-2> `
  --weights 1 1 `
  --threshold 1
```

- `--weights` — voting weight per key (usually all 1)
- `--threshold` — how many weight points needed to sign a tx
  - `1` → any single member can upgrade independently
  - `2` → both members must sign

This prints the multisig address. Save it — everyone will need it.

### Step 3 — transfer UpgradeCap to the multisig address

Current UpgradeCap object IDs (from `Published.toml`):

```
testnet_utopia:    0xe8a097337e52b8ad897d09803dd4954ee4c910639059eeb71e28a17fa6db9034
testnet_stillness: 0xb5c0b6f419cde569823a0fa1c5dbc1c6ec4d60cb03d2d1c3752af812c7df6e36
```

**bash/macOS/Linux:**
```bash
sui client transfer \
  --to <multisig-address> \
  --object-id <upgrade-cap-id> \
  --gas-budget 10000000
```

**PowerShell (Windows):**
```powershell
sui client transfer `
  --to <multisig-address> `
  --object-id <upgrade-cap-id> `
  --gas-budget 10000000
```

After this, the UpgradeCap is owned by the multisig address — no single wallet controls it anymore.

### Step 4 — upgrade from a multisig address

When upgrading, each signer builds the tx locally and combines signatures:

**bash/macOS/Linux:**
```bash
# 1. Serialize the upgrade tx (do not execute yet)
sui client upgrade --build-env testnet_utopia \
  --sender <multisig-address> \
  --serialize-unsigned-transaction > tx.b64

# 2. Each signer signs with their own key
sui keytool sign --address <your-address> --data $(cat tx.b64)

# 3. Combine signatures and execute
sui keytool multi-sig-combine-partial-sig \
  --pks <pubkey-1> <pubkey-2> \
  --weights 1 1 \
  --threshold 1 \
  --sigs <sig-1> <sig-2> \
  --tx-bytes $(cat tx.b64)

sui client execute-signed-tx \
  --tx-bytes $(cat tx.b64) \
  --signatures $(cat combined-sig.b64)
```

**PowerShell (Windows):**
```powershell
# 1. Serialize the upgrade tx (do not execute yet)
sui client upgrade --build-env testnet_utopia `
  --sender <multisig-address> `
  --serialize-unsigned-transaction | Out-File tx.b64

# 2. Each signer signs with their own key
sui keytool sign --address <your-address> --data (Get-Content tx.b64)

# 3. Combine signatures and execute
sui keytool multi-sig-combine-partial-sig `
  --pks <pubkey-1> <pubkey-2> `
  --weights 1 1 `
  --threshold 1 `
  --sigs <sig-1> <sig-2> `
  --tx-bytes (Get-Content tx.b64) | Out-File combined-sig.b64

sui client execute-signed-tx `
  --tx-bytes (Get-Content tx.b64) `
  --signatures (Get-Content combined-sig.b64)
```

If threshold is 1, only one person needs to sign — steps 2–3 can be done by a single member.
