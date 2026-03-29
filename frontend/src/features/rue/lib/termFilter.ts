/**
 * Heuristic term gate: keeps explorable phrases trustworthy for a knowledge UI.
 * Aligns with: non-trivial, beginner-relevant, not stopword fragments (see LIME example).
 */

const BLOCKED_TERMS = new Set([
  'system',
  'process',
  'method',
  'approach',
  'technique',
  'concept',
  'way',
  'thing',
  'idea',
  'aspect',
  'factor',
  'element',
  'feature',
  'type',
  'kind',
  'form',
  'part',
  'role',
  'case',
  'level',
  'point',
  'result',
  'effect',
  'impact',
  'change',
  'use',
  'work',
  'example',
  'output',
  'input',
]);

/** Too vague as a lone explore target; still allowed inside a longer phrase (e.g. “ML predictions”). */
const TRIVIAL_SINGLETON = new Set([
  'prediction',
  'predictions',
  'explanation',
  'explanations',
  'answer',
  'answers',
  'question',
  'questions',
  'problem',
  'problems',
  'solution',
  'solutions',
  'set',
  'sets',
  'value',
  'values',
  'task',
  'tasks',
  'user',
  'users',
  'step',
  'steps',
  'model',
  'data',
  'information',
  'knowledge',
  'understanding',
  'learning',
  'training',
  'testing',
  'analysis',
]);

/** Function words & junk that must never count as an explorable term alone. */
const STOPWORDS = new Set([
  'a',
  'an',
  'the',
  'and',
  'or',
  'but',
  'if',
  'as',
  'is',
  'are',
  'was',
  'were',
  'be',
  'been',
  'being',
  'to',
  'of',
  'in',
  'on',
  'at',
  'by',
  'for',
  'with',
  'from',
  'into',
  'onto',
  'than',
  'then',
  'that',
  'this',
  'these',
  'those',
  'it',
  'its',
  'they',
  'them',
  'their',
  'we',
  'you',
  'your',
  'he',
  'she',
  'his',
  'her',
  'not',
  'no',
  'so',
  'too',
  'very',
  'just',
  'also',
  'only',
  'such',
  'both',
  'each',
  'every',
  'all',
  'any',
  'some',
  'more',
  'most',
  'other',
  'another',
  'do',
  'does',
  'did',
  'done',
  'have',
  'has',
  'had',
  'having',
  'can',
  'could',
  'should',
  'would',
  'may',
  'might',
  'must',
  'will',
  'shall',
  'about',
  'above',
  'below',
  'between',
  'through',
  'during',
  'before',
  'after',
  'while',
  'when',
  'where',
  'which',
  'who',
  'whom',
  'what',
  'how',
  'why',
  'here',
  'there',
  'thus',
  'hence',
  'e.g',
  'i.e',
  'etc',
]);

/** Standalone tokens that are too vague even when capitalized. */
const VAGUE_SHORT_TOKENS = new Set(['ml', 'ai', 'cpu', 'gpu', 'api', 'ui', 'ux', 'id']);

const MIN_CHARS = 3;
const MIN_SINGLE_WORD = 4;
const MIN_PHRASE_LETTERS = 5;
const MAX_TERM_LENGTH = 60;
const MAX_WORD_COUNT = 6;

/** Acronym / stacked label (ML, RAG, LIME, BERT-style). */
function isLikelyAcronymToken(s: string): boolean {
  return /^[A-Z]{2,6}$/.test(s) || /^[A-Z][A-Z0-9-]{2,6}$/.test(s);
}

/** One surface token counts as “concept-bearing” inside a phrase. */
function tokenIsContent(wordLower: string, wordOriginal: string): boolean {
  if (STOPWORDS.has(wordLower)) return false;
  if (BLOCKED_TERMS.has(wordLower)) return false;
  if (isLikelyAcronymToken(wordOriginal)) return true;
  if (wordLower.length >= 4) return true;
  return wordLower.length === 3 && !STOPWORDS.has(wordLower);
}

/**
 * Reject “X is”, “for Y”, and other glue+anchor pairs; require real concept tokens.
 */
function passesPhraseGate(term: string, lower: string, wordCount: number): boolean {
  if (wordCount <= 1) return true;
  const originals = term.trim().split(/\s+/).filter(Boolean);
  const lowers = lower.split(/\s+/).filter(Boolean);
  if (originals.length !== lowers.length) return false;

  const flags = originals.map((orig, i) => tokenIsContent(lowers[i], orig));

  if (wordCount === 2) {
    return flags[0] && flags[1];
  }

  const nContent = flags.filter(Boolean).length;
  return nContent >= 2;
}

export function filterTerms(rawTerms: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];

  for (const raw of rawTerms) {
    const term = raw.trim();
    if (!term) continue;
    const lower = term.toLowerCase();
    const words = lower.split(/\s+/).filter(Boolean);
    const wordCount = words.length;

    if (lower.length < MIN_CHARS) continue;
    if (lower.length > MAX_TERM_LENGTH) continue;
    if (wordCount > MAX_WORD_COUNT) continue;
    if (BLOCKED_TERMS.has(lower)) continue;
    if (!passesPhraseGate(term, lower, wordCount)) continue;

    if (wordCount === 1) {
      if (TRIVIAL_SINGLETON.has(lower)) continue;
      if (STOPWORDS.has(lower)) continue;
      if (VAGUE_SHORT_TOKENS.has(lower)) continue;
      if (term.length < MIN_SINGLE_WORD && !isLikelyAcronymToken(term)) continue;
      if (/^(large|small|fast|slow|good|bad|high|low|new|old|big|key|main)$/.test(lower)) continue;
    } else {
      const lettersOnly = lower.replace(/[^a-z0-9]/g, '');
      if (lettersOnly.length < MIN_PHRASE_LETTERS) continue;
    }

    if (seen.has(lower)) continue;
    seen.add(lower);
    out.push(term);
  }

  return out;
}
