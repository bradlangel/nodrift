# Website Blocker Chrome Extension

## Development

Use the Node version pinned for this extension:

```sh
nvm use
```

Install the local development tools:

```sh
npm install
```

Compile the TypeScript service worker:

```sh
npm run build
```

For an edit loop, run TypeScript in watch mode:

```sh
npx tsc --watch
```

The extension manifest loads the background service worker from `dist/block.js`, so changes to `src/block.ts` need to be compiled before Chrome can run them.

## Loading in Chrome

1. Open `chrome://extensions`.
2. Enable Developer mode.
3. Click Load unpacked.
4. Select this directory: `the-lab/no-distractions-chrome-extension`.

After recompiling, click the reload button on the extension card in `chrome://extensions`.
