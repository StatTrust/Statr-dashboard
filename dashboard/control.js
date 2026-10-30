const storageKey = "statr-dashboard-admin-secret";
const form = document.getElementById("auth-form");
const input = document.getElementById("admin-secret");
const panel = document.getElementById("control-panel");
const message = document.getElementById("message");
let secret = "";
try { secret = sessionStorage.getItem(storageKey) || ""; } catch {}

async function request(sport, enabled) {
  const response = await fetch("/api/analysis-control?sport=" + sport, {
    method: enabled === undefined ? "GET" : "PATCH",
    headers: {Authorization:"Bearer " + secret, "Content-Type":"application/json"},
    body: enabled === undefined ? undefined : JSON.stringify({sport, enabled}),
  });
  const body = await response.json();
  if (!response.ok || body.error) throw new Error(body.error || "Unable to update control.");
  return body;
}

async function load() {
  message.textContent = "Checking controls…";
  panel.hidden = true;
  panel.replaceChildren();
  try {
    const controls = await Promise.all(["mlb","nfl","nba"].map(async sport => ({sport,...await request(sport)})));
    for (const control of controls) {
      const section = document.createElement("section");
      const title = document.createElement("h2");
      title.textContent = control.sport.toUpperCase();
      const detail = document.createElement("p");
      const button = document.createElement("button");
      button.type = "button";
      button.className = "toggle-button";
      const render = value => {
        detail.textContent = control.sport === "nba" ? "Coming soon" : value.enabled
          ? "Automatic Moneyline, Spread, and Total analyses are on."
          : "Paused. No new paid analyses will start for this sport.";
        button.textContent = value.enabled ? "Pause " + control.sport.toUpperCase() : "Enable " + control.sport.toUpperCase();
        button.disabled = control.sport === "nba";
        button.setAttribute("aria-pressed", String(value.enabled));
        control.enabled = value.enabled;
      };
      render(control);
      button.addEventListener("click", async () => {
        button.disabled = true;
        message.textContent = "Saving " + control.sport.toUpperCase() + "…";
        try {
          render(await request(control.sport, !control.enabled));
          message.textContent = control.sport.toUpperCase() + " setting saved.";
        } catch (error) {
          message.textContent = error.message;
          button.disabled = false;
        }
      });
      section.append(title,detail,button);
      panel.append(section);
    }
    panel.hidden = false;
    message.textContent = "";
    try { sessionStorage.setItem(storageKey,secret); } catch {}
  } catch (error) {
    message.textContent = error.message;
    try { sessionStorage.removeItem(storageKey); } catch {}
  }
}
form.addEventListener("submit", event => {event.preventDefault(); secret = input.value.trim(); load();});
if (secret) {input.value = secret; load();}
