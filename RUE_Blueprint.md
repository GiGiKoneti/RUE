# 🧠 Recursive Understanding Engine (RUE)
## Project Blueprint & Integration Documentation
### HackMarch 2.0 — DSCE Summit | BuilderThinking PS2

---

> **This document is the single source of truth.**
> Both team members build strictly from this blueprint.
> Every interface, contract, and integration point is defined here.
> If something is not in this doc — discuss before building.

---

## 👥 Team

| Member | Role | Responsibility |
|---|---|---|
| **GiGi Koneti** | Backend + Logic + RLM Engine | Context anchoring, LLM orchestration, API routes, caching layer, term extraction logic |
| **Abhishek RP** | Frontend + UI/UX | All visual components, interaction design, breadcrumb navigation, animation, user flows |

---

## 🧬 Core Concept (Read This First)

RUE is a **Recursive Understanding Engine** — inspired by Recursive Language Models (RLMs) from MIT CSAIL (Zhang, Kraska, Khattab, 2025).

**The philosophical difference from a chatbot:**

> Most AI tools assume: *"Answer given = Understanding achieved."*
> RUE challenges this. True understanding is achieved only when every conceptually non-trivial term in an answer is itself understood — recursively, and always anchored to the original question.

**The RLM Parallel:**

| RLM Paper | RUE System |
|---|---|
| LLM treats long prompt as external environment | RUE treats a concept as an external knowledge graph |
| Recursively decomposes prompt into sub-tasks | Recursively decomposes answer into sub-concepts |
| Each recursive call is context-bounded | Each drill-down stays anchored to root question |
| Sub-results aggregate into final answer | Sub-explanations aggregate into full understanding |

**The Key Innovation — Contextual Anchoring:**
Every recursive sub-explanation carries the full parent context chain. "Architecture" explained in the context of LIME will be different from "Architecture" explained in the context of Transformers. This prevents topic drift — the core problem naive implementations suffer from.

---

## 🗂️ Folder Structure

```
RUE/
├── README.md                         ← Project overview (copy from this doc's summary)
├── .env.local                        ← API keys (NEVER commit this)
├── .env.example                      ← Template for env vars (commit this)
├── .gitignore
├── package.json                      ← Root dependencies
├── next.config.js                    ← Next.js configuration
├── tsconfig.json
│
├── 🔴 backend/                       ← GIGI'S DOMAIN
│   ├── lib/
│   │   ├── rlm/
│   │   │   ├── anchor.ts             ← Core: Context Anchoring logic
│   │   │   ├── extractor.ts          ← Core: Term extraction from LLM response
│   │   │   ├── recursion.ts          ← Core: Manages recursion depth + stopping
│   │   │   └── types.ts              ← All shared TypeScript types/interfaces
│   │   │
│   │   ├── cache/
│   │   │   ├── kv.ts                 ← Upstash Redis KV client setup
│   │   │   ├── hashKey.ts            ← Generates cache keys from context chain
│   │   │   └── warmup.ts             ← Pre-warms cache for demo golden paths
│   │   │
│   │   ├── llm/
│   │   │   ├── client.ts             ← Anthropic Claude API client setup
│   │   │   ├── prompts.ts            ← ALL prompt templates (most critical file)
│   │   │   └── schema.ts             ← Zod schemas for structured LLM output
│   │   │
│   │   └── utils/
│   │       ├── logger.ts             ← Simple request/error logger
│   │       └── validator.ts          ← Input validation helpers
│   │
│   └── tests/
│       ├── extractor.test.ts         ← Unit tests for term extraction
│       ├── anchor.test.ts            ← Unit tests for context anchoring
│       └── golden-paths.ts           ← Pre-defined demo queries for warmup
│
├── 🔵 frontend/                      ← ABHISHEK'S DOMAIN
│   ├── app/
│   │   ├── layout.tsx                ← Root layout, fonts, global providers
│   │   ├── page.tsx                  ← Landing / home page
│   │   └── explore/
│   │       └── page.tsx              ← Main exploration interface
│   │
│   ├── components/
│   │   ├── core/
│   │   │   ├── QueryInput.tsx        ← Initial question input box
│   │   │   ├── AnswerPanel.tsx       ← Displays LLM answer with highlighted terms
│   │   │   ├── TermChip.tsx          ← Individual clickable term badge
│   │   │   └── SubExplanation.tsx    ← Drawer/panel showing sub-explanation
│   │   │
│   │   ├── navigation/
│   │   │   ├── BreadcrumbTrail.tsx   ← Shows recursion path (LIME → model-agnostic → ...)
│   │   │   ├── DepthIndicator.tsx    ← Visual indicator of current recursion depth
│   │   │   └── BackButton.tsx        ← Navigate up one level in recursion
│   │   │
│   │   ├── feedback/
│   │   │   ├── UnderstoodButton.tsx  ← "I understand this" — collapses current level
│   │   │   ├── LoadingState.tsx      ← Streaming skeleton / loading animation
│   │   │   └── ErrorState.tsx        ← Graceful error display
│   │   │
│   │   └── layout/
│   │       ├── Header.tsx
│   │       └── ConceptTree.tsx       ← Optional: Visual tree of explored concepts
│   │
│   ├── hooks/
│   │   ├── useRUE.ts                 ← 🔴🔵 PRIMARY INTEGRATION HOOK
│   │   │                                Calls backend API, manages state
│   │   ├── useExploration.ts         ← Manages recursion state (path, depth, history)
│   │   └── useStream.ts              ← Handles streaming LLM responses
│   │
│   ├── store/
│   │   └── explorationStore.ts       ← Zustand store for global exploration state
│   │
│   └── styles/
│       ├── globals.css
│       └── tokens.css                ← Design tokens (colors, spacing, typography)
│
└── 🟣 app/api/                       ← INTEGRATION ZONE (Both touch this)
    ├── ask/
    │   └── route.ts                  ← POST /api/ask — Initial question handler
    ├── explore/
    │   └── route.ts                  ← POST /api/explore — Term drill-down handler
    └── warmup/
        └── route.ts                  ← POST /api/warmup — Cache pre-warming (demo prep)
```

