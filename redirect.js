// Show where we came from (optional)
const params = new URLSearchParams(location.search);
const site = params.get("site");
if (site) {
  const h2 = document.querySelector("h2");
  if (h2) h2.textContent = `🚫 ${site} is blocked!`;
}

// Your existing button
function redirectToCareer() {
  window.location = "http://localhost:5173";
}
document.getElementById("redirect-btn").addEventListener("click", redirectToCareer);
