// 서버리스 API(/api/*) 모의 공격 — fetch를 가짜로 바꿔 외부(Lichess·Gemini·Supabase)로 실제 요청이 나가지 않는다.
import { pathToFileURL } from "node:url";
import { resolve } from "node:path";

const load = (f) => import(pathToFileURL(resolve("api", f)).href + "?t=" + Math.random());
const mkRes = () => { const r = { code: 200, headers: {}, body: null, status(c) { r.code = c; return r; }, setHeader(k, v) { r.headers[k.toLowerCase()] = v; }, json(b) { r.body = b; return r; }, send(b) { r.body = b; return r; } }; return r; };
async function withFetch(impl, fn) { const real = globalThis.fetch; globalThis.fetch = impl; try { return await fn(); } finally { globalThis.fetch = real; } }

export default [
  { id: "BUG-116a", kind: "attack", title: "로그인 없이 /api/lichess 호출 → 서버의 LICHESS_TOKEN으로 외부 요청이 나감",
    async run() {
      process.env.LICHESS_TOKEN = "SECRET_SERVER_TOKEN";
      const { default: handler } = await load("lichess.js");
      const sent = [];
      await withFetch(async (url, opt) => { sent.push({ url: String(url), auth: opt && opt.headers && opt.headers.Authorization }); return new Response("{}", { status: 200 }); },
        async () => { for (let i = 0; i < 30; i++) await handler({ query: { master: "1", fen: "x" + i }, headers: {} }, mkRes()); });
      const withTok = sent.filter((s) => s.auth === "Bearer SECRET_SERVER_TOKEN").length;
      return { breached: withTok >= 30, evidence: `익명 30회 요청 → 서버 토큰을 실어 외부 호출 ${withTok}회 (인증·호출 제한 없음)` };
    } },
  { id: "BUG-116b", kind: "attack", title: "로그인 없이 /api/scan-board 반복 호출(서로 다른 X-Forwarded-For) → Gemini 쿼터 소모",
    async run() {
      process.env.GEMINI_API_KEY = "gk";
      const { default: handler } = await load("scan-board.js");
      let gemini = 0;
      await withFetch(async () => { gemini++; return new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: JSON.stringify({ kind: "none", confidence: "low" }) }] }, finishReason: "STOP" }] }), { status: 200 }); },
        async () => { for (let i = 0; i < 40; i++) await handler({ method: "POST", headers: { "x-forwarded-for": "10.0.0." + i }, body: { image: "AAAA", mediaType: "image/png" } }, mkRes()); });
      return { breached: gemini >= 40, evidence: `익명 요청 40건 → Gemini 호출 ${gemini}회 (로그인 불필요, IP 헤더만 바꾸면 호출 제한 회피 — Vercel이 XFF를 덮어쓰는 운영 환경에선 완화됨)` };
    } },
  { id: "A1", kind: "hold", title: "/api/translate: 토큰 없이 호출",
    async run() {
      Object.assign(process.env, { VITE_SUPABASE_URL: "https://sb.test", VITE_SUPABASE_ANON_KEY: "anon", SUPABASE_SERVICE_ROLE_KEY: "svc", GEMINI_API_KEY: "gk" });
      const { default: handler } = await load("translate.js"); const res = mkRes();
      await handler({ method: "POST", headers: {}, body: { kind: "note", target: "en", texts: ["안녕"] } }, res);
      return { breached: res.code !== 401, evidence: "응답 코드 " + res.code };
    } },
  { id: "A2", kind: "hold", title: "/api/translate: 채팅(kind=chat) 번역 시도 · 지시문 주입은 데이터로만 취급",
    async run() {
      const { default: handler } = await load("translate.js"); const res = mkRes();
      await handler({ method: "POST", headers: { authorization: "Bearer t" }, body: { kind: "chat", target: "en", texts: ["hi"] } }, res);
      return { breached: res.code !== 400, evidence: "응답 코드 " + res.code };
    } },
  { id: "A3", kind: "hold", title: "/api/pvp-finish: 아직 끝나지 않은 대국을 '백 승리'로 신고",
    async run() {
      Object.assign(process.env, { VITE_SUPABASE_URL: "https://sb.test", VITE_SUPABASE_ANON_KEY: "anon", SUPABASE_SERVICE_ROLE_KEY: "svc" });
      const { default: handler } = await load("pvp-finish.js"); const res = mkRes(); let rpc = 0;
      await withFetch(async (url) => {
        const u = String(url);
        if (u.includes("/auth/v1/user")) return new Response(JSON.stringify({ id: "u1" }), { status: 200 });
        if (u.includes("/rest/v1/pvp_games")) return new Response(JSON.stringify([{ id: 5, white_uid: "u1", black_uid: "u2", sans: ["e4", "e5"], status: "active", game_type: "chess" }]), { status: 200 });
        if (u.includes("pvp_finish_verified")) { rpc++; return new Response("{}", { status: 200 }); }
        return new Response("[]", { status: 200 });
      }, () => handler({ method: "POST", headers: { authorization: "Bearer t" }, body: { game_id: 5, status: "white_won" } }, res));
      return { breached: rpc > 0 || res.code === 200, evidence: `응답 ${res.code}, 확정 RPC 호출 ${rpc}회` };
    } },
  { id: "A4", kind: "hold", title: "/api/pvp-finish: 참가자가 아닌 계정의 신고",
    async run() {
      const { default: handler } = await load("pvp-finish.js"); const res = mkRes();
      await withFetch(async (url) => {
        const u = String(url);
        if (u.includes("/auth/v1/user")) return new Response(JSON.stringify({ id: "stranger" }), { status: 200 });
        if (u.includes("/rest/v1/pvp_games")) return new Response(JSON.stringify([{ id: 5, white_uid: "u1", black_uid: "u2", sans: ["f3", "e5", "g4", "Qh4#"], status: "active", game_type: "chess" }]), { status: 200 });
        return new Response("{}", { status: 200 });
      }, () => handler({ method: "POST", headers: { authorization: "Bearer t" }, body: { game_id: 5, status: "black_won" } }, res));
      return { breached: res.code !== 403, evidence: "응답 코드 " + res.code };
    } },
];
