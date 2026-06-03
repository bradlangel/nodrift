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
