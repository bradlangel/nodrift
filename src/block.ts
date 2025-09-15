const DEFAULT_BLOCKED_SITES = [
  "reddit.com",
  "old.reddit.com",
  "www.reddit.com",
  "www.youtube.com",
  "www.yahoo.com",
  "news.ycombinator.com",
];

let blockedSites = [...DEFAULT_BLOCKED_SITES];
let tempAllowMinutes: number | null = null;

const getTempAllowMinutes = (): Promise<number> =>
  new Promise((resolve) => {
    if (tempAllowMinutes !== null) {
      resolve(tempAllowMinutes);
    } else {
      chrome.storage.sync.get({ tempAllowMinutes: 30 }, (data) => {
        tempAllowMinutes = data.tempAllowMinutes;
        resolve(tempAllowMinutes);
      });
    }
  });

// ---------- Rule builder ----------

const buildRule = (
  site: string,
  id: number
): any => ({
  id,
  // Give more specific domains higher priority so subdomains override their base domain.
  priority: site.split(".").length,
  action: {
    type: chrome.declarativeNetRequest.RuleActionType.REDIRECT,
    // Use transform so we can attach query params identifying the rule+site.
    redirect: {
      transform: {
        scheme: "chrome-extension",
        host: chrome.runtime.id,
        path: "/block.html",
        queryTransform: {
          addOrReplaceParams: [
            { key: "rid", value: String(id) },
            { key: "site", value: site },
          ],
        },
      },
    },
  },
  condition: {
    // Match at the domain boundary (handles subdomains properly).
    urlFilter: `||${site}^`,
    resourceTypes: [chrome.declarativeNetRequest.ResourceType.MAIN_FRAME],
  },
});

const buildRules = (sites: string[]): any[] =>
  sites.map((site, idx) => buildRule(site, idx + 1));

const allRuleIds = () => blockedSites.map((_, idx) => idx + 1);

// ---------- Utilities ----------

console.log("Website blocker: Service Worker Loaded");

const findRuleIdByHostname = (host: string): number | null => {
  // Pick the most specific matching entry (longest match), so subdomain beats base.
  let bestIdx = -1;
  let bestLen = -1;
  for (let i = 0; i < blockedSites.length; i++) {
    const site = blockedSites[i];
    if (host === site || host.endsWith("." + site)) {
      if (site.length > bestLen) {
        bestLen = site.length;
        bestIdx = i;
      }
    }
  }
  return bestIdx === -1 ? null : bestIdx + 1;
};

const withLastErrorLog =
  (label: string, next?: () => void) =>
  () => {
    if (chrome.runtime.lastError) {
      console.warn(`[${label}]`, chrome.runtime.lastError.message);
    }
    next?.();
  };

const refreshRules = () => {
  chrome.declarativeNetRequest.getDynamicRules((rules) => {
    const ids = rules.map((r) => r.id);
    chrome.declarativeNetRequest.updateDynamicRules(
      { removeRuleIds: ids, addRules: buildRules(blockedSites) },
      withLastErrorLog("refreshRules")
    );
  });
};

const loadBlockedSites = () => {
  chrome.storage.sync.get({ blockedSites: DEFAULT_BLOCKED_SITES }, (data) => {
    blockedSites = data.blockedSites;

    chrome.storage.local.get({ cachedBlockedSites: null }, (cache) => {
      const cached = cache.cachedBlockedSites;
      const changed =
        !cached || JSON.stringify(cached) !== JSON.stringify(blockedSites);
      if (changed) {
        refreshRules();
        chrome.storage.local.set({ cachedBlockedSites: blockedSites });
      }
    });
  });
};

loadBlockedSites();
getTempAllowMinutes();

chrome.storage.onChanged.addListener((changes, area) => {
  if (area === "sync") {
    if (changes.blockedSites) {
      blockedSites = changes.blockedSites.newValue;
      refreshRules();
      chrome.storage.local.set({ cachedBlockedSites: blockedSites });
    }
    if (changes.tempAllowMinutes) {
      tempAllowMinutes = changes.tempAllowMinutes.newValue;
    }
  }
});

// Temporarily allow one or more rules (removes rules & sets timers to restore).
const allowRulesTemporarily = (ids: number[], minutes: number) => {
  if (ids.length === 0) return;
  chrome.declarativeNetRequest.updateDynamicRules(
    { removeRuleIds: ids },
    withLastErrorLog("removeRuleIds")
  );
  ids.forEach((id) =>
    chrome.alarms.create(`restore-${id}`, { delayInMinutes: minutes })
  );
};

