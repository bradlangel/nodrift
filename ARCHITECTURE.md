# No Distractions Extension Architecture Notes

This extension keeps a **compiled-in internal module system**. New gates and
integrations are added as TypeScript modules in `src/` and compiled into the
service worker bundle. There is no runtime plugin marketplace.

## Core boundaries

- `src/block.ts` remains the service-worker orchestrator for Chrome APIs.
- Shared access contracts live in `src/core/access-contracts.ts`.
- Decision shaping for temporary allow lives in `src/access-decisions.ts` and
  `src/gates/temporary-allow-gate.ts`.
- Agentic request-access intent checks live in `src/gates/agentic-access-gate.ts`.
- Decision-to-application planning lives in `src/core/decision-application.ts`.
- Block-page action capabilities and optional integrations live in
  `src/block-page/block-page-capabilities.ts`.

## Add a new access gate

1. Implement the `AccessGate` contract from `src/core/access-contracts.ts`.
2. Accept an `AccessRequestContext` (or a richer specialized context) and return
   an `AccessGateDecision` with one of `PASS`, `PASS_WITH_LIMIT`, `FAIL`, or
   `ASK_FOLLOWUP`.
3. Keep browser API calls out of the gate module.
4. Call the gate from `src/block.ts`, then pass the decision through
   `buildDecisionApplication` to apply side effects.

## Add a new block-page action or integration

1. Add a capability entry to `BLOCK_PAGE_ACTION_CAPABILITIES` with its
   `messageType` and visibility intent.
2. If the action should be selectable as the block page access gate, add it to
   the options page and store its action id in `accessGateActionId`.
3. If it is optional (like ChatGPT peek), register it in
   `OPTIONAL_INTEGRATIONS`.
4. Handle the corresponding message in `src/block.ts` and keep business logic in
   focused modules where possible.
