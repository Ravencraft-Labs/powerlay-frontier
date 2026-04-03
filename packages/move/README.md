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
sui move build --env testnet_utopia

# Build for Stillness
sui move build --env testnet_stillness
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
sui client publish --env testnet_utopia

# Publish to Stillness
sui client publish --env testnet_stillness
```

After publishing, commit the updated `Published.toml` which contains the new package address and upgrade capability.

---

## Upgrade (after changes)

```bash
cd packages/move/powerlay-storage

# Upgrade on Utopia (uses upgrade-capability from Published.toml)
sui client upgrade --env testnet_utopia

# Upgrade on Stillness
sui client upgrade --env testnet_stillness
```

After upgrading, commit the updated `Published.toml` (version will increment).
