// Shared types for the Saiki system

export interface ContextChain {
  rootQuestion: string;
  explorationPath: string[];
  currentDepth: number;
}

export interface ExtractedTerm {
  term: string;
  reason: string;
  difficultyScore: number;
  startIndex?: number;
  endIndex?: number;
}

export interface ChatNode {
  id: string;
  parentId: string | null;
  parentTerm: string | null;
  prompt: string;
  response: string;
  terms: string[];
  summary: string;
  /** True after stream ends until LLM summary is stored or fails */
  summaryPending: boolean;
  depth: number;
  childCount: number;
  x: number;
  y: number;
  isStreaming: boolean;
  isCollapsed: boolean;
  isFollowUp: boolean;
  width?: number;
  height?: number;
  localDepthLimit: number | null;
  /** Mastery stars: 0=untested, 1-3=rated by Socratic probe */
  masteryStars: number;
  /** Socratic probe conversation history */
  probeHistory: ProbeMessage[];
}

export interface ProbeMessage {
  role: 'tutor' | 'user';
  content: string;
}

/** Alias aligned with RUE docs */
export type RUENode = ChatNode;

export interface GraphEdge {
  id: string;
  fromId: string;
  toId: string;
}
