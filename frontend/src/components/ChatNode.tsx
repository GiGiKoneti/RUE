import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import clsx from 'clsx';
import { useExplorationStore } from '../store/explorationStore';
import type { ChatNode as ChatNodeType } from '../types';
import { truncateToSixWords } from '../features/rue/lib/analysis';
import { useResizeObserver } from '../hooks/useResizeObserver';
import { MasteryStars } from './MasteryStars';

const HOLD_MS = 300;

interface ChatNodeProps {
  node: ChatNodeType;
  isActive: boolean;
  branchColor: string;
  divergenceTrend: 'diverging' | 'converging' | 'stable';
  onOpen: () => void;
}

const ChatNodeCard = React.memo(function ChatNodeCard({
  node,
  isActive,
  branchColor,
  divergenceTrend,
  onOpen,
}: ChatNodeProps) {
  const reduceMotion = useReducedMotion();
  const updateNodePosition = useExplorationStore((s) => s.updateNodePosition);
  const renameNode = useExplorationStore((s) => s.renameNode);
  const deleteNodeBranch = useExplorationStore((s) => s.deleteNodeBranch);

  const holdTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const modeRef = useRef<'idle' | 'pending_click' | 'drag'>('idle');
  const dragBaselineRef = useRef({ px: 0, py: 0, nx: 0, ny: 0 });
  const pointerIdRef = useRef<number | null>(null);
  const cardRef = useRef<HTMLDivElement>(null);

  const updateNodeDimensions = useExplorationStore((s) => (s as any).updateNodeDimensions);

  useResizeObserver(cardRef, (entry: ResizeObserverEntry) => {
    const { width, height } = entry.contentRect;
    updateNodeDimensions(node.id, width, height);
  });

  const [menu, setMenu] = useState<{ x: number; y: number } | null>(null);

  const dotColor =
    divergenceTrend === 'diverging'
      ? '#7dd3fc'
      : divergenceTrend === 'converging'
        ? '#86efac'
        : null;

  const clearHold = useCallback(() => {
    if (holdTimerRef.current) {
      clearTimeout(holdTimerRef.current);
      holdTimerRef.current = null;
    }
  }, []);

  useEffect(() => () => clearHold(), [clearHold]);

  const onPointerDown = useCallback(
    (e: React.PointerEvent) => {
      if (e.button !== 0) return;
      setMenu(null);
      modeRef.current = 'pending_click';
      pointerIdRef.current = e.pointerId;
      dragBaselineRef.current = {
        px: e.clientX,
        py: e.clientY,
        nx: node.x,
        ny: node.y,
      };

      holdTimerRef.current = setTimeout(() => {
        modeRef.current = 'drag';
        (e.target as HTMLElement).setPointerCapture(e.pointerId);
      }, HOLD_MS);
    },
    [node.x, node.y]
  );

  const onPointerMove = useCallback(
    (e: React.PointerEvent) => {
      if (modeRef.current !== 'drag') return;
      const b = dragBaselineRef.current;
      const nx = b.nx + (e.clientX - b.px);
      const ny = b.ny + (e.clientY - b.py);
      updateNodePosition(node.id, nx, ny);
    },
    [node.id, updateNodePosition]
  );

  const onPointerUp = useCallback(
    (e: React.PointerEvent) => {
      clearHold();
      if (e.button !== 0) return;
      if (modeRef.current === 'pending_click') {
        onOpen();
      }
      if (modeRef.current === 'drag' && pointerIdRef.current !== null) {
        try {
          (e.target as HTMLElement).releasePointerCapture(pointerIdRef.current);
        } catch {
          /* ignore */
        }
      }
      pointerIdRef.current = null;
      modeRef.current = 'idle';
    },
    [clearHold, onOpen]
  );

  const onContextMenu = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setMenu({ x: e.clientX, y: e.clientY });
  }, []);

  useEffect(() => {
    if (!menu) return;
    const close = () => setMenu(null);
    window.addEventListener('click', close);
    return () => window.removeEventListener('click', close);
  }, [menu]);

  const summaryLine = useMemo(() => {
    if (node.summaryPending && !node.summary) {
      return (
        <div className="h-4 rounded-md bg-white/[0.06] overflow-hidden relative">
          <div
            className="absolute inset-0 bg-gradient-to-r from-transparent via-white/[0.08] to-transparent
                       motion-safe:animate-[node-shimmer_1.2s_ease-in-out_infinite]"
            style={{
              animation: reduceMotion ? 'none' : undefined,
            }}
          />
        </div>
      );
    }
    return (
      <p className="text-sm font-medium text-white/80 leading-snug font-[Inter]">
        {node.summary || truncateToSixWords(node.prompt)}
      </p>
    );
  }, [node.summary, node.summaryPending, node.prompt, reduceMotion]);

  return (
    <>
      <style
        dangerouslySetInnerHTML={{
          __html: `@keyframes node-shimmer { from { transform: translateX(-100%); } to { transform: translateX(100%); } }`,
        }}
      />
      <motion.div
        ref={cardRef}
        layoutId={reduceMotion ? undefined : `node-card-${node.id}`}
        data-node-id={node.id}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        onContextMenu={onContextMenu}
        className={clsx(
          'absolute cursor-pointer select-none touch-none',
          'rounded-2xl border transition-all duration-200',
          isActive
            ? 'border-[var(--accent)]/50 bg-[var(--accent)]/10'
            : 'border-white/[0.08] bg-[#0d1829]/80 hover:border-white/20 hover:bg-[#0d1829]'
        )}
        style={{
          left: node.x,
          top: node.y,
          width: 'auto',
          minWidth: 120,
          maxWidth: 220,
          backdropFilter: 'blur(12px)',
          boxShadow: isActive
            ? `0 0 20px 0 color-mix(in srgb, ${branchColor} 20%, transparent)`
            : '0 4px 24px rgba(0,0,0,0.3)',
        }}
        whileHover={reduceMotion ? undefined : { y: -1 }}
        whileTap={reduceMotion ? undefined : { scale: 0.98 }}
      >
        <div className="px-4 py-3 flex flex-col gap-1.5 relative pr-5">
          <div className="flex items-center justify-between gap-2">
            <span
              className="text-[9px] uppercase tracking-widest font-medium px-1.5 py-0.5
                         rounded-full"
              style={{
                color: branchColor,
                background: `color-mix(in srgb, ${branchColor} 12%, transparent)`,
              }}
            >
              {node.depth === 0 ? 'Root' : `Depth ${node.depth}`}
            </span>

            {node.isStreaming ? (
              <motion.div
                className="w-1.5 h-1.5 rounded-full"
                style={{ background: branchColor }}
                animate={reduceMotion ? { opacity: 0.8 } : { opacity: [0.4, 1, 0.4] }}
                transition={reduceMotion ? {} : { repeat: Infinity, duration: 1 }}
              />
            ) : (
              <div
                className="w-1.5 h-1.5 rounded-full opacity-40"
                style={{ background: branchColor }}
              />
            )}
          </div>

          {summaryLine}

          {node.childCount > 0 && (
            <p className="text-[10px] text-white/30">
              {node.childCount} branch{node.childCount > 1 ? 'es' : ''}
            </p>
          )}

          {node.masteryStars > 0 && (
            <div className="mt-0.5">
              <MasteryStars stars={node.masteryStars} size="sm" />
            </div>
          )}

          {dotColor && node.depth > 0 && (
            <div
              className="absolute bottom-3 right-3 w-1.5 h-1.5 rounded-full pointer-events-none"
              style={{ background: dotColor, width: 6, height: 6 }}
              aria-hidden
            />
          )}
        </div>

        <div
          className="h-[2px] rounded-b-2xl"
          style={{
            background: `linear-gradient(90deg, ${branchColor}50, transparent)`,
          }}
        />
      </motion.div>

      {menu && (
        <div
          className="fixed z-[60] min-w-[140px] rounded-xl border border-white/10 bg-[#0d1425] py-1 shadow-2xl"
          style={{ left: menu.x, top: menu.y }}
          role="menu"
          onClick={(e) => e.stopPropagation()}
        >
          <button
            type="button"
            className="w-full px-3 py-2 text-left text-xs text-white/70 hover:bg-white/[0.06]"
            onClick={() => {
              setMenu(null);
              onOpen();
            }}
          >
            Open
          </button>
          <button
            type="button"
            className="w-full px-3 py-2 text-left text-xs text-white/70 hover:bg-white/[0.06]"
            onClick={() => {
              setMenu(null);
              const next = window.prompt('Rename node question', node.prompt);
              if (next && next.trim()) renameNode(node.id, next.trim());
            }}
          >
            Rename
          </button>
          <button
            type="button"
            className="w-full px-3 py-2 text-left text-xs text-red-400/80 hover:bg-red-500/10"
            onClick={() => {
              setMenu(null);
              if (window.confirm('Delete this node and all nested branches?')) {
                deleteNodeBranch(node.id);
              }
            }}
          >
            Delete branch
          </button>
        </div>
      )}
    </>
  );
});

ChatNodeCard.displayName = 'ChatNodeCard';
export default ChatNodeCard;
