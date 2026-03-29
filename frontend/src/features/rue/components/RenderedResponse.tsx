import { useMemo, useState, useCallback, type ReactNode } from 'react';
import clsx from 'clsx';
import { motion, useReducedMotion } from 'framer-motion';
import { Check, Copy } from 'lucide-react';
import type { ChatNode } from '../../../types';
import { mergeExplorableTerms, MIN_EXPLORABLE_TERMS } from '../lib/explorableTerms';
import {
  collectNeverHighlightKeys,
  collectExcludeHintsForExtract,
  filterTermsAgainstHints,
} from '../lib/explorationExclude';

export type RUENode = ChatNode;

type Segment =
  | { type: 'paragraph'; content: string }
  | { type: 'blockquote'; content: string }
  | { type: 'hr'; content: '' }
  | { type: 'list'; content: ''; items: string[] }
  | { type: 'code_block'; content: string; language: string; partial?: boolean };

const KNOWN_LANG = new Set([
  'python',
  'javascript',
  'typescript',
  'cpp',
  'c',
  'java',
  'rust',
  'go',
  'sql',
  'bash',
  'shell',
  'json',
  'text',
]);

function normalizeLanguage(lang: string): string {
  const l = lang.trim().toLowerCase() || 'text';
  return KNOWN_LANG.has(l) ? l : 'text';
}

/**
 * Block-level parse; tolerates incomplete fenced code while `isStreaming` is true.
 */
export function parseResponse(raw: string, isStreaming: boolean): Segment[] {
  const segments: Segment[] = [];
  if (!raw) return segments;

  const lines = raw.split('\n');
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];

    if (line.trim() === '---') {
      segments.push({ type: 'hr', content: '' });
      i++;
      continue;
    }

    if (line.trim().startsWith('```')) {
      const language = normalizeLanguage(line.trim().slice(3).trim() || 'text');
      i++;
      const codeLines: string[] = [];
      let closed = false;
      while (i < lines.length) {
        if (lines[i].trim().startsWith('```')) {
          closed = true;
          i++;
          break;
        }
        codeLines.push(lines[i]);
        i++;
      }
      segments.push({
        type: 'code_block',
        content: codeLines.join('\n'),
        language,
        partial: !closed && isStreaming,
      });
      continue;
    }

    if (line.startsWith('> ')) {
      const quoteLines = [line.slice(2)];
      while (i + 1 < lines.length && lines[i + 1].startsWith('> ')) {
        i++;
        quoteLines.push(lines[i].slice(2));
      }
      segments.push({ type: 'blockquote', content: quoteLines.join(' ') });
      i++;
      continue;
    }

    if (/^- .+/.test(line)) {
      const items = [line.slice(2).trimStart()];
      while (i + 1 < lines.length && /^- .+/.test(lines[i + 1])) {
        i++;
        items.push(lines[i].slice(2).trimStart());
      }
      segments.push({ type: 'list', content: '', items });
      i++;
      continue;
    }

    if (line.trim() === '') {
      i++;
      continue;
    }

    const paraLines = [line];
    while (i + 1 < lines.length) {
      const next = lines[i + 1];
      if (next.trim() === '') break;
      if (next.startsWith('> ')) break;
      if (/^- .+/.test(next)) break;
      if (next.trim().startsWith('```')) break;
      if (next.trim() === '---') break;
      i++;
      paraLines.push(lines[i]);
    }
    segments.push({ type: 'paragraph', content: paraLines.join(' ') });
    i++;
  }

  return segments;
}

/** Private-use markers so `**…**` / `*…*` never swallow `<term>…</term>` bodies. */
const TERM_MARK = '\uE000';
const TERM_MARK_END = '\uE001';
const PROT_MARK = '\uE002';
const PROT_END = '\uE003';

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** Remove model <term> markup so we can re-apply a single authoritative highlight pass. */
function stripTermXmlToPlain(text: string): string {
  let s = text.replace(/<\s*term\s*>([\s\S]*?)<\s*\/\s*term\s*>/gi, '$1');
  s = s.replace(/<\s*\/\s*term\s*>/gi, '');
  s = s.replace(/<\s*term\s*>/gi, '');
  return s;
}

/**
 * One clickable chip per canonical term (longest-first), **first occurrence in the whole answer** —
 * `globalConsumed` is shared across paragraphs/lists so we never re-chip the same phrase later.
 */
