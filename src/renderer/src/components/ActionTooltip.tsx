import React, { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

const SHOW_DELAY_MS = 400;

type ActionTooltipProps = {
  label: string;
  children: React.ReactNode;
  /** e.g. `block w-full min-w-0` when the trigger should span a row */
  wrapperClassName?: string;
};

/**
 * Fixed-position tooltip portaled to document.body so it is not clipped by
 * overflow scroll areas and sits above the app content in Electron.
 */
export const ActionTooltip: React.FC<ActionTooltipProps> = ({
  label,
  children,
  wrapperClassName = 'inline-flex',
}) => {
  const [visible, setVisible] = useState(false);
  const [coords, setCoords] = useState<{
    left: number;
    top: number;
    transform: string;
  }>({ left: 0, top: 0, transform: 'translate(-50%, -100%)' });
  const wrapRef = useRef<HTMLSpanElement>(null);
  const showTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearTimer = useCallback(() => {
    if (showTimerRef.current !== null) {
      clearTimeout(showTimerRef.current);
      showTimerRef.current = null;
    }
  }, []);

  const updatePosition = useCallback(() => {
    const el = wrapRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const margin = 8;
    const preferAbove = r.top > 44;
    if (preferAbove) {
      setCoords({
        left: r.left + r.width / 2,
        top: r.top - margin,
        transform: 'translate(-50%, -100%)',
      });
    } else {
      setCoords({
        left: r.left + r.width / 2,
        top: r.bottom + margin,
        transform: 'translate(-50%, 0)',
      });
    }
  }, []);

  const onEnter = useCallback(() => {
    clearTimer();
    showTimerRef.current = setTimeout(() => {
      updatePosition();
      setVisible(true);
    }, SHOW_DELAY_MS);
  }, [clearTimer, updatePosition]);

  const onLeave = useCallback(() => {
    clearTimer();
    setVisible(false);
  }, [clearTimer]);

  useEffect(() => {
    if (!visible) return;
    const onScrollOrResize = () => updatePosition();
    window.addEventListener('scroll', onScrollOrResize, true);
    window.addEventListener('resize', onScrollOrResize);
    return () => {
      window.removeEventListener('scroll', onScrollOrResize, true);
      window.removeEventListener('resize', onScrollOrResize);
    };
  }, [visible, updatePosition]);

  useEffect(() => () => clearTimer(), [clearTimer]);

  return (
    <span
      ref={wrapRef}
      className={wrapperClassName}
      onPointerEnter={onEnter}
      onPointerLeave={onLeave}
    >
      {children}
      {visible &&
        createPortal(
          <div
            role="tooltip"
            className="fixed z-[99999] max-w-xs whitespace-nowrap rounded-md bg-gray-900 px-2 py-1 text-xs text-white shadow-lg pointer-events-none dark:bg-gray-800 dark:ring-1 dark:ring-gray-600"
            style={{
              left: coords.left,
              top: coords.top,
              transform: coords.transform,
            }}
          >
            {label}
          </div>,
          document.body
        )}
    </span>
  );
};
