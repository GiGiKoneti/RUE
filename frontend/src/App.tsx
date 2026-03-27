import { AnimatePresence } from 'framer-motion';
import { useExplorationStore } from './store/explorationStore';
import { useRUE } from './hooks/useRUE';
import MagicRings from './components/MagicRings';
import QueryInput from './components/QueryInput';
import CanvasViewport from './components/CanvasViewport';
import BreadcrumbTrail from './components/BreadcrumbTrail';

function App() {
  const { rootNodeId, nodes } = useExplorationStore();
  const { askQuestion, exploreTerm } = useRUE();

  const isExploring = rootNodeId !== null;
  const anyStreaming = Object.values(nodes).some((n) => n.isStreaming);

  return (
    <div className="relative w-full min-h-screen bg-[#0b1326] overflow-hidden">
      {/* Background */}
      <div className="fixed inset-0 z-0 opacity-40 pointer-events-none">
        <MagicRings
          color="#d0bcff"
          colorTwo="#a078ff"
          opacity={0.35}
          followMouse={false}
          speed={0.5}
          ringCount={3}
          attenuation={14}
          blur={2}
        />
      </div>

      {/* STATE 1: Empty Dashboard */}
      <AnimatePresence mode="wait">
        {!isExploring && (
          <QueryInput onSubmit={askQuestion} isLoading={anyStreaming} />
        )}
      </AnimatePresence>

      {/* STATE 2 & 3: Canvas Exploration */}
      {isExploring && (
        <>
          <CanvasViewport onExploreTerm={exploreTerm} />
          <BreadcrumbTrail />
        </>
      )}

      {/* Reset Button */}
      {isExploring && (
        <button
          onClick={() => useExplorationStore.getState().reset()}
          className="fixed bottom-6 left-6 z-50 px-4 py-2.5 rounded-xl text-xs font-medium
                     bg-[#131b2e]/80 backdrop-blur-xl border border-[#494454]/15
                     text-[#dae2fd]/50 hover:text-[#d0bcff] transition-colors"
        >
          ← New Question
        </button>
      )}
    </div>
  );
}

export default App;
