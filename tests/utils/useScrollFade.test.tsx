import { fireEvent, render } from '@testing-library/react';
import { useRef } from 'react';
import { useScrollFade } from '../../src/renderer/src/hooks/useScrollFade';

function Row({ scrollWidth }: { scrollWidth: number }) {
  const ref = useRef<HTMLDivElement>(null);
  useScrollFade(ref, [scrollWidth]);
  return (
    <div
      data-testid="row"
      ref={el => {
        if (el) {
          Object.defineProperty(el, 'scrollWidth', { value: scrollWidth, configurable: true });
          Object.defineProperty(el, 'clientWidth', { value: 300, configurable: true });
        }
        (ref as { current: HTMLDivElement | null }).current = el;
      }}
    />
  );
}

describe('useScrollFade', () => {
  it('fades only the sides that hide chips', () => {
    const { getByTestId, rerender } = render(<Row scrollWidth={300} />);
    const row = getByTestId('row');
    expect(row.className).toBe(''); // everything fits

    rerender(<Row scrollWidth={600} />);
    expect(row.classList.contains('fade-right')).toBe(true);
    expect(row.classList.contains('fade-left')).toBe(false);

    row.scrollLeft = 150;
    fireEvent.scroll(row);
    expect(row.classList.contains('fade-left')).toBe(true);
    expect(row.classList.contains('fade-right')).toBe(true);

    row.scrollLeft = 300;
    fireEvent.scroll(row);
    expect(row.classList.contains('fade-right')).toBe(false);
  });
});
