# NoDrift Roadmap

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
- [ ] Add a low-touch setup helper that suggests starter blocked sites and
      default configuration without making NoDrift feel prescriptive.
- [x] Add a first dynamic gate-builder MVP for AI-generated gate programs.
- [x] Add simple navigation between the block page, settings, and local stats.
- [x] Redesign the local stats page so it feels as intentional as the options
      page.
- [x] Keep v1 Chrome-only and document that clearly.
- [ ] Add Firefox support after the Chrome v1 loop feels solid.

## Gate Backlog

These are post-v1 or v1.x gate ideas to explore now that the extension has a
compiled-in gate module shape. The goal is playful, configurable friction, not a
default wall of chores.

Use personal usefulness as the first filter. "V1.1 strength" is a working
hypothesis, not a final priority.

| Gate idea | What it asks | Why it might be useful personally | Setup/data needed | Build effort | Product risk | V1.1 strength |
| --- | --- | --- | --- | --- | --- | --- |
| If-then implementation intention gate | Write a concrete "if this happens, then I will do that" plan before access. | Strong reflective friction without feeling punitive; fits the NoDrift philosophy. | None or a short saved template list. | Medium | Can feel repetitive if prompts do not vary. | High |
| Gate builder | Describe the gate you want, let AI generate a structured gate program, then run it dynamically. | Lets friction fit the user's actual work style instead of forcing a fixed gate vocabulary. | AI provider settings, generated JSON program storage, local interpreter. | Medium-high | Needs guardrails so generated rules stay understandable and do not become arbitrary code. | High |
| Commitment receipt gate | Write "I am using this site to ___, and I will stop when ___" before access. | Creates a concrete receipt for intentional access without making the user solve a chore. | Text input, optional receipt display during access. | Low-medium | Can become rote if repeated too often. | High |
| Return ticket gate | Choose what to return to after the access window ends. | Gives temporary access an exit destination instead of just a timer. | Text input and expiry reminder copy. | Low-medium | Needs careful copy so it feels supportive, not scolding. | High |
| Anti-feed gate | Request an exact URL, search target, or task instead of opening a feed/homepage. | Especially useful for YouTube, Reddit, X, and other feed-heavy sites. | Current URL, optional URL/search input. | Medium | Can be awkward when the homepage is legitimately needed. | High |
| One-page objective gate | State the exact page/task needed, then grant URL-scoped access when possible. | Matches real "I need one answer, then I leave" use; uses existing URL-scope work. | Requested URL and duration. | Medium | May overlap with existing AI-reviewed request flow. | High |
| Cooldown timer gate | Wait through a short pause before the request can continue. | Good for interrupting autopilot and testing async gate UI. | Duration setting. | Low | Pure waiting can feel annoying instead of reflective. | High |
| Friction ladder gate | Escalate from light prompts to stronger gates after repeated requests, recent denials, or high access pressure. | Adapts friction to the moment instead of making every access request equally hard. | Recent stats, enabled gates, escalation rules. | Medium-high | Can feel unpredictable if the ladder is not visible and configurable. | High |
| North Star check gate | Choose which personal priority this access serves before continuing. | Re-centers access around user-defined values instead of generic productivity. | User priorities list. | Low-medium | Too abstract if priorities are vague. | Medium-high |
| Study quiz gate | Choose a topic, answer an AI-generated quiz, and get access only after all answers are correct. | Turns procrastination friction into practice on something the user says matters. | Topic setting, AI provider, JSON quiz/answer validation, retry flow. | Medium-high | Can be frustrating if questions are ambiguous or model grading feels unfair. | Medium-high |
| AI tutor gate | Choose a topic and answer an adaptive AI-generated question with explanation and retry. | Turns friction into learning while being more humane than pass/fail quiz grading. | Topic setting, AI provider, quiz JSON, answer validation, retry flow. | Medium-high | Model ambiguity can make grading feel unfair. | Medium-high |
| AI CAT practice gate | Generate a timed, adaptive quiz on a chosen topic and require a passing score before access. | Feels more like deliberate practice than arbitrary friction; useful for test prep or skill sharpening. | Topic, difficulty, timer, AI provider, scoring rubric, per-topic progress. | High | Timed tests can feel stressful and unfair if generation or grading is inconsistent. | Medium-high |
| Learning deck gate | Answer 1-3 user-authored flashcards before access. | Fair, predictable, and personally meaningful without requiring AI. | Flashcard storage/import and answer validation. | Medium | Requires users to maintain cards. | Medium-high |
| Memory recall gate | Review facts or notes the user says matter, with spaced-repetition-style prompts. | Turns distraction into practice on durable knowledge. | User notes/facts, review schedule, answer validation. | Medium-high | Can grow into a whole study app if scope is not controlled. | Medium-high |
| Daily budget gate | Spend from a configured leisure/access budget and show remaining budget. | Useful if the problem is total time, not single decisions. | Daily minutes budget and usage state. | Medium | Can feel like calorie counting for browsing. | Medium-high |
| Random gate | Choose from enabled gates with weights, cooldowns, and difficulty settings. | Adds novelty after there are enough useful gates to rotate through. | Enabled gates, weights, cooldown settings. | Medium | Too early if there are not enough good gates. | Medium-high later |
| Tiny next action gate | Write one concrete next action to do after the access session. | Keeps the user connected to what comes after browsing. | Text input. | Low | Can overlap with return ticket or commitment receipt gates. | Medium-high |
| Exit-intention gate | Before access, name the condition that means "I am done here." | Helps prevent open-ended browsing after a legitimate reason. | Text input, optional follow-up after access. | Medium | Could become naggy if post-access prompts are too frequent. | Medium |
| AI plan validator gate | Write a plan for using the site and have AI check whether it is specific, bounded, and aligned. | Keeps AI focused on plan quality rather than judging the user's worthiness. | AI provider, plan rubric, local context. | Medium | May overlap heavily with AI-reviewed request. | Medium |
| Two-option honesty gate | Choose between "I need this for ___" and "I am avoiding ___"; if avoiding, pick a tiny next step instead. | Makes drift visible without shaming the user. | Short prompt and alternative next-step flow. | Low-medium | Binary framing can feel too blunt. | Medium |
| Future-self question gate | Answer whether this access will feel worthwhile 30 minutes from now, with a specific reason. | Very lightweight reflection that can interrupt autopilot. | Short prompt. | Low | May be too easy to click through. | Medium |
| Stated tradeoff gate | Complete "Opening this means I am choosing it over ___." | Makes opportunity cost visible in one sentence. | Short prompt. | Low | Can feel guilt-inducing if overused. | Medium |
| One-sentence journal gate | Write one sentence about current state before access. | Helps reveal whether the urge is curiosity, fatigue, avoidance, or real need. | Text input, optional local stats category. | Low-medium | Could feel like journaling homework. | Medium |
| Priority budget gate | Spend time from user-defined buckets such as work, learning, maintenance, and leisure. | More nuanced than a single leisure budget and can validate intentional downtime. | Priority buckets and per-bucket budgets. | Medium-high | More settings complexity. | Medium |
| Done list gate | Add one real completed item or choose planned leisure before access. | Encourages recognition of progress before drifting. | Local done-list storage. | Medium | Can become performative. | Medium |
| Launch checklist gate | Confirm task, source, and stop condition before opening work-adjacent sites. | Helps with docs, tutorials, and research where access can be legitimate or drift. | Checklist fields and optional per-site defaults. | Low-medium | Extra form fields can slow legitimate access. | Medium |
| Pairing gate | Pair access with another action, such as notes open, timer running, or a specific doc URL. | Supports intentional browsing instead of pure blocking. | Configured companion action or URL. | Medium | Hard to verify without broad permissions or integrations. | Medium |
| Reading comprehension gate | Read a short passage and answer one question before access. | Productive friction that is calmer than puzzles or chores. | Passage bank or generated local prompts. | Medium | Content needs to stay lightweight and not school-like. | Medium |
| Tiny debugging gate | Spot or fix a small broken code snippet. | Potentially useful for a developer-user and tests skill-based gates. | Snippet bank and answer validation. | Medium | Too niche for non-developers. | Medium |
| Typing accuracy gate | Type a short focused prompt with an error threshold. | Low-stakes physical friction; simple to understand. | Prompt text and accuracy threshold. | Low-medium | Can feel like busywork. | Medium |
| Accomplishment threshold gate | Report today's goals or accomplishments and have AI judge whether access clears the bar. | Could support "earn access after real work" without external integrations. | User goals, self-report, AI provider. | Medium-high | Risks moralizing productivity or over-trusting AI judgment. | Medium |
| Work artifact gate | Provide a short summary or evidence of useful work completed today for AI review. | More grounded than vague self-report if the user wants accountability. | Text artifact, optional links, AI provider. | Medium-high | Can become performative or privacy-sensitive. | Medium |
| GitHub contribution gate | Check commits, pull requests, reviews, or issues against a daily threshold. | Useful if GitHub activity is a real personal goal. | GitHub auth/config and thresholds. | High | Pulls NoDrift toward integrations and account data. | Medium-low |
| Scheduled access window gate | Allow access only during configured windows, or ask for a stronger reason outside them. | Helpful if some sites are fine at night/weekends but harmful during work. | Schedule settings. | Medium | Time rules can become fiddly. | Medium-low |
| Deep work proof gate | Unlock access after a manually confirmed focus session or timer. | Useful when the user wants access to follow meaningful work rather than replace it. | Focus timer/session state. | Medium | Easy to fake and can feel bureaucratic. | Medium-low |
| LeetCode/problem-solving gate | Complete a short coding or algorithm exercise before access. | High friction for serious avoidance patterns. | Problem bank and validation. | High | Too heavy for frequent use. | Low-medium |
| Riddle or logic-puzzle gate | Solve a lightweight novelty puzzle before access. | Fun occasionally and easy to understand. | Puzzle bank and validation. | Medium | Users may optimize around it or find it gimmicky. | Low-medium |
| Body check gate | Confirm a short reset action, such as standing up, drinking water, or taking a breath. | Useful when browsing pressure is tied to fatigue or restlessness. | Configurable reset prompts. | Low | Can feel paternalistic if copy is not careful. | Low-medium |
| Gate-specific stats panels | Let each gate register its own dashboard projection or detail panel. | Useful once multiple gates exist and the user wants to compare what works. | Gate stats contracts and dashboard slots. | Medium-high | Premature before there are enough gates. | Later support |

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
- [x] Improve user-facing AI copy by replacing "LLM" with clearer language
      such as "AI-reviewed request" where users need quick comprehension, while
      keeping "LLM" in technical docs, provider internals, and developer-facing
      diagnostics where the precision is useful.
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
- Gate-owned storage: each gate can define its own settings and local state,
  such as quiz topics, flashcards, progress, budgets, cooldowns, or difficulty,
  without leaking those details into the core blocker.
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
- [ ] Add a gate-owned storage helper so gates can persist their own settings
      and local state without adding one-off storage plumbing to the service
      worker.

