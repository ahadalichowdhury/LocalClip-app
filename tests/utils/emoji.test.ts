import {
  EmojiGroup,
  loadRecent,
  pushRecent,
  searchEmoji,
  withSkinTone,
} from '../../src/renderer/src/lib/emoji';

const groups: EmojiGroup[] = [
  {
    slug: 'animals',
    name: 'Animals',
    emojis: [
      { e: '🐈', name: 'cat', skin: false },
      { e: '😺', name: 'grinning cat', skin: false },
      { e: '🈸', name: 'Japanese “application” button', skin: false },
    ],
  },
  {
    slug: 'people',
    name: 'People',
    emojis: [
      { e: '👍', name: 'thumbs up', skin: true },
      { e: '👩‍💻', name: 'woman technologist', skin: true },
      { e: '☝️', name: 'index pointing up', skin: true },
    ],
  },
];

describe('emoji helpers', () => {
  it('search matches word starts, best matches first', () => {
    expect(searchEmoji(groups, 'cat').map(e => e.e)).toEqual(['🐈', '😺']);
    expect(searchEmoji(groups, 'thumb up').map(e => e.e)).toEqual(['👍']);
    expect(searchEmoji(groups, '  ')).toEqual([]);
  });

  it('applies skin tones, including ZWJ sequences and VS16', () => {
    expect(withSkinTone(groups[1].emojis[0], 'dark')).toBe('👍🏿');
    expect(withSkinTone(groups[1].emojis[1], 'light')).toBe('👩🏻‍💻');
    expect(withSkinTone(groups[1].emojis[2], 'medium')).toBe('☝🏽');
    expect(withSkinTone(groups[0].emojis[0], 'dark')).toBe('🐈');
    expect(withSkinTone(groups[1].emojis[0], 'default')).toBe('👍');
  });

  it('keeps recents unique, newest first', () => {
    localStorage.clear();
    pushRecent('😀');
    pushRecent('🐈');
    pushRecent('😀');
    expect(loadRecent()).toEqual(['😀', '🐈']);
  });
});
