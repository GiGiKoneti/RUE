import { Router } from 'express';
import { extractExplorableTermsLLM } from '../lib/extractTerms';

const router = Router();

router.post('/', async (req, res) => {
  const { response, seedPrompt, excludeHints } = req.body as {
    response?: string;
    seedPrompt?: string;
    excludeHints?: unknown;
  };
  const text = typeof response === 'string' ? response : '';
  const seed = typeof seedPrompt === 'string' ? seedPrompt : '';
  const hints = Array.isArray(excludeHints)
    ? excludeHints.filter((x): x is string => typeof x === 'string')
    : [];

  if (!text.trim()) {
    res.json({ terms: [] });
    return;
  }

  try {
    const terms = await extractExplorableTermsLLM(text, seed, hints);
    res.json({ terms });
  } catch (e) {
    console.error('extract-terms:', e);
    res.status(500).json({ terms: [], error: 'extraction_failed' });
  }
});

export default router;
