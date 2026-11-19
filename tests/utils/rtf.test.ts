import { rtfToText } from '../../src/renderer/src/lib/rtf';

describe('rtfToText', () => {
  it('reads RTF copied from Notes (font-table junk is skipped)', () => {
    const notes =
      '{\\rtf1\\ansi\\ansicpg1252\\cocoartf2761\n\\cocoatextscaling0\\cocoaplatform0{\\fonttbl\\f0\\fnil\\fcharset0 AppleSystemUIFont;}\n{\\colortbl;\\red255\\green255\\blue255;}\n{\\*\\expandedcolortbl;;}\n\\deftab560\n\\pard\\pardeftab560\\slleading20\\partightenfactor0\n\n\\f0\\fs26 \\AppleTypeServices\\AppleTypeServicesF2293774 \\cf0 sdfsdfsfsdfsdfsd}';
    expect(rtfToText(notes)).toBe('sdfsdfsfsdfsdfsd');
  });

  it('decodes unicode, cp1252 and Cocoa line breaks', () => {
    const textedit =
      "{\\rtf1\\ansi{\\fonttbl\\f0 Helvetica;}\\f0 Hello world\\\n\\uc0\\u2438 \\u2478 \\u2494 \\u2480  \\'97 \\'93q\\'94 caf\\'e9\\\nend}";
    expect(rtfToText(textedit)).toBe('Hello world\nআমার — “q” café\nend');
  });
});
