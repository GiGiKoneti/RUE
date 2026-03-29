import { useState, useRef, useCallback, useEffect } from 'react';
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion';
import { Brain, Send, RotateCcw } from 'lucide-react';
import { useExplorationStore } from '../store/explorationStore';
import { MasteryStars } from './MasteryStars';
import type { ProbeMessage } from '../types';

interface SocraticProbeProps {
  nodeId: string;
}

type ProbeState = 'idle' | 'probing' | 'complete';

/** Incremental SSE: normalize CRLF, split events on blank line, flush tail after EOF. */
function drainSseEvents(
  buffer: string,
  onData: (raw: string) => void
): string {
  let buf = buffer.replace(/\r\n/g, '\n');
  let sep: number;
  while ((sep = buf.indexOf('\n\n')) >= 0) {
    const block = buf.slice(0, sep);
    buf = buf.slice(sep + 2);
    for (const line of block.split('\n')) {
      if (!line.startsWith('data:')) continue;
      const payload = line.slice(5).trim();
      if (payload.length === 0 || payload.startsWith(':')) continue;
      onData(payload);
    }
  }
  return buf;
}

function flushTailSse(buffer: string, onData: (raw: string) => void): void {
  const tail = buffer.replace(/\r\n/g, '\n').trim();
  if (!tail) return;
  for (const line of tail.split('\n')) {
    if (!line.startsWith('data:')) continue;
    const payload = line.slice(5).trim();
    if (payload.length === 0 || payload.startsWith(':')) continue;
    onData(payload);
  }
}

/** Parse <feedback> and <question> from tutor response */
function parseTutorResponse(text: string): {
  feedback: string;
  question: string;
  mastery: number;
  rationale: string;
} {
  const feedbackMatch = text.match(/<feedback>([\s\S]*?)<\/feedback>/i);
  const questionMatch = text.match(/<question>([\s\S]*?)<\/question>/i);
  const masteryMatch = text.match(/<mastery>\s*(\d)\s*<\/mastery>/i);
  const rationaleMatch = text.match(/<rationale>([\s\S]*?)<\/rationale>/i);

  // Fallback: if no XML tags, treat the whole thing as the question/feedback
  const raw = text
    .replace(/<\/?(?:feedback|question|mastery|rationale)>/gi, '')
    .trim();

  return {
    feedback: feedbackMatch?.[1]?.trim() || '',
    question: questionMatch?.[1]?.trim() || raw || '',
    mastery: masteryMatch ? Math.min(3, Math.max(1, parseInt(masteryMatch[1], 10))) : 0,
    rationale: rationaleMatch?.[1]?.trim() || '',
  };
}

