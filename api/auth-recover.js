// Vercel 서버리스 함수: 비밀번호 재설정 메일 요청(v0.7.0 보안, BUG-107). 아이디 → 이메일 변환을 서버 안에서만 하고,
// 계정이 있든 없든 항상 { ok: true }로 같게 답한다(존재 여부 비노출). 호출 제한: IP당 10회/시간, IP+대상 조합당 3회/시간, 대상 전체 20회/시간
// (대상 전체 한도를 낮게 잡으면 남이 주인의 재설정을 막을 수 있어서 IP+대상 조합 한도를 따로 둔다).
import { clientIp, supabaseEnv, rateLimited, emailForUsername } from "./_lib/server.js";

export default async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");
  if (req.method !== "POST") { res.status(405).json({ error: "POST 요청만 지원합니다." }); return; }
  const env = supabaseEnv();
  if (!env) { res.status(500).json({ error: "서버에 아직 설정되지 않았어요." }); return; }
  const { login } = req.body || {};
  if (typeof login !== "string" || !login.trim() || login.length > 254) { res.status(400).json({ error: "invalid" }); return; }
  const who = login.trim().toLowerCase();
  if (await rateLimited(env, [["recover:ip:" + clientIp(req), 10, 3600], ["recover:ipid:" + clientIp(req) + ":" + who, 3, 3600], ["recover:id:" + who, 20, 3600]])) { res.status(429).json({ error: "rate_limited" }); return; }
  try {
    const email = who.includes("@") ? who : await emailForUsername(env, who);
    if (email) {
      await fetch(env.url + "/auth/v1/recover", { method: "POST", headers: { apikey: env.anon, "Content-Type": "application/json" }, body: JSON.stringify({ email }) }).catch(() => { });
    }
  } catch { /* 존재 여부를 드러내지 않기 위해 오류도 삼킨다 */ }
  res.status(200).json({ ok: true });
}
