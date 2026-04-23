# Prompt Audit — Output-Token Optimization (Advisory)

**Status:** Advisory only. No prompt edits have been applied. All recommendations require explicit approval before being implemented.

**Context:** User flagged that output tokens are 4–5× input tokens, making output reduction the highest-leverage optimization. Target: 100-course CSV should cost ≤ $10. Baseline will be measured via the new admin cost logging (Item 1) on first production run.

**Sources referenced:**
- `src/lib/prompts.ts` — `DEFAULT_SEED_PROMPT`, `DEFAULT_ANALYSIS_PROMPT`
- `src/app/api/keywords/analyze/route.ts` — batch size 150, concurrency 6, model chain
- `src/lib/ai-client.ts` — default model `google/gemini-3.1-flash-lite-preview`
- `src/app/page.tsx` — downstream field consumption in CSV exports and UI

---

## 1. Current output schema (analyze route — the expensive call)

Per keyword, the AI is asked to return 20 fields inside `analyzedKeywords[]`:

| Field | Type | Used in UI table? | Used in any CSV export? | Notes |
|---|---|---|---|---|
| `keyword` | string | ✅ | ✅ | Required |
| `avgMonthlySearches` | number | ✅ | ✅ | Required (echoed from input) |
| `competition` | string | ✅ | ✅ | Required (echoed from input) |
| `competitionIndex` | number | ❌ | ✅ (component-level CSV only) | Echoed from input |
| `courseRelevance` | number (0–10) | ✅ (expand-row) | ✅ (component CSV) | Also used to compute `finalScore` |
| `relevanceStatus` | enum (7 values) | ✅ | ✅ | Used for filtering |
| `conversionPotential` | number (0–10) | ✅ (expand-row) | ✅ (component CSV) | |
| `searchIntent` | number (0–10) | ✅ (expand-row) | ✅ (component CSV) | |
| `vendorSpecificity` | number (0–10) | ✅ (expand-row) | ✅ (component CSV) | |
| `keywordSpecificity` | number (0–10) | ✅ (expand-row) | ✅ (component CSV) | |
| `actionWordStrength` | number (0–10) | ✅ (expand-row) | ✅ (component CSV) | |
| **`commercialSignals`** | number (0–10) | ❌ | ❌ | **Pure waste** |
| **`negativeSignals`** | number (0–10) | ❌ | ❌ | **Pure waste** |
| **`koenigFit`** | number (0–10) | ❌ | ❌ | **Pure waste** |
| `baseScore` | number | ❌ | ✅ (component CSV only) | Derivable: sum of 9 scores |
| `competitionBonus` | number | ❌ | ✅ (component CSV only) | Derivable: {LOW:10, MED:5, HIGH:0} |
| `finalScore` | number | ✅ | ✅ | Required (baseScore + competitionBonus) |
| `tier` | enum (6 values) | ✅ | ✅ | Required |
| `matchType` | enum (3 values) | ✅ | ✅ | Required |
| `action` | enum (7 values) | ✅ | ✅ | Required |
| `exclusionReason` | string (prose) | ❌ | ✅ (component CSV only) | Often "Contains negative term 'udemy'" |
| `priority` | enum (5 values + emoji) | ✅ | ✅ | Required |

---

## 2. Ranked opportunities (by impact vs. risk)

### 🟢 Tier A — Zero-regression, prompt-only changes

**A1. Remove `commercialSignals`, `negativeSignals`, `koenigFit` from the output schema.**
- These three fields are never rendered in any UI, never exported in any CSV from `page.tsx`.
- The only place they appear is the component-level CSV at `keyword-results-table.tsx:108-115`, which isn't used in the primary export flows.
- They are currently computed by the AI, JSON-encoded, and discarded.
- **Estimated savings: 15–20% of output tokens.**
- **Risk:** None, as long as component-level CSV is either updated to not expect them or the fields are silently dropped.
- **Effort:** Prompt edit only — remove lines 7, 8, 9 from SCORING CRITERIA and corresponding lines 112, 113, 114 in the output schema.

