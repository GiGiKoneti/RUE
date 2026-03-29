import OpenAI from 'openai';
import { Response } from 'express';
import dotenv from 'dotenv';
import path from 'path';
import { buildSaikiSystemMessage } from './saikiSystemPrompt';

dotenv.config({ path: path.resolve(process.cwd(), '.env') });

const sambanovaKey = process.env.SAMBANOVA_API_KEY;
const nvidiaKey = process.env.NVIDIA_API_KEY;

const sambanova = new OpenAI({
  baseURL: 'https://api.sambanova.ai/v1',
  apiKey: sambanovaKey || '',
});

const nvidia = nvidiaKey ? new OpenAI({
  baseURL: 'https://integrate.api.nvidia.com/v1',
  apiKey: nvidiaKey,
}) : null;

export interface StreamOptions {
  systemOverride?: string;
  noTerms?: boolean;
  temperature?: number;
  maxTokens?: number;
}

export async function streamExplanation(
  prompt: string,
  context: string,
  res: Response,
  options: StreamOptions = {}
) {
  const defaultSystem = buildSaikiSystemMessage(context);

  const systemPrompt = options.systemOverride ?? defaultSystem;
  const temperature = options.temperature ?? 0.1;
  const maxTokens = options.maxTokens ?? 1024;

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');

  let currentProvider = 'SambaNova';
  let stream;

  try {
    // Attempt 1: SambaNova
    try {
      console.log('Attempting SambaNova...');
        stream = await sambanova.chat.completions.create({
          model: 'Meta-Llama-3.3-70B-Instruct',
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: prompt }
          ],
          stream: true,
          temperature,
          max_tokens: maxTokens
        });
    } catch (err: any) {
      if (err.status === 429 && nvidia) {
        console.warn('SambaNova 429 hit. Falling back to NVIDIA NIM...');
        currentProvider = 'NVIDIA';
        try {
          stream = await nvidia.chat.completions.create({
            model: 'meta/llama-3.1-8b-instruct', // More reliable availability than 3.3 or 405b
            messages: [
              { role: 'system', content: systemPrompt },
              { role: 'user', content: prompt }
            ],
            stream: true,
            temperature,
            max_tokens: maxTokens
          });
        } catch (nvErr: any) {
          console.error('NVIDIA NIM specifically failed:', nvErr.message, nvErr.status);
          throw nvErr; // Re-throw to hit the outer catch (Mock)
        }
      } else {
        throw err;
      }
    }

    let currentText = '';
    for await (const chunk of stream as any) {
      const content = chunk.choices[0]?.delta?.content || '';
      if (content) {
        res.write(`data: ${JSON.stringify({ type: 'chunk', text: content })}\n\n`);
        currentText += content;
      }
    }

    // Extract terms (skipped for summary-only calls)
    if (!options.noTerms) {
      const regex = /<\s*term\s*>([\s\S]*?)<\s*\/\s*term\s*>/gi;
      let match;
      while ((match = regex.exec(currentText)) !== null) {
        const inner = match[1]?.trim().replace(/\s+/g, ' ');
        if (inner) {
          res.write(`data: ${JSON.stringify({ type: 'term', term: inner })}\n\n`);
        }
      }
    }
    
    res.write(`data: ${JSON.stringify({ type: 'done', provider: currentProvider })}\n\n`);
    res.end();

  } catch (err: any) {
    console.warn('All providers failed, using mock fallback:', err.message);
    
    const isNvidiaConfigured = !!nvidiaKey && nvidiaKey !== 'your_nvidia_key_here';
    const reason = (err.status === 429) 
      ? `because the AI providers are currently rate-limited.`
      : `due to a configuration or connection error (${err.message}).`;

    const mockText = `This is a simulated explanation for "${prompt}" ${reason}.

${!isNvidiaConfigured ? '**Configuration** is incomplete — check API keys in \`.env\`.' : ''}

> Think of this as a *preview* of how Saiki weaves ideas together.

When live, we connect to full models to explore <term>Recursive Understanding</term> and <term>knowledge graphs</term>.

---

- The flow starts from your question
- Then it surfaces <term>Mock Fallback Mode</term> when providers are unavailable

Please verify your API keys in the .env file to restore full functionality.

\`\`\`text
# placeholder
echo "ready"
\`\`\``;

    res.write(`data: ${JSON.stringify({ type: 'chunk', text: mockText })}\n\n`);
    if (!options.noTerms) {
      res.write(`data: ${JSON.stringify({ type: 'term', term: 'Cognitive Architecture' })}\n\n`);
      res.write(`data: ${JSON.stringify({ type: 'term', term: 'Recursive Learning' })}\n\n`);
    }
    res.write(`data: ${JSON.stringify({ type: 'done', provider: 'Mock' })}\n\n`);
    res.end();
  }
}
