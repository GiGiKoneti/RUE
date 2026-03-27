import { useCallback, useState } from 'react';
import { useExplorationStore, generateNodeId } from '../store/explorationStore';
import type { ChatNode, ExtractedTerm } from '../types';

/**
 * Calculates startIndex and endIndex for terms within the explanation text.
 * The backend does not provide these, but the frontend needs them for inline highlighting.
 */
function calculateTermOffsets(explanation: string, terms: ExtractedTerm[]): ExtractedTerm[] {
  let searchStart = 0;
  const result: ExtractedTerm[] = [];

  // Sort terms by length descending, so we don't accidentally match sub-words earliest?
  // Actually, terms appear in order in the text usually. We'll just search for them.
  // We'll search for exact matches (case-insensitive)
  
  // Create a copy of the string to search against to handle multiple occurrences
  const lowerExp = explanation.toLowerCase();

  for (const t of terms) {
    const lowerTerm = t.term.toLowerCase();
    // Try to find the term in the remaining string
    const idx = lowerExp.indexOf(lowerTerm, searchStart);
    
    if (idx !== -1) {
      result.push({
        ...t,
        startIndex: idx,
        endIndex: idx + t.term.length,
      });
      // Move search cursor forward to avoid matching the same occurrence twice
      searchStart = idx + t.term.length;
    } else {
      // Fallback: search from the beginning if it wasn't found after the cursor
      // (This can happen if the LLM hallucinated the term ordering)
      const fallbackIdx = lowerExp.indexOf(lowerTerm);
      if (fallbackIdx !== -1) {
        result.push({
          ...t,
          startIndex: fallbackIdx,
          endIndex: fallbackIdx + t.term.length,
        });
      }
    }
  }

  return result;
}

export function useRUE() {
  const store = useExplorationStore;
  const [isGlobalLoading, setIsGlobalLoading] = useState(false);

  const askQuestion = useCallback(async (question: string) => {
    const s = store.getState();
    setIsGlobalLoading(true);

    const nodeId = generateNodeId();
    const node: ChatNode = {
      id: nodeId,
      prompt: question,
      response: '',
      extractedTerms: [],
      depth: 0,
      parentId: null,
      childIds: [],
      x: 0,
      y: 0,
      width: 420,
      height: 200,
      isCollapsed: false,
      isStreaming: true,
    };

    s.addRootNode(node);

    try {
      const res = await fetch('/api/ask', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ question }),
      });

      if (!res.ok) {
        throw new Error(`API Error: ${res.status}`);
      }

      const data = await res.json();
      
      const termsWithOffsets = calculateTermOffsets(data.explanation, data.extractedTerms || []);
      
      store.getState().updateNodeResponse(nodeId, data.explanation, termsWithOffsets, data.contextChain);
    } catch (err) {
      console.error('Initial Question Error:', err);
      store.getState().updateNodeResponse(nodeId, 'Failed to fetch answer. Please try again.', []);
    } finally {
      store.getState().setNodeStreaming(nodeId, false);
      setIsGlobalLoading(false);
    }
  }, []);

  const exploreTerm = useCallback(async (term: string, parentId: string) => {
    const s = store.getState();
    const parent = s.nodes[parentId];
    if (!parent) return;

    if (!parent.contextChain) {
      console.error("Parent node has no context chain to pass down.");
      return;
    }

    const childIndex = parent.childIds.length;
    const offsetX = 560;
    const offsetY = childIndex * 320 - (parent.childIds.length * 160);

    const prompt = `Explain "${term}" in the context of: ${parent.prompt}`;
    const nodeId = generateNodeId();
    
    const node: ChatNode = {
      id: nodeId,
      prompt,
      response: '',
      extractedTerms: [],
      depth: parent.depth + 1,
      parentId,
      childIds: [],
      x: parent.x + offsetX,
      y: parent.y + offsetY,
      width: 420,
      height: 200,
      isCollapsed: false,
      isStreaming: true,
    };

    s.addChildNode(parentId, node);

    try {
      const res = await fetch('/api/explore', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          term,
          contextChain: parent.contextChain,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        // Handle max depth reached gracefully or other errors
        if (data.error === 'MAX_DEPTH_REACHED') {
           store.getState().updateNodeResponse(nodeId, data.message || 'Maximum depth reached.', [], data.contextChain);
        } else {
           throw new Error(data.message || `API Error: ${res.status}`);
        }
      } else {
        const termsWithOffsets = calculateTermOffsets(data.explanation, data.extractedTerms || []);
        store.getState().updateNodeResponse(nodeId, data.explanation, termsWithOffsets, data.contextChain);
      }
    } catch (err) {
      console.error('Explore Error:', err);
      store.getState().updateNodeResponse(nodeId, 'Failed to explore term. Please try again.', []);
    } finally {
      store.getState().setNodeStreaming(nodeId, false);
    }
  }, []);

  return { askQuestion, exploreTerm, isGlobalLoading };
}
