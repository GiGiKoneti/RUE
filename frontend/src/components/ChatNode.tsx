import { useRef, useEffect, useCallback } from 'react';
import { motion } from 'framer-motion';
import { ChevronDown, ChevronUp } from 'lucide-react';
import { useExplorationStore } from '../store/explorationStore';
import type { ChatNode as ChatNodeType, ExtractedTerm } from '../types';

interface ChatNodeProps {
  node: ChatNodeType;
  isActive: boolean;
  onExploreTerm: (term: string, nodeId: string) => void;
  onFollowUp: (nodeId: string, question: string) => void;
}

/* ─── Render response text with highlighted terms ─── */
function HighlightedText({
  text,
  terms,
  depth,
  depthLimit,
  onTermClick,
  exploredTerms,
}: {
  text: string;
  terms: ExtractedTerm[];
  depth: number;
  depthLimit: number;
  onTermClick: (term: string) => void;
  exploredTerms: Set<string>;
}) {
  if (!terms.length) return <span>{text}</span>;

  const validTerms = terms.filter(t => t.startIndex !== undefined && t.endIndex !== undefined) as {term: string; startIndex: number; endIndex: number}[];
  if (!validTerms.length) return <span>{text}</span>;

  const atLimit = depthLimit > 0 && depth >= depthLimit;
  const segments: React.ReactNode[] = [];
  let lastEnd = 0;

  const sorted = [...validTerms].sort((a, b) => a.startIndex - b.startIndex);
  for (const t of sorted) {
    if (t.startIndex > lastEnd) {
      segments.push(<span key={`t_${lastEnd}`}>{text.slice(lastEnd, t.startIndex)}</span>);
    }
    const explored = exploredTerms.has(t.term.toLowerCase());
    segments.push(
      atLimit ? (
        <span key={`term_${t.startIndex}`}>{t.term}</span>
      ) : (
        <span
          key={`term_${t.startIndex}`}
          onClick={(e) => { e.stopPropagation(); onTermClick(t.term); }}
          className={`
            relative cursor-pointer transition-all duration-200 group/term inline
            ${explored
              ? 'text-[#a078ff]/60 underline decoration-[#a078ff]/30 underline-offset-2'
              : 'text-[#d0bcff] underline decoration-[#d0bcff]/50 underline-offset-2 bg-violet-500/10 hover:bg-violet-500/20 hover:decoration-[#d0bcff]'
            }
          `}
        >
          {t.term}
          {!explored && (
            <span className="pointer-events-none absolute -top-8 left-1/2 -translate-x-1/2 px-2 py-1 rounded-lg
                            bg-[#171f33] text-[10px] text-[#dae2fd]/70 whitespace-nowrap opacity-0
                            group-hover/term:opacity-100 transition-opacity duration-200 border border-[#494454]/20 z-50">
              Click to explore →
            </span>
          )}
        </span>
      )
    );
    lastEnd = t.endIndex;
  }
  if (lastEnd < text.length) {
    segments.push(<span key={`t_${lastEnd}`}>{text.slice(lastEnd)}</span>);
  }

  return <>{segments}</>;
}

/* ─── ChatNode component ─── */
export default function ChatNodeCard({ node, isActive, onExploreTerm, onFollowUp }: ChatNodeProps) {
  const { toggleCollapse, nodes, globalDepthLimit } = useExplorationStore();
  const cardRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Track which child terms have been explored
  const exploredTerms = new Set(
    node.childIds.map((cid) => nodes[cid]?.prompt?.match(/^Explain "(.+?)" in the context/)?.[1]?.toLowerCase() || '')
  );

  // Report dimensions back to store
  const { setNodeDimensions } = useExplorationStore();
  useEffect(() => {
    if (!cardRef.current) return;
    const ro = new ResizeObserver((entries) => {
      for (const entry of entries) {
        setNodeDimensions(node.id, entry.contentRect.width, entry.contentRect.height);
      }
    });
    ro.observe(cardRef.current);
    return () => ro.disconnect();
  }, [node.id, setNodeDimensions]);

  const handleTermClick = useCallback((term: string) => {
    onExploreTerm(term, node.id);
  }, [node.id, onExploreTerm]);

  const handleFollowUpSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const val = inputRef.current?.value.trim();
    if (!val) return;
    onFollowUp(node.id, val);
    if (inputRef.current) inputRef.current.value = '';
  };

  return (
    <motion.div
      ref={cardRef}
      layout
      initial={{ opacity: 0, scale: 0.85, y: 20 }}
      animate={{
        opacity: isActive ? 1 : 0.4,
        scale: isActive ? 1 : 0.8,
      }}
      transition={{ type: 'spring', stiffness: 180, damping: 28 }}
      className={`
        absolute select-none
        ${isActive ? 'z-30' : 'z-10'}
      `}
      style={{
        left: node.x,
        top: node.y,
        transform: 'translate(-50%, -50%)',
        width: 420,
        minHeight: 180,
      }}
    >
      <div className={`
        bg-white/5 backdrop-blur-xl border border-white/10 rounded-2xl overflow-hidden
        transition-shadow duration-500
        ${isActive ? 'shadow-[0_32px_64px_-16px_rgba(13,19,38,0.7)]' : ''}
      `}>

        {/* ─── Header ─── */}
        <div className="flex items-center justify-between px-5 pt-4 pb-2">
          <p className="text-[13px] text-[#dae2fd]/70 truncate flex-1 mr-3 leading-snug"
             style={{ fontFamily: "'Inter', sans-serif" }}
             title={node.prompt}>
            {node.prompt}
          </p>
          <div className="flex items-center gap-2 flex-shrink-0">
            <span className="px-2 py-0.5 rounded-md text-[10px] font-semibold tracking-wide uppercase
                           bg-[#d0bcff]/15 text-[#d0bcff] border border-[#d0bcff]/20">
              Depth {node.depth}
            </span>
            {isActive && (
              <button
                onClick={(e) => { e.stopPropagation(); toggleCollapse(node.id); }}
                className="w-6 h-6 flex items-center justify-center rounded-md hover:bg-white/10 transition-colors text-[#dae2fd]/40"
              >
                {node.isCollapsed ? <ChevronDown size={14} /> : <ChevronUp size={14} />}
              </button>
            )}
          </div>
        </div>

        {/* ─── Divider ─── */}
        <div className="mx-5 h-px bg-gradient-to-r from-transparent via-white/10 to-transparent" />

        {/* ─── Body ─── */}
        {!node.isCollapsed && (
          <div className="px-5 py-4">
            {node.isStreaming ? (
              <div className="space-y-2">
                <div className="h-3 rounded bg-white/5 animate-pulse w-full" />
                <div className="h-3 rounded bg-white/5 animate-pulse w-4/5" />
                <div className="h-3 rounded bg-white/5 animate-pulse w-3/5" />
              </div>
            ) : (
              <p className="text-[14px] leading-[1.75] text-slate-200"
                 style={{ fontFamily: "'Inter', sans-serif" }}>
                <HighlightedText
                  text={node.response}
                  terms={node.extractedTerms}
                  depth={node.depth}
                  depthLimit={globalDepthLimit}
                  onTermClick={handleTermClick}
                  exploredTerms={exploredTerms}
                />
              </p>
            )}
          </div>
        )}

        {/* ─── Footer (term count) ─── */}
        {!node.isCollapsed && !node.isStreaming && node.extractedTerms.length > 0 && isActive && (
          <>
            <div className="mx-5 h-px bg-gradient-to-r from-transparent via-white/5 to-transparent" />
            <div className="px-5 py-2.5 flex items-center justify-between">
              <span className="text-[10px] uppercase tracking-widest text-[#dae2fd]/25 font-medium">
                {node.extractedTerms.length} explorable terms
              </span>
              {node.childIds.length > 0 && (
                <span className="text-[10px] text-[#a078ff]/50">
                  {node.childIds.length} explored
                </span>
              )}
            </div>
          </>
        )}

        {/* ─── Follow-up Input ─── */}
        {!node.isCollapsed && !node.isStreaming && isActive && (
          <div className="px-5 pb-5">
            <form onSubmit={handleFollowUpSubmit} className="relative group/input">
              <input
                ref={inputRef}
                type="text"
                placeholder="Ask a follow-up..."
                className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-2.5 text-[13px] 
                           text-[#dae2fd] placeholder-[#dae2fd]/30 outline-none focus:border-[#d0bcff]/40
                           focus:bg-white/10 transition-all duration-300 pr-10"
              />
              <button
                type="submit"
                className="absolute right-2 top-1/2 -translate-y-1/2 w-7 h-7 flex items-center justify-center
                           rounded-lg bg-[#d0bcff]/10 text-[#d0bcff] hover:bg-[#d0bcff]/20 transition-colors"
              >
                <span className="text-sm">↵</span>
              </button>
            </form>
          </div>
        )}
      </div>
    </motion.div>
  );
}
