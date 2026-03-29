/**
 * Learning-path DAG for RUE mind-map exploration.
 *
 * Semantics: an edge `nodeId` → depends on → `prereqId` means “finish `prereqId` before `nodeId`”.
 * - Structural: each parent synthesis assumes its direct child drills; children come before parent
 *   (leaves-to-root along branches).
 * - Term overlap: if B’s answer references A’s extracted terms, A comes before B (non-ancestor pairs only).
 * Topological order uses Kahn with tie-break: higher `depth` first, then stable `id`.
 */
import type { ChatNode } from '../../../types';

export type RUENode = ChatNode;

export interface Prerequisite {
  nodeId: string;
  prereqId: string;
  reason: 'term_overlap' | 'structural' | 'prompt_reference';
  overlappingTerms: string[];
  confidence: number;
}

export interface LearningPathResult {
  orderedIds: string[];
  prerequisites: Prerequisite[];
  nodeMetadata: Record<
    string,
    {
      complexity: number;
      isFoundational: boolean;
      unlocks: string[];
    }
  >;
}

function isAncestor(
  potentialAncestor: string,
  nodeId: string,
  nodes: Record<string, RUENode>
): boolean {
  let current: RUENode | undefined = nodes[nodeId];
  while (current?.parentId) {
    if (current.parentId === potentialAncestor) return true;
    current = nodes[current.parentId];
  }
  return false;
}

function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function deduplicatePrereqs(prereqs: Prerequisite[]): Prerequisite[] {
  const map = new Map<string, Prerequisite>();
  prereqs.forEach((p) => {
    const key = `${p.nodeId}__${p.prereqId}`;
    const existing = map.get(key);
    if (!existing || p.confidence > existing.confidence) map.set(key, p);
  });
  return Array.from(map.values());
}

function cmpTopoId(a: string, b: string, nodes: Record<string, RUENode>): number {
  const da = nodes[a]?.depth ?? 0;
  const db = nodes[b]?.depth ?? 0;
  if (db !== da) return db - da;
  return a.localeCompare(b);
}

function kahnAllNodesReachable(
  prereqs: Prerequisite[],
  ids: string[],
  nodes: Record<string, RUENode>
): boolean {
  const inDegree: Record<string, number> = {};
  const adj: Record<string, string[]> = {};
  for (const id of ids) {
    inDegree[id] = 0;
    adj[id] = [];
  }
  for (const p of prereqs) {
    inDegree[p.nodeId]++;
    adj[p.prereqId].push(p.nodeId);
  }
  const queue = ids.filter((id) => inDegree[id] === 0);
  let seen = 0;
  while (queue.length > 0) {
    queue.sort((a, b) => cmpTopoId(a, b, nodes));
    const c = queue.shift()!;
    seen++;
    for (const d of adj[c] ?? []) {
      inDegree[d]--;
      if (inDegree[d] === 0) queue.push(d);
    }
  }
  return seen === ids.length;
}

function breakTermOverlapCycles(
  prereqs: Prerequisite[],
  nodeList: RUENode[],
  nodes: Record<string, RUENode>
): Prerequisite[] {
  const ids = nodeList.map((n) => n.id);
  let edges = [...prereqs];

  while (!kahnAllNodesReachable(edges, ids, nodes)) {
    const candidates = edges
      .filter((e) => e.reason === 'term_overlap')
      .sort((a, b) => a.confidence - b.confidence);
    if (candidates.length === 0) break;
    const drop = candidates[0];
    edges = edges.filter(
      (e) =>
        !(
          e.nodeId === drop.nodeId &&
          e.prereqId === drop.prereqId &&
          e.reason === 'term_overlap'
        )
    );
  }
  return edges;
}

