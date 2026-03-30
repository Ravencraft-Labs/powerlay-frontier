/**
 * Builds Sui Programmable Transaction Blocks (PTBs) for Powerlay storage operations.
 *
 * These transactions are built in the renderer (ui-desktop) using `@mysten/sui`,
 * then signed by Eve Vault via the Sui Wallet Standard API injected into the window.
 *
 * # Wallet signing
 *
 * Eve Vault implements the Sui Wallet Standard and injects a wallet object into
 * the page.  To sign and execute:
 *
 * ```ts
 * import { signAndExecuteStorageConnect } from "./storageTransactionBuilder";
 *
 * const digest = await signAndExecuteStorageConnect({ storageUnitId, ownerCapId, tribeId });
 * ```
 *
 * TODO: Verify that Eve Vault's injected wallet (`window.suiWallet` or the
 * standard wallet registry) is accessible inside the Electron BrowserWindow.
 * Electron with `contextIsolation: true` and no sandbox should allow Chrome extension
 * injection, but this needs a live test with Eve Vault loaded.
 * If the wallet is NOT accessible, fall back to a popup flow similar to `auth:login`
 * (see `packages/electron-shell/src/auth/authServer.ts`).
 *
 * # Critical TODOs before this works end-to-end
 *
 * 1. POWERLAY_STORAGE_PACKAGE_ID — the on-chain address of the deployed
 *    `powerlay_storage` Move package. Fill in after `sui client publish`.
 *
 * 2. StorageUnit / OwnerCap object IDs — passed in by the caller from the
 *    discovery flow (`storage:discover-wallet-ssus` IPC).
 *
 * 3. borrow_owner_cap wrapper — if the OwnerCap is Character-owned (common on
 *    real Frontier SSUs) the PTB must add `borrow_owner_cap` /
 *    `return_owner_cap` calls around `connect_storage`.  The character_id is
 *    available from `playerTribeFromChain.ts` (already in session / IPC).
 *    The exact world-contracts module path for borrow_owner_cap must be
 *    confirmed against the deployed package.
 *
 * 4. `sui:testnet` vs `sui:mainnet` — adjust `chain` constant to match the
 *    network your contracts are deployed on.
 */

import { Transaction } from "@mysten/sui/transactions";

// ---------------------------------------------------------------------------
// Constants — fill after deployment
// ---------------------------------------------------------------------------

/**
 * TODO: Replace with the actual on-chain address after publishing the
 * `powerlay_storage` Move package.
 */
export const POWERLAY_STORAGE_PACKAGE_ID =
  "0x95a12684424d9b10d6ad602be7112159aa1b4e165bd3853653f025049f2a4c76";

/**
 * The Sui network to target when signing transactions.
 * TODO: Switch to "sui:mainnet" when deploying to production.
 */
export const TARGET_CHAIN = "sui:testnet" as const;

// ---------------------------------------------------------------------------
// PTB builders
// ---------------------------------------------------------------------------

export interface ConnectStorageParams {
  /** On-chain StorageUnit object ID (from suiStorageDiscovery). */
  storageUnitId: string;
  /**
   * On-chain OwnerCap<StorageUnit> object ID.
   * If the OwnerCap is Character-owned, set `characterId` as well and the PTB
   * will include the borrow_owner_cap / return_owner_cap wrapper.
   */
  ownerCapId: string;
  /**
   * Numeric tribe ID from the player's Character (available via session/tribeResolve).
   * Stored in the on-chain StorageConfig for reference.
   */
  tribeId: bigint | number;
  /**
   * If set, the PTB wraps the call in borrow_owner_cap / return_owner_cap.
   * Required when the OwnerCap is owned by the Character object rather than
   * the wallet directly.
   *
   * TODO: Confirm the `character::borrow_owner_cap` / `return_owner_cap` module
   * paths from the deployed world-contracts package.
   */
  characterId?: string;
  /**
   * World-contracts package ID (for the borrow_owner_cap call).
   * Required only when `characterId` is set.
   * TODO: use the same FRONTIER_WORLD_PACKAGE_* constants from playerTribeFromChain.ts.
   */
  worldPackageId?: string;
}

/**
 * Build a PTB that calls `powerlay_storage::connect_storage(...)`.
 *
 * The returned `Transaction` object must be serialised and sent to Eve Vault
 * for signing via `signAndExecuteStorageConnect`.
 */
