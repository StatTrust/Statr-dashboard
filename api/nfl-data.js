import { json, listPicks, scheduleRowsForGame, toDashboardRow } from "../lib/statrMlb.js";
import { fetchNflWeek, nflSelection } from "../lib/nflSchedule.js";

export default async function handler(req, res) {
  if (req.method !== "GET") return json(res, 405, {error:"Method not allowed"});
  let selection;
  try { selection = nflSelection(req.query); }
  catch (error) { return json(res, 400, {error:error.message}); }
  try {
    const board = await fetchNflWeek(selection);
    // Page through REST results so monthly metrics are not limited to one page.
    const saved = (await listPicks({sport:"nfl", season:board.season, limit:10000})).map(toDashboardRow);
    const ids = new Set(saved.map(r => r.id));
    const scheduled = board.games.flatMap(game => scheduleRowsForGame(game, game.officialDate));
    return json(res, 200, {...board, games:undefined, sport:"nfl",
      rows:[...saved, ...scheduled.filter(r => !ids.has(r.id))], generatedAt:new Date().toISOString()});
  } catch (error) {
    return json(res, 503, {error:"NFL results could not be loaded. Please retry."});
  }
}
