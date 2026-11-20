import React, { useEffect, useRef } from 'react';
import { ClipboardEntry } from '../../../shared/types';
import { ClipboardEntryCard } from './ClipboardEntryCard';

interface ClipboardHistoryProps {
  entries: ClipboardEntry[];
  onDeleteEntry: (id: number) => void;
  onPinEntry: (id: number) => void;
  onCopyToClipboard: (entry: ClipboardEntry, plain?: boolean) => void;
  onUpdateNote: (id: number, note: string) => void;
  selectedIndex?: number;
}

export const ClipboardHistory: React.FC<ClipboardHistoryProps> = ({
  entries,
  onDeleteEntry,
  onPinEntry,
  onCopyToClipboard,
  onUpdateNote,
  selectedIndex = -1,
}) => {
  const selectedRef = useRef<HTMLDivElement>(null);

  const pinned = entries.filter(e => e.isPinned);
  const recent = entries.filter(e => !e.isPinned);

  // Keep the keyboard selection in view without animated jumps.
  useEffect(() => {
    selectedRef.current?.scrollIntoView({ block: 'nearest' });
  }, [selectedIndex]);

  const row = (entry: ClipboardEntry, index: number) => (
    <div key={entry.id} ref={index === selectedIndex ? selectedRef : null}>
      <ClipboardEntryCard
        entry={entry}
        onDelete={onDeleteEntry}
        onPin={onPinEntry}
        onCopy={onCopyToClipboard}
        onUpdateNote={onUpdateNote}
        isSelected={index === selectedIndex}
        dataIndex={index}
      />
    </div>
  );

  return (
    <div role="listbox" aria-label="Clipboard history">
      {pinned.length > 0 && (
        <>
          <h3 className="lc-section">
            Pinned <span className="lc-count">{pinned.length}</span>
          </h3>
          {pinned.map((e, i) => row(e, i))}
        </>
      )}
      {recent.length > 0 && (
        <>
          {pinned.length > 0 && (
            <h3 className="lc-section">
              Recent <span className="lc-count">{recent.length}</span>
            </h3>
          )}
          {recent.map((e, i) => row(e, pinned.length + i))}
        </>
      )}
    </div>
  );
};
