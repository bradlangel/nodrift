# Website Blocker Roadmap

This extension should stay a small, soft website blocker: inconvenient enough to
interrupt autopilot, but not a hard lock when access is legitimate.

## Product Principles

- Keep the main flow simple: block, peek, request temporary access, or redirect.
- Prefer reflective friction over mechanical lockouts.
- Treat legitimate work, research, errands, and intentional downtime as valid use.
- Keep usage data local and privacy-preserving.
- Avoid turning the extension into a full productivity suite.
- Keep advanced access mechanisms behind configuration or compiled-in modules,
  not exposed as default block-page clutter.

## Current Direction

- [x] Add small local stats to the block page.
- [x] Add a fuller local stats dashboard page.
- [x] Add a local intent-check "request access" flow that can pass, fail, or ask one follow-up.
- [x] Add an explicitly configured LLM-reviewed request gate (OpenAI first), with fail-closed validation and one follow-up maximum.
- [ ] Add an LLM router provider so users can configure one router API key and
      choose among hosted models without changing extension code.
- [x] Support URL-scoped temporary access internally for future access gates and
      configuration.
- [x] Refactor toward modular access gates and actions before adding more gate
      types.
- [x] Keep the default block page to one visible temporary-allow action.
- [ ] Improve the options page styling and blocked-site editing experience.
- [ ] Add Firefox support once the core Chrome flow feels solid.

## Order of Operations

Avoid a big architecture rewrite up front. Do a small foundation refactor first,
then let each feature prove the next boundary.

1. Light refactor: move shared URL/domain normalization, site matching,
   temporary-allow destination logic, and storage constants into clearer
   modules.
2. Add local stats for blocked attempts, temporary allows, used
   temporary-allow minutes, and recent decisions.
3. Refactor temporary allow into a decision/apply pipeline while preserving the
   current one-click behavior.
4. [x] Add URL-scoped temporary access under the hood to prove the decision
   pipeline can handle more than domain-wide allows.
5. [x] Add the local intent access gate as another decision source.
6. Polish the options page once the real settings and stats surfaces are known.
7. Add Firefox support after the core Chrome flow has settled.

## Modular Architecture

The goal is modular internals, not a full external plugin marketplace. Keep the
extension packaged and simple, but make it easy to enable, disable, and add
compiled-in modules without tangling the core blocker logic.

Core responsibilities:

- Detect and redirect blocked requests.
- Render the block page state.
- Store settings and local usage data.
- Apply allow, deny, re-block, and scoped temporary-access decisions.
- Keep browser API differences contained.

Possible module types:

- Access gates: basic temporary allow, local intent prompt fallback, LLM-reviewed gatekeeper, coding
  challenge proof.
- Context providers: local stats, current time/day, recent decisions, requested
  URL, blocked domain.
- Actions: peek with ChatGPT, redirect, temporary allow, scoped allow,
  copy original URL.
- UI panels: stats summary, request-access form, gate result, options sections.

Default UI boundary:

- The core block page should expose one obvious temporary-access action by
  default.
- Scope handling (`url`, `domain`, or `none`) belongs in the access decision and
  apply pipeline, not in a pair of confusing default buttons.
- More sophisticated choices, such as exact-page access, intent prompts, shorter
  limits, or LLM-reviewed passes, should come from configuration or access
  gate modules.

Target decision contract:

```js
{
  decision: "PASS" | "PASS_WITH_LIMIT" | "FAIL" | "ASK_FOLLOWUP",
  scope: "url" | "domain" | "none",
  minutes: 10,
  message: "Brief user-facing explanation"
}
```

Refactor milestones:

- [ ] Move shared URL/domain normalization into one utility module.
- [x] Move temporary-access decisions behind a single decision/apply pipeline.
- [x] Separate gate decision logic from browser API side effects.
- [x] Make the block page render available actions from configuration while
      preserving one simple default action.
- [ ] Add settings flags for compiled-in modules such as stats, ChatGPT peek,
      and local intent access.
- [x] Add a short architecture note explaining how to add a new access gate.

## Local Stats

Start with simple counters that help the user notice patterns without adding
judgment or heavy analytics.

- [x] Blocked attempts today
- [x] Temporary allows today
- [x] Approximate temporary-allow time used today
- [x] Top blocked domains
- [x] Recent access decisions
- [ ] Longest recent streak without temporary access

Possible placement:

- Block page: compact daily stats near the actions.
- Popup: current site plus today's quick stats.
- Options page: fuller history, reset/export controls, and per-site totals.

## Local Intent Check Gate

The local intent check is a heuristic test gate, not a real LLM-backed agent. It
should allow specific, plausible, deliberate use, including real downtime.

Initial flow:

1. User clicks "Request access" on the block page.
2. Extension asks what they are trying to do and how long they need.
3. The local gate receives the request plus local context.
4. The gate returns a structured decision.
5. Extension applies the decision or shows a follow-up/denial message.

Decision types:

- `PASS`: allow access for a limited time.
- `PASS_WITH_LIMIT`: allow a shorter duration or exact URL only.
- `FAIL`: keep the site blocked and suggest peek/redirect instead.
- `ASK_FOLLOWUP`: ask one clarifying question before deciding.

Useful local context for the gate:

- Site/domain and attempted URL
- Current time and day of week
- Blocked attempts today
- Temporary allows today
- Recent decisions for this site
- User's requested purpose and requested duration

Prompt goals:

- Allow work, learning, debugging, research, errands, maintenance, and planned
  leisure.
- Challenge vague, compulsive, feed-seeking, or evasive requests.
- Prefer exact-URL access when the user only needs one page.
- Keep responses brief, calm, and non-moralizing.

## Options Page Improvements

- [ ] Normalize pasted URLs into domains where possible.
- [ ] Remove duplicate blocked-site entries.
- [ ] Warn about overlapping entries such as `reddit.com` and
      `old.reddit.com`.
- [ ] Consider an exception/allowlist mechanism for cases like blocking
      `youtube.com` while allowing `music.youtube.com`.
- [ ] Show saved-state feedback after changes.
- [ ] Group settings into clear sections: blocked sites, temporary access,
      redirect, stats, and advanced settings.

## Browser Support

- [ ] Identify Chrome-specific APIs in the background worker.
- [ ] Add a browser API compatibility wrapper where needed.
- [ ] Create a Firefox manifest variant if required.
- [ ] Document loading instructions for Firefox.
- [ ] Verify temporary allow, re-block, stats, and block-page flows in Firefox.

## Graduation Criteria

Consider moving this project out of `the-lab` when it has a clear identity and a
stable core loop:

- [ ] The block, peek, request-access, temporary-allow, and re-block flows are
      reliable.
- [ ] Local stats are useful without feeling noisy.
- [ ] The options page feels intentional rather than experimental.
- [ ] Chrome and Firefox support are either both working or the README clearly
      states Chrome-only support.
- [ ] The README explains the philosophy, setup, permissions, and privacy model.
- [ ] There is a small manual test checklist for release confidence.

Until then, keeping it in `the-lab` is useful. The roadmap still has product
questions to answer, and the lab is a good place to let the shape settle before
promoting it to its own repository.
