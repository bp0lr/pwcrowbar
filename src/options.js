const resourceForm = document.getElementById("rule-form");
const ruleIdInput = document.getElementById("rule-id");
const domainInput = document.getElementById("domain-regex");
const fileInput = document.getElementById("file-regexes");
const resetButton = document.getElementById("reset-button");
const resourceFeedback = document.getElementById("form-feedback");
const resourceFormTitle = document.getElementById("form-title");
const resourceList = document.getElementById("rules-list");

const redirectForm = document.getElementById("redirect-form");
const redirectRuleIdInput = document.getElementById("redirect-rule-id");
const redirectDomainInput = document.getElementById("redirect-domain-regex");
const redirectResetButton = document.getElementById("redirect-reset-button");
const redirectFeedback = document.getElementById("redirect-feedback");
const redirectFormTitle = document.getElementById("redirect-form-title");
const redirectList = document.getElementById("redirect-rules-list");

const tabButtons = document.querySelectorAll(".tab-button");
const tabPanels = document.querySelectorAll(".tab-panel");

let resourceRules = [];
let redirectRules = [];

const ID_GENERATOR = () =>
  (crypto.randomUUID ? crypto.randomUUID() : String(Date.now() + Math.random()));

init();

function init() {
  tabButtons.forEach((button) =>
    button.addEventListener("click", () => activateTab(button.dataset.tabTarget))
  );

  resourceForm.addEventListener("submit", handleResourceSubmit);
  resetButton.addEventListener("click", () => resetResourceForm());

  redirectForm.addEventListener("submit", handleRedirectSubmit);
  redirectResetButton.addEventListener("click", () => resetRedirectForm());

  loadRules();
  const initialTab = document.querySelector(".tab-button.active");
  if (initialTab?.dataset.tabTarget) {
    activateTab(initialTab.dataset.tabTarget);
  }

  chrome.storage.onChanged.addListener((changes, areaName) => {
    if (areaName !== "sync") return;

    if (changes.rules) {
      const next = Array.isArray(changes.rules.newValue) ? changes.rules.newValue : [];
      resourceRules = normalizeResourceRules(next);
      renderResourceRules();
    }

    if (changes.redirectRules) {
      const nextRedirects = Array.isArray(changes.redirectRules.newValue)
        ? changes.redirectRules.newValue
        : [];
      redirectRules = normalizeRedirectRules(nextRedirects);
      renderRedirectRules();
    }
  });
}

async function loadRules() {
  const {
    rules: storedResources = [],
    redirectRules: storedRedirects = [],
  } = await chrome.storage.sync.get(["rules", "redirectRules"]);

  resourceRules = normalizeResourceRules(storedResources);
  redirectRules = normalizeRedirectRules(storedRedirects);

  renderResourceRules();
  renderRedirectRules();
}

function normalizeResourceRules(raw) {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((rule) => ({
      id: rule.id || ID_GENERATOR(),
      domainPattern: typeof rule.domainPattern === "string" ? rule.domainPattern.trim() : "",
      filePatterns: Array.isArray(rule.filePatterns)
        ? rule.filePatterns.map((pattern) => pattern.trim()).filter(Boolean)
        : [],
    }))
    .filter((rule) => rule.domainPattern && rule.filePatterns.length);
}

function normalizeRedirectRules(raw) {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((rule) => ({
      id: rule.id || ID_GENERATOR(),
      domainPattern: typeof rule.domainPattern === "string" ? rule.domainPattern.trim() : "",
    }))
    .filter((rule) => rule.domainPattern);
}

