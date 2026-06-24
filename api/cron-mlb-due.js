import { json, requireCronAuth, runDueAnalyses } from "../lib/statrMlb.js";

export default async function handler(req, res) {
  if (req.method !== "GET" && req.method !== "POST") {
    return json(res, 405, { error: "Method not allowed" });
  }

  const authError = requireCronAuth(req);
  if (authError) return json(res, 401, { error: authError });

  try {
    const result = await runDueAnalyses({
      date: req.query?.date || "",
      force: ["1", "true", "yes"].includes(String(req.query?.force || "").toLowerCase()),
    });
    return json(res, 200, { ok: true, ...result });
  } catch (err) {
    return json(res, 500, { ok: false, error: String(err?.message || err) });
  }
}
