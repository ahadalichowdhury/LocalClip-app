import { KAOMOJI_GROUPS, SYMBOL_GROUPS, searchPick } from '../../src/renderer/src/lib/symbols';

describe('symbols and kaomoji data', () => {
  it('every symbol is a single item with a name', () => {
    for (const g of SYMBOL_GROUPS) {
      for (const it of g.items) {
        expect(it.text.length).toBeGreaterThan(0);
        expect(it.text).not.toMatch(/\s/);
        expect(it.name.length).toBeGreaterThan(0);
      }
    }
  });

  it('finds symbols by name and kaomoji by mood', () => {
    expect(searchPick(SYMBOL_GROUPS, 'euro').map(i => i.text)).toEqual(['€']);
    expect(searchPick(SYMBOL_GROUPS, 'taka').map(i => i.text)).toEqual(['৳']);
    expect(searchPick(SYMBOL_GROUPS, 'command').map(i => i.text)).toContain('⌘');
    expect(searchPick(SYMBOL_GROUPS, 'right arrow').map(i => i.text)).toContain('→');
    expect(searchPick(KAOMOJI_GROUPS, 'shrug').map(i => i.text)).toContain('¯\\_(ツ)_/¯');
    expect(searchPick(SYMBOL_GROUPS, 'zzzz')).toEqual([]);
  });
});
