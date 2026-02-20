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
      margin-bottom: 2rem;
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

  <script>
    const LIMIT = 50;
    let offset = 0;
    let polling = false;
    let authenticated = false;

    function show(id) { document.getElementById(id).classList.remove('hidden'); }
    function hide(id) { document.getElementById(id).classList.add('hidden'); }

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
