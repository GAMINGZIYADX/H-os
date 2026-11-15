// =============================================================================
// H-os — text file encodings for Notepad (main process, pure logic)
// -----------------------------------------------------------------------------
// Notepad must never silently damage a file. Old Windows files are often "ANSI" (Windows-1252),
// not UTF-8, and some are UTF-16. So we detect the encoding when opening, remember it, and write
// the file back in the same encoding (with its byte-order mark if it had one).
//
//   decodeText(buffer)  -> { text, encoding }
//   encodeText(text, encoding) -> Buffer   (throws an error with code 'ENCODING' if a character
//                                           can't be stored in that encoding)
// Encodings: 'utf8' | 'utf8-bom' | 'utf16le' | 'utf16be' | 'windows-1252'
// =============================================================================

const ENCODINGS = ['utf8', 'utf8-bom', 'utf16le', 'utf16be', 'windows-1252'];

// Windows-1252 differs from Latin-1 in the 0x80-0x9F range; these are those characters.
const CP1252_SPECIAL = new Map([
  [0x20ac, 0x80], [0x201a, 0x82], [0x0192, 0x83], [0x201e, 0x84], [0x2026, 0x85], [0x2020, 0x86], [0x2021, 0x87],
  [0x02c6, 0x88], [0x2030, 0x89], [0x0160, 0x8a], [0x2039, 0x8b], [0x0152, 0x8c], [0x017d, 0x8e], [0x2018, 0x91],
  [0x2019, 0x92], [0x201c, 0x93], [0x201d, 0x94], [0x2022, 0x95], [0x2013, 0x96], [0x2014, 0x97], [0x02dc, 0x98],
  [0x2122, 0x99], [0x0161, 0x9a], [0x203a, 0x9b], [0x0153, 0x9c], [0x017e, 0x9e], [0x0178, 0x9f],
]);
const CP1252_UNDEFINED = new Set([0x81, 0x8d, 0x8f, 0x90, 0x9d]); // bytes with no character; kept as-is so files survive

function decodeText(buf) {
  // byte-order marks first
  if (buf.length >= 3 && buf[0] === 0xef && buf[1] === 0xbb && buf[2] === 0xbf) {
    return { text: new TextDecoder('utf-8').decode(buf.subarray(3)), encoding: 'utf8-bom' };
  }
  if (buf.length >= 2 && buf[0] === 0xff && buf[1] === 0xfe) {
    return { text: new TextDecoder('utf-16le').decode(buf.subarray(2)), encoding: 'utf16le' };
  }
  if (buf.length >= 2 && buf[0] === 0xfe && buf[1] === 0xff) {
    return { text: new TextDecoder('utf-16be').decode(buf.subarray(2)), encoding: 'utf16be' };
  }
  try {
    return { text: new TextDecoder('utf-8', { fatal: true }).decode(buf), encoding: 'utf8' };
  } catch {
    // not valid UTF-8: treat it as an old Windows "ANSI" file
    return { text: new TextDecoder('windows-1252').decode(buf), encoding: 'windows-1252' };
  }
}

// Does it start with a UTF-16 byte-order mark? (UTF-16 text is full of zero bytes, so the
// "looks like a binary file" check must skip it.)
const hasUtf16Bom = (buf) => buf.length >= 2 && ((buf[0] === 0xff && buf[1] === 0xfe) || (buf[0] === 0xfe && buf[1] === 0xff));

function encodeText(text, encoding = 'utf8') {
  if (!ENCODINGS.includes(encoding)) throw Object.assign(new Error('Unknown text encoding.'), { code: 'INVALID' });
  if (encoding === 'utf8') return Buffer.from(text, 'utf8');
  if (encoding === 'utf8-bom') return Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), Buffer.from(text, 'utf8')]);
  if (encoding === 'utf16le') return Buffer.concat([Buffer.from([0xff, 0xfe]), Buffer.from(text, 'utf16le')]);
  if (encoding === 'utf16be') {
    const le = Buffer.from(text, 'utf16le');
    le.swap16();
    return Buffer.concat([Buffer.from([0xfe, 0xff]), le]);
  }
  // windows-1252
  const bytes = [];
  for (const ch of text) {
    const code = ch.codePointAt(0);
    if (code < 0x80 || (code >= 0xa0 && code <= 0xff)) bytes.push(code);
    else if (CP1252_SPECIAL.has(code)) bytes.push(CP1252_SPECIAL.get(code));
    else if (CP1252_UNDEFINED.has(code)) bytes.push(code);
    else {
      throw Object.assign(
        new Error(`The character "${ch}" can't be saved in this file's old (ANSI) format. Choose UTF-8 in Format > Encoding.`),
        { code: 'ENCODING' },
      );
    }
  }
  return Buffer.from(bytes);
}

module.exports = { decodeText, encodeText, hasUtf16Bom, ENCODINGS };
