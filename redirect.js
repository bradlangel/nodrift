// Show where we came from (optional)
const params = new URLSearchParams(location.search);
const site = params.get("site");
if (site) {
  const h2 = document.querySelector("h2");
  if (h2) h2.textContent = `🚫 ${site} is blocked!`;
}

const DEFAULT_REDIRECT_URL = "http://localhost:5173";
const DEFAULT_REDIRECT_BTN_TEXT = "Go to Career Tracker";

const ensureHttpUrl = (raw) => {
  if (!raw) return null;
  try {
    const parsed = new URL(raw);
    if (parsed.protocol === "http:" || parsed.protocol === "https:") {
      return parsed.toString();
    }
  } catch {
    // Ignore invalid URLs.
  }
  return null;
};

chrome.storage.sync.get(
  { redirectUrl: DEFAULT_REDIRECT_URL, redirectBtnText: DEFAULT_REDIRECT_BTN_TEXT },
  (data) => {
    const target = data.redirectUrl || DEFAULT_REDIRECT_URL;
    const btn = document.getElementById("redirect-btn");
    btn.textContent = data.redirectBtnText || DEFAULT_REDIRECT_BTN_TEXT;
    btn.addEventListener("click", () => {
      window.location = target;
    });
  }
);

const peekBtn = document.getElementById("peek-chatgpt-btn");
if (peekBtn) {
  const originalLabel = peekBtn.textContent || "Peek with ChatGPT";
  let attemptedUrl = document.referrer || "";
  if (attemptedUrl.startsWith(`chrome-extension://${chrome.runtime.id}/`)) {
    attemptedUrl = "";
  }
  peekBtn.addEventListener("click", () => {
    peekBtn.disabled = true;
    peekBtn.textContent = "Collecting page snapshot...";

    chrome.runtime.sendMessage(
      {
        type: "peek-with-chatgpt",
        site,
        originalUrl: attemptedUrl || null,
      },
      (response) => {
        const reset = (label = originalLabel, delay = 0) => {
          window.setTimeout(() => {
            peekBtn.disabled = false;
            peekBtn.textContent = label;
          }, delay);
        };

        if (chrome.runtime.lastError) {
          console.warn("Peek with ChatGPT failed", chrome.runtime.lastError.message);
          reset("Prompt copied — paste into ChatGPT", 0);
          reset(originalLabel, 3000);
          return;
        }

        const status = response?.status;
        if (status === "sent") {
          reset("Prompt + snapshot sent to ChatGPT", 800);
          reset(originalLabel, 2500);
          return;
        }
        if (status === "filled") {
          reset("Snapshot ready — review & send", 800);
          reset(originalLabel, 2500);
          return;
        }
        if (status === "clipboard") {
          reset("Prompt copied — paste into ChatGPT", 0);
          reset(originalLabel, 3000);
          return;
        }
        if (status === "error" || status === "unknown") {
          reset("Open ChatGPT manually", 0);
          reset(originalLabel, 3000);
          return;
        }

        reset(originalLabel, 400);
      }
    );
  });
}

const temporaryAllowBtn = document.getElementById("temporarily-allow-btn");
if (temporaryAllowBtn) {
  const originalLabel = temporaryAllowBtn.textContent || "Temporarily Allow";
  temporaryAllowBtn.addEventListener("click", () => {
    temporaryAllowBtn.disabled = true;
    temporaryAllowBtn.textContent = "Temporarily allowing...";

    chrome.runtime.sendMessage(
      {
        type: "temporarily-allow-tab",
        url: window.location.href,
      },
      (response) => {
        const reset = (label = originalLabel, delay = 0) => {
          window.setTimeout(() => {
            temporaryAllowBtn.disabled = false;
            temporaryAllowBtn.textContent = label;
          }, delay);
        };

        if (chrome.runtime.lastError || !response?.ok) {
          console.warn(
            "Temporarily allow failed",
            chrome.runtime.lastError?.message || response?.error || "Unknown error"
          );
          reset("Could not temporarily allow", 0);
          reset(originalLabel, 2500);
          return;
        }

        temporaryAllowBtn.textContent = "Allowed — opening site...";
        const responseDestination = ensureHttpUrl(response.destination);
        const siteUrl = site ? ensureHttpUrl(`https://${site}`) : null;
        const referrerUrl = ensureHttpUrl(document.referrer);
        const destination = responseDestination || siteUrl || referrerUrl;
        if (destination) {
          window.location.href = destination;
          return;
        }

        reset("Temporarily allowed", 0);
        reset(originalLabel, 2500);
      }
    );
  });
}
