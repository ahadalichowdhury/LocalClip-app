/**
 * Detects clipboard lines that are *mostly* numeric (phones, cards, OTPs, tracking codes).
 * Intentionally loose: no per-country phone rules — category is "Numbers", not "Phone".
 */
export function isClipboardNumbersCategory(text: string): boolean {
  const t = text.trim();
  if (t.length < 7 || t.length > 36) return false;
  if (/https?:\/\//i.test(t) || t.includes('@')) return false;
  if (!/^[\d+\s().-]+$/.test(t)) return false;
  const digits = t.replace(/\D/g, '');
  if (digits.length < 7 || digits.length > 19) return false;
  return true;
}
