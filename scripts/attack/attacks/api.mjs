import { puzzleNo as fnvNo } from "../ids.mjs";
// 서버리스 API(/api/*) 모의 공격 — fetch를 가짜로 바꿔 외부(Lichess·Gemini·Supabase)로 실제 요청이 나가지 않는다.
import { pathToFileURL } from "node:url";
import { resolve } from "node:path";

const load = (f) => import(pathToFileURL(resolve("api", f)).href + "?t=" + Math.random());
const mkRes = () => { const r = { code: 200, headers: {}, body: null, status(c) { r.code = c; return r; }, setHeader(k, v) { r.headers[k.toLowerCase()] = v; }, json(b) { r.body = b; return r; }, send(b) { r.body = b; return r; } }; return r; };
async function withFetch(impl, fn) { const real = globalThis.fetch; globalThis.fetch = impl; try { return await fn(); } finally { globalThis.fetch = real; } }

const base = [
  { id: "BUG-116a", kind: "attack", title: "/api/lichess 남용: 익명이 같은 IP에서 150회 호출 · 허용 목록 밖 파라미터 · 개발자 전용 퍼즐 경로 · 토큰 노출",
    async run() {
      Object.assign(process.env, { LICHESS_TOKEN: "SECRET_SERVER_TOKEN", VITE_SUPABASE_URL: "https://sb.test", VITE_SUPABASE_ANON_KEY: "anon", SUPABASE_SERVICE_ROLE_KEY: "svc" });
      const { default: handler } = await load("lichess.js");
      const counts = new Map(); const upstream = [];
      const impl = async (url, opt) => {
        const u = String(url), body = opt && opt.body ? JSON.parse(opt.body) : {};
        if (u.includes("/rpc/rate_limit_hit")) { const n = (counts.get(body.p_key) || 0) + (body.p_cost === undefined ? 1 : body.p_cost); counts.set(body.p_key, n); return new Response(JSON.stringify(n > body.p_limit), { status: 200 }); }
        if (u.includes("/auth/v1/user")) return new Response(JSON.stringify({ id: "plain-user" }), { status: 200 });
        if (u.includes("/rpc/is_content_editor")) return new Response("false", { status: 200 });
        upstream.push({ url: u, auth: opt && opt.headers && opt.headers.Authorization });
        return new Response("{}", { status: 200 });
      };
      let passed = 0, blocked = 0; const evil = mkRes(), puz = mkRes(), puzUser = mkRes();
      await withFetch(impl, async () => {
        for (let i = 0; i < 150; i++) { const r = mkRes(); await handler({ query: { master: "1", fen: "x" + i }, headers: { "x-vercel-forwarded-for": "1.2.3.4" } }, r); r.code === 429 ? blocked++ : passed++; }
        await handler({ query: { master: "1", fen: "ok", evil: "1", token: "steal", "x[]": "y" }, headers: { "x-vercel-forwarded-for": "5.6.7.8" } }, evil);
        await handler({ query: { puzzle: "next", angle: "mateIn2" }, headers: { "x-vercel-forwarded-for": "5.6.7.9" } }, puz);
        await handler({ query: { puzzle: "next" }, headers: { "x-vercel-forwarded-for": "5.6.7.10", authorization: "Bearer t" } }, puzUser);
      });
      const lastExplorer = upstream.filter((x) => x.url.includes("explorer")).pop();
      const leaksParam = !lastExplorer || /evil|steal/.test(lastExplorer.url);
      const bodyLeak = JSON.stringify([evil.body, puz.body]).includes("SECRET");
      const puzzleCalls = upstream.filter((x) => x.url.includes("/api/puzzle")).length;
      const bad = passed > 90 || leaksParam || puz.code !== 401 || puzUser.code !== 403 || puzzleCalls > 0 || bodyLeak;
      return { breached: bad, evidence: `150회 중 통과 ${passed}·차단 ${blocked}(상한 90/분) · 밖 파라미터 ${leaksParam ? "전달됨" : "버려짐"} · 퍼즐 경로: 비로그인 ${puz.code}, 일반 로그인 ${puzUser.code}, 외부 호출 ${puzzleCalls}회` };
    } },
  { id: "BUG-116b", kind: "attack", title: "/api/scan-board 남용: 익명이 같은 IP에서 40회 · 초대형 이미지 · 로그인 사용자는 정상 한도",
    async run() {
      Object.assign(process.env, { GEMINI_API_KEY: "gk", VITE_SUPABASE_URL: "https://sb.test", VITE_SUPABASE_ANON_KEY: "anon", SUPABASE_SERVICE_ROLE_KEY: "svc" });
      const { default: handler } = await load("scan-board.js");
      const counts = new Map(); let gemini = 0, keyInUrl = false;
      const impl = async (url, opt) => {
        const u = String(url), body = opt && opt.body && !u.includes("generativelanguage") ? JSON.parse(opt.body) : {};
        if (u.includes("/rpc/rate_limit_hit")) { const n = (counts.get(body.p_key) || 0) + (body.p_cost === undefined ? 1 : body.p_cost); counts.set(body.p_key, n); return new Response(JSON.stringify(n > body.p_limit), { status: 200 }); }
        if (u.includes("/auth/v1/user")) return new Response(JSON.stringify({ id: "plain-user" }), { status: 200 });
        gemini++; if (u.includes("key=")) keyInUrl = true;
        return new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: JSON.stringify({ kind: "none", confidence: "low" }) }] }, finishReason: "STOP" }] }), { status: 200 });
      };
      let anonPassed = 0, userBlocked = 0; const big = mkRes();
      await withFetch(impl, async () => {
        for (let i = 0; i < 40; i++) { const r = mkRes(); await handler({ method: "POST", headers: { "x-vercel-forwarded-for": "7.7.7.7", "x-forwarded-for": "10.0.0." + i }, body: { image: "AAAA", mediaType: "image/png" } }, r); if (r.code !== 429) anonPassed++; }
        for (let i = 0; i < 20; i++) { const r = mkRes(); await handler({ method: "POST", headers: { "x-vercel-forwarded-for": "7.7.7.7", authorization: "Bearer t" }, body: { image: "AAAA", mediaType: "image/png" } }, r); if (r.code === 429) userBlocked++; }
        await handler({ method: "POST", headers: { "x-vercel-forwarded-for": "8.8.8.8" }, body: { image: "A".repeat(6_000_000), mediaType: "image/png" } }, big);
      });
      const bad = anonPassed > 6 || userBlocked > 0 || big.code !== 413 || keyInUrl;
      return { breached: bad, evidence: `익명 40회 중 통과 ${anonPassed}(상한 6/10분, 헤더 위조 무시) · 로그인 20회 중 차단 ${userBlocked} · 초대형 이미지 ${big.code} · API 키가 URL에 ${keyInUrl ? "있음" : "없음"}` };
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
  { id: "YT-1", kind: "attack", title: "/api/youtube 남용: 같은 IP 40회 · 임의 검색어 중계 · 불법 수순 · API 키·위험 썸네일 노출",
    async run() {
      Object.assign(process.env, { YOUTUBE_API_KEY: "SECRET_YT_KEY", VITE_SUPABASE_URL: "https://sb.test", VITE_SUPABASE_ANON_KEY: "anon", SUPABASE_SERVICE_ROLE_KEY: "svc" });
      const { default: handler } = await load("youtube.js");
      const counts = new Map(); const upstream = [];
      const impl = async (url, opt) => {
        const u = String(url), body = opt && opt.body ? JSON.parse(opt.body) : {};
        if (u.includes("/rpc/rate_limit_hit")) { const n = (counts.get(body.p_key) || 0) + (body.p_cost === undefined ? 1 : body.p_cost); counts.set(body.p_key, n); return new Response(JSON.stringify(n > body.p_limit), { status: 200 }); }
        upstream.push(u);
        return new Response(JSON.stringify({ items: [
          { id: { videoId: "dQw4w9WgXcQ" }, snippet: { title: "A &amp; B", channelTitle: "c", publishedAt: "2024-01-02T00:00:00Z", thumbnails: { medium: { url: "javascript:alert(1)" } } } },
          { id: { videoId: "<script>" }, snippet: { title: "x" } },
        ] }), { status: 200 });
      };
      let passed = 0, blocked = 0; const free = mkRes(), illegal = mkRes(), ok = mkRes();
      await withFetch(impl, async () => {
        for (let i = 0; i < 40; i++) { const r = mkRes(); await handler({ method: "GET", query: { moves: "e4" }, headers: { "x-vercel-forwarded-for": "9.9.9.9", "x-forwarded-for": "10.0.0." + i } }, r); r.code === 429 ? blocked++ : passed++; }
        await handler({ method: "GET", query: { moves: "buy cheap watches", q: "spam" }, headers: { "x-vercel-forwarded-for": "9.9.9.1" } }, free);
        await handler({ method: "GET", query: { moves: "e4,e4" }, headers: { "x-vercel-forwarded-for": "9.9.9.2" } }, illegal);
        await handler({ method: "GET", query: { moves: "e4,e5,Nf3" }, headers: { "x-vercel-forwarded-for": "9.9.9.3" } }, ok);
      });
      const leak = JSON.stringify([free.body, illegal.body, ok.body]).includes("SECRET");
      const relayed = upstream.some((u) => /spam|watches/.test(u));
      const vids = (ok.body && ok.body.videos) || [];
      const unsafe = vids.some((v) => !v.thumb.startsWith("https://i.ytimg.com/") || !/^[A-Za-z0-9_-]{11}$/.test(v.id));
      const queryOk = upstream.some((u) => decodeURIComponent(u.replace(/\+/g, " ")).includes("q=1. e4 e5 2. Nf3"));
      const bad = passed > 20 || free.code !== 400 || illegal.code !== 400 || relayed || leak || unsafe || vids.length !== 1 || !queryOk;
      return { breached: bad, evidence: `40회 중 통과 ${passed}·차단 ${blocked}(상한 20/분, 헤더 위조 무시) · 임의 검색어 ${free.code} · 불법 수순 ${illegal.code} · 중계 ${relayed ? "됨" : "안 됨"} · 키 노출 ${leak ? "있음" : "없음"} · 영상 ${vids.length}개(위험 값 ${unsafe ? "있음" : "걸러짐"}) · 검색어 ${queryOk ? "PGN 수순" : "이상"}` };
    } },
];
// ---- BUG-107 수정 검증: /api/auth-login · /api/auth-recover ----
const m_recover = { n: 0 };
function authMock() {
  const counts = new Map(); const calls = [];
  const impl = async (url, opt) => {
    const u = String(url), body = opt && opt.body ? JSON.parse(opt.body) : {};
    calls.push(u);
    if (u.includes("/rpc/rate_limit_hit")) { const cost = body.p_cost === undefined ? 1 : body.p_cost; const n = cost === 0 ? (counts.get(body.p_key) || 0) : Math.max(0, (counts.get(body.p_key) || 0) + cost); if (cost !== 0) counts.set(body.p_key, n); return new Response(JSON.stringify(n > body.p_limit), { status: 200 }); }
    if (u.includes("/rpc/email_for_username")) return new Response(JSON.stringify(body.p_username === "victim" ? "victim@example.com" : null), { status: 200 });
    if (u.includes("/rpc/account_providers")) return new Response(JSON.stringify(["email"]), { status: 200 });
    if (u.includes("/auth/v1/token")) return body.email === "victim@example.com" && body.password === "right-password"
      ? new Response(JSON.stringify({ access_token: "AT", refresh_token: "RT", user: { id: "u-victim" } }), { status: 200 })
      : new Response(JSON.stringify({ error_code: "invalid_credentials" }), { status: 400 });
    if (u.includes("/auth/v1/recover")) { m_recover.n++; return new Response("{}", { status: 200 }); }
    return new Response("{}", { status: 404 });
  };
  return { impl, calls };
}
const authEnv = () => Object.assign(process.env, { VITE_SUPABASE_URL: "https://sb.test", VITE_SUPABASE_ANON_KEY: "anon", SUPABASE_SERVICE_ROLE_KEY: "svc" });
const loginReq = (login, password, ip = "1.1.1.1") => ({ method: "POST", headers: { "x-vercel-forwarded-for": ip }, body: { login, password } });

