interface ScrobbleBarProps {
  selectedCount: number;
  visible: boolean;
  onScrobble: () => void;
  onSelectAlbum: () => void;
  onClear: () => void;
}

export function ScrobbleBar({ selectedCount, visible, onScrobble, onSelectAlbum, onClear }: ScrobbleBarProps) {
  return (
    <div id="scrobble-bar" class={visible ? 'visible' : ''}>
      <span>{selectedCount} selected</span>
      <button id="scrobble-btn" onClick={onScrobble}>Scrobble to Last.fm</button>
      <button id="select-album-btn" onClick={onSelectAlbum}>Select album</button>
      <button id="scrobble-clear-btn" onClick={onClear}>Clear</button>
    </div>
  );
}
