import { filterTerms } from './termFilter';

/** Minimum explorable suggestions shown in the tray and used for highlight sync. */
export const MIN_EXPLORABLE_TERMS = 2;

/** Preferred ceiling — matches “3–5 quality concepts”, with room for one extra. */
export const MAX_EXPLORABLE_TERMS = 5;

function stripCodeBlocks(text: string): string {
  return text.replace(/```[\s\S]*?```/g, ' ');
}

function extractXmlTerms(text: string): string[] {
  const out: string[] = [];
  const re = /<\s*term\s*>([\s\S]*?)<\s*\/\s*term\s*>/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    const t = m[1].trim().replace(/\s+/g, ' ');
    if (t) out.push(t);
  }
  return out;
}

function extractBoldPhrases(text: string): string[] {
  const out: string[] = [];
  const re = /\*\*([^*]+)\*\*/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    const t = m[1].trim().replace(/\s+/g, ' ');
    if (t) out.push(t);
  }
  return out;
}

function extractItalicPhrases(text: string): string[] {
  const masked = text.replace(/\*\*[^*]+\*\*/g, ' ');
  const out: string[] = [];
  const re = /\*([^*]+)\*/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(masked)) !== null) {
    const t = m[1].trim().replace(/\s+/g, ' ');
    if (t) out.push(t);
  }
  return out;
}

