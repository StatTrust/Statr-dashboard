import { fetchNflWeek } from "./nflSchedule.js";

const MLB_SCHEDULE_URL = "https://statsapi.mlb.com/api/v1/schedule";
const TABLE = process.env.SUPABASE_TABLE || "statr_mlb_picks";
const SETTINGS_TABLE = process.env.SUPABASE_SETTINGS_TABLE || "statr_dashboard_settings";
const tableFor = sport => sport === "nfl" ? "statr_nfl_picks" : TABLE;
const settingFor = sport => `${sport}_auto_analysis`;

const MARKET_ANALYSES = [
  { key: "moneyline", label: "Moneyline", betModeEnv: "STATR_MONEYLINE_BET_MODE", defaultBetMode: "moneyline" },
  { key: "spread", label: "Spread", betModeEnv: "STATR_SPREAD_BET_MODE", defaultBetMode: "spread" },
  { key: "total", label: "Over/Under", betModeEnv: "STATR_TOTAL_BET_MODE", defaultBetMode: "total" },
];

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

function localDateOffset(days) {
  const date = new Date();
  date.setUTCDate(date.getUTCDate() + days);
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: process.env.STATR_TIMEZONE || "America/Los_Angeles",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

function marketAnalyses() {
  return MARKET_ANALYSES.map((market) => ({
    ...market,
    betMode: process.env[market.betModeEnv] || market.defaultBetMode,
  }));
}

function normalizeMarket(value = "") {
  const raw = String(value || "").toLowerCase().replace(/[^a-z0-9]+/g, "");
  if (["runline", "spread", "line"].includes(raw)) return "spread";
  if (["total", "totals", "overunder", "ou", "over", "under"].includes(raw)) return "total";
  if (["moneyline", "money", "ml"].includes(raw)) return "moneyline";
  return raw;
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

export async function listPicks({ limit = 500, sport = "mlb", season } = {}) {
  const rows = [];
  const maximum = Math.min(10000, Math.max(1, Number(limit) || 500));
  for (let offset = 0; offset < maximum; offset += 1000) {
    const page = await supabaseRequest(
      `${tableFor(sport)}?select=*&${season ? `season=eq.${Number(season)}&` : ""}order=date.desc,game_time_utc.asc,id.asc&limit=${Math.min(1000,maximum-offset)}&offset=${offset}`
    );
    rows.push(...page);
    if (page.length < Math.min(1000,maximum-offset)) break;
  }
  return rows;
}

export async function listPicksForDate(date, sport = "mlb") {
  return supabaseRequest(
    `${tableFor(sport)}?select=*&date=eq.${encodeURIComponent(date)}&order=game_time_utc.asc,market.asc`
  );
}

export async function listAnalyzingPicks({ date = "", limit = 50, sport = "mlb" } = {}) {
  const filters = [
    "select=*",
    "status=eq.analyzing",
    "job_id=not.is.null",
  ];
  if (date) filters.push(`date=eq.${encodeURIComponent(date)}`);
  filters.push("order=updated_at.asc");
  filters.push(`limit=${Number(limit) || 50}`);
  return supabaseRequest(`${tableFor(sport)}?${filters.join("&")}`);
}

export async function upsertPick(row, sport = "mlb") {
  return supabaseRequest(tableFor(sport), {
    method: "POST",
    body: row,
    prefer: "resolution=merge-duplicates,return=representation",
  });
}

export async function patchPick(id, row, sport = "mlb") {
  return supabaseRequest(`${tableFor(sport)}?id=eq.${encodeURIComponent(id)}`, {
    method: "PATCH",
    body: row,
    prefer: "return=representation",
  });
}

export async function readAutoAnalysisControl(sport = "mlb") {
  try {
    const rows = await supabaseRequest(
      `${SETTINGS_TABLE}?select=setting_key,enabled,updated_by,updated_at&setting_key=eq.${settingFor(sport)}&limit=1`
    );
    const row = Array.isArray(rows) ? rows[0] : null;
    if (!row) {
      return {
        enabled: false,
        updatedBy: "",
        updatedAt: "",
        source: "missing_setting",
        error: "Auto-analysis setting is missing; paused to prevent unplanned model spend.",
      };
    }
    return {
      enabled: row.enabled === true,
      updatedBy: String(row.updated_by || ""),
      updatedAt: String(row.updated_at || ""),
      source: "supabase",
      error: "",
    };
  } catch (err) {
    return {
      enabled: false,
      updatedBy: "",
      updatedAt: "",
      source: "read_error",
      error: String(err?.message || err),
    };
  }
}

export async function writeAutoAnalysisControl(enabled, updatedBy = "dashboard_admin", sport = "mlb") {
  const rows = await supabaseRequest(SETTINGS_TABLE, {
    method: "POST",
    body: {
      setting_key: settingFor(sport),
      enabled: enabled === true,
      updated_by: String(updatedBy || "dashboard_admin").slice(0, 120),
      updated_at: new Date().toISOString(),
    },
    prefer: "resolution=merge-duplicates,return=representation",
  });
  const row = Array.isArray(rows) ? rows[0] : null;
  return {
    enabled: row?.enabled === true,
    updatedBy: String(row?.updated_by || updatedBy || "dashboard_admin"),
    updatedAt: String(row?.updated_at || ""),
    source: "supabase",
    error: "",
  };
}

export function toDashboardRow(row) {
  return {
    id: row.id,
    sport: row.season ? "nfl" : "mlb", season: row.season, week: row.week,
    date: row.date,
    gamePk: row.game_pk,
    matchupId: row.matchup_id,
    gameTimeUtc: row.game_time_utc,
    analysisDueUtc: row.analysis_due_utc,
    awayTeam: row.away_team,
    homeTeam: row.home_team,
    pick: row.pick,
    market: normalizeMarket(row.market),
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
  if (game.matchupId) return game.matchupId;
  const date = game.officialDate || String(game.gameDate || "").slice(0, 10);
  return `mlb/${date}_${slugTeam(game.teams?.away?.team?.name)}_${slugTeam(game.teams?.home?.team?.name)}`;
}

export function scheduleRowsForGame(game, slateDate) {
  const gamePk = String(game.gamePk || "");
  const awayTeam = game.teams?.away?.team?.name || "";
  const homeTeam = game.teams?.home?.team?.name || "";
  const matchupId = matchupIdForGame(game);
  const gameTimeUtc = new Date(game.gameDate).toISOString();
  const offsetMinutes = Number(process.env.STATR_RUN_OFFSET_MINUTES || 120);
  const analysisDueUtc = new Date(new Date(game.gameDate).getTime() - offsetMinutes * 60_000).toISOString();
  const stake = Number(process.env.STATR_DEFAULT_STAKE || 100);

  return marketAnalyses().map((market) => ({
    id: `${slateDate}-${gamePk}-${market.key}`,
    sport: game.season ? "nfl" : "mlb", season: game.season, week: game.week,
    date: slateDate,
    gamePk,
    matchupId,
    gameTimeUtc,
    analysisDueUtc,
    awayTeam,
    homeTeam,
    pick: "",
    market: market.key,
    confidence: "",
    americanOdds: null,
    stake,
    status: new Date(game.gameDate) <= new Date() ? "not_tracked" : "scheduled",
    profitLoss: null,
    jobId: "",
    analysisUrl: null,
    analysisText: "",
    createdAt: null,
    updatedAt: null,
    notes: "Awaiting 2-hour analysis window.",
  }));
}

export async function scheduledDashboardRows(date = todayLocal()) {
  const schedule = await fetchMlbSchedule(date);
  return schedule.flatMap((game) => scheduleRowsForGame(game, date));
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

async function compileMatchup(matchupId, apiBase, sport = "mlb") {
  return fetchJson(apiUrl("compile", apiBase), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      matchupId,
      categories: [],
      prompt: `Automated ${sport.toUpperCase()} slate analysis`,
      sport,
      indexVector: process.env.STATR_INDEX_VECTOR || "1",
    }),
  });
}

async function startAnalysis({ matchupId, matchupLabel, compiled, apiBase, market, sport = "mlb" }) {
  const promptText =
    process.env.STATR_ANALYSIS_PROMPT ||
    `Run the Statr ${sport.toUpperCase()} ${market.label} market analysis and return the final betting signal, confidence, and any price-check notes.`;
  const userMessage =
    process.env.STATR_ANALYSIS_MESSAGE ||
    `Analyze only the ${market.label} market for this ${sport.toUpperCase()} matchup. Give the best available ${market.label} signal or say No Signal.`;

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
      conversationId: `auto_${sport}_${matchupId.replace(/[^a-z0-9]+/gi, "_")}_${market.key}`,
      sport,
      sportLabel: sport.toUpperCase(),
      matchupLabel,
      betMode: market.betMode,
      market: market.key,
      marketLabel: market.label,
      liveContextRequested: process.env.STATR_LIVE_CONTEXT === "1",
      responseMode: "analysis",
      intent: "analysis",
    }),
  });
}

