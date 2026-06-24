const csvPath = "../data/statr-mlb-picks.csv";
const unitSize = 50;

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

function strengthCount(row) {
  const blob = `${row.confidence} ${row.pick}`.toLowerCase();
  if (blob.includes("strong")) return 3;
  if (blob.includes("solid") || blob.includes("lean")) return 2;
  return row.status === "no_signal" ? 0 : 1;
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
    const balls = [0, 1, 2].map((i) => `<span class="ball ${i < count ? "" : "empty"}"></span>`).join("");
    const item = document.createElement("article");
    item.className = "pick-row";
    item.innerHTML = `
      <div class="strength">${balls}</div>
      <div class="pick-main">
        <strong>${row.pick || `${row.awayTeam} @ ${row.homeTeam}`}</strong>
        <small>${row.confidence || "Tracked pick"} &middot; ${row.americanOdds || "odds TBD"} &middot; $${Number(row.stake || 0)} stake</small>
      </div>
      <div class="result ${pnl > 0 ? "positive" : pnl < 0 ? "negative" : ""}">
        ${resultLabel}
        <strong>${row.status === "pending" || row.status === "no_signal" ? "" : money(pnl, 2)}</strong>
      </div>`;
    list.appendChild(item);
  }
}

async function main() {
  let rows = [];
  try {
    rows = parseCsv(await fetch(csvPath, { cache: "no-store" }).then((r) => (r.ok ? r.text() : "")));
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
  document.getElementById("daily-staked").textContent = money(dailyStats.staked, 0);
  setMoney("daily-net", dailyStats.net, 2);
  renderPicks(daily);
  renderMetric("season", rows);
  renderMetric("top", rows.filter((r) => /strong|solid/i.test(`${r.confidence} ${r.pick}`)));
}

main();
