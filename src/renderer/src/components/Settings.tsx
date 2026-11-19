import { useEffect, useState } from 'react';
import { Check } from 'lucide-react';
import { applyGlass, GLASS_MAX, GLASS_MIN } from '../lib/glass';
import { applyHighlight, HIGHLIGHTS, HighlightName } from '../lib/highlight';
import { hotkeyParts } from '../lib/kinds';
import { Sheet } from './Sheet';
import '../../../shared/electronAPI';
import { Settings as SettingsType } from '../../../shared/types';
import { useFontSize } from '../hooks/useFontSize';
import { useTheme } from '../hooks/useTheme';

interface SettingsProps {
  isOpen: boolean;
  onClose: () => void;
}

const Switch = ({
  id,
  checked,
  onChange,
}: {
  id: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) => (
  <button
    id={id}
    type="button"
    role="switch"
    className="lc-switch"
    aria-checked={checked}
    onClick={() => onChange(!checked)}
  />
);

const Seg = <T extends string>({
  value,
  options,
  onChange,
  label,
}: {
  value: T;
  options: [T, string][];
  onChange: (v: T) => void;
  label: string;
}) => (
  <div className="lc-seg" role="group" aria-label={label}>
    {options.map(([v, text]) => (
      <button
        key={v}
        type="button"
        aria-pressed={value === v}
        onClick={() => onChange(v)}
      >
        {text}
      </button>
    ))}
  </div>
);


export function Settings({ isOpen, onClose }: SettingsProps) {
  const [settings, setSettings] = useState<SettingsType | null>(null);
  const [currentHotkey, setCurrentHotkey] = useState('');
  const [isRecording, setIsRecording] = useState(false);
  const [tempHotkey, setTempHotkey] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [platform, setPlatform] = useState<string>('');
  const [hotkeyError, setHotkeyError] = useState<string | null>(null);

  // Use theme and font size hooks
  const { updateTheme, refreshSettings: refreshTheme } = useTheme();
  const { updateFontSize, refreshFontSize } = useFontSize();

  useEffect(() => {
    console.log('Settings component mounted, isOpen:', isOpen);
    if (isOpen) {
      loadSettings();
      // Get platform information
      if (window.electronAPI?.utils?.getPlatform) {
        setPlatform(window.electronAPI.utils.getPlatform());
      }
    }
  }, [isOpen]);

  const loadSettings = async () => {
    try {
      console.log('Loading settings...');
      setLoading(true);
      setError(null);

      // Check if electronAPI is available
      if (!window.electronAPI) {
        throw new Error('Electron API not available');
      }

      // Check if settings API is available
      if (!window.electronAPI.settings) {
        throw new Error('Settings API not available');
      }

      const [allSettings, hotkey] = await Promise.all([
        window.electronAPI.settings.getAll(),
        window.electronAPI.hotkey.getCurrent(),
      ]);

      console.log('Loaded settings:', allSettings);
      console.log('Loaded hotkey:', hotkey);

      if (!allSettings) {
        throw new Error('Failed to load settings');
      }

      setSettings(allSettings);
      setCurrentHotkey(hotkey || '');
    } catch (error) {
      console.error('Failed to load settings:', error);
      setError(
        error instanceof Error ? error.message : 'Failed to load settings'
      );
    } finally {
      setLoading(false);
    }
  };

  const handleHotkeyRecord = () => {
    setHotkeyError(null);
    setIsRecording(true);
    setTempHotkey('');
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (!isRecording) return;

    e.preventDefault();
    e.stopPropagation();

    const keys: string[] = [];
    const isMac = navigator.userAgent.includes('Mac');

    // Add modifiers in consistent order
    if (e.ctrlKey && !isMac) {
      keys.push('Control');
    }
    if (e.metaKey && isMac) {
      keys.push('Command');
    }
    if (e.altKey) {
      keys.push('Alt');
    }
    if (e.shiftKey) {
      keys.push('Shift');
    }

    // Handle main key (ignore modifier keys themselves)
    // Use e.code for physical key detection to avoid Alt+letter special characters
    const mainKey = e.code || e.key;
    const isModifierKey = [
      'Control',
      'Alt',
      'Shift',
      'Meta',
      'Command',
      'Cmd',
    ].includes(e.key);

    if (!isModifierKey) {
      // Handle letter keys using e.code (KeyA, KeyB, etc.)
      if (mainKey.startsWith('Key') && mainKey.length === 4) {
        const letter = mainKey.slice(3); // Extract 'A' from 'KeyA'
        keys.push(letter);
      }
      // Handle digit keys using e.code (Digit1, Digit2, etc.)
      else if (mainKey.startsWith('Digit') && mainKey.length === 6) {
        const digit = mainKey.slice(5); // Extract '1' from 'Digit1'
        keys.push(digit);
      }
      // Handle function keys (F1-F12)
      else if (mainKey.startsWith('F') && /^F\d{1,2}$/.test(mainKey)) {
        keys.push(mainKey);
      }
      // Handle special keys
      else {
        const specialKeyMap: { [key: string]: string } = {
          Space: 'Space',
          ArrowUp: 'Up',
          ArrowDown: 'Down',
          ArrowLeft: 'Left',
          ArrowRight: 'Right',
          Escape: 'Esc',
          Delete: 'Delete',
          Backspace: 'Backspace',
          Tab: 'Tab',
          Enter: 'Return',
          Minus: '-',
          Equal: '=',
          BracketLeft: '[',
          BracketRight: ']',
          Backslash: '\\',
          Semicolon: ';',
          Quote: "'",
          Comma: ',',
          Period: '.',
          Slash: '/',
          Backquote: '`',
        };

        if (specialKeyMap[mainKey]) {
          keys.push(specialKeyMap[mainKey]);
        } else if (e.key.length === 1 && /^[a-zA-Z0-9]$/.test(e.key)) {
          // Fallback for simple ASCII characters
          keys.push(e.key.toUpperCase());
        }
      }
    }

    // Only show hotkey if we have at least one modifier + one main key
    if (keys.length >= 2) {
      const hotkeyString = keys.join('+');
      console.log('Detected keys:', keys, 'Hotkey string:', hotkeyString);
      setTempHotkey(hotkeyString);
    } else if (keys.length === 1 && !isModifierKey) {
      // Show single key for feedback, but it won't be valid
      setTempHotkey(keys[0] + ' (needs modifier)');
    }
  };

  const handleKeyUp = (e: React.KeyboardEvent) => {
    if (!isRecording) return;

    // Stop recording when all keys are released and we have a valid hotkey
    if (
      !e.ctrlKey &&
      !e.altKey &&
      !e.shiftKey &&
      !e.metaKey &&
      tempHotkey &&
      !tempHotkey.includes('(needs modifier)')
    ) {
      setIsRecording(false);
    }
  };

  const applyHotkey = async () => {
    if (!tempHotkey || tempHotkey.includes('(needs modifier)')) return;

    try {
      // Convert to Electron format by processing each part separately
      const parts = tempHotkey.split('+');
      const convertedParts = parts.map(part => {
        if (part === 'Command' || part === 'Control') {
          return 'CommandOrControl';
        }
        return part;
      });

      const electronHotkey = convertedParts.join('+');

      // Validate that we have at least one modifier and a main key
      const modifiers = convertedParts.filter(part =>
        ['CommandOrControl', 'Alt', 'Shift'].includes(part)
      );
      const mainKeys = convertedParts.filter(
        part => !['CommandOrControl', 'Alt', 'Shift'].includes(part)
      );

      if (modifiers.length === 0) {
        console.error(
          'Hotkey must include at least one modifier (Cmd/Ctrl, Alt, or Shift)'
        );
        setHotkeyError(
          'Hotkey must include at least one modifier key (Cmd/Ctrl, Alt, or Shift) for security reasons.'
        );
        return;
      }

      if (mainKeys.length === 0) {
        console.error('Hotkey must include a main key');
        setHotkeyError(
          'Hotkey must include a main key (letter, number, or function key).'
        );
        return;
      }

      console.log('Original hotkey:', tempHotkey);
      console.log('Converted hotkey:', electronHotkey);

      const success = await window.electronAPI.hotkey.register(electronHotkey);
      if (success) {
        await window.electronAPI.settings.set('globalHotkey', electronHotkey);
        setCurrentHotkey(electronHotkey);
        setTempHotkey('');
        console.log('Hotkey updated successfully:', electronHotkey);
      } else {
        console.error('Failed to register hotkey:', electronHotkey);
        setHotkeyError(
          'Failed to register hotkey. It might be already in use by another application.'
        );
      }
    } catch (error) {
      console.error('Failed to update hotkey:', error);
      setHotkeyError('Failed to update hotkey: ' + error);
    }
  };

  const cancelHotkeyRecord = () => {
    setIsRecording(false);
    setTempHotkey('');
  };

  const updateSetting = async (key: keyof SettingsType, value: any) => {
    try {
      await window.electronAPI.settings.set(key, value);
      setSettings(prev => (prev ? { ...prev, [key]: value } : null));

      // Handle special settings that need immediate application
      if (key === 'highlightColor') {
        applyHighlight(value);
      } else if (key === 'glassEffect' || key === 'glassOpacity') {
        const next = { ...settings, [key]: value } as SettingsType;
        applyGlass(next.glassEffect, next.glassOpacity);
      } else if (key === 'theme') {
        await updateTheme(value);
        await refreshTheme();
      } else if (key === 'fontSize') {
        await updateFontSize(value);
        await refreshFontSize();
      }
    } catch (error) {
      console.error('Failed to update setting:', error);
    }
  };

  if (!isOpen) return null;

  const pendingHotkey =
    tempHotkey && !tempHotkey.includes('(needs modifier)') ? tempHotkey : '';

  const hotkeyField = () => {
    if (isRecording) {
      return tempHotkey ? (
        <span>{tempHotkey}</span>
      ) : (
        <span>Press the new shortcut…</span>
      );
    }
    const shown = pendingHotkey
      ? pendingHotkey.replace(/Command|Control/, 'CommandOrControl')
      : currentHotkey;
    if (!shown) return <span>No shortcut set</span>;
    return hotkeyParts(shown).map((k, i) => <kbd key={i}>{k}</kbd>);
  };

  const content = () => {
    if (loading) return <p>Loading settings...</p>;
    if (error || !settings) {
      return (
        <>
          <p>{error ?? 'Settings could not be read.'}</p>
          <button type="button" className="lc-btn" onClick={loadSettings}>
            Try again
          </button>
        </>
      );
    }
    return (
      <>
        <section className="lc-group">
          <h3>Open LocalClip</h3>
          <div className="lc-group-box">
            <div className="lc-setting is-stacked">
              <div className="lc-hotkey">
                <div
                  className={`lc-hotkey-field${isRecording ? ' is-recording' : ''}`}
                  onKeyDown={handleKeyDown}
                  onKeyUp={handleKeyUp}
                  tabIndex={0}
                  aria-label="Keyboard shortcut"
                  data-keep-escape={isRecording || undefined}
                >
                  {hotkeyField()}
                </div>
                {isRecording ? (
                  <button type="button" className="lc-btn" onClick={cancelHotkeyRecord}>
                    Cancel
                  </button>
                ) : pendingHotkey ? (
                  <>
                    <button type="button" className="lc-btn" onClick={cancelHotkeyRecord}>
                      Cancel
                    </button>
                    <button type="button" className="lc-btn is-primary" onClick={applyHotkey}>
                      Save
                    </button>
                  </>
                ) : (
                  <button
                    type="button"
                    className="lc-btn"
                    onClick={() => {
                      handleHotkeyRecord();
                      setTimeout(
                        () =>
                          (
                            document.querySelector('.lc-hotkey-field') as HTMLElement
                          )?.focus(),
                        0
                      );
                    }}
                  >
                    Change
                  </button>
                )}
              </div>
              <small style={{ color: hotkeyError ? 'var(--danger)' : 'var(--muted)' }}>
                {hotkeyError ??
                  (isRecording
                    ? 'Hold a modifier (⌘, ⌥, ⇧) and press a key.'
                    : 'Works from any app, including fullscreen ones.')}
              </small>
            </div>
          </div>
        </section>

        <section className="lc-group">
          <h3>History</h3>
          <div className="lc-group-box">
            <div className="lc-setting">
              <div className="lc-setting-text">
                <label htmlFor="s-monitor">Save what I copy</label>
                <small>Turn off to pause recording without quitting.</small>
              </div>
              <Switch
                id="s-monitor"
                checked={settings.monitorClipboard}
                onChange={v => updateSetting('monitorClipboard', v)}
              />
            </div>
            <div className="lc-setting">
              <div className="lc-setting-text">
                <label htmlFor="s-categories">Sort clips by kind</label>
                <small>Shows the Links, Code, Numbers… filters.</small>
              </div>
              <Switch
                id="s-categories"
                checked={settings.autoCategories}
                onChange={v => updateSetting('autoCategories', v)}
              />
            </div>
            <div className="lc-setting is-stacked">
              <div className="lc-setting-text">
                <label htmlFor="s-max">
                  Keep the last {settings.maxHistoryItems} clips
                </label>
                <small>Older unpinned clips are removed first. Pinned clips always stay.</small>
              </div>
              <input
                id="s-max"
                className="lc-range"
                type="range"
                min="20"
                max="100"
                step="5"
                value={settings.maxHistoryItems}
                onChange={e => updateSetting('maxHistoryItems', parseInt(e.target.value))}
              />
              <div className="lc-range-scale" aria-hidden>
                <span>20</span>
                <span>100</span>
              </div>
            </div>
          </div>
        </section>

        <section className="lc-group">
          <h3>Appearance</h3>
          <div className="lc-group-box">
            <div className="lc-setting">
              <div className="lc-setting-text">
                <label htmlFor="s-glass">Glass effect</label>
                <small>See your desktop through a frosted popup.</small>
              </div>
              <Switch
                id="s-glass"
                checked={!!settings.glassEffect}
                onChange={v => updateSetting('glassEffect', v)}
              />
            </div>
            {settings.glassEffect && (
              <div className="lc-setting is-stacked">
                <div className="lc-setting-text">
                  <label htmlFor="s-glass-opacity">
                    Opacity {settings.glassOpacity ?? 70}%
                  </label>
                  <small>Lower shows more of what&rsquo;s behind the popup.</small>
                </div>
                <input
                  id="s-glass-opacity"
                  className="lc-range"
                  type="range"
                  min={GLASS_MIN}
                  max={GLASS_MAX}
                  step="5"
                  value={settings.glassOpacity ?? 70}
                  onChange={e => updateSetting('glassOpacity', parseInt(e.target.value))}
                />
                <div className="lc-range-scale" aria-hidden>
                  <span>More see-through</span>
                  <span>Solid</span>
                </div>
              </div>
            )}
            <div className="lc-setting is-stacked">
              <div className="lc-setting-text">
                <strong id="s-highlight">Highlight colour</strong>
                <small>Marks the clip that ↵ will paste.</small>
              </div>
              <div className="lc-swatches" role="radiogroup" aria-labelledby="s-highlight">
                {(Object.keys(HIGHLIGHTS) as HighlightName[]).map(name => {
                  const selected = (settings.highlightColor || 'yellow') === name;
                  return (
                    <button
                      key={name}
                      type="button"
                      role="radio"
                      className="lc-swatch"
                      aria-checked={selected}
                      aria-label={HIGHLIGHTS[name].label}
                      title={HIGHLIGHTS[name].label}
                      style={{ '--sw': HIGHLIGHTS[name].hex } as React.CSSProperties}
                      onClick={() => updateSetting('highlightColor', name)}
                    >
                      {selected && <Check size={14} strokeWidth={3} aria-hidden />}
                    </button>
                  );
                })}
              </div>
            </div>
            <div className="lc-setting is-stacked">
              <div className="lc-setting-text">
                <strong>Theme</strong>
              </div>
              <Seg
                label="Theme"
                value={settings.theme}
                options={[
                  ['auto', 'System'],
                  ['light', 'Light'],
                  ['dark', 'Dark'],
                ]}
                onChange={v => updateSetting('theme', v)}
              />
            </div>
            <div className="lc-setting is-stacked">
              <div className="lc-setting-text">
                <strong>Text size</strong>
              </div>
              <Seg
                label="Text size"
                value={settings.fontSize}
                options={[
                  ['small', 'Small'],
                  ['medium', 'Medium'],
                  ['large', 'Large'],
                ]}
                onChange={v => updateSetting('fontSize', v)}
              />
            </div>
          </div>
        </section>

        <section className="lc-group">
          <h3>System</h3>
          <div className="lc-group-box">
            <div className="lc-setting">
              <div className="lc-setting-text">
                <label htmlFor="s-autostart">Open at login</label>
              </div>
              <Switch
                id="s-autostart"
                checked={settings.autoStart}
                onChange={v => updateSetting('autoStart', v)}
              />
            </div>
            <div className="lc-setting">
              <div className="lc-setting-text">
                <label htmlFor="s-dock">Hide from Dock</label>
                <small>
                  {platform === 'darwin'
                    ? 'LocalClip stays in the menu bar.'
                    : 'LocalClip stays in the system tray.'}
                </small>
              </div>
              <Switch
                id="s-dock"
                checked={settings.hideFromDock}
                onChange={v => updateSetting('hideFromDock', v)}
              />
            </div>
          </div>
        </section>
      </>
    );
  };

  return (
    <Sheet title="Settings" labelId="settings-title" onClose={onClose} full>
      {content()}
    </Sheet>
  );
}
