// Vercel 서버리스 함수: 봇과 둔 대국 기록 저장(v0.7.0 보안, BUG-124).
// 예전에는 브라우저가 수순·결과를 신고한 대로 저장해 이기지 않은 대국을 승리로 기록할 수 있었다. 이제 로그인한 사용자의 신고를 chess.js로 처음부터 재생해
//  · 모든 수가 합법이고(표준 시작 위치),
//  · 체크메이트로 끝난 대국은 실제 승패와, 스테일메이트·무승부로 끝난 대국은 무승부와 신고 결과가 같을 때만 저장한다.
//  · 끝나지 않은 위치는 '패배'(기권·시간 초과)나 '무승부'만 저장한다 — '승리'는 서버가 확인할 수 없으므로 저장하지 않는다.
// 호출 제한: 사용자당 시간당 60판. 저장은 service_role 전용 RPC(bot_game_record_verified)가 한다.
import { Chess } from "chess.js";
import { supabaseEnv, rateLimited, authUser, clientIp } from "./_lib/server.js";

function judge(sans) {
  const c = new Chess();
  for (const san of sans) { if (typeof san !== "string" || san.length > 12) return null; try { c.move(san); } catch { return null; } }
  if (c.isCheckmate()) return { end: "checkmate", winner: c.turn() === "w" ? "b" : "w" };
  if (c.isStalemate() || c.isDraw()) return { end: "draw" };
  return { end: "open" };
}

export default async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");
  if (req.method !== "POST") { res.status(405).json({ error: "POST 요청만 지원합니다." }); return; }
  const env = supabaseEnv();
  if (!env) { res.status(500).json({ error: "서버에 아직 설정되지 않았어요." }); return; }
  const user = await authUser(env, req);
  if (!user) { res.status(401).json({ error: "로그인이 필요해요." }); return; }
  if (await rateLimited(env, [["bot:u:" + user.id, 60, 3600], ["bot:ip:" + clientIp(req), 200, 3600]])) { res.status(429).json({ error: "rate_limited" }); return; }

  const { sans, color, result, bot_elo, time_control } = req.body || {};
  if (!Array.isArray(sans) || sans.length < 2 || sans.length > 600 || !["w", "b"].includes(color) || !["win", "loss", "draw"].includes(result)) { res.status(400).json({ error: "invalid" }); return; }
  const elo = Number(bot_elo);
  if (!Number.isInteger(elo) || elo < 100 || elo > 3200) { res.status(400).json({ error: "invalid" }); return; }
  const j = judge(sans);
  if (!j) { res.status(400).json({ error: "illegal game" }); return; }
  let ok;
  if (j.end === "checkmate") ok = result === (j.winner === color ? "win" : "loss");
  else if (j.end === "draw") ok = result === "draw";
  else ok = result === "loss" || result === "draw";   // 끝나지 않은 위치의 '승리'는 서버가 확인할 수 없다
  if (!ok) { res.status(400).json({ error: "result mismatch" }); return; }
  try {
    const r = await fetch(env.url + "/rest/v1/rpc/bot_game_record_verified", {
      method: "POST", headers: { apikey: env.service, Authorization: "Bearer " + env.service, "Content-Type": "application/json" },
      body: JSON.stringify({ p_uid: user.id, p_sans: sans, p_color: color, p_result: result, p_bot_elo: elo, p_time_control: typeof time_control === "string" ? time_control : "600-0" }),
    });
    res.status(r.ok ? 200 : 502).json({ ok: r.ok });
  } catch { res.status(502).json({ error: "unavailable" }); }
}