/** Adjacent word pairs (e.g. “model agnostic”, “ML predictions”) before single-token salvage. */
function harvestBigrams(response: string): string[] {
  const stripped = stripCodeBlocks(response)
    .replace(/<\s*\/?\s*term\s*>/gi, ' ')
    .replace(/\*\*[^*]+\*\*/g, ' ')
    .replace(/\*[^*]+\*/g, ' ')
    .replace(/^>\s?/gm, ' ');

  const tokens = stripped
    .split(/\s+/)
    .map((w) => w.replace(/^[\s"'“”‘’(\[{]+|[\s,.:;!?)"'\]}]+$/g, ''))
    .filter(Boolean);

  const out: string[] = [];
  for (let i = 0; i < tokens.length - 1; i++) {
    const pair = `${tokens[i]} ${tokens[i + 1]}`;
    if (!filterTerms([pair]).length) continue;
    out.push(pair);
  }
  return out;
}

/** Longer tokens from prose when markup gives fewer than MIN_EXPLORABLE_TERMS. */
function harvestPlainTokens(response: string): string[] {
  const stripped = stripCodeBlocks(response)
    .replace(/<\s*\/?\s*term\s*>/gi, ' ')
    .replace(/\*\*[^*]+\*\*/g, ' ')
    .replace(/\*[^*]+\*/g, ' ')
    .replace(/^>\s?/gm, ' ');

  const words = stripped
    .split(/\s+/)
    .map((w) => w.replace(/^[\s"'“”‘’(\[{]+|[\s,.:;!?)"'\]}]+$/g, ''))
    .filter((w) => w.length >= 5);

  const byLower = new Map<string, string>();
  for (const w of words) {
    const k = w.toLowerCase();
    const prev = byLower.get(k);
    if (!prev || w.length > prev.length) byLower.set(k, w);
  }
  const sorted = [...byLower.values()].sort((a, b) => b.length - a.length);

  const out: string[] = [];
  for (const w of sorted) {
    if (!filterTerms([w]).length) continue;
    out.push(w);
  }
  return out;
}

/**
 * Builds the explorable term list: SSE terms first, then phrases parsed from the
 * response (XML, bold, italic, then substantive words), optionally the user's
 * question/prompt, until at least `minCount` distinct suggestions exist.
 */
export function mergeExplorableTerms(
  sseTerms: string[],
  response: string,
  minCount = MIN_EXPLORABLE_TERMS,
  fallbackPrompt?: string,
  excludeTerms: string[] = []
): string[] {
  const seen = new Set<string>();
  const excludeSet = new Set(excludeTerms.map(t => t.toLowerCase()));
  const out: string[] = [];

  const pushFiltered = (raw: string) => {
    if (out.length >= MAX_EXPLORABLE_TERMS) return;
    const t = raw.trim();
    if (!t) return;
    const ft = filterTerms([t]);
    if (!ft.length) return;
    const k = ft[0].toLowerCase();
    if (seen.has(k) || excludeSet.has(k)) return;
    seen.add(k);
    out.push(ft[0]);
  };

  const plain = stripCodeBlocks(response);

  // Trust explicit <term> markup first (model’s best intent), then SSE, then markdown fallbacks.
  for (const c of extractXmlTerms(plain)) {
    pushFiltered(c);
  }

  for (const t of [...new Set(sseTerms)]) {
    pushFiltered(t);
  }

  for (const c of extractBoldPhrases(plain)) {
    pushFiltered(c);
  }
  for (const c of extractItalicPhrases(plain)) {
    pushFiltered(c);
  }

  if (out.length < minCount) {
    for (const w of harvestBigrams(response)) {
      pushFiltered(w);
      if (out.length >= minCount) break;
    }
  }

  if (out.length < minCount) {
    for (const w of harvestPlainTokens(response)) {
      pushFiltered(w);
      if (out.length >= minCount) break;
    }
  }

  if (out.length < minCount && fallbackPrompt?.trim()) {
    for (const w of harvestBigrams(fallbackPrompt)) {
      pushFiltered(w);
      if (out.length >= minCount) break;
    }
  }

  if (out.length < minCount && fallbackPrompt?.trim()) {
    for (const w of harvestPlainTokens(fallbackPrompt)) {
      pushFiltered(w);
      if (out.length >= minCount) break;
    }
  }

  /** When the strict gate removes everything, still surface explicit markup / bold so chips + tray work. */
  const pushLenient = (raw: string) => {
    if (out.length >= MAX_EXPLORABLE_TERMS) return;
    const t = raw.trim().replace(/\s+/g, ' ');
    if (t.length < 3) return;
    const k = t.toLowerCase();
    if (seen.has(k) || excludeSet.has(k)) return;
    seen.add(k);
    out.push(t);
  };

  if (out.length < minCount) {
    for (const c of extractXmlTerms(plain)) {
      pushLenient(c);
      if (out.length >= minCount) break;
    }
  }
  if (out.length < minCount) {
    for (const c of extractBoldPhrases(plain)) {
      pushLenient(c);
      if (out.length >= minCount) break;
    }
  }
  if (out.length < minCount) {
    for (const c of extractItalicPhrases(plain)) {
      pushLenient(c);
      if (out.length >= minCount) break;
    }
  }

  return out;
}

/**
 * Prefer LLM-curated terms (substrings of `responseText`), then heuristic list, then merge fill.
 */
export function combineLlmWithHeuristic(
  llmTerms: string[],
  heuristicTerms: string[],
  responseText: string
): string[] {
  const rl = responseText.toLowerCase();
  const seen = new Set<string>();
  const out: string[] = [];

  const pushLlm = (raw: string) => {
    if (out.length >= MAX_EXPLORABLE_TERMS) return;
    const t = raw.trim();
    if (t.length < 2 || !rl.includes(t.toLowerCase())) return;
    const ft = filterTerms([t]);
    const use = ft.length ? ft[0] : t.length >= 6 || t.split(/\s+/).length >= 2 ? t : '';
    if (!use) return;
    const k = use.toLowerCase();
    if (seen.has(k)) return;
    seen.add(k);
    out.push(use);
  };

  for (const t of llmTerms) pushLlm(t);

  for (const t of heuristicTerms) {
    if (out.length >= MAX_EXPLORABLE_TERMS) break;
    const tr = t.trim();
    const k = tr.toLowerCase();
    if (!tr || seen.has(k)) continue;
    if (!rl.includes(k)) continue;
    seen.add(k);
    out.push(tr);
  }

  if (out.length < MIN_EXPLORABLE_TERMS) {
    const rest = mergeExplorableTerms(
      [],
      responseText,
      MIN_EXPLORABLE_TERMS,
      undefined,
      out
    );
    for (const t of rest) {
      if (out.length >= MAX_EXPLORABLE_TERMS) break;
      const k = t.toLowerCase();
      if (seen.has(k)) continue;
      seen.add(k);
      out.push(t);
    }
  }

  return out;
}
