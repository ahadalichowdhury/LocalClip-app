/**
 * Plain text from RTF — same rules as `rtf_to_text` in
 * src-tauri/src/classify.rs: skip destination groups ({\*…}, font/colour
 * tables…), decode \uN and \'hh escapes, keep line breaks.
 */
const SKIP_DESTS = new Set([
  'fonttbl', 'colortbl', 'expandedcolortbl', 'stylesheet', 'info', 'pict',
  'header', 'footer', 'headerl', 'headerr', 'footerl', 'footerr', 'listtable',
  'listoverridetable', 'generator', 'themedata', 'datastore', 'xmlnstbl',
  'rsidtbl', 'object', 'fldinst',
]);
const WORD_TEXT: Record<string, string> = {
  par: '\n', line: '\n', sect: '\n', row: '\n', tab: '\t', cell: '\t',
  emdash: '—', endash: '–', bullet: '•', lquote: '‘', rquote: '’',
  ldblquote: '“', rdblquote: '”',
};
// Windows-1252 0x80–0x9F; everything else in 0xA0–0xFF is Latin-1.
const CP1252 = '€\x81‚ƒ„…†‡ˆ‰Š‹Œ\x8dŽ\x8f\x90‘’“”•–—˜™š›œ\x9džŸ';
const cp1252 = (b: number) =>
  b >= 0x80 && b <= 0x9f ? CP1252[b - 0x80] : String.fromCharCode(b);

export function rtfToText(rtf: string): string {
  let out = '';
  const stack: [boolean, number][] = [];
  let skip = false;
  let uc = 1;
  let dropNext = 0;
  let i = 0;
  const isAlpha = (c: string) => /[A-Za-z]/.test(c);

  while (i < rtf.length) {
    const c = rtf[i];
    if (c === '{') {
      stack.push([skip, uc]);
      i++;
      if (rtf.startsWith('\\*', i)) skip = true;
    } else if (c === '}') {
      [skip, uc] = stack.pop() ?? [false, 1];
      i++;
    } else if (c === '\\') {
      i++;
      const n = rtf[i];
      if (n === undefined) break;
      if (isAlpha(n)) {
        const m = /^([A-Za-z]+)(-?\d+)? ?/.exec(rtf.slice(i))!;
        i += m[0].length;
        const word = m[1];
        const param = m[2] !== undefined ? Number(m[2]) : undefined;
        if (SKIP_DESTS.has(word)) {
          skip = true;
          continue;
        }
        if (skip) continue;
        if (word === 'uc') uc = param ?? 1;
        else if (word === 'u' && param !== undefined) {
          out += String.fromCharCode(param < 0 ? param + 65536 : param);
          dropNext = uc;
        } else if (WORD_TEXT[word]) out += WORD_TEXT[word];
      } else if (n === "'") {
        const v = parseInt(rtf.slice(i + 1, i + 3), 16);
        i += 3;
        if (dropNext > 0) dropNext--;
        else if (!skip && !Number.isNaN(v)) out += cp1252(v);
      } else {
        i++;
        if (skip) continue;
        if (n === '\\' || n === '{' || n === '}') out += n;
        else if (n === '\n' || n === '\r') out += '\n';
        else if (n === '~') out += ' ';
        else if (n === '_') out += '-';
      }
    } else if (c === '\n' || c === '\r') {
      i++;
    } else {
      i++;
      if (dropNext > 0) dropNext--;
      else if (!skip) out += c;
    }
  }
  return out
    .split('\n')
    .map(l => l.trimEnd())
    .join('\n')
    .trim();
}