function injectAuthoritativeTermsOnce(
  text: string,
  terms: string[],
  globalConsumed: Set<string>
): string {
  if (!terms.length) return stripTermXmlToPlain(text);
  let s = stripTermXmlToPlain(text);
  const sorted = [...new Set(terms.map((t) => t.trim()).filter((t) => t.length >= 2))].sort(
    (a, b) => b.length - a.length
  );

  for (const canonical of sorted) {
    const key = canonical.toLowerCase();
    if (globalConsumed.has(key)) continue;

    const regions: string[] = [];
    let work = s.replace(/<\s*term\s*>[\s\S]*?<\s*\/\s*term\s*>/gi, (block) => {
      const i = regions.length;
      regions.push(block);
      return `${PROT_MARK}${i}${PROT_END}`;
    });

    const esc = escapeRegExp(canonical);
    let replaced = false;

    work = work.replace(new RegExp(`\\*\\*\\s*${esc}\\s*\\*\\*`, 'gi'), (full) => {
      if (replaced) return full;
      replaced = true;
      return `<term>${canonical}</term>`;
    });

    if (!replaced) {
      work = work.replace(new RegExp(`\\b${esc}\\b`, 'gi'), (full) => {
        if (replaced) return full;
        replaced = true;
        return `<term>${canonical}</term>`;
      });
    }

    s = work.replace(new RegExp(`${PROT_MARK}(\\d+)${PROT_END}`, 'g'), (_, idx) => {
      const i = parseInt(idx, 10);
      return regions[i] ?? '';
    });

    if (replaced) globalConsumed.add(key);
  }

  return s;
}

/** Match sloppy model output: `< term >`, newlines inside tags, `</TERM>`. */
function maskTerms(raw: string, termsOut: string[], isStreaming: boolean): string {
  const complete = /<\s*term\s*>([\s\S]*?)<\s*\/\s*term\s*>/gi;
  let s = raw.replace(complete, (_, inner: string) => {
    const term = inner.trim().replace(/\s+/g, ' ');
    if (!term) return _;
    const i = termsOut.length;
    termsOut.push(term);
    return `${TERM_MARK}${i}${TERM_MARK_END}`;
  });

  if (isStreaming) {
    s = s.replace(/<\s*term\s*>((?:(?!<\s*\/\s*term\s*>)[\s\S])*)$/i, (full, inner: string) => {
      const term = String(inner).trim().replace(/\s+/g, ' ');
      if (!term) return full;
      const i = termsOut.length;
      termsOut.push(term);
      return `${TERM_MARK}${i}${TERM_MARK_END}`;
    });
  }

  return s;
}

function termChip(
  term: string,
  key: string,
  onTermClick: (term: string) => void,
  exploredTerms: string[]
): ReactNode {
  const explored = exploredTerms.some((e) => e.toLowerCase() === term.toLowerCase());
  return (
    <span
      key={key}
      data-term={term}
      role="button"
      tabIndex={0}
      onClick={(e) => {
        e.stopPropagation();
        onTermClick(term);
      }}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onTermClick(term);
        }
      }}
      className={clsx(
        'relative z-10 inline cursor-pointer pointer-events-auto transition-all duration-150 align-baseline',
        'rounded-md px-1.5 py-0.5 font-medium',
        'bg-[var(--accent)]/22 text-[#c4f1ff] ring-1 ring-inset ring-[var(--accent)]/45',
        explored ? 'opacity-75' : '',
        'hover:bg-[var(--accent)]/32 hover:text-white hover:ring-[var(--accent)]/60'
      )}
    >
      {term}
      {explored && <sup className="ml-0.5 text-[8px] opacity-50">✓</sup>}
    </span>
  );
}

