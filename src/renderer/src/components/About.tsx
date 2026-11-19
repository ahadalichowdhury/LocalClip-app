import { HardDrive, Layers, Pin } from 'lucide-react';
import { useEffect, useState } from 'react';
import { hotkeyParts, isMac } from '../lib/kinds';

interface AboutProps {
  isOpen: boolean;
  onClose: () => void;
}

/** Welcome / about window shown at launch and from the menu bar. */
export function About({ isOpen, onClose }: AboutProps) {
  const [appVersion, setAppVersion] = useState('1.0.0');
  const [hotkey, setHotkey] = useState('CommandOrControl+Shift+V');

  useEffect(() => {
    Promise.resolve(window.electronAPI?.utils?.getVersion?.())
      .then(v => v && setAppVersion(v))
      .catch(() => {});
    Promise.resolve(window.electronAPI?.hotkey?.getCurrent?.())
      .then(h => h && setHotkey(h))
      .catch(() => {});
  }, [isOpen]);

  if (!isOpen) return null;

  const mod = isMac ? '⌘' : 'Ctrl';

  return (
    <div className="lc-shell lc-about">
      <div className="lc-about-head">
        <h1>
          <span className="lc-mark">LocalClip</span>
        </h1>
        <p>Version {appVersion}</p>
      </div>

      <div className="lc-about-key">
        <p>Open your clipboard history from any app</p>
        <div className="lc-about-keys" aria-label={hotkey}>
          {hotkeyParts(hotkey).map((k, i) => (
            <kbd key={i}>{k}</kbd>
          ))}
        </div>
      </div>

      <ul className="lc-about-list">
        <li>
          <Layers size={16} aria-hidden />
          <span>Opens on top of fullscreen apps, right where you are.</span>
        </li>
        <li>
          <Pin size={16} aria-hidden />
          <span>
            Paste the first nine clips with <kbd>{mod}</kbd>
            <kbd>1</kbd>–<kbd style={{ marginLeft: 4 }}>9</kbd>, pin the ones
            you reuse.
          </span>
        </li>
        <li>
          <HardDrive size={16} aria-hidden />
          <span>History stays on this Mac. Nothing is uploaded.</span>
        </li>
      </ul>

      <div className="lc-about-foot">
        <small>LocalClip keeps running in the menu bar.</small>
        <button type="button" className="lc-btn is-primary" onClick={onClose}>
          Start using LocalClip
        </button>
      </div>
      <small className="lc-about-credit">
        © 2024 S. M. Ahad Ali Chowdhury
      </small>
    </div>
  );
}
