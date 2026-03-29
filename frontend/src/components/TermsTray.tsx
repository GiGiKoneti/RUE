import { useState, useRef, useMemo, useEffect } from 'react';
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion';
import { Sparkles, Plus, Check } from 'lucide-react';
import { useExplorationStore } from '../store/explorationStore';
import { useSaiki } from '../hooks/useSaiki';
import { TermChip } from './TermChip';
import FollowUpBar from './FollowUpBar';
import type { ChatNode } from '../types';
import { filterTerms } from '../features/rue/lib/termFilter';
import {
  mergeExplorableTerms,
  MIN_EXPLORABLE_TERMS,
  MAX_EXPLORABLE_TERMS,
} from '../features/rue/lib/explorableTerms';
import {
  collectExcludeHintsForExtract,
  filterTermsAgainstHints,
} from '../features/rue/lib/explorationExclude';

interface TermsTrayProps {
  node: ChatNode;
  customTerms: string[];
  onRemoveCustomTerm: (term: string) => void;
  onAddCustomTerm: (term: string) => void;
}

export default function TermsTray({
  node,
  customTerms,
  onRemoveCustomTerm,
  onAddCustomTerm,
}: TermsTrayProps) {
  const [selectedTerms, setSelectedTerms] = useState<string[]>([]);
  const [followUpValue, setFollowUpValue] = useState('');
  const [addingTerm, setAddingTerm] = useState(false);
  const [newTermInput, setNewTermInput] = useState('');
  const addInputRef = useRef<HTMLInputElement>(null);
  const followUpRef = useRef<HTMLInputElement>(null);
  const reduceMotion = useReducedMotion();

  const { nodes } = useExplorationStore();
  const { exploreTerm } = useSaiki();

  useEffect(() => {
    if (node.isStreaming) {
      setSelectedTerms([]);
    }
  }, [node.isStreaming]);

  const exploredTerms = useMemo(() => {
    return Object.values(nodes)
      .filter((n) => n.parentId === node.id)
      .map((n) => n.parentTerm?.toLowerCase())
      .filter(Boolean) as string[];
  }, [node.id, nodes]);

  const suggestedTerms = useMemo(() => {
    const hints = collectExcludeHintsForExtract(node.prompt, node.parentTerm, null);
    if (node.isStreaming) return [];
    if (node.terms.length > 0) {
      const f = filterTermsAgainstHints(node.terms, hints);
      return f.length ? f : node.terms;
    }
    const merged = mergeExplorableTerms([], node.response, MIN_EXPLORABLE_TERMS);
    const mf = filterTermsAgainstHints(merged, hints);
    return mf.length ? mf : merged;
  }, [node.isStreaming, node.terms, node.response, node.prompt, node.parentTerm]);

  const allVisibleTerms = useMemo(() => {
    const combined = [...suggestedTerms];
    customTerms.forEach((ct) => {
      if (!combined.some((t) => t.toLowerCase() === ct.toLowerCase())) {
        combined.push(ct);
      }
    });
    return combined;
  }, [suggestedTerms, customTerms]);

  function toggleTerm(term: string) {
    setSelectedTerms((prev) =>
      prev.includes(term) ? prev.filter((t) => t !== term) : [...prev, term]
    );
  }

  function handleAddTerm() {
    const val = newTermInput.trim();
    if (val.length < 2) return;
    const ft = filterTerms([val]);
    if (ft.length === 0) return;
    const v = ft[0];
    if (
      !allVisibleTerms.some((t) => t.toLowerCase() === v.toLowerCase())
    ) {
      onAddCustomTerm(v);
      setSelectedTerms((prev) =>
        prev.some((t) => t.toLowerCase() === v.toLowerCase()) ? prev : [...prev, v]
      );
    }
    setNewTermInput('');
    setAddingTerm(false);
  }

  function handleTrayKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Enter' && selectedTerms.length > 0 && followUpValue.trim() === '' && !e.shiftKey) {
      e.preventDefault();
      handleExploreSelected();
    }
  }

  function handleExploreSelected() {
    if (selectedTerms.length === 0) return;
    exploreTerm(selectedTerms, node.id);
    setSelectedTerms([]);
  }

  function handleFollowUp(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Enter' && followUpValue.trim()) {
      e.preventDefault();
      exploreTerm([], node.id, true, followUpValue.trim());
      setFollowUpValue('');
    }
  }

  const [show, setShow] = useState(false);
  useEffect(() => {
    if (!node.isStreaming) {
      const timer = setTimeout(() => setShow(true), 300);
      return () => clearTimeout(timer);
    } else {
      setShow(false);
    }
  }, [node.isStreaming]);

  if (!show) return null;

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: reduceMotion ? 0 : 0.3 }}
      className="mt-4 pt-4 border-t border-white/[0.06]"
      onKeyDown={handleTrayKeyDown}
      onClick={(e) => e.stopPropagation()}
    >
      <div className="flex items-start justify-between gap-2 mb-2.5">
        <div className="min-w-0">
          <p className="text-[10px] uppercase tracking-widest text-white/25 font-[Inter]">
            Explorable terms
          </p>
          <p className="text-[10px] text-white/35 font-[Inter] mt-0.5 leading-snug">
            Highlighted phrases above — {MIN_EXPLORABLE_TERMS}–{MAX_EXPLORABLE_TERMS} quality concepts
            when the model cooperates; click a chip or highlight to branch.
          </p>
        </div>
        <button
          type="button"
          onClick={() => {
            setAddingTerm(true);
            window.setTimeout(() => addInputRef.current?.focus(), 50);
          }}
          className="flex shrink-0 self-start items-center gap-1 text-[10px] text-white/30
                     hover:text-[var(--accent)]/70 transition-colors duration-150 font-[Inter]"
        >
          <Plus className="w-3 h-3" />
          Add term
        </button>
      </div>

      <div className="flex flex-wrap gap-2 mb-4" role="group" aria-label="Explorable terms">
        {allVisibleTerms.map((term) => (
          <TermChip
            key={term}
            term={term}
            isSelected={selectedTerms.includes(term)}
            isExplored={exploredTerms.includes(term.toLowerCase())}
            isCustom={customTerms.includes(term)}
            onToggle={toggleTerm}
            onRemove={onRemoveCustomTerm}
          />
        ))}

        <AnimatePresence>
          {addingTerm && (
            <motion.div
              initial={{ opacity: 0, width: 0 }}
              animate={{ opacity: 1, width: 'auto' }}
              exit={{ opacity: 0, width: 0 }}
              transition={{ duration: reduceMotion ? 0 : 0.2 }}
              className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-full
                         border border-dashed border-[var(--accent)]/40
                         bg-[var(--accent)]/5"
            >
              <input
                ref={addInputRef}
                type="text"
                value={newTermInput}
                onChange={(e) => setNewTermInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleAddTerm();
                  if (e.key === 'Escape') {
                    setAddingTerm(false);
                    setNewTermInput('');
                  }
                }}
                onBlur={() => {
                  if (!newTermInput.trim()) setAddingTerm(false);
                }}
                placeholder="type a term..."
                className="bg-transparent outline-none text-xs text-[var(--accent)]/80
                           placeholder:text-white/25 w-28 font-[Inter]"
              />
              <button
                type="button"
                onClick={handleAddTerm}
                className="text-[var(--accent)]/60 hover:text-[var(--accent)]"
                aria-label="Confirm term"
              >
                <Check className="w-3 h-3" />
              </button>
            </motion.div>
          )}
        </AnimatePresence>

        {allVisibleTerms.length === 0 && !addingTerm && (
          <p className="text-[11px] text-white/10 italic font-[Inter]">
            No terms detected. Try double-clicking text above or add one.
          </p>
        )}
      </div>

      <AnimatePresence>
        {selectedTerms.length > 0 && (
          <motion.button
            type="button"
            initial={{ opacity: 0, y: -6, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -4, scale: 0.97 }}
            transition={{ duration: reduceMotion ? 0 : 0.18 }}
            onClick={handleExploreSelected}
            className="flex items-center gap-2 mb-4 px-4 py-2.5 rounded-xl
                       bg-[var(--accent)]/15 hover:bg-[var(--accent)]/25
                       border border-[var(--accent)]/30 text-[var(--accent)]
                       text-sm font-medium transition-all duration-200 w-full
                       justify-center shadow-lg shadow-[var(--accent)]/5 font-[Inter]"
          >
            <Sparkles className="w-3.5 h-3.5" />
            Explore {selectedTerms.length} term{selectedTerms.length > 1 ? 's' : ''}
            <span className="text-[10px] text-[var(--accent)]/60 ml-1">↵ Enter</span>
          </motion.button>
        )}
      </AnimatePresence>

      <FollowUpBar
        ref={followUpRef}
        value={followUpValue}
        onChange={setFollowUpValue}
        onSubmit={handleFollowUp}
      />
    </motion.div>
  );
}
