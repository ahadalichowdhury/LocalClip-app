/**
 * Data for the Symbols and Kaomoji tabs (like Windows 11's Win+V panel).
 * Each item has a name so it can be found by search.
 */

export type PickItem = { text: string; name: string };
export type PickGroup = { id: string; title: string; items: PickItem[] };

/** "→ right arrow|← left arrow" → items */
const parse = (spec: string): PickItem[] =>
  spec
    .split('|')
    .map(s => s.trim())
    .filter(Boolean)
    .map(s => {
      const i = s.indexOf(' ');
      return { text: s.slice(0, i), name: s.slice(i + 1) };
    });

export const SYMBOL_GROUPS: PickGroup[] = [
  {
    id: 'arrows',
    title: 'Arrows',
    items: parse(
      '→ right arrow|← left arrow|↑ up arrow|↓ down arrow|↔ left right arrow|↕ up down arrow|' +
        '⇒ double right arrow|⇐ double left arrow|⇔ double left right arrow|↗ north east arrow|' +
        '↘ south east arrow|↙ south west arrow|↖ north west arrow|↩ return arrow|↪ forward return arrow|' +
        '⟶ long right arrow|⟵ long left arrow|➜ heavy right arrow|▶ right triangle|◀ left triangle|' +
        '▲ up triangle|▼ down triangle|» right guillemet|« left guillemet'
    ),
  },
  {
    id: 'keys',
    title: 'Mac keys',
    items: parse(
      '⌘ command key|⌥ option alt key|⇧ shift key|⌃ control key|⇪ caps lock key|⏎ return enter key|' +
        '⌫ delete backspace key|⌦ forward delete key|⎋ escape esc key|⇥ tab key|⇤ back tab key|' +
        '␣ space key|⏏ eject key|⌽ power key|⇞ page up key|⇟ page down key|↖ home key|↘ end key|🌐 globe fn key'
    ),
  },
  {
    id: 'math',
    title: 'Math',
    items: parse(
      '± plus minus|× multiply times|÷ divide|≠ not equal|≈ approximately equal|≤ less or equal|' +
        '≥ greater or equal|∞ infinity|√ square root|∛ cube root|∑ sum sigma|∏ product|∫ integral|' +
        '∂ partial|∆ delta increment|∇ nabla|π pi|° degree|‰ per mille|∈ element of|∉ not element of|' +
        '∩ intersection|∪ union|⊂ subset|⊃ superset|∅ empty set|∀ for all|∃ there exists|¬ not|' +
        '∧ and|∨ or|⊕ xor|∴ therefore|∵ because|≡ identical|∝ proportional|′ prime|″ double prime'
    ),
  },
  {
    id: 'fractions',
    title: 'Fractions and powers',
    items: parse(
      '½ one half|⅓ one third|⅔ two thirds|¼ one quarter|¾ three quarters|⅕ one fifth|⅛ one eighth|' +
        '⁰ superscript zero|¹ superscript one|² superscript two squared|³ superscript three cubed|' +
        '⁴ superscript four|⁵ superscript five|ⁿ superscript n|₀ subscript zero|₁ subscript one|' +
        '₂ subscript two|₃ subscript three|₄ subscript four'
    ),
  },
  {
    id: 'currency',
    title: 'Currency',
    items: parse(
      '৳ taka bangladesh|₹ rupee india|€ euro|£ pound|¥ yen yuan|$ dollar|¢ cent|₩ won korea|' +
        '₽ ruble|₺ lira turkey|₫ dong vietnam|₱ peso philippines|₦ naira|₴ hryvnia|₪ shekel|' +
        '﷼ rial riyal|฿ baht|₿ bitcoin'
    ),
  },
  {
    id: 'marks',
    title: 'Checks and stars',
    items: parse(
      '✓ check mark|✔ heavy check mark|✗ cross ballot x|✘ heavy cross|☐ empty checkbox|☑ checked checkbox|' +
        '☒ crossed checkbox|★ black star|☆ white star|✦ sparkle four point star|✱ asterisk|• bullet|' +
        '◦ white bullet|▪ small square|● black circle|○ white circle|◆ black diamond|◇ white diamond|' +
        '■ black square|□ white square|♥ heart|♦ diamond suit|♣ club|♠ spade|☀ sun|☁ cloud|☂ umbrella|' +
        '☎ telephone|✉ envelope|✂ scissors|✎ pencil|⚠ warning|♪ music note|♫ music notes'
    ),
  },
  {
    id: 'text',
    title: 'Punctuation',
    items: parse(
      '— em dash|– en dash|… ellipsis|“ left double quote|” right double quote|‘ left single quote|' +
        '’ right single quote apostrophe|„ low double quote|‹ single left guillemet|› single right guillemet|' +
        '· middle dot|¶ pilcrow paragraph|§ section|† dagger|‡ double dagger|© copyright|® registered|' +
        '™ trademark|℃ celsius|℉ fahrenheit|№ numero number|¿ inverted question|¡ inverted exclamation|' +
        '※ reference mark|‽ interrobang'
    ),
  },
  {
    id: 'greek',
    title: 'Greek',
    items: parse(
      'α alpha|β beta|γ gamma|δ delta|ε epsilon|θ theta|λ lambda|μ mu micro|σ sigma|τ tau|φ phi|' +
        'ω omega|Δ capital delta|Σ capital sigma|Ω capital omega ohm|Φ capital phi|Ψ capital psi'
    ),
  },
];

