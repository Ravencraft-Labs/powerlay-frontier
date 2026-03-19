/**
 * Inline HTML for the wallet auth page.
 * Served at GET /auth?session=<id>. Runs in user's browser where wallet extensions are available.
 * Uses Sui Wallet Standard via ESM CDN to connect, get address, sign message, POST to callback.
 */
function getAuthPageHtml(): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Powerlay - Connect Wallet</title>
  <style>
    /* Powerlay Frontier app color scheme */
    * { box-sizing: border-box; }
    body { font-family: system-ui, -apple-system, sans-serif; margin: 0; padding: 2rem; background: #1a1b1e; color: #e4e4e7; min-height: 100vh; display: flex; flex-direction: column; align-items: center; justify-content: center; }
    .card { background: #252528; border: 1px solid #2d2d30; border-radius: 12px; padding: 2rem; max-width: 560px; width: 100%; text-align: center; }
    h1 { margin: 0 0 1rem; font-size: 1.5rem; color: #e4e4e7; }
    p { color: #a1a1aa; margin: 0 0 1.5rem; font-size: 0.9rem; }
    button { background: #334d33; color: #ffffff; border: none; padding: 0.75rem 1.5rem; border-radius: 8px; font-size: 1rem; cursor: pointer; }
    button:hover { background: #3d5c3d; }
    button:disabled { opacity: 0.6; cursor: not-allowed; }
    .error { color: #f87171; margin-top: 1rem; font-size: 0.9rem; }
    .success { color: #86efac; margin-top: 1rem; font-size: 0.9rem; }
    .wallet-list { margin: 1rem 0; text-align: left; }
    .wallet-btn { display: block; width: 100%; margin: 0.5rem 0; padding: 0.75rem; text-align: left; background: #3d3d40; color: #e4e4e7; border: 1px solid #2d2d30; border-radius: 8px; }
    .wallet-btn:hover { background: #334d33; border-color: #334d33; }
    .help-box { background: #1f1f23; border: 1px solid #2d2d30; border-radius: 8px; padding: 1.25rem; margin-top: 1rem; text-align: left; }
    .help-box h2 { margin: 0 0 0.75rem; font-size: 1.1rem; color: #e4e4e7; }
    .help-box h3 { margin: 1rem 0 0.5rem; font-size: 0.95rem; color: #e4e4e7; }
    .help-box p, .help-box li { color: #a1a1aa; margin: 0 0 0.5rem; font-size: 0.9rem; line-height: 1.5; }
    .help-box ul { margin: 0.5rem 0 1rem 1.25rem; padding: 0; }
    .help-box a { color: #eab308; }
    .help-box a:hover { text-decoration: underline; }
    .help-box .warn { background: rgba(248,113,113,0.15); border-left: 3px solid #f87171; color: #fca5a5; padding: 0.5rem 0.75rem; margin: 0.75rem 0; font-size: 0.85rem; }
    .help-box .step { margin: 0.75rem 0; }
    .help-box .step-title { font-weight: 600; color: #e4e4e7; }
    .help-box code { background: #3d3d40; color: #e4e4e7; padding: 0.15rem 0.4rem; border-radius: 4px; font-size: 0.85em; border: 1px solid #2d2d30; }
  </style>
</head>
<body>
  <div class="card">
    <h1>Connect Wallet</h1>
    <p>Connect your Sui wallet to sign in to Powerlay Frontier.</p>
    <div id="wallet-list" class="wallet-list"></div>
    <button id="connect-btn" style="display:none;">Connect Wallet</button>
    <div id="status"></div>
    <div id="error" class="error"></div>
  </div>
  <script type="module">
    const sessionId = '{{SESSION_ID}}';
    const baseUrl = '{{BASE_URL}}';
    const callbackUrl = baseUrl + '/auth/callback';

    const statusEl = document.getElementById('status');
    const errorEl = document.getElementById('error');
    const walletListEl = document.getElementById('wallet-list');
    const connectBtn = document.getElementById('connect-btn');

    let loginCompletedSuccessfully = false;
    window.addEventListener('pagehide', () => {
      if (!loginCompletedSuccessfully) {
        fetch(baseUrl + '/auth/cancel?session=' + encodeURIComponent(sessionId), { method: 'GET', keepalive: true });
      }
    });

    function setStatus(msg, isError) {
      statusEl.textContent = msg;
      statusEl.className = isError ? 'error' : 'success';
      errorEl.textContent = '';
    }
    function setError(msg) {
      errorEl.textContent = msg;
      statusEl.textContent = '';
    }

    async function connectAndSign(wallet) {
      try {
        setStatus('Connecting...', false);
        setError('');
        const connectFeature = wallet.features['standard:connect'];
        if (!connectFeature) throw new Error('Wallet does not support connect');
        const { accounts } = await connectFeature.connect();
        if (!accounts || accounts.length === 0) throw new Error('No accounts authorized');
        const account = accounts[0];
        const address = account.address;

        let signature = '';
        const signFeature = wallet.features['sui:signPersonalMessage'];
        if (signFeature?.signPersonalMessage) {
          setStatus('Please sign the message in your wallet...', false);
          const message = new TextEncoder().encode('Powerlay login: ' + sessionId);
          const result = await signFeature.signPersonalMessage({ message, account });
          signature = result?.signature ? (typeof result.signature === 'string' ? result.signature : btoa(String.fromCharCode(...new Uint8Array(result.signature)))) : '';
        }

        setStatus('Completing sign-in...', false);
        const res = await fetch(callbackUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ sessionId, address, signature })
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data.error || 'Callback failed');
        loginCompletedSuccessfully = true;
        setStatus('Login successful. You can close this window.', false);
      } catch (err) {
        setError(err.message || 'Connection failed');
        setStatus('', false);
      }
    }

    function renderWalletButtons(wallets) {
      walletListEl.innerHTML = '';
      for (const w of wallets) {
        const btn = document.createElement('button');
        btn.className = 'wallet-btn';
        btn.textContent = w.name || 'Connect Wallet';
        btn.onclick = () => connectAndSign(w);
        walletListEl.appendChild(btn);
      }
    }

    function renderHelp() {
      walletListEl.innerHTML = \`
        <div class="help-box">
          <h2>Connect Wallet</h2>
          <p>To use Powerlay Frontier's <strong>blockchain-connected features</strong>, you need the <strong>EVE Vault wallet</strong> — the official browser wallet for EVE Frontier. The builder tool works without it.</p>
          <div class="warn">⚠️ The wallet is currently installed manually (not from Chrome Web Store).</div>

          <h3>🚀 Quick setup (3–5 minutes)</h3>

          <div class="step">
            <p class="step-title">1. Download EVE Vault</p>
            <p>Open the official repository and download the latest release (ZIP), then extract it to your computer.</p>
            <p><a href="https://github.com/evefrontier/evevault/releases" target="_blank" rel="noopener">github.com/evefrontier/evevault/releases</a></p>
          </div>

          <div class="step">
            <p class="step-title">2. Install extension in Chrome</p>
            <p>Open <code>chrome://extensions/</code> in your address bar, enable <strong>Developer mode</strong> (top-right), click <strong>Load unpacked</strong>, and select the extracted folder.</p>
          </div>

          <div class="step">
            <p class="step-title">3. Sign in</p>
            <p>Click the EVE Vault icon in your browser, complete the login (EVE account / OAuth). Your wallet address will be created automatically.</p>
          </div>

              <div class="step">
                <p class="step-title">4. Return to Powerlay</p>
                <p>Come back to this page and click <strong>Refresh</strong> (F5). Your wallet should now be detected.</p>
              </div>

          <h3>💡 How it works</h3>
          <p>EVE Vault creates your wallet using your EVE account (zkLogin). After login, your wallet becomes available to apps automatically.</p>

          <h3>🔗 Full guide</h3>
          <p>If something doesn't work or you need more details: <a href="https://docs.evefrontier.com/eve-vault/browser-extension" target="_blank" rel="noopener">docs.evefrontier.com/eve-vault/browser-extension</a></p>
        </div>
      \`;
    }

    let pollInterval = null;
    let walletModule = null;

    async function checkForWallets() {
      try {
        if (!walletModule) walletModule = await import('https://esm.sh/@wallet-standard/core@1.1.1');
        const wallets = walletModule.getWallets().get();
        if (wallets.length > 0) {
          if (pollInterval) { clearInterval(pollInterval); pollInterval = null; }
          renderWalletButtons(wallets);
          setError('');
          return true;
        }
        return false;
      } catch (err) {
        setError('Failed to check for wallets: ' + (err.message || err));
        return false;
      }
    }

    async function init() {
      try {
        let found = await checkForWallets();
        if (!found) {
          await new Promise(r => setTimeout(r, 1000));
          found = await checkForWallets();
        }
        if (!found) {
          renderHelp();
          pollInterval = setInterval(checkForWallets, 2000);
          window.addEventListener('pagehide', () => { if (pollInterval) clearInterval(pollInterval); });
        }
      } catch (err) {
        setError('Failed to load wallet support: ' + (err.message || err));
      }
    }
    init();
  </script>
</body>
</html>`;
}

export function getAuthPage(sessionId: string, baseUrl: string): string {
  return getAuthPageHtml().replace(/\{\{SESSION_ID\}\}/g, sessionId).replace(/\{\{BASE_URL\}\}/g, baseUrl);
}
