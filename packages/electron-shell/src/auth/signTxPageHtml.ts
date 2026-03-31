/**
 * Browser page for signing a Powerlay connect_storage PTB via Eve Vault.
 * Served at GET /sign-tx?session=<id>. Runs in user's real browser where
 * Eve Vault extension is available (same pattern as authPageHtml.ts).
 *
 * Flow:
 * 1. Page loads → fetches tx params from /sign-tx/params?session=<id>
 * 2. Connects to Eve Vault via Sui Wallet Standard
 * 3. Builds the connect_storage PTB using @mysten/sui from CDN
 * 4. Calls sui:signAndExecuteTransaction on the wallet
 * 5. POSTs {sessionId, digest} to /sign-tx/callback
 *
 * Telemetry: events are buffered in-page and flushed to POST /sign-tx/log
 * where authServer writes them to powerlay.log with [auth_storage_page] prefix.
 * No trace UI is shown to the user.
 */

function getSignTxPageHtml(): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Powerlay - Authorize Storage</title>
  <style>
    * { box-sizing: border-box; }
    body { font-family: system-ui, -apple-system, sans-serif; margin: 0; padding: 2rem; background: #1a1b1e; color: #e4e4e7; min-height: 100vh; display: flex; flex-direction: column; align-items: center; justify-content: center; }
    .card { background: #252528; border: 1px solid #2d2d30; border-radius: 12px; padding: 2rem; max-width: 680px; width: 100%; text-align: center; }
    h1 { margin: 0 0 0.5rem; font-size: 1.4rem; color: #e4e4e7; }
    .sub { color: #a1a1aa; margin: 0 0 1.5rem; font-size: 0.875rem; }
    .wallet-list { margin: 1rem 0; text-align: left; }
    .info-box { background: #1f1f23; border: 1px solid #2d2d30; border-radius: 8px; padding: 1rem; margin-bottom: 1.5rem; text-align: left; font-size: 0.8rem; color: #a1a1aa; word-break: break-all; }
    .info-box .label { color: #71717a; font-size: 0.7rem; text-transform: uppercase; letter-spacing: 0.05em; margin-bottom: 0.2rem; }
    .info-box .value { color: #e4e4e7; font-family: monospace; }
    button { border: none; padding: 0.75rem 1.5rem; border-radius: 8px; font-size: 1rem; cursor: pointer; }
    button:disabled { opacity: 0.5; cursor: not-allowed; }
    .wallet-btn { display: block; width: 100%; margin: 0.4rem 0; padding: 0.7rem; text-align: left; background: #334d33; color: #ffffff; border: 1px solid #2d2d30; border-radius: 8px; font-size: 0.9rem; cursor: pointer; }
    .wallet-btn:hover { background: #3d5c3d; border-color: #334d33; }
    .status { margin-top: 1rem; font-size: 0.875rem; color: #86efac; min-height: 1.2rem; }
    .error { margin-top: 1rem; font-size: 0.875rem; color: #f87171; min-height: 1.2rem; }
    .spinner { display: inline-block; width: 1rem; height: 1rem; border: 2px solid #334d33; border-top-color: #86efac; border-radius: 50%; animation: spin 0.8s linear infinite; margin-right: 0.4rem; vertical-align: middle; }
    @keyframes spin { to { transform: rotate(360deg); } }
    .help-box { background: #1f1f23; border: 1px solid #2d2d30; border-radius: 8px; padding: 1.25rem; margin-top: 1rem; text-align: left; }
    .help-box h2 { margin: 0 0 0.75rem; font-size: 1.1rem; color: #e4e4e7; }
    .help-box p, .help-box li { color: #a1a1aa; margin: 0 0 0.5rem; font-size: 0.9rem; line-height: 1.5; }
    .help-box a { color: #eab308; }
    .help-box code { background: #3d3d40; color: #e4e4e7; padding: 0.15rem 0.4rem; border-radius: 4px; font-size: 0.85em; border: 1px solid #2d2d30; }
  </style>
</head>
<body>
  <div class="card">
    <h1 id="page-title">Sign transaction</h1>
    <p class="sub" id="page-sub">Powerlay will submit a Sui transaction through your wallet (EVE Vault).</p>
    <div id="info-box" class="info-box" style="display:none;"></div>
    <div id="wallet-list" class="wallet-list"></div>
    <div id="status" class="status"></div>
    <div id="error" class="error"></div>
  </div>
  <script>
  (function () {
    var logUrl = '{{BASE_URL}}' + '/sign-tx/log';
    function silentPost(events) {
      try {
        fetch(logUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ events: events }),
          keepalive: true,
        }).catch(function () {});
      } catch (_) {}
    }
    window.addEventListener('error', function (ev) {
      var msg = ev && ev.message ? String(ev.message).slice(0, 200) : 'error';
      silentPost([{ e: 'window_error', ms: 0, msg: msg, line: ev.lineno || 0 }]);
    });
    window.addEventListener('unhandledrejection', function (ev) {
      var r = ev && ev.reason ? String(ev.reason).slice(0, 200) : 'rejection';
      silentPost([{ e: 'unhandled_rejection', ms: 0, msg: r }]);
    });
  })();
  </script>
  <script type="module">
    const sessionId = '{{SESSION_ID}}';
    const baseUrl = '{{BASE_URL}}';

    const statusEl = document.getElementById('status');
    const errorEl = document.getElementById('error');
    const walletListEl = document.getElementById('wallet-list');
    const infoBox = document.getElementById('info-box');
    const PARAMS_FETCH_TIMEOUT_MS = 120000;

    const cancelUrl = baseUrl + '/sign-tx/cancel?session=' + encodeURIComponent(sessionId);

    // --- Compressed telemetry ---
    // Events are buffered and flushed to POST /sign-tx/log on success, error, or pagehide.
    // authServer writes them to powerlay.log with the [auth_storage_page] prefix.
    const slogT0 = Date.now();
    let slogBuf = [];
    function slog(e, extra) {
      slogBuf.push(Object.assign({ e, ms: Date.now() - slogT0 }, extra || {}));
    }
    function flushLog() {
      if (!slogBuf.length) return;
      const events = slogBuf.slice();
      slogBuf = [];
      try {
        fetch(baseUrl + '/sign-tx/log', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ events }),
          keepalive: true,
        }).catch(function () {});
      } catch (_) {}
    }

    slog('page_open', { sid: sessionId.slice(0, 8) });

    let txParams = null;
    let signCompleted = false;
    let pollInterval = null;
    let walletModule = null;
    let walletsLoggedReady = false;

    function sendCancelToApp() {
      if (signCompleted) return;
      fetch(cancelUrl, { method: 'GET', keepalive: true }).catch(() => {});
      try {
        if (navigator.sendBeacon) navigator.sendBeacon(cancelUrl);
      } catch (_) {}
    }

    window.addEventListener('pagehide', () => {
      slog('pagehide', { ok: signCompleted });
      const events = slogBuf.slice();
      slogBuf = [];
      if (pollInterval) { clearInterval(pollInterval); pollInterval = null; }
      if (events.length) {
        const body = JSON.stringify({ events });
        try {
          const sent = navigator.sendBeacon && navigator.sendBeacon(
            baseUrl + '/sign-tx/log',
            new Blob([body], { type: 'application/json' })
          );
          if (!sent) {
            fetch(baseUrl + '/sign-tx/log', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body,
              keepalive: true,
            }).catch(function () {});
          }
        } catch (_) {}
      }
      if (!signCompleted) sendCancelToApp();
    });

    function setStatus(msg) {
      if (statusEl) statusEl.innerHTML = msg;
      if (errorEl) errorEl.textContent = '';
    }
    function setError(msg) {
      if (errorEl) errorEl.textContent = msg;
      if (statusEl) statusEl.textContent = '';
    }
    function normalizeAddress(v) {
      return typeof v === 'string' ? v.trim().toLowerCase() : '';
    }

    async function loadParams() {
      const ctrl = new AbortController();
      const t = setTimeout(() => ctrl.abort(), PARAMS_FETCH_TIMEOUT_MS);
      try {
        const res = await fetch(baseUrl + '/sign-tx/params?session=' + encodeURIComponent(sessionId), {
          signal: ctrl.signal,
        });
        if (!res.ok) throw new Error('Session not found — this page may have expired.');
        const json = await res.json();
        var pk = json.kind === 'contract_delivery' ? 'delivery' : (json.characterId ? 'A' : 'B');
        slog('params_ok', { path: pk });
        return json;
      } finally {
        clearTimeout(t);
      }
    }

    function renderParamsInfo(p) {
      infoBox.style.display = 'block';
      var titleEl = document.getElementById('page-title');
      var subEl = document.getElementById('page-sub');
      if (p.kind === 'contract_delivery') {
        if (titleEl) titleEl.textContent = 'Contract delivery';
        if (subEl) subEl.textContent = 'Move items from your personal SSU slot into the owner primary inventory, then Powerlay records payout.';
        infoBox.innerHTML =
          '<div class="label">Operation</div><div class="value">deliver_personal_to_owner_primary</div>' +
          '<div class="label" style="margin-top:0.5rem">StorageConfig</div><div class="value">' + p.storageConfigObjectId + '</div>' +
          '<div class="label" style="margin-top:0.5rem">Storage Unit</div><div class="value">' + p.storageUnitId + '</div>' +
          '<div class="label" style="margin-top:0.5rem">Character</div><div class="value">' + p.characterId + '</div>' +
          '<div class="label" style="margin-top:0.5rem">OwnerCap &lt;Character&gt;</div><div class="value">' + p.delivererCharacterOwnerCapId + '</div>' +
          '<div class="label" style="margin-top:0.5rem">Resource type_id</div><div class="value">' + p.typeId + '</div>' +
          '<div class="label" style="margin-top:0.5rem">Quantity</div><div class="value">' + p.quantity + '</div>' +
          '<div class="label" style="margin-top:0.5rem">Character cap borrow</div><div class="value">' + (p.useCharacterCapBorrow ? 'yes' : 'no') + '</div>' +
          '<div class="label" style="margin-top:0.5rem">Network</div><div class="value">sui:testnet</div>';
        return;
      }
      if (titleEl) titleEl.textContent = 'Authorize Storage';
      if (subEl) subEl.textContent = 'Sign the transaction in your wallet to connect this storage unit to Powerlay.';
      var isConnect = !p.kind || p.kind === 'connect_storage';
      var pathLbl = (isConnect && p.characterId) ? 'A — Character-owned borrow/return' : 'B — Wallet-owned direct';
      infoBox.innerHTML =
        '<div class="label">Storage Unit ID</div><div class="value">' + p.storageUnitId + '</div>' +
        '<div class="label" style="margin-top:0.5rem">Owner Cap ID</div><div class="value">' + (p.ownerCapId || '<span style="color:#f87171">NOT RESOLVED</span>') + '</div>' +
        '<div class="label" style="margin-top:0.5rem">Character ID</div><div class="value">' + (p.characterId || '<span style="color:#f87171">NOT PROVIDED</span>') + '</div>' +
        '<div class="label" style="margin-top:0.5rem">Powerlay Pkg</div><div class="value">' + (p.powerlayPackageId || 'N/A') + '</div>' +
        '<div class="label" style="margin-top:0.5rem">World Pkg</div><div class="value">' + (p.worldPackageId || 'N/A') + '</div>' +
        '<div class="label" style="margin-top:0.5rem">Tribe ID</div><div class="value">' + (p.tribeId || '0') + '</div>' +
        '<div class="label" style="margin-top:0.5rem">Path</div><div class="value">' + pathLbl + '</div>' +
        '<div class="label" style="margin-top:0.5rem">Network</div><div class="value">sui:testnet</div>';
    }

    async function signAndSubmit(wallet) {
      try {
        slog('sign_connect', { wallet: (wallet.name || '').slice(0, 32) });
        if (!txParams) {
          setError('Session not loaded yet. Wait a moment and try again.');
          return;
        }
        setStatus('<span class="spinner"></span>Connecting wallet…');
        const connectFeature = wallet.features['standard:connect'];
        if (!connectFeature) throw new Error('Wallet does not support connect');
        const { accounts } = await connectFeature.connect();
        if (!accounts || accounts.length === 0) throw new Error('No accounts returned from wallet');
        const expectedWallet = normalizeAddress(txParams.walletAddress);
        const chosenAccount =
          expectedWallet
            ? accounts.find((account) => normalizeAddress(account.address) === expectedWallet)
            : accounts[0];
        if (!chosenAccount) {
          throw new Error(
            'Connected wallet account does not match the app session. In Powerlay you are signed in as ' +
            txParams.walletAddress +
            ', but Eve Vault selected a different account.'
          );
        }

        setStatus('<span class="spinner"></span>Building transaction…');

        const { Transaction } = await import('https://esm.sh/@mysten/sui@2/transactions');
        const tx = new Transaction();

        const p = txParams;
        const POWERLAY_PKG = p.powerlayPackageId;
        const WORLD_PKG = p.worldPackageId;
        const chain = 'sui:testnet';

        if (p.kind === 'contract_delivery') {
          slog('ptb_delivery');
          if (!POWERLAY_PKG || !WORLD_PKG) throw new Error('Missing Powerlay or world package id for delivery.');
          var qty = Number(p.quantity);
          if (!Number.isFinite(qty) || qty < 1 || qty > 0xffffffff) throw new Error('Invalid quantity.');
          var qtyPure = tx.pure.u32(qty);
          var typePure = tx.pure.u64(BigInt(p.typeId));
          var CHAR_T = WORLD_PKG + '::character::Character';
          if (p.useCharacterCapBorrow) {
            var _d1 = tx.moveCall({
              target: WORLD_PKG + '::character::borrow_owner_cap',
              typeArguments: [CHAR_T],
              arguments: [tx.object(p.characterId), tx.object(p.delivererCharacterOwnerCapId)],
            });
            var borrowedCharCap = _d1[0];
            var receiptCh = _d1[1];
            tx.moveCall({
              target: POWERLAY_PKG + '::powerlay_storage::deliver_personal_to_owner_primary',
              arguments: [
                tx.object(p.storageConfigObjectId),
                tx.object(p.storageUnitId),
                tx.object(p.characterId),
                borrowedCharCap,
                typePure,
                qtyPure,
              ],
            });
            tx.moveCall({
              target: WORLD_PKG + '::character::return_owner_cap',
              typeArguments: [CHAR_T],
              arguments: [tx.object(p.characterId), borrowedCharCap, receiptCh],
            });
          } else {
            tx.moveCall({
              target: POWERLAY_PKG + '::powerlay_storage::deliver_personal_to_owner_primary',
              arguments: [
                tx.object(p.storageConfigObjectId),
                tx.object(p.storageUnitId),
                tx.object(p.characterId),
                tx.object(p.delivererCharacterOwnerCapId),
                typePure,
                qtyPure,
              ],
            });
          }
          slog('delivery_ptb_ready', {
            storageConfig: String(p.storageConfigObjectId).slice(0, 14),
            ssu: String(p.storageUnitId).slice(0, 14),
            character: String(p.characterId).slice(0, 14),
            ownerCap: String(p.delivererCharacterOwnerCapId).slice(0, 14),
            typeId: String(p.typeId),
            qty: qty,
            borrow: !!p.useCharacterCapBorrow,
            powerlayPkg: String(POWERLAY_PKG).slice(0, 14),
            worldPkg: String(WORLD_PKG).slice(0, 14),
          });
        } else if (p.characterId && WORLD_PKG) {
          slog('ptb_A');
          const SU_TYPE = WORLD_PKG + '::storage_unit::StorageUnit';
          // Second arg is Receiving<OwnerCap<StorageUnit>>, not address — use object input so the
          // wallet/SDK resolver upgrades to Receiving (see transfer::Receiving).
          const [borrowedCap, receipt] = tx.moveCall({
            target: WORLD_PKG + '::character::borrow_owner_cap',
            typeArguments: [SU_TYPE],
            arguments: [tx.object(p.characterId), tx.object(p.ownerCapId)],
          });
          tx.moveCall({
            target: POWERLAY_PKG + '::powerlay_storage::connect_storage',
            arguments: [tx.object(p.storageUnitId), borrowedCap, tx.pure.u64(BigInt(p.tribeId))],
          });
          tx.moveCall({
            target: WORLD_PKG + '::character::return_owner_cap',
            typeArguments: [SU_TYPE],
            arguments: [tx.object(p.characterId), borrowedCap, receipt],
          });
        } else {
          slog('ptb_B');
          tx.moveCall({
            target: POWERLAY_PKG + '::powerlay_storage::connect_storage',
            arguments: [tx.object(p.storageUnitId), tx.object(p.ownerCapId), tx.pure.u64(BigInt(p.tribeId))],
          });
        }

        setStatus('<span class="spinner"></span>Waiting for wallet signature…');
        const signFeature = wallet.features['sui:signAndExecuteTransaction'];
        if (!signFeature?.signAndExecuteTransaction) throw new Error('Wallet does not support sui:signAndExecuteTransaction');

        slog('sign_submit', { chain });
        const result = await signFeature.signAndExecuteTransaction({ transaction: tx, chain, account: chosenAccount });
        const digest = result?.digest ?? result?.effects?.transactionDigest;
        if (!digest) throw new Error('No transaction digest returned by wallet');

        setStatus('<span class="spinner"></span>Completing…');
        const callbackRes = await fetch(baseUrl + '/sign-tx/callback', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ sessionId, digest }),
        });

        signCompleted = true;
        slog('sign_ok', { digest: String(digest).slice(0, 16), cb: callbackRes.ok });
        flushLog();
        setStatus('✓ Transaction submitted! Digest: ' + digest + '<br><small style="color:#a1a1aa">You can close this window.</small>');
      } catch (err) {
        const msg = err?.message || String(err);
        slog('sign_err', { msg: msg.slice(0, 200) });
        flushLog();
        const detail = JSON.stringify(err, Object.getOwnPropertyNames(err));
        setError(msg + (detail && detail !== '{}' ? String.fromCharCode(10, 10) + 'Detail: ' + detail : ''));
        console.error('[powerlay-sign-tx] error:', err);
        // Report error back so IPC resolves with the right message
        await fetch(baseUrl + '/sign-tx/callback', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ sessionId, error: msg }),
        }).catch(() => {});
      }
    }

    function renderWalletButtons(wallets) {
      walletListEl.innerHTML = '';
      for (const w of wallets) {
        const btn = document.createElement('button');
        btn.className = 'wallet-btn';
        btn.textContent = (w.name || 'Wallet') + ' — Sign transaction';
        btn.onclick = () => { btn.disabled = true; signAndSubmit(w); };
        walletListEl.appendChild(btn);
      }
    }

    function renderSignTxHelp() {
      walletListEl.innerHTML =
        '<div class="help-box">' +
        '<h2>No wallet detected yet</h2>' +
        '<p>Open the EVE Vault extension, then reload this page (F5) if the green sign button does not appear.</p>' +
        '<p><a href="https://github.com/evefrontier/evevault/releases" target="_blank" rel="noopener">Download EVE Vault</a> ' +
        '<a href="https://docs.evefrontier.com/eve-vault/browser-extension" target="_blank" rel="noopener">Setup guide</a></p>' +
        '</div>';
    }

    async function checkForWallets() {
      try {
        if (!walletModule) {
          walletModule = await import('https://esm.sh/@wallet-standard/core@1.1.1');
        }
        const wallets = walletModule.getWallets().get();
        if (wallets.length > 0) {
          if (pollInterval) {
            clearInterval(pollInterval);
            pollInterval = null;
          }
          if (!walletsLoggedReady) {
            walletsLoggedReady = true;
            slog('wallets_ready', { count: wallets.length });
          }
          renderWalletButtons(wallets);
          setError('');
          return true;
        }
        return false;
      } catch (err) {
        slog('wallets_err', { msg: (err && err.message ? err.message : String(err)).slice(0, 200) });
        setError('Failed to check for wallets: ' + (err.message || err));
        return false;
      }
    }

    async function init() {
      try {
        void (async function loadSession() {
          try {
            txParams = await loadParams();
            renderParamsInfo(txParams);
          } catch (err) {
            const msg =
              err && err.name === 'AbortError'
                ? 'Timed out loading session from Powerlay. Is the app still running? Reload this page.'
                : err && err.message
                  ? err.message
                  : String(err);
            slog('params_err', { msg: msg.slice(0, 200) });
            flushLog();
            setError(msg);
          }
        })();

        let found = await checkForWallets();
        if (!found) {
          await new Promise((r) => setTimeout(r, 1000));
          found = await checkForWallets();
        }
        if (!found) {
          slog('wallets_help');
          renderSignTxHelp();
          pollInterval = setInterval(checkForWallets, 2000);
        }
      } catch (err) {
        slog('init_fatal', { msg: (err && err.message ? err.message : String(err)).slice(0, 200) });
        flushLog();
        setError('Failed to load wallet support: ' + (err.message || err));
      }
    }

    init();
  </script>
</body>
</html>`;
}

export function getSignTxPage(sessionId: string, baseUrl: string): string {
  return getSignTxPageHtml()
    .replace(/\{\{SESSION_ID\}\}/g, sessionId)
    .replace(/\{\{BASE_URL\}\}/g, baseUrl);
}
