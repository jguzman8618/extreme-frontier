// Lightweight content filter for player-chosen text (usernames, farm names,
// and any future chat). Deliberately narrow: it blocks severe slurs only.
// Ordinary profanity (mild swearing, etc.) is intentionally allowed through —
// this is not a general profanity filter, just a hard line against the
// worst stuff.
//
// Normalization handles the obvious evasion tricks: spacing/punctuation
// removal and common leetspeak substitutions (4->a, 3->e, 1->i, 0->o, $->s).

const FORBIDDEN_ROOTS: string[] = [
  'nigger',
  'nigga',
  'chink',
  'spic',
  'kike',
  'gook',
  'wetback',
  'faggot',
  'tranny',
  'retard',
];

function collapseRepeats(s: string): string {
  return s.replace(/(.)\1+/g, '$1');
}

// Pre-collapse the roots the same way input gets normalized, so a slur
// with a legitimate double letter still matches after normalization
// collapses stretched-out evasion spellings (e.g. "niiiigger").
const NORMALIZED_ROOTS = FORBIDDEN_ROOTS.map(collapseRepeats);

function normalize(input: string): string {
  const stripped = input
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '')
    .replace(/4/g, 'a')
    .replace(/3/g, 'e')
    .replace(/1/g, 'i')
    .replace(/0/g, 'o')
    .replace(/\$/g, 's');
  return collapseRepeats(stripped);
}

export function containsForbiddenWord(text: string): boolean {
  const normalized = normalize(text);
  return NORMALIZED_ROOTS.some((root) => normalized.includes(root));
}
