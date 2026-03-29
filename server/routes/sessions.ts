import { Router } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { Session } from '../models/Session';
import { SaikiNode } from '../models/SaikiNode';
import { countDivergenceForSessionNodes } from '../lib/divergenceCounts';
import { completeChat } from '../lib/completeChat';

const router = Router();

// GET /api/saiki/sessions
router.get('/', async (req, res) => {
  try {
    const sessions = await Session.find().sort({ updatedAt: -1 }).lean();
    const ids = sessions.map((s) => s.id);
    const allNodes =
      ids.length === 0
        ? []
        : await SaikiNode.find({ sessionId: { $in: ids } })
            .select('sessionId nodeId parentId terms')
            .lean();

    const bySession: Record<string, { nodeId: string; parentId: string | null; terms: string[] }[]> = {};
    for (const row of allNodes) {
      const sid = row.sessionId as string;
      if (!bySession[sid]) bySession[sid] = [];
      bySession[sid].push({
        nodeId: row.nodeId as string,
        parentId: (row.parentId as string | null) ?? null,
        terms: Array.isArray(row.terms) ? (row.terms as string[]) : [],
      });
    }

    const enriched = sessions.map((s) => {
      const counts = countDivergenceForSessionNodes(bySession[s.id] || []);
      return { ...s, divergenceDiverging: counts.diverging, divergenceConverging: counts.converging };
    });

    res.json(enriched);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch sessions' });
  }
});

// POST /api/saiki/sessions
router.post('/', async (req, res) => {
  try {
    const session = new Session({
      id: uuidv4(),
      title: "Untitled Exploration",
      rootPrompt: req.body.rootPrompt || "Unknown prompt",
      nodeCount: 1,
      previewTerms: [],
    });
    await session.save();
    res.json({ sessionId: session.id });
  } catch (err) {
    res.status(500).json({ error: 'Failed to create session' });
  }
});

// POST /api/saiki/sessions/:sessionId/summarize
router.post('/:sessionId/summarize', async (req, res) => {
  try {
    const session = await Session.findOne({ id: req.params.sessionId });
    const nodes = await SaikiNode.find({ sessionId: req.params.sessionId }).lean();
    if (!session || nodes.length < 2) {
      res.json({ ok: false });
      return;
    }
    const digest = nodes
      .map((n) => {
        const prompt = typeof n.prompt === 'string' ? n.prompt : '';
        const response = typeof n.response === 'string' ? n.response : '';
        return `- ${prompt.slice(0, 80)}: ${response.slice(0, 120)}`;
      })
      .join('\n');
    const system =
      'Summarize the following exploration in 1–2 sentences. Write in third person as if describing what someone learned. Be specific about the topics. Under 30 words.';
    const summaryText = await completeChat(system, digest, 120);
    await Session.updateOne(
      { id: req.params.sessionId },
      { $set: { explorationSummary: summaryText, updatedAt: new Date() } }
    );
    res.json({ ok: true, summary: summaryText });
  } catch {
    res.status(500).json({ error: 'Summarize failed' });
  }
});

// GET /api/saiki/sessions/:sessionId
router.get('/:sessionId', async (req, res) => {
  try {
    const session = await Session.findOne({ id: req.params.sessionId });
    if (!session) {
      res.status(404).json({ error: 'Session not found' });
      return;
    }
    const nodes = await SaikiNode.find({ sessionId: session.id });
    res.json({ session, nodes });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch session' });
  }
});

// PATCH /api/saiki/sessions/:sessionId
router.patch('/:sessionId', async (req, res) => {
  try {
    const { title, updatedAt, isFavorited, tags } = req.body;
    const updateData: any = {};
    if (title !== undefined) updateData.title = title;
    if (updatedAt !== undefined) updateData.updatedAt = updatedAt;
    if (isFavorited !== undefined) updateData.isFavorited = isFavorited;
    if (tags !== undefined) updateData.tags = tags;

    const session = await Session.findOneAndUpdate(
      { id: req.params.sessionId },
      { $set: updateData },
      { new: true }
    );
    res.json(session);
  } catch (err) {
    res.status(500).json({ error: 'Failed to update session' });
  }
});

// DELETE /api/saiki/sessions/:sessionId
router.delete('/:sessionId', async (req, res) => {
  try {
    await Session.deleteOne({ id: req.params.sessionId });
    await SaikiNode.deleteMany({ sessionId: req.params.sessionId });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Failed to delete session' });
  }
});

// GET /api/saiki/sessions/:sessionId/nodes
router.get('/:sessionId/nodes', async (req, res) => {
  try {
    const nodes = await SaikiNode.find({ sessionId: req.params.sessionId });
    res.json(nodes);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch nodes' });
  }
});

// POST /api/saiki/sessions/:sessionId/nodes (upsert by sessionId + nodeId)
router.post('/:sessionId/nodes', async (req, res) => {
  try {
    const sessionId = req.params.sessionId;
    const nodeData = req.body as Record<string, unknown>;
    const nodeId = typeof nodeData.nodeId === 'string' ? nodeData.nodeId.trim() : '';
    if (!nodeId) {
      res.status(400).json({ error: 'nodeId required' });
      return;
    }

    const doc = {
      ...nodeData,
      sessionId,
      nodeId,
      response: typeof nodeData.response === 'string' ? nodeData.response : '',
    };

    const existing = await SaikiNode.findOne({ sessionId, nodeId }).lean();

    const node = await SaikiNode.findOneAndUpdate(
      { sessionId, nodeId },
      { $set: doc },
      { new: true, upsert: true, setDefaultsOnInsert: true }
    );

    const session = await Session.findOne({ id: sessionId });
    if (session) {
      if (!existing) {
        session.nodeCount += 1;
      }
      if (node && node.depth === 0 && session.previewTerms.length === 0 && node.terms?.length) {
        session.previewTerms = node.terms.slice(0, 3);
      }
      session.updatedAt = new Date();
      await session.save();
    }

    res.json(node);
  } catch (err) {
    res.status(500).json({ error: 'Failed to save node' });
  }
});

export default router;