export function SocraticProbe({ nodeId }: SocraticProbeProps) {
  const reduceMotion = useReducedMotion();
  const node = useExplorationStore((s) => s.nodes[nodeId]);
  const setMasteryStars = useExplorationStore((s) => s.setMasteryStars);
  const appendProbeMessage = useExplorationStore((s) => s.appendProbeMessage);
  const resetProbeHistory = useExplorationStore((s) => s.resetProbeHistory);
  const persistNode = useExplorationStore((s) => s.persistNode);

  const [state, setState] = useState<ProbeState>(
    node?.masteryStars > 0 ? 'complete' : 'idle'
  );
  const [history, setHistory] = useState<ProbeMessage[]>(node?.probeHistory || []);
  const [currentTutorText, setCurrentTutorText] = useState('');
  const [isStreaming, setIsStreaming] = useState(false);
  const [userInput, setUserInput] = useState('');
  const [finalRationale, setFinalRationale] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);
  const chatEndRef = useRef<HTMLDivElement>(null);
  const historyRef = useRef<ProbeMessage[]>(node?.probeHistory || []);

  useEffect(() => {
    historyRef.current = history;
  }, [history]);

  // Auto-scroll chat
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [history, currentTutorText]);

  const streamProbe = useCallback(
    async (probeHistory: ProbeMessage[]) => {
      if (!node) {
        setIsStreaming(false);
        return;
      }
      setIsStreaming(true);
      setCurrentTutorText('');

      try {
        const res = await fetch('/api/saiki/probe', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            nodeId: node.id,
            sessionId: useExplorationStore.getState().currentSessionId,
            nodeTopic: node.parentTerm || node.prompt,
            nodeContent: node.response,
            history: probeHistory,
          }),
        });

        if (!res.ok) {
          throw new Error(`Probe failed with status: ${res.status}`);
        }
        if (!res.body) throw new Error('No response body');

        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let fullText = '';
        let receivedMastery = 0;
        let receivedRationale = '';
        let buffer = '';

        const handlePayload = (dataStr: string) => {
          if (dataStr === '[DONE]') return;
          try {
            const data = JSON.parse(dataStr) as {
              type?: string;
              text?: string;
              stars?: number;
              rationale?: string;
            };
            if (data.type === 'chunk' && data.text) {
              fullText += data.text;
              setCurrentTutorText(fullText);
            } else if (data.type === 'mastery' && data.stars) {
              receivedMastery = data.stars;
              receivedRationale = data.rationale || '';
            }
          } catch {
            /* ignore */
          }
        };

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          buffer = drainSseEvents(buffer, handlePayload);
        }
        flushTailSse(buffer, handlePayload);

        const trimmedTutor = fullText.trim();
        const tutorContent =
          trimmedTutor ||
          '<question>What part of this idea is still fuzzy for you—can you name it in one phrase?</question>';

        // Add tutor message to history
        const tutorMsg: ProbeMessage = { role: 'tutor', content: tutorContent };
        const newHistory = [...probeHistory, tutorMsg];
        historyRef.current = newHistory;
        setHistory(newHistory);
        appendProbeMessage(nodeId, tutorMsg);
        setCurrentTutorText('');

        if (receivedMastery > 0) {
          setMasteryStars(nodeId, receivedMastery);
          setFinalRationale(receivedRationale);
          setState('complete');
          void persistNode(nodeId);
        }
      } catch (err) {
        console.error('Probe error:', err);
        const fallback: ProbeMessage = {
          role: 'tutor',
          content: '<question>Can you explain the core idea in your own words?</question>',
        };
        const withFallback = [...historyRef.current, fallback];
        historyRef.current = withFallback;
        setHistory(withFallback);
        appendProbeMessage(nodeId, fallback);
      } finally {
        setIsStreaming(false);
        setTimeout(() => inputRef.current?.focus(), 100);
      }
    },
    [node, nodeId, appendProbeMessage, setMasteryStars, persistNode]
  );

  const handleStart = useCallback(() => {
    setState('probing');
    resetProbeHistory(nodeId);
    historyRef.current = [];
    setHistory([]);
    streamProbe([]);
  }, [streamProbe, nodeId, resetProbeHistory]);

  const handleSubmit = useCallback(() => {
    const text = userInput.trim();
    if (!text || isStreaming) return;

    setIsStreaming(true);
    const userMsg: ProbeMessage = { role: 'user', content: text };
    const newHistory = [...historyRef.current, userMsg];
    historyRef.current = newHistory;
    setHistory(newHistory);
    appendProbeMessage(nodeId, userMsg);
    setUserInput('');
    void streamProbe(newHistory);
  }, [userInput, isStreaming, nodeId, appendProbeMessage, streamProbe]);

  const handleRetry = useCallback(() => {
    setMasteryStars(nodeId, 0);
    setFinalRationale('');
    setState('probing');
    resetProbeHistory(nodeId);
    historyRef.current = [];
    setHistory([]);
    streamProbe([]);
  }, [nodeId, setMasteryStars, streamProbe, resetProbeHistory]);

  if (!node || node.isStreaming) return null;

  // ─── IDLE ───
  if (state === 'idle') {
    return (
      <motion.div
        initial={{ opacity: 0, y: 6 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: reduceMotion ? 0 : 0.3 }}
        className="mt-4 pt-4 border-t border-white/[0.06]"
      >
        <button
          type="button"
          onClick={handleStart}
          className="flex items-center gap-2.5 w-full px-4 py-3 rounded-xl
                     bg-gradient-to-r from-purple-500/10 to-cyan-500/10
                     border border-purple-500/20 hover:border-purple-500/40
                     text-purple-300/80 hover:text-purple-200
                     transition-all duration-200 group font-[Inter]"
        >
          <Brain className="w-4 h-4 text-purple-400/70 group-hover:text-purple-300 transition-colors" />
          <div className="text-left">
            <p className="text-sm font-medium">Test Your Understanding</p>
            <p className="text-[10px] text-white/30 mt-0.5">
              Socratic probe — 3-5 quick questions to verify mastery
            </p>
          </div>
        </button>
      </motion.div>
    );
  }

  // ─── COMPLETE ───
  if (state === 'complete') {
    return (
      <motion.div
        initial={{ opacity: 0, y: 6 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: reduceMotion ? 0 : 0.3 }}
        className="mt-4 pt-4 border-t border-white/[0.06]"
      >
        <div className="rounded-xl border border-white/[0.08] bg-white/[0.02] p-4 space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Brain className="w-4 h-4 text-purple-400/60" />
              <span className="text-xs font-medium text-white/50 font-[Inter]">Mastery Level</span>
            </div>
            <MasteryStars stars={node.masteryStars} size="md" showLabel />
          </div>
          {finalRationale && (
            <p className="text-[11px] text-white/35 font-[Inter] leading-relaxed">
              {finalRationale}
            </p>
          )}
          <button
            type="button"
            onClick={handleRetry}
            className="flex items-center gap-1.5 text-[10px] text-white/25 hover:text-purple-300/60
                       transition-colors font-[Inter]"
          >
            <RotateCcw className="w-3 h-3" />
            Retake probe
          </button>
        </div>
      </motion.div>
    );
  }

  // ─── PROBING ───
  const parsed = history.map((msg) =>
    msg.role === 'tutor' ? { ...msg, parsed: parseTutorResponse(msg.content) } : msg
  );

  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: reduceMotion ? 0 : 0.3 }}
      className="mt-4 pt-4 border-t border-white/[0.06]"
    >
      <div className="flex items-center gap-2 mb-3">
        <Brain className="w-3.5 h-3.5 text-purple-400/60" />
        <span className="text-[10px] uppercase tracking-widest text-white/25 font-[Inter]">
          Socratic Probe
        </span>
        <span className="text-[9px] text-white/15 font-[Inter]">
          Round {Math.ceil((history.filter((h) => h.role === 'user').length + 1))}
        </span>
      </div>

      <div className="space-y-3 max-h-[400px] overflow-y-auto custom-scrollbar pr-1">
        {parsed.map((msg, i) => {
          if (msg.role === 'user') {
            return (
              <div key={i} className="flex justify-end">
                <div className="max-w-[85%] px-3 py-2 rounded-xl rounded-br-sm
                                bg-purple-500/15 border border-purple-500/20 text-sm text-white/70 font-[Inter]">
                  {msg.content}
                </div>
              </div>
            );
          }
          const p = (msg as any).parsed as ReturnType<typeof parseTutorResponse>;
          return (
            <div key={i} className="space-y-1.5">
              {p.feedback && (
                <div className="px-3 py-2 rounded-xl rounded-bl-sm
                                bg-white/[0.03] border border-white/[0.06] text-[13px] text-white/55 font-[Inter] leading-relaxed">
                  {p.feedback}
                </div>
              )}
              {p.question && (
                <div className="px-3 py-2 rounded-xl rounded-bl-sm
                                bg-cyan-500/8 border border-cyan-500/15 text-sm text-cyan-100/80 font-[Inter] font-medium leading-relaxed">
                  {p.question}
                </div>
              )}
            </div>
          );
        })}

        {/* Streaming tutor response */}
        <AnimatePresence>
          {isStreaming && currentTutorText && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="space-y-1.5"
            >
              {(() => {
                const p = parseTutorResponse(currentTutorText);
                return (
                  <>
                    {p.feedback && (
                      <div className="px-3 py-2 rounded-xl rounded-bl-sm
                                      bg-white/[0.03] border border-white/[0.06] text-[13px] text-white/55 font-[Inter] leading-relaxed">
                        {p.feedback}
                      </div>
                    )}
                    {p.question && (
                      <div className="px-3 py-2 rounded-xl rounded-bl-sm
                                      bg-cyan-500/8 border border-cyan-500/15 text-sm text-cyan-100/80 font-[Inter] font-medium leading-relaxed">
                        {p.question}
                        <motion.span
                          className="inline-block w-0.5 h-3.5 bg-cyan-400/60 ml-0.5 align-middle rounded-sm"
                          animate={reduceMotion ? { opacity: 0.85 } : { opacity: [1, 0.35, 1] }}
                          transition={reduceMotion ? { duration: 0 } : { repeat: Infinity, duration: 0.8 }}
                        />
                      </div>
                    )}
                  </>
                );
              })()}
            </motion.div>
          )}
        </AnimatePresence>

        <div ref={chatEndRef} />
      </div>

      {/* User input */}
      {!isStreaming && state === 'probing' && (
        <div className="flex items-center gap-2 mt-3">
          <input
            ref={inputRef}
            type="text"
            value={userInput}
            onChange={(e) => setUserInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                handleSubmit();
              }
            }}
            placeholder="Your answer (1-2 lines)..."
            maxLength={300}
            className="flex-1 bg-white/[0.04] border border-white/[0.08] rounded-xl
                       px-3 py-2.5 text-sm text-white/80 placeholder:text-white/20
                       outline-none focus:border-purple-500/30 focus:bg-white/[0.06]
                       transition-all font-[Inter]"
          />
          <button
            type="button"
            onClick={handleSubmit}
            disabled={!userInput.trim()}
            className="p-2.5 rounded-xl bg-purple-500/15 border border-purple-500/25
                       text-purple-300/70 hover:bg-purple-500/25 hover:text-purple-200
                       disabled:opacity-30 disabled:cursor-not-allowed
                       transition-all duration-150"
          >
            <Send className="w-4 h-4" />
          </button>
        </div>
      )}

      {isStreaming && !currentTutorText && (
        <div className="flex items-center gap-2 mt-3 text-[11px] text-white/20 font-[Inter]">
          <motion.div
            className="w-1.5 h-1.5 bg-purple-400/50 rounded-full"
            animate={reduceMotion ? {} : { opacity: [0.3, 1, 0.3] }}
            transition={reduceMotion ? {} : { repeat: Infinity, duration: 1 }}
          />
          Thinking...
        </div>
      )}
    </motion.div>
  );
}