function kahnOrder(
  acyclicPrereqs: Prerequisite[],
  nodeList: RUENode[],
  nodes: Record<string, RUENode>
): string[] {
  const ids = nodeList.map((n) => n.id);
  const inDegree: Record<string, number> = {};
  const dependents: Record<string, Set<string>> = {};
  for (const id of ids) {
    inDegree[id] = 0;
    dependents[id] = new Set();
  }
  for (const p of acyclicPrereqs) {
    dependents[p.prereqId].add(p.nodeId);
    inDegree[p.nodeId]++;
  }

  const queue = nodeList
    .filter((n) => inDegree[n.id] === 0)
    .sort((a, b) => cmpTopoId(a.id, b.id, nodes))
    .map((n) => n.id);

  const orderedIds: string[] = [];
  while (queue.length > 0) {
    queue.sort((a, b) => cmpTopoId(a, b, nodes));
    const current = queue.shift()!;
    orderedIds.push(current);
    dependents[current].forEach((dependent) => {
      inDegree[dependent]--;
      if (inDegree[dependent] === 0) queue.push(dependent);
    });
  }

  const missing = nodeList
    .filter((n) => !orderedIds.includes(n.id))
    .sort((a, b) => cmpTopoId(a.id, b.id, nodes));
  missing.forEach((n) => orderedIds.push(n.id));

  return orderedIds;
}

export function computeLearningPath(nodes: Record<string, RUENode>): LearningPathResult {
  const nodeList = Object.values(nodes);
  if (nodeList.length <= 1) {
    return {
      orderedIds: nodeList.map((n) => n.id),
      prerequisites: [],
      nodeMetadata: Object.fromEntries(
        nodeList.map((n) => [
          n.id,
          { complexity: 0, isFoundational: true, unlocks: [] },
        ])
      ),
    };
  }

  const prerequisites: Prerequisite[] = [];

  /* Tree exploration: deeper (child) nodes drill into concepts; the parent “synthesis”
   * assumes those ideas — so study children before parents (leaves → root along branches). */
  nodeList.forEach((node) => {
    if (node.parentId && nodes[node.parentId]) {
      prerequisites.push({
        nodeId: node.parentId,
        prereqId: node.id,
        reason: 'structural',
        overlappingTerms: [],
        confidence: 1,
      });
    }
  });

  for (const nodeA of nodeList) {
    for (const nodeB of nodeList) {
      if (nodeA.id === nodeB.id) continue;
      if (isAncestor(nodeB.id, nodeA.id, nodes)) continue;
      if (isAncestor(nodeA.id, nodeB.id, nodes)) continue;

      const nodeBResponseLower = nodeB.response.toLowerCase();
      const overlapping = nodeA.terms.filter((term) => {
        const t = term.trim().toLowerCase();
        if (t.length < 4) return false;
        const wordBoundaryRegex = new RegExp(`\\b${escapeRegex(t)}\\b`, 'i');
        return wordBoundaryRegex.test(nodeBResponseLower);
      });

      /* Node B references A’s extracted terms → understand A before B (same as tree direction). */
      if (overlapping.length >= 1) {
        const confidence = Math.min(0.55 + overlapping.length * 0.15, 1);
        prerequisites.push({
          nodeId: nodeB.id,
          prereqId: nodeA.id,
          reason: 'term_overlap',
          overlappingTerms: overlapping,
          confidence,
        });
      }
    }
  }

  const deduped = deduplicatePrereqs(prerequisites);
  const acyclicPrereqs = breakTermOverlapCycles(deduped, nodeList, nodes);
  const orderedIds = kahnOrder(acyclicPrereqs, nodeList, nodes);

  const nodeMetadata: LearningPathResult['nodeMetadata'] = {};
  nodeList.forEach((node) => {
    const prereqCount = acyclicPrereqs.filter((p) => p.nodeId === node.id).length;
    const unlocks = acyclicPrereqs.filter((p) => p.prereqId === node.id).map((p) => p.nodeId);

    nodeMetadata[node.id] = {
      complexity: Math.min(node.depth * 0.15 + prereqCount * 0.1 + node.terms.length * 0.05, 1),
      isFoundational: prereqCount === 0,
      unlocks,
    };
  });

  return { orderedIds, prerequisites: acyclicPrereqs, nodeMetadata };
}

/** Ordered `ChatNode`s for the store — same DAG as the Learning Path panel. */
export function computeLearningPathNodes(nodes: Record<string, RUENode>): RUENode[] {
  const { orderedIds } = computeLearningPath(nodes);
  const out: RUENode[] = [];
  for (const id of orderedIds) {
    const n = nodes[id];
    if (n) out.push(n);
  }
  return out;
}
