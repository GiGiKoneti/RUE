import React, { useRef, useState, useEffect } from 'react';
import { ArrowLeft, ChevronRight, MoreHorizontal } from 'lucide-react';
import clsx from 'clsx';
import { useNodeAncestry } from '../hooks/useNodeAncestry';
import { useExplorationStore } from '../store/explorationStore';
import { truncateToSixWords } from '../features/rue/lib/analysis';
import { MasteryStars } from './MasteryStars';
import type { ChatNode } from '../types';

export function OutputPageHeader({
  node,
  onClose,
}: {
  node: ChatNode;
  onClose: () => void;
}) {
  const ancestry = useNodeAncestry(node.id);
  const switchOutputNode = useExplorationStore((s) => s.switchOutputNode);
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const h = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    };
    if (menuOpen) window.addEventListener('mousedown', h);
    return () => window.removeEventListener('mousedown', h);
  }, [menuOpen]);

  return (
    <div
      className="sticky top-0 z-10 flex items-center gap-3 px-6 py-4 border-b border-white/[0.06]
                 bg-[#0b1326]/95 backdrop-blur-sm"
    >
      <button
        type="button"
        onClick={onClose}
        className="flex items-center gap-1.5 text-sm text-white/40 hover:text-white/70
                   transition-colors duration-150 flex-shrink-0"
      >
        <ArrowLeft className="w-4 h-4" />
        <span className="text-sm font-[Inter]">Map</span>
      </button>

      <div className="w-px h-4 bg-white/[0.08] flex-shrink-0" />

      <div
        className="flex items-center gap-1 overflow-x-auto flex-1 min-w-0
                   [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none]"
      >
        {ancestry.map((ancestor, i) => (
          <React.Fragment key={ancestor.id}>
            {i > 0 && (
              <ChevronRight className="w-3 h-3 text-white/20 flex-shrink-0" aria-hidden />
            )}
            <button
              type="button"
              onClick={() => switchOutputNode(ancestor.id)}
              className={clsx(
                'text-xs px-2 py-1 rounded-lg flex-shrink-0 transition-all duration-150 font-[Inter]',
                ancestor.id === node.id
                  ? 'bg-[var(--accent)]/15 text-[var(--accent)] font-medium'
                  : 'text-white/35 hover:text-white/60 hover:bg-white/[0.05]'
              )}
            >
              {ancestor.summary || truncateToSixWords(ancestor.prompt)}
            </button>
          </React.Fragment>
        ))}
      </div>

      {node.masteryStars > 0 && (
        <div className="flex-shrink-0">
          <MasteryStars stars={node.masteryStars} size="sm" />
        </div>
      )}

      <div className="relative flex-shrink-0" ref={menuRef}>
        <button
          type="button"
          onClick={() => setMenuOpen((o) => !o)}
          className="w-8 h-8 rounded-lg hover:bg-white/[0.06] flex items-center justify-center
                     text-white/30 hover:text-white/60"
          aria-label="More"
        >
          <MoreHorizontal className="w-4 h-4" />
        </button>
        {menuOpen && (
          <div
            className="absolute right-0 top-full mt-1 w-40 rounded-xl border border-white/10 bg-[#0d1425] py-1 shadow-xl z-20"
            role="menu"
          >
            <button
              type="button"
              className="w-full px-3 py-2 text-left text-xs text-white/60 hover:bg-white/[0.05]"
              onClick={() => {
                setMenuOpen(false);
                onClose();
              }}
            >
              Back to canvas
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