async function getJobStatus(jobId, apiBase) {
  const url = apiUrl("job-status", apiBase);
  url.searchParams.set("job_id", jobId);
  return fetchJson(url);
}

function extractSignal(text = "", requestedMarket = "") {
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
  const inferredMarket = /total|over|under/i.test(signalLine)
    ? "total"
    : /\+1\.5|-1\.5|spread|run\s*line/i.test(signalLine)
      ? "spread"
      : "moneyline";
  const noSignal = /no signal|pass|avoid|no bet/i.test(signalLine || value);

  return {
    pick: signalLine.trim() || (noSignal ? "No Signal" : "Tracked Pick"),
    confidence: confidence.trim(),
    market: normalizeMarket(requestedMarket) || inferredMarket,
    noSignal,
    americanOdds: signalLine.match(/([+-]\d{3,4})\b/)?.[1] || value.match(/([+-]\d{3,4})\b/)?.[1] || "",
  };
}

export async function runDueAnalyses({ date, force = false, sport = "mlb" } = {}) {
  const slateDate = date || todayLocal();
  const control = await readAutoAnalysisControl(sport);
  if (!control.enabled) {
    return {
      date: slateDate,
      autoAnalysisEnabled: false,
      skipped: true,
      reason: control.error || "Dashboard auto-analysis is paused.",
      processed: [],
    };
  }
  const offsetMinutes = Number(process.env.STATR_RUN_OFFSET_MINUTES || 120);
  const windowMinutes = Number(process.env.STATR_DUE_WINDOW_MINUTES || 60);
  const maxGames = Number(process.env.STATR_MAX_GAMES_PER_RUN || 20);
  const stake = Number(process.env.STATR_DEFAULT_STAKE || 100);
  const apiBase = normalizeStatrApiBase();
  const markets = marketAnalyses();
  const now = force ? new Date("2999-01-01T00:00:00Z") : new Date();
  const existingRows = sport === "nfl" ? await listPicks({sport, limit:10000}) : await listPicksForDate(slateDate);
  const existing = new Set(
    existingRows
      .filter((row) => sport === "nfl" ? row.status !== "error" : !(force && row.status === "error"))
      .map((row) => `${row.game_pk}:${row.matchup_id}:${normalizeMarket(row.market)}`)
  );
  const schedule = sport === "nfl" ? (await fetchNflWeek()).games : await fetchMlbSchedule(slateDate);
  const games = (force ? schedule : dueGames(schedule, now, offsetMinutes, windowMinutes))
    .filter(game => sport !== "nfl" || (game.pregame && new Date(game.gameDate) > new Date()))
    .filter((game) => markets.some((market) => !existing.has(`${game.gamePk}:${matchupIdForGame(game)}:${market.key}`)))
    .slice(0, maxGames);

  const processed = [];
  for (const game of games) {
    const matchupId = matchupIdForGame(game);
    const gamePk = String(game.gamePk || "");
    const gameDate = sport === "nfl" ? game.officialDate : slateDate;
    const sportFields = sport === "nfl" ? {season:game.season, week:game.week} : {};
    const awayTeam = game.teams?.away?.team?.name || "";
    const homeTeam = game.teams?.home?.team?.name || "";
    const gameTimeUtc = new Date(game.gameDate).toISOString();
    const analysisDueUtc = new Date(new Date(game.gameDate).getTime() - offsetMinutes * 60_000).toISOString();
    let compiled = null;

    try {
      if (sport === "nfl") {
        const registry = await fetchJson(apiUrl("registry", apiBase) + "&sport=nfl");
        if (!registry.matchups?.includes(matchupId)) throw new Error("Matchup packet is not available in the current NFL registry.");
      }
      compiled = await compileMatchup(matchupId, apiBase, sport);
    } catch (err) {
      for (const market of markets) {
        const id = `${gameDate}-${gamePk}-${market.key}`;
        if (existing.has(`${gamePk}:${matchupId}:${market.key}`)) continue;
        await upsertPick({
          id,
          date: gameDate, ...sportFields,
          game_pk: gamePk,
          matchup_id: matchupId,
          game_time_utc: gameTimeUtc,
          analysis_due_utc: analysisDueUtc,
          away_team: awayTeam,
          home_team: homeTeam,
          pick: `${market.label} analysis failed`,
          market: market.key,
          stake,
          status: "error",
          notes: String(err?.message || err),
        }, sport);
        processed.push({ id, matchupId, market: market.key, status: "error" });
      }
      continue;
    }

    for (const market of markets) {
      const id = `${gameDate}-${gamePk}-${market.key}`;
      if (existing.has(`${gamePk}:${matchupId}:${market.key}`)) continue;

      try {
        if (sport === "nfl" && new Date(gameTimeUtc) <= new Date()) break;
        const started = await startAnalysis({
          matchupId,
          matchupLabel: `${awayTeam} @ ${homeTeam}`,
          compiled,
          apiBase,
          market, sport,
        });
        const jobId = started.job_id || started.id || "";
        if (!jobId) throw new Error("Analysis job was not accepted.");
        const row = {
          id,
          date: gameDate, ...sportFields,
          game_pk: gamePk,
          matchup_id: matchupId,
          game_time_utc: gameTimeUtc,
          analysis_due_utc: analysisDueUtc,
          away_team: awayTeam,
          home_team: homeTeam,
          pick: `${market.label} analysis queued`,
          market: market.key,
          confidence: null,
          american_odds: process.env.STATR_DEFAULT_AMERICAN_ODDS || null,
          stake,
          status: "analyzing",
          profit_loss: null,
          job_id: jobId,
          analysis_url: null,
          analysis_text: "",
          notes: `${market.label} analysis queued; waiting for Statr job to complete.`,
        };
        await upsertPick(row, sport);
        processed.push({ id, matchupId, market: market.key, status: row.status, jobId });
      } catch (err) {
        await upsertPick({
          id,
          date: gameDate, ...sportFields,
          game_pk: gamePk,
          matchup_id: matchupId,
          game_time_utc: gameTimeUtc,
          analysis_due_utc: analysisDueUtc,
          away_team: awayTeam,
          home_team: homeTeam,
          pick: `${market.label} analysis failed`,
          market: market.key,
          stake,
          status: "error",
          notes: String(err?.message || err),
        }, sport);
        processed.push({ id, matchupId, market: market.key, status: "error" });
      }
    }
  }

  return { date: slateDate, autoAnalysisEnabled: true, dueCount: games.length, processed };
}