async function handleResourceSubmit(event) {
  event.preventDefault();
  clearFeedback(resourceFeedback);

  const domainPattern = domainInput.value.trim();
  const filePatterns = parseLines(fileInput.value);

  if (!domainPattern || !filePatterns.length) {
    return setFeedback(resourceFeedback, "Fill the domain regex and at least one file regex.", true);
  }

  if (!isValidRegex(domainPattern)) {
    return setFeedback(resourceFeedback, "Domain regex is invalid.", true);
  }

  const invalidFile = filePatterns.find((pattern) => !isValidRegex(pattern));
  if (invalidFile) {
    return setFeedback(resourceFeedback, `Invalid file regex: ${invalidFile}`, true);
  }

  const currentId = ruleIdInput.value || null;
  const nextRule = {
    id: currentId || ID_GENERATOR(),
    domainPattern,
    filePatterns,
  };

  const nextRules = currentId
    ? resourceRules.map((rule) => (rule.id === currentId ? nextRule : rule))
    : [...resourceRules, nextRule];

  try {
    await chrome.storage.sync.set({ rules: nextRules });
    resourceRules = nextRules;
    renderResourceRules();
    setFeedback(resourceFeedback, currentId ? "Rule updated." : "Rule created.");
    resetResourceForm();
  } catch (error) {
    console.error("Failed to persist resource rules", error);
    setFeedback(resourceFeedback, "Could not save the rule. Try again.", true);
  }
}

async function handleRedirectSubmit(event) {
  event.preventDefault();
  clearFeedback(redirectFeedback);

  const domainPattern = redirectDomainInput.value.trim();
  if (!domainPattern) {
    return setFeedback(redirectFeedback, "Fill the destination regex.", true);
  }

  if (!isValidRegex(domainPattern)) {
    return setFeedback(redirectFeedback, "Destination regex is invalid.", true);
  }

  const currentId = redirectRuleIdInput.value || null;
  const nextRule = {
    id: currentId || ID_GENERATOR(),
    domainPattern,
  };

  const nextRedirectRules = currentId
    ? redirectRules.map((rule) => (rule.id === currentId ? nextRule : rule))
    : [...redirectRules, nextRule];

  try {
    await chrome.storage.sync.set({ redirectRules: nextRedirectRules });
    redirectRules = nextRedirectRules;
    renderRedirectRules();
    setFeedback(redirectFeedback, currentId ? "Redirect updated." : "Redirect created.");
    resetRedirectForm();
  } catch (error) {
    console.error("Failed to persist redirect rules", error);
    setFeedback(redirectFeedback, "Could not save the redirect. Try again.", true);
  }
}

function parseLines(value) {
  return value
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
}

function isValidRegex(pattern) {
  try {
    // eslint-disable-next-line no-new
    new RegExp(pattern);
    return true;
  } catch (_error) {
    return false;
  }
}

function renderResourceRules() {
  resourceList.innerHTML = "";

  if (!resourceRules.length) {
    const empty = document.createElement("li");
    empty.className = "empty-state";
    empty.textContent = "No resource rules configured yet.";
    resourceList.appendChild(empty);
    return;
  }

  resourceRules.forEach((rule) => {
    const item = document.createElement("li");
    item.className = "rule-item";

    const header = document.createElement("div");
    header.className = "rule-header";

    const domain = document.createElement("span");
    domain.className = "rule-domain";
    domain.textContent = rule.domainPattern;

    header.appendChild(domain);

    const actions = document.createElement("div");
    actions.className = "rule-actions";

    const editButton = document.createElement("button");
    editButton.type = "button";
    editButton.textContent = "Edit";
    editButton.addEventListener("click", () => populateResourceForm(rule));

    const deleteButton = document.createElement("button");
    deleteButton.type = "button";
    deleteButton.textContent = "Delete";
    deleteButton.className = "danger";
    deleteButton.addEventListener("click", () => deleteResourceRule(rule.id));

    actions.append(editButton, deleteButton);
    header.appendChild(actions);

    const fileList = document.createElement("ul");
    fileList.className = "rule-files";
    rule.filePatterns.forEach((pattern) => {
      const li = document.createElement("li");
      li.textContent = pattern;
      fileList.appendChild(li);
    });

    item.append(header, fileList);
    resourceList.appendChild(item);
  });
}

