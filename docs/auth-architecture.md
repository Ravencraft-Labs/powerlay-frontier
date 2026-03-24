# Wallet Auth Architecture

Internal architecture note for Powerlay Frontier wallet login and session model.

## Why Wallet Login is Browser-Based

Electron's renderer process does not have access to Chrome extensions (such as EVE Vault) or injected wallet APIs. Wallet connection must run in a real browser where the user has installed their Sui wallet extension. The desktop app therefore:

1. Starts a local HTTP server on `127.0.0.1` (auth bridge)
2. Opens the user's default browser to an auth page served by that server
3. The auth page uses the Sui Wallet Standard to connect and sign
4. The result is POSTed back to the local server, which notifies the Electron main process

## Why Electron Stores App Session Instead of Raw Wallet Connectivity

The desktop app stores a **session** (wallet address + metadata), not a live wallet connection. This is because:

- The wallet lives in the browser; Electron cannot hold a persistent connection to it
- For **blockchain reads**, we only need the wallet address—no signing required
- For **future transaction signing**, we will re-open the browser flow when the user needs to sign

The session model keeps auth and blockchain access separate: auth proves identity once; reads use the stored address.

## How Blockchain Reads Work After Login

1. User logs in via the browser auth flow
2. Session is persisted to `userData/Powerlay/session.json`
3. `getWalletAddress()` (in `blockchain/blockchainReads.ts`) reads from the session store
4. **Tribe resolution** (`tribeResolve.ts`): When the user is signed in, the app calls `resolvePlayerTribe()`, which uses `queryPlayerTribeFromChain()` (`playerTribeFromChain.ts`): Sui GraphQL **wallet → `PlayerProfile.character_id` → `Character.tribe_id`**, then **`GET /v2/tribes/{id}`** on the Frontier **World API** for display name when enabled. Session stores **`tribeId`** (for **`X-Tribe-Id`**) and optional **`tribeName`** from the API (`name` / `nameShort`).

## What Must Happen Later for Signed Transactions

When we add transaction signing:

1. **New flow:** User triggers a signed action in the app → Electron opens browser to a "sign transaction" page
2. **Payload:** The transaction payload is passed (e.g. via URL params or POST) to the sign page
3. **Sign:** User signs in the browser with their wallet
4. **Return:** Signature is returned to the app (e.g. via callback URL or local server)
5. **Submit:** App submits the signed transaction to the chain

The current auth flow is identity-only; signing flows will be separate, on-demand browser sessions.