// Temporarily allow a hostname and any related rules (base domain + subdomains).
const temporarilyAllow = async (host: string, minutes?: number) => {
  const mins = minutes ?? (await getTempAllowMinutes());
  const parts = host.split(".");
  const base = parts.slice(-2).join(".");
  const ids: number[] = [];
  for (let i = 0; i < blockedSites.length; i++) {
    const site = blockedSites[i];
    if (site === host || site === base || site.endsWith("." + base)) {
      ids.push(i + 1);
    }
  }
  allowRulesTemporarily(ids, mins);
};

// Entry point when we only know the rule id (e.g., from the block page).
const temporarilyAllowById = async (id: number, minutes?: number) => {
  const site = blockedSites[id - 1];
  if (!site) return;
  await temporarilyAllow(site, minutes);
};

// Re-add a specific rule immediately and refresh the current tab so it takes effect.
const restoreNowById = (id: number, tabId?: number, currentUrl?: string) => {
  chrome.alarms.clear(`restore-${id}`);
  const site = blockedSites[id - 1];
  if (!site) return;

  chrome.declarativeNetRequest.updateDynamicRules(
    { addRules: [buildRule(site, id)] },
    withLastErrorLog("addRules(re-add one)", () => {
      if (!tabId) return;
      // If we were on the allowed site, navigate to it again to trigger the block;
      // if we're on the block page already, just reload.
      const isExtensionUrl =
        typeof currentUrl === "string" &&
        currentUrl.startsWith(`chrome-extension://${chrome.runtime.id}/`);

      if (currentUrl && !isExtensionUrl) {
        chrome.tabs.update(tabId, { url: currentUrl });
      } else {
        chrome.tabs.reload(tabId);
      }
    })
  );
};

// NEW: Re-block ALL sites — clears alarms, clears session storage, and atomically resets every rule.
const reblockAllNow = (tabId?: number, currentUrl?: string) => {
  chrome.alarms.clearAll(
    withLastErrorLog("alarms.clearAll", () => {
      // Best-effort: clear any session storage keys we may have used.
      if (chrome.storage?.session?.clear) {
        chrome.storage.session.clear(
          withLastErrorLog("storage.session.clear", () => resetAllRulesAndReload(tabId, currentUrl))
        );
      } else {
        resetAllRulesAndReload(tabId, currentUrl);
      }
    })
  );
};

const resetAllRulesAndReload = (tabId?: number, currentUrl?: string) => {
  chrome.declarativeNetRequest.updateDynamicRules(
    {
      removeRuleIds: allRuleIds(),
      addRules: buildRules(blockedSites),
    },
    withLastErrorLog("updateDynamicRules(reset all)", () => {
      // Optional: log the current dynamic rules for debugging.
      chrome.declarativeNetRequest.getDynamicRules((rules) => {
        console.log("Dynamic rules after reset:", rules.map((r) => r.id));
      });

      if (!tabId || !currentUrl) return;

      const isExtensionUrl =
        currentUrl.startsWith(`chrome-extension://${chrome.runtime.id}/`);

      // Force a top-level navigation so DNR re-evaluates and blocks.
      if (isExtensionUrl) {
        chrome.tabs.reload(tabId);
      } else {
        chrome.tabs.update(tabId, { url: currentUrl });
      }
    })
  );
};

// ---------- Peek with ChatGPT integration ----------

type PeekInjectionStatus = "sent" | "filled" | "clipboard" | "error" | "unknown";

type PeekWithChatGPTMessage = {
  type: "peek-with-chatgpt";
  site?: string | null;
  originalUrl?: string | null;
};

const parseSiteFromSender = (sender?: chrome.runtime.MessageSender): string | null => {
  if (!sender?.url) return null;
  try {
    const u = new URL(sender.url);
    return u.searchParams.get("site");
  } catch (err) {
    console.warn("Failed to parse sender site", err);
    return null;
  }
};