function renderRedirectRules() {
  redirectList.innerHTML = "";

  if (!redirectRules.length) {
    const empty = document.createElement("li");
    empty.className = "empty-state";
    empty.textContent = "No redirect rules configured yet.";
    redirectList.appendChild(empty);
    return;
  }

  redirectRules.forEach((rule) => {
    const item = document.createElement("li");
    item.className = "rule-item";

    const header = document.createElement("div");
    header.className = "rule-header";

    const domain = document.createElement("span");
    domain.className = "rule-domain";
    domain.textContent = rule.domainPattern;

    header.appendChild(domain);

    const actions = document.createElement("div");
    actions.className = "rule-actions";

    const editButton = document.createElement("button");
    editButton.type = "button";
    editButton.textContent = "Edit";
    editButton.addEventListener("click", () => populateRedirectForm(rule));

    const deleteButton = document.createElement("button");
    deleteButton.type = "button";
    deleteButton.textContent = "Delete";
    deleteButton.className = "danger";
    deleteButton.addEventListener("click", () => deleteRedirectRule(rule.id));

    actions.append(editButton, deleteButton);
    header.appendChild(actions);

    item.append(header);
    redirectList.appendChild(item);
  });
}

async function deleteResourceRule(ruleId) {
  const nextRules = resourceRules.filter((rule) => rule.id !== ruleId);
  try {
    await chrome.storage.sync.set({ rules: nextRules });
    resourceRules = nextRules;
    renderResourceRules();
    setFeedback(resourceFeedback, "Rule deleted.");
    if (ruleIdInput.value === ruleId) {
      resetResourceForm();
    }
  } catch (error) {
    console.error("Failed to delete resource rule", error);
    setFeedback(resourceFeedback, "Could not delete the rule. Try again.", true);
  }
}

async function deleteRedirectRule(ruleId) {
  const nextRedirects = redirectRules.filter((rule) => rule.id !== ruleId);
  try {
    await chrome.storage.sync.set({ redirectRules: nextRedirects });
    redirectRules = nextRedirects;
    renderRedirectRules();
    setFeedback(redirectFeedback, "Redirect deleted.");
    if (redirectRuleIdInput.value === ruleId) {
      resetRedirectForm();
    }
  } catch (error) {
    console.error("Failed to delete redirect rule", error);
    setFeedback(redirectFeedback, "Could not delete the redirect. Try again.", true);
  }
}

function populateResourceForm(rule) {
  ruleIdInput.value = rule.id;
  domainInput.value = rule.domainPattern;
  fileInput.value = rule.filePatterns.join("\n");
  resourceFormTitle.textContent = "Edit resource rule";
  document.getElementById("save-button").textContent = "Update rule";
}

function populateRedirectForm(rule) {
  redirectRuleIdInput.value = rule.id;
  redirectDomainInput.value = rule.domainPattern;
  redirectFormTitle.textContent = "Edit redirect rule";
  document.getElementById("redirect-save-button").textContent = "Update redirect";
}

function resetResourceForm() {
  resourceForm.reset();
  ruleIdInput.value = "";
  resourceFormTitle.textContent = "Create resource rule";
  document.getElementById("save-button").textContent = "Save rule";
}

function resetRedirectForm() {
  redirectForm.reset();
  redirectRuleIdInput.value = "";
  redirectFormTitle.textContent = "Create redirect rule";
  document.getElementById("redirect-save-button").textContent = "Save redirect";
}

function setFeedback(element, message, isError = false) {
  element.textContent = message;
  element.style.color = isError ? "#dc2626" : "#047857";
}

function clearFeedback(element) {
  element.textContent = "";
}

function activateTab(target) {
  if (!target) return;

  tabButtons.forEach((button) => {
    const isActive = button.dataset.tabTarget === target;
    button.classList.toggle("active", isActive);
    button.setAttribute("aria-selected", String(isActive));
  });

  tabPanels.forEach((panel) => {
    const isActive = panel.dataset.tabPanel === target;
    panel.classList.toggle("active", isActive);
    if (isActive) {
      panel.removeAttribute("hidden");
    } else {
      panel.setAttribute("hidden", "");
    }
  });
}
