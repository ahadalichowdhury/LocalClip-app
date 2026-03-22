import { Clipboard } from 'lucide-react';
import React from 'react';
import { ActionTooltip } from './ActionTooltip';

interface HeaderProps {
  onClearHistory: () => void;
  onOpenSettings: () => void;
}

export const Header: React.FC<HeaderProps> = ({
  onClearHistory,
  onOpenSettings,
}) => {
  return (
    <header className="bg-light-bg-secondary dark:bg-dark-bg-secondary border-b border-light-border dark:border-dark-border">
      <div className="flex items-center justify-between px-4 py-3">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 bg-primary-500 rounded-lg flex items-center justify-center">
            <Clipboard className="w-5 h-5 text-white" />
          </div>
          <div>
            <h1 className="text-lg font-semibold text-light-text-primary dark:text-dark-text-primary">
              LocalClip
            </h1>
            <p className="text-xs text-light-text-tertiary dark:text-dark-text-tertiary">
              Clipboard Manager
            </p>
          </div>
        </div>

        <div className="flex items-center space-x-2">
          <ActionTooltip label="Clear History">
            <button
              type="button"
              onClick={onClearHistory}
              className="px-3 py-1.5 text-sm bg-light-bg-tertiary dark:bg-dark-bg-tertiary hover:bg-gray-200 dark:hover:bg-gray-600 rounded-md transition-colors"
            >
              Clear
            </button>
          </ActionTooltip>

          <ActionTooltip label="Settings">
            <button
              type="button"
              onClick={onOpenSettings}
              className="px-3 py-1.5 text-sm bg-light-bg-tertiary dark:bg-dark-bg-tertiary hover:bg-gray-200 dark:hover:bg-gray-600 rounded-md transition-colors"
              aria-label="Settings"
            >
              ⚙️
            </button>
          </ActionTooltip>
        </div>
      </div>
    </header>
  );
};