export const authAttacks = [
  { id: "BUG-107c", kind: "attack", title: "/api/auth-login: 실패 응답에서 이메일 주소가 새는가 · 없는 아이디와 틀린 비밀번호가 구분되는가",
    async run() {
      authEnv(); const { default: handler } = await load("auth-login.js"); const m = authMock();
      const known = mkRes(), unknown = mkRes();
      await withFetch(m.impl, async () => {
        await handler(loginReq("victim", "wrong", "2.2.2.2"), known);
        await handler(loginReq("no-such-user", "wrong", "2.2.2.3"), unknown);
      });
      const leak = JSON.stringify(known.body).includes("@") || JSON.stringify(unknown.body).includes("@");
      const same = known.code === unknown.code && JSON.stringify(known.body) === JSON.stringify(unknown.body);
      return { breached: leak || !same, evidence: `이메일 노출 ${leak ? "있음" : "없음"} · 존재하는 아이디 ${known.code} ${JSON.stringify(known.body)} / 없는 아이디 ${unknown.code} ${JSON.stringify(unknown.body)}` };
    } },
  { id: "BUG-107d", kind: "hold", title: "/api/auth-login: 아이디로 정상 로그인되고 세션만 돌려주는지",
    async run() {
      authEnv(); const { default: handler } = await load("auth-login.js"); const m = authMock(); const res = mkRes();
      await withFetch(m.impl, () => handler(loginReq("victim", "right-password", "3.3.3.3"), res));
      return { breached: !(res.code === 200 && res.body && res.body.access_token === "AT"), evidence: `응답 ${res.code}` };
    } },
  { id: "BUG-107e", kind: "attack", title: "/api/auth-login: 같은 IP에서 무차별 대입(25회) · 한 계정 집중 공격(IP를 바꿔가며 실패 40회)",
    async run() {
      authEnv(); const { default: handler } = await load("auth-login.js"); const m = authMock();
      let ipBlocked = 0, idBlocked = 0, passed = 0;
      await withFetch(m.impl, async () => {
        for (let i = 0; i < 25; i++) { const r = mkRes(); await handler(loginReq("user" + i, "guess" + i, "9.9.9.9"), r); if (r.code === 429) ipBlocked++; }
        for (let i = 0; i < 40; i++) { const r = mkRes(); await handler(loginReq("victim", "guess" + i, "8.8.8." + i), r); if (r.code === 429) idBlocked++; else if (r.code === 200) passed++; }
      });
      return { breached: ipBlocked < 5 || idBlocked < 5 || passed > 0, evidence: `IP 한도 초과로 차단 ${ipBlocked}/25 · 분산 공격(실패 30회 초과)으로 차단 ${idBlocked}/40` };
    } },
  { id: "BUG-107g", kind: "attack", title: "계정 잠금 공격: 공격자가 victim에게 틀린 시도를 쏟아부어도 주인이 다른 IP에서 정상 로그인되는지",
    async run() {
      authEnv(); const { default: handler } = await load("auth-login.js"); const m = authMock();
      const res = mkRes();
      await withFetch(m.impl, async () => {
        for (let i = 0; i < 30; i++) await handler(loginReq("victim", "guess" + i, "6.6.6.6"), mkRes());   // 공격자 한 IP에서 연타
        await handler(loginReq("victim", "right-password", "7.7.7.7"), res);                           // 주인은 다른 곳에서 로그인
      });
      return { breached: res.code !== 200, evidence: `공격 중 주인의 정상 로그인 응답 ${res.code}` };
    } },
  { id: "BUG-107f", kind: "attack", title: "/api/auth-recover: 존재하는 아이디와 없는 아이디의 응답 차이 · 이메일 노출",
    async run() {
      authEnv(); const { default: handler } = await load("auth-recover.js"); const m = authMock();
      const a = mkRes(), b = mkRes();
      await withFetch(m.impl, async () => {
        await handler({ method: "POST", headers: { "x-vercel-forwarded-for": "4.4.4.4" }, body: { login: "victim" } }, a);
        await handler({ method: "POST", headers: { "x-vercel-forwarded-for": "4.4.4.5" }, body: { login: "ghost" } }, b);
      });
      const same = a.code === b.code && JSON.stringify(a.body) === JSON.stringify(b.body);
      return { breached: !same || JSON.stringify(a.body).includes("@"), evidence: `known ${a.code} ${JSON.stringify(a.body)} / unknown ${b.code} ${JSON.stringify(b.body)}` };
    } },
  { id: "BUG-107h", kind: "attack", title: "동시 요청 경합: 서로 다른 IP 80개가 한꺼번에 victim에게 틀린 시도 — 한도(30회)를 넘겨 비밀번호 검증까지 가는가",
    async run() {
      authEnv(); const { default: handler } = await load("auth-login.js"); const m = authMock();
      let tokenCalls = 0; const inner = m.impl;
      await withFetch(async (u, o) => { if (String(u).includes("/auth/v1/token")) tokenCalls++; return inner(u, o); },
        () => Promise.all(Array.from({ length: 80 }, (_, i) => handler(loginReq("victim", "guess" + i, "5.5." + Math.floor(i / 10) + "." + i), mkRes()))));
      return { breached: tokenCalls > 30, evidence: `동시 80건 중 비밀번호 검증까지 간 요청 ${tokenCalls}건 (한도 30)` };
    } },
  { id: "BUG-107i", kind: "attack", title: "/api/auth-recover 메일 폭탄: 서로 다른 IP 12곳이 같은 계정에 재설정 요청 — 쿨다운 안에 메일이 몇 통 나가는가",
    async run() {
      authEnv(); const { default: handler } = await load("auth-recover.js"); const m = authMock(); m_recover.n = 0;
      const codes = new Set();
      await withFetch(m.impl, async () => { for (let i = 0; i < 12; i++) { const r = mkRes(); await handler({ method: "POST", headers: { "x-vercel-forwarded-for": "12.0.0." + i }, body: { login: "victim" } }, r); codes.add(r.code + JSON.stringify(r.body)); } });
      return { breached: m_recover.n > 1 || codes.size > 1, evidence: `요청 12건(IP 12곳) → 실제 메일 ${m_recover.n}통(10분 쿨다운당 1통), 응답은 항상 같음: ${[...codes].join(" / ")}` };
    } },
  { id: "BUG-107j", kind: "attack", title: "재설정 연타: 한 IP의 연타가 대상 쿨다운을 창당 1통 이상 소모하지 않는지(주인의 대기는 최대 10분으로 한정)",
    async run() {
      authEnv(); const { default: handler } = await load("auth-recover.js"); const m = authMock(); m_recover.n = 0;
      await withFetch(m.impl, async () => {
        for (let i = 0; i < 20; i++) await handler({ method: "POST", headers: { "x-vercel-forwarded-for": "13.0.0.1" }, body: { login: "victim" } }, mkRes());   // 공격자 한 IP 연타
        await handler({ method: "POST", headers: { "x-vercel-forwarded-for": "13.9.9.9" }, body: { login: "victim" } }, mkRes());                         // 주인
      });
      // 공격자의 첫 요청이 그 창의 1통을 가져가므로 주인은 다음 창(최대 10분 뒤)에 받는다 — 시간당 총량 한도와 달리 대기가 10분으로 한정된다. 연타가 추가로 소모하지 않으면 메일은 정확히 1통.
      return { breached: m_recover.n !== 1, evidence: `공격자 20건 + 주인 1건 → 메일 ${m_recover.n}통 (창당 1통. 주인은 최대 10분 뒤 다음 창에서 받음)` };
    } },
  { id: "BUG-115b", kind: "attack", title: "/api/review-put: 비로그인 · 불법 기보(체크메이트 뒤 수 두기·없는 수) · 정상 기보는 저장",
    async run() {
      authEnv(); const { default: handler } = await load("review-put.js"); const stored = [];
      const impl = async (url, opt) => {
        const u = String(url), body = opt && opt.body ? JSON.parse(opt.body) : {};
        if (u.includes("/rpc/rate_limit_hit")) return new Response("false", { status: 200 });
        if (u.includes("/auth/v1/user")) return new Response(JSON.stringify({ id: "u1" }), { status: 200 });
        if (u.includes("/rpc/reviewed_")) { stored.push(body); return new Response("true", { status: 200 }); }
        return new Response("{}", { status: 404 });
      };
      const post = (data, token = "t", kind = "game") => ({ method: "POST", headers: { authorization: token ? "Bearer " + token : "", "x-vercel-forwarded-for": "1.1.1.1" }, body: { kind, cc_id: 123456789, data } });
      const r = { anon: mkRes(), illegal: mkRes(), afterMate: mkRes(), good: mkRes(), huge: mkRes(), badVer: mkRes(), badDepth: mkRes(), badMove: mkRes(), okAnalysis: mkRes(), idMismatch: mkRes() };
      const an = (over = {}) => ({ v: 1, d: 20, result: { moves: [{ ply: 0, san: "e4", white: true, kind: "book", acc: 100, lossWinPct: 0, sharp: 0, best: null, beforeCp: 20 }] }, ...over });
      await withFetch(impl, async () => {
        await handler(post({ moves: ["e4", "e5"] }, ""), r.anon);
        await handler(post({ moves: ["e4", "Ke3"] }), r.illegal);
        await handler(post({ moves: ["f3", "e5", "g4", "Qh4#", "a3"] }), r.afterMate);
        await handler(post({ moves: ["e4", "e5", "Nf3", "Nc6"] }), r.good);
        await handler(post({ moves: ["e4"], pad: "x".repeat(250000) }), r.huge);
        await handler(post({ moves: ["e4", "e5"], id: 999, evil: "<script>", white: { username: "a", rating: 1500, extra: "x" } }), r.idMismatch);   // 내용 속 id가 대국 번호와 다름
        await handler(post(an({ v: 99 }), "t", "analysis"), r.badVer);
        await handler(post(an({ d: 9999 }), "t", "analysis"), r.badDepth);
        await handler(post(an({ result: { moves: [{ ply: 0, san: "e4", white: true, kind: "<img>", acc: "NaN" }] } }), "t", "analysis"), r.badMove);
        await handler(post(an(), "t", "analysis"), r.okAnalysis);
      });
      const g = stored.find((x) => x.p_data);
      const extraKept = g && (g.p_data.evil !== undefined || (g.p_data.white && g.p_data.white.extra !== undefined));
      const bad = r.anon.code !== 401 || r.illegal.code !== 400 || r.afterMate.code !== 400 || r.good.code !== 200 || r.huge.code !== 413 || r.idMismatch.code !== 400
        || r.badVer.code !== 400 || r.badDepth.code !== 400 || r.badMove.code !== 400 || r.okAnalysis.code !== 200 || stored.length !== 2 || extraKept;
      return { breached: bad, evidence: `비로그인 ${r.anon.code} · 없는 수 ${r.illegal.code} · 메이트 뒤 수 ${r.afterMate.code} · 정상 기보 ${r.good.code} · 대용량 ${r.huge.code} · 번호-id 불일치 ${r.idMismatch.code} · 분석: 잘못된 버전 ${r.badVer.code}·깊이 ${r.badDepth.code}·수 형식 ${r.badMove.code}·정상 ${r.okAnalysis.code} (저장 ${stored.length}건, 허용 밖 필드 ${extraKept ? "남음" : "제거됨"})` };
    } },
  { id: "BUG-117b", kind: "attack", title: "/api/auth-providers: 같은 IP에서 이메일 가입 여부 대량 조회 열거",
    async run() {
      authEnv(); const { default: handler } = await load("auth-providers.js"); const m = authMock();
      let ok = 0, blocked = 0;
      await withFetch(m.impl, async () => { for (let i = 0; i < 30; i++) { const r = mkRes(); await handler({ method: "POST", headers: { "x-vercel-forwarded-for": "9.1.1.1" }, body: { email: "user" + i + "@example.com" } }, r); r.code === 429 ? blocked++ : ok++; } });
      return { breached: ok > 10, evidence: `30건 중 응답 ${ok}건(상한 10/10분) · 차단 ${blocked}건` };
    } },
  { id: "BUG-117c", kind: "attack", title: "로그인 실패 응답의 소셜 가입 힌트로 가입 방식 대량 조회: 같은 이메일 · 같은 IP의 서로 다른 이메일",
    async run() {
      authEnv(); const { default: handler } = await load("auth-login.js"); const m = authMock();
      const impl = async (u, o) => (String(u).includes("/rpc/account_providers") ? new Response(JSON.stringify(["google"]), { status: 200 }) : m.impl(u, o));
      let sameEmailHints = 0, sameIpHints = 0;
      await withFetch(impl, async () => {
        for (let i = 0; i < 12; i++) { const r = mkRes(); await handler(loginReq("someone@example.com", "x" + i, "20.0.0." + i), r); if (r.body && r.body.providers) sameEmailHints++; }
        for (let i = 0; i < 25; i++) { const r = mkRes(); await handler(loginReq("user" + i + "@example.com", "x", "21.0.0.1"), r); if (r.body && r.body.providers) sameIpHints++; }
      });
      return { breached: sameEmailHints > 5 || sameIpHints > 10, evidence: `같은 이메일 12회 중 힌트 ${sameEmailHints}(상한 5/10분) · 같은 IP 이메일 25개 중 힌트 ${sameIpHints}(상한 10/10분)` };
    } },
  { id: "BUG-124", kind: "attack", title: "/api/bot-game: 이기지 않은 대국을 승리로 기록 · 불법 수순 · 로그인 없이 · 정상 대국(체크메이트 승·패, 기권 패배)은 저장",
    async run() {
      authEnv(); const { default: handler } = await load("bot-game.js"); const saved = [];
      const impl = async (url, opt) => {
        const u = String(url), body = opt && opt.body ? JSON.parse(opt.body) : {};
        if (u.includes("/rpc/rate_limit_hit")) return new Response("false", { status: 200 });
        if (u.includes("/auth/v1/user")) return new Response(JSON.stringify({ id: "u1" }), { status: 200 });
        if (u.includes("/rpc/bot_game_record_verified")) { saved.push(body); return new Response("1", { status: 200 }); }
        return new Response("{}", { status: 404 });
      };
      const post = (b, token = "t") => ({ method: "POST", headers: { authorization: token ? "Bearer " + token : "", "x-vercel-forwarded-for": "1.1.1.1" }, body: b });
      const fool = ["f3", "e5", "g4", "Qh4#"];            // 백이 체크메이트당함(흑 승)
      const open = ["e4", "e5", "Nf3", "Nc6"];             // 진행 중
      const R = {};
      await withFetch(impl, async () => {
        const run = async (k, b, t) => { const r = mkRes(); await handler(post(b, t), r); R[k] = r.code; };
        await run("anon", { sans: fool, color: "w", result: "loss", bot_elo: 1500, time_control: "600-0" }, "");
        await run("fakeWin", { sans: open, color: "w", result: "win", bot_elo: 3000, time_control: "600-0" });                  // 끝나지 않았는데 승리
        await run("fakeWinMate", { sans: fool, color: "w", result: "win", bot_elo: 3000, time_control: "600-0" });              // 체크메이트당했는데 승리
        await run("wrongColor", { sans: fool, color: "b", result: "loss", bot_elo: 1500, time_control: "600-0" });             // 흑이 이겼는데 흑의 패배
        await run("illegal", { sans: ["e4", "e5", "Ke3"], color: "w", result: "loss", bot_elo: 1500, time_control: "600-0" });
        await run("eloHuge", { sans: fool, color: "w", result: "loss", bot_elo: 99999, time_control: "600-0" });
        await run("mateLoss", { sans: fool, color: "w", result: "loss", bot_elo: 1500, time_control: "600-0" });              // 정상
        await run("mateWinBlack", { sans: fool, color: "b", result: "win", bot_elo: 1500, time_control: "600-0" });           // 정상(흑이 이김)
        await run("resign", { sans: open, color: "w", result: "loss", bot_elo: 1500, time_control: "600-0" });                // 정상(기권)
      });
      const bad = R.anon !== 401 || R.fakeWin !== 400 || R.fakeWinMate !== 400 || R.wrongColor !== 400 || R.illegal !== 400 || R.eloHuge !== 400 || R.mateLoss !== 200 || R.mateWinBlack !== 200 || R.resign !== 200 || saved.length !== 3;
      return { breached: bad, evidence: `비로그인 ${R.anon} · 미종료 승리 위조 ${R.fakeWin} · 메이트당하고 승리 ${R.fakeWinMate} · 색 뒤바꿈 ${R.wrongColor} · 불법 수 ${R.illegal} · 봇 레이팅 99999 ${R.eloHuge} · 정상(체크메이트 패 ${R.mateLoss}, 흑 승 ${R.mateWinBlack}, 기권 ${R.resign}) 저장 ${saved.length}건` };
    } },
  { id: "BUG-121d", kind: "attack", title: "/api/puzzle-share: 불법 수순·번호-id 불일치·시작 위치 위조·초대형 트리 거부 · 합법 퍼즐(표준/FEN)은 저장 · 게스트 호출 제한 · 번호 충돌은 409",
    async run() {
      authEnv(); const { default: handler } = await load("puzzle-share.js"); const saved = []; const counts = new Map(); let collide = false;
      const impl = async (url, opt) => {
        const u = String(url), body = opt && opt.body ? JSON.parse(opt.body) : {};
        if (u.includes("/rpc/rate_limit_hit")) { const n = (counts.get(body.p_key) || 0) + 1; counts.set(body.p_key, n); return new Response(JSON.stringify(n > body.p_limit), { status: 200 }); }
        if (u.includes("/auth/v1/user")) return new Response(JSON.stringify({ id: "u1" }), { status: 200 });
        if (u.includes("/rpc/puzzle_share_put_verified")) { if (collide) return new Response("collision", { status: 400 }); saved.push(body); return new Response("null", { status: 200 }); }
        return new Response("{}", { status: 404 });
      };
      // 표준 시작 위치: 1.e4 e5 2.Nf3 (설정) → 흑의 실수 2...Nc6 아님; 여기선 mistakeSan = "Nc6", 정답 트리는 3.Bb5 / 3.d4
      const mk = (id, over = {}) => ({ id, name: "테스트 퍼즐", setupSans: ["e4", "e5", "Nf3"], mistakeSan: "Nc6", themes: ["punish"],
        tree: { children: [{ san: "Bb5", children: [{ san: "a6", children: [{ san: "Ba4" }] }] }, { san: "d4", children: [{ san: "exd4", children: [{ san: "Nxd4" }] }] }] }, ...over });
      const id1 = "testpuzzle-1", no1 = fnvNo(id1);
      const post = (no, data, token = "", ip = "3.3.3.3") => ({ method: "POST", headers: { authorization: token ? "Bearer " + token : "", "x-vercel-forwarded-for": ip }, body: { no, data, public: true } });
      const run = async (req) => { const r = mkRes(); await withFetch(impl, () => handler(req, r)); return r.code; };
      const R = {};
      R.good = await run(post(no1, mk(id1)));
      R.badNo = await run(post(no1 + 1 > 999999 ? 100000 : no1 + 1, mk(id1)));
      R.illegalMove = await run(post(no1, mk(id1, { tree: { children: [{ san: "Bb5", children: [{ san: "Qxh7" }] }] } })));
      R.fakeStart = await run(post(no1, mk(id1, { setupSans: ["e4", "e5", "Ke3"] })));
      R.lines = await run(post(no1, mk(id1, { tree: undefined, lines: [{ tag: "a", solution: ["Bb5", "a6", "Ba4"] }] })));
      R.badLines = await run(post(no1, mk(id1, { tree: undefined, lines: [{ tag: "a", solution: ["Bb5", "Qe2"] }] })));
      const idF = "fen:4k3/8/8/8/8/8/8/4K2R w K - 0 1", noF = fnvNo(idF);
      R.fen = await run(post(noF, { id: idF, name: "FEN", fen: "4k3/8/8/8/8/8/8/4K2R w K - 0 1", setupSans: [], tree: { children: [{ san: "Rh8+", children: [{ san: "Kd7" }] }] } }));
      R.badFen = await run(post(noF, { id: idF, fen: "not a fen", setupSans: [] }));
      R.fenMistake = await run(post(noF, { id: idF, fen: "4k3/8/8/8/8/8/8/4K2R w K - 0 1", mistakeSan: "Rh8+", tree: { children: [{ san: "Kd7" }] } }));
      R.fenJunk = await run(post(noF, { id: idF, fen: "x".repeat(500), setupSans: ["e4"], tree: { children: [] } }));
      R.setupEmpty = await run(post(noF, { id: idF, setupSans: ["e4", "", null], tree: { children: [] } }));
      R.fenNonStr = await run(post(noF, { id: idF, fen: { a: 1 }, tree: { children: [] } }));
      R.mistakeNonStr = await run(post(noF, { id: idF, fen: "4k3/8/8/8/8/8/8/4K2R w K - 0 1", mistakeSan: ["Rh8+"], tree: { children: [] } }));
      const deep = (n) => (n ? { children: [{ san: n % 2 ? "Nf3" : "Ng1", children: deep(n - 1).children }] } : { children: [] });
      R.tooDeep = await run(post(no1, mk(id1, { tree: deep(100) })));
      R.hugeName = await run(post(no1, mk(id1, { name: "x".repeat(500) })));
      collide = true; R.collision = await run(post(no1, mk(id1))); collide = false;
      let blocked = 0; for (let i = 0; i < 40; i++) if (await run(post(no1, mk(id1), "", "9.9.9.9")) === 429) blocked++;
      const bad = R.good !== 200 || R.badNo !== 400 || R.illegalMove !== 400 || R.fakeStart !== 400 || R.lines !== 200 || R.badLines !== 400 || R.fen !== 200 || R.badFen !== 400 || R.fenMistake !== 200 || R.fenNonStr !== 400 || R.fenJunk !== 400 || R.setupEmpty !== 400 || R.mistakeNonStr !== 400 || R.tooDeep !== 400 || R.hugeName !== 400 || R.collision !== 409 || blocked < 5;
      return { breached: bad, evidence: `정상(표준 ${R.good}·옛 lines ${R.lines}·FEN ${R.fen}) 저장 · 번호-id 불일치 ${R.badNo} · 불법 수 ${R.illegalMove} · 불법 시작 ${R.fakeStart} · 불법 lines ${R.badLines} · 가짜 FEN ${R.badFen} · FEN+mistake ${R.fenMistake} · 비문자열 fen ${R.fenNonStr}/mistake ${R.mistakeNonStr} · 너무 깊은 트리 ${R.tooDeep} · 긴 이름 ${R.hugeName} · 번호 충돌 ${R.collision} · 게스트 40회 중 제한 ${blocked}건` };
    } },
];

export default [...base, ...authAttacks];
