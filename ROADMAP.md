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
- [x] Add an explicitly configured LLM-reviewed request gate with OpenAI and
      Chrome local provider paths, fail-closed validation, and one follow-up
      maximum.
- [ ] Add an LLM router provider so users can configure one router API key and
      choose among hosted models without changing extension code.
- [ ] Add a developer-only local LLM review logger that records prompt payloads,
      raw provider responses, parsed decisions, and validation failures locally
      for debugging provider behavior.
- [x] Support URL-scoped temporary access internally for future access gates and
      configuration.
- [x] Refactor toward modular access gates and actions before adding more gate
      types.
- [x] Keep the default block page to one visible temporary-allow action.
- [x] Improve the options page styling and blocked-site editing experience.
- [x] Add simple navigation between the block page, settings, and local stats.
- [x] Redesign the local stats page so it feels as intentional as the options
      page.
- [x] Keep v1 Chrome-only and document that clearly.
- [ ] Add Firefox support after the Chrome v1 loop feels solid.

## Gate Backlog

These are post-v1 or v1.x gate ideas to explore now that the extension has a
compiled-in gate module shape. The goal is playful, configurable friction, not a
default wall of chores.

- Random gate: choose from enabled gates with weights, cooldowns, and difficulty
  settings.
- If-then implementation intention gate: ask the user to define a concrete
  "if this happens, then I will do that" plan before access.
- Accomplishment threshold gate: use an LLM to judge whether today's configured
  goals or self-reported accomplishments are enough for access.
- GitHub contribution gate: check commits, pull requests, reviews, or issues
  against a daily threshold.
- LLM/work artifact gate: ask for a summary or evidence of useful work completed
  today and have an LLM judge whether it clears the user's bar.
- LeetCode/problem-solving gate: require a coding challenge or short algorithm
  exercise before access.
- Riddle or logic-puzzle gate: lightweight novelty friction for short access
  windows.
- Tiny debugging gate: present a short broken snippet and ask the user to spot
  or fix the bug.
- Reading comprehension gate: show a short passage and ask one question before
  granting access.
- Typing accuracy gate: require a short focused typing prompt with an error
  threshold.
- Cooldown timer gate: require a short intentional pause before the request can
  continue.
- Daily budget gate: spend from a configured leisure/access budget and make the
  remaining budget visible.
- Gate-specific stats panels: let each compiled-in gate register its own
  dashboard projection or detail panel once there are enough gates to justify
  more than the shared gate usage summary.

## Order of Operations

Avoid a big architecture rewrite up front. Do a small foundation refactor first,
then let each feature prove the next boundary.

1. [x] Light refactor: move shared URL/domain normalization, site matching,
   temporary-allow destination logic, and storage constants into clearer
   modules.
2. [x] Add local stats for blocked attempts, temporary allows, used
   temporary-allow minutes, and recent decisions.
3. [x] Refactor temporary allow into a decision/apply pipeline while preserving the
   current one-click behavior.
4. [x] Add URL-scoped temporary access under the hood to prove the decision
   pipeline can handle more than domain-wide allows.
5. [x] Add the local intent access gate as another decision source.
6. [x] Polish the options page once the real settings and stats surfaces are known.
7. [x] Connect the block page, settings page, and local stats dashboard with quiet
   navigation.
8. [x] Bring the stats dashboard up to the options page's visual and information
   architecture standard.
9. [ ] Add Firefox support after the core Chrome flow has settled.

## V1 Surface Polish

Before v1, prioritize coherence across the existing surfaces over adding more
gate types. The gate library architecture is ready for expansion, but v1 should
make the current block, stats, and settings loop feel complete.

- [x] Add quiet links from the block page to stats and settings.
- [x] Add a local stats link from the settings page.
- [x] Keep stats page navigation aligned with the other extension surfaces.
- [x] Redesign the stats page with the same mobile-first visual language as
      settings.
- [x] Rework the stats page around clear questions: what happened today, which
      sites are creating pressure, what access was granted, and what gates
      decided recently.
- [x] Add final v1 readiness documentation for Chrome-only setup, permissions,
      privacy/local data, and manual QA.

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
- UI panels: stats summary, request-access form, gate result, options sections,
  and future gate-specific stats panels.
- Developer diagnostics: local-only LLM review logs for prompt/output debugging,
  guarded behind an explicit developer setting.

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

- [x] Move shared URL/domain normalization into one utility module.
- [x] Move temporary-access decisions behind a single decision/apply pipeline.
- [x] Separate gate decision logic from browser API side effects.
- [x] Make the block page render available actions from configuration while
      preserving one simple default action.
- [x] Add settings controls for compiled-in gate defaults and optional
      block-page actions such as ChatGPT peek and the redirect button.
- [x] Add a short architecture note explaining how to add a new access gate.

## Local Stats

Start with simple counters that help the user notice patterns without adding
judgment or heavy analytics.

- [x] Blocked attempts today
- [x] Temporary allows today
- [x] Approximate temporary-allow time used today
- [x] Top blocked domains
- [x] Top temporary access domains
- [x] Per-site detail rows with blocked attempts, temporary allows, and
      temporary-access time together.
- [x] Access pressure, such as temporary allows compared with blocked attempts,
      without moralizing the number.
- [x] Gate usage by access decision source.
- [x] Recent access decisions
- [x] Refactor stats around a local OpenTelemetry-shaped event log as the
      source of truth, with dashboard and gate context derived as projections.
- [x] Add structured decision categories such as work, learning, errands,
      maintenance, planned leisure, unplanned leisure, and unclear.
- [x] Keep category summaries internal for LLM context instead of making them a
      v1 dashboard panel.
- [x] Feed richer per-site, category, and recent timeline context into LLM
      review and other access gates.
- [ ] Longest recent streak without temporary access

Implementation direction:

- Store local event records first, using OTel-style names and attributes such
  as `blocker.blocked`, `access.requested`, `access.approved`,
  `access.denied`, `access.used`, `site`, `scope`, `source`, `provider`,
  `model`, `category`, `requested_minutes`, `granted_minutes`, and
  `used_seconds`.
- Keep current daily counters as derived projections so existing UI can migrate
  incrementally.
- Do not add remote telemetry or OTLP export by default; the model is for
  structure, local debugging, and future portability.

Current placement:

- Block page: compact daily stats near the actions.
- Popup: current site, active temporary grant details, temporary allow, and
  re-block controls.
- Local Stats page: fuller dashboard, reset controls, per-site totals, gate
  usage, and recent decisions.

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

- [x] Normalize pasted URLs into domains where possible.
- [x] Remove duplicate blocked-site entries.
- [x] Warn about overlapping entries such as `reddit.com` and
      `old.reddit.com`.
- [ ] Consider an exception/allowlist mechanism for cases like blocking
      `youtube.com` while allowing `music.youtube.com`.
- [x] Show saved-state feedback after changes.
- [x] Group settings into clear sections: blocked sites, access defaults, block
      page, and gate library.

## Browser Support (Post-V1)

v1 is Chrome-only. Keep Firefox work out of the v1 release loop unless this
section is deliberately reprioritized.

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
- [x] Local stats are useful without feeling noisy.
- [x] The options page feels intentional rather than experimental.
- [x] Chrome and Firefox support are either both working or the README clearly
      states Chrome-only support.
- [x] The README explains the philosophy, setup, permissions, and privacy model.
- [x] There is a small manual test checklist for release confidence.

Until then, keeping it in `the-lab` is useful. The roadmap still has product
questions to answer, and the lab is a good place to let the shape settle before
promoting it to its own repository.
