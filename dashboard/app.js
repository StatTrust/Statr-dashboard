const apiPath = "/api/mlb-data";
const csvPath = "../data/statr-mlb-picks.csv";
const unitSize = 100;

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
      if (ch === '"' && next === '"') {
        field += '"';
        i += 1;
      } else if (ch === '"') {
        quoted = false;
      } else {
        field += ch;
      }
    } else if (ch === '"') {
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

function stats(rows) {
  const settled = rows.filter((r) => ["won", "lost", "push"].includes(r.status));
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
    .filter((r) => ["pending", "won", "lost", "push"].includes(r.status))
    .reduce((sum, r) => sum + Number(r.stake || 0), 0);
}

function renderMetric(prefix, rows) {
  const s = stats(rows);
  document.getElementById(`${prefix}-record`).textContent = `${s.wins}-${s.losses}${s.pushes ? `-${s.pushes}` : ""}`;
  document.getElementById(`${prefix}-wr`).textContent = `${s.wr.toFixed(1)}% WR`;
  document.getElementById(`${prefix}-roi`).textContent = `${s.roi >= 0 ? "+" : ""}${s.roi.toFixed(1)}% ROI`;
  document.getElementById(`${prefix}-units`).textContent = `${s.net >= 0 ? "+" : ""}${(s.net / unitSize).toFixed(1)}u`;
  setMoney(`${prefix}-net`, s.net, 0);
  const settledEl = document.getElementById(`${prefix}-settled`);
  if (settledEl) settledEl.textContent = `${s.settled.length} settled`;
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

function confidencePct(row) {
  const match = String(row.confidence || "").match(/(\d+(?:\.\d+)?)\s*%/);
  return match ? Number(match[1]) : 0;
}

function confidenceLabel(row) {
  const raw = String(row.confidence || "").trim();
  if (!raw) return row.status === "analyzing" ? "ANALYZING" : "TRACKED PICK";
  return raw.replace(/\s*\([^)]*\)/g, "").replace(/[≈~]/g, "").trim().toUpperCase() || "TRACKED PICK";
}

function signalText(row) {
  if (row.status === "analyzing") return "Analysis running";
  if (row.status === "no_signal") return "No Signal";
  return cleanPick(row.pick) || "Tracked Pick";
}

function strengthCount(row) {
  if (["no_signal", "error"].includes(row.status)) return 0;
  const blob = `${row.confidence} ${row.pick}`.toLowerCase();
  const pct = confidencePct(row);
  if (blob.includes("strong") || pct >= 70) return 3;
  if (blob.includes("solid") || blob.includes("medium") || pct >= 60) return 2;
  if (row.status === "pending" || row.status === "analyzing") return 1;
  return 0;
}

function renderPicks(rows) {
  const list = document.getElementById("pick-list");
  list.innerHTML = "";
  if (!rows.length) {
    list.innerHTML = '<div class="pick-row"><div></div><div class="pick-main"><strong>No tracked picks yet</strong><small>Run the workflow to populate this slate.</small></div><div></div></div>';
    return;
  }
  for (const row of rows) {
    const count = strengthCount(row);
    const pnl = Number(row.profitLoss || 0);
    const resultLabel = row.status === "pending" ? "Pending" : row.status.replace("_", " ");
    const showAmount = ["won", "lost", "push"].includes(row.status);
    const balls = [0, 1, 2].map((i) => `<span class="ball ${i < count ? "" : "empty"}"></span>`).join("");
    const item = document.createElement("article");
    item.className = `pick-row status-${row.status}`;
    item.innerHTML = `
      <div class="strength">${balls}</div>
      <div class="pick-main">
        <div class="matchup-line">${matchupHtml(row)}</div>
        <div class="signal-line">${signalText(row)}</div>
        <div class="meta-line">${confidenceLabel(row)} &middot; ${formatOdds(row.americanOdds)} &middot; $${Number(row.stake || 0)} stake</div>
      </div>
      <div class="result ${pnl > 0 ? "positive" : pnl < 0 ? "negative" : ""}">
        ${resultLabel}
        <strong>${showAmount ? money(pnl, 2) : ""}</strong>
      </div>`;
    list.appendChild(item);
  }
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
  document.getElementById("daily-record").textContent = `${dailyStats.wins}-${dailyStats.losses}`;
  document.getElementById("daily-staked").textContent = money(activeStake(daily), 0);
  setMoney("daily-net", dailyStats.net, 2);
  renderPicks(daily);
  renderMetric("season", rows);
  renderMetric("top", rows.filter((r) => /strong|solid|medium/i.test(`${r.confidence} ${r.pick}`)));
}

main();
