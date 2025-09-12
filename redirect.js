// Show where we came from (optional)
const params = new URLSearchParams(location.search);
const site = params.get("site");
if (site) {
  const h2 = document.querySelector("h2");
  if (h2) h2.textContent = `🚫 ${site} is blocked!`;
}

const DEFAULT_REDIRECT_URL = "http://localhost:5173";
const DEFAULT_REDIRECT_BTN_TEXT = "Go to Career Tracker";

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
