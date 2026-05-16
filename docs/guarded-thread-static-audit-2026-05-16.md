# Guarded Thread Static Audit

Date: 2026-05-16

Scope: static audit of the product loop from capture input to guarded work thread display. This does not propose immediate code movement. It identifies which semantic fields currently carry product value, where they can drift, and which scenarios should become stable probes before more feature work.

## Current Loop

The core product loop is no longer "capture text, summarize card, show card." It is:

1. Capture a messy work-memory packet from `manual_chaos`, `tg_text`, or `tg_url`.
2. Convert it into `threadCache` semantics:
   - `chasing`
   - `nextMove`
   - `waitingOn`
   - `meanwhile`
   - `workingJudgment`
   - `ruledOut`
   - `sideThread`
   - `expiresWhen`
3. Keep the newest real thread visible as `rememberedThread`.
4. In the workbench, use age and waiting state to decide whether the user should resume, keep guarding, do a parallel move, release, or record a Claude result.

This direction is coherent. The highest-value behavior is when the user sees "what to do now" and "what not to idle around" without opening a full card.

## Scenario Matrix

| # | Scenario | Example Input | Expected Semantic Center | Current Chain Assessment | Risk |
| --- | --- | --- | --- | --- | --- |
| 1 | Manual chaos with explicit waiting and meanwhile | `A 在等别人回复，这会儿先把 B 的验收补完，别围着 A 干等。` | `waitingOn=A 在等别人回复`, `meanwhile=先把 B 的验收补完`, `nextMove=先把 B 的验收补完` | Strong. `hasWaitingSignal`, `findActiveMoveWhileWaiting`, `extractWaitingOn`, and workbench waiting strips align well. | Regex phrasing coverage is narrow; "等客户拍板/等 CI" variants should be probed. |
| 2 | Manual chaos with ruled-out path | `我怀疑不是 URL 抽取失败，是 recall 去噪没压住；别再改 prompt，下一步看 scoring。` | `workingJudgment=我怀疑...`, `ruledOut=不是/别再改 prompt`, `nextMove=看 scoring` | Medium. `extractTentativeJudgment` and `extractRuledOut` catch many forms, but `nextMove` depends on explicit marker quality. | `cleanNextMoveCandidate` may over-trim around Chinese punctuation and lose the useful verb. |
| 3 | Tab drift reset with no explicit main line | `开了太多标签页，丢线了，先回到交付这个设置页。` | Generic drift title only if no declared thread; otherwise guard declared work | Strong for current examples. `isThreadDriftText` plus `extractDeclaredThreadLabel` prevents overly generic title when "回到..." exists. | "窗口太多/资料太多/查偏了" may miss drift intent. |
| 4 | Telegram text low signal | `ok` / `哈哈` / `ping` | No guarded thread, knowledge tag `Telegram ping`, excluded from remembered thread | Strong. Low-signal tg_text returns `threadCache=null` and recall excludes ping-like cards. | Borderline short-but-real messages can be overfiltered, e.g. `CI 过了`. |
| 5 | Telegram text as real next action | `今晚先把 onboarding 里的权限弹窗文案收掉，别再改布局。` | `chasing=权限弹窗文案`, `ruledOut=别再改布局`, `nextMove=收掉权限弹窗文案` | Medium. Fallback can produce useful guarded thread, but title extraction may be less precise than manual chaos. | tg_text has no manual-chaos prompt path, so real work notes rely heavily on fallback heuristics when LLM is disabled or fails. |
| 6 | URL capture with readable article | Article URL with extracted text | Treat as on-demand reference, not a new main task | Strong philosophically. Fallback explicitly says pull one fact/step and close tab. | If LLM succeeds, prompt may still produce "read this article" style cards unless guarded by prompt/test probes. |
| 7 | URL capture failure | URL fetch failed/no readable content | Not a guarded work thread; should say retry only if it still matters | Strong. `isUrlExtractionFailure` returns link retry card with `threadCache=null`, excluded from remembered thread by tag. | User may expect failed URL plus context to become guarded thread; current logic treats source as URL failure first. |
| 8 | Claude dispatch launched and result recorded | Workbench dispatch whole thread, then paste result | Result visible on same thread, waiting fields cleared, fresh resolve strip appears | Strong. `captureClaudeDispatchResult` persists result and `clearResolvedWaiting` clears active waiting. | Result editor state is local to workbench; abandoned typed result summary is not draft-protected. |
| 9 | Cold waiting thread | Same waiting note after 24h | Workbench should suggest release or doing something else | Strong. Age state flows through `getGuardedThreadAgeState` and `getThreadWaitingReminder`; UI shows `先放下` for cold waiting. | Cold threshold is global; some waiting threads should remain important longer than 24h. |
| 10 | Recovered failed manual input | App died or LLM failed after item insert | Restore raw manual note to workbench input, not a hidden failed item | Strong after current recovery work. `getRecoverableChaosDraft` and renderer restoration close the loss loop. | Recovery only restores the newest failed/pending manual item; multiple unfinished notes are not surfaced. |
| 11 | Related recall across same thread | New manual note similar to earlier card | Related card should help bundle continuity without hijacking current line | Medium. Embedding/lexical + recency is pragmatic, but only two related cards are surfaced. | Related reason is retrieval-centric, not action-centric; UI may show "similar" without saying why it matters now. |
| 12 | Cross-language manual continuation | English note follows Chinese thread or vice versa | Manual chaos may still relate across languages if semantically same | Medium. Cross-language tg_text is filtered, but manual_chaos allows cross-language scoring. | Manual cross-language recall depends on embedding availability; lexical fallback will likely fail. |

