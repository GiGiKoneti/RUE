import { useEffect, useState } from 'react';
import clsx from 'clsx';
import { AnimatePresence } from 'framer-motion';
import { useExplorationStore } from './store/explorationStore';
import { getJudgeDemoStarter } from './data/judgeDemoStarter';
import { useSessionStore } from './store/sessionStore';
import { useSettingsStore } from './store/settingsStore';
import { useSaiki } from './hooks/useSaiki';
import MagicRings from './components/MagicRings';
import QueryInput from './components/QueryInput';
import CanvasViewport from './components/CanvasViewport';
import Sidebar from './components/Sidebar';
import SidebarToggle from './components/SidebarToggle';
import ProfilePanel from './components/ProfilePanel';
import FloatingToolbar from './components/FloatingToolbar';
import { OutputPage } from './components/OutputPage';
import Minimap from './components/Minimap';

function App() {
  const { rootNodeId, nodes, activeOutputNodeId } = useExplorationStore();
  const { loadSession, sidebarOpen, setSidebarOpen, createSession } = useSessionStore();
  const { askQuestion } = useSaiki();
  const { initSettings } = useSettingsStore();
  const [isProfileOpen, setIsProfileOpen] = useState(false);

  useEffect(() => {
    initSettings();
  }, [initSettings]);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get('demo') === '1' || params.get('judge') === '1') {
      const starter = getJudgeDemoStarter();
      useExplorationStore.getState().hydrateGraph({
        nodes: starter.nodes,
        edges: starter.edges,
        rootNodeId: starter.rootNodeId,
        sessionId: null,
      });
      params.delete('demo');
      params.delete('judge');
      const q = params.toString();
      window.history.replaceState({}, '', q ? `?${q}` : window.location.pathname);
      return;
    }
    const sessionId = params.get('session');
    if (sessionId) {
      void loadSession(sessionId);
    }
  }, [loadSession]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'b') {
        e.preventDefault();
        setSidebarOpen(!sidebarOpen);
      }
      if ((e.metaKey || e.ctrlKey) && e.key === 'n') {
        e.preventDefault();
        createSession('');
      }
      if ((e.metaKey || e.ctrlKey) && e.key === 'p') {
        e.preventDefault();
        setIsProfileOpen((prev) => !prev);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [sidebarOpen, setSidebarOpen, createSession]);

  const isExploring = rootNodeId !== null;
  const anyStreaming = Object.values(nodes).some((n) => n.isStreaming);

  return (
    <div className="relative w-full min-h-screen bg-[#0b1326] overflow-hidden">
      {/* Background Decor */}
      <div className="fixed inset-0 z-0 opacity-40 pointer-events-none">
        <MagicRings
          color="var(--accent)"
          colorTwo="#a078ff"
          opacity={0.35}
          followMouse={false}
          speed={0.5}
          ringCount={3}
          attenuation={14}
          blur={2}
        />
      </div>

      {/* DASHBOARD: Initial State */}
      <AnimatePresence mode="wait">
        {!isExploring && (
          <div className={`flex-1 relative min-h-screen transition-all duration-300 ${sidebarOpen ? 'ml-[280px]' : 'ml-0'}`}>
            <QueryInput onSubmit={askQuestion} isLoading={anyStreaming} />
          </div>
        )}
      </AnimatePresence>

      {/* EXPLORATION: Canvas View */}
      {isExploring && (
        <main
          className={clsx(
            'flex-1 relative h-screen transition-all duration-300',
            sidebarOpen ? 'ml-[280px]' : 'ml-0',
            activeOutputNodeId && 'max-md:invisible max-md:pointer-events-none'
          )}
        >
          <CanvasViewport />
        </main>
      )}

      {/* Overlay Interfaces */}
      <Sidebar onOpenProfile={() => setIsProfileOpen(true)} />
      <SidebarToggle />
      <ProfilePanel isOpen={isProfileOpen} onClose={() => setIsProfileOpen(false)} />
      
      <FloatingToolbar />
      <Minimap />

      {/* The Central Content Drawer */}
      <OutputPage />
    </div>
  );
}

export default App;