---

## 🔴 GiGi's Work — Backend & RLM Logic

### Your Core Files

#### 1. `backend/lib/rlm/types.ts` — The Contract (Write This First)
This file defines every data structure both you and Abhishek will use. **Write this before anything else.**

```typescript
// Every interface both sides depend on lives here

export interface RootQuestion {
  id: string;           // UUID
  text: string;         // "What is LIME in AI?"
  timestamp: number;
}

export interface ContextChain {
  rootQuestion: string;           // Always the original question
  explorationPath: string[];      // ["model-agnostic", "architecture"]
  currentDepth: number;           // 0 = root, max = 3
}

export interface ExtractedTerm {
  term: string;                   // "model-agnostic"
  reason: string;                 // Why this term is conceptually important
  difficultyScore: number;        // 1-5, used to prioritize which terms to show
}

export interface RUEResponse {
  explanation: string;            // The LLM's explanation (streamed)
  extractedTerms: ExtractedTerm[]; // 3-5 key terms from this explanation
  contextChain: ContextChain;     // Full context passed back to frontend
  cached: boolean;                // Was this served from cache?
  depth: number;                  // Current recursion depth
}

export interface APIRequest {
  question?: string;              // For /api/ask (initial)
  term?: string;                  // For /api/explore (drill-down)
  contextChain?: ContextChain;    // For /api/explore (full history)
}
```

---

#### 2. `backend/lib/llm/prompts.ts` — The Most Critical File
Your entire product quality depends on these prompts. Spend the most time here.

```typescript
// PROMPT 1: Initial Answer Generation
export const INITIAL_ANSWER_PROMPT = (question: string) => `
You are RUE — a Recursive Understanding Engine.
A user has asked: "${question}"

Your task:
1. Give a clear, accurate answer in 3-5 sentences.
2. Write for someone who is SMART but UNFAMILIAR with the domain.
3. Do NOT use jargon without introducing it.
4. Be precise. Be concise.

Respond ONLY with the answer text. No preamble.
`;

// PROMPT 2: Term Extraction (Returns JSON)
export const TERM_EXTRACTION_PROMPT = (answer: string, context: ContextChain) => `
You are analyzing this explanation:
"${answer}"

