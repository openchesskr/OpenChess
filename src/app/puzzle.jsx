// (v0.6.0, App.jsx 분할) 'puzzle' 화면과 그 화면만 쓰는 조각
// 동작 변경 없이 App.jsx에서 그대로 옮겼다(REFACTOR_NOTES.md Phase 3 참고).
import { fenOfRoot, plyIsWhite, uciToSan, boardOfRoot, stripSuffix, decorateLine, plyMoveNum, parseFenFull, boardFromSans, sanSrc, decorateSan, moveNumber, kingPos, isAttacked, replayFromFen, epTarget, fenLegalDests, liveLegalDests, buildSan, applySan, looksLikeFen, startBoard } from "../lib/chessRules.js";
import { ownPriorMoveWasSacrifice, materialDiff, posEvalToWhite, isSacrifice } from "../lib/moveQuality.js";
import { useRef, useMemo, useState, useEffect, useContext, useLayoutEffect } from "react";
import { DRAG_SCROLL_MULT, T, BOARD_SKINS, BOARD_GLOSS, boardSquareBg } from "../lib/theme.js";
import { SEQ_FONT, SITE_FONT, EvalBar } from "../components/engineLines.jsx";
import { puzzleAverageRating } from "../lib/puzzleRating.js";
import { SB_ON, sbSelect, sbRpc, sbInsert } from "../lib/supabaseClient.js";
import { SkinContext, PieceGlyph, TierLogoDisc } from "../components/pieces.jsx";
import { tierFromXp, tierDisplayLabelArabic, tierGradientCss } from "../lib/tierSystem.js";
import { PUZZLE_ZOOM_LABEL_BASE, snapPuzzleZoom, clampSchematicPan, anchoredZoomPan, PUZZLE_ZOOM_STEP, puzzleZoomLabel } from "../lib/schematicGeometry.js";
import { QCOLOR } from "../lib/moveKinds.js";
import { badgeIcon, QLABEL } from "../components/badges.jsx";
import { Check, Trash2, Star, Bookmark, Pencil, Heart, Repeat2, Send, Lightbulb, ChevronLeft, ChevronRight, Flame, Medal, X, Filter } from "lucide-react";
import { playMoveSfx } from "../lib/prefs.js";
import { parsePgnMoves, sansToPgnText } from "../lib/pgn.js";
import { createPortal } from "react-dom";
import { AnimatePresence } from "framer-motion";
import { AnimatedMove, Board, CONTENT, ClickInfoBadge, FadeIn, GamePhaseBadge, ImageSourceMenu, LineStars, moveFxKindOn, MOVE_FX_MS, Mascot, MascotBubble, MaterialIcon, MoveLongPressPreview, PIECE_KOR, PUZZLE_PASS_KINDS, PuzzleCard, REVIEW_DEPTH, REVIEW_MOVETIME_MS, ReviewPromoPrompt, SNAP, VisualPrefsContext, analyzeGame, callEvaluateMulti, canonicalPositionFen, containsBannedWord, effectiveOpeningNameAt, fetchLichess, findSacrificeFirstMove, firstNamedOpening, fmtFull, genPuzzleTree, gradeMoveKindConfirmed, hangingPieceArrows, isPuzzlePlayable, livePuzzleName, mecFacts, primaryTheme, puzzleCandidatesAt, puzzleDifficultyTier, puzzleFetch, puzzleLineBaseRating, puzzleName, puzzleNo, puzzlePhase, puzzlePositionKey, puzzleThemeOpts, puzzleTreeOf, resolveDailyPuzzleCached, sacVerdict, scanImageFile, singleRecaptureCheck, solveCountText, sortedThemesOf, starsOf, tensionFacts, themesOf, todayStr, treeLinesOf, useBoardSize, useNarrow } from "./common.jsx";
import { AccountChessStats } from "./profile.jsx";
import { GrowthEntryCard } from "./growth.jsx";

import { t, tx } from "../lib/i18n.js";
import { useSchematicFullscreen, SchematicFsToggle, SchematicFsClose } from "../components/schematicFullscreen.jsx";
// (기능) 퍼즐 탭 오프닝 검색을 도감(CollectionTab) 트리와 똑같이 "이 게임에 존재하는 모든 개별
// 오프닝 이름"까지 검색 가능하게 하기 위한 전역 오프닝 이름 목록 — SNAP.tree의 모든 키(=모든
// 포지션)를 훑어 effectiveOpeningNameAt(오버라이드 우선)으로 각 위치의 '진짜' 이름을 구하고, 같은
// 이름이 여러 깊이에서 중복 등장하면(부모 이름을 그대로 물려받는 경우) 수순이 가장 짧은(=가장
// 상위/유명한) 경로 하나만 남긴다 — 도감 탭의 matches useMemo(12840행 부근)가 쓰는 것과 동일한
// 중복 제거·랭킹 규칙. SNAP.tree 자체는 런타임에 절대 바뀌지 않지만 CONTENT.names(개발자 오버라이드)는
// bumpContent로 바뀔 수 있으므로, contentVer를 캐시 키로 써서 오버라이드가 실제로 바뀐 뒤에만
// 다시 계산한다(그 전까진 매 렌더·키 입력마다 SNAP.tree 전체—수천 개 키—를 다시 훑지 않도록 캐싱).
let _allOpeningEntriesCache = { ver: -1, list: null };
function allOpeningEntries(contentVer) {
  if (_allOpeningEntriesCache.ver === contentVer && _allOpeningEntriesCache.list) return _allOpeningEntriesCache.list;
  const byName = new Map();
  for (const key in SNAP.tree) {
    if (key === "") continue;
    const path = key.split(" ");
    const name = effectiveOpeningNameAt(path);
    if (!name) continue;
    const cur = byName.get(name);
    if (!cur || path.length < cur.path.length) byName.set(name, { name, path });
  }
  const list = [...byName.values()];
  _allOpeningEntriesCache = { ver: contentVer, list };
  return list;
}
/* ============================================================ 품질·키워드 ============================================================ */
// (18차 보충 UX10) 어떤 수든 그 수의 실제 평가치(loss) 기반으로 수 체계 등급을 계산하는 공용 헬퍼.
// LearnTab의 evalMoveKind와 동일한 규칙 — 퍼즐 풀이 창에서도 테마와 무관하게 이 등급으로 아이콘을 표시한다.
// (기능) classifyMoveKind는 kind 문자열 하나만 돌려주는 게 기존 세 호출부의 계약이라 그대로 두고,
// 퍼즐 코치의 MEC 연동(mecFacts는 bestSan·beforeCp도 필요)을 위해 같은 계산을 공유하는 상세 버전을
// 새로 둔다 — classifyMoveKind는 이 함수를 감싸 kind만 꺼내 쓰는 얇은 래퍼가 된다.
async function classifyMoveKindDetailed(engine, prevSans, san, depth = 12, fenRoot) {
  if (!engine || engine.status !== "ready") return null;
  const cpOf = (x) => (x.mate != null ? (x.mate > 0 ? 1e5 : -1e5) : x.cp);
  // (v0.5.9 BUG-037) 유일한 수를 가리려면 2순위 수 평가가 필요해 MultiPV 2로 평가한다(예전엔 1순위만 봐서 이 경로 — 퍼즐 풀이·MEC
  // 코치 — 에서는 유일한 수가 절대 뜨지 않았다).
  const pvs = await callEvaluateMulti(engine, fenOfRoot(fenRoot, prevSans), depth, 2);
  const p0 = pvs && pvs[0], p1 = pvs && pvs[1];
  if (!p0) return null;
  const bestCp = cpOf(p0);
  const col = plyIsWhite(prevSans.length, fenRoot ? fenRoot.turn : "w") ? "w" : "b";
  // (20차) '최선의 수'(별)는 엔진 1순위 수를 그대로 뒀을 때만 부여한다 — 서로 다른 두 포지션 평가의
  // depth 노이즈로 loss가 우연히 ≤10이 된 차선 수까지 별이 붙던 문제(가짜 최선 수) 수정.
  const bestSan = p0.uci ? uciToSan(boardOfRoot(fenRoot, prevSans), p0.uci, col) : null;
  const matched = !!bestSan && stripSuffix(bestSan) === stripSuffix(san);
  let ourCp;
  if (/#/.test(san)) ourCp = 1e5;
  else {
    const after = await engine.evaluate(fenOfRoot(fenRoot, [...prevSans, san]), depth);
    if (!after) return null;
    ourCp = -cpOf(after);
  }
  const loss = matched ? 0 : bestCp - ourCp;   // 최선수 그 자체는 손실 0(노이즈 제거) — analyzeGame과 동일 규칙
  // 승부가 기울었는지(완화)는 두기 전 평가(bestCp)로 판단한다 — gradeMoveKind 참고.
  // 탁월 후보는 엔진으로 희생을 확인한다(v0.5.9 BUG-038).
  const grade = (oppJustErred) => gradeMoveKindConfirmed({
    loss, matched, bestCp, playedCp: ourCp, secondCp: p1 ? cpOf(p1) : null,
    priorSac: ownPriorMoveWasSacrifice(prevSans, col, fenRoot),
    singleRecapture: singleRecaptureCheck(prevSans, san, col, fenRoot), oppJustErred, san,
  }, { fenRoot, prevSans, san, color: col, evaluate: (fen) => engine.evaluate(fen, depth) });
  let kind = await grade(false);
  // 놓친 수(Miss): 상대의 직전 수가 실수/블런더(내게 이점)였는지는 후보일 때만 직전 포지션을 1회 추가 평가해 확인한다.
  if (["inaccuracy", "mistake", "good"].includes(kind) && prevSans.length >= 1 && bestCp >= 120 && loss >= 100 && ourCp >= -30) {
    try {
      const oppBest = await engine.evaluate(fenOfRoot(fenRoot, prevSans.slice(0, -1)), depth);
      if (oppBest && cpOf(oppBest) + bestCp >= 100) kind = await grade(true);
    } catch { }
  }
  return { kind, bestSan: matched ? null : bestSan, beforeCp: bestCp };
}
async function classifyMoveKind(engine, prevSans, san, depth = 12, fenRoot) {
  const r = await classifyMoveKindDetailed(engine, prevSans, san, depth, fenRoot);
  return r ? r.kind : null;
}
// (사용자 요청, v0.3.8 → v0.3.9 라인 클리어도 동일 폰트로 통일) 라인/퍼즐 클리어 배너(LINE·PUZZLE·
// CLEAR) 전용 디스플레이 폰트 — Google Fonts의 Alfa Slab One. 더 두껍고 포스터 문구 같은 인상을 준다.
const CLEAR_TYPO_FONT = "'Alfa Slab One', 'Noto Sans KR', cursive";
// (v0.2.6 기능) 퍼즐 풀이 화면의 기보 — 예전엔 텍스트 한 줄을 그냥 중앙 정렬해 두어, 길어지면
// 가운데 정렬 때문에 앞부분이 화면 밖으로 잘려 아예 안 보였다. 별도의 박스에 담아 한 줄(nowrap)로
// 고정하고, 다른 곳(엔진 라인·SequenceBar)과 동일한 포인터 드래그 스크롤을 붙여 좌우로 끌어볼 수
// 있게 한다.
// (UI) 사용자 요청 — 일일 퍼즐 팝업·퍼즐 카드(이 박스)의 기보에서 임의의 수를 누르면 그 기보가
// 입력된 분석 탭으로 이동한다. onPick이 주어지면 각 수를 클릭 가능한 span으로 렌더링하고(드래그
// 스크롤과 충돌하지 않도록 SequenceBar와 동일한 "드래그로 이동했으면 클릭 무시" 패턴을 쓴다),
// onPick이 없으면(text만 넘어오는 예전 호출부 호환) 예전처럼 순수 텍스트로 표시한다.
function PuzzlePgnBox({ text, sans, startColor, onPick }) {
  const scrollRef = useRef(null);
  const dragRef = useRef(null);
  const onPointerDown = (e) => {
    dragRef.current = { x: e.clientX, scrollLeft: scrollRef.current ? scrollRef.current.scrollLeft : 0, moved: false };
    if (e.currentTarget.setPointerCapture) { try { e.currentTarget.setPointerCapture(e.pointerId); } catch { /* noop */ } }
  };
  const onPointerMove = (e) => {
    const d = dragRef.current;
    if (!d || !scrollRef.current) return;
    const dx = e.clientX - d.x;
    if (Math.abs(dx) > 3) d.moved = true;
    scrollRef.current.scrollLeft = d.scrollLeft - dx * DRAG_SCROLL_MULT;
  };
  const onPointerUpOrCancel = () => { dragRef.current = null; };
  const onClickCapture = (e) => { if (dragRef.current && dragRef.current.moved) { e.preventDefault(); e.stopPropagation(); } dragRef.current = null; };
  const deco = useMemo(() => decorateLine(sans || []), [(sans || []).join(" ")]);
  const boxStyle = { overflowX: "auto", whiteSpace: "nowrap", fontSize: 12.5, color: T.inkSoft, fontFamily: SEQ_FONT, fontWeight: 600, minHeight: 16, WebkitOverflowScrolling: "touch", userSelect: "none", WebkitUserSelect: "none", touchAction: "pan-y" };
  return (
    <div onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerCancel={onPointerUpOrCancel} onPointerUp={onPointerUpOrCancel} onClickCapture={onPick ? onClickCapture : undefined}
      className="no-pan" style={{ marginBottom: 8, borderRadius: 8, border: "1px solid #DCCBA8", background: "rgba(0,0,0,.03)", padding: "6px 10px", cursor: "grab" }}>
      {onPick
        ? <div ref={scrollRef} style={boxStyle}>{deco.length === 0 ? " " : deco.map((san, i) => (
            <span key={i}>
              {(i === 0 || plyIsWhite(i, startColor)) && <span>{plyMoveNum(i, startColor) + (plyIsWhite(i, startColor) ? "." : "...")} </span>}
              <span onClick={() => onPick(sans.slice(0, i + 1))} style={{ cursor: "pointer" }}>{san}</span>
              {" "}
            </span>
          ))}</div>
        : <div ref={scrollRef} style={boxStyle}>{text || " "}</div>}
    </div>
  );
}
const THEME_LABEL = { sacrifice: t("기물 희생하기"), advantage: t("우위 점하기"), punish: t("실수 응징하기") };
function themeLabelsOf(p) { return sortedThemesOf(p).map((t) => THEME_LABEL[t]).join(" · "); }
// (기능) firstNamedOpening/lastNamedOpening은 각각 "가장 처음"/"가장 마지막" 이름 하나만 골라
// 반환한다 — 퍼즐 탭에서 세부 갈래 이름(예: "Sicilian Defense: Najdorf Variation, English Attack")
// 으로 검색해도 그 퍼즐이 실제로 걸리려면, 수순 위에서 만나는 "모든" 오프닝 이름(더 상위의 얕은
// 이름 포함)을 다 모아 둬야 한다 — 세부 갈래에 속한 퍼즐은 그보다 얕은 상위 오프닝 이름으로도
// 여전히 찾아져야 하는 게 맞다(그 반대가 버그).
function openingNamesAlong(sans) {
  const set = new Set();
  for (let i = 1; i <= sans.length; i++) { const n = effectiveOpeningNameAt(sans.slice(0, i)); if (n) set.add(n); }
  return set;
}
// (사용자 요청) 퍼즐 탭 "레이팅순" 정렬용 — PuzzleCard 카드 좌하단에 이미 표시 중인 ★avgRating과
// 완전히 같은 계산(puzzleTreeOf→treeLinesOf→라인별 puzzleLineBaseRating→puzzleAverageRating)을
// 그대로 재사용한다. 새 필드를 지어내지 않고, 이미 화면에 노출돼 검증된 기존 난이도 지표를 정렬
// 기준으로 쓴다. 라인이 0개인 손상된 퍼즐은 정렬 시 가장 낮은 순위로 밀려나도록 -1을 반환한다.
function puzzleRatingOf(p) {
  const tree = puzzleTreeOf(p);
  const allLines = treeLinesOf(tree);
  if (!allLines.length) return -1;
  const setupForRating = [...(p.setupSans || []), p.mistakeSan].filter(Boolean);
  const fenRootForRating = (!p.setupSans || !p.setupSans.length) && p.fen ? parseFenFull(p.fen) : null;
  return puzzleAverageRating(allLines.map((l) => puzzleLineBaseRating(setupForRating, tree, l, fenRootForRating)));
}
// (v0.4.1 기능, item 3) 퍼즐 탭 노출 점수 — 사용자 요청으로 추천/미해결/해결 완료 3분할과 오프닝별
// 가로 스크롤 거치대를 없애고, "난이도 적합도·약점 보완도·테마 적합도"를 점수화한 단일 피드로
// 통합한다. 세 요소 다 0~100 척도로 맞춰 가중합하고, "해결 여부"는 주 기준이 아니라 약한 감점
// 요소로만 반영한다(요청: "풀었는지 여부가 주 기준인 게 이상함").
// ① 난이도 적합도 — 퍼즐 레이팅이 "지금 내 퍼즐 레이팅"(puzzleRating, item 3의 공개 Elo 레이팅)에
// 가까울수록 높은 점수. bandWidth점 차이면 0점이 되는 선형 감쇠(기본 400, 아래 adaptiveBandWidth로
// 좁혀질 수 있다).
function puzzleDifficultyFitScore(puzzleRating, myRating, bandWidth) {
  if (puzzleRating < 0) return 0;
  return Math.max(0, 100 - (Math.abs(puzzleRating - myRating) / (bandWidth || 400)) * 100);
}
// (신규 기능, 사용자 요청) 적응형 퍼즐 난이도 — puzzleRating(Elo) 자체는 이미 매 시도마다 갱신되지만
// K=24라 서서히만 움직인다("방금 5개를 내리 다 맞혔다"는 단기 컨디션을 곧바로 반영하지 못함). 두
// 값을 따로 둬서 이 문제를 보완한다.
// (1) puzzleMomentum — 최근 결과의 지수이동평균(0~1, 0.5가 중립·승/패 반반, 최신 결과에 더 큰
// 가중치). 목표 레이팅을 승부욕이 붙었을 때는 위로, 연달아 틀릴 때는 아래로 즉시 밀어준다(±120점
// 한도, myRating이 아직 안정되지 않은 시점에 과하게 흔들리지 않도록 제한).
function adaptiveTargetRating(myRating, momentum) {
  const m = momentum == null ? 0.5 : momentum;
  return myRating + (m - 0.5) * 2 * 120;
}
// (2) 추천 밴드 폭 — 풀어본 퍼즐이 적을수록(레이팅이 아직 안 미더울수록) 넓게 잡아 다양한 난이도를
// 보여주고, 많이 풀수록(최대 300개 기준) 400→200으로 점점 좁혀 지금 실력에 더 정확히 맞춘다.
function adaptiveBandWidth(solvedCount) {
  return Math.max(200, 400 - Math.min(solvedCount || 0, 300) * (200 / 300));
}
// ② 약점 보완도 — 테마별 정답률(플레이 가능한 퍼즐 중 해결한 비율)이 낮을수록, 그 테마의 퍼즐일수록
// 높은 점수. 정답률을 아직 잴 수 없는(그 테마를 하나도 안 풀어본) 경우는 중립(50점)으로 둬 과대
// 추정하지 않는다.
function themeSolveRates(playablePuzzles, solved) {
  const totals = {}, solvedCounts = {};
  for (const p of playablePuzzles) {
    for (const th of themesOf(p)) {
      totals[th] = (totals[th] || 0) + 1;
      if (solved.has(p.id)) solvedCounts[th] = (solvedCounts[th] || 0) + 1;
    }
  }
  const rates = {};
  for (const th of Object.keys(totals)) rates[th] = solvedCounts[th] ? solvedCounts[th] / totals[th] : 0;
  return rates;
}
function puzzleWeaknessScore(p, themeRates) {
  const ths = themesOf(p);
  if (!ths.length) return 50;
  const known = ths.filter((t) => t in themeRates);
  if (!known.length) return 50;
  const avgRate = known.reduce((s, t) => s + themeRates[t], 0) / known.length;
  return (1 - avgRate) * 100;
}
// ③ 테마 적합도 — 테마 칩으로 특정 테마를 선택했을 때만 의미가 있다(선택 안 하면 전부 중립 50점).
// (사용자 요청) 테마 칩이 다중 선택을 지원하게 되면서 selectedTheme은 문자열 하나뿐 아니라
// 배열(여러 개 선택)도 받을 수 있다 — 선택이 없으면(빈 배열·"all"·falsy) 중립, 하나라도 겹치면 적합.
function puzzleThemeFitScore(p, selectedTheme) {
  const list = Array.isArray(selectedTheme) ? selectedTheme : (selectedTheme && selectedTheme !== "all" ? [selectedTheme] : []);
  if (!list.length) return 50;
  const ths = themesOf(p);
  return list.some((t) => ths.includes(t)) ? 100 : 0;
}
// 최종 노출 점수 = 세 요소 가중합(난이도 0.4 · 약점 0.35 · 테마 0.25) − 이미 푼 퍼즐 약한 감점(8점).
// (신규 기능) 난이도 적합도는 이제 myRating을 그대로 쓰지 않고, momentum(최근 컨디션)으로 목표를
// 조금 밀고 solvedCount(경험치)로 밴드 폭을 좁힌 adaptiveTargetRating/adaptiveBandWidth를 거친다.
function puzzleExposureScore(p, { myRating, themeRates, selectedTheme, puzzleRating, solved, momentum, solvedCount }) {
  const target = adaptiveTargetRating(myRating, momentum);
  const band = adaptiveBandWidth(solvedCount);
  const diff = puzzleDifficultyFitScore(puzzleRating, target, band);
  const weak = puzzleWeaknessScore(p, themeRates);
  const theme = puzzleThemeFitScore(p, selectedTheme);
  const solvedPenalty = solved.has(p.id) ? 8 : 0;
  return 0.4 * diff + 0.35 * weak + 0.25 * theme - solvedPenalty;
}
// (20차 기능1) 트리를 JSON으로 깊은 복제(모든 필드가 순수 데이터라 안전) — 개발자의 "한 수 추가" 편집은
// 항상 복제본을 수정한 뒤 통째로 교체 저장한다(원본 CONTENT.puzzleOverrides를 직접 변형하지 않음).
function cloneTree(tree) { return JSON.parse(JSON.stringify(tree)); }
// path(그 리프까지의 san 배열)를 따라 실제 트리 노드 객체를 찾는다(clone된 트리에 대해 사용 — 원본을 직접 수정).
function findTreeNode(tree, path) {
  let node = tree;
  for (const san of path) {
    const k = stripSuffix(san);
    node = (node.children || []).find((c) => stripSuffix(c.san) === k);
    if (!node) return null;
  }
  return node;
}
// 트리 전체에서 이미 쓰인 "L숫자" 리프 태그 중 가장 큰 번호와, 이 퍼즐에서 지금까지 한 번이라도
// 발급된 태그 번호(seedSeq, CONTENT.puzzleOverrides[no].tagSeq — 트리에서 사라진 뒤에도 유지)
// 중 더 큰 값 다음 번호를 새 태그로 쓴다. 트리만 스캔하면, 라인을 삭제했다가 도로 완결시켰을 때
// 카운터가 리셋되어 예전에 다른 라인이 쓰던 번호가 재사용되고, 그 번호로 이미 "해결"했던 사용자가
// 전혀 다른 새 라인을 자동으로 푼 것처럼 오판될 수 있다 — seedSeq로 항상 단조 증가시켜 막는다.
function nextLeafTag(tree, seedSeq) {
  let max = seedSeq || 0;
  (function walk(node) {
    if (node.tag) { const m = /^L(\d+)$/.exec(node.tag); if (m) max = Math.max(max, parseInt(m[1], 10)); }
    (node.children || []).forEach(walk);
  })(tree);
  const seq = max + 1;
  return { tag: "L" + seq, seq };
}
// (20차 기능1→3) 개발자 전용 — 모식도의 리프(라인의 끝)에 수를 하나 직접 추가한다. 전체 트리를 다시
// 생성하지 않고 그 라인 하나만 한 수 연장한다. 결과는 CONTENT.puzzleOverrides에 저장되어 이 퍼즐을
// 푸는 모든 유저에게 반영된다. kind/ev/adopt는 여기서 계산하지 않고 비워 둔다 — 풀이 화면의 기존
// "구버전 트리 보강" 로직이 배경에서 엔진·Lichess로 채워 넣는다(중복 계산 방지).
// (기능3) 라인은 항상 사용자 수로 끝나야 하므로, 추가한 수가 상대 수(짝수 길이)라면 아직 "미완성"
// 상태로 두고(태그 없음 — treeLinesOf가 정식 라인으로 세지 않음) 새 리프에도 "+"를 남겨 이어서
// 사용자 수를 마저 추가하도록 유도한다. 사용자 수(홀수 길이)로 끝나야만 새 고유 태그를 부여한다.
// seedSeq/반환된 seq — 위 nextLeafTag 주석 참고(태그 번호 재사용 방지용 단조 증가 카운터).
function extendPuzzleLeaf(tree, preSans, leafPath, sanRaw, seedSeq) {
  const board = boardFromSans([...preSans, ...leafPath]);
  const color = (preSans.length + leafPath.length) % 2 === 0 ? "w" : "b";
  if (!sanSrc(board, sanRaw, color)) return { error: t("불법 수") };
  const decorated = decorateSan(board, sanRaw, color);
  const clone = cloneTree(tree);
  const leaf = findTreeNode(clone, leafPath);
  if (!leaf) return { error: t("라인 없음") };
  if (leaf.children && leaf.children.some((c) => c.pass !== false)) return { error: t("이미 다음 수가 있는 라인") };
  const isValidTerminus = (leafPath.length + 1) % 2 === 1;
  delete leaf.tag;
  const child = { san: decorated, pass: true, children: [] };
  let seq = seedSeq || 0;
  if (isValidTerminus) { const r = nextLeafTag(clone, seedSeq); child.tag = r.tag; seq = r.seq; }
  leaf.children = [child];
  return { tree: clone, seq };
}
// (v0.3.0 기능) 개발자 전용 — 이미 갈래가 있는 노드(주로 상대 응수)에 형제 갈래를 하나 더 추가한다.
// extendPuzzleLeaf(리프에 다음 수를 잇는 것)와 달리, 기존 children은 하나도 건드리지 않고 그
// 배열에 새 자식만 덧붙인다. cand는 puzzleCandidatesAt이 이미 계산해 둔 { san, kind, ev, adopt }를
// 그대로 받는다(추가 엔진 호출 없음) — 자동 생성(genPuzzleTree)의 isDevelopingMove 필터 등에 걸려
// 사라진, 실제로는 멀쩡한 응수를 다시 채워 넣는 용도. parentPath.length가 홀수면(=사용자가 방금
// 수를 둔 자리) 새로 추가하는 자식은 상대 응수이므로 pass는 항상 true, 태그는 붙지 않는다(라인은
// 항상 사용자 수로 끝나야 하므로) — extendPuzzleLeaf와 동일한 규칙.
function addSiblingBranch(tree, parentPath, cand, seedSeq) {
  const clone = cloneTree(tree);
  const parent = parentPath.length ? findTreeNode(clone, parentPath) : clone;
  if (!parent) return { error: t("위치 없음") };
  const key = stripSuffix(cand.san);
  if ((parent.children || []).some((c) => stripSuffix(c.san) === key)) return { error: t("이미 있는 수") };
  const depth = parentPath.length;
  const isUserTurn = depth % 2 === 0;
  const pass = isUserTurn ? PUZZLE_PASS_KINDS.includes(cand.kind) : true;
  const child = { san: cand.san, kind: cand.kind ?? null, ev: cand.ev ?? null, adopt: cand.adopt ?? null, pass, children: [] };
  let seq = seedSeq || 0;
  if (pass) {
    const isValidTerminus = (depth + 1) % 2 === 1;
    if (isValidTerminus) { const r = nextLeafTag(clone, seedSeq); child.tag = r.tag; seq = r.seq; }
  }
  if (!parent.children) parent.children = [];
  parent.children.push(child);
  return { tree: clone, seq };
}
// (20차 기능3) 개발자 전용 — 라인의 마지막 수를 하나씩 삭제해 그 라인을 한 수 짧게 만든다. 실수로
// 라인 전체가 한 번에 사라지지 않도록, 한 번에 정확히 한 수만(그 리프 자신) 지운다. 삭제 후 남는
// 마지막 지점이 사용자 수(홀수 길이)로 끝나면 새 고유 태그를 부여해 다시 완결된 라인이 되고,
// 상대 수(짝수 길이)로 끝나면 add와 동일하게 "미완성" 상태(태그 없음)로 남아 이어서 정리해야 한다.
// 최소 1수는 항상 남겨(빈 라인 방지) 편집 실수로 라인 전체가 통째로 유실되지 않게 한다.
function removeLastMoveOfLine(tree, path, seedSeq) {
  if (!path || path.length <= 1) return { error: t("더 줄일 수 없음. 라인에는 최소 1수 필요") };
  const clone = cloneTree(tree);
  const parentPath = path.slice(0, -1);
  const parent = findTreeNode(clone, parentPath);
  if (!parent) return { error: t("라인 없음") };
  const leafKey = stripSuffix(path[path.length - 1]);
  const idx = (parent.children || []).findIndex((c) => stripSuffix(c.san) === leafKey);
  if (idx < 0) return { error: t("라인 없음") };
  const leaf = parent.children[idx];
  if (leaf.children && leaf.children.some((c) => c.pass !== false)) return { error: t("이 수 뒤에 진행된 갈래가 있어 삭제 불가") };
  parent.children.splice(idx, 1);
  let seq = seedSeq || 0;
  if (!parent.children.length) {
    if (parentPath.length % 2 === 1) { const r = nextLeafTag(clone, seedSeq); parent.tag = r.tag; seq = r.seq; }
    else delete parent.tag;
  }
  return { tree: clone, seq };
}
// (20차 기능1) 모식도·메타 보강 효과가 공유하는 "공개된(이미 실제로 두어진) 경로 키" 집합 —
// 해결한 라인의 전체 경로 + 현재 시도 중인 경로(prefix)만 공개하고, 그 밖의 미래 수는 다루지 않는다.
// (버그 수정) exploredKeys — 이번 세션에서 한 번이라도 실제로 두어 본 수의 전체 경로 키 집합(누적,
// curKeys처럼 "처음부터"로 비워지지 않는다). 이게 없으면 라인을 풀다 만 상태에서 재시작할 때 이미
// 들여다본 수들이 모식도에서 도로 가려져 "진행 상황이 초기화된 것처럼" 보인다.
function revealedPuzzleKeys(allLines, solvedNow, curKeys, exploredKeys) {
  const s = new Set();
  for (const l of allLines) {
    if (!solvedNow.has(l.tag)) continue;
    const ks = l.sans.map(stripSuffix);
    for (let i = 1; i <= ks.length; i++) s.add(ks.slice(0, i).join(" "));
  }
  for (let i = 1; i <= curKeys.length; i++) s.add(curKeys.slice(0, i).join(" "));
  if (exploredKeys) for (const k of exploredKeys) s.add(k);
  return s;
}
// (v0.1.0) 내가 리포스트한 퍼즐 번호 목록 — 추천 퍼즐에 간헐적으로 끼워 넣기 위해 사용.
async function puzzleRepostsByUser(uid) { if (!SB_ON || !uid) return []; try { const rows = await sbSelect("puzzle_reposts?uid=eq." + uid + "&select=no"); return (rows || []).map((r) => r.no); } catch { return []; } }
// (버그 수정, 사용자 제보) checkPcDuplicate의 트랜스포지션 대응 — data.positionKey(생성 시점에
// canonicalPositionFen으로 저장해 둔 정규화 국면 FEN, 위 puzzlePositionKey 주석 참고)가 일치하는
// 행을 서버에서 직접 찾는다. 이 필드가 아직 없는(이 버전 이전에 만들어진) 옛 퍼즐은 여기 걸리지
// 않는다 — 그 소급 정리는 개발자 도구의 "중복 퍼즐 검사·정리"가 puzzlePositionKey를 그 자리에서
// 다시 계산해(저장된 필드에 의존하지 않는다) 담당한다.
async function puzzleFetchByPositionKey(posKey) {
  if (!SB_ON || !posKey) return null;
  try {
    const rows = await sbSelect("puzzles?select=data,is_public&data->>positionKey=eq." + encodeURIComponent(posKey) + "&limit=1");
    const r = rows && rows[0];
    return r ? { ...r.data, public: r.is_public !== false } : null;
  } catch { return null; }
}
// (신규 기능) 사용자 요청 — 퍼즐 풀이 카드 2페이지(생성자 권한 박스)에서 공개/비공개를 나중에
// 바꾼다. 실제 권한(생성자 본인 또는 개발자/공동개발자)은 서버(puzzle_set_visibility RPC)가 다시
// 검사한다.
async function puzzleSetVisibility(no, isPublic) {
  if (!SB_ON) return false;
  try { await sbRpc("puzzle_set_visibility", { p_no: no, p_public: isPublic }); return true; } catch { return false; }
}
// (v0.3.4 기능) 사용자 요청 — 퍼즐 풀이 카드에 생성자를 표시하고, 생성자 본인에게 그 퍼즐에 한해
// 개발자와 같은 편집 권한(1시간 주기)을 주기 위한 조회. puzzleFetch와 별도로 둔 이유는, 이 창구가
// 반환하는 필드(creator_uid 등)를 puzzle 본문 객체(data)에 섞어 넣지 않기 위해서다 — 섞이면 그
// 객체가 puzzleShare로 다시 업로드될 때 data jsonb 안에 낡은 사본이 함께 저장되어(예: 개발자가
// 나중에 재지정해도 그 사본은 갱신되지 않음) 진짜 출처(puzzles.creator_uid 컬럼)와 어긋날 수 있다.
async function puzzleCreatorInfo(no) {
  if (!SB_ON) return null;
  try {
    const rows = await sbSelect("puzzles?no=eq." + no + "&select=creator_uid,creator_username,creator_edited_at&limit=1");
    const r = rows && rows[0];
    if (!r || !r.creator_uid) return null;
    return { uid: r.creator_uid, username: r.creator_username || "", editedAt: r.creator_edited_at || null };
  } catch { return null; }
}
// (v0.3.4 기능) 퍼즐 생성자 본인(또는 개발자/공동개발자)의 라인 추가/삭제·재생성 저장 — 실제 권한·
// 1시간 주기 검사는 서버(puzzle_creator_save RPC, SECURITY DEFINER)가 한다. extra는 { tagSeq,
// target, puzzleType } 중 있는 값만 골라 보낸다(없으면 서버가 기존 값을 그대로 둔다).
async function puzzleCreatorSave(no, tree, lines, extra) {
  if (!SB_ON) throw new Error("offline");
  const e = extra || {};
  await sbRpc("puzzle_creator_save", {
    p_no: no, p_tree: tree, p_lines: lines,
    p_tag_seq: e.tagSeq != null ? e.tagSeq : null,
    p_target: e.target != null ? e.target : null,
    p_puzzle_type: e.puzzleType != null ? e.puzzleType : null,
  });
}
// (v0.3.4 기능) 개발자/공동개발자 전용 — 이 퍼즐의 생성자를 재지정한다. targetUsername이 없으면
// 개발자 계정 명의로 회수, 있으면 그 아이디의 유저에게 양도한다(서버 puzzle_reassign_creator가
// 실제 권한을 다시 검사한다 — 클라이언트 canEdit 체크는 UI 편의일 뿐 진짜 방어선이 아니다).
async function puzzleReassignCreator(no, targetUsername) {
  if (!SB_ON) return false;
  try { await sbRpc("puzzle_reassign_creator", { p_no: no, p_target_username: targetUsername || null }); return true; } catch { return false; }
}
// (v0.4.9 기능, 사용자 요청) FEN 기반 사용자 생성 퍼즐의 이름 변경 — 생성자 본인 또는 개발자/공동
// 개발자만. 검열(금칙어) 기준은 학습 탭 "수 설명"과 동일하게 서버(puzzle_set_name RPC)가 최종
// 판정한다 — 클라이언트 containsBannedWord 검사는 서버 왕복 전에 미리 걸러주는 1차 방어선일 뿐이다.
async function puzzleSetName(no, name) {
  if (!SB_ON) return false;
  try { await sbRpc("puzzle_set_name", { p_no: no, p_name: name }); return true; } catch { return false; }
}
async function puzzleRank(period, limit) { if (!SB_ON) return []; try { const r = await sbRpc("puzzle_rank", { p_period: period, p_limit: limit || 12 }); return Array.isArray(r) ? r : []; } catch { return []; } }
// (기능) 퍼즐 레이팅 — 라인 하나를 실제로 푸는 데 걸린 시간(ms)을 puzzle_solve_events와 동일한
// append-only 패턴으로 기록한다. 개별 기록 자체는 클라이언트가 그냥 쌓기만 하고, "이상치를 제외한
// 평균"은 puzzle_line_avg_solve_ms RPC가 서버에서 계산한다(상하위 10%를 잘라내는 절사평균 —
// supabase-setup.sql 참고). 표본이 아직 없거나(RATING_MIN_SAMPLES 미만) Supabase 미연결이면 null을
// 돌려주고, 호출부(applySolveTimeAdjustment)는 그때 정적 기본 레이팅을 그대로 쓴다.
async function puzzleLineSolveTimeAdd(no, tag, uid, ms) { if (!SB_ON || !ms || ms <= 0) return; try { await sbInsert("puzzle_line_solve_times", { no, tag, uid: uid || null, ms: Math.round(ms) }); } catch { } }
// (v0.2.7) 캐러셀에 보여줄 날짜 목록 — 커뮤니티 선정이 처음 확정된 날짜(daily_puzzle_picks의 가장
// 이른 date)부터 오늘까지 전체 기간을, 오늘이 맨 앞(배열 인덱스 0)에 오도록 최신순으로 만든다.
// 아직 확정된 날짜가 하나도 없으면 오늘 하루만 담는다.
// (기능) 사용자 요청으로 스와이프 가능한 범위를 최근 7일로 제한한다 — 그 이전 날짜는 "번호로
// 풀기" 입력창에 YYYY/MM/DD로 직접 입력해 찾는다(더 밑 solveByInput 참고).
const DAILY_CAROUSEL_MAX_DAYS = 7;
let earliestDailyPickCache = null; // Promise<string|null> — 세션 내내 재사용
function loadEarliestDailyPickDate() {
  // 가장 이른 날짜 하나만 필요해 asc+limit=1이 의도된 것 — asc-limit-ok (scripts/check-latest-rows.mjs)
  if (!earliestDailyPickCache) earliestDailyPickCache = sbSelect("daily_puzzle_picks?select=date&order=date.asc&limit=1").then((rows) => (rows && rows[0] ? rows[0].date : null)).catch(() => null);
  return earliestDailyPickCache;
}
function useDailyPuzzleDates() {
  const [dates, setDates] = useState(null);
  useEffect(() => {
    let cancelled = false;
    loadEarliestDailyPickDate().then((earliestRow) => {
      if (cancelled) return;
      const today = todayStr();
      const earliest = (earliestRow && earliestRow < today) ? earliestRow : today;
      const startMs = Date.parse(earliest + "T00:00:00Z");
      const todayMs = Date.parse(today + "T00:00:00Z");
      const spanDays = Math.min(DAILY_CAROUSEL_MAX_DAYS - 1, Math.max(0, Math.round((todayMs - startMs) / 86400000)));
      const out = [];
      for (let i = 0; i <= spanDays; i++) out.push(todayStr(new Date(Date.now() - i * 86400e3)));
      setDates(out);
    });
    return () => { cancelled = true; };
  }, []);
  return dates;
}
// (UX4) 오답을 둔 뒤 원래 위치로 되돌아가는 걸 슬라이드 애니메이션으로 보여준다.
// board는 오답을 반영한 현재(잘못된) 보드, from/to는 방금 둔(잘못된) 수의 출발/도착 칸.
function RevertSlide({ board, from, to, size = 380, flip = false }) {
  const skCtx = useContext(SkinContext);
  const sk = BOARD_SKINS[skCtx.boardSkin] || BOARD_SKINS.classic;
  const cell = Math.floor(size / 8);
  const inner = cell * 8;
  const [slid, setSlid] = useState(false);
  useEffect(() => {
    setSlid(false);
    let r1 = 0, r2 = 0;
    r1 = requestAnimationFrame(() => { r2 = requestAnimationFrame(() => setSlid(true)); });
    return () => { cancelAnimationFrame(r1); cancelAnimationFrame(r2); };
  }, [from.join(","), to.join(",")]);
  const dv = (r, c) => (flip ? [7 - r, 7 - c] : [r, c]);
  const tx = (vr, vc) => (flip ? [7 - vr, 7 - vc] : [vr, vc]);
  const rows = flip ? [...board].reverse().map((r) => [...r].reverse()) : board;
  const [ffr, ffc] = dv(from[0], from[1]); const [ttr, ttc] = dv(to[0], to[1]);
  // (버그 수정) AnimatedMove와 동일하게 px(cell) 대신 그리드 전체 대비 퍼센트로 이동을 계산.
  const dxPct = slid ? (ffc - ttc) * 100 : 0, dyPct = slid ? (ffr - ttr) * 100 : 0;
  const moving = board[to[0]][to[1]];   // 잘못된 수를 두어 지금 도착 칸에 있는 기물 — 원래 칸으로 되돌아감
  // (UI4) Board와 동일한 padding/width 공식(보드 크기 불일치로 인한 흔들림 방지)
  // (버그 수정) flex row 고정 px 대신 aspectRatio 그리드로 바꿔, 컨테이너가 좁아져도 칸이
  // 정사각형을 벗어나지 않게 한다(AnimatedMove·Board와 동일한 방식).
  return (
    <div style={{ width: inner + 20, maxWidth: "100%", padding: 10, borderRadius: 12, background: "linear-gradient(160deg,#3A2516,#241509)", border: "1px solid #000", margin: "0 auto", boxSizing: "border-box" }}>
      <div style={{ position: "relative", borderRadius: 4, overflow: "hidden", ...BOARD_GLOSS, boxSizing: "border-box", width: inner, maxWidth: "100%", aspectRatio: "1 / 1", display: "grid", gridTemplateColumns: "repeat(8, 1fr)", gridTemplateRows: "repeat(8, 1fr)" }}>
        {rows.map((row, vr) => row.map((p, vc) => {
          const [r, c] = tx(vr, vc); const light = (r + c) % 2 === 0; const hideAt = r === to[0] && c === to[1];
          return <div key={vr + "_" + vc} style={{ minWidth: 0, minHeight: 0, display: "flex", alignItems: "center", justifyContent: "center", boxSizing: "border-box", ...boardSquareBg(sk, light, r, c) }}>{p && !hideAt && <PieceGlyph type={p.t} color={p.c} size={cell * 0.72} />}</div>;
        }))}
        {moving && <div style={{ position: "absolute", top: (ttr / 8 * 100) + "%", left: (ttc / 8 * 100) + "%", width: "12.5%", height: "12.5%", display: "flex", alignItems: "center", justifyContent: "center", transform: "translate(" + dxPct + "%," + dyPct + "%)", transition: "transform .42s cubic-bezier(.4,1.1,.5,1)", zIndex: 5 }}><PieceGlyph type={moving.t} color={moving.c} size={cell * 0.72} /></div>}
      </div>
    </div>
  );
}
// (v0.0.6 추가) 퍼즐 탭 맨 위에 상시 표시하는 티어 진행 스트립 — 지금 구간을 기물 이미지 +
// 진행바로 보여준다. 누르면 여정 지도가 열린다.
// (v0.1.1) 다른 화면들과 달리 여기만 "아이언 5"처럼 티어를 텍스트로도 다시 보여준다(아라비아
// 숫자 사용) — 이미지는 흰 원 배경 정중앙에 크게 둔다.
// (v0.1.2) 다음 구간을 미리 보여주던 작은 배지들을 없앴다 — 여정 지도에서 이미 볼 수 있어 중복.
function TierProgressStrip({ totalXp, onOpen, puzzleRating }) {
  const info = useMemo(() => tierFromXp(totalXp), [totalXp]);
  const { tier, xpInDivision, xpForNextDivision, division, maxed, gmStars } = info;
  const pct = Math.max(0, Math.min(100, Math.round((xpInDivision / xpForNextDivision) * 100)));
  const isGM = tier.key === "grandmaster";
  return (
    // (v0.1.2) 퍼즐 탭 티어 스트립 크기 축소(특히 높이) — 패딩·로고·글자·진행바를 모두 한 단계씩 줄임.
    <div onClick={onOpen} className="press flex items-center" style={{ marginBottom: 14, padding: "6px 14px", borderRadius: 999, background: "linear-gradient(160deg,#3A2516,#20140B)", border: "1px solid " + T.brass, cursor: onOpen ? "pointer" : "default", gap: 2 }}>
      <TierLogoDisc tierKey={tier.key} division={division} size={46} discSize={49} />
      {/* (사용자 요청) 퍼즐 레이팅 배지를 티어 도형 바로 옆이 아니라 여백을 두고 우측에 — 이 가운데
          정보 칼럼에 flex:1을 줘 남는 공간을 모두 차지하게 해서, 배지가 티어 텍스트에 붙지 않고
          스트립 우측 끝에 자연스러운 간격을 두고 자리하게 한다. */}
      <div style={{ minWidth: 96, flex: 1, marginLeft: 9, marginRight: 4 }}>
        <div style={{ fontSize: 12.5, fontWeight: 900, color: T.brassHi, whiteSpace: "nowrap" }}>{tierDisplayLabelArabic(info)}</div>
        {/* (사용자 요청) 그랜드마스터 별 개수가 티어 명칭 글자와 겹쳐 보이던 문제 — 명칭 줄이 아니라
            게이지 바와 같은 줄, 그 우측에 배치한다. */}
        <div className="flex items-center" style={{ gap: 5, marginTop: 3 }}>
          <div style={{ flex: 1, minWidth: 0, height: 5, borderRadius: 999, background: "rgba(255,255,255,.15)", overflow: "hidden" }}>
            <div style={{ width: pct + "%", height: "100%", background: isGM ? tierGradientCss("grandmaster") : T.brass, transition: "width 700ms cubic-bezier(.22,.9,.32,1)" }} />
          </div>
          {isGM && maxed && gmStars > 0 && (
            <span style={{ fontSize: 10.5, fontWeight: 900, whiteSpace: "nowrap", flexShrink: 0, background: tierGradientCss("grandmaster"), WebkitBackgroundClip: "text", backgroundClip: "text", color: "transparent" }}>★{gmStars}</span>
          )}
        </div>
        <div style={{ fontSize: 9.5, color: T.brassHi, opacity: .75, marginTop: 1 }}>{xpInDivision}/{xpForNextDivision} XP</div>
      </div>
      {/* (사용자 요청) 퍼즐 레이팅을 티어를 표시하는 도형(TierLogoDisc) 우측에 표시 — 누르면 "퍼즐
          레이팅 : n" 말풍선이 뜬다(모바일 안전 영역 클램프는 ClickInfoBadge가 담당). */}
      {puzzleRating != null && (
        <ClickInfoBadge text={t("퍼즐 레이팅 : {0}", fmtFull(puzzleRating))}>
          <span title={t("퍼즐 레이팅: 라인을 풀면 상승, 틀린 수를 두면 하락")} style={{ display: "inline-flex", alignItems: "center", gap: 4, marginLeft: 10, padding: "5px 9px", borderRadius: 999, background: "rgba(196,154,80,.16)", border: "1px solid " + T.brass, color: T.brassHi, fontSize: 11, fontWeight: 800, flexShrink: 0 }}>
            <MaterialIcon name="extension" size={11} /> {fmtFull(puzzleRating)}
          </span>
        </ClickInfoBadge>
      )}
    </div>
  );
}
const LINE_TAG_LABEL = { best: t("최선의 응수"), eval2: t("차선의 응수"), adopt: t("실전에서 가장 많이 둔 응수"), eval3: t("세 번째로 좋은 응수") };
/* ── (20차 기능1) 퍼즐 모식도 ──
   퍼즐의 분기 트리를 오프닝 모식도와 같은 가로(직선) 다이어그램으로 그린다.
   · 선 두께 = 그 수의 실전 채택률(%) — 많이 두어질수록 굵다
   · 각 노드 = 수 체계 아이콘 + SAN + 평가치 + 채택률 %
   · 해결한 라인은 초록색 선으로 칠하고 리프에 체크 표시
   · 통과 불가(유혹) 수는 점선의 막힌 가지(✕) — 유저 진영에서는 최선·우수한 수만 다음 단계로 진행
   · 노드를 클릭하면 그 가지의 라인으로 이동해 처음부터 풀이를 시작한다. 캔버스는 드래그로 이동. */
// (20차 기능1) 모식도는 "이미 실제로 두어진 수"만 보여준다 — 아직 시도하지 않은 정답·상대 응수를
// 미리 노출하면 퍼즐의 본질(직접 찾아내기)이 사라지므로, 현재 시도 중인 경로(curKeys)와 과거에 이미
// 해결한 라인의 전체 경로만 공개(revealed)하고 그 밖의 가지는 그리지 않는다.
function PuzzleSchematic({ tree, rootLabel, meta, allLines, solvedNow, curKeys, exploredKeys, setupSans, setupLen, onPick, canEdit, revealAll, onAddMove, onDeleteMove, onSuggestSiblings, onAddSibling, celebrateTag, shakeTag, fenRoot }) {
  const fsv = useSchematicFullscreen();   // (v0.6.4) 전체 화면 보기
  // (기능) 라인 레이팅 — 각 라인 끝(리프)의 "라인 N" 옆에 그 라인의 기본 레이팅을 함께 보여준다.
  // 트리 구조가 실제로 바뀔 때만 다시 계산하면 되므로(정적 요소만 쓰는 puzzleLineBaseRating), tree·
  // allLines·setupSans가 바뀔 때만 새로 계산한다.
  const lineRatings = useMemo(() => {
    const m = new Map();
    for (const l of allLines) m.set(l.tag, puzzleLineBaseRating(setupSans, tree, l, fenRoot));
    return m;
  }, [allLines, tree, setupSans, fenRoot]);
  // (20차 기능3) 개발자 모드에서는 노드 옆에 추가(+)·삭제 버튼이 나란히 붙으므로, 그 폭만큼 칸 너비를
  // 넓혀야 정작 수 이름(SAN) 라벨이 짓눌려 말줄임표로 잘리지 않는다.
  // (v0.3.2 UI) 요청에 따라 블록 크기를 기존 대비 약 50% 키움(104→156, 118→177, 56→84, 46→69 등,
  // 개발자 모드 편집 버튼 폭까지 포함한 canEdit 쪽도 동일 비율로 확대).
  const boxW = canEdit ? 315 : 156, colW = canEdit ? 336 : 177, rowH = 84, boxH = 69;
  // (v0.1.3 버그 수정) 도감 오프닝 트리는 캔버스 위에 뜨는 검색창을 가리려고 SCHEMATIC_TOP_INSET을
  // 팬 한계·자동 중앙 정렬 계산에 넘기는데, 이 모식도는 우상단에 뜨는 확대/축소 버튼에 대해 같은
  // 처리가 빠져 있었다 — 그 결과 자동 중앙 정렬이나 팬이 그 버튼 바로 밑까지 블록을 밀어 넣어,
  // 버튼이 수 라벨·평가치 위에 그대로 겹쳐 가려 보이는 경우가 있었다(특히 화면이 좁아 이 겹침이
  // 더 눈에 띄는 모바일). 버튼 높이(22)+여백만큼 위쪽을 유효 뷰포트에서 제외한다.
  const topInset = 34;
  // (v0.3.1 버그 수정, 근본 원인) 블록이 서로 겹쳐 보이던 문제 — 예전엔 리프/고스트가 실제 내부
  // 노드로 바뀌면 그 자리 번호를 freeList로 "반납"해 다음 새 리프가 재사용하게 했다. 문제는 이
  // 반납·재활용이 같은 렌더의 같은 DFS 패스 안에서 일어난다는 것 — 어떤 가지를 방문하다 한 노드가
  // 막 반납한 번호를, 같은 패스에서 아직 화면에 남아 있어야 할 다른 형제 가지의 새 리프가 곧바로
  // 이어받아 버리면, 둘 다 같은 y에 놓여 블록이 겹쳤다(반납 시점과 재사용 시점이 사람 눈에는
  // 무작위로 보여 "가끔 이상하게 겹친다"는 신고로 나타났다). 오프닝 모식도(OpeningSchematic)는
  // 애초에 이런 반납·재활용 자체가 없다 — 한 번 배정된 자리 번호는 그 키에게 영원히 고정되고,
  // 절대 다른 노드로 넘어가지 않는다. 퍼즐 모식도도 똑같은 규칙으로 맞춘다: 자리 번호는 절대
  // 반납하지 않고(freeList 삭제), 리프였다가 내부 노드가 된 키는 리프였을 때 쓰던 자리를 그대로
  // 물려받아 쓴다(자식 평균으로 다시 계산하지 않으므로 위치가 튀지도 않는다) — 처음부터 내부
  // 노드로 나타난 키만 이번에 자식 평균을 계산해 그 키에 영구히 고정한다.
  const posCacheRef = useRef(new Map());
  const nextPosRef = useRef(0);
  const { items, edges, width, height, curItem, pxItems } = useMemo(() => {
    const getPos = (key) => {
      if (posCacheRef.current.has(key)) return posCacheRef.current.get(key);
      const p = nextPosRef.current++;
      posCacheRef.current.set(key, p);
      return p;
    };
    // (20차 기능3) 개발자(canEdit)는 편집을 위해 트리 전체를 항상 볼 수 있어야 한다 — 그렇지 않으면
    // 라인을 삭제/추가한 직후 자기가 방금 만든 결과(미완성 상태 포함)조차 안 보여 계속 편집할 수 없다.
    // 일반 유저에게만 "아직 두지 않은 수는 고스트로 가린다" 원칙을 적용한다.
    // (사용자 요청) 퍼즐 만들기 3단계 미리보기처럼 편집 권한(canEdit)은 없어도(add/delete 버튼은
    // 필요 없음) 이미 생성자가 만든 트리 전체를 볼 자격은 있는 경우, revealAll로 고스트 처리만
    // 건너뛰게 한다.
    const revealed = (canEdit || revealAll) ? null : revealedPuzzleKeys(allLines, solvedNow, curKeys, exploredKeys);
    const items = []; const edges = [];
    const curKeyStr = curKeys.join(" ");
    // 실제로 둔 수(revealed)는 그대로 펼쳐 보이고, 아직 두지 않은 갈래는 "고스트"(내용은 가리되
    // 갈래가 있다는 사실만 보여주는 자리표시자)로 만든다 — 라인이 하나뿐인 것처럼 보이지 않도록.
    // (사용자 요청) 예전엔 아직 안 보이는 첫 갈림길에서만 고스트 하나를 만들고 그 밑은 아예 방문하지
    // 않아, 미해금 라인이 몇 수짜리인지·그 끝(라인 N)이 어디인지 전혀 알 수 없었다 — 이제 revealed
    // 여부와 무관하게 트리 전체를 끝(리프)까지 방문하되, 한 번 안 보이는 지점을 지나면 그 아래
    // 자손 전부를 ghost로 표시(hidden 플래그를 자식에게 전파)해 형태(노드·선·"라인 N")는 라인 끝까지
    // 그대로 드러내고 내용(수·평가치·등급)만 렌더링 단계에서 가린다.
    const visit = (node, path, depth, hidden) => {
      const key = path.map((s) => stripSuffix(s)).join(" ");
      const it = { node, path, depth, key, ghost: !!hidden };
      // (버그 수정) pass:false(유혹 수 — 통과 불가) 자식은 어차피 어디로도 이어지지 않는 막다른
      // 리프라 모식도에 "풀 수 없는 라인"으로만 보였다 — 지금은 아예 생성하지 않지만(genPuzzleTree),
      // 예전에 만들어져 이미 저장된 퍼즐에도 그대로 적용되도록 렌더링 단계에서도 완전히 건너뛴다.
      const rawKids = (node.children || []).filter((k) => k.pass !== false);
      const kids = [];
      for (const k of rawKids) {
        const kpath = [...path, k.san];
        const kkey = kpath.map((s) => stripSuffix(s)).join(" ");
        const childHidden = hidden || (!!revealed && !revealed.has(kkey));
        kids.push(visit(k, kpath, depth + 1, childHidden));
      }
      it.isLeaf = rawKids.length === 0;
      if (!kids.length) it.y = getPos(key);
      else {
        kids.forEach((c) => edges.push([it, c]));
        if (posCacheRef.current.has(key)) it.y = posCacheRef.current.get(key);   // 리프였을 때의 자리를 그대로 재사용(점프 없음)
        else { it.y = (kids[0].y + kids[kids.length - 1].y) / 2; posCacheRef.current.set(key, it.y); }   // 처음부터 내부 노드 — 이번에만 계산해 영구 고정
      }
      items.push(it);
      return it;
    };
    visit({ san: null, children: tree.children || [] }, [], 0, false);
    // 해결한 라인의 경로 키 집합(선·노드를 초록으로 표시)
    const solvedKeys = new Set(); const solvedLeafKeys = new Set();
    for (const l of allLines) {
      if (!solvedNow.has(l.tag)) continue;
      const ks = l.sans.map(stripSuffix);
      for (let i = 1; i <= ks.length; i++) solvedKeys.add(ks.slice(0, i).join(" "));
      solvedLeafKeys.add(ks.join(" "));
    }
    // 방금 해결한 라인(클리어 애니메이션용) 경로
    const celebrateKeys = new Set();
    const celebrateLine = celebrateTag && allLines.find((l) => l.tag === celebrateTag);
    if (celebrateLine) { const ks = celebrateLine.sans.map(stripSuffix); for (let i = 1; i <= ks.length; i++) celebrateKeys.add(ks.slice(0, i).join(" ")); }
    // 새로 도전 가능해진 라인의 "첫 고스트"(아직 안 보이는 첫 갈림길)에 흔들림 강조
    // (버그 수정) 개발자 모드(canEdit)에서는 위 revealed가 항상 null이다(고스트 없이 트리 전체를
    // 공개하므로) — 그 상태에서 한 라인을 풀어 다음 라인의 shakeTag가 잡히면 여기서 null.has(k)를
    // 호출해 즉시 TypeError가 터졌다. 렌더 도중 잡히지 않는 예외라 화면 전체가 하얗게 멎어버렸다
    // ("재생성 후 풀면 먹통이 된다"는 신고의 원인). 개발자 모드는 애초에 가릴 고스트가 없으니
    // revealed가 있을 때만(=일반 유저) 이 계산을 한다.
    let shakeKey = null;
    const shakeLine = shakeTag && allLines.find((l) => l.tag === shakeTag);
    if (shakeLine && revealed) { const ks = shakeLine.sans.map(stripSuffix); for (let i = 1; i <= ks.length; i++) { const k = ks.slice(0, i).join(" "); if (!revealed.has(k)) { shakeKey = k; break; } } }
    const curKeySet = new Set(); for (let i = 1; i <= curKeys.length; i++) curKeySet.add(curKeys.slice(0, i).join(" "));
    items.forEach((it) => {
      it.solved = it.depth > 0 && solvedKeys.has(it.key);
      it.solvedLeaf = it.depth > 0 && solvedLeafKeys.has(it.key);
      it.onCur = it.depth > 0 && curKeySet.has(it.key);
      it.isCur = it.key === curKeyStr;
      it.celebrate = celebrateKeys.has(it.key);
      it.shake = it.key === shakeKey;
    });
    const curItem = items.find((it) => it.isCur) || null;
    // (v0.2.7 버그 수정) 리프 노드는 이제 "라인 N" 배지·개발자 버튼만큼 boxW보다 넓게 그려질 수
    // 있으므로(위 렌더링 부분 참고), 오른쪽 여백을 배지가 잘리지 않을 만큼 넉넉히 잡는다.
    const width = (Math.max(...items.map((it) => it.depth)) + 1) * colW + 120;
    const height = (Math.max(...items.map((it) => it.y)) + 1) * rowH + 20;
    // (v0.1.2 기능) 팬 한계 계산(clampSchematicPan)은 블록의 화면 픽셀 좌표({x,y})를 기대하는데, 여기
    // items의 depth/y는 칸(그리드) 인덱스라 그대로 못 쓴다 — 실제 렌더 좌표(depth*colW, y*rowH)로
    // 변환한 가벼운 사본을 별도로 만든다(기존 items의 depth/y 필드·용도는 그대로 둔다).
    const pxItems = items.map((it) => ({ x: it.depth * colW, y: it.y * rowH }));
    return { items, edges, width, height, curItem, pxItems };
  }, [tree, allLines, solvedNow, curKeys.join(" "), exploredKeys, celebrateTag, shakeTag]);
  const [pan, setPan] = useState({ x: 8, y: 8 });
  // (사용자 요청) 도감 오프닝 트리·개발자 트리 에디터와는 별개로, 퍼즐 모식도는 블록 크기가
  // v0.3.2에서 커진 뒤로 다들 기본 배율(당시 기준 100%)이 과해 매번 50%까지 축소해서 봤다 — 그
  // "50%"를 퍼즐 모식도 전용 새 기준(100%)으로 재정의한다(PUZZLE_ZOOM_LABEL_BASE 참고).
  const [zoom, setZoom] = useState(PUZZLE_ZOOM_LABEL_BASE);
  const dragRef = useRef(null);
  const boxRef = useRef(null);
  const pointersRef = useRef(new Map());   // pointerId -> {x,y} — 두 손가락이면 핀치 확대/축소
  const pinchRef = useRef(null);           // { dist, zoom } 핀치 시작 시점 기준값
  // (v0.1.2 기능) 한 번만 등록되는 네이티브 휠 리스너에서도 항상 최신 팬 한계를 보도록 ref로 들고 있는다.
  const zoomRef = useRef(zoom);
  useEffect(() => { zoomRef.current = zoom; }, [zoom]);
  const pxItemsRef = useRef(pxItems);
  useEffect(() => { pxItemsRef.current = pxItems; }, [pxItems]);
  const clampZoom = snapPuzzleZoom;
  // (버그 수정, 도감 모식도와 동일) 확대/축소 버튼·핀치가 pan은 그대로 두고 zoom만 바꿔서, 화면
  // 좌상단(콘텐츠 원점)을 기준으로 확대/축소가 일어나 팬으로 멀리 옮겨온 화면에서는 트리 전체가
  // 화면 밖으로 사라진 것처럼 보였다 — 배율이 바뀐 뒤에도 화면 위 같은 지점(anchorX/Y)에 그 콘텐츠
  // 지점이 그대로 남도록 pan을 함께 보정한다.
  const zoomBy = (delta, anchorX, anchorY) => {
    const rect = boxRef.current ? boxRef.current.getBoundingClientRect() : { width: 380, height: 208 };
    const ax = anchorX != null ? anchorX : rect.width / 2, ay = anchorY != null ? anchorY : rect.height / 2;
    const nz = clampZoom(zoom + delta);
    if (nz === zoom) return;
    setPan(clampSchematicPan(anchoredZoomPan(pan, zoom, nz, ax, ay), nz, rect.width, rect.height, pxItems, boxW, boxH, topInset));
    setZoom(nz);
  };
  // 진행 위치가 항상 보이도록 자동 팬 — 현재 노드를 캔버스 중앙 부근으로(시작 상태는 좌상단 고정).
  // (v0.1.3 버그 수정) topInset만큼은 확대/축소 버튼이 차지하므로, 그 아래 남는 영역을 기준으로
  // 중앙 정렬해야 현재 노드가 버튼 뒤에 가려지지 않는다.
  useEffect(() => {
    const vw = boxRef.current ? boxRef.current.clientWidth : 380;
    const vh = boxRef.current ? boxRef.current.clientHeight : 208;
    const cx = curItem ? curItem.depth : 0, cy = curItem ? curItem.y : 0;
    setPan({ x: Math.min(8, (vw - boxW) / 2 - cx * colW * zoom), y: Math.min(8, topInset + (vh - topInset - boxH) / 2 - cy * rowH * zoom) });
  }, [curItem && curItem.key, tree]);
  // (20차 기능1) 페이지 넘김(좌우 스와이프)과 모식도 내부 드래그(팬)가 같은 손가락 동작을 두고
  // 경쟁하던 문제 — 이 박스는 바깥 페이저의 onPagerPointerDown이 ".no-swipe"를 보고 아예
  // 손을 떼도록(아래 JSX의 className="no-swipe") 만들어 팬 동작만 여기서 전담하게 한다.
  const onPointerDown = (e) => {
    if (e.target.closest && e.target.closest("button, input, .no-pan")) return;
    pointersRef.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    e.currentTarget.setPointerCapture(e.pointerId);
    if (pointersRef.current.size === 2) {
      const [a, b] = [...pointersRef.current.values()];
      pinchRef.current = { dist: Math.hypot(a.x - b.x, a.y - b.y), zoom };
      dragRef.current = null;
    } else {
      dragRef.current = { sx: e.clientX, sy: e.clientY, px: pan.x, py: pan.y };
    }
  };
  const onPointerMove = (e) => {
    if (!pointersRef.current.has(e.pointerId)) return;
    pointersRef.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pointersRef.current.size === 2 && pinchRef.current) {
      const [a, b] = [...pointersRef.current.values()];
      const dist = Math.hypot(a.x - b.x, a.y - b.y);
      const nz = clampZoom(pinchRef.current.zoom * (dist / Math.max(1, pinchRef.current.dist)));
      const rect = boxRef.current ? boxRef.current.getBoundingClientRect() : { left: 0, top: 0, width: 380, height: 208 };
      const anchorX = (a.x + b.x) / 2 - rect.left, anchorY = (a.y + b.y) / 2 - rect.top;
      setPan((p) => clampSchematicPan(anchoredZoomPan(p, zoom, nz, anchorX, anchorY), nz, rect.width, rect.height, pxItems, boxW, boxH, topInset));
      setZoom(nz);
      return;
    }
    if (!dragRef.current) return;
    // (v0.1.2 기능) 블록이 하나도 없는 빈 공간까지 드래그해 갈 수 없도록 한계를 둔다.
    const rect = boxRef.current ? boxRef.current.getBoundingClientRect() : { width: 380, height: 208 };
    const raw = { x: dragRef.current.px + (e.clientX - dragRef.current.sx), y: dragRef.current.py + (e.clientY - dragRef.current.sy) };
    setPan(clampSchematicPan(raw, zoom, rect.width, rect.height, pxItems, boxW, boxH, topInset));
  };
  const onPointerUp = (e) => {
    if (e && e.pointerId != null) pointersRef.current.delete(e.pointerId);
    if (pointersRef.current.size < 2) pinchRef.current = null;
    if (pointersRef.current.size === 0) dragRef.current = null;
  };
  // (버그 수정, 도감 모식도와 동일) 마우스 휠은 확대/축소가 아니라 화면 이동(팬)으로 쓰고, 확대/축소는
  // 우상단 버튼(과 두 손가락 핀치)으로만 하게 한다. React의 onWheel prop은 브라우저 스크롤 성능을
  // 위해 passive 리스너로 등록되어 e.preventDefault()가 무시되므로(휠을 굴리면 웹사이트 전체가
  // 같이 스크롤됨), ref에 직접 { passive: false } 리스너를 달아야 실제로 페이지 스크롤을 막는다.
  useEffect(() => {
    const el = boxRef.current;
    if (!el) return;
    const handleWheel = (e) => {
      e.preventDefault();
      // (v0.1.2 기능) 블록이 하나도 없는 빈 공간까지 휠로 팬해 갈 수 없도록 한계를 둔다.
      setPan((p) => {
        const raw = { x: p.x - e.deltaX, y: p.y - e.deltaY };
        const rect = boxRef.current ? boxRef.current.getBoundingClientRect() : { width: 380, height: 208 };
        return clampSchematicPan(raw, zoomRef.current, rect.width, rect.height, pxItemsRef.current, boxW, boxH, topInset);
      });
    };
    el.addEventListener("wheel", handleWheel, { passive: false });
    return () => el.removeEventListener("wheel", handleWheel);
  }, []);
  // (20차 기능1 → v0.3.5 개편) 개발자 전용 — 리프(라인의 끝)에 "+"를 누르면 그 라인에 수를 하나
  // 추가한다. 예전엔 SAN을 직접 타이핑하는 입력창 하나뿐이었는데, 사용자 요청으로 onSuggestSiblings와
  // 같은 후보 조회(puzzleCandidatesAt — 평가치 순으로 이미 정렬돼 오는 엔진 MultiPV 순위 + 채택률 %가
  // 함께 붙는다)를 재사용해 아래 형제 갈래 추가 패널과 동일한 "후보 목록에서 고르기" 방식으로
  // 바꿨다 — 직접 입력은 그 후보 중 원하는 수가 없을 때 쓰는 마지막 선택지로 목록 맨 아래에 남겨 둔다.
  const [addAt, setAddAt] = useState(null);   // path(array)|null
  const [addCands, setAddCands] = useState(null); // null=불러오는 중
  const [sanIn, setSanIn] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const openAdd = async (path) => {
    setAddAt(path); setAddCands(null); setSanIn(""); setErr("");
    const cands = await onSuggestSiblings(path);
    setAddCands(cands || []);
  };
  const pickAdd = async (cand) => {
    if (busy) return;
    setBusy(true);
    const errMsg = await onAddMove(addAt, cand.san);
    setBusy(false);
    if (errMsg) { setErr(errMsg); return; }
    setAddAt(null); setErr("");
  };
  const submitAdd = async () => {
    const san = sanIn.trim(); if (!san || busy) return;
    setBusy(true);
    const errMsg = await onAddMove(addAt, san);
    setBusy(false);
    if (errMsg) { setErr(errMsg); return; }
    setAddAt(null); setSanIn(""); setErr("");
  };
  // (20차 기능3) 개발자 전용 — 리프에서 "－"를 누르면 그 라인의 마지막 수를 하나 지운다(한 번에 한 수씩).
  const [delBusyKey, setDelBusyKey] = useState(null);
  const [delErrKey, setDelErrKey] = useState(null);
  const submitDelete = async (it) => {
    if (delBusyKey) return;
    setDelBusyKey(it.key); setDelErrKey(null);
    const errMsg = await onDeleteMove(it.path);
    setDelBusyKey(null);
    if (errMsg) setDelErrKey({ key: it.key, msg: errMsg });
  };
  // (v0.3.0 기능) 개발자 전용 — 상대 응수 노드에 형제 갈래(다른 응수 선택지)를 추가한다. 열면
  // onSuggestSiblings가 그 자리에서 자동 생성이 실제로 봤던 후보 목록(필터로 걸러졌던 것 포함)을
  // 다시 불러온다 — 골라서 누르면 바로 추가되고, 목록에 없는 수는 직접 입력할 수도 있다.
  const [siblingAt, setSiblingAt] = useState(null);   // path|null
  const [siblingCands, setSiblingCands] = useState(null); // null=불러오는 중
  const [siblingManualSan, setSiblingManualSan] = useState("");
  const [siblingErr, setSiblingErr] = useState("");
  const [siblingBusy, setSiblingBusy] = useState(false);
  const openSibling = async (path) => {
    setSiblingAt(path); setSiblingCands(null); setSiblingErr(""); setSiblingManualSan("");
    const cands = await onSuggestSiblings(path);
    setSiblingCands(cands || []);
  };
  const pickSibling = async (cand) => {
    if (siblingBusy) return;
    setSiblingBusy(true);
    const errMsg = await onAddSibling(siblingAt, cand);
    setSiblingBusy(false);
    if (errMsg) { setSiblingErr(errMsg); return; }
    setSiblingAt(null);
  };
  const submitManualSibling = async () => {
    const san = siblingManualSan.trim(); if (!san || siblingBusy) return;
    setSiblingBusy(true);
    const errMsg = await onAddSibling(siblingAt, { san, manual: true });
    setSiblingBusy(false);
    if (errMsg) { setSiblingErr(errMsg); return; }
    setSiblingAt(null);
  };
  return (
    <div style={{ marginBottom: 12 }}>
      <div ref={boxRef} className={"no-swipe" + (fsv.fs ? " schematic-fs" : "")} onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={onPointerUp} onPointerLeave={onPointerUp} onPointerCancel={onPointerUp}
        style={{ position: "relative", overflow: "hidden", overscrollBehavior: "contain", height: 208, borderRadius: 10, border: "1px solid #DCCBA8", background: "#FBF5E8", touchAction: "none", userSelect: "none", WebkitUserSelect: "none", cursor: dragRef.current ? "grabbing" : "grab" }}>
        <div className="no-pan flex" onPointerDown={(e) => e.stopPropagation()} style={{ position: "absolute", top: 6, right: 6, zIndex: 30, gap: 3, background: "rgba(255,255,255,.9)", borderRadius: 8, border: "1px solid #DCCBA8", padding: 2 }}>
          <button onClick={() => zoomBy(-PUZZLE_ZOOM_STEP)} title={t("축소")} style={{ width: 22, height: 22, borderRadius: 6, border: "none", background: "transparent", color: T.inkSoft, fontWeight: 900, cursor: "pointer", fontSize: 14 }}>－</button>
          <button onClick={() => zoomBy(PUZZLE_ZOOM_LABEL_BASE - zoom)} title={t("확대/축소 초기화")} style={{ padding: "0 6px", height: 22, borderRadius: 6, border: "none", background: "transparent", color: T.inkSoft, fontWeight: 800, cursor: "pointer", fontSize: 9.5, fontFamily: SITE_FONT }}>{puzzleZoomLabel(zoom)}</button>
          <button onClick={() => zoomBy(PUZZLE_ZOOM_STEP)} title={t("확대")} style={{ width: 22, height: 22, borderRadius: 6, border: "none", background: "transparent", color: T.inkSoft, fontWeight: 900, cursor: "pointer", fontSize: 14 }}>＋</button>
          <SchematicFsToggle fs={fsv.fs} onToggle={fsv.toggle} />
        </div>
        <SchematicFsClose fs={fsv.fs} onClose={fsv.close} />
        <div style={{ position: "absolute", left: 0, top: 0, width, height, transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`, transformOrigin: "0 0" }}>
          <svg width={width} height={height} style={{ position: "absolute", left: 0, top: 0, pointerEvents: "none", overflow: "visible" }}>
            {edges.map(([p, c], i) => {
              const x1 = p.depth * colW + boxW, y1 = p.y * rowH + boxH / 2, x2 = c.depth * colW, y2 = c.y * rowH + boxH / 2;
              if (c.ghost) return <line key={i} x1={x1} y1={y1} x2={x2} y2={y2} stroke="#C9B58C" strokeWidth={1.9} opacity={0.4} strokeDasharray="4 4" strokeLinecap="round" />;
              const adopt = c.node.adopt != null ? c.node.adopt : (meta[c.key] && meta[c.key].adopt);
              const wStroke = adopt == null ? 2.4 : 1.8 + Math.min(6.6, adopt / 6);   // 채택률에 따라 선 두께(v0.3.2 블록 확대에 맞춰 비례 확대)
              const stroke = c.solved ? T.best : c.onCur ? T.brass : "#C9B58C";
              const op = c.solved ? 0.95 : c.onCur ? 1 : 0.6;
              return <line key={i} x1={x1} y1={y1} x2={x2} y2={y2} stroke={stroke} strokeWidth={wStroke} opacity={op} strokeLinecap="round" />;
            })}
          </svg>
          {items.map((it, i) => {
            // (20차 기능2) 고스트 — 아직 두지 않은 갈래가 존재한다는 사실만 보여주고 수 정보는 가린다.
            // 트랩(통과 불가) 수는 실제 플레이로만 드러나므로 이 자리표시자와 구별 없이 함께 뭉뚱그려진다.
            // (사용자 요청) 고스트가 이제 라인 끝까지 이어지므로, 고스트 리프에도 실제 리프와 동일하게
            // "라인 N"과 그 라인의 레이팅을 보여준다 — 수·평가치·등급 같은 내용만 가려질 뿐, 몇 번째
            // 라인이고 몇 수짜리인지는 미리 알 수 있어야 어떤 라인을 도전할지 고를 수 있다.
            {
              const isGhostLeaf = it.isLeaf && it.node && it.node.tag;
              if (it.ghost) return (
                <div key={i} style={{ position: "absolute", left: it.depth * colW, top: it.y * rowH, width: "max-content", minWidth: boxW }}>
                  <div className="flex items-center gap-2">
                    <button onClick={() => onPick && onPick(it)} title={t("아직 두지 않은 갈래. 두어 보면 표시")} className="press"
                      style={{ flexShrink: 0, minWidth: boxW, minHeight: boxH, borderRadius: 12, border: "1.5px dashed #C9B58C",
                        background: "repeating-linear-gradient(135deg, rgba(0,0,0,.035) 0 6px, rgba(0,0,0,.07) 6px 12px)",
                        color: T.inkSoft, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center",
                        animation: it.shake ? "lineShake .55s ease 3" : "none" }}>
                      <span style={{ fontSize: 24, fontWeight: 800, opacity: 0.55 }}>?</span>
                    </button>
                    {isGhostLeaf && (
                      <span className="flex items-center" style={{ gap: 4, flexShrink: 0, fontSize: 14, fontWeight: 800, color: T.inkSoft, whiteSpace: "nowrap" }}>{tx("라인 {0}", allLines.findIndex((l) => l.tag === it.node.tag) + 1)}
                        <span style={{ fontSize: 11, fontWeight: 700, color: T.brass, fontFamily: SITE_FONT }}>{lineRatings.get(it.node.tag)}</span>
                      </span>
                    )}
                  </div>
                </div>
              );
            }
            const isRoot = it.depth === 0;
            const m = meta[it.key] || {};
            const kind = it.node.kind || m.kind;
            const adopt = it.node.adopt != null ? it.node.adopt : m.adopt;
            // 수 번호(예: "3.Nxe5"/"3...fxe5") — setup에 이어지는 전체 수순에서의 위치로 계산
            const label = isRoot ? (rootLabel ? moveNumber(setupLen - 1) + rootLabel : t("시작")) : moveNumber(setupLen + it.depth - 1) + it.node.san;
            const canAddHere = canEdit && !isRoot && it.isLeaf;
            // (20차 기능3) 라인은 항상 사용자 수(홀수 깊이)로 끝나야 완결된다 — 짝수 깊이에서 끝난
            // 리프는 개발자가 상대 응수만 추가하고 뒤이을 사용자 수를 아직 안 넣은 "미완성" 상태.
            const incomplete = !isRoot && it.isLeaf && it.depth % 2 === 0 && !it.node.tag;
            // (20차 기능3) 라인 길이 삭제 — 리프에서만, 최소 1수는 남도록(라인 자체가 사라지지 않게)
            const canDeleteHere = canEdit && !isRoot && it.isLeaf && it.path.length > 1;
            // (v0.3.0 기능) 형제 갈래 추가 — it.depth가 홀수(사용자 수)인 노드의 children이 상대
            // 응수 갈래다. 리프 여부와 무관하게(응수가 아예 없는 노드에도) 허용해, 자동 생성이
            // isDevelopingMove 필터 등으로 응수 후보를 통째로 걸러낸 경우에도 되살릴 수 있게 한다.
            const canAddSiblingHere = canEdit && !isRoot && it.depth % 2 === 1;
            return (
              // (v0.2.7 버그 수정) 리프(라인의 마지막 수) 노드는 오른쪽에 "라인 N"·체크 배지(그리고
              // 개발자 모드에서는 추가·삭제 버튼)가 같은 줄에 나란히 붙는데, 이 바깥 wrapper의 폭이
              // boxW로 고정돼 있어(바로 아래 버튼이 flex:1/minWidth:0로 그 폭 안에 욱여넣어졌었다)
              // 배지가 버튼의 SAN 라벨 공간을 그대로 잠식했다 — 리프일수록(=풀이의 마지막 수일수록)
              // 라벨이 더 심하게 잘려 정보가 빠져 보이는 원인이었다. wrapper를 내용에 맞춰 자라나는
              // max-content로 바꾸고, 버튼은 boxW를 최소 폭으로만 보장(flex:1 제거)해 배지가 버튼을
              // 짓누르지 않고 옆으로 자연스럽게 이어지도록 한다.
              <div key={i} style={{ position: "absolute", left: it.depth * colW, top: it.y * rowH, width: "max-content", minWidth: boxW, animation: it.celebrate ? "questclear 1s ease" : "none" }}>
                <div className="flex items-center gap-2">
                  <button onClick={() => !isRoot && onPick && onPick(it)} disabled={isRoot}
                    className={isRoot ? "" : "press"}
                    style={{ flexShrink: 0, minWidth: boxW, textAlign: "left", padding: "6px 11px", borderRadius: 12, minHeight: boxH,
                      border: (it.isCur ? "3px" : "1.5px") + " solid " + (it.isCur ? T.brassHi : incomplete ? "#D79A2F" : it.solved ? T.best : "#C9B58C"),
                      background: isRoot ? "linear-gradient(180deg,#3A2516,#241509)" : it.solved ? "#EAF3E0" : "#fff",
                      cursor: isRoot ? "default" : "pointer",
                      boxShadow: it.isCur ? "0 0 0 4px rgba(196,154,80,.25)" : "none" }}>
                    <span style={{ display: "flex", alignItems: "center", gap: 6, minWidth: 0 }}>
                      {!isRoot && kind && QCOLOR[kind] && <span style={{ width: 21, height: 21, borderRadius: "50%", flexShrink: 0, background: QCOLOR[kind], color: "#fff", display: "inline-flex", alignItems: "center", justifyContent: "center" }}>{badgeIcon(kind, 17)}</span>}
                      <span style={{ fontFamily: SITE_FONT, fontSize: 17, fontWeight: 800, color: isRoot ? T.ivoryHi : T.ink, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{label}</span>
                    </span>
                    {/* (사용자 요청) 각 수의 평가치(cp) 숫자 대신 수 체계 등급(QLABEL — "최고의 수"·
                        "탁월한 수" 등)을 보여준다 — 이미 위 원형 배지가 등급을 색·아이콘으로 보여주고
                        있었지만, 정확히 무슨 등급인지는 이름을 읽어야 알 수 있었다. */}
                    <span style={{ display: "flex", alignItems: "center", gap: 7, marginTop: 3, fontSize: 14, fontWeight: 700, color: isRoot ? "rgba(244,238,226,.75)" : T.inkSoft, fontFamily: SITE_FONT }}>
                      <span>{isRoot ? t("시작 위치") : (QLABEL[kind] || "–")}</span>
                      {!isRoot && <span style={{ marginLeft: "auto" }}>{adopt != null ? Math.round(adopt) + "%" : "–%"}</span>}
                    </span>
                    {incomplete && <div style={{ fontSize: 13, fontWeight: 800, color: "#9A6A18", marginTop: 2 }}>{t("미완성: 다음 수 필요")}</div>}
                  </button>
                  {/* (v0.2.6 버그 수정) "라인 n" 표기를 마지막 수 블록 우측으로 옮기고, 해결 완료
                      체크 표시도 SAN 옆(블록 내부) 대신 여기서 라인 n과 함께 보여준다.
                      (사용자 요청) 그 옆에 이 라인의 레이팅(puzzleLineBaseRating)도 함께 보여준다. */}
                  {it.isLeaf && !isRoot && it.node.tag && (
                    <span className="flex items-center" style={{ gap: 4, flexShrink: 0, fontSize: 14, fontWeight: 800, color: it.solvedLeaf ? T.best : T.inkSoft, whiteSpace: "nowrap" }}>
                      {tx("{0}라인 {1}", it.solvedLeaf && <span style={{ width: 21, height: 21, borderRadius: "50%", background: T.best, color: "#fff", display: "inline-flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}><Check size={15} strokeWidth={3.5} /></span>, allLines.findIndex((l) => l.tag === it.node.tag) + 1)}
                      <span style={{ fontSize: 11, fontWeight: 700, color: T.brass, fontFamily: SITE_FONT }}>{lineRatings.get(it.node.tag)}</span>
                    </span>
                  )}
                  {/* (20차 기능1) 개발자 전용 — 이 라인 끝에 수를 하나 직접 추가(전체 재생성 없이 라인별 1수 연장) */}
                  {canAddHere && <button onClick={() => openAdd(it.path)} className="press no-pan" title={t("이 라인에 수 추가")} style={{ width: boxH, height: boxH, flexShrink: 0, borderRadius: 10, border: "1px dashed " + T.brass, background: "transparent", color: T.brassHi, fontSize: 22, fontWeight: 800, cursor: "pointer", lineHeight: 1 }}>+</button>}
                  {/* (20차 기능3) 개발자 전용 — 이 라인의 마지막 수를 하나 삭제(라인 길이 단축, 한 번에 한 수씩) */}
                  {canDeleteHere && <button onClick={() => submitDelete(it)} disabled={delBusyKey === it.key} className="press no-pan" title={t("이 라인의 마지막 수 삭제")} style={{ width: boxH, height: boxH, flexShrink: 0, borderRadius: 10, border: "1px dashed " + T.blunder, background: "transparent", color: T.blunder, cursor: "pointer", display: "inline-flex", alignItems: "center", justifyContent: "center" }}><Trash2 size={20} /></button>}
                  {/* (v0.3.0 기능) 개발자 전용 — 이 수 다음에 올 상대 응수의 형제 갈래(다른 응수 선택지) 추가 */}
                  {canAddSiblingHere && <button onClick={() => openSibling(it.path)} className="press no-pan" title={t("상대 응수의 형제 갈래 추가")} style={{ width: boxH, height: boxH, flexShrink: 0, borderRadius: 10, border: "1px dashed " + T.only, background: "transparent", color: T.only, fontSize: 20, fontWeight: 800, cursor: "pointer", lineHeight: 1, display: "inline-flex", alignItems: "center", justifyContent: "center" }}>⑂</button>}
                </div>
                {delErrKey && delErrKey.key === it.key && <div className="no-pan" style={{ fontSize: 13, color: T.blunder, marginTop: 4, background: "#fff", borderRadius: 6, padding: "3px 8px", border: "1px solid " + T.blunder }}>{delErrKey.msg}</div>}
              </div>
            );
          })}
        </div>
        {/* (20차 기능1 → v0.3.5 개편) 라인 연장 패널 — 형제 갈래 추가 패널과 동일한 후보 조회
            (onSuggestSiblings)를 재사용한다. 후보는 puzzleCandidatesAt이 엔진 MultiPV 순위(=평가치
            순)로 이미 정렬해 오고, 실전 채택률 %도 함께 붙는다 — 그중 골라 누르면 바로 추가되고,
            원하는 수가 후보에 없을 때만 목록 맨 아래 직접 입력을 쓴다. */}
        {addAt && (
          <div className="no-pan" onPointerDown={(e) => e.stopPropagation()} style={{ position: "absolute", top: 10, left: "50%", transform: "translateX(-50%)", zIndex: 30, width: "min(320px, calc(100% - 20px))", maxHeight: 188, overflowY: "auto", padding: 10, borderRadius: 10, border: "1px solid " + T.brass, background: "#fff", boxShadow: "0 10px 24px -8px rgba(0,0,0,.4)" }}>
            <div className="flex items-center justify-between" style={{ marginBottom: 6 }}>
              <div style={{ fontSize: 10.5, color: T.inkSoft }}>{t("다음 수 후보")}</div>
              <button onClick={() => setAddAt(null)} className="press" style={{ padding: "2px 8px", borderRadius: 6, border: "1px solid #C9B58C", background: "transparent", color: T.inkSoft, fontWeight: 700, cursor: "pointer", fontSize: 11 }}>{t("닫기")}</button>
            </div>
            {addCands === null ? (
              <div style={{ fontSize: 11, color: T.inkSoft, padding: "6px 0" }}>{t("엔진 후보 로드 중…")}</div>
            ) : addCands.length === 0 ? (
              <div style={{ fontSize: 11, color: T.inkSoft, padding: "6px 0" }}>{t("추천 후보 없음. 아래에 직접 입력")}</div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 4, marginBottom: 8 }}>
                {addCands.map((c) => (
                  <button key={c.san} onClick={() => pickAdd(c)} disabled={busy} className="press" style={{ display: "flex", alignItems: "center", gap: 6, padding: "5px 8px", borderRadius: 7, border: "1px solid #DCCBA8", background: "#FBF5E8", cursor: busy ? "default" : "pointer", textAlign: "left" }}>
                    {c.kind && QCOLOR[c.kind] && <span style={{ width: 14, height: 14, borderRadius: "50%", flexShrink: 0, background: QCOLOR[c.kind], color: "#fff", display: "inline-flex", alignItems: "center", justifyContent: "center" }}>{badgeIcon(c.kind, 11)}</span>}
                    <span style={{ fontFamily: SITE_FONT, fontSize: 12, fontWeight: 800, color: T.ink, flexShrink: 0 }}>{c.san}</span>
                    <span style={{ fontSize: 10, color: T.inkSoft, marginLeft: "auto", flexShrink: 0 }}>{c.adopt != null ? Math.round(c.adopt) + "%" : "–%"}</span>
                  </button>
                ))}
              </div>
            )}
            <div style={{ fontSize: 10.5, color: T.inkSoft, marginBottom: 6 }}>{t("원하는 수가 없으면 직접 입력")}</div>
            <div className="flex items-center gap-2" style={{ flexWrap: "wrap" }}>
              <input value={sanIn} onChange={(e) => setSanIn(e.target.value)} onKeyDown={(e) => e.key === "Enter" && submitAdd()} placeholder={t("수 (예: Nf3)")} style={{ width: 90, padding: "6px 8px", borderRadius: 7, border: "1px solid " + (err ? T.blunder : "#C9B58C"), fontFamily: SITE_FONT, fontSize: 12.5 }} />
              <button onClick={submitAdd} disabled={busy} className="press" style={{ padding: "6px 12px", borderRadius: 7, background: "linear-gradient(180deg,#3A2516,#241509)", color: T.ivoryHi, fontWeight: 800, border: "none", cursor: "pointer", fontSize: 12 }}>{busy ? t("추가 중…") : t("추가")}</button>
            </div>
            {err && <div style={{ fontSize: 10.5, color: T.blunder, marginTop: 5 }}>{err}</div>}
          </div>
        )}
        {/* (v0.3.0 기능) 형제 갈래 추가 패널 — onSuggestSiblings가 돌려준(자동 생성이 실제로 봤던)
            후보 목록을 등급·평가치·채택률과 함께 보여준다. 골라 누르면 바로 추가되고, 목록에 없는
            수는 아래 직접 입력으로도 추가할 수 있다(kind/ev/adopt는 비워 두고 배경 보강이 채운다). */}
        {siblingAt && (
          <div className="no-pan" onPointerDown={(e) => e.stopPropagation()} style={{ position: "absolute", top: 10, left: "50%", transform: "translateX(-50%)", zIndex: 30, width: "min(320px, calc(100% - 20px))", maxHeight: 188, overflowY: "auto", padding: 10, borderRadius: 10, border: "1px solid " + T.only, background: "#fff", boxShadow: "0 10px 24px -8px rgba(0,0,0,.4)" }}>
            <div className="flex items-center justify-between" style={{ marginBottom: 6 }}>
              <div style={{ fontSize: 10.5, color: T.inkSoft }}>{t("이 자리의 상대 응수 후보")}</div>
              <button onClick={() => setSiblingAt(null)} className="press" style={{ padding: "2px 8px", borderRadius: 6, border: "1px solid #C9B58C", background: "transparent", color: T.inkSoft, fontWeight: 700, cursor: "pointer", fontSize: 11 }}>{t("닫기")}</button>
            </div>
            {siblingCands === null ? (
              <div style={{ fontSize: 11, color: T.inkSoft, padding: "6px 0" }}>{t("엔진 후보 다시 로드 중…")}</div>
            ) : siblingCands.length === 0 ? (
              <div style={{ fontSize: 11, color: T.inkSoft, padding: "6px 0" }}>{t("추가 후보 없음. 아래에 직접 입력")}</div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 4, marginBottom: 8 }}>
                {siblingCands.map((c) => (
                  <button key={c.san} onClick={() => pickSibling(c)} disabled={siblingBusy} className="press" style={{ display: "flex", alignItems: "center", gap: 6, padding: "5px 8px", borderRadius: 7, border: "1px solid #DCCBA8", background: "#FBF5E8", cursor: siblingBusy ? "default" : "pointer", textAlign: "left" }}>
                    {c.kind && QCOLOR[c.kind] && <span style={{ width: 14, height: 14, borderRadius: "50%", flexShrink: 0, background: QCOLOR[c.kind], color: "#fff", display: "inline-flex", alignItems: "center", justifyContent: "center" }}>{badgeIcon(c.kind, 11)}</span>}
                    <span style={{ fontFamily: SITE_FONT, fontSize: 12, fontWeight: 800, color: T.ink, flexShrink: 0 }}>{c.san}</span>
                    <span style={{ fontSize: 10, color: T.inkSoft, marginLeft: "auto", flexShrink: 0 }}>{c.adopt != null ? Math.round(c.adopt) + "%" : "–%"}</span>
                  </button>
                ))}
              </div>
            )}
            <div className="flex items-center gap-2" style={{ flexWrap: "wrap" }}>
              <input value={siblingManualSan} onChange={(e) => setSiblingManualSan(e.target.value)} onKeyDown={(e) => e.key === "Enter" && submitManualSibling()} placeholder={t("직접 입력(예: Be6)")} style={{ width: 100, padding: "6px 8px", borderRadius: 7, border: "1px solid " + (siblingErr ? T.blunder : "#C9B58C"), fontFamily: SITE_FONT, fontSize: 12.5 }} />
              <button onClick={submitManualSibling} disabled={siblingBusy} className="press" style={{ padding: "6px 12px", borderRadius: 7, background: "linear-gradient(180deg,#3A2516,#241509)", color: T.ivoryHi, fontWeight: 800, border: "none", cursor: "pointer", fontSize: 12 }}>{siblingBusy ? t("추가 중…") : t("추가")}</button>
            </div>
            {siblingErr && <div style={{ fontSize: 10.5, color: T.blunder, marginTop: 5 }}>{siblingErr}</div>}
          </div>
        )}
      </div>
    </div>
  );
}
// (v0.2.6 기능) 퍼즐 힌트 3단계 — 기물의 행마법을 따라 출발 칸부터 도착 칸까지 한 칸씩 순서대로
// 반짝일 경로를 만든다. 슬라이딩 기물(R/B/Q)은 지나가는 칸을 그대로 순서대로 담고, 킹·폰처럼
// 한 칸만 움직이는 기물은 도착 칸 하나만 담는다. 나이트는 실제로는 두 칸을 "건너뛰"지만, 시각적
// 연출을 위해 항상 같은 방식(더 긴 축을 먼저 두 칸 이동한 뒤 짧은 축으로 한 칸)으로 경로를
// 고정해 매번 같은 모양으로 보이게 한다.
function hintPathSquares(pieceType, from, to) {
  const [fr, fc] = from, [tr, tc] = to;
  const dr = tr - fr, dc = tc - fc;
  if (pieceType === "N") {
    const mid = Math.abs(dr) === 2 ? [tr, fc] : [fr, tc];
    return [mid, [tr, tc]];
  }
  if (pieceType === "R" || pieceType === "B" || pieceType === "Q") {
    const steps = Math.max(Math.abs(dr), Math.abs(dc));
    const sr = dr === 0 ? 0 : dr / Math.abs(dr), sc = dc === 0 ? 0 : dc / Math.abs(dc);
    const path = [];
    for (let i = 1; i <= steps; i++) path.push([fr + sr * i, fc + sc * i]);
    return path;
  }
  return [[tr, tc]];   // 킹·폰 — 한 칸만 이동하므로 도착 칸 자체가 유일한 "경로"
}
// (v0.2.6 기능) 퍼즐 코치 말풍선이 막연한 안내 대신 지금 보드 포지션을 짧게 요약해 설명한다 —
// 사용자 진영 기준 기물 점수차와 체크 여부를 바탕으로 한 줄 코멘트를 만든다.
function summarizePosition(board, userColor) {
  const oppColor = userColor === "w" ? "b" : "w";
  const kp = kingPos(board, oppColor);
  if (kp && isAttacked(board, kp[0], kp[1], userColor)) return t("상대 킹 체크. 공격 진행 중");
  // (기능) 자체 포지션 평가 AI의 기물 긴장 신호 — 걸린 기물이 있으면 막연한 점수차 안내보다 훨씬
  // 구체적인 힌트가 된다(FEN 기반 tensionFacts, Stockfish 없이 즉시 계산).
  const t_ = tensionFacts(board, userColor);
  if (t_.theirs.length) return t("상대 {0} 노출. 잡을 기회 찾기", PIECE_KOR[t_.theirs[0].piece]);
  if (t_.mine.length) return t("내 {0} 위험. 안전하게 지킬 수 찾기", PIECE_KOR[t_.mine[0].piece]);
  const diff = materialDiff(board, userColor);
  if (diff >= 3) return t("기물 점수 크게 우세. 확실히 마무리할 수 찾기");
  if (diff >= 1) return t("기물 점수 소폭 우세. 이점을 굳히는 수 찾기");
  if (diff <= -3) return t("기물 점수 크게 열세. 반격할 결정적인 수 필요");
  if (diff <= -1) return t("기물 점수 소폭 열세. 포지션을 뒤집을 수 찾기");
  return t("기물 점수 팽팽. 포지션을 유리하게 이끌 수 찾기");
}
// (사용자 요청, v0.3.9) 퍼즐 라인 클리어 — 아래 PuzzleClearBanner와 완전히 같은 디자인·애니메이션
// (typoLetters 글자별 팝인, 같은 글자 크기·재생 시간, 방사형 글로우 배경)을 쓴다. 별 3개 대신, 그
// 자리에 초록 원이 먼저 그려진 뒤 안에 체크 표시가 그려지는 "성공" 애니메이션을 넣어 텍스트보다
// 먼저 재생한다(요청: "초록색 원과 체크 표시가 되는 애니메이션을 먼저 삽입"). trigger(라인 태그)가
// 바뀔 때마다 key로 리마운트돼 다시 재생된다. 보드/모식도 페이저 위에 pointer-events:none으로
// 얹혀 조작을 가리지 않는다. (v0.3.9) 재생 시간이 PuzzleClearBanner와 같아진 만큼, 아래
// PuzzleSolver의 celebrate 자동 종료 타이머도 이 길이에 맞춰 늘렸다.
function LineClearBanner({ trigger }) {
  if (!trigger) return null;
  return (
    <div key={trigger} aria-hidden="true" style={{ position: "fixed", inset: 0, zIndex: 15, pointerEvents: "none", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 14, overflow: "hidden", opacity: 0, animation: "puzzleClearFade 4.2s ease-out both" }}>
      <div style={{ position: "absolute", inset: 0, background: "rgba(10,6,3,.55)" }} />
      <div aria-hidden="true" style={{ position: "absolute", width: 440, height: 440, borderRadius: "50%", background: "radial-gradient(circle, rgba(236,203,134,.28) 0%, rgba(236,203,134,0) 70%)", opacity: 0, animation: "puzzleClearFade 4.2s ease-out .15s both" }} />
      <div style={{ position: "relative", height: 60, display: "flex", alignItems: "center", justifyContent: "center" }}>
        <svg width="60" height="60" viewBox="0 0 120 120" style={{ filter: "drop-shadow(0 0 8px rgba(74,222,128,.75))" }}>
          <circle cx="60" cy="60" r="34" fill="none" stroke="#4ADE80" strokeWidth="7" strokeLinecap="round" strokeDasharray="214" strokeDashoffset="214" style={{ animation: "checkDraw .45s ease-out both" }} />
          <path d="M44 62 L54 72 L78 46" fill="none" stroke="#4ADE80" strokeWidth="7" strokeLinecap="round" strokeLinejoin="round" strokeDasharray="50" strokeDashoffset="50" style={{ animation: "checkDraw .25s ease-out .45s both" }} />
        </svg>
      </div>
      <div style={{ position: "relative", display: "flex", flexDirection: "column", alignItems: "center", gap: 2 }}>
        <div style={{ display: "flex" }}>{typoLetters("LINE", T.book, 0.85, 46, 4)}</div>
        <div style={{ display: "flex" }}>{typoLetters("CLEAR", T.brassHi, 1.1, 46, 4)}</div>
      </div>
    </div>
  );
}
// (사용자 요청, v0.3.8 → v0.3.9 라인 클리어와 공유) 클리어 배너의 글자 하나하나가 제각기 다른
// 각도로 튕겨 들어와 자리를 잡는 타이포그래피 연출용 헬퍼 — 단어를 통째로 슬라이드시키던 예전
// 방식 대신 글자 단위로 스태거(stagger)해 포스터 문구 같은 느낌을 낸다. LineClearBanner·
// PuzzleClearBanner 둘 다 이 헬퍼 하나를 그대로 써서 "완전히 같은 디자인·애니메이션"(사용자 요청)이
// 되도록 하고, 글자 크기(size)만 배너별로 다르게 준다. 등장 도중에만(--tr) 살짝 회전했다가 각 글자의
// keyframe(puzzleLetterPop)이 끝나는 시점엔 항상 rotate(0deg)로 되돌아와, 다 자리 잡은 뒤에는 어떤
// 글자도 기울어져 있지 않다(요청: "텍스트가 기울어지지는 않게").
function typoLetters(word, color, startDelay, size = 46, spacing = 0) {
  const chars = word.split("");
  return chars.map((ch, i) => (
    <span key={i} style={{
      display: "inline-block", fontFamily: CLEAR_TYPO_FONT, fontSize: size, color,
      textShadow: "0 4px 14px rgba(0,0,0,.7)", opacity: 0,
      marginRight: i < chars.length - 1 ? spacing : 0,
      "--tr": ((i % 2 === 0 ? -1 : 1) * (10 - (i % 3) * 3)) + "deg",
      animation: "puzzleLetterPop .55s cubic-bezier(.22,1.6,.4,1) " + (startDelay + i * 0.05) + "s both",
    }}>{ch === " " ? " " : ch}</span>
  ));
}
// (사용자 요청) 퍼즐 전체(모든 라인) 클리어 — LINE CLEAR와 같은 느낌의 어두운 배경 위에, 별 3개가
// 하나씩 빛나며 등장한 뒤 "PUZZLE"(갈색)·"CLEAR"(금색)이 글자 단위로 튕겨 들어온다. (사용자 요청,
// v0.3.9) LINE CLEAR 배너가 완전히 재생되고 사라진 뒤에야 나타나도록, 지연 시간을 LINE CLEAR의
// 총 재생 시간(4.2s)과 같게 맞췄다(1.1s → 4.2s) — 내부 요소들의 절대 딜레이도 전부 +3.1s 밀어
// 배너가 나타난 시점 기준의 상대적인 등장 타이밍은 그대로 유지한다. celebrate 자동 종료 타이머
// (아래 PuzzleSolver의 useEffect)도 늘어난 총 길이(4.2s 지연 + 4.2s 재생)에 맞춰 함께 늦춰야 한다.
function PuzzleClearBanner({ trigger }) {
  if (!trigger) return null;
  return (
    <div key={trigger} aria-hidden="true" style={{ position: "fixed", inset: 0, zIndex: 16, pointerEvents: "none", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 14, overflow: "hidden", opacity: 0, animation: "puzzleClearFade 4.2s ease-out 4.2s both" }}>
      <div style={{ position: "absolute", inset: 0, background: "rgba(10,6,3,.7)" }} />
      <div aria-hidden="true" style={{ position: "absolute", width: 440, height: 440, borderRadius: "50%", background: "radial-gradient(circle, rgba(236,203,134,.32) 0%, rgba(236,203,134,0) 70%)", opacity: 0, animation: "puzzleClearFade 4.2s ease-out 4.4s both" }} />
      <div style={{ position: "relative", height: 60, display: "flex", alignItems: "center", justifyContent: "center", gap: 10 }}>
        {[0, 1, 2].map((i) => (
          <span key={i} style={{ display: "inline-flex", opacity: 0, animation: "puzzleStarPop .5s cubic-bezier(.34,1.56,.64,1) " + (4.4 + i * 0.22) + "s both" }}>
            <Star size={30} fill={T.brassHi} color={T.brassHi} style={{ filter: "drop-shadow(0 0 9px rgba(236,203,134,.9))" }} />
          </span>
        ))}
      </div>
      {/* (사용자 요청, v0.3.9) 다 자리 잡은 뒤 텍스트가 기울어 보이지 않도록, 단어 전체를 감싸던
          정적 rotate(-2.5deg)/rotate(2deg) 기울임을 없앴다 — 글자별 등장 모션(typoLetters의 --tr)만
          으로 충분히 역동적이라 굳이 정지 상태까지 기울일 필요가 없다. */}
      <div style={{ position: "relative", display: "flex", flexDirection: "column", alignItems: "center", gap: 2 }}>
        <div style={{ display: "flex" }}>{typoLetters("PUZZLE", T.book, 5.1)}</div>
        <div style={{ display: "flex" }}>{typoLetters("CLEAR", T.brassHi, 5.45)}</div>
      </div>
    </div>
  );
}
/* (20차 기능1) 퍼즐 풀이 — 고정된 단일 라인이 아니라 분기 트리를 탐색한다.
   · 유저 차례: 트리의 '통과 가능(최선·우수)' 수만 정답으로 다음 단계 진행. 표시용 유혹 수·그 외 수는 오답.
   · 상대 차례: 목표 라인을 따라가되, 목표에서 벗어나면 미해결 라인이 남은 가지(채택률 순)를 자동 선택.
   · 리프(사용자 수)에 도달하면 그 라인 해결 — 별은 해결 라인 1개 이상 ★1 / 전체의 50% 이상 ★2 / 전부 ★3. */
function PuzzleSolver({ puzzle, onClose, onLineSolved, onPuzzleSolveEvent, onPuzzleRatingEvent, solveCount, solvedTags, friendSolverNames, isLiked, likeCount, onToggleLike, isReposted, repostCount, onToggleRepost, shareCount, onShare, myUid, myPuzzleRating, engine, liveOn, canEdit, bumpContent, initialLineNo, onLineChange, onOpenLearn, lineClearOn, puzzleClearOn, coachBubbleOn, onDeletePuzzle, onPuzzleRenamed, onOpenProfile, onOpenLearnFen }) {
  // (사용자 요청) 퍼즐 생성자에 한해, 2페이지(모식도)에서 자신이 만든 퍼즐을 삭제할 수 있게 — 실수로
  // 지우지 않도록 확인 다이얼로그를 한 번 더 띄운다(대화·친구 삭제 확인과 같은 패턴).
  const [confirmDeletePuzzle, setConfirmDeletePuzzle] = useState(false);
  // (버그 수정) onDeletePuzzle이 이제 서버 삭제 성공 여부를 boolean으로 돌려준다 — 실패(권한 없음·
  // 네트워크 오류 등)하면 창을 닫지 않고 이 자리에 오류를 보여준다.
  const [deletingPuzzle, setDeletingPuzzle] = useState(false);
  const [deletePuzzleErr, setDeletePuzzleErr] = useState("");
  const doDeletePuzzle = async () => {
    setDeletingPuzzle(true); setDeletePuzzleErr("");
    const ok = await onDeletePuzzle(puzzle.id);
    if (!ok) { setDeletingPuzzle(false); setDeletePuzzleErr(t("퍼즐 삭제 실패. 잠시 후 다시 시도")); return; }
    setConfirmDeletePuzzle(false);
  };
  const theme = primaryTheme(puzzle);
  const setup = useMemo(() => [...(puzzle.setupSans || []), puzzle.mistakeSan].filter(Boolean), [puzzle.id]);
  // (v0.4.1 기능, item 5) FEN 기반 사용자 생성 퍼즐 — setupSans(대국에서 이어지는 실제 수순)가 없고
  // puzzle.fen(시작 포지션)만 있으면, 그 FEN을 루트로 재생한다. setupSans가 있는(기존 대국 기반)
  // 퍼즐은 지금까지처럼 표준 시작 위치 재생을 그대로 쓴다 — boardOfRoot/fenOfRoot가 fenRoot 없을 때
  // 기존 동작과 완전히 같으므로 구버전 퍼즐(setupSans도 fen도 없는 레거시 데이터)도 그대로 동작한다.
  const fenRoot = useMemo(() => {
    if (puzzle.setupSans && puzzle.setupSans.length) return null;
    return puzzle.fen ? parseFenFull(puzzle.fen) : null;
  }, [puzzle.id]);
  const userColor = plyIsWhite(setup.length, fenRoot ? fenRoot.turn : "w") ? "w" : "b";   // 보드 방향 고정(상대 응수 때도 반전하지 않음)
  // 분기 트리: 개발자 길이 재조정(CONTENT.puzzleOverrides — 모든 유저 공통) > 저장된 tree > 구버전 lines/solution
  const [overrideTree, setOverrideTree] = useState(null);
  useEffect(() => { setOverrideTree(null); }, [puzzle.id]);
  // (20차 UX4) 퍼즐 목록에서 스크롤을 내린 채로 카드를 눌러 들어오면 이전 스크롤 위치가 그대로 남아
  // 보드(특히 응수 애니메이션 중인 기물)가 화면 아래 하단 탭 뒤로 가려지던 문제 — 진입 시 맨 위로 스크롤.
  useEffect(() => { window.scrollTo({ top: 0, behavior: "auto" }); }, [puzzle.id]);
  // (v0.3.4 기능) 사용자 요청 — 이 퍼즐의 생성자를 조회해 풀이 카드에 표시하고, 생성자 본인에게는
  // 개발자와 같은 편집 권한(1시간 주기)을 준다. 퍼즐을 열 때마다 서버에서 새로 가져온다 — 개발자가
  // 방금 재지정했을 수도 있고, 1시간 주기가 지났는지도 매번 최신값으로 판단해야 하기 때문이다.
  // (버그 수정, 사용자 제보) 방금 만든 퍼즐은 submitPuzzleCreate가 onSavePuzzle(저장) 직후 곧바로
  // setActive로 이 화면을 연다 — 그런데 실제 생성자 기록은 onSavePuzzle 안에서 fire-and-forget으로
  // 실행되는 puzzleShare(퍼즐 행 upsert → puzzle_claim_creator RPC, 순차 네트워크 요청 2번)가 서버에
  // 반영해야 비로소 조회된다. 이 화면이 마운트되며 딱 한 번만 조회하던 예전 코드는 그 두 요청이
  // 끝나기 전에 항상 먼저 도착해 매번 "생성자 없음"(null)으로 확정돼 버렸고, 재시도가 없어 실제로
  // 서버에 생성자가 기록된 뒤에도 화면에는 영원히 반영되지 않았다(그 퍼즐을 나갔다가 다시 들어와야만
  // 보였다) — 방금 만든 퍼즐일수록 100% 재현됐다. 못 찾으면 짧은 간격으로 몇 번 더 재시도한다.
  const [creatorInfo, setCreatorInfo] = useState(null); // { uid, username, editedAt } | null
  const puzzleNoForTag = puzzleNo(puzzle.id);
  useEffect(() => {
    let cancelled = false;
    let tries = 0;
    setCreatorInfo(null);
    const attempt = () => {
      puzzleCreatorInfo(puzzleNoForTag).then((info) => {
        if (cancelled) return;
        if (info) { setCreatorInfo(info); return; }
        tries++;
        if (tries < 5) setTimeout(attempt, 1000 * tries);
      });
    };
    attempt();
    return () => { cancelled = true; };
  }, [puzzleNoForTag]);
  const isMyPuzzle = !!(myUid && creatorInfo && creatorInfo.uid === myUid);
  // (v0.4.9 기능, 사용자 요청) FEN 기반 사용자 생성 퍼즐(오프닝 트리에서 이름을 따올 수 없어 생성자가
  // 직접 지은 이름)은 생성자 본인 또는 개발자/공동개발자가 이름을 나중에 고칠 수 있다 — 검열 기준은
  // 학습 탭 "수 설명"과 동일(containsBannedWord가 서버 puzzle_set_name RPC 전 1차 방어선).
  const canRenamePuzzle = !!fenRoot && (isMyPuzzle || canEdit);
  const [nameOverride, setNameOverride] = useState(null);
  const [editingName, setEditingName] = useState(false);
  const [nameInput, setNameInput] = useState("");
  const [nameErr, setNameErr] = useState("");
  const [nameBusy, setNameBusy] = useState(false);
  useEffect(() => { setNameOverride(null); setEditingName(false); setNameErr(""); }, [puzzle.id]);
  const displayPuzzleName = nameOverride != null ? nameOverride : livePuzzleName(puzzle);
  const startEditName = () => { setNameInput(displayPuzzleName || ""); setNameErr(""); setEditingName(true); };
  const saveEditName = async () => {
    const v = nameInput.trim();
    if (!v) { setNameErr(t("이름 입력 필요")); return; }
    if (v.length > 60) { setNameErr(t("이름은 60자 이내")); return; }
    if (containsBannedWord(v)) { setNameErr(t("부적절한 표현 포함")); return; }
    setNameBusy(true);
    const ok = await puzzleSetName(puzzleNoForTag, v);
    setNameBusy(false);
    if (ok) { setNameOverride(v); setEditingName(false); onPuzzleRenamed && onPuzzleRenamed(puzzle.id, v); }
    else setNameErr(t("저장 실패. 잠시 후 다시 시도 (1시간에 한 번만 변경 가능)"));
  };
  const [nowTick, setNowTick] = useState(Date.now());
  useEffect(() => {
    if (!isMyPuzzle || canEdit) return; // 개발자는 주기 표시가 필요 없다(항상 편집 가능)
    const iv = setInterval(() => setNowTick(Date.now()), 15000);
    return () => clearInterval(iv);
  }, [isMyPuzzle, canEdit]);
  const creatorCooldownMs = useMemo(() => {
    if (!isMyPuzzle || canEdit || !creatorInfo || !creatorInfo.editedAt) return 0;
    return Math.max(0, new Date(creatorInfo.editedAt).getTime() + 60 * 60 * 1000 - nowTick);
  }, [isMyPuzzle, canEdit, creatorInfo, nowTick]);
  // 개발자는 항상, 생성자 본인은 주기가 지났을 때만 이 퍼즐을 편집할 수 있다.
  const canEditPuzzle = canEdit || (isMyPuzzle && creatorCooldownMs <= 0);
  // (기능) 생성자 본인의 편집은 CONTENT.puzzleOverrides(개발자/공동개발자만 쓸 수 있는 공유
  // app_content 블롭)가 아니라 puzzles.data에 직접 저장된다(puzzle_creator_save RPC) — 아래
  // persistEdit이 편집 주체에 따라 저장 창구를 나눠 준다.
  const tree = useMemo(() => overrideTree || puzzleTreeOf(puzzle), [puzzle.id, overrideTree]);
  const allLines = useMemo(() => treeLinesOf(tree), [tree]);
  const totalLines = Math.max(1, allLines.length);
  // (기능) 퍼즐 레이팅 — 모든 라인의 기본 레이팅 평균(라인 레이팅 합 ÷ 라인 수). 카드 목록의
  // 배지와 동일하게 정적 요소만 쓰는 값이라 네트워크 없이 즉시 계산된다.
  const avgRating = useMemo(() => puzzleAverageRating(allLines.map((l) => puzzleLineBaseRating(setup, tree, l, fenRoot))), [allLines, tree, setup, fenRoot]);
  const solvedTagSet = useMemo(() => { const valid = new Set(allLines.map((l) => l.tag)); return new Set((solvedTags || []).filter((t) => valid.has(t))); }, [solvedTags, allLines]);
  const [sessionSolved, setSessionSolved] = useState(() => new Set());
  const solvedNow = useMemo(() => new Set([...solvedTagSet, ...sessionSolved]), [solvedTagSet, sessionSolved]);
  // 진행 상태: 트리를 따라 내려온 노드 경로(짝수 인덱스 = 사용자 수) + 지금 목표로 삼은 라인
  const [pathNodes, setPathNodes] = useState([]);
  const [targetTag, setTargetTag] = useState(null);
  // (기능) 퍼즐 레이팅용 — 지금 시도 중인 라인을 언제부터 풀기 시작했는지(gotoLine이 호출되거나
  // 퍼즐/트리가 바뀌어 새 라인으로 초기화될 때마다 지금 시각으로 다시 잡는다). done이 되는 순간
  // 이 값과의 차이를 실제 풀이 시간(ms)으로 서버에 기록한다(puzzleLineSolveTimeAdd).
  const solveStartRef = useRef(Date.now());
  const [intro, setIntro] = useState(true);   // (UX7) 진입/처음부터 시 직전 수를 1회 재생
  const [sel, setSel] = useState(null);
  // (버그 수정, 사용자 제보) 퍼즐 풀이 화면에는 프로모션 선택 UI가 아예 없어 폰이 마지막 랭크에
  // 닿으면 buildSan이 항상 퀸으로만 승격시켰다 — 언더프로모션(룩/비숍/나이트)으로만 통과되는 라인은
  // 구조적으로 풀 수 없었다. ReviewPage·PlayPage와 같은 promoPrompt 패턴을 그대로 들여와, 폰이
  // 마지막 랭크로 이동하는 수는 곧장 두지 않고 먼저 승격 기물을 고르게 한다.
  const [promoPrompt, setPromoPrompt] = useState(null); // { from, to } | null
  // (v0.5.1 UI, 사용자 요청) 승격 선택 오버레이를 실제 8x8 그리드 안으로 포털하기 위한 참조.
  const [promoGridEl, setPromoGridEl] = useState(null);
  const [wrong, setWrong] = useState(null);     // { board, at:[r,c], from:[r,c], san }
  // (v0.1.2 기능) 오답을 두면 곧장 원위치로 되돌리는 대신, 그 수를 뒀을 때 상대(컴퓨터)가 어떻게
  // 응징하는지 최선 응수를 한 번 보여준 뒤 되돌린다 — wrongReply가 그 응수({san,from,to}), revertStage가
  // 되돌리는 두 단계(응수부터 먼저, 그다음 원래 오답) 중 지금 재생 중인 단계를 가리킨다.
  const [wrongReply, setWrongReply] = useState(null);   // { san, from:[r,c], to:[r,c] } | null
  const [revertStage, setRevertStage] = useState(null);   // null | "reply" | "wrong"
  const reverting = revertStage != null;   // (UX4) 오답 후 원위치로 되돌아가는 애니메이션 중(둘 중 한 단계라도)
  const [reply, setReply] = useState(null);      // { sans, san, node }  상대 응수 애니메이션
  // (v0.2.6 개편) 텍스트 힌트("~을 움직여 보세요") 대신 3단계 시각 힌트로 개편 — 누를 때마다
  // 단계가 올라간다(1: 도착 칸 반짝임, 2: 움직일 기물 흔들림, 3: 기물이 흔들리며 행마법을 따라
  // 출발 칸부터 도착 칸까지 한 칸씩 순서대로 반짝이는 경로 애니메이션).
  const [hintLevel, setHintLevel] = useState(0);
  const [hintStepIdx, setHintStepIdx] = useState(0);
  // (20차 기능2) 보드 페이지(0)/모식도 페이지(1) 좌우 넘기기 — 모식도가 보드 위를 차지해 한눈에
  // 안 들어오던 문제를 해결한다. celebrate는 방금 해결한 라인의 클리어 애니메이션(모식도 페이지),
  // shakeTag는 그 직후 도전 가능해진 다음 라인을 살짝 흔들어 "클릭하면 바로 풀 수 있다"를 강조한다.
  const [page, setPage] = useState(0);
  const [celebrate, setCelebrate] = useState(null);   // { tag } | null
  // (사용자 요청) 코치(마스코트) 말풍선은 이제 기본으로 숨겨져 있고, 화면 안에서 보였다 숨겼다 하는
  // 버튼도 없앴다 — 오직 설정 탭 "퍼즐 설정" 카드의 "코치 말풍선" 토글로만 켜고 끌 수 있다.
  const coachHidden = coachBubbleOn === false;
  const pagerRef = useRef(null);
  const dragRef = useRef(null);
  const [dragPx, setDragPx] = useState(0);
  const dragging = !!dragRef.current;
  const onPagerPointerDown = (e) => {
    if (e.target.closest && e.target.closest("button, input, .no-pan, .no-swipe")) return;
    dragRef.current = { x: e.clientX, w: pagerRef.current ? pagerRef.current.clientWidth : 380 };
    e.currentTarget.setPointerCapture(e.pointerId);
  };
  const onPagerPointerMove = (e) => { if (!dragRef.current) return; setDragPx(e.clientX - dragRef.current.x); };
  const onPagerPointerUp = () => {
    const st = dragRef.current; dragRef.current = null;
    if (!st) { setDragPx(0); return; }
    const threshold = st.w * 0.16;
    if (dragPx <= -threshold && page === 0) setPage(1);
    else if (dragPx >= threshold && page === 1) setPage(0);
    setDragPx(0);
  };
  // 퍼즐/트리가 바뀌면 미해결 라인부터 새로 시작
  useEffect(() => {
    setSessionSolved(new Set());
    setEverRevealed(new Set());
    setPathNodes([]); setWrong(null); setReply(null); setSel(null); setIntro(true); setHintLevel(0);
    setPage(0); setCelebrate(null); setPromoPrompt(null);
    solveStartRef.current = Date.now();
    const first = allLines.find((l) => !solvedTagSet.has(l.tag)) || allLines[0];
    setTargetTag(first ? first.tag : null);
  }, [puzzle.id, tree]);
  // (v0.3.4 기능) 사용자 요청 — 퍼즐 풀이 창 고유 URL(openchess.kr/(퍼즐 번호)-(라인 번호))로 들어왔을
  // 때, 위 "미해결 라인부터" 기본값 대신 그 특정 라인으로 바로 이동한다. 위 effect 바로 다음에 둬서
  // (같은 커밋 안 effect는 선언 순서대로 실행됨) 기본값을 정한 뒤 필요할 때만 곧바로 덮어쓴다.
  useEffect(() => {
    if (initialLineNo == null) return;
    const line = allLines[initialLineNo - 1];
    if (line) gotoLine(line.tag);
  }, [puzzle.id, initialLineNo]);
  // (v0.3.4 기능) 사용자 요청 — 지금 풀고 있는(또는 보고 있는) 라인 번호를 부모에게 알려, 퍼즐 풀이
  // 창 고유 URL(openchess.kr/(퍼즐 번호)-(라인 번호))이 항상 실제로 보이는 라인을 가리키게 한다.
  useEffect(() => {
    if (!onLineChange) return;
    const idx = allLines.findIndex((l) => l.tag === targetTag);
    if (idx >= 0) onLineChange(idx + 1);
  }, [targetTag, allLines, onLineChange]);
  // (버그 수정) 모식도는 "실제로 두어진 수"만 보여주는데, 그 기준이 지금 진행 중인 pathNodes였다 —
  // 그래서 라인을 몇 수 두어 보다가(아직 못 풀고) "처음부터"를 누르면 pathNodes가 비워지면서 그
  // 라인에서 이미 드러났던 수들이 모식도에서 도로 고스트(가려짐)로 돌아가, 마치 진행 상황이 통째로
  // 사라진 것처럼 보였다. pathNodes와 별개로 "이 세션에서 한 번이라도 실제로 둔 수" 전체를 계속
  // 누적해 두고, 모식도의 공개 여부는 이 누적 집합(+해결한 라인) 기준으로만 판단한다 — 재시작해도
  // 보드 진행(pathNodes)만 초기화될 뿐, 이미 들여다본 모식도 부분은 그대로 남는다.
  const [everRevealed, setEverRevealed] = useState(() => new Set());
  useEffect(() => {
    if (!pathNodes.length) return;
    setEverRevealed((prev) => {
      const keyArr = pathNodes.map((n) => stripSuffix(n.san));
      let changed = false;
      const next = new Set(prev);
      for (let i = 1; i <= keyArr.length; i++) { const k = keyArr.slice(0, i).join(" "); if (!next.has(k)) { next.add(k); changed = true; } }
      return changed ? next : prev;
    });
  }, [pathNodes]);
  const targetLine = allLines.find((l) => l.tag === targetTag) || allLines[0] || null;
  const curNode = pathNodes.length ? pathNodes[pathNodes.length - 1] : tree;
  const curSans = useMemo(() => [...setup, ...pathNodes.map((n) => n.san)], [setup, pathNodes]);
  const fenReplay = useMemo(() => (fenRoot ? replayFromFen(fenRoot, curSans) : null), [curSans.join(" "), fenRoot]);
  const board = useMemo(() => (fenRoot ? fenReplay.board : boardFromSans(curSans)), [curSans.join(" "), fenRoot, fenReplay]);
  const color = plyIsWhite(curSans.length, fenRoot ? fenRoot.turn : "w") ? "w" : "b";
  const oppColor = color === "w" ? "b" : "w";   // (v0.1.2 기능) 오답 응징 응수를 두는 상대 진영
  const ep = fenRoot ? fenReplay.ep : epTarget(curSans);
  const isUserPly = pathNodes.length % 2 === 0;
  const passKids = (curNode.children || []).filter((k) => k.pass !== false);
  const done = pathNodes.length > 0 && pathNodes.length % 2 === 1 && passKids.length === 0;   // 리프(사용자 수)에 도달
  const doneTag = done ? (curNode.tag || pathNodes.map((n) => stripSuffix(n.san)).join(" ")) : null;
  const userToMove = !done && isUserPly && !wrong && !reply && !intro && allLines.length > 0;
  // (v0.2.7에서 도입했던 "평가치 막대가 depth가 깊어지며 실시간으로 움직이는" 연출을 되돌린다 —
  // 정확한 수를 두어도 막대 숫자가 한동안 계속 바뀌는 것처럼 보여 오히려 "내가 둔 수가 계속
  // 재평가되고 있다"는 불안한 인상을 준다는 피드백을 받았다. ReviewPage(analyzeGame)가 게임 전체를
  // 한 번만 평가해 두고 그 정적값(evalDisp)을 그대로 쓰는 것과 같은 방식으로 맞춘다: curNode.ev
  // (생성 시 미리 계산해 둔, 모든 유저에게 항상 같은 값)가 있으면 그 값을 즉시·고정적으로 쓰고,
  // 트리 루트나 구버전 노드처럼 curNode.ev가 아예 없을 때만 REVIEW_DEPTH·REVIEW_MOVETIME_MS로
  // 딱 한 번 평가해 그 결과를 settledEval에 고정한다(중간 depth 값을 순차로 보여주지 않는다).
  const [settledEval, setSettledEval] = useState(null);
  useEffect(() => {
    setSettledEval(null);
    if (curNode.ev != null) return; // 이미 정적으로 기록된 값이 있으면 다시 평가하지 않는다
    if (!engine || engine.status !== "ready") return;
    let cancelled = false;
    engine.evaluate(fenOfRoot(fenRoot, curSans), REVIEW_DEPTH, undefined, REVIEW_MOVETIME_MS, "puzzle-eval").then((ev) => {
      if (cancelled || !ev) return;
      const w = posEvalToWhite(ev, curSans, fenRoot);
      if (w) setSettledEval(w);
    });
    return () => { cancelled = true; };
  }, [curSans.join(" "), engine && engine.status, curNode.ev]);
  const [boardSize, boardRef] = useBoardSize(380);
  // (20차 UX4) 화면이 짧아 스크롤을 맨 위로 올려도 보드 하단이 여전히 하단 탭 뒤에 걸치는 경우를
  // 대비해, 보드의 scrollMarginBottom(아래 style)만큼 여유를 두고 딱 필요한 만큼만 아래로 더 스크롤한다.
  useEffect(() => { if (boardRef.current) boardRef.current.scrollIntoView({ block: "nearest", behavior: "auto" }); }, [puzzle.id]);
  useEffect(() => { if (!intro) return; const t = setTimeout(() => setIntro(false), 1400); return () => clearTimeout(t); }, [intro, puzzle.id]);
  // (16차) 추천 랭킹용 이벤트는 이미 푼 라인을 다시 풀어도(중복 풀이) 매번 기록한다 — XP/별 지급과는 별개.
  // (기능) 퍼즐 레이팅용 풀이 시간도 마찬가지로 재도전마다 매번 기록한다 — 표본이 많아질수록
  // puzzle_line_avg_solve_ms(서버 절사평균)가 더 안정된다.
  useEffect(() => {
    if (!done) return;
    if (onLineSolved) onLineSolved(puzzle.id, doneTag, totalLines);
    // (v0.4.1 기능, item 3) 라인을 끝까지 풀면 이 라인 레이팅을 상대로 Elo 승리 반영. 오답 없이
    // 한 번에 풀었든, 앞서 몇 번 틀렸다 풀었든 완주 자체는 항상 승리로 친다(오답은 이미 위
    // tryUserMove에서 그때그때 패배로 반영됨 — 여기서는 중복으로 깎지 않는다).
    if (onPuzzleRatingEvent) onPuzzleRatingEvent("win", avgRating);
    setSessionSolved((s) => (s.has(doneTag) ? s : new Set(s).add(doneTag)));
    if (onPuzzleSolveEvent) onPuzzleSolveEvent(puzzle.id);
    puzzleLineSolveTimeAdd(puzzleNo(puzzle.id), doneTag, myUid, Date.now() - solveStartRef.current);
    // (20차 기능2) 보드에서 결과를 잠깐 보여준 뒤 모식도 페이지로 자동 전환 — 클리어 애니메이션 재생.
    // (v0.5.6, 사용자 요청) 마지막 수에 수 등급 이펙트가 뜨면 끝까지 본 뒤에 넘어간다(waitMoveFx).
    let cancelled = false;
    const timers = [];
    const t = setTimeout(async () => {
      await waitMoveFx(() => cancelled, timers);
      if (!cancelled) { setPage(1); setCelebrate({ tag: doneTag }); }
    }, 900);
    return () => { cancelled = true; clearTimeout(t); timers.forEach(clearTimeout); };
  }, [done]);
  // 이 가지 아래에 아직 해결하지 않은 리프가 남아 있는가.
  // (20차 기능3) 개발자가 수 추가/삭제 중 잠시 남기는 "미완성" 리프(상대 수로 끝남 = 짝수 길이)는
  // 정식 라인이 아니므로 여기서 "미해결"로 잘못 취급해 추천하지 않는다 — 그러지 않으면 상대 응수
  // 선택 로직이 막다른 미완성 가지로 사용자를 몰아넣어 더 이상 둘 수 있는 수가 없는 상태에 빠뜨린다.
  const subtreeUnsolved = (node, keyArr) => {
    const kids = (node.children || []).filter((k) => k.pass !== false);
    if (!kids.length) return keyArr.length % 2 === 1 && !solvedNow.has(node.tag || keyArr.join(" "));
    return kids.some((k) => subtreeUnsolved(k, [...keyArr, stripSuffix(k.san)]));
  };
  // 상대(컴퓨터) 응수: 목표 라인을 따라가되, 벗어났으면 미해결 가지 우선(채택률 순)으로 자동 선택
  useEffect(() => {
    if (done || wrong || intro || isUserPly || !passKids.length) return;
    let t2, cancelled = false;
    const t1 = setTimeout(async () => {   // (UI4) 정답 수 뒤 1초 후 컴퓨터 응수 — 사용자가 결과를 보도록
      const keyArr = pathNodes.map((n) => stripSuffix(n.san));
      let next = null;
      if (targetLine && targetLine.sans.length > pathNodes.length && targetLine.sans.slice(0, pathNodes.length).every((s, i) => stripSuffix(s) === keyArr[i])) {
        const want = stripSuffix(targetLine.sans[pathNodes.length]);
        next = passKids.find((k) => stripSuffix(k.san) === want) || null;
      }
      if (!next) {
        const scored = passKids.map((k) => ({ k, un: subtreeUnsolved(k, [...keyArr, stripSuffix(k.san)]) ? 1 : 0, ad: k.adopt || 0 }));
        scored.sort((a, b) => (b.un - a.un) || (b.ad - a.ad));
        next = scored[0].k;
      }
      // (v0.1.3 버그 수정) 트리에 이미 등급(kind)이 있으면 그대로 쓰지만, 구버전 퍼즐처럼 없는
      // 경우엔 응수 애니메이션을 보여주기 시작하기 전에 엔진 판정을 먼저 끝내둔다 — 예전엔 reply를
      // 곧장 세팅해 애니메이션을 틀어놓고 그 동안 moveIcon 쪽에서 "계산 중"이나 추측 아이콘을
      // 먼저 보여줬다가 판정이 끝나면 다른 아이콘으로 갈아끼워, 응수 도중 아이콘이 눈에 띄게
      // 바뀌어 보이는 문제가 있었다. 최종 등급이 정해진 뒤에야 애니메이션을 시작해 한 번만 보여준다.
      let kind = next.kind || null;
      if (!kind && liveOn && engine && engine.status === "ready") {
        try { kind = await classifyMoveKind(engine, curSans, stripSuffix(next.san)); } catch { }
      }
      // (v0.5.6, 사용자 요청) 방금 둔 내 수에 탁월·유일·최선 이펙트가 뜨고 있으면 끝까지 재생된 뒤에 응수를 둔다 — 예전엔
      // 1초 뒤 곧장 응수를 틀어 이펙트가 중간에 끊겼다(응수 동안은 lastQ가 비어 이펙트가 사라진다).
      await waitMoveFx(() => cancelled, waitTimers);
      if (cancelled) return;
      setReply({ sans: curSans, san: next.san, node: next, kind });
      t2 = setTimeout(() => { setReply(null); setPathNodes((p) => [...p, next]); }, 900);
    }, 1000);
    const waitTimers = [];
    return () => { cancelled = true; clearTimeout(t1); if (t2) clearTimeout(t2); waitTimers.forEach(clearTimeout); };
  }, [pathNodes.length, done, wrong, intro, tree]);
  // 진행 경로가 목표 라인에서 벗어나면(다른 우수 수 선택·상대의 다른 응수) 그 가지의 미해결 라인으로 목표 갱신
  useEffect(() => {
    if (!pathNodes.length || !allLines.length) return;
    const keyArr = pathNodes.map((n) => stripSuffix(n.san));
    const matches = allLines.filter((l) => l.sans.length >= keyArr.length && keyArr.every((s, i) => stripSuffix(l.sans[i]) === s));
    if (!matches.length || matches.some((l) => l.tag === targetTag)) return;
    const next = matches.find((l) => !solvedNow.has(l.tag)) || matches[0];
    setTargetTag(next.tag);
  }, [pathNodes]);
  const tryUserMove = (from, to, promo) => {
    if (!userToMove) return;
    // (버그 수정) buildSan은 그 수가 실제로 합법인지 확인하지 않고 좌표만으로 SAN을 만든다(예:
    // 기물을 원래 있던 칸에 그대로 놓으면 "제자리 수" 문자열이 그럴싸하게 만들어진다) — 클릭 경로
    // (onSquareClick)는 legalDests로 미리 걸렀지만, 드래그(onDrop)·onMove 경로는 이 검증 없이 곧장
    // tryUserMove를 불러 포지션에 아무 변화도 없는 "제자리 수"까지 오답으로 판정되고 있었다. 여기서
    // 한 번만 확실히 걸러 모든 호출 경로(클릭·드래그)를 동시에 보호한다.
    if (from[0] === to[0] && from[1] === to[1]) { setSel(null); return; }
    if (!(fenRoot ? fenLegalDests(from[0], from[1], color, board, fenReplay.rights, ep) : liveLegalDests(curSans, from[0], from[1], color, board, ep)).some(([r, c]) => r === to[0] && c === to[1])) return;
    // (버그 수정) 폰이 마지막 랭크로 이동하는 수는 promo가 아직 없으면 곧장 두지 않고 승격 기물을
    // 먼저 고르게 한다 — completePromo가 고른 기물로 다시 이 함수를 호출한다.
    const pc = board[from[0]][from[1]];
    if (!promo && pc && pc.t === "P" && ((color === "w" && to[0] === 0) || (color === "b" && to[0] === 7))) { setPromoPrompt({ from, to }); return; }
    const san = buildSan(board, from[0], from[1], to[0], to[1], color, ep, promo); if (!san) return;
    playMoveSfx(san);   // (v0.1.4 기능) 정답/오답과 무관하게, 실제로 보드 위에 기물을 놓는 물리적 동작 자체에 대한 소리
    const hit = (curNode.children || []).find((c) => stripSuffix(c.san) === stripSuffix(san));
    // (기능1) 유저 진영에서는 '통과 가능(최선·우수)' 수만 다음 단계로 — 모식도에 표시만 되는 유혹 수도 오답 처리
    if (hit && hit.pass !== false) { setSel(null); setPathNodes((p) => [...p, hit]); }
    else {
      setWrong({ board: applySan(board, san, color), at: to, from, san }); setSel(null);   // 틀린 수는 잠시 뒤 상대 응징 응수를 보여준 뒤 자동으로 원위치(아래 effect)
      // (v0.4.1 기능, item 3) 사용자 요청 — 공개 퍼즐 레이팅. 틀린 수를 둘 때마다 이 퍼즐(라인) 레이팅을
      // 상대로 삼아 Elo 패배로 즉시 반영한다(한 시도 안에서 여러 번 틀리면 그만큼 여러 번 깎인다).
      if (onPuzzleRatingEvent && avgRating) onPuzzleRatingEvent("loss", avgRating);
    }
  };
  const completePromo = (piece) => {
    if (!promoPrompt) return;
    const { from, to } = promoPrompt; setPromoPrompt(null);
    tryUserMove(from, to, piece);
  };
  const onSquareClick = (sq) => { if (!userToMove) return; const p = board[sq[0]][sq[1]]; if (sel) { if ((fenRoot ? fenLegalDests(sel[0], sel[1], color, board, fenReplay.rights, ep) : liveLegalDests(curSans, sel[0], sel[1], color, board, ep)).some(([r, c]) => r === sq[0] && c === sq[1])) { tryUserMove(sel, sq); return; } if (p && p.c === color) { setSel(sq); return; } setSel(null); } else if (p && p.c === color) setSel(sq); };
  // (UX4→v0.1.2) 재시도 버튼 없이, 오답을 두면 자동으로 원위치로 되돌아간다 — 다만 곧장 되돌리지
  // 않고, 그 오답을 뒀을 때 상대가 어떻게 응징하는지 엔진 최선 응수를 한 번 보여준 뒤(가능한 경우만)
  // 응수→오답 순으로 슬라이드 애니메이션과 함께 두 단계로 되돌린다. 엔진을 못 쓰는 상황(liveOn 꺼짐 등)은
  // 예전처럼 오답만 바로 되돌린다.
  // (v0.3.4 버그 수정) engine.status가 "ready"가 아니면 이 순간 조용히 포기해 응징 연출 없이 오답만
  // 되돌아가던 문제 — 앱을 켜자마자(엔진이 아직 부팅 중일 때) 곧장 퍼즐부터 푸는 흔한 경로에서
  // 특히 자주 재현됐다("응징이 안 뜬다"는 신고와 정확히 부합). liveOn이 켜져 있는데 아직 부팅
  // 중일 뿐이라면 최대 ENGINE_WAIT_MS까지 짧은 간격으로 기다렸다가 계산한다 — liveOn 자체가
  // 꺼져 있거나 정말로 그 시간 안에도 준비되지 않으면 예전처럼 포기하고 오답만 되돌린다.
  useEffect(() => {
    if (!wrong) { setWrongReply(null); setRevertStage(null); return; }
    let cancelled = false;
    const timers = [];
    const wait = (ms) => new Promise((res) => { timers.push(setTimeout(res, ms)); });
    (async () => {
      await wait(1000);   // 오답을 잠시 보여준다
      if (cancelled) return;
      let replyMove = null;
      if (liveOn && engine) {
        const ENGINE_WAIT_MS = 4000, ENGINE_POLL_MS = 150;
        let waited = 0;
        while (engine.status !== "ready" && waited < ENGINE_WAIT_MS) {
          await wait(ENGINE_POLL_MS); waited += ENGINE_POLL_MS;
          if (cancelled) return;
        }
        if (engine.status === "ready") {
          try {
            const ev = await engine.evaluate(fenOfRoot(fenRoot, [...curSans, wrong.san]), 12);
            const bestSan = ev && ev.best ? uciToSan(wrong.board, ev.best, oppColor) : null;
            const info = bestSan ? sanSrc(wrong.board, stripSuffix(bestSan), oppColor) : null;
            if (info && info.from && info.to) replyMove = { san: bestSan, from: info.from, to: info.to };
          } catch { }
        }
      }
      if (cancelled) return;
      if (replyMove) {
        setWrongReply(replyMove);
        await wait(1700);   // (v0.1.3 UX) 응징 응수를 원위치로 되돌리기 전 조금 더 오래 보여준다(1000ms→1700ms)
        if (cancelled) return;
        setRevertStage("reply");   // 1단계: 방금 보여준 응수부터 되돌림
        await wait(450);
        if (cancelled) return;
      }
      setRevertStage("wrong");   // 2단계(또는 응수를 못 구했으면 바로): 사용자의 오답을 원위치로
      await wait(450);
      if (cancelled) return;
      setWrong(null); setWrongReply(null); setRevertStage(null); setSel(null);
    })();
    return () => { cancelled = true; timers.forEach(clearTimeout); };
  }, [wrong]);
  const gotoLine = (tag) => { solveStartRef.current = Date.now(); setTargetTag(tag); setPathNodes([]); setWrong(null); setReply(null); setSel(null); setIntro(true); setHintLevel(0); setPage(0); setCelebrate(null); setPromoPrompt(null); };
  const restart = () => gotoLine(targetTag);
  // (UI) 사용자 요청 — 퍼즐 화면 기보(PuzzlePgnBox)의 수를 누르면 그 기보가 입력된 분석 탭으로
  // 이동한다. 퍼즐 풀이 화면 자체는 더 이상 볼 이유가 없으므로 함께 닫는다 — 집중 분석을 나갈 때
  // "들어왔던 경로로 돌아가기"는 App.jsx의 onOpenLearnFocus가 나가기 전 puzzleActive를 따로
  // 기억해 뒀다가, 집중 분석을 닫으면 그 퍼즐을 다시 열어주는 방식으로 처리한다(이 화면을 안
  // 닫고 숨겨만 두는 방식은 실제로 시도했다가 진입 자체가 막히는 회귀가 있어 되돌림).
  const pickToLearn = onOpenLearn ? (sans) => { onOpenLearn(sans); onClose(); } : undefined;
  // (버그 수정/기능) 모식도 노드 클릭 — 아직 안 둔(고스트) 갈래는 예전처럼 그 라인을 목표로 처음부터
  // 풀이하도록 보드 페이지로 이동한다. 이미 실제로 둔(공개된) 노드는 되돌아가 다시 풀 필요가 없으므로,
  // 대신 모식도 페이지에 새로 생긴 미니보드에서 그 수를 애니메이션으로 재생해 바로 복기할 수 있게 한다.
  const [previewNode, setPreviewNode] = useState(null);
  const onPickNode = (it) => {
    if (it.ghost || !it.node) {
      const keyArr = it.path.map((s) => stripSuffix(s));
      const matches = allLines.filter((l) => l.sans.length >= keyArr.length && keyArr.every((s, i) => stripSuffix(l.sans[i]) === s));
      if (!matches.length) return;
      const next = matches.find((l) => !solvedNow.has(l.tag)) || matches[0];
      gotoLine(next.tag);
      return;
    }
    setPreviewNode(it);
  };
  // (v0.2.6 개편) 힌트 — 그 시점에 실제로 두어야 할 수(목표 라인 기준)를 바탕으로 3단계 시각 힌트를 만든다.
  useEffect(() => { setHintLevel(0); }, [pathNodes.length, targetTag, wrong]);
  const expectedSan = (() => {
    if (!isUserPly || done) return null;
    if (targetLine && targetLine.sans.length > pathNodes.length) {
      const keyArr = pathNodes.map((n) => stripSuffix(n.san));
      if (targetLine.sans.slice(0, pathNodes.length).every((s, i) => stripSuffix(s) === keyArr[i])) return targetLine.sans[pathNodes.length];
    }
    return passKids[0] ? passKids[0].san : null;
  })();
  // (v0.2.6 개편) expectedSan이 가리키는 기물의 출발·도착 칸과, 3단계에서 순서대로 반짝일 경로.
  const hintInfo = useMemo(() => (expectedSan ? sanSrc(board, stripSuffix(expectedSan), color) : null), [expectedSan, board, color]);
  const hintPath = useMemo(() => (hintInfo ? hintPathSquares(hintInfo.piece, hintInfo.from, hintInfo.to) : []), [hintInfo]);
  // (버그 수정) 3단계(꽉 채운 힌트)에 닿으면 버튼이 disabled로 막혀 힌트를 다시 숨길 방법이
  // 없었다 — 3단계에서 한 번 더 누르면 0으로 되돌려(토글) 원래 상태로 되돌아가게 한다.
  const requestHint = () => { if (userToMove && expectedSan) setHintLevel((l) => (l >= 3 ? 0 : l + 1)); };
  // 경로 칸이 목적지에 가까워질수록(1단계 진행률) 그 칸의 금색 그라데이션 농도를 더 진하게.
  const hintPathProgress = hintPath.length ? (hintStepIdx + 1) / hintPath.length : 0;
  // (v0.2.6 개편) 3단계에서는 경로의 각 칸을 380ms마다 하나씩 순서대로 반짝인다 — hintLevel이 3
  // 미만이거나 힌트가 리셋되면 즉시 멈춘다.
  useEffect(() => {
    if (hintLevel < 3 || !hintPath.length) { setHintStepIdx(0); return; }
    setHintStepIdx(0);
    const id = setInterval(() => setHintStepIdx((i) => (i + 1) % hintPath.length), 380);
    return () => clearInterval(id);
  }, [hintLevel, hintPath.length]);
  // (UX2) 마스코트 캐릭터는 둘 차례(백=MILKU, 흑=KOKOA), 표정은 풀이 상태에 따름
  const fullyComplete = solvedNow.size >= totalLines;
  const pmEmotion = intro ? "think" : done ? "celebrate" : wrong ? "angry" : reply ? "wink" : hintLevel > 0 ? "wink"
    : theme === "sacrifice" ? "great" : theme === "advantage" ? "think" : "surprise";
  const pm = [color === "w" ? "milku" : "kokoa", pmEmotion];
  // (기능) 퍼즐 코치도 게임 리뷰와 같은 MEC(mecFacts) 설명을 쓴다 — "직전 수를 살펴보는 중이에요…"
  // 같은 막연한 안내 대신, 방금 두어진 수가 실제로 뭘 위협·방어·예방·전개했는지 구체적으로 짚어준다.
  // moveIcon effect(위)와 정확히 같은 방식으로 "지금 설명할 수"(prevSans/mvSan)를 고른다 — 응수
  // 애니메이션 중이면 reply의 수, 이미 둔 수가 있으면 그 마지막 수, 아직 하나도 안 뒀으면 상대의
  // 실수 수(mistakeSan)를 대상으로 삼는다. classifyMoveKindDetailed로 kind·bestSan·beforeCp를
  // 한 번에 얻어 mecFacts에 그대로 넘긴다(게임 리뷰의 mecNotes와 동일한 인자 순서).
  const [mecBubble, setMecBubble] = useState(null);
  useEffect(() => {
    setMecBubble(null);
    let prevSans, mvSan;
    if (reply) { prevSans = reply.sans; mvSan = reply.san; }
    else if (pathNodes.length >= 1 && !wrong && !reverting) { prevSans = curSans.slice(0, -1); mvSan = pathNodes[pathNodes.length - 1].san; }
    else if (pathNodes.length === 0 && puzzle.setupSans && puzzle.mistakeSan) { prevSans = puzzle.setupSans; mvSan = puzzle.mistakeSan; }
    else return;
    if (!liveOn || !engine || engine.status !== "ready") return;
    const moverColor = plyIsWhite(prevSans.length, fenRoot ? fenRoot.turn : "w") ? "w" : "b";
    let cancelled = false;
    classifyMoveKindDetailed(engine, prevSans, stripSuffix(mvSan), 12, fenRoot).then((r) => {
      if (cancelled || !r) return;
      try {
        const facts = mecFacts(prevSans, stripSuffix(mvSan), moverColor, r.kind, r.bestSan, r.beforeCp, null, fenRoot);
        if (facts && facts.length) setMecBubble(facts[0]);
      } catch { }
    }).catch(() => {});
    return () => { cancelled = true; };
  }, [reply, pathNodes.length, wrong, reverting, curSans.join(" "), puzzle.id, liveOn, engine && engine.status]);
  // (v0.2.6 버그 수정) "당신 차례" 안내 문구 대신, 코치 말풍선이 지금 보드 포지션을 짧게 요약해
  // 설명하도록 바꾼다(막연한 "힌트 버튼을 눌러보세요" 대신 실제로 도움이 되는 상황 설명).
  const idleBubble = intro ? t("직전 수 확인 중…") : wrong ? (wrongReply ? t("이 수를 두면 이렇게 당함") : t("다른 수. 다시 시도")) : reply ? t("상대 응수 중…") : (mecBubble || summarizePosition(board, color));
  const doneBubble = fullyComplete ? t("모든 라인 정복")
    : t("라인 완료. 모식도에서 다른 가지에 도전");
  const bubbleText = done ? doneBubble : idleBubble;
  const nextTag = (allLines.find((l) => !solvedNow.has(l.tag)) || {}).tag;
  // (v0.3.4 기능·버그 수정) 클리어 애니메이션은 잠깐만 재생하고 스스로 꺼진다(반복 재생 방지) — 그
  // 시점에 맞춰, 모든 라인을 다 푼 게 아니라면(사용자 요청) 자동으로 다음 미해결 라인으로 넘어간다.
  // gotoLine 자체가 celebrate를 함께 초기화하므로 별도 처리는 필요 없다. 사용자가 그 사이 라인 번호
  // 버튼을 직접 눌러 먼저 이동했다면 celebrate가 이미 null이 되어 있어(gotoLine이 그렇게 만듦) 이
  // 타이머 자체가 예약되지 않으므로 중복 전환도 없다. (v0.3.5) 자동 전환을 미리 당기는 용도였던
  // "다음 라인 풀기" 수동 버튼은 이제 중복이라 없앴다 — 이 자동 전환이 유일한 경로다.
  // (v0.3.8 버그 수정) 퍼즐 전체 클리어 배너(1.1s 지연 + 4.2s 재생 = 총 5.3초)가 라인 클리어
  // 배너보다 훨씬 길어졌는데, 이 타이머가 항상 고정돼 있으면 전체 클리어일 때 글자가 다 나오기도
  // 전에 배너가 통째로 잘려 사라진다(사용자 요청 원인) — 전체 클리어일 때는 배너 재생이 다 끝난
  // 뒤에도 "조금 더" 기다렸다가(요청) 닫히도록 여유를 더한다. (v0.3.9 사용자 요청) 라인 클리어
  // 배너도 이제 PuzzleClearBanner와 완전히 같은 재생 시간(4.2초)을 쓰므로, 이쪽 타이머도 함께
  // 늘려(2.7초→5.1초, 배너가 다 끝난 뒤 약 0.9초 여유) 잘리지 않게 한다. (v0.3.9 추가 요청) 전체
  // 클리어일 때는 PuzzleClearBanner가 LINE CLEAR(4.2초)를 다 기다렸다가 4.2초 뒤에야 시작해 총
  // 재생 시간이 8.4초로 늘었으므로, 그 뒤 잘리지 않도록 이 타이머도 9.3초(0.9초 여유)로 늘린다.
  useEffect(() => {
    if (!celebrate) return;
    const t = setTimeout(() => {
      if (!fullyComplete && nextTag != null) gotoLine(nextTag);
      else setCelebrate(null);
    }, fullyComplete ? 9300 : 5100);
    return () => clearTimeout(t);
  }, [celebrate, fullyComplete, nextTag]);
  const lineIdx = targetLine ? allLines.findIndex((l) => l.tag === targetLine.tag) : -1;
  const lineLabel = targetLine ? (LINE_TAG_LABEL[targetLine.tag] || (t("라인 {0}", lineIdx + 1))) : "";
  // (18차 보충 UX10→20차) 퍼즐에서 두어지는 모든 수의 수 체계 아이콘 — 트리에 저장된 등급을 즉시 쓰고,
  // 등급이 없는 수(직전 실수 수·구버전 트리)만 엔진으로 정밀 판정한다.
  const [moveIcon, setMoveIcon] = useState(null);   // { key, to, kind }
  // (버그 수정) intro(직전 수 재생) 동안에만 "컴퓨터가 둔 첫 수"(mistakeSan)의 아이콘을 계산해 두고,
  // intro가 끝나는 순간(아직 사용자가 한 수도 안 둔 상태)엔 이 조건에 안 걸려 그냥 null로 지워버렸다 —
  // 그 결과 아이콘이 재생 중에만 잠깐 보였다 정적 보드로 바뀌자마자 사라졌다. intro 여부와 무관하게
  // "아직 아무 수도 안 둔 상태"라면 계속 mistakeSan을 기준으로 삼아, 사용자가 실제로 수를 두기
  // 전까지는 시간이 지나도 아이콘이 그대로 유지되게 한다.
  useEffect(() => {
    let prevSans, mvSan, knownKind = null, isSetupMistake = false;
    // (v0.1.3 버그 수정) reply는 이제 애니메이션을 틀기 전에 등급 판정까지 끝내고 세팅된다(위 상대
    // 응수 effect 참고) — reply.node.kind(트리에 이미 있던 값) 없이도 reply.kind(그때 미리 계산해
    // 둔 값)로 바로 확정된 아이콘을 쓴다. 아래 fallback(추측·"계산 중")으로 떨어지는 건 이제 엔진을
    // 아예 못 쓰는 상황뿐이라, 응수 도중 아이콘이 바뀌어 보이는 일이 없다.
    if (reply) { prevSans = reply.sans; mvSan = reply.san; knownKind = (reply.node && reply.node.kind) || reply.kind || null; }
    else if (pathNodes.length >= 1 && !wrong && !reverting) { prevSans = curSans.slice(0, -1); mvSan = pathNodes[pathNodes.length - 1].san; knownKind = pathNodes[pathNodes.length - 1].kind; }
    // (v0.1.2 버그 수정) 컴퓨터가 둔 첫 수(mistakeSan)는 아래 두 분기와 달리 이미 지나간 수라, 지금
    // 막 두어지는 수처럼 "계산 중" 점 애니메이션을 보여주거나 isSacrifice 추측값을 먼저 보여줬다 실제
    // 판정으로 갈아끼우는 연출이 어색했다(계산이 끝나기 전엔 보드에 "계산 중" 배지가 남아 있었고,
    // 끝나면 아이콘이 눈에 띄게 바뀌어 보였다) — isSetupMistake로 표시해 아래에서 추측·pending 없이
    // 최종 판정이 나온 뒤 한 번만 아이콘을 보여주도록 한다.
    else if (pathNodes.length === 0 && puzzle.setupSans && puzzle.mistakeSan) { prevSans = puzzle.setupSans; mvSan = puzzle.mistakeSan; isSetupMistake = true; }
    else { setMoveIcon(null); return; }
    const moverColor = plyIsWhite(prevSans.length, fenRoot ? fenRoot.turn : "w") ? "w" : "b";
    const info = sanSrc(boardOfRoot(fenRoot, prevSans), stripSuffix(mvSan), moverColor);
    if (!info || !info.to) { setMoveIcon(null); return; }
    const key = prevSans.join(",") + "|" + mvSan;
    if (knownKind) { setMoveIcon({ key, to: info.to, kind: knownKind }); return; }
    // (20차) 엔진을 못 쓰는 상황의 fallback을 'best'가 아닌 '아이콘 없음'으로 — 아무 수에나 최선 별이 붙지 않도록.
    // (v0.5.9 BUG-038) 정적 희생 판정만으로 탁월 아이콘을 먼저 띄우지 않는다 — 엔진 확인이 이미 끝난 희생일 때만.
    const sacKnown = isSacrifice(boardOfRoot(fenRoot, prevSans), stripSuffix(mvSan), moverColor) && sacVerdict(fenRoot, prevSans, stripSuffix(mvSan)) === true;
    const fallback = isSetupMistake ? null : (sacKnown ? "brilliant" : (liveOn && engine && engine.status === "ready" ? "pending" : null));
    setMoveIcon(fallback ? { key, to: info.to, kind: fallback } : null);
    let cancelled = false;
    if (liveOn && engine && engine.status === "ready") {
      classifyMoveKind(engine, prevSans, stripSuffix(mvSan), 12, fenRoot).then((k) => {
        if (!cancelled && k) setMoveIcon({ key, to: info.to, kind: k });
      }).catch(() => {});
    }
    return () => { cancelled = true; };
  }, [pathNodes.length, wrong, reverting, reply, intro, targetTag, puzzle.id]);
  const lastQpz = (!intro && !reply && !reverting && !wrong) ? moveIcon : null;
  // (v0.5.6, 사용자 요청) 보드의 수 등급 이펙트가 끝날 때까지 다음 수(상대 응수·클리어 화면 전환)를 미룬다. Board는 lastQ의
  // (도착 칸, 등급)이 탁월·유일·최선으로 바뀌는 순간 MOVE_FX_MS 동안 이펙트를 재생하므로 같은 조건으로 끝 시각을 기록해 둔다.
  const { moveFx: pzMoveFxOn, moveFxMode: pzMoveFxMode } = useContext(VisualPrefsContext);
  const moveIconRef = useRef(moveIcon);
  moveIconRef.current = moveIcon;
  const fxUntilRef = useRef(0);
  const lastQpzKey = lastQpz && lastQpz.to ? lastQpz.to[0] + "," + lastQpz.to[1] + ":" + lastQpz.kind : "";
  useEffect(() => {
    if (pzMoveFxOn && lastQpz && moveFxKindOn(pzMoveFxMode, lastQpz.kind)) fxUntilRef.current = Date.now() + MOVE_FX_MS;
  }, [lastQpzKey]); // eslint-disable-line react-hooks/exhaustive-deps
  // 등급이 아직 엔진 계산 중("pending")이면 최대 2.5초 기다린 뒤, 이펙트가 재생 중이면 끝날 때까지 기다린다.
  async function waitMoveFx(isCancelled, timers) {
    const sleep = (ms) => new Promise((res) => { timers.push(setTimeout(res, ms)); });
    const t0 = Date.now();
    while (!isCancelled() && pzMoveFxOn && moveIconRef.current && moveIconRef.current.kind === "pending" && Date.now() - t0 < 2500) await sleep(100);
    await sleep(40); // 등급이 막 정해졌다면 위 effect가 끝 시각을 기록할 틈을 준다
    const left = fxUntilRef.current - Date.now();
    if (left > 0 && !isCancelled()) await sleep(left + 120);
  }
  // (사용자 요청) 퍼즐에서도 탁월한 수를 두면 리뷰·집중 분석과 똑같이, 그 수로 희생된(상대에게
  // 안전하게 잡힐 수 있는) 기물이 공격받는다는 빨간색 화살표를 보여준다. lastQpz는 전환 중(응수
  // 애니메이션·오답 연출 등)에는 이미 null이므로 그 상태를 그대로 게이트로 재사용한다. 방금 이동한
  // 쪽(현재 둘 차례의 반대 진영, oppColor)의 기물을 대상으로 계산한다.
  const puzzleDangerArrows = useMemo(() => {
    if (!lastQpz || lastQpz.kind !== "brilliant") return [];
    return hangingPieceArrows(board, oppColor);
  }, [lastQpz, board, oppColor]);
  // (20차 기능1) 구버전 퍼즐 트리(kind/ev/adopt 미기록)는 배경에서 보강 — 모식도의 아이콘·평가치·채택률 표기용.
  // 아직 두지 않은(공개되지 않은) 노드는 계산하지 않는다 — 모식도에 어차피 보이지 않을뿐더러, 불필요한
  // 엔진·네트워크 호출로 미리 답을 계산해 두는 것 자체가 "아직 두지 않은 수를 다루지 않는다"는 원칙에 어긋난다.
  const [meta, setMeta] = useState({});
  useEffect(() => { setMeta({}); }, [puzzle.id, tree]);
  useEffect(() => {
    // (20차 기능3) 개발자는 트리 전체를 보므로(위 PuzzleSchematic 참고) 메타 보강도 전체 트리를 대상으로 한다.
    const revealed = canEdit ? null : revealedPuzzleKeys(allLines, solvedNow, pathNodes.map((n) => stripSuffix(n.san)), everRevealed);
    const missing = [];
    (function walk(node, path) {
      for (const k of node.children || []) {
        const p = [...path, k.san];
        const key = p.map((s) => stripSuffix(s)).join(" ");
        if (revealed && !revealed.has(key)) continue;
        if (k.kind == null || k.ev == null || !("adopt" in k)) missing.push({ node: k, path: p });
        walk(k, p);
      }
    })(tree, []);
    if (!missing.length) return;
    let cancelled = false;
    (async () => {
      for (const it of missing) {
        if (cancelled) return;
        const key = it.path.map((s) => stripSuffix(s)).join(" ");
        const prev = [...setup, ...it.path.slice(0, -1)];
        const full = [...setup, ...it.path];
        const m = {};
        if (!("adopt" in it.node) && !fenRoot) {
          try { const lc = await fetchLichess(prev, false); const hit = lc && lc.moves && lc.moves.find((x) => stripSuffix(x.san) === stripSuffix(it.node.san)); m.adopt = hit ? hit.adopt : null; } catch { m.adopt = null; }
        }
        if (liveOn && engine && engine.status === "ready") {
          // (v0.2.6 버그 수정) 구버전 퍼즐(kind/ev 미기록)을 배경에서 보강할 때도 얕은 depth(10)
          // 대신 게임 리뷰와 동일한 REVIEW_DEPTH로 평가해, 나중에 다시 봤을 때 값이 달라지지 않게 한다.
          if (it.node.ev == null) { try { const ev = await engine.evaluate(fenOfRoot(fenRoot, full), REVIEW_DEPTH, undefined, REVIEW_MOVETIME_MS); const w = posEvalToWhite(ev, full, fenRoot); if (w) m.ev = w; } catch { } }
          if (it.node.kind == null) { try { const k = await classifyMoveKind(engine, prev, stripSuffix(it.node.san), REVIEW_DEPTH, fenRoot); if (k) m.kind = k; } catch { } }
        }
        if (cancelled) return;
        if (Object.keys(m).length) setMeta((pm2) => ({ ...pm2, [key]: { ...pm2[key], ...m } }));
      }
    })();
    return () => { cancelled = true; };
  }, [puzzle.id, tree, liveOn, engine && engine.status, pathNodes.length, solvedNow.size, everRevealed]);
  // (v0.3.4 기능) 사용자 요청 — 이 아래 편집 함수들은 이제 개발자/공동개발자뿐 아니라 그 퍼즐의
  // 생성자 본인(1시간 편집 주기 안에서)도 호출할 수 있다. 저장 창구만 둘로 나뉜다 — 개발자는
  // 예전 그대로 CONTENT.puzzleOverrides(app_content, is_content_editor 전용 공유 블롭)에, 생성자는
  // puzzles.data에 직접(puzzle_creator_save RPC, 서버가 생성자 본인·1시간 주기를 다시 검증한다).
  // creatorTagSeq는 그 RPC 경로 전용 tagSeq 시작값 — CONTENT.puzzleOverrides에는 생성자 편집
  // 이력이 없으므로 puzzle 자신의 data.tagSeq(RPC가 매번 저장해 둔 값, 없으면 0)에서 이어간다.
  const [creatorTagSeq, setCreatorTagSeq] = useState(() => puzzle.tagSeq || 0);
  useEffect(() => { setCreatorTagSeq(puzzle.tagSeq || 0); }, [puzzle.id]);
  const seedTagSeq = () => canEdit ? (((CONTENT.puzzleOverrides || {})[puzzleNoForTag] || {}).tagSeq || 0) : creatorTagSeq;
  const persistEdit = async (treeArg, linesArg, seq, extra) => {
    if (canEdit) {
      if (!CONTENT.puzzleOverrides) CONTENT.puzzleOverrides = {};
      const cur = CONTENT.puzzleOverrides[puzzleNoForTag] || {};
      const withSeq = seq != null && (cur.tagSeq || 0) < seq ? { tagSeq: seq } : {};
      CONTENT.puzzleOverrides[puzzleNoForTag] = { ...cur, tree: treeArg, lines: linesArg, ...(extra || {}), ...withSeq };
      if (bumpContent) await bumpContent();
    } else {
      await puzzleCreatorSave(puzzleNoForTag, treeArg, linesArg, { tagSeq: seq, ...(extra || {}) });
      if (seq != null) setCreatorTagSeq(seq);
      // (v0.3.5 버그 수정) 서버는 이 저장으로 editedAt을 지금 시각으로 갱신해 새 1시간 주기를 시작하는데,
      // creatorInfo는 퍼즐을 열 때 한 번만 불러온 값이라 그대로 두면 낡은 editedAt(주기가 이미 지난
      // 것처럼 보이는 값)이 남는다 — 같은 세션에서 곧바로 다시 편집을 시도하면 UI는 허용된 것처럼
      // 보이다가 서버 RPC가 주기 제한으로 거절해, 정확한 "아직 편집 주기가 안 지났어요" 대신 뜬금없는
      // "저장에 실패했어요" 오류만 뜨는 원인이었다. 로컬에도 즉시 반영해 둔다.
      setCreatorInfo((prev) => prev ? { ...prev, editedAt: new Date().toISOString() } : prev);
    }
    setOverrideTree(treeArg);
  };
  // (20차 기능1) 모식도의 리프(라인의 끝)에서 "+"를 누르면 그 라인에 수를 하나 직접 추가한다.
  // 전체 트리를 다시 만드는 대신 그 리프 하나만 연장하며, kind/ev/adopt는 위 메타 보강 효과가
  // 배경에서 채운다. 결과는 편집 주체에 따라 위 persistEdit이 알맞은 창구로 저장한다.
  // (20차 기능3) 이 퍼즐에서 지금까지 발급된 태그 번호(tagSeq)를 이어서 쓴다 — 삭제로 트리가
  // 비어도 카운터가 리셋되지 않아, 예전 라인이 쓰던 번호를 새 라인이 재사용해 "이미 해결됨"으로
  // 잘못 표시되는 사고를 막는다(nextLeafTag 주석 참고).
  const addMoveToLeaf = async (path, sanRaw) => {
    if (!canEditPuzzle) return t("편집 권한 없음");
    if (!path) return t("라인 없음");
    const res = extendPuzzleLeaf(tree, setup, path, sanRaw, seedTagSeq());
    if (res.error) return res.error;
    try { await persistEdit(res.tree, treeLinesOf(res.tree).map((l) => ({ tag: l.tag, solution: l.sans })), res.seq); }
    catch { return t("저장 실패. 잠시 후 다시 시도"); }
    return null;
  };
  // (20차 기능3) 모식도의 리프에서 "삭제"를 누르면 그 라인의 마지막 수를 하나 지운다. 실수로
  // 라인 전체가 한 번에 사라지지 않도록 항상 정확히 한 수만(그 리프 자신) 지운다.
  const deleteMoveFromLeaf = async (path) => {
    if (!canEditPuzzle) return t("편집 권한 없음");
    if (!path) return t("라인 없음");
    const res = removeLastMoveOfLine(tree, path, seedTagSeq());
    if (res.error) return res.error;
    try { await persistEdit(res.tree, treeLinesOf(res.tree).map((l) => ({ tag: l.tag, solution: l.sans })), res.seq); }
    catch { return t("저장 실패. 잠시 후 다시 시도"); }
    return null;
  };
  // (v0.3.0 기능) 임의의 상대 응수 노드에 형제 갈래를 추가한다. genPuzzleTree가 실제로 계산해
  // 뒀던 후보 목록(puzzleCandidatesAt)을 그대로 다시 불러와 보여준다 — isDevelopingMove 필터나
  // "채택률·손실 점수 상위 3개만" 규칙 때문에 자동 생성 단계에서 걸러진 멀쩡한 응수가 여기서는 그대로
  // 드러나므로, 편집 권한이 있는 사람이 골라 다시 채워 넣을 수 있다(추가 엔진 호출 없이 재사용).
  const suggestSiblings = async (path) => {
    if (!engine || engine.status !== "ready") return [];
    try {
      const raw = await puzzleCandidatesAt(engine, [...setup, ...path]);
      const parentNode = path.length ? findTreeNode(tree, path) : tree;
      const existing = new Set(((parentNode && parentNode.children) || []).map((c) => stripSuffix(c.san)));
      return (raw || []).filter((c) => !existing.has(stripSuffix(c.san)));
    } catch { return []; }
  };
  const addSibling = async (path, cand) => {
    if (!canEditPuzzle) return t("편집 권한 없음");
    let finalCand = cand;
    if (cand.manual) {
      const board = boardOfRoot(fenRoot, [...setup, ...path]);
      const color = plyIsWhite(setup.length + path.length, fenRoot ? fenRoot.turn : "w") ? "w" : "b";
      if (!sanSrc(board, cand.san, color)) return t("불법 수");
      finalCand = { san: decorateSan(board, cand.san, color), kind: null, ev: null, adopt: null };
    }
    const res = addSiblingBranch(tree, path, finalCand, seedTagSeq());
    if (res.error) return res.error;
    try { await persistEdit(res.tree, treeLinesOf(res.tree).map((l) => ({ tag: l.tag, solution: l.sans })), res.seq); }
    catch { return t("저장 실패. 잠시 후 다시 시도"); }
    return null;
  };
  // (20차 기능3) 이 퍼즐의 "기본 이점 기준"(자동 생성이 확실한 이점으로 볼 cp 기준)을 퍼즐마다
  // 직접 설정한다. 값을 바꾸는 것만으로는 아무 일도 벌어지지 않고(저장만 됨), 명시적으로 "이
  // 기준으로 기본 트리 재생성"을 눌러야 실제로 트리 전체를 새로 만든다 — 수동으로 추가/삭제한
  // 내용이 전부 사라지는 되돌릴 수 없는 동작이므로 실수로 발동하지 않도록 별도 버튼으로 분리한다.
  const savedTarget = canEdit ? ((CONTENT.puzzleOverrides || {})[puzzleNoForTag] || {}).target : puzzle.target;
  const defaultTarget = savedTarget != null ? savedTarget : puzzleThemeOpts(theme).target;
  const [targetInput, setTargetInput] = useState(defaultTarget);
  useEffect(() => { setTargetInput(defaultTarget); }, [puzzle.id, savedTarget]);
  // (신규) 퍼즐 종류(기물 우위/포지션 우위) 표시·설정. 목표 cp는 포지션 우위일 때만 의미가
  // 있으므로(기물 우위는 cp 기준 없이 기물 이득만으로 종료), 종류가 포지션 우위일 때만 위의
  // 목표 cp 입력을 노출한다.
  const savedPuzzleType = canEdit ? ((CONTENT.puzzleOverrides || {})[puzzleNoForTag] || {}).puzzleType : puzzle.puzzleType;
  const defaultPuzzleType = savedPuzzleType != null ? savedPuzzleType : puzzleThemeOpts(theme).puzzleType;
  const [puzzleTypeInput, setPuzzleTypeInput] = useState(defaultPuzzleType);
  useEffect(() => { setPuzzleTypeInput(defaultPuzzleType); }, [puzzle.id, savedPuzzleType]);
  const savePuzzleType = async (v) => {
    if (!canEditPuzzle) return;
    setPuzzleTypeInput(v);
    if (canEdit) {
      if (!CONTENT.puzzleOverrides) CONTENT.puzzleOverrides = {};
      const cur = CONTENT.puzzleOverrides[puzzleNoForTag] || {};
      CONTENT.puzzleOverrides[puzzleNoForTag] = { ...cur, puzzleType: v };
      if (bumpContent) await bumpContent();
    } else {
      try { await puzzleCreatorSave(puzzleNoForTag, tree, allLines.map((l) => ({ tag: l.tag, solution: l.sans })), { puzzleType: v }); } catch { }
    }
  };
  // (신규 기능) 사용자 요청 — 생성자(또는 개발자/공동개발자)가 공개/비공개를 나중에 바꿀 수 있게.
  // 라인 편집(1시간 주기)과 달리 내용을 바꾸는 게 아니라 노출 여부만 바꾸는 것이라 canEditPuzzle의
  // 쿨다운과 무관하게 언제든 가능하다 — 대신 puzzleType 편집과 같은 자격(canEdit || isMyPuzzle)만 본다.
  const canManageVisibility = canEdit || isMyPuzzle;
  const [publicInput, setPublicInput] = useState(puzzle.public !== false);
  useEffect(() => { setPublicInput(puzzle.public !== false); }, [puzzle.id, puzzle.public]);
  const [visBusy, setVisBusy] = useState(false);
  const saveVisibility = async (v) => {
    if (!canManageVisibility || visBusy) return;
    setVisBusy(true);
    const prev = publicInput;
    setPublicInput(v);
    const ok = await puzzleSetVisibility(puzzleNoForTag, v);
    if (!ok) setPublicInput(prev);
    setVisBusy(false);
  };
  const [regenBusy, setRegenBusy] = useState(false);
  const [regenErr, setRegenErr] = useState("");
  const saveDefaultTarget = async (v) => {
    if (!canEditPuzzle) return;
    if (canEdit) {
      if (!CONTENT.puzzleOverrides) CONTENT.puzzleOverrides = {};
      const cur = CONTENT.puzzleOverrides[puzzleNoForTag] || {};
      CONTENT.puzzleOverrides[puzzleNoForTag] = { ...cur, target: v };
      if (bumpContent) await bumpContent();
    } else {
      try { await puzzleCreatorSave(puzzleNoForTag, tree, allLines.map((l) => ({ tag: l.tag, solution: l.sans })), { target: v }); } catch { }
    }
  };
  const regenerateWithTarget = async () => {
    if (!engine || engine.status !== "ready" || regenBusy || !canEditPuzzle) return;
    setRegenBusy(true); setRegenErr("");
    try {
      const th = primaryTheme(puzzle);
      const opts = { ...puzzleThemeOpts(th, targetInput, puzzleTypeInput), firstSan: th === "sacrifice" ? (allLines[0] && allLines[0].sans[0]) : null, tagSeq: seedTagSeq() };
      const gen = await genPuzzleTree(engine, setup, opts, undefined, fenRoot);
      if (!gen) { setRegenErr(t("이 기준으로는 트리를 만들 수 없음 (기준을 낮추기)")); return; }
      try { await persistEdit(gen.tree, gen.lines, gen.seq, { target: targetInput, puzzleType: puzzleTypeInput }); }
      catch { setRegenErr(t("저장 실패. 잠시 후 다시 시도")); }
    } finally { setRegenBusy(false); }
  };
  // (v0.3.4 기능) 사용자 요청 — 개발자/공동개발자 전용, 이 퍼즐의 생성자를 재지정한다(원래 생성자의
  // 편집권은 그 즉시 사라진다 — 대상이 바뀌므로). 실제 권한·아이디 검증은 서버(RPC)가 다시 한다.
  const [reassignInput, setReassignInput] = useState("");
  const [reassignBusy, setReassignBusy] = useState(false);
  const [reassignMsg, setReassignMsg] = useState("");
  const doReassign = async (targetUsername) => {
    setReassignBusy(true); setReassignMsg("");
    const ok = await puzzleReassignCreator(puzzleNoForTag, targetUsername);
    if (ok) {
      setReassignMsg(targetUsername ? t("생성자를 @{0}님에게 양도 완료", targetUsername) : t("생성자를 개발자 명의로 회수"));
      setReassignInput("");
      setCreatorInfo(await puzzleCreatorInfo(puzzleNoForTag));
    } else setReassignMsg(t("실패. 아이디 확인 또는 아직 서버에 공유되지 않은 퍼즐일 수 있음"));
    setReassignBusy(false);
  };
  // (20차 기능3) allLines(완결된 라인)가 0개여도, 트리 자체에 내용이 있으면(개발자가 삭제로 잠시
  // "미완성" 상태를 만든 경우) 퍼즐 화면 자체를 닫아버리면 안 된다 — 그러면 다시 수를 추가해 완성할
  // 방법이 없어져 편집이 막힌다. 트리에 아무 내용도 없을 때만(진짜 손상된 퍼즐) 이 화면을 보여준다.
  const treeIsEmpty = !tree || !tree.children || !tree.children.length;
  if (treeIsEmpty) return (
    <div style={{ position: "relative", background: T.paper, border: "1px solid #DCCBA8", borderRadius: 14, padding: 16, maxWidth: 460, margin: "0 auto" }}>
      <button onClick={onClose} aria-label={t("닫기")} className="press" style={{ position: "absolute", top: 12, right: 12, zIndex: 10, width: 30, height: 30, display: "inline-flex", alignItems: "center", justifyContent: "center", borderRadius: 8, background: T.ebony2, color: T.ivory, border: "1px solid #000", fontSize: 15, fontWeight: 800, lineHeight: 1, cursor: "pointer" }}>✕</button>
      <p style={{ fontSize: 13, color: T.inkSoft, fontWeight: 700, textAlign: "center", padding: "30px 0" }}>{t("퍼즐 데이터 로드 실패")}</p>
    </div>
  );
  if (!allLines.length && !canEdit) return (
    <div style={{ position: "relative", background: T.paper, border: "1px solid #DCCBA8", borderRadius: 14, padding: 16, maxWidth: 460, margin: "0 auto" }}>
      <button onClick={onClose} aria-label={t("닫기")} className="press" style={{ position: "absolute", top: 12, right: 12, zIndex: 10, width: 30, height: 30, display: "inline-flex", alignItems: "center", justifyContent: "center", borderRadius: 8, background: T.ebony2, color: T.ivory, border: "1px solid #000", fontSize: 15, fontWeight: 800, lineHeight: 1, cursor: "pointer" }}>✕</button>
      <p style={{ fontSize: 13, color: T.inkSoft, fontWeight: 700, textAlign: "center", padding: "30px 0" }}>{t("준비 중인 퍼즐")}</p>
    </div>
  );
  return (
    <div style={{ maxWidth: 460, margin: "0 auto" }}>
      {/* (사용자 요청) 이 퍼즐이 과거 어느 날짜의 일일 퍼즐로 선정된 기록이 있으면(puzzleShare가
          resolveDailyPuzzle의 isDaily/date를 그대로 서버에 보존해 두므로, 같은 id로 다시 열 때마다
          이 값이 남아 있다) 클릭해야 여는 배지+말풍선 대신, 카드 위에 늘 보이는 띠 하나로 그 날짜를
          바로 보여준다. */}
      {puzzle.isDaily && puzzle.date && (
        <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 6, padding: "7px 12px", marginBottom: 8, borderRadius: 10, background: "linear-gradient(180deg,#3A2516,#241509)", border: "1px solid " + T.brass, color: T.brassHi, fontSize: 12, fontWeight: 700 }}>
          <Bookmark size={13} fill={T.brassHi} />
          {tx("{0} 일일 퍼즐", puzzle.date.replace(/-/g, "/"))}</div>
      )}
      <div style={{ position: "relative", background: T.paper, border: "1px solid #DCCBA8", borderRadius: 14, padding: 16 }}>
      <button onClick={onClose} aria-label={t("닫기")} className="press" style={{ position: "absolute", top: 12, right: 12, zIndex: 10, width: 30, height: 30, display: "inline-flex", alignItems: "center", justifyContent: "center", borderRadius: 8, background: T.ebony2, color: T.ivory, border: "1px solid #000", fontSize: 15, fontWeight: 800, lineHeight: 1, cursor: "pointer" }}>✕</button>
      {/* (사용자 요청) PGN/FEN 배지·퍼즐 레이팅 박스를 닫기 버튼 아래 별도 줄(절대 위치) 대신, 제작자
          표시와 같은 줄로 내렸다 — 제목 영역이 더는 그 자리를 피해 오른쪽 여백을 넓게 잡을 필요가
          없어져, 제목을 한 줄에 더 길게 보여줄 수 있다. */}
      <div className="flex items-start justify-between" style={{ marginBottom: 4, paddingRight: 40, gap: 8 }}>
        <div style={{ minWidth: 0, width: "100%" }}>
          <div style={{ fontSize: 10.5, fontWeight: 800, color: T.brass, marginBottom: 2 }}>{themeLabelsOf(puzzle)}<span style={{ color: T.inkSoft, fontWeight: 600 }}> · {lineLabel}</span></div>
          {/* (사용자 요청) FEN 기반 퍼즐은 오프닝 트리에서 이름을 따올 수 없어 생성자가 직접 지은
              이름을 그대로 쓰는데, 생성자 본인 또는 개발자/공동개발자는 이름 오른쪽 펜 버튼으로
              나중에 고칠 수 있다(검열 기준은 학습 탭 "수 설명"과 동일). */}
          {editingName ? (
            <div style={{ marginTop: 2 }}>
              <div className="flex items-center" style={{ gap: 6 }}>
                <input value={nameInput} onChange={(e) => setNameInput(e.target.value)} maxLength={60} autoFocus
                  onKeyDown={(e) => { if (e.key === "Enter") saveEditName(); if (e.key === "Escape") setEditingName(false); }}
                  style={{ flex: 1, minWidth: 0, padding: "5px 8px", borderRadius: 8, border: "1px solid #C9B58C", background: "#fff", color: T.ink, fontSize: 14, fontWeight: 800, boxSizing: "border-box" }} />
                <button onClick={saveEditName} disabled={nameBusy} className="press" style={{ padding: "5px 10px", borderRadius: 8, border: "none", background: T.brass, color: "#241509", fontWeight: 800, fontSize: 12, cursor: "pointer", opacity: nameBusy ? .6 : 1, flexShrink: 0 }}>{nameBusy ? t("저장 중…") : t("저장")}</button>
                <button onClick={() => setEditingName(false)} className="press" style={{ padding: "5px 10px", borderRadius: 8, border: "1px solid #C9B58C", background: "transparent", color: T.inkSoft, fontWeight: 800, fontSize: 12, cursor: "pointer", flexShrink: 0 }}>{t("취소")}</button>
              </div>
              {nameErr && <p style={{ fontSize: 11, color: T.blunder, fontWeight: 700, marginTop: 4 }}>{nameErr}</p>}
            </div>
          ) : (
            <div className="flex items-center" style={{ gap: 5 }}>
              <div style={{ fontSize: 15, fontWeight: 800, color: T.ink, lineHeight: 1.35 }}>{displayPuzzleName}</div>
              {canRenamePuzzle && <button onClick={startEditName} aria-label={t("퍼즐 이름 수정")} title={t("퍼즐 이름 수정")} className="press" style={{ flexShrink: 0, padding: 0, background: "none", border: "none", color: T.inkSoft, cursor: "pointer", display: "inline-flex", alignItems: "center" }}><Pencil size={13} /></button>}
            </div>
          )}
          <div style={{ fontSize: 11, color: T.inkSoft, fontFamily: SITE_FONT, marginTop: 4 }}>#{puzzleNo(puzzle.id)}{solveCountText(solveCount, friendSolverNames) ? " · " + solveCountText(solveCount, friendSolverNames) : ""}</div>
          {/* (사용자 요청) 제작자 아이디는 눌러서 그 사람의 프로필로 이동할 수 있도록 버튼으로 바꾸고
              글자도 더 크게 키웠다(닫으면 history.back()으로 이 퍼즐 화면에 그대로 돌아온다 —
              UserProfilePage가 이 화면을 언마운트하지 않고 위에 겹쳐 뜨는 오버레이라 별도의 "돌아갈
              경로" 저장이 필요 없다). */}
          {creatorInfo && creatorInfo.username && (
            <button onClick={() => onOpenProfile && onOpenProfile(creatorInfo.username)} className="press" style={{ display: "block", marginTop: 4, background: "none", border: "none", padding: 0, cursor: onOpenProfile ? "pointer" : "default", fontSize: 13, color: T.brass, fontWeight: 800, textAlign: "left" }}>
              @{creatorInfo.username}
            </button>
          )}
        </div>
      </div>
      {/* (사용자 요청) 이 배지 줄은 위 제목 영역의 paddingRight:40(닫기 버튼을 피하기 위한 여백)
          제약에서 벗어난 별도 줄로 둔다 — 닫기 버튼은 이 줄보다 위쪽에만 있어 안 겹치므로, 카드
          오른쪽 끝까지 거의 여백 없이 붙을 수 있다. */}
      <div className="flex items-center flex-wrap" style={{ gap: 6, marginBottom: 10, justifyContent: "flex-end" }}>
        {puzzle.setupSans && puzzle.setupSans.length > 0 && <span title={t("PGN 기보로 시작 위치 지정")} style={{ fontSize: 11, fontWeight: 800, color: "#1B4C86", fontFamily: SITE_FONT, padding: "3px 7px", borderRadius: 8, border: "1px solid " + T.only, background: "rgba(62,124,196,.22)" }}>PGN</span>}
        {puzzle.fen && <span title={t("FEN 코드로 시작 위치 지정")} style={{ fontSize: 11, fontWeight: 800, color: "#1B4C86", fontFamily: SITE_FONT, padding: "3px 7px", borderRadius: 8, border: "1px solid " + T.only, background: "rgba(62,124,196,.22)" }}>FEN</span>}
        <GamePhaseBadge p={puzzle} />
        {myPuzzleRating != null ? (() => {
          const diff = avgRating - myPuzzleRating;
          const tier = puzzleDifficultyTier(diff);
          const deltaColor = diff <= -20 ? "#2E8B57" : diff >= 20 ? "#D9534F" : T.inkSoft;
          return (
            <ClickInfoBadge width={210} align="left" content={
              <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                <div>{tx("이 퍼즐의 레이팅 : {0}", <b>{avgRating}</b>)}</div>
                <div>{tx("내 레이팅 : {0}", <b>{myPuzzleRating}</b>)} (<span style={{ color: deltaColor, fontWeight: 900 }}>{myPuzzleRating - avgRating >= 0 ? "+" : ""}{myPuzzleRating - avgRating}</span>)</div>
                <div>{tx("난이도 : {0}", <span style={{ color: tier.color, fontWeight: 900 }}>{tier.label}</span>)}</div>
              </div>
            }>
              <span title={t("퍼즐 레이팅 (100~3000, 모든 라인 평균 난이도). 눌러서 자세히")} style={{ padding: "3px 8px", borderRadius: 8, background: "rgba(196,154,80,.15)", border: "1px solid " + T.brass, color: T.brass, fontSize: 11, fontWeight: 800, fontFamily: SITE_FONT }}>{avgRating}</span>
            </ClickInfoBadge>
          );
        })() : (
          <span title={t("퍼즐 레이팅 (100~3000, 모든 라인 평균 난이도)")} style={{ padding: "3px 8px", borderRadius: 8, background: "rgba(196,154,80,.15)", border: "1px solid " + T.brass, color: T.brass, fontSize: 11, fontWeight: 800, fontFamily: SITE_FONT }}>{avgRating}</span>
        )}
      </div>
      <div style={{ marginBottom: 10 }}>
          {/* (20차 기능1) 별: 라인 1개 이상 ★1 · 50% 이상 ★2 · 전부 ★3 */}
          <div className="flex items-center" style={{ gap: 7, marginTop: 5, flexWrap: "wrap", rowGap: 6 }}>
            <LineStars total={3} solved={starsOf(solvedNow.size, totalLines)} />
            <span style={{ fontSize: 10, fontWeight: 800, color: T.inkSoft }}>{solvedNow.size}/{totalLines}</span>
            {/* (사용자 요청) 소셜 정보 표시 순서는 좋아요 → 리포스트 → 공유 그대로 두고, 카드 폭 전체를
                차지하는 줄로 따로 떼어(width:100%, 위 flexWrap 컨테이너에서 항상 새 줄로 시작) 왼쪽
                정렬한다. */}
            <div className="flex items-center" style={{ gap: 12, width: "100%" }}>
              <button onClick={() => onToggleLike && onToggleLike(puzzle.id)} className="press" style={{ display: "inline-flex", alignItems: "center", gap: 4, background: "none", border: "none", cursor: "pointer", padding: 0 }} aria-label={t("좋아요")}>
                <Heart size={17} color={isLiked ? "#D9534F" : T.inkSoft} fill={isLiked ? "#D9534F" : "none"} />
                <span style={{ fontSize: 12, fontWeight: 800, color: isLiked ? "#D9534F" : T.inkSoft }}>{likeCount || 0}</span>
              </button>
              {onToggleRepost && <button onClick={() => onToggleRepost(puzzle.id)} className="press" style={{ display: "inline-flex", alignItems: "center", gap: 4, background: "none", border: "none", cursor: "pointer", padding: 0 }} aria-label={t("리포스트")} title={t("리포스트")}>
                <Repeat2 size={17} color={isReposted ? T.brilliant : T.inkSoft} />
                <span style={{ fontSize: 12, fontWeight: 800, color: isReposted ? T.brilliant : T.inkSoft }}>{repostCount || 0}</span>
              </button>}
              {/* (v0.1.1) 공유 수는 눌러도 아무 동작 없는 순수 표시(집계)이고, 실제 공유 시트는 바로 옆의 별도 버튼이 연다 */}
              <span aria-hidden="true" style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
                <Send size={16} color={T.inkSoft} />
                <span style={{ fontSize: 12, fontWeight: 800, color: T.inkSoft }}>{shareCount || 0}</span>
              </span>
              {/* (v0.1.3 UI) PuzzleCard와 동일하게 라운딩된 사각형 배지(텍스트 포함)로 변경 */}
              {/* (사용자 요청) 공유 버튼은 오른쪽 정렬 — marginLeft:auto로 같은 줄의 나머지 요소들과
                  간격을 두고 오른쪽 끝으로 민다. */}
              {onShare && <button onClick={() => onShare(puzzle)} className="press" style={{ display: "inline-flex", alignItems: "center", gap: 5, padding: "5px 15px", borderRadius: 8, border: "1px solid " + T.brass, background: T.ebony2, color: T.brassHi, fontSize: 12, fontWeight: 800, cursor: "pointer", whiteSpace: "nowrap", flexShrink: 0, marginLeft: "auto" }} aria-label={t("공유하기")} title={t("공유하기")}>
                {tx("{0}공유", <Send size={14} color={T.brass} />)}</button>}
            </div>
          </div>
      </div>
      {/* (20차 기능2) 보드 페이지 ↔ 모식도 페이지 좌우 넘기기. 모식도가 보드 위쪽을 다 차지해 한눈에
          안 들어오던 문제를 없애기 위해 별도 페이지로 분리하고, 드래그(스와이프)·화살표·점 인디케이터로 넘긴다. */}
      <div ref={pagerRef} onPointerDown={onPagerPointerDown} onPointerMove={onPagerPointerMove} onPointerUp={onPagerPointerUp} onPointerLeave={onPagerPointerUp} onPointerCancel={onPagerPointerUp}
        style={{ position: "relative", overflow: "hidden", touchAction: "pan-y" }}>
        <div style={{ display: "flex", width: "200%", transform: `translateX(calc(${-page * 50}% + ${dragPx}px))`, transition: dragging ? "none" : "transform .34s cubic-bezier(.22,.9,.32,1)" }}>
          <div style={{ width: "50%", boxSizing: "border-box", paddingRight: 3 }}>
            {/* (사용자 요청) 코치 말풍선을 화면 안에서 보였다 숨겼다 하던 버튼을 없앴다 — 설정 탭의
                "코치 말풍선" 토글로만 켜고 끌 수 있다. */}
            {!coachHidden && (
              <div style={{ position: "relative", marginBottom: 10 }}>
                <div key={"bubble-" + bubbleText} style={{ animation: "lockpop .35s ease" }}><MascotBubble text={bubbleText} ply={0} mascot={pm[0]} emotion={pm[1]} /></div>
              </div>
            )}
            {/* (기능1) 두었던 수가 하나씩 기보로 표기되도록 — (사용자 요청) FEN 기반 사용자 생성
                퍼즐은 이어지는 대국 기보가 없으므로, 같은 자리에 시작 포지션의 FEN 코드를 대신
                보여주고 누르면(기보 클릭과 마찬가지로) 학습 탭으로 이동해 그 FEN 포지션을 그대로
                보드 위에 불러온다. */}
            {fenRoot
              ? <div onClick={() => { if (onOpenLearnFen && puzzle.fen) { onOpenLearnFen(puzzle.fen); onClose(); } }} style={{ cursor: onOpenLearnFen ? "pointer" : "default" }}><PuzzlePgnBox text={puzzle.fen} /></div>
              : <PuzzlePgnBox sans={curSans} onPick={pickToLearn} />}
            {/* (버그 수정) 바깥 페이저(보드↔모식도 스와이프)의 onPagerPointerDown이 이 보드 위에서 눌러도
                예외 없이 setPointerCapture를 걸어, 클릭의 대상이 실제 눌린 칸이 아니라 페이저 쪽으로
                가로채어져 칸의 onClick(기물 선택)이 전혀 발동하지 않았다 — HTML5 네이티브 드래그 앤 드롭은
                별도 이벤트 체계라 이 영향을 안 받아 드래그로 두는 것만 됐다. SchematicEditor의 캔버스와
                동일하게 "no-pan"을 줘서 이 영역 위의 포인터다운은 페이저가 아예 손대지 않게 한다. */}
            <div ref={boardRef} className="no-pan" style={{ width: "100%", maxWidth: 380, margin: "0 auto", scrollMarginBottom: 84, position: "relative" }}>
            {/* (버그 수정) FEN 기반 사용자 생성 퍼즐(item 5)은 "직전 수(mistakeSan)"가 아예 없다 — 대국
                기록 없이 지금 포지션 자체를 시작점으로 삼기 때문이다. 그런데도 intro 단계는 항상
                AnimatedMove에 puzzle.mistakeSan을 그대로 넘겼다 — sanSrc(before, undefined, color)가
                합법 수를 찾지 못해 실패하면 그 대체 경로가 boardFromSans([...sans, undefined])를
                호출했고, 존재하지 않는 SAN(undefined)을 보드에 적용하려다 예외를 던져 이 컴포넌트
                트리 전체가 무너졌다(ErrorBoundary가 없어 화면이 그대로 하얗게 멈춘 채 굳는다 — 퍼즐을
                누르면 사이트가 먹통이 된 것처럼 보인 원인). mistakeSan이 없는 퍼즐은 애초에 재생할
                "직전 수"가 없으므로, intro 애니메이션 자체를 건너뛰고 바로 정상 보드(fenRoot 인식,
                아래 board)를 보여준다. */}
            {intro && puzzle.mistakeSan
              ? <AnimatedMove sans={puzzle.setupSans || []} san={puzzle.mistakeSan} size={boardSize} loopMs={0} flip={userColor === "b"} badge={moveIcon && moveIcon.kind !== "pending" ? moveIcon.kind : null} fenRoot={fenRoot} />
              : reply
                ? <AnimatedMove sans={reply.sans} san={reply.san} size={boardSize} loopMs={0} flip={userColor === "b"} badge={moveIcon && moveIcon.kind !== "pending" ? moveIcon.kind : null} fenRoot={fenRoot} />
              // (v0.1.2 기능) 되돌리기도 두 단계 — 먼저 방금 보여준 상대 응징 응수를 되돌리고("reply"),
              // 그다음 사용자의 오답 자체를 원위치로 되돌린다("wrong").
              : revertStage === "reply"
                ? <RevertSlide board={applySan(wrong.board, wrongReply.san, oppColor)} from={wrongReply.from} to={wrongReply.to} size={boardSize} flip={userColor === "b"} />
              : revertStage === "wrong"
                ? <RevertSlide board={wrong.board} from={wrong.from} to={wrong.at} size={boardSize} flip={userColor === "b"} />
              // (v0.1.2 기능) 오답을 두면 곧장 되돌리지 않고, 상대라면 그 오답을 어떻게 응징했을지
              // 엔진 최선 응수를 한 번 보여준다(engine을 못 쓰면 이 단계 없이 바로 되돌아간다).
              // (v0.1.3 기능) 이 응수는 정의상 항상 그 자리에서 엔진이 찾아낸 최선 수이므로(아래 wrong
              // effect의 evaluate 결과), 별도 등급 판정 없이 바로 "최선의 수" 배지를 붙인다.
              : wrongReply
                ? <AnimatedMove sans={[...curSans, wrong.san]} san={wrongReply.san} size={boardSize} loopMs={0} flip={userColor === "b"} badge="best" fenRoot={fenRoot} />
              // (v0.2.7 버그 수정) 예전엔 hintLevel이 올라갈수록(>=) 이전 단계 애니메이션까지 계속 함께
              // 남아 있어(3단계에서 도착 칸 반짝임+기물 흔들림+경로 반짝임이 한꺼번에 겹쳐 보였다),
              // 단계마다 독립된 연출만 보이도록 각 단계를 정확히 그 단계에서만 켠다 — 1단계: 도착
              // 칸만, 2단계: 기물 흔들림만, 3단계: 기물 흔들림+경로 반짝임(도착 칸 단독 표시는
              // 3단계에서 경로의 마지막 칸이 대신하므로 끈다).
              : <Board board={wrong ? wrong.board : board} flip={userColor === "b"} size={boardSize} selected={sel} wrongAt={wrong ? wrong.at : null} lastQ={lastQpz} arrows={puzzleDangerArrows} showCoords onSquareClick={onSquareClick} onPieceDrag={(sq) => { const p = board[sq[0]][sq[1]]; if (userToMove && p && p.c === color) setSel(sq); }} onDrop={(sq) => { if (userToMove && sel) tryUserMove(sel, sq); }} onMove={(from, to) => { if (userToMove) tryUserMove(from, to); }} legalTargets={userToMove && sel ? (fenRoot ? fenLegalDests(sel[0], sel[1], color, board, fenReplay.rights, ep) : liveLegalDests(curSans, sel[0], sel[1], color, board, ep)) : []} showEval={false} interactive={userToMove} gridRef={setPromoGridEl}
                  hintTo={hintLevel === 1 && hintInfo ? hintInfo.to : null} hintFrom={(hintLevel === 2 || hintLevel === 3) && hintInfo ? hintInfo.from : null} hintPathSq={hintLevel === 3 && hintPath.length ? hintPath[hintStepIdx] : null} hintPathProgress={hintPathProgress} />}
            {promoPrompt && <ReviewPromoPrompt onPick={completePromo} onCancel={() => setPromoPrompt(null)} color={promoPrompt.to[0] === 0 ? "w" : "b"} portalTo={promoGridEl} />}
            </div>
            {/* (v0.2.6 버그 수정) 보드 바로 아래 안내 문구를 없애고, 그 자리에 평가치 막대를 표시한다.
                생성 시 이미 계산해 둔 트리 노드의 ev를 그대로 써서(퍼즐 어디서든 같은 값), 새로 다시
                평가할 때마다 값이 미묘하게 흔들려 보이는 일이 없다. (v0.2.7에서 여기에 depth가
                깊어지는 과정을 그대로 보여주는 실시간 연출을 넣었었는데, 정확한 수를 두어도 막대
                숫자가 계속 바뀌는 것처럼 보인다는 피드백으로 되돌렸다 — ReviewPage처럼 항상 고정값만
                보여준다.) curNode.ev가 없는 노드(트리 루트, 개발자가 손으로 만든/구버전 노드)만
                settledEval(위, REVIEW_DEPTH로 한 번만 계산해 고정해 둔 값)로 대신한다. */}
            <div style={{ marginTop: 12 }}><EvalBar cp={curNode.ev ?? settledEval} width={boardSize} /></div>
            <div className="flex justify-center gap-2" style={{ marginTop: 12 }}>
              <button onClick={restart} className="press" style={{ padding: "6px 14px", borderRadius: 9, background: T.ebony2, color: T.ivory, border: "1px solid #000", fontWeight: 700, cursor: "pointer", fontSize: 12 }}>{done ? t("다시 풀기") : t("처음부터")}</button>
              {/* (버그 수정) 힌트 버튼이 현재 단계(1~3)를 그대로 보여준다 — 3단계에 닿으면 꽉 채운
                  배경으로 바뀐다. 예전엔 여기서 disabled로 막혀 힌트를 다시 숨길 방법이 없었다 —
                  이제 3단계에서도 눌러(토글) 원래(0단계, 힌트 없음) 상태로 되돌릴 수 있다. */}
              {userToMove && <button onClick={requestHint} className="press" title={hintLevel >= 3 ? t("눌러서 힌트 숨기기") : t("힌트 보기")} style={{ display: "inline-flex", alignItems: "center", gap: 5, padding: "6px 14px", borderRadius: 9, background: hintLevel >= 3 ? "linear-gradient(180deg,#F3D57A," + T.brass + ")" : "transparent", color: hintLevel >= 3 ? "#241509" : "#8A6A18", border: "1px solid " + T.brass, fontWeight: 700, cursor: "pointer", fontSize: 12 }}>{tx("{0} 힌트{1}", <Lightbulb size={13} />, hintLevel > 0 ? " " + hintLevel + "/3" : "")}</button>}
            </div>
            {/* (사용자 요청) 힌트 버튼 아래에 라인 1~n을 숫자만 표시한 원형 버튼으로 나열 — 누르면
                gotoLine으로 그 라인을 목표로 바로 처음부터 풀이를 시작한다(이미 푼 라인이어도 다시
                고를 수 있다 — gotoLine 자체가 재도전을 막지 않고, 라인마다 XP는 최초 1회만 지급되지만
                추천 랭킹용 풀이 이벤트는 재도전마다 매번 기록된다). 라인이 하나뿐인 퍼즐은 "처음부터"
                버튼과 중복이라 굳이 보여주지 않는다.
                (v0.3.4 UI 버그 수정) 예전엔 "지금 풀고 있는 라인"(isTarget) 스타일이 채워진 금색
                배경으로 다른 모든 상태를 덮어써, 이미 푼 라인을 다시 선택했을 때 그게 풀렸던
                라인인지 시각적으로 알 수 없었다(둘 다 그냥 금색 원에 숫자). 해결 여부(초록 배경 +
                체크 아이콘, 숫자 대신)와 지금 풀고 있는지(테두리만 금색)를 서로 독립된 신호로
                분리해, 두 상태가 겹쳐도(이미 푼 라인을 지금 다시 풀고 있는 경우) 둘 다 한눈에 보인다. */}
            {allLines.length > 1 && (
              <div className="flex justify-center" style={{ gap: 6, marginTop: 8, flexWrap: "wrap" }}>
                {allLines.map((l, i) => {
                  const lineIsSolved = solvedNow.has(l.tag);
                  const isTarget = l.tag === targetTag;
                  return (
                    <button key={l.tag} onClick={() => gotoLine(l.tag)} className="press" title={t("라인 {0}{1}", i + 1, lineIsSolved ? t(" (해결됨, 다시 풀기)") : "")}
                      style={{ width: 28, height: 28, borderRadius: "50%", flexShrink: 0,
                        border: "2px solid " + (isTarget ? T.brassHi : lineIsSolved ? T.best : "#C9B58C"),
                        background: lineIsSolved ? "#EAF3E0" : "#fff",
                        color: lineIsSolved ? T.best : T.ink,
                        fontWeight: 800, fontSize: 12, fontFamily: SITE_FONT, cursor: "pointer",
                        display: "inline-flex", alignItems: "center", justifyContent: "center" }}>
                      {lineIsSolved ? <Check size={14} /> : (i + 1)}
                    </button>
                  );
                })}
              </div>
            )}
          </div>
          <div style={{ width: "50%", boxSizing: "border-box", paddingLeft: 3 }}>
            {/* (기능) 모식도 페이지에도 보드 페이지와 같은 크기·y좌표의 미니보드를 둔다. 모식도에서
                이미 둔(공개된) 노드를 클릭하면, 보드 페이지로 옮기지 않고 여기서 그 수를 바로
                애니메이션으로 재생해 복기할 수 있다(아직 안 둔 갈래는 예전처럼 그 라인을 풀도록 이동). */}
            {/* (v0.1.3 UI) "모식도의 수를 눌러 다시 보기" 안내 문구를 삭제 — 모바일에서 좁은 화면을
                더 차지하기만 하고, 모식도 자체가 눌러보는 UI임은 이미 충분히 직관적이다. */}
            <PuzzlePgnBox sans={previewNode ? [...setup, ...previewNode.path] : []} onPick={pickToLearn} />
            <div style={{ width: "100%", maxWidth: 380, margin: "0 auto 12px" }}>
              {previewNode
                ? <AnimatedMove key={previewNode.key} sans={[...setup, ...previewNode.path.slice(0, -1)]} san={previewNode.path[previewNode.path.length - 1]} size={boardSize} loopMs={2200} flip={userColor === "b"} />
                : <Board board={board} flip={userColor === "b"} size={boardSize} showEval={false} interactive={false} />}
            </div>
            {/* (20차 기능1) 퍼즐 모식도 — 분기 트리·채택률 두께·수 체계 아이콘·평가치·해결 표시 */}
            <PuzzleSchematic tree={tree} rootLabel={puzzle.mistakeSan} meta={meta} allLines={allLines} solvedNow={solvedNow} curKeys={pathNodes.map((n) => stripSuffix(n.san))} exploredKeys={everRevealed} setupSans={setup} setupLen={setup.length} onPick={onPickNode} canEdit={canEditPuzzle} onAddMove={addMoveToLeaf} onDeleteMove={deleteMoveFromLeaf} onSuggestSiblings={suggestSiblings} onAddSibling={addSibling} celebrateTag={celebrate ? celebrate.tag : null} shakeTag={celebrate ? nextTag : null} fenRoot={fenRoot} />
            {/* (신규 기능) 사용자 요청 — 생성자 권한 박스에서 공개/비공개를 나중에 바꿀 수 있게. 라인
                편집(1시간 주기)과 달리 언제든 바꿀 수 있다. */}
            {canManageVisibility && (
              <div style={{ marginTop: 10, paddingTop: 10, borderTop: "1px dashed #C9B58C" }}>
                <div style={{ fontSize: 10.5, fontWeight: 800, color: T.inkSoft, marginBottom: 5 }}>{tx("{0} · 공개 설정", canEdit ? t("개발자") : t("제작자"))}</div>
                <div className="flex items-center gap-2">
                  {[[true, t("공개")], [false, t("비공개")]].map(([v, lb]) => (
                    <button key={String(v)} onClick={() => saveVisibility(v)} disabled={visBusy} className="press" style={{ padding: "5px 10px", borderRadius: 7, border: "1px solid " + T.brass, background: publicInput === v ? T.brass : "transparent", color: publicInput === v ? "#241509" : T.ink, fontWeight: 800, fontSize: 11, cursor: visBusy ? "default" : "pointer", opacity: visBusy ? 0.6 : 1 }}>{lb}</button>
                  ))}
                </div>
                {!publicInput && <div style={{ fontSize: 9.5, color: T.inkSoft, marginTop: 5 }}>{t("비공개. 나와 개발자만 볼 수 있음")}</div>}
              </div>
            )}
            {/* (20차 기능1·3) 라인 길이는 모식도의 각 라인 끝(리프)에 있는 "+"(추가)·삭제 버튼으로 한 수씩 직접 조정한다.
                (v0.3.4 기능) 사용자 요청 — 개발자/공동개발자뿐 아니라 이 퍼즐의 생성자 본인도(1시간
                편집 주기 안에서) 이 도구 전체를 그대로 쓸 수 있다. 주기가 아직 안 지났으면 도구
                대신 남은 시간을 알려준다. */}
            {isMyPuzzle && !canEdit && creatorCooldownMs > 0 && (
              <div style={{ marginTop: 10, paddingTop: 10, borderTop: "1px dashed #C9B58C", fontSize: 11, color: T.inkSoft }}>{tx("내 퍼즐. 방금 편집해서 약 {0}분 뒤 라인 재조정 가능", Math.max(1, Math.ceil(creatorCooldownMs / 60000)))}</div>
            )}
            {canEditPuzzle && (
              <div style={{ marginTop: 10, paddingTop: 10, borderTop: "1px dashed #C9B58C" }}>
                {isMyPuzzle && !canEdit && <div style={{ fontSize: 11, color: T.brass, fontWeight: 700, marginBottom: 8 }}>{t("내 퍼즐. 라인 조정·재생성은 1시간에 한 번 가능")}</div>}
                {/* (신규) 퍼즐 종류 — 포지션 우위(cp 이득 기준)/기물 우위(기물 이득 즉시 종료, 수비자
                    제거 같은 전술용). 목표 cp는 포지션 우위일 때만 의미가 있으므로 그때만 보여준다. */}
                <div style={{ fontSize: 10.5, fontWeight: 800, color: T.inkSoft, marginBottom: 5 }}>{tx("{0} · 퍼즐 종류", canEdit ? t("개발자") : t("제작자"))}</div>
                <div className="flex items-center gap-2" style={{ flexWrap: "wrap", marginBottom: 10 }}>
                  {[["positional", t("포지션 우위")], ["material", t("기물 우위")]].map(([v, label]) => (
                    <button key={v} onClick={() => savePuzzleType(v)} className="press" style={{ padding: "5px 10px", borderRadius: 7, border: "1px solid " + T.brass, background: puzzleTypeInput === v ? T.brass : "transparent", color: puzzleTypeInput === v ? "#241509" : T.ink, fontWeight: 800, fontSize: 11, cursor: "pointer" }}>{label}</button>
                  ))}
                </div>
                {puzzleTypeInput === "positional" && (
                  <>
                    <div style={{ fontSize: 10.5, fontWeight: 800, color: T.inkSoft, marginBottom: 5 }}>{tx("{0} · 기본 이점 기준 {1}", canEdit ? t("개발자") : t("제작자"), <span style={{ color: T.ink }}>{t("(자동 생성이 확실히 유리하다고 보는 평가치)")}</span>)}</div>
                    <div className="flex items-center gap-2" style={{ flexWrap: "wrap" }}>
                      <input type="number" step={10} value={targetInput} onChange={(e) => setTargetInput(parseInt(e.target.value, 10) || 0)} onBlur={() => saveDefaultTarget(targetInput)}
                        style={{ width: 72, padding: "5px 7px", borderRadius: 7, border: "1px solid #C9B58C", fontFamily: SITE_FONT, fontSize: 12 }} />
                      <span style={{ fontSize: 10.5, color: T.inkSoft }}>{tx("cp (현재 기본값 {0}", defaultTarget)})</span>
                    </div>
                  </>
                )}
                <div className="flex items-center gap-2" style={{ flexWrap: "wrap", marginTop: 8 }}>
                  <button onClick={regenerateWithTarget} disabled={!engine || engine.status !== "ready" || regenBusy} className="press" style={{ marginLeft: "auto", padding: "6px 12px", borderRadius: 8, background: "linear-gradient(180deg,#3A2516,#241509)", color: T.ivoryHi, fontWeight: 800, border: "none", cursor: "pointer", fontSize: 11.5, opacity: (!engine || engine.status !== "ready") ? 0.5 : 1 }}>{regenBusy ? t("재생성 중…") : t("이 기준으로 기본 트리 재생성")}</button>
                </div>
                <div style={{ fontSize: 9.5, color: T.blunder, marginTop: 5 }}>{t("재생성하면 트리가 새로 만들어져 수동으로 추가·삭제한 내용이 모두 사라짐")}</div>
                {!canEdit && <div style={{ fontSize: 9.5, color: T.inkSoft, marginTop: 3 }}>{t("라인 조정·재생성은 1시간에 한 번")}</div>}
                {regenErr && <div style={{ fontSize: 10, color: T.blunder, marginTop: 3 }}>{regenErr}</div>}
                {(!engine || engine.status !== "ready") && <div style={{ fontSize: 10, color: T.blunder, marginTop: 3 }}>{t("엔진 준비 후 라인 수 추가·삭제·재생성 가능")}</div>}
              </div>
            )}
            {/* (v0.3.4 기능) 사용자 요청 — 개발자/공동개발자 전용, 이 퍼즐의 생성자를 재지정(박탈)한다.
                개발자 명의로 회수하거나 다른 유저에게 양도할 수 있다 — 둘 다 원래 생성자의 이 퍼즐
                편집권을 그 즉시 잃게 만든다. */}
            {canEdit && (
              <div style={{ marginTop: 10, paddingTop: 10, borderTop: "1px dashed #C9B58C" }}>
                <div style={{ fontSize: 10.5, fontWeight: 800, color: T.inkSoft, marginBottom: 5 }}>{t("개발자 · 퍼즐 생성자")}</div>
                <div style={{ fontSize: 11, color: T.ink, marginBottom: 6 }}>{tx("현재: {0}", creatorInfo && creatorInfo.username ? "@" + creatorInfo.username : t("없음"))}</div>
                <div className="flex items-center gap-2" style={{ flexWrap: "wrap" }}>
                  <input value={reassignInput} onChange={(e) => setReassignInput(e.target.value)} placeholder={t("양도할 아이디")} style={{ flex: 1, minWidth: 120, padding: "5px 8px", borderRadius: 7, border: "1px solid #C9B58C", fontSize: 11.5 }} />
                  <button disabled={reassignBusy || !reassignInput.trim()} onClick={() => doReassign(reassignInput.trim())} className="press" style={{ padding: "5px 10px", borderRadius: 7, border: "1px solid " + T.brass, background: T.brass, color: "#241509", fontWeight: 800, fontSize: 11, cursor: "pointer", opacity: reassignBusy || !reassignInput.trim() ? 0.6 : 1 }}>{t("양도")}</button>
                  <button disabled={reassignBusy} onClick={() => doReassign(null)} className="press" style={{ padding: "5px 10px", borderRadius: 7, border: "1px solid " + T.brass, background: "transparent", color: T.brass, fontWeight: 800, fontSize: 11, cursor: "pointer" }}>{t("개발자 명의로 회수")}</button>
                </div>
                {reassignMsg && <div style={{ fontSize: 10.5, color: T.inkSoft, marginTop: 5 }}>{reassignMsg}</div>}
              </div>
            )}
            {/* (사용자 요청) 퍼즐 생성자에 한해, 자신이 만든 퍼즐을 이 모식도(2페이지)에서 삭제할 수
                있게 — 개발자와 달리 제작자는 라인 편집이 아니라 퍼즐 자체를 통째로 지울 수 있다. */}
            {/* (버그 수정, 사용자 요청) "개발자 권한으로 임의의 퍼즐을 삭제할 수 있어야 한다"는
                요청 — 서버 RPC(puzzle_delete)는 이미 is_content_editor(개발자/공동개발자)면 생성자와
                무관하게 삭제를 허용하는데, 이 버튼이 isMyPuzzle(=생성자 본인)일 때만 렌더링돼 개발자가
                자기 퍼즐이 아닌 퍼즐에서는 삭제 버튼 자체를 볼 수 없었다 — canEdit(개발자/공동개발자)도
                함께 조건에 추가한다. */}
            {(isMyPuzzle || canEdit) && onDeletePuzzle && (
              <div style={{ marginTop: 10, paddingTop: 10, borderTop: "1px dashed #C9B58C" }}>
                <button onClick={() => setConfirmDeletePuzzle(true)} className="press" style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "8px 13px", borderRadius: 10, background: T.ebony2, color: "#F4A8A8", fontWeight: 800, fontSize: 12.5, border: "1px solid #000", cursor: "pointer" }}>{tx("{0} 이 퍼즐 삭제", <Trash2 size={14} />)}</button>
              </div>
            )}
          </div>
        </div>
        {page === 1 && <button onClick={() => setPage(0)} aria-label={t("보드 보기")} className="press" style={{ position: "absolute", left: 2, top: "50%", transform: "translateY(-50%)", zIndex: 6, width: 26, height: 26, borderRadius: "50%", background: "rgba(20,12,6,.55)", color: "#fff", border: "none", cursor: "pointer", display: "inline-flex", alignItems: "center", justifyContent: "center" }}><ChevronLeft size={16} /></button>}
        {page === 0 && <button onClick={() => setPage(1)} aria-label={t("모식도 보기")} className="press" style={{ position: "absolute", right: 2, top: "50%", transform: "translateY(-50%)", zIndex: 6, width: 26, height: 26, borderRadius: "50%", background: "rgba(20,12,6,.55)", color: "#fff", border: "none", cursor: "pointer", display: "inline-flex", alignItems: "center", justifyContent: "center" }}><ChevronRight size={16} /></button>}
        {/* (사용자 요청) 라인 하나를 클리어할 때마다 LINE CLEAR 배너를, 퍼즐의 모든 라인을 다 클리어했으면
            LINE CLEAR가 완전히 재생되고 사라진 뒤(v0.3.9 사용자 요청, 4.2s 뒤) 이어서 별 3개 + PUZZLE CLEAR
            배너를 재생한다. 보드/모식도 어느 페이지에 있든 보이도록 페이저(position:relative) 위에 얹는다. */}
        {lineClearOn !== false && <LineClearBanner trigger={celebrate ? celebrate.tag : null} />}
        {puzzleClearOn !== false && celebrate && fullyComplete && <PuzzleClearBanner trigger={celebrate.tag} />}
      </div>
      {/* (20차 기능2 → v0.3.5) 라인 해결 배너는 어느 페이지에 있든(자동 전환 중이어도) 항상 보이도록
          페이저 바깥(공통 영역)에 둔다. (사용자 요청) "다음 라인 풀기" 버튼은 없앴다 — 아래 자동 전환
          effect(celebrate 종료 2.4초 뒤 자동으로 nextTag로 넘어감)가 이미 그 역할을 하고 있어 중복이었다. */}
      {done && fullyComplete && (
        <div style={{ marginTop: 12, textAlign: "center", background: "linear-gradient(180deg,#3A2516,#241509)", borderRadius: 12, padding: "12px 14px", border: "1px solid " + T.brass }}>
          <div style={{ color: T.brassHi, fontWeight: 800, fontSize: 13 }}>{tx("완전 해결 {0}개 라인 모두 정복, 별 3개 획득", totalLines)}</div>
        </div>
      )}
      <div className="flex items-center justify-center gap-2" style={{ marginTop: 8, marginBottom: 4 }}>
        <button onClick={() => setPage(0)} aria-label={t("보드 페이지")} className="press" style={{ width: page === 0 ? 16 : 7, height: 7, borderRadius: 999, padding: 0, border: "none", cursor: "pointer", background: page === 0 ? T.brass : "rgba(0,0,0,.2)", transition: "width .25s ease, background .25s ease" }} />
        <button onClick={() => setPage(1)} aria-label={t("모식도 페이지")} className="press" style={{ width: page === 1 ? 16 : 7, height: 7, borderRadius: 999, padding: 0, border: "none", cursor: "pointer", background: page === 1 ? T.brass : "rgba(0,0,0,.2)", transition: "width .25s ease, background .25s ease" }} />
      </div>
      </div>
      {/* (사용자 요청) 퍼즐 삭제 확인 — 대화·친구 삭제 확인 다이얼로그와 동일한 패턴, 실수로 지우지
          않도록 한 번 더 물어본다. */}
      {confirmDeletePuzzle && (
        <div onClick={() => !deletingPuzzle && setConfirmDeletePuzzle(false)} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.6)", zIndex: 90, display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}>
          <div onClick={(e) => e.stopPropagation()} style={{ maxWidth: 300, width: "100%", background: "linear-gradient(180deg,#F2E8D5,#E2D2B2)", borderRadius: 14, padding: 20, border: "1px solid #CDB98E", boxShadow: "0 20px 50px -10px rgba(0,0,0,.7)" }}>
            <div style={{ fontSize: 15, fontWeight: 800, color: T.ink, marginBottom: 6 }}>{t("퍼즐 삭제")}</div>
            <p style={{ fontSize: 13, color: T.inkSoft, marginBottom: 16 }}>{t("이 퍼즐을 삭제할까요? 되돌릴 수 없고 다른 사람의 피드에서도 사라짐")}</p>
            {deletePuzzleErr && <p style={{ fontSize: 12, color: T.blunder, marginTop: -8, marginBottom: 14, fontWeight: 700 }}>{deletePuzzleErr}</p>}
            <div className="flex gap-2 justify-end">
              <button onClick={() => setConfirmDeletePuzzle(false)} disabled={deletingPuzzle} className="press" style={{ padding: "8px 14px", borderRadius: 9, border: "1px solid #C9B58C", background: "transparent", color: T.ink, fontWeight: 700, cursor: deletingPuzzle ? "default" : "pointer", opacity: deletingPuzzle ? 0.5 : 1 }}>{t("취소")}</button>
              <button onClick={doDeletePuzzle} disabled={deletingPuzzle} className="press" style={{ padding: "8px 14px", borderRadius: 9, border: "none", background: T.blunder, color: "#fff", fontWeight: 800, cursor: deletingPuzzle ? "default" : "pointer", opacity: deletingPuzzle ? 0.6 : 1 }}>{deletingPuzzle ? t("삭제하는 중...") : t("삭제")}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
// (v0.2.7) 오늘의 퍼즐 카드 폭 — 스크롤 스냅 계산을 단순하게 유지하기 위해 활성/비활성 여부와
// 무관하게 "칸(slot)" 자체는 고정폭으로 두고, 안쪽 콘텐츠만 transform:scale로 커지고 작아진다.
// (버그 보충) 원래는 활성 카드만 scale(1)로 키우고 옆 카드는 0.8/0.68로 줄여, 카드 폭 자체가
// 거리별로 다 달랐다 — 슬롯 간격(DAILY_SLOT_W)은 하나로 고정돼 있는데 카드 폭이 제각각이니
// 카드 사이 "보이는 여백"도 쌍마다 다 달라질 수밖에 없었다(활성-이웃 간 여백 ≠ 이웃-이웃 간
// 여백). 여러 차례 조정해도 근본적으로 안 맞을 수밖에 없는 구조라, 폭 자체를 아예 고정하고
// (DailyPuzzleCarouselItem의 scale을 항상 1로) "활성" 표시는 밝기·테두리·그림자만으로 하도록
// 바꿨다 — 이제 모든 카드가 같은 폭이라 슬롯 간격이 곧 카드 사이 여백이 되고, 어느 쌍이든
// 정확히 같다.
const DAILY_CARD_W = 206; // DAILY_BOARD_SIZE(아래) + 좌우 padding 16
const DAILY_SLOT_W = DAILY_CARD_W + 28; // 카드 폭 + 여백 28px = 카드 사이 여백이 항상 28px로 동일
// 모든 카드가 항상 같은 폭·모양의 카드(보드+"일일 퍼즐"+오프닝명+풀이수)를 쓰고, 활성이 아닌
// 카드는 밝기(opacity)만 낮아진다 — 크기가 안 바뀌니 스크롤 중 카드 모양이 바뀌거나 카드끼리
// 겹치는 일 없이, 슬롯(DAILY_SLOT_W) 간격이 곧 카드 사이 여백이 된다.
// (기능) 사용자 요청 — 오프닝명·"일일 퍼즐" 라벨 등 텍스트를 다 빼고, 정사각형 블록 안에 체스보드만
// 기존(68px)보다 약 3배 크게 보여준 뒤, 그 아래에 작게 "N명이 풀었습니다"만 표시한다.
const DAILY_BOARD_SIZE = 190;
// (신규 기능, 사용자 요청) 일일 퍼즐 스트릭 배지 — best(역대 최고 연속 일수)가 이 문턱을 넘으면
// 그 즉시 영구히 "획득"으로 취급한다(count가 나중에 끊겨도 배지는 그대로 남는다 — 별도의 획득
// 여부 저장이 필요 없는 이유). days는 오름차순으로 정렬돼 있어야 한다.
const STREAK_BADGES = [
  { days: 3, label: t("3일 연속") },
  { days: 7, label: t("일주일 연속") },
  { days: 14, label: t("2주 연속") },
  { days: 30, label: t("한 달 연속") },
  { days: 100, label: t("100일 연속") },
];
// 퍼즐 탭 오늘의 퍼즐 캐러셀 바로 아래에 붙는 스트릭 표시줄 — 지금 이어지는 연속 일수(불꽃 아이콘)와
// 배지 목록(달성한 건 금색, 못한 건 회색)을 한 줄로 보여준다. (버그 수정, 코드 리뷰 지적) dailyPuzzleStreak는
// useState 초깃값이 이미 { count:0, best:0, lastDate:null }라 절대 null/undefined가 되지 않으므로
// "streak가 없으면 숨긴다"는 없는 조건이었다 — 일일 퍼즐을 한 번도 안 푼 신규 유저에게 "0일 연속"이
// 영구히 보이지 않도록, count·best가 둘 다 0인(아직 기록이 전혀 없는) 경우에만 숨긴다.
function DailyStreakStrip({ streak }) {
  if (!streak || (!streak.count && !streak.best)) return null;
  const { count, best } = streak;
  return (
    <div className="flex items-center gap-2" style={{ marginBottom: 12, padding: "8px 12px", borderRadius: 10, background: "rgba(0,0,0,.22)", border: "1px solid #5A4630", flexWrap: "wrap" }}>
      <span className="flex items-center gap-1" style={{ flexShrink: 0 }}>
        <Flame size={16} color={count > 0 ? "#E8874A" : "rgba(235,221,196,.35)"} fill={count > 0 ? "#E8874A" : "none"} />
        <span style={{ fontSize: 13, fontWeight: 800, color: count > 0 ? T.ivoryHi : "rgba(235,221,196,.5)" }}>{tx("{0}일 연속", count)}</span>
      </span>
      {best > 0 && <span style={{ fontSize: 10.5, color: "rgba(235,221,196,.5)", flexShrink: 0 }}>{tx("최고 {0}일", best)}</span>}
      <span style={{ width: 1, alignSelf: "stretch", background: "#5A4630", flexShrink: 0 }} />
      <div className="flex items-center gap-1" style={{ flexWrap: "wrap" }}>
        {STREAK_BADGES.map((b) => {
          const earned = best >= b.days;
          return (
            <span key={b.days} title={b.label + (earned ? t(" 달성") : t(" ({0}일 필요)", b.days))} className="flex items-center gap-1" style={{ padding: "3px 7px", borderRadius: 999, background: earned ? "rgba(236,203,134,.18)" : "rgba(255,255,255,.05)", border: "1px solid " + (earned ? T.brass : "rgba(255,255,255,.1)") }}>
              <Medal size={11} color={earned ? T.brassHi : "rgba(235,221,196,.3)"} />
              <span style={{ fontSize: 9.5, fontWeight: 800, color: earned ? T.brassHi : "rgba(235,221,196,.3)" }}>{tx("{0}일", b.days)}</span>
            </span>
          );
        })}
      </div>
    </div>
  );
}
function DailyPuzzleCarouselItem({ dateStr, isToday, puzzle, isActive, distance, isSolved, solveCount, onOpen }) {
  const label = dateStr.slice(5).replace("-", ".") + (isToday ? t(" · 오늘") : "");
  const flip = puzzle ? ((puzzle.setupSans ? puzzle.setupSans.length : 0) + 1) % 2 !== 0 : false;
  // (버그 보충) 모든 카드가 이제 항상 같은 폭(DAILY_CARD_W)이라 여백이 균등해진다 — "활성" 표시는
  // 더 이상 크기가 아니라 밝기·테두리·그림자 차이만으로 한다.
  const opacity = isActive ? 1 : distance === 1 ? 0.72 : 0.5;
  return (
    <div style={{ position: "relative", flex: "0 0 auto", width: DAILY_SLOT_W, scrollSnapAlign: "center", height: 250 }}>
      <button onClick={onOpen} aria-label={label} className="press" style={{ position: "absolute", left: "50%", top: 0, transform: "translateX(-50%)", opacity, transition: "opacity .22s ease", zIndex: isActive ? 3 : 1, background: "transparent", border: "none", padding: 0, cursor: "pointer", display: "flex", flexDirection: "column", alignItems: "center", gap: 6 }}>
        <div style={{ fontSize: 11, fontWeight: 800, color: isActive ? T.brassHi : "#C9B58C", whiteSpace: "nowrap" }}>{label}</div>
        {/* (사용자 요청) 다른 퍼즐 블록(PuzzleCard)과 같은 크림색 카드 디자인으로 통일 — 어두운 ebony
            그라데이션 대신 T.ivoryHi 크림 그라데이션, 해결 시엔 같은 연두색 그라데이션을 그대로 쓴다. */}
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 5, width: DAILY_CARD_W, padding: 8, borderRadius: 14, background: isSolved ? "linear-gradient(180deg,#E7F0DC,#D2E2BC)" : "linear-gradient(180deg," + T.ivoryHi + ",#E2D2B2)", border: "1px solid " + (isSolved ? "#A9C589" : (isActive ? T.brass : "#CDB98E")), boxShadow: isActive ? "0 10px 24px -8px rgba(0,0,0,.4)" : "0 3px 0 " + (isSolved ? "#9DB97E" : "#B59A6E") }}>
          <div style={{ width: DAILY_BOARD_SIZE, height: DAILY_BOARD_SIZE, flex: "0 0 auto", borderRadius: 10, display: "flex", alignItems: "center", justifyContent: "center", background: isSolved ? "linear-gradient(180deg,#E7F0DC,#D2E2BC)" : "#FBF5E8", border: "1px solid " + (isSolved ? "#A9C589" : "#CDB98E"), position: "relative" }}>
            {puzzle ? <AnimatedMove sans={puzzle.setupSans} san={puzzle.mistakeSan} size={DAILY_BOARD_SIZE - 14} loopMs={2400} flip={flip} /> : <div style={{ width: 100, height: 100, borderRadius: 8, background: "rgba(0,0,0,.08)", animation: "hintSquarePulse 1.3s ease-in-out infinite" }} />}
            {isSolved && <Check size={16} strokeWidth={3.5} style={{ position: "absolute", top: -6, right: -6, color: "#fff", background: T.best, borderRadius: 999, padding: 3, boxShadow: "0 1px 3px rgba(0,0,0,.4)" }} />}
          </div>
          {solveCountText(solveCount, null) && <div style={{ fontSize: 10.5, color: "#2E6E2E", fontWeight: 700, whiteSpace: "nowrap" }}>{solveCountText(solveCount, null)}</div>}
        </div>
      </button>
    </div>
  );
}
// (v0.2.7 기능) "오늘의 퍼즐"을 다른 일반 퍼즐과 이름·표기를 통일하는 대신, 고전 오락실 슬롯머신처럼
// 좌우로 스크롤해 날짜를 고르는 캐러셀로 개편했다 — 가운데로 스냅된(선택된) 항목만 커지고 진하게,
// 나머지는 작고 어둡게 보인다. 화면에 보이는 모든 항목이 한꺼번에 엔진을 돌리면 무거우므로, 선택된
// 항목과 그 바로 양옆만 즉시 계산하고 나머지는 스크롤로 가까워질 때 계산한다(resolveDailyPuzzleCached
// 덕분에 같은 날짜를 다시 스크롤해 돌아와도 다시 계산하지 않는다).
function DailyPuzzleCarousel({ engine, solved, solveCounts, onOpen }) {
  const dates = useDailyPuzzleDates();
  const scrollerRef = useRef(null);
  const [containerW, setContainerW] = useState(0);
  const [activeIdx, setActiveIdx] = useState(0);
  const [resolvedMap, setResolvedMap] = useState({}); // dateStr -> puzzle|null(계산 완료)
  // (버그 수정) dates는 비동기로 채워지므로, 이 컴포넌트의 "첫" 렌더에서는 dates가 아직 비어 있어
  // 아래 `if (!dates.length) return null`에 걸려 스크롤러 자체가 DOM에 없다 — 그 시점에 이 effect가
  // (빈 deps라 딱 한 번만) 실행되면 scrollerRef.current가 null이라 측정을 건너뛰고, dates가 나중에
  // 채워져 스크롤러가 실제로 마운트돼도 이 effect는 다시 실행되지 않아 containerW가 영원히 0으로
  // 남았다 — spacer(가운데 정렬용 여백)가 항상 0이 되어, 활성 카드가 화면 중앙이 아니라 스크롤러
  // 왼쪽 끝에 붙어 렌더링됐다(기존 디자인은 카드가 슬롯 폭 안에 머물러 눈에 띄지 않았을 뿐).
  // dates.length를 deps에 넣어, 스크롤러가 실제로 처음 DOM에 나타나는 시점에 다시 측정하게 한다.
  useLayoutEffect(() => {
    const el = scrollerRef.current;
    if (!el) return;
    const measure = () => setContainerW(el.clientWidth);
    measure();
    if (typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [dates && dates.length]);
  useEffect(() => {
    if (!dates || !dates.length) return;
    // (성능) 엔진 워커는 하나뿐이라 여러 날짜의 계산 요청이 FIFO로 줄을 선다 — 예전엔 activeIdx-1을
    // activeIdx보다 먼저 요청해, 정작 화면 가운데 크게 보이는(가장 먼저 눈에 띄어야 할) 프리뷰가
    // 옆 칸 계산이 끝날 때까지 뒤로 밀렸다. activeIdx를 항상 맨 먼저 큐에 넣어 그 프리뷰부터 뜨게 한다.
    const idxs = [activeIdx, activeIdx - 1, activeIdx + 1].filter((i) => i >= 0 && i < dates.length);
    idxs.forEach((i) => {
      const d = dates[i];
      if (resolvedMap[d] !== undefined) return;
      resolveDailyPuzzleCached(d, engine).then((pz) => { setResolvedMap((m) => (m[d] !== undefined ? m : { ...m, [d]: pz })); });
    });
  }, [activeIdx, dates, engine]);
  const onScroll = () => {
    const el = scrollerRef.current;
    if (!el || !dates) return;
    const idx = Math.max(0, Math.min(dates.length - 1, Math.round(el.scrollLeft / DAILY_SLOT_W)));
    setActiveIdx((prev) => (prev === idx ? prev : idx));
  };
  const scrollToIndex = (i) => { const el = scrollerRef.current; if (el) el.scrollTo({ left: i * DAILY_SLOT_W, behavior: "smooth" }); };
  // (v0.2.7 버그 수정) overflow-x:auto의 브라우저 기본 스크롤만으로는 데스크톱 마우스로 좌우 스크롤이
  // 거의 안 된다(엔진 라인·기보 줄과 같은 문제, DRAG_SCROLL_MULT 참고) — 포인터 이벤트로 직접
  // scrollLeft를 옮기는 드래그 스크롤을 추가한다. 손을 뗄 때 가장 가까운 칸으로 스냅시켜, 드래그
  // 도중 프로그램적으로 옮긴 scrollLeft에는 적용되지 않는 CSS scroll-snap을 보정한다. 드래그였다면
  // (moved) 그 자리의 카드가 열리거나 다른 칸으로 다시 스크롤되지 않도록 클릭을 막는다.
  // (v0.2.7 버그 수정) 위 최초 구현은 실제로는 클릭이 전혀 안 먹는 문제가 있었다 — 원인 두 가지를
  // 함께 고쳤다: (1) 컨테이너에 scrollBehavior:"smooth"가 걸려 있어, 손 떨림 수준의 1px만 움직여도
  // el.scrollLeft 대입이 애니메이션으로 처리되면서 손을 떼는 순간까지 카드가 커서 아래에서 계속
  // 미끄러져, 브라우저가 pointerdown/up 타깃 불일치로 보고 click 자체를 합성하지 않았다 — 이제
  // scrollLeft는 드래그 중 항상 즉시 반영되고(smooth는 scrollToIndex의 명시적 scrollTo 호출에만
  // 적용), 실제로 임계값을 넘어 "이동"으로 확정되기 전까지는 scrollLeft를 아예 건드리지 않는다.
  // (2) 클릭 판정 임계값(3px)이 실제 마우스/터치 클릭에서 흔한 손 떨림보다 작아 진짜 클릭도 자주
  // 드래그로 오판했다 — 8px로 넉넉히 늘렸다. pointerId를 기억해 두었다가 손을 떼는 순간
  // releasePointerCapture로 명시적으로 캡처를 풀어, 브라우저가 그 뒤 click을 정상적으로 합성하도록 한다.
  const DRAG_CLICK_THRESHOLD = 8;
  const dragRef = useRef(null);
  // (v0.2.7 버그 수정) endDrag(pointerup)는 뒤이어 오는 click보다 항상 먼저 실행되므로, dragRef를
  // 그 안에서 곧장 null로 비우면 click 시점엔 이미 null이라 "방금 드래그였는지" 판단이 늘 거짓이
  // 됐다(=드래그 뒤 클릭 차단이 원천적으로 동작하지 않는 죽은 코드였다). click 핸들러가 볼 수 있게
  // 별도 ref에 "직전 포인터 시퀀스가 실제 드래그였는지"만 남겨 두고, click에서 한 번 소비하고 지운다.
  const wasDragRef = useRef(false);
  // (v0.2.7 버그 수정) 위 두 수정 후에도 클릭이 여전히 안 된다는 신고가 있었다 — 남은 원인은
  // setPointerCapture 자체였다. 이 커스텀 드래그는 애초에 "컴퓨터에서 마우스로 스크롤"이 목적이었는데
  // 터치 포인터에도 똑같이 setPointerCapture를 걸고 있었다 — 일부 모바일 브라우저는 조상 요소가
  // 포인터를 캡처한 채로 pointerup을 맞으면(우리가 releasePointerCapture를 명시적으로 부르기 전까지
  // 짧은 순간이라도) 그 뒤 click 자체를 아예 합성하지 않는 경우가 있어, 이동이 전혀 없는 순수한
  // 탭에서도 click이 사라졌다. 마우스 포인터(pointerType==="mouse")에서만 이 커스텀 드래그를 걸고,
  // 터치·펜은 아예 손대지 않아 브라우저 기본 스크롤(overflow-x:auto)+click이 그대로 살아 있게 한다
  // — 원래 요청도 "컴퓨터 환경에서 마우스로"였으므로 범위상으로도 맞다.
  // (버그 수정) 예전엔 pointerdown 시점에 곧장 setPointerCapture를 걸었다 — 실제로 끌지 않은 순수한
  // 클릭에서도 컨테이너가 포인터를 캡처한 채로 pointerup을 맞는 셈이라, 브라우저에 따라 그 뒤에 이어질
  // click 합성이 씹히는 경우가 있었다(위 세 차례의 수정 이후에도 데스크톱에서 간헐적으로 재현된 원인으로
  // 추정). 실제로 임계값을 넘어 "이동"이 확정된 순간에만 캡처를 걸어, 캡처가 순수 클릭의 클릭 합성에는
  // 아예 관여하지 않도록 한다.
  const onPointerDown = (e) => {
    if (e.pointerType !== "mouse") return;
    const el = scrollerRef.current;
    dragRef.current = { x: e.clientX, scrollLeft: el ? el.scrollLeft : 0, moved: false, pointerId: e.pointerId, target: e.currentTarget };
  };
  const onPointerMove = (e) => {
    const d = dragRef.current;
    const el = scrollerRef.current;
    if (!d || !el || e.pointerType !== "mouse") return;
    const dx = e.clientX - d.x;
    if (!d.moved && Math.abs(dx) <= DRAG_CLICK_THRESHOLD) return;   // 임계값 전까지는 손 떨림으로 보고 아예 무시(스크롤도 안 밀림)
    if (!d.moved && d.target && d.target.setPointerCapture) { try { d.target.setPointerCapture(d.pointerId); } catch { /* noop */ } }
    d.moved = true;
    el.scrollLeft = d.scrollLeft - dx * DRAG_SCROLL_MULT;
  };
  const endDrag = (e) => {
    const d = dragRef.current;
    const el = scrollerRef.current;
    dragRef.current = null;
    wasDragRef.current = !!(d && d.moved);
    if (d && d.moved && d.target && d.target.releasePointerCapture) { try { d.target.releasePointerCapture(d.pointerId); } catch { /* noop */ } }
    if (d && d.moved && el && dates) scrollToIndex(Math.max(0, Math.min(dates.length - 1, Math.round(el.scrollLeft / DAILY_SLOT_W))));
  };
  const onClickCapture = (e) => { if (wasDragRef.current) { wasDragRef.current = false; e.preventDefault(); e.stopPropagation(); } };
  if (!dates || !dates.length) return null;
  const spacer = Math.max(0, containerW / 2 - DAILY_SLOT_W / 2);
  return (
    <div style={{ marginBottom: 16 }}>
      <div className="flex items-center gap-1" style={{ marginBottom: 6, paddingLeft: 2 }}>
        <span style={{ fontSize: 13, lineHeight: 1 }}>📅</span>
        <span style={{ fontSize: 12.5, fontWeight: 800, color: T.brassHi }}>{t("일일 퍼즐")}</span>
      </div>
      {/* (v0.2.7 버그 수정) touchAction을 "pan-y"(수직만 브라우저가 처리)로 막아 두고 커스텀 드래그가
          가로를 대신 처리하게 했었는데, 그 커스텀 드래그를 마우스 전용으로 좁히면서 터치에서는 아무도
          가로 스크롤을 처리하지 않게 돼 버렸다 — touchAction을 지정하지 않아(기본값 auto) 터치는
          브라우저 기본 가로/세로 스크롤을 그대로 쓰도록 되돌린다(스냅은 scroll-snap-type이 계속 담당). */}
      <div ref={scrollerRef} onScroll={onScroll} onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={endDrag} onPointerCancel={endDrag} onClickCapture={onClickCapture} style={{ display: "flex", overflowX: "auto", scrollSnapType: "x mandatory", WebkitOverflowScrolling: "touch", cursor: "grab", userSelect: "none", WebkitUserSelect: "none" }}>
        <div style={{ flex: "0 0 auto", width: spacer }} />
        {dates.map((d, i) => {
          const pz = resolvedMap[d];
          const isSolved = pz ? solved.has(pz.id) : false;
          const rawCount = pz ? ((solveCounts && solveCounts[puzzleNo(pz.id)]) || 0) : 0;
          const count = Math.max(rawCount, isSolved ? 1 : 0);
          return (
            <DailyPuzzleCarouselItem key={d} dateStr={d} isToday={i === 0} puzzle={pz} isActive={i === activeIdx} distance={Math.abs(i - activeIdx)} isSolved={isSolved} solveCount={count} onOpen={() => { if (i === activeIdx) { if (pz) onOpen(pz); } else scrollToIndex(i); }} />
          );
        })}
        <div style={{ flex: "0 0 auto", width: spacer }} />
      </div>
    </div>
  );
}
export function PuzzleTab({ onOpenGrowth, puzzles, archivedPuzzles, solved, lineSolves, onLineSolved, onPuzzleSolveEvent, onPuzzleRatingEvent, onSavePuzzle, onDeletePuzzle, onPuzzleRenamed, solveCounts, puzzleSolvers, friendUids, solverNames, likedPuzzles, likeCounts, onToggleLike, repostedPuzzles, repostCounts, onToggleRepost, shareCounts, onShare, popularityScores, myUid, myUsername, puzzleRating, chesscom, chesscomUsername, active, setActive, engine, liveOn, canEdit, bumpContent, totalXp, onOpenTierMap, targetLineNo, onLineChange, onOpenLearn, creatorUsernames, lineClearOn, puzzleClearOn, coachBubbleOn, contentVer, createSeed, onConsumeCreateSeed, onOpenProfile, onOpenLearnFen, dailyPuzzleStreak, puzzleMomentum }) {
  // (사용자 요청) "빠른 필터"를 제외한 나머지 필터 구획(테마·시작 포지션·좋아요/리포스트)은 모두
  // 중복 선택(다중 선택)이 가능해야 한다 — 단일 값 대신 배열로 관리한다. 빈 배열은 "전체"(필터 없음).
  const [selectedThemes, setSelectedThemes] = useState([]); // 예: ["sacrifice","punish"]
  const toggleTheme = (k) => setSelectedThemes((s) => (k === "all" ? [] : s.includes(k) ? s.filter((x) => x !== k) : [...s, k]));
  // (v0.4.1 기능, item 3) 사용자 요청 — "내가 만든 퍼즐"·"풀고 있는 중"을 직관적으로 찾을 수 있게
  // 테마 칩과 별개의 빠른 접근 칩을 둔다. quickFilter는 테마 필터와 AND로 함께 적용된다(다중 선택
  // 대상에서는 명시적으로 제외 — "내가 만든 퍼즐"과 "풀고 있는 중"을 동시에 켜면 뜻이 모호해진다).
  const [quickFilter, setQuickFilter] = useState("all"); // "all" | "mine" | "inprogress"
  // (사용자 요청) 정렬·필터 드롭다운에 전체/PGN/FEN 구분 추가 — PGN은 setupSans(대국 기보)가 있는
  // 퍼즐, FEN은 fen 필드가 있는 퍼즐(둘 다 있는 퍼즐이 대부분이다, 카드 배지와 같은 기준).
  const [selectedSources, setSelectedSources] = useState([]); // 예: ["pgn","fen"]
  const toggleSource = (k) => setSelectedSources((s) => (k === "all" ? [] : s.includes(k) ? s.filter((x) => x !== k) : [...s, k]));
  // (신규 기능) 사용자 요청 — 오프닝/미들게임/엔드게임 국면 구분(다중 선택) 드롭다운.
  const [selectedPhases, setSelectedPhases] = useState([]); // 예: ["opening","endgame"]
  const togglePhase = (k) => setSelectedPhases((s) => (k === "all" ? [] : s.includes(k) ? s.filter((x) => x !== k) : [...s, k]));
  // (사용자 요청) 드롭다운 맨 위에 전체/좋아요/리포스트 구획 추가 — 내가 좋아요·리포스트한 퍼즐만 골라 본다.
  const [selectedEngagement, setSelectedEngagement] = useState([]); // 예: ["liked","reposted"]
  const toggleEngagement = (k) => setSelectedEngagement((s) => (k === "all" ? [] : s.includes(k) ? s.filter((x) => x !== k) : [...s, k]));
  const [hideSolved, setHideSolved] = useState(false);
  // (사용자 요청) 퍼즐 만들기 기능을 학습 탭(분석 화면 보드 편집기) 대신 이 탭 안에서 — "퍼즐 풀기"/
  // "퍼즐 만들기" 선택 박스로 모드를 전환한다. 만들기 모드는 PGN/FEN 입력 → 퍼즐 유형 선택 → 생성된
  // 라인 미리보기(생성자 권한 박스) 세 단계를 차례로 보여주고, 셋 다 끝나야 "퍼즐 만들기" 버튼이 켜진다.
  const [puzzleMode, setPuzzleMode] = useState("solve"); // "solve" | "create"
  // (사용자 요청) 만들기 화면을 보고 있는 도중 로그아웃되는 경우까지 대비 — 로그인 상태가 아니면
  // 항상 풀기 모드로 되돌린다.
  useEffect(() => { if (!myUid && puzzleMode === "create") setPuzzleMode("solve"); }, [myUid, puzzleMode]);
  const [pcInput, setPcInput] = useState("");
  // (사용자 요청) 1단계 PGN/FEN 입력에 chess.com 대국도 선택할 수 있게 — 유산(LegacyManageModal)의
  // "chess.com 대국에서 선택" 패턴을 응용하되, 토글 버튼 없이 연동돼 있으면 항상 입력 박스 아래에
  // chess.com 통계·최근 대국 목록을 펼쳐 둔다.
  const chesscomReady = !!(chesscom && chesscom.status === "ready" && chesscom.games && chesscom.games.length);
  const [pcParsed, setPcParsed] = useState(null); // { kind:"fen", fenRoot, raw } | { kind:"pgn", sans, raw }
  const [pcErr, setPcErr] = useState("");
  const [pcTheme, setPcTheme] = useState(null); // "sacrifice" | "advantage" | "punish"
  // (사용자 요청) PGN 마지막 수를 무조건 "다루는 수"로 삼던 것 대신, 유산 만들기처럼 그 유형(등급)에
  // 실제로 해당하는 수들을 나열해 직접 고르게 한다. 유형 버튼을 먼저 눌러야만 후보가 뜨던 것도
  // 없애고, PGN이 확인되는 즉시 analyzeGame으로 전체 기보를 한 번 채점해(진행률을 %로 보여준다)
  // 세 유형의 후보를 한꺼번에 미리 불러와 각 유형 아래에 나열한다.
  const PC_THEME_KINDS = { sacrifice: ["brilliant"], advantage: ["inaccuracy"], punish: ["mistake", "blunder"] };
  const [pcAnalyzing, setPcAnalyzing] = useState(false);
  const [pcAnalyzeProgress, setPcAnalyzeProgress] = useState(0); // 0~1
  // (사용자 요청) 3단계(전술 라인 생성) 중에도 2단계 채점처럼 박스 우상단에 실시간 진행률(%)을
  // 보여준다. genPuzzleTree의 onProgress(0~0.95는 트리 확장 중, 1은 완료)를 그대로 이 상태에 반영한다.
  const [pcGenProgress, setPcGenProgress] = useState(0); // 0~1
  const [pcAnalyzeResult, setPcAnalyzeResult] = useState(null); // analyzeGame() 결과(moves 배열)
  const [pcAnalyzeErr, setPcAnalyzeErr] = useState("");
  const [pcSelectedMove, setPcSelectedMove] = useState(null); // { ply, san, kind }
  const [pcGenerating, setPcGenerating] = useState(false);
  const [pcGen, setPcGen] = useState(null); // { tree, lines }
  const [pcGenErr, setPcGenErr] = useState("");
  const [pcCreating, setPcCreating] = useState(false);
  // (신규 기능) 사용자 요청 — 4단계, 퍼즐 공개/비공개 설정. 기본은 공개(기존과 동일한 동작).
  const [pcPublic, setPcPublic] = useState(true);
  // (v0.4.4 개편, 사용자 요청) 같은 PGN·FEN으로 이미 만들어진 퍼즐이 있으면 예전엔 알림만 띄우고
  // 처음(1단계)으로 되돌렸다 — 이제는 "누가 이미 만들었는지" 보여주고, 다시 만드는 대신 그 퍼즐을
  // 곧장 풀 수 있게 한다({ puzzle, creatorUsername } | null).
  const [pcExisting, setPcExisting] = useState(null);
  // (사용자 요청) chess.com 대국 목록에서 고른 대국을 "선택됨"으로 표시하고, 같은 대국을 다시 누르면
  // 선택이 풀리도록(입력 박스도 함께 비운다) 어떤 대국이 선택돼 있는지 기억해 둔다.
  const [pcSelectedGameId, setPcSelectedGameId] = useState(null);
  // (사용자 요청) 1단계 입력 박스에 이미지 스캔 버튼 추가 — 체스판 사진이면 FEN으로, PGN·FEN 텍스트
  // 사진이면 그 텍스트를 그대로 입력 박스에 채워 넣는다(그대로 "확인"을 눌러 검증하는 흐름은 동일).
  const [pcScanning, setPcScanning] = useState(false);
  const [pcScanProgress, setPcScanProgress] = useState(0);
  const onPcScanFile = async (file) => {
    setPcScanning(true); setPcScanProgress(0); setPcErr("");
    try {
      const data = await scanImageFile(file, setPcScanProgress);
      let text = null;
      if (data.type === "board" && data.fen_board) text = data.fen_board + " w KQkq - 0 1";
      else if (data.type === "text" && data.recognized_text) text = data.recognized_text.trim();
      if (!text) { setPcErr(t("이미지에서 체스판이나 기보를 인식하지 못함")); return; }
      setPcInput(text); setPcParsed(null); setPcTheme(null); setPcAnalyzeResult(null); setPcAnalyzeErr(""); setPcSelectedMove(null); setPcGen(null); setPcGenErr(""); setPcSelectedGameId(null);
    } catch (e) { setPcErr((e && e.message) || t("이미지 스캔 실패")); }
    finally { setPcScanning(false); setPcScanProgress(0); }
  };
  const resetPuzzleCreate = () => {
    setPcInput(""); setPcParsed(null); setPcErr(""); setPcTheme(null);
    setPcAnalyzing(false); setPcAnalyzeProgress(0); setPcAnalyzeResult(null); setPcAnalyzeErr(""); setPcSelectedMove(null);
    setPcGenerating(false); setPcGen(null); setPcGenErr(""); setPcCreating(false); setPcSelectedGameId(null); setPcPublic(true); setPcExisting(null);
  };
  // (v0.4.4 기능, 사용자 요청) 집중 분석에서 "퍼즐 만들기"로 넘어온 경우 — createSeed({pgn,targetPly,
  // theme})가 들어오면 곧장 만들기 모드로 전환하고 그 PGN을 채워 넣는다. pcInput은 setState라 같은
  // 틱에 다시 읽을 수 없으므로 parsePcInput에 override 인자를 넘겨 곧바로 파싱한다. 파싱→채점이 끝나면
  // (pendingSeed 소비 effect가) 지정된 수를 자동으로 골라 checkPcDuplicate까지 이어서 실행한다.
  const [pendingSeed, setPendingSeed] = useState(null);
  useEffect(() => {
    if (!createSeed) return;
    resetPuzzleCreate();
    setPuzzleMode("create");
    setPcInput(createSeed.pgn);
    parsePcInput(createSeed.pgn);
    setPendingSeed(createSeed);
    if (onConsumeCreateSeed) onConsumeCreateSeed();
  }, [createSeed]);
  useEffect(() => {
    if (!pendingSeed || !pcAnalyzeResult || !pcParsed || pcParsed.kind !== "pgn") return;
    const san = pcParsed.sans[pendingSeed.targetPly];
    if (san != null) pickPcMove(pendingSeed.theme, { ply: pendingSeed.targetPly, san });
    setPendingSeed(null);
  }, [pendingSeed, pcAnalyzeResult, pcParsed]);
  // 1단계 — PGN 또는 FEN 코드를 입력받아 검증한다.
  const parsePcInput = (override) => {
    const raw = (override !== undefined ? override : pcInput).trim();
    setPcErr(""); setPcParsed(null); setPcTheme(null); setPcAnalyzeResult(null); setPcAnalyzeErr(""); setPcSelectedMove(null); setPcGen(null); setPcGenErr(""); setPcExisting(null);
    if (!raw) { setPcErr(t("PGN 또는 FEN 입력 필요")); return; }
    // (사용자 요청) PGN/FEN 기보로 인식되지 않는 입력은 사유와 무관하게 항상 같은 문구("잘못된
    // 기보 형식입니다.")로 안내하고, pcParsed를 세우지 않아(2단계는 pcParsed가 있어야만 열림) 2단계로
    // 넘어가지 못하게 막는다.
    if (looksLikeFen(raw)) {
      const fenRoot = parseFenFull(raw);
      if (!fenRoot) { setPcErr(t("잘못된 기보 형식")); return; }
      setPcParsed({ kind: "fen", fenRoot, raw });
      return;
    }
    const moves = parsePgnMoves(raw);
    if (!moves.length) { setPcErr(t("잘못된 기보 형식")); return; }
    let board = startBoard(), ok = true;
    for (let i = 0; i < moves.length; i++) {
      const color = i % 2 === 0 ? "w" : "b";
      if (!sanSrc(board, moves[i], color)) { ok = false; break; }
      board = applySan(board, moves[i], color);
    }
    if (!ok) { setPcErr(t("잘못된 기보 형식")); return; }
    setPcParsed({ kind: "pgn", sans: moves, raw });
  };
  // (사용자 요청) PGN이 확인되면 유형 버튼을 누르길 기다리지 않고 곧바로 전체 기보를 채점한다.
  useEffect(() => {
    if (!pcParsed || pcParsed.kind !== "pgn" || !engine || engine.status !== "ready") return;
    let cancelled = false;
    setPcAnalyzing(true); setPcAnalyzeProgress(0); setPcAnalyzeErr(""); setPcAnalyzeResult(null);
    analyzeGame(pcParsed.sans, engine, REVIEW_DEPTH, (p) => { if (!cancelled) setPcAnalyzeProgress(p); }, REVIEW_MOVETIME_MS)
      .then((r) => { if (!cancelled) setPcAnalyzeResult(r); })
      .catch(() => { if (!cancelled) setPcAnalyzeErr(t("기보 채점 실패. 잠시 후 다시 시도")); })
      .finally(() => { if (!cancelled) setPcAnalyzing(false); });
    return () => { cancelled = true; };
  }, [pcParsed, engine && engine.status]);
  // (사용자 요청) 같은 PGN(수순+수)이나 FEN으로 이미 만들어진 퍼즐이 있는지 검증 — 로컬(내 퍼즐·
  // 보관함)과 서버(전체 사용자, puzzleFetch) 모두 확인한다.
  // (버그 수정, 사용자 제보) puzzles 테이블의 행 번호(no)는 id 문자열의 해시값(puzzleNo, 6자리
  // 공간)이라 서로 다른 두 포지션이 같은 번호로 우연히 충돌할 수 있다 — 예전엔 그 번호에 아무
  // 행이나 있으면(내용을 비교하지 않고) 곧장 "이미 같은 퍼즐이 존재하여 퍼즐 만들기가
  // 취소됩니다"로 막아 버려서, 사이트에 만들어진 퍼즐이 쌓일수록 실제로는 완전히 새로운
  // PGN·FEN을 만들려는 시도까지 무작위로 거부되던 핵심 버그였다(퍼즐 만들기 기능 자체가
  // 점점 안 되는 것처럼 보였다). 이제 그 번호의 행이 있어도 실제 내용(data.id)이 지금 만들려는
  // id와 같을 때만 진짜 중복으로 판정한다 — 번호만 우연히 겹친 서로 다른 퍼즐은 통과시킨다.
  // (v0.4.4 개편, 사용자 요청) 이제 중복 여부(boolean)만이 아니라 실제 퍼즐 데이터를 돌려준다 — 있으면
  // 그 자리에서 곧장 "퍼즐 풀기"로 열 수 있어야 하기 때문이다.
  // posKey(canonicalPositionFen) — id 문자열이 달라도 실제로 같은 국면에서 시작하는 퍼즐이면 잡아낸다
  // (트랜스포지션·FEN 원문 차이 등 — 위 puzzlePositionKey 주석 참고). 서버 쪽은 이 필드가 저장돼
  // 있는(=이 버전 이후에 만들어진) 퍼즐만 걸린다 — 옛 데이터는 아래 "중복 퍼즐 정리" 관제 도구로
  // 소급 정리한다.
  const checkPcDuplicate = async (id, posKey) => {
    const local = puzzles.find((p) => p.id === id) || (archivedPuzzles && archivedPuzzles[id]);
    if (local) return local;
    if (posKey) {
      const localByPos = puzzles.find((p) => puzzlePositionKey(p) === posKey)
        || (archivedPuzzles && Object.values(archivedPuzzles).find((p) => puzzlePositionKey(p) === posKey));
      if (localByPos) return localByPos;
    }
    try { const remote = await puzzleFetch(puzzleNo(id)); if (remote && remote.id === id) return remote; } catch { }
    if (posKey) {
      try { const remoteByPos = await puzzleFetchByPositionKey(posKey); if (remoteByPos) return remoteByPos; } catch { }
    }
    return null;
  };
  // 실제 전술 트리 생성 — FEN 포지션이거나(그 자체가 시작점), PGN에서 고른 특정 수(setupSans+mistakeSan)일 때 호출한다.
  const runPcGenerate = async (theme, setupSans, mistakeSan, fenRoot) => {
    setPcGen(null); setPcGenErr(""); setPcGenProgress(0);
    if (!engine || engine.status !== "ready") { setPcGenErr(t("엔진 준비 중")); return; }
    setPcGenerating(true);
    const onProgress = (p) => setPcGenProgress(p);
    try {
      let gen;
      if (fenRoot) {
        // (v0.6.2 BUG-055) 희생 테마는 첫 수를 탁월한 수로 먼저 찾아 고정한다 — 예전엔 첫 수 지정 없이 만들어 희생이 아닌 최선수(1.Rg7)가 정답이 됐다.
        let firstSan = null;
        if (theme === "sacrifice") {
          firstSan = await findSacrificeFirstMove(engine, [], fenRoot);
          if (!firstSan) { setPcGenErr(t("이 포지션에서 탁월한 수(희생)를 찾지 못함. 다른 유형이나 포지션으로 시도")); return; }
        }
        gen = await genPuzzleTree(engine, [], { ...puzzleThemeOpts(theme), firstSan }, onProgress, fenRoot);
      } else if (theme === "sacrifice") {
        // (기존 자동 생성 규칙과 동일) 희생 테마는 "그 수 자체"가 첫 수로 고정되며, 그 직전
        // 위치부터 트리를 만든다 — 풀이자는 이 수를 스스로 찾아내야 한다.
        gen = await genPuzzleTree(engine, setupSans, { ...puzzleThemeOpts("sacrifice"), firstSan: mistakeSan }, onProgress);
      } else {
        // 실수 응징하기/우위 점하기는 "그 수(실수)가 이미 두어진 뒤" 포지션부터 트리를 만든다.
        gen = await genPuzzleTree(engine, [...setupSans, mistakeSan], puzzleThemeOpts(theme), onProgress);
      }
      if (!gen || !gen.lines || !gen.lines.length) { setPcGenErr(t("뚜렷한 전술 라인 없음. 다른 PGN·FEN이나 유형으로 시도")); return; }
      setPcGen(gen);
    } catch { setPcGenErr(t("퍼즐 생성 실패. 잠시 후 다시 시도")); }
    finally { setPcGenerating(false); }
  };
  // FEN 모드 — 유형을 고르면(고를 수 있는 후보 목록이 없으므로) 곧바로 그 포지션 자체로 생성한다.
  const pickPcThemeFen = async (theme) => {
    if (!pcParsed || pcParsed.kind !== "fen" || pcGenerating) return;
    const id = "fen:" + pcParsed.raw;
    const posKey = canonicalPositionFen(pcParsed.fenRoot, []);
    setPcTheme(theme); setPcSelectedMove(null); setPcGen(null); setPcGenErr(""); setPcExisting(null);
    const dup = await checkPcDuplicate(id, posKey);
    if (dup) {
      const info = await puzzleCreatorInfo(puzzleNo(id)).catch(() => null);
      setPcExisting({ puzzle: dup, creatorUsername: info && info.username });
      return;
    }
    runPcGenerate(theme, [], "", pcParsed.fenRoot);
  };
  // PGN 모드 — 유형별로 미리 나열된 후보 목록에서 하나를 고르면 그 수를 mistakeSan으로 삼아 생성한다.
  const pickPcMove = async (theme, m) => {
    if (!pcParsed || pcParsed.kind !== "pgn" || pcGenerating) return;
    const setupSans = pcParsed.sans.slice(0, m.ply), mistakeSan = m.san;
    const id = setupSans.join(" ") + "|" + mistakeSan;
    // 희생 테마는 "선택한 수(mistakeSan) 자체"가 풀이자가 찾아야 할 첫 수라 그 직전 위치가 실제
    // 풀이 시작 국면이다(submitPuzzleCreate의 fullSetupSans/isSacrifice 분기와 같은 기준) — 다른
    // 테마는 mistakeSan까지 이미 두어진 뒤가 시작 국면이다.
    const posKey = canonicalPositionFen(null, theme === "sacrifice" ? setupSans : [...setupSans, mistakeSan]);
    setPcTheme(theme); setPcSelectedMove(m); setPcGen(null); setPcGenErr(""); setPcExisting(null);
    // (v0.4.4 개편, 사용자 요청) 같은 포지션에 이미 다른 사람이 만든 퍼즐이 있으면, 다시 만드는 대신
    // "~님이 이미 이 퍼즐을 만들었어요!"를 보여주고 곧장 풀 수 있게 한다 — 굳이 새로 생성할
    // 필요가 없으므로 runPcGenerate(엔진 비용이 큼)를 아예 건너뛴다.
    const dup = await checkPcDuplicate(id, posKey);
    if (dup) {
      const info = await puzzleCreatorInfo(puzzleNo(id)).catch(() => null);
      setPcExisting({ puzzle: dup, creatorUsername: info && info.username });
      return;
    }
    runPcGenerate(theme, setupSans, mistakeSan, null);
  };
  const pcCanSubmit = !!(pcParsed && pcTheme && pcGen && !pcGenerating && !pcCreating);
  // (사용자 요청) 3개 박스(PGN/FEN 입력·유형 선택·라인 미리보기)가 모두 끝나야 눌리는 "퍼즐 만들기"
  // 버튼 — 저장과 동시에 방금 만든 퍼즐을 바로 열어(setActive) 결과를 확인·이어서 라인을 조정할 수
  // 있게 한다(퍼즐 솔버 화면의 기존 "생성자 권한" 편집 도구를 그대로 이어서 쓸 수 있다).
  const submitPuzzleCreate = () => {
    if (!pcCanSubmit) return;
    setPcCreating(true);
    let pz;
    if (pcParsed.kind === "fen") {
      pz = { id: "fen:" + pcParsed.raw, themes: [pcTheme], name: t("FEN 포지션 퍼즐"), fen: pcParsed.raw, setupSans: [], solution: pcGen.lines[0].solution, lines: pcGen.lines, tree: pcGen.tree, steps: [], auto: true, public: pcPublic, positionKey: canonicalPositionFen(pcParsed.fenRoot, []) };
    } else {
      const fullSetupSans = pcParsed.sans.slice(0, pcSelectedMove.ply), sacSan = pcSelectedMove.san;
      // (v0.4.3 변경, 사용자 요청) 희생 테마는 "선택한 수(희생 수) 직전 수"를 컴퓨터의 응수로 자동
      // 재생하고, 사용자는 선택한 수 자체를 첫 수로 찾는다 — 저장할 때 mistakeSan을 선택한 수(희생
      // 수) 대신 그 직전 수로 바꾼다(다른 테마와 같은 뜻: "이미 두어진, 방금 응수된 수" — 퍼즐 솔버
      // 인트로가 이 수를 그대로 자동 재생한다). fullSetupSans는 [...setupSans, mistakeSan]과 정확히
      // 같은 위치를 가리키므로(mistakeSan이 fullSetupSans의 마지막 수), 트리를 생성한 위치와
      // 어긋나지 않는다. id·이름은 선택한 수(희생 수) 자체를 기준으로 그대로 둔다(정체성·표시용).
      const isSacrifice = pcTheme === "sacrifice";
      const setupSans = isSacrifice ? fullSetupSans.slice(0, -1) : fullSetupSans;
      const mistakeSan = isSacrifice ? (fullSetupSans.length ? fullSetupSans[fullSetupSans.length - 1] : null) : sacSan;
      pz = { id: fullSetupSans.join(" ") + "|" + sacSan, themes: [pcTheme], name: puzzleName(pcTheme, fullSetupSans, sacSan), setupSans, mistakeSan, solution: pcGen.lines[0].solution, lines: pcGen.lines, tree: pcGen.tree, steps: [], auto: true, public: pcPublic, positionKey: canonicalPositionFen(null, [...setupSans, mistakeSan].filter(Boolean)) };
    }
    onSavePuzzle(pz);
    resetPuzzleCreate();
    setPuzzleMode("solve");
    setActive(pz);
  };
  // (사용자 요청) 퍼즐 탭 필터 — 오프닝/생성자를 여러 개 골라(다중 태그) 미해결/해결됨 목록을 그
  // 자리에서 좁혀 본다. 자동완성 후보는 지금 목록에 실제로 있는 값만(없는 값을 검색해 봐야 결과가
  // 0개인 게 뻔하므로) 보여준다.
  const [selectedOpenings, setSelectedOpenings] = useState([]);
  const [selectedCreators, setSelectedCreators] = useState([]);
  // (사용자 요청) 오프닝 검색창 + 생성자 검색창 2개를 하나로 합친다 — 검색어 하나로 오프닝 이름과
  // 생성자 아이디를 동시에 찾고, 결과 드롭다운 안에서 무엇이 오프닝이고 무엇이 생성자인지만
  // 태그 색(브론즈=오프닝/초록=생성자)과 접두사(@)로 구분해 보여준다.
  const [searchQuery, setSearchQuery] = useState("");
  const [searchFocus, setSearchFocus] = useState(false);
  // (사용자 요청) 두 검색창을 하나로 합쳐 생긴 여백에 들어갈 정렬 기준 — 일일 퍼즐(캐러셀)은 이
  // 정렬과 무관한 별도 기능이라 건드리지 않고, 그 아래 미해결/해결됨 목록에만 적용한다.
  // (v0.4.1 기능, item 3) 기본 정렬을 "추천순"(난이도 적합도·약점 보완도·테마 적합도 3요소 점수)으로
  // 바꾼다 — 최신순/레이팅순은 여전히 수동으로 고를 수 있게 남겨 둔다.
  const [puzzleSortBy, setPuzzleSortBy] = useState("score"); // "score"(추천순) | "recent"(최신순) | "rating"(레이팅순) | "popular"(인기순)
  // (사용자 요청) 정렬 UI가 산만하다는 피드백 — 3분할 세그먼트 박스 대신, 오프닝/생성자 검색창 폭을
  // 줄여 생긴 우측 여백에 깔때기(Filter) 아이콘 버튼 하나만 두고, 누르면 드롭다운으로 정렬 기준을 고른다.
  const [sortMenuOpen, setSortMenuOpen] = useState(false);
  const [sortMenuPos, setSortMenuPos] = useState(null);
  const sortBtnRef = useRef(null);
  const toggleSortMenu = () => {
    setSortMenuOpen((v) => {
      const next = !v;
      if (next && sortBtnRef.current) {
        const rect = sortBtnRef.current.getBoundingClientRect();
        const margin = 10, menuW = 240;
        const left = Math.max(margin, Math.min(rect.right - menuW, window.innerWidth - menuW - margin));
        // (버그 수정) 구획이 6개(전체/좋아요/리포스트·정렬·빠른 필터·테마·시작 포지션·해결 완료
        // 숨기기)로 늘어나 드롭다운이 꽤 길어졌는데, 세로 위치는 "버튼 아래로"만 고정하고 실제
        // 남은 공간을 재지 않아 버튼이 화면 아래쪽에 있으면 그대로 잘려 나갔다 — 위/아래 중 더
        // 넓은 쪽으로 열고, 그 남은 공간에 맞춰 최대 높이(스크롤 가능)를 계산한다.
        const spaceBelow = window.innerHeight - rect.bottom - margin;
        const spaceAbove = rect.top - margin;
        const openDown = spaceBelow >= spaceAbove;
        const maxHeight = Math.max(160, Math.min(480, (openDown ? spaceBelow : spaceAbove) - 6));
        setSortMenuPos({ left, top: openDown ? rect.bottom + 6 : undefined, bottom: openDown ? undefined : window.innerHeight - rect.top + 6, maxHeight });
      }
      return next;
    });
  };
  // (사용자 요청) 열어 둔 채로 화면을 스크롤하면 버튼과의 연결이 끊어져 엉뚱한 자리에 떠 있는
  // "잔상"처럼 보였다 — 스크롤이 시작되는 즉시 닫는다.
  useEffect(() => {
    if (!sortMenuOpen) return;
    const onScroll = () => setSortMenuOpen(false);
    window.addEventListener("scroll", onScroll, true);
    return () => window.removeEventListener("scroll", onScroll, true);
  }, [sortMenuOpen]);
  const PUZZLE_SORT_OPTIONS = [["score", t("추천순")], ["recent", t("최신순")], ["rating", t("레이팅순")], ["popular", t("인기순")]];
  const [numInput, setNumInput] = useState("");
  const [numMsg, setNumMsg] = useState("");
  const [numFocus, setNumFocus] = useState(false);
  // (기능) 번호 검색 추천을 모바일에선 입력창 아래 드롭다운 목록(기존 방식)으로, 데스크톱에선
  // 그 자리에 실제 퍼즐 카드 블록으로 계속 갱신해 보여준다(포커스 여부와 무관하게 늘 보임).
  const narrowPuzzleSearch = useNarrow(768);
  // (16차) 이 퍼즐을 푼 사람 중 내 친구의 이름 목록(최대 무제한 수집 — 표기 시 앞 2명만 사용)
  // (18차 UI7) 풀이수에 나 자신도 포함 — 내가 최초 해결자라면 "1명이 풀었습니다!"가 보이도록,
  // 서버 집계가 아직 반영되지 않았어도 내가 푼 퍼즐은 최소 1로 보정한다.
  const solveCountFor = (p) => Math.max((solveCounts && solveCounts[puzzleNo(p.id)]) || 0, solved.has(p.id) ? 1 : 0);
  const friendNamesFor = (id) => {
    const no = puzzleNo(id);
    const solvers = (puzzleSolvers && puzzleSolvers[no]) || [];
    return solvers.filter((u) => friendUids && friendUids.includes(u)).map((u) => (solverNames && solverNames[u]) || null).filter(Boolean);
  };
  // (v0.4.1 기능, item 3) 사용자 요청 — 추천/미해결/해결 완료 3분할을 없애고 단일 피드로 합친다.
  // 예전 "추천 퍼즐" 섹션이 하던 일(내가 아직 안 열어본, 다른 사람들이 많이 푼 인기 퍼즐을 발견하게
  // 해주는 것)은 그대로 필요하므로, 그 발견 메커니즘(주간 풀이 랭킹 + 서버 조회 + 내가 리포스트한
  // 퍼즐)은 유지하되 별도 섹션이 아니라 아래 메인 피드의 후보 풀에 합류시킨다 — 일간/주간/월간
  // 전환 UI와 "다른 추천 보기" 재셔플은 더 이상 필요 없어 없앴다(주간 하나로 고정).
  const [rankMap, setRankMap] = useState(null);
  // (버그 수정) 랭킹에 오른 퍼즐이 "내가 예전에 열어봤거나 삭제해 본 적 있는 퍼즐"(puzzles/archivedPuzzles,
  // 둘 다 로컬 계정 한정)에 없으면 후보 풀에서 통째로 빠졌다 — 번호만 있고 로컬에 없는 랭킹 퍼즐은
  // 서버(Supabase, 전역 저장소)에서 직접 가져와 채운다.
  const [rankPuzzles, setRankPuzzles] = useState({}); // no -> 퍼즐 데이터(서버에서 보강)
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const rows = await puzzleRank("week", 24);
      if (cancelled) return;
      const m = {}; rows.forEach((r) => { m[r.no] = r.cnt; });
      setRankMap(m);
      const nos = Object.keys(m).filter((no) => !rankPuzzles[no]);
      if (!nos.length) return;
      const fetched = await Promise.all(nos.map((no) => puzzleFetch(no)));
      if (cancelled) return;
      setRankPuzzles((prev) => { const n = { ...prev }; nos.forEach((no, i) => { if (fetched[i]) n[no] = fetched[i]; }); return n; });
    })();
    return () => { cancelled = true; };
  }, []);
  // (v0.1.0) 내가 리포스트한 퍼즐 — 마찬가지로 발견 후보 풀에 합류시킨다.
  const [myRepostNos, setMyRepostNos] = useState([]);
  useEffect(() => {
    if (!myUid) { setMyRepostNos([]); return; }
    let cancelled = false;
    puzzleRepostsByUser(myUid).then((nos) => { if (!cancelled) setMyRepostNos(nos); });
    return () => { cancelled = true; };
  }, [myUid]);
  const [myRepostPuzzles, setMyRepostPuzzles] = useState({}); // no -> 퍼즐 데이터(서버에서 보강)
  useEffect(() => {
    const nos = myRepostNos.filter((no) => !(no in myRepostPuzzles));
    if (!nos.length) return;
    let cancelled = false;
    (async () => {
      const fetched = await Promise.all(nos.map((no) => puzzleFetch(no)));
      if (cancelled) return;
      setMyRepostPuzzles((prev) => { const n = { ...prev }; nos.forEach((no, i) => { n[no] = fetched[i] || null; }); return n; });
    })();
    return () => { cancelled = true; };
  }, [myRepostNos]);
  // 발견 후보(로컬에 없던 인기 퍼즐·리포스트한 퍼즐)만 따로 모아 뒀다가, 아래 메인 후보 풀에서
  // 로컬 puzzles/archivedPuzzles와 합친다.
  const discoveredPuzzles = useMemo(() => {
    const out = [];
    if (rankMap) for (const no of Object.keys(rankMap)) { const p = rankPuzzles[no]; if (p) out.push(p); }
    for (const no of myRepostNos) { const p = myRepostPuzzles[no]; if (p) out.push(p); }
    return out;
  }, [rankMap, rankPuzzles, myRepostNos, myRepostPuzzles]);
  const popularityOf = (p) => (rankMap && rankMap[puzzleNo(p.id)]) || 0;
  // (버그 수정) 이 useMemo가 예전엔 아래쪽(다른 지역 변수들 사이)에 있었다 — puzzle 목록 화면에서만
  // 쓰이는 값이라 그 자리가 자연스러워 보였지만, 바로 위 "if (active) return <PuzzleSolver .../>"
  // 조기 반환 때문에 퍼즐을 열어 둔 동안(active 있음)에는 이 훅 자체가 아예 호출되지 않다가, 닫으면
  // (active만 null) 그제서야 호출되는 셈이 됐다 — 렌더마다 호출되는 훅의 개수·순서가 달라지는 Rules of
  // Hooks 위반으로, React가 "Rendered more hooks than during the previous render"를 던지며 이
  // 컴포넌트 트리 전체가 깨진다. 이 앱에는 ErrorBoundary가 없어 그 에러가 화면 전체를 먹통으로
  // 만들었다 — 퍼즐 창의 X 버튼을 누르면 사이트가 통째로 멈추는 것처럼 보인 원인이 바로 이것이었다.
  // 모든 훅은 조건 없이 항상 같은 순서로 호출돼야 하므로, 조기 반환보다 앞으로 옮긴다.
  // (기능) 퍼즐 번호는 항상 6자리(puzzleNo), 날짜는 YYYYMMDD 8자리라 자릿수만으로 구분된다 —
  // "/" 구분자 없이 그냥 8자리 숫자를 입력하면 날짜로, 그 밖엔 번호로 취급한다.
  const isDateInput = /^\d{8}$/.test(numInput);
  // (버그 수정) 예전엔 입력 중인 번호로 시작하는 퍼즐을 로컬 puzzles/archivedPuzzles(둘 다 그
  // 계정에서 한 번이라도 열어본 퍼즐만 누적됨)에서만 찾아, 한 번도 안 열어본 퍼즐은 번호를 다
  // 알고 입력해도 추천에 뜨지 않았다. Supabase가 켜져 있으면 search_puzzles_prefix RPC로 서버
  // 전체 퍼즐에서 직접 찾아온다(입력마다 매번 요청하지 않도록 250ms 디바운스). 백엔드가 없을
  // 때만 예전처럼 로컬 목록으로 되돌아간다.
  const [remoteNumSuggestions, setRemoteNumSuggestions] = useState([]);
  useEffect(() => {
    if (!SB_ON || isDateInput || !numInput) { setRemoteNumSuggestions([]); return; }
    let cancelled = false;
    const t = setTimeout(() => {
      sbRpc("search_puzzles_prefix", { p_prefix: numInput, p_limit: 8 })
        .then((rows) => { if (!cancelled) setRemoteNumSuggestions((rows || []).map((r) => r.data).filter(Boolean)); })
        .catch(() => { if (!cancelled) setRemoteNumSuggestions([]); });
    }, 250);
    return () => { cancelled = true; clearTimeout(t); };
  }, [numInput, isDateInput]);
  const numSuggestions = useMemo(() => {
    if (isDateInput || !numInput) return [];
    if (SB_ON) return remoteNumSuggestions.slice(0, 8);
    const byId = new Map();
    for (const p of puzzles) byId.set(p.id, p);
    for (const p of Object.values(archivedPuzzles || {})) if (!byId.has(p.id)) byId.set(p.id, p);
    return [...byId.values()].filter((p) => String(puzzleNo(p.id)).startsWith(numInput)).slice(0, 6);
  }, [numInput, isDateInput, remoteNumSuggestions, puzzles, archivedPuzzles]);
  // (v0.3.4 기능) 사용자 요청 — 퍼즐 풀이 창을 열 때 새 히스토리 항목(/(퍼즐 번호)-(라인 번호))을
  // 쌓아 뒀으므로, 닫을 때는(뒤로가기 버튼이 아니라 이 X 버튼이어도) 그 항목을 되돌아가는 게
  // 맞다 — pushState를 하나 더 쌓는 대신 history.back()으로 정확히 하나만 되돌린다(게임 리뷰의
  // closeReview와 같은 패턴).
  const closeActive = () => { setActive(null); try { if (/^\/puzzle\/\d{6}-\d+$/.test(window.location.pathname)) window.history.back(); } catch { } };
  // (버그 수정, 사용자 제보) 퍼즐 풀이 카드를 닫으면 항상 목록 맨 위로 튕겨 올라갔다 — active가
  // 생기면 이 컴포넌트가 아래 목록 JSX 대신 <PuzzleSolver>만 반환해(조기 반환) 목록이 통째로
  // 언마운트됐다가, 닫을 때 다시 마운트되며 스크롤이 0으로 초기화되는 게 원인이었다. 목록이 보이는
  // 동안(active가 없는 동안)의 window 스크롤 위치를 이 컴포넌트 자신의 ref(리렌더에도 유지됨)에
  // 계속 저장해 뒀다가, active가 다시 null이 되는(닫히는) 순간 그 값으로 되돌린다.
  const listScrollRef = useRef(0);
  useEffect(() => {
    if (active) return;
    const onScroll = () => { listScrollRef.current = window.scrollY; };
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, [active]);
  useLayoutEffect(() => {
    if (!active) window.scrollTo({ top: listScrollRef.current, behavior: "auto" });
  }, [active]);
  // (버그 수정) 트리가 비어(라인 0개) 실제로는 절대 풀 수 없는 퍼즐이 "미해결" 목록·테마 칩 개수에
  // 정상 퍼즐처럼 섞여 있었다 — 눌러 보면 그제서야 PuzzleSolver가 "퍼즐 데이터를 불러올 수
  // 없어요"를 띄웠다. 개발자(canEdit)는 이런 손상된 퍼즐을 찾아 삭제할 수 있어야 하므로 그대로
  // 다 보여주고, 일반 유저에게는 목록·개수 단계에서부터 아예 걸러낸다(이미 푼 퍼즐은 실제로 라인을
  // 완주했어야만 solved 상태가 되므로 걸러낼 필요가 없다).
  // (버그 수정, v0.4.0) 이 배열이 useMemo 없이 매 렌더 새로 .filter()된 탓에, 아래 puzzleOpeningNamesMap의
  // 의존성 배열([playablePuzzles])이 매번 새 참조가 되어 그 useMemo가 사실상 전혀 캐시되지 못하고
  // "매 렌더마다" 사용자가 가진 모든 퍼즐의 setupSans를 처음부터 다시 훑었다(openingNamesAlong 참고) —
  // 퍼즐을 열어(active) PuzzleSolver로 화면이 넘어간 뒤에도 이 훅들은 (아래 "모든 훅 호출 뒤에 조기
  // 반환" 규칙 때문에) 계속 매 렌더 실행되므로, 방금 연 일일 퍼즐이 로컬 목록에 추가된 순간부터
  // 풀이 화면이 리렌더될 때마다(다른 상태 변화로 App 전체가 리렌더될 때마다) 이 무거운 재계산이
  // 반복되어 — 쌓인 퍼즐 수가 많은 유저일수록 클릭 한 번이 눈에 띄는 버벅임/먹통으로 번졌다.
  // puzzles·solved가 실제로 바뀔 때만 새 배열을 만들도록 memo화해 원래 의도대로 캐시가 동작하게 한다.
  const localPlayablePuzzles = useMemo(() => (canEdit ? puzzles : puzzles.filter((p) => solved.has(p.id) || isPuzzlePlayable(p))), [puzzles, canEdit, solved]);
  // (v0.4.1 기능, item 3) 발견 후보(주간 인기·내 리포스트)를 로컬 목록과 합쳐 단일 피드의 후보 풀로 쓴다 —
  // 이미 로컬에 있는 퍼즐(id 겹침)은 중복으로 넣지 않는다.
  const playablePuzzles = useMemo(() => {
    const byId = new Map(localPlayablePuzzles.map((p) => [p.id, p]));
    for (const p of discoveredPuzzles) if (!byId.has(p.id)) byId.set(p.id, p);
    return [...byId.values()];
  }, [localPlayablePuzzles, discoveredPuzzles]);
  // (버그 수정) 카드 라벨용 표시 이름은 그대로 lastNamedOpening을 쓰고(아래 puzzleName 등에서
  // 이미 그렇게 쓰고 있음, 여긴 건드리지 않는다), openingKeyOf는 이제 검색·필터 UI 밖에서는
  // 쓰이지 않는다 — 필터 매칭 자체는 이제 openingNamesAlong(경로 전체를 따라가며 만나는 모든
  // 이름) 기준으로 바뀌었으므로(아래 matchesOpeningFilter), 이 값은 더는 필터 판정에 쓰지 않는다.
  const openingKeyOf = (p) => (p.setupSans && firstNamedOpening(p.setupSans)) || p.opening || t("기타");
  // (사용자 요청) 도감 탭에서 검색되는 모든 세부 갈래 이름까지 퍼즐 탭에서도 검색·필터할 수 있게,
  // 기존 퍼즐에 실제로 붙어 있는 (최상위) 이름만 모으던 것 대신 SNAP.tree 전체에서 나올 수 있는
  // "모든" 오프닝 이름(allOpeningEntries, 도감과 동일한 중복 제거·상위 경로 우선 규칙)을 후보로
  // 쓴다 — 이러면 아직 그 이름의 퍼즐이 하나도 없는 세부 갈래도 검색·선택은 가능해진다(선택하면
  // 그냥 빈 목록이 되는 게 맞는 동작, 아래 matchesOpeningFilter 참고).
  const openingOptions = useMemo(() => allOpeningEntries(contentVer).map((e) => e.name).sort((a, b) => a.localeCompare(b)), [contentVer]);
  const creatorOptions = useMemo(() => [...new Set(playablePuzzles.map((p) => (creatorUsernames || {})[puzzleNo(p.id)]).filter(Boolean))].sort((a, b) => a.localeCompare(b)), [playablePuzzles, creatorUsernames]);
  // (사용자 요청) 도감 탭 오프닝 트리 검색(검색어가 이름 맨 앞에 오는 결과 우선, 그 다음 중간에
  // 포함되는 결과)과 같은 랭킹 방식을 그대로 따라 쓴다 — 다만 여긴 오프닝뿐 아니라 생성자까지
  // 한 종류 더 섞인 "한 검색창"이라, "맨 앞 일치 우선 → 포함 일치" 순위는 그대로 유지하되 그
  // 등급(맨 앞/포함) 안에서는 오프닝을 먼저, 생성자를 나중에 늘어놓아(이름순 정렬은 그대로) 같은
  // 등급 안에서도 어느 게 오프닝이고 어느 게 생성자인지 한눈에 구분되게 한다. 도감처럼 되돌려줄
  // "수순 길이/채택률" 같은 신뢰도 신호가 오프닝·생성자 둘 다에 없어 이름순 정렬로 대신한다.
  const searchOptions = useMemo(() => [
    ...openingOptions.map((o) => ({ type: "opening", value: o })),
    ...creatorOptions.map((c) => ({ type: "creator", value: c })),
  ], [openingOptions, creatorOptions]);
  // (기능) 퍼즐 하나하나마다 매 필터 판정 때 openingNamesAlong을 다시 계산하지 않도록, 퍼즐 id별로
  // 한 번만 계산해 캐시해 둔다 — themed/filteredForCount 둘 다 이 맵을 재사용한다.
  // (성능, v0.4.0) active(풀이 화면 진입)일 때는 이 맵이 전혀 쓰이지 않는데도(아래 필터 UI 자체가
  // 안 보임) 훅 순서 유지를 위해 이 useMemo는 여전히 매 렌더 실행된다 — 풀이 화면에서는 계산을
  // 건너뛰어, 방금 연 퍼즐이 풀이 화면 리렌더마다 이 무거운 재계산을 유발하지 않게 한다.
  const puzzleOpeningNamesMap = useMemo(() => {
    if (active) return new Map();
    const m = new Map();
    for (const p of playablePuzzles) m.set(p.id, p.setupSans ? openingNamesAlong(p.setupSans) : new Set());
    return m;
  }, [playablePuzzles, active]);
  const searchSuggestions = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return [];
    const isSelected = (it) => it.type === "opening" ? selectedOpenings.includes(it.value) : selectedCreators.includes(it.value);
    const filtered = searchOptions.filter((it) => !isSelected(it) && it.value.toLowerCase().includes(q));
    const cmp = (a, b) => (a.type === b.type ? 0 : (a.type === "opening" ? -1 : 1)) || a.value.localeCompare(b.value);
    const starts = filtered.filter((it) => it.value.toLowerCase().startsWith(q)).sort(cmp);
    const contains = filtered.filter((it) => !it.value.toLowerCase().startsWith(q)).sort(cmp);
    return [...starts, ...contains].slice(0, 10);
  }, [searchOptions, searchQuery, selectedOpenings, selectedCreators]);
  // (버그 수정, v0.4.0) "정렬 박스"(최신순/레이팅순) 기능이 추가되며 이 두 useMemo가 조기 반환보다
  // 뒤에 새로 끼워 넣어졌다 — 바로 위 주석이 설명하는 "조기 반환은 반드시 모든 훅 호출 뒤에 와야
  // 한다"는 규칙을 다시 어긴 것으로, 결과는 동일하게 "Rendered fewer hooks than expected"였다.
  // 목록 화면(active=null)에서는 이 훅들이 호출되다가 퍼즐을 하나라도 열면(active가 생기는 순간,
  // 일일 퍼즐이든 일반 퍼즐이든 상관없이) 그 즉시 호출이 통째로 건너뛰어져 React가 이 컴포넌트
  // 트리를 흰 화면으로 무너뜨렸다 — 이 앱엔 ErrorBoundary가 없어 그대로 방치되면 새로고침 전까지
  // 그 화면이 하얗게 멈춘 채로 굳어, 사용자에게는 "클릭하는 순간 사이트가 먹통 됐다"로 보였다.
  // 이 두 훅도 조기 반환보다 앞으로 옮긴다(아래 puzzleOrderIndex/puzzleRatingMap 사용부는 그대로 둠).
  const puzzleOrderIndex = useMemo(() => { const m = new Map(); puzzles.forEach((p, i) => m.set(p.id, i)); return m; }, [puzzles]);
  const puzzleRatingMap = useMemo(() => { const m = new Map(); for (const p of playablePuzzles) m.set(p.id, puzzleRatingOf(p)); return m; }, [playablePuzzles]);
  // (v0.4.1 기능, item 3, 버그 수정) 이 useMemo가 아래 "모든 훅 호출 뒤에 조기 반환" 규칙을 어기고
  // 조기 반환보다 뒤(matchesOpeningFilter 근처)에 있었다 — 목록 화면에서는 호출되다가 퍼즐을 하나라도
  // 열면(active) 그 즉시 호출이 건너뛰어져 "Rendered fewer hooks than expected"로 화면 전체가
  // 먹통이 됐다(퍼즐을 아무거나 클릭하면 항상 재현됨). 위 puzzleRatingMap과 같은 자리로 옮긴다.
  const themeRates = useMemo(() => themeSolveRates(playablePuzzles, solved), [playablePuzzles, solved]);
  // (버그 수정) 이 조기 반환이 위 useMemo들보다 앞에 있었다 — 퍼즐 목록 화면(active=null)에서는
  // 그 훅들이 매 렌더 호출되다가, 퍼즐을 열어(active가 생겨) 이 분기를 타는 순간 그 훅 호출이
  // 통째로 건너뛰어져 이전 렌더보다 적은 수의 훅이 호출됐다. React는 이를 규칙 위반으로 감지해
  // "Rendered fewer hooks than expected" 오류를 던지며 화면 전체를 흰 화면으로 무너뜨렸다(퍼즐을
  // 아무거나 클릭만 하면 항상 재현됨). 조기 반환을 이 컴포넌트의 모든 훅 호출 뒤로 옮겨 해결한다.
  if (active) return <PuzzleSolver puzzle={active} onClose={closeActive} onLineSolved={onLineSolved} onPuzzleSolveEvent={onPuzzleSolveEvent} onPuzzleRatingEvent={onPuzzleRatingEvent} solveCount={solveCounts ? solveCounts[puzzleNo(active.id)] : null} solvedTags={lineSolves ? lineSolves[active.id] : null} friendSolverNames={friendNamesFor(active.id)} isLiked={likedPuzzles.has(active.id)} likeCount={(likeCounts && likeCounts[puzzleNo(active.id)]) || 0} onToggleLike={onToggleLike} isReposted={repostedPuzzles ? repostedPuzzles.has(active.id) : false} repostCount={(repostCounts && repostCounts[puzzleNo(active.id)]) || 0} onToggleRepost={onToggleRepost} shareCount={(shareCounts && shareCounts[puzzleNo(active.id)]) || 0} onShare={onShare} myUid={myUid} myPuzzleRating={puzzleRating || 800} engine={engine} liveOn={liveOn} canEdit={canEdit} bumpContent={bumpContent} initialLineNo={targetLineNo} onLineChange={onLineChange} onOpenLearn={onOpenLearn} lineClearOn={lineClearOn} puzzleClearOn={puzzleClearOn} coachBubbleOn={coachBubbleOn} onDeletePuzzle={async (id) => { const ok = await onDeletePuzzle(id); if (ok) closeActive(); return ok; }} onPuzzleRenamed={onPuzzleRenamed} onOpenProfile={onOpenProfile} onOpenLearnFen={onOpenLearnFen} />;
  // (버그 수정) 예전엔 openingKeyOf(최상위 이름 하나)와 정확히 일치해야만 매칭됐다 — 세부 갈래
  // 이름(예: "…Najdorf Variation, English Attack")을 선택하면, 그 이름이 퍼즐의 firstNamedOpening과
  // 다르므로(항상 최상위 이름만 반환) 절대 매칭될 수 없었다. 이제는 그 퍼즐의 수순이 실제로 지나는
  // "모든" 오프닝 이름(openingNamesAlong, 깊이 무관) 안에 선택된 이름이 있는지로 판정한다 — 세부
  // 갈래를 선택하면 그 위치까지 도달하는 퍼즐만, 상위 이름을 선택하면 그 상위 이름을 지나는 모든
  // (더 깊은 세부 갈래 포함) 퍼즐이 매칭된다. p.setupSans가 없는(레거시) 퍼즐은 p.opening(구
  // 최상위 이름 하나)로 대체 판정한다.
  const matchesOpeningFilter = (p) => {
    if (selectedOpenings.length === 0) return true;
    const names = puzzleOpeningNamesMap.get(p.id) || (p.setupSans ? openingNamesAlong(p.setupSans) : new Set());
    return selectedOpenings.some((o) => names.has(o) || (!p.setupSans && p.opening === o));
  };
  const matchesCreatorFilter = (p) => selectedCreators.length === 0 || selectedCreators.includes((creatorUsernames || {})[puzzleNo(p.id)]);
  // (v0.4.1 기능, item 3) 빠른 접근 칩 — "내가 만든 퍼즐"은 creatorUsernames(no -> 제작자 아이디)가
  // myUsername과 같은 퍼즐, "풀고 있는 중"은 라인을 하나 이상 풀었지만(lineSolves에 기록 있음)
  // 아직 전체 완주(solved)는 아닌 퍼즐로 판정한다.
  const matchesQuickFilter = (p) => {
    if (quickFilter === "mine") return !!myUsername && (creatorUsernames || {})[puzzleNo(p.id)] === myUsername;
    if (quickFilter === "inprogress") return !solved.has(p.id) && !!(lineSolves && lineSolves[p.id] && lineSolves[p.id].length > 0);
    return true;
  };
  // (사용자 요청) 전체/PGN/FEN 구분(다중 선택) — 카드 배지와 같은 기준(setupSans 유무 = PGN, fen
  // 필드 유무 = FEN). 하나라도 선택돼 있으면 그중 하나라도 해당하면 통과(OR), 선택이 없으면 전체 통과.
  const matchesSourceFilter = (p) => {
    if (!selectedSources.length) return true;
    return selectedSources.some((s) => (s === "pgn" ? !!(p.setupSans && p.setupSans.length) : !!p.fen));
  };
  // (신규 기능) 사용자 요청 — 오프닝/미들게임/엔드게임 국면 구분(다중 선택).
  const matchesPhaseFilter = (p) => !selectedPhases.length || selectedPhases.includes(puzzlePhase(p));
  // (사용자 요청) 테마 칩 다중 선택 — 선택된 테마 중 하나라도 겹치면 통과.
  const matchesThemeFilter = (p) => !selectedThemes.length || selectedThemes.some((t) => themesOf(p).includes(t));
  // (사용자 요청) 드롭다운 맨 위 전체/좋아요/리포스트 구분(다중 선택).
  const matchesEngagementFilter = (p) => {
    if (!selectedEngagement.length) return true;
    return selectedEngagement.some((e) => (e === "liked" ? likedPuzzles.has(p.id) : !!(repostedPuzzles && repostedPuzzles.has(p.id))));
  };
  const themed = playablePuzzles.filter((p) => matchesThemeFilter(p) && matchesOpeningFilter(p) && matchesCreatorFilter(p) && matchesQuickFilter(p) && matchesSourceFilter(p) && matchesPhaseFilter(p) && matchesEngagementFilter(p) && (!hideSolved || !solved.has(p.id)));
  // (v0.4.1 기능, item 3) 사용자 요청 — 미해결/해결 완료 두 목록으로 나누던 것을 없애고 하나의 정렬
  // 목록으로 합친다. 기본("추천순")은 puzzleExposureScore(난이도 적합도·약점 보완도·테마 적합도
  // 가중합, 위 참고)가 높은 순 — "해결 여부"는 그 점수 안의 약한 감점 요소로만 반영되고 더는 목록을
  // 가르는 주 기준이 아니다. "최신순"/"레이팅순"은 그대로 수동으로 고를 수 있게 남겨 둔다.
  const byOpeningFallback = (a, b) => (a.opening || "").localeCompare(b.opening || "") || (a.name || "").localeCompare(b.name || ""); // (UX4) 동률일 때만 쓰는 보조 기준
  const myPuzzleRating = puzzleRating || 800;
  const sortPuzzles = (list) => {
    const arr = [...list];
    if (puzzleSortBy === "rating") arr.sort((a, b) => (puzzleRatingMap.get(b.id) ?? -1) - (puzzleRatingMap.get(a.id) ?? -1) || byOpeningFallback(a, b));
    else if (puzzleSortBy === "recent") arr.sort((a, b) => (puzzleOrderIndex.get(b.id) ?? -1) - (puzzleOrderIndex.get(a.id) ?? -1) || byOpeningFallback(a, b));
    // (사용자 요청) 인기순 — popularityScores(puzzle_popularity_all RPC, 좋아요·리포스트·공유를
    // 사람 단위로 결합한 점수)가 높은 순.
    else if (puzzleSortBy === "popular") arr.sort((a, b) => ((popularityScores && popularityScores[puzzleNo(b.id)]) || 0) - ((popularityScores && popularityScores[puzzleNo(a.id)]) || 0) || byOpeningFallback(a, b));
    else arr.sort((a, b) => {
      const sa = puzzleExposureScore(a, { myRating: myPuzzleRating, themeRates, selectedTheme: selectedThemes, puzzleRating: puzzleRatingMap.get(a.id) ?? -1, solved, momentum: puzzleMomentum, solvedCount: solved.size });
      const sb = puzzleExposureScore(b, { myRating: myPuzzleRating, themeRates, selectedTheme: selectedThemes, puzzleRating: puzzleRatingMap.get(b.id) ?? -1, solved, momentum: puzzleMomentum, solvedCount: solved.size });
      return sb - sa || byOpeningFallback(a, b);
    });
    return arr;
  };
  const feed = sortPuzzles(themed);
  const puzzleCardProps = (p) => ({ solveCount: solveCountFor(p), solvedTags: lineSolves ? lineSolves[p.id] : null, friendSolverNames: friendNamesFor(p.id), isLiked: likedPuzzles.has(p.id), likeCount: (likeCounts && likeCounts[puzzleNo(p.id)]) || 0, onToggleLike, isReposted: repostedPuzzles ? repostedPuzzles.has(p.id) : false, repostCount: (repostCounts && repostCounts[puzzleNo(p.id)]) || 0, onToggleRepost, shareCount: (shareCounts && shareCounts[puzzleNo(p.id)]) || 0, onShare, myPuzzleRating });
  const chips = [["all", t("전체")], ["sacrifice", t("기물 희생하기")], ["advantage", t("우위 점하기")], ["punish", t("실수 응징하기")]];
  // (사용자 요청) 오프닝·생성자 필터가 걸려 있으면 테마 칩의 개수도 그 필터가 적용된 상태를 반영한다.
  const filteredForCount = playablePuzzles.filter((p) => matchesOpeningFilter(p) && matchesCreatorFilter(p));
  const count = (k) => (k === "all" ? filteredForCount.length : filteredForCount.filter((p) => themesOf(p).includes(k)).length);
  // (기능) 캐러셀 스와이프 범위가 최근 7일로 제한된 대신, "번호로 풀기" 입력창에 YYYYMMDD
  // 형식으로 날짜를 입력하면 그 날짜의 일일 퍼즐을 직접 찾아 연다 — 캐러셀과 똑같이
  // resolveDailyPuzzleCached(dateStr, engine)를 재사용하므로 계산 결과도 항상 일치한다.
  // (isDateInput은 위 numSuggestions 근처에서 이미 계산해 둔 값을 그대로 재사용한다.)
  const solveByInput = async () => {
    if (isDateInput) {
      const m = numInput.match(/^(\d{4})(\d{2})(\d{2})$/);
      const mm = m ? +m[2] : 0, dd = m ? +m[3] : 0;
      if (!m || mm < 1 || mm > 12 || dd < 1 || dd > 31) { setNumMsg(t("날짜는 YYYYMMDD 형식 (예: 20260729)")); return; }
      const dateStr = m[1] + "-" + m[2] + "-" + m[3];
      if (dateStr > todayStr()) { setNumMsg(t("아직 오지 않은 날짜")); return; }
      setNumMsg(t("불러오는 중…"));
      const pz = await resolveDailyPuzzleCached(dateStr, engine);
      if (pz) { setNumMsg(""); setNumInput(""); setActive(pz); } else setNumMsg(t("{0} 일일 퍼즐 없음", (dateStr)));
      return;
    }
    const n = parseInt(numInput, 10);
    if (!Number.isFinite(n)) { setNumMsg(t("번호 입력 필요")); return; }
    let hit = puzzles.find((p) => puzzleNo(p.id) === n);
    if (!hit) { setNumMsg(t("불러오는 중…")); const d = await puzzleFetch(n); if (d) hit = d; }
    if (hit) { setNumMsg(""); setNumInput(""); setActive(hit); } else setNumMsg(t("#{0} 번호의 퍼즐 없음", n));
  };
  return (
    <div>
      <div className="flex items-center gap-2"><Mascot name="kokoa" emotion="celebrate" size={70} /><h2 style={{ fontSize: 18, fontWeight: 800, color: T.ivoryHi }}>{t("퍼즐")}</h2></div>
      {/* (v0.0.6 추가) 퍼즐을 풀 때마다 오르는 티어를 늘 보이게 — 지금 구간은 크게, 다음 몇 단계는
          작게 미리 보여준다. 누르면 전체 여정 지도가 열린다. */}
      <TierProgressStrip totalXp={totalXp} onOpen={onOpenTierMap} puzzleRating={puzzleRating} />
      {/* (v0.6.4) 성장 센터 진입 — 약점 지도·실수 복습 카드·닮은 마스터 */}
      {onOpenGrowth && <GrowthEntryCard uid={myUid || null} onOpen={onOpenGrowth} />}
      {/* (18차 UI5) 안내 문구 삭제, (18차 UI2) 일일 퀘스트는 학습 탭으로 이동 */}
      {/* (v0.2.7 개편) 오늘의 퍼즐을 오락실 슬롯머신 스타일 캐러셀로 — 좌우로 스크롤해 날짜(오늘부터
          테마가 처음 배정된 날짜까지 전체 기간)를 고르면 선택된 항목만 커지고 나머지는 어둡게 줄어든다. */}
      <DailyPuzzleCarousel engine={engine} solved={solved} solveCounts={solveCounts} onOpen={setActive} />
      <DailyStreakStrip streak={dailyPuzzleStreak} />
      {/* (사용자 요청) 퍼즐 만들기 기능을 학습 탭 보드 편집기 대신 이 탭에서 — "번호로 풀기" 검색
          UI 바로 위 줄에 퍼즐 풀기/퍼즐 만들기 선택 박스를 둔다. */}
      <div className="inline-flex items-center" style={{ marginBottom: 10, borderRadius: 9, background: "rgba(0,0,0,.25)", border: "1px solid #5A4630", padding: 3, gap: 3 }}>
        <button onClick={() => setPuzzleMode("solve")} className="press" style={{ padding: "7px 16px", borderRadius: 7, border: "none", cursor: "pointer", fontSize: 12, fontWeight: 800, background: puzzleMode === "solve" ? T.ebony2 : "transparent", color: puzzleMode === "solve" ? T.brassHi : T.inkSoft }}>{t("퍼즐 풀기")}</button>
        {/* (사용자 요청) 로그인하지 않은 상태에서는 퍼즐 만들기 기능 자체를 쓸 수 없게 막는다 — 만든
            퍼즐은 myUid를 제작자로 기록해 공유되므로, 로그인 없이는 애초에 의미가 없다. */}
        <button onClick={() => myUid && setPuzzleMode("create")} disabled={!myUid} title={!myUid ? t("로그인 후 이용 가능") : undefined} className="press" style={{ padding: "7px 16px", borderRadius: 7, border: "none", cursor: myUid ? "pointer" : "default", fontSize: 12, fontWeight: 800, background: puzzleMode === "create" ? T.ebony2 : "transparent", color: !myUid ? "rgba(244,238,226,.35)" : puzzleMode === "create" ? T.brassHi : T.inkSoft }}>{t("퍼즐 만들기")}</button>
        {!myUid && <span style={{ fontSize: 10, color: T.inkSoft, padding: "0 8px" }}>{t("로그인 후 이용 가능")}</span>}
      </div>
      {puzzleMode === "create" && (
        <div style={{ marginBottom: 16 }}>
          {/* 1단계 — PGN 또는 FEN 코드 입력 */}
          <div style={{ background: T.paper, border: "1px solid #DCCBA8", borderRadius: 12, padding: 13, marginBottom: 10 }}>
            <div style={{ fontSize: 12.5, fontWeight: 800, color: T.ink, marginBottom: 8 }}>{t("1. PGN 또는 FEN 코드 입력")}</div>
            <textarea value={pcInput} onChange={(e) => { setPcInput(e.target.value); setPcParsed(null); setPcErr(""); setPcTheme(null); setPcAnalyzeResult(null); setPcAnalyzeErr(""); setPcSelectedMove(null); setPcGen(null); setPcGenErr(""); setPcSelectedGameId(null); }} rows={3}
              placeholder={t("예: 1. e4 e5 2. Nf3 Nc6 3. Bb5 a6 ...(다음 단계에서 유형에 맞는 수를 골라요)\n또는 FEN: rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1")}
              style={{ width: "100%", boxSizing: "border-box", fontSize: 12.5, padding: 10, borderRadius: 9, border: "1px solid #C9B58C", background: "#fff", color: T.ink, resize: "vertical", fontFamily: SITE_FONT }} />
            {pcErr && <div style={{ fontSize: 11.5, color: T.blunder, marginTop: 6 }}>{pcErr}</div>}
            {pcParsed && <div style={{ fontSize: 11.5, color: T.best, marginTop: 6, fontWeight: 700 }}>{pcParsed.kind === "fen" ? t("FEN 포지션 확인. 이 위치가 퍼즐 시작점") : t("기보가 확인됐어요({0}수). 아래에서 퍼즐 유형을 고르면 그에 맞는 수 선택 가능", pcParsed.sans.length)}</div>}
            {/* (사용자 요청) "확인" 버튼을 박스 우하단에 두고, 그 왼쪽에 이미지 스캔 버튼을 둔다 —
                체스판 사진이나 PGN/FEN 텍스트 사진을 스캔하면 입력 박스가 채워지고, 그대로 "확인"을
                눌러 검증한다. */}
            <div className="flex justify-end items-center" style={{ marginTop: 8, gap: 8 }}>
              <ImageSourceMenu onFile={onPcScanFile} disabled={pcScanning} busy={pcScanning} label={t("이미지 스캔")} busyLabel={t("인식하는 중... {0}%", pcScanProgress)}
                buttonStyle={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "7px 12px", borderRadius: 9, background: pcScanning ? "rgba(0,0,0,.06)" : "transparent", color: pcScanning ? T.inkSoft : T.ink, fontWeight: 700, fontSize: 12, border: "1px solid " + (pcScanning ? "#DCCBA8" : T.brass), cursor: pcScanning ? "default" : "pointer" }} />
              <button onClick={() => parsePcInput()} className="press" style={{ padding: "7px 14px", borderRadius: 9, background: T.ebony2, color: T.brassHi, fontWeight: 800, fontSize: 12, border: "1px solid #000", cursor: "pointer" }}>{t("확인")}</button>
            </div>
            {/* (사용자 요청) "chess.com 대국에서 선택" 토글 버튼을 없애고, 연동돼 있으면 입력 박스 아래에
                chess.com 통계·최근 대국 목록을 기본으로 펼쳐 둔다 — 유산 만들기처럼 그 자리에서 바로
                고를 수 있다. */}
            {chesscomReady && (
              <div style={{ marginTop: 10, paddingTop: 10, borderTop: "1px solid #E4D5B6" }}>
                <AccountChessStats chesscom={chesscom} username={chesscomUsername} selectedGameId={pcSelectedGameId} onSelectGame={(g, gid) => {
                  if (pcSelectedGameId != null && gid === pcSelectedGameId) {
                    setPcSelectedGameId(null); setPcInput(""); setPcParsed(null); setPcErr(""); setPcTheme(null); setPcAnalyzeResult(null); setPcAnalyzeErr(""); setPcSelectedMove(null); setPcGen(null); setPcGenErr("");
                    return;
                  }
                  setPcSelectedGameId(gid);
                  setPcInput(sansToPgnText(g.moves, "w")); setPcParsed(null); setPcErr(""); setPcTheme(null); setPcAnalyzeResult(null); setPcAnalyzeErr(""); setPcSelectedMove(null); setPcGen(null); setPcGenErr("");
                }} />
              </div>
            )}
          </div>
          {/* 2단계 — 퍼즐 유형 선택(PGN 한 수가 여러 전술을 동시에 만족할 수 있어 직접 고른다). 유형
              버튼을 먼저 누르게 하지 않고, PGN이 확인되는 즉시 세 유형의 후보를 모두 미리 불러와
              각 유형 아래에 나열한다 — 우상단에 채점 진행률(%)을 실시간으로 보여준다. 표시할 요소가
              많아져 기본 높이를 넉넉히 잡는다. */}
          {pcParsed && (
            <div style={{ background: T.paper, border: "1px solid #DCCBA8", borderRadius: 12, padding: 13, marginBottom: 10, minHeight: 280 }}>
              <div className="flex items-center justify-between" style={{ marginBottom: 8 }}>
                <div style={{ fontSize: 12.5, fontWeight: 800, color: T.ink }}>{t("2. 퍼즐 유형 선택")}</div>
                {pcGenerating ? (
                  <div style={{ fontSize: 11, fontWeight: 800, color: T.brass, fontFamily: SITE_FONT }}>{tx("{0}% 분석됨", Math.round(pcGenProgress * 100))}</div>
                ) : pcParsed.kind === "pgn" && (pcAnalyzing || pcAnalyzeResult) && (
                  <div style={{ fontSize: 11, fontWeight: 800, color: T.brass, fontFamily: SITE_FONT }}>{tx("{0}% 분석됨", Math.round((pcAnalyzeResult ? 1 : pcAnalyzeProgress) * 100))}</div>
                )}
              </div>
              {pcParsed.kind === "fen" ? (
                // FEN은 고를 후보 수 자체가 없다(포지션 자체가 시작점) — 유형을 고르면 곧바로 생성한다.
                <div className="flex gap-2" style={{ flexWrap: "wrap" }}>
                  {[["sacrifice", t("기물 희생하기")], ["advantage", t("우위 점하기")], ["punish", t("실수 응징하기")]].map(([k, lb]) => (
                    <button key={k} onClick={() => pickPcThemeFen(k)} disabled={pcGenerating} className="press" style={{ display: "inline-flex", alignItems: "center", gap: 7, padding: "7px 14px", borderRadius: 999, border: "1px solid " + (pcTheme === k ? T.brass : "#C9B58C"), background: pcTheme === k ? "linear-gradient(180deg," + T.brass + ",#A8842F)" : "transparent", color: pcTheme === k ? "#241509" : T.ink, fontWeight: 800, fontSize: 12, cursor: pcGenerating ? "default" : "pointer" }}>
                      <span style={{ display: "inline-flex", alignItems: "center" }}>
                        {PC_THEME_KINDS[k].map((kind, i) => (
                          <span key={kind} style={{ width: 16, height: 16, borderRadius: "50%", background: QCOLOR[kind], color: "#fff", display: "inline-flex", alignItems: "center", justifyContent: "center", marginLeft: i > 0 ? -6 : 0, border: "1.5px solid " + (pcTheme === k ? T.brass : T.paper), boxSizing: "content-box" }}>{badgeIcon(kind, 11)}</span>
                        ))}
                      </span>
                      {lb}
                    </button>
                  ))}
                </div>
              ) : (
                <>
                  {pcAnalyzeErr && <div style={{ fontSize: 11.5, color: T.blunder }}>{pcAnalyzeErr}</div>}
                  {pcAnalyzing && !pcAnalyzeResult && <div style={{ fontSize: 11.5, color: T.inkSoft }}>{t("기보를 채점하는 중...")}</div>}
                  {/* (사용자 요청) 유형 버튼을 먼저 고르게 하지 않고, 세 유형 모두 후보를 한꺼번에
                      나열한다 — 아이콘으로 각 유형이 어떤 등급을 다루는지 보여준다. */}
                  {pcAnalyzeResult && [["sacrifice", t("기물 희생하기")], ["advantage", t("우위 점하기")], ["punish", t("실수 응징하기")]].map(([k, lb]) => {
                    const kinds = PC_THEME_KINDS[k];
                    const qualifying = pcAnalyzeResult.moves.filter((m) => kinds.includes(m.kind));
                    return (
                      <div key={k} style={{ marginBottom: 12 }}>
                        <div className="flex items-center gap-2" style={{ marginBottom: 6 }}>
                          <span style={{ display: "inline-flex", alignItems: "center" }}>
                            {kinds.map((kind, i) => (
                              <span key={kind} style={{ width: 16, height: 16, borderRadius: "50%", background: QCOLOR[kind], color: "#fff", display: "inline-flex", alignItems: "center", justifyContent: "center", marginLeft: i > 0 ? -6 : 0, border: "1.5px solid " + T.paper, boxSizing: "content-box" }}>{badgeIcon(kind, 11)}</span>
                            ))}
                          </span>
                          <span style={{ fontWeight: 800, fontSize: 12, color: T.ink }}>{lb}</span>
                          <span style={{ fontSize: 10.5, color: T.inkSoft }}>{tx("{0}개", qualifying.length)}</span>
                        </div>
                        {qualifying.length === 0 ? (
                          <div style={{ fontSize: 11, color: T.inkSoft }}>{tx("이 기보에는 \"{0}\" 등급의 수 없음", kinds.map((kk) => QLABEL[kk]).join("·"))}</div>
                        ) : (
                          <div style={{ display: "flex", flexWrap: "wrap", gap: 5 }}>
                            {qualifying.map((m) => (
                              <MoveLongPressPreview key={m.ply} priorSans={pcParsed.sans.slice(0, m.ply)} san={m.san} kind={m.kind}>
                                <button onClick={() => pickPcMove(k, m)} disabled={pcGenerating} className="press" style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "6px 10px", borderRadius: 8, border: "1px solid " + (pcSelectedMove && pcSelectedMove.ply === m.ply && pcTheme === k ? T.brass : QCOLOR[m.kind]), background: pcSelectedMove && pcSelectedMove.ply === m.ply && pcTheme === k ? "rgba(196,154,80,.14)" : "#fff", cursor: pcGenerating ? "default" : "pointer" }}>
                                  <span style={{ width: 18, height: 18, borderRadius: "50%", flexShrink: 0, background: QCOLOR[m.kind], color: "#fff", display: "inline-flex", alignItems: "center", justifyContent: "center" }}>{badgeIcon(m.kind, 12)}</span>
                                  <span style={{ fontFamily: SITE_FONT, fontWeight: 800, fontSize: 12.5, color: T.ink }}>{moveNumber(m.ply)}{m.san}</span>
                                </button>
                              </MoveLongPressPreview>
                            ))}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </>
              )}
              {pcGenerating && <div style={{ fontSize: 11.5, color: T.inkSoft, marginTop: 10 }}>{t("전술 라인 검색 중…")}</div>}
              {pcGenErr && <div style={{ fontSize: 11.5, color: T.blunder, marginTop: 10 }}>{pcGenErr}</div>}
              {/* (v0.4.4 개편, 사용자 요청) 이미 같은 포지션의 퍼즐이 있으면(누가 만들었는지와 함께)
                  여기서 바로 알려준다 — 아래 3·4단계(라인 생성·공개 설정)는 필요 없으므로 건너뛴다. */}
              {pcExisting && (
                <div style={{ marginTop: 10, padding: "10px 13px", borderRadius: 10, background: "rgba(196,154,80,.14)", border: "1px solid " + T.brass, color: T.ink, fontWeight: 700, fontSize: 12.5 }}>
                  {pcExisting.creatorUsername ? t("@{0}님이 이미 만든 퍼즐", pcExisting.creatorUsername) : t("이미 존재하는 퍼즐")}
                </div>
              )}
            </div>
          )}
          {/* 3단계 — 생성된 라인 미리보기(생성자 권한 박스, 만든 뒤에도 이어서 조정할 수 있다). 생성자는
              이미 이 트리를 볼 권한이 있으므로(사용자 요청) 일반 풀이 화면과 달리 고스트 처리 없이
              라인 전체를 그대로 보여준다(revealAll). */}
          {!pcExisting && pcTheme && pcGen && (
            <div style={{ background: T.paper, border: "1px solid #DCCBA8", borderRadius: 12, padding: 13, marginBottom: 10 }}>
              <div style={{ fontSize: 12.5, fontWeight: 800, color: T.ink, marginBottom: 8 }}>{t("3. 퍼즐 라인 편집 (생성자 권한)")}</div>
              <div style={{ fontSize: 11.5, color: T.inkSoft, marginBottom: 10 }}>{tx("{0}개 라인 발견. 아래에서 미리 확인 가능, 생성 후에도 라인 추가·삭제 가능 (1시간에 한 번)", pcGen.lines.length)}</div>
              {/* (버그 수정, 사용자 제보) 기물 희생하기 테마는 선택한 수 자체가 풀이자가 찾아야 할
                  첫 수(firstSan)라 시작 포지션을 그 수 이전(직전 수까지)으로 둬야 하는데, 이 미리보기가
                  다른 테마와 똑같이 선택한 수까지 이미 둔 위치를 시작 포지션으로 보여주고 있었다. */}
              <PuzzleSchematic tree={pcGen.tree} rootLabel={pcParsed.kind === "pgn" && pcSelectedMove && pcTheme !== "sacrifice" ? pcSelectedMove.san : null} meta={{}}
                allLines={pcGen.lines} solvedNow={new Set()} curKeys={[]} exploredKeys={new Set()}
                setupSans={pcParsed.kind === "pgn" && pcSelectedMove ? pcParsed.sans.slice(0, pcTheme === "sacrifice" ? pcSelectedMove.ply : pcSelectedMove.ply + 1) : []}
                setupLen={pcParsed.kind === "pgn" && pcSelectedMove ? (pcTheme === "sacrifice" ? pcSelectedMove.ply : pcSelectedMove.ply + 1) : 0}
                onPick={() => {}} canEdit={false} revealAll
                fenRoot={pcParsed.kind === "fen" ? pcParsed.fenRoot : null} />
              <button onClick={() => (pcParsed.kind === "fen" ? runPcGenerate(pcTheme, [], "", pcParsed.fenRoot) : pcSelectedMove && pickPcMove(pcTheme, pcSelectedMove))} className="press" style={{ marginTop: 8, padding: "6px 12px", borderRadius: 9, background: "transparent", border: "1px solid #C9B58C", color: T.inkSoft, fontWeight: 700, fontSize: 11.5, cursor: "pointer" }}>{t("다시 생성")}</button>
            </div>
          )}
          {/* 4단계 — 사용자 요청: 이 퍼즐을 다른 사람에게도 보여줄지(공개) 나만 보이게 할지(비공개) 정한다.
              기본은 공개(기존 동작과 동일). 만든 뒤에도 퍼즐 풀이 카드 2페이지(생성자 권한 박스)에서
              바꿀 수 있다. */}
          {!pcExisting && pcTheme && pcGen && (
            <div style={{ background: T.paper, border: "1px solid #DCCBA8", borderRadius: 12, padding: 13, marginBottom: 10 }}>
              <div style={{ fontSize: 12.5, fontWeight: 800, color: T.ink, marginBottom: 8 }}>{t("4. 공개 설정")}</div>
              <div className="flex gap-2">
                {[[true, t("공개"), t("다른 사람도 보고 풀 수 있음")], [false, t("비공개"), t("나만 보고 풀 수 있음")]].map(([v, lb, desc]) => (
                  <button key={String(v)} onClick={() => setPcPublic(v)} className="press" style={{ flex: 1, padding: "9px 10px", borderRadius: 10, border: "1px solid " + (pcPublic === v ? T.brass : "#C9B58C"), background: pcPublic === v ? "linear-gradient(180deg," + T.brass + ",#A8842F)" : "transparent", color: pcPublic === v ? "#241509" : T.ink, cursor: "pointer", textAlign: "left" }}>
                    <span style={{ display: "block", fontWeight: 800, fontSize: 12.5 }}>{lb}</span>
                    <span style={{ display: "block", fontSize: 10, marginTop: 2, opacity: 0.85 }}>{desc}</span>
                  </button>
                ))}
              </div>
            </div>
          )}
          {/* 완료 — 취소·퍼즐 만들기(이미 있으면 대신 퍼즐 풀기) */}
          <div className="flex gap-2">
            <button onClick={() => { resetPuzzleCreate(); setPuzzleMode("solve"); }} className="press" style={{ flex: 1, padding: "10px 0", borderRadius: 10, border: "1px solid rgba(255,255,255,.2)", background: "transparent", color: T.ivory, fontWeight: 800, fontSize: 13, cursor: "pointer" }}>{t("취소")}</button>
            {pcExisting ? (
              <button onClick={() => { const pz = pcExisting.puzzle; resetPuzzleCreate(); setPuzzleMode("solve"); setActive(pz); }} className="press" style={{ flex: 2, padding: "10px 0", borderRadius: 10, border: "none", background: "linear-gradient(180deg," + T.brass + ",#A8842F)", color: "#241509", fontWeight: 800, fontSize: 13, cursor: "pointer" }}>{t("퍼즐 풀기")}</button>
            ) : (
              <button onClick={submitPuzzleCreate} disabled={!pcCanSubmit} className="press" style={{ flex: 2, padding: "10px 0", borderRadius: 10, border: "none", background: pcCanSubmit ? "linear-gradient(180deg," + T.brass + ",#A8842F)" : "rgba(196,154,80,.25)", color: pcCanSubmit ? "#241509" : "rgba(36,21,9,.5)", fontWeight: 800, fontSize: 13, cursor: pcCanSubmit ? "pointer" : "default" }}>{pcCreating ? t("만드는 중...") : t("퍼즐 만들기")}</button>
            )}
          </div>
        </div>
      )}
      {puzzleMode === "solve" && (
      <>
      <div style={{ position: "relative", marginBottom: 10 }}>
        <div className="flex items-center gap-2">
          {/* (사용자 요청) 번호로 풀기 검색창·풀기 버튼·오프닝/생성자 검색창·필터 버튼 네 요소의
              높이를 36px로 통일한다. */}
          <input value={numInput} onChange={(e) => setNumInput(e.target.value.replace(/[^0-9]/g, ""))} onKeyDown={(e) => e.key === "Enter" && solveByInput()} onFocus={() => setNumFocus(true)} onBlur={() => setTimeout(() => setNumFocus(false), 150)} inputMode="numeric" placeholder={t("번호 또는 날짜로 풀기 (예: 123456 · 20260729)")} style={{ flex: 1, minWidth: 0, height: 36, boxSizing: "border-box", padding: "0 11px", borderRadius: 9, border: "1px solid #5A4630", background: "rgba(0,0,0,.25)", color: T.ivoryHi, fontFamily: SITE_FONT, fontSize: 13 }} />
          <button onClick={solveByInput} className="press" style={{ height: 36, boxSizing: "border-box", padding: "0 14px", borderRadius: 9, background: "linear-gradient(180deg," + T.brass + ",#A8842F)", color: "#241509", fontWeight: 800, border: "none", cursor: "pointer", fontSize: 12, whiteSpace: "nowrap", display: "inline-flex", alignItems: "center", justifyContent: "center" }}>{t("풀기")}</button>
        </div>
        {/* (기능) 입력 중인 번호로 시작하는 퍼즐을 추천 — 모바일은 입력창 바로 아래 작은 드롭다운
            목록(포커스 중일 때만), 데스크톱은 그 자리에 실제 퍼즐 카드 블록으로 계속 갱신해서
            보여준다(포커스 여부와 무관, 넓은 화면이라 카드 그리드를 놓을 자리가 충분함).
            onMouseDown에서 preventDefault해 클릭 전에 input의 onBlur가 목록을 먼저 숨겨버리지
            않게 한다. */}
        {narrowPuzzleSearch ? (
          numFocus && numSuggestions.length > 0 && (
            <div style={{ position: "absolute", left: 0, right: 0, top: "100%", marginTop: 4, background: T.paper, border: "1px solid #DCCBA8", borderRadius: 9, overflow: "hidden", zIndex: 20, boxShadow: "0 8px 20px -6px rgba(0,0,0,.4)" }}>
              {numSuggestions.map((p) => (
                <button key={p.id} onMouseDown={(e) => e.preventDefault()} onClick={() => { setActive(p); setNumInput(""); setNumMsg(""); }} className="press flex items-center gap-2" style={{ width: "100%", padding: "7px 10px", background: "transparent", border: "none", borderBottom: "1px solid rgba(196,154,80,.25)", cursor: "pointer", textAlign: "left" }}>
                  <span style={{ fontSize: 11, fontWeight: 800, color: T.brass, fontFamily: SITE_FONT, flexShrink: 0 }}>#{puzzleNo(p.id)}</span>
                  <span style={{ fontSize: 12, color: T.ink, fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{livePuzzleName(p) || p.opening}</span>
                </button>
              ))}
            </div>
          )
        ) : (
          // (사용자 요청) 데스크톱 미리보기도 줄바꿈되는 그리드 대신, 추천 퍼즐과 같은 방식으로
          // 점선 테두리 박스(검색 영역임을 시각적으로 구분) 안에 한 줄로 담아 좌우 스크롤하도록
          // 바꾼다. 검색용 미리보기라는 걸 한눈에 구분할 수 있도록 카드 크기를 조금 줄이고(zoom),
          // 마우스를 올리면 금색 테두리가 뜨는 스타일을 준다(.puzzle-search-preview, 전역 스타일 참고).
          numSuggestions.length > 0 && (
            <div style={{ marginTop: 10, border: "1.5px dashed rgba(196,154,80,.45)", borderRadius: 14, padding: "8px 8px 10px" }}>
              <div style={{ display: "flex", gap: 10, overflowX: "auto", paddingBottom: 4, WebkitOverflowScrolling: "touch" }}>
                {numSuggestions.map((p) => (
                  <div key={p.id} className="puzzle-search-preview" style={{ flexShrink: 0, zoom: 0.86, width: 230 }}>
                    <PuzzleCard p={p} isSolved={solved.has(p.id)} onClick={() => { setActive(p); setNumInput(""); setNumMsg(""); }} {...puzzleCardProps(p)} />
                  </div>
                ))}
              </div>
            </div>
          )
        )}
      </div>
      {numMsg && <p style={{ fontSize: 11.5, color: T.blunder, margin: "-4px 0 10px" }}>{numMsg}</p>}
      {/* (사용자 요청) 퍼즐 필터 — 오프닝/생성자를 자동완성으로 검색해 여러 개(다중 태그) 고르면,
          아래 미해결/해결됨 목록·테마 칩 개수가 그 자리에서 그대로 좁혀진다(별도 결과 화면 없음). */}
      <div style={{ marginBottom: 10 }}>
        {(selectedOpenings.length > 0 || selectedCreators.length > 0) && (
          <div className="flex items-center gap-1.5" style={{ flexWrap: "wrap", marginBottom: 6 }}>
            {selectedOpenings.map((o) => (
              <span key={"op-" + o} style={{ display: "inline-flex", alignItems: "center", gap: 4, padding: "3px 8px", borderRadius: 999, background: "rgba(196,154,80,.16)", border: "1px solid " + T.brass, fontSize: 10.5, fontWeight: 700, color: T.brassHi }}>
                {o}
                <button onClick={() => setSelectedOpenings((s) => s.filter((x) => x !== o))} aria-label={t("오프닝 필터 해제")} className="press" style={{ background: "none", border: "none", color: T.brassHi, cursor: "pointer", padding: 0, display: "inline-flex" }}><X size={10} /></button>
              </span>
            ))}
            {selectedCreators.map((c) => (
              <span key={"cr-" + c} style={{ display: "inline-flex", alignItems: "center", gap: 4, padding: "3px 8px", borderRadius: 999, background: "rgba(60,138,60,.16)", border: "1px solid " + T.best, fontSize: 10.5, fontWeight: 700, color: "#BEEAB0" }}>
                @{c}
                <button onClick={() => setSelectedCreators((s) => s.filter((x) => x !== c))} aria-label={t("생성자 필터 해제")} className="press" style={{ background: "none", border: "none", color: "#BEEAB0", cursor: "pointer", padding: 0, display: "inline-flex" }}><X size={10} /></button>
              </span>
            ))}
            <button onClick={() => { setSelectedOpenings([]); setSelectedCreators([]); }} className="press" style={{ fontSize: 10.5, fontWeight: 700, color: T.inkSoft, background: "none", border: "none", cursor: "pointer", padding: "3px 4px" }}>{t("전체 해제")}</button>
          </div>
        )}
        <div className="flex items-center gap-2" style={{ flexWrap: "wrap" }}>
          {/* (사용자 요청) "오프닝으로 필터" + "생성자로 필터" 2개 입력창을 검색어 하나로 합친다 —
              드롭다운 한 곳에 오프닝(브론즈 태그)·생성자(초록 태그, @접두사) 결과가 함께 랭킹순으로
              뜬다(도감 탭 오프닝 트리 검색과 같은 "맨 앞 일치 → 포함 일치" 순서, 위 searchSuggestions 참고). */}
          {/* (사용자 요청) 정렬 UI가 산만해 보인다는 피드백 — 검색창 폭을 줄이고(flex-basis 축소),
              그렇게 생긴 오른쪽 여백에 깔때기(Filter) 아이콘 버튼 하나만 둔다. */}
          <div style={{ position: "relative", flex: "1 1 110px", minWidth: 100 }}>
            <input value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} onFocus={() => setSearchFocus(true)} onBlur={() => setTimeout(() => setSearchFocus(false), 150)}
              placeholder={t("오프닝 · 생성자로 검색")} style={{ width: "100%", height: 36, boxSizing: "border-box", padding: "0 9px", borderRadius: 9, border: "1px solid #5A4630", background: "rgba(0,0,0,.25)", color: T.ivoryHi, fontSize: 12 }} />
            {searchFocus && searchSuggestions.length > 0 && (
              <div style={{ position: "absolute", left: 0, right: 0, top: "100%", marginTop: 4, background: T.paper, border: "1px solid #DCCBA8", borderRadius: 9, overflow: "hidden", zIndex: 20, boxShadow: "0 8px 20px -6px rgba(0,0,0,.4)", maxHeight: 220, overflowY: "auto" }}>
                {searchSuggestions.map((it) => (
                  <button key={it.type + "-" + it.value} onMouseDown={(e) => e.preventDefault()}
                    onClick={() => { if (it.type === "opening") setSelectedOpenings((s) => [...s, it.value]); else setSelectedCreators((s) => [...s, it.value]); setSearchQuery(""); }}
                    className="press" style={{ display: "flex", alignItems: "center", gap: 6, width: "100%", textAlign: "left", padding: "7px 10px", background: "transparent", border: "none", borderBottom: "1px solid rgba(196,154,80,.25)", cursor: "pointer", fontSize: 12, color: T.ink, fontWeight: 600 }}>
                    {/* (버그 수정) 밝은(양피지색) 드롭다운 행 배경 위에서 T.brassHi(어두운 배경용 밝은 금색)를
                        써서 대비가 거의 없었다 — "생성자" 라벨처럼 밝은 배경에서도 잘 읽히는 진한 색으로. */}
                    <span style={{ flexShrink: 0, fontSize: 9, fontWeight: 800, padding: "1px 5px", borderRadius: 999, color: it.type === "opening" ? "#8A6A2F" : "#1F6B1F", background: it.type === "opening" ? "rgba(196,154,80,.22)" : "rgba(60,138,60,.18)" }}>{it.type === "opening" ? t("오프닝") : t("생성자")}</span>
                    <span style={{ minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{it.type === "creator" ? "@" : ""}{it.value}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
          {/* (사용자 요청) 정렬 기준(추천순/최신순/레이팅순) 3분할 세그먼트 박스와, 그 아래 있던 빠른
              접근 칩(전체/내가 만든 퍼즐/풀고 있는 중)·테마 칩 행을 모두 없애고, 깔때기 아이콘 버튼
              하나의 드롭다운 안에 정렬·빠른 필터·테마 세 구획으로 함께 담는다 — 산만하던 필터 줄
              여러 개를 한 곳으로 모은다. */}
          <div style={{ position: "relative", flexShrink: 0 }}>
            <button ref={sortBtnRef} onClick={toggleSortMenu} className="press" title={t("정렬·필터")} aria-label={t("정렬·필터 선택")} style={{ width: 36, height: 36, boxSizing: "border-box", borderRadius: 9, background: sortMenuOpen ? T.ebony2 : "rgba(0,0,0,.25)", border: "1px solid " + T.brass, color: T.brassHi, display: "inline-flex", alignItems: "center", justifyContent: "center", cursor: "pointer" }}>
              <Filter size={15} />
            </button>
            {sortMenuOpen && sortMenuPos && typeof document !== "undefined" && createPortal(
              <>
                <div onClick={() => setSortMenuOpen(false)} style={{ position: "fixed", inset: 0, zIndex: 40 }} />
                {/* (버그 수정, 사용자 제보) position:fixed로만 띄우면 탭 전환 애니메이션(transform이 걸린
                    조상)이 있을 때 뷰포트가 아니라 그 조상 기준으로 계산돼 모바일에서 잘려 보였다 —
                    ClickInfoBadge 등과 동일하게 document.body로 포털을 띄운다. */}
                {/* (사용자 요청) 개발자의 "이름·키워드 편집" 박스와 같은 레이아웃 — 어두운 브라스 톤
                    카드(진한 그러데이션 배경 + 브라스 테두리) 안에, 구획마다 작은 라벨 밑에
                    KW_SINGLES 스타일의 줄바꿈 칩 그룹을 둔다. */}
                <div style={{ position: "fixed", left: sortMenuPos.left, top: sortMenuPos.top, bottom: sortMenuPos.bottom, width: 240, maxHeight: sortMenuPos.maxHeight, overflowY: "auto", borderRadius: 12, background: "linear-gradient(180deg,#3A2516,#241509)", border: "1px solid " + T.brass, boxShadow: "0 8px 20px -6px rgba(0,0,0,.5)", zIndex: 41, padding: 12 }}>
                  <div className="flex items-center gap-2" style={{ color: T.brassHi, fontWeight: 800, fontSize: 12.5, marginBottom: 10 }}>{tx("{0} 정렬 · 필터", <Filter size={14} />)}</div>
                  {/* (사용자 요청) 맨 위에 전체/좋아요/리포스트 구획 추가. 아래 구획들과 마찬가지로
                      다중 선택 가능("전체"를 누르면 선택을 모두 해제) — "빠른 필터"만 예외로 단일 선택. */}
                  <div style={{ marginBottom: 10 }}>
                    <div style={{ fontSize: 9.5, fontWeight: 800, color: "rgba(244,238,226,.55)", marginBottom: 5 }}>{t("전체 · 좋아요 · 리포스트")}</div>
                    <div className="flex flex-wrap gap-1">
                      {[["all", t("전체")], ["liked", t("좋아요")], ["reposted", t("리포스트")]].map(([k, lb]) => { const on = k === "all" ? selectedEngagement.length === 0 : selectedEngagement.includes(k); return (
                        <button key={k} onClick={() => toggleEngagement(k)} className="press" style={{ fontSize: 9.5, fontWeight: 800, padding: "5px 9px", borderRadius: 5, border: "1px solid " + (on ? T.brass : "rgba(255,255,255,.15)"), background: on ? "rgba(196,154,80,.28)" : "rgba(255,255,255,.06)", color: on ? T.brassHi : T.ivory, cursor: "pointer" }}>{lb}</button>
                      ); })}
                    </div>
                  </div>
                  <div style={{ marginBottom: 10 }}>
                    <div style={{ fontSize: 9.5, fontWeight: 800, color: "rgba(244,238,226,.55)", marginBottom: 5 }}>{t("정렬")}</div>
                    <div className="flex flex-wrap gap-1">
                      {PUZZLE_SORT_OPTIONS.map(([k, lb]) => { const on = puzzleSortBy === k; return (
                        <button key={k} onClick={() => setPuzzleSortBy(k)} className="press" style={{ fontSize: 9.5, fontWeight: 800, padding: "5px 9px", borderRadius: 5, border: "1px solid " + (on ? T.brass : "rgba(255,255,255,.15)"), background: on ? "rgba(196,154,80,.28)" : "rgba(255,255,255,.06)", color: on ? T.brassHi : T.ivory, cursor: "pointer" }}>{lb}</button>
                      ); })}
                    </div>
                  </div>
                  <div style={{ marginBottom: 10 }}>
                    <div style={{ fontSize: 9.5, fontWeight: 800, color: "rgba(244,238,226,.55)", marginBottom: 5 }}>{t("빠른 필터")}</div>
                    <div className="flex flex-wrap gap-1">
                      {[["all", t("전체")], ["mine", t("내가 만든 퍼즐")], ["inprogress", t("풀고 있는 중")]].map(([k, lb]) => { const on = quickFilter === k; return (
                        <button key={k} onClick={() => setQuickFilter(k)} className="press" style={{ fontSize: 9.5, fontWeight: 800, padding: "5px 9px", borderRadius: 5, border: "1px solid " + (on ? T.best : "rgba(255,255,255,.15)"), background: on ? "rgba(60,138,60,.28)" : "rgba(255,255,255,.06)", color: on ? "#BEEAB0" : T.ivory, cursor: "pointer" }}>{lb}</button>
                      ); })}
                    </div>
                  </div>
                  {/* (사용자 요청) 테마 칩 다중 선택. */}
                  <div style={{ marginBottom: 10 }}>
                    <div style={{ fontSize: 9.5, fontWeight: 800, color: "rgba(244,238,226,.55)", marginBottom: 5 }}>{t("테마")}</div>
                    <div className="flex flex-wrap gap-1">
                      {chips.map(([k, lb]) => { const on = k === "all" ? selectedThemes.length === 0 : selectedThemes.includes(k); return (
                        <button key={k} onClick={() => toggleTheme(k)} className="press" style={{ fontSize: 9.5, fontWeight: 800, padding: "5px 9px", borderRadius: 5, border: "1px solid " + (on ? T.brass : "rgba(255,255,255,.15)"), background: on ? "rgba(196,154,80,.28)" : "rgba(255,255,255,.06)", color: on ? T.brassHi : T.ivory, cursor: "pointer" }}>{lb} <span style={{ opacity: .65 }}>{count(k)}</span></button>
                      ); })}
                    </div>
                  </div>
                  {/* (사용자 요청) 전체/PGN/FEN 구분(다중 선택) — 카드에 새로 붙은 PGN/FEN 배지와 같은 기준. */}
                  <div style={{ marginBottom: 10 }}>
                    <div style={{ fontSize: 9.5, fontWeight: 800, color: "rgba(244,238,226,.55)", marginBottom: 5 }}>{t("시작 포지션")}</div>
                    <div className="flex flex-wrap gap-1">
                      {[["all", t("전체")], ["pgn", "PGN"], ["fen", "FEN"]].map(([k, lb]) => { const on = k === "all" ? selectedSources.length === 0 : selectedSources.includes(k); return (
                        <button key={k} onClick={() => toggleSource(k)} className="press" style={{ fontSize: 9.5, fontWeight: 800, padding: "5px 9px", borderRadius: 5, border: "1px solid " + (on ? T.brass : "rgba(255,255,255,.15)"), background: on ? "rgba(196,154,80,.28)" : "rgba(255,255,255,.06)", color: on ? T.brassHi : T.ivory, cursor: "pointer" }}>{lb}</button>
                      ); })}
                    </div>
                  </div>
                  {/* (신규 기능) 사용자 요청 — 오프닝/미들게임/엔드게임 국면 구분(다중 선택). */}
                  <div style={{ marginBottom: 10 }}>
                    <div style={{ fontSize: 9.5, fontWeight: 800, color: "rgba(244,238,226,.55)", marginBottom: 5 }}>{t("포지션 단계")}</div>
                    <div className="flex flex-wrap gap-1">
                      {[["all", t("전체")], ["opening", t("오프닝")], ["middlegame", t("미들게임")], ["endgame", t("엔드게임")]].map(([k, lb]) => { const on = k === "all" ? selectedPhases.length === 0 : selectedPhases.includes(k); return (
                        <button key={k} onClick={() => togglePhase(k)} className="press" style={{ fontSize: 9.5, fontWeight: 800, padding: "5px 9px", borderRadius: 5, border: "1px solid " + (on ? T.brass : "rgba(255,255,255,.15)"), background: on ? "rgba(196,154,80,.28)" : "rgba(255,255,255,.06)", color: on ? T.brassHi : T.ivory, cursor: "pointer" }}>{lb}</button>
                      ); })}
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <button onClick={() => setHideSolved((v) => !v)} className="press" style={{ flex: 1, fontSize: 11, fontWeight: 700, padding: "6px 12px", borderRadius: 7, border: "1px solid " + (hideSolved ? T.brass : "rgba(255,255,255,.2)"), background: hideSolved ? T.brass : "transparent", color: hideSolved ? "#241509" : T.ivory, cursor: "pointer" }}>{hideSolved ? t("해결 완료 숨기는 중") : t("해결 완료 숨기기")}</button>
                  </div>
                </div>
              </>,
              document.body
            )}
          </div>
        </div>
      </div>
      {/* (v0.4.1 기능, item 3) 사용자 요청 — 추천/미해결/해결 완료 3분할을 없애고 단일 정렬 피드로
          통합한다. 기본 정렬("추천순")은 위 puzzleExposureScore(난이도 적합도·약점 보완도·테마
          적합도 가중합)가 높은 순 — 예전 "🔥 추천 퍼즐" 섹션이 하던 발견 기능(인기·리포스트 퍼즐)은
          discoveredPuzzles로 이 피드의 후보 풀에 그대로 합류돼 있다. */}
      {feed.length === 0 ? <div style={{ background: T.paper, border: "1px dashed #C9B58C", borderRadius: 12, padding: 20, textAlign: "center", color: T.inkSoft, fontSize: 13 }}><div style={{ display: "flex", justifyContent: "center", marginBottom: 8 }}><Mascot name="kokoa" emotion="sleep" size={88} /></div>{t("조건에 맞는 퍼즐 없음")}</div>
        : <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(210px,1fr))", gap: 10 }}>
            <AnimatePresence mode="popLayout">
              {/* (버그 수정) 이 카드의 "✕" 삭제 버튼이 소유자 확인·확인 다이얼로그 없이 모든 로그인
                  유저에게 그대로 노출돼 있었다(누구나 남의 퍼즐을 즉시 지울 수 있었음) — 퍼즐 삭제는
                  퍼즐 풀이 화면 2페이지의 생성자 전용·확인 다이얼로그 경로로만 하도록 이 카드에서는
                  onDelete를 넘기지 않는다. */}
              {feed.map((p, i) => <FadeIn key={p.id} index={i}><PuzzleCard p={p} isSolved={solved.has(p.id)} onClick={() => setActive(p)} {...puzzleCardProps(p)} /></FadeIn>)}
            </AnimatePresence>
          </div>}
      </>
      )}
    </div>
  );
}