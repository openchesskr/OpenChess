// Vercel 서버리스 함수: 공유 리뷰 캐시(reviewed_games) 저장 — chess.com 대국 번호별 기보·분석을 모든 방문자가 같이 쓴다.
// (v0.7.0 보안, BUG-115) 예전에는 비로그인 누구나 RPC로 아직 비어 있는 대국 번호에 아무 기보나 먼저 올릴 수 있었고(선착순 저장), 그러면 그 번호의 공유 리뷰 링크에 가짜 기보가 보였다.
// 이제: 로그인 필수 · 사용자당 호출 제한 · 기보는 chess.js로 처음부터 재생해 모든 수가 합법일 때만 · 크기 상한. 저장은 service_role 전용 RPC가 하며 이미 올라온 기보는 덮어쓰지 않는다.
// (남는 한계: 합법적인 가짜 대국은 chess.com 원본과 대조하지 않는 한 판별할 수 없다 — BUGS.md BUG-115.)
import { Chess } from "chess.js";
import { clientIp, supabaseEnv, rateLimited, authUser } from "./_lib/server.js";

function legalGame(sans, fenRoot) {
  if (!Array.isArray(sans) || !sans.length || sans.length > 1000) return false;
  try {
    const c = fenRoot ? new Chess(String(fenRoot)) : new Chess();
    for (const san of sans) { if (typeof san !== "string" || san.length > 12) return false; c.move(san); }
    return true;
  } catch { return false; }
}

export default async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");
  if (req.method !== "POST") { res.status(405).json({ error: "POST 요청만 지원합니다." }); return; }
  const env = supabaseEnv();
  if (!env) { res.status(500).json({ error: "서버에 아직 설정되지 않았어요." }); return; }
  const user = await authUser(env, req);
  if (!user) { res.status(401).json({ error: "로그인이 필요해요." }); return; }
  if (await rateLimited(env, [["review:u:" + user.id, 40, 600], ["review:ip:" + clientIp(req), 120, 600]])) { res.status(429).json({ error: "rate_limited" }); return; }

  const { kind, cc_id, data } = req.body || {};
  const ccId = Number(cc_id);
  if (!Number.isInteger(ccId) || ccId <= 0 || ccId > 1e13 || !data || typeof data !== "object") { res.status(400).json({ error: "invalid" }); return; }
  let rpc, args;
  if (kind === "game") {
    if (JSON.stringify(data).length > 200000) { res.status(413).json({ error: "too large" }); return; }
    if (!legalGame(data.moves || data.sans, data.fenRoot)) { res.status(400).json({ error: "illegal game" }); return; }
    rpc = "reviewed_game_put"; args = { p_cc_id: ccId, p_data: data };
  } else if (kind === "analysis") {
    if (JSON.stringify(data).length > 1000000) { res.status(413).json({ error: "too large" }); return; }
    rpc = "reviewed_analysis_put"; args = { p_cc_id: ccId, p_analysis: data };
  } else { res.status(400).json({ error: "invalid" }); return; }
  try {
    const r = await fetch(env.url + "/rest/v1/rpc/" + rpc, { method: "POST", headers: { apikey: env.service, Authorization: "Bearer " + env.service, "Content-Type": "application/json" }, body: JSON.stringify(args) });
    res.status(r.ok ? 200 : 502).json({ ok: r.ok });
  } catch { res.status(502).json({ error: "unavailable" }); }
}
