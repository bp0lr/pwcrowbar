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
  let line = `v${version}`;
  try {
    const response = await fetch(chrome.runtime.getURL("src/build.json"));
    if (response.ok) {
      const { commit, branch, dirty } = await response.json();
      line += ` · ${commit}`;
      if (branch && branch !== "main") line += ` (${branch})`;
      if (dirty) line += ' <span class="dirty">+dirty</span>';
    }
  } catch {
    /* no build stamp, that's fine */
  }
  target.innerHTML = line;
})();