Original question this explanation is connected to: "${context.rootQuestion}"
Exploration path so far: ${context.explorationPath.join(" → ") || "None (this is the root answer)"}

Your task: Identify 3 to 5 terms from this explanation that:
- Are conceptually non-trivial
- Would be confusing to someone unfamiliar with the domain
- Are IMPORTANT for understanding the original question: "${context.rootQuestion}"
- Are NOT already explained in the path: ${context.explorationPath.join(", ")}

DO NOT pick: articles, prepositions, simple verbs, or already-explained terms.

Respond ONLY with this exact JSON. No markdown, no preamble:
{
  "terms": [
    {
      "term": "exact term from the text",
      "reason": "one sentence on why this matters for understanding",
      "difficultyScore": 3
    }
  ]
}
`;

// PROMPT 3: Sub-Explanation with Contextual Anchoring (YOUR KEY INNOVATION)
export const ANCHORED_EXPLANATION_PROMPT = (
  term: string,
  context: ContextChain
) => `
You are RUE — a Recursive Understanding Engine.

The user is trying to understand: "${context.rootQuestion}"
They have been exploring: ${context.explorationPath.join(" → ")}
They now want to understand: "${term}"

Your task:
1. Explain "${term}" clearly in 2-4 sentences.
2. CRITICAL: Your explanation must stay relevant to "${context.rootQuestion}".
   Do NOT explain "${term}" in a general sense if a specific sense is more relevant.
3. Use simple language. Remove jargon where possible.
4. End with one sentence connecting this term back to "${context.rootQuestion}".

Respond ONLY with the explanation text. No preamble.
`;
```

---

#### 3. `backend/lib/rlm/extractor.ts` — Term Extraction Logic

```typescript
import { ContextChain, ExtractedTerm } from './types';
import { TERM_EXTRACTION_PROMPT } from '../llm/prompts';
import { termSchema } from '../llm/schema';

export async function extractTerms(
  explanation: string,
  context: ContextChain
): Promise<ExtractedTerm[]> {
  // 1. Call LLM with extraction prompt
  // 2. Parse JSON response using Zod schema
  // 3. Filter out terms already in context.explorationPath
  // 4. Sort by difficultyScore descending
  // 5. Return top 5 max
}
```

---

#### 4. `backend/lib/rlm/anchor.ts` — Contextual Anchoring (Your Innovation)

```typescript
import { ContextChain } from './types';

// Creates a new context chain when user drills into a term
export function extendContextChain(
  current: ContextChain,
  newTerm: string
): ContextChain {
  return {
    rootQuestion: current.rootQuestion,           // NEVER changes
    explorationPath: [...current.explorationPath, newTerm],
    currentDepth: current.depth + 1,
  };
}

// Checks if we've hit max recursion depth
export function shouldStopRecursion(context: ContextChain): boolean {
  return context.currentDepth >= 3; // Hard cap for hackathon
}

// Goes back one level
export function collapseContextChain(context: ContextChain): ContextChain {
  return {
    rootQuestion: context.rootQuestion,
    explorationPath: context.explorationPath.slice(0, -1),
    currentDepth: context.currentDepth - 1,
  };
}
```

---

#### 5. `backend/lib/cache/hashKey.ts` — Cache Key Generation

```typescript
import { createHash } from 'crypto';
import { ContextChain } from '../rlm/types';

// Unique key for any combination of question + path + term
export function generateCacheKey(context: ContextChain, term?: string): string {
  const raw = JSON.stringify({
    root: context.rootQuestion.toLowerCase().trim(),
    path: context.explorationPath,
    term: term?.toLowerCase().trim() ?? '__root__',
  });
  return createHash('md5').update(raw).digest('hex');
}
```

---

#### 6. API Routes — The Integration Points

**`app/api/ask/route.ts`** (Initial question)
```typescript
// INPUT:  { question: string }
// OUTPUT: RUEResponse (streamed)
// FLOW:
//   1. Validate input
//   2. Create initial ContextChain (empty path, depth 0)
//   3. Check cache (hashKey with __root__)
//   4. If MISS: Call LLM for answer → extract terms → cache
//   5. Return RUEResponse with explanation + extractedTerms + contextChain
```

