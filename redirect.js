// Show where we came from (optional)
const params = new URLSearchParams(location.search);
const site = params.get("site");
if (site) {
  const h2 = document.querySelector("h2");
  if (h2) h2.textContent = `🚫 ${site} is blocked!`;
}

const DEFAULT_REDIRECT_URL = "http://localhost:5173";

chrome.storage.sync.get({ redirectUrl: DEFAULT_REDIRECT_URL }, (data) => {
  const target = data.redirectUrl || DEFAULT_REDIRECT_URL;
  document.getElementById("redirect-btn").addEventListener("click", () => {
    window.location = target;
  });
});
