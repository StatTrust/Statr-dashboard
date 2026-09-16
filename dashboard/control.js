const endpoint = "/api/analysis-control";
const storageKey = "statr-dashboard-admin-secret";

const form = document.getElementById("auth-form");
const secretInput = document.getElementById("admin-secret");
const panel = document.getElementById("control-panel");
const statusPill = document.getElementById("status-pill");
const statusTitle = document.getElementById("status-title");
const statusDetail = document.getElementById("status-detail");
const toggleButton = document.getElementById("toggle-button");
const updatedAt = document.getElementById("updated-at");
const message = document.getElementById("message");

let secret = sessionStorage.getItem(storageKey) || "";
let enabled = false;

function setMessage(value = "", isError = false) {
  message.textContent = value;
  message.classList.toggle("error", isError);
}

async function request(options = {}) {
  const response = await fetch(endpoint, {
    ...options,
    headers: {
      Authorization: `Bearer ${secret}`,
      "Content-Type": "application/json",
      ...(options.headers || {}),
    },
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body.error || `Request failed (${response.status})`);
  return body;
}

function render(control) {
  enabled = control.enabled === true;
  panel.hidden = false;
  statusPill.textContent = enabled ? "Active" : "Paused";
  statusPill.className = `status-pill ${enabled ? "enabled" : "paused"}`;
  statusTitle.textContent = enabled ? "Automatic analysis is on" : "Automatic analysis is paused";
  statusDetail.textContent = enabled
    ? "Due MLB games will compile and queue Moneyline, Spread, and Over/Under analyses."
    : "Fresh matchups remain available, but the scheduler will not compile or start new paid analyses.";
  toggleButton.textContent = enabled ? "Pause automatic analysis" : "Resume automatic analysis";
  toggleButton.classList.toggle("pause", enabled);
  toggleButton.disabled = false;
  updatedAt.textContent = control.updatedAt
    ? `Last changed ${new Date(control.updatedAt).toLocaleString()}`
    : "No change timestamp is available.";
}

async function loadControl() {
  toggleButton.disabled = true;
  setMessage("Checking analysis control…");
  try {
    const control = await request();
    sessionStorage.setItem(storageKey, secret);
    render(control);
    setMessage("");
  } catch (error) {
    sessionStorage.removeItem(storageKey);
    panel.hidden = true;
    setMessage(error.message, true);
  }
}

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  secret = secretInput.value.trim();
  if (!secret) return;
  await loadControl();
});

toggleButton.addEventListener("click", async () => {
  toggleButton.disabled = true;
  setMessage(enabled ? "Pausing automatic analysis…" : "Resuming automatic analysis…");
  try {
    const control = await request({
      method: "PATCH",
      body: JSON.stringify({ enabled: !enabled }),
    });
    render(control);
    setMessage(control.enabled ? "Automatic analysis resumed." : "Automatic analysis paused.");
  } catch (error) {
    toggleButton.disabled = false;
    setMessage(error.message, true);
  }
});

if (secret) {
  secretInput.value = secret;
  loadControl();
}
