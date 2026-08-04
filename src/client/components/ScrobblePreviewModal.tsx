import { useState, useEffect, useRef } from 'preact/hooks';
import type { PreviewItem } from '../types';
import * as api from '../api';

interface ScrobblePreviewModalProps {
  ids: string[];
  open: boolean;
  rescrobbleCount: number;
  onClose: () => void;
  onScrobbled: (ids: string[]) => void;
}

interface EditableRow {
  id: string;
  playedAt: string;
  artist: string;
  track: string;
  album: string;
  defaultTrack: string;
  defaultAlbum: string;
  originalTrack: string;
  originalAlbum: string;
  skipReason: string | null;
}

export function ScrobblePreviewModal({ ids, open, rescrobbleCount, onClose, onScrobbled }: ScrobblePreviewModalProps) {
  const [rows, setRows] = useState<EditableRow[]>([]);
  const [allSameAlbum, setAllSameAlbum] = useState(false);
  const backdropRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open || ids.length === 0) return;
    api.getScrobblePreview(ids).then((preview) => {
      if (preview.error) {
        alert('Preview failed: ' + preview.error);
        onClose();
        return;
      }
      const editableRows = preview.items.map((item: PreviewItem) => ({
        id: item.id,
        playedAt: item.playedAt,
        artist: item.artist,
        track: item.track,
        album: item.album,
        defaultTrack: item.track,
        defaultAlbum: item.album,
        originalTrack: item.originalTrack,
        originalAlbum: item.originalAlbum,
        skipReason: item.skipReason,
      }));
      setRows(editableRows);
      const albums = preview.items.map((i: PreviewItem) => i.album);
      setAllSameAlbum(albums.length > 1 && albums.every((v: string) => v === albums[0]));
    }).catch((err) => {
      alert('Preview failed: ' + err.message);
      onClose();
    });
  }, [open, ids]);

  function updateTrack(idx: number, value: string) {
    setRows((prev) => prev.map((r, i) => i === idx ? { ...r, track: value } : r));
  }

  function updateAlbum(idx: number, value: string) {
    if (allSameAlbum) {
      setRows((prev) => prev.map((r) => ({ ...r, album: value })));
    } else {
      setRows((prev) => prev.map((r, i) => i === idx ? { ...r, album: value } : r));
    }
  }

  /**
   * Offer to resubmit plays the server declined to send. Returns the ids that
   * Last.fm then accepted, or none if the offer was declined.
   */
  async function confirmForced(
    skipped: api.SkippedScrobble[],
    overrides: Record<string, { track: string; album: string }>,
  ): Promise<string[]> {
    const lines = skipped.map((s) => `"${s.track}" by ${s.artist} — ${s.reason}`);
    const proceed = window.confirm(
      `Skipped ${skipped.length} play${skipped.length === 1 ? '' : 's'}:\n\n` +
      `${lines.join('\n')}\n\nScrobble anyway?`,
    );
    if (!proceed) return [];

    const forced = await api.submitScrobble(skipped.map((s) => s.id), overrides, true);
    if (!forced.ok) {
      alert('Scrobble failed: ' + (forced.error || 'Unknown error'));
      return [];
    }
    return forced.scrobbledIds ?? [];
  }

  async function confirm() {
    const overrides: Record<string, { track: string; album: string }> = {};
    for (const row of rows) {
      if (row.track !== row.defaultTrack || row.album !== row.defaultAlbum) {
        overrides[row.id] = { track: row.track, album: row.album };
      }
    }
    onClose();
    try {
      const result = await api.submitScrobble(ids, overrides);
      if (!result.ok) {
        alert('Scrobble failed: ' + (result.error || 'Unknown error'));
        return;
      }
      const ignored = result.ignored ?? [];
      const skipped = result.skipped ?? [];
      const scrobbledIds = new Set(result.scrobbledIds ?? []);

      if (ignored.length > 0) {
        const lines = ignored.map((s) => `"${s.track}" by ${s.artist} — ${s.reason || 'no reason given'}`);
        const sent = scrobbledIds.size + ignored.length;
        alert(`Last.fm ignored ${ignored.length} of ${sent} scrobbles:\n\n${lines.join('\n')}`);
      }
      if (skipped.length > 0) {
        for (const id of await confirmForced(skipped, overrides)) scrobbledIds.add(id);
      }
      onScrobbled([...scrobbledIds]);
    } catch (err: unknown) {
      alert('Scrobble failed: ' + (err instanceof Error ? err.message : String(err)));
    }
  }

  function onBackdropClick(e: MouseEvent) {
    if (e.target === backdropRef.current) onClose();
  }

  if (!open) return null;

  // Before the preview lands there is nothing to skip, so every id still counts
  const skipCount = rows.filter((r) => r.skipReason).length;
  const sendCount = rows.length > 0 ? rows.length - skipCount : ids.length;

  return (
    <div id="preview-modal" class="open" ref={backdropRef} onClick={onBackdropClick}>
      <div id="preview-box">
        <h2>Preview scrobble — {ids.length} track{ids.length === 1 ? '' : 's'}</h2>
        {rescrobbleCount > 0 && (
          <p class="rescrobble-note">
            {rescrobbleCount === ids.length
              ? (ids.length === 1 ? 'This track has' : 'All of these tracks have')
              : `${rescrobbleCount} of these tracks have`
            } already been scrobbled. Delete the original {rescrobbleCount === 1 ? 'scrobble' : 'scrobbles'} on Last.fm first to avoid duplicates.
          </p>
        )}
        {skipCount > 0 && (
          <p class="rescrobble-note">
            {skipCount === 1 ? '1 play repeats' : `${skipCount} plays repeat`} an earlier
            listen and will be held back. You'll be asked whether to send {skipCount === 1 ? 'it' : 'them'} anyway.
          </p>
        )}
        <div id="preview-scroll">
          <table id="preview-table">
            <thead>
              <tr>
                <th>Played at</th>
                <th>Artist</th>
                <th>Track</th>
                <th>Album</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row, idx) => {
                const changed = row.track !== row.originalTrack || row.album !== row.originalAlbum;
                const cls = [changed ? 'preview-changed' : '', row.skipReason ? 'skipped' : '']
                  .filter(Boolean).join(' ');
                return (
                  <tr key={row.id} class={cls}>
                    <td class="artist-cell">
                      {row.skipReason ? (
                        <span class="scrobble-badge skipped" title={`Held back — ${row.skipReason}`}>⊘</span>
                      ) : (
                        <span class="scrobble-badge-spacer" />
                      )}
                      {new Date(row.playedAt).toLocaleString()}
                    </td>
                    <td class="artist-cell">{row.artist}</td>
                    <td>
                      <input
                        class="preview-track"
                        value={row.track}
                        onInput={(e) => updateTrack(idx, (e.target as HTMLInputElement).value)}
                        title={`Original: ${row.originalTrack}`}
                      />
                    </td>
                    <td>
                      <input
                        class="preview-album"
                        value={row.album}
                        onInput={(e) => updateAlbum(idx, (e.target as HTMLInputElement).value)}
                        title={`Original: ${row.originalAlbum}`}
                      />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <div id="preview-actions">
          <button onClick={onClose}>Cancel</button>
          <button id="preview-confirm-btn" onClick={confirm}>
            {sendCount === 0
              ? 'Scrobble anyway'
              : `Scrobble ${sendCount} track${sendCount === 1 ? '' : 's'}`}
          </button>
        </div>
      </div>
    </div>
  );
}
