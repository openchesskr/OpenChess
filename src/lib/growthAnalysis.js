// (v0.7.4, 사용자 요청) 성장 분석의 순수 계산 — 내가 리뷰한 대국들(lib/reviewedCount.js의 collectMyReviews)에서 "약점"과 "성장 가능성"을 뽑는다.
// 화면(app/growth.jsx)과 검사(scripts/check-growth.mjs)가 같이 쓴다. 엔진은 쓰지 않는다 — 리뷰 결과에 이미 저장된 수별 등급·승률 손실·날카로움·최선수와 chess.js 판정만 쓴다.
//
// 흐름: 기록 → analyzeGame(한 판에서 내 수만 뽑아 구간·수 유형을 붙임, 빠름) → classifyPending(실수의 원인 분류, 느림: 시간 예산만큼씩 나눠 진행, 결과는 기기에 캐시) → buildGrowth(여러 판을 모아 아래 여섯 가지를 계산, 빠름)
// 원인 분류의 전술 탐색(replyTactics)이 한 번에 약 240ms라 한꺼번에 돌리면 화면이 멈춘다 — 화면은 buildGrowth를 먼저 그리고, classifyPending이 끝날 때마다 다시 그린다.
//  ① curve   성장 곡선: 판별 정확도 + 최근 K판 vs 이전 K판 변화(trend)
//  ② phases  구간 진단: 오프닝·중반·엔드게임별 평균 정확도와 실수율, 가장 약한 구간
//  ③ causes  반복되는 실수 원인: 실수·블런더·놓친 수를 원인별로 모은 횟수·승률 손실 비중
//  ④ focus   지금 고칠 한 가지: 손실 비중이 가장 큰 원인과, 그것만 고쳤을 때 평균 정확도 상승 추정(gain)
//  ⑤ moveTypes 수 유형별: 기물별(폰~킹)·수 종류별(잡는 수·체크·캐슬링·승격)의 횟수·실수율·평균 손실
//  ⑥ worst   가장 아쉬웠던 수: 승률 손실이 큰 순서
import { Chess } from "chess.js";
import { t } from "./i18n.js";
import { replyTactics, bestMoveTactic } from "./mecTactics.js";
import { newCumulativeAccuracy } from "./moveQuality.js";

