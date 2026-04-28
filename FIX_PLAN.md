# No Distractions Fix Plan

Use this as the working checklist for the current access-gate cleanup. After
each completed fix, commit that fix separately with a scoped Conventional Commit
and a body.

## Fixes

- [x] Restore block-page secondary alternatives.
  Keep Career Tracker and Peek with ChatGPT available independently from the
  configured primary access gate.

- [x] Rebuild the block page mobile-first.
  Narrow the default layout, reduce competing panels, make the primary access
  action obvious, and keep stats visually quiet on small screens.

- [x] Separate primary access gates from secondary alternatives in options.
  Options should configure the access gate separately from Career Tracker,
  Peek with ChatGPT, and any future alternate actions.

- [x] Rename and reposition the current request gate.
  Treat the current heuristic flow as a local intent check or test gate, not a
  real agentic/LLM-reviewed access flow.

- [x] Move gate-specific tests out of the shared access-control test file.
  Keep shared matching, destination, and decision-application tests in the
  common file. Put temporary allow and local intent gate behavior in their own
  gate-specific test files.

- [x] Add a real LLM-backed request gate later behind explicit configuration.
  Added an explicit LLM-reviewed request gate with OpenAI provider settings,
  local API-key storage, privacy disclosure, and fail-closed validation.

## Commit Discipline

- Commit after each checked-off fix.
- Keep commits focused to one fix whenever possible.
- Use the format documented in `CONTRIBUTING.md`, for example:

```text
fix(no-distractions): restore secondary block actions

Keep configured access gates separate from secondary alternatives so Career
Tracker and Peek with ChatGPT remain available on the block page.
```
