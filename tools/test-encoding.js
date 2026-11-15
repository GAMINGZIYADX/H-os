// Tests for the Notepad text encodings.   Run:  node tools/test-encoding.js
const { decodeText, encodeText, hasUtf16Bom } = require('../mainTextEncoding');

let failed = 0;
const expect = (name, ok, extra = '') => { if (!ok) failed++; console.log(`${ok ? 'PASS' : 'FAIL'}  ${name} ${extra}`); };

// plain UTF-8
let d = decodeText(Buffer.from('héllo wörld ✓ 🌷', 'utf8'));
expect('utf-8 is detected', d.encoding === 'utf8' && d.text === 'héllo wörld ✓ 🌷');
expect('utf-8 round trip is byte-identical', encodeText(d.text, d.encoding).equals(Buffer.from('héllo wörld ✓ 🌷', 'utf8')));

// UTF-8 with a BOM keeps its BOM
const withBom = Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), Buffer.from('café', 'utf8')]);
d = decodeText(withBom);
expect('utf-8 BOM is detected and stripped from the text', d.encoding === 'utf8-bom' && d.text === 'café');
expect('utf-8 BOM round trip is byte-identical', encodeText(d.text, d.encoding).equals(withBom));

// an old ANSI file: "café" with é as the single byte 0xE9 (NOT valid UTF-8)
const ansi = Buffer.from([0x63, 0x61, 0x66, 0xe9, 0x20, 0x80, 0x93, 0x94]); // café €“”
d = decodeText(ansi);
expect('ANSI (windows-1252) is detected instead of corrupting the é', d.encoding === 'windows-1252' && d.text === 'café €“”', JSON.stringify(d.text));
expect('ANSI round trip is byte-identical', encodeText(d.text, d.encoding).equals(ansi));
let refused = false;
try { encodeText('tulip 🌷', 'windows-1252'); } catch (e) { refused = e.code === 'ENCODING'; }
expect("a character ANSI can't store is refused (not silently replaced)", refused);
expect('undefined ANSI bytes (0x81 …) survive a round trip', (() => { const b = Buffer.from([0x41, 0x81, 0x8d, 0x42]); return encodeText(decodeText(b).text, 'windows-1252').equals(b); })());

// UTF-16
const le = Buffer.concat([Buffer.from([0xff, 0xfe]), Buffer.from('Grüße 🌷', 'utf16le')]);
d = decodeText(le);
expect('UTF-16 LE is detected', d.encoding === 'utf16le' && d.text === 'Grüße 🌷' && hasUtf16Bom(le));
expect('UTF-16 LE round trip is byte-identical', encodeText(d.text, d.encoding).equals(le));
const be = Buffer.from(le); be.swap16(); // swap bytes of the whole buffer: turns "FF FE" into "FE FF" and the text into big-endian
d = decodeText(be);
expect('UTF-16 BE is detected', d.encoding === 'utf16be' && d.text === 'Grüße 🌷' && hasUtf16Bom(be));
expect('UTF-16 BE round trip is byte-identical', encodeText(d.text, d.encoding).equals(be));

// misc
expect('empty file is utf-8', decodeText(Buffer.alloc(0)).encoding === 'utf8');
expect('binary-ish file without BOM has no UTF-16 BOM', !hasUtf16Bom(Buffer.from([1, 2, 0, 3])));
let unknown = false;
try { encodeText('x', 'rot13'); } catch (e) { unknown = e.code === 'INVALID'; }
expect('unknown encoding names are refused', unknown);

console.log(failed ? `\n${failed} FAILED` : '\nall encoding tests passed');
process.exit(failed ? 1 : 0);
