import { useState, useEffect, useRef } from 'preact/hooks';
import type { PreviewItem } from '../types';
import * as api from '../api';

interface ScrobblePreviewModalProps {
  ids: string[];
  open: boolean;
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
}

export function ScrobblePreviewModal({ ids, open, onClose, onScrobbled }: ScrobblePreviewModalProps) {
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
      onScrobbled(ids);
    } catch (err: unknown) {
      alert('Scrobble failed: ' + (err instanceof Error ? err.message : String(err)));
    }
  }

  function onBackdropClick(e: MouseEvent) {
    if (e.target === backdropRef.current) onClose();
  }

  if (!open) return null;

  return (
    <div id="preview-modal" class="open" ref={backdropRef} onClick={onBackdropClick}>
      <div id="preview-box">
        <h2>Preview scrobble — {ids.length} track{ids.length === 1 ? '' : 's'}</h2>
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
                return (
                  <tr key={row.id} class={changed ? 'preview-changed' : ''}>
                    <td class="artist-cell">{new Date(row.playedAt).toLocaleString()}</td>
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
            Scrobble {ids.length} track{ids.length === 1 ? '' : 's'}
          </button>
        </div>
      </div>
    </div>
  );
}
