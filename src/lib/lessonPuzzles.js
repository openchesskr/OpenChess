// (v0.7.8, 사용자 요청) 학습 탭 "추가 학습" — 가장 최근에 본 레슨들의 테마에 맞는 체스 퍼즐.
//  · 레슨 → 테마: lessonTheme(id). Lichess 퍼즐 테마(angle, api/_lib/themePuzzles.js LICHESS_ANGLES 안의 것만)와
//    OpenChess 퍼즐 태그(oc: "mate:<패턴>" · "mate" · "sacrifice" · "advantage" · "punish" · "opening:<계열>")를 함께 정한다.
//  · OpenChess 퍼즐 분석: ocPuzzleTags(data) — 시작 포지션에서 정답을 끝까지 두어 체크메이트면 메이트 패턴(mateShape)을 붙이고,
//    오프닝 수순(setupSans)이 지나간 레파토리 계열(mecOpenings openingOfGame)을 붙인다.
//  · 최근 본 레슨: 레슨을 열 때 noteLessonViewed(id) — 이 기기(localStorage)에 최근 순서로 8개까지.
//  순수 함수(브라우저·네트워크 없이 돈다)는 scripts/check-theme-puzzles.mjs가 검사한다. 불러오기·화면은 app/themePuzzles.jsx.
import { Chess } from "chess.js";
import { t } from "./i18n.js";
import { openingOfGame } from "./mecOpenings.js";

