# NoDrift Privacy Policy

Last updated: May 5, 2026

NoDrift is a soft, open-source website blocker for intentional browsing. It is
designed to keep your browsing controls and usage data on your device unless you
explicitly enable or use an optional provider feature.

## Data NoDrift Handles

NoDrift may store or process the following data to provide its blocking,
temporary access, stats, and review features:

- Blocked site domains and block-page alternatives.
- Settings such as gate selection, temporary allow duration, access effects,
  and AI provider/model configuration.
- Browsing and navigation data needed for the blocker loop, such as the blocked
  domain, attempted URL, active tab state, and temporary access state.
- Local usage stats, including blocked attempts, temporary allows, active
  temporary access time, and recent access decisions.
- User-provided request-access text and follow-up answers.
- Optional page snapshots and prompts generated for the Peek with ChatGPT
  feature.
- AI provider API keys if you configure a provider that needs one, for example
  OpenAI.

## How Data Is Stored

NoDrift uses browser extension storage. Settings such as blocked sites,
alternatives, and gate choices may be stored with extension sync storage, which
the browser can sync across profiles when you are signed in and sync is enabled.
Local stats, temporary access state, and AI provider API keys are stored with
extension local storage for the current browser profile.

NoDrift does not operate a backend service for extension telemetry or account
data.

## How Data Is Used

NoDrift uses this data only to provide and improve the extension's single
purpose: helping you block distracting websites and make intentional access
decisions.

Specifically, NoDrift uses data to:

- Redirect configured blocked sites to the block page.
- Apply temporary allow and re-block decisions.
- Show local stats and recent decisions.
- Render configured block-page alternatives and actions.
- Evaluate request-access prompts through the selected access gate.
- Support optional provider features that you enable or invoke.

## Optional Provider Features

NoDrift does not send remote telemetry by default.

If you use the AI-reviewed request gate with Chrome's local AI provider,
NoDrift routes the review through Chrome's local Prompt API path when available.

If you configure an external AI provider, such as OpenAI, NoDrift may send a
compact review request to that provider when you submit an access request. The
payload may include your stated purpose, follow-up answer, requested URL or
domain, requested duration, local time/day, selected provider/model settings,
and compact local stats context. Provider API keys are used only to authenticate
requests to the provider you selected.

If you use Peek with ChatGPT, NoDrift may fetch a small page snapshot, build a
prompt, open ChatGPT, and attempt to insert that prompt. If insertion is not
available, NoDrift may copy the prompt to your clipboard as a fallback. You
control whether to submit that prompt in ChatGPT.

## Sharing

NoDrift does not sell user data. NoDrift does not include ads, third-party
trackers, or analytics. NoDrift does not share data with the maintainer.

Data is shared with an external service only when you configure or invoke an
optional provider feature that requires that service, as described above.

## User Controls

You can edit blocked sites, alternatives, gate choices, temporary allow
duration, provider settings, and other configuration from the NoDrift settings
page. You can clear local extension data from NoDrift's local data controls
where available, from Chrome's extension management UI, or by uninstalling the
extension.

## Chrome Web Store Limited Use

NoDrift's use and transfer of information received from Chrome APIs and other
Google APIs adheres to the Chrome Web Store User Data Policy, including the
Limited Use requirements.

## Contact

For privacy questions or issues, open an issue in the NoDrift repository:
https://github.com/bradlangel/nodrift/issues
