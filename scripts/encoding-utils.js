const CP1252_TO_CHAR = {
  0x80: '\u20AC', 0x82: '\u201A', 0x83: '\u0192', 0x84: '\u201E', 0x85: '\u2026',
  0x86: '\u2020', 0x87: '\u2021', 0x88: '\u02C6', 0x89: '\u2030', 0x8A: '\u0160',
  0x8B: '\u2039', 0x8C: '\u0152', 0x8E: '\u017D', 0x91: '\u2018', 0x92: '\u2019',
  0x93: '\u201C', 0x94: '\u201D', 0x95: '\u2022', 0x96: '\u2013', 0x97: '\u2014',
  0x98: '\u02DC', 0x99: '\u2122', 0x9A: '\u0161', 0x9B: '\u203A', 0x9C: '\u0153',
  0x9E: '\u017E', 0x9F: '\u0178',
};
const CHAR_TO_CP1252 = {};
for (const [b, ch] of Object.entries(CP1252_TO_CHAR)) CHAR_TO_CP1252[ch] = parseInt(b, 10);
const MOJI = new Set(Object.values(CP1252_TO_CHAR));
for (let i = 0x80; i <= 0xFF; i++) MOJI.add(String.fromCharCode(i));

function encodeCp1252(text) {
  const bytes = [];
  for (const ch of text) {
    const cp = ch.codePointAt(0);
    if (cp <= 0x7F) bytes.push(cp);
    else if (cp >= 0x80 && cp <= 0xFF) bytes.push(cp);
    else if (CHAR_TO_CP1252[ch] !== undefined) bytes.push(CHAR_TO_CP1252[ch]);
    else return null;
  }
  return Buffer.from(bytes);
}

function hasDevanagari(text) {
  for (const ch of text) {
    const cp = ch.codePointAt(0);
    if (cp >= 0x0900 && cp <= 0x097F) return true;
  }
  return false;
}

function findRuns(text) {
  const runs = [];
  let i = 0;
  while (i < text.length) {
    const cp = text.codePointAt(i);
    if (MOJI.has(String.fromCodePoint(cp))) {
      let j = i + (cp > 0xFFFF ? 2 : 1);
      while (j < text.length) {
        const c = text.codePointAt(j);
        if (!MOJI.has(String.fromCodePoint(c))) break;
        j += c > 0xFFFF ? 2 : 1;
      }
      if (j - i >= 2) runs.push([i, j]);
      i = j;
    } else {
      i += cp > 0xFFFF ? 2 : 1;
    }
  }
  return runs;
}

function fixMojibake(text) {
  const runs = findRuns(text);
  const out = [];
  let prev = 0;
  let fixed = 0;
  for (const [start, end] of runs) {
    out.push(text.slice(prev, start));
    const run = text.slice(start, end);
    const bytes = encodeCp1252(run);
    const candidate = bytes ? bytes.toString('utf8') : null;
    if (candidate && !candidate.includes('\uFFFD')) {
      out.push(candidate);
      fixed++;
    } else {
      out.push(run);
    }
    prev = end;
  }
  out.push(text.slice(prev));
  return { text: out.join(''), runs: runs.length, fixed };
}

module.exports = { CP1252_TO_CHAR, CHAR_TO_CP1252, MOJI, encodeCp1252, hasDevanagari, findRuns, fixMojibake };