/* ── 레슨 → 테마 ── */
// 레슨별로 정한 것. 없는 레슨은 단계 기본값(STAGE_THEME), 오프닝 레파토리 레슨은 그 계열의 OpenChess 퍼즐 + Lichess opening.
const T = (angles, oc) => ({ angles, oc });
const BY_LESSON = {
  // 규칙과 기초 이론
  r_check: T(["mateIn1"], ["mate"]), r_mate: T(["mateIn1"], ["mate"]), r_stalemate: T(["defensiveMove"], []), r_draws: T(["defensiveMove"], []),
  r_castle: T(["castling"], []), r_enpassant: T(["enPassant"], []), r_promotion: T(["promotion"], []), r_values: T(["hangingPiece"], ["advantage"]),
  o_center: T(["opening"], ["punish"]), o_develop: T(["opening"], ["punish"]), o_safety: T(["opening", "exposedKing"], ["punish"]), o_tempo: T(["opening"], ["punish"]),
  // 좋은 습관
  g_protect: T(["hangingPiece"], ["advantage"]), g_candidate: T(["advantage"], ["advantage"]), g_threat: T(["defensiveMove"], ["punish"]), t_counting: T(["hangingPiece"], ["advantage"]),
  g_trade: T(["advantage"], ["advantage"]), g_activity: T(["middlegame"], ["advantage"]), g_rooks: T(["rookEndgame"], []),
  // 작은 부정확
  i_twice: T(["opening"], ["punish"]), i_earlyqueen: T(["opening"], ["punish"]), i_kingpawns: T(["exposedKing"], ["punish"]), i_passive: T(["middlegame"], ["advantage"]),
  st_badbishop: T(["bishopEndgame"], []), st_doubled: T(["pawnEndgame"], []), st_isolated: T(["middlegame"], []),
  // 흔한 실수
  t_hanging: T(["hangingPiece"], ["advantage"]), x_ignore: T(["defensiveMove"], ["punish"]), x_scholar: T(["attackingF2F7"], ["mate"]), x_f7: T(["attackingF2F7"], ["sacrifice"]),
  x_greedy: T(["hangingPiece", "trappedPiece"], ["punish"]), x_recapture: T(["intermezzo"], ["advantage"]), o_trap: T(["opening", "trappedPiece"], ["punish"]),
  // 치명적인 실수
  z_foolsmate: T(["mateIn1", "attackingF2F7"], ["mate"]), m_backrank: T(["backRankMate"], ["mate:backRank"]), t_trapped: T(["trappedPiece"], ["advantage"]),
  z_queenhang: T(["hangingPiece"], ["punish"]), z_forksq: T(["fork"], ["advantage"]), z_stalemate: T(["defensiveMove"], []), z_holes: T(["exposedKing", "kingsideAttack"], ["mate"]),
  // 놓치면 안 되는 기회
  n_free: T(["hangingPiece"], ["punish"]), n_mate1: T(["mateIn1"], ["mate"]), n_checks: T(["mateIn2"], ["mate"]), n_punish: T(["advantage", "crushing"], ["punish"]), n_promo: T(["promotion", "advancedPawn"], []),
  // 기본 전술
  t_fork: T(["fork"], ["advantage"]), t_pin: T(["pin"], ["advantage"]), t_skewer: T(["skewer"], ["advantage"]), t_discovered: T(["discoveredAttack"], ["advantage"]),
  t_double: T(["fork"], ["advantage"]), t_removal: T(["capturingDefender"], ["advantage"]), t_doublecheck: T(["doubleCheck"], ["mate"]), t_decoy: T(["attraction"], ["sacrifice"]),
  t_deflection: T(["deflection"], ["sacrifice"]), t_overload: T(["deflection", "capturingDefender"], ["advantage"]), t_intermezzo: T(["intermezzo"], ["advantage"]),
  t_xray: T(["xRayAttack"], ["advantage"]), t_interference: T(["interference"], ["sacrifice"]),
  // 전략과 계획
  st_openfile: T(["rookEndgame", "middlegame"], []), st_seventh: T(["rookEndgame"], []), st_outpost: T(["middlegame"], ["advantage"]), st_passed: T(["advancedPawn"], []),
  st_space: T(["middlegame", "quietMove"], ["advantage"]), st_goodtrade: T(["advantage"], ["advantage"]), st_prophylaxis: T(["quietMove", "defensiveMove"], []), st_kingattack: T(["kingsideAttack"], ["mate", "sacrifice"]),
  // 정확한 엔드게임
  m_queen: T(["queenEndgame", "mateIn2"], ["mate"]), m_ladder: T(["mateIn2"], ["mate"]), e_rookmate: T(["rookEndgame", "mateIn2"], ["mate"]),
  e_square: T(["pawnEndgame"], []), e_opposition: T(["pawnEndgame", "zugzwang"], []), e_keysquare: T(["pawnEndgame"], []), e_activeking: T(["pawnEndgame"], []),
  e_rookbehind: T(["rookEndgame"], []), e_cutoff: T(["rookEndgame"], []), e_promote: T(["promotion", "pawnEndgame"], []),
  e_lucena: T(["rookEndgame"], []), e_philidor: T(["rookEndgame", "defensiveMove"], []), e_perpetual: T(["equality"], []),
  // 희생과 메이트 패턴
  m_smothered: T(["smotheredMate"], ["mate:smothered"]), m_arabian: T(["arabianMate"], ["mate:arabian"]), m_h7: T(["kingsideAttack", "sacrifice"], ["sacrifice", "mate"]),
  m_corridor: T(["backRankMate", "mateIn2"], ["mate:backRank", "mate"]), m_boden: T(["bodenMate"], ["mate:boden"]), m_epaulette: T(["dovetailMate", "mateIn2"], ["mate"]),
  m_anastasia: T(["anastasiaMate"], ["mate"]), t_breakthrough: T(["advancedPawn", "pawnEndgame"], []), b_greek: T(["kingsideAttack", "sacrifice"], ["sacrifice"]),
  b_legal: T(["attackingF2F7", "opening"], ["mate"]), b_queensac: T(["sacrifice", "mateIn2"], ["sacrifice", "mate"]), b_exchsac: T(["sacrifice"], ["sacrifice"]),
};
const STAGE_THEME = {
  s_rules: T(["mateIn1"], ["mate"]), s_good: T(["hangingPiece"], ["advantage"]), s_inacc: T(["middlegame"], ["punish"]), s_mistake: T(["hangingPiece"], ["punish"]),
  s_blunder: T(["hangingPiece"], ["punish"]), s_miss: T(["advantage"], ["punish"]), s_tactic: T(["fork"], ["advantage"]), s_plan: T(["advantage"], ["advantage"]),
  s_endgame: T(["endgame"], []), s_brill: T(["sacrifice"], ["sacrifice"]), s_rep: T(["opening"], []),
};
export const LESSON_THEME_IDS = Object.keys(BY_LESSON);

