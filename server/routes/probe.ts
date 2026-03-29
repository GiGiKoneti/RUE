import { Router } from 'express';
import OpenAI from 'openai';
import dotenv from 'dotenv';
import path from 'path';
import { buildProbeMessages, type ProbeMessage } from '../lib/socraticPrompt';
import { SaikiNode } from '../models/SaikiNode';

dotenv.config({ path: path.resolve(process.cwd(), '.env') });

const sambanovaKey = process.env.SAMBANOVA_API_KEY;
const nvidiaKey = process.env.NVIDIA_API_KEY;

const sambanova = new OpenAI({
  baseURL: 'https://api.sambanova.ai/v1',
  apiKey: sambanovaKey || '',
});

const nvidia = nvidiaKey
  ? new OpenAI({
      baseURL: 'https://integrate.api.nvidia.com/v1',
      apiKey: nvidiaKey,
    })
  : null;

const router = Router();

/**
 * POST /api/saiki/probe
 * Streams a Socratic tutor response for a given node.
 * Body: { nodeId, sessionId, nodeTopic, nodeContent, history: ProbeMessage[] }
 */
router.post('/', async (req, res) => {
  const {
    nodeId,
    sessionId,
    nodeTopic,
    nodeContent,
    history,
  } = req.body as {
    nodeId?: string;
    sessionId?: string;
    nodeTopic?: string;
    nodeContent?: string;
    history?: ProbeMessage[];
  };

  const topic = typeof nodeTopic === 'string' ? nodeTopic : 'Unknown';
  const content = typeof nodeContent === 'string' ? nodeContent : '';
  const hist: ProbeMessage[] = Array.isArray(history) ? history : [];

  const messages = buildProbeMessages(topic, content, hist);

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');

  let stream: any;

  try {
    try {
      stream = await sambanova.chat.completions.create({
        model: 'Meta-Llama-3.3-70B-Instruct',
        messages,
        stream: true,
        temperature: 0.4,
        max_tokens: 400,
      });
    } catch (err: any) {
      if (err.status === 429 && nvidia) {
        stream = await nvidia.chat.completions.create({
          model: 'meta/llama-3.1-8b-instruct',
          messages,
          stream: true,
          temperature: 0.4,
          max_tokens: 400,
        });
      } else {
        throw err;
      }
    }

    let fullText = '';
    for await (const chunk of stream) {
      const c = chunk.choices[0]?.delta?.content || '';
      if (c) {
        fullText += c;
        res.write(`data: ${JSON.stringify({ type: 'chunk', text: c })}\n\n`);
      }
    }

    // Parse mastery if present
    const masteryMatch = fullText.match(/<mastery>\s*(\d)\s*<\/mastery>/i);
    const rationaleMatch = fullText.match(/<rationale>([\s\S]*?)<\/rationale>/i);

    if (masteryMatch) {
      const stars = Math.min(3, Math.max(1, parseInt(masteryMatch[1], 10)));
      const rationale = rationaleMatch?.[1]?.trim() || '';
      res.write(`data: ${JSON.stringify({ type: 'mastery', stars, rationale })}\n\n`);

      // Persist mastery to DB
      if (nodeId && sessionId) {
        try {
          await SaikiNode.findOneAndUpdate(
            { sessionId, nodeId },
            {
              $set: {
                masteryStars: stars,
                probeHistory: [...hist, { role: 'tutor', content: fullText }],
              },
            }
          );
        } catch (e) {
          console.error('Failed to persist mastery:', e);
        }
      }
    }

    res.write(`data: ${JSON.stringify({ type: 'done' })}\n\n`);
    res.end();
  } catch (err: any) {
    console.error('Probe streaming error:', err.message);
    // Mock fallback
    const mockQuestion = `<question>Can you explain in your own words what "${topic}" fundamentally does?</question>`;
    res.write(`data: ${JSON.stringify({ type: 'chunk', text: mockQuestion })}\n\n`);
    res.write(`data: ${JSON.stringify({ type: 'done' })}\n\n`);
    res.end();
  }
});

export default router;