export const BAD_KINDS = ["mistake", "blunder", "miss"];          // 실수 원인·수 유형의 "나쁜 수" 기준
export const PHASES = ["opening", "middle", "end"];
export const MIN_PHASE_MOVES = 3;                                 // 한 판에서 이 구간의 내 수가 이보다 적으면 그 판의 구간 정확도는 쓰지 않는다
export const MIN_PHASE_GAMES = 3;                                 // 구간 진단은 이만큼의 판이 있어야 "가장 약한 구간"을 말한다
export const MIN_TYPE_MOVES = 8;                                  // 수 유형 한 줄은 이만큼의 수가 있어야 "가장 약한 유형" 후보가 된다
export const HEAVY_GAMES = 30;                                    // 원인·수 유형·가장 아쉬운 수는 가장 최근 이만큼의 판만 쓴다(성능). 성장 곡선·구간 진단은 전부.
export const WORST_COUNT = 5;
export const GOOD_ALT_MARGIN = 10;                                // "대신 둘 수 있는 좋은 수" — 최선 후보와 승률 차이가 이 값(%p) 이내인 후보
const SAN_RE = /^[KQRBNa-hxO0-9=+#!?\-]{2,16}$/;
/* 리뷰 결과의 moves[].alts([{ san, win }]) 검증 — 남의 분석이 섞여 들어올 수 있어 형식이 틀린 값은 버린다(서버 api/review-put.js의 validAlts와 같은 기준). */
export function cleanAlts(alts) {
  if (!Array.isArray(alts) || alts.length > 3) return [];
  return alts.filter((x) => x && typeof x.san === "string" && SAN_RE.test(x.san) && typeof x.win === "number" && Number.isFinite(x.win) && x.win >= 0 && x.win <= 100).map((x) => ({ san: x.san, win: x.win }));
}

const VAL = { p: 1, n: 3, b: 3, r: 5, q: 9, k: 0 };
const stripSan = (s) => String(s || "").replace(/[+#!?]+$/g, "");
const avg = (a) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : null);
const r1 = (x) => (x == null ? null : Math.round(x * 10) / 10);

export const phaseLabel = (k) => ({ opening: t("오프닝"), middle: t("미들게임"), end: t("엔드게임") }[k] || k);
export const CAUSES = ["allowedMate", "hung", "allowedTactic", "missedMate", "missedTactic", "missedWin", "missedCheck", "opening", "endgame", "positional"];
export const causeLabel = (k) => ({
  allowedMate: t("메이트 허용"), hung: t("기물 방치"), allowedTactic: t("상대 전술 허용"), missedMate: t("메이트 놓침"), missedTactic: t("전술 놓침"),
  missedWin: t("기물 획득 놓침"), missedCheck: t("체크 전술 놓침"), opening: t("오프닝 원칙"), endgame: t("엔드게임 기술"), positional: t("포지션 판단"),
}[k] || k);
export const causeAdvice = (k) => ({
  allowedMate: t("수를 두기 전에 상대의 체크·메이트 위협부터 확인하기"),
  hung: t("수를 두기 전에 내 기물이 공격받고 지켜지는지 확인하기"),
  allowedTactic: t("수를 두기 전에 상대가 포크·핀 같은 전술을 걸 수 있는지 확인하기"),
  missedMate: t("상대 킹 주변의 체크를 모두 세어 보기"),
  missedTactic: t("내 쪽의 포크·핀·메이트 같은 전술이 있는지 먼저 훑어보기"),
  missedWin: t("상대 기물이 방치되어 있는지 매 수 확인하기"),
  missedCheck: t("체크로 시작하는 전술을 먼저 찾아보기"),
  opening: t("중앙 차지·기물 전개·캐슬링 원칙 되짚기"),
  endgame: t("킹 활용과 폰 전진 기본기 연습하기"),
  positional: t("기물 활동성과 폰 구조를 비교해 계획 세우기"),
}[k] || "");
/* (v0.7.4, 사용자 요청) "지금 고칠 한 가지" 자세한 설명 — 원인마다 ① 무엇이 문제인가 ② 왜 생기나 ③ 이렇게 고쳐 보기(문장 끝마다 한 단계). 사이트 문구라 개조식. */
export const causeWhat = (k) => ({
  allowedMate: t("수를 둔 뒤 상대가 한 수 만에 체크메이트할 수 있는 상황. 한 수로 게임이 끝나 승률이 한꺼번에 무너짐."),
  hung: t("공격받는 내 기물을 충분히 지키지 않은 채 수를 두어 기물을 그냥 내준 경우."),
  allowedTactic: t("수를 둔 뒤 상대가 포크나 핀 같은 전술을 걸 수 있게 된 경우. 당장 기물을 잃지 않아도 다음 수에서 손해를 봄."),
  missedMate: t("한 수로 체크메이트할 수 있었는데 다른 수를 둔 경우."),
  missedTactic: t("포크나 핀 같은 전술로 이득을 볼 수 있었는데 놓친 경우."),
  missedWin: t("지켜지지 않은 상대 기물이나 교환 이득이 있었는데 쓰지 않은 경우."),
  missedCheck: t("체크로 시작하는 강한 수가 있었는데 다른 수를 둬 주도권을 놓친 경우."),
  opening: t("오프닝에서 중앙 차지, 기물 전개, 킹 안전이라는 기본 원칙을 어긴 수."),
  endgame: t("엔드게임에서 킹 활용이나 폰 전진 같은 기본기에서 승률이 크게 떨어진 수."),
  positional: t("눈에 띄는 기물 손실은 없지만 엔진이 더 좋다고 평가한 다른 수가 있던 경우. 기물 활동성이나 폰 구조 같은 장기적 요소에서 손해."),
}[k] || "");
export const causeWhy = (k) => ({
  allowedMate: t("내 수의 목적에만 집중하고 상대의 체크를 끝까지 확인하지 않아서 생김. 킹 주변을 지키던 기물을 움직일 때 특히 자주 생김."),
  hung: t("내 공격에 집중하느라 상대 반격을 놓치거나, 움직인 기물이 위험한 칸에 놓였는지 확인하지 않아서 생김."),
  allowedTactic: t("내 기물 둘이 같은 줄이나 상대 나이트·퀸의 공격 범위에 한꺼번에 걸리는 배치를 확인하지 않아서 생김."),
  missedMate: t("상대 킹 주변에서 가능한 체크를 끝까지 세어 보지 않아서 생김. 기물을 내주는 체크는 특히 눈에 안 띔."),
  missedTactic: t("내 기물의 공격 범위가 겹치는 칸을 찾지 않고 눈에 보이는 수만 둬서 생김."),
  missedWin: t("내 계획에만 집중하느라 상대의 마지막 수가 만든 허점을 확인하지 않아서 생김."),
  missedCheck: t("체크를 먼저 확인하지 않고 조용한 수만 후보에 올려서 생김."),
  opening: t("외운 수순이 끝난 뒤 다음 수의 목적이 없어서 같은 기물을 반복해 움직이거나 폰만 밀 때 생김."),
  endgame: t("기물이 줄어든 뒤에도 미들게임처럼 기물만 움직이고 킹을 중심으로 계획하지 않아서 생김."),
  positional: t("당장 안전해 보이는 수를 고르고 기물이 어디서 가장 활발한지 비교하지 않아서 생김."),
}[k] || "");
export const causeFix = (k) => ({
  allowedMate: t("수를 두기 전에 상대가 둘 수 있는 체크를 모두 세어 보기. 킹 주변 기물을 움직인다면 그 기물이 막고 있던 줄과 대각선부터 확인하기."),
  hung: t("수를 두기 전에 움직이는 기물과 그 옆 기물이 공격받는지, 지켜지는지 한 번씩 점검하기. 상대의 마지막 수가 무엇을 노리는지 먼저 묻기."),
  allowedTactic: t("수를 두기 전에 상대 나이트와 퀸이 갈 수 있는 칸에 내 기물이 둘 이상 걸리지 않는지 보기. 같은 줄이나 대각선에 킹과 큰 기물이 나란히 서지 않게 하기."),
  missedMate: t("상대 킹을 향한 체크를 모두 나열해 보기. 체크마다 상대 킹이 갈 수 있는 칸이 남는지 확인하기."),
  missedTactic: t("후보를 체크, 기물 잡기, 상대 기물을 공격하는 수 순서로 훑어보기. 나이트와 퀸이 동시에 노릴 수 있는 칸 찾아보기."),
  missedWin: t("상대가 수를 둘 때마다 방치된 기물이 있는지 먼저 확인하기. 잡을 기물이 있으면 잡은 뒤 상대의 응수까지 따져 보기."),
  missedCheck: t("모든 수에서 가능한 체크를 먼저 확인하는 습관 들이기. 체크 뒤 이어지는 수를 두 수 앞까지 살펴보기."),
  opening: t("오프닝에서는 같은 기물을 두 번 움직이지 않고 나이트와 비숍부터 꺼내기. 10수 안에 캐슬링을 마치는 것을 목표로 삼기."),
  endgame: t("엔드게임에서는 킹을 중앙으로 가져오기. 통과폰을 만들 수 있는지 먼저 확인하고 상대 통과폰은 킹으로 막을 수 있는지 세어 보기."),
  positional: t("후보를 두세 개 만들고 가장 소극적인 기물이 어디로 가야 좋은지 비교하기. 폰 구조를 약하게 만드는 수는 한 번 더 생각하기."),
}[k] || "");
/* 문장 끝(. 또는 。)마다 한 단계로 나눈다 — 번역문도 문장 끝 구두점을 지킨다. */
export const splitSteps = (text) => String(text || "").split(/(?<=[.。।])\s*/).map((x) => x.trim()).filter(Boolean);
export const PIECES = ["p", "n", "b", "r", "q", "k"];
export const pieceLabel = (k) => ({ p: t("폰"), n: t("나이트"), b: t("비숍"), r: t("룩"), q: t("퀸"), k: t("킹") }[k] || k);
export const ACTIONS = ["capture", "check", "castle", "promotion"];
export const actionLabel = (k) => ({ capture: t("잡는 수"), check: t("체크"), castle: t("캐슬링"), promotion: t("승격") }[k] || k);

/* 이 수를 두기 전 포지션에서의 구간: 16수(plies) 이전은 오프닝, 이후는 남은 기물(폰·킹 제외) 값 합이 26 이하면 엔드게임. */
export function phaseOf(ply, game) {
  if (ply < 16) return "opening";
  let sum = 0; for (const row of game.board()) for (const p of row) if (p && p.type !== "k" && p.type !== "p") sum += VAL[p.type];
  return sum <= 26 ? "end" : "middle";
}

/* 수 두기 전 포지션·내가 둔 수·엔진 최선수로 "무엇을 놓쳤는가"를 분류한다(엔진 없이 chess.js로). 불법·해석 불가면 구간 기반 폴백. */
function baseCause(fen, san, best, phase) {
  try {
    const g = new Chess(fen);
    const b = new Chess(fen); const bm = best ? b.move(stripSan(best)) : null;
    const um = g.move(stripSan(san));
    const replies = g.moves({ verbose: true });
    for (const o of replies) { const t2 = new Chess(g.fen()); t2.move(o.san); if (t2.isCheckmate()) return "allowedMate"; }
    for (const o of replies) {
      if (!o.captured || VAL[o.captured] < 3) continue;
      const t2 = new Chess(g.fen()); t2.move(o.san);
      const recapture = t2.moves({ verbose: true }).some((m) => m.to === o.to && m.captured);
      const net = recapture ? VAL[o.captured] - VAL[o.piece] : VAL[o.captured];
      if (net >= 2 || !recapture) return "hung";
    }
    if (bm && /#$/.test(bm.san)) return "missedMate";
    if (bm && bm.captured && !um.captured && VAL[bm.captured] >= 3) return "missedWin";
    if (bm && /\+$/.test(bm.san) && !/[+#]$/.test(um.san)) return "missedCheck";
    if (bm && bm.captured && !um.captured && VAL[bm.captured] >= 1 && phase !== "opening") return "missedWin";
  } catch { /* 아래 폴백 */ }
  return phase === "opening" ? "opening" : phase === "end" ? "endgame" : "positional";
}
// 원인 분류 결과 캐시 — 키: 수 두기 전 FEN(앞 4칸)+수+최선수. 기기 저장소에 남겨 다음부터는 새 리뷰분만 계산한다.
const CAUSE_KEY = "oc_growth_cause_v1", CAUSE_MAX = 4000;
const ckOf = (fenBefore, san, best) => fenBefore.split(" ").slice(0, 4).join(" ") + "|" + stripSan(san) + "|" + stripSan(best || "");
export function loadCauseCache(storage) {
  try { const st = storage || (typeof window !== "undefined" ? window.localStorage : null); const raw = st && st.getItem(CAUSE_KEY); const o = raw ? JSON.parse(raw) : null; return new Map(o && typeof o === "object" ? Object.entries(o) : []); } catch { return new Map(); }
}
export function saveCauseCache(cache, storage) {
  try {
    const st = storage || (typeof window !== "undefined" ? window.localStorage : null); if (!st) return;
    let entries = [...cache.entries()]; if (entries.length > CAUSE_MAX) { entries = entries.slice(entries.length - CAUSE_MAX); cache.clear(); entries.forEach(([k, v]) => cache.set(k, v)); }
    st.setItem(CAUSE_KEY, JSON.stringify(Object.fromEntries(entries)));
  } catch { /* 저장 실패는 다음에 다시 계산 */ }
}
/* 원인 분류 — 기본 분류에 전술 탐지(lib/mecTactics.js)를 더한다: 상대가 전술을 걸 수 있게 둔 수는 "상대 전술 허용", 내 쪽 전술을 놓친 수는 "전술 놓침"(detail에 전술 종류). 결과는 [원인, 전술종류|null]. */
export function classifyBad(fenBefore, fenAfter, san, best, phase) {
  const base = baseCause(fenBefore, san, best, phase);
  if (base === "allowedMate" || base === "hung" || base === "missedMate") return [base, null];
  let rt = null, bt = null;
  try { rt = replyTactics(fenAfter); } catch { rt = null; }
  if (rt) return rt.kind === "mate" ? ["allowedMate", null] : ["allowedTactic", rt.kind];
  try { bt = best ? bestMoveTactic(fenBefore, stripSan(best)) : null; } catch { bt = null; }
  return bt ? (bt.kind === "mate" ? ["missedMate", null] : ["missedTactic", bt.kind]) : [base, null];
}

const accOf = (moves) => {
  const m = moves.filter((x) => x.loss != null);
  if (!m.length) return null;
  return newCumulativeAccuracy(m.map((x) => x.loss), m.map((x) => x.sharp), m.length, true, m.map((x) => x.kind));
};

/* 한 판(rec: collectMyReviews의 한 항목)에서 내 수만 뽑는다. 실수의 원인은 캐시에 있으면 바로 붙이고, 없으면 pending으로 두었다가 classifyPending이 채운다. 해석 불가한 수가 나오면 거기서 멈춘다. */
export function analyzeGame(rec, cache = null) {
  const result = rec && rec.result;
  if (!result || !Array.isArray(result.moves) || (rec.color !== "w" && rec.color !== "b")) return null;
  const g = new Chess(), mine = [];
  for (let i = 0; i < result.moves.length; i++) {
    const m = result.moves[i], phase = phaseOf(i, g), fenBefore = g.fen();
    let mv = null;
    try { mv = g.move(stripSan(m.san)); } catch { break; }
    if (!mv) break;
    if ((m.white ? "w" : "b") !== rec.color) continue;
    const loss = m.lossWinPct == null ? null : m.lossWinPct;
    const x = { ply: i, san: m.san, best: m.best || null, kind: m.kind || null, loss, sharp: m.sharp, phase, piece: mv.piece,
      capture: !!mv.captured, check: /[+#]/.test(mv.san), castle: /[kq]/.test(mv.flags), promotion: !!mv.promotion, bad: BAD_KINDS.includes(m.kind) };
    if (x.bad) {
      // (v0.7.4) 오프닝 실수 블록용 — 둔 사람 관점 승률 전/후(평가치를 로지스틱 곡선으로 바꾼 evalWin, 흰색 기준이라 흑이면 뒤집는다), MEC 설명 입력(beforeCp), 대안 수
      const ew = result.evalWin, wh = rec.color === "w";
      const wb = Array.isArray(ew) && Number.isFinite(ew[i]) ? (wh ? ew[i] : 100 - ew[i]) : null, wa = Array.isArray(ew) && Number.isFinite(ew[i + 1]) ? (wh ? ew[i + 1] : 100 - ew[i + 1]) : null;
      x.winBefore = r1(wb); x.winAfter = r1(wa); x.beforeCp = Number.isFinite(m.beforeCp) ? m.beforeCp : null; x.alts = cleanAlts(m.alts);
      const hit = cache && cache.get(ckOf(fenBefore, m.san, m.best));
      if (hit) { x.cause = hit[0]; x.detail = hit[1] || null; } else { x.pending = true; x.fenAfter = g.fen(); }
      x.fenBefore = fenBefore;
    }
    mine.push(x);
  }
  const stored = rec.color === "w" ? result.whiteAcc : result.blackAcc;
  const phaseAcc = {}, phaseMoves = {}, phaseBad = {};
  for (const ph of PHASES) {
    const pm = mine.filter((x) => x.phase === ph && x.loss != null);
    phaseMoves[ph] = pm.length; phaseBad[ph] = pm.filter((x) => x.bad).length;
    phaseAcc[ph] = pm.length >= MIN_PHASE_MOVES ? accOf(pm) : null;
  }
  return { key: rec.key, endTime: rec.endTime, owner: rec.owner || null, color: rec.color, white: rec.white, black: rec.black, id: rec.id, opening: rec.opening, mine,
    acc: Number.isFinite(stored) ? stored : accOf(mine), phaseAcc, phaseMoves, phaseBad, sans: result.moves.map((x) => x.san) };
}

/* 아직 원인이 없는(pending) 실수를 가장 최근 판부터 budgetMs 동안 분류해 캐시에 넣는다. 남은 개수를 돌려준다(0이면 끝). windowGames: 원인을 쓰는 최근 판 수. */
export function classifyPending(games, cache, budgetMs = 120, windowGames = HEAVY_GAMES, now = () => Date.now()) {
  const t0 = now(); let left = 0, changed = false;
  const target = games.slice(-windowGames).reverse();
  for (const g of target) {
    for (const x of g.mine) {
      if (!x.pending) continue;
      const ck = ckOf(x.fenBefore, x.san, x.best), hit = cache.get(ck);   // 같은 포지션·수는 한 번만 계산(다른 판에 똑같이 나온 경우 포함)
      if (!hit && now() - t0 >= budgetMs) { left++; continue; }
      const [cause, detail] = hit || classifyBad(x.fenBefore, x.fenAfter, x.san, x.best, x.phase);
      if (!hit) cache.set(ck, [cause, detail]);
      x.cause = cause; x.detail = detail; x.pending = false; delete x.fenAfter; changed = true;
    }
  }
  return { left, changed };
}
/* 이 실수 대신 둘 수 있었던 좋은 수 — 엔진 최선수를 맨 앞에(best: true), 그 뒤로 최선 후보와 승률 차이가 GOOD_ALT_MARGIN 이내인 다른 후보. 각 항목 win은 그 수를 뒀을 때 둔 사람 관점 승률(알면). 옛 결과에는 alts가 없어 최선수만 나온다. */
export function betterMoves(m) {
  const key = (x) => stripSan(x), out = [], seen = new Set([key(m.san)]);
  const alts = (m.alts || []).filter((a) => key(a.san) !== key(m.san));
  if (m.best) { const a = alts.find((x) => key(x.san) === key(m.best)); out.push({ san: m.best, win: a ? a.win : m.winBefore, best: true }); seen.add(key(m.best)); }
  const top = Math.max(m.winBefore == null ? 0 : m.winBefore, ...out.map((o) => (o.win == null ? 0 : o.win)), ...alts.map((a) => a.win));
  for (const a of alts) { if (seen.has(key(a.san)) || a.win < top - GOOD_ALT_MARGIN) continue; out.push({ win: a.win, best: false, san: a.san }); seen.add(key(a.san)); }
  return out;
}

/* 이 원인의 수를 전부 "손실 0·최선"으로 바꿨을 때의 한 판 정확도 — 같은 계산식(accOf)으로 전/후를 비교해 상승폭을 구한다. */
function accIfFixed(game, cause) {
  const fixed = game.mine.map((x) => (x.bad && x.cause === cause ? { ...x, loss: 0, kind: "best" } : x));
  return accOf(fixed);
}

/* games: analyzeGame 결과들(오래된 순). 원인은 분류가 끝난 수만 쓰고, 아직인 수는 pending 개수로 알린다. */
export function buildGrowth(games, { heavyGames = HEAVY_GAMES } = {}) {
  const n = games.length;
  if (!n) return null;
  const accs = games.map((g) => g.acc).filter((x) => x != null);
  // ① 성장 곡선 + 최근 K판 vs 이전 K판(K = min(5, 판 수/2))
  const curve = games.map((g) => ({ key: g.key, endTime: g.endTime, acc: g.acc, game: g }));
  const K = Math.min(5, Math.floor(n / 2));
  const recent = K ? avg(curve.slice(n - K).map((c) => c.acc).filter((x) => x != null)) : null;
  const prevArr = K ? curve.slice(Math.max(0, n - 2 * K), n - K).map((c) => c.acc).filter((x) => x != null) : [];
  const prev = avg(prevArr);
  const trend = { k: K, recent: r1(recent), prev: r1(prev), delta: recent != null && prev != null ? r1(recent - prev) : null };
  // ② 구간 진단
  const phases = PHASES.map((ph) => {
    const gs = games.filter((g) => g.phaseAcc[ph] != null);
    const total = games.reduce((s, g) => s + g.phaseMoves[ph], 0), bad = games.reduce((s, g) => s + g.phaseBad[ph], 0);
    return { key: ph, games: gs.length, acc: r1(avg(gs.map((g) => g.phaseAcc[ph]))), total, bad, badRate: total ? bad / total : null };
  });
  const rankable = phases.filter((p) => p.games >= MIN_PHASE_GAMES && p.acc != null);
  const weakPhase = rankable.length ? rankable.reduce((a, b) => (b.acc < a.acc ? b : a)) : null;
  // ③ 반복되는 실수 원인(원인 분류를 한 판만)
  const heavy = games.slice(-heavyGames);
  const allBad = heavy.flatMap((g) => g.mine.filter((x) => x.bad && !x.pending).map((x) => ({ ...x, game: g })));
  const pending = heavy.reduce((s2, g) => s2 + g.mine.filter((x) => x.pending).length, 0);
  // 실수 기록(오프닝 실수 블록)용 — 원인 분류가 끝나기 전의 수도 포함한다(원인 칩만 나중에 붙는다).
  const badMoves = heavy.flatMap((g) => g.mine.filter((x) => x.bad).map((x) => ({ ...x, game: g })));
  const lossTotal = allBad.reduce((s, x) => s + (x.loss || 0), 0);
  const causes = CAUSES.map((c) => {
    const ms = allBad.filter((x) => x.cause === c), lossSum = ms.reduce((s, x) => s + (x.loss || 0), 0);
    return { key: c, n: ms.length, lossSum: r1(lossSum), share: lossTotal ? lossSum / lossTotal : 0, games: new Set(ms.map((x) => x.game.key)).size, moves: ms };
  }).filter((c) => c.n > 0).sort((a, b) => b.lossSum - a.lossSum);
  // ④ 지금 고칠 한 가지 — 손실 비중이 가장 큰 원인. 판 2개 이상에서 나타난 반복 패턴일 때만(한 판짜리 우연은 말하지 않는다).
  const top = causes.find((c) => c.games >= 2) || null;
  let focus = null;
  if (top) {
    const diffs = heavy.map((g) => { const a0 = accOf(g.mine), a1 = accIfFixed(g, top.key); return a0 != null && a1 != null ? a1 - a0 : null; }).filter((x) => x != null);
    const detail = {}; for (const m of top.moves) if (m.detail) detail[m.detail] = (detail[m.detail] || 0) + 1;
    const topDetail = Object.entries(detail).sort((a, b) => b[1] - a[1])[0];
    const dropOf = (m) => (m.winBefore != null && m.winAfter != null ? Math.max(0, m.winBefore - m.winAfter) : (m.loss || 0));
    const phaseN = {}; for (const m of top.moves) phaseN[m.phase] = (phaseN[m.phase] || 0) + 1;
    const topPhase = Object.entries(phaseN).sort((a, b) => b[1] - a[1])[0];
    const movesTotal = heavy.reduce((s2, g) => s2 + g.mine.filter((x) => x.loss != null).length, 0);
    const drops = top.moves.filter((m) => m.winBefore != null && m.winAfter != null).map(dropOf);
    focus = { cause: top.key, n: top.n, games: top.games, share: top.share, gain: r1(avg(diffs)), detail: topDetail ? topDetail[0] : null,
      avgDrop: drops.length ? r1(avg(drops)) : null, movesTotal, pctOfMoves: movesTotal ? Math.round((100 * top.n) / movesTotal) : null, topPhase: topPhase ? topPhase[0] : null,
      worst: [...top.moves].sort((a, b) => dropOf(b) - dropOf(a))[0] || null, examples: [...top.moves].sort((a, b) => (b.loss || 0) - (a.loss || 0)).slice(0, 2) };
  }
  // ⑤ 수 유형별(내 모든 수, 같은 판 범위)
  const allMine = heavy.flatMap((g) => g.mine.filter((x) => x.loss != null));   // 수 유형은 원인 분류와 무관해 pending이어도 센다
  const row = (key, group, f) => { const ms = allMine.filter(f), bad = ms.filter((x) => x.bad).length; return { key, group, n: ms.length, bad, badRate: ms.length ? bad / ms.length : null, avgLoss: ms.length ? r1(avg(ms.map((x) => x.loss))) : null }; };
  const moveTypes = [
    ...PIECES.map((p) => row(p, "piece", (x) => x.piece === p)),
    ...ACTIONS.map((a) => row(a, "action", (x) => (a === "capture" ? x.capture : a === "check" ? x.check : a === "castle" ? x.castle : x.promotion))),
  ].filter((r) => r.n > 0);
  const weakCands = moveTypes.filter((r) => r.n >= MIN_TYPE_MOVES && r.bad > 0);
  const weakType = weakCands.length ? weakCands.reduce((a, b) => (b.badRate > a.badRate ? b : a)) : null;
  // ⑥ 가장 아쉬웠던 수
  const worst = [...allBad].sort((a, b) => (b.loss || 0) - (a.loss || 0)).slice(0, WORST_COUNT + 2);   // 화면은 "고칠 한 가지" 예시(2개)와 겹치는 수를 빼고 WORST_COUNT개를 보여 주므로 여유분을 둔다
  return { n, avgAcc: r1(avg(accs)), curve, trend, phases, weakPhase, causes, focus, moveTypes, weakType, worst, badMoves, heavyN: heavy.length, badTotal: allBad.length, pending };
}

/* 한 번에 끝까지(검사·스크립트용): 분석 → 남김없이 분류 → 계산. 화면은 이 함수 대신 단계별로 호출한다. */
export function growthFromRecords(records, cache = new Map()) {
  const recs = [...(records || [])].sort((a, b) => (a.endTime || 0) - (b.endTime || 0));
  const games = recs.map((r) => analyzeGame(r, cache)).filter((g) => g && g.mine.length);
  classifyPending(games, cache, Infinity);
  return { games, growth: buildGrowth(games) };
}
