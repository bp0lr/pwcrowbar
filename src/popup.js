document.getElementById("open-options").addEventListener("click", () => {
  chrome.runtime.openOptionsPage()
    .then(() => window.close())
    .catch((error) => {
      console.error("Unable to open the options page", error);
    });
});
