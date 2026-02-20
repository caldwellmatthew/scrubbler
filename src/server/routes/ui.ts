import { Router } from 'express';

export const uiRouter = Router();

uiRouter.get('/', (_req, res) => {
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.send(HTML);
});

const HTML = /* html */ `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Spotify Cache</title>
  <style>
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: system-ui, -apple-system, sans-serif;
      background: #111;
      color: #e0e0e0;
      padding: 2rem;
      font-size: 14px;
    }
    header {
      display: flex;
      align-items: center;
      gap: 1rem;
      margin-bottom: 1.5rem;
      flex-wrap: wrap;
    }
    h1 { font-size: 1.25rem; font-weight: 600; color: #fff; }
    .pill {
      padding: 0.2rem 0.65rem;
      border-radius: 999px;
      font-size: 0.75rem;
      font-weight: 600;
      letter-spacing: 0.03em;
    }
    .pill.on  { background: #1db954; color: #000; }
    .pill.off { background: #444; color: #aaa; }
    button, .btn {
      cursor: pointer;
      border: 1px solid #444;
      background: #222;
      color: #e0e0e0;
      padding: 0.3rem 0.9rem;
      border-radius: 6px;
      font-size: 0.85rem;
      text-decoration: none;
      display: inline-block;
    }
    button:hover, .btn:hover { background: #2a2a2a; }
    #login-btn { border-color: #1db954; color: #1db954; }
    #login-btn:hover { background: #1db95415; }
    #logout-btn { border-color: #555; color: #888; }
    .user-id { font-size: 0.75rem; color: #555; }
    .spacer { margin-left: auto; }
    .meta { font-size: 0.75rem; color: #555; }

    /* ── Tabs ── */
    .tabs {
      display: flex;
      gap: 0;
      border-bottom: 1px solid #2a2a2a;
      margin-bottom: 1.5rem;
    }
    .tab {
      padding: 0.5rem 1.1rem;
      cursor: pointer;
      color: #666;
      font-size: 0.85rem;
      border: none;
      border-bottom: 2px solid transparent;
      border-radius: 0;
      background: transparent;
      margin-bottom: -1px;
    }
    .tab:hover { color: #aaa; background: transparent; }
    .tab.active { color: #fff; border-bottom-color: #1db954; }

    /* ── History tab ── */
    table { width: 100%; border-collapse: collapse; }
    th {
      text-align: left;
      padding: 0.5rem 0.75rem;
      color: #555;
      font-weight: 500;
      border-bottom: 1px solid #2a2a2a;
      white-space: nowrap;
    }
    td {
      padding: 0.55rem 0.75rem;
      border-bottom: 1px solid #1c1c1c;
      color: #ccc;
    }
    td.track-name { color: #fff; }
    tr:hover td { background: #181818; }
    #load-more {
      margin-top: 1.25rem;
      cursor: pointer;
      border: 1px solid #333;
      background: #1a1a1a;
      color: #888;
      padding: 0.4rem 1.2rem;
      border-radius: 6px;
      font-size: 0.85rem;
      display: block;
    }
    #load-more:hover:not(:disabled) { background: #222; color: #ccc; }
    #load-more:disabled { opacity: 0.35; cursor: default; }
    #empty { text-align: center; padding: 4rem 0; color: #444; }

    /* ── Explorer tab ── */
    .explorer-row {
      display: flex;
      gap: 0.5rem;
      align-items: stretch;
      margin-bottom: 1rem;
    }
    .explorer-row input {
      flex: 1;
      background: #1a1a1a;
      border: 1px solid #333;
      border-radius: 6px;
      color: #e0e0e0;
      padding: 0.4rem 0.75rem;
      font-size: 0.9rem;
      font-family: monospace;
    }
    .explorer-row input:focus { outline: none; border-color: #555; }
    #send-btn { white-space: nowrap; }
    .presets {
      display: flex;
      gap: 0.4rem;
      flex-wrap: wrap;
      margin-bottom: 1rem;
    }
    .preset {
      font-size: 0.75rem;
      padding: 0.2rem 0.6rem;
      border-radius: 4px;
      cursor: pointer;
      background: #1a1a1a;
      border: 1px solid #2a2a2a;
      color: #888;
      font-family: monospace;
    }
    .preset:hover { background: #222; color: #ccc; border-color: #444; }
    .response-meta {
      font-size: 0.75rem;
      color: #555;
      margin-bottom: 0.5rem;
    }
    .response-meta .status-ok  { color: #1db954; }
    .response-meta .status-err { color: #e05c5c; }
    #response-output {
      background: #0d0d0d;
      border: 1px solid #222;
      border-radius: 6px;
      padding: 1rem;
      font-family: monospace;
      font-size: 0.8rem;
      line-height: 1.6;
      color: #ccc;
      white-space: pre;
      overflow: auto;
      max-height: 60vh;
      min-height: 6rem;
    }
    #response-output::-webkit-scrollbar { width: 8px; height: 8px; }
    #response-output::-webkit-scrollbar-track { background: #1a1a1a; border-radius: 4px; }
    #response-output::-webkit-scrollbar-thumb { background: #444; border-radius: 4px; }
    #response-output::-webkit-scrollbar-thumb:hover { background: #555; }

    /* ── Shared ── */
    #unauthenticated {
      text-align: center;
      padding: 5rem 0;
      color: #555;
    }
    #unauthenticated a {
      display: inline-block;
      margin-top: 1rem;
      padding: 0.5rem 1.5rem;
      border: 1px solid #1db954;
      border-radius: 6px;
      color: #1db954;
      text-decoration: none;
      font-size: 0.9rem;
    }
    #unauthenticated a:hover { background: #1db95415; }
    .hidden { display: none !important; }
  </style>
</head>
<body>
  <header>
    <h1>Spotify Cache</h1>
    <span id="poll-pill" class="pill hidden">...</span>
    <button id="toggle-btn" class="hidden">...</button>
    <span class="spacer"></span>
    <span class="meta" id="last-polled"></span>
    <span class="user-id" id="user-id"></span>
    <button id="logout-btn" class="hidden">Log out</button>
    <a href="/auth/login" id="login-btn" class="btn hidden">Connect Spotify</a>
  </header>

  <div id="unauthenticated" class="hidden">
    <p>Connect your Spotify account to start caching your listening history.</p>
    <a href="/auth/login">Connect Spotify</a>
  </div>

  <div id="authenticated-content" class="hidden">
    <div class="tabs">
      <button class="tab active" data-tab="history">History</button>
      <button class="tab" data-tab="explorer">API Explorer</button>
    </div>

    <!-- History tab -->
    <div id="tab-history">
      <table>
        <thead>
          <tr>
            <th>Played at</th>
            <th>Track</th>
            <th>Artist</th>
            <th>Album</th>
            <th>Duration</th>
          </tr>
        </thead>
        <tbody id="tbody"></tbody>
      </table>
      <p id="empty" style="display:none">No history yet — wait for the first poll.</p>
      <button id="load-more" disabled>Load more</button>
    </div>

    <!-- Explorer tab -->
    <div id="tab-explorer" class="hidden">
      <div class="explorer-row">
        <input id="endpoint-input" type="text" placeholder="/me/player/recently-played?limit=50" value="/me/player/recently-played?limit=50" spellcheck="false" />
        <button id="send-btn">Send</button>
      </div>
      <div class="presets">
        <span class="preset" data-endpoint="/me">/me</span>
        <span class="preset" data-endpoint="/me/player/recently-played?limit=50">/me/player/recently-played?limit=50</span>
      </div>
      <div class="response-meta" id="response-meta"></div>
      <pre id="response-output">Hit Send to make a request.</pre>
    </div>
  </div>

  <script>
    const LIMIT = 50;
    let offset = 0;
    let polling = false;
    let authenticated = false;

    function show(id) { document.getElementById(id).classList.remove('hidden'); }
    function hide(id) { document.getElementById(id).classList.add('hidden'); }

    // ── Tabs ────────────────────────────────────────────────────
    document.querySelectorAll('.tab').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
        btn.classList.add('active');
        const tab = btn.dataset.tab;
        document.querySelectorAll('[id^="tab-"]').forEach(el => el.classList.add('hidden'));
        document.getElementById('tab-' + tab).classList.remove('hidden');
      });
    });

    // ── Auth ────────────────────────────────────────────────────
    async function refreshAuthState() {
      const status = await fetch('/auth/status').then(r => r.json());
      authenticated = status.authenticated;
      if (authenticated) {
        document.getElementById('user-id').textContent = status.displayName || status.spotifyUserId;
        show('logout-btn');
        hide('login-btn');
        hide('unauthenticated');
        show('authenticated-content');
        show('poll-pill');
        show('toggle-btn');
      } else {
        document.getElementById('user-id').textContent = '';
        hide('logout-btn');
        show('login-btn');
        show('unauthenticated');
        hide('authenticated-content');
        hide('poll-pill');
        hide('toggle-btn');
        document.getElementById('last-polled').textContent = '';
      }
    }

    document.getElementById('logout-btn').addEventListener('click', async () => {
      await fetch('/auth/logout', { method: 'POST' });
      await refreshAuthState();
      document.getElementById('tbody').innerHTML = '';
      offset = 0;
    });

    // ── Poll state ──────────────────────────────────────────────
    async function refreshPollState() {
      if (!authenticated) return;
      const state = await fetch('/poll').then(r => r.json());
      polling = state.pollEnabled;
      document.getElementById('poll-pill').textContent = polling ? 'Polling' : 'Stopped';
      document.getElementById('poll-pill').className = 'pill ' + (polling ? 'on' : 'off');
      document.getElementById('toggle-btn').textContent = polling ? 'Stop polling' : 'Start polling';
      document.getElementById('last-polled').textContent = state.lastPolledAt
        ? 'Last polled ' + new Date(state.lastPolledAt).toLocaleString()
        : '';
    }

    document.getElementById('toggle-btn').addEventListener('click', async () => {
      const action = polling ? 'stop' : 'start';
      await fetch('/poll/' + action, { method: 'POST' });
      await refreshPollState();
    });

    // ── History ─────────────────────────────────────────────────
    function esc(s) {
      return String(s)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');
    }

    function fmtDuration(ms) {
      const s = Math.round(ms / 1000);
      return Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0');
    }

    async function loadHistory(reset) {
      if (!authenticated) return;
      if (reset) {
        offset = 0;
        document.getElementById('tbody').innerHTML = '';
      }
      const data = await fetch('/history?limit=' + LIMIT + '&offset=' + offset).then(r => r.json());
      const tbody = document.getElementById('tbody');
      for (const item of data.items) {
        const tr = document.createElement('tr');
        tr.innerHTML =
          '<td>' + esc(new Date(item.playedAt).toLocaleString()) + '</td>' +
          '<td class="track-name">' + esc(item.track.name) + '</td>' +
          '<td>' + esc(item.track.artistName) + '</td>' +
          '<td>' + esc(item.track.albumName) + '</td>' +
          '<td>' + fmtDuration(item.track.durationMs) + '</td>';
        tbody.appendChild(tr);
      }
      offset += data.items.length;
      document.getElementById('load-more').disabled = data.items.length < LIMIT;
      document.getElementById('empty').style.display = offset === 0 ? 'block' : 'none';
    }

    document.getElementById('load-more').addEventListener('click', () => loadHistory(false));

    // ── Explorer ─────────────────────────────────────────────────
    async function sendRequest() {
      const raw = document.getElementById('endpoint-input').value.trim();
      if (!raw) return;

      // Split path and inline query params, e.g. /me/top/tracks?limit=5
      const [path, inlineQuery] = raw.split('?');
      const params = new URLSearchParams(inlineQuery || '');
      params.set('endpoint', path);

      document.getElementById('response-output').textContent = 'Loading…';
      document.getElementById('response-meta').textContent = '';

      const res = await fetch('/explorer/proxy?' + params.toString());
      const json = await res.json();

      const meta = document.getElementById('response-meta');
      const statusClass = json.status >= 200 && json.status < 300 ? 'status-ok' : 'status-err';
      meta.innerHTML = 'HTTP <span class="' + statusClass + '">' + json.status + '</span>';

      document.getElementById('response-output').textContent = JSON.stringify(json.data, null, 2);
    }

    document.getElementById('send-btn').addEventListener('click', sendRequest);
    document.getElementById('endpoint-input').addEventListener('keydown', e => {
      if (e.key === 'Enter') sendRequest();
    });

    document.querySelectorAll('.preset').forEach(el => {
      el.addEventListener('click', () => {
        document.getElementById('endpoint-input').value = el.dataset.endpoint;
        sendRequest();
        // Switch to explorer tab if not already there
        document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
        document.querySelector('[data-tab="explorer"]').classList.add('active');
        document.querySelectorAll('[id^="tab-"]').forEach(e => e.classList.add('hidden'));
        document.getElementById('tab-explorer').classList.remove('hidden');
      });
    });

    // ── Init ────────────────────────────────────────────────────
    async function init() {
      await refreshAuthState();
      await refreshPollState();
      await loadHistory(true);
    }

    init();
    setInterval(refreshPollState, 30_000);
  </script>
</body>
</html>`;
