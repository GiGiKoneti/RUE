import { useCallback, useState } from 'react';
import { useExplorationStore } from '../store/explorationStore';
import { truncateToSixWords } from '../features/rue/lib/analysis';
import {
  mergeExplorableTerms,
  MIN_EXPLORABLE_TERMS,
  combineLlmWithHeuristic,
} from '../features/rue/lib/explorableTerms';
import {
  collectExcludeHintsForExtract,
  filterTermsAgainstHints,
} from '../features/rue/lib/explorationExclude';
import { useSessionStore } from '../store/sessionStore';

async function generateNodeSummary(response: string, prompt: string): Promise<string> {
  try {
    const res = await fetch('/api/saiki/stream', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        prompt: `Summarize this in exactly 6 words or fewer, no punctuation:\n\n"${response.slice(0, 400)}"`,
        systemOverride:
          'Respond with ONLY a 6-word summary. No quotes, no punctuation, no explanation.',
        temperature: 0.3,
        maxTokens: 20,
        noTerms: true,
      }),
    });

    if (!res.body) return truncateToSixWords(prompt);

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let summaryText = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      const chunk = decoder.decode(value, { stream: true });
      const lines = chunk.split('\n');
      for (const line of lines) {
        if (line.startsWith('data: ')) {
          try {
            const data = JSON.parse(line.slice(6)) as { type?: string; text?: string };
            if (data.type === 'chunk' && data.text) summaryText += data.text;
          } catch {
            /* ignore */
          }
        }
      }
    }
    const cleaned = summaryText.trim().replace(/[".]+$/g, '');
    return cleaned || truncateToSixWords(prompt);
  } catch {
    return truncateToSixWords(prompt);
  }
}

async function fetchCuratedTermsFromApi(
  responseText: string,
  seedPrompt: string,
  excludeHints: string[] = []
): Promise<string[]> {
  try {
    const res = await fetch('/api/saiki/extract-terms', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        response: responseText,
        seedPrompt,
        excludeHints,
      }),
    });
    if (!res.ok) return [];
    const j = (await res.json()) as { terms?: unknown };
    if (!Array.isArray(j.terms)) return [];
    return j.terms.filter((x): x is string => typeof x === 'string');
  } catch {
    return [];
  }
}

async function finalizeNodeAfterStream(
  nodeId: string,
  rawTerms: string[],
  responseText: string,
  summarySeedPrompt: string
) {
  const store = useExplorationStore;
  const latest = store.getState().nodes[nodeId]?.response ?? responseText;
  const node = store.getState().nodes[nodeId];
  const parent = node?.parentId ? store.getState().nodes[node.parentId] : undefined;
  const excludeHints = node
    ? collectExcludeHintsForExtract(node.prompt, node.parentTerm, parent?.prompt ?? null)
    : [];

  const heuristicBase = mergeExplorableTerms(
    [...new Set(rawTerms)],
    latest,
    MIN_EXPLORABLE_TERMS,
    summarySeedPrompt
  );
  let heuristic = filterTermsAgainstHints(heuristicBase, excludeHints);
  if (!heuristic.length) heuristic = heuristicBase;

  store.getState().completeStreaming(nodeId, heuristic);

  try {
    const llm = await fetchCuratedTermsFromApi(latest, summarySeedPrompt, excludeHints);
    if (llm.length > 0) {
      let merged = combineLlmWithHeuristic(llm, heuristic, latest);
      merged = filterTermsAgainstHints(merged, excludeHints);
      if (!merged.length) merged = heuristic;
      store.getState().setNodeTerms(nodeId, merged);
      void store.getState().persistNode(nodeId);
    }
  } catch {
    /* heuristic already applied */
  }

  void generateNodeSummary(latest, summarySeedPrompt).then((summary) => {
    store.getState().setNodeSummary(nodeId, summary);
    store.getState().persistNode(nodeId);
  });
}

/** Gather all explored concept names from the graph for LLM exclusion context. */
function buildExploredConceptsList(): string {
  const nodes = useExplorationStore.getState().nodes;
  const concepts = new Set<string>();
  for (const n of Object.values(nodes)) {
    if (n.parentTerm) concepts.add(n.parentTerm);
    // Add the first few words of the prompt as a concept anchor
    const short = n.prompt.split(/\s+/).slice(0, 5).join(' ');
    if (short) concepts.add(short);
    // Also add any existing terms
    for (const t of n.terms) concepts.add(t);
  }
  if (concepts.size === 0) return '';
  return [...concepts].join(', ');
}

