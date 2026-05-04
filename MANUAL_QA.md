# Manual QA Checklist

Use this before a v1 release candidate. v1 is Chrome-only.

## Prep

- [ ] Run `nvm use`.
- [ ] Run `npm install` if dependencies are not already installed.
- [ ] Run `npm test`.
- [ ] Load the extension unpacked from this directory in `chrome://extensions`.
- [ ] Confirm the extension card has no manifest or service-worker errors.

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
- [ ] Save changes to temporary allow minutes, grayscale, redirect URL/text, and
      secondary action toggles, then reload Settings and confirm values persist.
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
- [ ] Confirm Gate usage shows one-click, local intent, or LLM-reviewed activity
      based on the gate used.
- [ ] Confirm Recent decisions records blocked attempts, approvals, denials, and
      follow-up requests.
- [ ] Use Reset today's stats and confirm the dashboard resets without clearing
      settings.
- [ ] Confirm Local Stats links to Settings and the Block page.

## Local Intent Gate

- [ ] Select Local intent check as the default gate and save.
- [ ] Open a blocked site and confirm the request form appears.
- [ ] Submit a specific bounded purpose and confirm the gate grants access or
      asks at most one follow-up.
- [ ] Submit a vague feed-seeking purpose and confirm the gate denies access or
      asks for clarification.
- [ ] Confirm local intent decisions appear in Recent decisions and Gate usage.

## LLM-Reviewed Gate

- [ ] Select LLM-reviewed request without provider setup and confirm Settings
      marks it as needing setup.
- [ ] Save LLM-reviewed request as the default without required setup and
      confirm the block page disables the request with a setup message.
- [ ] Configure OpenAI provider with a model and API key, save, reload Settings,
      and confirm it remains ready.
- [ ] With OpenAI configured, submit one specific bounded request and one vague
      request, then confirm approvals or denials are applied and recorded with
      provider/model metadata.
- [ ] Select Chrome local LLM provider and save.
- [ ] On a Chrome build/profile where the Prompt API is available, confirm local
      LLM review can approve and deny requests. If unavailable, confirm the gate
      fails closed with a clear message.

## Navigation And Cleanup

- [ ] Confirm the block page links to More stats and Settings.
- [ ] Confirm the action popup can temporarily allow the active site.
- [ ] Confirm the action popup can re-block all temporary allows.
- [ ] Reload the extension card and confirm configured settings and today's
      local stats behave as expected after reload.