/** Inline markdown (code, bold, italic) only — term tags must already be masked. */
function renderMarkdownFragments(text: string, keyPrefix: string): ReactNode[] {
  const parts: ReactNode[] = [];
  const regex = /`([^`]+)`|\*\*([^*]+)\*\*|\*([^*]+)\*/g;
  let last = 0;
  let match: RegExpExecArray | null;
  let frag = 0;

  while ((match = regex.exec(text)) !== null) {
    if (match.index > last) {
      parts.push(
        <span key={`${keyPrefix}-t-${frag++}`}>{text.slice(last, match.index)}</span>
      );
    }

    if (match[1] !== undefined) {
      parts.push(
        <code
          key={`${keyPrefix}-c-${frag++}`}
          className="px-1.5 py-0.5 rounded-md text-[0.85em] font-mono
                     bg-white/[0.08] text-white/80 border border-white/[0.08]"
        >
          {match[1]}
        </code>
      );
    } else if (match[2] !== undefined) {
      parts.push(
        <strong
          key={`${keyPrefix}-b-${frag++}`}
          className="font-semibold text-[#a5f3fc] bg-cyan-500/15 px-1 rounded"
        >
          {match[2]}
        </strong>
      );
    } else if (match[3] !== undefined) {
      parts.push(
        <em key={`${keyPrefix}-i-${frag++}`} className="italic text-[#e9d5ff] font-medium">
          {match[3]}
        </em>
      );
    }

    last = regex.lastIndex;
  }

  if (last < text.length) {
    parts.push(<span key={`${keyPrefix}-end`}>{text.slice(last)}</span>);
  }

  return parts;
}

function renderInline(
  text: string,
  onTermClick: (term: string) => void,
  exploredTerms: string[],
  syncTerms: string[],
  isStreaming: boolean,
  highlightBudget: Set<string>
): ReactNode[] {
  const extracted: string[] = [];
  let enriched: string;
  if (!isStreaming && syncTerms.length) {
    // Authoritative pass: inject <term> tags for known syncTerms
    enriched = injectAuthoritativeTermsOnce(text, syncTerms, highlightBudget);
  } else {
    // Preserve raw <term> tags from LLM response — don't strip them!
    // maskTerms will extract them into clickable chips.
    enriched = text;
  }
  const masked = maskTerms(enriched, extracted, isStreaming);
  const tokenRe = new RegExp(`${TERM_MARK}(\\d+)${TERM_MARK_END}`, 'g');
  const out: ReactNode[] = [];
  let last = 0;
  let m: RegExpExecArray | null;
  let seq = 0;

  while ((m = tokenRe.exec(masked)) !== null) {
    if (m.index > last) {
      out.push(...renderMarkdownFragments(masked.slice(last, m.index), `x-${seq++}`));
    }
    const idx = parseInt(m[1], 10);
    const term = extracted[idx];
    if (term !== undefined) {
      out.push(termChip(term, `term-${seq++}`, onTermClick, exploredTerms));
    }
    last = tokenRe.lastIndex;
  }

  if (last < masked.length) {
    out.push(...renderMarkdownFragments(masked.slice(last), `x-${seq++}`));
  }

  return out;
}

const LANGUAGE_COLORS: Record<string, string> = {
  python: '#3b82f6',
  javascript: '#f59e0b',
  typescript: '#60a5fa',
  cpp: '#ef4444',
  c: '#ef4444',
  java: '#f97316',
  rust: '#fb923c',
  go: '#22d3ee',
  sql: '#a78bfa',
  bash: '#4ade80',
  shell: '#4ade80',
  json: '#94a3b8',
  text: '#94a3b8',
};

function CodeBlock({ code, language }: { code: string; language: string }) {
  const [copied, setCopied] = useState(false);
  const langColor = LANGUAGE_COLORS[language.toLowerCase()] ?? '#94a3b8';

  const handleCopy = useCallback(async () => {
    await navigator.clipboard.writeText(code);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 2000);
  }, [code]);

  return (
    <div className="rounded-xl overflow-hidden border border-white/[0.08] my-1">
      <div
        className="flex items-center justify-between px-4 py-2
                      bg-white/[0.04] border-b border-white/[0.06]"
      >
        <div className="flex items-center gap-2">
          <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: langColor }} />
          <span
            className="text-[11px] font-mono font-medium uppercase tracking-wider"
            style={{ color: langColor }}
          >
            {language}
          </span>
        </div>

        <button
          type="button"
          onClick={handleCopy}
          className="flex items-center gap-1.5 text-[11px] text-white/35
                     hover:text-white/60 transition-colors duration-150"
        >
          {copied ? (
            <>
              <Check className="w-3 h-3 text-green-400" />
              <span className="text-green-400">Copied</span>
            </>
          ) : (
            <>
              <Copy className="w-3 h-3" />
              Copy
            </>
          )}
        </button>
      </div>

      <div className="overflow-x-auto bg-[#080f1f]">
        <pre className="px-5 py-4 text-[13px] font-mono leading-relaxed text-white/80 whitespace-pre">
          <code>{code}</code>
        </pre>
      </div>
    </div>
  );
}

export function RenderedResponse({
  node,
  onTermClick,
  exploredTerms,
}: {
  node: RUENode;
  onTermClick: (term: string) => void;
  exploredTerms: string[];
}) {
  const reduceMotion = useReducedMotion();
  const segments = useMemo(
    () => parseResponse(node.response, node.isStreaming),
    [node.response, node.isStreaming]
  );

  const syncTerms = useMemo(() => {
    const hints = collectExcludeHintsForExtract(node.prompt, node.parentTerm, null);
    if (node.isStreaming) return node.terms;
    if (node.terms.length > 0) {
      const f = filterTermsAgainstHints(node.terms, hints);
      return f.length ? f : node.terms;
    }
    const merged = mergeExplorableTerms([], node.response, MIN_EXPLORABLE_TERMS);
    const mf = filterTermsAgainstHints(merged, hints);
    return mf.length ? mf : merged;
  }, [node.isStreaming, node.terms, node.response, node.prompt, node.parentTerm]);

  const neverHighlightSeed = useMemo(
    () => collectNeverHighlightKeys(node.prompt, node.parentTerm),
    [node.prompt, node.parentTerm]
  );
  const highlightBudget = new Set(neverHighlightSeed);

  return (
    <div className="space-y-4 text-[15px] font-[Inter] leading-[1.8] text-white/78">
      {segments.map((seg, idx) => {
        switch (seg.type) {
          case 'paragraph':
            return (
              <p key={idx} className="text-white/78">
                {renderInline(
                  seg.content,
                  onTermClick,
                  exploredTerms,
                  syncTerms,
                  node.isStreaming,
                  highlightBudget
                )}
              </p>
            );
          case 'blockquote':
            return (
              <blockquote
                key={idx}
                className="relative pl-4 py-1 my-2 border-l-2 border-[var(--accent)]/40
                           text-white/55 italic text-[14px] leading-relaxed"
              >
                <div
                  className="absolute left-0 top-0 bottom-0 w-[2px] rounded-full pointer-events-none"
                  style={{
                    background: 'linear-gradient(180deg, var(--accent) 0%, transparent 100%)',
                    opacity: 0.4,
                  }}
                />
                {renderInline(
                  seg.content,
                  onTermClick,
                  exploredTerms,
                  syncTerms,
                  node.isStreaming,
                  highlightBudget
                )}
              </blockquote>
            );
          case 'hr':
            return (
              <div key={idx} className="flex items-center gap-3 py-1">
                <div className="flex-1 h-px bg-white/[0.06]" />
                <div className="w-1 h-1 rounded-full bg-[var(--accent)]/30" />
                <div className="flex-1 h-px bg-white/[0.06]" />
              </div>
            );
          case 'list':
            return (
              <ul key={idx} className="space-y-1.5 pl-1">
                {(seg.items ?? []).map((item, j) => (
                  <li key={j} className="flex items-start gap-3">
                    <span
                      className="mt-[0.6em] w-1 h-1 rounded-full flex-shrink-0"
                      style={{ background: 'var(--accent)', opacity: 0.5 }}
                    />
                    <span className="text-white/72">
                      {renderInline(
                        item,
                        onTermClick,
                        exploredTerms,
                        syncTerms,
                        node.isStreaming,
                        highlightBudget
                      )}
                    </span>
                  </li>
                ))}
              </ul>
            );
          case 'code_block':
            return <CodeBlock key={idx} code={seg.content} language={seg.language} />;
          default:
            return null;
        }
      })}

      {node.isStreaming && (
        <motion.span
          className="inline-block w-0.5 h-4 bg-[var(--accent)]/60 ml-0.5 align-middle rounded-sm"
          animate={reduceMotion ? { opacity: 0.85 } : { opacity: [1, 0.35, 1] }}
          transition={reduceMotion ? { duration: 0 } : { repeat: Infinity, duration: 0.8 }}
        />
      )}
    </div>
  );
}
