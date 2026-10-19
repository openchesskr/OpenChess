// Vercel 서버리스 함수: 브라우저가 보내는 CSP 위반 보고를 받아 로그로 남긴다(v0.7.0 보안, BUG-114). 정책을 강제 적용한 뒤 실제 사용자에게서 막힌 것이 있는지 Vercel 로그에서 볼 수 있다.
// 인증이 없는 공개 입구이므로 크기·횟수를 제한하고 본문은 로그에만 쓴다(저장·반환하지 않는다). 항상 204.
import { clientIp, supabaseEnv, rateLimited } from "./_lib/server.js";

export default async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");
  if (req.method !== "POST") { res.status(405).end(); return; }
  if (await rateLimited(supabaseEnv(), [["csp:ip:" + clientIp(req), 20, 60]])) { res.status(204).end(); return; }
  try {
    const b = req.body && typeof req.body === "object" ? (req.body["csp-report"] || req.body) : {};
    const pick = (k) => String((b && b[k]) || "").slice(0, 200);
    console.warn("CSP violation:", JSON.stringify({ directive: pick("violated-directive") || pick("effectiveDirective"), blocked: pick("blocked-uri") || pick("blockedURL"), document: pick("document-uri") || pick("documentURL"), source: pick("source-file") }));
  } catch { /* 보고는 최선 노력 */ }
  res.status(204).end();
}
