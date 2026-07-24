# End-to-End Visual Tests

These tests capture deterministic screenshots for user-facing surfaces where visual behavior is part of the feature.

Run the Access Effects visual suite:

```sh
npm run test:visual
```

Install the Chromium browser used by Playwright when needed:

```sh
npm run playwright:install
```

Refresh approved screenshots after an intentional visual change:

```sh
npm run test:visual:update
```

The Access Effects fixture is local and controlled on purpose. Live sites are better suited for manual exploratory QA because their markup and content change often.

## Loaded-extension behavior

Run the Chromium test that loads NoDrift as an unpacked extension and validates
the global increasing-delay flow against a deterministic local website:

```sh
npm run test:e2e:extension
```

The test verifies that the first allow is immediate, the next request is
background-enforced for five seconds, another hostname receives the global
ten-second delay, and resetting today's stats makes the next allow immediate.
A Playwright trace is written under `test-results/playwright-extension/`.

Generate a passing demonstration video and trace:

```sh
npm run demo:allow-delay
```

The stable artifacts are:

- `test-results/demos/global-allow-delay-demo.webm`
- `test-results/demos/global-allow-delay-trace.zip`

Open the trace with:

```sh
npx playwright show-trace test-results/demos/global-allow-delay-trace.zip
```
