import { motion } from 'framer-motion';
import { useExplorationStore } from '../store/explorationStore';

export default function BreadcrumbTrail() {
  const { nodes, activeNodeId, focusNode } = useExplorationStore();

  // Build path from root to active node
  if (!activeNodeId) return null;

  const path: string[] = [];
  let current = nodes[activeNodeId];
  while (current) {
    path.unshift(current.id);
    current = current.parentId ? nodes[current.parentId] : undefined!;
  }

  if (path.length <= 1) return null;

  return (
    <motion.div
      initial={{ opacity: 0, y: -12 }}
      animate={{ opacity: 1, y: 0 }}
      className="fixed top-6 left-6 z-50 flex items-center gap-1.5 px-4 py-2.5 rounded-2xl
                 bg-[#131b2e]/80 backdrop-blur-xl border border-[#494454]/15 max-w-[60vw] overflow-x-auto"
    >
      {path.map((nodeId, idx) => {
        const node = nodes[nodeId];
        if (!node) return null;
        const isLast = idx === path.length - 1;

        // For root, show the prompt; for children, extract term from prompt
        let label: string;
        if (node.depth === 0) {
          label = node.prompt.length > 28 ? node.prompt.slice(0, 28) + '…' : node.prompt;
        } else {
          const match = node.prompt.match(/^Explain "(.+?)" in the context/);
          label = match ? match[1] : node.prompt.slice(0, 20);
        }

        return (
          <span key={nodeId} className="flex items-center gap-1.5 flex-shrink-0">
            {idx > 0 && (
              <svg className="w-3 h-3 text-[#494454]/60 flex-shrink-0" viewBox="0 0 16 16" fill="none">
                <path d="M6 4l4 4-4 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
              </svg>
            )}
            <button
              onClick={() => !isLast && focusNode(nodeId)}
              className={`text-sm transition-all duration-200 whitespace-nowrap
                ${isLast
                  ? 'text-[#d0bcff] font-semibold cursor-default'
                  : 'text-[#dae2fd]/50 hover:text-[#d0bcff]/80 cursor-pointer'
                }
              `}
            >
              {label}
            </button>
          </span>
        );
      })}
    </motion.div>
  );
}
