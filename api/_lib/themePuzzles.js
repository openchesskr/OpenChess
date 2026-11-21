// (v0.7.8, 사용자 요청) 학습 탭 "추가 학습" — 최근에 본 레슨의 테마에 맞는 Lichess 테마 퍼즐.
//  api/lichess.js(?puzzles=1&angles=fork,pin)가 부르는 처리기(서버리스 함수 개수 제한 때문에 별도 함수가 아니다).
//  · 받는 값은 테마 이름(허용 목록 LICHESS_ANGLES)뿐 — 임의 쿼리 중계 금지.
//  · 쌓인 퍼즐(theme_puzzles, service_role RPC)에서 무작위로 답하고, 테마당 쌓인 수가 모자라면 Lichess /api/puzzle/next?angle=에서 몇 개씩 더 받아 쌓는다(테마당 10분에 6회까지).
//  · Lichess 퍼즐은 chess.js로 처음부터 다시 두어 시작 FEN을 만들고, 정답 UCI가 모두 합법인지 확인한 뒤 SAN으로 바꿔 넣는다(이상하면 버림).
//  · DB가 없거나 실패해도 새로 받은 퍼즐만으로 답한다. scripts/check-theme-puzzles.mjs가 순수 함수를 검사한다.
import { Chess } from "chess.js";
import { clientIp, supabaseEnv, rateLimited } from "./server.js";

// Lichess 퍼즐 테마(angle) 허용 목록 — 레슨 테마(src/lib/lessonPuzzles.js)가 쓰는 것만
export const LICHESS_ANGLES = new Set([
  "fork", "pin", "skewer", "discoveredAttack", "doubleCheck", "hangingPiece", "trappedPiece", "capturingDefender", "deflection", "attraction",
  "clearance", "interference", "intermezzo", "xRayAttack", "sacrifice", "quietMove", "defensiveMove", "zugzwang", "exposedKing", "kingsideAttack",
  "attackingF2F7", "advancedPawn", "promotion", "underPromotion", "enPassant", "castling",
  "backRankMate", "smotheredMate", "arabianMate", "bodenMate", "anastasiaMate", "hookMate", "doubleBishopMate", "dovetailMate",
  "mateIn1", "mateIn2", "mateIn3", "mate",
  "endgame", "pawnEndgame", "rookEndgame", "queenEndgame", "bishopEndgame", "knightEndgame", "opening", "middlegame",
  "advantage", "crushing", "equality", "short", "long",
]);
export const STORE_TARGET = 40;      // 테마당 이만큼 쌓일 때까지 Lichess에서 더 받는다
export const PULL_PER_REQUEST = 2;   // 요청 한 번에 Lichess에서 받는 최대 수(테마당)

export function parseAngles(raw) {
  if (typeof raw !== "string" || raw.length > 200) return null;
  const out = [...new Set(raw.split(",").map((x) => x.trim()).filter(Boolean))];
  if (!out.length || out.length > 4 || out.some((a) => !LICHESS_ANGLES.has(a))) return null;
  return out;
}

/** Lichess /api/puzzle/next 응답 → { id, fen, sol(SAN), rating, themes } | null. 시작 포지션 = game.pgn의 수를 모두 둔 뒤(상대의 마지막 수까지). */
export function parseLichessPuzzle(j) {
  try {
    if (!j || typeof j !== "object" || !j.game || !j.puzzle) return null;
    const pz = j.puzzle, id = String(pz.id || "");
    if (!/^[A-Za-z0-9]{4,10}$/.test(id) || !Array.isArray(pz.solution) || !pz.solution.length || pz.solution.length > 24) return null;
    const pgn = String(j.game.pgn || "").replace(/\{[^}]*\}/g, " ").replace(/\d+\.(\.\.)?/g, " ").trim();
    if (!pgn || pgn.length > 4000) return null;
    const c = new Chess();
    for (const san of pgn.split(/\s+/).filter(Boolean)) { if (!c.move(san)) return null; }
    const fen = c.fen(), sol = [];
    for (const u of pz.solution) {
      if (typeof u !== "string" || !/^[a-h][1-8][a-h][1-8][qrbn]?$/.test(u)) return null;
      const m = c.move({ from: u.slice(0, 2), to: u.slice(2, 4), promotion: u[4] });
      if (!m) return null;
      sol.push(m.san);
    }
    const rating = Number.isFinite(+pz.rating) && +pz.rating >= 100 && +pz.rating <= 3500 ? Math.round(+pz.rating) : null;
    const themes = Array.isArray(pz.themes) ? pz.themes.filter((x) => typeof x === "string" && /^[A-Za-z0-9_]{2,40}$/.test(x)).slice(0, 12) : [];
    return { id, fen, sol, rating, themes };
  } catch { return null; }
}

