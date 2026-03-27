// Shared types for the RUE system

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
  prompt: string;
  response: string;
  extractedTerms: ExtractedTerm[];
  contextChain?: ContextChain;
  depth: number;
  parentId: string | null;
  childIds: string[];
  x: number;
  y: number;
  width: number;
  height: number;
  isCollapsed: boolean;
  isStreaming: boolean;
}

export interface GraphEdge {
  id: string;
  fromId: string;
  toId: string;
}
