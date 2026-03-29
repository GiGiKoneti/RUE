import { motion } from 'framer-motion';
import { useExplorationStore } from '../store/explorationStore';

const BRANCH_COLORS = [
  '#d0bcff', // accent (violet)
  '#7dd3fc', // sky
  '#86efac', // emerald
  '#fbbf24', // amber
  '#f472b6', // pink
];

const getBranchColor = (depth: number) => {
  return BRANCH_COLORS[depth % BRANCH_COLORS.length];
};

export default function EdgeOverlay() {
  const { edges, nodes } = useExplorationStore();

  return (
    <svg
      className="absolute pointer-events-none z-[10]"
      style={{ overflow: 'visible', width: 1, height: 1 }}
    >
      <defs>
        <filter id="glow" x="-20%" y="-20%" width="140%" height="140%">
          <feGaussianBlur stdDeviation="3" result="blur" />
          <feComposite in="SourceGraphic" in2="blur" operator="over" />
        </filter>
      </defs>

      {edges.map((edge) => {
        const from = nodes[edge.fromId];
        const to = nodes[edge.toId];
        if (!from || !to) return null;

        // Use reported dimensions or fallback to estimates
        const fromW = from.width || 200;
        const fromH = from.height || 80;
        const toW = to.width || 200;

        // From bottom-center
        const x1 = from.x + fromW / 2;
        const y1 = from.y + fromH;

        // To top-center
        const x2 = to.x + toW / 2;
        const y2 = to.y;

        const dy = y2 - y1;
        const cp1x = x1;
        const cp1y = y1 + dy * 0.5;
        const cp2x = x2;
        const cp2y = y1 + dy * 0.5;

        const d = `M ${x1} ${y1} C ${cp1x} ${cp1y}, ${cp2x} ${cp2y}, ${x2} ${y2}`;
        const color = getBranchColor(to.depth);

        return (
          <g key={edge.id}>
            {/* Background glow path */}
            <motion.path
              d={d}
              fill="none"
              stroke={color}
              strokeWidth={8}
              strokeOpacity={0.05}
              initial={{ pathLength: 0 }}
              animate={{ pathLength: 1 }}
              transition={{ duration: 0.8, ease: "easeOut" }}
            />
            
            {/* Main connection path */}
            <motion.path
              d={d}
              fill="none"
              stroke={color}
              strokeWidth={1.5}
              strokeOpacity={0.3}
              initial={{ pathLength: 0 }}
              animate={{ pathLength: 1 }}
              transition={{ duration: 1, ease: "easeInOut" }}
            />

            {/* Flow dot animation */}
            <motion.circle
              r={2}
              fill={color}
              style={{ filter: 'url(#glow)' }}
            >
              <animateMotion
                path={d}
                dur="3s"
                repeatCount="indefinite"
                begin="0s"
              />
            </motion.circle>

            <motion.circle
              r={1.5}
              fill={color}
              style={{ filter: 'url(#glow)' }}
              opacity={0.6}
            >
              <animateMotion
                path={d}
                dur="3s"
                repeatCount="indefinite"
                begin="1s"
              />
            </motion.circle>
          </g>
        );
      })}
    </svg>
  );
}