const sanitizeSite = (value?: string | null): string | null => {
  if (!value) return null;
  return value.replace(/^https?:\/\//, "").replace(/\/+$/, "");
};

const buildPeekPrompt = (
  payload: PeekWithChatGPTMessage,
  sender?: chrome.runtime.MessageSender
): string => {
  const siteFromPayload = sanitizeSite(payload.site);
  const siteFromSender = sanitizeSite(parseSiteFromSender(sender));
  const site = siteFromPayload || siteFromSender;
  const attemptedUrl = payload.originalUrl?.trim();

  const parts: string[] = [
    "You are my focus-preserving assistant.",
    site
      ? `I blocked ${site} so I wouldn't doomscroll, but I still need any essential updates or insights I might miss.`
      : "I blocked a distracting site so I wouldn't doomscroll, but I still need any essential updates or insights I might miss.",
    attemptedUrl ? `If it helps, I was heading to: ${attemptedUrl}.` : "",
    "Respond with at most five short, high-signal bullets focused on actionable takeaways or critical facts.",
    "If you truly need more detail, ask for up to three specific snippets for me to paste instead of guessing.",
    "If nothing sounds urgent, remind me in one sentence to return to my priority work.",
  ].filter(Boolean) as string[];

  return parts.join(" ");
};

const injectPromptIntoChatGPT = async (
  tabId: number,
  prompt: string,
  options: { autoSend?: boolean } = {}
): Promise<PeekInjectionStatus> => {
  const { autoSend = true } = options;

  try {
    const results = await chrome.scripting.executeScript({
      target: { tabId },
      world: "ISOLATED",
      func: async (text: string, autoSendFlag: boolean) => {
        const sleep = (ms: number) =>
          new Promise<void>((resolve) => setTimeout(resolve, ms));

        const selectors = [
          '[data-testid="prompt-textarea"]',
          "form textarea",
          "textarea",
          '[contenteditable="true"][role="textbox"]',
        ];

        const findInput = () => {
          for (const selector of selectors) {
            const el = document.querySelector(selector) as any;
            if (el) return el;
          }
          return null;
        };

        const setInputValue = (el: any, value: string) => {
          if (!el) return false;

          const isContentEditable =
            typeof el.getAttribute === "function" &&
            el.getAttribute("contenteditable") === "true";

          const ownerDoc = el.ownerDocument || document;
          const view = ownerDoc.defaultView || window;

          const createEvent = (EventCtor: any, type: string, init?: any) => {
            const fallbackCtor = view.Event || window.Event;
            try {
              return new EventCtor(type, init);
            } catch {
              return new fallbackCtor(type, init);
            }
          };

          const dispatchInputEvents = () => {
            const InputEventCtor = view.InputEvent || window.InputEvent || Event;
            const EventCtor = view.Event || window.Event;
            const inputEvt = createEvent(InputEventCtor, "input", {
                bubbles: true,
                cancelable: true,
                data: value,
                inputType: "insertText",
              });
            el.dispatchEvent(inputEvt);
            const changeEvt = createEvent(EventCtor, "change", { bubbles: true });
            el.dispatchEvent(changeEvt);
          };

          if (isContentEditable) {
            el.textContent = value;
            dispatchInputEvents();
            return true;
          }

          if ("value" in el) {
            const prototypes: any[] = [];
            if (view.HTMLTextAreaElement?.prototype) {
              prototypes.push(view.HTMLTextAreaElement.prototype);
            }
            if (view.HTMLInputElement?.prototype) {
              prototypes.push(view.HTMLInputElement.prototype);
            }
            prototypes.push(Object.getPrototypeOf(el));

            let applied = false;
            for (const proto of prototypes) {
              if (!proto) continue;
              const descriptor = Object.getOwnPropertyDescriptor(proto, "value");
              if (descriptor?.set) {
                descriptor.set.call(el, value);
                applied = true;
                break;
              }
            }

            if (!applied) {
              el.value = value;
            }

            dispatchInputEvents();
            return true;
          }

          return false;
        };

        const clickSend = async (inputEl: any) => {
          const button = document.querySelector(
            '[data-testid="send-button"], button[aria-label*="Send"], form button[type="submit"]'
          ) as any;
          if (!button) return false;

          const view = button.ownerDocument?.defaultView || window;
          const KeyboardEventCtor =
            view.KeyboardEvent || window.KeyboardEvent || Event;

          const attemptClick = () => {
            if (button.disabled) {
              return false;
            }
            button.click();
            return true;
          };

          if (attemptClick()) return true;

          // As a fallback, synthesize an Enter keypress to trigger send.
          const enterEvent = new KeyboardEventCtor("keydown", {
            key: "Enter",
            code: "Enter",
            bubbles: true,
            cancelable: true,
          });
          button.dispatchEvent(enterEvent);

          await sleep(50);

          if (!attemptClick() && inputEl) {
            const inputView = inputEl.ownerDocument?.defaultView || window;
            const InputKeyboardCtor =
              inputView.KeyboardEvent || window.KeyboardEvent || Event;
            const inputEnter = new InputKeyboardCtor("keydown", {
              key: "Enter",
              code: "Enter",
              bubbles: true,
              cancelable: true,
            });
            inputEl.dispatchEvent(inputEnter);
            await sleep(50);
          }

          return attemptClick();
        };

        for (let attempt = 0; attempt < 25; attempt++) {
          const input = findInput();
          if (input && setInputValue(input, text)) {
            if (typeof input.focus === "function") {
              input.focus();
            }
            if (autoSendFlag) {
              return (await clickSend(input)) ? "sent" : "filled";
            }
            return "filled";
          }
          await sleep(200);
        }

        try {
          await navigator.clipboard.writeText(text);
          return "clipboard";
        } catch (err) {
          console.warn("Peek prompt clipboard fallback failed", err);
          return "error";
        }
      },
      args: [prompt, autoSend],
    });

    const status = results?.[0]?.result;
    if (status === "sent" || status === "filled" || status === "clipboard" || status === "error") {
      return status;
    }
    return "unknown";
  } catch (error) {
    console.warn("injectPromptIntoChatGPT failed", error);
    return "error";
  }
};

const openChatGPTWithPrompt = async (prompt: string): Promise<PeekInjectionStatus> => {
  try {
    const tab = await chrome.tabs.create({ url: "https://chatgpt.com/" });
    if (typeof tab.id !== "number") {
      return "error";
    }

    const tabId = tab.id;
    return await new Promise<PeekInjectionStatus>((resolve) => {
      let finished = false;
      let safetyTimer: ReturnType<typeof setTimeout>;

      const finalize = (status: PeekInjectionStatus) => {
        if (finished) return;
        finished = true;
        chrome.tabs.onUpdated.removeListener(handleUpdated);
        chrome.tabs.onRemoved.removeListener(handleRemoved);
        clearTimeout(safetyTimer);
        resolve(status);
      };

      const handleUpdated = async (
        updatedTabId: number,
        info: chrome.tabs.TabChangeInfo
      ) => {
        if (finished) return;
        if (updatedTabId === tabId && info.status === "complete") {
          const status = await injectPromptIntoChatGPT(tabId, prompt, {
            autoSend: true,
          });
          finalize(status);
        }
      };

      const handleRemoved = (removedTabId: number) => {
        if (removedTabId === tabId) {
          finalize("error");
        }
      };

      chrome.tabs.onUpdated.addListener(handleUpdated);
      chrome.tabs.onRemoved.addListener(handleRemoved);

      safetyTimer = setTimeout(async () => {
        if (finished) return;
        const status = await injectPromptIntoChatGPT(tabId, prompt, {
          autoSend: true,
        });
        finalize(status);
      }, 5000);
    });
  } catch (error) {
    console.warn("openChatGPTWithPrompt failed", error);
    return "error";
  }
};

const handlePeekWithChatGPTRequest = async (
  payload: PeekWithChatGPTMessage,
  sender?: chrome.runtime.MessageSender
) => {
  const prompt = buildPeekPrompt(payload, sender);
  const siteForStorage = sanitizeSite(
    payload.site || parseSiteFromSender(sender)
  );

  if (chrome.storage?.session?.set) {
    chrome.storage.session.set({
      lastPeekPrompt: prompt,
      lastPeekSite: siteForStorage,
      lastPeekUrl: payload.originalUrl ?? null,
    });
  }

  const status = await openChatGPTWithPrompt(prompt);
  return { status, prompt };
};

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message?.type === "peek-with-chatgpt") {
    handlePeekWithChatGPTRequest(message as PeekWithChatGPTMessage, sender)
      .then((result) => {
        sendResponse({ status: result.status, prompt: result.prompt });
      })
      .catch((error) => {
        console.warn("peek-with-chatgpt request failed", error);
        sendResponse({ status: "error", error: error?.message ?? String(error) });
      });
    return true;
  }
  return undefined;
});

