import type { ChatNode, GraphEdge } from '../types';

const ROOT_ID = 'demo_judge_root';
const CHILD_ID = 'demo_judge_child';

/**
 * Offline starter graph for judge demos — open the app with ?demo=1 or ?judge=1
 * (no backend / LLM required to show the canvas, cards, terms, and one branch).
 */
export function getJudgeDemoStarter(): {
  nodes: Record<string, ChatNode>;
  edges: GraphEdge[];
  rootNodeId: string;
} {
  const rootPrompt =
    'What is self-attention in transformers, and why does sequence length matter for cost?';

  const root: ChatNode = {
    id: ROOT_ID,
    parentId: null,
    parentTerm: null,
    prompt: rootPrompt,
    response:
      'Self-attention lets every token look at every other token in one pass. Each position builds a <term>weighted mix</term> of the sequence using <term>attention scores</term> from the famous <term>Query-Key-Value</term> pattern.\n\n' +
      'That flexibility captures long-range dependencies well, but compute and memory grow roughly with **sequence length squared**. In practice we use ideas like <term>sequence truncation</term>, local windows, or sparse patterns to stay efficient.\n\n' +
      '---\n\n' +
      'If you unpack one step: a query vector compares against all keys; the resulting scores determine how much of each <term>value vector</term> flows into the current hidden state.',
    terms: ['attention scores', 'Query-Key-Value', 'weighted mix', 'sequence truncation', 'value vector'],
    summary: 'Attention relates all tokens cost grows with length squared',
    summaryPending: false,
    depth: 0,
    childCount: 1,
    x: 0,
    y: 0,
    isStreaming: false,
    isCollapsed: false,
    isFollowUp: false,
    localDepthLimit: null,
    masteryStars: 0,
    probeHistory: [],
  };

  const child: ChatNode = {
    id: CHILD_ID,
    parentId: ROOT_ID,
    parentTerm: 'Query-Key-Value',
    prompt: `Explain "Query-Key-Value" in the context of: ${rootPrompt}`,
    response:
      'In <term>QKV attention</term>, each position emits three vectors. The <term>query</term> asks what to look for; the <term>key</term> describes what each position offers; the <term>value</term> is the information we actually blend in after scores are normalized.\n\n' +
      'Scaled dot-product attention keeps gradients stable compared to raw large dot products — that is the usual <term>dot-product scaling</term> story you see in papers.',
    terms: ['QKV attention', 'query', 'key', 'value', 'dot-product scaling'],
    summary: 'Queries match keys values carry content into mix',
    summaryPending: false,
    depth: 1,
    childCount: 0,
    x: 0,
    y: 0,
    isStreaming: false,
    isCollapsed: false,
    isFollowUp: false,
    localDepthLimit: null,
    masteryStars: 0,
    probeHistory: [],
  };

  const nodes: Record<string, ChatNode> = {
    [ROOT_ID]: root,
    [CHILD_ID]: child,
  };

  const edges: GraphEdge[] = [
    { id: `e_${ROOT_ID}_${CHILD_ID}`, fromId: ROOT_ID, toId: CHILD_ID },
  ];

  return { nodes, edges, rootNodeId: ROOT_ID };
}