## Field Value Assessment

High-value fields that should be protected with probes:

- `waitingOn`: drives "do not idle around this" behavior in mini, compact, and expanded UI.
- `meanwhile`: turns waiting into an actionable parallel move.
- `nextMove`: the most visible field across remembered strips, compact cards, workbench thread panel, and history summaries.
- `ruledOut`: prevents drift back into discarded branches, but it is currently under-displayed compared with its product value.
- `waitingResolvedAt`: gives the product a sense that "the wait came back"; this makes Claude result capture feel connected.

Lower-value or risky fields:

- `knowledgeTag`: useful for filtering and recall, but weak as visible UI copy.
- `petRemark`: valuable for tone, but should not become a semantic fallback for action.
- `expiresWhen`: useful in cold state, but currently too generic in fallback (`this thread is cold or settled`), so it rarely carries specific decision value.

## Files Approaching Split Boundaries

### `src/main/llm/digest-card.ts`

This file is already doing at least six jobs:

- Prompt construction
- LLM response parsing
- Language consistency enforcement
- Low-signal and URL-failure classification
- Fallback digest generation
- Thread-cache semantic extraction
- Pet remark generation

Do not split it by "helper size" first. Split it by semantic ownership:

1. `digest/thread-semantics.ts`
   Owns `hasWaitingSignal`, `extractWaitingOn`, `findActiveMoveWhileWaiting`, `extractRuledOut`, `extractTentativeJudgment`, `buildThreadCache`.
2. `digest/fallbacks.ts`
   Owns low-signal, URL failure, URL reference, telegram text, and chaos reset fallback builders.
3. `digest/parsing.ts`
   Owns JSON extraction, schema coercion, language-safe coercion.
4. `digest/prompts.ts`
   Owns prompt assembly and prompt file loading calls.

Verification before splitting:

- Snapshot fallback outputs for the scenario matrix above with LLM disabled.
- Keep `generateDigestDraft` as the public entry point during the first split.
- Do not change prompt text and extraction heuristics in the same PR.

### `src/renderer/components/PetWorkbench.tsx`

This component is a product surface, not just a large React file. Splitting should preserve the guarded-thread narrative.

Suggested boundaries:

1. `WorkbenchResumeStrip`
   Owns remembered thread, waiting summary, `接回`, `继续守着`, `先放下`.
2. `WorkbenchThreadPanel`
   Owns active thread bundle, waiting note, Claude dispatch/result capture.
3. `WorkbenchCaptureBox`
   Owns clipboard offer, manual textarea, submit action, draft note display.
4. `WorkbenchHistoryFold`
   Owns ranked history and `刚放下` marker.

Verification before splitting:

- UI smoke should keep the same visible assertions for expanded workbench, cold waiting, fresh resolve, compact card return, and draft recovery.
- Split only presentational props first; do not move state ownership until the component seams are stable.

## Recommended Next Probes

Add a small scenario probe suite before deeper refactors. It should run with LLM and embeddings disabled so fallback semantics are deterministic.

Minimum probe cases:

1. Waiting + meanwhile Chinese manual chaos.
2. Ruled-out prompt/scoring Chinese manual chaos.
3. Tab drift with declared main line.
4. Low-signal Telegram ping.
5. Real Telegram text next action.
6. URL failure with no extracted text.
7. Readable URL reference fallback.
8. Cold waiting age rendering in workbench.
9. Claude result capture clears waiting.
10. Recovered failed manual input restores raw text.

For each case, assert:

- card title
- `threadCache.chasing`
- `threadCache.nextMove`
- `threadCache.waitingOn`
- `threadCache.meanwhile`
- `threadCache.ruledOut`
- whether it can become `rememberedThread`
- the shortest user-visible workbench line

## Product Judgment

The architecture is still pointed in the right direction. The product's moat is not the digest itself; it is the continuity between a messy moment, a guarded thread, waiting-aware UI, and a result coming back into the same line.

The next risky expansion is adding more features into `digest-card.ts` or `PetWorkbench.tsx` without scenario probes. The safest next investment is not immediate refactor. It is a deterministic "guarded thread scenario" test layer that makes the product semantics hard to accidentally break.