**`app/api/explore/route.ts`** (Term drill-down)
```typescript
// INPUT:  { term: string, contextChain: ContextChain }
// OUTPUT: RUEResponse (streamed)
// FLOW:
//   1. Validate input
//   2. Check shouldStopRecursion(contextChain)
//   3. Extend context chain with new term
//   4. Check cache (hashKey with term + full path)
//   5. If MISS: Call LLM with ANCHORED prompt → extract terms → cache
//   6. Return RUEResponse
```

---

### GiGi's Task Checklist

```
[ ] Write types.ts first — unblocks Abhishek immediately
[ ] Set up Upstash Redis KV (5 mins on upstash.com)
[ ] Write all 3 prompts in prompts.ts
[ ] Implement extractor.ts with Zod validation
[ ] Implement anchor.ts context chain functions
[ ] Implement hashKey.ts
[ ] Build /api/ask route with streaming
[ ] Build /api/explore route with streaming
[ ] Build /api/warmup route for demo prep
[ ] Write golden-paths.ts with 5 demo queries
[ ] Run warmup script night before demo
[ ] Test all edge cases (depth limit, empty terms, bad input)
```

---

## 🔵 Abhishek's Work — Frontend & UI/UX

### Design Direction
The judge is a UI/UX designer from the USA. This means:
- **No generic Bootstrap/MUI components.** Everything should feel custom.
- **Whitespace is your friend.** Clean > Cluttered.
- **Motion should have meaning.** Animate to communicate, not to decorate.
- **Typography is the hierarchy.** Use font weight and size intentionally.
- **The breadcrumb trail is the hero element.** It must be beautiful and clear.

### Aesthetic Reference
Think: **Notion × Linear × Perplexity AI**
- Clean, minimal, confident
- Monospace accents for technical terms
- Subtle depth (soft shadows, layered panels)
- Dark mode first (technical audience)

---

### Your Core Components

#### 1. `QueryInput.tsx` — First Impression
- Large, centered input
- Subtle placeholder: *"Ask anything... we'll help you truly understand it."*
- On submit: smooth transition to exploration view
- Keyboard shortcut: `Enter` to submit

#### 2. `AnswerPanel.tsx` — The Main Stage
- Displays LLM explanation with **terms highlighted inline**
- Terms appear as subtle underlined chips, not garish highlights
- Streams word-by-word (skeleton loader → text appears)
- After streaming: terms animate in with stagger delay

#### 3. `TermChip.tsx` — The Interaction Unit
```
Visual states:
  Default:   Soft underline, muted accent color
  Hover:     Underline thickens, cursor changes to "explore" icon
  Active:    Filled chip, shows "exploring..." state
  Visited:   Different color to show already explored
  Disabled:  Grayed out (at max depth)
```

#### 4. `BreadcrumbTrail.tsx` — The Hero Element
```
Visual:
  LIME in AI  →  model-agnostic  →  internal architecture
  [root]          [level 1]          [level 2 — current]

Each crumb is clickable to jump back to that level.
Current level is bold/highlighted.
Arrow between crumbs is subtle (→ not >>).
On mobile: collapses to last 2 items + "..."
```

#### 5. `SubExplanation.tsx` — The Drill-Down Panel
- Slides in from right OR appears below (your design call)
- Has its own AnswerPanel + TermChip set
- Has a "I understand this ✓" button that collapses it
- Depth is visually indicated (slight indent or border-left accent)

#### 6. `DepthIndicator.tsx` — Recursion Depth Visualization
```
Depth 0: ○ ○ ○  (3 dots, all empty)
Depth 1: ● ○ ○
Depth 2: ● ● ○
Depth 3: ● ● ●  (max depth — terms disabled)
```
Small, subtle, but communicates the system's state.

---

### Abhishek's Task Checklist

