const apiPath = "/api/mlb-data?limit=5000";
const csvPath = "../data/statr-mlb-picks.csv";
const unitSize = 100;
const trackingStartDate = "2026-08-21";
const sportSelect = document.getElementById("sport-select");
const weekSelect = document.getElementById("week-select");
let selectedSport = "nfl";
try { if (localStorage.getItem("statr-tracker-sport") === "mlb") selectedSport = "mlb"; } catch {}
sportSelect.value = selectedSport;
let loadVersion = 0;

const MARKETS = [
  { key: "moneyline", label: "Moneyline" },
  { key: "spread", label: "Spread" },
  { key: "total", label: "Over/Under" },
];

const TEAM_META = {
  "Arizona Diamondbacks": ["ARI", "Diamondbacks"],
  Athletics: ["ATH", "Athletics"],
  "Atlanta Braves": ["ATL", "Braves"],
  "Baltimore Orioles": ["BAL", "Orioles"],
  "Boston Red Sox": ["BOS", "Red Sox"],
  "Chicago Cubs": ["CHC", "Cubs"],
  "Chicago White Sox": ["CWS", "White Sox"],
  "Cincinnati Reds": ["CIN", "Reds"],
  "Cleveland Guardians": ["CLE", "Guardians"],
  "Colorado Rockies": ["COL", "Rockies"],
  "Detroit Tigers": ["DET", "Tigers"],
  "Houston Astros": ["HOU", "Astros"],
  "Kansas City Royals": ["KC", "Royals"],
  "Los Angeles Angels": ["LAA", "Angels"],
  "Los Angeles Dodgers": ["LAD", "Dodgers"],
  "Miami Marlins": ["MIA", "Marlins"],
  "Milwaukee Brewers": ["MIL", "Brewers"],
  "Minnesota Twins": ["MIN", "Twins"],
  "New York Mets": ["NYM", "Mets"],
  "New York Yankees": ["NYY", "Yankees"],
  "Philadelphia Phillies": ["PHI", "Phillies"],
  "Pittsburgh Pirates": ["PIT", "Pirates"],
  "San Diego Padres": ["SD", "Padres"],
  "San Francisco Giants": ["SF", "Giants"],
  "Seattle Mariners": ["SEA", "Mariners"],
  "St. Louis Cardinals": ["STL", "Cardinals"],
  "Tampa Bay Rays": ["TB", "Rays"],
  "Texas Rangers": ["TEX", "Rangers"],
  "Toronto Blue Jays": ["TOR", "Blue Jays"],
  "Washington Nationals": ["WSH", "Nationals"],
};

function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = "";
  let quoted = false;
  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i];
    const next = text[i + 1];
    if (quoted) {
      if (ch === "\"" && next === "\"") {
        field += "\"";
        i += 1;
      } else if (ch === "\"") {
        quoted = false;
      } else {
        field += ch;
      }
    } else if (ch === "\"") {
      quoted = true;
    } else if (ch === ",") {
      row.push(field);
      field = "";
    } else if (ch === "\n") {
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else if (ch !== "\r") {
      field += ch;
    }
  }
  if (field || row.length) {
    row.push(field);
    rows.push(row);
  }
  const headers = rows.shift() || [];
  return rows.filter((r) => r.length).map((r) => Object.fromEntries(headers.map((h, i) => [h, r[i] || ""])));
}

function normalizeMarket(value = "") {
  const raw = String(value || "").toLowerCase().replace(/[^a-z0-9]+/g, "");
  if (["runline", "spread", "line"].includes(raw)) return "spread";
  if (["total", "totals", "overunder", "ou", "over", "under"].includes(raw)) return "total";
  if (["moneyline", "money", "ml"].includes(raw)) return "moneyline";
  return raw;
}

function money(value, digits = 0) {
  const number = Number(value || 0);
  return `${number < 0 ? "-" : ""}$${Math.abs(number).toLocaleString(undefined, {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  })}`;
}

function setMoney(id, value, digits = 0) {
  const el = document.getElementById(id);
  el.textContent = money(value, digits);
  el.classList.toggle("positive", Number(value) > 0);
  el.classList.toggle("negative", Number(value) < 0);
}

function isNoSignal(row) {
  return row?.status === "no_signal" || /\bno[\s_-]*signal\b/i.test(`${row?.pick || ""} ${row?.analysisText || ""}`);
}