## Gate Builder

The first builder shape is dynamic but intentionally constrained: AI generates a
structured gate program, not JavaScript. The extension stores that JSON program
and evaluates it locally through a small interpreter. This lets the current user
iterate on a unique gate without rebuilding the extension or running arbitrary
remote code.

Near-term builder next steps:

- [x] Add a compiled-in dynamic gate shell that reads a generated program from
      Settings.
- [x] Generate editable gate programs from the user's description with OpenAI.
- [x] Save the generated gate program in extension storage.
- [x] Render the generated name and questions on the block page when the built
      gate is selected as default.
- [ ] Add builder presets for common patterns such as return ticket, tiny next
      action, launch checklist, and cooldown.
- [ ] Give generated programs an explicit domain/URL scope preference field.
- [ ] Add lightweight validation preview in Settings so users can see what the
      block page will ask before saving.
- [ ] Add an iteration button that revises the current gate program from a short
      change request instead of regenerating from scratch.

## Development Workflow

Add this after a few more useful gates exist, so the automated review artifacts
cover real gate variation instead of only the current v1 surfaces.

- [ ] Add visual regression screenshots for core extension surfaces and common
      gate states.
- [ ] Add a PR preview artifact with screenshots and a short sped-up walkthrough
      video so review can focus on behavior and UI rather than local manual
      setup.
- [ ] Include block page, settings, local stats, popup, and at least two gate
      flows in the generated review artifact.

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
- [ ] Consider a low-touch setup helper for first-run defaults: ask which sites
      pull the user off course, suggest common domains, and offer sensible
      defaults for access gate, duration, secondary actions, and provider setup.
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
