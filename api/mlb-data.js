import { json, listPicks, toDashboardRow } from "../lib/statrMlb.js";

export default async function handler(req, res) {
  if (req.method !== "GET") {
    return json(res, 405, { error: "Method not allowed" });
  }

  try {
    const rows = await listPicks({ limit: Number(req.query?.limit || 500) });
    return json(res, 200, {
      rows: rows.map(toDashboardRow),
      generatedAt: new Date().toISOString(),
    });
  } catch (err) {
    return json(res, 500, { error: String(err?.message || err) });
  }
}
