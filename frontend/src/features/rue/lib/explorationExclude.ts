/**
 * Phrases the user is already exploring — must not appear as explorable highlights.
 */

export function termMatchesExcludeHint(term: string, hints: string[]): boolean {
  const tl = term.trim().toLowerCase();
  if (tl.length < 2) return false;
  for (const h of hints) {
    const hl = h.trim().toLowerCase();
    if (hl.length < 2) continue;
    if (tl === hl) return true;
    if (tl.includes(hl) || hl.includes(tl)) return true;
  }
  return false;
}

/** Short hints for the extract-terms LLM + server filter. */
export function collectExcludeHintsForExtract(
  prompt: string,
  parentTerm: string | null | undefined,
  parentPrompt: string | null | undefined
): string[] {
  const raw: string[] = [];
  if (parentTerm?.trim()) raw.push(parentTerm.trim());

  const p = prompt.replace(/\s+/g, ' ').trim();
  if (p) {
    const dq = /"([^"]{2,200})"/g;
    let m: RegExpExecArray | null;
    while ((m = dq.exec(prompt)) !== null) raw.push(m[1].trim());

    const single = p.match(/^Explain\s+"(.+?)"\s+in\s+the\s+context\s+of:/i);
    if (single) raw.push(single[1].trim());
  }

  if (parentPrompt?.trim()) {
    const pp = parentPrompt.trim().slice(0, 600);
    const pdq = /"([^"]{2,200})"/g;
    let pm: RegExpExecArray | null;
    while ((pm = pdq.exec(pp)) !== null) raw.push(pm[1].trim());
    const pExpl = pp.match(/^Explain\s+"(.+?)"\s+in\s+the\s+context\s+of:/i);
    if (pExpl) raw.push(pExpl[1].trim());
  }

  const seen = new Set<string>();
  const out: string[] = [];
  for (const r of raw) {
    if (r.length < 2 || r.length > 220) continue;
    const k = r.toLowerCase();
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(r);
  }
  return out.slice(0, 24);
}

/** Lowercase keys pre-seeded into per-document highlight budget (never chip these). */
export function collectNeverHighlightKeys(
  prompt: string,
  parentTerm: string | null | undefined
): Set<string> {
  const hints = collectExcludeHintsForExtract(prompt, parentTerm, null);
  return new Set(hints.map((h) => h.toLowerCase()));
}

export function filterTermsAgainstHints(terms: string[], hints: string[]): string[] {
  if (!hints.length) return terms;
  return terms.filter((t) => !termMatchesExcludeHint(t, hints));
}