function stats(rows) {
  const settled = rows.filter((r) => !isNoSignal(r) && ["won", "lost", "push"].includes(r.status));
  const wins = settled.filter((r) => r.status === "won").length;
  const losses = settled.filter((r) => r.status === "lost").length;
  const pushes = settled.filter((r) => r.status === "push").length;
  const net = settled.reduce((sum, r) => sum + Number(r.profitLoss || 0), 0);
  const staked = settled.reduce((sum, r) => sum + Number(r.stake || 0), 0);
  const wr = wins + losses ? (wins / (wins + losses)) * 100 : 0;
  const roi = staked ? (net / staked) * 100 : 0;
  return { settled, wins, losses, pushes, net, staked, wr, roi };
}

function activeStake(rows) {
  return rows
    .filter((r) => !isNoSignal(r) && ["pending", "won", "lost", "push"].includes(r.status))
    .reduce((sum, r) => sum + Number(r.stake || 0), 0);
}

function renderMetric(prefix, rows) {
  const s = stats(rows);
  document.getElementById(`${prefix}-record`).textContent = `${s.wins}-${s.losses}-${s.pushes}`;
  document.getElementById(`${prefix}-wr`).textContent = `${s.wr.toFixed(1)}% WR`;
  document.getElementById(`${prefix}-roi`).textContent = `${s.roi >= 0 ? "+" : ""}${s.roi.toFixed(1)}% ROI`;
  document.getElementById(`${prefix}-units`).textContent = `${s.net >= 0 ? "+" : ""}${(s.net / unitSize).toFixed(1)}u`;
  setMoney(`${prefix}-net`, s.net, 0);
  const settledEl = document.getElementById(`${prefix}-settled`);
  if (settledEl) settledEl.textContent = `${s.settled.length} settled pick${s.settled.length === 1 ? "" : "s"} · No Signal excluded`;
}

function cleanPick(value = "") {
  return String(value || "")
    .replace(/\*\*/g, "")
    .replace(/^signal\s*:\s*/i, "")
    .replace(/\s+/g, " ")
    .trim();
}

function formatOdds(value) {
  const odds = Number(value);
  if (!Number.isFinite(odds) || odds === 0) return "odds TBD";
  return odds > 0 ? `+${odds}` : String(odds);
}

function teamMeta(name = "") {
  if (TEAM_META[name]) return { abbr: TEAM_META[name][0], name: TEAM_META[name][1] };
  const parts = String(name || "").split(" ").filter(Boolean);
  return { abbr: parts[0]?.slice(0, 3).toUpperCase() || "MLB", name: parts.slice(1).join(" ") || name };
}

function matchupHtml(row) {
  if (selectedSport === "nfl") return `<span class="team-main">${row.awayTeam}</span><span class="versus">vs</span><span class="team-alt">${row.homeTeam}</span>`;
  const away = teamMeta(row.awayTeam);
  const home = teamMeta(row.homeTeam);
  return `<span class="team-main">${away.abbr} ${away.name}</span><span class="versus">vs</span><span class="team-alt">${home.abbr} ${home.name}</span>`;
}

function gameTime(row) {
  if (!row?.gameTimeUtc) return "Time TBD";
  return new Date(row.gameTimeUtc).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
}

function gameDate(row) {
  if (!row?.date) return "Date TBD";
  return new Date(`${row.date}T12:00:00`).toLocaleDateString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
  });
}

function confidencePct(row) {
  const match = String(row?.confidence || "").match(/(\d+(?:\.\d+)?)\s*%/);
  return match ? Number(match[1]) : 0;
}

function confidenceLabel(row) {
  if (row?.status === "not_tracked") return "NOT TRACKED";
  const raw = String(row?.confidence || "").trim();
  if (raw) return raw.replace(/\s*\([^)]*\)/g, "").replace(/[≈~]/g, "").trim().toUpperCase() || "TRACKED";
  if (row?.status === "scheduled") return "NOT QUEUED";
  if (row?.status === "analyzing") return "ANALYZING";
  return "TRACKED";
}

function signalText(row) {
  if (row?.status === "not_tracked") return "No pregame analysis recorded";
  if (!row || row.status === "scheduled") return "Awaiting 2-hour window";
  if (row.status === "analyzing") return "Analysis running";
  if (row.status === "no_signal") return "Pass - No Signal";
  if (row.status === "error") return "Analysis error";
  return cleanPick(row.pick) || "Tracked Pick";
}

function statusLabel(row) {
  const labels = {
    not_tracked: "Not tracked",
    scheduled: "Scheduled",
    pending: "Open",
    no_signal: "Pass",
    analyzing: "Analyzing",
    won: "Won",
    lost: "Lost",
    push: "Push",
    error: "Error",
  };
  return labels[row?.status] || String(row?.status || "scheduled").replace("_", " ");
}

