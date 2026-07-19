import { json, listPicks, scheduledDashboardRows, toDashboardRow } from "../lib/statrMlb.js";

export default async function handler(req, res) {
  if (req.method !== "GET") {
    return json(res, 405, { error: "Method not allowed" });
  }

  try {
    const rows = await listPicks({ limit: Number(req.query?.limit || 500) });
    const dashboardRows = rows.map(toDashboardRow);
    const requestedDate = String(req.query?.date || "");
    let scheduledRows = [];
    try {
      scheduledRows = await scheduledDashboardRows(requestedDate || undefined);
    } catch {
      scheduledRows = [];
    }
    const existing = new Set(dashboardRows.map((row) => row.id));
    const mergedRows = [
      ...dashboardRows,
      ...scheduledRows.filter((row) => !existing.has(row.id)),
    ];

    return json(res, 200, {
      rows: mergedRows,
      generatedAt: new Date().toISOString(),
    });
  } catch (err) {
    return json(res, 500, { error: String(err?.message || err) });
  }
}
