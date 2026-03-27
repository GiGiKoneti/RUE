import { motion } from 'framer-motion';
import { useExplorationStore } from '../store/explorationStore';

export default function EdgeLines() {
  const { edges, nodes } = useExplorationStore();

  return (
    <svg
      className="absolute pointer-events-none"
      style={{ overflow: 'visible', left: 0, top: 0, width: 1, height: 1 }}
    >
      <defs>
        <linearGradient id="edgeGrad" x1="0%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%" stopColor="#d0bcff" stopOpacity="0.4" />
          <stop offset="100%" stopColor="#a078ff" stopOpacity="0.15" />
        </linearGradient>
      </defs>
      {edges.map((edge) => {
        const from = nodes[edge.fromId];
        const to = nodes[edge.toId];
        if (!from || !to) return null;

        // Bottom-center of parent → Top-center of child
        const x1 = from.x;
        const y1 = from.y + (from.height || 200) / 2;
        const x2 = to.x;
        const y2 = to.y - (to.height || 200) / 2;

        const midY = (y1 + y2) / 2;
        const d = `M ${x1} ${y1} C ${x1} ${midY}, ${x2} ${midY}, ${x2} ${y2}`;

        return (
          <motion.path
            key={edge.id}
            d={d}
            fill="none"
            stroke="url(#edgeGrad)"
            strokeWidth={1.5}
            strokeDasharray="4 4"
            initial={{ pathLength: 0, opacity: 0 }}
            animate={{ pathLength: 1, opacity: 1 }}
            transition={{ duration: 0.4, ease: 'easeInOut' }}
          />
        );
      })}
    </svg>
  );
}