function strengthCount(row) {
  if (!row || ["scheduled", "not_tracked", "no_signal", "error"].includes(row.status)) return 0;
  const blob = `${row.confidence} ${row.pick}`.toLowerCase();
  const pct = confidencePct(row);
  if (blob.includes("strong") || pct >= 70) return 3;
  if (blob.includes("solid") || blob.includes("medium") || pct >= 60) return 2;
  if (["pending", "analyzing", "won", "lost", "push"].includes(row.status)) return 1;
  return 0;
}

function strengthBalls(row) {
  const count = strengthCount(row);
  return [0, 1, 2].map((i) => `<span class="ball ${i < count ? "" : "empty"}"></span>`).join("");
}

function groupGames(rows) {
  const groups = new Map();
  for (const row of rows) {
    const key = `${row.date}:${row.gamePk || row.matchupId}`;
    if (!groups.has(key)) {
      groups.set(key, {
        key,
        lead: row,
        markets: new Map(),
      });
    }
    const group = groups.get(key);
    const market = normalizeMarket(row.market);
    if (!group.markets.has(market) || group.markets.get(market).status === "scheduled") {
      group.markets.set(market, { ...row, market });
    }
    if (group.lead.status === "scheduled" && row.status !== "scheduled") group.lead = row;
  }
  return [...groups.values()].sort((a, b) => new Date(a.lead.gameTimeUtc || 0) - new Date(b.lead.gameTimeUtc || 0));
}

function renderMarketTile(row, market) {
  const pnl = Number(row?.profitLoss || 0);
  const showAmount = ["won", "lost", "push"].includes(row?.status);
  const status = row?.status || "scheduled";
  return `
    <article class="market-card status-${status}">
      <div class="market-topline">
        <span>${market.label}</span>
        <span class="status-pill">${statusLabel(row)}</span>
      </div>
      <div class="market-signal">${signalText(row)}</div>
      <div class="market-meta">${confidenceLabel(row)} · ${formatOdds(row?.americanOdds)} · $${Number(row?.stake || 0)} stake</div>
      <div class="market-bottom">
        <div class="strength compact">${strengthBalls(row)}</div>
        <strong class="market-pnl ${pnl > 0 ? "positive" : pnl < 0 ? "negative" : ""}">${showAmount ? money(pnl, 2) : ""}</strong>
      </div>
    </article>`;
}

function renderPicks(rows) {
  const list = document.getElementById("pick-list");
  list.innerHTML = "";
  const groups = groupGames(rows);
  document.getElementById("matchup-count").textContent = `${groups.length} matchup${groups.length === 1 ? "" : "s"}`;
  if (!rows.length) {
    list.innerHTML = '<div class="empty-state"><strong>No matchups found</strong><small>No games are scheduled for this selection.</small></div>';
    return;
  }

  groups.forEach((group, index) => {
    const tracked = MARKETS.filter((market) => ["analyzing", "pending", "won", "lost", "push", "no_signal", "error"].includes(group.markets.get(market.key)?.status)).length;
    const item = document.createElement("article");
    item.className = "game-card";
    const panelId = `market-panel-${index}`;
    item.innerHTML = `
      <button class="game-toggle" type="button" aria-expanded="false" aria-controls="${panelId}">
        <div class="game-heading">
          <div class="matchup-line">${matchupHtml(group.lead)}</div>
          <div class="game-meta">${gameDate(group.lead)} · ${gameTime(group.lead)} · ${tracked}/3 markets tracked</div>
        </div>
        <span class="toggle-action"><span class="toggle-label">View markets</span><span class="material-symbols-rounded" aria-hidden="true">keyboard_arrow_down</span></span>
      </button>
      <div id="${panelId}" class="market-panel" hidden>
        <div class="market-grid">
          ${MARKETS.map((market) => renderMarketTile(group.markets.get(market.key), market)).join("")}
        </div>
      </div>`;
    const toggle = item.querySelector(".game-toggle");
    const panel = item.querySelector(".market-panel");
    toggle.addEventListener("click", () => {
      const isOpen = toggle.getAttribute("aria-expanded") === "true";
      toggle.setAttribute("aria-expanded", String(!isOpen));
      panel.hidden = isOpen;
      toggle.querySelector(".toggle-label").textContent = isOpen ? "View markets" : "Hide markets";
    });
    list.appendChild(item);
  });
}

function monthKey(value) {
  return String(value || "").slice(0, 7);
}

function monthLabel(value) {
  return new Date(`${value}-01T12:00:00`).toLocaleDateString(undefined, {
    month: "long",
    year: "numeric",
  });
}