/** 레슨 → { angles, oc }. lesson: allLessons()의 항목(id·stage·motif). */
export function lessonTheme(lesson) {
  if (!lesson) return null;
  if (lesson.motif) return T(["opening"], ["opening:" + lesson.motif]);
  return BY_LESSON[lesson.id] || STAGE_THEME[lesson.stage] || T(["advantage"], []);
}

/* ── 테마 이름(화면) ── */
const ANGLE_LABEL = {
  fork: () => t("포크"), pin: () => t("핀"), skewer: () => t("스큐어"), discoveredAttack: () => t("디스커버드 공격"), doubleCheck: () => t("더블 체크"), hangingPiece: () => t("행잉 피스"),
  trappedPiece: () => t("트랩드 피스"), capturingDefender: () => t("리무빙 더 디펜더"), deflection: () => t("디플렉션"), attraction: () => t("어트랙션"), clearance: () => t("클리어런스"), interference: () => t("인터피어런스"),
  intermezzo: () => t("인터메조"), xRayAttack: () => t("엑스레이"), sacrifice: () => t("새크리파이스"), quietMove: () => t("콰이어트 무브"), defensiveMove: () => t("디펜시브 무브"), zugzwang: () => t("추크츠방"),
  exposedKing: () => t("익스포즈드 킹"), kingsideAttack: () => t("킹사이드 어택"), attackingF2F7: () => t("f2·f7 어택"), advancedPawn: () => t("어드밴스드 폰"), promotion: () => t("프로모션"),
  underPromotion: () => t("언더프로모션"), enPassant: () => t("앙파상"), castling: () => t("캐슬링"), backRankMate: () => t("백랭크 메이트"), smotheredMate: () => t("스모더드 메이트"),
  arabianMate: () => t("아라비안 메이트"), bodenMate: () => t("보덴 메이트"), anastasiaMate: () => t("아나스타샤 메이트"), hookMate: () => t("훅 메이트"), doubleBishopMate: () => t("더블 비숍 메이트"),
  dovetailMate: () => t("도브테일 메이트"), mateIn1: () => t("1수 메이트"), mateIn2: () => t("2수 메이트"), mateIn3: () => t("3수 메이트"), mate: () => t("체크메이트"),
  endgame: () => t("엔드게임"), pawnEndgame: () => t("폰 엔드게임"), rookEndgame: () => t("룩 엔드게임"), queenEndgame: () => t("퀸 엔드게임"), bishopEndgame: () => t("비숍 엔드게임"),
  knightEndgame: () => t("나이트 엔드게임"), opening: () => t("오프닝"), middlegame: () => t("미들게임"), advantage: () => t("어드밴티지"), crushing: () => t("크러싱"), equality: () => t("이퀄리티"),
  short: () => t("짧은 퍼즐"), long: () => t("긴 퍼즐"),
};
export const angleLabel = (a) => (ANGLE_LABEL[a] ? ANGLE_LABEL[a]() : a);
export const ANGLE_LABEL_KEYS = Object.keys(ANGLE_LABEL);

/* ── 최근 본 레슨(이 기기) ── */
const RECENT_KEY = "oc_recent_lessons_v1";
export const RECENT_MAX = 8;
/** 순수: 최근 목록에 id를 맨 앞으로(중복 제거, 최대 RECENT_MAX개). */
export function pushRecent(list, id) {
  if (typeof id !== "string" || !/^[A-Za-z0-9_-]{1,40}$/.test(id)) return Array.isArray(list) ? list.slice(0, RECENT_MAX) : [];
  return [id, ...(Array.isArray(list) ? list : []).filter((x) => x !== id && typeof x === "string")].slice(0, RECENT_MAX);
}
export function loadRecentLessons() { try { const a = JSON.parse(window.localStorage.getItem(RECENT_KEY) || "[]"); return Array.isArray(a) ? a.filter((x) => typeof x === "string").slice(0, RECENT_MAX) : []; } catch { return []; } }
const listeners = new Set();
export function onRecentLessonsChange(fn) { listeners.add(fn); return () => listeners.delete(fn); }
export function noteLessonViewed(id) {
  try { const next = pushRecent(loadRecentLessons(), id); window.localStorage.setItem(RECENT_KEY, JSON.stringify(next)); listeners.forEach((fn) => { try { fn(next); } catch { /* 화면 쪽 오류는 무시 */ } }); } catch { /* 저장 실패해도 레슨은 계속 */ }
}

