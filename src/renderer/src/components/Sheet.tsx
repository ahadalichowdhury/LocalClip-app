import { X } from 'lucide-react';
import React, { useEffect } from 'react';
import { createPortal } from 'react-dom';

interface SheetProps {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
  footer?: React.ReactNode;
  /** Cover the whole panel (Settings) instead of rising from the bottom */
  full?: boolean;
  labelId?: string;
}

/**
 * A sheet that rises over the clip list, inside the popup. Rendered into the
 * panel shell so it never escapes the rounded window, and it swallows clicks
 * and keys so nothing behind it gets pasted by accident.
 */
export const Sheet: React.FC<SheetProps> = ({
  title,
  onClose,
  children,
  footer,
  full = false,
  labelId = 'lc-sheet-title',
}) => {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        // e.g. the shortcut recorder handles its own Escape
        if ((e.target as HTMLElement)?.closest?.('[data-keep-escape]')) return;
        e.preventDefault();
        e.stopImmediatePropagation();
        onClose();
      }
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [onClose]);

  const host = document.querySelector('.lc-shell') ?? document.body;

  return createPortal(
    <div
      className="lc-scrim"
      onClick={e => {
        e.stopPropagation();
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <section
        className={`lc-sheet${full ? ' is-full' : ''}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby={labelId}
      >
        <header className="lc-sheet-head">
          <h2 id={labelId}>{title}</h2>
          <button
            type="button"
            className="lc-iconbtn"
            onClick={onClose}
            aria-label="Close"
          >
            <X size={16} />
          </button>
        </header>
        <div className="lc-sheet-body">{children}</div>
        {footer && <footer className="lc-sheet-foot">{footer}</footer>}
      </section>
    </div>,
    host
  );
};
