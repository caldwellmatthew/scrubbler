import { useRef, useCallback } from 'preact/hooks';
import type { HistoryItem } from '../types';
import { ScrobbleBar } from './ScrobbleBar';

interface HistoryTabProps {
  items: HistoryItem[];
  selectedIds: Set<string>;
  lastfmEnabled: boolean;
  lastfmConnected: boolean;
  hasMore: boolean;
  onSelectionChange: (ids: Set<string>) => void;
  onLoadMore: () => void;
  onScrobble: (ids: string[]) => void;
  scrobbledIds: Set<string>;
}

function fmtDuration(ms: number) {
  const s = Math.round(ms / 1000);
  return Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0');
}

export function HistoryTab({
  items,
  selectedIds,
  lastfmEnabled,
  lastfmConnected,
  hasMore,
  onSelectionChange,
  onLoadMore,
  onScrobble,
  scrobbledIds,
}: HistoryTabProps) {
  const lastClickedIdx = useRef(-1);

  const selectableItems = items;

  const setSelection = useCallback((next: Set<string>) => {
    onSelectionChange(new Set(next));
  }, [onSelectionChange]);

  function onSelectAll(e: Event) {
    const checked = (e.target as HTMLInputElement).checked;
    if (checked) {
      const next = new Set(selectableItems.map((item) => item.id));
      setSelection(next);
    } else {
      setSelection(new Set());
    }
    lastClickedIdx.current = -1;
  }

  function onMouseDown(e: MouseEvent) {
    if (e.shiftKey) e.preventDefault();
  }

  function onRowClick(e: MouseEvent) {
    if (!lastfmEnabled || !lastfmConnected) return;
    const target = e.target as HTMLElement;
    const tr = target.closest('tr');
    if (!tr) return;
    const id = tr.dataset.id;
    if (!id) return;
    const item = items.find((i) => i.id === id);
    if (!item) return;

    const idx = selectableItems.findIndex((i) => i.id === id);

    if (e.shiftKey && lastClickedIdx.current !== -1) {
      const start = Math.min(lastClickedIdx.current, idx);
      const end = Math.max(lastClickedIdx.current, idx);
      const anchorItem = selectableItems[lastClickedIdx.current];
      const targetChecked = selectedIds.has(anchorItem.id);
      const next = new Set(selectedIds);
      for (let i = start; i <= end; i++) {
        if (targetChecked) next.add(selectableItems[i].id);
        else next.delete(selectableItems[i].id);
      }
      setSelection(next);
    } else {
      const next = new Set(selectedIds);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      setSelection(next);
      lastClickedIdx.current = idx;
    }
  }

  function onClear() {
    setSelection(new Set());
    lastClickedIdx.current = -1;
  }

  function onSelectAlbum() {
    if (lastClickedIdx.current === -1) return;
    const anchor = selectableItems[lastClickedIdx.current];
    if (!anchor) return;
    const album = anchor.track.albumName;
    let start = lastClickedIdx.current;
    while (start > 0 && selectableItems[start - 1].track.albumName === album) start--;
    let end = lastClickedIdx.current;
    while (end < selectableItems.length - 1 && selectableItems[end + 1].track.albumName === album) end++;
    const next = new Set(selectedIds);
    for (let i = start; i <= end; i++) {
      next.add(selectableItems[i].id);
    }
    lastClickedIdx.current = end;
    setSelection(next);
  }

  const barVisible = selectedIds.size > 0 && lastfmEnabled && lastfmConnected;

  return (
    <div>
      <ScrobbleBar
        selectedCount={selectedIds.size}
        visible={barVisible}
        onScrobble={() => onScrobble([...selectedIds])}
        onSelectAlbum={onSelectAlbum}
        onClear={onClear}
      />
      {items.length === 0 ? (
        <p id="empty" style={{ display: 'block' }}>No history yet — wait for the first poll.</p>
      ) : (
        <>
          <table>
            <thead>
              <tr>
                <th class="check-col">
                  <input type="checkbox" onChange={onSelectAll} checked={selectedIds.size > 0 && selectedIds.size === selectableItems.length} />
                </th>
                <th>Played at</th>
                <th>Track</th>
                <th>Artist</th>
                <th>Album</th>
                <th>Duration</th>
              </tr>
            </thead>
            <tbody onMouseDown={onMouseDown} onClick={onRowClick}>
              {items.map((item) => {
                const isScrobbled = !!item.scrobbledAt || scrobbledIds.has(item.id);
                const isSelected = selectedIds.has(item.id);
                const cls = [
                  isScrobbled ? 'scrobbled' : '',
                  isSelected ? 'selected' : '',
                ].filter(Boolean).join(' ');

                return (
                  <tr key={item.id} data-id={item.id} data-album={item.track.albumName} class={cls}>
                    {lastfmEnabled ? (
                      <td class="check-cell">
                        <input type="checkbox" class="row-check" checked={isSelected} />
                      </td>
                    ) : (
                      <td class="check-cell"></td>
                    )}
                    <td>
                      {isScrobbled ? (
                        <span class="scrobble-badge" title={
                          (item.scrobbleSanitized ?? scrobbledIds.has(item.id))
                            ? 'Scrobbled (sanitized)'
                            : item.scrobbleSanitized === false
                              ? 'Scrobbled (original tags)'
                              : 'Scrobbled'
                        }>
                          {(item.scrobbleSanitized ?? (scrobbledIds.has(item.id) || null)) === true ? '✓S' : '✓'}
                        </span>
                      ) : (
                        <span class="scrobble-badge-spacer" />
                      )}
                      {new Date(item.playedAt).toLocaleString()}
                    </td>
                    <td class="track-name">{item.track.name}</td>
                    <td>{item.track.artistName}</td>
                    <td>{item.track.albumName}</td>
                    <td>{fmtDuration(item.track.durationMs)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          <button id="load-more" disabled={!hasMore} onClick={onLoadMore}>Load more</button>
        </>
      )}
    </div>
  );
}
