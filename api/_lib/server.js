// 서버리스 함수 공용 도우미(v0.7.0 보안). 파일명이 _로 시작하는 폴더는 Vercel이 API 경로로 노출하지 않는다.
//  · clientIp: 요청자 IP(Vercel이 채우는 헤더를 우선 — 브라우저가 보낸 X-Forwarded-For는 Vercel이 덮어쓴다)
//  · rateLimit: DB(public.rate_limit_hit, service_role 전용)에 저장하는 호출 제한 — 서버리스 인스턴스가 여러 개여도 함께 센다.
//    DB가 응답하지 않으면 인스턴스 메모리 카운터로 대신한다(제한이 없어지는 것보다 낫다).
//  · supabaseEnv: 환경변수 묶음(없으면 null)

export function clientIp(req) {
  const h = req.headers || {};
  const raw = h["x-vercel-forwarded-for"] || h["x-real-ip"] || h["x-forwarded-for"] || "?";
  return String(raw).split(",")[0].trim() || "?";
}

export function supabaseEnv() {
  const url = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
  const anon = process.env.VITE_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY;
  const service = process.env.SUPABASE_SERVICE_ROLE_KEY;
  return url && anon && service ? { url, anon, service } : null;
}

const mem = new Map(); // key -> { start, n }
function memHit(key, limit, windowSec, cost = 1) {
  const now = Date.now(), e = mem.get(key);
  if (cost === 0) return !!e && now - e.start < windowSec * 1000 && e.n > limit;
  if (!e || now - e.start >= windowSec * 1000) { mem.set(key, { start: now, n: cost }); if (mem.size > 5000) for (const [k, v] of mem) if (now - v.start > 3600e3) mem.delete(k); return false; }
  e.n += cost; return e.n > limit;
}

/** rules: [[key, limit, windowSeconds, cost?], …] — 하나라도 초과하면 true. cost 0은 세지 않고 초과 여부만 본다. */
export async function rateLimited(env, rules) {
  let limited = false;
  for (const [key, limit, windowSec, cost = 1] of rules) {
    let hit;
    try {
      const r = await fetch(env.url + "/rest/v1/rpc/rate_limit_hit", {
        method: "POST",
        headers: { apikey: env.service, Authorization: "Bearer " + env.service, "Content-Type": "application/json" },
        body: JSON.stringify({ p_key: key, p_limit: limit, p_window_seconds: windowSec, p_cost: cost }),
      });
      if (!r.ok) throw new Error("rpc " + r.status);
      hit = (await r.json()) === true;
    } catch { hit = memHit(key, limit, windowSec, cost); }
    if (hit) limited = true;
  }
  return limited;
}

/** 아이디 → 이메일(서버 안에서만 쓴다. 응답으로 내보내지 말 것). 없으면 "". */
export async function emailForUsername(env, username) {
  try {
    const r = await fetch(env.url + "/rest/v1/rpc/email_for_username", {
      method: "POST",
      headers: { apikey: env.service, Authorization: "Bearer " + env.service, "Content-Type": "application/json" },
      body: JSON.stringify({ p_username: username }),
    });
    if (!r.ok) return "";
    const v = await r.json();
    return typeof v === "string" ? v : "";
  } catch { return ""; }
}
