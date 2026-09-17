const apiPath = "/api/mlb-data?limit=5000";
const csvPath = "../data/statr-mlb-picks.csv";
const unitSize = 100;
const trackingStartDate = "2026-08-21";

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
  const raw = String(row?.confidence || "").trim();
  if (raw) return raw.replace(/\s*\([^)]*\)/g, "").replace(/[≈~]/g, "").trim().toUpperCase() || "TRACKED";
  if (row?.status === "scheduled") return "NOT QUEUED";
  if (row?.status === "analyzing") return "ANALYZING";
  return "TRACKED";
}

function signalText(row) {
  if (!row || row.status === "scheduled") return "Awaiting 2-hour window";
  if (row.status === "analyzing") return "Analysis running";
  if (row.status === "no_signal") return "Pass - No Signal";
  if (row.status === "error") return "Analysis error";
  return cleanPick(row.pick) || "Tracked Pick";
}

function statusLabel(row) {
  const labels = {
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
  if (!row || ["scheduled", "no_signal", "error"].includes(row.status)) return 0;
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
    list.innerHTML = '<div class="empty-state"><strong>No MLB matchups found</strong><small>The slate will appear here once schedule data is available.</small></div>';
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

  select.addEventListener("change", renderSelectedMonth);
  renderSelectedMonth();
}

async function main() {
  let rows = [];
  try {
    const response = await fetch(apiPath, { cache: "no-store" });
    if (response.ok) {
      const payload = await response.json();
      rows = Array.isArray(payload.rows) ? payload.rows : [];
    } else {
      rows = parseCsv(await fetch(csvPath, { cache: "no-store" }).then((r) => (r.ok ? r.text() : "")));
    }
  } catch {
    rows = [];
  }
  rows = rows.map((row) => ({ ...row, market: normalizeMarket(row.market) }));
  const dates = [...new Set(rows.map((r) => r.date).filter(Boolean))].sort();
  const slateDate = dates.at(-1) || new Date().toISOString().slice(0, 10);
  const daily = rows.filter((r) => r.date === slateDate);
  const dailyStats = stats(daily);
  document.getElementById("slate-date").textContent = new Date(`${slateDate}T12:00:00`).toLocaleDateString(undefined, {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
  });
  document.getElementById("daily-record").textContent = `${dailyStats.wins}-${dailyStats.losses}-${dailyStats.pushes}`;
  document.getElementById("daily-staked").textContent = money(activeStake(daily), 0);
  setMoney("daily-net", dailyStats.net, 2);
  renderPicks(daily);
  configureMonthlyMetrics(rows);
}

main();
