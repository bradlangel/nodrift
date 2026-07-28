# Firefox AMO Submission

NoDrift ships Chrome as the primary published target today. The Firefox target
is packaged from the same TypeScript source with a generated Firefox-specific
Manifest V3 shape.

## Build Artifacts

Prepare the Firefox runtime ZIP and the matching source-review ZIP:

```sh
npm run release:amo:firefox
```

For version `1.0.3`, this creates:

```text
release/nodrift-firefox-1.0.3.zip
release/nodrift-firefox-source-1.0.3.zip
```

Upload `release/nodrift-firefox-1.0.3.zip` as the extension package. If AMO asks
for source code after validation, upload
`release/nodrift-firefox-source-1.0.3.zip`.

## Reviewer Build Instructions

The source ZIP includes `AMO_SOURCE_REVIEW.md` with the exact commands for
Mozilla reviewers:

```sh
nvm use
npm ci
npm run release:zip:firefox
```

The reproduced runtime package is written to:

```text
release/nodrift-firefox-1.0.3.zip
```

NoDrift uses `tsc` to compile TypeScript into `dist/`. It does not use a
bundler, minifier, obfuscator, web-based build step, or remote code-generation
step for the submitted extension package.

## Firefox Manifest Notes

The Firefox release script rewrites the checked-in Chrome manifest for AMO:

- `background.service_worker` becomes `background.scripts`.
- `incognito: "split"` becomes `incognito: "spanning"`.
- `browser_specific_settings.gecko.id` is set to
  `nodrift@bradlangel.github.io` unless `FIREFOX_EXTENSION_ID` is provided.
- `browser_specific_settings.gecko.strict_min_version` is set to `142.0`.
- `browser_specific_settings.gecko.data_collection_permissions` declares no
  required external data collection and declares optional provider data
  categories for user-enabled remote features.

Optional data collection permissions are:

```json
{
  "required": ["none"],
  "optional": [
    "authenticationInfo",
    "browsingActivity",
    "technicalAndInteraction",
    "websiteContent"
  ]
}
```

These optional categories correspond to user-enabled external provider flows:

- OpenAI access review can send the provider API key, the requested domain/URL,
  the user's request text, requested duration, local time/day, selected
  provider/model settings, and compact local stats context.
- OpenAI study quiz and Gate Builder can send the provider API key and the
  user-provided topic or gate description.
- Peek with ChatGPT can place the attempted URL and a small page snapshot into
  ChatGPT for the user to review before sending.

The core blocker, local stats, settings, temporary allow, re-block, access
effects, and non-AI gates run locally without required external data
collection. Firefox prompts for optional data-sharing consent before these
external-provider flows run.

## Permission Rationale

- `declarativeNetRequest` and `declarativeNetRequestWithHostAccess`: redirect
  configured blocked domains and apply temporary allow rules.
- `storage`: save settings, local stats, temporary access state, and optional
  provider keys.
- `tabs` and `webNavigation`: return the user to the requested page after an
  access decision and measure active temporary access.
- `contextMenus`: expose quick temporary allow and re-block shortcuts.
- `alarms`: restore blocking rules and refresh active access state.
- `scripting`: apply access effects and support optional ChatGPT prompt
  insertion.
- `clipboardWrite`: copy the ChatGPT peek prompt only as a fallback.
- `<all_urls>` host access: needed for user-configured blocking, redirects,
  temporary allow, access effects, and optional snapshot flows across sites the
  user chooses to block.

## Pre-Submission Checks

Before uploading:

```sh
npm test
npm run release:validate:firefox
npm run release:source:firefox
```

Optional local AMO lint with `web-ext`:

```sh
VERSION="$(node -e "const fs=require('fs'); const m=JSON.parse(fs.readFileSync('manifest.json','utf8')); console.log(m.version_name || m.version);")"
npx web-ext lint --source-dir "release/validate/nodrift-firefox-${VERSION}"
```

If using `web-ext sign` instead of the AMO web upload, pass the source archive
with `--upload-source-code`:

```sh
npx web-ext sign \
  --channel=listed \
  --source-dir "release/validate/nodrift-firefox-${VERSION}" \
  --upload-source-code "release/nodrift-firefox-source-${VERSION}.zip" \
  --api-key "$AMO_JWT_ISSUER" \
  --api-secret "$AMO_JWT_SECRET"
```
