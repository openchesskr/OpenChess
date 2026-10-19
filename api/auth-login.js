// Vercel 서버리스 함수: 아이디/이메일 + 비밀번호 로그인(v0.7.0 보안, BUG-107).
// 예전에는 브라우저가 email_for_username RPC로 아이디의 이메일 주소를 받아 와 로그인했는데, 그 RPC가 anon에게 열려 있어 누구나 아이디만으로
// 이메일을 수집할 수 있었다. 이제 아이디 → 이메일 변환을 서버 안에서만 하고(브라우저에는 이메일이 내려가지 않는다), Supabase Auth(GoTrue)
// 로그인도 여기서 대신 호출해 세션만 돌려준다.
//  · 호출 제한(DB 카운터라 인스턴스가 여럿이어도 함께 센다): IP당 20회/10분, IP+대상 조합당 10회/10분, 대상(아이디·이메일) 전체로는 30회/10분 —
//    시도를 시작할 때 먼저 1회를 원자적으로 잡고(확인 후 기록하면 동시 요청이 한도를 넘는다), 로그인에 성공하면 돌려준다. 그래서 실패·서버 오류·상대 서버 제한 응답은 모두 센다.
//    대상 한도를 낮게 잡으면 남이 틀린 시도를 쏟아부어 주인을 잠글 수 있어서(계정 잠금 공격) 높게(30) 잡고, IP+대상 조합 한도를 따로 둔다.
//  · 없는 아이디도 같은 응답·비슷한 지연(가짜 로그인 시도)으로 처리해 아이디 존재 여부를 응답으로 구분할 수 없다.
//  · 실패하면 항상 { error: "invalid" } — 단, 비밀번호가 없는 소셜 가입 계정이면 providers 힌트를 함께 준다(기존 화면의 안내용).
import { clientIp, supabaseEnv, rateLimited, emailForUsername } from "./_lib/server.js";

const WINDOW = 600;

export default async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");
  if (req.method !== "POST") { res.status(405).json({ error: "POST 요청만 지원합니다." }); return; }
  const env = supabaseEnv();
  if (!env) { res.status(500).json({ error: "서버에 아직 설정되지 않았어요." }); return; }

  const { login, password } = req.body || {};
  if (typeof login !== "string" || typeof password !== "string" || !login.trim() || !password || login.length > 254 || password.length > 256) {
    res.status(400).json({ error: "invalid" }); return;
  }
  const who = login.trim().toLowerCase();
  const ip = clientIp(req);
  // 1단계: IP·IP+대상 한도에 막힌 요청은 대상 전체 한도를 소모하지 않는다(한 곳에서 연타해도 주인의 몫이 줄지 않게).
  if (await rateLimited(env, [["login:ip:" + ip, 20, WINDOW], ["login:ipid:" + ip + ":" + who, 10, WINDOW]])) {
    res.status(429).json({ error: "rate_limited" }); return;
  }
  // 2단계: 대상 전체 한도 — 시도를 시작할 때 원자적으로 1회를 잡는다.
  if (await rateLimited(env, [["login:fail:" + who, 30, WINDOW, 1]])) {
    res.status(429).json({ error: "rate_limited" }); return;
  }

  try {
    let email = who.includes("@") ? who : await emailForUsername(env, who);
    // 없는 아이디도 실제 로그인과 같은 길을 한 번 지난다(응답 시간으로 존재 여부를 알아내지 못하게).
    const known = !!email;
    if (!known) email = "nobody-" + Math.random().toString(36).slice(2) + "@invalid.openchess.kr";
    const r = await fetch(env.url + "/auth/v1/token?grant_type=password", {
      method: "POST", headers: { apikey: env.anon, "Content-Type": "application/json" }, body: JSON.stringify({ email, password }),
    });
    const j = await r.json().catch(() => ({}));
    if (r.ok && known && j && j.access_token) {
      await rateLimited(env, [["login:fail:" + who, 30, WINDOW, -1]]);   // 성공한 시도는 대상 한도에서 돌려준다
      res.status(200).json(j); return;
    }
    if (r.status === 429) { res.status(429).json({ error: "rate_limited" }); return; }
    const out = { error: "invalid" };
    if (known && who.includes("@") === false) {
      try {
        const p = await fetch(env.url + "/rest/v1/rpc/account_providers", {
          method: "POST", headers: { apikey: env.service, Authorization: "Bearer " + env.service, "Content-Type": "application/json" }, body: JSON.stringify({ p_email: email }),
        });
        const provs = p.ok ? await p.json() : [];
        if (Array.isArray(provs) && provs.length && !provs.includes("email")) out.providers = provs;
      } catch { /* 힌트는 없어도 된다 */ }
    }
    res.status(401).json(out);
  } catch {
    res.status(502).json({ error: "unavailable" });
  }
}
