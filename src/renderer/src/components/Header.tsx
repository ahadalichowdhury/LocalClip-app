import { Eraser, Settings2 } from 'lucide-react';
import React from 'react';
import { ActionTooltip } from './ActionTooltip';

interface HeaderProps {
  /** Omitted on the Emoji tab, where there is nothing to clear */
  onClearHistory?: () => void;
  onOpenSettings: () => void;
  /** The search field, rendered inline so the toolbar is one compact row */
  children?: React.ReactNode;
  /** Before the search field (the Clipboard / Emoji tabs) */
  leading?: React.ReactNode;
  /** After the search field, before Settings (e.g. the emoji kind switch) */
  extra?: React.ReactNode;
}

/**
 * Toolbar under the native macOS title bar: search + two quiet actions.
 * Closing is done with the window's own red close button (or esc).
 */
export const Header: React.FC<HeaderProps> = ({
  onClearHistory,
  onOpenSettings,
  children,
  leading,
  extra,
}) => (
  <header className="lc-searchrow">
    {leading}
    {children}
    {extra}
    {onClearHistory && (
      <ActionTooltip label="Clear unpinned clips">
        <button
          type="button"
          className="lc-iconbtn is-danger"
          onClick={onClearHistory}
          aria-label="Clear"
        >
          <Eraser size={16} />
        </button>
      </ActionTooltip>
    )}
    <ActionTooltip label="Settings">
      <button
        type="button"
        className="lc-iconbtn"
        onClick={onOpenSettings}
        aria-label="Settings"
        title="Settings"
      >
        <Settings2 size={16} />
      </button>
    </ActionTooltip>
  </header>
);