export function buildConnectStorageTx(params: ConnectStorageParams): Transaction {
  const tx = new Transaction();

  if (params.characterId && params.worldPackageId) {
    // ---------------------------------------------------------------------------
    // Path A: OwnerCap is Character-owned → borrow / return wrapper
    // world-contracts module paths verified from source (March 2026):
    //   character::borrow_owner_cap  /  character::return_owner_cap
    //   StorageUnit type is world::storage_unit::StorageUnit
    //   OwnerCap type is world::access::OwnerCap (module name is "access")
    // ---------------------------------------------------------------------------
    const WORLD_PKG = params.worldPackageId;
    const SU_TYPE = `${WORLD_PKG}::storage_unit::StorageUnit`;

    const [borrowedCap, receipt] = tx.moveCall({
      target: `${WORLD_PKG}::character::borrow_owner_cap`,
      typeArguments: [SU_TYPE],
      arguments: [
        tx.object(params.characterId),
        // Receiving<OwnerCap<StorageUnit>> — must be an object/receiving input, not a pure address.
        tx.object(params.ownerCapId),
      ],
    });

    tx.moveCall({
      target: `${POWERLAY_STORAGE_PACKAGE_ID}::powerlay_storage::connect_storage`,
      arguments: [
        tx.object(params.storageUnitId),
        borrowedCap,
        tx.pure.u64(BigInt(params.tribeId)),
      ],
    });

    tx.moveCall({
      target: `${WORLD_PKG}::character::return_owner_cap`,
      typeArguments: [SU_TYPE],
      arguments: [
        tx.object(params.characterId),
        borrowedCap,
        receipt,
      ],
    });
  }

  if (!params.characterId) {
    // ---------------------------------------------------------------------------
    // Path B: OwnerCap is wallet-address-owned (direct call)
    // ---------------------------------------------------------------------------
    tx.moveCall({
      target: `${POWERLAY_STORAGE_PACKAGE_ID}::powerlay_storage::connect_storage`,
      arguments: [
        tx.object(params.storageUnitId),
        tx.object(params.ownerCapId),
        tx.pure.u64(BigInt(params.tribeId)),
      ],
    });
  }

  return tx;
}

// ---------------------------------------------------------------------------
// Wallet signing helpers
// ---------------------------------------------------------------------------

/**
 * Resolve the Eve Vault wallet from the Sui Wallet Standard registry injected
 * into the page by the Eve Vault browser extension.
 *
 * Returns null if no wallet is found (e.g. extension not loaded, Electron sandbox
 * prevents injection).
 *
 * TODO: Test this in the Electron BrowserWindow with Eve Vault loaded.
 * If `window.suiWallet` is not injected, use the `@mysten/dapp-kit` `getWallets()`
 * approach or trigger a popup flow via IPC (similar to auth:login).
 */
export function resolveEveVaultWallet(): SuiWalletLike | null {
  // NOTE: This function is not called in the Electron app — Eve Vault cannot inject
  // into Electron's BrowserWindow. Signing goes through the browser popup IPC flow
  // (storage:sign-connect-tx → authServer /sign-tx page).
  // This remains available for potential future web/standalone use.
  try {
    const w = (window as unknown as Record<string, unknown>)["suiWallet"];
    if (w && typeof w === "object") return w as SuiWalletLike;
  } catch {
    /* ignore */
  }
  return null;
}

/**
 * Minimal type for the subset of Sui Wallet Standard we need.
 * The full standard is in `@mysten/wallet-standard`.
 */
export interface SuiWalletLike {
  features: {
    "sui:signAndExecuteTransaction"?: {
      signAndExecuteTransaction(input: {
        transaction: Transaction;
        chain: string;
      }): Promise<{ digest: string }>;
    };
    "sui:signTransaction"?: {
      signTransaction(input: {
        transaction: Transaction;
        chain: string;
        account: unknown;
      }): Promise<{ bytes: string; signature: string }>;
    };
  };
  accounts: Array<{ address: string }>;
}

/**
 * Build the connect_storage PTB, send it to Eve Vault for signing, and
 * return the transaction digest on success.
 *
 * Usage in ConnectStorageModal:
 * ```ts
 * const digest = await signAndExecuteStorageConnect({
 *   storageUnitId,
 *   ownerCapId,
 *   tribeId: BigInt(session.tribeId ?? "0"),
 * });
 * // then call window.efOverlay.storage.register(storageUnitId, digest, name)
 * ```
 */
export async function signAndExecuteStorageConnect(
  params: ConnectStorageParams
): Promise<string> {
  const wallet = resolveEveVaultWallet();
  if (!wallet) {
    throw new Error(
      "Eve Vault wallet not found. Make sure the Eve Vault extension is loaded and you are connected."
    );
  }

  const signAndExecute =
    wallet.features["sui:signAndExecuteTransaction"]?.signAndExecuteTransaction;
  if (!signAndExecute) {
    throw new Error(
      "Eve Vault does not expose sui:signAndExecuteTransaction. Check the extension version."
    );
  }

  const tx = buildConnectStorageTx(params);
  const result = await signAndExecute({ transaction: tx, chain: TARGET_CHAIN });
  return result.digest;
}
