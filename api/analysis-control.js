import crypto from "node:crypto";
import {
  json,
  readAutoAnalysisControl,
  writeAutoAnalysisControl,
} from "../lib/statrMlb.js";

function safeEqual(left = "", right = "") {
  const leftBuffer = Buffer.from(String(left));
  const rightBuffer = Buffer.from(String(right));
  return leftBuffer.length === rightBuffer.length && crypto.timingSafeEqual(leftBuffer, rightBuffer);
}

function authorized(req) {
  const expected = String(process.env.DASHBOARD_ADMIN_SECRET || "").trim();
  const received = String(req.headers.authorization || "").replace(/^Bearer\s+/i, "").trim();
  return Boolean(expected && received && safeEqual(received, expected));
}

function requestBody(req) {
  if (!req.body) return {};
  if (typeof req.body === "object") return req.body;
  try {
    return JSON.parse(String(req.body));
  } catch {
    return {};
  }
}

export default async function handler(req, res) {
  if (!["GET", "POST", "PATCH"].includes(req.method)) {
    return json(res, 405, { error: "Method not allowed" });
  }
  if (!process.env.DASHBOARD_ADMIN_SECRET) {
    return json(res, 503, { error: "DASHBOARD_ADMIN_SECRET is not configured." });
  }
  if (!authorized(req)) {
    return json(res, 401, { error: "Missing or invalid dashboard admin credentials." });
  }

  try {
    if (req.method === "GET") {
      return json(res, 200, { ok: true, ...(await readAutoAnalysisControl()) });
    }

    const body = requestBody(req);
    if (typeof body.enabled !== "boolean") {
      return json(res, 400, { error: "enabled must be a boolean." });
    }
    const control = await writeAutoAnalysisControl(body.enabled);
    return json(res, 200, { ok: true, ...control });
  } catch (err) {
    console.error("analysis-control failed", err);
    return json(res, 500, { ok: false, error: String(err?.message || err) });
  }
}
