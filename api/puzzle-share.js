// Vercel 서버리스 함수: 퍼즐 공유(첫 발견자가 서버에 올리기·테마 합치기·개발자 본문 교체)의 유일한 입구(v0.7.0 보안, BUG-121).
// 예전에는 브라우저가 DB 함수를 직접 불러, 이 번호에 무슨 내용이든 먼저 올릴 수 있었다(first-writer squatting). 이제 서버가 올라오는 퍼즐을 chess.js로 검증한다.
//  · id와 번호가 맞아야 하고(FNV 해시), id·이름 등 문자열 길이·형식 제한
//  · 시작 위치(FEN 퍼즐) 또는 표준 시작 위치에서 setupSans·mistakeSan을 재생해 합법이어야 하고,
//  · 정답 트리(tree)의 모든 노드 수가 부모 위치에서 합법이어야 하며(깊이 60·노드 3000 이하), 옛 형식(lines)이면 각 풀이가 합법이어야 한다.
// 비로그인(게스트)도 올릴 수 있다(크라우드소싱 유지) — IP당 분당 30회, 로그인 사용자는 분당 60회. 저장은 service_role 전용 RPC(puzzle_share_put_verified)가 한다.
// 남는 한계: 합법적이지만 엔진으로 검증되지 않은 라인, 일부러 같은 번호로 충돌하는 다른 id는 서버가 판별할 수 없다(같은 번호에 이미 다른 id가 있으면 거부 — BUGS.md BUG-121).
import { Chess } from "chess.js";
import { supabaseEnv, rateLimited, authUser, clientIp } from "./_lib/server.js";

export function puzzleNoOf(id) {
  if (typeof id !== "string" || !id || /[^\x01-\x7f]/.test(id)) return null;
  let h = 2166136261;
  for (let i = 0; i < id.length; i++) { h ^= id.charCodeAt(i); h = Math.imul(h, 16777619); }
  return (h >>> 0) % 900000 + 100000;
}

const MAX_DEPTH = 60, MAX_NODES = 3000;
function rootPosition(d) {
  const c = new Chess();
  if (typeof d.fen === "string" && d.fen) {
    try { c.load(d.fen); } catch { return null; }
    if (Array.isArray(d.setupSans) && d.setupSans.length) return null;   // FEN 퍼즐은 시작 수순이 없다
  } else {
    if (d.setupSans != null && (!Array.isArray(d.setupSans) || d.setupSans.length > 120)) return null;
    for (const san of d.setupSans || []) { if (typeof san !== "string" || san.length > 12) return null; try { c.move(san); } catch { return null; } }
    if (d.mistakeSan != null) { if (typeof d.mistakeSan !== "string" || d.mistakeSan.length > 12) return null; try { c.move(d.mistakeSan); } catch { return null; } }
  }
  return c;
}
function treeLegal(root, tree) {
  let nodes = 0;
  const walk = (node, fen, depth) => {
    if (!node || typeof node !== "object" || depth > MAX_DEPTH) return false;
    const kids = node.children == null ? [] : node.children;
    if (!Array.isArray(kids)) return false;
    for (const k of kids) {
      if (!k || typeof k.san !== "string" || k.san.length > 14 || ++nodes > MAX_NODES) return false;
      const c = new Chess(fen);
      try { c.move(k.san); } catch { return false; }
      if (!walk(k, c.fen(), depth + 1)) return false;
    }
    return true;
  };
  return walk(tree, root.fen(), 0);
}
function linesLegal(root, lines) {
  if (!Array.isArray(lines) || lines.length > 200) return false;
  for (const l of lines) {
    const sol = l && (l.solution || l.sans);
    if (!Array.isArray(sol) || sol.length > MAX_DEPTH) return false;
    const c = new Chess(root.fen());
    for (const san of sol) { if (typeof san !== "string" || san.length > 14) return false; try { c.move(san); } catch { return false; } }
  }
  return true;
}
export function validatePuzzle(no, d) {
  if (!d || typeof d !== "object" || Array.isArray(d)) return "invalid";
  if (typeof d.id !== "string" || d.id.length > 400 || puzzleNoOf(d.id) !== no) return "number does not match id";
  if (d.name != null && (typeof d.name !== "string" || d.name.length > 120)) return "invalid name";
  if (JSON.stringify(d).length > 300000) return "too large";
  const root = rootPosition(d);
  if (!root) return "illegal start";
  if (d.tree != null) { if (typeof d.tree !== "object" || !treeLegal(root, d.tree)) return "illegal tree"; }
  else if (d.lines != null) { if (!linesLegal(root, d.lines)) return "illegal lines"; }
  else if (d.solution != null) { if (!linesLegal(root, [{ solution: d.solution }])) return "illegal solution"; }
  return null;
}

export default async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");
  if (req.method !== "POST") { res.status(405).json({ error: "POST 요청만 지원합니다." }); return; }
  const env = supabaseEnv();
  if (!env) { res.status(500).json({ error: "서버에 아직 설정되지 않았어요." }); return; }
  const user = await authUser(env, req);
  const rules = user ? [["pshare:u:" + user.id, 60, 60]] : [["pshare:ip:" + clientIp(req), 30, 60]];
  if (await rateLimited(env, rules)) { res.status(429).json({ error: "rate_limited" }); return; }
  const { no, data, public: isPublic } = req.body || {};
  if (!Number.isInteger(no) || no < 100000 || no > 999999) { res.status(400).json({ error: "invalid" }); return; }
  const why = validatePuzzle(no, data);
  if (why) { res.status(400).json({ error: why }); return; }
  try {
    const r = await fetch(env.url + "/rest/v1/rpc/puzzle_share_put_verified", {
      method: "POST", headers: { apikey: env.service, Authorization: "Bearer " + env.service, "Content-Type": "application/json" },
      body: JSON.stringify({ p_actor: user ? user.id : null, p_no: no, p_data: data, p_public: isPublic !== false }),
    });
    const text = await r.text();
    if (!r.ok) { res.status(r.status === 400 ? 409 : 502).json({ error: /collision/.test(text) ? "collision" : "rejected" }); return; }
    res.status(200).json({ ok: true });
  } catch { res.status(502).json({ error: "unavailable" }); }
}