const kao = (title: string, id: string, list: string[]): PickGroup => ({
  id,
  title,
  items: list.map(text => ({ text, name: title.toLowerCase() })),
});

export const KAOMOJI_GROUPS: PickGroup[] = [
  kao('Happy', 'happy', [
    '(◕‿◕)', '(＾▽＾)', '(✿◠‿◠)', '(≧◡≦)', '٩(◕‿◕)۶', '(ᵔᴥᵔ)', '(^_^)', '(*^▽^*)',
    '☆*:.｡.o(≧▽≦)o.｡.:*☆', '(o˘◡˘o)', '(¬‿¬)', '(⌒‿⌒)',
  ]),
  kao('Greeting', 'greeting', ['(＾▽＾)/', 'ヾ(＾∇＾)', '(•◡•)/', '( ﾟ▽ﾟ)/', '(｡･∀･)ﾉ', '(*・ω・)ﾉ', '(^o^)/', '～ヾ(＾∇＾)']),
  kao('Love', 'love', ['(♡˙︶˙♡)', '(｡♥‿♥｡)', '(づ￣ ³￣)づ', '(っ˘з(˘⌣˘ )', '♡(ӦｖӦ｡)', '(*˘︶˘*).｡.:*♡', '( ˘ ³˘)♥', '(´∀｀)♡']),
  kao('Hug', 'hug', ['(づ｡◕‿‿◕｡)づ', '(っ´▽`)っ', '⊂(´・ω・｀⊂)', '(つ≧▽≦)つ', '(⊃｡•́‿•̀｡)⊃']),
  kao('Sad', 'sad', ['(╥﹏╥)', '(ಥ﹏ಥ)', '(｡•́︿•̀｡)', '(╯︵╰,)', '(T_T)', '(;´༎ຶД༎ຶ`)', '(っ˘̩╭╮˘̩)っ', '( ´•︵•` )']),
  kao('Angry', 'angry', ['(╬ Ò﹏Ó)', '(ಠ益ಠ)', '(¬_¬")', '(＃｀Д´)', '(ノಠ益ಠ)ノ', '٩(╬ʘ益ʘ╬)۶']),
  kao('Surprised', 'surprised', ['(⊙_⊙)', '(°o°)', 'Σ(°△°|||)', '(◎_◎;)', '(O_O)', '(ﾟДﾟ;)']),
  kao('Shrug and meh', 'shrug', ['¯\\_(ツ)_/¯', '┐(￣ヘ￣)┌', '(￣ー￣)', '(-_-)', '(눈_눈)', '(ಠ_ಠ)', '(•_•)', '( ͡° ͜ʖ ͡°)']),
  kao('Table flip', 'tableflip', ['(╯°□°）╯︵ ┻━┻', '┬─┬ノ( º _ ºノ)', '(ノಠ益ಠ)ノ彡┻━┻', '┻━┻ ︵ヽ(`Д´)ﾉ︵ ┻━┻']),
  kao('Animals', 'animals', ['ʕ•ᴥ•ʔ', '(=^･ω･^=)', '(＾• ω •＾)', 'U・ᴥ・U', '(•ㅅ•)', '>°))))彡', '(・⊝・)', 'ᘛ⁐̤ᕐᐷ']),
  kao('Sleepy', 'sleepy', ['(－_－) zzZ', '(∪｡∪)｡｡｡zzz', '(=_=)', '(ᴗ˳ᴗ)']),
  kao('Victory', 'victory', ['(•̀ᴗ•́)و', 'ᕦ(ò_óˇ)ᕤ', '٩(ˊᗜˋ*)و', '(ง •̀_•́)ง', '＼(^o^)／', 'o(≧∇≦o)']),
];

/** Every word of the query must start a word of the item's name or group. */
export function searchPick(groups: PickGroup[], query: string): PickItem[] {
  const words = query.toLowerCase().split(/\s+/).filter(Boolean);
  if (!words.length) return [];
  const out: PickItem[] = [];
  for (const g of groups) {
    const hay = (it: PickItem) => `${it.name} ${g.title}`.toLowerCase().split(/[\s,]+/);
    for (const it of g.items) {
      const h = hay(it);
      if (words.every(w => h.some(x => x.startsWith(w)) || it.text === w)) out.push(it);
    }
  }
  return out;
}
