import { useState } from 'preact/hooks';
import * as api from '../api';
import type { LikedSyncItem, LikedSyncStatus } from '../types';

interface LikedSyncTabProps {
  status: LikedSyncStatus | null;
  items: LikedSyncItem[];
  selectedIds: Set<string>;
  onItemsChange: (items: LikedSyncItem[]) => void;
  onSelectionChange: (ids: Set<string>) => void;
  onStatusRefresh: () => void;
}

const SCAN_LIMIT = 25;

function confidenceLabel(item: LikedSyncItem): string {
  if (item.status === 'no_match') return 'No match';
  return item.confidence ?? '';
}

export function LikedSyncTab({
  status,
  items,
  selectedIds,
  onItemsChange,
  onSelectionChange,
  onStatusRefresh,
}: LikedSyncTabProps) {
  const [scanning, setScanning] = useState(false);
  const [applying, setApplying] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  const matchable = items.filter((item) => item.match !== null);

  function setSelection(next: Set<string>) {
    onSelectionChange(new Set(next));
  }

  function toggle(id: string) {
    const next = new Set(selectedIds);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSelection(next);
  }

  function onRowClick(e: MouseEvent) {
    const row = (e.target as HTMLElement).closest('tr');
    const id = row?.dataset.id;
    // The alternates dropdown lives inside the row; changing it must not
    // also toggle selection.
    if (!id || (e.target as HTMLElement).tagName === 'SELECT') return;
    // Unmatched rows render no checkbox, so they must not become selected —
    // they would be invisibly included and then fail on apply.
    if (!items.find((item) => item.id === id)?.match) return;
    toggle(id);
  }

  function onSelectAll() {
    if (selectedIds.size === matchable.length) setSelection(new Set());
    else setSelection(new Set(matchable.map((i) => i.id)));
  }

  function selectHighConfidence() {
    setSelection(new Set(matchable.filter((i) => i.confidence === 'high').map((i) => i.id)));
  }

  function chooseAlternate(id: string, spotifyTrackId: string) {
    onItemsChange(items.map((item) => (item.id === id ? { ...item, chosenTrackId: spotifyTrackId } : item)));
  }

  async function scan(retryUnmatched: boolean) {
    setScanning(true);
    setNotice(null);
    try {
      const result = await api.scanLovedTracks(SCAN_LIMIT, retryUnmatched);
      // Scan results append to whatever is already under review.
      const known = new Set(items.map((i) => i.id));
      onItemsChange([...items, ...result.items.filter((i) => !known.has(i.id))]);
      onStatusRefresh();
      setNotice(
        result.searched === 0
          ? `Nothing left to review. ${result.lovedNew} new loved track${result.lovedNew === 1 ? '' : 's'} mirrored.`
          : `Searched ${result.searched}, ${result.remaining} still unsearched.`,
      );
    } catch (err) {
      setNotice(`Scan failed: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setScanning(false);
    }
  }

  async function apply(action: 'confirm' | 'reject') {
    const ids = [...selectedIds];
    if (ids.length === 0) return;

    setApplying(true);
    setNotice(null);
    try {
      const confirm =
        action === 'confirm'
          ? ids.map((id) => {
              const item = items.find((i) => i.id === id);
              return item?.chosenTrackId ? { id, spotifyTrackId: item.chosenTrackId } : { id };
            })
          : [];
      const result = await api.applyLikedSync(confirm, action === 'reject' ? ids : []);

      const failedIds = new Set(result.failed.map((f) => f.id));
      onItemsChange(items.filter((item) => !ids.includes(item.id) || failedIds.has(item.id)));
      setSelection(new Set());
      onStatusRefresh();

      const parts: string[] = [];
      if (result.liked > 0) parts.push(`Added ${result.liked} to Spotify`);
      if (result.rejected > 0) parts.push(`Skipped ${result.rejected}`);
      if (result.failed.length > 0) parts.push(`${result.failed.length} failed: ${result.failed[0].reason}`);
      setNotice(parts.join(' · ') || 'Nothing changed.');
    } catch (err) {
      setNotice(`Failed: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setApplying(false);
    }
  }

  if (status && !status.lastfmEnabled) {
    return <p id="empty" style={{ display: 'block' }}>Last.fm is not configured on this server.</p>;
  }

  if (status && !status.lastfmConnected) {
    return (
      <p id="empty" style={{ display: 'block' }}>
        Connect your Last.fm account to sync loved tracks.
      </p>
    );
  }

  if (status && !status.spotifyScopesOk) {
    return (
      <div class="scope-prompt">
        <p>
          Syncing loved tracks needs permission to read and change your Spotify library, which
          your current login doesn't grant.
        </p>
        <p class="scope-list">Missing: {status.missingScopes.join(', ')}</p>
        <a href="/auth/login">Reconnect Spotify</a>
      </div>
    );
  }

  return (
    <div>
      <div class="liked-sync-toolbar">
        <button id="scan-btn" disabled={scanning || applying} onClick={() => scan(false)}>
          {scanning ? 'Scanning…' : 'Find matches'}
        </button>
        <button disabled={scanning || applying} onClick={() => scan(true)}>
          Retry unmatched
        </button>
        {matchable.length > 0 && (
          <button disabled={applying} onClick={selectHighConfidence}>
            Select high confidence
          </button>
        )}
        {status && (
          <span class="liked-sync-counts">
            {status.totalMirrored} loved · {status.unsearched} unsearched ·{' '}
            {status.counts.synced + status.counts.already_liked} synced
          </span>
        )}
      </div>

      {notice && <p class="liked-sync-notice">{notice}</p>}

      <div id="liked-sync-bar" class={`action-bar ${selectedIds.size > 0 ? 'visible' : ''}`}>
        <span>{selectedIds.size} selected</span>
        <button id="liked-sync-confirm-btn" disabled={applying} onClick={() => apply('confirm')}>
          {applying ? 'Adding…' : 'Add to Spotify'}
        </button>
        <button disabled={applying} onClick={() => apply('reject')}>
          Skip
        </button>
        <button disabled={applying} onClick={() => setSelection(new Set())}>
          Clear
        </button>
      </div>

      {items.length === 0 ? (
        <p id="empty" style={{ display: 'block' }}>
          No matches to review — hit “Find matches” to search Spotify for your loved tracks.
        </p>
      ) : (
        <table>
          <thead>
            <tr>
              <th class="check-col">
                <input
                  type="checkbox"
                  onChange={onSelectAll}
                  checked={selectedIds.size > 0 && selectedIds.size === matchable.length}
                />
              </th>
              <th>Loved on Last.fm</th>
              <th>Spotify match</th>
              <th>Confidence</th>
            </tr>
          </thead>
          <tbody onClick={onRowClick}>
            {items.map((item) => {
              const isSelected = selectedIds.has(item.id);
              const unmatched = item.match === null;
              const cls = [unmatched ? 'unmatched' : '', isSelected ? 'selected' : '']
                .filter(Boolean)
                .join(' ');

              return (
                <tr key={item.id} data-id={item.id} class={cls}>
                  <td class="check-cell">
                    {!unmatched && <input type="checkbox" class="row-check" checked={isSelected} />}
                  </td>
                  <td>
                    <div>{item.lastfmTrack}</div>
                    <div class="artist-cell">{item.lastfmArtist}</div>
                  </td>
                  <td>
                    {unmatched ? (
                      <span class="no-match">Nothing found on Spotify</span>
                    ) : item.alternates.length > 1 ? (
                      <select
                        class="alt-select"
                        value={item.chosenTrackId ?? item.match!.spotifyTrackId}
                        onChange={(e) => chooseAlternate(item.id, (e.target as HTMLSelectElement).value)}
                      >
                        {item.alternates.map((alt) => (
                          <option key={alt.spotifyTrackId} value={alt.spotifyTrackId}>
                            {alt.name} · {alt.albumName}
                          </option>
                        ))}
                      </select>
                    ) : (
                      <div>
                        <div>{item.match!.name}</div>
                        <div class="artist-cell">{item.match!.albumName}</div>
                      </div>
                    )}
                  </td>
                  <td>
                    <span class={`confidence confidence-${item.confidence ?? 'none'}`}>
                      {confidenceLabel(item)}
                    </span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
    </div>
  );
}