**A2. Drop `baseScore` and `competitionBonus` from the output.**
- Both are derivable client-side:
  - `baseScore = sum of the remaining 6 scoring fields` (after A1 is applied)
  - `competitionBonus = { LOW: 10, MEDIUM: 5, HIGH: 0 }[competition]`
- Only `finalScore` needs to come from the AI (or even that can be computed client-side).
- **Estimated savings: additional 3–5% of output tokens.**
- **Risk:** Must add client-side computation in the analyze route response normalizer (~10 lines).
- **Effort:** Prompt edit + small route-level normalization pass.

### 🟡 Tier B — Minor UX trade, bigger savings

**B1. Collapse `relevanceStatus` from 7 values to 5.**
- Current: `EXACT_MATCH | DIRECT_RELATED | RELATED | TANGENTIAL | DIFFERENT_PRODUCT | DIFFERENT_VENDOR | NOT_RELEVANT`
- Proposed: `EXACT | DIRECT | RELATED | TANGENTIAL | NOT_RELEVANT` (merge the two "different" buckets into NOT_RELEVANT)
- **Estimated savings: 2–3% output tokens** (shorter string length per keyword × N keywords).
- **Risk:** UI filters that rely on `DIFFERENT_PRODUCT` or `DIFFERENT_VENDOR` specifically would need updating. A grep in `page.tsx` confirms these aren't used for filtering — but check again before applying.
- **Effort:** Prompt + `src/types/index.ts` union update + verify UI.

**B2. Turn `exclusionReason` into a short enum instead of prose.**
- Current: freeform strings like "Contains competitor term 'udemy'".
- Proposed: enum `COMPETITOR | SALARY | LOW_RELEVANCE | DIFFERENT_VENDOR | OTHER` (with a client-side lookup for display text).
- **Estimated savings: 2–4% on excluded keywords** (only populates for EXCLUDE rows).
- **Risk:** If the rich text is ever useful for debugging, we lose it. Mitigation: keep a `reasonDetail?: string` optional field for rare debug runs.
- **Effort:** Prompt + types + UI label map.

**B3. Convert `tier` to a short numeric value.**
- Current: `"Tier 1" | "Tier 2" | "Tier 3" | "Tier 4" | "Review" | "Exclude"` (avg ~7 chars per value with quotes + JSON key overhead).
- Proposed: `1 | 2 | 3 | 4 | 0 | -1` or keep `"T1" | ... | "RV" | "EX"`.
- **Estimated savings: 1–2% output tokens.**
- **Risk:** More sweeping — filters, badges, exports all reference tier strings. Requires coordinated UI pass.
- **Effort:** Moderate (prompt + types + several UI touches).

### 🔴 Tier C — Risky, requires load testing

**C1. Right-size `maxTokens` per batch** (currently auto-clamped via `MODEL_OUTPUT_CAPS`).
- Already handled well via `model-caps.ts` (`TOKENS_PER_KEYWORD × batch_size + PER_REQUEST_OVERHEAD_TOKENS`). Not a real opportunity here — already optimized.

---

## 3. Estimated cumulative impact

Assuming 100 courses × 300 keywords/course average = 30,000 keywords × ~220 output tokens/keyword = ~6.6M output tokens per full run.

| Scenario | Output token reduction | Cost impact (at $0.30/M output, Gemini 3.1 Flash Lite) |
|---|---|---|
| **Conservative (A1 only)** | ~18% | Save ~$0.36 per 100-course run |
| **Moderate (A1 + A2)** | ~22% | Save ~$0.44 per 100-course run |
| **Aggressive (A1 + A2 + B1 + B2)** | ~28% | Save ~$0.55 per 100-course run |

**Honest note:** Because Gemini 3.1 Flash Lite is already cheap (~$0.30/M output), the absolute savings are modest on the current default model. If cost logging reveals usage has shifted to a more expensive fallback (gemini-3-flash-preview at $2.50/M, or gpt-4o at $10/M), the same % reduction becomes much more impactful.