export async function pollQueuedAnalyses({ date = "", limit = 50, sport = "mlb" } = {}) {
  const apiBase = normalizeStatrApiBase();
  const rows = await listAnalyzingPicks({ date, limit, sport });
  const processed = [];

  for (const row of rows) {
    try {
      const job = await getJobStatus(row.job_id, apiBase);
      const jobStatus = String(job.status || "").toLowerCase();

      if (["queued", "running", "processing", "unknown", ""].includes(jobStatus)) {
        processed.push({ id: row.id, jobId: row.job_id, status: jobStatus || "waiting" });
        continue;
      }

      if (["completed", "done", "succeeded", "success"].includes(jobStatus)) {
        const analysisText = String(job.reply || job.result || "");
        const signal = extractSignal(analysisText, row.market);
        const status = signal.noSignal ? "no_signal" : "pending";
        await patchPick(row.id, {
          pick: signal.pick,
          market: signal.market,
          confidence: signal.confidence,
          american_odds: signal.americanOdds || row.american_odds || process.env.STATR_DEFAULT_AMERICAN_ODDS || null,
          status,
          analysis_text: analysisText,
          notes: status === "no_signal" ? "Statr completed with no signal." : "Statr analysis completed.",
        }, sport);
        processed.push({ id: row.id, jobId: row.job_id, status });
        continue;
      }

      if (["failed", "error", "not_found"].includes(jobStatus)) {
        await patchPick(row.id, {
          status: "error",
          analysis_text: String(job.reply || job.result || ""),
          notes: String(job.error || job.result || `Statr job ended with status: ${jobStatus}`),
        }, sport);
        processed.push({ id: row.id, jobId: row.job_id, status: "error" });
        continue;
      }

      await patchPick(row.id, {
        notes: `Statr job returned unhandled status: ${jobStatus || "unknown"}`,
      }, sport);
      processed.push({ id: row.id, jobId: row.job_id, status: jobStatus || "unhandled" });
    } catch (err) {
      await patchPick(row.id, {
        notes: String(err?.message || err),
      }, sport);
      processed.push({ id: row.id, jobId: row.job_id, status: "poll_error" });
    }
  }

  return { date: date || "all", checkedCount: rows.length, processed };
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

function normalizePickText(value = "") {
  return String(value || "").toLowerCase().replace(/[^a-z0-9]+/g, "");
}

function teamAliases(name = "") {
  const parts = String(name || "").split(/\s+/).filter(Boolean);
  return [name, slugTeam(name), parts.at(-1) || "", parts.slice(-2).join(" ")]
    .map(normalizePickText)
    .filter(Boolean);
}

function pickIncludesTeam(pick, teamName) {
  const normalizedPick = normalizePickText(pick);
  return teamAliases(teamName).some((alias) => alias.length >= 3 && normalizedPick.includes(alias));
}

function pickedSide(row) {
  const pick = String(row.pick || "");
  if (pickIncludesTeam(pick, row.away_team)) return "away";
  if (pickIncludesTeam(pick, row.home_team)) return "home";
  return "";
}

function extractRunline(pick = "") {
  const values = [...String(pick).matchAll(/([+-]\d+(?:\.\d+)?)/g)]
    .map((match) => Number(match[1]))
    .filter((value) => Number.isFinite(value) && Math.abs(value) < 20);
  return values.length ? values[0] : null;
}

function extractTotal(pick = "") {
  return Number(String(pick).match(/\b(?:over|under)\s+(\d+(?:\.\d+)?)/i)?.[1] || NaN);
}

function inferSettlement(row, game) {
  if (!game) return null;
  if (!/final|game over/i.test(String(game.status?.detailedState || ""))) return null;
  if (["won", "lost", "push"].includes(row.status)) return null;

  if (game.teams?.away?.score == null || game.teams?.home?.score == null) return null;
  const awayScore = Number(game.teams?.away?.score);
  const homeScore = Number(game.teams?.home?.score);
  if (!Number.isFinite(awayScore) || !Number.isFinite(homeScore)) return null;

  const pick = String(row.pick || "").toLowerCase();
  let status = "";

  if (row.market === "total") {
    const line = extractTotal(pick);
    const total = awayScore + homeScore;
    const isOver = /\bover\b/i.test(pick);
    const isUnder = /\bunder\b/i.test(pick);
    if (!Number.isFinite(line) || (!isOver && !isUnder)) return null;
    if (total === line) status = "push";
    else status = isOver ? (total > line ? "won" : "lost") : total < line ? "won" : "lost";
  } else if (["spread", "runline"].includes(row.market)) {
    const side = pickedSide(row);
    const line = extractRunline(pick);
    if (!side || !Number.isFinite(line)) return null;
    const pickedScore = side === "away" ? awayScore + line : homeScore + line;
    const opponentScore = side === "away" ? homeScore : awayScore;
    if (pickedScore === opponentScore) status = "push";
    else status = pickedScore > opponentScore ? "won" : "lost";
  } else if (row.market === "moneyline") {
    const side = pickedSide(row);
    if (!side) return null;
    if (awayScore === homeScore) return {status:"push", profit_loss:0, notes:"Final score tied."};
    const awayWon = awayScore > homeScore;
    const homeWon = homeScore > awayScore;
    status = side === "away" ? (awayWon ? "won" : "lost") : homeWon ? "won" : "lost";
  } else {
    return null;
  }

  if (!status) return null;

  return {
    status,
    profit_loss: profitFor(status, row.american_odds, row.stake),
    notes: [row.notes, `Final score: ${row.away_team} ${awayScore}, ${row.home_team} ${homeScore}`]
      .filter(Boolean)
      .join(" | "),
  };
}


export async function settleDate({ date, sport = "mlb" } = {}) {
  if (sport === "nfl") {
    const rows = (await listPicks({sport, limit:10000})).filter(r => r.status === "pending" && (!date || r.date === date));
    const settled = [];
    for (const key of new Set(rows.map(r => `${r.season}:${r.week}`))) {
      const [season, week] = key.split(":");
      const {games} = await fetchNflWeek({season, week});
      for (const row of rows.filter(r => `${r.season}:${r.week}` === key)) {
        const patch = inferSettlement(row, games.find(g => g.gamePk === row.game_pk));
        if (!patch) continue;
        await patchPick(row.id, patch, sport);
        settled.push({id:row.id, status:patch.status});
      }
    }
    return {settledCount:settled.length, settled};
  }
  const slateDates = date ? [date] : [...new Set([todayLocal(), localDateOffset(-1)])];
  const settled = [];

  for (const slateDate of slateDates) {
    const rows = (await listPicksForDate(slateDate, sport)).filter(row => row.status === "pending");
    const schedule = await fetchMlbSchedule(slateDate);
    const games = new Map(schedule.map((game) => [String(game.gamePk || ""), game]));

    for (const row of rows) {
      const patch = inferSettlement(row, games.get(String(row.game_pk || "")));
      if (!patch) continue;
      await patchPick(row.id, patch, sport);
      settled.push({ date: slateDate, id: row.id, status: patch.status, profitLoss: patch.profit_loss });
    }
  }

  return { date: date || slateDates.join(","), settledCount: settled.length, settled };
}