function configureMonthlyMetrics(rows) {
  const select = document.getElementById("month-select");
  const now = new Date();
  const currentMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  const months = [...new Set([
    currentMonth,
    ...rows.filter((row) => row.date >= trackingStartDate).map((row) => monthKey(row.date)).filter(Boolean),
  ])].sort().reverse();

  select.innerHTML = months.map((month) => `<option value="${month}">${monthLabel(month)}</option>`).join("");
  select.value = months.includes(currentMonth) ? currentMonth : months[0];

  const renderSelectedMonth = () => {
    const selectedMonth = select.value;
    const monthlyRows = rows.filter((row) => row.date >= trackingStartDate && monthKey(row.date) === selectedMonth);
    renderMetric("season", monthlyRows);
    renderMetric("top", monthlyRows.filter((row) => /strong|solid|medium/i.test(`${row.confidence} ${row.pick}`)));
    document.getElementById("top-period").textContent = monthLabel(selectedMonth);
  };

  select.onchange = renderSelectedMonth;
  renderSelectedMonth();
}

async function main({week, season} = {}) {
  const version = ++loadVersion;
  const sport = selectedSport;
  const message = document.getElementById("load-message");
  const retry = document.getElementById("retry-button");
  message.textContent = "Loading " + sport.toUpperCase() + " matchups…";
  retry.hidden = true;
  weekSelect.disabled = true;
  document.getElementById("week-filter").hidden = sport !== "nfl";
  document.getElementById("pick-list").replaceChildren();
  document.getElementById("matchup-count").textContent = "";
  document.getElementById("slate-date").textContent = "Loading…";
  document.getElementById("daily-record").textContent = "—";
  document.getElementById("daily-staked").textContent = "—";
  document.getElementById("daily-net").textContent = "—";
  for (const prefix of ["season", "top"]) {
    for (const field of ["record","wr","roi","units","net","settled"]) document.getElementById(prefix+"-"+field).textContent = "—";
  }
  document.getElementById("month-select").disabled = true;
  try {
    const url = sport === "nfl"
      ? "/api/nfl-data" + (week ? "?week=" + week + "&season=" + season : "")
      : apiPath;
    const response = await fetch(url, {cache:"no-store"});
    if (!response.ok) throw new Error("Unable to load " + sport.toUpperCase() + " results. Please retry.");
    const payload = await response.json();
    if (version !== loadVersion) return;
    const rows = (payload.rows || []).map(row => ({...row, market:normalizeMarket(row.market)}));
    let slate;
    if (sport === "nfl") {
      weekSelect.innerHTML = payload.weeks.map(w => '<option value="' + w.week + '">Week ' + w.week + ' · ' + w.detail + '</option>').join("");
      weekSelect.value = String(payload.week);
      weekSelect.dataset.season = payload.season;
      weekSelect.disabled = false;
      slate = rows.filter(r => r.week === payload.week && r.season === payload.season);
      document.getElementById("slate-date").textContent = payload.season + " · Week " + payload.week;
      document.getElementById("slate-eyebrow").textContent = "NFL · Weekly Slate";
      document.getElementById("matchups-heading").textContent = "Week " + payload.week + " matchups";
    } else {
      const dates = [...new Set(rows.map(r => r.date).filter(Boolean))].sort();
      const date = dates.at(-1) || new Date().toISOString().slice(0,10);
      slate = rows.filter(r => r.date === date);
      document.getElementById("slate-date").textContent = new Date(date+"T12:00:00").toLocaleDateString(undefined,{weekday:"long",month:"long",day:"numeric",year:"numeric"});
      document.getElementById("slate-eyebrow").textContent = "MLB · Daily Slate";
      document.getElementById("matchups-heading").textContent = "Slate matchups";
    }
    const summary = stats(slate);
    document.getElementById("daily-record").textContent = summary.wins+"-"+summary.losses+"-"+summary.pushes;
    document.getElementById("daily-staked").textContent = money(activeStake(slate),0);
    setMoney("daily-net",summary.net,2);
    renderPicks(slate);
    configureMonthlyMetrics(rows);
    document.getElementById("month-select").disabled = false;
    message.textContent = sport === "nfl" ? "Weekly record above · Monthly performance below. Earlier games without saved analyses are not tracked." : "";
  } catch (error) {
    if (version !== loadVersion) return;
    message.textContent = navigator.onLine ? error.message : "You’re offline. Reconnect and retry.";
    document.getElementById("slate-date").textContent = "Results unavailable";
    retry.hidden = false;
  }
}
sportSelect.addEventListener("change", () => {
  selectedSport = sportSelect.value;
  try {localStorage.setItem("statr-tracker-sport",selectedSport);} catch {}
  main();
});
weekSelect.addEventListener("change", () => main({week:Number(weekSelect.value),season:Number(weekSelect.dataset.season)}));
document.getElementById("retry-button").addEventListener("click", () => main(selectedSport === "nfl" && weekSelect.dataset.season ? {week:Number(weekSelect.value),season:Number(weekSelect.dataset.season)} : {}));
main();