Decision rule: apply A1 unconditionally (zero regression). Decide A2/B1/B2 after seeing real measured cost from Item 1.

---

## 4. Prompt caching (Item 6) — structural change, not content change

### What prompt caching is

Providers cache the beginning of a prompt so a second request with the same prefix pays a discounted rate on the cached portion. The static parts of our analysis prompt (the system message, the scoring criteria, the exclusion rules, the output schema spec) are identical across every course and every keyword batch. Only the variable suffix (course name, certification, vendor, keywords table) changes.

### Provider support matrix (as of 2026-04)

| Provider / Model path | Caching behavior | Our activation cost |
|---|---|---|
| **OpenAI GPT-4o / GPT-4o-mini** | Automatic caching at ≥1024 prompt tokens; cached portion billed at 50% | Free. Just place static content first. |
| **Anthropic Claude via OpenRouter** | Explicit `cache_control: { type: 'ephemeral' }` markers; 50–90% discount on cached portion | Requires OpenAI SDK `messages` array to use content blocks with cache markers — minor code change. |
| **Gemini 3.x via OpenRouter (our default)** | Implicit caching kicks in at ≥32K tokens of prompt; our prompts are ~2–3K, so NOT triggered | No automatic benefit. Explicit Google Context Caching API isn't cleanly exposed through OpenRouter. |

### Structural recommendation (safe, zero-risk)

Restructure the analysis prompt so the **static** content comes first and the **variable** content comes last. This already yields caching benefit on any request that routes through OpenAI (via fallback) or Claude (if added to the chain), without affecting Gemini behavior at all.

**Current order** (simplified):
```
Context (course, cert, vendor, related terms) ← VARIABLE
Scoring criteria                               ← STATIC
Exclusion rules                                ← STATIC
Output schema                                  ← STATIC
KEYWORDS_DATA block                            ← VARIABLE
```

**Proposed order**:
```
Scoring criteria                               ← STATIC (cache prefix)
Exclusion rules                                ← STATIC
Output schema specification                    ← STATIC
---
Context (course, cert, vendor, related terms) ← VARIABLE
KEYWORDS_DATA block                            ← VARIABLE
```

The prompt content doesn't change — only the order. This makes the shared prefix ~2K tokens (the scoring + exclusion + schema sections), which is large enough for OpenAI auto-caching (1024+).

**Estimated savings (conditional):**
- On the current default Gemini 3.1 Flash Lite: **0%** (implicit caching not triggered at this size).
- On any OpenAI fallback path (GPT-4o-mini): ~10% of total cost (~50% of 20% input share) once the prefix is cached.
- On any future Claude route: ~30% of total cost if the full static section is wrapped in `cache_control`.

### Implementation path (when approved)

1. Reorder `DEFAULT_ANALYSIS_PROMPT` template so variables land at the end. Bump `seedPromptVersion` / `analysisPromptVersion` so the cache probe invalidates.
2. (Optional, Anthropic-only) Wrap the static section in a content block with `cache_control: { type: 'ephemeral' }` when `provider === 'openrouter'` and model includes `anthropic/`.
3. Measure input token delta (expect cached portion of `prompt_tokens` to drop ~50% on repeat runs when on OpenAI).

---

## 5. Recommended rollout

1. **Wait for first cost data** from Item 1 (admin cost logging). Query:
   ```
   npx convex run runCosts:getRunCosts '{"days":1}'
   ```
2. **If 100-course run > $10:** approve A1 (remove 3 unused fields) as a zero-regression quick win. Typical diff is ~10 lines in `src/lib/prompts.ts` and a version bump.
3. **If still > $10 after A1:** approve A2, B1, or both — each gets ~5–10% more savings at minor UI cost.
4. **Cache restructure (Item 6):** apply concurrently with any prompt edit, since the prompts are already being touched. Zero risk on current Gemini path; forward-compatible savings.

No edits will be made to `src/lib/prompts.ts` until these recommendations are explicitly approved.
