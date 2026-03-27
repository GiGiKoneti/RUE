import { useRef, useCallback, useEffect } from 'react';
import { motion, useAnimation } from 'framer-motion';
import { AnimatePresence } from 'framer-motion';
import { Minimize2 } from 'lucide-react';
import { useExplorationStore } from '../store/explorationStore';
import ChatNodeCard from './ChatNode';
import EdgeLines from './EdgeLines';

interface CanvasViewportProps {
  onExploreTerm: (term: string, nodeId: string) => void;
}

export default function CanvasViewport({ onExploreTerm }: CanvasViewportProps) {
  const {
    nodes, activeNodeId,
    camX, camY, zoom,
    panBy, zoomBy, setIsPanning, isPanning, fitAll,
  } = useExplorationStore();

  const canvasRef = useRef<HTMLDivElement>(null);
  const panStartRef = useRef<{ x: number; y: number } | null>(null);
  const controls = useAnimation();

  const nodeList = Object.values(nodes);

  // Sync Framer Motion animation with Zustand camera state
  useEffect(() => {
    controls.start({
      x: camX,
      y: camY,
      scale: zoom,
    });
  }, [camX, camY, zoom, controls]);

  /* ─── Pan handlers ─── */
  const handlePointerDown = useCallback((e: React.PointerEvent) => {
    // Only pan on empty canvas (not on nodes)
    if ((e.target as HTMLElement).closest('[data-node]')) return;
    panStartRef.current = { x: e.clientX, y: e.clientY };
    setIsPanning(true);
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
  }, [setIsPanning]);

  const handlePointerMove = useCallback((e: React.PointerEvent) => {
    if (!panStartRef.current) return;
    const dx = e.clientX - panStartRef.current.x;
    const dy = e.clientY - panStartRef.current.y;
    panStartRef.current = { x: e.clientX, y: e.clientY };
    panBy(dx / zoom, dy / zoom);
  }, [panBy, zoom]);

  const handlePointerUp = useCallback(() => {
    panStartRef.current = null;
    setIsPanning(false);
  }, [setIsPanning]);

  /* ─── Zoom handler (Native for passive: false) ─── */
  useEffect(() => {
    const el = canvasRef.current;
    if (!el) return;
    
    const handleNativeWheel = (e: WheelEvent) => {
      e.preventDefault();
      const delta = -e.deltaY * 0.001;
      zoomBy(delta, 0, 0);
    };
    
    el.addEventListener('wheel', handleNativeWheel, { passive: false });
    return () => el.removeEventListener('wheel', handleNativeWheel);
  }, [zoomBy]);

  return (
    <div
      ref={canvasRef}
      className="fixed inset-0 overflow-hidden"
      style={{ cursor: isPanning ? 'grabbing' : 'grab' }}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerUp}
    >
      <motion.div
        animate={controls}
        transition={{
          type: 'spring',
          stiffness: 180,
          damping: 28,
        }}
        className="absolute w-0 h-0"
        style={{
          left: '50%',
          top: '50%',
        }}
      >
        {/* Edges */}
        <EdgeLines />

        {/* Nodes */}
        <AnimatePresence>
          {nodeList.map((node) => (
            <ChatNodeCard
              key={node.id}
              node={node}
              isActive={node.id === activeNodeId}
              onExploreTerm={onExploreTerm}
              onFollowUp={(nId, q) => onExploreTerm(q, nId)}
            />
          ))}
        </AnimatePresence>
      </motion.div>

      {/* Zoom-to-fit button */}
      {nodeList.length > 1 && (
        <button
          onClick={fitAll}
          className="fixed top-6 right-6 z-50 w-10 h-10 flex items-center justify-center rounded-xl
                     bg-[#131b2e]/80 backdrop-blur-xl border border-[#494454]/15
                     text-[#dae2fd]/50 hover:text-[#d0bcff] transition-colors"
          title="Fit all nodes"
        >
          <Minimize2 size={16} />
        </button>
      )}
    </div>
  );
}
