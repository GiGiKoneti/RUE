import { useRef, useState, useCallback, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence } from 'framer-motion';
import { useExplorationStore } from '../store/explorationStore';
import { useSaiki } from '../hooks/useSaiki';
import { useTextSelection } from '../hooks/useTextSelection';
import type { ChatNode } from '../types';
import TermsTray from './TermsTray';
import SelectionBubble from './SelectionBubble';
import { SocraticProbe } from './SocraticProbe';
import { RenderedResponse } from '../features/rue/components/RenderedResponse';

export function NodeContent({ node }: { node: ChatNode }) {
  const responseRef = useRef<HTMLDivElement>(null);
  const { exploreTerm } = useSaiki();
  const nodes = useExplorationStore((s) => s.nodes);

  const [customTerms, setCustomTerms] = useState<string[]>([]);
  const { customSelection, selectionRect, clearSelection } = useTextSelection(responseRef);

  const exploredTerms = useMemo(
    () =>
      Object.values(nodes)
        .filter((n) => n.parentId === node.id)
        .map((n) => n.parentTerm?.toLowerCase())
        .filter(Boolean) as string[],
    [nodes, node.id]
  );

  const handleAddCustomTerm = useCallback(
    (term: string) => {
      if (!customTerms.some((t) => t.toLowerCase() === term.toLowerCase())) {
        setCustomTerms((prev) => [...prev, term]);
      }
      clearSelection();
    },
    [customTerms, clearSelection]
  );

  const handleRemoveCustomTerm = useCallback((term: string) => {
    setCustomTerms((prev) => prev.filter((t) => t !== term));
  }, []);

  const handleExploreNow = useCallback(
    (term: string) => {
      exploreTerm(term, node.id);
      clearSelection();
    },
    [node.id, exploreTerm, clearSelection]
  );

  const onTermClick = useCallback(
    (term: string) => {
      exploreTerm(term, node.id);
    },
    [exploreTerm, node.id]
  );

  return (
    <div className="space-y-6">
      <div className="flex items-start gap-3">
        <div
          className="w-6 h-6 rounded-full bg-[var(--accent)]/20 border
                        border-[var(--accent)]/30 flex items-center justify-center
                        flex-shrink-0 mt-0.5"
        >
          <span className="text-[10px] text-[var(--accent)] font-bold">Q</span>
        </div>
        <p className="text-sm text-white/45 font-[Inter] leading-relaxed line-clamp-2">
          {node.prompt}
        </p>
      </div>

      <div
        ref={responseRef}
        className="selection:bg-[var(--accent)]/20"
      >
        <RenderedResponse
          node={node}
          onTermClick={onTermClick}
          exploredTerms={exploredTerms}
        />
      </div>

      {!node.isStreaming && (
        <TermsTray
          node={node}
          customTerms={customTerms}
          onRemoveCustomTerm={handleRemoveCustomTerm}
          onAddCustomTerm={(term) => {
            if (!customTerms.some((t) => t.toLowerCase() === term.toLowerCase())) {
              setCustomTerms((prev) => [...prev, term]);
            }
          }}
        />
      )}

      <SocraticProbe nodeId={node.id} />

      <AnimatePresence>
        {customSelection &&
          selectionRect &&
          createPortal(
            <SelectionBubble
              text={customSelection}
              rect={selectionRect}
              onAddToTray={() => handleAddCustomTerm(customSelection)}
              onExploreNow={() => handleExploreNow(customSelection)}
              onDismiss={clearSelection}
            />,
            document.body
          )}
      </AnimatePresence>
    </div>
  );
}
