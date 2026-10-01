// (v0.6.0, App.jsx 분할) 'review' 화면과 그 화면만 쓰는 조각
// 동작 변경 없이 App.jsx에서 그대로 옮겼다(REFACTOR_NOTES.md Phase 3 참고).
import { sansToFen, uciToSan, boardFromSans, sanSrc, canMove, applySan, kingPos, isAttacked, hasAnyLegalMove, isInCheck, gameEndState, boardOfRoot, stripSuffix, colorOfRoot, sqName, startBoard, decorateLine, moveNumber, parseFenFull, replayFromFen, plyIsWhite, epTarget, boardToFen, castleRightsStr, fenLegalDests, liveLegalDests, buildSan, pvUciToSans, MAX_SEARCH_DEPTH, fenOfRoot } from "../lib/chessRules.js";
import { seeSquare, canCaptureSquareLegally, VAL, hangingLossSq, lva, newCumulativeAccuracy, matePliesOf, ownPriorMoveWasSacrifice } from "../lib/moveQuality.js";
import React, { useRef, useState, useEffect, useLayoutEffect, useMemo, useContext, useCallback } from "react";
import { T, DRAG_SCROLL_MULT, BOARD_SKINS, boardSquareBg } from "../lib/theme.js";
import { QCOLOR, ANALYSIS_KIND_ROWS } from "../lib/moveKinds.js";
import { motion, AnimatePresence } from "framer-motion";
import { SITE_FONT, EvalBadge, dedupeEngineLines, EvalBar, EngineLines } from "../components/engineLines.jsx";
import { ChevronLeft, ChevronRight, BookOpen, Star, Route, ArrowLeft, Cpu, Share2, ChevronsLeft, ChevronsRight, Send, X, Image as ImageIcon } from "lucide-react";
import { badgeIcon, QLABEL, PendingDots } from "../components/badges.jsx";
import { SB_ON, sbSelect, sbRpc, sbUpsert } from "../lib/supabaseClient.js";
import { SkinContext, PieceGlyph } from "../components/pieces.jsx";
import { reviewIntroLayout, RI } from "../lib/reviewIntroLayout.js";
import { playMoveSfx } from "../lib/prefs.js";
import { SITE_URL } from "../lib/siteConfig.js";
import { loadReviewShareCardAssets, drawReviewShareCardSync } from "../lib/shareCard.js";
import { BoardWithMaterial, CONTENT, CircleBadge, ExternalShareRow, Mascot, PIECE_KOR, REVIEW_DEPTH, REVIEW_MOVETIME_MS, REVIEW_RESULT_CACHE_VERSION, ReviewAvatar, ReviewPromoPrompt, TIME_CLASS_LABEL, analyzeGame, callEvaluateMulti, fetchChesscomProfile, friendEdges, getAnalysisPool, gradeMoveKindConfirmed, hangingPieceArrows, isBookMoveAt, josaGwaWa, mecFacts, mecPick, nameOverride, poolWorker, reviewGameIdentifier, reviewPlayerInfo, reviewShareSend, reviewStorageKey, singleRecaptureCheck, snapNode, useBoardSize, useNarrow, usersProfiles } from "./common.jsx";

import { t, tx } from "../lib/i18n.js";
/* 실수/블런더 이후 N수 응징 라인 생성 (엔진 best 연쇄) */
// (버그 수정) movetime 없이 "go depth 14"만 보내면 워커 큐의 기본 워치독(15000ms)에 걸릴 때까지
// 걸릴 수 있어, 코치 카드에서 이 결과를 기다리는 UI가 몇 초씩(plies가 2면 최악 30초 가까이) 응답이
// 없는 것처럼 보였다("유일한 수" 보강이 안 되는 것처럼 보인 원인 중 하나). 호출부가 movetime을
// 넘기면 그만큼 상한을 걸어 체감 응답 속도를 보장한다(넘기지 않으면 기존과 동일하게 무제한).
// (버그 수정) slot 없이 그냥 큐에 넣기만 하면, 유저가 다음 포지션으로 넘어가 이 호출이 이미
// 쓸모없어져도 아무도 이 진행 중인 요청을 멈추지 않아 워커가 끝까지 다 돌 때까지 큐를 붙잡고
// 있었다 — 같은 워커를 공유하는 진짜 중요한 요청(엔진 라인 스트리밍, slot "review-lines")이 그
// 뒤에서 계속 밀려, 화면에는 "엔진 라인이 끝까지 타이핑되지 않는다"로 보였다(실제로는 라인 자체가
// 아직 서버에서 안 왔을 뿐 — TypedMoveLine은 받은 데이터만큼은 항상 끝까지 타이핑한다). slot을
// 넘기면 같은 slot의 새 호출이 들어올 때 이전 호출을 즉시 중단시켜(supersede) 무한정 큐를 붙잡지
// 않게 한다.
async function genPunishLine(engine, sans, plies = 3, movetime, slot) {
  let cur = sans.slice(); const out = [];
  for (let i = 0; i < plies; i++) {
    const ev = await engine.evaluate(sansToFen(cur), 14, undefined, movetime, slot);
    if (!ev || !ev.best) break;
    const san = uciToSan(boardFromSans(cur), ev.best, cur.length % 2 === 0 ? "w" : "b");
    if (!san) break;
    out.push(san); cur = [...cur, san];
  }
  return out;
}
// (v0.2.2 기능) 탁월한 수의 코치 설명에 "어떤 기물을 희생했는지" 명시하기 위한 헬퍼 — 방금 이동한
// 기물 자신이 그 도착 칸에서 공격받고 있으면(직접 희생) 그 기물을, 그렇지 않으면(다른 기물을 방치한
// "방치 희생") 지금 가장 크게 걸려 있는 기물을 찾아 그 기물의 한글 이름을 반환한다. 언더프로모션 등
// 판정이 애매한 경우에도 항상 방금 둔 기물 이름으로 대체해, 문장이 어색해지지 않게 한다.
function sacrificedPieceKor(sans, san) {
  const color = sans.length % 2 === 0 ? "w" : "b"; const enemy = color === "w" ? "b" : "w";
  const before = boardFromSans(sans); const info = sanSrc(before, san, color);
  if (!info || info.castle) return null;
  const after = boardFromSans([...sans, san]); const [tr, tc] = info.to;
  const mover = after[tr][tc];
  let moverAttacked = false;
  for (let r = 0; r < 8 && !moverAttacked; r++) for (let c = 0; c < 8; c++) { const p = after[r][c]; if (p && p.c === enemy && canMove(after, p.t, enemy, r, c, tr, tc, true)) { moverAttacked = true; break; } }
  if (moverAttacked && mover) return PIECE_KOR[mover.t] || null;
  let best = null, bestLoss = 0;
  for (let r = 0; r < 8; r++) for (let c = 0; c < 8; c++) {
    if (r === tr && c === tc) continue;
    const p = after[r][c]; if (!p || p.c !== color || p.t === "K") continue;
    const gain = seeSquare(after, r, c, enemy);
    if (gain > bestLoss && canCaptureSquareLegally(after, r, c, enemy)) { bestLoss = gain; best = p.t; }
  }
  if (best) return PIECE_KOR[best];
  return mover ? PIECE_KOR[mover.t] : null;
}
// (기능) 탁월한 수의 세 갈래 유형 판정 — isSacrifice가 이미 참으로 확인한 수에 대해서만 호출되므로,
// 그 판정 안의 예외 처리(hasSaferSquare 등)를 다시 반복할 필요 없이 "직접 희생"(움직인 기물 자신이
// 도착 칸에서 순손실을 내는가)과 "방치 희생"(다른 기물을 그대로 걸어 둔 채 더 급한 일을 하는가)을
// 가르는 조건식만 그대로 재사용해 어느 쪽인지 가려낸다. 언더프로모션은 항상 별도 갈래.
function brilliantSubtype(board, sanRaw, color) {
  if (/=/.test(sanRaw) && !/=Q/.test(sanRaw)) return { type: "underpromo" };
  const info = sanSrc(board, sanRaw, color);
  if (!info) return { type: "direct", piece: null };
  const [tr, tc] = info.to;
  const capturedVal = info.isCap ? (board[tr][tc] ? VAL[board[tr][tc].t] : 1) : 0;
  const after = applySan(board, sanRaw, color);
  const enemy = color === "w" ? "b" : "w";
  let oppGain = seeSquare(after, tr, tc, enemy);
  const ekp = kingPos(after, enemy);
  if (oppGain > 0 && ekp && isAttacked(after, ekp[0], ekp[1], color) && !canCaptureSquareLegally(after, tr, tc, enemy)) oppGain = 0;
  const net = capturedVal - oppGain;
  if (!info.castle && info.piece !== "P" && net <= -1) {
    const mover = after[tr][tc];
    // "교환 희생" — 룩으로 상대의 지켜진 나이트·비숍을 그냥 잡아 곧바로 되잡히는, 룩-마이너 교환.
    // 여러 수에 걸친 막연한 "희생"이 아니라 그 자리에서 바로 완결되는 구체적인 교환이므로 별도
    // 갈래로 구분한다.
    const capturedPiece = board[tr][tc];
    if (mover && mover.t === "R" && capturedPiece && (capturedPiece.t === "N" || capturedPiece.t === "B")) {
      return { type: "exchangeSac", give: "R", get: capturedPiece.t };
    }
    return { type: "direct", piece: mover ? mover.t : info.piece };
  }
  const { sq: afterHangSq } = hangingLossSq(after, color, [tr, tc]);
  const hangPiece = afterHangSq ? after[afterHangSq[0]][afterHangSq[1]] : null;
  // "교환 희생"의 방치형 — 내 룩이 상대 나이트·비숍에게 공격당하고 있는데 구하지 않고 다른 급한
  // 일을 해, 그 룩이 마이너 기물과 교환되도록 놔두는 경우도 같은 갈래로 묶는다.
  if (hangPiece && hangPiece.t === "R") {
    const attacker = lva(after, afterHangSq[0], afterHangSq[1], enemy);
    if (attacker && (attacker.t === "N" || attacker.t === "B")) return { type: "exchangeSac", give: "R", get: attacker.t };
  }
  return { type: "neglect", piece: hangPiece ? hangPiece.t : null };
}
// (기능) 언더프로모션이 왜 퀸이 아닌지 — 퀸으로 승진했다면 상대가 둘 수 있는 합법수가 아예 없어져
// 스테일메이트가 되는지(=무승부를 피하려 일부러 덜 강한 기물로 승진), 또는 퀸으로 승진한 자리가
// 바로 잡히는데 실제로 고른 기물의 자리는 안전한지(=잡히지 않기 위한 선택) 두 가지 원인만 실제로
// 국면을 재구성해 확인한다. 둘 다 아니면 원인을 특정하지 않고 null을 돌려준다.
function underpromoReason(board, sanRaw, color) {
  const info = sanSrc(board, sanRaw, color);
  if (!info || !info.promo) return null;
  const enemy = color === "w" ? "b" : "w";
  const [sr, sc] = info.from, [dr, dc] = info.to;
  const qBoard = board.map((row) => row.slice());
  qBoard[dr][dc] = { c: color, t: "Q" }; qBoard[sr][sc] = null;
  if (!hasAnyLegalMove(qBoard, enemy) && !isInCheck(qBoard, enemy)) return "stalemate";
  if (seeSquare(qBoard, dr, dc, enemy) > 0 && canCaptureSquareLegally(qBoard, dr, dc, enemy)) {
    const actual = applySan(board, sanRaw, color);
    if (!(seeSquare(actual, dr, dc, enemy) > 0 && canCaptureSquareLegally(actual, dr, dc, enemy))) return "safety";
  }
  return null;
}
// (기능) 이미 불리하던 상황에서 둔 희생이라면, 같은 자연스러운 응수 흐름을 따라가며 그 안에
// 스테일메이트나 3회 동형 반복으로 실제 무승부가 되는 지점이 있는지 확인한다 — 있다면 "정상적으로
// 두면 계속 밀릴 뿐이라 무승부를 강제해야 했던 수"라는 구체적인 근거가 된다.
async function brilliantDrawSeekLine(engine, sansAfterMove, slot) {
  if (!engine || typeof engine.evaluate !== "function") return null;
  const line = await genPunishLine(engine, sansAfterMove, 8, 900, slot);
  if (!line.length) return null;
  let cur = sansAfterMove.slice();
  for (let i = 0; i < line.length; i++) {
    cur = [...cur, line[i]];
    const end = gameEndState(cur).end;
    if (end === "stalemate" || end === "threefold") return { end, line: line.slice(0, i + 1) };
  }
  return null;
}
// (기능) 탁월한 수 설명 — 먼저 세 유형(직접 희생/방치 희생/언더프로모션) 중 어느 쪽인지 능동적인
// 문장으로 밝힌다. (버그 수정) "기물 점수를 되찾는 수순을 엔진 PV로 찾아 설명"하던 로직은 지웠다 —
// 몇 수 앞선 엔진 PV만으로 실제 회수 여부를 판단하기엔 근거가 얕았고, 대신 지금 상대에게 안전하게
// 잡힐 수 있는 기물 전부를 ReviewPage가 보드 위에 붉은 화살표로 직접 보여준다(hangingPieceArrows).
// 텍스트로는 장기적인 포지션 이득으로 상대의 기물 희생을 강제할 수 있다는 일반적인 근거만 남긴다.
// 이미 불리하던 상황이었다면 무승부를 노린 수인지 먼저 확인해 그쪽을 우선 설명한다. 마지막으로 이
// 수가 엔진의 1순위 수가 아니었다면(notBest) 그 사실도 덧붙인다. 기호는 마침표·쉼표만 쓴다.
async function brilliantExplain(engine, sansBeforeMove, san, color, alreadyLosing, notBest, slot) {
  const board = boardFromSans(sansBeforeMove);
  const sub = brilliantSubtype(board, san, color);
  const sansAfterMove = [...sansBeforeMove, san];
  let typeSentence;
  if (sub.type === "underpromo") {
    const info = sanSrc(board, san, color);
    const promoKor = PIECE_KOR[(info && info.promo) || "N"] || t("기물");
    const reason = underpromoReason(board, san, color);
    if (reason === "stalemate") typeSentence = t("퀸으로 승진하면 스테일메이트(무승부). 대신 {0} 승진", promoKor);
    else if (reason === "safety") typeSentence = t("퀸으로 승진하면 바로 잡힘. {0} 승진은 안전하게 남음", promoKor);
    else typeSentence = t("퀸이 아닌 {0} 승진. 흔치 않은 선택", promoKor);
  } else if (sub.type === "exchangeSac") {
    typeSentence = t("{0:과/와} {1} 교환. 쉽지 않지만 이 상황에선 탁월한 선택", PIECE_KOR[sub.give], PIECE_KOR[sub.get]);
  } else if (sub.type === "neglect" && sub.piece) {
    typeSentence = t("{0} 위협을 무시하고 더 큰 이득을 얻는 수", (PIECE_KOR[sub.piece]));
  } else if (sub.piece) {
    typeSentence = t("{0} 희생. 눈앞의 손해를 감수하고 더 큰 것을 노림", (PIECE_KOR[sub.piece]));
  } else {
    typeSentence = t("눈에 보이는 손해를 감수하고 더 큰 것을 노리는 수");
  }
  let reasonSentence = null;
  if (alreadyLosing) {
    try {
      const drawSeek = await brilliantDrawSeekLine(engine, sansAfterMove, slot);
      if (drawSeek) {
        const endKor = drawSeek.end === "stalemate" ? t("스테일메이트") : t("3회 동형 반복");
        reasonSentence = t("이미 불리한 상황. {0} 수순으로 {1} 무승부를 강제", drawSeek.line.join(" "), endKor);
      }
    } catch { }
  }
  let text = reasonSentence ? typeSentence + ". " + reasonSentence + "." : typeSentence + ".";
  if (notBest) text += t(" 엔진 최선은 아니지만 찾기 어려운 수.");
  return text;
}
// 나쁜 수(실수·블런더·놓친 기회) 다음 상대의 응징 수순 — 새 엔진 로직을 따로 만들지 않고 이미 있는
// genPunishLine(엔진 최선 연쇄 n수)을 그대로 재사용한다. 엔진이 없으면 빈 배열(호출부가 넘기는
// 값은 useEngine 인스턴스뿐 아니라 getAnalysisPool의 워커 래퍼일 수도 있어 status 필드가 없을 수
// 있다 — evaluate 메서드 존재 여부만 확인한다).
async function punishmentFacts(engine, sansAfterMove, plies = 2) {
  if (!engine || typeof engine.evaluate !== "function") return [];
  try { return await genPunishLine(engine, sansAfterMove, plies, 900, "review-punish"); } catch { return []; }
}
// (기능) "유일한 수" 코멘트 보강 — "다른 수는 안 돼요"라고만 말하면 설명력이 없어, 실제 2순위
// 후보를 뒀다면 상대가 어떻게 응징하는지까지 보여준다. 2순위 수의 UCI 자체는 analyzeGame의
// posEval에 저장돼 있지 않아(cp만 보존) 새로 MultiPV-2 평가가 필요하지만, 그다음 응징 라인은
// 새 로직을 만들지 않고 punishmentFacts와 똑같이 genPunishLine을 재사용한다.
async function onlyMoveRefutation(engine, sansBeforeMove, plies = 2, fenRoot) {
  if (!engine || typeof engine.evaluateMulti !== "function") return null;
  try {
    const color = sansBeforeMove.length % 2 === 0 ? "w" : "b";
    const lines = await callEvaluateMulti(engine, sansToFen(sansBeforeMove), 14, 2, 900, "review-only");
    const second = lines && lines[1];
    if (!second || !second.uci) return null;
    const altSan = uciToSan(boardOfRoot(fenRoot, sansBeforeMove), second.uci, color);
    if (!altSan) return null;
    const continuation = await genPunishLine(engine, [...sansBeforeMove, altSan], plies, 900, "review-only");
    if (!continuation.length) return null;
    return { altSan: stripSuffix(altSan), continuation };
  } catch { return null; }
}
// (신규 기능, README v0.4.9 개발자 기록 — "여러 수에 걸친 기물 재배치 계획"은 매 수 엔진을 새로
// 돌려야 해 코치 카드에 자동으로 붙이지 못하고 온디맨드로 남겨 뒀던 항목) 지금 포지션에서 엔진이
// 예상하는 이후 진행(PV)을 그대로 재생하면서, 같은 기물이 두 번 이상(=세 칸 이상 경로) 자리를
// 옮기는 가지를 찾는다 — 여러 수에 걸쳐 목적지로 이동하는 "재배치 계획"의 가장 단순한 정의다.
// PV 안에서 한 번이라도 이런 기물이 있으면 그중 가장 긴 경로를 고른다(여러 후보가 있으면 가장
// 뚜렷한 계획일 가능성이 높다). 캐슬링은 킹·룩 두 기물이 동시에 움직여 "한 기물의 경로"로 보기
// 애매하므로, 그 지점에서 진행 중이던 경로를 끊고 새 경로를 시작하지 않는다.
function relocationPlanFromPv(fenRoot, prevSans, pvSans) {
  let board = boardOfRoot(fenRoot, prevSans);
  let color = colorOfRoot(fenRoot, prevSans.length);
  const paths = new Map(); // 지금 그 기물이 있는 칸("r,c") -> { piece, color, squares:[sqName,...] }
  let best = null;
  for (const san of pvSans) {
    const info = sanSrc(board, san, color);
    if (!info) break;
    if (info.castle) { board = applySan(board, san, color); color = color === "w" ? "b" : "w"; continue; }
    const fromKey = info.from.join(","), toKey = info.to.join(",");
    const prior = paths.get(fromKey);
    const path = prior
      ? { piece: prior.piece, color: prior.color, squares: [...prior.squares, sqName(info.to[0], info.to[1])] }
      : { piece: info.piece, color, squares: [sqName(info.from[0], info.from[1]), sqName(info.to[0], info.to[1])] };
    paths.delete(fromKey);
    paths.set(toKey, path);
    if (path.squares.length >= 3 && (!best || path.squares.length > best.squares.length)) best = path;
    board = applySan(board, san, color);
    color = color === "w" ? "b" : "w";
  }
  return best;
}
function relocationPlanPhrase(plan) {
  return t("{0} 재배치 계획: {1}", (PIECE_KOR[plan.piece] || t("기물")), plan.squares.join(" → "));
}
// (19차 기능3) 평가치 변동 그래프 — 백 승률 시퀀스를 영역으로 채우고 주요 수 위치에 색점 마커.
// (v0.2.1 버그 수정) width="100%"·height="92"(고정 px)를 함께 쓰면, 컴퓨터 환경처럼 실제 렌더 폭이
// viewBox 폭(320)보다 훨씬 넓어질 때 세로만 92px에 고정된 채 가로만 늘어나(preserveAspectRatio="none"
// 이라 강제로 채워짐) 그래프가 넓적하게 찌그러져 보였다 — height를 고정 px 대신 CSS aspectRatio로
// 폭에 비례해 계산되도록 바꿔, 화면 폭과 무관하게 항상 같은 비율(320:92)로 그려지게 한다.
// (v0.2.1 기능) 표시할 원을 고르는 규칙 — 탁월/유일/실수/블런더는 항상, 이론은 마지막 이론 수만,
// 최선/부정확은 같은 등급끼리 최소 3수 간격을 두고(너무 자주 나와 그래프가 원으로 뒤덮이는 것을 방지).
const EVAL_GRAPH_ALWAYS_KINDS = new Set(["brilliant", "only", "mistake", "blunder"]);
const EVAL_GRAPH_SPACED_KINDS = new Set(["best", "inaccuracy"]);
const EVAL_GRAPH_MIN_GAP = 3;
function pickEvalGraphDots(moves) {
  let lastBookPly = -1;
  for (const m of moves) if (m.kind === "book") lastBookPly = m.ply;
  const dots = [];
  const lastShownPly = {};
  for (const m of moves) {
    if (m.kind === "book") { if (m.ply === lastBookPly) dots.push(m); continue; }
    if (EVAL_GRAPH_ALWAYS_KINDS.has(m.kind)) { dots.push(m); continue; }
    if (EVAL_GRAPH_SPACED_KINDS.has(m.kind)) {
      const last = lastShownPly[m.kind];
      if (last == null || m.ply - last >= EVAL_GRAPH_MIN_GAP) { dots.push(m); lastShownPly[m.kind] = m.ply; }
    }
  }
  return dots;
}
// (v0.2.1 기능) curPly/onJump가 있으면 그래프를 클릭·드래그해 그 x좌표에 해당하는 지점으로 리뷰
// 위치를 옮길 수 있다 — 포인터를 누른 채 좌우로 끌면(pointer capture) 그 시점의 평가치가 부드럽게
// 이어서 갱신된다. 마커(점+세로 점선)와 그래프 위 역삼각형은 curPly를 그대로 그리므로, 기보 클릭 등
// 다른 방법으로 위치를 옮겨도 항상 지금 보고 있는 지점에 그대로 따라온다.
function EvalGraph({ evalWin, moves, curPly, onJump }) {
  const W = 320, H = 92; const n = evalWin.length;
  const svgRef = useRef(null);
  const draggingRef = useRef(false);
  if (n < 2) return null;
  const x = (i) => (i / (n - 1)) * W;
  const y = (w) => H - (w / 100) * H;
  const linePts = evalWin.map((w, i) => x(i) + "," + y(w).toFixed(1)).join(" ");
  const areaPts = "0," + H + " " + linePts + " " + W + "," + H;
  const dots = pickEvalGraphDots(moves);
  const jumpToClientX = (clientX) => {
    if (!onJump || !svgRef.current) return;
    const rect = svgRef.current.getBoundingClientRect();
    if (!rect.width) return;
    const relX = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
    onJump(Math.round(relX * (n - 1)));
  };
  // (버그 수정, 사용자 제보) 마우스로 드래그할 때 커서가 빨간 원(not-allowed/no-drop)으로 바뀌며
  // 잘 움직이지 않는 문제 — SVG는 브라우저가 기본적으로 이미지처럼 "드래그해서 옮길 수 있는"
  // 요소로 취급해, preventDefault 없이 그 위를 누른 채 움직이면 우리 Pointer Events 드래그와는
  // 별개로 네이티브 HTML5 드래그(dragstart)가 함께 시작된다 — 이 페이지엔 그 드롭을 받아줄 대상이
  // 없으니 브라우저가 "여긴 놓을 수 없다"는 뜻으로 그 커서를 보여주고, 두 드래그가 뒤섞여 버벅였다.
  // pointerdown에서 preventDefault로 네이티브 드래그·텍스트 선택 제스처 자체를 막고, WebkitUserDrag도
  // none으로 눌러 이중으로 막는다.
  const onPointerDown = (e) => { if (!onJump) return; e.preventDefault(); draggingRef.current = true; try { e.currentTarget.setPointerCapture(e.pointerId); } catch { } jumpToClientX(e.clientX); };
  const onPointerMove = (e) => { if (draggingRef.current) jumpToClientX(e.clientX); };
  const onPointerUp = (e) => { draggingRef.current = false; try { e.currentTarget.releasePointerCapture(e.pointerId); } catch { } };
  const hasMark = curPly != null && curPly >= 0 && curPly < n;
  const markX = hasMark ? x(curPly) : null;
  const markY = hasMark ? y(evalWin[curPly]) : null;
  const markFrac = hasMark ? curPly / (n - 1) : 0;
  return (
    <div style={{ background: "#3B342E", borderRadius: 10, padding: 6, overflow: "hidden" }}>
      <div style={{ position: "relative", touchAction: "none", userSelect: "none", WebkitUserSelect: "none", WebkitUserDrag: "none" }}
        onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={onPointerUp} onPointerCancel={onPointerUp}>
        {/* 그래프 위 역삼각형 — 점선 x좌표와 함께 움직여 지금 보고 있는 지점을 더 또렷이 보여준다. */}
        {hasMark && <div style={{ position: "absolute", top: -1, left: markFrac * 100 + "%", transform: "translateX(-50%)", width: 0, height: 0, borderLeft: "5px solid transparent", borderRight: "5px solid transparent", borderTop: "7px solid #EBCB86", pointerEvents: "none", zIndex: 2 }} />}
        <svg ref={svgRef} viewBox={"0 0 " + W + " " + H} preserveAspectRatio="none" onDragStart={(e) => e.preventDefault()}
          style={{ display: "block", width: "100%", height: "auto", aspectRatio: W + " / " + H, cursor: onJump ? "ew-resize" : "default", WebkitUserDrag: "none" }}>
          <rect x="0" y="0" width={W} height={H} fill="#3B342E" />
          <polygon points={areaPts} fill="#EDE7DC" />
          <polyline points={linePts} fill="none" stroke="#B9B0A4" strokeWidth="1" />
          {/* (사용자 요청) 정중앙(0.0 평가) 점선 — 흰 영역 채우기보다 먼저 그리면 백이 우세한 구간(채우기가
              이 선까지 덮는 구간)에서 가려져 안 보였다. 채우기 뒤(위)에 다시 그려 항상 보이게 하고, 배경
              (어두운 갈색)·채우기(밝은 크림) 양쪽에서 다 눈에 띄도록 진한 황동색을 쓴다. */}
          <line x1="0" y1={H / 2} x2={W} y2={H / 2} stroke={T.brass} strokeWidth="0.9" strokeOpacity="0.65" strokeDasharray="3 3" />
          {dots.map((m) => { const c = QCOLOR[m.kind]; if (!c) return null; const i = m.ply + 1; return <circle key={m.ply} cx={x(i)} cy={y(evalWin[i])} r="3.2" fill={c} stroke="#241509" strokeWidth="0.6" />; })}
          {hasMark && (
            <>
              <line x1={markX} y1="0" x2={markX} y2={H} stroke="#EBCB86" strokeWidth="0.8" strokeDasharray="2.5 2.5" />
              <circle cx={markX} cy={markY} r="3.6" fill="#EBCB86" stroke="#241509" strokeWidth="0.8" />
            </>
          )}
        </svg>
      </div>
    </div>
  );
}
// (v0.2.0) 예전엔 여기서 즉석 분석 모드(AnalysisModal, chess.com 게임 리뷰 레이아웃)를 직접
// 그렸지만, 분석 탭 "분석" 버튼이 이제 같은 정보를 보여주는 전용 /review 페이지로 곧장 넘어가므로
// 이 모달은 완전히 폐기했다. ANALYSIS_KIND_ROWS(lib/moveKinds.js)는 같은 표를 그리는 ReviewKindTable과
// 리뷰 공유 이미지 카드(lib/shareCard.js)가 함께 쓴다.
/* ============================================================ /review 전체화면 게임 리뷰 (v0.2.0) ============================================================
   chess.com의 "Game Review" 페이지(모바일 앱·데스크톱 웹 모두)를 참고한 전용 화면 —
   "요약 → 수순별 코치 리뷰" 순서로 훑어본다. 예전엔 분석 탭 안에 즉석 분석 모달(AnalysisModal)이
   따로 있어 실제로 끝난 대국(승패·플레이어 있음)과 "지금 탐색 중인 임의의 수순"(그런 정보 없음)을
   서로 다른 화면으로 분석했는데, 이제 이 페이지 하나로 통합했다 — game 객체에 result/color/username
   등이 없으면(임의의 수순) 그 항목들만 표시하지 않을 뿐, 나머지 분석(평가치 그래프·수 체계·코치
   코멘트)은 완전히 동일하게 동작한다. */