/* ── OpenChess 퍼즐 분석 ── */
const SQ = (f, r) => "abcdefgh"[f] + (r + 1);
const fr = (sq) => ["abcdefgh".indexOf(sq[0]), +sq[1] - 1];
/** 체크메이트 포지션(메이트당한 쪽 차례)의 모양 → "backRank" | "smothered" | "arabian" | "boden" | "mate" | null(메이트 아님). */
export function mateShape(fen) {
  let c; try { c = new Chess(fen); } catch { return null; }
  if (!c.isCheckmate()) return null;
  const me = c.turn(), op = me === "w" ? "b" : "w";
  let ks = null; const board = c.board();
  for (const row of board) for (const p of row) if (p && p.type === "k" && p.color === me) ks = p.square;
  if (!ks) return "mate";
  const checkers = c.attackers(ks, op).map((s) => ({ sq: s, p: c.get(s) }));
  const [kf, kr] = fr(ks);
  const around = [];
  for (let df = -1; df <= 1; df++) for (let dr = -1; dr <= 1; dr++) { if (!df && !dr) continue; const f = kf + df, r = kr + dr; if (f >= 0 && f < 8 && r >= 0 && r < 8) around.push(SQ(f, r)); }
  const ownAround = around.filter((s) => { const p = c.get(s); return p && p.color === me; }).length;
  if (checkers.length === 1 && checkers[0].p.type === "n" && ownAround === around.length) return "smothered";
  const home = me === "w" ? 0 : 7, ahead = me === "w" ? 1 : -1;
  if (checkers.length === 1 && "rq".includes(checkers[0].p.type) && kr === home && fr(checkers[0].sq)[1] === home) {
    const front = around.filter((s) => fr(s)[1] === home + ahead);
    if (front.length && front.every((s) => { const p = c.get(s); return p && p.color === me; })) return "backRank";
  }
  if (checkers.length === 1 && checkers[0].p.type === "r" && (kf === 0 || kf === 7) && (kr === 0 || kr === 7)) {
    const [cf, cr] = fr(checkers[0].sq);
    if (Math.max(Math.abs(cf - kf), Math.abs(cr - kr)) === 1) { for (let f = 0; f < 8; f++) for (let r = 0; r < 8; r++) { const p = c.get(SQ(f, r)); if (p && p.type === "n" && p.color === op && Math.abs(f - kf) <= 2 && Math.abs(r - kr) <= 2 && c.attackers(checkers[0].sq, op).includes(SQ(f, r))) return "arabian"; } }
  }
  const bishops = []; for (const row of board) for (const p of row) if (p && p.type === "b" && p.color === op) bishops.push(p.square);
  if (checkers.length === 1 && checkers[0].p.type === "b" && bishops.length >= 2) {
    const covering = bishops.filter((b) => around.some((s) => { const p = c.get(s); return !(p && p.color === me) && c.attackers(s, op).includes(b); }));
    if (covering.length >= 2) return "boden";
  }
  return "mate";
}

/** OpenChess 퍼즐 data → { fen, sol(SAN, 학습자부터 번갈아), tags:Set } | null. 정답이 합법이 아니면 버린다. */
export function ocPuzzleInfo(data) {
  try {
    if (!data || !Array.isArray(data.solution) || !data.solution.length || data.solution.length > 30) return null;
    const setup = [...(Array.isArray(data.setupSans) ? data.setupSans : []), ...(data.mistakeSan ? [data.mistakeSan] : [])];
    const c = data.fen ? new Chess(data.fen) : new Chess();
    if (!data.fen) for (const s of setup) { if (!c.move(s)) return null; }
    const fen = c.fen(), sol = [];
    for (const s of data.solution) { const m = c.move(s); if (!m) return null; sol.push(m.san); }
    const tags = new Set((Array.isArray(data.themes) ? data.themes : []).filter((x) => typeof x === "string"));
    const shape = mateShape(c.fen());
    if (shape) { tags.add("mate"); tags.add("mate:" + shape); }
    if (tags.has("checkmate")) tags.add("mate");
    if (!data.fen && setup.length) { const o = openingOfGame(setup); if (o && o.family) tags.add("opening:" + o.family); }
    return { fen, sol, tags };
  } catch { return null; }
}

