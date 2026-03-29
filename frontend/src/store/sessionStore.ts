import { create } from 'zustand';
import { useExplorationStore } from './explorationStore';
import type { ChatNode, GraphEdge } from '../types';

export interface SessionMeta {
  id: string;
  title: string;
  rootPrompt: string;
  createdAt: string;
  updatedAt: string;
  nodeCount: number;
  previewTerms: string[];
  explorationSummary?: string;
  isFavorited: boolean;
  tags: string[];
  divergenceDiverging?: number;
  divergenceConverging?: number;
}

interface RawSaikiNodeDoc {
  nodeId: string;
  parentId?: string | null;
  parentTerm?: string | null;
  prompt: string;
  response?: string;
  terms?: string[];
  summary?: string;
  position?: { x?: number; y?: number };
  depth?: number;
  childCount?: number;
  isFollowUp?: boolean;
  masteryStars?: number;
  probeHistory?: { role: 'tutor' | 'user'; content: string }[];
}

interface SessionState {
  sessions: SessionMeta[];
  activeSessionId: string | null;
  sidebarOpen: boolean;
  searchQuery: string;
  stats: { sessionCount: number; totalNodes: number } | null;

  setSidebarOpen: (isOpen: boolean) => void;
  setSearchQuery: (q: string) => void;
  setActiveSessionId: (id: string | null) => void;

  fetchSessions: () => Promise<void>;
  fetchStats: () => Promise<void>;
  createSession: (rootPrompt: string) => Promise<string>;
  loadSession: (sessionId: string) => Promise<void>;
  updateSession: (sessionId: string, updates: Partial<SessionMeta>) => Promise<void>;
  deleteSession: (sessionId: string) => Promise<void>;
  requestExplorationSummary: (sessionId: string | null) => void;
}

export const useSessionStore = create<SessionState>((set, get) => ({
  sessions: [],
  activeSessionId: null,
  sidebarOpen: true,
  searchQuery: '',
  stats: null,

  setSidebarOpen: (isOpen) => set({ sidebarOpen: isOpen }),
  setSearchQuery: (q) => set({ searchQuery: q }),
  setActiveSessionId: (id) => {
    set({ activeSessionId: id });
    if (id) {
      window.history.pushState({}, '', `?session=${id}`);
    } else {
      window.history.pushState({}, '', window.location.pathname);
    }
  },

  requestExplorationSummary: (sessionId) => {
    if (!sessionId) return;
    void fetch(`/api/saiki/sessions/${sessionId}/summarize`, { method: 'POST' })
      .then(() => {
        void get().fetchSessions();
      })
      .catch(() => {});
  },

  fetchSessions: async () => {
    try {
      const res = await fetch('/api/saiki/sessions');
      if (res.ok) {
        const sessions = (await res.json()) as SessionMeta[];
        set({ sessions });
      }
    } catch (err) {
      console.error('Failed to fetch sessions', err);
    }
  },

  createSession: async (rootPrompt) => {
    try {
      const res = await fetch('/api/saiki/sessions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rootPrompt }),
      });
      const data = (await res.json()) as { sessionId?: string; error?: string };
      if (!data.sessionId) throw new Error(data.error || 'No session id');
      await get().fetchSessions();
      get().setActiveSessionId(data.sessionId);
      useExplorationStore.getState().reset();
      return data.sessionId;
    } catch (err) {
      console.error('Failed to create session', err);
      return '';
    }
  },

  loadSession: async (sessionId) => {
    try {
      const res = await fetch(`/api/saiki/sessions/${sessionId}`);
      if (!res.ok) return;
      const prevId = get().activeSessionId;
      const exploreSnapshot = useExplorationStore.getState();
      const nodeCount = Object.keys(exploreSnapshot.nodes).length;
      if (prevId && prevId !== sessionId && nodeCount >= 3) {
        get().requestExplorationSummary(prevId);
      }

      const body = (await res.json()) as { session?: unknown; nodes: RawSaikiNodeDoc[] };
      const rawNodes = body.nodes ?? [];
      get().setActiveSessionId(sessionId);

      const exploreStore = useExplorationStore.getState();
      exploreStore.reset();

      const records: Record<string, ChatNode> = {};
      const edges: GraphEdge[] = [];

      for (const raw of rawNodes) {
        const id = raw.nodeId;
        records[id] = {
          id,
          parentId: raw.parentId ?? null,
          parentTerm: raw.parentTerm ?? null,
          prompt: raw.prompt,
          response: raw.response ?? '',
          terms: Array.isArray(raw.terms) ? raw.terms : [],
          summary: raw.summary ?? '',
          summaryPending: false,
          depth: raw.depth ?? 0,
          childCount: 0,
          x: raw.position?.x ?? 0,
          y: raw.position?.y ?? 0,
          isStreaming: false,
          isCollapsed: false,
          isFollowUp: Boolean(raw.isFollowUp),
          localDepthLimit: null,
          masteryStars: typeof raw.masteryStars === 'number' ? raw.masteryStars : 0,
          probeHistory: Array.isArray(raw.probeHistory) ? raw.probeHistory : [],
        };
      }

      for (const raw of rawNodes) {
        const id = raw.nodeId;
        const pid = raw.parentId;
        if (pid && records[pid]) {
          edges.push({ id: `e_${pid}_${id}`, fromId: pid, toId: id });
          records[pid].childCount += 1;
        }
      }

      const rootNodeId =
        Object.values(records).find((n) => n.parentId === null && n.depth === 0)?.id ??
        Object.values(records).find((n) => n.parentId === null)?.id ??
        null;

      exploreStore.hydrateGraph({ nodes: records, edges, rootNodeId, sessionId });
      exploreStore.fitAll();
    } catch (err) {
      console.error('Failed to load session', err);
    }
  },

  fetchStats: async () => {
    try {
      const res = await fetch('/api/saiki/stats');
      if (res.ok) {
        set({ stats: await res.json() });
      }
    } catch (err) {
      console.error('Failed to fetch stats', err);
    }
  },

  updateSession: async (sessionId, updates) => {
    try {
      await fetch(`/api/saiki/sessions/${sessionId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updates),
      });
      await get().fetchSessions();
      get().fetchStats();
    } catch (err) {
      console.error('Failed to update session', err);
    }
  },

  deleteSession: async (sessionId) => {
    try {
      await fetch(`/api/saiki/sessions/${sessionId}`, { method: 'DELETE' });
      await get().fetchSessions();
      if (get().activeSessionId === sessionId) {
        get().setActiveSessionId(null);
        useExplorationStore.getState().reset();
      }
    } catch (err) {
      console.error('Failed to delete session', err);
    }
  },
}));
