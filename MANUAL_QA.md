# Manual QA Checklist

Use this before a release candidate. Chrome is the published store target today;
Firefox builds are local-loadable artifacts until they complete AMO review.

## Prep

- [ ] Run `nvm use`.
- [ ] Run `npm install` if dependencies are not already installed.
- [ ] Run `npm test`.
- [ ] Run `npm run release:validate`.
- [ ] Load the Chrome validation folder in `chrome://extensions`.
- [ ] Confirm the Chrome extension card has no manifest or service-worker
      errors.
- [ ] Run `npm run release:validate:firefox`.
- [ ] Load `manifest.json` from the Firefox validation folder in
      `about:debugging#/runtime/this-firefox`.
- [ ] Confirm the Firefox temporary add-on has no manifest or background-script
      errors.
- [ ] Open the Firefox popup and grant site access if the Enable blocking
      prompt appears.

## Block And Temporary Access

- [ ] Add or confirm a test blocked domain in Settings, then save.
- [ ] Open the blocked domain and confirm it redirects to the block page with
      the blocked site name shown.
- [ ] Click one-click temporary allow and confirm the original site opens.
- [ ] Confirm the extension badge shows an active temporary allow state.
- [ ] Leave the site active briefly and confirm Local Stats records temporary
      access usage time.
- [ ] Wait for the configured wall-clock duration to expire, then reload the
      site and confirm it blocks again.
- [ ] Toggle grayscale on, temporarily allow a blocked site, and confirm the
      page is grayscale while access is active.
- [ ] Toggle grayscale off, temporarily allow again, and confirm grayscale is
      not applied.

## Settings

- [ ] Confirm pasted URLs in Blocked Sites normalize to domains after cleaning
      or saving.
- [ ] Confirm duplicate blocked-site entries are removed.
- [ ] Confirm overlapping domains produce the settings warning text.
- [ ] Save changes to temporary allow minutes, grayscale, block-page
      alternatives, and secondary action toggles, then reload Settings and
      confirm values persist.
- [ ] Add a block-page alternative with a link using
      `Label | https://example.com`, save, and confirm the block page renders it
      as a clickable list item.
- [ ] Change the default Gate Library selection, save, reload Settings, and
      confirm the selected gate remains the default.
- [ ] Confirm Settings links to Local Stats.

## Stats

- [ ] Confirm blocked attempts update after visiting a blocked site.
- [ ] Confirm temporary allows update after granting access.
- [ ] Confirm active usage time increases only while spending time on a
      temporarily allowed site.
- [ ] Confirm Top blocked domains, Per-site details, and Top temporary access
      domains reflect the test domain.
- [ ] Confirm Gate usage shows one-click, generated gate, or AI-reviewed activity
      based on the gate used.
- [ ] Confirm Recent decisions records blocked attempts, approvals, denials, and
      follow-up requests.
- [ ] Use Reset today's stats and confirm the dashboard resets without clearing
      settings.
- [ ] Confirm Local Stats links to Settings and the Block page.

## Gate Builder

- [ ] Open Gate builder in Settings, describe a gate, generate a gate program
      with OpenAI configured, set it as the default, and save.
- [ ] Open a blocked site and confirm the block page uses the generated gate
      name and questions.
- [ ] Submit answers that satisfy the generated program and confirm access is
      granted.
- [ ] Submit vague or blocked-keyword answers and confirm the gate denies access
      with the generated failure message.
- [ ] Confirm built gate decisions appear in Recent decisions and Gate usage.

## AI-Reviewed Gate

- [ ] Select AI-reviewed request with Chrome local AI selected and confirm
      Settings marks it as ready without an API key.
- [ ] Save AI-reviewed request as the default with Chrome local AI selected
      and confirm the block page shows the request form.
- [ ] Switch to OpenAI provider without an API key and confirm Settings marks
      AI-reviewed request as needing setup.
- [ ] Save AI-reviewed request as the default with incomplete OpenAI setup and
      confirm the block page disables the request with a setup message.
- [ ] Configure OpenAI provider with a model and API key, save, reload Settings,
      and confirm it remains ready.
- [ ] With OpenAI configured, submit one specific bounded request and one vague
      request, then confirm approvals or denials are applied and recorded with
      provider/model metadata.
- [ ] Select Chrome local AI provider and save.
- [ ] On a Chrome build/profile where the Prompt API is available, confirm local
      AI review can approve and deny requests. If unavailable, confirm the gate
      fails closed with a clear message.

## Navigation And Cleanup

- [ ] Confirm the block page links to More stats and Settings.
- [ ] Confirm the action popup can temporarily allow the active site.
- [ ] Confirm the action popup can re-block all temporary allows.
- [ ] Reload the extension card and confirm configured settings and today's
      local stats behave as expected after reload.