/** 레슨 테마(oc 태그)에 맞는 OpenChess 퍼즐 — rows: [{ no, data }]. 앞쪽 태그에 맞는 것부터, 최대 n개. */
export function matchOcPuzzles(rows, theme, n = 4) {
  if (!theme || !theme.oc || !theme.oc.length) return [];
  const infos = [];
  for (const r of rows || []) { const i = r && r.data ? ocPuzzleInfo(r.data) : null; if (i) infos.push({ id: "oc" + r.no, no: r.no, fen: i.fen, sol: i.sol, tags: i.tags, rating: null, source: "oc" }); }
  const out = [], seen = new Set();
  for (const tag of theme.oc) for (const p of infos) { if (out.length >= n) break; if (!seen.has(p.id) && p.tags.has(tag)) { seen.add(p.id); out.push(p); } }
  return out;
}

// Lichess 테마 중 레슨 개념과 꼭 맞지 않는 넓은 테마 — 이런 레슨은 "OpenChess 고유 테마"(레슨 이름)로 보여 준다.
const BROAD = new Set(["advantage", "crushing", "equality", "middlegame", "opening", "endgame", "defensiveMove", "short", "long", "mateIn1", "mateIn2", "mateIn3", "mate"]);
/** (v0.7.9) 레슨의 추가 학습 테마 — { lessonId, angle(Lichess), oc, own(고유 테마 여부) }. 정확히 맞는 Lichess 테마가 없으면 own. */
export function themeOf(lesson) {
  const th = lessonTheme(lesson); if (!th) return null;
  const angle = th.angles[0];
  const own = !!lesson.motif || !BY_LESSON[lesson.id] || BROAD.has(angle) && !/mate/i.test(lesson.id);
  return { lessonId: lesson.id, angle, oc: th.oc, own };
}
/** 최근 레슨들 → 퍼즐 묶음 목록 [{ lessonId, angle, oc, own }] — (v0.7.9) 레슨마다 하나(모든 레슨이 고유 퍼즐 은행을 가진다), 최대 max개. */
export function recentThemeGroups(recentIds, lessonOf, max = 3) {
  const out = [], seen = new Set();
  for (const id of recentIds || []) {
    if (seen.has(id)) continue;
    const l = lessonOf(id); const g = l ? themeOf(l) : null; if (!g) continue;
    seen.add(id); out.push(g);
    if (out.length >= max) break;
  }
  return out;
}

/** (v0.7.9) OpenChess 테마 퍼즐 은행(src/data/lessonPuzzleBank.json, scripts/build-lesson-puzzles.mjs)의 한 레슨 → 퍼즐 목록. */
export function bankPuzzles(bank, lessonId) {
  const rows = (bank && bank[lessonId]) || [];
  return rows.map((r, k) => ({ id: "ob:" + lessonId + ":" + k, fen: r[0], sol: String(r[1]).split(" "), oks: Array.isArray(r[3]) ? r[3] : null, source: "theme", from: r[2] || "v", rating: null }));
}

/** 풀이 판정: 학습자 수(SAN)가 정답 sol[i]와 같으면 정답. 마지막 수가 메이트면 다른 메이트 수도 정답.
 *  (v0.7.9) oks: 학습자 수마다 받아 주는 SAN 목록(은행 퍼즐 — 목표가 "체크하기"처럼 정답이 여럿인 문제). 학습자 수는 sol의 짝수 번째. */
export function puzzleMoveOk(fen, played, sol, i, oks) {
  const strip = (s) => String(s || "").replace(/[+#!?]/g, "");
  if (strip(played) === strip(sol[i])) return true;
  const alt = oks && oks[Math.floor(i / 2)];
  if (Array.isArray(alt) && alt.some((x) => strip(x) === strip(played))) return true;
  if (i === sol.length - 1) { try { const c = new Chess(fen); return !!c.move(played) && c.isCheckmate(); } catch { return false; } }
  return false;
}
