const MLB_SCHEDULE_URL = "https://statsapi.mlb.com/api/v1/schedule";
const TABLE = process.env.SUPABASE_TABLE || "statr_mlb_picks";

const TEAM_SLUG_OVERRIDES = {
  "Arizona Diamondbacks": "diamondbacks",
  Athletics: "athletics",
  "Atlanta Braves": "braves",
  "Baltimore Orioles": "orioles",
  "Boston Red Sox": "redsox",
  "Chicago Cubs": "cubs",
  "Chicago White Sox": "whitesox",
  "Cincinnati Reds": "reds",
  "Cleveland Guardians": "guardians",
  "Colorado Rockies": "rockies",
  "Detroit Tigers": "tigers",
  "Houston Astros": "astros",
  "Kansas City Royals": "royals",
  "Los Angeles Angels": "angels",
  "Los Angeles Dodgers": "dodgers",
  "Miami Marlins": "marlins",
  "Milwaukee Brewers": "brewers",
  "Minnesota Twins": "twins",
  "New York Mets": "mets",
  "New York Yankees": "yankees",
  "Philadelphia Phillies": "phillies",
  "Pittsburgh Pirates": "pirates",
  "San Diego Padres": "padres",
  "San Francisco Giants": "giants",
  "Seattle Mariners": "mariners",
  "St. Louis Cardinals": "cardinals",
  "Tampa Bay Rays": "rays",
  "Texas Rangers": "rangers",
  "Toronto Blue Jays": "bluejays",
  "Washington Nationals": "nationals",
};

export function json(res, status, body) {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Cache-Control", "no-store");
  res.end(JSON.stringify(body));
}

export function requireCronAuth(req) {
  const secret = process.env.CRON_SECRET || "";
  if (secret) {
    const auth = String(req.headers.authorization || "").replace(/^Bearer\s+/i, "");
    if (auth === secret || req.query?.secret === secret) return null;
    return "Missing or invalid CRON_SECRET.";
  }

  const ua = String(req.headers["user-agent"] || "");
  if (ua.includes("vercel-cron") || process.env.NODE_ENV !== "production") return null;
  return "Set CRON_SECRET or run from Vercel Cron.";
}

export function normalizeStatrApiBase(value = process.env.STATR_API_BASE || "") {
  const raw = String(value || "https://9-10-v5.vercel.app/api").replace(/\/+$/, "");
  return raw.endsWith("/api") ? raw : `${raw}/api`;
}

function todayLocal() {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: process.env.STATR_TIMEZONE || "America/Los_Angeles",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

function apiUrl(route, base) {
  const url = new URL(normalizeStatrApiBase(base));
  url.searchParams.set("route", route);
  return url;
}

async function fetchJson(url, options = {}) {
  const res = await fetch(url, options);
  const text = await res.text();
  let data = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = { raw: text };
  }
  if (!res.ok) {
    throw new Error(`${res.status} ${res.statusText}: ${JSON.stringify(data).slice(0, 500)}`);
  }
  return data;
}

function supabaseConfig() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY.");
  }
  return { url: url.replace(/\/+$/, ""), key };
}

