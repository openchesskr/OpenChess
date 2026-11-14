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
  // 클라이언트(genPuzzleTree)와 동일: setupSans가 비어 있을 때만 fen을 시작 위치로 쓰고, 그 뒤에 setupSans·mistakeSan을 순서대로 둔다.
  if (d.fen != null && typeof d.fen !== "string") return null;
  if (d.mistakeSan != null && typeof d.mistakeSan !== "string") return null;
  if (d.setupSans != null && (!Array.isArray(d.setupSans) || d.setupSans.length > 120)) return null;
  for (const san of d.setupSans || []) if (typeof san !== "string" || !san || san.length > 12) return null;
  if (d.mistakeSan === "") return null;
  // fen은 setupSans가 있어 쓰이지 않더라도 저장되므로 항상 길이·합법성을 검증한다(다른 소비자가 읽어도 안전하게).
  if (d.fen) { if (d.fen.length > 100) return null; try { new Chess().load(d.fen); } catch { return null; } }
  const setup = [...(d.setupSans || []), d.mistakeSan].filter(Boolean);
  const c = new Chess();
  if (!(d.setupSans && d.setupSans.length) && d.fen) c.load(d.fen);
  for (const san of setup) { if (typeof san !== "string" || san.length > 12) return null; try { c.move(san); } catch { return null; } }
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
// (v0.7.7) 게임 끝내기(checkmate) 퍼즐 — 정답 트리의 모든 끝이 실제 체크메이트인지 다시 두어 확인하고, 주 라인(맨 앞 가지)이 끝나는 체크메이트 장면의
//  키(mateKey = FEN 기물 배치 + 차례)와 길이(mateLen = 반수)를 서버가 직접 계산해 덮어쓴다(브라우저 값은 믿지 않는다). 같은 키의 기존 퍼즐과 중복 판정은 handler에서.
//  규칙은 src/lib/matePuzzle.js와 같다(MATE_* 상수·판정 — scripts/check-mate-puzzle.mjs가 두 곳이 같은지 검사).
export const MATE_PUZZLE_MIN_PLIES = 3, MATE_PUZZLE_MAX_PLIES = 15, MATE_KEY_MAX_PUZZLES = 2;
export function mateInfo(root, tree) {
  if (!tree || typeof tree !== "object") return null;
  let ok = true, main = null;
  const walk = (node, fen, path) => {
    const kids = (node.children || []).filter((k) => k && k.pass !== false);
    if (!kids.length) {
      if (!path.length) { ok = false; return; }
      const c = new Chess(fen);
      if (!c.isCheckmate()) ok = false;
      else if (!main) main = { fen, len: path.length };
      return;
    }
    for (const k of kids) { const c = new Chess(fen); try { c.move(k.san); } catch { ok = false; return; } walk(k, c.fen(), [...path, k.san]); if (!ok) return; }
  };
  walk(tree, root.fen(), []);
  if (!ok || !main) return null;
  const p = main.fen.split(" ");
  return { mateKey: p[0] + " " + p[1], mateLen: main.len };
}
export function mateDuplicateVerdict(existing, newLen) {
  const list = (existing || []).filter((x) => x && Number.isFinite(x.mateLen));
  if (!list.length) return { ok: true };
  const longest = list.reduce((a, b) => (b.mateLen > a.mateLen ? b : a));
  if (longest.mateLen >= newLen) return { ok: false, reason: "longer_exists", existing: longest };
  if (list.length >= MATE_KEY_MAX_PUZZLES) return { ok: false, reason: "cap", existing: longest };
  return { ok: true };
}
export function validatePuzzle(no, d) {
  if (!d || typeof d !== "object" || Array.isArray(d)) return "invalid";
  if (typeof d.id !== "string" || d.id.length > 400 || puzzleNoOf(d.id) !== no) return "number does not match id";
  if (d.name != null && (typeof d.name !== "string" || d.name.length > 120)) return "invalid name";
  if (JSON.stringify(d).length > 300000) return "too large";
  const root = rootPosition(d);
  if (!root) return "illegal start";
  // 합법성 검사 사슬(tree → lines → solution)은 그대로 한 덩어리로 두고, 게임 끝내기 검사는 그 뒤에 따로 돈다.
  // (v0.7.7 보안 수정) 처음엔 게임 끝내기 블록을 이 사슬 한가운데 끼워 넣어 else-if가 이어져 버려, mateKey 필드나 checkmate 테마를 붙이면 lines·solution 합법성 검사를 건너뛸 수 있었다.
  if (d.tree != null) { if (typeof d.tree !== "object" || !treeLegal(root, d.tree)) return "illegal tree"; }
  else if (d.lines != null) { if (!linesLegal(root, d.lines)) return "illegal lines"; }
  else if (d.solution != null) { if (!linesLegal(root, [{ solution: d.solution }])) return "illegal solution"; }
  if (Array.isArray(d.themes) && d.themes.includes("checkmate")) {
    const mi = d.tree ? mateInfo(root, d.tree) : null;
    if (!mi) return "checkmate puzzle must end in checkmate";
    if (mi.mateLen < MATE_PUZZLE_MIN_PLIES) return "checkmate puzzle too short";
    if (mi.mateLen > MATE_PUZZLE_MAX_PLIES) return "checkmate puzzle too long";   // (보안) 일부러 늘인 수순으로 같은 장면을 선점하지 못하게 상한
    d.mateKey = mi.mateKey; d.mateLen = mi.mateLen;   // 서버 계산값으로 덮어쓴다
  } else { delete d.mateKey; delete d.mateLen; }
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
  // (v0.7.7) 게임 끝내기 중복 방지 — 같은 체크메이트 장면의 기존 퍼즐이 같거나 더 길면, 또는 이미 상한(2개)이면 거부(409 duplicate_mate)
  if (data.mateKey) {
    // (v0.7.7 보안) 게임 끝내기 퍼즐은 로그인한 사용자만 올린다 — 게스트가 같은 장면을 대량으로 선점해 남의 생성을 막지 못하게.
    if (!user) { res.status(401).json({ error: "login_required" }); return; }
    try {
      // (보안) 같은 장면의 모든 퍼즐(공개·비공개 모두)을 센다 — 비공개로 올렸다 공개로 바꾸는 우회를 막는다. 비공개 퍼즐의 id는 응답에 담지 않는다.
      const q = await fetch(env.url + "/rest/v1/puzzles?select=data->>id,data->>mateLen&data->>mateKey=eq." + encodeURIComponent(data.mateKey) + "&limit=20", { headers: { apikey: env.service, Authorization: "Bearer " + env.service } });
      const rows = q.ok ? await q.json() : [];
      const others = (Array.isArray(rows) ? rows : []).filter((r) => r && r.id !== data.id).map((r) => ({ id: r.id, mateLen: Number(r.mateLen) }));
      const v = mateDuplicateVerdict(others, data.mateLen);
      if (!v.ok) { res.status(409).json({ error: "duplicate_mate", reason: v.reason }); return; }   // 기존 퍼즐 id는 돌려주지 않는다
    } catch { res.status(502).json({ error: "unavailable" }); return; }
  }
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