/** (BUG-199) Lichess가 준 퍼즐이 요청한 테마를 정말 갖는가 — 테마 정보가 없거나 다른 테마면 그 묶음에 넣지 않는다
 *  (로그인하지 않은 요청에 Lichess가 테마와 무관한 퍼즐을 줄 수 있어, 예전엔 엉뚱한 퍼즐이 "스모더드 메이트"로 쌓일 수 있었다). */
export const hasTheme = (p, angle) => !!p && Array.isArray(p.themes) && p.themes.includes(angle);
/** 화면 값: 쌓인 퍼즐 + 새로 받은 퍼즐을 id로 합쳐 n개. angle을 주면 그 테마를 가진 퍼즐만. */
export function mergePuzzles(stored, fresh, n = 8, angle = null) {
  const seen = new Set(), out = [];
  for (const p of [...(fresh || []), ...((stored && stored.puzzles) || [])]) {
    if (!p || !p.id || seen.has(p.id) || !Array.isArray(p.sol) || typeof p.fen !== "string") continue;
    if (angle && !hasTheme(p, angle)) continue;
    seen.add(p.id); out.push({ id: p.id, fen: p.fen, sol: p.sol, rating: p.rating == null ? null : p.rating, themes: Array.isArray(p.themes) ? p.themes : [] });
    if (out.length >= n) break;
  }
  return out;
}

const rpc = async (env, fn, body) => {
  const r = await fetch(env.url + "/rest/v1/rpc/" + fn, { method: "POST", headers: { apikey: env.service, Authorization: "Bearer " + env.service, "Content-Type": "application/json" }, body: JSON.stringify(body) });
  if (!r.ok) throw new Error(fn + " " + r.status);
  return r.json();
};

export async function themePuzzlesHandler(req, res) {
  if (req.method !== "GET") { res.status(405).json({ error: "method" }); return; }
  const angles = parseAngles((req.query || {}).angles);
  if (!angles) { res.status(400).json({ error: "invalid_angles" }); return; }
  const n = Math.max(1, Math.min(10, parseInt((req.query || {}).n, 10) || 6));
  const env = supabaseEnv();
  if (await rateLimited(env, [["tpz:ip:" + clientIp(req), 30, 60]])) { res.status(429).json({ error: "rate_limited" }); return; }
  const result = {};
  for (const angle of angles) {
    let stored = null;
    if (env) { try { stored = await rpc(env, "theme_puzzle_read", { p_theme: angle, p_n: n }); } catch { stored = null; } }
    const fresh = [];
    const have = stored && Number.isFinite(+stored.stored) ? +stored.stored : 0;
    if (have < STORE_TARGET && !(await rateLimited(env, [["tpz:pull:" + angle, 6, 600], ["tpz:upstream", 300, 3600]]))) {
      for (let k = 0; k < PULL_PER_REQUEST; k++) {
        try {
          const up = await fetch("https://lichess.org/api/puzzle/next?angle=" + encodeURIComponent(angle), { headers: { "User-Agent": "openchess-theme-puzzles/1.0", Accept: "application/json" } });
          if (!up.ok) break;
          const p = parseLichessPuzzle(await up.json());
          if (p && hasTheme(p, angle) && !fresh.some((x) => x.id === p.id)) fresh.push(p);
        } catch { break; }
      }
      if (fresh.length && env) { try { await rpc(env, "theme_puzzle_record", { p_theme: angle, p_puzzles: fresh }); } catch { /* 쌓기 실패 — 응답은 그대로 */ } }
    }
    result[angle] = mergePuzzles(stored, fresh, n, angle);
  }
  // (BUG-199) 빈 묶음이 있으면 CDN에 오래 남기지 않는다(예전엔 빈 응답이 2분 동안 모두에게 그대로 나갔다)
  res.setHeader("Cache-Control", Object.values(result).some((v) => !v.length) ? "no-store" : "public, max-age=30, s-maxage=120");
  res.status(200).json({ puzzles: result });
}