// ---------- Lifecycle & Menus ----------

chrome.runtime.onInstalled.addListener(() => {
  // Context menu: Temporarily allow current site.
  chrome.contextMenus.create({
    id: "temporarily-allow",
    title: "Temporarily allow this site",
    contexts: ["action"],
  });

  // Context menu: Re-block ALL sites now (new canonical action).
  chrome.contextMenus.create({
    id: "reblock-all-now",
    title: "Re-block ALL sites now",
    contexts: ["action"],
  });
});

// Restore rules when the timer fires.
chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name.startsWith("restore-")) {
    const id = parseInt(alarm.name.split("-")[1], 10);
    const site = blockedSites[id - 1];
    if (site) {
      chrome.declarativeNetRequest.updateDynamicRules(
        { addRules: [buildRule(site, id)] },
        withLastErrorLog("alarm addRules")
      );
    }
  }
});

// ---------- Menu Click Handling ----------

chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (!tab?.url) return;

  const u = new URL(tab.url);

  // Temporarily allow flow (unchanged; still works off rid or hostname fallback).
  if (info.menuItemId === "temporarily-allow") {
    const rid = Number(u.searchParams.get("rid"));
    if (Number.isFinite(rid)) {
      temporarilyAllowById(rid);
    } else {
      temporarilyAllow(u.hostname);
    }
    return;
  }

  // Re-block ALL flows (new + legacy id mapped to same behavior).
  if (info.menuItemId === "reblock-all-now" || info.menuItemId === "reblock-now") {
    reblockAllNow(tab.id, tab.url);
    return;
  }
});