```
[ ] Set up Next.js project with Tailwind + design tokens
[ ] Build QueryInput with transition animation
[ ] Build AnswerPanel with streaming skeleton
[ ] Build TermChip with all visual states
[ ] Build BreadcrumbTrail (most important component)
[ ] Build SubExplanation panel with slide animation
[ ] Build DepthIndicator
[ ] Build UnderstoodButton + collapse animation
[ ] Build LoadingState skeleton
[ ] Build ErrorState component
[ ] Implement useExploration hook (state management)
[ ] Connect useRUE hook to API (integration point)
[ ] Mobile responsive pass
[ ] Final polish: animations, transitions, spacing audit
```

---

## 🟣 Integration Points — Where GiGi's Code Meets Abhishek's

These are the **exact points where both systems connect.** Both must agree on these before building.

---

### Integration Point 1: `frontend/hooks/useRUE.ts`
**This is the most important integration file.**
Abhishek builds the hook shell. GiGi defines the API contract it calls.

```typescript
// frontend/hooks/useRUE.ts
// Abhishek owns this file's internal logic
// GiGi owns what the API returns

import { RUEResponse, ContextChain } from '../../backend/lib/rlm/types';

export function useRUE() {
  // Calls POST /api/ask
  const askQuestion = async (question: string): Promise<RUEResponse> => {};

  // Calls POST /api/explore
  const exploreTerm = async (
    term: string,
    contextChain: ContextChain
  ): Promise<RUEResponse> => {};

  return { askQuestion, exploreTerm, isLoading, error };
}
```

**Agreement required:**
- GiGi must ensure API returns exactly `RUEResponse` shape
- Abhishek must pass exactly `ContextChain` shape to `/api/explore`

---

### Integration Point 2: `backend/lib/rlm/types.ts`
**GiGi writes this. Abhishek imports from it.**
Both sides use the same TypeScript interfaces. No duplicate type definitions anywhere.

```typescript
// Abhishek imports like this:
import type { RUEResponse, ExtractedTerm, ContextChain } 
  from '../../backend/lib/rlm/types';
```

---

### Integration Point 3: Streaming Protocol
GiGi streams the LLM response. Abhishek renders it word-by-word.

**Agreement:**
- GiGi uses `ReadableStream` in the API route
- Abhishek uses `useStream.ts` hook to consume it
- Stream sends explanation text first, then a delimiter `__TERMS__`, then JSON of extracted terms

```
Stream sequence:
"LIME is a model-agnostic technique..." (text chunks)
"__TERMS__"                              (delimiter)
'{"terms": [...]}'                       (JSON, one chunk)
```

---

### Integration Point 4: `ContextChain` State
The `ContextChain` object is the single source of truth for where the user is in the recursion.

- **GiGi** creates, extends, and validates it on the backend
- **Abhishek** stores it in `explorationStore.ts` on the frontend
- **Rule:** Frontend never mutates `ContextChain` directly — it only sends it to the API and receives a new one back

```
Frontend state:
  currentContextChain: ContextChain   ← received from last API response
  history: ContextChain[]             ← stack for back navigation
```

---

### Integration Point 5: Error Handling Contract
GiGi defines error codes. Abhishek renders them.

```typescript
// GiGi sends:
{ error: "MAX_DEPTH_REACHED" }
{ error: "EXTRACTION_FAILED" }
{ error: "INVALID_INPUT" }
{ error: "CACHE_ERROR" }

// Abhishek maps to UI:
"MAX_DEPTH_REACHED" → Show DepthIndicator full + "You've reached the deepest level"
"EXTRACTION_FAILED" → Show "Couldn't find key terms. Try a different question."
"INVALID_INPUT"     → Shake animation on input
"CACHE_ERROR"       → Silent retry once, then show generic error
```

---

### Integration Point 6: Environment Variables
Both sides need these. Stored in `.env.local`.

```bash
# GiGi sets these up, shares with Abhishek securely (NOT via git)
ANTHROPIC_API_KEY=sk-ant-...
UPSTASH_REDIS_REST_URL=https://...
UPSTASH_REDIS_REST_TOKEN=...

# Abhishek uses these (Next.js public vars if needed)
NEXT_PUBLIC_APP_URL=http://localhost:3000
```

---

## 🔁 Development Workflow

