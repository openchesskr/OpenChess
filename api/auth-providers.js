// Vercel 서버리스 함수: 이메일이 어떤 방식(email/google 등)으로 가입돼 있는지 알려 준다 — 가입 화면에서 "이미 구글로 가입됨" 안내용.
// (v0.7.0 보안, BUG-117) 예전에는 account_providers RPC가 비로그인에게 열려 있어 이메일 가입 여부를 무제한으로 열거할 수 있었다. 이제 서버가 대신 호출하고
// IP당 10분 10회, 대상 이메일당 10분 5회로 제한한다(Supabase 가입 응답 자체가 이미 '이미 가입됨'을 알려 주므로 안내 기능은 유지하되 대량 열거만 막는다).
import { clientIp, supabaseEnv, rateLimited } from "./_lib/server.js";

export default async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");
  if (req.method !== "POST") { res.status(405).json({ error: "POST 요청만 지원합니다." }); return; }
  const env = supabaseEnv();
  if (!env) { res.status(500).json({ error: "서버에 아직 설정되지 않았어요." }); return; }
  const { email } = req.body || {};
  if (typeof email !== "string" || !/^[^\s@]{1,64}@[^\s@]{1,255}$/.test(email.trim()) || email.length > 254) { res.status(400).json({ error: "invalid" }); return; }
  const who = email.trim().toLowerCase();
  if (await rateLimited(env, [["prov:ip:" + clientIp(req), 10, 600]])) { res.status(429).json({ error: "rate_limited" }); return; }
  if (await rateLimited(env, [["prov:id:" + who, 5, 600]])) { res.status(429).json({ error: "rate_limited" }); return; }
  try {
    const r = await fetch(env.url + "/rest/v1/rpc/account_providers", {
      method: "POST", headers: { apikey: env.service, Authorization: "Bearer " + env.service, "Content-Type": "application/json" }, body: JSON.stringify({ p_email: who }),
    });
    const provs = r.ok ? await r.json() : [];
    res.status(200).json({ providers: Array.isArray(provs) ? provs : [] });
  } catch { res.status(502).json({ error: "unavailable" }); }
}
