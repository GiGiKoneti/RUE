import { completeChat } from './completeChat';

const EXTRACT_SYSTEM = `You are the second-pass curator for a "recursive learning" UI. The assistant has already written an answer. Your job is to pick the best explorable sub-concepts for follow-up clicks.

Return ONLY valid JSON (no markdown fences, no prose), exactly this shape:
{"terms":["...","..."]}

Rules:
- Output **3 to 4** strings (never fewer than 3 unless the reply is under ~80 words).
- Each string MUST be a **contiguous substring copied verbatim** from the assistant reply (same spelling and capitalization) so the UI can find and highlight it once.
- Pick **different** load-bearing ideas—mechanisms, named effects, concrete objects—not generic filler ("method", "approach", "process").
- **One string per concept**—no duplicates, no rewordings of the same idea.
- **CRITICAL:** Under "User focus — do NOT include", the learner already chose that topic. Never output those phrases or obvious synonyms/trivial variants (e.g. hyphenation changes, plural/singular flip only). Pick *other* ideas that appear in the reply instead.
- Prefer **2–4 word phrases** when they carry the meaning.`;

function parseTermsPayload(raw: string): string[] {
  let t = raw.trim();
  if (t.startsWith('```')) {
    t = t.replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/s, '');
  }
  const parsed = JSON.parse(t) as { terms?: unknown };
  if (!parsed || !Array.isArray(parsed.terms)) return [];
  return parsed.terms.filter((x): x is string => typeof x === 'string' && x.trim().length >= 2);
}

function occursInResponse(term: string, responseLower: string): boolean {
  return responseLower.includes(term.trim().toLowerCase());
}

export function termMatchesExcludeHint(term: string, hints: string[]): boolean {
  const tl = term.trim().toLowerCase();
  if (tl.length < 2) return false;
  for (const h of hints) {
    const hl = h.trim().toLowerCase();
    if (hl.length < 2) continue;
    if (tl === hl || tl.includes(hl) || hl.includes(tl)) return true;
  }
  return false;
}

/**
 * Second LLM pass: curated explorable terms grounded in the answer; respects exclude list.
 */
export async function extractExplorableTermsLLM(
  responseText: string,
  seedPrompt: string,
  excludeHints: string[] = []
): Promise<string[]> {
  const clipped = responseText.slice(0, 14_000);
  const seed = seedPrompt.slice(0, 800);
  const uniqueHints = [...new Set(excludeHints.map((h) => h.trim()).filter((h) => h.length >= 2))].slice(
    0,
    20
  );
  const excludeBlock =
    uniqueHints.length > 0
      ? `\n---\nUser focus — do NOT include these (or obvious synonyms). The user is already exploring them:\n${uniqueHints.map((h) => `- ${h}`).join('\n')}\n`
      : '';
  const user = `Assistant reply:\n---\n${clipped}\n---\nContext (question / node topic):\n${seed}${excludeBlock}`;

  try {
    const raw = await completeChat(EXTRACT_SYSTEM, user, 320);
    const terms = parseTermsPayload(raw);
    const rl = clipped.toLowerCase();
    return terms
      .filter((t) => occursInResponse(t, rl))
      .filter((t) => !termMatchesExcludeHint(t, uniqueHints));
  } catch {
    return [];
  }
}
