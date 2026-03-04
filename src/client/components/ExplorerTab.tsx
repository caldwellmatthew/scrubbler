import { useState } from 'preact/hooks';
import * as api from '../api';

const PRESETS = [
  '/me',
  '/me/player/recently-played?limit=50',
];

export function ExplorerTab() {
  const [endpoint, setEndpoint] = useState('/me/player/recently-played?limit=50');
  const [output, setOutput] = useState('Hit Send to make a request.');
  const [statusText, setStatusText] = useState('');
  const [statusOk, setStatusOk] = useState(true);

  async function sendRequest(ep?: string) {
    const raw = (ep ?? endpoint).trim();
    if (!raw) return;

    setOutput('Loading\u2026');
    setStatusText('');

    const [path, query] = raw.split('?');
    const result = await api.proxySpotifyRequest(path, query);

    const ok = result.status >= 200 && result.status < 300;
    setStatusOk(ok);
    setStatusText(`HTTP ${result.status}`);
    setOutput(JSON.stringify(result.data, null, 2));
  }

  function onPresetClick(preset: string) {
    setEndpoint(preset);
    sendRequest(preset);
  }

  return (
    <div>
      <div class="explorer-row">
        <input
          type="text"
          value={endpoint}
          onInput={(e) => setEndpoint((e.target as HTMLInputElement).value)}
          onKeyDown={(e) => { if (e.key === 'Enter') sendRequest(); }}
          placeholder="/me/player/recently-played?limit=50"
          spellcheck={false}
        />
        <button id="send-btn" onClick={() => sendRequest()}>Send</button>
      </div>
      <div class="presets">
        {PRESETS.map((p) => (
          <span key={p} class="preset" onClick={() => onPresetClick(p)}>{p}</span>
        ))}
      </div>
      {statusText && (
        <div class="response-meta">
          HTTP <span class={statusOk ? 'status-ok' : 'status-err'}>{statusText.replace('HTTP ', '')}</span>
        </div>
      )}
      <pre id="response-output">{output}</pre>
    </div>
  );
}