// 수 등급별 코치 코멘트 — chess.com처럼 "Xx is a Y move" 형식의 헤드라인 + 짧은 설명.
// (설계) chess.com의 실제 코멘트는 그 수의 구체적인 전술적 의미(예: "이 수는 공격받던 기물을
// 지킵니다")까지 자연어로 분석해 주지만, 그 수준의 맥락 분석 엔진은 이 세션 범위를 벗어난다 — 등급별로
// 뜻이 통하는 일반적인 설명 템플릿을 여러 개 두고 ply로 순환시켜, 같은 등급이 반복돼도 문구가 안 겹치게 한다.
const REVIEW_COACH_COPY = {
  brilliant: { head: t(": 탁월한 수"), mascot: ["kokoa", "celebrate"], body: [t("기물을 내주는 위험을 감수했지만 정확히 계산된 최고의 수"), t("찾기 어려운 수를 정확히 찾아냄")] },
  best: { head: t(": 최선의 수"), mascot: ["milku", "great"], body: [t("엔진이 찾은 이 포지션의 가장 좋은 수"), t("정확한 수")] },
  only: { head: t(": 유일한 수"), mascot: ["milku", "surprise"], body: [t("다른 수는 크게 불리. 반드시 이 수"), t("이 수 외엔 답이 없음")] },
  excellent: { head: t(": 우수한 수"), mascot: ["milku", "wink"], body: [t("최선은 아니지만 아주 좋은 선택"), t("이 포지션의 좋은 수 중 하나")] },
  good: { head: t(": 좋은 수"), mascot: ["milku", "great"], body: [t("무난하고 안정적인 수"), t("포지션을 잘 유지하는 수")] },
  book: { head: t(": 이론 수"), mascot: ["milku", "wink"], body: [t("오래 검증된 정석 수"), t("책에 나오는 잘 알려진 수")] },
  inaccuracy: { head: t(": 부정확한 수"), mascot: ["kokoa", "think"], body: [t("더 나은 수가 있음. 큰 손해는 아니지만 아쉬움"), t("포지션이 살짝 나빠짐")] },
  miss: { head: t(" : 기회를 놓침"), mascot: ["kokoa", "surprise"], body: [t("상대 실수를 응징할 기회를 활용하지 못함"), t("더 강한 수가 있었음")] },
  mistake: { head: t(": 실수"), mascot: ["kokoa", "surprise"], body: [t("포지션이 눈에 띄게 나빠짐"), t("더 나은 대안이 있었음")] },
  blunder: { head: t(": 블런더"), mascot: ["kokoa", "angry"], body: [t("크게 불리해짐"), t("포지션이 크게 무너짐")] },
  pending: { head: "", mascot: ["milku", "think"], body: [t("아직 분석되지 않은 수")] },
};
// (기능) MEC(mecFactsArr)·punishLine·brilliantNote·onlyRefutation의 근거를 코멘트에 덧붙인다 —
// Stockfish 등급(m.kind) 자체는 바꾸지 않는다. 정석 수(book)만 제외하고 모든 등급에 적용한다
// (MEC가 이제 "원칙 위반 판정"이 아니라 사실 나열이라 정석 수를 제외한 나머지에는 부담 없이 붙일
// 수 있다 — 자세한 설계는 mecFacts 정의부 주석 참고). 등급별 전용 근거(블런더의 punishLine, 탁월한
// 수의 brilliantNote, 유일한 수의 onlyRefutation)는 그 등급에만 덧붙인다.
function reviewCoachCopy(m, brilliantNote, punishLine, mecFactsArr, onlyRefutation) {
  const c = REVIEW_COACH_COPY[m.kind] || REVIEW_COACH_COPY.good;
  // (기능) 탁월한 수는 brilliantExplain이 만든 하나의 논리적인 글(유형 설명 + 엔진 PV 근거)이
  // 준비되면 일반 문구 대신 그 글을 그대로 보여준다 — 계산 전(엔진 응답 대기 중)에는 기존 기본
  // 문구로 대체해 빈 카드가 보이지 않게 한다.
  let body = (m.kind === "brilliant" && brilliantNote) ? brilliantNote : c.body[m.ply % c.body.length];
  if (m.kind !== "book") {
    const extra = [];
    if (m.kind === "blunder" && punishLine && punishLine.length) extra.push(t("상대 응징 수순: {0}", punishLine.join(" ")));
    // 유일한 수: "다른 수는 안 돼요"로 끝내지 않고, 실제 2순위 후보를 뒀다면 상대가 어떻게
    // 응징하는지(onlyRefutation)까지 — 이게 없으면(엔진 계산 실패 등) 조용히 생략한다.
    if (m.kind === "only" && onlyRefutation) {
      extra.push(t("{0} 등 다른 수는 상대의 {1} 응징으로 불리해짐", onlyRefutation.altSan, onlyRefutation.continuation.join(" ")));
    }
    if (extra.length) body = body + " " + extra.join(" ");
  }
  // (R7 기능) MEC의 마지막 한 줄(mecFactsArr[0])은 body 문자열에 그냥 이어붙이지 않고 mecLine으로
  // 따로 돌려준다 — "위협" 사실이면 ReviewCoachCard가 이 줄만 밑줄+클릭 가능하게 렌더링해서, 눌렀을
  // 때 공격자→수비자 화살표 애니메이션을 재생할 수 있게 하기 위함이다.
  const mecLine = (m.kind !== "book" && mecFactsArr && mecFactsArr.length) ? mecFactsArr[0] : null;
  // (v0.2.1) 마스코트는 등급에 따라 랜덤/고정으로 정하지 않고, 그 수를 둔 진영으로 정한다 —
  // 백이 둔 수는 MILKU, 흑이 둔 수는 KOKOA. 표정(emotion)만 등급별 기본값을 그대로 쓴다.
  const emo = (c.mascot && c.mascot[1]) || "great";
  const name = m.white ? "milku" : "kokoa";
  return { headline: stripSuffix(m.san) + c.head, body, mecLine, mascot: [name, emo] };
}
// (v0.2.1 기능) reviewPlayerInfo의 name은 데이터가 없을 때 "백"/"흑"/"나"/"상대" 같은 표시용 대체
// 문구로 채워지므로, chess.com 아바타를 조회할 진짜 아이디는 이 함수로 따로 뽑는다 — game.white/black에
// 실제 username이 있으면 그걸, 옛 형태(내 진영만 저장된 대국)면 game.username을 쓰고, 그마저 없으면
// (분석 탭 임의 수순 분석) null — 이 경우 아바타 조회 자체를 하지 않는다.
function avatarUsernameFor(game, side) {
  const p = side === "w" ? game.white : game.black;
  if (p && p.username) return p.username;
  if (game.color === side && game.username) return game.username;
  return null;
}
function loadReviewPos(storageKey) {
  if (!storageKey) return null;
  try { const raw = window.sessionStorage.getItem(storageKey); return raw ? JSON.parse(raw) : null; } catch { return null; }
}
// (v0.2.1 기능) 대국 참가자의 chess.com 아바타 — username이 확정된 경우에만 프로필을 조회한다.
// 계정이 없거나(예: 옛날 마스터 대국) 요청이 실패해도 null로 남아 기본 나이트 이미지로 대체된다.
function useChesscomAvatar(username) {
  const [avatar, setAvatar] = useState(null);
  useEffect(() => {
    if (!username) { setAvatar(null); return; }
    let cancelled = false;
    fetchChesscomProfile(username).then((p) => { if (!cancelled) setAvatar((p && p.avatar) || null); }).catch(() => { if (!cancelled) setAvatar(null); });
    return () => { cancelled = true; };
  }, [username]);
  return avatar;
}
// 대국 단계(오프닝/미들게임/엔드게임) 구간 — 오프닝은 시작부터 이어지는 이론 수 구간(없으면 앞 5수),
// 엔드게임은 폰 제외 기물 합산 점수가 처음 14 이하로 떨어지는 지점부터.
function reviewGamePhases(moves) {
  let openEnd = -1;
  for (let i = 0; i < moves.length; i++) { if (moves[i].kind === "book") openEnd = i; else break; }
  if (openEnd < 0) openEnd = Math.min(9, moves.length - 1);
  let board = startBoard(), endStart = moves.length;
  const nonPawnVal = (b) => { let s = 0; for (const row of b) for (const p of row) if (p && p.t !== "P" && p.t !== "K") s += VAL[p.t]; return s; };
  for (let i = 0; i < moves.length; i++) {
    board = applySan(board, moves[i].san, moves[i].white ? "w" : "b");
    if (i > openEnd && nonPawnVal(board) <= 14) { endStart = i + 1; break; }
  }
  return { openEnd, endStart: Math.max(endStart, openEnd + 1) };
}
// 한 단계(구간) 안에서 한쪽 진영이 보여준 가장 인상적인 수 등급 — "이 구간의 하이라이트"를 고른다.
// (v0.2.1) 이론 수(book)는 하이라이트 후보에서 제외 — 단계 아이콘에 이론 수를 표시하지 않기 위함.
const REVIEW_PHASE_PRIORITY = ["brilliant", "only", "best", "excellent", "good", "miss", "inaccuracy", "mistake", "blunder"];
function reviewPhaseHighlight(moves, fromPly, toPly, white) {
  let bestIdx = 999, bestKind = null;
  for (let i = fromPly; i <= toPly && i < moves.length; i++) {
    const m = moves[i]; if (m.white !== white) continue;
    const idx = REVIEW_PHASE_PRIORITY.indexOf(m.kind); if (idx < 0) continue;
    if (idx < bestIdx) { bestIdx = idx; bestKind = m.kind; }
  }
  return bestKind;
}
// (v0.2.1 → v0.3.8 완전 교체) 단계 아이콘(오프닝/미들게임/엔드게임)을 누르면 뜨는 부분 정확도.
// 예전엔 "그 구간(fromPly~toPly)만"의 acc 평균이었지만, 새 정확도 체계는 h(n)이 원래 "대국 시작부터
// n번째 수까지의 누적 정확도"로 정의돼 있어 fromPly는 더 쓰지 않는다 — 예를 들어 "미들게임 정확도"는
// 미들게임 구간만 따로 떼어 잰 값이 아니라 오프닝부터 미들게임 끝까지 누적된 값이다(사용자 설계:
// 대국이 길어질수록 수 하나가 전체 정확도에 미치는 영향이 자연히 옅어지는 게 의도된 동작). "엔드게임
// 정확도"는 그래서 항상 그 진영의 게임 전체 정확도(whiteAcc/blackAcc)와 같아진다.
function reviewPhaseAccuracy(moves, fromPly, toPly, white, sharpOn = true) {
  const losses = [], sharps = [], kinds = [];
  for (let i = 0; i <= toPly && i < moves.length; i++) {
    const m = moves[i]; if (m.white !== white || m.lossWinPct == null) continue;
    losses.push(m.lossWinPct); sharps.push(m.sharp); kinds.push(m.kind);
  }
  return newCumulativeAccuracy(losses, sharps, losses.length, sharpOn, kinds);
}
// (v0.2.1 → v0.3.9 사용자 요청으로 임계값·반영 규칙 재설계) 단계 아이콘의 등급을 그 단계·진영의
// 정확도로 정한다 — 100 이상은 최선의 수, 90~100은 우수한 수, 80~90은 좋은 수, 60~80은 부정확,
// 50~60은 실수, 50 미만은 블런더. highlightKind(reviewPhaseHighlight의 결과)가 그 단계에 실제로
// 탁월한 수·유일한 수가 있었음을 가리키면(REVIEW_PHASE_PRIORITY상 최우선이라 탁월이 있으면 항상
// highlightKind가 "brilliant"로, 없고 유일한 수만 있으면 "only"로 나온다 — 그래서 탁월이 자동으로
// 유일보다 우선한다), 최선/우수/좋음 세 구간에서는 그 특정 아이콘으로 대체해 보여준다(부정확·실수·
// 블런더 구간은 애초에 탁월·유일이 나올 수 없는 손실 크기이므로 반영 대상이 아니다).
function gradeFromAccuracy(acc, highlightKind) {
  if (acc == null) return null;
  const override = (highlightKind === "brilliant" || highlightKind === "only") ? highlightKind : null;
  if (acc >= 100) return override || "best";
  if (acc >= 90) return override || "excellent";
  if (acc >= 80) return override || "good";
  if (acc >= 60) return "inaccuracy";
  if (acc >= 50) return "mistake";
  return "blunder";
}
// 정확성 산출과 동일한 값(analyzeGame의 whiteAcc/blackAcc)을 재사용하고, 여기서는 표시 서식만 맡는다.
// (v0.3.8 기능) layoutId를 주면 framer-motion이 같은 layoutId를 가진 다른 요소(진입 애니메이션의
// 마지막 숫자, ReviewAccuracyRevealAnim 참고)에서 여기로 자리를 이어받는 "공유 요소" 전환을 자동
// 재생한다 — 그 애니메이션이 끝날 때 이 박스로 자연스럽게 이동해 합쳐지는 효과.
function ReviewAccuracyPill({ label, value, hi, layoutId }) {
  return (
    <motion.div layoutId={layoutId} style={{ flex: 1, textAlign: "center" }}>
      <div style={{ fontSize: 11, color: RV.soft, fontWeight: 700, marginBottom: 6 }}>{label}</div>
      <div style={{ fontSize: 24, fontWeight: 800, fontFamily: SITE_FONT, borderRadius: 9, padding: "8px 6px", background: hi ? T.brassHi : RV.panel, color: hi ? "#241509" : RV.text }}>{value != null ? value.toFixed(1) : "—"}</div>
    </motion.div>
  );
}
// (기능) 요약 화면의 수 체계별 개수 표 — ANALYSIS_KIND_ROWS·QCOLOR·CircleBadge를 그대로 재사용해
// AnalysisModal과 동일한 채점 기준을 그대로 보여준다(같은 analyzeGame 결과를 쓰므로 숫자도 항상 일치).
// (v0.2.1) onPick(curPlyTarget)이 있으면 각 개수 숫자를 눌러 그 등급이 처음 두어진 수로 리뷰 화면을
// 이동한다(이론 수는 예외로 가장 마지막에 둔 이론 수로). 그 등급의 수가 0개면 누를 수 없다.
function ReviewKindTable({ moves, showAll = false, onPick }) {
  const countBy = (white, kind) => moves.filter((m) => m.white === white && m.kind === kind).length;
  const pick = (kind, white) => {
    if (!onPick) return;
    const ms = moves.filter((m) => m.white === white && m.kind === kind);
    if (!ms.length) return;
    const m = kind === "book" ? ms[ms.length - 1] : ms[0];
    onPick(m.ply + 1); // curPly = ply+1 (그 수까지 둔 위치)
  };
  const numStyle = (kind, n) => ({ width: 44, textAlign: "center", fontSize: 15, fontWeight: 800, fontFamily: SITE_FONT, color: QCOLOR[kind], background: "none", border: "none", cursor: onPick && n ? "pointer" : "default", padding: 0 });
  return (
    <div style={{ borderTop: "1px solid " + RV.border }}>
      {ANALYSIS_KIND_ROWS.map(([kind, label]) => {
        const w = countBy(true, kind), b = countBy(false, kind);
        if (!showAll && !w && !b) return null;
        return (
          <div key={kind} className="flex items-center" style={{ padding: "8px 2px", borderBottom: "1px solid " + RV.border }}>
            <button onClick={() => pick(kind, true)} className={onPick && w ? "press" : ""} style={numStyle(kind, w)}>{w}</button>
            <span style={{ flex: 1, textAlign: "center", display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 6, fontSize: 12.5, fontWeight: 700, color: RV.text }}><CircleBadge kind={kind} descOnClick />{label}</span>
            <button onClick={() => pick(kind, false)} className={onPick && b ? "press" : ""} style={numStyle(kind, b)}>{b}</button>
          </div>
        );
      })}
    </div>
  );
}
// (v0.3.8 사용자 요청) 단계별 정확도 말풍선 — 아이콘 바로 위에 left:50%로 중앙 정렬해 띄웠는데,
// 이 아이콘들(w/b)이 단계 줄 오른쪽에 나란히 붙어 있어 모바일 화면에서는 말풍선 폭(내용에 따라
// 가변)이 화면 오른쪽 안전 영역을 넘어가 잘려 보였다. 렌더된 실제 폭·위치(getBoundingClientRect)를
// 재서 화면 가장자리를 넘는 만큼만 반대(화면 중앙) 방향으로 밀어 넣고, 말풍선을 가리키는 꼬리
// 화살표는 그 이동분만큼 반대로 보정해 항상 트리거 아이콘의 중앙을 계속 가리키게 한다.
function PhaseAccBubble({ text }) {
  const ref = useRef(null);
  const [shift, setShift] = useState(0);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const margin = 10; // 화면 가장자리로부터의 안전 여백
    const rect = el.getBoundingClientRect();
    let s = 0;
    if (rect.left < margin) s = margin - rect.left;
    else if (rect.right > window.innerWidth - margin) s = (window.innerWidth - margin) - rect.right;
    setShift(s);
  }, [text]);
  return (
    <span ref={ref} style={{ position: "absolute", bottom: 34, left: "50%", transform: "translateX(calc(-50% + " + shift + "px))", whiteSpace: "nowrap", padding: "12px 12px", borderRadius: 8, background: T.brassHi, color: "#241509", fontSize: 11.5, fontWeight: 800, fontFamily: SITE_FONT, boxShadow: "0 6px 14px -5px rgba(0,0,0,.55)", zIndex: 30 }}>
      {text}
      <span style={{ position: "absolute", bottom: -5, left: "calc(50% - " + shift + "px)", transform: "translateX(-50%) rotate(45deg)", width: 9, height: 9, background: T.brassHi }} />
    </span>
  );
}
// (기능) 요약 화면 — chess.com 모바일 앱의 "Game Review" 진입 화면과 동일한 순서(코치 인사말 →
// 평가 그래프 → 플레이어·정확성 → 등급별 개수 → 단계별 하이라이트 → 리뷰 시작)로 구성한다.
// (설계) chess.com의 "Game Rating"(대국 퍼포먼스 레이팅 추정치)은 별도의 통계적 산출 방식이 필요해
// 이 배치에서 근거 없는 숫자를 지어내기보다 생략한다 — 나머지 항목은 전부 analyzeGame의 실제 결과다.
function ReviewSummary({ game, result, onStart, onPickMove, narrow, sharpOn }) {
  const { openEnd, endStart } = useMemo(() => reviewGamePhases(result.moves), [result.moves]);
  // (v0.3.9 기능) 사용자 요청 — 설정 탭의 "포지션 변동성 보정" 토글이 꺼져 있으면, 분석 시점에 저장해 둔
  // result.whiteAcc/blackAcc(항상 보정 켜짐으로 계산됨)를 그대로 쓰지 않고 원본 손실(lossWinPct)·
  // 날카로움(sharp)에서 그 자리에서 다시 계산한다 — 재분석(엔진 재호출) 없이도 토글이 즉시 반영되고,
  // 아래 단계별 정확도(phases)와 항상 같은 계산 경로를 타서 서로 어긋나지 않는다.
  const fullWhiteAcc = useMemo(() => reviewPhaseAccuracy(result.moves, 0, result.moves.length - 1, true, sharpOn), [result.moves, sharpOn]);
  const fullBlackAcc = useMemo(() => reviewPhaseAccuracy(result.moves, 0, result.moves.length - 1, false, sharpOn), [result.moves, sharpOn]);
  const hasEndgame = endStart < result.moves.length;
  const midTo = hasEndgame ? endStart - 1 : result.moves.length - 1;
  const phaseRanges = [
    { label: t("오프닝"), from: 0, to: openEnd },
    { label: t("미들게임"), from: openEnd + 1, to: midTo },
    { label: t("엔드게임"), from: endStart, to: hasEndgame ? result.moves.length - 1 : -1 },
  ];
  const phases = phaseRanges.map((r) => ({
    label: r.label, from: r.from, to: r.to,
    w: r.to >= r.from ? reviewPhaseHighlight(result.moves, r.from, r.to, true) : null,
    b: r.to >= r.from ? reviewPhaseHighlight(result.moves, r.from, r.to, false) : null,
    wAcc: r.to >= r.from ? reviewPhaseAccuracy(result.moves, r.from, r.to, true, sharpOn) : null,
    bAcc: r.to >= r.from ? reviewPhaseAccuracy(result.moves, r.from, r.to, false, sharpOn) : null,
  }));
  // (v0.2.1) 단계 아이콘을 누르면 그 단계·진영의 부분 정확도를 잠깐 보여준다(등급 설명 대신).
  const [accShow, setAccShow] = useState(null); // "라벨:side"
  const won = game.result === "win", lost = game.result === "loss";
  const headline = !game.result ? t("주요 장면 분석") : won ? t("좋은 전술을 찾아낸 대국") : lost ? t("아쉬운 순간이 있는 대국. 놓친 부분 확인") : t("주요 장면 리뷰");
  const whiteInfo = reviewPlayerInfo(game, "w"), blackInfo = reviewPlayerInfo(game, "b");
  const whiteAvatar = useChesscomAvatar(avatarUsernameFor(game, "w"));
  const blackAvatar = useChesscomAvatar(avatarUsernameFor(game, "b"));
  return (
    <div style={{ maxWidth: narrow ? "100%" : 380, margin: narrow ? 0 : "0 auto", padding: narrow ? "0 16px 24px" : 0 }}>
      <div className="flex items-start gap-2" style={{ marginBottom: 14 }}>
        <Mascot name="milku" emotion="great" size={54} />
        <div style={{ background: RV.panel, borderRadius: 12, padding: "10px 13px", fontSize: 12.5, color: RV.text, lineHeight: 1.5 }}>{headline}</div>
      </div>
      <EvalGraph evalWin={result.evalWin} moves={result.moves} />
      <div className="flex items-center justify-between" style={{ margin: "16px 0 8px" }}>
        <span style={{ fontSize: 11, fontWeight: 700, color: RV.soft }}>{t("플레이어")}</span>
      </div>
      <div className="flex items-center" style={{ gap: 10, marginBottom: 16 }}>
        <div style={{ flex: 1, textAlign: "center" }}>
          <div style={{ width: 52, height: 52, margin: "0 auto 6px", borderRadius: 10, overflow: "hidden", border: game.color === "w" ? "2px solid " + T.best : "2px solid transparent" }}><ReviewAvatar src={whiteAvatar} side="w" size={52} /></div>
          <div style={{ fontSize: 12, fontWeight: 700, color: RV.text, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{whiteInfo.name}</div>
          {whiteInfo.rating != null && <div style={{ fontSize: 10.5, color: RV.soft, fontFamily: SITE_FONT }}>{whiteInfo.rating}</div>}
        </div>
        <div style={{ flex: 1, textAlign: "center" }}>
          <div style={{ width: 52, height: 52, margin: "0 auto 6px", borderRadius: 10, overflow: "hidden", border: game.color === "b" ? "2px solid " + T.best : "2px solid transparent" }}><ReviewAvatar src={blackAvatar} side="b" size={52} /></div>
          <div style={{ fontSize: 12, fontWeight: 700, color: RV.text, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{blackInfo.name}</div>
          {blackInfo.rating != null && <div style={{ fontSize: 10.5, color: RV.soft, fontFamily: SITE_FONT }}>{blackInfo.rating}</div>}
        </div>
      </div>
      <div className="flex items-stretch" style={{ gap: 10, marginBottom: 16 }}>
        <ReviewAccuracyPill label={t("정확성")} value={fullWhiteAcc} hi={(fullWhiteAcc || 0) >= (fullBlackAcc || 0)} layoutId="review-acc-w" />
        <ReviewAccuracyPill label={t("정확성")} value={fullBlackAcc} hi={(fullBlackAcc || 0) > (fullWhiteAcc || 0)} layoutId="review-acc-b" />
      </div>
      <ReviewKindTable moves={result.moves} showAll onPick={onPickMove} />
      {/* (v0.2.1) 세 단계(오프닝/미들게임/엔드게임)를 모두 보여준다 — 그 단계에 수가 없으면(예: 엔드게임 미도달)
          아이콘만 감춘다. 아이콘을 누르면 좌측 단계명은 그대로 두고, 그 단계·진영의 부분 정확도를 말풍선으로 띄운다. */}
      <div style={{ padding: "12px 2px", borderBottom: "1px solid " + RV.border }}>
        {phases.map((p) => {
          const phaseBadge = (kind, side, acc) => {
            // 그 진영이 이 단계에서 둔 수가 없으면(정확도 데이터 없음) 아이콘 미표시.
            if (acc == null) return <span style={{ width: 26, height: 26, display: "inline-block" }} />;
            const key = p.label + ":" + side;
            const active = accShow === key;
            return (
              <span style={{ position: "relative", display: "inline-flex", lineHeight: 0 }}>
                <button onClick={() => setAccShow((v) => (v === key ? null : key))} className="press" style={{ border: "none", background: "transparent", padding: 0, cursor: "pointer", lineHeight: 0 }}>
                  {/* (v0.3.9 재설계) 등급은 이제 그 단계·진영의 정확도로 정하고, 그 단계에 탁월한
                      수·유일한 수가 있었으면(kind) 최선/우수/좋음 구간에서만 그 아이콘으로 대체한다. */}
                  <span style={{ pointerEvents: "none" }}><CircleBadge kind={gradeFromAccuracy(acc, kind)} /></span>
                </button>
                {active && <PhaseAccBubble text={t("{0} 정확도 {1}%", (p.label), acc.toFixed(1))} />}
              </span>
            );
          };
          return (
            <div key={p.label} className="flex items-center justify-between" style={{ padding: "6px 0" }}>
              <span style={{ fontSize: 12.5, fontWeight: 700, color: RV.text }}>{p.label}</span>
              <span className="flex items-center gap-3">
                <span>{phaseBadge(p.w, "w", p.wAcc)}</span>
                <span>{phaseBadge(p.b, "b", p.bAcc)}</span>
              </span>
            </div>
          );
        })}
      </div>
      {/* (v0.2.1) 닫기 버튼 삭제 — 이 요약(Analysis) 창을 닫는 건 헤더의 뒤로가기가 담당한다. */}
      <div className="flex flex-col" style={{ gap: 10, marginTop: 16 }}>
        <button onClick={onStart} className="press" style={{ padding: "13px 14px", borderRadius: 10, border: "none", background: "linear-gradient(180deg,#8FB55E,#5C8A52)", color: "#fff", fontWeight: 800, fontSize: 14.5, cursor: "pointer" }}>{t("리뷰 시작")}</button>
      </div>
    </div>
  );
}
// (기능) 모바일용 이동 스트립 — 예전엔 현재 수 주변 5개만 보여주고 좌우 화살표로 한 수씩만 이동할 수
// 있었다. 사용자가 "스크롤해서 빠르게 좌우로 넘기고 싶다"고 요청해, SequenceBar·기보 줄과 같은 방식
// (전체 수순을 한 줄에 다 렌더링 + 포인터 드래그 스크롤, 터치는 overflow-x:auto 네이티브 스크롤이
// 이미 자연스럽게 동작함)으로 다시 만들었다 — 이제 手가 아무리 많아도 스와이프 한 번으로 쭉 넘길 수
// 있다. 현재 수가 바뀌면(버튼 클릭·기보 클릭 등) 그 수가 항상 화면 가운데로 부드럽게 스크롤된다.
// (v0.2.1) 양끝 </> 버튼은 이제 onJump(정확한 ply로 점프, 자유 탐색 초기화)가 아니라 onPrev/onNext
// (보드에서 자유롭게 둔 수가 있으면 그것부터 한 수씩 되돌리는 stepBack/stepForward)로 동작한다 —
// 가운데 기보 항목 클릭은 여전히 onJump로 그 실제 게임 수순 위치로 하드 점프한다.
// (v0.2.1) moves·dotPlies가 주어지면, 그래프에 원이 찍히는 수(dotPlies)만 그 등급 색을 입히고 왼쪽에
// 수 체계 아이콘을 붙인다 — 나머지 수는 평범한 흰 글씨로 둔다(모바일 스트립이 아이콘으로 뒤덮이지 않게).
function ReviewMoveStrip({ sans, moves, dotPlies, curPly, onJump, onPrev, onNext, canPrev, canNext, drawn }) {
  const scrollRef = useRef(null);
  const curRef = useRef(null);
  useEffect(() => {
    const el = scrollRef.current, cur = curRef.current;
    if (!el || !cur) return;
    const target = cur.offsetLeft + cur.offsetWidth / 2 - el.clientWidth / 2;
    el.scrollTo({ left: Math.max(0, target), behavior: "smooth" });
  }, [curPly]);
  // 데스크톱 마우스로도 끌어서 스크롤할 수 있게(터치는 overflow-x:auto 네이티브 스크롤로 이미 동작) —
  // SequenceBar·기보 줄과 동일한 포인터 드래그 스크롤 패턴, 드래그로 실제 스크롤했으면 클릭(점프)을 막는다.
  const dragRef = useRef(null);
  const onPointerDown = (e) => {
    dragRef.current = { x: e.clientX, scrollLeft: scrollRef.current ? scrollRef.current.scrollLeft : 0, moved: false };
    if (e.currentTarget.setPointerCapture) { try { e.currentTarget.setPointerCapture(e.pointerId); } catch { /* noop */ } }
  };
  const onPointerMove = (e) => {
    const d = dragRef.current; if (!d) return;
    const dx = e.clientX - d.x;
    if (Math.abs(dx) > 3) d.moved = true;
    if (scrollRef.current) scrollRef.current.scrollLeft = d.scrollLeft - dx * DRAG_SCROLL_MULT;
  };
  const endDrag = () => { dragRef.current = null; };
  const onClickCapture = (e) => {
    if (dragRef.current && dragRef.current.moved) { e.preventDefault(); e.stopPropagation(); }
    dragRef.current = null;
  };
  return (
    <div className="flex items-center" style={{ gap: 4, padding: "8px 4px" }}>
      <button onClick={onPrev} disabled={!canPrev} aria-label={t("이전 수")} className="press" style={{ width: 30, height: 30, borderRadius: 8, border: "none", background: "transparent", color: canPrev ? RV.text : RV.dim, cursor: canPrev ? "pointer" : "default", flexShrink: 0 }}><ChevronLeft size={18} /></button>
      <div ref={scrollRef} onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={endDrag} onPointerCancel={endDrag} onClickCapture={onClickCapture}
        className="flex items-center no-pan" style={{ gap: 6, flex: 1, minWidth: 0, overflowX: "auto", whiteSpace: "nowrap", WebkitOverflowScrolling: "touch", userSelect: "none", WebkitUserSelect: "none", touchAction: "pan-y", cursor: "grab" }}>
        {sans.map((s, ply) => {
          const isCur = ply === curPly - 1;
          const showNum = ply % 2 === 0;
          const m = moves && moves[ply];
          const isDot = !!(dotPlies && dotPlies.has(ply) && m && QCOLOR[m.kind]);
          const txtColor = isCur ? "#241509" : isDot ? QCOLOR[m.kind] : RV.text;
          return (
            <span key={ply} ref={isCur ? curRef : undefined} className="flex items-center" style={{ gap: 4, flexShrink: 0 }}>
              {showNum && <span style={{ fontSize: 12, color: RV.soft, fontWeight: 700 }}>{ply / 2 + 1}.</span>}
              <button onClick={() => onJump(ply + 1)} className="press" style={{ display: "inline-flex", alignItems: "center", gap: 3, padding: "4px 8px", borderRadius: 6, border: "none", background: isCur ? T.brassHi : "transparent", color: txtColor, fontWeight: (isCur || isDot) ? 800 : 600, fontSize: 13, cursor: "pointer", whiteSpace: "nowrap" }}>{isDot && badgeIcon(m.kind, 13)}{stripSuffix(s)}</button>
            </span>
          );
        })}
        {/* (사용자 요청) 스테일메이트·3회 동형 반복을 별도 알림 박스로 띄우지 않고, 기보 표시 창 맨
            끝에 결과 기호(½-½)만 덧붙인다. */}
        {drawn && <span style={{ fontSize: 13, fontWeight: 800, color: RV.text, padding: "4px 8px", flexShrink: 0 }}>½-½</span>}
      </div>
      <button onClick={onNext} disabled={!canNext} aria-label={t("다음 수")} className="press" style={{ width: 30, height: 30, borderRadius: 8, border: "none", background: "transparent", color: canNext ? RV.text : RV.dim, cursor: canNext ? "pointer" : "default", flexShrink: 0 }}><ChevronRight size={18} /></button>
    </div>
  );
}
// (기능) 데스크톱용 이동 목록 — 번호+백/흑 두 칸짜리 표, 스크롤 가능, 현재 수 강조.
// (v0.2.1) 모든 수 왼쪽에 그 수의 수 체계 아이콘(badgeIcon)을 붙이고, 글씨는 등급 색으로 표시한다.
function ReviewMoveCell({ san, move, active, onClick }) {
  if (san == null) return <span style={{ flex: 1 }} />;
  const kind = move && move.kind;
  return (
    <button onClick={onClick} className="press" style={{ flex: 1, display: "inline-flex", alignItems: "center", gap: 5, textAlign: "left", padding: "6px 8px", border: "none", background: active ? RV.active : "transparent", color: kind && QCOLOR[kind] ? QCOLOR[kind] : RV.text, fontWeight: active ? 800 : 600, cursor: "pointer" }}>
      {kind && QCOLOR[kind] && <span style={{ width: 15, height: 15, flexShrink: 0, display: "inline-flex", alignItems: "center", justifyContent: "center" }}>{badgeIcon(kind, 15)}</span>}
      <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{stripSuffix(san)}</span>
    </button>
  );
}
function ReviewMoveTable({ sans, moves, curPly, onJump, drawn }) {
  const rows = [];
  for (let i = 0; i < sans.length; i += 2) rows.push([i, sans[i], sans[i + 1]]);
  return (
    <div style={{ maxHeight: 220, overflowY: "auto", borderRadius: 8, background: RV.table }}>
      {rows.map(([i, w, b]) => (
        <div key={i} className="flex items-center" style={{ fontSize: 12.5 }}>
          <span style={{ width: 32, padding: "6px 4px", color: RV.dim, fontFamily: SITE_FONT, flexShrink: 0 }}>{i / 2 + 1}.</span>
          <ReviewMoveCell san={w} move={moves[i]} active={curPly === i + 1} onClick={() => onJump(i + 1)} />
          <ReviewMoveCell san={b} move={moves[i + 1]} active={curPly === i + 2} onClick={() => onJump(i + 2)} />
        </div>
      ))}
      {/* (사용자 요청) 스테일메이트·3회 동형 반복을 별도 알림 박스로 띄우지 않고, 기보 표시 창 맨
          끝에 결과 기호(½-½)만 덧붙인다. */}
      {drawn && <div className="flex items-center justify-center" style={{ fontSize: 12.5, fontWeight: 800, color: RV.text, padding: "6px 4px" }}>½-½</div>}
    </div>
  );
}
// (v0.2.1) 예전 Openings 탭 내용(오프닝 이름·해설)을 평가치 그래프 위에 얹는 얇은 배너.
function ReviewOpeningBanner({ text }) {
  if (!text) return null;
  return (
    <div className="flex items-center" style={{ gap: 6, marginBottom: 10, padding: "7px 11px", borderRadius: 9, background: RV.panel, border: "1px solid " + RV.border }}>
      <BookOpen size={13} style={{ color: T.brassHi, flexShrink: 0 }} />
      <span style={{ fontSize: 12, fontWeight: 700, color: RV.text, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{text}</span>
    </div>
  );
}
// (기능) 코치 카드 — 등급 아이콘·헤드라인·평가치 배지·설명, Show(최선수 화살표 토글)·Next(다음 수로) 컨트롤.
// (v0.2.1) 예전엔 Show(화살표)·Best(텍스트로 "최선의 수는 X였어요") 두 버튼이 같은 정보를 서로
// 다른 형태로 중복 노출했다 — chess.com처럼 최선의 수는 보드 위 화살표 하나로만 보여주고, 더 나은
// 수가 없을 때(이미 최선을 뒀을 때)는 Show 자체를 비활성화한다. Retry는 실질적으로 쓰이지 않아 제거했다.
// (기능) 애니메이션이 있는 MEC 문장에서 문장 전체가 아니라 실제 용어(keyword, 예: "위협"·"과보호")
// 하나만 밑줄+클릭 가능하게 렌더링한다. text 안에서 keyword를 찾아 그 부분만 별도 span으로 감싸고
// 클릭 핸들러를 그 span에만 건다 — keyword가 없거나 onClick이 없으면(=애니메이션 없는 일반 사실)
// 그냥 평범한 문단으로 렌더링한다. keyword가 문장 안에 없으면(방어적으로) 역시 평범하게 렌더링한다.
function MecKeywordLine({ text, keyword, onClick, style }) {
  if (!keyword || !onClick) return <p style={style}>{text}</p>;
  const idx = text.indexOf(keyword);
  if (idx < 0) return <p style={style}>{text}</p>;
  const before = text.slice(0, idx), mid = text.slice(idx, idx + keyword.length), after = text.slice(idx + keyword.length);
  return (
    <p style={style}>
      {before}
      <span onClick={onClick} className="press" style={{ textDecoration: "underline", textUnderlineOffset: 3, cursor: "pointer", fontWeight: 700 }}>{mid}</span>
      {after}
    </p>
  );
}
function ReviewCoachCard({ move, evalDisp, brilliantNote, punishLine, mecNotes, onlyRefutation, threatDetail, onThreatClick, preventDetail, onPreventClick, connectDetail, onConnectClick, removeDefenderDetail, onRemoveDefenderClick, mecKeyword, onShowLine, showingLine, onNext, isLast, narrow, onShowPlan, planLoading, planText, canShowPlan }) {
  if (!move) return null;
  const copy = reviewCoachCopy(move, brilliantNote, punishLine, mecNotes, onlyRefutation);
  const [mascotName, mascotEmo] = copy.mascot;
  const hasBetter = !!move.best;
  // (UI) 사용자 요청 — 모바일 리뷰 페이지에서 코치 블록 크기를 조금 줄여, 그 여백으로 평가치
  // 그래프를 리뷰 기보와 엔진 라인 사이에 끼워 넣을 자리를 만든다.
  return (
    <div style={{ background: "linear-gradient(180deg,#3A2516,#241509)", borderRadius: 14, border: "1px solid " + RV.border, overflow: "hidden" }}>
      <div className="flex items-start gap-2" style={{ padding: narrow ? "9px 10px 5px" : "12px 13px 6px" }}>
        <Mascot name={mascotName} emotion={mascotEmo} size={narrow ? 32 : 40} />
        <div style={{ minWidth: 0, flex: 1 }}>
          <div className="flex items-center justify-between" style={{ gap: 8 }}>
            <span className="flex items-center gap-2" style={{ minWidth: 0 }}><CircleBadge kind={move.kind} /><span style={{ fontSize: narrow ? 12.5 : 13.5, fontWeight: 800, color: RV.text, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{copy.headline}</span></span>
            {/* (v0.2.2 기능) 평가치 박스를 흰색/검은색(EvalBadge, 유리한 쪽 색으로 반전)으로 통일 —
                엔진 라인 등 리뷰 페이지 다른 곳의 평가치 표기와 같은 규칙을 쓴다. */}
            {evalDisp && <EvalBadge ev={evalDisp} font={SITE_FONT} />}
          </div>
          <p style={{ fontSize: narrow ? 11 : 12, color: RV.soft, marginTop: 5, lineHeight: 1.4 }}>{copy.body}</p>
          {/* (R7 기능, 예방 수·연결까지 확장) "위협"·"위협 대처"·"과보호"·"예방 수"·"연결"·"중첩"
              사실이면 그 용어(mecKeyword)에만 밑줄 표시 + 클릭 시 애니메이션 재생 — 문장 전체가
              아니라 실제 그 단어를 눌러야만 재생된다(MecKeywordLine). threatDetail/preventDetail/
              connectDetail 중 이 사실이 실제로 채운 것만 클릭 핸들러로 연결한다. */}
          {copy.mecLine && (
            <MecKeywordLine
              text={copy.mecLine}
              keyword={mecKeyword}
              onClick={removeDefenderDetail ? () => onRemoveDefenderClick && onRemoveDefenderClick(removeDefenderDetail)
                : threatDetail ? () => onThreatClick && onThreatClick(threatDetail)
                : preventDetail ? () => onPreventClick && onPreventClick(preventDetail)
                : connectDetail ? () => onConnectClick && onConnectClick(connectDetail)
                : null}
              style={{ fontSize: narrow ? 11 : 12, color: RV.soft, marginTop: 5, lineHeight: 1.4 }}
            />
          )}
          {/* (신규 기능) "재배치 계획" 온디맨드 결과 — 매 수 자동으로 엔진을 돌리기엔 비용이 커서
              버튼을 눌러야만 계산한다(README v0.4.9 개발자 기록에 남겨 뒀던 항목). */}
          {move.kind !== "book" && (planLoading || planText) && (
            <p style={{ fontSize: narrow ? 11 : 12, color: RV.soft, marginTop: 5, lineHeight: 1.4, fontStyle: planLoading ? "italic" : "normal" }}>
              {planLoading ? t("재배치 계획 분석 중…") : planText}
            </p>
          )}
        </div>
      </div>
      <div className="flex items-center" style={{ borderTop: "1px solid " + RV.border, padding: narrow ? "5px 8px" : "8px 10px", gap: 6 }}>
        <button onClick={onShowLine} disabled={!hasBetter} className="press" style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 2, padding: narrow ? "4px 8px" : "6px 10px", borderRadius: 8, border: "none", background: showingLine ? "rgba(255,255,255,.16)" : "transparent", color: hasBetter ? RV.text : RV.dim, cursor: hasBetter ? "pointer" : "default", fontSize: 10 }}><Star size={narrow ? 13 : 16} /> Show</button>
        {onShowPlan && move.kind !== "book" && (
          <button onClick={onShowPlan} disabled={!canShowPlan || planLoading || !!planText} title={t("엔진으로 재배치 계획 찾기")} className="press" style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 2, padding: narrow ? "4px 8px" : "6px 10px", borderRadius: 8, border: "none", background: "transparent", color: canShowPlan ? RV.text : RV.dim, cursor: canShowPlan && !planLoading && !planText ? "pointer" : "default", fontSize: 10 }}>{tx("{0} 계획", <Route size={narrow ? 13 : 16} />)}</button>
        )}
        <button onClick={onNext} className="press" style={{ flex: 1, marginLeft: 4, padding: narrow ? "7px 12px" : "10px 14px", borderRadius: 9, border: "none", background: "linear-gradient(180deg,#8FB55E,#5C8A52)", color: "#fff", fontWeight: 800, fontSize: narrow ? 12.5 : 13.5, cursor: "pointer" }}>{isLast ? t("완료") : "Next"}</button>
      </div>
    </div>
  );
}
// (v0.2.1) /review 전용 색 토큰 — 예전엔 순수 검정(#181818)+흰색이라 사이트의 따뜻한 브라운/크림
// 테마와 이질감이 컸다. 집중분석 오버레이와 같은 어두운 브라운 그러데이션 배경 위에, 아이보리/브라스
// 계열 텍스트·패널로 통일한다.
const RV = {
  bg: "radial-gradient(130% 120% at 50% -10%, #34230F 0%, #150C06 65%)",
  head: "rgba(21,12,6,.92)",
  text: T.ivoryHi,
  soft: "rgba(235,221,196,.72)",
  dim: "rgba(235,221,196,.42)",
  panel: "rgba(255,255,255,.06)",
  border: "rgba(196,154,80,.22)",
  table: "rgba(20,12,6,.4)",
  active: "rgba(236,203,134,.18)",
};
// 로컬(이 기기·브라우저) 캐시 — sessionStorage(탭 닫으면 사라짐)가 아니라 localStorage(브라우저를
// 껐다 켜도 남음)를 쓴다, "다시 열 때마다"라는 신고가 새로고침뿐 아니라 다른 날 다시 들어와도
// 재현되므로. reviewStorageKey와 같은 식별 방식(선수+종료 시각 / id / fenRoot+sans)을 재사용한다.
function reviewResultStorageKey(game) {
  const posKey = reviewStorageKey(game);
  return posKey ? posKey.replace("oc-review-pos:", "oc-review-result:") : null;
}
// (v0.3.9 기능) "더 빠르게"/"더 정확하게"(depth 20/25)가 서로 다른 분석 결과를 만들어내므로, 캐시된
// 결과가 지금 선택된 속도와 다른 depth로 분석된 것이면(예: depth 20으로 캐시돼 있는데 방금 "더
// 정확하게"로 바꿈) 재사용하지 않고 새로 분석한다 — depth는 저장된 값에 함께 실어(`d`) 대조한다.
// (포지션 변동성 보정 on/off는 여기 영향을 안 준다 — 분석 자체가 아니라 이미 저장된 손실·날카로움
// 값을 최종 정확도로 변환하는 단계에서만 갈리므로, 캐시된 원본 그대로 재사용해도 무방하다.)
function loadCachedReviewResult(storageKey, expectedLen, depth) {
  if (!storageKey) return null;
  try {
    const raw = window.localStorage.getItem(storageKey);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || parsed.v !== REVIEW_RESULT_CACHE_VERSION || !parsed.result) return null;
    if (depth != null && parsed.d !== depth) return null;
    if (expectedLen != null && (!parsed.result.moves || parsed.result.moves.length !== expectedLen)) return null;
    return parsed.result;
  } catch { return null; }
}
function saveCachedReviewResult(storageKey, result, depth) {
  if (!storageKey || !result) return;
  try { window.localStorage.setItem(storageKey, JSON.stringify({ v: REVIEW_RESULT_CACHE_VERSION, d: depth, result })); } catch { }
}
// chess.com 대국(game.id 있음)은 크라우드소싱 캐시(reviewed_games, puzzles 테이블과 같은 패턴)에도
// 함께 올려 둔다 — 다른 기기·다른 유저가 같은 대국을 리뷰로 열어도 항상 같은 값을 보게 하기 위함
// (이것도 "재현성" 신고를 해결하는 데 필요하다 — 로컬 캐시만으로는 이 기기에서만 일관될 뿐이다).
async function reviewedAnalysisFetch(ccId, expectedLen, depth) {
  if (!SB_ON || !ccId) return null;
  try {
    const rows = await sbSelect("reviewed_games?cc_id=eq." + ccId + "&select=analysis&limit=1");
    const a = rows && rows[0] ? rows[0].analysis : null;
    if (!a || a.v !== REVIEW_RESULT_CACHE_VERSION || !a.result) return null;
    if (depth != null && a.d !== depth) return null;
    if (expectedLen != null && (!a.result.moves || a.result.moves.length !== expectedLen)) return null;
    return a.result;
  } catch { return null; }
}
async function reviewedAnalysisShare(ccId, result, depth) {
  if (!SB_ON || !ccId || !result) return;
  // (v0.5.7 BUG-023) reviewed_analysis_put RPC로 — 비어 있거나 더 새 버전·더 깊은 분석일 때만 바뀐다.
  const analysis = { v: REVIEW_RESULT_CACHE_VERSION, d: depth, result };
  try { await sbRpc("reviewed_analysis_put", { p_cc_id: Number(ccId), p_analysis: analysis }); }
  catch { try { await sbUpsert("reviewed_games", { cc_id: Number(ccId), analysis }); } catch { } }
}
// (v0.3.5 버그 수정 → 통합) 예전엔 게임 리뷰가 항상 고정된 프로필("full", Stockfish 16)이라 이
// 자리에 전용 훅(useReviewEngine)을 따로 두고 세기까지 사람 최상급 수준으로 제한했다. 사용자 요청으로
// 게임 리뷰도 설정 탭에서 고른 분석 엔진(useEngine(enginePref))을 그대로 쓰도록 통합해, 이 전용
// 훅과 Stockfish 16 프로필 자체를 없앴다 — ReviewPage는 이제 App 루트의 공유 engine을 prop으로
// 받는다(LearnTab·PuzzleTab 등과 동일한 패턴). 실제 계산은 여전히 getAnalysisPool의 풀이 담당한다
// (analyzeGame, 엔진 라인 패널, 수 판정 모두 이 풀을 공유 — 위 analysisPoolCache 주석 참고).
// (v0.2.9 기능 → v0.3.8 전면 개편) 게임 리뷰(analyzeGame)가 도는 동안 보여줄 일러스트 — 예전엔 세
// 장(ilust-5·6·7, MILKU·KOKOA가 체스보드를 사이에 두고 있는 장면들)을 카드 세 칸에 겹쳐서 한 번에
// 보여줬다. 사용자 요청으로 한 번에 한 장만, 카드 테두리·배경 없이(투명 배경) 전체가 잘리지 않게
// (objectFit:contain) 보여주고, 몇 초마다 자연스럽게 좌우로 넘어가는 캐러셀로 바꿨다.
const REVIEW_INTRO_ILLUSTRATIONS = ["/ilust-7-web.webp", "/ilust-6-web.webp", "/ilust-5-web.webp"];
const REVIEW_INTRO_SLIDE_MS = 4200;
// (버그 수정, 사용자 제보) 데스크톱에서도 항상 모바일 크기(maxWidth 420 · height 170) 그대로였다 —
// narrow가 아니면 훨씬 큰 폭·높이를 써 넓은 화면에서 삽화가 상대적으로 너무 작아 보이지 않게 한다.
// (v0.5.7) width/height(px)를 주면 그 크기 그대로 — 리뷰 대기 화면이 뷰포트에 맞춰 계산한 크기(reviewIntroLayout)를 쓴다.
function ReviewIntroCarousel({ narrow = true, width, height }) {
  const [idx, setIdx] = useState(0);
  useEffect(() => {
    const iv = setInterval(() => setIdx((v) => (v + 1) % REVIEW_INTRO_ILLUSTRATIONS.length), REVIEW_INTRO_SLIDE_MS);
    return () => clearInterval(iv);
  }, []);
  return (
    <div style={{ position: "relative", width: width != null ? width : "100%", maxWidth: width != null ? "100%" : (narrow ? 420 : 640), height: height != null ? height : (narrow ? 170 : 260), margin: "0 auto", overflow: "hidden", background: "transparent", flexShrink: 0 }}>
      <AnimatePresence mode="popLayout" initial={false}>
        <motion.img key={idx} src={REVIEW_INTRO_ILLUSTRATIONS[idx]} alt="" draggable={false}
          initial={{ x: 70, opacity: 0 }} animate={{ x: 0, opacity: 1 }} exit={{ x: -70, opacity: 0 }}
          transition={{ duration: 0.75, ease: [0.22, 0.9, 0.32, 1] }}
          style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "contain", background: "transparent" }} />
      </AnimatePresence>
    </div>
  );
}
// ===================== (v0.3.9 신규, 사용자 요청) 리뷰 진입 "빨려들어가는" 체스보드 연출 =====================
// 리뷰 페이지에 처음 들어온 순간(=분석을 기다리는 가장 이른 시점, 아직 그래프에 보여줄 데이터조차
// 없을 수 있는 구간)의 시각적 주의를 끌기 위한 1회성 연출 — 실제 분석 데이터와 무관하게 항상 같은
// 시퀀스로 재생된다: ① 화면 안으로 빨려들어가는 듯한 확대·블러 페이드 인 → ② 빈 체스판 64칸이
// 무작위 순서로 하나씩 나타나며 판이 완성됨 → ③ 그 위에 기물이 줄 단위로(폰 줄 먼저, 그다음 기물
// 줄) 백은 a→h, 흑은 h→a — 서로 반대 방향에서 한 칸씩 채워짐 → ④ 이 대국의 실제 PGN 수순이 보드
// 위에서 빠르게 재생되다 마지막 몇 수만 정상 속도로 느려짐. 끝나면 onDone.
const REVIEW_BOARD_INTRO_SUCK_MS = 550;
// (사용자 재요청) 칸이 깔리는 속도를 더 빠르게 — 간격·팝인 시간을 모두 줄인다(64칸 전체가 예전
// 약 660ms에서 약 320ms 안팎으로 채워진다).
const REVIEW_BOARD_INTRO_SQUARE_STAGGER_MS = 4;
const REVIEW_BOARD_INTRO_SQUARE_POP_MS = 150;
const REVIEW_BOARD_INTRO_PIECE_STAGGER_MS = 42;
const REVIEW_BOARD_INTRO_ROW_GAP_MS = 160;
const REVIEW_BOARD_INTRO_REPLAY_FAST_MS = 42;
const REVIEW_BOARD_INTRO_REPLAY_SLOW_MS = 420;
const REVIEW_BOARD_INTRO_REPLAY_RAMP = 6; // 마지막 이만큼의 수에 걸쳐 느려진다
// (사용자 재요청) "기물들이 너무 빠르게 움직여 정신없다" — PGN 전체를 다 재생하는 대신 앞부분
// REPLAY_HEAD수만 재생하고, 대국이 충분히 길면(HEAD+TAIL보다 길면) 그 뒤 중간 부분은 통째로
// 건너뛰어(한 번에 점프) 마지막 REPLAY_TAIL수부터 다시 이어 재생한다 — 그 안에서 마지막
// REPLAY_RAMP수만 정상 속도로 느려지는 기존 규칙은 그대로 유지된다.
const REVIEW_BOARD_INTRO_REPLAY_HEAD = 4;
const REVIEW_BOARD_INTRO_REPLAY_TAIL = 10;
const REVIEW_BOARD_INTRO_REPLAY_JUMP_MS = 260; // 중간을 건너뛴 직후 눈에 띄도록 살짝 더 머무는 시간
const REVIEW_BOARD_INTRO_HOLD_MS = 260;   // 다 끝난 뒤 사라지기 전 짧게 멈추는 시간
function ReviewBoardIntroAnim({ sans, onDone }) {
  const skCtx = useContext(SkinContext);
  const sk = BOARD_SKINS[skCtx.boardSkin] || BOARD_SKINS.classic;
  const onDoneRef = useRef(onDone);
  onDoneRef.current = onDone;
  // 컨테이너 실제 렌더 폭을 재서 기물 크기(px)를 계산한다 — PieceGlyph는 숫자(px) size만 받는다.
  const wrapRef = useRef(null);
  const [boardPx, setBoardPx] = useState(300);
  useEffect(() => {
    const measure = () => { const el = wrapRef.current; if (el && el.clientWidth) setBoardPx(el.clientWidth); };
    measure();
    const ro = typeof ResizeObserver !== "undefined" ? new ResizeObserver(measure) : null;
    if (ro && wrapRef.current) ro.observe(wrapRef.current);
    window.addEventListener("resize", measure);
    return () => { if (ro) ro.disconnect(); window.removeEventListener("resize", measure); };
  }, []);
  const cellPx = boardPx / 8;
  // 64칸이 나타나는 무작위 순서 — 마운트 시 한 번만 섞는다. squareOrder[r*8+c] = 그 칸이 몇 번째로 나타나는지.
  const squareOrder = useMemo(() => {
    const idx = Array.from({ length: 64 }, (_, i) => i);
    for (let i = idx.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1));[idx[i], idx[j]] = [idx[j], idx[i]]; }
    const rank = new Array(64);
    idx.forEach((sq, order) => { rank[sq] = order; });
    return rank;
  }, []);
  const [stage, setStage] = useState("suck"); // suck → squares → pieces → replay → hold
  const [squaresShown, setSquaresShown] = useState(0); // 0~64
  const [pawnsShown, setPawnsShown] = useState(0);     // 0~8 (백·흑 동시에, 서로 반대 방향으로 채워짐)
  const [piecesShown, setPiecesShown] = useState(0);   // 0~8
  const [replayPly, setReplayPly] = useState(0);       // 0~sans.length
  useEffect(() => { const id = setTimeout(() => setStage("squares"), REVIEW_BOARD_INTRO_SUCK_MS); return () => clearTimeout(id); }, []);
  useEffect(() => {
    if (stage !== "squares") return;
    let i = 0;
    const iv = setInterval(() => {
      i++; setSquaresShown(i);
      if (i >= 64) { clearInterval(iv); setTimeout(() => setStage("pieces"), 120); }
    }, REVIEW_BOARD_INTRO_SQUARE_STAGGER_MS);
    return () => clearInterval(iv);
  }, [stage]);
  useEffect(() => {
    if (stage !== "pieces") return;
    let i = 0;
    const iv = setInterval(() => {
      i++; setPawnsShown(i);
      if (i >= 8) {
        clearInterval(iv);
        setTimeout(() => {
          let j = 0;
          const iv2 = setInterval(() => {
            j++; setPiecesShown(j);
            if (j >= 8) { clearInterval(iv2); setTimeout(() => setStage("replay"), 150); }
          }, REVIEW_BOARD_INTRO_PIECE_STAGGER_MS);
        }, REVIEW_BOARD_INTRO_ROW_GAP_MS);
      }
    }, REVIEW_BOARD_INTRO_PIECE_STAGGER_MS);
    return () => clearInterval(iv);
  }, [stage]);
  // (사용자 요청) PGN을 처음엔 빠르게, 점점 느려지다가 마지막 몇 수만 정상 속도로 재생한다 —
  // 대부분은 고정된 빠른 간격으로 진행하고, 끝나기 REVEAL_BOARD_INTRO_REPLAY_RAMP수 전부터만 그
  // 간격을 정상 속도까지 선형으로 늘린다.
  useEffect(() => {
    if (stage !== "replay") return;
    const total = sans.length;
    if (total === 0) { setStage("hold"); return; }
    // (사용자 재요청) 대국이 HEAD+TAIL수보다 길면 앞부분 HEAD수만 재생하고 중간은 통째로 건너뛴다.
    const needsJump = total > REVIEW_BOARD_INTRO_REPLAY_HEAD + REVIEW_BOARD_INTRO_REPLAY_TAIL;
    const tailStart = needsJump ? total - REVIEW_BOARD_INTRO_REPLAY_TAIL : 0;
    let cancelled = false, timer = null;
    function step(i) {
      if (cancelled) return;
      setReplayPly(i);
      if (i >= total) { timer = setTimeout(() => { if (!cancelled) setStage("hold"); }, 200); return; }
      let nextI = i + 1, delay = REVIEW_BOARD_INTRO_REPLAY_FAST_MS;
      if (needsJump && i === REVIEW_BOARD_INTRO_REPLAY_HEAD) {
        // 중간 구간(HEAD~tailStart)을 재생하지 않고 한 번에 건너뛴다.
        nextI = tailStart;
        delay = REVIEW_BOARD_INTRO_REPLAY_JUMP_MS;
      } else {
        const rampStart = Math.max(0, total - REVIEW_BOARD_INTRO_REPLAY_RAMP);
        if (i >= rampStart) {
          const t = (i - rampStart + 1) / (total - rampStart);
          delay = REVIEW_BOARD_INTRO_REPLAY_FAST_MS + (REVIEW_BOARD_INTRO_REPLAY_SLOW_MS - REVIEW_BOARD_INTRO_REPLAY_FAST_MS) * t;
        }
      }
      timer = setTimeout(() => step(nextI), delay);
    }
    timer = setTimeout(() => step(1), REVIEW_BOARD_INTRO_REPLAY_FAST_MS);
    return () => { cancelled = true; clearTimeout(timer); };
  }, [stage, sans]);
  useEffect(() => {
    if (stage !== "hold") return;
    const id = setTimeout(() => onDoneRef.current && onDoneRef.current(), REVIEW_BOARD_INTRO_HOLD_MS);
    return () => clearTimeout(id);
  }, [stage]);
  const { board, lastMoveInfo } = useMemo(() => {
    if (stage !== "replay" && stage !== "hold") return { board: startBoard(), lastMoveInfo: null };
    let b = startBoard(), last = null;
    for (let i = 0; i < replayPly; i++) {
      const color = i % 2 === 0 ? "w" : "b";
      last = sanSrc(b, sans[i], color);
      b = applySan(b, sans[i], color);
    }
    return { board: b, lastMoveInfo: last };
  }, [stage, replayPly, sans]);
  // (사용자 요청) 백은 a→h(왼→오), 흑은 h→a(오→왼) — "서로 반대 방향에서부터 한 개씩 등장".
  const pieceVisible = (r, c) => {
    if (stage === "replay" || stage === "hold") return true;
    if (stage !== "pieces") return false;
    const isWhite = r >= 6, isBlack = r <= 1;
    if (!isWhite && !isBlack) return false;
    const colIdx = isWhite ? c : (7 - c);
    const isPawnRow = r === 6 || r === 1;
    return colIdx < (isPawnRow ? pawnsShown : piecesShown);
  };
  return (
    <motion.div
      initial={{ opacity: 0, scale: 2.4, filter: "blur(14px)" }}
      animate={{ opacity: 1, scale: 1, filter: "blur(0px)" }}
      exit={{ opacity: 0, scale: 0.92, transition: { duration: 0.35, ease: "easeIn" } }}
      transition={{ duration: REVIEW_BOARD_INTRO_SUCK_MS / 1000, ease: [0.16, 1, 0.3, 1] }}
      style={{ position: "absolute", inset: 0, zIndex: 60, display: "flex", alignItems: "center", justifyContent: "center", background: "radial-gradient(120% 120% at 50% 50%, #241509 0%, #150C06 70%)" }}>
      {/* (사용자 재요청) "애니메이션도 전체 화면으로" — 예전 340px 상한은 데스크톱에서 화면 대비
          너무 작아 보였다. 정사각형은 유지하되(체스판이라 반드시 1:1), 가로·세로 중 더 좁은 쪽
          기준으로 화면을 거의 꽉 채우도록 vw·vh를 함께 쓴다. */}
      <div ref={wrapRef} style={{ width: "min(92vw, 86vh, 760px)", aspectRatio: "1 / 1", position: "relative", borderRadius: 6, overflow: "hidden", boxShadow: "0 12px 40px -8px rgba(0,0,0,.7), 0 0 0 1px #000" }}>
        <div style={{ position: "absolute", inset: 0, display: "grid", gridTemplateColumns: "repeat(8,1fr)", gridTemplateRows: "repeat(8,1fr)" }}>
          {Array.from({ length: 8 }, (_, r) => Array.from({ length: 8 }, (_, c) => {
            const sqIdx = r * 8 + c;
            const order = squareOrder[sqIdx];
            const light = (r + c) % 2 === 0;
            const shown = stage !== "suck" && (stage !== "squares" || order < squaresShown);
            const p = board[r][c];
            const showPiece = shown && p && pieceVisible(r, c);
            const isFrom = lastMoveInfo && lastMoveInfo.from && lastMoveInfo.from[0] === r && lastMoveInfo.from[1] === c;
            const isTo = lastMoveInfo && lastMoveInfo.to && lastMoveInfo.to[0] === r && lastMoveInfo.to[1] === c;
            // (버그 방지) 이 바깥 칸 자체에는 배경을 미리 깔지 않는다 — 배경을 여기서부터 항상
            // 보여주면 안쪽 motion.div의 opacity 애니메이션과 무관하게 칸이 처음부터 다 보이는 꼴이
            // 돼(둘 다 같은 색이라 구분이 안 됨) "무작위로 하나씩 나타나는" 연출 자체가 무력화된다 —
            // 실제로 보이는 배경은 오직 안쪽 motion.div 하나뿐이어야 한다.
            return (
              <div key={sqIdx} style={{ position: "relative", minWidth: 0, minHeight: 0 }}>
                <motion.div initial={false} animate={{ opacity: shown ? 1 : 0, scale: shown ? 1 : 0.4 }}
                  transition={{ duration: REVIEW_BOARD_INTRO_SQUARE_POP_MS / 1000, ease: [0.34, 1.4, 0.64, 1] }}
                  style={{ position: "absolute", inset: 0, ...boardSquareBg(sk, light, r, c) }} />
                {(isFrom || isTo) && <div style={{ position: "absolute", inset: 0, background: isTo ? "rgba(196,154,80,.45)" : "rgba(196,154,80,.28)", pointerEvents: "none" }} />}
                {showPiece && (
                  // (성능·연출) key를 replayPly까지 포함시키면 이 칸에 그대로 머문 기물까지 매 수마다
                  // 다시 마운트돼(빠른 구간에선 32개 가까운 기물이 42ms마다 동시에) 팝인 애니메이션이
                  // 매번 다시 재생되며 매우 번잡하고 무거워진다 — 칸·기물 종류·색만으로 키를 잡아,
                  // 실제로 그 칸에 "새로" 나타난(비어 있다가 채워진) 기물만 팝인이 재생되게 한다.
                  <motion.div key={sqIdx + ":" + p.t + ":" + p.c}
                    initial={{ opacity: 0, scale: 0.3 }} animate={{ opacity: 1, scale: 1 }}
                    transition={{ duration: 0.16, ease: [0.34, 1.56, 0.64, 1] }}
                    style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center" }}>
                    <PieceGlyph type={p.t} color={p.c} size={cellPx * 0.72} pieceSkin={skCtx.pieceSkin} />
                  </motion.div>
                )}
              </div>
            );
          }))}
        </div>
      </div>
    </motion.div>
  );
}
// ===================== (v0.3.8 4차 개편) 리뷰 진입 애니메이션 — 정확도 공개 시퀀스 =====================
// (사용자 피드백) 3차 개편에서 EvalGraph를 그대로 재사용했는데, 그건 "이미 다 있는 값을 그대로
// 넘기는" 정적 재사용이라(padding된 뒷부분이 평평한 값으로 즉시 다 보임) 진짜 "그려지는" 느낌이
// 없었다. 이번엔 EvalGraph와 같은 배색·비율은 유지하되 이 컴포넌트 전용으로 직접 그린다 — 아직
// 채점되지 않은 구간은 값을 추측해 평평하게 잇지 않고 그냥 검은 여백으로 두고, 이미 지나간 구간만
// 아래쪽을 흰색으로 채운다. 그 경계(진행 지점)는 실제 분석 속도에 그대로 매이지 않고 별도의
// requestAnimationFrame 루프로 일정한 속도(REVEAL_SPEED_PER_PLY_SEC)로 전진한다 — 다만 "아직
// 채점되지 않은 지점"을 앞지르지는 못하게 그 지점(target)에서 멈춰 기다린다. 그래서 수가 한꺼번에
// 여러 개 채점돼 도착해도(빠른 포지션들이 몰려 끝났을 때 등) 화면은 절대 순간이동하듯 확 그려지지
// 않고, 항상 같은 속도로 채워지는 것처럼 보인다.
function buildRevealData(result, sharpOn = true) {
  if (!result) return { moves: [], evalWin: [50, 50], wCurve: [100], bCurve: [100], wMoves: [], bMoves: [], moveMeta: [] };
  const { moves, evalWin } = result;
  // 진영별 구간 누적 정확도 곡선(기존과 동일, App.jsx 앞부분 "독립 정확도 체계" 참고) — 그 김에 그
  // 수 하나가 누적 정확도를 얼마나 올렸는지/내렸는지(delta)도 함께 기록해 둔다. moveMeta[i]는
  // moves[i]와 1:1 대응 — ply(=i+1의 x좌표), 최선수 기준 평가(gVal, 흐릿한 점의 y좌표), delta(그
  // 수 하나가 그 진영의 누적 정확도에 미친 영향, 부호 있음)를 담는다.
  const wLoss = [], wSharp = [], bLoss = [], bSharp = [], wKind = [], bKind = [];
  const wCurve = [100], bCurve = [100];
  // (사용자 요청) 정확도 그래프에 수마다 원 마커(그 수의 등급 아이콘)를 찍고, 그래프 선 구간도 그
  // 등급 색으로 칠하려면 wCurve[i+1]·bCurve[i+1]이 어느 move 레퍼런스와 짝인지 알아야 한다 —
  // wCurve/bCurve와 정확히 같은 시점에 같은 조건으로 push해 always 1:1 대응이 되게 한다.
  const wMoves = [], bMoves = [];
  const moveMeta = [];
  for (let i = 0; i < moves.length; i++) {
    const m = moves[i];
    if (m.lossWinPct == null) { moveMeta.push(null); continue; }
    // gVal = 이 수를 두기 전 최선수 기준 평가(백 관점 승률%) — f(evalWin[i+1])에 이 수의 손실을 그
    // 수를 둔 진영 기준 부호로 되돌려 더한다(흑의 손실은 백 관점으로는 그만큼의 이득으로 보인다).
    const gVal = evalWin[i + 1] + (m.white ? 1 : -1) * m.lossWinPct;
    let delta;
    if (m.white) { wLoss.push(m.lossWinPct); wSharp.push(m.sharp); wKind.push(m.kind); const prev = wCurve[wCurve.length - 1]; const next = newCumulativeAccuracy(wLoss, wSharp, wLoss.length, sharpOn, wKind); wCurve.push(next); wMoves.push(m); delta = next - prev; }
    else { bLoss.push(m.lossWinPct); bSharp.push(m.sharp); bKind.push(m.kind); const prev = bCurve[bCurve.length - 1]; const next = newCumulativeAccuracy(bLoss, bSharp, bLoss.length, sharpOn, bKind); bCurve.push(next); bMoves.push(m); delta = next - prev; }
    moveMeta.push({ ply: i + 1, gVal, delta, white: m.white });
  }
  return { moves, evalWin, wCurve, bCurve, wMoves, bMoves, moveMeta };
}
// 진영 하나의 구간 누적 정확도 곡선을 그리는 작은 스파크라인 — 지금까지 채점된 만큼만 그린다. 투명 배경.
// (사용자 요청, v0.3.9) 세로 격자 하한선을 기존 60보다 훨씬 좁은 95에서 시작해 작은 변화도 더 잘
// 보이게 하고, 정확도가 그 하한선 밑으로 떨어지면 예전처럼(60→0으로) 한 번에 확 넓히는 대신 딱
// 필요한 만큼만 "조금씩"(rAF 기반 시간비례 감쇠) 낮춘다 — 반대로 회복되면 다시 95로 조금씩
// 좁혀진다. low 자체가 매 프레임 목표값에 다가가는 연속값이라 격자선·눈금 숫자도 함께 부드럽게
// 움직인다(숫자는 반올림해서 보여준다).
// (사용자 요청) big — 모바일에서 백/흑 그래프를 각각 다른 줄에 더 크게 보여줄 때 쓰는 확대 모드.
// 비율(W2:H2)만 낮춰(더 납작하지 않게) 세로로 키우고, 그 안의 격자 숫자·선 굵기도 함께 키운다.
// (사용자 요청, v0.3.9) moves — 그 진영이 둔 순서대로의 move 레퍼런스(buildRevealData의 wMoves/
// bMoves). 수 하나마다 원 마커를 찍고 그 수의 등급(kind) 아이콘을 pop-in 애니메이션으로 채워
// 넣으며, 그래프 선 구간 자체도 각 수의 등급 색(QCOLOR)으로 칠한다 — 등급이 없는(있을 수 없지만
// 방어적으로) 구간만 기존 중립색(color)으로 그린다.
// (성능, 사용자 요청 — 렌더링 부하 최적화) 부모(ReviewAccuracyRevealAnim)는 위쪽 평가치 그래프의
// 펜 보간을 위해 progress를 초당 약 30회 갱신한다 — React.memo 없이는 그때마다 이 컴포넌트(SVG
// 마커·눈금 여러 개를 다시 그리는, 두 번 렌더링되는 무거운 쪽)까지 매번 통째로 다시 렌더링됐다.
// 이 컴포넌트가 실제로 받는 값(shownCount·accValue 등)은 floored가 정수 칸을 넘어갈 때만 바뀌므로
// (progress의 소수부 변화와는 무관), React.memo로 얕은 비교를 걸어 그 사이의 낭비 렌더링을 없앤다.
// (v0.5.7, 사용자 요청 "리뷰 진입 화면이 뷰포트에 한 번에 안 보인다") pxW·pxH를 주면 그래프 상자를 그 픽셀 크기로 그리고 viewBox도
// 픽셀 단위로 맞춘다 — 예전엔 320×108 viewBox를 preserveAspectRatio:none으로 상자 폭에 늘려, 넓은 화면일수록 눈금 글자가 옆으로 늘어났다.
const MiniAccCurve = React.memo(function MiniAccCurve({ curve, shownCount, moves, color, label, big, accValue, layoutId, calculatingSan, toast, pxW, pxH }) {
  const total = curve.length - 1; // 그 진영이 실제로 둔 수 개수
  const pxMode = !!(pxW && pxH);
  const W2 = pxMode ? pxW : 320, H2 = pxMode ? pxH : (big ? 108 : 46);
  // (v0.3.9 사용자 요청) 등급 아이콘(원 마커)이 그래프 위아래 끝에서 잘리던 문제 — 마커는 고정 픽셀
  // 크기(dotBox)의 HTML 오버레이라, 위아래 여백(PAD)이 마커 반지름보다 작으면 값이 최고/최저 근처일
  // 때 컨테이너의 overflow:hidden에 마커 절반이 잘렸다. dotBox 반지름 이상의 여백을 확보하도록 PAD를
  // 키우고, 컨테이너 자체 높이도 조금 늘려 픽셀 단위 여유를 추가로 더한다.
  const PAD = pxMode ? Math.min(18, Math.round(pxH * 0.17)) : (big ? 18 : 10);
  const boxHeight = pxMode ? pxH : (big ? 116 : 50);
  // (사용자 요청, v0.3.9) 예전엔 수가 몇 개든 항상 고정폭(W2) 안에 눌러 담아(i/total*W2) 그려서, 수가
  // 많은 대국일수록 수 아이콘들이 다닥다닥 겹쳐 보였다 — 대신 수 하나당 항상 같은 간격(SPACING)을 주는
  // "가상 캔버스"(contentWidth = 수 개수 × SPACING)에 그리고, 실제로 보이는 영역(W2 폭의 뷰포트)은 그
  // 위를 좌우로 훑는 창(viewBox의 min-x만 이동)으로 구현한다 — 카메라가 목표를 따라가되 양 끝에서는
  // 더 못 가게 막히는(clamp) 흔한 패턴과 같다: 그려진 마지막 점이 뷰포트 중앙에 오도록 카메라를 옮기되
  // (① 대국 초반 — 아직 다 그리지 않아 중앙까지 못 왔으면 카메라는 원점에 그대로, 그래서 "왼쪽부터
  // 오른쪽으로 그려 나가는" 것처럼 보인다), 그 이동량을 [0, contentWidth-W2] 사이로 눌러 담는다(②
  // 카메라가 이미 오른쪽 끝까지 다 밀렸으면 더는 따라가지 못하고 마지막 점이 그대로 오른쪽 끝을 향해
  // 다가가며 찍힌다 — 그래서 "전체 그래프의 끝부분이 영역의 오른쪽 끝에 그려지는" 결과가 된다). 수가
  // 적어 contentWidth가 W2보다 작으면 클램프 상한이 0이 되어 카메라가 아예 안 움직이고(예전처럼 그냥
  // 왼쪽부터 채워짐), 화면이 스크롤되는 건 실제로 다 못 담을 만큼 수가 많을 때뿐이다.
  // (사용자 요청) 뷰포트(W2=320) 안에 한 번에 보이는 아이콘 수를 기존보다 약 2개 줄인다 — 간격을
  // 넓혀 W2/SPACING(한 화면에 들어오는 개수)이 그만큼 줄어들게 한다.
  const SPACING = pxMode ? 42 : (big ? 37 : 26);
  // (사용자 요청) 오른쪽에도 여유 공간을 둬 마지막 수의 아이콘이 우하단 정확도 숫자·그래프 오른쪽
  // 끝과 겹치지 않게 한다 — contentWidth에 여백 하나를 더해 두면, 대국이 다 끝나 카메라가 오른쪽
  // 끝까지 밀렸을 때도 마지막 점 뒤로 이 여백만큼 빈 공간이 항상 남는다. (재요청으로 더 늘림)
  const RIGHT_MARGIN = pxMode ? 52 : (big ? 46 : 36);
  const contentWidth = Math.max(W2, total * SPACING + RIGHT_MARGIN);
  const xx = (i) => i * SPACING;
  const pts = curve.slice(0, Math.max(1, shownCount + 1));
  const rightmostX = xx(pts.length - 1);
  const maxOffset = Math.max(0, contentWidth - W2);
  const offset = Math.max(0, Math.min(maxOffset, rightmostX - W2 / 2));
  const curVal = pts.length ? pts[pts.length - 1] : 100;
  const curValRef = useRef(curVal);
  curValRef.current = curVal;
  const [low, setLow] = useState(95);
  const lowRef = useRef(95);
  useEffect(() => {
    let raf, lastTs = null;
    function tick(ts) {
      if (lastTs == null) lastTs = ts;
      const dt = Math.min(0.1, (ts - lastTs) / 1000);
      lastTs = ts;
      const cv = curValRef.current;
      // (버그 수정) 목표를 "지금 하한선(lowRef)보다 낮은가"로 판단하면, lowRef 자신이 낮아지는
      // 도중에 cv를 다시 추월해버려 목표가 95↔낮은값 사이를 왔다갔다 진동하다 cv 바로 밑에서
      // 멈춰버렸다(여유 없이 딱 붙어버림). 대신 항상 고정된 기준(기본 하한선 95)만 보고 목표를
      // 정한다 — 95 이상이면 목표 95, 미만이면 그 값을 5 단위로 살짝 여유 있게 담을 수 있는 값.
      const target = cv >= 95 ? 95 : Math.max(0, Math.floor((cv - 5) / 5) * 5);
      const decay = 1 - Math.pow(0.001, dt); // 초당 약 99.9% 수렴 — 프레임 속도와 무관하게 일정한 속도
      lowRef.current += (target - lowRef.current) * Math.min(1, decay);
      if (Math.abs(lowRef.current - target) < 0.05) lowRef.current = target;
      setLow(lowRef.current);
      raf = requestAnimationFrame(tick);
    }
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, []);
  const high = 100;
  const yy = (v) => PAD + (H2 - PAD * 2) - (Math.max(low, Math.min(high, v)) - low) / (high - low) * (H2 - PAD * 2);
  // (버그 수정) 처음엔 원 자체를 작게(지름 8~11px) 잡았는데, 그 안에 들어가는 등급 아이콘(PNG,
  // 세부 형태가 있는 이미지)이 그 크기에서는 뭉개져 하얀 얼룩처럼만 보이고 무슨 아이콘인지 전혀
  // 알아볼 수 없었다 — 이 앱 다른 곳에서 이미 등급 아이콘을 쓰는 최소 크기(11~15px, badgeIcon 호출부
  // 참고)에 맞춰 원 자체를 그만큼 키운다.
  const dotBox = big ? 24 : 14;
  const dotIconSize = dotBox - (big ? 4 : 3);
  return (
    <div>
      <div style={{ fontSize: pxMode ? 13.5 : (big ? 15 : 10.5), lineHeight: pxMode ? "17px" : undefined, fontWeight: 700, color: RV.soft, marginBottom: 3, fontFamily: SITE_FONT }}>{label}</div>
      <div style={{ position: "relative", width: pxMode ? pxW : "100%", maxWidth: "100%", height: boxHeight, overflow: "hidden", margin: pxMode ? "0 auto" : undefined }}>
        {/* (v0.3.9 기능) viewBox의 min-x를 offset만큼 옮겨 가상 캔버스(폭 contentWidth) 중 W2폭짜리
            창만 보여준다 — 배경·격자선은 항상 전체 캔버스(contentWidth)를 채워 어느 위치로 창이
            옮겨가도 잘리지 않게 하고, 눈금 숫자만 창의 왼쪽 끝(offset+2)에 계속 붙어 있도록 한다. */}
        <svg viewBox={offset.toFixed(1) + " 0 " + W2 + " " + H2} preserveAspectRatio="none" style={{ display: "block", width: "100%", height: "100%", background: "transparent" }}>
          <rect x="0" y="0" width={contentWidth} height={H2} rx="6" fill="rgba(255,255,255,.05)" />
          {/* (사용자 요청) 축 눈금 숫자를 더 크고 잘 보이게 — 글자 크기·불투명도·굵기를 모두 올렸다. */}
          {[low, high].map((g, gi) => (
            <React.Fragment key={gi}>
              <line x1="0" y1={yy(g).toFixed(1)} x2={contentWidth} y2={yy(g).toFixed(1)} stroke="rgba(235,221,196,.2)" strokeWidth="0.6" strokeDasharray="2 2" />
              <text x={(offset + 2).toFixed(1)} y={(g === high ? yy(g) + 9 : yy(g) - 2.5).toFixed(1)} fontSize={big ? 11.5 : 7.5} fontWeight="800" fill="rgba(235,221,196,.85)" fontFamily={SITE_FONT}>{Math.round(g)}</text>
            </React.Fragment>
          ))}
          {/* (사용자 요청) 그래프 선을 구간(수)마다 나눠 그려, 각 구간이 그 수의 등급 색을 그대로
              띠도록 한다 — 굵기도 기존보다 더 굵게(1.8/2.4 → 2.6/3.4) 잡아 색이 잘 보이게 했다. */}
          {pts.length >= 2 && pts.slice(1).map((v, idx) => {
            const i = idx + 1;
            const mv = moves && moves[idx];
            const segColor = (mv && QCOLOR[mv.kind]) || color;
            return <line key={i} x1={xx(i - 1).toFixed(1)} y1={yy(pts[idx]).toFixed(1)} x2={xx(i).toFixed(1)} y2={yy(v).toFixed(1)} stroke={segColor} strokeWidth={big ? 4 : 2.6} strokeLinecap="round" />;
          })}
        </svg>
        {/* (사용자 요청) 수마다 원 마커를 찍고, 그 안에 그 수의 등급 아이콘을 pop-in 애니메이션으로
            채워 넣는다 — SVG 안에 raster 아이콘을 끼워 넣는 대신(비율이 왜곡되기 쉬움) 같은 박스
            위에 겹친 일반 HTML 오버레이로 그려 아이콘이 항상 또렷하게 보이게 한다. 좌표는 SVG
            viewBox 비율(%) 그대로 써서 반응형 크기 변화에도 항상 그래프 선과 정확히 맞아떨어진다.
            shownCount가 늘어날 때마다 그 수의 마커가 처음 마운트되므로, 애니메이션은 그 순간 자연히
            한 번만 재생된다(typoLetters 등과 같은 패턴). */}
        {pts.length >= 2 && pts.slice(1).map((v, idx) => {
          const i = idx + 1;
          const mv = moves && moves[idx];
          const c = mv && QCOLOR[mv.kind];
          if (!c) return null;
          return (
            <div key={i} style={{
              position: "absolute", left: ((xx(i) - offset) / W2 * 100) + "%", top: (yy(v) / H2 * 100) + "%",
              width: dotBox, height: dotBox, borderRadius: "50%", background: c,
              border: "1.5px solid #241509", boxShadow: "0 1px 3px rgba(0,0,0,.4)",
              display: "flex", alignItems: "center", justifyContent: "center",
              transform: "translate(-50%,-50%) scale(0)", opacity: 0,
              animation: "miniAccDotPop .35s cubic-bezier(.34,1.56,.64,1) forwards",
            }}>{badgeIcon(mv.kind, dotIconSize)}</div>
          );
        })}
        {/* (사용자 요청) 정확도 숫자를 그래프 아래 별도 줄이 아니라 그래프 안쪽 우하단으로 옮긴다 —
            layoutId는 그대로 유지해 ReviewSummary의 ReviewAccuracyPill로 이어지는 공유 요소 전환이
            깨지지 않게 한다. (재요청) 수 아이콘과 겹치지 않도록 글자 크기를 더 줄이고 %를 붙인다. */}
        {accValue != null && (
          <motion.div layoutId={layoutId} style={{ position: "absolute", right: 6, bottom: 3, fontSize: big ? 12 : 9.5, fontWeight: 800, fontFamily: SITE_FONT, color: T.ivoryHi, textShadow: "0 1px 3px rgba(0,0,0,.6)", pointerEvents: "none" }}>
            {accValue.toFixed(1)}%
          </motion.div>
        )}
        {/* (사용자 요청) 수 체계 아이콘이 확정될 때마다 "n.SAN : 등급"을 잠깐 띄운다 — 등급 아이콘을
            글자 왼쪽에 함께 보여준다. */}
        <AnimatePresence>
          {toast && (
            <motion.div key={toast.id} initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={{ duration: 0.15 }}
              style={{ position: "absolute", top: 4, left: "50%", transform: "translateX(-50%)", display: "flex", alignItems: "center", gap: 4, background: "rgba(20,16,12,.82)", borderRadius: 6, padding: "2px 7px", fontSize: big ? 10.5 : 9, fontWeight: 800, fontFamily: SITE_FONT, color: T.ivoryHi, whiteSpace: "nowrap", pointerEvents: "none", boxShadow: "0 2px 6px rgba(0,0,0,.4)" }}>
              {badgeIcon(toast.kind, big ? 13 : 11)}
              <span>{toast.label} : {QLABEL[toast.kind] || toast.kind}</span>
              {/* (버그 수정) 정확도 증감 팝업을 이 토스트 안으로 합쳐, 정확도 숫자(우하단)와 서로
                  다른 좌표계에서 겹칠 일이 없게 한다. */}
              {toast.delta != null && (
                <span style={{ color: toast.delta >= 0 ? T.good : T.blunder }}>{(toast.delta >= 0 ? "+" : "") + toast.delta.toFixed(1) + "%"}</span>
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </div>
      {/* (사용자 요청) "n.SAN을 분석 중입니다..."는 그래프 컨테이너(overflow:hidden) 안이 아니라
          바깥에 별도 줄로 표시한다 — 그래프 안쪽 요소와 겹치거나 잘릴 걱정 없이 항상 온전히 보인다. */}
      {/* (v0.5.7) px 모드에선 이 줄 자리를 늘 비워 둔다 — 문구가 떴다 사라질 때마다 아래 요소가 들썩이지 않게(높이는 reviewIntroLayout이 셈한 값). */}
      {(calculatingSan || pxMode) && (
        <div style={{ marginTop: 3, height: pxMode ? 14 : undefined, lineHeight: pxMode ? "14px" : undefined, fontSize: big ? 10.5 : 9, fontWeight: 700, fontFamily: SITE_FONT, color: RV.soft, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
          {calculatingSan ? t("{0}분석 중…", (calculatingSan)) : ""}
        </div>
      )}
    </div>
  );
});
// (v0.3.9 재설계, 사용자 재요청) "처음엔 너무 오래 멈춰 있다가, 막상 재생될 땐 너무 빨라서 눈으로
// 못 따라간다" — 고정 속도 하나로는 "평소엔 한 수씩 눈에 잘 들어오게 느긋하면서, 밀린 수를 몰아
// 보여줄 땐 답답하지 않은" 두 요구를 동시에 만족할 수 없었다. 대신 탄력적인 속도를 쓴다 — 밀린 수
// (backlog = 이미 채점됐지만 아직 화면에 못 보여준 수)가 거의 없는 평소에는 느긋한 기본 속도
// (REVEAL_BASE_STEP_MS)로 한 수씩 여유 있게 보여주고, backlog가 쌓일수록 점점 빨라져 최댓값
// (REVEAL_BACKLOG_FULL_SPEED개 이상)에서 가장 빠른 속도(REVEAL_MIN_STEP_MS)까지 좁혀진다.
// 평소보다 느긋한 기본 속도 덕분에 채점이 여유 있게 앞서갈 때는 자연히 backlog가 미리 쌓이고
// ("버퍼"), 그 버퍼가 있는 동안은 중간에 어느 한 포지션이 느려져 채점이 잠깐 멈춰도 그 버퍼를
// 소비하며 화면은 계속 흘러간다 — 완전히 막을 수는 없지만(버퍼가 다 소진되면 여전히 기다려야
// 한다), 훨씬 자주 자연스럽게 흡수된다. 대국 맨 처음(아직 버퍼가 쌓일 시간이 없었을 때) 첫 몇 수가
// 한꺼번에 채점 완료돼 있으면 backlog가 커서 이 속도가 저절로 빨라지므로, 초반도 더 빠르게 재생된다.
// (사용자 요청) 진행 속도를 기존의 약 0.8배로 낮춘다(= 한 수당 머무는 시간을 1/0.8=1.25배로 늘림).
const REVEAL_BASE_STEP_MS = 275;
const REVEAL_MIN_STEP_MS = 112;
const REVEAL_BACKLOG_FULL_SPEED = 9;
const REVEAL_HOLD_MS = 900;       // 그래프가 다 그려지고 분석도 끝난 뒤 다음 화면으로 넘어가기 전 잠깐 멈추는 시간
// (v0.3.9 사용자 요청) visible — 체스보드 진입 연출(ReviewBoardIntroAnim)이 이 그래프를 전체
// 덮개로 가리고 있는 동안은 false로 넘어온다. 실제 채점 데이터(result/moves 등)는 그 뒤에서도
// analyzeGame이 계속 흘려보내므로 계산(useMemo derive) 자체는 항상 그대로 하되, 시청자가 볼 수
// 없는 동안 아무도 안 보는 SVG·MiniAccCurve를 애써 60fps로 다시 그리는 건 순수한 낭비라 — 아래
// 리빌 펜(rAF 틱 루프) 자체를 visible이 될 때까지 아예 시작하지 않는다. false인 동안 progress는
// 0에 그대로 머물고, visible이 true가 되는 순간 이 시점까지 실제로 쌓여 있던 채점 결과(target)를
// 그대로 반영해 새로 리빌이 시작된다 — "사용자가 실제로 볼 수 있을 때부터 애니메이션이 시작"됨과
// 동시에, 이미 쌓인 만큼은 기존의 밀린 만큼 빨라지는 속도 조절이 자연스럽게 처리한다.
// (v0.5.7, 사용자 요청 "정확도 그래프 화면이 뷰포트에 한 번에 안 보인다 — 모바일·데스크톱 비율에 맞게 다시") 리뷰 대기 화면의 배치를
// 실제로 쓸 수 있는 영역(w×h, 헤더 아래)에서 계산한다 — 예전엔 삽화 170/260px·그래프 116px처럼 고정 크기를 위에서부터 쌓아, 폰에선
// 아래 진행 막대가 화면 밖으로 밀렸고 데스크톱에선 가운데 한 줄로 길게 내려가 양옆이 비었다.
//  · 가로가 넉넉한 가로형(폭 760 이상, 가로/세로 1.15 이상): 왼쪽 열에 삽화·상태 문구·진행 막대, 오른쪽 열에 평가치 그래프와 백·흑 정확도
//    그래프를 세로로 — 오른쪽 열 높이를 뷰포트 높이에 맞춰 나눈다.
//  · 세로형(폰·좁은 창): 한 열. 삽화가 남는 높이를 흡수하는 유일한 가변 요소라, 공간이 모자라면 삽화부터 줄이고(최소 96px), 그래도
//    모자라면 그래프를 정해진 하한까지 줄인 뒤 마지막으로 삽화를 숨긴다 — 그래프·진행 상황은 항상 한 화면에 다 보인다.
// 계산은 순수 함수(src/lib/reviewIntroLayout.js)라 scripts/check-review-intro-layout.mjs가 여러 화면 크기에서 "합이 영역을 넘지 않는지"를 검사한다.
// 배치 계산(RI·reviewIntroLayout)은 src/lib/reviewIntroLayout.js에 있다.
// 요소의 실제 크기(px) — 리뷰 대기 화면이 헤더 아래 남은 영역을 재는 데 쓴다.
function useElementBox() {
  const [box, setBox] = useState(null);
  const roRef = useRef(null);
  const ref = useCallback((el) => {
    if (roRef.current) { roRef.current.disconnect(); roRef.current = null; }
    if (!el) return;
    const measure = () => { const r = el.getBoundingClientRect(); setBox((p) => (p && Math.abs(p.w - r.width) < 1 && Math.abs(p.h - r.height) < 1 ? p : { w: r.width, h: r.height })); };
    measure();
    if (typeof ResizeObserver !== "undefined") { roRef.current = new ResizeObserver(measure); roRef.current.observe(el); }
  }, []);
  useEffect(() => () => { if (roRef.current) roRef.current.disconnect(); }, []);
  return [box, ref];
}
function ReviewAccuracyRevealAnim({ result, resultDone, totalPlies, instant, onDone, narrow, sharpOn, sans, startWhite = true, visible = true, progressPct = 0 }) {
  const [box, boxRef] = useElementBox();
  const data = useMemo(() => buildRevealData(result, sharpOn), [result, sharpOn]);
  const { moves, evalWin, wCurve, bCurve, wMoves, bMoves, moveMeta } = data;
  // (사용자 요청) 아직 채점되지 않은 다음 수의 SAN을 "분석 중입니다..."로 보여주려면, 채점 여부와
  // 무관하게 그 대국의 실제 수순 전체(진영별로 나눔)를 알아야 한다 — decorateLine은 analyzeGame이
  // 채점 결과에 쓰는 것과 똑같은 체크(+)/체크메이트(#) 보정을 미리 적용해 표기가 어긋나지 않게 한다.
  const startColor = startWhite ? "w" : "b";
  const colorSans = useMemo(() => {
    const dec = decorateLine(sans || []);
    const w = [], b = [];
    for (let i = 0; i < dec.length; i++) ((i % 2 === 0) === startWhite ? w : b).push({ ply: i, san: dec[i] });
    return { w, b };
  }, [sans, startWhite]);
  const N = Math.max(1, totalPlies || moves.length || 1);
  // (v0.3.9 재설계, 사용자 요청) 예전엔 실제 분석 속도와 무관하게 항상 고정 속도(REVEAL_SPEED_PER_SEC)로
  // 전진하는 펜이었다 — 그러다 보니 엔진 부팅·초반의 느린 포지션 때문에 채점이 실제로는 이미 끝나
  // 있어도 펜이 그 자리에 닿기까지 계속 기다려야 해 화면이 오래 정지해 지루해 보였다("초기 계산에
  // 너무 많은 시간이 걸려서 지루해진다"는 제보). 이제는 채점이 끝난 수는 "즉시" 보여주되(펜이 목표를
  // 넘어설 수는 없으므로 여전히 target 이내로 제한됨), 한 수를 보여준 뒤에는 REVEAL_MIN_STEP_MS만큼은
  // 반드시 머물러(다음 수의 아이콘이 뜨기 전까지 넘어가지 않음) 각 수가 사람 눈에 들어올 최소한의
  // 시간을 보장한다 — 대기 중(target에 아직 못 미침)에는 다음 칸 문턱(.9) 앞에서 부드럽게 멈춘
  // 것처럼 보이다가, 그 수가 채점되는 순간(다음 rAF 틱 안에) 곧장 다음 칸으로 넘어간다.
  const [progress, setProgress] = useState(0);
  const targetRef = useRef(0);
  useEffect(() => { targetRef.current = Math.min(moves.length, N); }, [moves.length, N]);
  useEffect(() => {
    if (!visible) return; // 가려져 있는 동안은 rAF 루프 자체를 아예 시작하지 않는다.
    let raf;
    let curFloored = 0;
    let lastStepTs = null;
    let lastRenderTs = 0;
    function tick(ts) {
      if (lastStepTs == null) lastStepTs = ts;
      const target = targetRef.current;
      // (사용자 재요청) 밀린 수(backlog)가 많을수록 한 수당 머무는 시간을 REVEAL_BASE_STEP_MS에서
      // REVEAL_MIN_STEP_MS까지 선형으로 좁힌다 — 위 상수 선언부 주석 참고.
      const backlog = Math.max(0, target - curFloored);
      const stepMs = REVEAL_BASE_STEP_MS - (REVEAL_BASE_STEP_MS - REVEAL_MIN_STEP_MS) * Math.min(1, backlog / REVEAL_BACKLOG_FULL_SPEED);
      let stepped = false;
      if (curFloored < target && ts - lastStepTs >= stepMs) {
        curFloored += 1;
        lastStepTs = ts;
        stepped = true;
      }
      const elapsed = ts - lastStepTs;
      const frac = curFloored < target ? Math.min(0.9, elapsed / stepMs) : 0;
      // (사용자 요청) "애니메이션이 부드럽게 재생되도록" — 대기 없이 채점된 수가 연달아 밀려 있으면
      // (밀린 만큼 빠르게 따라잡는 동안) 매 프레임(60fps)마다 이 무거운 컴포넌트(SVG 두 개 +
      // MiniAccCurve 두 개)가 통째로 다시 렌더링돼, 특히 느린 기기에서 그 구간만 뚝뚝 끊겨(jank)
      // 오히려 "군데군데 멈추는" 것처럼 보일 수 있었다. 실제로 새 수가 드러나는 순간(stepped)은
      // 지연 없이 즉시 반영하고, 그 사이를 이어주는 미세한 보간(frac)만 초당 약 30회로 줄인다 —
      // 사람 눈에는 여전히 매끄러워 보이면서 렌더링 부하는 절반 가까이 준다.
      if (stepped || ts - lastRenderTs >= 33) {
        lastRenderTs = ts;
        setProgress(curFloored + frac);
      }
      raf = requestAnimationFrame(tick);
    }
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [visible]);
  const floored = Math.min(N, Math.floor(progress));
  // (버그 수정, 사용자 재보고) "정확도 증감 텍스트가 수 아이콘 등장 속도를 못 따라잡고 밀려서,
  // 그래프는 멈춰 있는데 밀린 토스트가 뒤늦게 연달아 표시된다" — 예전엔 토스트를 큐에 쌓아 두고
  // REVEAL_POPUP_STAGGER_MS(480ms) 간격으로 하나씩 순서대로 재생했는데, 수 아이콘 자체는 그보다
  // 훨씬 빠른 REVEAL_MIN_STEP_MS(130ms)마다 나타날 수 있어 큐가 항상 더 느리게 밀렸다 — 그래프(펜)가
  // 이미 멈춘 뒤에도 큐는 계속 밀린 항목을 하나씩 재생해, "그래프는 정지, 토스트만 뒤늦게 줄줄이"라는
  // 어긋난 모습으로 보였다. 큐/재생 타이머를 아예 없애고, 그때그때 "이 진영이 지금까지 확정된 수 중
  // 가장 최근 것"을 곧장 그 값으로 보여주는 순수 파생값으로 바꾼다 — floored가 실제로 전진할 때만
  // (즉 그래프가 실제로 움직일 때만) 값이 바뀌므로 구조적으로 밀릴 수가 없다. 이전엔 550ms 후 자동
  // 사라졌지만, 이제는 다음 수가 확정될 때까지(또는 대기 중이면 계속) 그대로 떠 있는다 — 자동으로
  // 사라지게 하려던 타이머 자체가 "따라잡지 못해 밀리는" 여지였으므로 아예 없앤다.
  const wLastIdx = useMemo(() => {
    for (let i = Math.min(floored, moves.length) - 1; i >= 0; i--) if (moves[i].white && moves[i].kind && moves[i].kind !== "pending") return i;
    return -1;
  }, [floored, moves]);
  const bLastIdx = useMemo(() => {
    for (let i = Math.min(floored, moves.length) - 1; i >= 0; i--) if (!moves[i].white && moves[i].kind && moves[i].kind !== "pending") return i;
    return -1;
  }, [floored, moves]);
  // (사용자 요청) SAN 앞에 수 번호를 붙이고, 정확도 증감(delta)은 더 이상 절댓값 0.5%p 문턱으로
  // 거르지 않고 항상 함께 표시한다 — 평가치 그래프 쪽 델타 팝업은 완전히 없앴으므로 이 토스트가
  // 유일한 델타 표시처가 됐다.
  const wToast = useMemo(() => {
    if (wLastIdx < 0) return null;
    const mv = moves[wLastIdx], meta = moveMeta[wLastIdx];
    return { id: wLastIdx, label: moveNumber(mv.ply, startColor) + mv.san, kind: mv.kind, delta: meta ? meta.delta : null };
  }, [wLastIdx, moves, moveMeta, startColor]);
  const bToast = useMemo(() => {
    if (bLastIdx < 0) return null;
    const mv = moves[bLastIdx], meta = moveMeta[bLastIdx];
    return { id: bLastIdx, label: moveNumber(mv.ply, startColor) + mv.san, kind: mv.kind, delta: meta ? meta.delta : null };
  }, [bLastIdx, moves, moveMeta, startColor]);
  const { wShown, bShown } = useMemo(() => {
    let w = 0, b = 0;
    for (let i = 0; i < floored && i < moves.length; i++) { if (moves[i].white) w++; else b++; }
    return { wShown: w, bShown: b };
  }, [moves, floored]);
  // (사용자 요청) "계산 중" 안내 — 리뷰 펜(wShown/bShown)이 지금까지 실제로 채점된 그 진영의 수를
  // 전부 보여준 상태(wShown>=wMoves.length, 애니메이션 페이싱이 아니라 진짜로 더 채점된 게 없음)인데
  // 그 진영이 앞으로 둘 수가 더 남아 있으면(colorSans 전체 길이보다 적게 보여줬으면), 엔진이 바로
  // 그 다음 수(colorSans[wShown])를 계산하고 있는 것이다.
  // (사용자 요청) 여기도 SAN 앞에 수 번호를 붙인다.
  const wCalcSan = (wShown >= wMoves.length && wShown < colorSans.w.length) ? moveNumber(colorSans.w[wShown].ply, startColor) + colorSans.w[wShown].san : null;
  const bCalcSan = (bShown >= bMoves.length && bShown < colorSans.b.length) ? moveNumber(colorSans.b[bShown].ply, startColor) + colorSans.b[bShown].san : null;
  const onDoneRef = useRef(onDone);
  onDoneRef.current = onDone;
  // (버그 수정) instant(=이미 본 적 있는 리뷰로 이 페이지가 열렸을 때)면 그림이 다 그려지는 것도,
  // REVEAL_HOLD_MS만큼 붙잡아 두는 것도 기다리지 않고 resultDone이 되는 즉시 다음 화면으로 넘어간다
  // — 새로고침·재진입 때마다 분석 자체는(캐시하지 않으므로) 다시 기다려야 하지만, 이미 본 적 있는
  // 애니메이션까지 다시 억지로 재생할 필요는 없다.
  useEffect(() => {
    if (!resultDone) return;
    if (!instant && progress < N) return;
    const t = setTimeout(() => onDoneRef.current && onDoneRef.current(), instant ? 0 : REVEAL_HOLD_MS);
    return () => clearTimeout(t);
  }, [resultDone, progress, N, instant]);
  const wVal = wCurve[Math.min(wShown, wCurve.length - 1)];
  const bVal = bCurve[Math.min(bShown, bCurve.length - 1)];

  // ---- 그래프 좌표계 — EvalGraph와 같은 비율(320×92)·배색을 쓰되 이 컴포넌트가 직접 그린다 ----
  const W = 320, H = 92;
  const x = (i) => (i / N) * W;
  const y = (w) => H - (Math.max(0, Math.min(100, w)) / 100) * H;
  const evalAt = (i) => (evalWin[i] != null ? evalWin[i] : 50);
  const frac = progress - floored;
  // 펜 끝(tip) — floored까지는 실제 값, 그 다음 한 칸은 다음 값으로 선형보간해 매끄럽게 움직이는
  // 것처럼 보이게 한다(다음 값이 아직 없으면 제자리에서 멈춘 것처럼 보인다 — target이 그 이상 못 감).
  let tipX = x(floored), tipY = y(evalAt(floored));
  if (floored < N && frac > 0 && floored + 1 <= targetRef.current) {
    const v0 = evalAt(floored), v1 = evalAt(floored + 1);
    tipX = x(floored + frac);
    tipY = y(v0 + (v1 - v0) * frac);
  }
  const linePts = [];
  for (let i = 0; i <= floored; i++) linePts.push([x(i), y(evalAt(i))]);
  if (tipX > x(floored)) linePts.push([tipX, tipY]);
  const lineD = linePts.length ? "M " + linePts.map(([px, py]) => px.toFixed(1) + "," + py.toFixed(1)).join(" L ") : "";
  const areaPts = linePts.length ? [[0, H], ...linePts, [tipX, H]].map(([px, py]) => px.toFixed(1) + "," + py.toFixed(1)).join(" ") : "";
  const allDone = resultDone && progress >= N;
  // (사용자 요청) 가려져 있는 동안은(=위 rAF 루프가 애초에 안 도는 동안) SVG·MiniAccCurve 같은
  // 무거운 트리 자체를 렌더링하지 않는다 — 어차피 화면상 아무도 못 보므로 그릴 이유가 없다. 모든
  // 훅은 이 조건과 무관하게 항상 그대로 호출되고(위쪽에 이미 다 끝남), 반환할 JSX만 갈린다.
  // (사용자 요청) 가려져 있는 동안은 무거운 SVG·MiniAccCurve를 그리지 않는다 — 다만 영역 크기는 미리 재 둔다(드러나는 순간 바로 맞는 배치로).
  const measureStyle = { flex: "1 1 auto", minHeight: 0, width: "100%", display: "flex", alignItems: "center", justifyContent: "center" };
  if (!visible || !box) return <div ref={boxRef} style={measureStyle} />;
  const L = reviewIntroLayout(box.w, box.h);
  const graphW = L.mode === "row" ? L.rightW : L.colW;
  const statusEl = (
    // (사용자 요청) 채점 대기 중에도 3-dot 인디케이터로 "지금도 작업 중"임을 보여준다.
    <p className="flex items-center justify-center" style={{ gap: 6, height: RI.STATUS, fontSize: 12, fontWeight: 700, color: RV.dim, margin: 0, fontFamily: SITE_FONT, whiteSpace: "nowrap" }}>
      <span>{allDone ? t("정확도 계산 완료") : t("정확도 계산 중")}</span>
      {!allDone && <PendingDots size={11} />}
    </p>
  );
  // 진행 막대 — 채점된 수(gradedCount) 기준. 예전엔 화면 맨 아래 별도 줄이라 폰에서 가장 먼저 잘렸다 — 막대와 %를 한 줄로.
  const pct = Math.round(Math.max(0, Math.min(1, progressPct)) * 100);
  const progEl = (
    <div className="flex items-center" style={{ gap: 8, height: RI.PROG, width: "100%", maxWidth: 320, margin: "0 auto" }}>
      <div style={{ flex: 1, height: 7, borderRadius: 999, background: "rgba(255,255,255,.12)", overflow: "hidden" }}>
        <div style={{ width: pct + "%", height: "100%", background: "linear-gradient(90deg," + T.brass + "," + T.brassHi + ")", transition: "width .3s ease" }} />
      </div>
      <span style={{ fontSize: 11.5, fontWeight: 800, color: RV.dim, fontFamily: SITE_FONT, minWidth: 34, textAlign: "right" }}>{pct}%</span>
    </div>
  );
  const evalEl = (
    <div style={{ background: "#3B342E", borderRadius: 10, padding: 6, width: graphW, maxWidth: "100%", boxSizing: "border-box", margin: "0 auto" }}>
      <svg viewBox={"0 0 " + W + " " + H} preserveAspectRatio="none" style={{ display: "block", width: "100%", height: L.evalH }}>
        {/* 아직 펜이 지나가지 않은 구간 — 값을 추측해 잇지 않고 그냥 검은 여백으로 둔다 */}
        {tipX < W && <rect x={tipX.toFixed(1)} y="0" width={(W - tipX).toFixed(1)} height={H} fill="#0A0604" />}
        {tipX > 0 && (
          <>
            {areaPts && <polygon points={areaPts} fill="#EDE7DC" />}
            {lineD && <path d={lineD} fill="none" stroke="#B9B0A4" strokeWidth="1" vectorEffect="non-scaling-stroke" />}
          </>
        )}
        {/* (사용자 요청) 정중앙(0.0 평가) 점선 — 채우기 위에 진한 황동색으로 */}
        <line x1="0" y1={H / 2} x2={W} y2={H / 2} stroke={T.brass} strokeWidth="0.9" strokeOpacity="0.65" strokeDasharray="3 3" vectorEffect="non-scaling-stroke" />
      </svg>
    </div>
  );
  const accW = <MiniAccCurve curve={wCurve} shownCount={wShown} moves={wMoves} color="#EDE7DC" label={t("⬜ 백 정확도")} big pxW={graphW} pxH={L.accH}
    accValue={wVal} layoutId="review-acc-w" calculatingSan={wCalcSan} toast={wToast} />;
  const accB = <MiniAccCurve curve={bCurve} shownCount={bShown} moves={bMoves} color="#B8A78C" label={t("⬛ 흑 정확도")} big pxW={graphW} pxH={L.accH}
    accValue={bVal} layoutId="review-acc-b" calculatingSan={bCalcSan} toast={bToast} />;
  const car = L.carH ? <ReviewIntroCarousel width={L.carW} height={L.carH} /> : null;
  if (L.mode === "row") {
    return (
      <div ref={boxRef} style={measureStyle}>
        <div className="flex items-center" style={{ width: L.totalW, gap: 28 }}>
          <div className="flex flex-col items-center" style={{ width: L.leftW, flexShrink: 0, gap: RI.GAP }}>
            {car}{statusEl}{progEl}
          </div>
          <div className="flex flex-col" style={{ width: L.rightW, flexShrink: 0, gap: RI.GAP }}>
            {evalEl}{accW}{accB}
          </div>
        </div>
      </div>
    );
  }
  return (
    <div ref={boxRef} style={measureStyle}>
      <div className="flex flex-col" style={{ width: L.colW, gap: RI.GAP }}>
        {car}{statusEl}{evalEl}{accW}{accB}{progEl}
      </div>
    </div>
  );
}
// (v0.3.5 기능) 사용자 요청 — 게임 리뷰도 이제 설정 탭에서 고른 분석 엔진(engine, App 루트의
// useEngine(enginePref))을 그대로 prop으로 받아 쓴다(예전엔 항상 Stockfish 16으로 고정).
export function ReviewPage({ game, onClose, myUid, engine, reviewSpeed, sharpOn }) {
  // (v0.3.9 기능) 사용자 요청 — "더 정확하게"를 고르면 depth 상한을 20→25로 올린다(movetime은
  // 그대로 — 상한이 높아진 만큼 예전엔 depth 20에서 일찍 멈추던 쉬운 포지션들도 남은 시간을 더 써서
  // depth 25까지 파고들게 되므로, 그 자체로 이미 "더 오래 걸리지만 더 정확한" 리뷰가 된다).
  // (v0.3.9 버그 수정) 위 설명은 "쉬운" 포지션(원래 movetime을 다 안 쓰고 일찍 멈추던 것)에만 맞는
  // 얘기였다 — 이미 depth 20에서도 movetime 예산을 전부 쓰던 복잡한(날카로운) 포지션은 depth
  // 목표만 25로 올라갔지 그걸 채울 시간은 그대로라, 목표에 못 미친 채 하드 워치독에 걸려 결과 자체가
  // 안 나오고("계산 중"에 멈춘 수 아이콘) 엔진 라인도 첫 단계(REVIEW_MOVETIME_MS) 안에 못 끝나는
  // 원인이었다 — 하필 날카로운 포지션(탁월한 수·유일한 수가 나올 법한 자리)일수록 더 잘 걸렸다.
  // "정확하게"를 고른 경우엔 movetime 예산 자체도 비례해 늘린다.
  const reviewDepth = reviewSpeed === "accurate" ? 25 : REVIEW_DEPTH;
  const reviewMovetimeMs = reviewSpeed === "accurate" ? Math.round(REVIEW_MOVETIME_MS * 2.5) : REVIEW_MOVETIME_MS;
  const narrow = useNarrow(760);
  // (v0.3.8 기능) 새로고침해도 이어보기 — reviewStorageKey 참고. 마운트 시 한 번만 읽으면 되므로
  // useState 지연 초기화로 동기 복원한다(game은 prop이라 이 시점에 이미 확정돼 있다).
  const reviewPosKey = useMemo(() => reviewStorageKey(game), [game]);
  const savedPos = useMemo(() => loadReviewPos(reviewPosKey), [reviewPosKey]);
  const [phase, setPhase] = useState(() => (savedPos && savedPos.phase) || "summary"); // "summary" | "review"
  const [tab, setTab] = useState("review"); // 데스크톱 사이드 탭 — review|analysis|details|openings
  const [result, setResult] = useState(null);
  // (v0.3.0 성능) analyzeGame이 이제 수 하나씩 채점되는 대로 onMove로 흘려보낸다 — result는 첫 수가
  // 채점되자마자(전체 분석이 끝나기 훨씬 전에) 채워지고, 이후 계속 자라난다. resultDone은 전체 분석이
  // 100% 끝났는지(정확도%·수 등급 최종 집계가 신뢰 가능한지)를 따로 표시한다 — 요약 화면(정확도%,
  // 단계별 하이라이트)처럼 완결된 통계가 필요한 곳만 이 값을 기다린다.
  const [resultDone, setResultDone] = useState(false);
  const [gradedCount, setGradedCount] = useState(0);
  const [err, setErr] = useState(false);
  // (버그 수정) 0(시작 위치)으로 두면 코치 카드가 아직 설명할 수가 없어 텅 비어 보인다 — 데스크톱은
  // 요약 단계 없이 바로 리뷰 화면으로 들어오므로 처음부터 1(첫 수)로 시작한다. 모바일은 요약 화면의
  // "리뷰 시작" 버튼이 이 값을 다시 1로 명시적으로 맞추므로 이 초기값과 무관하게 항상 올바르다.
  // (v0.3.8 기능) 새로고침 이어보기 — 저장된 위치가 있으면(=이전에 리뷰 화면까지 들어와 있었으면) 그
  // ply부터 이어서 보여준다.
  const [curPly, setCurPly] = useState(() => (savedPos && savedPos.curPly != null ? savedPos.curPly : 1)); // 0=시작 위치, i=i번째 수까지 둔 위치
  // (v0.3.8 기능) 정확도 공개 애니메이션(ReviewAccuracyRevealAnim)은 분석이 100% 끝난 뒤 한 번만
  // 재생한다 — 저장된 위치가 있다면(=이전에 이미 그 화면을 지나 리뷰까지 들어와 있었다는 뜻) 새로고침
  // 때마다 다시 보여줄 필요가 없어 건너뛴다.
  const [introRevealDone, setIntroRevealDone] = useState(() => !!(savedPos && savedPos.introSeen));
  // 이 마운트가 "이미 본 적 있는 리뷰"로 시작했는지(=introRevealDone이 sessionStorage에서 true로
  // seed됐는지) — 이 값 자체는 절대 안 바뀌는 스냅샷이라 ref로 고정해 둔다. 데이터(resultDone)는
  // 새로고침·재진입 때마다 항상 다시 기다려야 하지만(분석은 캐시하지 않음), 이미 본 적 있는 리뷰라면
  // 그 대기 화면에서 애니메이션이 다 끝나길 굳이 기다리지 않고 resultDone이 되는 즉시 다음 화면으로
  // 넘어가도록(REVEAL_HOLD_MS 생략) ReviewAccuracyRevealAnim에 넘겨준다.
  const introRevealSeededRef = useRef(introRevealDone);
  // (v0.3.9 사용자 요청) 리뷰에 처음 들어온 순간(=분석을 기다리는 가장 이른 시점, 아직 그래프에
  // 보여줄 데이터조차 없을 수 있는 구간) 시각적 주의를 끌기 위한 1회성 체스보드 연출
  // (ReviewBoardIntroAnim) — introRevealDone과 같은 패턴으로 sessionStorage에 시청 여부를 남겨,
  // 새로고침·이어보기에서는 다시 재생하지 않는다.
  const [boardIntroDone, setBoardIntroDone] = useState(() => !!(savedPos && savedPos.boardIntroSeen));
  const [showingLine, setShowingLine] = useState(false);
  // (v0.2.1 기능) 리뷰 보드에서 직접 원하는 수를 둘 수 있게 하되, 그 수는 실제 대국 기보가 아니므로
  // curPly/sans는 건드리지 않는다 — 분석 탭의 sans/future와 같은 패턴으로 curPly 이후에 갈라져 나온
  // "자유 탐색" 수순만 별도로 쌓아 두고(exploreSans), 되돌린 만큼은 exploreFuture에 보존해 </> 로
  // 다시 밟을 수 있게 한다. 우측 기보(ReviewMoveTable/ReviewMoveStrip)는 항상 sans/curPly만 그리므로
  // 이 자유 탐색 수는 거기 표시되지 않는다.
  const [exploreSans, setExploreSans] = useState([]);
  const [exploreFuture, setExploreFuture] = useState([]);
  // (v0.2.5 버그 수정) 이 state와 아래 activeMove 파생값은 원래 훨씬 아래(exploreMove 채점 effect
  // 옆)에 선언돼 있었는데, 그보다 먼저 나오는 playFree의 useCallback 의존성 배열이 activeMove를
  // 참조하고 있어 매 렌더 "Cannot access 'activeMove' before initialization"(TDZ 참조 에러)로
  // ReviewPage 전체가 렌더링에 실패했다 — 에러 바운더리가 없어 리뷰 페이지 전체가 흰 화면으로
  // 보이던 원인. playFree보다 먼저 선언되도록 이 자리로 옮긴다.
  const [exploreMove, setExploreMove] = useState(null); // {san, white, kind, best} — result.moves 항목과 같은 형태
  const [sel, setSel] = useState(null);
  const [drag, setDrag] = useState(null);
  const [promoPrompt, setPromoPrompt] = useState(null); // 프로모션 선택 대기 {from,to}
  // (v0.5.1 UI, 사용자 요청) 승격 선택 오버레이를 실제 8x8 그리드 안으로 포털하기 위한 참조 — Board의
  // gridRef 콜백 prop으로 채워진다(모바일/데스크톱 두 렌더 분기가 서로 배타적이라 하나로 공유해도 안전).
  const [promoGridEl, setPromoGridEl] = useState(null);
  // (v0.2.4 버그 수정) "이 포지션|이 수"를 화면에 보여준 추천을 그대로 따라 뒀는지 기록해 두는
  // 참조 — playFree에서 채우고, 아래 exploreMove 채점 effect가 재검색 결과와 무관하게 신뢰한다.
  const forcedBestRef = useRef(null);
  const [mobileBoardSize, mobileBoardSizeRef] = useBoardSize(420);
  // (버그 수정, 사용자 제보) 예전엔 "이 hook을 보드 칸에 그대로 붙이면 그 칸의 CSS 폭 자체가
  // boardSize에서 역산돼(Math.floor(boardSize/8)*8+...) 순환 참조가 생긴다"는 이유로 데스크톱은
  // 항상 고정 크기(440)만 썼다 — 그 결과 큰 데스크톱 모니터에서도 보드가 늘 작게 고정되어 보였다.
  // boardRef는 실제로 BoardWithMaterial 안의 "보드만 감싸는 flex:1 칸"(세로 평가치 막대·간격은
  // 이미 형제 요소로 분리되어 있음, 4019행 참고)에 붙으므로, 그 바깥 열의 CSS 폭을 boardSize에서
  // 역산하지 않고 뷰포트 비율(vw)로 직접 정하면 순환이 아예 생기지 않는다 — 모바일과 완전히 같은
  // ResizeObserver 자동 측정 패턴을 데스크톱에도 그대로 적용해, 화면이 넓을수록 보드도 함께 커진다.
  const [desktopBoardSize, desktopBoardSizeRef] = useBoardSize(620);
  const boardSize = narrow ? mobileBoardSize : desktopBoardSize;
  const sans = game.sans;
  // (v0.3.4 기능) 사용자 요청 — 분석 탭 "FEN 모드"에서 분석한 리뷰는 표준 시작 위치가 아니라
  // game.fenRoot(원본 FEN 문자열)에서부터 시작한다. parseFenFull로 다시 파싱해 {board,turn,rights,ep}를
  // 얻고, LearnTab의 FEN 모드와 똑같이 replayFromFen으로 그 위치부터 effSans만큼 재생한다.
  const fenRoot = useMemo(() => (game.fenRoot ? parseFenFull(game.fenRoot) : null), [game.fenRoot]);
  // (v0.3.5 버그 수정) engine이 항상 "ready"로 고정된 전용 훅(useReviewEngine)을 쓰던 시절엔 이
  // effect가 deps=[]로 마운트 시 딱 한 번만 돌아도 문제가 없었다 — 이제 실제 useEngine(enginePref)을
  // 받으므로 마운트 시점엔 아직 "loading"인 경우가 흔한데, deps=[]로 두면 그 순간의 상태로 영영
  // "연결 실패"(setErr)로 굳어버린다(리뷰 딥링크 티켓 오탐 버그와 같은 종류의 클로저 문제). status가
  // 바뀔 때마다 다시 확인하고, 실제로 분석을 시작한 뒤에는 startedRef로 한 번만 시작하게 막는다.
  const analysisStartedRef = useRef(false);
  // (v0.3.9 기능) 재현성 캐시 조회 — 엔진 부팅과 무관하게(로컬/Supabase 조회일 뿐) 먼저 시도한다.
  // 캐시가 있으면 analysisStartedRef를 먼저 세워 아래 engine-의존 분석 effect를 아예 건너뛰게 한다
  // (같은 대국을 다시 열었을 때 항상 똑같은 결과를 즉시 보여주기 위함 — 재분석하면 movetime 기반
  // 엔진 특성상 매번 값이 미세하게 달라질 수 있다). cacheChecked가 될 때까지는 분석 effect도 시작하지
  // 않아, 이 조회와 새 분석이 동시에 시작되는 경합을 막는다.
  const resultCacheKey = useMemo(() => reviewResultStorageKey(game), [game]);
  const [cacheChecked, setCacheChecked] = useState(false);
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const expectedLen = sans ? sans.length : null;
      const local = loadCachedReviewResult(resultCacheKey, expectedLen, reviewDepth);
      if (local) {
        if (!cancelled) { setResult(local); setGradedCount(expectedLen || 0); setResultDone(true); analysisStartedRef.current = true; setCacheChecked(true); }
        return;
      }
      if (game.id) {
        const remote = await reviewedAnalysisFetch(game.id, expectedLen, reviewDepth);
        if (!cancelled && remote) {
          setResult(remote); setGradedCount(expectedLen || 0); setResultDone(true); analysisStartedRef.current = true;
          saveCachedReviewResult(resultCacheKey, remote, reviewDepth);
        }
      }
      if (!cancelled) setCacheChecked(true);
    })();
    return () => { cancelled = true; };
  }, [resultCacheKey, game.id, reviewDepth]);
  useEffect(() => {
    if (!cacheChecked || analysisStartedRef.current || !engine) return;
    if (engine.status === "off") { setErr(true); return; }
    if (engine.status !== "ready") return; // 아직 부팅 중 — status가 바뀌면 이 effect가 다시 실행된다.
    if (!sans || (sans.length < 1 && !fenRoot)) { setErr(true); return; }
    analysisStartedRef.current = true;
    let cancelled = false;
    (async () => {
      try {
        const r = await analyzeGame(sans, engine, reviewDepth, undefined, reviewMovetimeMs,
          (partial, gradedIdx) => { if (!cancelled) { setResult(partial); setGradedCount(gradedIdx); } }, fenRoot);
        if (!cancelled) {
          setResult(r); setGradedCount(sans.length); setResultDone(true);
          saveCachedReviewResult(resultCacheKey, r, reviewDepth);
          if (game.id) reviewedAnalysisShare(game.id, r, reviewDepth);
        }
      } catch { if (!cancelled) setErr(true); }
    })();
    return () => { cancelled = true; };
  }, [engine && engine.status, cacheChecked, reviewDepth]);
  // (v0.3.9 기능) 포지션 변동성 보정 토글이 꺼져 있으면 result.whiteAcc/blackAcc(항상 보정 켜짐으로
  // 계산됨)를 그대로 쓰지 않고, 저장된 원본 손실·날카로움 값에서 그 자리에서 다시 변환한다(재분석
  // 없음 — reviewPhaseAccuracy가 ReviewSummary 내부 계산과 완전히 같은 경로를 탄다).
  const liveWhiteAcc = useMemo(() => result ? reviewPhaseAccuracy(result.moves, 0, result.moves.length - 1, true, sharpOn) : null, [result, sharpOn]);
  const liveBlackAcc = useMemo(() => result ? reviewPhaseAccuracy(result.moves, 0, result.moves.length - 1, false, sharpOn) : null, [result, sharpOn]);
  useEffect(() => { setShowingLine(false); }, [curPly]);
  // (v0.3.8 기능) phase·curPly·introRevealDone이 바뀔 때마다(리뷰 시작, 수 이동, 정확도 공개
  // 애니메이션 완료 등) 같은 대국 키로 sessionStorage에 계속 갱신 저장 — 다음 새로고침이 이 값을
  // 읽어 복원한다(introSeen이 저장돼 있으면 새로고침 때 공개 애니메이션을 다시 재생하지 않는다).
  useEffect(() => {
    if (!reviewPosKey) return;
    try { window.sessionStorage.setItem(reviewPosKey, JSON.stringify({ phase, curPly, introSeen: introRevealDone, boardIntroSeen: boardIntroDone })); } catch { }
  }, [reviewPosKey, phase, curPly, introRevealDone, boardIntroDone]);
  // 뒤로가기(브라우저/헤더 버튼) — 페이지 진입 시 히스토리에 /review를 쌓아 뒀으므로, 팝스테이트든
  // 버튼 클릭이든 항상 onClose 한 곳으로 모은다(App 쪽에서 pushState/popstate를 함께 관리한다).
  // (v0.3.4 기능) FEN 모드 리뷰는 자유 탐색(직접 새 수 두기)을 지원하지 않는다 — legalDests의
  // 캐슬링 판정이 "지금 킹/룩이 원위치인지"만 보고 그 전에 이미 잃은 권리는 추적하지 않는 기존
  // 단순화, gameEndState의 3회 반복 판정이 표준 시작을 전제하는 것 등 자유 탐색 특유의 보조 판정을
  // 전부 fenRoot까지 정확히 확장하는 건 이번 작업 범위를 크게 넘어선다 — 실제로 둔 수를 한 수씩
  // 밟아 보며 평가·코치 코멘트를 보는 핵심 리뷰 기능만 정확하게 지원하고, 가상의 수를 더 둬 보는
  // 기능은 안전하게 꺼 둔다(아래 interactive prop).
  const exploring = exploreSans.length > 0;
  const effSans = useMemo(() => sans.slice(0, curPly).concat(exploreSans), [sans, curPly, exploreSans]);
  const fenReplay = useMemo(() => (fenRoot ? replayFromFen(fenRoot, effSans) : null), [effSans, fenRoot]);
  const board = useMemo(() => (fenRoot ? fenReplay.board : boardFromSans(effSans)), [effSans, fenRoot, fenReplay]);
  const explColor = fenRoot ? (plyIsWhite(effSans.length, fenRoot.turn) ? "w" : "b") : (effSans.length % 2 === 0 ? "w" : "b");
  const epStd = useMemo(() => epTarget(effSans), [effSans]); // (Rules of Hooks) 항상 호출 — fenRoot가 있을 때만 아래에서 무시된다.
  const ep = fenRoot ? fenReplay.ep : epStd;
  // (v0.3.4 기능) fenRoot 리뷰의 실시간 엔진 라인 패널(아래 sansToFen 세 호출)이 쓸 FEN — 표준
  // 시작이면 기존 sansToFen(effSans) 그대로, fenRoot면 지금 보드·캐슬링 권리·앙파상을 그 시작
  // 진영(fenRoot.turn) 기준으로 직렬화한다.
  const effFen = fenRoot
    ? boardToFen(board, effSans.length, castleRightsStr(fenReplay.rights), fenReplay.ep ? sqName(fenReplay.ep[0], fenReplay.ep[1]) : "-", fenRoot.turn)
    : sansToFen(effSans);
  // (v0.3.5 기능) 분석 탭 FEN 모드와 동일하게, fenRoot가 있으면 legalDests의 캐슬링 판정(기물
  // 배치만 봄)을 그대로 쓰지 않고 FEN에서 유래한 캐슬링 권리로 한 번 더 걸러낸다(fenLegalDests) —
  // 예전엔 이 자체가 없어 FEN 리뷰의 자유 탐색을 통째로 꺼 둘 수밖에 없었다("범위를 크게 넘어선다"고
  // 미룬 항목).
  const legalTargets = useMemo(() => {
    if (!sel) return [];
    return fenRoot ? fenLegalDests(sel[0], sel[1], explColor, board, fenReplay.rights, ep) : liveLegalDests(effSans, sel[0], sel[1], explColor, board, ep);
  }, [sel, board, explColor, ep, fenRoot, fenReplay]);
  // (v0.2.3 기능 → v0.3.5) 분석 탭과 동일하게, 자유 탐색 중인 지금 위치가 스테일메이트·3회 동형
  // 반복으로 이미 끝나 있으면 더 이상 수를 둘 수 없게 막고 무승부로 표시한다. gameEndState가
  // fenRoot를 받도록 고쳐져 FEN 리뷰에서도 정확히 판정한다(effSans는 fenRoot가 있을 때 "그 FEN부터
  // 둔 수순"을 의미하므로 그대로 넘기면 된다).
  const drawState = useMemo(() => gameEndState(effSans, fenRoot), [effSans, fenRoot]);
  const gameDrawn = drawState.end === "stalemate" || drawState.end === "threefold";
  const curMove = curPly > 0 && result ? result.moves[curPly - 1] : null;
  // (v0.2.1) 지금 화면에 반영할 수/평가 — 자유 탐색 중이면 그 라이브 분석(exploreMove·엔진 라인 1순위
  // 채점 결과), 아니면 실제 게임 수순의 채점 결과(curMove)를 쓴다. (v0.2.5) playFree보다 먼저
  // 선언돼야 해 위 exploreMove state 선언 바로 다음이 아니라 여기(curMove 정의 직후)에 둔다.
  const activeMove = exploring ? exploreMove : curMove;
  // (v0.2.1) 모바일 이동 스트립에서 색·아이콘을 입힐 수(그래프에 원이 찍히는 수)의 ply 집합.
  const dotPlies = useMemo(() => new Set(result ? pickEvalGraphDots(result.moves).map((m) => m.ply) : []), [result]);
  // (v0.2.1) 이 대국의 오프닝 이름 — 예전 Openings 탭 내용을 평가치 그래프 위로 옮겨 상시 표시한다.
  const openingText = game.opening ? (game.opening + (CONTENT.explains && CONTENT.explains[sans.slice(0, 6).join(" ")] ? ": " + CONTENT.explains[sans.slice(0, 6).join(" ")] : "")) : null;
  // jump는 실제 게임 수순의 특정 지점으로 하드 이동 — 진행 중이던 자유 탐색은 버린다.
  const jump = (p) => { setExploreSans([]); setExploreFuture([]); setSel(null); setDrag(null); setPromoPrompt(null); setCurPly(Math.max(0, Math.min(sans.length, p))); };
  const goNext = () => { if (curPly >= sans.length) { onClose(); return; } jump(curPly + 1); };
  // </> 한 수 이동 — 자유 탐색 중이면 그 탐색부터 한 수씩 되돌리고(되돌린 수는 exploreFuture에 보존해
  // 다시 밟을 수 있게 함), 자유 탐색이 없을 때만 실제 게임 수순을 한 수 이동한다(=분석 탭과 동일 패턴).
  const stepBack = () => {
    setSel(null); setDrag(null); setPromoPrompt(null);
    if (exploreSans.length) { setExploreFuture((f) => [exploreSans[exploreSans.length - 1], ...f]); setExploreSans((s) => s.slice(0, -1)); }
    else jump(curPly - 1);
  };
  const stepForward = () => {
    setSel(null); setDrag(null); setPromoPrompt(null);
    if (exploreFuture.length) { setExploreSans((s) => [...s, exploreFuture[0]]); setExploreFuture((f) => f.slice(1)); }
    else if (!exploreSans.length && curPly < sans.length) jump(curPly + 1);
  };
  const canBack = curPly > 0 || exploreSans.length > 0;
  const canFwd = (curPly < sans.length && exploreSans.length === 0) || exploreFuture.length > 0;
  // (v0.2.5 버그 수정) engineLines도 activeMove/exploreMove와 같은 이유로 playFree보다 먼저
  // 선언돼야 한다 — 원래 위치(아래 엔진 라인 effect 옆)에 있으면 이 useCallback의 의존성 배열
  // 평가 시점에 "Cannot access 'engineLines' before initialization" TDZ 에러가 나 리뷰 페이지
  // 렌더링이 매번 실패했다.
  const [engineLines, setEngineLines] = useState([]);
  const playFree = useCallback((san) => {
    if (gameDrawn) return;   // (v0.2.3 버그 수정) 스테일메이트·3회 동형 반복으로 이미 끝난 국면에서는 더 이상 수를 둘 수 없다
    // (기능) 자유 탐색이 아직 실제 기보 위치(exploreSans 없음)에서 시작됐고, 방금 둔 수가 그 지점의
    // 실제 기보 수와 정확히 같다면 — 이건 "새로운 가지"가 아니라 그냥 원래 대국을 그대로 이어서 둔
    // 것이다. 굳이 exploreMove effect로 다시 실시간 분석을 돌릴 필요 없이, 이미 게임 리뷰 시작할 때
    // 다 계산해 둔 result.moves를 그대로 쓰면 되므로 곧장 그 지점(curPly+1)의 원래 리뷰로 이동한다.
    if (!exploreSans.length && curPly < sans.length && stripSuffix(san) === stripSuffix(sans[curPly])) {
      playMoveSfx(san);
      jump(curPly + 1);
      return;
    }
    playMoveSfx(san);
    // (v0.2.4 버그 수정) 지금 화면에 "최선"으로 안내 중이던 수(Show 화살표 또는 엔진 라인 1순위)를
    // 그대로 뒀다면, 그 사실 자체를 기록해 둔다 — 아래 exploreMove 채점 effect가 재검색을 새로
    // 돌리는데, movetime 상한 안에서는 같은 포지션·같은 설정이어도 타이밍에 따라 살짝 다른 1순위가
    // 나올 수 있어(엔진 판정 특성), 방금 사용자가 실제로 따라간 추천과 다른 수로 오판정되곤 했다.
    // 이미 화면에 보여준 추천을 그대로 따라간 경우엔 재검색 결과와 무관하게 "최선의 수"로 확정한다.
    const shownBest = (activeMove && activeMove.best) || (engineLines[0] && engineLines[0].sans && engineLines[0].sans[0]);
    if (shownBest && stripSuffix(shownBest) === stripSuffix(san)) forcedBestRef.current = effSans.join(" ") + "|" + san;
    setExploreSans((s) => [...s, san]); setExploreFuture([]);
    setSel(null); setDrag(null);
  }, [gameDrawn, activeMove, engineLines, effSans, exploreSans, curPly, sans]);
  const tryMove = useCallback((from, to) => {
    if (from[0] === to[0] && from[1] === to[1]) return false;
    const dests = fenRoot ? fenLegalDests(from[0], from[1], explColor, board, fenReplay.rights, ep) : liveLegalDests(effSans, from[0], from[1], explColor, board, ep);
    if (!dests.some(([r, c]) => r === to[0] && c === to[1])) return false;
    const pc = board[from[0]][from[1]];
    if (pc && pc.t === "P" && ((explColor === "w" && to[0] === 0) || (explColor === "b" && to[0] === 7))) { setPromoPrompt({ from, to }); return true; }
    const san = buildSan(board, from[0], from[1], to[0], to[1], explColor, ep);
    if (!san) return false;
    playFree(san);
    return true;
  }, [board, explColor, ep, playFree, fenRoot, fenReplay]);
  const completePromo = useCallback((piece) => {
    if (!promoPrompt) return;
    const { from, to } = promoPrompt; setPromoPrompt(null); setSel(null); setDrag(null);
    const san = buildSan(board, from[0], from[1], to[0], to[1], explColor, ep, piece);
    if (!san) return;
    playFree(san);
  }, [promoPrompt, board, explColor, ep, playFree]);
  const onSquareClick = useCallback((sq) => {
    const p = board[sq[0]][sq[1]];
    if (sel) { if (tryMove(sel, sq)) return; if (p && p.c === explColor) { setSel(sq); return; } setSel(null); return; }
    if (p && p.c === explColor) setSel(sq);
  }, [sel, board, explColor, tryMove]);
  const onPieceDrag = useCallback((sq) => { const p = board[sq[0]][sq[1]]; if (p && p.c === explColor) { setDrag(sq); setSel(sq); } }, [board, explColor]);
  const onDrop = useCallback((sq) => { if (drag) { tryMove(drag, sq); setDrag(null); setSel(null); } }, [drag, tryMove]);
  // (v0.2.1 기능) 분석 탭과 동일하게 지금 보고 있는 포지션(effSans — 자유 탐색 중이면 그 위치)의
  // 엔진 상위 3줄을 보여준다. 앱 전역에서 공유하는 단일 엔진 큐(engine)는 그 아래에 여전히 마운트된
  // 분석 탭(useMergedMoves)이 계속 점유하고 있어, 그걸 쓰면 라인이 영영 대기에 걸린다 — 게임 리뷰
  // (analyzeGame)와 같은 독립 풀(getAnalysisPool)에서 워커 하나를 받아 계산한다(분석이 끝난 뒤엔
  // 풀이 유휴 상태이므로 곧바로 응답한다). (engineLines state는 playFree보다 먼저 선언돼야 해
  // 위쪽으로 옮겨졌다.)
  const [linesPending, setLinesPending] = useState(false);
  // (버그 수정) 사용자 보고 — 평가치 그래프의 역삼각형 마커를 좌우로 빠르게 드래그하면 curPly가
  // 초당 수십 번 바뀌고, 그때마다 이 무거운 엔진 라인 계산(과 이전 계산의 취소)이 즉시 다시
  // 시작돼 워커에 명령이 쌓이며 엔진 라인 패널이 잠깐 먹통이 된다. 보드·마커·코치 카드 등 나머지
  // 화면은 드래그 중에도 즉시 반응해야 하므로 effSans/effFen 자체는 건드리지 않고, 이 효과가
  // 실제로 바라보는 스냅샷만 짧게 디바운스한다 — 마커가 한 지점에 멈춘 뒤 일정 시간(220ms)이
  // 지나야 그 지점의 엔진 계산이 시작된다.
  const [debouncedEff, setDebouncedEff] = useState(() => ({ sans: effSans, fen: effFen }));
  useEffect(() => {
    const t = setTimeout(() => setDebouncedEff({ sans: effSans, fen: effFen }), 220);
    return () => clearTimeout(t);
  }, [effFen]);
  useEffect(() => {
    let cancelled = false;
    if (!engine || engine.status !== "ready") { setEngineLines([]); setLinesPending(false); return; }
    const effSans = debouncedEff.sans, effFen = debouncedEff.fen;
    // (v0.3.4 기능 → v0.3.5) 이 패널의 pvUciToSans(effSans, ...)가 fenRoot를 받도록 고쳐져("범위가
    // 커진다"고 미뤄 뒀던 항목), FEN 리뷰에서도 이제 정확한 SAN으로 엔진 상위 줄을 보여준다.
    // (v0.2.3 버그 수정) 분석 탭(useMergedMoves)의 엔진 라인은 포지션이 바뀌어도 이전 값을 옅게 유지한
    // 채 "계산 중"만 표시하지만, 그건 평가치 바(posEval)를 별도의 빠른 단일PV 진행 콜백으로 항상 이
    // 포지션 전용 값으로만 채우기 때문에 가능한 선택이었다(barEval 계산부 참고). 이 페이지는 그런
    // 별도 채널이 없어 engineLines[0].ev를 그대로 평가치로 쓰는데, 포지션이 바뀐 직후에도 이전
    // engineLines가 새 계산이 끝날 때까지 그대로 남아 있어 "최선의 수를 뒀는데 평가치가 잠깐 이전
    // 포지션 값으로 보였다가 갑자기 바뀌는" 것처럼 보였다 — 새 계산을 시작하는 즉시 비워, 화면에는
    // 항상 지금 포지션의 값(또는 아직 없음)만 보이게 한다.
    setEngineLines([]);
    setLinesPending(true);
    const baseWhite = colorOfRoot(fenRoot, effSans.length) === "w" ? 1 : -1;
    // 원시 PV 목록 → 표시용 라인(백 관점 평가 + 수순). 실시간 스트리밍·최종 결과가 같은 변환을 공유한다.
    // (Array 가드: 풀 부팅 실패로 useEngine 폴백을 쓰면 5번째 인자가 onLines가 아니라 onProgress라 단일
    //  엔트리가 올 수 있다 — 그럴 땐 무시한다.)
    const toLines = (raw) => dedupeEngineLines((Array.isArray(raw) ? raw : []).filter((pv) => pv && pv.pv && pv.pv.length).map((pv) => ({
      ev: pv.mate != null
        ? { mate: pv.mate * baseWhite, win: (pv.mate > 0) === (baseWhite === 1) ? "w" : "b", plies: matePliesOf(pv.mate) }
        : { cp: pv.cp * baseWhite },
      sans: pvUciToSans(effSans, pv.pv, 15, fenRoot),
    })));
    (async () => {
      try {
        const pool = await getAnalysisPool(engine.profile, engine.urls);
        const w = poolWorker(pool, 0, engine); // 실시간 라인 스트리밍 — 항상 전용 워커
        // (v0.2.1) onLines로 depth마다 실시간 갱신 — 평가치가 살아 움직이고 수순이 점점 길어진다.
        // (v0.2.4 성능) slot="review-lines" — 빠르게 수를 넘기면 이전 포지션 계산이 큐를 막지 않고 즉시 중단된다.
        // (v0.2.9 기능) 사용자 요청 — 자유 탐색·실시간 표시용 엔진 라인·평가치 막대는 분석 탭과 똑같이
        // depth 상한을 없애고(MAX_SEARCH_DEPTH), 첫 확정(기존 REVIEW_MOVETIME_MS) 이후에도 5초·20초
        // 두 단계를 더 이어서(third movetime) 배경에서 계속 더 깊이 판다 — "초기 정확도와 평가치
        // 판정"(analyzeGame, 실제로 둔 수의 등급·정확도%)은 이 변경과 무관하게 기존 REVIEW_DEPTH·
        // REVIEW_MOVETIME_MS 그대로 유지된다(아래 참고). 여기서 깊어진 결과는 화면(엔진 라인 패널·
        // 평가치 막대)에만 실시간으로 반영되고, 이미 확정된 점수·등급표는 건드리지 않는다.
        const onLines = (raw) => { if (!cancelled) { const l = toLines(raw); if (l.length) setEngineLines(l); } };
        // (v0.3.9 버그 수정) 이 첫 단계도 analyzeGame과 같은 이유로 "정확하게" 선택 시엔 늘어난
        // reviewMovetimeMs를 그대로 쓴다 — 그래야 depth 25 채점이 끝나기도 전에 이 라인 패널만 먼저
        // "첫 확정"으로 넘어가 실제 최종 등급과 다른 얕은 라인을 잠깐 보여주는 불일치가 줄어든다.
        const pvsAll = await w.evaluateMulti(effFen, MAX_SEARCH_DEPTH, 3, reviewMovetimeMs, onLines, "review-lines");
        if (cancelled) return;
        setEngineLines(toLines(pvsAll));
        setLinesPending(false);
        const deepPvs = await w.evaluateMulti(effFen, MAX_SEARCH_DEPTH, 3, 5000, onLines, "review-lines");
        if (cancelled) return;
        if (deepPvs && deepPvs.length) setEngineLines(toLines(deepPvs));
        const deeperPvs = await w.evaluateMulti(effFen, MAX_SEARCH_DEPTH, 3, 20000, onLines, "review-lines");
        if (cancelled) return;
        if (deeperPvs && deeperPvs.length) setEngineLines(toLines(deeperPvs));
      } catch { if (!cancelled) setEngineLines([]); }
      finally { if (!cancelled) setLinesPending(false); }
    })();
    return () => { cancelled = true; };
  }, [debouncedEff, engine && engine.status, engine && engine.profile, fenRoot]);
  // (v0.2.1 기능) 기보에 없는 자유 탐색 수도 기보 수와 똑같이 — 코치 카드에 등급·평가·설명을, 보드에
  // 수 체계 아이콘("계산 중" 포함)을, Show 화살표에 최선수를 표시하기 위해, 마지막으로 둔 자유 탐색
  // 수를 게임 리뷰와 동일한 방식(analyzeGame의 채점 규칙)으로 라이브 분석한다. 공용 엔진 큐 대신 게임
  // 리뷰와 같은 독립 풀을 써서 분석 탭과 충돌하지 않게 한다. (exploreMove state는 playFree보다 먼저
  // 선언돼야 해 위쪽으로 옮겨졌다.)
  // (v0.3.5 기능) 사용자 요청으로 FEN 리뷰도 이제 보드를 직접 조작하는 자유 탐색 자체는 지원한다
  // (위 legalTargets/tryMove의 fenLegalDests, 위 drawState의 gameEndState(fenRoot) 참고). (v0.4.1
  // 기능) 이 채점 로직(및 그 아래 코치 카드가 참조하는 mecFacts)도 boardFromSans/sansToFen 대신
  // boardOfRoot/fenOfRoot(둘 다 fenRoot가 없으면 기존 표준 시작 위치 동작 그대로)를 쓰도록 고쳐, FEN
  // 리뷰의 자유 탐색 수에도 표준 리뷰와 완전히 같은 등급·코치 코멘트가 뜨게 됐다 — mecFacts 계열
  // 함수 전부(recaptureFact 등 10개 넘는 하위 "Fact" 함수 포함)에 fenRoot를 threading했다. 이론
  // 수(isBookMoveAt) 확인만은 FEN 모드에서 건너뛴다 — 표준 시작 위치를 전제하는 이론 DB 자체가
  // 임의의 FEN에는 대응되지 않기 때문이다(LearnTab의 마지막 수 재평가 effect와 같은 처리).
  useEffect(() => {
    if (!exploring) { setExploreMove(null); return; }
    let cancelled = false;
    const prevSans = effSans.slice(0, -1);
    const san = effSans[effSans.length - 1];
    const white = plyIsWhite(prevSans.length, fenRoot ? fenRoot.turn : "w");
    // (기능) 게임 리뷰 본편(analyzeGame)·분석 탭 후보 블록은 이론 수를 만나면 곧장 "이론" 등급으로
    // 확정하고 실시간 분석을 건너뛰는데, 자유 탐색 채점만 이 확인이 빠져 있어 이론 수를 둬도 매번
    // 실시간 재검색을 거쳐 평가치 기반 등급(최선/우수 등)으로 잘못 표시됐다. 같은 isBookMoveAt
    // 확인을 그대로 적용해, 자유 탐색 중에도 이론 수는 즉시 "이론" 아이콘으로 확정한다.
    if (!fenRoot && isBookMoveAt(prevSans.join(" "), san)) { setExploreMove({ san, white, kind: "book", best: null }); return; }
    // (v0.2.4 버그 수정) playFree가 남겨 둔 "이 포지션|이 수" 기록 — 방금 화면에 보여준 추천을
    // 그대로 뒀다면 아래 재검색 결과와 무관하게 최선의 수로 확정한다(재검색은 movetime 상한 안에서
    // 타이밍에 따라 살짝 다른 1순위를 낼 수 있어, 방금 안내한 추천과 다른 수로 오판정되곤 했다).
    const forced = forcedBestRef.current === prevSans.join(" ") + "|" + san;
    setExploreMove({ san, white, kind: "pending", best: null }); // 즉시 "분석 중" 아이콘부터 보여준다
    (async () => {
      if (!engine || engine.status !== "ready") return;
      try {
        const pool = await getAnalysisPool(engine.profile, engine.urls);
        const wBest = poolWorker(pool, 1, engine), wAfter = poolWorker(pool, 2, engine);
        const col = white ? "w" : "b";
        // (v0.2.4) 게임 리뷰는 이제 분석 탭과 다른 엔진(고정 Stockfish 16, 세기 제한)을 쓰므로 depth는
        // 분석 탭(evalMoveKind, depth 13·MOVETIME_MS)과 갈리는 게 자연스럽다 — 리뷰 전용 값을 쓴다.
        // (v0.2.9 기능) 사용자 요청 — 자유 탐색 수 체계 아이콘도 엔진 라인·평가치 막대와 똑같이 depth
        // 상한 없이(MAX_SEARCH_DEPTH) 첫 확정(기존 REVIEW_MOVETIME_MS) 이후 5초·20초 두 단계를 더
        // 이어서(third movetime) 다시 채점한다 — 등급이 바뀌면(예: 첫 판정은 "우수"였는데 더 깊이 보니
        // 실은 "최선"이었던 경우) 아이콘이 그 자리에서 실시간으로 갱신된다. "초기 정확도와 평가치
        // 판정"(analyzeGame, 실제로 둔 수의 채점)은 이 변경과 무관하다 — 이건 기보에 없는 자유 탐색
        // 수 전용 채점이라 애초에 analyzeGame과 별개다.
        const grade = async (movetime) => {
          const pvs = await wBest.evaluateMulti(fenOfRoot(fenRoot, prevSans), MAX_SEARCH_DEPTH, 2, movetime, undefined, "review-best");
          if (cancelled) return;
          const p0 = pvs && pvs[0], p1 = pvs && pvs[1];
          if (!p0) return;
          const bestCp = p0.mate != null ? (p0.mate > 0 ? 1e5 : -1e5) : p0.cp;
          const secondCp = p1 ? (p1.mate != null ? (p1.mate > 0 ? 1e5 : -1e5) : p1.cp) : null;
          const bestSan = p0.uci ? uciToSan(boardOfRoot(fenRoot, prevSans), p0.uci, col) : null;
          const matched = forced || (!!bestSan && stripSuffix(bestSan) === stripSuffix(san));
          const after = await wAfter.evaluate(fenOfRoot(fenRoot, effSans), MAX_SEARCH_DEPTH, undefined, movetime, "review-after");
          if (cancelled || !after) return;
          const afterOpp = after.mate != null ? (after.mate > 0 ? 1e5 : -1e5) : after.cp;
          const ourCp = -afterOpp;
          const loss = matched ? 0 : bestCp - ourCp;
          // 등급 규칙은 analyzeGame과 같은 gradeMoveKind 하나로(v0.5.9 BUG-037).
          const kind = await gradeMoveKindConfirmed({
            loss, matched, bestCp, playedCp: ourCp, secondCp,
            priorSac: ownPriorMoveWasSacrifice(prevSans, col, fenRoot),
            singleRecapture: singleRecaptureCheck(prevSans, san, col, fenRoot), san,
          }, { fenRoot, prevSans, san, color: col, evaluate: (fen) => wAfter.evaluate(fen, MAX_SEARCH_DEPTH, undefined, movetime) });
          if (cancelled) return;
          if (!cancelled) setExploreMove({ san, white, kind, best: matched ? null : bestSan, beforeCp: bestCp });
        };
        await grade(REVIEW_MOVETIME_MS);
        if (cancelled) return;
        await grade(5000);
        if (cancelled) return;
        await grade(20000);
      } catch { }
    })();
    return () => { cancelled = true; };
  }, [exploring, fenRoot, effSans.join(" "), engine && engine.status, engine && engine.profile]);
  // (v0.2.9 기능) 평가치 바가 실시간 엔진 라인 1순위 평가를 따라 계속 움직이도록 — engineLines는 포지션이
  // 바뀔 때 곧장 []로 비워졌다가(위 효과의 setEngineLines([])) 스트리밍(onLines)으로 depth가 깊어질
  // 때마다 갱신되므로, 채워져 있는 한 그 1순위 줄의 평가치를 그대로 쓰면 바가 탐색 내내 실시간으로
  // 계속 바뀐다(이전엔 자유 탐색 중일 때만 그랬고, 실제 기보 수를 볼 땐 analyzeGame이 미리 계산해 둔
  // 정적값(evalDisp)에 고정돼 있었다). 포지션 진입 직후 아직 첫 스트리밍이 도착하기 전(engineLines가
  // 비어 있는 짧은 순간)에만 자유 탐색은 값 없음, 실제 기보 수는 정적값으로 임시 표시한다.
  const activeEvalDisp = engineLines.length ? engineLines[0].ev : (exploring ? null : (result && result.evalDisp ? result.evalDisp[curPly] : null));
  // (v0.2.2 기능) 코치 설명에 쓸 "희생한 기물" — 탁월한 수(언더프로모션 제외)일 때만 계산한다.
  const sacrificedPiece = useMemo(() => {
    if (!activeMove || activeMove.kind !== "brilliant") return null;
    const isUnderpromo = /=/.test(activeMove.san) && !/=Q/.test(activeMove.san);
    if (isUnderpromo) return null;
    return sacrificedPieceKor(effSans.slice(0, -1), activeMove.san);
  }, [activeMove, effSans]);
  // (재설계) MEC가 이제 "원칙 위반 판정"이 아니라 사실 나열(기물 긴장 최우선 → 이 수의 위협/방어 →
  // 템포 낭비 → 캐슬링 정보)이라, 정석 수(book)만 빼고 모든 등급에 부담 없이 적용한다 — 걸린
  // 기물이 있으면 그게 항상 맨 앞에 오므로, 예전처럼 무관한 스타일 조언이 원인인 것처럼 보일 일이
  // 없다. 동기 계산이라 useMemo로 충분하다(엔진 불필요).
  // (버그 수정) 체크메이트로 몰아가는 강제 수순에 들어서면(activeEvalDisp.mate != null), 그 뒤로는
  // 기물 하나하나가 걸렸는지 여부는 더 이상 의미 있는 정보가 아니다(이기는 쪽은 어차피 메이트로
  // 끝나고, 지는 쪽은 뭘 지켜도 소용없다) — 이럴 때는 걸린 기물·예방 수 같은 MEC 사실 대신 지금이
  // 체크메이트 수순이라는 것 자체와 남은 수를 명시한다.
  const inMateSequence = !!(activeEvalDisp && activeEvalDisp.mate != null);
  // (R7 기능) mecFacts가 대표 사실로 "위협"을 뽑았으면, mecThreatOut.detail에 그 공격자/수비자
  // 칸 정보가 함께 채워진다 — useMemo 안에서 채워지는 out-parameter라 ref로 들고 다닌다.
  const mecThreatOut = useRef({});
  const mecNotes = useMemo(() => {
    mecThreatOut.current = {};
    if (!activeMove || activeMove.kind === "book") return [];
    if (inMateSequence) {
      const n = Math.abs(activeEvalDisp.mate);
      return [mecPick([t("체크메이트 강제 수순. 메이트까지 {0}수", n), t("체크메이트 수순 진입. {0}수 뒤 체크메이트", n), t("메이트 {0}수 전. 체크메이트로 끝나는 강제 수순", n)], effSans.length)];
    }
    try { return mecFacts(effSans.slice(0, -1), activeMove.san, activeMove.white ? "w" : "b", activeMove.kind, activeMove.best, activeMove.beforeCp, mecThreatOut.current, fenRoot); } catch { return []; }
  }, [activeMove, effSans, inMateSequence, activeEvalDisp && activeEvalDisp.mate, fenRoot]);
  const threatDetail = mecThreatOut.current.detail || null;
  // (기능) 예방 수(R4/R9)의 시각화 데이터 — mecThreatOut.current.prevent에 방어 대상 칸·상대 진입
  // 경로·내 응수 경로가 채워져 있으면(그 사실이 facts[0]으로 뽑혔을 때만), 그 칸에 금색 테두리를
  // 씌우고 클릭하면 진입 경로(공격자)→응수 경로(수비자) 애니메이션을 재생할 수 있게 한다.
  const preventDetail = mecThreatOut.current.prevent || null;
  // (기능) "연결"/"중첩"의 시각화 데이터 — 서로 지켜주는 두 기물의 칸.
  const connectDetail = mecThreatOut.current.connect || null;
  // (신규) 수비자 제거의 시각화 데이터 — 공짜로 잡히게 될 상대 기물 칸(targetSq)·그 기물을 지키던
  // (지금 막 잡힌) 수비자의 원래 칸(defenderSq)·그 기물을 잡을 수 있는 내 공격자들(attackers).
  const removeDefenderDetail = mecThreatOut.current.removeDefender || null;
  // (기능) 애니메이션이 있는 MEC 문장에서 실제로 밑줄·클릭 대상이 될 단어 — mecFacts가 이 사실을
  // facts[0]으로 뽑을 때 함께 채워 준다("위협"/"위협 대처"/"과보호"/"예방 수"/"연결"/"중첩"/"수비자
  // 제거"). 문장 전체가 아니라 이 단어 하나만 밑줄이 그어지고 클릭 가능해야 한다.
  const mecKeyword = mecThreatOut.current.keyword || null;
  // (신규 기능, README v0.4.9 개발자 기록 — "여러 수에 걸친 기물 재배치 계획"은 매 수 엔진을 새로
  // 돌려야 해 자동으로 못 붙이고 온디맨드로 남겨 뒀던 항목) 코치 카드의 "재배치 계획" 버튼을 눌러야만
  // 지금 포지션에서 멀티PV 1줄을 새로 돌려 relocationPlanFromPv로 분석한다 — 같은 포지션(effSans
  // 문자열 그대로를 키로 씀, exploring 중인 자유 탐색 위치도 자연히 구분된다)을 다시 봐도 재요청하지
  // 않도록 결과를 캐시한다.
  const planKey = effSans.join(" ");
  const [planByKey, setPlanByKey] = useState({}); // key -> { loading, plan (null=계획 없음, undefined=아직 안 물어봄) }
  const planEntry = planByKey[planKey];
  // (코드 리뷰 지적 반영) 버튼을 누른 뒤 응답이 오기 전에 화면을 벗어나면(ReviewPage 언마운트) 이
  // 컴포넌트의 setPlanByKey가 그대로 불려 "언마운트된 컴포넌트에 상태 갱신" 경고가 났다 — 이 파일의
  // 다른 비동기 엔진 호출들(예: 657·11367행 근처)과 같은 패턴으로 마운트 여부를 ref로 추적한다.
  const planMountedRef = useRef(true);
  useEffect(() => () => { planMountedRef.current = false; }, []);
  const onShowPlan = useCallback(async () => {
    if (!engine || engine.status !== "ready" || planByKey[planKey]) return;
    setPlanByKey((m) => ({ ...m, [planKey]: { loading: true, plan: undefined } }));
    try {
      const pvs = await engine.evaluateMulti(fenOfRoot(fenRoot, effSans), REVIEW_DEPTH, 1, REVIEW_MOVETIME_MS);
      if (!planMountedRef.current) return;
      const pv = pvs && pvs[0];
      const pvSans = pv && pv.pv ? pvUciToSans(effSans, pv.pv, 10, fenRoot) : [];
      const plan = pvSans.length ? relocationPlanFromPv(fenRoot, effSans, pvSans) : null;
      setPlanByKey((m) => ({ ...m, [planKey]: { loading: false, plan: plan || null } }));
    } catch {
      if (planMountedRef.current) setPlanByKey((m) => ({ ...m, [planKey]: { loading: false, plan: null } }));
    }
  }, [engine, effSans, fenRoot, planKey, planByKey]);
  const planText = planEntry && !planEntry.loading
    ? (planEntry.plan ? relocationPlanPhrase(planEntry.plan) : t("뚜렷한 재배치 계획 없음"))
    : null;
  // (R7 기능, 과보호까지 재사용) "위협"·"과보호" 코멘트를 클릭하면 공격자 화살표를 하나씩, 이어서
  // 수비자 화살표를 하나씩 순서대로 보여주고, 다 보여준 뒤 1초 더 있다가 한꺼번에 지운다. 예방 수는
  // 구조가 달라서(공격자 1개→수비자 1개로 교체되는 느낌을 내야 함) 공격자를 보여준 뒤 그 공격자를
  // 옅게 흐리면서(사라지는 연출) 동시에 수비자를 띄우고, 방어 대상 칸에는 금색 테두리(halo)를 함께
  // 표시한다. 수를 넘기면(activeMove가 바뀌면) 예약된 다음 단계를 모두 취소하고 즉시 지운다.
  const [threatArrows, setThreatArrows] = useState([]);
  const [haloSquares, setHaloSquares] = useState([]);
  // (신규) 수비자 제거 애니메이션의 1단계("수를 두기 전 포지션으로 되돌리기")용 — 값이 있는 동안
  // 보드에 이 포지션을 표시하고, null이면 평소대로 현재 수(activeMove)까지 둔 포지션을 보여준다.
  const [rdBoardOverride, setRdBoardOverride] = useState(null);
  const threatTimers = useRef([]);
  const clearThreatTimers = () => { threatTimers.current.forEach(clearTimeout); threatTimers.current = []; };
  useEffect(() => { clearThreatTimers(); setThreatArrows([]); setHaloSquares([]); setRdBoardOverride(null); return clearThreatTimers; }, [activeMove, effSans]);
  const playThreatAnimation = (detail) => {
    clearThreatTimers();
    setHaloSquares([]);
    const steps = [
      ...detail.attackers.map((sq) => ({ from: sq, to: detail.targetSq, kind: "threatAttacker" })),
      ...detail.defenders.map((sq) => ({ from: sq, to: detail.targetSq, kind: "threatDefender" })),
    ];
    setThreatArrows([]);
    steps.forEach((arrow, i) => {
      threatTimers.current.push(setTimeout(() => setThreatArrows((prev) => [...prev, arrow]), i * 450));
    });
    threatTimers.current.push(setTimeout(() => setThreatArrows([]), steps.length * 450 + 1000));
  };
  // (기능) 예방 수 애니메이션 — 금색 테두리로 방어 대상 칸을 밝히고, 상대의 진입 경로를 빨간 공격자
  // 화살표로 먼저 보여준 뒤, 그 화살표가 옅게 사라지는 것과 동시에(fading) 내 응수 경로를 초록
  // 수비자 화살표로 띄운다.
  const playPreventAnimation = (detail) => {
    clearThreatTimers();
    setThreatArrows([]);
    setHaloSquares([detail.targetSq]);
    const attacker = { from: detail.attackerFrom, to: detail.targetSq, kind: "threatAttacker" };
    const defender = { from: detail.myFrom, to: detail.myTo, kind: "threatDefender" };
    threatTimers.current.push(setTimeout(() => setThreatArrows([attacker]), 0));
    threatTimers.current.push(setTimeout(() => setThreatArrows([{ ...attacker, fading: true }]), 700));
    threatTimers.current.push(setTimeout(() => setThreatArrows([{ ...attacker, fading: true }, defender]), 950));
    threatTimers.current.push(setTimeout(() => { setThreatArrows([]); setHaloSquares([]); }, 2400));
  };
  // (기능) 연결/중첩 애니메이션 — 서로 지켜주는 두 기물 사이를 수비자(초록) 화살표로 양방향
  // 순서대로 보여준다(R7과 같은 순차 등장 패턴, 색만 둘 다 수비자).
  const playConnectAnimation = (detail) => {
    clearThreatTimers();
    setHaloSquares([]);
    const steps = [
      { from: detail.sqA, to: detail.sqB, kind: "threatDefender" },
      { from: detail.sqB, to: detail.sqA, kind: "threatDefender" },
    ];
    setThreatArrows([]);
    steps.forEach((arrow, i) => {
      threatTimers.current.push(setTimeout(() => setThreatArrows((prev) => [...prev, arrow]), i * 450));
    });
    threatTimers.current.push(setTimeout(() => setThreatArrows([]), steps.length * 450 + 1000));
  };
  // (신규) 수비자 제거 애니메이션 — 사용자 요청 3단계: ① 이 수를 두기 전 포지션으로 되돌려서 공짜로
  // 잡힐 기물에 대한 공격자·수비자 화살표를 함께 보여준다. ② 잠시 뒤 수비자를 제거하는 실제 수를
  // 애니메이션(포지션을 이 수를 둔 뒤로 전환)으로 보여준다 — 공격자 화살표는 "이제 공짜로 잡을 수
  // 있다"는 걸 보여주기 위해 그대로 남겨 둔다. ③ 이제 사라진 수비자를 가리키던 화살표를 서서히
  // 지운다(fading). 마지막으로 halo·화살표·되돌린 포지션을 모두 정리한다.
  const playRemoveDefenderAnimation = (detail) => {
    clearThreatTimers();
    setHaloSquares([detail.targetSq]);
    const attackerArrows = detail.attackers.map((sq) => ({ from: sq, to: detail.targetSq, kind: "threatAttacker" }));
    const defenderArrow = { from: detail.defenderSq, to: detail.targetSq, kind: "threatDefender" };
    setRdBoardOverride(boardFromSans(effSans.slice(0, -1)));
    setThreatArrows([...attackerArrows, defenderArrow]);
    threatTimers.current.push(setTimeout(() => setRdBoardOverride(null), 900));
    threatTimers.current.push(setTimeout(() => setThreatArrows([...attackerArrows, { ...defenderArrow, fading: true }]), 1050));
    threatTimers.current.push(setTimeout(() => { setThreatArrows([]); setHaloSquares([]); setRdBoardOverride(null); }, 2400));
  };
  // (기능) 탁월한 수 — 유형(직접 희생/방치 희생/언더프로모션) + 엔진 PV 근거를 하나의 글로 엮은
  // 설명(brilliantExplain, 엔진 필요, 비동기). 두기 전 평가(bestCp)가 이미 마이너스면(mover 관점)
  // "지는 상황에서의 희생"으로 보고 무승부 수순부터 먼저 찾는다.
  const [brilliantNote, setBrilliantNote] = useState(null);
  useEffect(() => {
    setBrilliantNote(null);
    if (!activeMove || activeMove.kind !== "brilliant") return;
    if (!engine || engine.status !== "ready") return;
    let cancelled = false;
    (async () => {
      const pool = await getAnalysisPool(engine.profile, engine.urls).catch(() => []);
      const w = poolWorker(pool, 3, engine);
      const prevSans = effSans.slice(0, -1);
      const color = activeMove.white ? "w" : "b";
      let alreadyLosing = false;
      try {
        const before = await w.evaluate(sansToFen(prevSans), 14, undefined, 900, "review-brilliant");
        if (before && before.cp != null) alreadyLosing = before.cp < 0;
        else if (before && before.mate != null) alreadyLosing = before.mate < 0;
      } catch { }
      try {
        const note = await brilliantExplain(w, prevSans, activeMove.san, color, alreadyLosing, !!activeMove.best, "review-brilliant");
        if (!cancelled) setBrilliantNote(note);
      } catch { }
    })();
    return () => { cancelled = true; };
  }, [activeMove, effSans.join(" "), engine && engine.status, engine && engine.profile]);
  // (기능) 유일한 수 — 2순위 후보를 뒀다면 상대가 어떻게 응징하는지(엔진 필요, 비동기).
  const [onlyRefutation, setOnlyRefutation] = useState(null);
  useEffect(() => {
    setOnlyRefutation(null);
    if (!activeMove || activeMove.kind !== "only") return;
    if (!engine || engine.status !== "ready") return;
    let cancelled = false;
    (async () => {
      const pool = await getAnalysisPool(engine.profile, engine.urls).catch(() => []);
      const w = poolWorker(pool, 4, engine);
      const r = await onlyMoveRefutation(w, effSans.slice(0, -1), 2);
      if (!cancelled) setOnlyRefutation(r);
    })();
    return () => { cancelled = true; };
  }, [activeMove, effSans.join(" "), engine && engine.status, engine && engine.profile]);
  const [punishLine, setPunishLine] = useState([]);
  useEffect(() => {
    setPunishLine([]);
    if (!activeMove || !["mistake", "blunder", "miss"].includes(activeMove.kind)) return;
    if (!engine || engine.status !== "ready") return;
    let cancelled = false;
    (async () => {
      const pool = await getAnalysisPool(engine.profile, engine.urls).catch(() => []);
      const w = poolWorker(pool, 5, engine);
      const line = await punishmentFacts(w, effSans, 2);
      if (!cancelled) setPunishLine(line);
    })();
    return () => { cancelled = true; };
  }, [effSans.join(" "), activeMove && activeMove.kind, engine && engine.status, engine && engine.profile]);
  // (v0.3.5 버그 수정) 여기 boardFromSans(effSans...)는 analyzeGame과 무관하게 이 컴포넌트가 직접
  // "Show" 화살표·마지막 수 배지 칸을 구하려고 보드를 다시 재생하는 자리라, fenRoot가 있어도 표준
  // 시작 위치를 그대로 전제하고 있었다 — 실제 둔 수를 볼 때도(자유 탐색 여부와 무관하게) 화살표·
  // 배지가 엉뚱한 칸을 가리키는 latent 버그였다. boardOfRoot로 바꿔 고쳤다(등급·코치 코멘트 자체는
  // 이번 범위에 포함하지 않았지만, 이 칸 계산은 MEC와 무관한 순수 위치 재생이라 안전하게 고칠 수 있다).
  const arrows = useMemo(() => {
    const out = [];
    if (activeMove && showingLine) {
      const target = activeMove.best || activeMove.san;
      const prevBoard = boardOfRoot(fenRoot, effSans.slice(0, -1));
      const info = sanSrc(prevBoard, target, activeMove.white ? "w" : "b");
      if (info && !info.castle) out.push({ from: info.from, to: info.to, adopt: 80 });
    }
    // (기능) 탁월한 수(언더프로모션 제외)가 두어진 위치에서는 "Show" 여부와 무관하게, 지금 상대에게
    // 안전하게 잡힐 수 있는 내 기물 전부를 항상 붉은색 경고 화살표로 보여준다(방금 옮긴 기물 하나만이
    // 아니라, 그 수로 인해 방치된 다른 기물까지 전부) — sacrificedPiece가 있다는 것 자체가 이미
    // "탁월한 수 + 언더프로모션 아님"을 뜻하므로 그대로 게이트로 재사용한다.
    if (sacrificedPiece) {
      out.push(...hangingPieceArrows(boardOfRoot(fenRoot, effSans), activeMove.white ? "w" : "b"));
    }
    out.push(...threatArrows);
    return out;
  }, [activeMove, showingLine, effSans, sacrificedPiece, threatArrows, fenRoot]);
  const lastQ = activeMove ? { to: (() => { const info = sanSrc(boardOfRoot(fenRoot, effSans.slice(0, -1)), activeMove.san, activeMove.white ? "w" : "b"); return info ? info.to : null; })(), kind: activeMove.kind } : null;
  // (v0.2.1 기능) chess.com에서 동기화된 실제 대국만 white/black(양쪽 정보) 또는 color(내 진영)를
  // 갖고 있다 — 분석 탭 "분석" 버튼으로 진입한 임의 수순 리뷰는 game이 {sans}뿐이라 아무 표시도 하지 않는다.
  const hasPlayerData = !!(game.white || game.black || game.color);
  const whiteAvatar = useChesscomAvatar(avatarUsernameFor(game, "w"));
  const blackAvatar = useChesscomAvatar(avatarUsernameFor(game, "b"));
  const whitePInfo = hasPlayerData ? { ...reviewPlayerInfo(game, "w"), side: "w", avatar: whiteAvatar } : null;
  const blackPInfo = hasPlayerData ? { ...reviewPlayerInfo(game, "b"), side: "b", avatar: blackAvatar } : null;
  // (버그 수정, 사용자 제보) PlayPage의 "대국 리뷰 보기" 버튼을 누르면 openReview가 reviewGame을
  // 정상적으로 세팅하고 주소도 /review/(식별자)로 정확히 바뀌는데도, 화면은 계속 PlayPage(대국 화면)에
  // 머물러 있는 것처럼 보였다 — 실제로는 ReviewPage도 함께 마운트돼 있었지만 PlayPage 뒤에 완전히
  // 가려져 있었을 뿐이다. App 루트가 {reviewGame && <ReviewPage/>}를 {playGame && <PlayPage/>}보다
  // "먼저"(더 위쪽 JSX 순서로) 렌더링하는데, 두 오버레이의 position:fixed 최상위 wrap이 하필 같은
  // zIndex:300을 쓰고 있었다 — 같은 z-index끼리는 CSS 스택 순서가 DOM 순서로 정해지므로, 나중에
  // 그려지는 PlayPage가 항상 ReviewPage 위를 덮어버렸다(리뷰를 여는 경로 자체가 항상 PlayPage 위에서
  // 시작되므로 100% 재현). DOM 순서를 맞바꾸는 대신(다른 진입 경로들의 겹침 순서까지 건드릴 위험),
  // 리뷰만 그 어떤 페이지보다도 위에 뜨는 게 항상 맞는 의도이므로 여기 zIndex만 확실히 더 높게 올린다.
  const wrap = { position: "fixed", inset: 0, zIndex: 310, background: RV.bg, overflowY: "auto", WebkitOverflowScrolling: "touch" };
  // (v0.2.1) 모바일 뒤로가기 — 리뷰 진행 화면에서는 /review를 닫지 않고 Analysis(요약) 창으로 먼저
  // 돌아가고, 요약 창에서 한 번 더 눌러야 /review가 닫힌다. 데스크톱은 요약 단계가 없어 곧장 닫는다.
  const handleBack = () => { if (narrow && phase === "review") { setPhase("summary"); setExploreSans([]); setExploreFuture([]); setShowingLine(false); } else onClose(); };
  // (v0.3.4 기능) 사용자 요청 — 리뷰 페이지 공유 버튼(모바일·데스크톱 공통 헤더). 딥링크 식별자는
  // openReview(App 레벨)와 완전히 같은 계산(reviewGameIdentifier)을 이 페이지에서도 독립적으로
  // 구해 둔다 — 히스토리 URL이 아직 교체 전(비동기)이어도 공유 시트는 준비되는 대로 곧장 쓸 수 있다.
  const [reviewId, setReviewId] = useState(null);
  useEffect(() => { let cc = false; reviewGameIdentifier(game).then((id) => { if (!cc) setReviewId(id); }); return () => { cc = true; }; }, [game]);
  const [shareOpen, setShareOpen] = useState(false);
  const shareLabel = hasPlayerData ? (reviewPlayerInfo(game, "w").name + " vs " + reviewPlayerInfo(game, "b").name) : (fenRoot ? t("FEN 포지션 분석") : t("PGN 대국 리뷰"));
  // (신규 기능, 사용자 요청) 리뷰 요약 카드 이미지 공유용 데이터. 정확성은 이미 ReviewSummary가 쓰는
  // 것과 같은 값(result.whiteAcc/blackAcc, 항상 보정 켜짐)을 그대로 재사용해 화면에 보이는 숫자와
  // 카드 숫자가 어긋나지 않게 한다.
  // (v0.5.2, 사용자 요청 — 카드 디자인 고도화) whiteAvatarUrl/blackAvatarUrl과 moves(전체 수 배열,
  // 수 등급별 목록을 카드에 그대로 그리기 위해)를 추가했다 — 아바타는 이미 이 컴포넌트가 갖고 있는
  // whitePInfo.avatar/blackPInfo.avatar(useChesscomAvatar)를 그대로 넘긴다.
  const shareCardData = useMemo(() => {
    // (버그 수정, 코드 리뷰 지적) result는 useState(null)로 시작해 analyzeGame의 첫 결과가 올 때까지
    // null이다 — hasPlayerData만 보고 곧장 result.moves에 접근하면, 리뷰 진입 직후(분석이 아직
    // 안 끝난 순간) 이 컴포넌트 전체가 크래시났다. resultDone도 함께 확인한다 — result는 첫 수가
    // 채점되자마자(전체 분석이 끝나기 훨씬 전에) 이미 채워지므로, 이것만 보면 아직 다 안 끝난
    // 정확도·블런더 수로 카드를 만들어 공유해 버릴 수 있다(화면에 최종적으로 보이는 값과 다름).
    if (!hasPlayerData || !result || !resultDone) return null;
    const whiteInfo = reviewPlayerInfo(game, "w"), blackInfo = reviewPlayerInfo(game, "b");
    const resultText = !game.result ? null : game.result === "win" ? t("승리") : game.result === "loss" ? t("패배") : t("무승부");
    // (버그 수정, 코드 리뷰 지적) result.whiteAcc/blackAcc는 항상 sharpOn=true로 고정 계산된 값이라,
    // 설정에서 "포지션 변동성 보정"을 꺼 둔 상태로 리뷰를 볼 때 화면에 보이는 정확도(핏·ReviewSummary가
    // reviewPhaseAccuracy(...,sharpOn)로 다시 계산한 값)와 카드 숫자가 달라졌다 — 같은 함수·같은
    // sharpOn으로 다시 계산해 항상 화면과 일치시킨다.
    const whiteAcc = reviewPhaseAccuracy(result.moves, 0, result.moves.length - 1, true, sharpOn);
    const blackAcc = reviewPhaseAccuracy(result.moves, 0, result.moves.length - 1, false, sharpOn);
    // (v0.5.2, 카드 밀도 강화) 헤더 오른쪽에 들어갈 대국 메타 — 시간 규정·날짜·수 수(있는 것만).
    const d = game.endTime ? new Date(game.endTime * 1000) : null;
    const metaText = [
      game.timeClass ? (TIME_CLASS_LABEL[game.timeClass] || game.timeClass) : null,
      d ? d.getFullYear() + "." + String(d.getMonth() + 1).padStart(2, "0") + "." + String(d.getDate()).padStart(2, "0") : null,
      result.moves.length ? t("{0}수", Math.ceil(result.moves.length / 2)) : null,
    ].filter(Boolean).join(" · ");
    return {
      whiteName: whiteInfo.name, blackName: blackInfo.name,
      whiteRating: whiteInfo.rating, blackRating: blackInfo.rating,
      metaText,
      whiteAcc, blackAcc,
      myColor: game.color || null, resultText,
      // (사용자 요청) 카드의 오프닝 이름은 영문으로 — 화면의 오프닝 배너(game.opening)와 별개로 계산한다.
      opening: (!fenRoot && sans && sans.length ? openingNameEnOf(sans) : null) || (game.opening && !HANGUL_RX.test(game.opening) ? game.opening : null),
      moves: result.moves,
      whiteAvatarUrl: (whitePInfo && whitePInfo.avatar) || null,
      blackAvatarUrl: (blackPInfo && blackPInfo.avatar) || null,
    };
    // (코드 리뷰 수정) whitePInfo/blackPInfo 자체를 deps에 넣으면 안 된다 — 둘 다 매 렌더마다 스프레드로
    // 새로 만들어지는 객체 리터럴이라 참조가 계속 바뀌어, 이 useMemo가 사실상 매 렌더 다시 계산되고
    // (카드와 무관한 다른 상태 변화로 리렌더될 때마다) 아바타 URL이 안 바뀌었는데도 카드를 새로
    // 그리게 만든다 — 실제로 값이 바뀔 때만 다시 계산되도록 아바타 URL(원시값)만 deps로 쓴다.
  }, [hasPlayerData, game, result, resultDone, sharpOn, whitePInfo && whitePInfo.avatar, blackPInfo && blackPInfo.avatar]);
  const header = (
    <div className="flex items-center justify-between" style={{ padding: "12px 16px", position: narrow ? "sticky" : "static", top: 0, background: RV.head, zIndex: 5 }}>
      <button onClick={handleBack} aria-label={t("뒤로")} className="press" style={{ width: 34, height: 34, borderRadius: 9, border: "none", background: "transparent", color: RV.text, cursor: "pointer", display: "inline-flex", alignItems: "center", justifyContent: "center" }}><ArrowLeft size={20} /></button>
      <span style={{ fontSize: 15, fontWeight: 800, color: RV.text }}>{t("게임 리뷰")}</span>
      <div className="flex items-center gap-2">
        {/* (v0.3.0 기능) result가 있어도(=첫 수 채점 완료) 전체 분석은 백그라운드에서 계속 진행 중일 수
            있다 — 아직 안 끝났으면 진행 중임을 알리는 작은 배지를 보여준다(끝나면 조용히 사라짐). */}
        {result && !resultDone && sans && sans.length > 0 && (
          <span className="flex items-center gap-1" style={{ fontSize: 10.5, fontWeight: 700, color: RV.dim, whiteSpace: "nowrap" }}>{tx("{0} 분석 중 {1}", <Cpu size={11} />, Math.round((gradedCount / sans.length) * 100))}%</span>
        )}
        {result ? (
          <button onClick={() => setShareOpen(true)} aria-label={t("리뷰 공유")} title={t("공유")} className="press" style={{ width: 34, height: 34, borderRadius: 9, border: "none", background: "transparent", color: RV.text, cursor: "pointer", display: "inline-flex", alignItems: "center", justifyContent: "center" }}><Share2 size={18} /></button>
        ) : <span style={{ width: 34 }} />}
      </div>
    </div>
  );
  if (err) return (
    <div style={wrap}>{header}<div style={{ padding: 24, textAlign: "center" }}><p style={{ color: RV.text, fontSize: 13 }}>{t("분석 불가. 엔진 준비 상태 확인")}</p></div></div>
  );
  // (v0.3.0 성능 → v0.3.8 2차 개편) 정확도%·단계별 하이라이트 같은 요약 통계는 분석이 100%
  // 끝나야(resultDone) 신뢰할 수 있는 완결된 데이터라 그대로 기다린다 — 분석이 덜 끝난 채로 리뷰를
  // 시작하면 등급·코멘트가 부정확할 수 있어, 리뷰 정확도를 위해 지름길은 두지 않는다(narrow·데스크톱
  // 모두 완료까지 기다린 뒤에야 다음 화면으로 넘어간다). 그 기다리는 시간 자체를 사용자 요청대로
  // 그래프 애니메이션(ReviewAccuracyRevealAnim)으로 채운다 — 분석이 끝나기 전에는 실시간으로 자라나는
  // 그래프를, 끝난 뒤에는 잠깐(REVEAL_HOLD_MS) 완성된 모습을 보여준 뒤(onDone) 다음 화면으로 넘어간다.
  // (버그 수정) 새로고침 이어보기로 introRevealDone이 sessionStorage에서 true로 미리 seed되면(=예전에
  // 이 애니메이션을 본 적 있는 리뷰), 이 게이트를 `!introRevealDone` 하나만으로 걸었을 때 마운트
  // 직후(result가 아직 null인 시점)에도 곧장 narrow/desktop 분기로 새 나가 result.moves를 읽다가
  // TypeError로 리액트 트리 전체가 죽었다(에러 바운더리가 없어 "리뷰를 닫고 다시 열면 사이트가
  // 먹통이 된다"는 증상으로 보임 — 실제로는 크래시). 데이터 자체는(분석은 절대 캐시하지 않으므로)
  // 새로고침·재진입 때마다 항상 다시 기다려야 하니, `!resultDone || !result`도 함께 게이트에 넣는다 —
  // 이어보기(introRevealDone=true)여도 이 화면은 그대로 보여주되, ReviewAccuracyRevealAnim 내부에서
  // resultDone이 되는 즉시(REVEAL_HOLD_MS로 더 붙잡지 않고) onDone이 불려 다음 화면으로 곧장 넘어간다
  // — "이미 본 적 있는 리뷰는 애니메이션을 다시 재생하지 않는다"는 원래 의도는 그대로 유지된다.
  if (!introRevealDone || !resultDone || !result) return (
    // (버그 수정) 여기서 position을 "relative"로 덮어썼더니 wrap 본래의 position:"fixed"(뷰포트
    // 전체를 덮는 실제 이유)가 사라져, 이 리뷰 대기 화면 자체가 더 이상 뷰포트에 고정되지 않고
    // 내용물 크기만큼만 차지하는 일반 블록이 돼 버렸다(그 위에 겹쳐 그려야 할 체스보드 오버레이가
    // 화면 일부만 덮거나 다른 콘텐츠와 뒤섞여 보인 원인). position:fixed도 그 자체로 absolute
    // 자식의 위치 기준(containing block)이 되므로 따로 relative로 바꿀 필요가 전혀 없었다.
    <div style={{ ...wrap, display: "flex", flexDirection: "column" }}>
      {header}
      {/* (사용자 요청) 리뷰에 처음 들어온 순간(=이 대기 화면이 처음 마운트된 순간) "빨려들어가는" 듯한
          체스보드 연출을 전체를 덮는 오버레이로 한 번 재생한다 — 그 뒤에 있는 캐러셀·정확도 그래프는
          숨어 있는 동안에도 실제 데이터를 그대로 이어받아 조용히 진행되고 있다가, 이 오버레이가
          끝나며 사라지면 바로 그 상태 그대로 자연스럽게 드러난다. */}
      <AnimatePresence>
        {!boardIntroDone && <ReviewBoardIntroAnim sans={sans} onDone={() => setBoardIntroDone(true)} />}
      </AnimatePresence>
      {/* (v0.5.7, 사용자 요청) 삽화·상태 문구·그래프·진행 막대를 모두 ReviewAccuracyRevealAnim이 헤더 아래 남은 영역에 맞춰 한 번에 배치한다
          (reviewIntroLayout). 진행 막대는 예전처럼 채점된 수(gradedCount — 순서대로 채점, 애니메이션과 같은 속도) 기준. */}
      <div style={{ flex: "1 1 auto", minHeight: 0, display: "flex", flexDirection: "column", padding: narrow ? "10px 14px 14px" : "16px 24px 20px", textAlign: "center" }}>
        <ReviewAccuracyRevealAnim result={result} resultDone={resultDone} totalPlies={sans.length} instant={introRevealSeededRef.current} onDone={() => setIntroRevealDone(true)} narrow={narrow} sharpOn={sharpOn} sans={sans} startWhite={fenRoot ? fenRoot.turn === "w" : true} visible={boardIntroDone}
          progressPct={sans.length ? gradedCount / sans.length : 0} />
      </div>
    </div>
  );
  if (narrow) {
    return (
      <div style={wrap}>
        {header}
        {phase === "summary"
          ? <ReviewSummary game={game} result={result} onStart={() => { setPhase("review"); setCurPly(1); }} onPickMove={(p) => { setPhase("review"); jump(p); }} narrow sharpOn={sharpOn} />
          : (
            <div style={{ padding: "0 12px 24px" }}>
              <ReviewCoachCard move={activeMove} evalDisp={activeEvalDisp} brilliantNote={brilliantNote} punishLine={punishLine} mecNotes={mecNotes} onlyRefutation={onlyRefutation} threatDetail={threatDetail} onThreatClick={playThreatAnimation} preventDetail={preventDetail} onPreventClick={playPreventAnimation} connectDetail={connectDetail} onConnectClick={playConnectAnimation} removeDefenderDetail={removeDefenderDetail} onRemoveDefenderClick={playRemoveDefenderAnimation} mecKeyword={mecKeyword} onShowLine={() => setShowingLine((v) => !v)} showingLine={showingLine} onNext={goNext} isLast={curPly >= sans.length} onShowPlan={onShowPlan} planLoading={!!(planEntry && planEntry.loading)} planText={planText} canShowPlan={!!engine && engine.status === "ready"} narrow />
              {openingText && <div style={{ marginTop: 10 }}><ReviewOpeningBanner text={openingText} /></div>}
              {/* (v0.2.1 기능) 세로 평가치 막대(백 아래) — leftOfBoard로 Board 바로 옆(잡힌 기물 줄 제외)에
                  놓고, boardRef(mobileBoardSizeRef)를 그 보드 칸에 붙여 useBoardSize가 막대·기물 줄을 뺀
                  보드 몫의 폭만 재도록 한다(0.0이 정확히 4·5행 사이에 오도록 막대가 보드 높이에만 맞춰짐). */}
              <div style={{ marginTop: 12, position: "relative" }}>
                <BoardWithMaterial board={rdBoardOverride || board} endFx={!rdBoardOverride && drawState.end ? { kind: drawState.end, loser: drawState.color } : null} flip={false} textColor={RV.soft} size={boardSize} arrows={arrows} haloSquares={haloSquares} legalTargets={legalTargets} selected={sel} onSquareClick={onSquareClick} onPieceDrag={onPieceDrag} onDrop={onDrop} lastQ={lastQ} showEval={false} topInfo={blackPInfo} bottomInfo={whitePInfo}
                  boardRef={mobileBoardSizeRef} gridRef={setPromoGridEl} leftOfBoard={<EvalBar vertical cp={activeEvalDisp} font={SITE_FONT} />} />
                {promoPrompt && <ReviewPromoPrompt onPick={completePromo} onCancel={() => { setPromoPrompt(null); setSel(null); setDrag(null); }} color={promoPrompt.to[0] === 0 ? "w" : "b"} portalTo={promoGridEl} />}
              </div>
              <ReviewMoveStrip sans={sans} moves={result.moves} dotPlies={dotPlies} curPly={curPly} onJump={jump} onPrev={stepBack} onNext={stepForward} canPrev={canBack} canNext={canFwd} drawn={gameDrawn} />
              {/* (UI) 사용자 요청 — 코치 블록을 줄여 만든 여백으로, 모바일에서도 평가치 그래프를
                  리뷰 기보와 엔진 라인 사이에 표시한다(데스크톱의 배치 순서와 동일). */}
              <div style={{ marginTop: 10 }}><EvalGraph evalWin={result.evalWin} moves={result.moves} curPly={curPly} onJump={jump} /></div>
              {/* (v0.2.1 기능) 엔진 라인 — 모바일은 가장 아래에 표시한다. (v0.3.8 사용자 요청) 글자
                  크기를 키우고, 보드 그리드 폭(프레임 제외)이 아니라 카드 전체 폭을 채워 왼쪽(보드 왼쪽
                  끝)에 맞춰 정렬되도록 width를 100%로 바꿨다. */}
              <EngineLines lines={engineLines} pending={linesPending} sans={effSans} startColor={fenRoot ? fenRoot.turn : undefined} width="100%" onPlayFirst={playFree} large font={SITE_FONT} />
            </div>
          )}
        {shareOpen && <ReviewShareSheet reviewId={reviewId} label={shareLabel} myUid={myUid} onClose={() => setShareOpen(false)} cardData={shareCardData} />}
      </div>
    );
  }
  // 데스크톱: 좌측 코치 카드+보드(+평가 바) · 우측 탭(Review/Analysis) 2단 레이아웃.
  return (
    <div style={wrap}>
      {header}
      {/* (사용자 요청) 예전엔 maxWidth:980으로 가운데 좁은 열에 눌러 담아, 넓은 데스크톱 화면에서는
          좌우로 큰 여백만 남고 실제로는 "전체 화면"처럼 안 보였다 — 폭 제한을 없애 wrap(뷰포트 전체를
          덮는 position:fixed 컨테이너)만큼 그대로 넓게 쓰도록 한다. */}
      <div className="flex items-start" style={{ gap: 20, width: "100%", margin: "0 auto", padding: "8px 32px 32px", boxSizing: "border-box" }}>
        {/* (버그 수정, 사용자 제보) 열 폭을 더 이상 boardSize에서 역산하지 않는다(위 hook 주석 참고) —
            뷰포트 폭(vw)에 비례해 직접 정해, 화면이 넓을수록 이 열도, 그 안의 보드도 함께 커진다.
            clamp 하한(520)은 보드가 예전 고정값(440)보다 작아지지 않도록, 상한(700)은 초대형
            모니터에서 코치 카드 한 줄이 지나치게 길어지지 않도록 잡은 값이다. */}
        <div style={{ flexShrink: 0, width: "clamp(520px, 42vw, 700px)", position: "relative" }}>
          {/* (v0.2.1 기능) 세로 평가치 막대 — leftOfBoard로 Board 자체(잡힌 기물 줄 제외)에만 나란히
              놓여 그 세로 중앙(0.0)이 항상 보드의 4·5행 사이에 오도록 한다. boardRef는 모바일과
              동일하게 그 보드 칸(막대 제외)에 붙어 실제 렌더된 폭을 재고, useBoardSize가 8px 격자에
              맞춰 떨어지는 크기로 환산해 돌려준다. */}
          <div style={{ position: "relative" }}>
            <BoardWithMaterial board={rdBoardOverride || board} endFx={!rdBoardOverride && drawState.end ? { kind: drawState.end, loser: drawState.color } : null} flip={false} textColor={RV.soft} size={boardSize} arrows={arrows} haloSquares={haloSquares} legalTargets={legalTargets} selected={sel} onSquareClick={onSquareClick} onPieceDrag={onPieceDrag} onDrop={onDrop} lastQ={lastQ} showEval={false} topInfo={blackPInfo} bottomInfo={whitePInfo}
              boardRef={desktopBoardSizeRef} gridRef={setPromoGridEl} leftOfBoard={<EvalBar vertical cp={activeEvalDisp} font={SITE_FONT} />} />
            {promoPrompt && <ReviewPromoPrompt onPick={completePromo} onCancel={() => { setPromoPrompt(null); setSel(null); setDrag(null); }} color={promoPrompt.to[0] === 0 ? "w" : "b"} portalTo={promoGridEl} />}
          </div>
          <div className="flex items-center justify-center" style={{ gap: 6, marginTop: 10 }}>
            <button onClick={() => jump(0)} disabled={curPly <= 0 && !exploring && !exploreFuture.length} className="press" style={{ width: 32, height: 32, borderRadius: 8, border: "1px solid " + RV.border, background: "transparent", color: (curPly <= 0 && !exploring && !exploreFuture.length) ? RV.dim : RV.text, cursor: (curPly <= 0 && !exploring && !exploreFuture.length) ? "default" : "pointer" }}><ChevronsLeft size={16} /></button>
            <button onClick={stepBack} disabled={!canBack} className="press" style={{ width: 32, height: 32, borderRadius: 8, border: "1px solid " + RV.border, background: "transparent", color: canBack ? RV.text : RV.dim, cursor: canBack ? "pointer" : "default" }}><ChevronLeft size={16} /></button>
            <button onClick={stepForward} disabled={!canFwd} className="press" style={{ width: 32, height: 32, borderRadius: 8, border: "1px solid " + RV.border, background: "transparent", color: canFwd ? RV.text : RV.dim, cursor: canFwd ? "pointer" : "default" }}><ChevronRight size={16} /></button>
            <button onClick={() => jump(sans.length)} disabled={curPly >= sans.length && !exploring && !exploreFuture.length} className="press" style={{ width: 32, height: 32, borderRadius: 8, border: "1px solid " + RV.border, background: "transparent", color: (curPly >= sans.length && !exploring && !exploreFuture.length) ? RV.dim : RV.text, cursor: (curPly >= sans.length && !exploring && !exploreFuture.length) ? "default" : "pointer" }}><ChevronsRight size={16} /></button>
          </div>
        </div>
        {/* (버그 수정, 사용자 제보) 예전엔 이 열이 flex:1로 남은 폭을 전부 차지해, 그 안의 EvalGraph
            (SVG가 width:100%로 부모 폭을 그대로 따라감)가 초대형 모니터에서 보드에 비해 지나치게
            거대해 보였다 — maxWidth로 상한을 둬 보드(위 clamp 상한 700 + 프레임/막대 약 50)와
            비슷한 눈높이 비율을 유지한다. */}
        <div style={{ flex: 1, minWidth: 0, maxWidth: 820 }}>
          {/* (사용자 요청) 코치 말풍선(ReviewCoachCard)을 보드 옆(왼쪽 열)이 아니라 이 오른쪽 열,
              평가치 변동 그래프 위쪽으로 옮긴다 — 텍스트 위주 카드다 보니 보드보다 이 열의 폭(최대
              820)을 그대로 활용하는 편이 한 줄에 더 많은 글자가 들어가 덜 답답해 보인다. 탭
              전환과 무관하게(예전 왼쪽 열에 있을 때와 마찬가지로) 항상 보이도록 탭 스위처보다도 위에 둔다. */}
          <div style={{ marginBottom: 12 }}>
            <ReviewCoachCard move={activeMove} evalDisp={activeEvalDisp} brilliantNote={brilliantNote} punishLine={punishLine} mecNotes={mecNotes} onlyRefutation={onlyRefutation} threatDetail={threatDetail} onThreatClick={playThreatAnimation} preventDetail={preventDetail} onPreventClick={playPreventAnimation} connectDetail={connectDetail} onConnectClick={playConnectAnimation} removeDefenderDetail={removeDefenderDetail} onRemoveDefenderClick={playRemoveDefenderAnimation} mecKeyword={mecKeyword} onShowLine={() => setShowingLine((v) => !v)} showingLine={showingLine} onNext={goNext} isLast={curPly >= sans.length} onShowPlan={onShowPlan} planLoading={!!(planEntry && planEntry.loading)} planText={planText} canShowPlan={!!engine && engine.status === "ready"} />
          </div>
          <div className="flex items-center" style={{ gap: 4, marginBottom: 12, borderBottom: "1px solid " + RV.border }}>
            {[["review", "Review"], ["analysis", "Analysis"]].map(([k, label]) => (
              <button key={k} onClick={() => setTab(k)} className="press" style={{ padding: "9px 14px", border: "none", background: "transparent", color: tab === k ? RV.text : RV.dim, fontWeight: 800, fontSize: 13, cursor: "pointer", borderBottom: tab === k ? "2px solid " + T.brass : "2px solid transparent" }}>{label}</button>
            ))}
          </div>
          {tab === "review" && (
            <>
              {/* (v0.2.1) 예전 Openings 탭에 뜨던 오프닝 정보 — 평가치 그래프 위에 상시 표시한다. */}
              {openingText && <ReviewOpeningBanner text={openingText} />}
              {/* (사용자 요청) 데스크톱 그래프 크기를 한 번 더 줄인다 — 오른쪽 열 전체(최대 820)를
                  그대로 채우던 것을 이 폭으로만 한정해(SVG는 width:100%라 이 컨테이너를 그대로
                  따라간다) 세로 높이도 종횡비(320:92)에 맞춰 함께 줄어든다. 아래 엔진 라인·기보
                  표는 계속 열 전체 폭(820)을 그대로 쓴다(가독성에 영향이 큰 요소라 그대로 둠). */}
              <div style={{ maxWidth: 460 }}>
                <EvalGraph evalWin={result.evalWin} moves={result.moves} curPly={curPly} onJump={jump} />
              </div>
              {/* (v0.2.1 기능) 엔진 라인 — 컴퓨터 환경은 평가치 그래프 바로 아래에 표시한다. */}
              <div style={{ marginTop: 8 }}><EngineLines lines={engineLines} pending={linesPending} sans={effSans} startColor={fenRoot ? fenRoot.turn : undefined} width="100%" onPlayFirst={playFree} font={SITE_FONT} /></div>
              <div style={{ marginTop: 12 }}><ReviewMoveTable sans={sans} moves={result.moves} curPly={curPly} onJump={jump} drawn={gameDrawn} /></div>
            </>
          )}
          {tab === "analysis" && (
            <>
              <div className="flex items-stretch" style={{ gap: 10, marginBottom: 14 }}>
                <ReviewAccuracyPill label={"⬜ " + reviewPlayerInfo(game, "w").name} value={liveWhiteAcc} hi={(liveWhiteAcc || 0) >= (liveBlackAcc || 0)} layoutId="review-acc-w" />
                <ReviewAccuracyPill label={"⬛ " + reviewPlayerInfo(game, "b").name} value={liveBlackAcc} hi={(liveBlackAcc || 0) > (liveWhiteAcc || 0)} layoutId="review-acc-b" />
              </div>
              <ReviewKindTable moves={result.moves} showAll onPick={(p) => { setTab("review"); jump(p); }} />
            </>
          )}
        </div>
      </div>
      {shareOpen && <ReviewShareSheet reviewId={reviewId} label={shareLabel} myUid={myUid} onClose={() => setShareOpen(false)} cardData={shareCardData} />}
    </div>
  );
}
// (v0.5.2, 사용자 요청) 리뷰 공유 이미지 카드는 오프닝 이름을 항상 영문으로 보여준다 — 스냅샷 원본
// ECO 이름(nd.opening.name)은 영문이지만, 개발자가 도감에서 고친 이름(nameOverride)은 한글일 수 있다.
// openingNameOf와 같은 규칙(수순을 따라가며 마지막으로 이름이 붙은 포지션)을 쓰되, 한글이 섞인
// 이름은 건너뛰고 원본 영문 이름을 쓴다(영문으로 고친 오버라이드는 그대로 존중).
const HANGUL_RX = /[ㄱ-ㆎ가-힣]/;
function openingNameEnOf(moves) {
  let name = null; const lim = Math.min(moves.length, 16);
  for (let i = 1; i <= lim; i++) {
    const path = moves.slice(0, i);
    const nd = snapNode(path);
    if (!nd || !nd.opening || !nd.opening.name) continue;
    const ov = nameOverride(path.slice(0, -1).join(" "), path[i - 1]);
    const cand = ov && !HANGUL_RX.test(ov) ? ov : nd.opening.name;
    if (cand && !HANGUL_RX.test(cand)) name = cand;
  }
  return name;
}
// (v0.3.4 기능) 리뷰 고유 딥링크(openchess.kr/review/(식별자)) — reviewGameIdentifier가 만든 식별자를
// 그대로 이어붙인다.
function reviewShareUrl(reviewId) {
  return SITE_URL + "/review/" + reviewId;
}
// (v0.3.4 기능) 사용자 요청 — 리뷰 페이지 공유 시트. PuzzleShareSheet와 같은 두 축(외부 앱 공유 +
// 인앱 친구 대화창 공유)을 그대로 따르되, 퍼즐과 달리 리뷰는 전역 번호·좋아요 같은 부가 데이터가
// 없어 훨씬 단순하다 — reviewId(딥링크 식별자)만 있으면 두 공유 경로 모두 동작한다.
function ReviewShareSheet({ reviewId, label, myUid, onClose, cardData }) {
  const [friends, setFriends] = useState(null); // null=로딩중, [] = 없음
  const [profiles, setProfiles] = useState({});
  const [sent, setSent] = useState(() => new Set());
  const [busy, setBusy] = useState(null); // 전송 중인 uid
  const [sendErr, setSendErr] = useState("");
  // (신규 기능, 사용자 요청) 이미지 카드 미리보기 — 시트가 열리는 즉시 한 번만 만들어 <canvas>에
  // 그대로 그려 둔다(버튼을 눌러야 비로소 만들면 "공유하기"를 눌렀을 때 한 박자 늦게 반응하는
  // 것처럼 보임). 미리보기 canvas 자체가 1080×1080 전체 해상도라, 공유/다운로드는 그걸 그대로 toBlob한다.
  const previewRef = useRef(null);
  // (v0.5.2) 카드는 로고·기물·배지·아바타 이미지를 먼저 불러온 뒤(lib/shareCard.js) 그리므로,
  // cardData가 빠르게 여러 번 바뀌면 먼저 시작된 로딩이 나중 것보다 늦게 끝나 이전 카드가 덮어써질
  // 수 있다 — cancelled 플래그로 이 effect의 마지막 실행 결과만 그린다.
  const [cardReady, setCardReady] = useState(false);
  useEffect(() => {
    if (!cardData || !previewRef.current) return;
    let cancelled = false;
    setCardReady(false);
    const canvas = previewRef.current;
    loadReviewShareCardAssets(cardData).then((assets) => {
      // (코드 리뷰 수정) 이미지 로딩이 끝난 시점에 cancelled를 확인한 "뒤"에만 실제로 그린다 —
      // 예전엔 그리기 자체가 비동기 함수 안에 있어 이 확인이 그리기를 막지 못했고, 먼저 시작했지만
      // 나중에 끝난(느린 이미지를 기다린) 오래된 요청이 최신 카드를 조용히 덮어쓸 수 있었다.
      if (cancelled || !previewRef.current) return;
      const ctx = canvas.getContext("2d");
      canvas.width = 1080; canvas.height = 1080;
      if (ctx) drawReviewShareCardSync(ctx, 1080, 1080, cardData, assets);
      setCardReady(true);
    });
    return () => { cancelled = true; };
  }, [cardData]);
  const [cardBusy, setCardBusy] = useState(false);
  const [cardMsg, setCardMsg] = useState("");
  const canNativeShareFiles = typeof navigator !== "undefined" && !!navigator.canShare && !!navigator.share;
  const shareCardImage = async () => {
    if (!cardData || cardBusy || !cardReady || !previewRef.current) return;
    setCardBusy(true); setCardMsg("");
    try {
      // (버그 수정, 코드 리뷰 지적) previewRef가 이미 같은 1080×1080 전체 해상도로 그려 둔 캔버스라
      // (CSS의 aspectRatio/width:100%는 화면 표시 크기만 줄일 뿐 canvas.width/height 자체는 그대로),
      // 굳이 다시 그릴 필요 없이 그 캔버스를 그대로 toBlob한다.
      const blob = await new Promise((resolve) => previewRef.current.toBlob((b) => resolve(b), "image/png"));
      if (!blob) { setCardMsg(t("이미지 생성 실패")); return; }
      const file = new File([blob], "openchess-review.png", { type: "image/png" });
      if (canNativeShareFiles && navigator.canShare({ files: [file] })) {
        try { await navigator.share({ files: [file], title: t("OpenChess 리뷰"), text: label || t("OpenChess 대국 리뷰") }); return; }
        catch { return; } // 사용자가 공유 시트에서 취소 — 조용히 종료
      }
      // 공유 API가 파일을 못 받는 환경(대부분의 데스크톱)은 바로 다운로드.
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url; a.download = "openchess-review.png"; a.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      setCardMsg(t("이미지 저장 완료"));
    } catch { setCardMsg(t("이미지 생성 실패")); }
    finally { setCardBusy(false); }
  };
  useEffect(() => {
    let cc = false;
    (async () => {
      const edges = await friendEdges();
      const ids = edges.filter((e) => e.status === "accepted" && (e.from_uid === myUid || e.to_uid === myUid)).map((e) => (e.from_uid === myUid ? e.to_uid : e.from_uid));
      if (cc) return;
      setFriends(ids);
      if (ids.length) { const pm = await usersProfiles(ids); if (!cc) setProfiles(pm); }
    })();
    return () => { cc = true; };
  }, [myUid]);
  const send = async (toUid) => {
    if (busy || sent.has(toUid)) return;
    if (!reviewId) { setSendErr(t("리뷰 정보를 불러오지 못해 전달 불가")); return; }
    setBusy(toUid); setSendErr("");
    const ok = await reviewShareSend(myUid, toUid, reviewId);
    setBusy(null);
    if (ok) setSent((s) => new Set(s).add(toUid));
    else setSendErr(t("전달 실패. 잠시 후 다시 시도"));
  };
  return (
    <div onClick={onClose} style={{ position: "fixed", inset: 0, background: "rgba(10,6,3,.6)", zIndex: 310, display: "flex", alignItems: "flex-start", justifyContent: "center", padding: "60px 16px" }}>
      <div onClick={(e) => e.stopPropagation()} style={{ width: "100%", maxWidth: 380, background: T.paper, borderRadius: 16, border: "1px solid #DCCBA8", overflow: "hidden", boxShadow: "0 20px 50px -12px rgba(0,0,0,.6)" }}>
        <div className="flex items-center justify-between" style={{ padding: "14px 16px", borderBottom: "1px solid #E4D5B6" }}>
          <span className="flex items-center gap-2" style={{ fontSize: 15, fontWeight: 800, color: T.ink }}>{tx("{0}리뷰 공유", <Send size={15} />)}</span>
          <button onClick={onClose} aria-label={t("닫기")} className="press" style={{ width: 28, height: 28, borderRadius: 8, background: T.ebony2, color: T.ivory, border: "1px solid #000", cursor: "pointer", display: "inline-flex", alignItems: "center", justifyContent: "center" }}><X size={15} /></button>
        </div>
        {reviewId ? <ExternalShareRow url={reviewShareUrl(reviewId)} title={t("OpenChess 리뷰")} text={t("OpenChess 리뷰: {0}", label || t("대국 리뷰 보기"))} />
          : <div style={{ padding: "10px 16px", fontSize: 12, color: T.inkSoft }}>{t("공유 링크를 만드는 중…")}</div>}
        {/* (신규 기능, 사용자 요청) 이미지 카드 — 정확성·결과·오프닝을 한눈에 담은 정사각형 PNG를
            SNS에 바로 올릴 수 있게(카카오톡·인스타그램 등은 링크보다 이미지가 훨씬 잘 퍼진다).
            cardData가 없으면(FEN 모드 등 플레이어 정보가 없는 분석) 섹션 자체를 숨긴다. */}
        {cardData && (
          <div style={{ padding: "10px 16px", borderBottom: "1px solid #E4D5B6" }}>
            <div style={{ fontSize: 11, fontWeight: 800, color: T.inkSoft, marginBottom: 8 }}>{t("이미지 카드로 공유")}</div>
            <canvas ref={previewRef} style={{ width: "100%", aspectRatio: "1", borderRadius: 10, border: "1px solid #E4D5B6", display: "block", marginBottom: 8, opacity: cardReady ? 1 : 0.5, transition: "opacity .2s" }} />
            <div className="flex items-center gap-2" style={{ flexWrap: "wrap" }}>
              <button onClick={shareCardImage} disabled={cardBusy || !cardReady} className="press" style={{ display: "inline-flex", alignItems: "center", gap: 5, padding: "7px 13px", borderRadius: 8, border: "none", background: "linear-gradient(180deg," + T.brass + ",#A8842F)", color: "#241509", fontWeight: 800, fontSize: 12, cursor: (cardBusy || !cardReady) ? "default" : "pointer", opacity: (cardBusy || !cardReady) ? .6 : 1 }}>
                {canNativeShareFiles ? <Share2 size={13} /> : <ImageIcon size={13} />}
                {cardBusy ? t("만드는 중…") : !cardReady ? t("카드 준비 중…") : canNativeShareFiles ? t("이미지로 공유") : t("이미지 저장")}
              </button>
              {cardMsg && <span style={{ fontSize: 11, color: T.inkSoft }}>{cardMsg}</span>}
            </div>
          </div>
        )}
        <div style={{ padding: 12, minHeight: 120, maxHeight: 420, overflowY: "auto" }}>
          <div style={{ fontSize: 11, fontWeight: 800, color: T.inkSoft, margin: "0 0 8px" }}>{t("친구에게 보내기")}</div>
          {sendErr && <p style={{ fontSize: 11.5, color: T.blunder, fontWeight: 700, margin: "0 0 8px" }}>{sendErr}</p>}
          {friends == null ? <div style={{ fontSize: 12.5, color: T.inkSoft, padding: 8 }}>{t("불러오는 중…")}</div>
            : friends.length === 0 ? <div style={{ fontSize: 12.5, color: T.inkSoft, padding: 8 }}>{t("공유할 친구 없음. 먼저 친구 추가")}</div>
            : <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                {friends.map((u) => {
                  const pr = profiles[u] || {}; const pub = pr.pub || {};
                  const isSent = sent.has(u);
                  return (
                    <div key={u} style={{ display: "flex", alignItems: "center", gap: 10, padding: 8, borderRadius: 10, border: "1px solid #E4D5B6", background: "#FBF5E8" }}>
                      {pub.photo ? <img src={pub.photo} alt="" style={{ width: 34, height: 34, borderRadius: 9, objectFit: "cover", flexShrink: 0 }} />
                        : <span style={{ width: 34, height: 34, borderRadius: 9, flexShrink: 0, background: T.brass, color: "#241509", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 800 }}>{(pub.nickname || pr.username || "?")[0].toUpperCase()}</span>}
                      <div style={{ minWidth: 0, flex: 1 }}>
                        <div style={{ fontSize: 13, fontWeight: 800, color: T.ink, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{pub.nickname || pub.displayId || pr.username}</div>
                        <div style={{ fontSize: 10.5, color: T.inkSoft, fontFamily: SITE_FONT, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>@{(pub.displayId || pr.username)}</div>
                      </div>
                      <button onClick={() => send(u)} disabled={!!busy || isSent || !reviewId} className="press" style={{ padding: "6px 12px", borderRadius: 8, fontSize: 11.5, fontWeight: 800, cursor: (busy || isSent) ? "default" : "pointer", flexShrink: 0, background: isSent ? "transparent" : "linear-gradient(180deg," + T.brass + ",#A8842F)", color: isSent ? T.best : "#241509", border: isSent ? "1px solid " + T.best : "none", opacity: (busy && busy !== u) ? .5 : 1 }}>{isSent ? t("보냄") : (busy === u ? "…" : t("보내기"))}</button>
                    </div>
                  );
                })}
              </div>}
        </div>
      </div>
    </div>
  );
}