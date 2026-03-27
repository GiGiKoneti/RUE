import { create } from 'zustand';
import type { ChatNode, GraphEdge, ExtractedTerm } from '../types';

interface ExplorationState {
  // Graph
  nodes: Record<string, ChatNode>;
  edges: GraphEdge[];
  activeNodeId: string | null;
  rootNodeId: string | null;

  // Camera
  camX: number;
  camY: number;
  zoom: number;

  // UI
  isPanning: boolean;
  globalDepthLimit: number; // 0 = no limit

  // Actions — graph
  addRootNode: (node: ChatNode) => void;
  addChildNode: (parentId: string, node: ChatNode) => void;
  updateNodeResponse: (nodeId: string, response: string, terms: ExtractedTerm[], chain?: any) => void;
  setNodeStreaming: (nodeId: string, streaming: boolean) => void;
  toggleCollapse: (nodeId: string) => void;
  setNodeDimensions: (nodeId: string, w: number, h: number) => void;
  focusNode: (nodeId: string) => void;
  reset: () => void;

  // Actions — camera
  panBy: (dx: number, dy: number) => void;
  zoomBy: (delta: number, cx: number, cy: number) => void;
  setCam: (x: number, y: number, z: number) => void;
  setIsPanning: (v: boolean) => void;
  fitAll: () => void;

  // Actions — UI
  setGlobalDepthLimit: (n: number) => void;
}

let _nodeCounter = 0;
export function generateNodeId(): string {
  return `n_${Date.now()}_${++_nodeCounter}`;
}

const INITIAL: Pick<ExplorationState, 'nodes' | 'edges' | 'activeNodeId' | 'rootNodeId' | 'camX' | 'camY' | 'zoom' | 'isPanning' | 'globalDepthLimit'> = {
  nodes: {},
  edges: [],
  activeNodeId: null,
  rootNodeId: null,
  camX: 0,
  camY: 0,
  zoom: 1,
  isPanning: false,
  globalDepthLimit: 0,
};

export const useExplorationStore = create<ExplorationState>((set, get) => ({
  ...INITIAL,

  /* ─── Graph ─── */
  addRootNode: (node) =>
    set({
      nodes: { [node.id]: node },
      edges: [],
      activeNodeId: node.id,
      rootNodeId: node.id,
      camX: -node.x,
      camY: -node.y,
      zoom: 1,
    }),

  addChildNode: (parentId, node) => {
    const s = get();
    const parent = s.nodes[parentId];
    if (!parent) return;
    set({
      nodes: {
        ...s.nodes,
        [parentId]: { ...parent, childIds: [...parent.childIds, node.id] },
        [node.id]: node,
      },
      edges: [
        ...s.edges,
        { id: `e_${parentId}_${node.id}`, fromId: parentId, toId: node.id },
      ],
      activeNodeId: node.id,
      camX: -node.x,
      camY: -node.y,
      zoom: 1,
    });
  },

  updateNodeResponse: (nodeId, response, terms, chain) => {
    const s = get();
    const node = s.nodes[nodeId];
    if (!node) return;
    set({
      nodes: {
        ...s.nodes,
        [nodeId]: { ...node, response, extractedTerms: terms, contextChain: chain },
      },
    });
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

  setNodeDimensions: (nodeId, w, h) => {
    const s = get();
    const node = s.nodes[nodeId];
    if (!node) return;
    set({
      nodes: {
        ...s.nodes,
        [nodeId]: { ...node, width: w, height: h },
      },
    });
  },

  focusNode: (nodeId) => {
    const node = get().nodes[nodeId];
    if (!node) return;
    set({ activeNodeId: nodeId, camX: -node.x, camY: -node.y, zoom: 1 });
  },

  reset: () => set({ ...INITIAL }),

  /* ─── Camera ─── */
  panBy: (dx, dy) => {
    const s = get();
    set({ camX: s.camX + dx, camY: s.camY + dy });
  },

  zoomBy: (delta, cx, cy) => {
    const s = get();
    const newZoom = Math.min(2, Math.max(0.2, s.zoom + delta));
    const ratio = newZoom / s.zoom;
    set({
      zoom: newZoom,
      camX: cx - (cx - s.camX) * ratio,
      camY: cy - (cy - s.camY) * ratio,
    });
  },

  setCam: (x, y, z) => set({ camX: x, camY: y, zoom: z }),

  setIsPanning: (v) => set({ isPanning: v }),

  fitAll: () => {
    const s = get();
    const nodeList = Object.values(s.nodes);
    if (nodeList.length === 0) return;

    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    for (const n of nodeList) {
      const hw = (n.width || 420) / 2;
      const hh = (n.height || 200) / 2;
      if (n.x - hw < minX) minX = n.x - hw;
      if (n.x + hw > maxX) maxX = n.x + hw;
      if (n.y - hh < minY) minY = n.y - hh;
      if (n.y + hh > maxY) maxY = n.y + hh;
    }

    const w = maxX - minX + 200; // padding
    const h = maxY - minY + 200;
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const zoom = Math.min(2, Math.max(0.2, Math.min(vw / w, vh / h)));
    const cx = -(minX + maxX) / 2;
    const cy = -(minY + maxY) / 2;
    set({ camX: cx, camY: cy, zoom });
  },

  /* ─── UI ─── */
  setGlobalDepthLimit: (n) => set({ globalDepthLimit: n }),
}));
