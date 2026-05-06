#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import { mkdir, rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";

const repoRoot = path.resolve(new URL("..", import.meta.url).pathname);
const assetsDir = path.join(repoRoot, "store-assets");
const sourceDir = path.join(assetsDir, "source");
const chromeBinary =
  process.env.CHROME_BIN ||
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const renderTimeoutMs = Number.parseInt(process.env.STORE_ASSET_TIMEOUT_MS || "8000", 10);

const brand = {
  bg: "#f6f7f9",
  panel: "#ffffff",
  border: "#d6dde8",
  borderSoft: "#e7ebf1",
  text: "#111827",
  muted: "#566273",
  accent: "#176b5d",
  accentStrong: "#0f5a4d",
  accentSoft: "#dff3ee",
  blue: "#2563eb",
  slate: "#334155",
  amber: "#f59e0b",
  danger: "#a12626",
};

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function baseDocument({ title, width, height, body, extraCss = "" }) {
  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=${width}, initial-scale=1" />
  <title>${escapeHtml(title)}</title>
  <style>
    :root {
      color-scheme: light;
      --bg: ${brand.bg};
      --panel: ${brand.panel};
      --border: ${brand.border};
      --border-soft: ${brand.borderSoft};
      --text: ${brand.text};
      --muted: ${brand.muted};
      --accent: ${brand.accent};
      --accent-strong: ${brand.accentStrong};
      --accent-soft: ${brand.accentSoft};
      --blue: ${brand.blue};
      --slate: ${brand.slate};
      --amber: ${brand.amber};
      --danger: ${brand.danger};
    }

    * {
      box-sizing: border-box;
    }

    html,
    body {
      width: ${width}px;
      height: ${height}px;
      margin: 0;
      overflow: hidden;
    }

    body {
      background: var(--bg);
      color: var(--text);
      font-family: system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      letter-spacing: 0;
    }

    h1,
    h2,
    h3,
    p {
      margin-top: 0;
    }

    .page {
      width: 100%;
      height: 100%;
      display: grid;
      grid-template-rows: 54px 1fr;
      background: var(--bg);
    }

    .browser-bar {
      align-items: center;
      background: #eef2f7;
      border-bottom: 1px solid #d8dee8;
      display: grid;
      gap: 12px;
      grid-template-columns: auto 1fr auto;
      padding: 10px 18px;
    }

    .window-dots {
      display: flex;
      gap: 7px;
    }

    .dot {
      border-radius: 999px;
      height: 12px;
      width: 12px;
    }

    .dot.red { background: #ff5f57; }
    .dot.yellow { background: #ffbd2e; }
    .dot.green { background: #28c840; }

    .address {
      align-items: center;
      background: #ffffff;
      border: 1px solid #d6dde8;
      border-radius: 999px;
      color: #64748b;
      display: flex;
      font-size: 16px;
      gap: 10px;
      height: 34px;
      min-width: 0;
      padding: 0 16px;
    }

    .address span {
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .brand-chip {
      align-items: center;
      color: var(--accent);
      display: flex;
      font-size: 15px;
      font-weight: 850;
      gap: 8px;
      white-space: nowrap;
    }

    .brand-mark {
      align-items: center;
      background: var(--accent);
      border-radius: 8px;
      color: #ffffff;
      display: inline-flex;
      font-weight: 950;
      height: 28px;
      justify-content: center;
      width: 28px;
    }

    .content {
      min-height: 0;
      padding: 42px 60px;
    }

    .surface {
      background: var(--panel);
      border: 1px solid var(--border);
      border-radius: 8px;
      box-shadow: 0 10px 28px rgba(15, 23, 42, 0.08);
    }

    .button {
      align-items: center;
      border: 0;
      border-radius: 5px;
      color: #ffffff;
      display: inline-flex;
      font-weight: 850;
      justify-content: center;
      min-height: 42px;
      padding: 9px 15px;
    }

    .button.accent { background: var(--accent); }
    .button.blue { background: var(--blue); }
    .button.slate { background: var(--slate); }

    .hint {
      color: var(--muted);
      font-size: 18px;
      line-height: 1.45;
      margin-bottom: 0;
    }

    .mono {
      font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", monospace;
    }

    ${extraCss}
  </style>
</head>
<body>
${body}
</body>
</html>`;
}

function iconDocument() {
  return baseDocument({
    title: "NoDrift icon",
    width: 128,
    height: 128,
    extraCss: `
      body {
        background: #ffffff;
        display: grid;
        place-items: center;
      }

      .icon {
        background: linear-gradient(145deg, #176b5d 0%, #0f5a4d 100%);
        border-radius: 26px;
        box-shadow: inset 0 0 0 1px rgba(255,255,255,0.24);
        height: 112px;
        align-items: center;
        color: #ffffff;
        display: flex;
        font-size: 70px;
        font-weight: 950;
        justify-content: center;
        line-height: 1;
        width: 112px;
      }
    `,
    body: `<div class="icon" aria-label="NoDrift">N</div>`,
  });
}

function screenshotBlockedDocument() {
  return baseDocument({
    title: "NoDrift blocked page screenshot",
    width: 1280,
    height: 800,
    extraCss: `
      .content {
        display: grid;
        grid-template-columns: minmax(0, 1fr) 450px;
        gap: 42px;
        padding: 48px 70px;
      }

      .hero-copy {
        align-self: center;
        max-width: 620px;
      }

      .eyebrow {
        color: var(--accent);
        font-size: 18px;
        font-weight: 900;
        margin-bottom: 14px;
      }

      h1 {
        font-size: 54px;
        letter-spacing: 0;
        line-height: 1.02;
        margin-bottom: 18px;
      }

      .feature-strip {
        display: grid;
        gap: 12px;
        margin-top: 34px;
      }

      .feature {
        align-items: center;
        display: flex;
        gap: 12px;
        font-size: 18px;
        font-weight: 760;
      }

      .check {
        align-items: center;
        background: var(--accent-soft);
        border-radius: 999px;
        color: var(--accent);
        display: inline-flex;
        flex: 0 0 auto;
        font-weight: 950;
        height: 28px;
        justify-content: center;
        width: 28px;
      }

      .block-card {
        align-self: center;
        padding: 24px;
      }

      .block-card h2 {
        font-size: 27px;
        line-height: 1.2;
        margin-bottom: 10px;
        text-align: center;
      }

      .alternatives {
        border-bottom: 1px solid var(--border-soft);
        margin-bottom: 16px;
        padding-bottom: 16px;
      }

      .section-label {
        font-size: 16px;
        font-weight: 850;
        margin: 0 0 9px;
      }

      ul {
        color: #374151;
        font-size: 17px;
        line-height: 1.5;
        margin: 0;
        padding-left: 22px;
      }

      .actions {
        display: grid;
        gap: 10px;
        margin-bottom: 16px;
      }

      .review {
        border-top: 1px solid var(--border-soft);
        padding-top: 15px;
      }

      .provider-pill {
        background: var(--accent-soft);
        border-radius: 999px;
        color: var(--accent);
        display: inline-flex;
        font-size: 13px;
        font-weight: 900;
        line-height: 1;
        margin-bottom: 9px;
        padding: 7px 10px;
      }

      .review-result {
        background: #ecfdf5;
        border: 1px solid #bdebdc;
        border-radius: 6px;
        color: #075e48;
        font-size: 14px;
        font-weight: 780;
        line-height: 1.35;
        margin-bottom: 10px;
        padding: 10px;
      }

      textarea {
        border: 1px solid #d1d5db;
        border-radius: 6px;
        color: #6b7280;
        font: inherit;
        font-size: 15px;
        height: 82px;
        margin: 8px 0 10px;
        padding: 10px;
        resize: none;
        width: 100%;
      }

      .stats-grid {
        border-top: 1px solid var(--border-soft);
        display: grid;
        gap: 8px;
        grid-template-columns: repeat(3, minmax(0, 1fr));
        margin-top: 16px;
        padding-top: 14px;
      }

      .stats-label {
        color: var(--muted);
        display: block;
        font-size: 12px;
        line-height: 1.25;
      }

      .stats-value {
        display: block;
        font-size: 21px;
        font-weight: 900;
        margin-top: 3px;
      }
    `,
    body: `<div class="page">
  <div class="browser-bar">
    <div class="window-dots"><span class="dot red"></span><span class="dot yellow"></span><span class="dot green"></span></div>
    <div class="address"><strong>Blocked</strong><span>reddit.com/r/all</span></div>
    <div class="brand-chip"><span class="brand-mark">N</span>NoDrift</div>
  </div>
  <main class="content">
    <section class="hero-copy">
      <p class="eyebrow">Interrupt autopilot browsing</p>
      <h1>A softer blocker for intentional access.</h1>
      <p class="hint">NoDrift redirects distracting sites to a calm page, then makes access deliberate when there is a real reason.</p>
      <div class="feature-strip">
        <div class="feature"><span class="check">&#10003;</span>Temporary access restores blocking automatically</div>
        <div class="feature"><span class="check">&#10003;</span>LLM-reviewed requests add thoughtful friction</div>
        <div class="feature"><span class="check">&#10003;</span>Local stats make patterns visible</div>
      </div>
    </section>
    <section class="surface block-card">
      <h2>This site is blocked</h2>
      <div class="alternatives">
        <p class="section-label">Maybe do one of these instead</p>
        <ul>
          <li>Read saved articles</li>
          <li>Review today's task list</li>
          <li>Take a five minute reset</li>
        </ul>
      </div>
      <div class="actions">
        <div class="button blue">Peek with ChatGPT</div>
        <div class="button slate">Temporary allow</div>
      </div>
      <div class="review">
        <p class="section-label">LLM-reviewed request</p>
        <span class="provider-pill">Provider: Chrome local Nano</span>
        <textarea readonly>Find one documentation answer, then leave after 10 minutes.</textarea>
        <div class="review-result">Approved for a focused, time-boxed task.</div>
        <div class="button accent">Request access</div>
      </div>
    </section>
  </main>
</div>`,
  });
}

function screenshotSettingsDocument() {
  const domains = ["youtube.com", "reddit.com", "news.ycombinator.com", "x.com"].join("\n");

  return baseDocument({
    title: "NoDrift settings screenshot",
    width: 1280,
    height: 800,
    extraCss: `
      .content {
        display: grid;
        gap: 16px;
        padding: 30px 84px;
      }

      .page-header {
        align-items: end;
        display: grid;
        grid-template-columns: minmax(0, 1fr) auto;
      }

      h1 {
        font-size: 38px;
        line-height: 1.1;
        margin-bottom: 4px;
      }

      .settings-layout {
        display: grid;
        gap: 22px;
        grid-template-columns: 425px minmax(0, 1fr);
        min-height: 0;
      }

      .settings-panel {
        padding: 18px 22px;
      }

      .settings-panel h2 {
        font-size: 22px;
        line-height: 1.2;
        margin-bottom: 14px;
      }

      textarea,
      input {
        background: #ffffff;
        border: 1px solid #c6cfdd;
        border-radius: 6px;
        color: var(--text);
        font: inherit;
        font-size: 17px;
        width: 100%;
      }

      textarea {
        height: 154px;
        line-height: 1.5;
        padding: 12px;
        resize: none;
      }

      input {
        height: 44px;
        padding: 8px 12px;
      }

      .form-stack,
      .gate-list {
        display: grid;
        gap: 10px;
      }

      .field {
        display: grid;
        gap: 7px;
      }

      label {
        font-size: 16px;
        font-weight: 850;
      }

      .gate-card {
        border: 1px solid var(--border);
        border-radius: 8px;
        display: grid;
        gap: 8px;
        padding: 12px 15px;
      }

      .gate-card.default {
        border-color: var(--accent);
        box-shadow: 0 0 0 2px var(--accent-soft);
      }

      .gate-card.coming-soon {
        background: #fbfcfe;
      }

      .gate-card h3 {
        font-size: 18px;
        margin-bottom: 0;
      }

      .gate-card .hint {
        font-size: 16px;
        line-height: 1.35;
      }

      .gate-top {
        align-items: start;
        display: grid;
        gap: 8px;
        grid-template-columns: 22px minmax(0, 1fr);
      }

      .select-dot {
        border: 2px solid #c6cfdd;
        border-radius: 999px;
        height: 18px;
        margin-top: 3px;
        width: 18px;
      }

      .default .select-dot {
        border-color: var(--accent);
        position: relative;
      }

      .default .select-dot::after {
        background: var(--accent);
        border-radius: 999px;
        content: "";
        height: 8px;
        left: 3px;
        position: absolute;
        top: 3px;
        width: 8px;
      }

      .provider-config {
        border-top: 1px solid var(--border-soft);
        display: grid;
        gap: 8px;
        margin-top: 2px;
        padding-top: 10px;
      }

      .provider-row {
        align-items: center;
        display: grid;
        gap: 10px;
        grid-template-columns: 18px minmax(0, 1fr);
      }

      .radio {
        border: 2px solid var(--accent);
        border-radius: 999px;
        height: 18px;
        position: relative;
        width: 18px;
      }

      .radio::after {
        background: var(--accent);
        border-radius: 999px;
        content: "";
        height: 8px;
        left: 3px;
        position: absolute;
        top: 3px;
        width: 8px;
      }

      .provider-name {
        font-size: 16px;
        font-weight: 850;
      }

      .provider-note {
        color: var(--muted);
        font-size: 14px;
        line-height: 1.4;
      }

      .coming-soon-heading {
        color: var(--muted);
        font-size: 14px;
        font-weight: 900;
        letter-spacing: 0.04em;
        margin: 0;
        text-transform: uppercase;
      }

      .save-row {
        align-items: center;
        display: flex;
        justify-content: flex-end;
        margin-top: 2px;
      }
    `,
    body: `<div class="page">
  <div class="browser-bar">
    <div class="window-dots"><span class="dot red"></span><span class="dot yellow"></span><span class="dot green"></span></div>
    <div class="address"><span>chrome-extension://nodrift/options.html</span></div>
    <div class="brand-chip"><span class="brand-mark">N</span>NoDrift</div>
  </div>
  <main class="content">
    <header class="page-header">
      <div>
        <h1>Settings</h1>
        <p class="hint">Choose what gets blocked, which access gate appears, and how review providers are configured.</p>
      </div>
      <div class="button slate">Local stats</div>
    </header>
    <section class="settings-layout">
      <div class="surface settings-panel">
        <h2>Blocked Sites</h2>
        <div class="form-stack">
          <div class="field">
            <label>Domains</label>
            <textarea readonly>${escapeHtml(domains)}</textarea>
            <p class="hint">4 domains, cleaned and ready.</p>
          </div>
          <div class="field">
            <label>Temporary allow minutes</label>
            <input value="10" readonly />
          </div>
          <div class="button accent">Save settings</div>
        </div>
      </div>
      <div class="surface settings-panel">
        <h2>Gate Library</h2>
        <div class="gate-list">
          <article class="gate-card default">
            <div class="gate-top">
              <span class="select-dot"></span>
              <div>
                <h3>LLM-reviewed request</h3>
                <p class="hint">Use an optional configured provider for a stricter review.</p>
              </div>
            </div>
            <div class="provider-config">
              <div class="provider-row">
                <span class="radio"></span>
                <span class="provider-name">Chrome local Nano model</span>
              </div>
              <p class="provider-note">Requests are reviewed on-device when Chrome's local Prompt API is available.</p>
            </div>
          </article>
          <article class="gate-card">
            <div class="gate-top">
              <span class="select-dot"></span>
              <div>
                <h3>Temporary allow</h3>
                <p class="hint">Grant time-boxed access and re-block automatically.</p>
              </div>
            </div>
          </article>
          <p class="coming-soon-heading">Coming soon ideas</p>
          <article class="gate-card coming-soon">
            <div class="gate-top">
              <span class="select-dot"></span>
              <div>
                <h3>Daily focus budget</h3>
                <p class="hint">Set a small daily allowance for specific sites before access gets harder.</p>
              </div>
            </div>
          </article>
          <article class="gate-card coming-soon">
            <div class="gate-top">
              <span class="select-dot"></span>
              <div>
                <h3>Accountability note</h3>
                <p class="hint">Ask future-you for a short reason that appears in local stats later.</p>
              </div>
            </div>
          </article>
        </div>
      </div>
    </section>
  </main>
</div>`,
  });
}

function screenshotStatsDocument() {
  return baseDocument({
    title: "NoDrift stats screenshot",
    width: 1280,
    height: 800,
    extraCss: `
      .content {
        padding: 34px 84px;
      }

      .page-header {
        align-items: end;
        display: grid;
        grid-template-columns: minmax(0, 1fr) auto;
        margin-bottom: 20px;
      }

      h1 {
        font-size: 38px;
        line-height: 1.1;
        margin-bottom: 4px;
      }

      .stats-grid {
        display: grid;
        gap: 18px;
        grid-template-columns: repeat(3, minmax(0, 1fr));
        margin-bottom: 18px;
      }

      .summary-card {
        padding: 21px;
      }

      .summary-card .label {
        color: var(--muted);
        display: block;
        font-size: 17px;
        margin-bottom: 4px;
      }

      .summary-card .value {
        display: block;
        font-size: 43px;
        font-weight: 950;
        line-height: 1;
      }

      .details-grid {
        display: grid;
        gap: 18px;
        grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
      }

      .stats-card {
        padding: 21px;
      }

      .stats-card h2 {
        font-size: 22px;
        margin-bottom: 12px;
      }

      .row {
        align-items: baseline;
        border-bottom: 1px solid var(--border-soft);
        display: flex;
        gap: 16px;
        justify-content: space-between;
        padding: 12px 0;
      }

      .row:last-child {
        border-bottom: 0;
      }

      .domain {
        font-size: 17px;
      }

      .value {
        font-size: 17px;
        font-weight: 900;
        white-space: nowrap;
      }

      .decision {
        display: grid;
        gap: 4px;
      }

      .pill {
        border-radius: 999px;
        display: inline-flex;
        font-size: 13px;
        font-weight: 900;
        justify-self: start;
        padding: 5px 9px;
      }

      .pill.allow {
        background: #ecfdf5;
        color: #075e48;
      }

      .pill.block {
        background: #fff1f2;
        color: var(--danger);
      }
    `,
    body: `<div class="page">
  <div class="browser-bar">
    <div class="window-dots"><span class="dot red"></span><span class="dot yellow"></span><span class="dot green"></span></div>
    <div class="address"><span>chrome-extension://nodrift/stats.html</span></div>
    <div class="brand-chip"><span class="brand-mark">N</span>NoDrift</div>
  </div>
  <main class="content">
    <header class="page-header">
      <div>
        <h1>Local Stats</h1>
        <p class="hint">A private read on blocked attempts, access grants, and time used.</p>
      </div>
      <div class="button slate">Settings</div>
    </header>
    <section class="stats-grid">
      <div class="surface summary-card"><span class="label">Blocked attempts</span><span class="value">37</span></div>
      <div class="surface summary-card"><span class="label">Temporary allows</span><span class="value">4</span></div>
      <div class="surface summary-card"><span class="label">Temp access time</span><span class="value">18m</span></div>
    </section>
    <section class="details-grid">
      <div class="surface stats-card">
        <h2>Top blocked domains</h2>
        <div class="row"><span class="domain mono">reddit.com</span><span class="value">16</span></div>
        <div class="row"><span class="domain mono">youtube.com</span><span class="value">11</span></div>
        <div class="row"><span class="domain mono">news.ycombinator.com</span><span class="value">7</span></div>
        <div class="row"><span class="domain mono">x.com</span><span class="value">3</span></div>
      </div>
      <div class="surface stats-card">
        <h2>Recent decisions</h2>
        <div class="row decision"><span><span class="pill block">Blocked</span> reddit.com/r/all</span><span class="hint">2 minutes ago</span></div>
        <div class="row decision"><span><span class="pill allow">Allowed</span> youtube.com/watch</span><span class="hint">8 minutes ago</span></div>
        <div class="row decision"><span><span class="pill block">Blocked</span> x.com/home</span><span class="hint">19 minutes ago</span></div>
      </div>
    </section>
  </main>
</div>`,
  });
}

function smallPromoDocument() {
  return baseDocument({
    title: "NoDrift small promo tile",
    width: 440,
    height: 280,
    extraCss: `
      body {
        background: #f6f7f9;
        display: grid;
        place-items: center;
      }

      .tile {
        display: grid;
        gap: 12px;
        padding: 28px;
        width: 100%;
      }

      .mark-row {
        align-items: center;
        display: flex;
        gap: 12px;
      }

      .big-mark {
        align-items: center;
        background: var(--accent);
        border-radius: 16px;
        color: #ffffff;
        display: flex;
        font-size: 36px;
        font-weight: 950;
        height: 64px;
        justify-content: center;
        width: 64px;
      }

      h1 {
        font-size: 42px;
        line-height: 1;
        margin: 0;
      }

      p {
        color: #374151;
        font-size: 22px;
        font-weight: 760;
        line-height: 1.18;
        margin: 0;
      }

      .bar {
        background: var(--accent);
        border-radius: 999px;
        height: 8px;
        overflow: hidden;
        width: 190px;
      }

      .bar::after {
        background: var(--amber);
        content: "";
        display: block;
        height: 100%;
        width: 68px;
      }
    `,
    body: `<main class="tile">
  <div class="mark-row">
    <div class="big-mark">N</div>
    <h1>NoDrift</h1>
  </div>
  <p>A soft website blocker for intentional browsing.</p>
  <div class="bar"></div>
</main>`,
  });
}

function marqueePromoDocument() {
  return baseDocument({
    title: "NoDrift marquee promo tile",
    width: 1400,
    height: 560,
    extraCss: `
      body {
        background: #f6f7f9;
      }

      .marquee {
        display: grid;
        gap: 56px;
        grid-template-columns: minmax(0, 1fr) 470px;
        height: 100%;
        padding: 64px 86px;
      }

      .copy {
        align-self: center;
      }

      .brand-line {
        align-items: center;
        color: var(--accent);
        display: flex;
        font-size: 26px;
        font-weight: 900;
        gap: 14px;
        margin-bottom: 22px;
      }

      .large-mark {
        align-items: center;
        background: var(--accent);
        border-radius: 19px;
        color: #ffffff;
        display: flex;
        font-size: 44px;
        font-weight: 950;
        height: 74px;
        justify-content: center;
        width: 74px;
      }

      h1 {
        font-size: 72px;
        line-height: 0.98;
        margin-bottom: 22px;
        max-width: 720px;
      }

      p {
        color: #374151;
        font-size: 28px;
        font-weight: 680;
        line-height: 1.22;
        margin: 0;
        max-width: 700px;
      }

      .mock {
        align-self: center;
        padding: 25px;
      }

      .mock h2 {
        font-size: 28px;
        margin-bottom: 10px;
        text-align: center;
      }

      .mock-row {
        border-bottom: 1px solid var(--border-soft);
        display: flex;
        justify-content: space-between;
        padding: 13px 0;
      }

      .mock-row:last-child {
        border-bottom: 0;
      }
    `,
    body: `<main class="marquee">
  <section class="copy">
    <div class="brand-line"><div class="large-mark">N</div>NoDrift</div>
    <h1>Block the drift. Keep the choice.</h1>
    <p>A calm Chrome website blocker with temporary access, LLM-reviewed requests, and local stats.</p>
  </section>
  <section class="surface mock">
    <h2>This site is blocked</h2>
    <div class="mock-row"><strong>Temporary allow</strong><span>10m</span></div>
    <div class="mock-row"><strong>LLM review</strong><span>Nano</span></div>
    <div class="mock-row"><strong>Blocked today</strong><span>14</span></div>
  </section>
</main>`,
  });
}

const assets = [
  {
    html: "store-icon-128.html",
    png: "store-icon-128.png",
    width: 128,
    height: 128,
    document: iconDocument(),
  },
  {
    html: "screenshot-block-page.html",
    png: "screenshot-block-page.png",
    width: 1280,
    height: 800,
    document: screenshotBlockedDocument(),
  },
  {
    html: "screenshot-settings.html",
    png: "screenshot-settings.png",
    width: 1280,
    height: 800,
    document: screenshotSettingsDocument(),
  },
  {
    html: "screenshot-local-stats.html",
    png: "screenshot-local-stats.png",
    width: 1280,
    height: 800,
    document: screenshotStatsDocument(),
  },
  {
    html: "small-promo-tile.html",
    png: "small-promo-tile.png",
    width: 440,
    height: 280,
    document: smallPromoDocument(),
  },
  {
    html: "marquee-promo-tile.html",
    png: "marquee-promo-tile.png",
    width: 1400,
    height: 560,
    document: marqueePromoDocument(),
  },
];

async function renderAsset(asset, index) {
  const htmlPath = path.join(sourceDir, asset.html);
  const pngPath = path.join(assetsDir, asset.png);
  const userDataDir = path.join(
    process.env.TMPDIR || "/tmp",
    `nodrift-cws-assets-${process.pid}-${index}`,
  );

  await writeFile(htmlPath, asset.document, "utf8");
  await rm(pngPath, { force: true });
  await rm(userDataDir, { recursive: true, force: true });

  const result = spawnSync(
    chromeBinary,
    [
      "--headless=new",
      "--disable-gpu",
      "--disable-background-networking",
      "--disable-sync",
      "--hide-scrollbars",
      "--no-default-browser-check",
      "--no-first-run",
      `--user-data-dir=${userDataDir}`,
      `--window-size=${asset.width},${asset.height}`,
      "--force-device-scale-factor=1",
      `--screenshot=${pngPath}`,
      pathToFileURL(htmlPath).href,
    ],
    {
      cwd: repoRoot,
      killSignal: "SIGTERM",
      stdio: "pipe",
      timeout: renderTimeoutMs,
    },
  );

  await rm(userDataDir, { recursive: true, force: true });

  const fileWasWritten = await hasNonEmptyFile(pngPath);

  if (fileWasWritten) {
    return;
  }

  if (result.error) {
    throw result.error;
  }
  if (result.status !== 0) {
    throw new Error(`Chrome screenshot failed for ${asset.png} with status ${result.status}`);
  }
}

async function hasNonEmptyFile(filePath) {
  try {
    const fileStat = await stat(filePath);
    return fileStat.isFile() && fileStat.size > 0;
  } catch {
    return false;
  }
}

async function main() {
  await mkdir(sourceDir, { recursive: true });

  const selectedNames = new Set(process.argv.slice(2));
  const selectedAssets = selectedNames.size
    ? assets.filter((asset) => (
        selectedNames.has(asset.png) ||
        selectedNames.has(asset.html) ||
        selectedNames.has(path.basename(asset.png, ".png"))
      ))
    : assets;

  if (selectedNames.size && selectedAssets.length === 0) {
    throw new Error(`No assets matched: ${[...selectedNames].join(", ")}`);
  }

  for (const [index, asset] of selectedAssets.entries()) {
    await renderAsset(asset, index);
  }

  console.log("Created Chrome Web Store assets:");
  for (const asset of selectedAssets) {
    console.log(`- store-assets/${asset.png}`);
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
