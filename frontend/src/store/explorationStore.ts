import { create } from 'zustand';
import type { ChatNode, GraphEdge } from '../types';
import { calculateTreeLayout } from '../utils/treeLayout';
import { computeLearningPathNodes } from '../features/rue/lib/learningPath';

interface ExplorationState {
  // Graph
  nodes: Record<string, ChatNode>;
  edges: GraphEdge[];
  learningPath: ChatNode[];
  activeOutputNodeId: string | null;
  rootNodeId: string | null;
  currentSessionId: string | null;
  ripple: { x: number; y: number } | null;

  // Camera
  camX: number;
  camY: number;

  // UI
  isPanning: boolean;
  globalDepthLimit: number; // 0 = no limit

  // Actions — graph
  addRootNode: (prompt: string, x?: number, y?: number) => string;
  addChildNode: (parentId: string, prompt: string, terms: string[], isFollowUp?: boolean) => string;
  updateNodeResponse: (nodeId: string, response: string) => void;
  /** End of SSE stream: persist terms, stop streaming; summary filled via setNodeSummary */
  completeStreaming: (nodeId: string, terms: string[]) => void;
  /** Refine explorable terms after LLM curation (streaming already false). */
  setNodeTerms: (nodeId: string, terms: string[]) => void;
  setNodeSummary: (nodeId: string, summary: string) => void;
  /** Legacy single-shot finalize (uses completeStreaming + setNodeSummary pattern internally if needed) */
  finalizeNode: (nodeId: string, terms: string[], summary: string) => void;
  setNodeStreaming: (nodeId: string, streaming: boolean) => void;
  updateNodePosition: (nodeId: string, x: number, y: number) => void;
  updateNodeDimensions: (nodeId: string, width: number, height: number) => void;
  renameNode: (nodeId: string, prompt: string) => void;
  deleteNodeBranch: (nodeId: string) => void;
  toggleCollapse: (nodeId: string) => void;
  focusNode: (nodeId: string) => void;
  hydrateGraph: (payload: {
    nodes: Record<string, ChatNode>;
    edges: GraphEdge[];
    rootNodeId: string | null;
    sessionId?: string | null;
  }) => void;

  setSessionId: (id: string | null) => void;
  persistNode: (nodeId: string) => Promise<void>;

  // Socratic Tutor
  setMasteryStars: (nodeId: string, stars: number) => void;
  appendProbeMessage: (nodeId: string, msg: { role: 'tutor' | 'user'; content: string }) => void;
  /** Clear probe thread before a fresh run (start / retake) so store matches API history. */
  resetProbeHistory: (nodeId: string) => void;

  // Output Page Actions
  openOutputPage: (nodeId: string) => void;
  closeOutputPage: () => void;
  switchOutputNode: (nodeId: string) => void;

  setRipple: (pos: { x: number; y: number } | null) => void;
  reset: () => void;

  // Actions — camera
  panBy: (dx: number, dy: number) => void;
  setCam: (x: number, y: number) => void;
  setIsPanning: (v: boolean) => void;
  fitAll: () => void;

  // Actions — UI
  setGlobalDepthLimit: (n: number) => void;
}

let _nodeCounter = 0;
export function generateNodeId(): string {
  return `n_${Date.now()}_${++_nodeCounter}`;
}

const INITIAL: Pick<ExplorationState, 'nodes' | 'edges' | 'learningPath' | 'activeOutputNodeId' | 'rootNodeId' | 'currentSessionId' | 'camX' | 'camY' | 'isPanning' | 'globalDepthLimit' | 'ripple'> = {
  nodes: {},
  edges: [],
  learningPath: [],
  activeOutputNodeId: null,
  rootNodeId: null,
  currentSessionId: null,
  camX: 0,
  camY: 0,
  isPanning: false,
  globalDepthLimit: 0,
  ripple: null,
};