export async function supabaseRequest(path, { method = "GET", body, prefer = "" } = {}) {
  const { url, key } = supabaseConfig();
  const headers = {
    apikey: key,
    Authorization: `Bearer ${key}`,
    "Content-Type": "application/json",
  };
  if (prefer) headers.Prefer = prefer;

  return fetchJson(`${url}/rest/v1/${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });
}

export async function listPicks({ limit = 500 } = {}) {
  return supabaseRequest(
    `${TABLE}?select=*&order=date.desc,game_time_utc.asc&limit=${Number(limit) || 500}`
  );
}

export async function listPicksForDate(date) {
  return supabaseRequest(
    `${TABLE}?select=*&date=eq.${encodeURIComponent(date)}&order=game_time_utc.asc`
  );
}

export async function upsertPick(row) {
  return supabaseRequest(TABLE, {
    method: "POST",
    body: row,
    prefer: "resolution=merge-duplicates,return=representation",
  });
}

export async function patchPick(id, row) {
  return supabaseRequest(`${TABLE}?id=eq.${encodeURIComponent(id)}`, {
    method: "PATCH",
    body: row,
    prefer: "return=representation",
  });
}

export function toDashboardRow(row) {
  return {
    id: row.id,
    date: row.date,
    gamePk: row.game_pk,
    matchupId: row.matchup_id,
    gameTimeUtc: row.game_time_utc,
    analysisDueUtc: row.analysis_due_utc,
    awayTeam: row.away_team,
    homeTeam: row.home_team,
    pick: row.pick,
    market: row.market,
    confidence: row.confidence,
    americanOdds: row.american_odds,
    stake: row.stake,
    status: row.status,
    profitLoss: row.profit_loss,
    jobId: row.job_id,
    analysisUrl: row.analysis_url,
    analysisText: row.analysis_text,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    notes: row.notes,
  };
}

function slugTeam(name = "") {
  const clean = String(name || "").trim();
  if (TEAM_SLUG_OVERRIDES[clean]) return TEAM_SLUG_OVERRIDES[clean];
  return clean
    .toLowerCase()
    .replace(/\bst\.?\b/g, "st")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

function matchupIdForGame(game) {
  const date = game.officialDate || String(game.gameDate || "").slice(0, 10);
  return `mlb/${date}_${slugTeam(game.teams?.away?.team?.name)}_${slugTeam(game.teams?.home?.team?.name)}`;
}

export async function fetchMlbSchedule(date = todayLocal()) {
  const url = new URL(MLB_SCHEDULE_URL);
  url.searchParams.set("sportId", "1");
  url.searchParams.set("date", date);
  url.searchParams.set("hydrate", "team,probablePitcher,linescore");
  const json = await fetchJson(url);
  return (json.dates || []).flatMap((d) => d.games || []);
}

function dueGames(games, now, offsetMinutes, windowMinutes) {
  return games.filter((game) => {
    const starts = new Date(game.gameDate);
    const due = new Date(starts.getTime() - offsetMinutes * 60_000);
    const ageMs = now.getTime() - due.getTime();
    return ageMs >= 0 && ageMs <= windowMinutes * 60_000;
  });
}

async function compileMatchup(matchupId, apiBase) {
  return fetchJson(apiUrl("compile", apiBase), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      matchupId,
      categories: [],
      prompt: "Automated MLB slate analysis",
      indexVector: process.env.STATR_INDEX_VECTOR || "1",
    }),
  });
}

async function startAnalysis({ matchupId, matchupLabel, compiled, apiBase, betMode }) {
  const promptText =
    process.env.STATR_ANALYSIS_PROMPT ||
    "Run the Statr MLB matchup analysis and return the final betting signal, confidence, and any price-check notes.";
  const userMessage =
    process.env.STATR_ANALYSIS_MESSAGE ||
    "Analyze this MLB matchup for the daily slate. Give the best available signal or say No Signal.";

  return fetchJson(apiUrl("jobs", apiBase), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      matchupId,
      promptText,
      userMessage,
      compiledText: JSON.stringify(compiled),
      compiled,
      vectorContext: compiled?._statgptVector || null,
      statgptVector: compiled?._statgptVector || null,
      vectorStoreId: compiled?._statgptVector?.vectorStoreId || compiled?.meta?.vectorStoreId || "",
      openaiFileId: compiled?._statgptVector?.openaiFileId || compiled?.meta?.openaiFileId || "",
      markdownHash: compiled?._statgptVector?.markdownHash || compiled?.meta?.markdownHash || "",
      stablePacketHash: compiled?._statgptVector?.stablePacketHash || compiled?.meta?.stablePacketHash || "",
      vectorStoreStatus: compiled?._statgptVector?.vectorStoreStatus || compiled?.meta?.vectorStoreStatus || "",
      conversationId: `auto_mlb_${matchupId.replace(/[^a-z0-9]+/gi, "_")}`,
      sport: "mlb",
      sportLabel: "MLB",
      matchupLabel,
      betMode,
      liveContextRequested: process.env.STATR_LIVE_CONTEXT === "1",
      responseMode: "analysis",
      intent: "analysis",
    }),
  });
}

async function pollJob(jobId, apiBase) {
  const timeoutMs = Number(process.env.STATR_JOB_TIMEOUT_MS || 240_000);
  const intervalMs = Number(process.env.STATR_JOB_POLL_MS || 5_000);
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    const url = apiUrl("job-status", apiBase);
    url.searchParams.set("job_id", jobId);
    const status = await fetchJson(url);
    if (["completed", "done", "failed", "error", "not_found"].includes(String(status.status))) {
      return status;
    }
    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }
  throw new Error(`Timed out waiting for job ${jobId}`);
}

function extractSignal(text = "") {
  const value = String(text || "");
  const signalLine =
    value.match(/(?:Final\s+)?Signal\s*:\s*([^\n]+)/i)?.[1] ||
    value.match(/Recommendation\s*:\s*([^\n]+)/i)?.[1] ||
    value.match(/Best early look:\s*([^\n]+)/i)?.[0] ||
    "";
  const confidence =
    value.match(/Confidence\s*:\s*([^\n]+)/i)?.[1] ||
    value.match(/\b((?:Strong|Solid|Lean|Slight|Low)\s*\(\d+%\))/i)?.[1] ||
    "";
  const market = /total|over|under/i.test(signalLine)
    ? "total"
    : /\+1\.5|-1\.5|run\s*line/i.test(signalLine)
      ? "runline"
      : /no signal|pass|avoid/i.test(signalLine)
        ? "none"
        : "moneyline";

  return {
    pick: signalLine.trim() || "No Signal",
    confidence: confidence.trim(),
    market,
    americanOdds: value.match(/([+-]\d{3,4})\b/)?.[1] || "",
  };
}

export async function runDueAnalyses({ date, force = false } = {}) {
  const slateDate = date || todayLocal();
  const offsetMinutes = Number(process.env.STATR_RUN_OFFSET_MINUTES || 120);
  const windowMinutes = Number(process.env.STATR_DUE_WINDOW_MINUTES || 10);
  const maxGames = Number(process.env.STATR_MAX_GAMES_PER_RUN || 3);
  const stake = Number(process.env.STATR_DEFAULT_STAKE || 100);
  const betMode = process.env.STATR_BET_MODE || "default";
  const apiBase = normalizeStatrApiBase();
  const now = force ? new Date("2999-01-01T00:00:00Z") : new Date();
  const existing = new Set((await listPicksForDate(slateDate)).map((r) => `${r.game_pk}:${r.matchup_id}`));
  const schedule = await fetchMlbSchedule(slateDate);
  const games = (force ? schedule : dueGames(schedule, now, offsetMinutes, windowMinutes))
    .filter((game) => !existing.has(`${game.gamePk}:${matchupIdForGame(game)}`))
    .slice(0, maxGames);

  const processed = [];
  for (const game of games) {
    const matchupId = matchupIdForGame(game);
    const gamePk = String(game.gamePk || "");
    const awayTeam = game.teams?.away?.team?.name || "";
    const homeTeam = game.teams?.home?.team?.name || "";
    const gameTimeUtc = new Date(game.gameDate).toISOString();
    const analysisDueUtc = new Date(new Date(game.gameDate).getTime() - offsetMinutes * 60_000).toISOString();
    const id = `${slateDate}-${gamePk}`;

    try {
      const compiled = await compileMatchup(matchupId, apiBase);
      const started = await startAnalysis({
        matchupId,
        matchupLabel: `${awayTeam} @ ${homeTeam}`,
        compiled,
        apiBase,
        betMode,
      });
      const jobId = started.job_id || started.id || "";
      const job = await pollJob(jobId, apiBase);
      const analysisText = String(job.reply || job.result || job.error || "");
      const signal = extractSignal(analysisText);
      const row = {
        id,
        date: slateDate,
        game_pk: gamePk,
        matchup_id: matchupId,
        game_time_utc: gameTimeUtc,
        analysis_due_utc: analysisDueUtc,
        away_team: awayTeam,
        home_team: homeTeam,
        pick: signal.pick,
        market: signal.market,
        confidence: signal.confidence,
        american_odds: signal.americanOdds || process.env.STATR_DEFAULT_AMERICAN_ODDS || null,
        stake,
        status: signal.market === "none" ? "no_signal" : "pending",
        profit_loss: null,
        job_id: jobId,
        analysis_url: null,
        analysis_text: analysisText,
        notes: job.status === "failed" ? job.error || "Analysis failed" : null,
      };
      await upsertPick(row);
      processed.push({ id, matchupId, status: row.status });
    } catch (err) {
      await upsertPick({
        id,
        date: slateDate,
        game_pk: gamePk,
        matchup_id: matchupId,
        game_time_utc: gameTimeUtc,
        analysis_due_utc: analysisDueUtc,
        away_team: awayTeam,
        home_team: homeTeam,
        stake,
        status: "error",
        notes: String(err?.message || err),
      });
      processed.push({ id, matchupId, status: "error" });
    }
  }

  return { date: slateDate, dueCount: games.length, processed };
}

function profitFor(status, odds, stake) {
  const st = Number(stake || 0);
  const price = Number(odds || 0);
  if (!st || !["won", "lost", "push"].includes(status)) return null;
  if (status === "lost") return -st;
  if (status === "push") return 0;
  if (!price) return null;
  return Number((price > 0 ? (st * price) / 100 : (st * 100) / Math.abs(price)).toFixed(2));
}

function inferSettlement(row, game) {
  if (!game) return null;
  if (!/final|game over/i.test(String(game.status?.detailedState || ""))) return null;
  if (row.status === "won" || row.status === "lost" || row.status === "push") return null;
  if (row.market !== "moneyline") return null;

  const awayScore = Number(game.teams?.away?.score);
  const homeScore = Number(game.teams?.home?.score);
  if (!Number.isFinite(awayScore) || !Number.isFinite(homeScore)) return null;

  const pick = String(row.pick || "").toLowerCase();
  const away = String(row.away_team || "").toLowerCase();
  const home = String(row.home_team || "").toLowerCase();
  const awayWon = awayScore > homeScore;
  const homeWon = homeScore > awayScore;
  let status = "";
  if (pick.includes(away)) status = awayWon ? "won" : "lost";
  if (pick.includes(home)) status = homeWon ? "won" : "lost";
  if (!status) return null;

  return {
    status,
    profit_loss: profitFor(status, row.american_odds, row.stake),
    notes: [row.notes, `Final score: ${row.away_team} ${awayScore}, ${row.home_team} ${homeScore}`]
      .filter(Boolean)
      .join(" | "),
  };
}

export async function settleDate({ date } = {}) {
  const slateDate = date || todayLocal();
  const rows = await listPicksForDate(slateDate);
  const schedule = await fetchMlbSchedule(slateDate);
  const games = new Map(schedule.map((game) => [String(game.gamePk || ""), game]));
  const settled = [];

  for (const row of rows) {
    const patch = inferSettlement(row, games.get(String(row.game_pk || "")));
    if (!patch) continue;
    await patchPick(row.id, patch);
    settled.push({ id: row.id, status: patch.status, profitLoss: patch.profit_loss });
  }

  return { date: slateDate, settledCount: settled.length, settled };
}
