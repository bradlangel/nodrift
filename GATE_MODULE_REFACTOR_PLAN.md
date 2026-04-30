# Gate Module Refactor Plan

Temporary tracking doc for grouping each access gate with its direct dependencies.
Delete this once the refactor is complete and the durable architecture notes are
updated.

Status: implemented in `src/gates/` and documented in `ARCHITECTURE.md`.

## Decision

Use a vertical slice per access gate inside `src/gates/`.

Each gate should be able to define its own decision logic, provider adapters,
block-page action metadata, and configuration requirements from one folder. The
service worker should stay responsible for Chrome API orchestration and applying
approved decisions to dynamic rules.

## Why

- Integration-backed gates are currently split across `src/gates/`,
  `src/integrations/`, `src/block-page/`, `redirect.js`, and `options.js`.
- The block page has a separate hard-coded action registry from the TypeScript
  capability registry, which makes gate behavior easy to duplicate or drift.
- Adding a new gate should feel like adding one compiled-in module, not touching
  several unrelated registries by memory.

## Target Shape

```text
src/gates/
  temporary-allow/
    gate.ts
    manifest.ts
    index.ts

  local-intent/
    gate.ts
    manifest.ts
    index.ts

  llm-reviewed/
    gate.ts
    decision.ts
    manifest.ts
    policy.ts
    providers/
      chrome-local.ts
      openai.ts
    index.ts

  registry.ts
```

## Module Contract Sketch

```ts
export type GateModule = {
  id: string;
  gate: AccessGate;
  action: BlockPageActionCapability;
  integrations?: OptionalIntegration[];
  isConfigured?: (settings: unknown) => boolean;
};
```

This contract may need to split pure decision gates from request-review gates if
provider calls need a richer async lifecycle.

## Boundary Rules

- Gate decision logic should stay testable without Chrome APIs.
- Provider code that only exists for one gate should live under that gate.
- Shared provider-independent contracts stay in `src/core/`.
- Shared browser orchestration stays in `src/block.ts` until there is a clear
  reason to extract it.
- The decision application pipeline remains shared.
- Block-page rendering should consume gate/action metadata from one registry.

## Migration Checklist

- [x] Create `src/gates/temporary-allow/` and move the temporary allow gate into
      it.
- [x] Create `src/gates/local-intent/` and move local intent gate logic into it.
- [x] Create `src/gates/llm-reviewed/` and move LLM decision, policy, and
      provider adapters into it.
- [x] Add `src/gates/registry.ts` as the single compiled-in gate registry.
- [x] Replace `BLOCK_PAGE_ACTION_CAPABILITIES` with metadata from the registry,
      or make it a derived export.
- [x] Reduce the hard-coded action registry in `redirect.js`; ideally the block
      page gets the current action model from the service worker.
- [x] Make options use the same gate metadata for the access-gate selector.
- [x] Update tests to mirror the new gate folder names.
- [x] Update `ARCHITECTURE.md` after the shape is proven.

## Open Questions

- Should `redirect.js` stay plain JavaScript, or should the block-page script
  move into `src/` and be compiled too? For now it stays plain JavaScript and
  consumes the service worker's action model.
- Should the service worker expose block-page action metadata through a
  `get-block-page-actions` message instead of duplicating action definitions in
  page code? Yes; the block page now uses that message.
- Does `GateModule` need separate `review` and `decide` steps for LLM-backed
  gates, or is that an internal detail of the LLM gate module?
- Should optional non-gate actions like ChatGPT peek become action modules
  parallel to gate modules?