export const useExplorationStore = create<ExplorationState>((set, get) => ({
  ...INITIAL,

  _recomputeLayout: (nodes: Record<string, ChatNode>) => {
    const nodeArray = Object.values(nodes);
    const positions = calculateTreeLayout(nodeArray);
    const updatedNodes = { ...nodes };
    Object.keys(positions).forEach((id) => {
      if (updatedNodes[id]) {
        updatedNodes[id] = { ...updatedNodes[id], ...positions[id] };
      }
    });
    const learningPath = computeLearningPathNodes(updatedNodes);
    return { nodes: updatedNodes, learningPath };
  },

  /* ─── Graph ─── */
  addRootNode: (prompt, x = 0, y = 0) => {
    const id = generateNodeId();
    const node: ChatNode = {
      id,
      parentId: null,
      parentTerm: null,
      prompt,
      response: '',
      terms: [],
      summary: '',
      summaryPending: false,
      depth: 0,
      childCount: 0,
      x,
      y,
      isStreaming: true,
      isCollapsed: false,
      isFollowUp: false,
      localDepthLimit: null,
      masteryStars: 0,
      probeHistory: [],
    };
    const { nodes: nextNodes, learningPath: nextPath } = (get() as any)._recomputeLayout({ [id]: node });
    
    set({
      nodes: nextNodes,
      learningPath: nextPath,
      edges: [],
      activeOutputNodeId: id,
      rootNodeId: id,
      camX: 0,
      camY: 0,
    });
    return id;
  },

  addChildNode: (parentId, prompt, terms, isFollowUp = false) => {
    const s = get();
    const parent = s.nodes[parentId];
    if (!parent) return '';

    const id = generateNodeId();
    const angle = Math.random() * Math.PI * 2;
    const dist = 300 + Math.random() * 100;
    const x = parent.x + Math.cos(angle) * dist;
    const y = parent.y + Math.sin(angle) * dist;

    const node: ChatNode = {
      id,
      parentId,
      parentTerm: terms[0] || null, // for multi-term, we pick first as label context
      prompt,
      response: '',
      terms: [],
      summary: '',
      summaryPending: false,
      depth: parent.depth + 1,
      childCount: 0,
      x,
      y,
      isStreaming: true,
      isCollapsed: false,
      isFollowUp,
      localDepthLimit: null,
      masteryStars: 0,
      probeHistory: [],
    };

    const nextNodesBeforeLayout = {
      ...s.nodes,
      [parentId]: { ...parent, childCount: parent.childCount + 1 },
      [id]: node,
    };

    const { nodes: nextNodes, learningPath: nextPath } = (get() as any)._recomputeLayout(nextNodesBeforeLayout);

    set({
      nodes: nextNodes,
      learningPath: nextPath,
      edges: [
        ...s.edges,
        { id: `e_${parentId}_${id}`, fromId: parentId, toId: id },
      ],
      activeOutputNodeId: id,
      camX: -nextNodes[id].x,
      camY: -nextNodes[id].y,
    });
    return id;
  },

  updateNodeResponse: (nodeId, response) => {
    const s = get();
    const node = s.nodes[nodeId];
    if (!node) return;
    set({
      nodes: {
        ...s.nodes,
        [nodeId]: { ...node, response },
      },
    });
  },

  completeStreaming: (nodeId, terms) => {
    const s = get();
    const node = s.nodes[nodeId];
    if (!node) return;
    set({
      nodes: {
        ...s.nodes,
        [nodeId]: { ...node, terms, isStreaming: false, summaryPending: true },
      },
    });
  },

  setNodeTerms: (nodeId, terms) => {
    const s = get();
    const node = s.nodes[nodeId];
    if (!node) return;
    set({
      nodes: {
        ...s.nodes,
        [nodeId]: { ...node, terms },
      },
    });
  },

  setNodeSummary: (nodeId, summary) => {
    const s = get();
    const node = s.nodes[nodeId];
    if (!node) return;
    set({
      nodes: {
        ...s.nodes,
        [nodeId]: { ...node, summary, summaryPending: false },
      },
    });
  },

  finalizeNode: (nodeId, terms, summary) => {
    const s = get();
    const node = s.nodes[nodeId];
    if (!node) return;
    set({
      nodes: {
        ...s.nodes,
        [nodeId]: {
          ...node,
          terms,
          summary,
          isStreaming: false,
          summaryPending: false,
        },
      },
    });
  },

  setMasteryStars: (nodeId, stars) => {
    const s = get();
    const node = s.nodes[nodeId];
    if (!node) return;
    set({
      nodes: {
        ...s.nodes,
        [nodeId]: { ...node, masteryStars: stars },
      },
    });
  },

  appendProbeMessage: (nodeId, msg) => {
    const s = get();
    const node = s.nodes[nodeId];
    if (!node) return;
    set({
      nodes: {
        ...s.nodes,
        [nodeId]: { ...node, probeHistory: [...node.probeHistory, msg] },
      },
    });
  },

  resetProbeHistory: (nodeId) => {
    const s = get();
    const node = s.nodes[nodeId];
    if (!node) return;
    set({
      nodes: {
        ...s.nodes,
        [nodeId]: { ...node, probeHistory: [] },
      },
    });
  },

  updateNodePosition: (nodeId: string, x: number, y: number) => {
    const s = get();
    const node = s.nodes[nodeId];
    if (!node) return;
    set({
      nodes: {
        ...s.nodes,
        [nodeId]: { ...node, x, y },
      },
    });
  },

  updateNodeDimensions: (nodeId: string, width: number, height: number) => {
    const s = get();
    const node = s.nodes[nodeId];
    if (!node) return;
    if (node.width === width && node.height === height) return;
    set({
      nodes: {
        ...s.nodes,
        [nodeId]: { ...node, width, height },
      },
    });
  },

  renameNode: (nodeId, prompt) => {
    const s = get();
    const node = s.nodes[nodeId];
    if (!node) return;
    set({
      nodes: {
        ...s.nodes,
        [nodeId]: { ...node, prompt },
      },
    });
  },

  deleteNodeBranch: (nodeId) => {
    const s = get();
    const root = s.nodes[nodeId];
    if (!root) return;

    const toDelete = new Set<string>();
    const stack = [nodeId];
    while (stack.length > 0) {
      const id = stack.pop();
      if (!id || toDelete.has(id)) continue;
      toDelete.add(id);
      for (const n of Object.values(s.nodes)) {
        if (n.parentId === id) stack.push(n.id);
      }
    }

    const parentId = root.parentId;
    const nextNodes = { ...s.nodes };
    toDelete.forEach((id) => {
      delete nextNodes[id];
    });
    if (parentId && nextNodes[parentId]) {
      const p = nextNodes[parentId];
      nextNodes[parentId] = { ...p, childCount: Math.max(0, p.childCount - 1) };
    }

    const nextEdges = s.edges.filter(
      (e) => !toDelete.has(e.fromId) && !toDelete.has(e.toId)
    );

    let nextRoot = s.rootNodeId;
    if (toDelete.has(s.rootNodeId ?? '')) {
      nextRoot = null;
    }

    let nextActive = s.activeOutputNodeId;
    if (nextActive && toDelete.has(nextActive)) {
      nextActive = parentId && nextNodes[parentId] ? parentId : null;
    }

    const { nodes: finalNodes, learningPath: finalPath } = (get() as any)._recomputeLayout(nextNodes);

    set({
      nodes: finalNodes,
      learningPath: finalPath,
      edges: nextEdges,
      rootNodeId: nextRoot,
      activeOutputNodeId: nextActive,
    });
  },

  hydrateGraph: ({ nodes, edges, rootNodeId, sessionId }) => {
    const { nodes: layoutNodes, learningPath } = (get() as any)._recomputeLayout(nodes);
    set({
      nodes: layoutNodes,
      edges,
      learningPath,
      rootNodeId,
      currentSessionId: sessionId ?? null,
      activeOutputNodeId: null,
      camX: 0,
      camY: 0,
      ripple: null,
    });
  },

  setSessionId: (id) => set({ currentSessionId: id }),


  persistNode: async (nodeId) => {
    const s = get();
    const node = s.nodes[nodeId];
    if (!node || !s.currentSessionId) return;

    const payload = {
      nodeId: node.id,
      parentId: node.parentId,
      parentTerm: node.parentTerm,
      prompt: node.prompt,
      response: node.response,
      terms: node.terms,
      summary: node.summary,
      position: { x: node.x, y: node.y },
      depth: node.depth,
      childCount: node.childCount,
      isFollowUp: node.isFollowUp,
    };

    try {
      await fetch(`/api/saiki/sessions/${s.currentSessionId}/nodes`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
    } catch (err) {
      console.error('Failed to persist node:', err);
    }
  },

  setNodeStreaming: (nodeId, streaming) => {
    const s = get();
    const node = s.nodes[nodeId];
    if (!node) return;
    set({
      nodes: {
        ...s.nodes,
        [nodeId]: { ...node, isStreaming: streaming },
      },
    });
  },

  toggleCollapse: (nodeId) => {
    const s = get();
    const node = s.nodes[nodeId];
    if (!node) return;
    set({
      nodes: {
        ...s.nodes,
        [nodeId]: { ...node, isCollapsed: !node.isCollapsed },
      },
    });
  },

  focusNode: (nodeId: string) => {
    const node = get().nodes[nodeId];
    if (!node) return;
    set({ camX: -node.x, camY: -node.y });
  },

  /* ─── Output Page Actions ─── */
  openOutputPage: (nodeId) => set({ activeOutputNodeId: nodeId }),
  closeOutputPage: () => set({ activeOutputNodeId: null }),
  switchOutputNode: (nodeId) => {
    set({ activeOutputNodeId: nodeId });
  },

  setRipple: (pos) => set({ ripple: pos }),
  reset: () => set({ ...INITIAL }),

  /* ─── Camera ─── */
  panBy: (dx, dy) => {
    const s = get();
    set({ camX: s.camX + dx, camY: s.camY + dy });
  },

  setCam: (x, y) => set({ camX: x, camY: y }),
  setIsPanning: (v) => set({ isPanning: v }),

  fitAll: () => {
    const s = get();
    const nodeList = Object.values(s.nodes);
    if (nodeList.length === 0) return;

    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    for (const n of nodeList) {
      if (n.x < minX) minX = n.x;
      if (n.x > maxX) maxX = n.x;
      if (n.y < minY) minY = n.y;
      if (n.y > maxY) maxY = n.y;
    }

    set({ camX: -(minX + maxX) / 2, camY: -(minY + maxY) / 2 });
  },

  /* ─── UI ─── */
  setGlobalDepthLimit: (n) => set({ globalDepthLimit: n }),
}));