export function useSaiki() {
  const store = useExplorationStore;
  const [isGlobalLoading, setIsGlobalLoading] = useState(false);

  const askQuestion = useCallback(async (question: string) => {
    setIsGlobalLoading(true);
    
    // Auto-create session if missing
    let sid = store.getState().currentSessionId;
    if (!sid) {
      sid = await useSessionStore.getState().createSession(question);
      store.getState().setSessionId(sid);
    }

    const nodeId = store.getState().addRootNode(question);
    const terms: string[] = [];

    try {
      const res = await fetch('/api/saiki/stream', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt: question, context: buildExploredConceptsList() }),
      });

      if (!res.body) throw new Error('No response body');

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let responseText = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        const chunk = decoder.decode(value, { stream: true });
        const lines = chunk.split('\n');
        for (const line of lines) {
          if (line.startsWith('data: ')) {
            try {
              const data = JSON.parse(line.slice(6)) as {
                type?: string;
                text?: string;
                term?: string;
              };
              if (data.type === 'chunk' && data.text) {
                responseText += data.text;
                store.getState().updateNodeResponse(nodeId, responseText);
              } else if (data.type === 'term' && data.term) {
                const t = data.term.trim();
                if (t) terms.push(t);
              } else if (data.type === 'done') {
                void finalizeNodeAfterStream(nodeId, terms, responseText, question);
              }
            } catch {
              /* ignore */
            }
          }
        }
      }
      const stDone = store.getState().nodes[nodeId];
      if (stDone?.isStreaming) {
        void finalizeNodeAfterStream(nodeId, terms, stDone.response, question);
      }
    } catch (err) {
      console.error('AskQuestion Error:', err);
      const body = store.getState().nodes[nodeId]?.response ?? '';
      const node = store.getState().nodes[nodeId];
      const par = node?.parentId ? store.getState().nodes[node.parentId] : undefined;
      const excl = node
        ? collectExcludeHintsForExtract(node.prompt, node.parentTerm, par?.prompt ?? null)
        : [];
      let heuristic = mergeExplorableTerms([...new Set(terms)], body, MIN_EXPLORABLE_TERMS, question);
      let hf = filterTermsAgainstHints(heuristic, excl);
      if (!hf.length) hf = heuristic;
      let merged = hf;
      try {
        const llm = await fetchCuratedTermsFromApi(body, question, excl);
        if (llm.length) {
          merged = combineLlmWithHeuristic(llm, hf, body);
          merged = filterTermsAgainstHints(merged, excl);
          if (!merged.length) merged = hf;
        }
      } catch {
        /* keep heuristic */
      }
      store.getState().finalizeNode(nodeId, merged, truncateToSixWords(question));
    } finally {
      setIsGlobalLoading(false);
    }
  }, []);

  const exploreTerm = useCallback(
    async (
      term: string | string[],
      parentId: string,
      isFollowUp = false,
      customPrompt?: string
    ) => {
      const s = store.getState();
      const parent = s.nodes[parentId];
      if (!parent) return;

      let prompt = customPrompt;
      if (!prompt) {
        if (Array.isArray(term)) {
          const termList = term.join('", "');
          prompt =
            term.length === 1
              ? `Explain "${term[0]}" in the context of: ${parent.prompt}`
              : `Explain these concepts: "${termList}" — all in the context of: ${parent.prompt}`;
        } else {
          prompt = `Explain "${term}" in the context of: ${parent.prompt}`;
        }
      }

      const termArray = Array.isArray(term) ? term : [term];
      const nodeId = s.addChildNode(parentId, prompt, termArray, isFollowUp);
      s.focusNode(nodeId);
      const terms: string[] = [];

      try {
        const res = await fetch('/api/saiki/stream', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            prompt,
            context: buildExploredConceptsList(),
          }),
        });

        if (!res.body) throw new Error('No response body');

        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let responseText = '';

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          const chunk = decoder.decode(value, { stream: true });
          const lines = chunk.split('\n');
          for (const line of lines) {
            if (line.startsWith('data: ')) {
              try {
                const data = JSON.parse(line.slice(6)) as {
                  type?: string;
                  text?: string;
                  term?: string;
                };
                if (data.type === 'chunk' && data.text) {
                  responseText += data.text;
                  store.getState().updateNodeResponse(nodeId, responseText);
                } else if (data.type === 'term' && data.term) {
                  const t = data.term.trim();
                  if (t) terms.push(t);
                } else if (data.type === 'done') {
                  void finalizeNodeAfterStream(nodeId, terms, responseText, prompt!);
                }
              } catch {
                /* ignore */
              }
            }
          }
        }
        const stEx = store.getState().nodes[nodeId];
        if (stEx?.isStreaming) {
          void finalizeNodeAfterStream(nodeId, terms, stEx.response, prompt!);
        }
      } catch (err) {
        console.error('Explore Error:', err);
        const body = store.getState().nodes[nodeId]?.response ?? '';
        const n = store.getState().nodes[nodeId];
        const p = n?.parentId ? store.getState().nodes[n.parentId] : undefined;
        const excl = n
          ? collectExcludeHintsForExtract(n.prompt, n.parentTerm, p?.prompt ?? null)
          : [];
        let heuristic = mergeExplorableTerms([...new Set(terms)], body, MIN_EXPLORABLE_TERMS, prompt!);
        let hf = filterTermsAgainstHints(heuristic, excl);
        if (!hf.length) hf = heuristic;
        let merged = hf;
        try {
          const llm = await fetchCuratedTermsFromApi(body, prompt!, excl);
          if (llm.length) {
            merged = combineLlmWithHeuristic(llm, hf, body);
            merged = filterTermsAgainstHints(merged, excl);
            if (!merged.length) merged = hf;
          }
        } catch {
          /* keep heuristic */
        }
        store.getState().finalizeNode(nodeId, merged, truncateToSixWords(prompt!));
      }
    },
    []
  );

  return { askQuestion, exploreTerm, isGlobalLoading };
}
