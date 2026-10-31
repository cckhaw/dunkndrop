// Name validation + profanity filter.
// The block between the PROFANITY markers is also embedded verbatim in index.html (the client uses it for
// instant feedback); the server runs the same code and is authoritative. test/ checks the two copies agree.

/* PROFANITY:START */
const NAME_MIN = 2, NAME_MAX = 14;
const LEET = { '0': 'o', '1': 'i', '3': 'e', '4': 'a', '5': 's', '7': 't', '8': 'b', '@': 'a', '$': 's', '!': 'i', '|': 'i', '+': 't' };
// Roots blocked anywhere in the name (letters only, so "f.u-c k" and "sh1t" are caught). Letter runs tolerate stretching.
const BLOCK_ANYWHERE = ['fuck', 'fuk', 'shit', 'cunt', 'bitch', 'nigg', 'whore', 'slut', 'bastard', 'pussy', 'wank', 'twat', 'asshole', 'jackass',
  'dumbass', 'faggot', 'fagg', 'motherf', 'penis', 'vagina', 'dildo', 'blowjob', 'handjob', 'cumshot', 'orgasm', 'porn', 'hitler', 'retard',
  'pedophil', 'molest', 'incest', 'cocksuck', 'dickhead', 'bullshit', 'bollocks', 'jizz', 'sperm', 'tranny', 'wetback', 'piss', 'fck'];
// Short or ambiguous words, blocked only as a whole word (so "class", "Dickson" and "Essex" stay allowed).
const BLOCK_WHOLE_WORD = ['ass', 'arse', 'cock', 'dick', 'dik', 'cum', 'tit', 'tits', 'titty', 'titties', 'boob', 'boobs', 'boobies', 'anal', 'anus',
  'sex', 'sexy', 'nude', 'nudes', 'milf', 'rape', 'rapist', 'fag', 'dyke', 'kike', 'spic', 'chink', 'paki', 'coon', 'gook', 'homo', 'negro', 'beaner',
  'tard', 'pedo', 'paedo', 'hoe', 'skank', 'thot', 'slag', 'prick', 'bugger', 'tosser', 'nazi', 'sht', 'btch', 'cnt', 'stfu', 'kys'];
const runPattern = w => w.replace(/(.)\1*/g, (run, ch) => ch + (run.length > 1 ? '{' + run.length + ',}' : '+'));
const ANYWHERE_RE = BLOCK_ANYWHERE.map(w => new RegExp(runPattern(w)));
const WHOLE_RE = BLOCK_WHOLE_WORD.map(w => new RegExp('^' + runPattern(w) + '$'));
function isProfane(name) {
  const norm = String(name).normalize('NFKD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[0134578@$!|+]/g, ch => LEET[ch]);
  const squashed = norm.replace(/[^a-z]/g, '');
  const words = norm.split(/[^a-z]+/).filter(Boolean);
  return ANYWHERE_RE.some(re => re.test(squashed)) || WHOLE_RE.some(re => re.test(squashed) || words.some(w => re.test(w)));
}
function validateName(raw) {
  if (typeof raw !== 'string') return { ok: false, error: 'name_invalid' };
  const name = raw.replace(/\s+/g, ' ').trim();
  if (name.length < NAME_MIN || name.length > NAME_MAX) return { ok: false, error: 'name_length' };
  if (!/^[A-Za-z0-9 ._-]+$/.test(name) || !/[A-Za-z0-9]/.test(name)) return { ok: false, error: 'name_chars' };
  if (/https?:|www\.|\.(com|net|org|io|gg|xyz|app)\b/i.test(name)) return { ok: false, error: 'name_link' };
  if (isProfane(name)) return { ok: false, error: 'name_profane' };
  return { ok: true, name };
}
/* PROFANITY:END */

export { isProfane, validateName, NAME_MIN, NAME_MAX };
