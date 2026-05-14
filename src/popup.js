document.getElementById("open-options").addEventListener("click", () => {
  chrome.runtime.openOptionsPage()
    .then(() => window.close())
    .catch((error) => {
      console.error("Unable to open the options page", error);
    });
});

(async function showBuildInfo() {
  const target = document.getElementById("build-info");
  const version = chrome.runtime.getManifest().version;
  target.textContent = `v${version}`;
  try {
    const response = await fetch(chrome.runtime.getURL("src/build.json"));
    if (!response.ok) return;
    const { commit, branch, dirty } = await response.json();
    target.textContent += ` · ${commit}`;
    if (branch && branch !== "main") target.textContent += ` (${branch})`;
    if (dirty) {
      const span = document.createElement("span");
      span.className = "dirty";
      span.textContent = " +dirty";
      target.appendChild(span);
    }
  } catch {}
})();
