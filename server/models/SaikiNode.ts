import mongoose, { Schema, Document } from 'mongoose';

export interface ISaikiNode extends Document {
  sessionId: string;
  nodeId: string;
  parentId: string | null;
  parentTerm: string | null;
  prompt: string;
  response: string;
  terms: string[];
  summary: string;
  position: { x: number; y: number };
  depth: number;
  childCount: number;
  isFollowUp: boolean;
  masteryStars: number;
  probeHistory: { role: string; content: string }[];
  createdAt: Date;
}

const SaikiNodeSchema = new Schema<ISaikiNode>({
  sessionId: { type: String, required: true, index: true },
  nodeId: { type: String, required: true },
  parentId: { type: String, default: null },
  parentTerm: { type: String, default: null },
  prompt: { type: String, required: true },
  response: { type: String, required: true },
  terms: [String],
  summary: { type: String, default: '' },
  position: { x: Number, y: Number },
  depth: { type: Number, default: 0 },
  childCount: { type: Number, default: 0 },
  isFollowUp: { type: Boolean, default: false },
  masteryStars: { type: Number, default: 0 },
  probeHistory: [{ role: { type: String }, content: { type: String } }],
  createdAt: { type: Date, default: Date.now },
});

export const SaikiNode = mongoose.models.SaikiNode || mongoose.model<ISaikiNode>('SaikiNode', SaikiNodeSchema);
