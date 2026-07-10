/**
 * Apply Unicode default full case folding after NFC normalization.
 *
 * ECMAScript has no case-fold API. Folding each code point through the
 * locale-independent upper/lower mappings supplies the full expansions (for
 * example ss, ffi, and Greek sigma). The branches below are the code points
 * where that transform differs from Unicode's default full fold: dotless i,
 * capital sharp s, and Cherokee, whose fold is intentionally uppercase.
 */
export function unicodeFullCaseFold(value) {
  let folded = '';
  for (const character of value.normalize('NFC')) {
    const codePoint = character.codePointAt(0);

    if (
      codePoint === 0x0131 ||
      (codePoint >= 0x13a0 && codePoint <= 0x13ef) ||
      (codePoint >= 0x13f0 && codePoint <= 0x13f5)
    ) {
      folded += character;
    } else if (codePoint >= 0x13f8 && codePoint <= 0x13fd) {
      folded += String.fromCodePoint(codePoint - 0x0008);
    } else if (codePoint === 0x1e9e) {
      folded += 'ss';
    } else if (codePoint >= 0xab70 && codePoint <= 0xabbf) {
      folded += String.fromCodePoint(codePoint - 0x97d0);
    } else {
      folded += character.toUpperCase().toLowerCase();
    }
  }
  return folded.normalize('NFC');
}
