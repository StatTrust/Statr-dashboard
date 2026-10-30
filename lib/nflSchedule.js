const SCOREBOARD = "https://site.api.espn.com/apis/site/v2/sports/football/nfl/scoreboard";

export function nflSelection(query = {}) {
  const now = new Date();
  const year = Number(query.season || (now.getUTCMonth() < 3 ? now.getUTCFullYear() - 1 : now.getUTCFullYear()));
  const week = query.week ? Number(query.week) : null;
  if (!Number.isInteger(year) || year < 2020 || year > now.getUTCFullYear() + 1 ||
      (week !== null && (!Number.isInteger(week) || week < 1 || week > 18))) {
    throw new Error("Invalid NFL season or week.");
  }
  return { season: year, week };
}

export function normalizeNflBoard(board) {
  const season = Number(board.season?.year);
  const week = Number(board.week?.number);
  const weeks = (board.leagues?.[0]?.calendar || []).find(c => String(c.value) === "2")?.entries || [];
  const games = (board.events || []).map(event => {
    const competition = event.competitions?.[0];
    const competitors = competition?.competitors || [];
    const away = competitors.find(c => c.homeAway === "away");
    const home = competitors.find(c => c.homeAway === "home");
    if (!away || !home) throw new Error("NFL schedule is missing team identity.");
    const slug = team => String(team.name).toLowerCase().replace(/[^a-z0-9]/g, "");
    const status = competition.status || event.status;
    return {
      gamePk: String(event.id), gameDate: competition.date || event.date,
      officialDate: String(competition.date || event.date).slice(0, 10),
      matchupId: `nfl/${season}/week${week}/${slug(away.team)}_${slug(home.team)}`,
      season, week, completed: status?.type?.completed === true,
      pregame: status?.type?.state === "pre",
      status: { detailedState: status?.type?.completed ? "Final" : status?.type?.description || "" },
      teams: Object.fromEntries([["away", away], ["home", home]].map(([side, c]) => [side, {
        score: c.score == null ? null : Number(c.score),
        team: { name: c.team.displayName, abbreviation: c.team.abbreviation },
      }])),
    };
  });
  return { season, week, weeks: weeks.map(w => ({ week: Number(w.value), label: w.label, detail: w.detail })), games };
}

export async function fetchNflWeek(query = {}) {
  const selection = nflSelection(query);
  const url = new URL(SCOREBOARD);
  if (selection.week) {
    url.searchParams.set("dates", selection.season);
    url.searchParams.set("seasontype", "2");
    url.searchParams.set("week", selection.week);
  }
  const response = await fetch(url, { signal: AbortSignal.timeout(15000) });
  if (!response.ok) throw new Error("NFL schedule is temporarily unavailable.");
  const board = normalizeNflBoard(await response.json());
  if (board.season !== selection.season || !Number.isInteger(board.week) || board.week < 1 || board.week > 18 || (selection.week && board.week !== selection.week)) {
    throw new Error("NFL schedule returned a different season or week.");
  }
  return board;
}
