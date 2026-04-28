# No Distractions Extension Architecture Notes

This extension keeps a **compiled-in internal module system**. New gates and
integrations are added as TypeScript modules in `src/` and compiled into the
service worker bundle. There is no runtime plugin marketplace.

## Core boundaries

- `src/block.ts` remains the service-worker orchestrator for Chrome APIs.
- Access gate contracts live in `src/access-contracts.ts`.
- Decision shaping for temporary allow lives in `src/access-decisions.ts` and
  `src/temporary-allow-gate.ts`.
- Decision-to-application planning lives in `src/decision-application.ts`.
- Block-page action capabilities and optional integrations live in
  `src/block-page-capabilities.ts`.

## Add a new access gate

1. Implement the `AccessGate` contract from `src/access-contracts.ts`.
2. Accept an `AccessRequestContext` and return an `AccessGateDecision` with one
   of `PASS`, `PASS_WITH_LIMIT`, `FAIL`, or `ASK_FOLLOWUP`.
3. Keep browser API calls out of the gate module.
4. Call the gate from `src/block.ts`, then pass the decision through
   `buildDecisionApplication` to apply side effects.

## Add a new block-page action or integration

1. Add a capability entry to `BLOCK_PAGE_ACTION_CAPABILITIES` with its
   `messageType` and visibility intent.
2. If it is optional (like ChatGPT peek), register it in
   `OPTIONAL_INTEGRATIONS`.
3. Handle the corresponding message in `src/block.ts` and keep business logic in
   focused modules where possible.