### Day 1 — Foundation
```
GiGi:
  ├── Write types.ts (FIRST — unblocks Abhishek)
  ├── Set up Upstash KV
  ├── Write all 3 prompts
  └── Build /api/ask route (mock response ok)

Abhishek:
  ├── Set up Next.js + Tailwind
  ├── Import types.ts from GiGi
  ├── Build QueryInput + AnswerPanel (with mock data)
  └── Build BreadcrumbTrail component
```

### Day 2 — Core Logic
```
GiGi:
  ├── Implement extractor.ts
  ├── Implement anchor.ts
  ├── Build /api/explore route
  └── Test prompts with 10 different queries

Abhishek:
  ├── Build TermChip with all states
  ├── Build SubExplanation panel
  ├── Implement useRUE hook
  └── Connect to real /api/ask endpoint
```

### Day 3 — Integration + Polish
```
Both:
  ├── Full end-to-end test of happy path
  ├── Test edge cases (bad input, max depth, slow API)
  ├── Run warmup script for demo golden paths
  └── Practice demo walkthrough 3 times
```

---

## 🎯 Demo Golden Paths (Pre-Cache These)

Run these through the system the night before. Cache all responses.

```
1. "What is LIME in AI?"
   → "model-agnostic" → "internal structure"

2. "What is gradient descent?"
   → "loss function" → "local minima"

3. "What is a transformer in deep learning?"
   → "attention mechanism" → "query key value"

4. "What is backpropagation?"
   → "chain rule" → "partial derivative"

5. "What is overfitting in machine learning?"
   → "generalization" → "bias variance tradeoff"
```

---

## 🧱 Tech Stack Summary

| Layer | Technology | Owner |
|---|---|---|
| Framework | Next.js 14 (App Router) | Both |
| Styling | Tailwind CSS + CSS Variables | Abhishek |
| Animation | Framer Motion | Abhishek |
| State | Zustand | Abhishek |
| LLM | Anthropic Claude (claude-sonnet-4-20250514) | GiGi |
| AI SDK | Vercel AI SDK | GiGi |
| Schema Validation | Zod | GiGi |
| Cache/KV | Upstash Redis | GiGi |
| Hosting | Vercel | GiGi |
| TypeScript | Strict mode | Both |

---

## 📦 Key Dependencies

```json
{
  "dependencies": {
    "next": "^14.0.0",
    "react": "^18.0.0",
    "typescript": "^5.0.0",
    "tailwindcss": "^3.4.0",
    "framer-motion": "^11.0.0",
    "zustand": "^4.5.0",
    "ai": "^3.0.0",
    "@anthropic-ai/sdk": "^0.24.0",
    "@upstash/redis": "^1.28.0",
    "zod": "^3.22.0",
    "uuid": "^9.0.0"
  }
}
```

---

## ⚠️ Rules for Both Team Members

1. **Never hardcode API keys.** Always use `.env.local`.
2. **Never duplicate type definitions.** Import from `types.ts`.
3. **Never mutate `ContextChain` on the frontend.** Send to API, receive new one.
4. **Never skip the cache check.** Every API call checks KV first.
5. **Always test with the 5 golden paths** before the demo.
6. **Communicate before changing any Integration Point.** Those are shared contracts.
7. **GiGi writes `types.ts` first,** always. Frontend is blocked without it.

---

## 🏆 What Wins This

The judges are looking for:

> *"Not just a chatbot — but a system that breaks knowledge into layers, enables progressive understanding, and demonstrates true learning design thinking."*

Your edge:
- **Research foundation** (RLM paper from MIT — cite it in your pitch)
- **Contextual anchoring** (prevents topic drift — no other team will have this)
- **Pre-warmed cache** (instant responses during demo — looks like magic)
- **Visible recursion** (breadcrumb trail makes the system's thinking visible)
- **A judge who cares about UI** — Abhishek's polish will matter as much as GiGi's logic

---

*Built for HackMarch 2.0 — DSCE Summit*
*Team: GiGi Koneti + Abhishek RP*
*Sponsor: BuilderThinking*
*Inspired by: Recursive Language Models, Zhang et al., MIT CSAIL, 2025*
