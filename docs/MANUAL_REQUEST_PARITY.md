# Tracker request parity

The tracker mirrors the existing native standard Focus action for Moneyline,
Spread and Over/Under. Web, iOS and the shared analysis backend are not changed.

Reference sources inspected November 3, 2026 in the Statr app repository:

- `ios/Statr/Statr/Core/Models/StatrModels.swift`: `BetMode.prompt`,
  `Sport.categories(for:)`, `CompileRequest`.
- `ios/Statr/Statr/App/AppModel.swift`: `runSelectedAnalysis`,
  `analysisRequestMessage`, `compiledText(from:)`, `jobRequest`.

Tracker-only adapter: `lib/manualAnalysisRequest.js`.

## Matched behavior

- Exact native market prompts and default `Start Analysis` user message.
- Explicit market Focus, category inventory, sport and matchup context.
- Per-market compile with native includeRaw/indexVector/returnCompiled flags.
- Original compiled Markdown and its vector identifiers/hashes.
- Fresh-conversation user turn; default liveContextRequested false.
- Existing shared backend owns model, reasoning, research and output policy.

Account identity, subscription enforcement, app-only history metadata and
notifications are not impersonated. Tracker scheduling, service credentials,
conversation identifiers and results storage remain operational differences.
No model override or extra betting instructions are introduced.

The tracker no longer reads STATR_ANALYSIS_PROMPT, STATR_ANALYSIS_MESSAGE,
STATR_LIVE_CONTEXT, STATR_INDEX_VECTOR, or per-market bet-mode overrides.
Those old tracker-only options could silently break parity.

The tracker mirrors the native button action, not every possible typed/custom
user request or the web client's different raw template. Equal request settings
do not ensure equal generations. Comparing different times or packet hashes is
not a controlled comparison.

## Verification and remaining work

`npm test` verifies the request contract and the actual compile/jobs call path
with mock transports; it does not start paid analyses. Before claiming
production model-output equivalence, compare a future manual action and tracker
run using the same packet hash and backend deployment.

This release does not reclassify historical results or repair the separately
identified result-parser, confidence-filter, price-extraction or scheduler
cadence issues.
