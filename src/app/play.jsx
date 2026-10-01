// (v0.6.0, App.jsx 분할) 'play' 화면과 그 화면만 쓰는 조각
// 동작 변경 없이 App.jsx에서 그대로 옮겼다(REFACTOR_NOTES.md Phase 3 참고).
import { plyIsWhite, fenOfRoot, MAX_SEARCH_DEPTH, uciToSan, boardOfRoot, stripSuffix, parseFenFull, replayFromFen, epTarget, colorOfRoot, gameEndState, fenLegalDests, liveLegalDests, buildSan, plyMoveNum } from "../lib/chessRules.js";
import { ownPriorMoveWasSacrifice } from "../lib/moveQuality.js";
import { useMemo, useRef, useEffect, useState, useCallback, useContext, createContext } from "react";
import { loadLastGameQuality, playSfx, saveLastGameQuality, playMoveSfx } from "../lib/prefs.js";
import { T, MOTION_EASE, BOARD_SKINS, boardSquareBg, BOARD_GLOSS, PIECE_SKINS } from "../lib/theme.js";
import { badgeIcon, PendingDots } from "../components/badges.jsx";
import { motion, AnimatePresence, useAnimationControls, LayoutGroup } from "framer-motion";
import { PieceGlyph, SkinContext } from "../components/pieces.jsx";
import { X, Cpu, Star, User, Target, Route, Puzzle, Swords, ArrowLeft, Crown, Play, Check, RotateCcw, Trophy, ChevronRight, ChevronLeft, TrendingUp, TrendingDown, Shuffle, Undo2, Eye, Wrench, ChevronUp, ChevronDown, Trash2, Settings, Handshake, Repeat2 } from "lucide-react";
import { tierFromXp, tierGradientCss } from "../lib/tierSystem.js";
import { sbRpc, sbSelect, SB_ON, SB_TOKEN, sbRpcRow, sbInsert, sbDelete, pvpFinishVerified } from "../lib/supabaseClient.js";
import { createPortal } from "react-dom";
import { SITE_FONT } from "../components/engineLines.jsx";
import { Chess } from "chess.js";
import HUB_SCENES from "../data/hubScenes.json";
import { fx, buzz } from "../lib/minigameFx.js";
import RUSH_LEVELS from "../data/rushLevels.json";
import { knightGenRound, knightNeighbors as knightNeighborsClient, knightCatcherOf, knightDangerFor, knightOwnBlocked, knightApplyMove, knightSafeWalls, knightShortestPath as knightShortestPathLocal, knightDistance as knightDistanceLocal, knightJudge } from "../lib/knightRace.js";
import { rushParse, rushTargetsFrom, rushAttacked, rushApply } from "../lib/rushHour.js";
import { QCOLOR, BADGE_ICON_SRC } from "../lib/moveKinds.js";
import { LICHESS_API } from "../lib/lichessApi.js";
import { NavBtn } from "../components/uiPrimitives.jsx";
import { Board, COORD_GRID_CSS, COORD_NG_BG, COORD_OK_BG, CoinIcon, DEFAULT_TIME_CONTROL, END_FX_GAP_MS, EngineContext, FadeIn, GAME_END_COLOR, GAME_END_MS, GameEndFx, MINIGAME_PLACEMENT, MOVE_FX, MOVE_FX_MS, MgOppBadge, MinigamePrefsContext, MoveClassFx, ONLINE_WINDOW_MS, OnlineDot, PVP_GAME_TYPE, SkinShopCard, TIME_CONTROLS, VisualPrefsContext, fetchMinigameStats, fmtClock, fmtFull, friendEdges, gradeMoveKindConfirmed, inviteFailText, minigameBestFromServer, minigameBestLabel, minigameRecordText, presenceLabel, singleRecaptureCheck, timeControlFromKey, useNarrow, usePresenceMap, useRealtimeTable, usersProfiles } from "./common.jsx";

import { t, tx } from "../lib/i18n.js";
// (v0.5.5, 사용자 요청) 무한 체크메이트 게임의 수 등급 이펙트용 — 분석 탭 자유 탐색 채점(아래 LearnTab/리뷰의 grade)과 같은
// 규칙으로 탁월·유일·최선까지 가린다(MultiPV 2로 2순위와의 차이를 봐야 "유일한 수"를 알 수 있다). 빠른 게임이라 movetime을
// 짧게 잡고, 둔 수가 체크메이트면 둔 뒤 평가는 생략한다(엔진은 메이트 포지션에 수를 내지 못한다).
async function classifyMoveKindQuick(engine, fenRoot, prevSans, san, movetime = 700, slot) {
  if (!engine || engine.status !== "ready") return null;
  const col = plyIsWhite(prevSans.length, fenRoot ? fenRoot.turn : "w") ? "w" : "b";
  const cpOf = (x) => (x.mate != null ? (x.mate > 0 ? 1e5 : -1e5) : x.cp);
  const pvs = await engine.evaluateMulti(fenOfRoot(fenRoot, prevSans), MAX_SEARCH_DEPTH, 2, movetime, undefined, undefined, slot);
  const p0 = pvs && pvs[0], p1 = pvs && pvs[1];
  if (!p0) return null;
  const bestCp = cpOf(p0), secondCp = p1 ? cpOf(p1) : null;
  const bestSan = p0.uci ? uciToSan(boardOfRoot(fenRoot, prevSans), p0.uci, col) : null;
  const matched = !!bestSan && stripSuffix(bestSan) === stripSuffix(san);
  let ourCp;
  if (/#/.test(san)) ourCp = 1e5;
  else {
    const after = await engine.evaluate(fenOfRoot(fenRoot, [...prevSans, san]), MAX_SEARCH_DEPTH, undefined, movetime, slot);
    if (!after) return null;
    ourCp = -cpOf(after);
  }
  const loss = matched ? 0 : bestCp - ourCp;
  return gradeMoveKindConfirmed({
    loss, matched, bestCp, playedCp: ourCp, secondCp,
    priorSac: ownPriorMoveWasSacrifice(prevSans, col, fenRoot),
    singleRecapture: singleRecaptureCheck(prevSans, san, col, fenRoot), san,
  }, { fenRoot, prevSans, san, color: col, evaluate: (fen) => engine.evaluate(fen, MAX_SEARCH_DEPTH, undefined, movetime, slot) });
}
// (v0.4.5 기능, 사용자 요청) 매칭 대기 화면 궤도 아이콘용 — 방금 끝난 대국에서 내가 둔 수만 훑어
// 탁월한 수·실수·블런더 개수만 집계한다. classifyMoveKindDetailed와 같은 판정 규칙(tierOf·희생
// 판정)을 쓰지만, 전체 리뷰용이 아니라 화면 장식용이라 depth·movetime을 크게 낮추고(정확한 등급이
// 아니라 "대충 몇 개나 있었는지" 감만 잡으면 충분) 상대(봇/상대편) 수는 건너뛰어 절반만 계산한다.
// "유일한 수"는 2순위 후보(MultiPV)까지 함께 평가해야 판정 가능해 평가 횟수가 배로 늘어나므로,
// 이 가벼운 버전에서는 집계하지 않는다(궤도 풀의 기본 채움 자리로만 처리됨). isCancelled()가 참을
// 반환하면 그 자리에서 즉시 멈춘다(새 대국이 시작돼 이 계산이 더 이상 의미 없어졌을 때 곧장 포기해
// 엔진을 다음 대국과 다투게 하지 않기 위함).
async function classifyOwnMovesFast(sans, fenRoot, myColor, engine, isCancelled) {
  const counts = { brilliant: 0, mistake: 0, blunder: 0 };
  if (!engine || !sans || !sans.length) return counts;
  const startColor = fenRoot ? fenRoot.turn : "w";
  for (let i = 0; i < sans.length; i++) {
    if (isCancelled && isCancelled()) break;
    const color = plyIsWhite(i, startColor) ? "w" : "b";
    if (color !== myColor) continue;
    const prevSans = sans.slice(0, i);
    const san = sans[i];
    try {
      const best = await engine.evaluate(fenOfRoot(fenRoot, prevSans), 10, undefined, 300);
      if (!best || (isCancelled && isCancelled())) continue;
      const bestCp = best.mate != null ? (best.mate > 0 ? 1e5 : -1e5) : best.cp;
      const bestSan = best.best ? uciToSan(boardOfRoot(fenRoot, prevSans), best.best, color) : null;
      const matched = !!bestSan && stripSuffix(bestSan) === stripSuffix(san);
      const after = await engine.evaluate(fenOfRoot(fenRoot, [...prevSans, san]), 10, undefined, 300);
      if (!after) continue;
      const afterOpp = after.mate != null ? (after.mate > 0 ? 1e5 : -1e5) : after.cp;
      const ourCp = -afterOpp;
      const loss = matched ? 0 : bestCp - ourCp;
      const kind = await gradeMoveKindConfirmed({ loss, matched, bestCp, playedCp: ourCp, priorSac: ownPriorMoveWasSacrifice(prevSans, color, fenRoot), san }, { fenRoot, prevSans, san, color, evaluate: (fen) => engine.evaluate(fen, 10, undefined, 300) });
      if (kind === "brilliant") counts.brilliant++;
      else if (kind === "mistake") counts.mistake++;
      else if (kind === "blunder") counts.blunder++;
    } catch { }
  }
  return counts;
}
const TIME_CONTROL_CATS = [t("불렛"), t("블리츠"), t("래피드"), t("스탠다드")];
const PLAY_BOT_TIERS = [
  { elo: 400, label: "400", desc: t("체스를 막 배운 친구") },
  { elo: 800, label: "800", desc: t("초보") },
  { elo: 1200, label: "1200", desc: t("아마추어") },
  { elo: 1600, label: "1600", desc: t("클럽 플레이어") },
  { elo: 2000, label: "2000", desc: t("상급자") },
  { elo: 2400, label: "2400", desc: t("마스터") },
  { elo: 2800, label: "2800", desc: t("그랜드마스터") },
];
// (버그 수정, 사용자 제보) 2800 봇이 너무 나쁜 수를 자주 뒀다 — 예전엔 온도가 레이팅에 선형으로만
// 줄어들어(elo 2800에서도 T=8), cp 손실이 30~40 정도인 후보도 꽤 자주 골라졌다. 400(T=220)~2800(T=5)
// 사이를 지수적으로 보간해, 레이팅이 높아질수록 "약간 나쁜 수"를 급격히 덜 고르게 만든다(cp 손실이
// 큰 후보는 사실상 배제되고, 거의 동등한 후보끼리만 남는다) — 그랜드마스터 등급에 걸맞게.
function botTemperature(elo) {
  const t = Math.max(0, Math.min(1, (elo - 400) / 2400));
  const T0 = 220, T1 = 5;
  return T0 * Math.pow(T1 / T0, t);
}
function botSearchParams(elo) {
  // 레이팅이 높을수록 더 깊이·오래 탐색해 후보 목록 자체의 질도 함께 좋아진다.
  const depth = Math.max(8, Math.min(20, Math.round(8 + elo / 220)));
  const movetime = Math.max(400, Math.min(1800, Math.round(400 + elo / 2.5)));
  return { depth, movetime };
}
// (사용자 요청) 봇도 응수하기까지 최소한의 "생각하는 시간"을 갖도록 — 엔진 탐색 자체가 이미 걸리는
// 시간과 별개로, 레이팅이 높을수록 조금 더 오래 고민하는 것처럼 느껴지도록 하한을 둔다.
function botThinkDelayMs(elo) {
  return Math.round(600 + Math.max(0, Math.min(1, elo / 2800)) * 1600); // 600ms(400) ~ 2200ms(2800)
}
// (버그 수정, 사용자 제보) 같은 포지션을 다시 만나면(반복 수순 등) 매번 똑같은 수만 고르는 경향이
// 있었다 — moveMemory(이 대국 안에서 "이 FEN에서 이미 골랐던 수"를 세는 Map<fen, Map<uci, count>>)를
// 받아, 이미 골랐던 적 있는 후보는 고를 때마다 가중치를 큰 폭으로 깎는다(전혀 못 고르게 막지는 않고,
// 다른 대안이 없으면 여전히 고를 수 있다 — 외길 수순까지 막지 않기 위해서다).
async function pickBotMove(engine, fen, elo, moveMemory) {
  const { depth, movetime } = botSearchParams(elo);
  const lines = await engine.evaluateMulti(fen, depth, 5, movetime, undefined, undefined, "play-bot");
  if (!lines || !lines.length) return null;
  const scored = lines.map((l) => ({ uci: l.uci, cp: l.mate != null ? (l.mate > 0 ? 100000 - l.mate : -100000 - l.mate) : (l.cp || 0) }));
  const best = Math.max(...scored.map((s) => s.cp));
  const T = botTemperature(elo);
  const usedHere = moveMemory ? moveMemory.get(fen) : null;
  const weights = scored.map((s) => {
    let w = Math.exp(-(best - s.cp) / T);
    const times = usedHere ? (usedHere.get(s.uci) || 0) : 0;
    if (times > 0) w *= Math.pow(0.12, times);
    return w;
  });
  const total = weights.reduce((a, b) => a + b, 0) || 1;
  let r = Math.random() * total;
  let chosen = scored[scored.length - 1].uci;
  for (let i = 0; i < scored.length; i++) { r -= weights[i]; if (r <= 0) { chosen = scored[i].uci; break; } }
  if (moveMemory) {
    if (!moveMemory.has(fen)) moveMemory.set(fen, new Map());
    const m = moveMemory.get(fen);
    m.set(chosen, (m.get(chosen) || 0) + 1);
  }
  return chosen;
}
// (v0.4.5 기능, 사용자 요청) 매칭 대기 화면 궤도 아이콘 풀 — 기본값은 "무난하게 잘 둔 대국"다운
// 구성(최선의 수·우수한 수·좋은 수 위주, 부정확한 수 한 개)으로 항상 채워 두고, 그 위에 직전 대국에서
// 실제로 나온 탁월한 수·실수·블런더 개수만 있는 그대로 얹는다(화면이 너무 붐비지 않도록 각 항목 상한만
// 둔다) — "유일한 수"는 classifyOwnMovesFast가 집계하지 않으므로(주석 참고) 항상 기본값의 빈자리로만
// 존재한다.
const ORBIT_DEFAULT_POOL = { best: 4, excellent: 3, good: 2, inaccuracy: 1 };
function buildOrbitPool(counts) {
  const pool = { ...ORBIT_DEFAULT_POOL };
  if (counts) {
    if (counts.brilliant) pool.brilliant = Math.min(counts.brilliant, 4);
    if (counts.mistake) pool.mistake = Math.min(counts.mistake, 3);
    if (counts.blunder) pool.blunder = Math.min(counts.blunder, 3);
  }
  const items = [];
  Object.entries(pool).forEach(([kind, n]) => { for (let i = 0; i < n; i++) items.push(kind); });
  return items;
}
// (버그 수정, 사용자 제보) 처음엔 prefers-reduced-motion이 켜진 브라우저에서 이 rAF 루프 자체를
// 아예 돌리지 않게 했었다 — 그런데 실제로 이 사용자의 브라우저가 그 설정이 켜져 있었고(콘솔에서
// window.matchMedia("(prefers-reduced-motion: reduce)").matches로 직접 확인), 정작 원하는 건
// 이 궤도 애니메이션이 보이는 것이었다. 큰 화면 전체가 흔들리거나 시야를 채우는 모션(어지럼을 유발할
// 수 있는 종류)이 아니라 좁은 영역 안에서 도는 작은 장식 아이콘 몇 개뿐이라, 이 애니메이션은 그
// 설정과 무관하게 항상 재생하기로 하고 그 게이팅 자체를 없앴다(아래 usePrefersReducedMotion도 함께
// 제거). 다만 애니메이션이 원인이 아니었더라도(예: 다른 문제로 rAF 자체가 멈추는 경우) 아이콘들이
// transform을 한 번도 못 받아 CSS 기본값(그냥 left:50%/top:50%, 즉 중앙 한 점)에 전부 겹쳐 쌓인 채
// 멈춰 보이는 문제 자체는 남아있을 수 있어, orbitFrame을 렌더 시점(t=0)에도 그대로 한 번 계산해 각
// 아이콘의 초기 style에 넣어 둔다 — 최소한 궤도 위에 제대로 퍼진 모습으로 시작한다.
// 궤도 아이콘 하나의 위치·크기·불투명도·쌓임 순서를 시각 t(초)에서 계산 — rAF 루프와 최초 렌더(정지
// 프레임) 양쪽에서 똑같이 쓴다.
function orbitFrame(it, t) {
  const theta = it.phase + t * it.speed;
  const x = Math.cos(theta) * it.ring.rx;
  const y = Math.sin(theta) * it.ring.ry;
  const depth = (Math.sin(theta) + 1) / 2; // 0(뒤)~1(앞)
  const scale = 0.62 + depth * 0.6;
  const cyc = (((t / it.cycleDur + it.cyclePhase) % 1) + 1) % 1; // 0~1 반복
  const fade = cyc < 0.08 ? cyc / 0.08 : cyc < 0.62 ? 1 : cyc < 0.72 ? 1 - (cyc - 0.62) / 0.1 : 0;
  const opacity = Math.max(0, Math.min(1, fade)) * (0.45 + depth * 0.55);
  return {
    transform: "translate(-50%,-50%) translate(" + x.toFixed(1) + "px," + y.toFixed(1) + "px) scale(" + scale.toFixed(3) + ")",
    opacity: opacity.toFixed(3),
    zIndex: Math.round(depth * 100) + 10,
  };
}
// (v0.4.5 기능, 사용자 요청) 매칭 대기 화면의 궤도 애니메이션 — 반지름이 다른 3개의 얇은 타원 궤적
// 위를 chess.com 스타일 수 체계 아이콘들이 실제 천체처럼 공전한다. 아이콘이 많아질 수 있어 React
// state가 아니라 requestAnimationFrame에서 DOM 스타일을 직접 갱신한다(리렌더 없이 매 프레임 갱신 —
// 아이콘 수가 늘어나도 가볍다). 각 아이콘은:
//   · 자기 궤도를 계속 돈다 — 안쪽 궤도일수록 더 빨리 돌게 해(각속도를 반지름의 -1.5제곱에 비례시킴)
//     "가까울수록 빠르다"는 케플러 궤도의 감각을 단순하게 흉내낸다.
//   · (버그 수정, 사용자 제보) 아이콘마다 공전 주기가 뚜렷하게 달라야 궤도가 여럿이라는 게 느껴진다는
//     제보를 받아, 같은 궤도 안에서도 속도 배율을 0.55배~1.85배까지(예전엔 0.85~1.15배로 거의 안 티가
//     났다) 크게 벌렸다 — 기준 각속도 자체도 훨씬 빠르게 올렸다(한 바퀴에 약 2~7초).
//   · 타원 위 위치(sin θ)를 그대로 "지금 앞쪽/뒤쪽 어디에 있는지"로 써서, 크기·불투명도·쌓임 순서
//     (z-index)를 위치 변화와 항상 정확히 같은 값에서 함께 계산한다 — 앞쪽에 있을 때 커지고 진해지고
//     다른 아이콘과 중앙 아바타 위로 올라온다.
//   · 저마다 다른 주기로 서서히 나타났다 사라지길 반복해(개별 아이콘의 페이드 인/아웃 duty cycle),
//     화면에 동시에 보이는 아이콘 개수 자체가 계속 바뀐다.
// 궤도 풀은 직전에 끝난 대국(가장 최근의 pvp/봇 대국)에서 classifyOwnMovesFast가 백그라운드로 계산해
// localStorage(occ_last_game_quality)에 저장해 둔 개수를 반영한다 — 아직 없으면(첫 대국이거나 계산이
// 안 끝났으면) buildOrbitPool의 기본값만으로 채워진다.
function OrbitingQualityIcons({ size = 288 }) {
  // (버그 수정, 사용자 제보) prefers-reduced-motion이 켜진 브라우저에서 이 애니메이션을 아예 끄고
  // 있었는데, 사용자가 실제로 그 설정이 켜져 있던 경우였다 — 정작 원하는 건 이 궤도 애니메이션이
  // 보이는 것이었다. 큰 화면 전체가 흔들리거나 시야를 채우는 모션(어지럼을 유발할 수 있는 종류)이
  // 아니라 좁은 영역 안에서 도는 작은 장식 아이콘 몇 개뿐이라, 이 요소만은 그 설정과 무관하게 항상
  // 재생한다(usePrefersReducedMotion 자체는 다른 곳에서 쓸 수 있게 남겨 두되 여기서는 더 이상
  // 부르지 않는다).
  const pool = useMemo(() => { const saved = loadLastGameQuality(); return buildOrbitPool(saved && saved.counts); }, []);
  const items = useMemo(() => {
    const rings = [
      { rx: size * 0.27, speed: 2.6 },
      { rx: size * 0.38, speed: 1.7 },
      { rx: size * 0.48, speed: 1.2 },
    ].map((r) => ({ ...r, ry: r.rx * 0.42 }));
    return pool.map((kind, i) => {
      const ring = rings[i % rings.length];
      const dir = (i % 2 === 0) ? 1 : -1;
      return {
        kind, ring,
        phase: ((i * 137.5) % 360) * (Math.PI / 180), // 황금각 간격 — 같은 궤도 안 아이콘들이 몰리지 않게
        speed: ring.speed * (0.55 + 1.3 * (((i * 53) % 17) / 17)) * dir,
        cycleDur: 9 + ((i * 29) % 13), // 초 — 아이콘마다 다른 등장/소멸 주기
        cyclePhase: ((i * 61) % 100) / 100,
      };
    });
  }, [pool, size]);
  // (버그 수정, 사용자 제보) 중앙 아바타 주변에서 반복되던 확장 원(framer-motion, 짧은 duration마다
  // scale/opacity가 처음 값으로 뚝 끊겨 되돌아감)이 "매끄럽게 퍼지는 전파"가 아니라 "깜빡인다"는
  // 인상을 줬다 — 루프가 다시 시작되는 순간 반지름·불투명도가 순간이동하듯 초기값으로 튀는 게 원인
  // (loop boundary "pop"). 아이콘과 같은 rAF 루프 안에서, sin 곡선으로 처음과 끝이 항상 0에서
  // 자연스럽게 만나는 반지름·불투명도를 직접 계산해 그리면(WAVE_RINGS) 튀는 지점 자체가 없다.
  const WAVE_RINGS = useMemo(() => [
    { period: 4.6, phase: 0, rMin: size * 0.125, rMax: size * 0.5, peakOpacity: 0.32 },
    { period: 4.6, phase: 2.3, rMin: size * 0.125, rMax: size * 0.5, peakOpacity: 0.32 },
  ], [size]);
  const elRefs = useRef([]);
  const waveRefs = useRef([]);
  useEffect(() => {
    if (!items.length) return;
    let raf;
    const start = performance.now();
    const tick = (now) => {
      const t = (now - start) / 1000;
      items.forEach((it, i) => {
        const el = elRefs.current[i];
        if (!el) return;
        const f = orbitFrame(it, t);
        el.style.transform = f.transform;
        el.style.opacity = f.opacity;
        el.style.zIndex = String(f.zIndex);
      });
      WAVE_RINGS.forEach((w, i) => {
        const el = waveRefs.current[i];
        if (!el) return;
        const cyc = (((t + w.phase) / w.period) % 1 + 1) % 1; // 0~1, 항상 0에서 시작해 0에서 끝남
        const r = w.rMin + (w.rMax - w.rMin) * cyc;
        const opacity = Math.sin(Math.PI * cyc) * w.peakOpacity; // 양 끝이 정확히 0 — 튀는 지점 없음
        el.setAttribute("r", r.toFixed(1));
        el.setAttribute("opacity", opacity.toFixed(3));
      });
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [items, WAVE_RINGS]);
  if (!items.length) return null;
  return (
    <div style={{ position: "absolute", inset: 0, pointerEvents: "none" }}>
      <svg width="100%" height="100%" viewBox={"0 0 " + size + " " + size} style={{ position: "absolute", inset: 0 }}>
        <g transform={"translate(" + size / 2 + "," + size / 2 + ")"}>
          {WAVE_RINGS.map((w, i) => (
            <circle key={"wave" + i} ref={(el) => { waveRefs.current[i] = el; }} r={w.rMin} fill="none" stroke={T.brassHi} strokeWidth={1} opacity={0} />
          ))}
        </g>
      </svg>
      <svg width="100%" height="100%" viewBox={"0 0 " + size + " " + size} style={{ position: "absolute", inset: 0, transform: "rotate(-8deg)" }}>
        <g transform={"translate(" + size / 2 + "," + size / 2 + ")"}>
          {[0.27, 0.38, 0.48].map((f) => (
            <ellipse key={f} rx={size * f} ry={size * f * 0.42} fill="none" stroke={T.brassHi} strokeWidth={1.4} opacity={0.5} />
          ))}
        </g>
      </svg>
      <div style={{ position: "absolute", inset: 0, transform: "rotate(-8deg)" }}>
        {items.map((it, i) => {
          const f0 = orbitFrame(it, 0);
          return (
            <div key={i} ref={(el) => { elRefs.current[i] = el; }}
              style={{ position: "absolute", left: "50%", top: "50%", width: 22, height: 22, willChange: "transform, opacity", transform: f0.transform, opacity: f0.opacity, zIndex: f0.zIndex }}>
              <div style={{ transform: "rotate(8deg)" }}>{badgeIcon(it.kind, 22)}</div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
// (v0.4.4 리디자인, 사용자 요청) 실시간 대국 매칭 대기(랜덤 매칭 대기열, 친구 초대 응답 대기) —
// 설정 카드 안의 자그마한 인라인 블록 대신, 그 카드를 통째로 대체하는 별도의 전용 화면으로
// 승격시켰다. "찾는 대상"(랜덤 상대는 나이트 기물, 친구 초대는 그 친구의 아바타)을 무대 중앙에 두고
// framer-motion으로 계속 숨 쉬듯 움직이게 해(원의 팽창·기물의 상하 유영·가장자리를 도는 입자)
// "가만히 멈춰 있는 로딩 화면"이 아니라 "지금도 상대를 찾고 있다"는 감각을 준다. active가 꺼지면
// (매칭 성사·취소) elapsed는 자동으로 0으로 리셋된다.
function MatchmakingScreen({ active, variant, opponent, timeControlLabel, onCancel }) {
  const [elapsed, setElapsed] = useState(0);
  useEffect(() => {
    if (!active) { setElapsed(0); return; }
    const start = Date.now();
    setElapsed(0);
    const id = setInterval(() => setElapsed(Math.floor((Date.now() - start) / 1000)), 1000);
    return () => clearInterval(id);
  }, [active]);
  const isInvite = variant === "invite";
  const oppName = (opponent && opponent.name) || t("상대");
  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.97 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.97 }}
      transition={{ duration: 0.32, ease: MOTION_EASE }}
      style={{ minHeight: "min(72vh, 560px)", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "24px 16px" }}
    >
      {/* (v0.4.5 리디자인, 사용자 요청) 3개의 작은 궤도 점 대신, 직전 대국의 수 체계(탁월한 수·실수·
          블런더 등)를 반영한 chess.com 스타일 아이콘들이 실제 천체처럼 얇은 타원 궤적을 따라 도는
          장면으로 발전시켰다 — OrbitingQualityIcons 정의부 주석 참고. */}
      <div style={{ position: "relative", width: 288, height: 288, marginBottom: 10 }}>
        {/* (버그 수정, 사용자 제보) 예전엔 여기서 framer-motion으로 확장 원을 반복시켰는데, 루프가
            다시 시작될 때마다 반지름·불투명도가 초기값으로 순간이동해 "깜빡인다"는 인상을 줬다 —
            OrbitingQualityIcons 안으로 옮겨 아이콘과 같은 rAF 루프에서 sin 곡선으로(양 끝이 항상
            0에서 자연스럽게 만나도록) 그리는 전파 효과로 바꿨다(WAVE_RINGS 주석 참고). */}
        <OrbitingQualityIcons size={288} />
        <motion.div
          animate={{ y: [0, -6, 0] }} transition={{ duration: 2.6, repeat: Infinity, ease: "easeInOut" }}
          style={{ position: "absolute", inset: 108, borderRadius: "50%", background: "linear-gradient(180deg,#3A2516,#241509)", border: "1px solid " + T.brass, display: "flex", alignItems: "center", justifyContent: "center", boxShadow: "0 8px 22px -6px rgba(0,0,0,.6), inset 0 1px 2px rgba(255,255,255,.55)", zIndex: 200 }}
        >
          {isInvite ? (
            opponent && opponent.photo ? <img src={opponent.photo} alt="" style={{ width: 74, height: 74, borderRadius: "50%", objectFit: "cover" }} />
              : <span style={{ fontSize: 30, fontWeight: 800, color: T.brassHi }}>{oppName[0].toUpperCase()}</span>
          ) : <PieceGlyph type="N" color="w" size={58} />}
        </motion.div>
      </div>
      <div style={{ fontSize: 14.5, fontWeight: 800, color: T.ink, marginBottom: 5, textAlign: "center" }}>
        {isInvite ? t("@{0}님의 응답을 기다리는 중", oppName) : t("상대를 찾는 중")}
      </div>
      {timeControlLabel && <div style={{ fontSize: 11.5, fontWeight: 700, color: "rgba(90,58,34,.65)", marginBottom: 14 }}>{timeControlLabel}</div>}
      <div style={{ fontSize: 22, fontWeight: 800, color: T.brassHi, fontFamily: "ui-monospace,monospace", letterSpacing: ".02em", marginBottom: 22 }}>{fmtClock(elapsed * 1000)}</div>
      <button onClick={onCancel} className="press" style={{ padding: "10px 26px", borderRadius: 10, border: "1px solid rgba(196,154,80,.55)", background: "transparent", color: T.ink, fontWeight: 800, fontSize: 13, cursor: "pointer" }}>{t("취소")}</button>
    </motion.div>
  );
}
// (v0.4.4 기능, 사용자 요청) 대국이 끝나면(승/패/무) chess.com 종료 팝업을 참고해 결과를 정리해
// 보여준다 — 다만 OpenChess에는 chess.com 같은 실시간 레이팅·랭킹 집계가 없으므로, 없는 숫자를
// 지어내는 대신 실제로 갖고 있는 정보(결과·사유·상대·타임 컨트롤)만으로 같은 무게감의 화면을
// 구성한다. 코치 마스코트 말풍선이 chess.com 쪽의 호스트 코멘터리 자리를 대신한다.
function playResultCopy(result, activeColor) {
  if (!result) return null;
  if (result.end === "checkmate") {
    const won = result.color !== activeColor;
    return won
      ? { kind: "win", title: t("승리"), subtitle: t("체크메이트"), mascot: "kokoa", emotion: "celebrate" }
      : { kind: "loss", title: t("패배"), subtitle: t("체크메이트"), mascot: "milku", emotion: "sad" };
  }
  if (result.end === "resign") return { kind: "loss", title: t("패배"), subtitle: t("기권"), mascot: "milku", emotion: "sad" };
  if (result.end === "flag") {
    const won = result.color !== activeColor;
    return won
      ? { kind: "win", title: t("승리"), subtitle: t("시간 초과"), mascot: "kokoa", emotion: "celebrate" }
      : { kind: "loss", title: t("패배"), subtitle: t("시간 초과"), mascot: "milku", emotion: "sad" };
  }
  if (result.end === "pvp") {
    if (result.status === "draw") return { kind: "draw", title: t("무승부"), subtitle: t("합의된 결과"), mascot: "milku", emotion: "think" };
    if (result.status === "aborted") return { kind: "draw", title: t("대국 중단"), subtitle: "", mascot: "milku", emotion: "think" };
    const won = (result.status === "white_won" && activeColor === "w") || (result.status === "black_won" && activeColor === "b");
    return won
      ? { kind: "win", title: t("승리"), subtitle: t("상대의 기권"), mascot: "kokoa", emotion: "celebrate" }
      : { kind: "loss", title: t("패배"), subtitle: t("상대의 승리"), mascot: "milku", emotion: "sad" };
  }
  if (result.end === "stalemate") return { kind: "draw", title: t("무승부"), subtitle: t("스테일메이트"), mascot: "milku", emotion: "think" };
  return { kind: "draw", title: t("무승부"), subtitle: t("3회 동형 반복"), mascot: "milku", emotion: "think" };
}
function PlayResultModal({ result, activeColor, mode, botTier, opponentPub, myPhoto, myName, oppName, timeControl, onClose, onReview, onRematch, rematchOfferedByMe, rematchOfferedByOpp }) {
  const copy = playResultCopy(result, activeColor);
  if (!copy) return null;
  const kindColor = copy.kind === "win" ? T.best : copy.kind === "loss" ? T.blunder : T.brassHi;
  const checker = "repeating-conic-gradient(" + T.boardDark + " 0% 25%, " + T.boardLight + " 0% 50%) 0 0/36px 36px";
  return (
    <div onClick={onClose} style={{ position: "fixed", inset: 0, zIndex: 500, background: "rgba(10,6,3,.68)", display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}>
      <motion.div onClick={(e) => e.stopPropagation()}
        initial={{ opacity: 0, y: 18, scale: 0.96 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: 12, scale: 0.97 }}
        transition={{ type: "spring", stiffness: 320, damping: 26 }}
        style={{ width: "100%", maxWidth: 360, borderRadius: 16, overflow: "hidden", background: T.paper, border: "1px solid #DCCBA8", boxShadow: "0 24px 60px -14px rgba(0,0,0,.7)" }}>
        <div style={{ position: "relative", background: checker, padding: "20px 16px 16px", textAlign: "center" }}>
          <div style={{ position: "absolute", inset: 0, background: "linear-gradient(180deg, rgba(20,12,6,.15), rgba(20,12,6,.55))" }} />
          <button onClick={onClose} aria-label={t("닫기")} className="press" style={{ position: "absolute", top: 10, right: 10, zIndex: 2, width: 26, height: 26, borderRadius: 8, background: "rgba(20,12,6,.55)", color: "#fff", border: "1px solid rgba(255,255,255,.25)", cursor: "pointer", display: "inline-flex", alignItems: "center", justifyContent: "center" }}><X size={14} /></button>
          <div style={{ position: "relative", zIndex: 1 }}>
            <div style={{ fontSize: 26, fontWeight: 800, color: "#fff", letterSpacing: "-.01em", textShadow: "0 2px 6px rgba(0,0,0,.5)" }}>{copy.title}</div>
            {copy.subtitle && <div style={{ fontSize: 12, fontWeight: 700, color: "rgba(255,255,255,.85)", marginTop: 2 }}>{copy.subtitle}</div>}
          </div>
        </div>
        <div style={{ padding: "16px 18px 18px" }}>
          <div className="flex items-center justify-center" style={{ gap: 14, marginBottom: 12 }}>
            <div style={{ textAlign: "center", minWidth: 0 }}>
              {mode === "pvp" && opponentPub && opponentPub.photo ? <img src={opponentPub.photo} alt="" style={{ width: 46, height: 46, borderRadius: 12, objectFit: "cover", border: "2px solid " + (copy.kind === "loss" ? T.best : "#C9B58C") }} />
                : mode === "pvp" ? <span style={{ width: 46, height: 46, borderRadius: 12, background: "linear-gradient(180deg," + T.brass + ",#A8842F)", color: "#241509", display: "inline-flex", alignItems: "center", justifyContent: "center", fontWeight: 800, fontSize: 18, border: "2px solid " + (copy.kind === "loss" ? T.best : "#C9B58C") }}>{(oppName || "?")[0].toUpperCase()}</span>
                : <span style={{ width: 46, height: 46, borderRadius: 12, background: "#EDE1C6", color: T.inkSoft, display: "inline-flex", alignItems: "center", justifyContent: "center", border: "2px solid " + (copy.kind === "loss" ? T.best : "#C9B58C") }}><Cpu size={20} /></span>}
              <div style={{ fontSize: 10.5, fontWeight: 800, color: T.ink, marginTop: 5, maxWidth: 90, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{mode === "pvp" ? (oppName || t("상대")) : botTier.label}</div>
            </div>
            <span style={{ fontSize: 12, fontWeight: 800, color: T.inkSoft }}>VS</span>
            <div style={{ textAlign: "center", minWidth: 0 }}>
              {myPhoto ? <img src={myPhoto} alt="" style={{ width: 46, height: 46, borderRadius: 12, objectFit: "cover", border: "2px solid " + (copy.kind === "win" ? T.best : "#C9B58C") }} />
                : <span style={{ width: 46, height: 46, borderRadius: 12, background: "linear-gradient(180deg," + T.brass + ",#A8842F)", color: "#241509", display: "inline-flex", alignItems: "center", justifyContent: "center", fontWeight: 800, fontSize: 18, border: "2px solid " + (copy.kind === "win" ? T.best : "#C9B58C") }}>{(myName || "U")[0].toUpperCase()}</span>}
              <div style={{ fontSize: 10.5, fontWeight: 800, color: T.ink, marginTop: 5, maxWidth: 90, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{myName || "Unnamed"}</div>
            </div>
          </div>
          {timeControl && <div style={{ textAlign: "center", fontSize: 11, fontWeight: 700, color: T.inkSoft, marginBottom: 14 }}>{timeControl.label}{timeControl.cat ? " · " + timeControl.cat : ""}</div>}
          {/* (리디자인, 사용자 요청) 예전엔 재대결·닫기 아래 버튼들과 마찬가지로 금색(T.brass) 계열이라,
              "이 버튼을 누르면 다른 화면(리뷰)으로 넘어간다"는 신호가 색만 봐서는 드러나지 않았다 —
              리뷰 기능 자체를 상징하는 색(T.best, "최선의 수" 등급에 쓰이는 연두색)과 흰색 별 아이콘을
              그대로 가져와, 이 버튼이 대국 결과 팝업이 아니라 리뷰 기능으로 이어진다는 걸 색만으로도
              알 수 있게 한다. 레이아웃(패딩·radius·굵기)은 아래 재대결/닫기 버튼과 동일하게 유지. */}
          {onReview && <button onClick={onReview} className="press" style={{ width: "100%", padding: "12px 0", borderRadius: 10, border: "none", background: "linear-gradient(180deg," + T.best + ",#2C5A29)", color: "#fff", fontWeight: 800, fontSize: 14, cursor: "pointer", marginBottom: 8, display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 8 }}>{tx("{0}대국 리뷰 보기", <Star size={15} fill="#fff" color="#fff" />)}</button>}
          <div className="flex gap-2">
            {/* (사용자 요청) 봇 대국은 눌러면 곧장 같은 조건으로 재시작한다. 실시간 대국은 상대에게
                제안을 보내야 하므로, 내가 이미 보내 응답을 기다리는 중이면 취소(재클릭으로 토글)로,
                상대가 먼저 보내 뒀으면 "수락"으로 라벨이 바뀐다 — onRematch 하나가 서버 쪽에서
                제안/수락을 함께 처리하므로(pvp_rematch_offer) 클릭 핸들러 자체는 항상 그대로다. */}
            <button onClick={rematchOfferedByMe ? onClose : onRematch} className="press" disabled={rematchOfferedByMe} style={{ flex: 1, padding: "10px 0", borderRadius: 10, border: "1px solid " + T.brass, background: rematchOfferedByMe ? "rgba(196,154,80,.05)" : "rgba(196,154,80,.12)", color: rematchOfferedByMe ? T.inkSoft : T.ink, fontWeight: 800, fontSize: 12.5, cursor: rematchOfferedByMe ? "default" : "pointer" }}>
              {mode !== "pvp" ? t("재대결") : rematchOfferedByMe ? t("상대 응답 기다리는 중…") : rematchOfferedByOpp ? t("재대결 수락") : t("재대결 신청")}
            </button>
            <button onClick={onClose} className="press" style={{ flex: 1, padding: "10px 0", borderRadius: 10, border: "1px solid #C9B58C", background: "transparent", color: T.inkSoft, fontWeight: 800, fontSize: 12.5, cursor: "pointer" }}>{t("닫기")}</button>
          </div>
        </div>
      </motion.div>
    </div>
  );
}
// (v0.5.0 기능, 사용자 요청) 미니게임의 "친구와 플레이하기" — 체스 PvP(PlayPage)의 친구 로스터와
// 완전히 같은 데이터·동작(친구 목록 조회·접속 상태순 정렬·도전장 발송/취소·상대 응답 실시간 감시)을
// 그대로 재사용하도록 그 로직만 훅으로 뽑아냈다. 체스 쪽 PlayPage의 기존 인라인 구현은 잘 동작하고
// 있어 그대로 두고, 이 훅은 미니게임 두 개(좌표 인지 게임·나이트 경주)가 함께 쓴다 — p_game_type만
// 다르게 넘기면 pvp_invite_friend/pvp_invite_respond/pvp_invite_cancel이 기존 체스 대국과 똑같이
// 동작한다(둘 다 애초에 game_type을 몰라도 되게 일반화돼 있다).
function useFriendPvpInvite({ myUid, gameType, onMatched }) {
  const [friendList, setFriendList] = useState([]);
  const [myInvite, setMyInvite] = useState(null);
  const [err, setErr] = useState("");
  useEffect(() => {
    if (!myUid) { setFriendList([]); return; }
    let cancelled = false;
    (async () => {
      const edges = await friendEdges();
      const ids = edges.filter((e) => e.status === "accepted").map((e) => (e.from_uid === myUid ? e.to_uid : e.from_uid));
      if (!ids.length) { if (!cancelled) setFriendList([]); return; }
      const profiles = await usersProfiles(ids);
      if (!cancelled) setFriendList(ids.map((uid) => ({ uid, username: (profiles[uid] || {}).username, pub: (profiles[uid] || {}).pub || {} })));
    })();
    return () => { cancelled = true; };
  }, [myUid]);
  const friendPresence = usePresenceMap(friendList.map((f) => f.uid));
  const sortedFriendList = useMemo(() => {
    const withMeta = friendList.map((f) => {
      const lastSeenMs = friendPresence[f.uid] || 0;
      const online = !!lastSeenMs && (Date.now() - lastSeenMs) < ONLINE_WINDOW_MS;
      const xp = f.pub.xp || 0;
      return { ...f, lastSeenMs, online, xp, tierIndex: tierFromXp(xp).tierIndex };
    });
    withMeta.sort((a, b) => {
      if (a.online !== b.online) return a.online ? -1 : 1;
      if (a.online && b.online) { if (b.tierIndex !== a.tierIndex) return b.tierIndex - a.tierIndex; if (b.xp !== a.xp) return b.xp - a.xp; }
      return (b.lastSeenMs || 0) - (a.lastSeenMs || 0);
    });
    return withMeta;
  }, [friendList, friendPresence]);
  const sendInvite = async (f) => {
    if (!myUid) return;
    setErr("");
    try {
      const inv = await sbRpc("pvp_invite_friend", { p_to_uid: f.uid, p_time_control: "0-0", p_game_type: gameType });
      setMyInvite({ ...inv, toUsername: f.pub.nickname || f.username, toPhoto: f.pub.photo || null });
    } catch (e) { setErr(inviteFailText(e, t("도전장"))); }
  };
  const cancelInvite = async () => {
    if (!myInvite) return;
    try { await sbRpc("pvp_invite_cancel", { p_invite_id: myInvite.id }); } catch { }
    setMyInvite(null);
  };
  useRealtimeTable("pvp_invites", myInvite ? "id=eq." + myInvite.id : null, async (payload) => {
    let row = payload && payload.new;
    if (!row && myInvite) { try { const rows = await sbSelect("pvp_invites?id=eq." + myInvite.id + "&select=*"); row = rows && rows[0]; } catch { } }
    if (!row) return;
    if (row.status === "accepted" && row.game_id) {
      const rows = await sbSelect("pvp_games?id=eq." + row.game_id + "&select=*");
      if (rows && rows[0]) { setMyInvite(null); onMatched(rows[0]); }
    } else if (row.status === "declined") { setMyInvite(null); setErr(t("상대가 도전장 거절")); }
    else if (row.status === "cancelled") { setMyInvite(null); }
  }, !!myInvite, 4000);
  return { friendList: sortedFriendList, myInvite, sendInvite, cancelInvite, err };
}
// 친구 로스터 UI — 체스 PvP 설정 화면의 "친구와 플레이하기" 목록과 똑같은 마크업·동작을 미니게임
// 설정 화면에서도 그대로 쓴다.
// lobby: (v0.5.6) 미니게임 준비 화면용 — 제목을 준비 화면의 섹션 제목 모양으로, 목록 상자를 준비 화면 카드 모양으로 그린다.
function FriendPvpRoster({ myUid, friendList, myInvite, onInvite, onOpenProfile, lobby }) {
  const boxRadius = lobby ? 14 : 10;
  return (
    <div>
      {lobby ? <MgLobbyLabel>{t("친구와 플레이하기")}</MgLobbyLabel> : (
        <div className="flex items-center gap-2" style={{ marginBottom: 8 }}>
          <User size={14} color={T.brass} />
          <span style={{ fontSize: 12.5, fontWeight: 800, color: T.ink }}>{t("친구와 플레이하기")}</span>
        </div>
      )}
      {!myUid ? (
        <div style={{ padding: "16px 10px", borderRadius: boxRadius, border: "1px dashed " + (lobby ? "rgba(150,112,58,.35)" : "#C9B58C"), fontSize: 12, color: T.inkSoft, textAlign: "center" }}>{t("로그인 후 이용 가능")}</div>
      ) : (
        <div style={{ border: "1px solid " + (lobby ? MG_LOBBY_LINE : "#DCCBA8"), borderRadius: boxRadius, maxHeight: 280, overflowY: "auto", background: lobby ? MG_LOBBY_CARD : "rgba(255,255,255,.4)" }}>
          {friendList.length === 0 ? (
            <div style={{ padding: "16px 10px", fontSize: 12, color: T.inkSoft, textAlign: "center" }}>{t("플레이할 친구 없음")}</div>
          ) : friendList.map((f, i) => (
            <motion.div key={f.uid} layout="position"
              initial={{ opacity: 0, x: -8 }} animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.28, delay: Math.min(i, 8) * 0.045, ease: MOTION_EASE }}
              whileHover={{ backgroundColor: "rgba(196,154,80,.1)" }}
              style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 10px", borderTop: i ? "1px solid rgba(0,0,0,.07)" : "none" }}>
              <button onClick={() => onOpenProfile && onOpenProfile(f.username)} className="press" style={{ display: "flex", alignItems: "center", gap: 8, flex: 1, minWidth: 0, background: "transparent", border: "none", cursor: "pointer", textAlign: "left", padding: 0 }}>
                <span style={{ position: "relative", flexShrink: 0, display: "inline-flex" }}>
                  {f.pub.photo ? <img src={f.pub.photo} alt="" style={{ width: 28, height: 28, borderRadius: "50%", objectFit: "cover" }} />
                    : <span style={{ width: 28, height: 28, borderRadius: "50%", background: T.brass, color: "#241509", display: "inline-flex", alignItems: "center", justifyContent: "center", fontWeight: 800, fontSize: 12 }}>{(f.pub.nickname || f.username || "?")[0].toUpperCase()}</span>}
                  {f.online && <motion.span animate={{ scale: [1, 1.5], opacity: [0.7, 0] }} transition={{ duration: 1.6, repeat: Infinity, ease: "easeOut" }} style={{ position: "absolute", right: -1, bottom: -1, width: 8, height: 8, borderRadius: "50%", background: T.brilliant }} />}
                  <OnlineDot lastSeenMs={f.lastSeenMs} overlay size={8} />
                </span>
                <span style={{ minWidth: 0, flex: 1 }}>
                  <span style={{ display: "block", fontSize: 12.5, fontWeight: 800, color: T.ink, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{f.pub.nickname || f.username}</span>
                  <span style={{ display: "block", fontSize: 10, color: T.inkSoft }}>{presenceLabel(f.lastSeenMs) || t("오프라인")}</span>
                </span>
              </button>
              <button onClick={() => onInvite(f)} disabled={!!myInvite} className="press" style={{ flexShrink: 0, padding: "6px 13px", borderRadius: 8, border: "none", background: myInvite ? "rgba(196,154,80,.3)" : "linear-gradient(180deg," + T.brass + ",#A8842F)", color: "#241509", fontWeight: 800, fontSize: 11.5, cursor: myInvite ? "default" : "pointer" }}>{t("도전")}</button>
            </motion.div>
          ))}
        </div>
      )}
    </div>
  );
}
// ============================================================ 스페셜 미니게임 플랫폼 ============================================================
// (v0.5.5) 미니게임 화면을 크림색 계열로 밝게 바꾸면서, 옅은 금색(T.brassHi) 글자·아이콘은 밝은 배경에서 잘 안 보여 진한 금색을 쓴다.
const MG_GOLD = "#A97A2C";
// (v0.5.0 기능, 사용자 설계) 플레이 페이지 "스페셜" 토글 — 체스보드 위 오리지널 미니게임들을 모아
// 보여주는 자리. 사용자가 설계한 4개 미니게임은 전부 실시간 PvP라 "최고 기록·점수 보상" 같은 단일
// 플레이 개념이 없다 — 매칭·대전·종료·헤더를 게임 컴포넌트가 전부 직접 그린다(체스 PvP와 같은
// pvp_queue_join/leave 재사용 + 전용 RPC 세트 + pvp_games.sans에 게임별 상태 저장 패턴, 각 게임
// 섹션 주석 참고). 새 미니게임을 추가할 때 할 일은 그 규칙을 구현한 컴포넌트를 하나 만들고(props로
// { myUid, onExit }를 받는다) 아래 PLAY_SPECIAL_GAMES 배열에 항목 하나만 추가하면 된다 — 카드 목록
// 노출·클릭 진입·목록 복귀는 전부 자동으로 연결된다.
// (실제 파이프라인이 끝까지 동작하는지 증명하기 위해 만들었던 테스트용 예시 게임 "칸 반응속도"와
// 그 전용 단일 플레이 틀(MinigameShell/useMinigameBest)은 이제 실제 게임 두 개가 갖춰져 더 이상
// 필요하지 않아 걷어냈다.)
// gameType 값은 아래 COORD_GAME_TYPE/KNIGHT_GAME_TYPE 상수와 반드시 같아야 한다 — 이 배열이 그
// 상수들보다 먼저(모듈 로드 시점에) 평가되므로 상수 참조 대신 리터럴 문자열로 직접 적어 둔다.
export const PLAY_SPECIAL_GAMES = [
  { key: "coord-race", gameType: "coord", name: t("좌표 인지 게임"), desc: t("무작위 좌표가 뜨면 상대보다 먼저 그 칸 클릭. 실시간 대전"), Icon: Target, accent: T.brilliant, Component: CoordRaceGame },
  { key: "knight-race", gameType: "knight", name: t("나이트 레이스"), desc: t("나이트로 목표 칸에 먼저 도달. 7전 4선승, 라운드마다 방해 칸 증가"), Icon: Route, accent: T.only, Component: KnightRaceGame },
  // (v0.5.3 신규, 사용자 설계) 3호·4호 — 혼자 풀기(러시아워)·봇·실시간 PvP·친구 도전 모두 지원.
  { key: "rush-hour", gameType: "rush", name: t("백랭크 러시아워"), desc: t("엉킨 기물 사이에서 룩을 탈출시켜 백랭크 메이트. 비켜 주거나 희생으로 수비 기물 유인"), Icon: Puzzle, accent: "#B7793A", Component: RushHourGame, isNew: true },
  { key: "attack-mode", gameType: "attack", name: t("무한 체크메이트 게임"), desc: t("3분 동안 강제 메이트 기회를 더 많이 성공시키는 쪽 승리. 짧은 메이트일수록 높은 등급"), Icon: Swords, accent: "#C2453A", Component: AttackModeGame, isNew: true },
];
// (v0.5.1 리디자인, 사용자 요청) 미니게임을 Play 탭 안 좁은 카드 하나가 아니라 "별도의 화면"에서,
// 뷰포트 전체를 다 쓰며 플레이할 수 있게 한다 — 예전엔 사이트 헤더·하단 탭바가 항상 함께 보이는
// 좁은 스크롤 영역 안에 평범한 카드로 그려져, 내 보드·상대 보드를 세로로 쌓으면 필연적으로 스크롤이
// 필요했다. document.body로 포털한 뷰포트 전체 오버레이(다른 전체화면 오버레이, 예: 티어 로드맵과
// 같은 패턴 — createPortal이 어떤 조상의 transform과도 무관하게 항상 실제 뷰포트 기준 최상단에
// 그리도록 해 준다)로 바꿔 사이트 헤더·하단 탭바를 가리고, 그 안에서 실제 대전 화면(noScroll)은
// flexbox로 뷰포트 높이를 정확히 나눠 써 스크롤 없이 두 보드가 항상 한 화면에 다 보이게 한다(아래
// useSquareFit 참고). 로비·매칭 대기·결과 화면은 내용 길이가 가변적이라(친구 목록 등) 그대로
// 스크롤을 허용한다.
// (v0.5.6, 사용자 요청) 미니게임 보드 드래그 무브 — 나이트 레이스·백랭크 러시아워·무한 체크메이트 게임의 보드(칸마다 버튼인 8×8
// 격자)에 분석 탭 Board와 같은 방식(Pointer Events, 마우스·터치·펜 공통)의 끌어 놓기를 붙인다. 탭으로 선택 → 탭으로 목적지도
// 그대로 된다. 격자 요소에 bind를 펼쳐 붙이고(스타일에 touchAction: "none"도 — 끄는 동안 화면이 스크롤되지 않게), 칸 키(보드마다 "e4" 또는 0~63)는 cellAt(화면 줄, 화면 열)이 정한다.
//   canDrag(key)      이 칸의 기물을 집을 수 있는지(내 차례·내 기물)
//   onStart(key)      임계값을 넘어 실제로 끌기 시작한 순간(선택 표시·이동 가능 칸을 띄울 때)
//   onDrop(from, to)  놓은 칸(to는 보드 밖이면 null) — 보통 격자의 onCell(to)로 이어 준다
//   renderPiece(key, px)  손가락을 따라다니는 고스트 기물
// 끌기가 끝나면 뒤이어 오는 합성 click은 버린다(놓은 칸 버튼이 한 번 더 눌리는 것 방지). dragFrom은 끄는 동안 원래 칸 기물을 흐리게 할 때 쓴다.
function useGridDrag({ size, cellAt, canDrag, onStart, onDrop, renderPiece }) {
  const cbRef = useRef(null);
  cbRef.current = { size, cellAt, canDrag, onStart, onDrop, renderPiece };
  const startRef = useRef(null);      // { key, x, y, id }
  const suppressRef = useRef(false);
  const ghostRef = useRef(null);
  const [dragFrom, setDragFrom] = useState(null);
  const [ghostAt, setGhostAt] = useState(null); // 끌기 시작 순간의 좌표(이후엔 ghostRef에 직접 쓴다)
  const keyAt = (el, x, y) => {
    const r = el.getBoundingClientRect(), cell = r.width / 8;
    const vc = Math.floor((x - r.left) / cell), vr = Math.floor((y - r.top) / cell);
    if (vc < 0 || vc > 7 || vr < 0 || vr > 7) return null;
    return cbRef.current.cellAt(vr, vc);
  };
  const end = () => { startRef.current = null; setDragFrom(null); setGhostAt(null); };
  const bind = {
    onPointerDown: (e) => {
      if (e.button != null && e.button !== 0) return;
      const key = keyAt(e.currentTarget, e.clientX, e.clientY);
      startRef.current = key != null && cbRef.current.canDrag(key) ? { key, x: e.clientX, y: e.clientY, id: e.pointerId, dragging: false } : null;
    },
    onPointerMove: (e) => {
      const st = startRef.current;
      if (!st || st.id !== e.pointerId) return;
      if (!st.dragging) {
        if (Math.hypot(e.clientX - st.x, e.clientY - st.y) < 6) return;
        st.dragging = true;
        try { e.currentTarget.setPointerCapture(e.pointerId); } catch { }
        cbRef.current.onStart && cbRef.current.onStart(st.key);
        setDragFrom(st.key); setGhostAt({ x: e.clientX, y: e.clientY });
        return;
      }
      const g = ghostRef.current;
      if (g) { g.style.left = e.clientX + "px"; g.style.top = e.clientY + "px"; }
    },
    onPointerUp: (e) => {
      const st = startRef.current;
      if (!st || st.id !== e.pointerId) return;
      if (st.dragging) {
        suppressRef.current = true;
        setTimeout(() => { suppressRef.current = false; }, 0);
        const to = keyAt(e.currentTarget, e.clientX, e.clientY);
        end();
        if (to !== st.key) cbRef.current.onDrop(st.key, to);
      } else startRef.current = null;
    },
    onPointerCancel: () => end(),
    onClickCapture: (e) => { if (suppressRef.current) { suppressRef.current = false; e.stopPropagation(); e.preventDefault(); } },
  };
  const cell = size / 8;
  const ghost = dragFrom != null && ghostAt ? createPortal(
    <div ref={ghostRef} aria-hidden="true" style={{ position: "fixed", left: ghostAt.x, top: ghostAt.y, width: cell, height: cell, marginLeft: -cell / 2, marginTop: -cell, zIndex: 400, pointerEvents: "none", display: "flex", alignItems: "center", justifyContent: "center", filter: "drop-shadow(0 8px 14px rgba(0,0,0,.45))" }}>
      {cbRef.current.renderPiece(dragFrom, cell * 0.9)}
    </div>, document.body) : null;
  return { bind, dragFrom, ghost };
}
// (v0.5.7, 사용자 요청 "데스크톱에서 비효율적인 레이아웃") 미니게임 화면은 모바일 기준으로만 짜여, 데스크톱에선 점수 줄·시간 막대·
// 랭킹 탭이 화면 끝에서 끝까지(1400px+) 늘어나고 보드는 420px에 머물러 위아래·양옆이 텅 비었다. 화면 전체를 가운데 한 열
// (MG_DESKTOP_MAX_W)로 모으고, 보드 상한은 데스크톱에서 MG_DESKTOP_BOARD까지 올린다(useSquareFit — 남은 높이 안에서만 커진다).
const MG_DESKTOP_MAX_W = 760, MG_DESKTOP_BOARD = 640, MG_DESKTOP_BP = 899;
function MinigameScreen({ title, onBack, children, noScroll, headerRight }) {
  return createPortal(
    <div style={{ position: "fixed", inset: 0, zIndex: 150, background: "linear-gradient(180deg,#F7EFDF 0%,#EDE0C6 100%)", display: "flex", flexDirection: "column", height: "100dvh" }}>
      <div className="flex items-center justify-between" style={{ flexShrink: 0, width: "100%", maxWidth: MG_DESKTOP_MAX_W + 28, margin: "0 auto", padding: "calc(env(safe-area-inset-top,0px) + 12px) 14px 10px", boxSizing: "border-box" }}>
        <button onClick={onBack} aria-label={t("목록으로")} className="press" style={{ width: 32, height: 32, borderRadius: 9, background: "rgba(255,255,255,.55)", border: "1px solid rgba(90,58,34,.18)", color: T.ink, display: "inline-flex", alignItems: "center", justifyContent: "center", cursor: "pointer", flexShrink: 0 }}><ArrowLeft size={16} /></button>
        <div style={{ fontSize: 14, fontWeight: 800, color: T.ink, textAlign: "center", flex: 1 }}>{title}</div>
        {headerRight || <span style={{ width: 32, flexShrink: 0 }} />}
      </div>
      <div style={{ flex: 1, minHeight: 0, padding: "0 14px calc(env(safe-area-inset-bottom,0px) + 14px)", display: "flex", flexDirection: "column", overflowY: noScroll ? "hidden" : "auto" }}>
        <div style={{ width: "100%", maxWidth: MG_DESKTOP_MAX_W, margin: "0 auto", display: "flex", flexDirection: "column", ...(noScroll ? { flex: 1, minHeight: 0 } : { flex: "1 0 auto" }) }}>
          {children}
        </div>
      </div>
    </div>,
    document.body
  );
}
// (v0.5.1 기능) 내 보드·상대 보드가 세로로 겹쳐도 뷰포트 안에 항상 다 들어오도록, 이 보드가 놓일
// 자리(가로·세로 둘 다 flexbox가 정한 만큼)를 직접 재서 그 안에 꽉 차는 정사각형 한 변의 길이를
// 구한다. useBoardSize(가로 폭만 잰다)와 달리 세로 제약까지 함께 본다 — 이 보드 슬롯 자체를
// flex:1;minHeight:0으로 감싸 뷰포트의 남은 절반을 차지하도록만 해 두면, 나머지(그 절반 안에서
// 실제로 정사각형이 얼마나 커질 수 있는지)는 이 훅이 ResizeObserver로 실측해 계산한다 — 폰트 크기·
// 라벨 줄바꿈 등 주변 요소의 실제 렌더 결과에 따라 슬롯 크기가 달라져도 항상 정확하다.
function useSquareFit(maxSize = 420, reserveH = 0) {
  // (v0.5.7) 데스크톱(가로 900px 이상)에서는 상한을 MG_DESKTOP_BOARD까지 올린다 — 실제 크기는 여전히 슬롯의 가로·세로 중 작은 쪽.
  const wide = !useNarrow(MG_DESKTOP_BP);
  if (wide) maxSize = Math.max(maxSize, MG_DESKTOP_BOARD);
  const [size, setSize] = useState(Math.min(maxSize, 280));
  const roRef = useRef(null);
  const setRef = useCallback((el) => {
    if (roRef.current) { roRef.current.disconnect(); roRef.current = null; }
    if (!el || typeof ResizeObserver === "undefined") return;
    const measure = () => {
      const r = el.getBoundingClientRect();
      const s = Math.max(80, Math.floor(Math.min(r.width, r.height - reserveH, maxSize)));
      setSize((prev) => (Math.abs(prev - s) > 1 ? s : prev));
    };
    measure();
    roRef.current = new ResizeObserver(measure);
    roRef.current.observe(el);
  }, [maxSize, reserveH]);
  useEffect(() => () => { if (roRef.current) roRef.current.disconnect(); }, []);
  return [size, setRef];
}
// (v0.5.0 리디자인, 사용자 요청) 카드 그리드 대신 미니게임 하나당 한 줄을 차지하는 목록으로 바꾸고,
// 게임마다 그 특성을 드러내는 아이콘·강조색(accent)을 따로 두어 한눈에 구분되게 했다.
// (v0.5.0 기능, 사용자 요청) resume — 다른 화면에 있는 동안 전역 알람 박스(GlobalPvpInviteBanner)로
// 미니게임 친구 도전장을 수락하면, App 루트가 이 prop으로 "이미 매칭된 대국"을 넘겨준다. gameType이
// 가리키는 게임을 곧장 활성화하고 그 대국 객체를 initialGame으로 넘겨 매칭 화면 없이 바로 대전
// 화면부터 보여준다 — 한 번 반영하면 onConsumeResume으로 App 루트에 소비했음을 알려 재적용을 막는다.
function PlaySpecialGames({ myUid, onOpenProfile, resume, onConsumeResume, myRating, canEditContent, hubMaxWidth }) {
  const [activeKey, setActiveKey] = useState(null);
  const [resumeGame, setResumeGame] = useState(null);
  // (v0.5.4) 목록 카드마다 내 미니게임 레이팅을 보여준다 — 게임을 마치고 목록으로 돌아올 때 다시 읽는다.
  const [myStats, setMyStats] = useState({});
  useEffect(() => {
    if (!myUid || activeKey) return;
    let cancelled = false;
    fetchMinigameStats(myUid).then((st) => { if (!cancelled) setMyStats(st); }).catch(() => { });
    return () => { cancelled = true; };
  }, [myUid, activeKey]);
  useEffect(() => {
    if (!resume) return;
    const g = PLAY_SPECIAL_GAMES.find((x) => x.gameType === resume.gameType);
    if (g) { setActiveKey(g.key); setResumeGame(resume.game); }
    onConsumeResume && onConsumeResume();
  }, [resume, onConsumeResume]);
  const active = PLAY_SPECIAL_GAMES.find((g) => g.key === activeKey) || null;
  if (active) {
    const Game = active.Component;
    // (v0.5.7, BUG-025) 이미 같은 미니게임 준비 화면에 있을 때 도전장을 수락해도 새 대전으로 들어가도록, 재개할 대전마다 새로 마운트한다
    // (useMinigameMatch는 initialGame을 첫 마운트 때만 읽는다).
    return <Game key={resumeGame ? "resume-" + resumeGame.id : "lobby"} myUid={myUid} onExit={() => { setActiveKey(null); setResumeGame(null); }} onOpenProfile={onOpenProfile} initialGame={resumeGame} myRating={myRating} canEditContent={canEditContent} />;
  }
  return <MinigameHubBoard maxWidth={hubMaxWidth} stats={myStats} onPick={(gameType) => { const g = PLAY_SPECIAL_GAMES.find((x) => x.gameType === gameType); if (g) setActiveKey(g.key); }} />;
}
// ============================================================ 미니게임 목록 화면(v0.5.5 리디자인) ============================================================
// (v0.5.5 리디자인, 사용자 스케치) 한 줄에 게임 하나씩 쌓던 목록 대신, 사용자가 그린 스케치를 옮긴 한 장짜리 화면.
// 크기가 같은 정사각형 버튼 네 개(2×2: 좌표 인지 게임 / 나이트 레이스 / 무한 체크메이트 게임 / 백랭크 러시아워)의
// 안쪽 모서리를 가운데 정육각형 "OpenChess MiniGame" 엠블럼이 같은 모양으로 파고든다. 버튼·육각형은 다른 탭의
// 크림색 카드(T.paper + #DCCBA8 테두리)와 같은 모양이고, 서로 간격을 두고 모서리를 둥글게 깎는다.
// 각 버튼의 바깥 모서리에는 앱 체스보드(장착한 보드·기물 스킨)를 여백 없이 붙여, 버튼의 둥근 윤곽대로 잘라 그린다
// (보드 레이어 전체를 네 버튼 윤곽을 합친 clip-path로 자른다). 위쪽 두 버튼은 맨 위에, 아래쪽 두 버튼은 맨 아래에
// 4×7 보드를 두어 위·아래 모두 두 버튼에 걸쳐 체크 무늬가 이어지는 4×14 띠로 보이고, 이름은 그 반대편(가운데 쪽)에
// 둔다. 네 보드 모두 움직인다 — 좌표 인지 게임은 칸 곳곳에 조준경이 튀어나오고, 나이트 레이스는 목표 칸이 계속
// 바뀌며 나이트가 최단 경로로 뛰어가고, 무한 체크메이트 게임은 실전 1수 메이트(Praggnanandhaa–Keymer 2024,
// Qg7#)를 퀸이 두는 장면을, 백랭크 러시아워는 막힌 주인공 룩이 옆으로 빠져나와 파일을 타고 올라가 백랭크 메이트
// 하는 장면을 반복한다. (v0.5.6 BUG-010) 기기의 "애니메이션 줄이기" 설정과 상관없이 항상 움직인다 — scripts/check-reduced-motion.mjs 참고.
// 좌표계는 SVG viewBox(100×100) 하나 — 보드·글자 오버레이도 같은 퍼센트 좌표로 얹는다.
// (v0.5.6, 사용자 요청) 플레이 탭 버튼(일반 대국·미니게임) 최대 폭. 데스크톱에선 780px이 화면을 너무 크게 차지해
// 520px로 줄였다 — 좁은 화면(모바일·좁은 창)은 원래대로 화면 폭을 채운다(780 제한은 사실상 닿지 않는다).
const PLAY_HUB_MAX_W = 780, PLAY_HUB_MAX_W_DESKTOP = 520;
const MG_GAP = 1.8;                 // 도형 사이 간격
const MG_PAD = 3;                   // 글자 여백
const MG_RADIUS = 3.4;              // 모서리 라운딩
const MG_H = 100;                                                     // 네 정사각형 2×2 → 전체도 정사각형
const MG_SQ = 50 - MG_GAP / 2;                                        // 버튼 정사각형 한 변
const MG_BLEED = 0.6;                                                 // 보드를 버튼 밖으로 살짝 넘겨 그려 가장자리 틈을 없앤다(clip이 잘라 냄)
const MG_STRIP = { rows: 4, cols: 7 };                               // 버튼마다 4×7 — 위·아래 모두 두 버튼을 이어 4×14 띠
const MG_STRIP_CELL = (MG_SQ + 2 * MG_BLEED) / MG_STRIP.cols;
const MG_HEX_S = 17;                                                  // 정육각형 한 변(= 중심에서 꼭짓점까지)
const MG_HEX_A = MG_HEX_S * Math.sqrt(3) / 2;                         // 중심에서 변까지(아포템)
const MG_HEX_CY = 50;
// 다각형 꼭짓점마다 양쪽 변을 r만큼(변 길이 절반 이내) 잘라 내고 꼭짓점을 제어점으로 한 곡선으로 잇는다.
// k로 좌표를 배율 조정해 같은 모양의 px 경로(clip-path용)도 만든다.
function mgRoundedPath(pts, r, k = 1) {
  const n = pts.length;
  let d = "";
  for (let i = 0; i < n; i++) {
    const p = pts[i], a = pts[(i - 1 + n) % n], b = pts[(i + 1) % n];
    const la = Math.hypot(p[0] - a[0], p[1] - a[1]), lb = Math.hypot(b[0] - p[0], b[1] - p[1]);
    const ra = Math.min(r, la / 2), rb = Math.min(r, lb / 2);
    const s = [p[0] + (a[0] - p[0]) * ra / la, p[1] + (a[1] - p[1]) * ra / la];
    const e = [p[0] + (b[0] - p[0]) * rb / lb, p[1] + (b[1] - p[1]) * rb / lb];
    const f = (v) => (v * k).toFixed(2);
    d += (i === 0 ? "M" : "L") + f(s[0]) + " " + f(s[1]) + "Q" + f(p[0]) + " " + f(p[1]) + " " + f(e[0]) + " " + f(e[1]);
  }
  return d + "Z";
}
function mgShapes() {
  const g = MG_GAP, h = g / 2, W = 100, H = MG_H, cy = MG_HEX_CY, s = MG_HEX_S, a = MG_HEX_A;
  // 육각형을 간격만큼 바깥으로 민 윤곽(아포템 +g, 한 변은 2g/√3만큼 길어진다).
  const ao = a + g, so = s + 2 * g / Math.sqrt(3);
  // 윤곽의 비스듬한 변(위 꼭짓점 → 옆 꼭짓점) 위에서 높이 y일 때의 x(중심에서 떨어진 거리).
  const dx = (y) => so / 2 + (so / 2) * (1 - Math.abs(y - cy) / ao);
  const upY = cy - h, dnY = cy + h;
  return {
    hex: [[50 + s, cy], [50 + s / 2, cy + a], [50 - s / 2, cy + a], [50 - s, cy], [50 - s / 2, cy - a], [50 + s / 2, cy - a]],
    coord: [[0, 0], [50 - h, 0], [50 - h, cy - ao], [50 - so / 2, cy - ao], [50 - dx(upY), upY], [0, upY]],
    knight: [[50 + h, 0], [W, 0], [W, upY], [50 + dx(upY), upY], [50 + so / 2, cy - ao], [50 + h, cy - ao]],
    attack: [[0, dnY], [50 - dx(dnY), dnY], [50 - so / 2, cy + ao], [50 - h, cy + ao], [50 - h, H], [0, H]],
    rush: [[50 + h, cy + ao], [50 + so / 2, cy + ao], [50 + dx(dnY), dnY], [W, dnY], [W, H], [50 + h, H]],
  };
}
const MG_KEYS = ["coord", "knight", "attack", "rush"];
const MG_NAMES = { coord: t("좌표 인지 게임"), knight: t("나이트 레이스"), attack: t("무한 체크메이트 게임"), rush: t("백랭크 러시아워") };
// 버튼 글자 자리 — 보드 반대편(가운데 가로선 쪽)에 둔다: 위 버튼은 보드 아래, 아래 버튼은 보드 위. 육각형 홈을
// 피하도록 왼쪽 버튼은 왼쪽 정렬, 오른쪽 버튼은 오른쪽 정렬(x는 정렬한 쪽 끝, top은 viewBox 좌표).
const MG_STRIP_H = MG_STRIP.rows * MG_STRIP_CELL - MG_BLEED;            // 버튼 안에 보이는 보드 높이
const MG_LABEL_UP_TOP = MG_STRIP_H + 2.4, MG_LABEL_DN_TOP = 50 + MG_GAP / 2 + 2.2;
const MG_LABELS = [
  { gameType: "coord", lines: [t("좌표 인지"), t("게임")], x: MG_PAD + 1, top: MG_LABEL_UP_TOP },
  { gameType: "knight", lines: [t("나이트"), t("레이스")], x: 100 - MG_PAD - 1, top: MG_LABEL_UP_TOP, right: true },
  { gameType: "attack", lines: [t("무한"), t("체크메이트"), t("게임")], x: MG_PAD + 1, top: MG_LABEL_DN_TOP },
  { gameType: "rush", lines: [t("백랭크"), t("러시아워")], x: 100 - MG_PAD - 1, top: MG_LABEL_DN_TOP, right: true },
];
// 앱 체스보드 조각 — 장착한 보드 스킨·기물 스킨을 그대로 쓴다. rows×cols와 전역 좌표 오프셋(rowOffset·colOffset,
// 위에서 아래·왼쪽에서 오른쪽)을 받아, 조각끼리 이어 붙이거나 8×8의 일부를 잘라도 체크 무늬가 실제 보드와 같다.
// 테두리 없이 그려, 버튼 윤곽(clip-path)이 그대로 보드의 가장자리가 된다.
// roundCorners: 이 조각의 네 귀퉁이 중 버튼의 둥근 모서리에 붙는 쪽({ tl, tr, bl, br }) — 그 귀퉁이 칸의 기물은
// 둥근 모서리에 잘리지 않도록 모서리 반대쪽으로 살짝 옮기고 줄인다(예: 러시아워 보드 오른쪽 위 e8의 흑 킹).
function MgBoardPiece({ rows, cols, colOffset = 0, rowOffset = 0, cellPx, pieceAt, overlayAt, roundCorners, children }) {
  const ctx = useContext(SkinContext);
  const sk = BOARD_SKINS[ctx.boardSkin] || BOARD_SKINS.classic;
  const cells = [];
  for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
    const gc = c + colOffset, gr = r + rowOffset;
    const light = (gr + gc) % 2 === 0;
    const pc = pieceAt && pieceAt(gr, gc);
    const ov = overlayAt && overlayAt(gr, gc);
    const rc = roundCorners || {};
    const corner = r === 0 && c === 0 ? rc.tl && [1, 1] : r === 0 && c === cols - 1 ? rc.tr && [-1, 1] : r === rows - 1 && c === 0 ? rc.bl && [1, -1] : r === rows - 1 && c === cols - 1 ? rc.br && [-1, -1] : null;
    const nudge = corner ? { transform: "translate(" + corner[0] * 9 + "%," + corner[1] * 9 + "%) scale(.86)" } : null;
    cells.push(
      <div key={r + "-" + c} style={{ position: "relative", display: "flex", alignItems: "center", justifyContent: "center", ...boardSquareBg(sk, light, gr, gc) }}>
        {ov}
        {pc && <PieceGlyph type={pc[1]} color={pc[0]} size={cellPx * 0.8} style={{ position: "relative", zIndex: 2, ...nudge }} />}
      </div>
    );
  }
  return (
    <div style={{ position: "absolute", inset: 0, display: "grid", gridTemplateColumns: "repeat(" + cols + ",1fr)", gridTemplateRows: "repeat(" + rows + ",1fr)" }}>
      {cells}
      {children}
    </div>
  );
}
// (v0.5.5 연출, 사용자 요청) 좌표 인지 게임 띠 — 칸 곳곳에 조준경이 차례로 튀어나왔다 사라지며 그 칸의 좌표를
// 띄운다(띠 왼쪽 절반을 a–g 파일 × 8–5랭크로 본다). 다섯 칸이 시차를 두고 돌아 늘 한두 개가 떠 있다.
const MG_PINGS = [{ c: 2, r: 1 }, { c: 5, r: 0 }, { c: 1, r: 3 }, { c: 4, r: 2 }, { c: 5, r: 3 }];
const MG_PING_MS = 4000;
function MgCrosshair({ size }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} aria-hidden="true" style={{ display: "block", filter: "drop-shadow(0 1px 1.5px rgba(0,0,0,.55))" }}>
      <circle cx="12" cy="12" r="7" fill="none" stroke="#fff" strokeWidth="2.2" />
      <path d="M12 1.5v5.2M12 17.3v5.2M1.5 12h5.2M17.3 12h5.2" stroke="#fff" strokeWidth="2.2" strokeLinecap="round" />
      <circle cx="12" cy="12" r="1.8" fill="#fff" />
    </svg>
  );
}
function MgCoordPings({ cellPx }) {
  const w = 100 / MG_STRIP.cols, h = 100 / MG_STRIP.rows;
  return (
    <div aria-hidden="true" style={{ position: "absolute", inset: 0, zIndex: 3 }}>
      {MG_PINGS.map((pg, i) => {
        const delay = -(MG_PING_MS / MG_PINGS.length) * (MG_PINGS.length - i) + "ms";
        return (
          <div key={i} style={{ position: "absolute", left: pg.c * w + "%", top: pg.r * h + "%", width: w + "%", height: h + "%" }}>
            <span className="mg-anim" style={{ position: "absolute", inset: 0, background: "rgba(22,181,166,.45)", boxShadow: "inset 0 0 0 2px " + T.brilliant, animation: "mgSqFlash " + MG_PING_MS + "ms ease-out infinite", animationDelay: delay }} />
            <span className="mg-anim" style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", animation: "mgPing " + MG_PING_MS + "ms cubic-bezier(.2,.9,.3,1.2) infinite", animationDelay: delay }}>
              <MgCrosshair size={Math.max(12, cellPx * 0.7)} />
              <span style={{ position: "absolute", right: "6%", bottom: "2%", fontSize: Math.max(8, cellPx * 0.22), fontWeight: 900, color: "#fff", textShadow: "0 1px 2px rgba(0,0,0,.7)", fontFamily: SITE_FONT }}>{"abcdefg"[pg.c] + (8 - pg.r)}</span>
            </span>
          </div>
        );
      })}
    </div>
  );
}
// (v0.5.5, 사용자 요청) 버튼 속 화살표 — 분석 탭 보드 화살표와 같은 형식(T.arrow 금색 직선 몸통 + 삼각형 화살촉, 약간 투명).
// routes: 칸 좌표([열, 줄]) 배열들 — 한 경로가 여러 칸을 꺾어 지나가면 몸통은 이어 그리고 화살촉은 마지막 칸에만 단다.
function MgArrowSvg({ routes, color = T.arrow, opacity = 0.9, cols = MG_STRIP.cols, rows = MG_STRIP.rows }) {
  const W = 0.15, HEAD = 0.36, HW = HEAD * 0.62;
  return (
    <svg viewBox={"0 0 " + cols + " " + rows} width="100%" height="100%" style={{ position: "absolute", inset: 0, zIndex: 3 }} aria-hidden="true">
      {routes.map((route, i) => {
        const pts = route.map(([c, r]) => [c + 0.5, r + 0.5]);
        if (pts.length < 2) return null;
        const [x1, y1] = pts[pts.length - 2], [x2, y2] = pts[pts.length - 1];
        const len = Math.hypot(x2 - x1, y2 - y1) || 1, ux = (x2 - x1) / len, uy = (y2 - y1) / len;
        const bx = x2 - ux * HEAD, by = y2 - uy * HEAD, nx = -uy, ny = ux;
        const shaft = [...pts.slice(0, -1), [bx, by]].map((q) => q.join(",")).join(" ");
        const head = x2 + "," + y2 + " " + (bx + nx * HW) + "," + (by + ny * HW) + " " + (bx - nx * HW) + "," + (by - ny * HW);
        return (
          <g key={i} opacity={opacity}>
            <polyline points={shaft} fill="none" stroke={color} strokeWidth={W} strokeLinecap="round" strokeLinejoin="round" />
            <polygon points={head} fill={color} />
          </g>
        );
      })}
    </svg>
  );
}
// (v0.5.5 연출, 사용자 요청) 나이트 레이스 띠 — 목표 칸(금색 별)이 계속 바뀌고, 나이트가 그때마다 최단 경로로 한 칸씩
// 뛰어간다(화살표가 남은 경로). 도착하면 별이 터지듯 번쩍이고 잠시 뒤 다른 칸에 새 목표가 뜬다. 목표가 바뀔 때마다 상대(백)
// 비숍·룩이 1~2개 새로 놓이고, 나이트는 보통 그 기물들이 지배하는 칸을 피해 돌아간다. 가끔(MG_KNIGHT_DOOM_P) 그 칸을 모르고
// 밟으면 지배하던 기물이 날아와 나이트를 잡고, 라운드가 끝난 듯 띠 전체가 사라졌다가 새로 시작한다. 둥근 버튼 모서리에 걸리는
// 귀퉁이 칸(위 두 모서리)에는 나이트도 기물도 가지 않는다.
const MG_KNIGHT_JUMPS = [[1, 2], [2, 1], [-1, 2], [-2, 1], [1, -2], [2, -1], [-1, -2], [-2, -1]];
const MG_KNIGHT_AVOID = new Set(["0,0", MG_STRIP.cols - 1 + ",0"]);
const MG_HOP_MS = 560;
const MG_KNIGHT_DOOM_P = 0.3;
const mgKey = (p) => p[0] + "," + p[1];
const mgInStrip = (c, r) => c >= 0 && r >= 0 && c < MG_STRIP.cols && r < MG_STRIP.rows;
// blocked: 지나갈 수 없는 칸(키 Set) — 상대 기물 칸, 그리고 안전하게 갈 때는 그 기물들이 지배하는 칸까지.
function mgKnightPath(from, to, blocked) {
  const prev = new Map([[mgKey(from), null]]);
  const q = [from];
  while (q.length) {
    const cur = q.shift();
    if (mgKey(cur) === mgKey(to)) break;
    for (const [dc, dr] of MG_KNIGHT_JUMPS) {
      const nx = [cur[0] + dc, cur[1] + dr], k = mgKey(nx);
      if (!mgInStrip(nx[0], nx[1]) || MG_KNIGHT_AVOID.has(k) || prev.has(k) || (blocked && blocked.has(k))) continue;
      prev.set(k, cur); q.push(nx);
    }
  }
  if (!prev.has(mgKey(to))) return [];
  const path = [];
  for (let p = to; p && mgKey(p) !== mgKey(from); p = prev.get(mgKey(p))) path.unshift(p);
  return path;
}
// 비숍·룩이 지배하는 칸 — 다른 기물에 막히면 거기서 멈춘다.
function mgFoeAttacks(foe, foes) {
  const dirs = foe.t === "R" ? [[1, 0], [-1, 0], [0, 1], [0, -1]] : [[1, 1], [1, -1], [-1, 1], [-1, -1]];
  const occ = new Set(foes.filter((f) => f !== foe).map((f) => mgKey([f.c, f.r])));
  const out = [];
  for (const [dc, dr] of dirs) {
    for (let c = foe.c + dc, r = foe.r + dr; mgInStrip(c, r); c += dc, r += dr) { out.push(mgKey([c, r])); if (occ.has(mgKey([c, r]))) break; }
  }
  return out;
}
function mgDangerSet(foes) { const s = new Set(); foes.forEach((f) => mgFoeAttacks(f, foes).forEach((k) => s.add(k))); return s; }
// 다음 한 판 — 상대 기물, 목표 칸, 나이트가 밟을 경로. doom이면 경로 중간에 지배당하는 칸이 끼어 있다(첫 수는 안전).
function mgKnightCycle(pos, n) {
  const wantDoom = Math.random() < MG_KNIGHT_DOOM_P;
  const rand = (k) => Math.floor(Math.random() * k);
  for (let a = 0; a < 240; a++) {
    const doom = wantDoom && a < 160;
    const used = new Set([mgKey(pos), ...MG_KNIGHT_AVOID]);
    const foes = [];
    const cnt = 1 + rand(2);
    for (let t = 0; t < 40 && foes.length < cnt; t++) {
      const c = rand(MG_STRIP.cols), r = rand(MG_STRIP.rows);
      if (used.has(mgKey([c, r]))) continue;
      used.add(mgKey([c, r])); foes.push({ id: n + "-" + foes.length, t: Math.random() < 0.5 ? "B" : "R", c, r });
    }
    const danger = mgDangerSet(foes);
    if (danger.has(mgKey(pos))) continue;
    const foeSqs = new Set(foes.map((f) => mgKey([f.c, f.r])));
    const safeBlock = new Set([...foeSqs, ...danger]);
    const cands = [];
    for (let r = 0; r < MG_STRIP.rows; r++) for (let c = 0; c < MG_STRIP.cols; c++) {
      const k = mgKey([c, r]);
      if (MG_KNIGHT_AVOID.has(k) || foeSqs.has(k) || danger.has(k) || (c === pos[0] && r === pos[1])) continue;
      const path = mgKnightPath(pos, [c, r], doom ? foeSqs : safeBlock);
      if (path.length < 2 || path.length > 3) continue;
      const hit = path.slice(1, -1).some((q) => danger.has(mgKey(q)));
      if (doom ? hit && !danger.has(mgKey(path[0])) : !hit) cands.push({ target: [c, r], path });
    }
    if (cands.length) return { foes, doom, ...cands[rand(cands.length)] };
  }
  const t = pos[0] < 3 ? [5, 2] : [1, 3];
  return { foes: [], doom: false, target: t, path: mgKnightPath(pos, t) };
}
function mgKnightFresh(life) {
  let pos;
  do { pos = [Math.floor(Math.random() * MG_STRIP.cols), Math.floor(Math.random() * MG_STRIP.rows)]; } while (MG_KNIGHT_AVOID.has(mgKey(pos)));
  return { pos, ...mgKnightCycle(pos, life * 100), hop: 0, rest: 1, tgt: 0, n: 0, life, phase: "run", catcher: null };
}
function MgKnightRun({ cellPx }) {
  const w = 100 / MG_STRIP.cols, h = 100 / MG_STRIP.rows;
  // rest: 도착 뒤·새 목표를 띄운 뒤 잠깐 멈추는 박자 수. hop: 뛸 때마다 올려 안쪽 요소의 떠오르는 애니메이션을 다시 건다.
  // phase: run(진행) → caught(잡힘: 기물이 날아와 나이트가 사라진다) → fade(띠 전체가 사라진다) → 새 판(life+1).
  const [st, setSt] = useState(() => {
    const pos = [1, 3], t = [6, 1];
    return { pos, target: t, path: mgKnightPath(pos, t), foes: [], doom: false, hop: 0, rest: 1, tgt: 0, n: 0, life: 0, phase: "run", catcher: null };
  });
  useEffect(() => {
    const id = setInterval(() => setSt((s) => {
      if (s.rest > 0) return { ...s, rest: s.rest - 1 };
      if (s.phase === "caught") return { ...s, phase: "fade", rest: 1 };
      if (s.phase === "fade") return mgKnightFresh(s.life + 1);
      if (s.path.length) {
        const [nx, ...rest] = s.path;
        const k = mgKey(nx);
        const catcher = s.foes.find((f) => mgFoeAttacks(f, s.foes).includes(k));
        if (catcher) return { ...s, pos: nx, path: [], hop: s.hop + 1, phase: "caught", catcher: catcher.id, foes: s.foes.map((f) => (f.id === catcher.id ? { ...f, c: nx[0], r: nx[1] } : f)), rest: 2 };
        return { ...s, pos: nx, path: rest, hop: s.hop + 1, rest: rest.length ? 0 : 2 };
      }
      const n = s.n + 1;
      return { ...s, ...mgKnightCycle(s.pos, s.life * 100 + n), n, tgt: s.tgt + 1, rest: 1 };
    }), MG_HOP_MS);
    return () => clearInterval(id);
  }, []);
  const caught = st.phase !== "run";
  const arrived = !caught && !st.path.length && st.pos[0] === st.target[0] && st.pos[1] === st.target[1];
  const trail = [st.pos, ...st.path];
  const hopMs = MG_HOP_MS * 0.72;
  return (
    <div key={"life" + st.life} aria-hidden="true" style={{ position: "absolute", inset: 0, zIndex: 3, animation: "mgSceneIn .35s ease-out", opacity: st.phase === "fade" ? 0 : 1, transition: "opacity .45s ease" }}>
      {/* 남은 경로 — 나이트가 뛸 한 수 한 수를 분석 탭 화살표로. */}
      {trail.length > 1 && <MgArrowSvg routes={trail.slice(0, -1).map((p, i) => [p, trail[i + 1]])} />}
      <div key={"t" + st.tgt} style={{ position: "absolute", left: st.target[0] * w + "%", top: st.target[1] * h + "%", width: w + "%", height: h + "%", display: "flex", alignItems: "center", justifyContent: "center", animation: "mgPop .35s cubic-bezier(.2,.9,.3,1.3)", opacity: caught ? 0.35 : 1, transition: "opacity .3s" }}>
        <span className="mg-anim" style={{ position: "absolute", inset: "6%", borderRadius: "50%", boxShadow: "0 0 0 2px " + T.brassHi + ", 0 0 12px 3px rgba(236,203,134,.8)", background: arrived ? "rgba(236,203,134,.6)" : "rgba(236,203,134,.28)", animation: arrived ? "mgBurst .5s ease-out" : "mgTargetPulse 1.4s ease-in-out infinite", transition: "background .2s" }} />
        <Star size={Math.max(10, cellPx * 0.46)} color={T.brassHi} fill={T.brassHi} style={{ position: "relative", filter: "drop-shadow(0 1px 1px rgba(0,0,0,.6))" }} />
      </div>
      {/* 잡힌 칸 — 빨갛게 번쩍인다. */}
      {caught && <div style={{ position: "absolute", left: st.pos[0] * w + "%", top: st.pos[1] * h + "%", width: w + "%", height: h + "%", background: "radial-gradient(circle, rgba(229,52,42,.75) 0%, rgba(229,52,42,.25) 72%)", animation: "mgMateFlash .4s ease-out " + (hopMs + 260) + "ms both" }} />}
      {/* 잡히면 나이트가 내려앉은 뒤(잡는 기물이 닿는 순간) 흐려지며 사라진다 — 뛸 때마다 새로 그려지는 안쪽이 아니라 바깥에 건다. */}
      <div style={{ position: "absolute", left: 0, top: 0, width: w + "%", height: h + "%", zIndex: 2, transform: "translate(" + st.pos[0] * 100 + "%," + st.pos[1] * 100 + "%)", opacity: caught ? 0 : 1, transition: "transform " + hopMs + "ms cubic-bezier(.45,.05,.3,1)" + (caught ? ", opacity .3s ease " + (hopMs + 280) + "ms" : "") }}>
        <div key={"h" + st.hop} style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center", filter: "drop-shadow(0 3px 3px rgba(0,0,0,.45))", animation: st.hop ? "mgHop " + hopMs + "ms ease-out" : "none" }}>
          <PieceGlyph type="N" color="b" size={cellPx * 0.82} />
        </div>
      </div>
      {/* 상대(백) 비숍·룩 — 목표가 바뀔 때마다 새로 놓인다. 잡는 기물은 나이트가 내려앉은 뒤 그 칸으로 날아간다. */}
      {st.foes.map((f) => (
        <div key={f.id} style={{ position: "absolute", left: 0, top: 0, width: w + "%", height: h + "%", zIndex: f.id === st.catcher ? 4 : 1, transform: "translate(" + f.c * 100 + "%," + f.r * 100 + "%)", transition: "transform 320ms cubic-bezier(.5,0,.25,1) " + (hopMs - 40) + "ms", display: "flex", alignItems: "center", justifyContent: "center" }}>
          <span style={{ display: "flex", animation: "mgPop .35s cubic-bezier(.2,.9,.3,1.3)", filter: "drop-shadow(0 2px 2px rgba(0,0,0,.35))" }}>
            <PieceGlyph type={f.t} color="w" size={cellPx * 0.78} />
          </span>
        </div>
      ))}
    </div>
  );
}
// (v0.5.5 연출, 사용자 요청) 아래쪽 두 보드 — src/data/hubScenes.json(scripts/build-hub-scenes.mjs가 4×7 창에 들어오는 것만
// 골라 둔 장면)에서 무작위로 하나씩 골라, 수순의 기물이 한 칸씩 미끄러지고(잡힌 기물은 사라진다) 메이트 순간 킹 칸이
// 빨갛게 번쩍인 뒤 다른 장면으로 넘어가길 반복한다. 무한 체크메이트는 실전 1·2수 메이트, 러시아워는 주인공 룩(금색 링·왕관)이
// 빠져나가 백랭크 메이트하는 퍼즐. 남은 수순은 분석 탭 화살표로 보인다.
const MG_SCENE_MS = 760;
const MG_LOOP_CSS = "@keyframes mgPop{0%{transform:scale(.2);opacity:0}100%{transform:scale(1);opacity:1}}"
  + "@keyframes mgBurst{0%{transform:scale(.8)}45%{transform:scale(1.3);box-shadow:0 0 0 3px " + T.brassHi + ",0 0 22px 8px rgba(236,203,134,.95)}100%{transform:scale(1)}}"
  + "@keyframes mgHop{0%{transform:translateY(0)}45%{transform:translateY(-30%) scale(1.1)}100%{transform:translateY(0)}}"
  + "@keyframes mgSceneIn{0%{opacity:0}100%{opacity:1}}"
  + "@keyframes mgMateFlash{0%{opacity:0}30%{opacity:1}100%{opacity:1}}";
function mgSceneStart(sc, n) {
  const pieces = sc.p.map(([code, c, r], i) => ({ id: n + "-" + i, color: code[0], t: code[1], c, r }));
  const heroP = sc.h ? pieces.find((p) => p.c === sc.h[0] && p.r === sc.h[1]) : null;
  return { n, sc, pieces, step: 0, phase: "intro", hold: 1, hero: heroP ? heroP.id : null };
}
function MgScenePlayer({ scenes, cellPx }) {
  const w = 100 / MG_STRIP.cols, h = 100 / MG_STRIP.rows;
  const pick = (not) => { let i = Math.floor(Math.random() * scenes.length); if (scenes.length > 1 && i === not) i = (i + 1) % scenes.length; return i; };
  const [st, setSt] = useState(() => { const i = pick(-1); return { ...mgSceneStart(scenes[i], 0), idx: i }; });
  useEffect(() => {
    const id = setInterval(() => setSt((s) => {
      if (s.hold > 0) return { ...s, hold: s.hold - 1 };
      if (s.phase === "intro" || s.phase === "play") {
        if (s.step >= s.sc.m.length) return { ...s, phase: "mate", hold: 3 };
        const [fc, fr, tc, tr] = s.sc.m[s.step];
        const pieces = s.pieces.filter((p) => !(p.c === tc && p.r === tr)).map((p) => (p.c === fc && p.r === fr ? { ...p, c: tc, r: tr } : p));
        return { ...s, pieces, step: s.step + 1, phase: "play" };
      }
      if (s.phase === "mate") return { ...s, phase: "out", hold: 0 };
      const i = pick(s.idx);
      return { ...mgSceneStart(scenes[i], s.n + 1), idx: i };
    }), MG_SCENE_MS);
    return () => clearInterval(id);
  }, [scenes]); // eslint-disable-line react-hooks/exhaustive-deps
  const remaining = st.sc.m.slice(st.step).map(([a, b, c, d]) => [[a, b], [c, d]]);
  const mated = st.phase === "mate" || st.phase === "out";
  const [kc, kr] = st.sc.k;
  return (
    <div key={st.n} aria-hidden="true" style={{ position: "absolute", inset: 0, zIndex: 3, animation: "mgSceneIn .35s ease-out", opacity: st.phase === "out" ? 0 : 1, transition: "opacity .3s ease" }}>
      {mated && (
        <div style={{ position: "absolute", left: kc * w + "%", top: kr * h + "%", width: w + "%", height: h + "%", display: "flex", alignItems: "flex-start", justifyContent: "flex-end", animation: "mgMateFlash .4s ease-out both" }}>
          <span style={{ position: "absolute", inset: 0, background: "radial-gradient(circle, rgba(229,52,42,.75) 0%, rgba(229,52,42,.28) 72%)" }} />
          <span style={{ position: "relative", zIndex: 3, margin: "4% 8% 0 0", fontSize: Math.max(8, cellPx * 0.26), fontWeight: 900, color: "#fff", textShadow: "0 1px 2px rgba(0,0,0,.8)", fontFamily: SITE_FONT }}>#</span>
        </div>
      )}
      {!mated && remaining.length > 0 && <MgArrowSvg routes={remaining} />}
      {st.pieces.map((p) => {
        const isHero = p.id === st.hero;
        const corner = p.r === MG_STRIP.rows - 1 && (p.c === 0 || p.c === MG_STRIP.cols - 1);
        return (
          <div key={p.id} style={{ position: "absolute", left: 0, top: 0, width: w + "%", height: h + "%", zIndex: 2, transform: "translate(" + p.c * 100 + "%," + p.r * 100 + "%)", transition: "transform " + Math.round(MG_SCENE_MS * 0.62) + "ms cubic-bezier(.4,.1,.3,1)", display: "flex", alignItems: "center", justifyContent: "center" }}>
            <span style={{ position: "relative", display: "flex", alignItems: "center", justifyContent: "center", width: "100%", height: "100%", transform: corner ? "translate(" + (p.c === 0 ? 9 : -9) + "%,-9%) scale(.86)" : "none" }}>
              {isHero && <span style={{ position: "absolute", inset: "8%", borderRadius: "50%", boxShadow: "0 0 0 2px " + T.brassHi + ", 0 0 10px 2px rgba(236,203,134,.75)" }} />}
              <PieceGlyph type={p.t} color={p.color} size={cellPx * 0.8} style={{ position: "relative", filter: "drop-shadow(0 2px 2px rgba(0,0,0,.3))" }} />
              {isHero && <Crown size={Math.max(7, cellPx * 0.26)} color={T.brassHi} style={{ position: "absolute", top: 1, right: 1, filter: "drop-shadow(0 1px 1px rgba(0,0,0,.7))" }} />}
            </span>
          </div>
        );
      })}
    </div>
  );
}
// (v0.5.5, 사용자 요청) 플레이 탭 맨 위 "일반 대국" 버튼 — 미니게임 버튼들과 같은 크림색 카드에, 왼쪽은 앱 체스보드(칸 크기가
// 아래 미니게임 버튼 보드와 같다), 오른쪽은 오른쪽 정렬한 이름. 보드에서는 매번 다른 마스터 대국(src/data/masterShowcase.json —
// scripts/build-master-showcase.mjs가 엘로 2650+ 대국 80판을 골라 둔 것)이 기물이 미끄러지며 재생되고, 끝나면 다른 대국으로
// 넘어간다. 누르면 설정 창이 열린다.
const MG_START_BACK = ["R", "N", "B", "Q", "K", "B", "N", "R"];
const MG_REPLAY_MS = 700;
const mgSqRC = (sq) => [8 - parseInt(sq[1], 10), "abcdefgh".indexOf(sq[0])];   // "e2" → [줄(위에서), 열]
function mgStartPieces() {
  const out = [];
  MG_START_BACK.forEach((t, c) => { out.push({ id: "b" + t + c, t, color: "b", r: 0, c }, { id: "w" + t + c, t, color: "w", r: 7, c }); });
  for (let c = 0; c < 8; c++) out.push({ id: "bP" + c, t: "P", color: "b", r: 1, c }, { id: "wP" + c, t: "P", color: "w", r: 6, c });
  return out;
}
const mgPlayerName = (n) => String(n || "?").split(",")[0].trim();
function MgMasterReplay({ cellPx, onGameChange }) {
  const [games, setGames] = useState(null);
  useEffect(() => {
    let off = false;
    import("../data/masterShowcase.json").then((m) => { if (!off) setGames(m.default || m); }).catch(() => { });
    return () => { off = true; };
  }, []);
  const [st, setSt] = useState(() => ({ pieces: mgStartPieces(), last: null }));
  const runRef = useRef({ chess: null, sans: [], ply: 0, hold: 0, gi: -1 });
  useEffect(() => {
    if (!games || !games.length) return undefined;
    const run = runRef.current;
    const nextGame = () => {
      let gi = Math.floor(Math.random() * games.length);
      if (games.length > 1 && gi === run.gi) gi = (gi + 1) % games.length;
      const g = games[gi];
      Object.assign(run, { chess: new Chess(), sans: g.m.split(" "), ply: 0, hold: 2, gi });
      setSt({ pieces: mgStartPieces(), last: null });
      onGameChange && onGameChange(g);
    };
    nextGame();
    const id = setInterval(() => {
      if (run.hold > 0) { run.hold--; return; }
      if (run.ply >= run.sans.length) { nextGame(); return; }
      let mv = null;
      try { mv = run.chess.move(run.sans[run.ply]); } catch { mv = null; }
      run.ply++;
      if (!mv) { run.ply = run.sans.length; return; }
      if (run.ply >= run.sans.length) run.hold = 5;   // 마지막 수를 잠깐 보여 준 뒤 다음 대국
      setSt((prev) => {
        const [fr, fc] = mgSqRC(mv.from), [tr, tc] = mgSqRC(mv.to);
        // 잡힌 기물(앙파상은 도착 칸이 아니라 옆 칸)을 먼저 빼고, 움직인 기물(승진이면 종류도)을 옮기고, 캐슬링이면 룩도 옮긴다.
        const capR = mv.flags.includes("e") ? fr : tr;
        let pieces = prev.pieces.filter((p) => !(mv.captured && p.r === capR && p.c === tc && p.color !== mv.color));
        pieces = pieces.map((p) => (p.r === fr && p.c === fc ? { ...p, r: tr, c: tc, t: mv.promotion ? mv.promotion.toUpperCase() : p.t } : p));
        if (mv.flags.includes("k")) pieces = pieces.map((p) => (p.r === fr && p.c === 7 && p.t === "R" ? { ...p, c: 5 } : p));
        if (mv.flags.includes("q")) pieces = pieces.map((p) => (p.r === fr && p.c === 0 && p.t === "R" ? { ...p, c: 3 } : p));
        return { pieces, last: [[fr, fc], [tr, tc]] };
      });
    }, MG_REPLAY_MS);
    return () => clearInterval(id);
  }, [games]); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <div aria-hidden="true" style={{ position: "absolute", inset: 0, zIndex: 2 }}>
      {st.last && st.last.map(([r, c], i) => <span key={i} style={{ position: "absolute", left: c * 12.5 + "%", top: r * 12.5 + "%", width: "12.5%", height: "12.5%", background: "rgba(236,203,134,.42)" }} />)}
      {st.pieces.map((p) => {
        // 카드 왼쪽 둥근 모서리(a8·a1)에 선 기물은 모서리에 잘리지 않게 살짝 안쪽으로.
        const corner = p.c === 0 && (p.r === 0 || p.r === 7);
        return (
          <div key={p.id} style={{ position: "absolute", left: 0, top: 0, width: "12.5%", height: "12.5%", transform: "translate(" + p.c * 100 + "%," + p.r * 100 + "%)", transition: "transform " + Math.round(MG_REPLAY_MS * 0.6) + "ms cubic-bezier(.4,.1,.3,1)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1 }}>
            <span style={{ display: "flex", transform: corner ? "translate(9%," + (p.r === 0 ? 9 : -9) + "%) scale(.86)" : "none" }}>
              <PieceGlyph type={p.t} color={p.color} size={cellPx * 0.8} />
            </span>
          </div>
        );
      })}
    </div>
  );
}
function PlayNormalButton({ onClick }) {
  const [width, setWidth] = useState(360);
  const roRef = useRef(null);
  const measureRef = useCallback((el) => {
    if (roRef.current) { roRef.current.disconnect(); roRef.current = null; }
    if (!el || typeof ResizeObserver === "undefined") return;
    const measure = () => { const w = el.clientWidth; if (w) setWidth((prev) => (Math.abs(prev - w) > 1 ? w : prev)); };
    measure();
    roRef.current = new ResizeObserver(measure);
    roRef.current.observe(el);
  }, []);
  useEffect(() => () => { if (roRef.current) roRef.current.disconnect(); }, []);
  const [hover, setHover] = useState(false);
  const [game, setGame] = useState(null);
  // 아래 미니게임 목록과 같은 폭에 놓이므로, 칸 크기를 같게 하려면 보드 폭 = 8칸 × 미니게임 칸(목록 폭의 MG_STRIP_CELL%).
  const boardFrac = (8 * MG_STRIP_CELL) / 100;
  const cellPx = (width * boardFrac) / 8;
  return (
    <button ref={measureRef} onClick={onClick} onMouseEnter={() => setHover(true)} onMouseLeave={() => setHover(false)} className="press" aria-label={t("일반 대국")}
      style={{ containerType: "inline-size", position: "relative", display: "flex", width: "100%", aspectRatio: "1 / " + boardFrac, padding: 0, border: "1px solid " + (hover ? T.brass : "#DCCBA8"), borderRadius: 14, overflow: "hidden", background: hover ? "#F7EEDC" : T.paper, boxShadow: "0 4px 14px -4px rgba(0,0,0,.45)", cursor: "pointer", textAlign: "right", transition: "background .15s ease, border-color .15s ease" }}>
      <span style={{ position: "relative", width: boardFrac * 100 + "%", height: "100%", flexShrink: 0 }}>
        <MgBoardPiece rows={8} cols={8} cellPx={cellPx}>
          <MgMasterReplay cellPx={cellPx} onGameChange={setGame} />
        </MgBoardPiece>
      </span>
      <span style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", alignItems: "flex-end", justifyContent: "center", gap: "2.2cqw", padding: "0 4.5cqw 0 3cqw", fontFamily: SITE_FONT, color: T.ink }}>
        <span style={{ fontSize: "clamp(20px, 7.2cqw, 52px)", fontWeight: 900, letterSpacing: "-.03em", lineHeight: 1.05 }}>{t("일반 대국")}</span>
        <span style={{ fontSize: "clamp(11px, 3cqw, 20px)", fontWeight: 700, color: T.inkSoft, lineHeight: 1.35 }}>{t("봇 · 랜덤 매칭 · 친구")}</span>
        <span style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "0.5em 1.1em", borderRadius: 999, fontSize: "clamp(11px, 2.9cqw, 18px)", fontWeight: 800, background: "linear-gradient(180deg," + T.brass + ",#A8842F)", color: "#241509" }}>
          {tx("{0}대국 시작", <Play size={14} fill="#241509" />)}</span>
        {game && (
          <span style={{ fontSize: "clamp(9px, 2.2cqw, 14px)", fontWeight: 700, color: "rgba(90,58,34,.6)", lineHeight: 1.3, maxWidth: "100%" }}>
            {mgPlayerName(game.w)} – {mgPlayerName(game.b)}{game.y ? " · " + game.y : ""}
          </span>
        )}
      </span>
    </button>
  );
}
function MinigameHubBoard({ stats, onPick, maxWidth = PLAY_HUB_MAX_W }) {
  // 기물 이미지 스킨은 size(px)로 크기를 계산하고 clip-path는 px 경로가 필요하므로, 전체 폭을 실측한다.
  const [width, setWidth] = useState(360);
  const roRef = useRef(null);
  const measureRef = useCallback((el) => {
    if (roRef.current) { roRef.current.disconnect(); roRef.current = null; }
    if (!el || typeof ResizeObserver === "undefined") return;
    const measure = () => { const w = el.clientWidth; if (w) setWidth((prev) => (Math.abs(prev - w) > 1 ? w : prev)); };
    measure();
    roRef.current = new ResizeObserver(measure);
    roRef.current.observe(el);
  }, []);
  useEffect(() => () => { if (roRef.current) roRef.current.disconnect(); }, []);
  const [hover, setHover] = useState(null);
  const shapes = useMemo(mgShapes, []);
  const paths = useMemo(() => {
    const out = {};
    MG_KEYS.forEach((k) => { out[k] = mgRoundedPath(shapes[k], MG_RADIUS); });
    out.hex = mgRoundedPath(shapes.hex, MG_RADIUS);
    return out;
  }, [shapes]);
  const u = width / 100;                      // viewBox 1단위 = u px
  // 보드 레이어를 네 버튼 윤곽 그대로 자르는 px 경로(버튼 모양·라운딩과 정확히 같다).
  const clip = useMemo(() => "path('" + MG_KEYS.map((k) => mgRoundedPath(shapes[k], MG_RADIUS, u)).join(" ") + "')", [shapes, u]);
  const box = (x, y, w, hgt) => ({ position: "absolute", left: x + "%", top: (y / MG_H * 100) + "%", width: w + "%", height: (hgt / MG_H * 100) + "%" });
  const onKey = (k) => (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onPick(k); } };
  const stripCell = MG_STRIP_CELL * u, stripW = MG_STRIP.cols * MG_STRIP_CELL, stripH = MG_STRIP.rows * MG_STRIP_CELL;
  const topY = -MG_BLEED, botY = 100 + MG_BLEED - stripH, leftX = -MG_BLEED, rightX = 50 + MG_GAP / 2 - MG_BLEED;
  const labelFont = "clamp(16px, 5.3cqw, 40px)";
  return (
    <div ref={measureRef} style={{ containerType: "inline-size", position: "relative", width: "100%", margin: "0 auto", aspectRatio: "1 / 1",
      // 최대 폭은 PlayPage가 정한다(PLAY_HUB_MAX_W 참고) — 일반 대국 버튼과 같은 폭.
      maxWidth }}>
      <style>{".mg-btn{cursor:pointer;outline:none;transition:fill .15s ease,stroke .15s ease}.mg-btn:focus-visible{stroke:" + T.brass + ";stroke-width:3px}"
        + "@keyframes mgPing{0%{opacity:0;transform:scale(.3) rotate(-60deg)}10%{opacity:1;transform:scale(1.15) rotate(0)}17%{transform:scale(1)}32%{opacity:1;transform:scale(1)}40%{opacity:0;transform:scale(.7)}100%{opacity:0;transform:scale(.7)}}"
        + "@keyframes mgSqFlash{0%{opacity:0}8%{opacity:1}32%{opacity:1}40%{opacity:0}100%{opacity:0}}"
        + "@keyframes mgTargetPulse{0%,100%{transform:scale(.86);opacity:.65}50%{transform:scale(1);opacity:1}}"
        + MG_LOOP_CSS
}</style>
      <svg viewBox="0 0 100 100" width="100%" height="100%" style={{ position: "absolute", inset: 0, display: "block", overflow: "visible" }}>
        <defs>
          <filter id="mg-shadow" x="-10%" y="-10%" width="120%" height="130%">
            <feDropShadow dx="0" dy="0.8" stdDeviation="1.1" floodColor="#000" floodOpacity="0.45" />
          </filter>
        </defs>
        {MG_KEYS.map((k) => (
          <path key={k} d={paths[k]} className="mg-btn" role="button" tabIndex={0} aria-label={MG_NAMES[k]} onClick={() => onPick(k)} onKeyDown={onKey(k)}
            onMouseEnter={() => setHover(k)} onMouseLeave={() => setHover((v) => (v === k ? null : v))}
            fill={hover === k ? "#F7EEDC" : T.paper} stroke={hover === k ? T.brass : "#DCCBA8"} strokeWidth="1" vectorEffect="non-scaling-stroke" filter="url(#mg-shadow)" />
        ))}
        <path d={paths.hex} fill={T.paper} stroke="#DCCBA8" strokeWidth="1" vectorEffect="non-scaling-stroke" filter="url(#mg-shadow)" style={{ pointerEvents: "none" }} />
      </svg>
      {/* 보드 레이어 — 네 버튼 윤곽으로 잘라 버튼 바깥 모서리에 여백 없이 붙인다. 클릭은 아래 SVG 버튼으로 통과. */}
      <div style={{ position: "absolute", inset: 0, pointerEvents: "none", clipPath: clip, WebkitClipPath: clip }}>
        {/* 위쪽 체스보드 띠 — 두 버튼에 걸쳐 체크 무늬가 이어진다. 조준경(좌표 인지 게임)·나이트(나이트 레이스). */}
        <div style={box(leftX, topY, stripW, stripH)}>
          <MgBoardPiece rows={MG_STRIP.rows} cols={MG_STRIP.cols} cellPx={stripCell} roundCorners={{ tl: true, tr: true }}>
            <MgCoordPings cellPx={stripCell} />
          </MgBoardPiece>
        </div>
        <div style={box(rightX, topY, stripW, stripH)}>
          <MgBoardPiece rows={MG_STRIP.rows} cols={MG_STRIP.cols} colOffset={MG_STRIP.cols} cellPx={stripCell} roundCorners={{ tl: true, tr: true }}>
            <MgKnightRun cellPx={stripCell} />
          </MgBoardPiece>
        </div>
        {/* 아래쪽 체스보드 띠 — 위와 같은 4×7 두 개가 이어진다. 무한 체크메이트(b–h 파일)·백랭크 러시아워(a–g 파일). */}
        <div style={box(leftX, botY, stripW, stripH)}>
          <MgBoardPiece rows={MG_STRIP.rows} cols={MG_STRIP.cols} colOffset={1} cellPx={stripCell} roundCorners={{ bl: true, br: true }}>
            <MgScenePlayer scenes={HUB_SCENES.mate} cellPx={stripCell} />
          </MgBoardPiece>
        </div>
        <div style={box(rightX, botY, stripW, stripH)}>
          <MgBoardPiece rows={MG_STRIP.rows} cols={MG_STRIP.cols} colOffset={MG_STRIP.cols + 1} cellPx={stripCell} roundCorners={{ bl: true, br: true }}>
            <MgScenePlayer scenes={HUB_SCENES.rush} cellPx={stripCell} />
          </MgBoardPiece>
        </div>
      </div>
      {/* 글자 레이어 — 가운데 엠블럼과 네 버튼 이름. */}
      <div style={{ position: "absolute", inset: 0, pointerEvents: "none", fontFamily: SITE_FONT }}>
        <div style={{ ...box(50 - MG_HEX_S, MG_HEX_CY - MG_HEX_A, 2 * MG_HEX_S, 2 * MG_HEX_A), display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: "0.9cqw", lineHeight: 1, letterSpacing: "-.02em", textAlign: "center", fontWeight: 900 }}>
          <img src="/OpenChessLogo.png" alt="OpenChess" style={{ display: "block", width: "72%", height: "auto", filter: "drop-shadow(0 1px 1px rgba(90,58,34,.25))" }} />
          <span style={{ fontSize: "4.4cqw", color: T.brass }}>MiniGame</span>
        </div>
        {MG_LABELS.map((lb) => {
          const st = stats && stats[lb.gameType];
          const rated = st && st.rated_games >= MINIGAME_PLACEMENT;
          const pos = { ...(lb.right ? { right: (100 - lb.x) + "%" } : { left: lb.x + "%" }), top: lb.top + "%" };
          return (
            <div key={lb.gameType} style={{ position: "absolute", ...pos, display: "flex", flexDirection: "column", alignItems: lb.right ? "flex-end" : "flex-start", textAlign: lb.right ? "right" : "left", gap: "0.6cqw", color: T.ink }}>
              <span style={{ fontSize: labelFont, fontWeight: 900, lineHeight: 1.15, letterSpacing: "-.03em", whiteSpace: "nowrap" }}>
                {lb.lines.map((l, i) => (
                  <span key={l} style={{ display: "flex", alignItems: "center", gap: "1.2cqw", justifyContent: lb.right ? "flex-end" : "flex-start" }}>
                    {l}
                    {/* 레이팅(배치 완료한 게임만)은 마지막 줄 옆 작은 칩으로 — 보드 쪽으로 줄이 늘어나지 않게 */}
                    {rated && i === lb.lines.length - 1 && <span style={{ fontSize: "clamp(9px, 2.2cqw, 14px)", fontWeight: 800, padding: "0.2em 0.6em", borderRadius: 999, background: "rgba(196,154,80,.18)", color: MG_GOLD, letterSpacing: 0, fontVariantNumeric: "tabular-nums" }}>{st.rating}</span>}
                  </span>
                ))}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
// ---- 좌표 인지 게임(coord) — 사용자 설계 1호 실시간 PvP 미니게임. 무작위 좌표가 나타나면 상대보다
// 먼저 그 칸을 클릭해야 점수를 가져간다(15라운드, 더 많이 맞힌 쪽 승리 — 라운드 수가 홀수라 게임
// 전체가 무승부로 끝나는 경우는 없다). 규칙·서버 권위 판정은 supabase-setup.sql의
// coord_reveal_next/coord_click/coord_finish 참고). 매칭은 기존 체스 PvP와 같은
// pvp_queue_join/pvp_queue_leave RPC를 game_type만 "coord"로 바꿔 그대로 재사용한다.
// (v0.5.1 리디자인, 사용자 요청) 내 보드·상대 보드를 따로 그리는 대신, 보드 하나만 화면 정중앙에
// 크게 쓰고 그 위에 나와 상대(또는 봇)의 클릭을 함께 표시한다 — 두 보드로 나누면 화면이 좁아지고
// "누가 어디를 눌렀는지"를 두 화면을 번갈아 봐야 알 수 있었는데, 한 보드에 같이 표시하면 그 자리에서
// 바로 비교된다. 또한 라운드 제한시간을 완전히 없앴다 — 예전엔 4초 안에 아무도 못 맞히면 그 라운드가
// 무승부로 자동 종료됐는데, 이제는 오답을 눌러도(양쪽 다) 라운드가 끝나지 않고 누군가 정답을 맞힐
// 때까지 계속 진행된다(coord_reveal_next/coord_click의 시간 기반 로직도 함께 제거 — 아래 SQL 주석
// 참고).
const COORD_GAME_TYPE = "coord";
const COORD_TOTAL_ROUNDS = 15;
const COORD_FILES = ["a", "b", "c", "d", "e", "f", "g", "h"];
// 대전 중 화면 — 매칭이 끝난 뒤(game이 확정된 뒤)만 렌더링된다. pvp_games 행 하나를 실시간
// 구독하며, sans(라운드 기록 배열)만 보고 내 점수·상대 점수·지금 라운드를 그때그때 다시 계산한다 —
// 이 컴포넌트 자신은 점수를 세는(mutate) 상태를 갖지 않고 항상 서버 값을 그대로 반영만 한다.
// 8×8 좌표 그리드 — 순수 표시용. 실시간 PvP(CoordRaceBoard)와 봇 대전(CoordRaceBotBoard) 둘 다 이
// 컴포넌트로 같은 보드를 그리고, 라운드 진행 로직(누가 어떻게 승자를 정하는지)만 서로 다르게 가져간다.
// (v0.5.0 리디자인, 사용자 요청) 목표 칸을 보드 위에서 빛나게 하는 대신, 그 좌표를 보드 아래
// 텍스트("e4" 형식)로 크게 띄운다 — 실제 좌표를 읽고 찾아 누르는 것 자체가 이 게임의 핵심이라,
// 칸이 미리 빛나 있으면 "인지" 없이 그 반짝임만 따라 누르는 반응 게임이 돼 버린다는 사용자 지적.
// (버그 수정, 사용자 재지적) 보드 자체는 Board 컴포넌트와 똑같이 SkinContext에서 지금 장착된 보드
// 스킨을 읽어와 그린다 — classic처럼 단색 스킨이면 단색으로, ocean·grandmaster처럼 실제 이미지
// 스킨이면 그 이미지 그대로 보이는, 사이트 어디서나 쓰는 바로 그 보드다(하드코딩된 classic 색이
// 아니다). (재지적) 칸끼리 간격을 두고 낱개 테두리·모서리를 준 "타일 그리드" 모양도 실제 Board와
// 달랐다 — Board와 완전히 같은 틀(BOARD_GLOSS 금색 테두리, 칸 사이 간격 0, 칸 자체엔 테두리·둥근
// 모서리 없음)을 그대로 가져다 쓴다.
// (v0.5.1 리디자인, 사용자 요청) 이 라운드 동안 내가·상대(또는 봇)가 실제로 클릭해 본 칸을 전부
// myClicks/oppClicks(각각 {sq, correct} 배열, 라운드가 바뀌면 초기화)로 받아, 같은 보드 위에 함께
// 표시한다. (재요청) 점을 찍는 대신 그 칸 자체의 색이 바뀌도록 바꿨다 — 정답이면 초록, 오답이면
// 빨강으로 칸 전체를 채우고, 누구 클릭인지는 칸 테두리 색(금색=나, 파란색=상대·봇)으로 구분한다.
// 같은 칸을 양쪽이 다 눌렀으면 대각선으로 반씩 나눠 두 결과를 함께 보여준다. (재요청) 보드에는
// 좌표축(파일 a~h, 랭크 1~8)과 시작 배치 그대로의 기물도 항상 함께 그린다 — 실제 체스판처럼 보이는
// 배경 위에서 좌표를 찾는 감각을 기르는 게 이 게임의 취지라, 좌표축·기물이 늘 보여야 "b6이 나이트
// 옆 칸"처럼 기물 위치를 기준으로 좌표를 가늠할 수 있다. 기물은 순수 배경 장식이라 클릭 판정에는
// 관여하지 않는다(버튼 자체가 칸이라 기물 위를 눌러도 그 칸이 클릭된다).
const COORD_START_BACK_RANK = ["R", "N", "B", "Q", "K", "B", "N", "R"];
// (v0.5.5 연출, 사용자 요청) 내가 누른 칸: 목록 버튼과 같은 청록 칸 + 조준경이 먼저 튀어나와 조준하고(COORD_AIM_MS),
// 그 뒤에 정답이면 초록 칸 + 체크, 오답이면 빨간 칸 + X가 떠오른다. 상대(봇) 클릭은 예전처럼 곧장 결과만 보인다.
const COORD_AIM_MS = 380;
// (v0.5.7, 사용자 요청 "여러 칸을 한꺼번에 클릭할 수 없도록") 한 번 누르면 COORD_CLICK_LOCK_MS 동안 다른 칸 입력을 받지 않는다 —
// 여러 손가락으로 동시에 누르거나(멀티터치) 칸을 마구 연타해 정답을 찍어 맞히는 것을 막는다. 대전·봇·혼자 모드 모두 이 격자를 쓴다.
const COORD_CLICK_LOCK_MS = 300;
// hideCoords — 보드 가장자리 좌표(a~h, 1~8)를 숨긴다(혼자 플레이 난이도 중·상). flip — 흑 진영이 아래로 오게 뒤집는다(난이도 상).
function CoordRaceGrid({ onCell, myClicks, oppClicks, size = 320, hideCoords, flip }) {
  const lockUntilRef = useRef(0);
  const oppInfo = useContext(MgOppContext);
  const press = (sq) => {
    const t = performance.now();
    if (t < lockUntilRef.current) return;
    lockUntilRef.current = t + COORD_CLICK_LOCK_MS;
    onCell(sq);
  };
  const ctx = useContext(SkinContext);
  const sk = BOARD_SKINS[ctx.boardSkin] || BOARD_SKINS.classic;
  const myBySq = {}; (myClicks || []).forEach((c) => { myBySq[c.sq] = c; });
  const oppBySq = {}; (oppClicks || []).forEach((c) => { oppBySq[c.sq] = c; });
  const cell = size / 8;
  const coordFont = Math.max(9, cell * 0.16);
  return (
    <div style={{ position: "relative", borderRadius: 4, overflow: "hidden", ...BOARD_GLOSS, boxSizing: "border-box", width: size, height: size, flexShrink: 0, display: "grid", gridTemplateColumns: "repeat(8,1fr)", gridTemplateRows: "repeat(8,1fr)" }}>
      <style>{COORD_GRID_CSS}</style>
      {Array.from({ length: 8 }, (_, vr) => vr).flatMap((vr) => COORD_FILES.map((_f, vc) => {
        // vr·vc는 화면상 위치, r·c는 실제 보드 위치(r=0이 8랭크, c=0이 a파일) — 뒤집으면 흑 진영(8랭크)이 아래로 온다.
        const r = flip ? 7 - vr : vr, c = flip ? 7 - vc : vc;
        const file = COORD_FILES[c];
        const rank = 8 - r;
        const sq = file + rank;
        const mine = myBySq[sq];
        const opp = oppBySq[sq];
        const light = (r + c) % 2 === 0;
        const pieceType = r === 0 ? COORD_START_BACK_RANK[c] : r === 1 ? "P" : r === 6 ? "P" : r === 7 ? COORD_START_BACK_RANK[c] : null;
        const pieceColor = r <= 1 ? "b" : "w";
        let overlayBg = null, borderColor = null;
        if (mine && opp) {
          const c1 = mine.correct ? COORD_OK_BG : COORD_NG_BG;
          const c2 = opp.correct ? COORD_OK_BG : COORD_NG_BG;
          overlayBg = "linear-gradient(135deg," + c1 + " 50%," + c2 + " 50%)";
          borderColor = "#fff";
        } else if (mine) {
          overlayBg = mine.correct ? COORD_OK_BG : COORD_NG_BG;
          borderColor = mine.correct ? "#2E8F3E" : T.blunder;
        } else if (opp) {
          overlayBg = opp.correct ? COORD_OK_BG : COORD_NG_BG;
          borderColor = "#6FA8DC";
        }
        return (
          <button key={sq} onClick={() => press(sq)} className="press"
            style={{ position: "relative", border: "none", borderRadius: 0, cursor: "pointer", padding: 0, display: "flex", alignItems: "center", justifyContent: "center", overflow: "hidden", ...boardSquareBg(sk, light, r, c) }}>
            {pieceType && <PieceGlyph type={pieceType} color={pieceColor} size={cell * 0.72} style={{ position: "relative", zIndex: 1 }} />}
            {/* 내 클릭: 조준(청록 칸 + 조준경) → COORD_AIM_MS 뒤 결과. 상대 클릭은 곧장 결과. */}
            {mine && <span aria-hidden="true" className="cc-anim" style={{ position: "absolute", inset: 0, zIndex: 2, background: "rgba(22,181,166,.45)", boxShadow: "inset 0 0 0 2px " + T.brilliant, animation: "ccAimSq " + COORD_AIM_MS + "ms ease-out both, ccFade 180ms ease-in " + COORD_AIM_MS + "ms forwards" }} />}
            {mine && <span aria-hidden="true" className="cc-anim" style={{ position: "absolute", inset: 0, zIndex: 3, display: "flex", alignItems: "center", justifyContent: "center", animation: "ccAim " + COORD_AIM_MS + "ms cubic-bezier(.2,.9,.3,1.2) both, ccFade 180ms ease-in " + COORD_AIM_MS + "ms forwards" }}><MgCrosshair size={Math.max(14, cell * 0.7)} /></span>}
            {overlayBg && <span aria-hidden="true" className="cc-anim" style={{ position: "absolute", inset: 0, background: overlayBg, boxShadow: "inset 0 0 0 2px " + borderColor, zIndex: 2, display: "flex", alignItems: "center", justifyContent: "center", animation: mine ? "ccResult 280ms cubic-bezier(.2,.9,.3,1.3) " + COORD_AIM_MS + "ms both" : "none" }}>
              {mine && !opp && (mine.correct ? <Check size={Math.max(12, cell * 0.5)} color="#fff" strokeWidth={3.2} style={{ filter: "drop-shadow(0 1px 1px rgba(0,0,0,.35))" }} /> : <X size={Math.max(12, cell * 0.5)} color="#fff" strokeWidth={3.2} style={{ filter: "drop-shadow(0 1px 1px rgba(0,0,0,.35))" }} />)}
            </span>}
            {/* (v0.5.7) 상대(또는 봇)가 누른 칸 — 우상단에 상대 프로필 사진을 작게 */}
            {opp && oppInfo && <MgOppBadge opp={oppInfo} size={Math.max(13, Math.round(cell * 0.34))} />}
            {!hideCoords && vc === 0 && <span aria-hidden="true" style={{ position: "absolute", top: 1, left: 2, fontSize: coordFont, fontWeight: 800, color: light ? "rgba(90,58,34,.75)" : "rgba(244,238,226,.75)", zIndex: 3, pointerEvents: "none" }}>{rank}</span>}
            {!hideCoords && vr === 7 && <span aria-hidden="true" style={{ position: "absolute", bottom: 0, right: 2, fontSize: coordFont, fontWeight: 800, color: light ? "rgba(90,58,34,.75)" : "rgba(244,238,226,.75)", zIndex: 3, pointerEvents: "none" }}>{file}</span>}
          </button>
        );
      }))}
    </div>
  );
}
// (v0.5.0 기능, 사용자 요청) 전체 진행 상황을 점 한 줄로 보여주는 "게임다운" 스코어보드 — 좌표 인지
// 게임(15라운드)·나이트 경주(Bo5) 둘 다 이 컴포넌트를 재사용한다. results[i]는 그 라운드가 이미
// 끝났으면 "me"(내 승리)·"opp"(상대/봇 승리)·"draw"(무승부), 아직이면 null — 지금 진행 중인
// 라운드(= results 배열의 다음 자리)는 금색 테두리로 강조해 어디까지 왔는지 한눈에 보이게 한다.
function MinigameScorePips({ results, total }) {
  return (
    <div style={{ display: "flex", gap: 4, justifyContent: "center", flexWrap: "wrap", marginBottom: 10, flexShrink: 0 }}>
      {Array.from({ length: total }, (_, i) => {
        const r = results[i];
        // (v0.5.1 UI, 사용자 요청) 전체화면 어두운 배경에서는 빈 슬롯이 rgba(0,0,0,.14)(검정 위에
        // 검정)로는 거의 안 보였다 — 밝은 반투명 회색으로 바꿨다.
        const bg = r === "me" ? T.best : r === "opp" ? T.blunder : r === "draw" ? "#9C8563" : "rgba(90,58,34,.16)";
        const active = i === results.length;
        return <span key={i} aria-hidden="true" style={{ width: 9, height: 9, borderRadius: "50%", background: bg, boxShadow: active ? "0 0 0 2px " + T.brass : "none", flexShrink: 0 }} />;
      })}
    </div>
  );
}
// ============================================================ 미니게임 공용 연출(v0.5.3) ============================================================
// (v0.5.3 기능, 사용자 요청: 기존 미니게임을 "최고 수준"으로 — 연출·사운드·피드백 우선) 네 미니게임이
// 함께 쓰는 연출 부품들. 효과음·진동은 src/lib/minigameFx.js(WebAudio 합성, 음원 파일 없음).
//  - MinigameCountdown: 라운드 시작 전 "3·2·1·시작!" 오버레이(틱·시작음). startAt(ms) 기준으로 그려,
//    PvP에서는 서버가 정한 같은 시작 시각을 두 참가자가 함께 본다.
//  - MinigameScoreHeader: 나/상대 점수판 — 점수가 오를 때마다 숫자가 튀어 오른다(score pop).
//  - MinigameRoundBanner: 라운드가 끝날 때 보드 위로 떠오르는 "라운드 승리/패배/무승부" 배너 + 효과음.
//  - MinigameResult: 최종 결과 화면 — 승리 시 금빛 파티클·팡파르, 라운드별 기록과 게임별 통계 카드,
//    "다시 하기"(봇·혼자 모드)와 "목록으로".
//  - useBoardShake: 오답·실패 때 보드를 좌우로 흔드는 애니메이션 컨트롤.
function useNow(active, ms = 100) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!active) return;
    const t = setInterval(() => setNow(Date.now()), ms);
    return () => clearInterval(t);
  }, [active, ms]);
  return now;
}
function MinigameCountdown({ startAt }) {
  const [now, setNow] = useState(() => Date.now());
  const lastRef = useRef(null);
  const active = startAt && now < startAt + 700;
  useEffect(() => {
    if (!startAt) return;
    const t = setInterval(() => setNow(Date.now()), 50);
    return () => clearInterval(t);
  }, [startAt]);
  const left = startAt ? startAt - now : 0;
  const label = left > 0 ? String(Math.min(3, Math.ceil(left / 1000))) : t("시작!");
  useEffect(() => {
    if (!active || lastRef.current === label) return;
    lastRef.current = label;
    if (label === t("시작!")) { fx("go"); buzz(40); } else fx("tick");
  }, [label, active]);
  if (!active) return null;
  return (
    <div aria-live="polite" style={{ position: "absolute", inset: 0, zIndex: 20, display: "flex", alignItems: "center", justifyContent: "center", background: left > 0 ? "rgba(250,244,230,.72)" : "transparent", backdropFilter: left > 0 ? "blur(2px)" : "none", borderRadius: 6, pointerEvents: left > 0 ? "auto" : "none", transition: "background .25s" }}>
      <AnimatePresence mode="popLayout">
        <motion.div key={label} initial={{ scale: 2.2, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.4, opacity: 0 }} transition={{ duration: 0.32, ease: MOTION_EASE }}
          style={{ fontSize: label === t("시작!") ? 44 : 84, fontWeight: 900, color: label === t("시작!") ? T.brass : T.ink, fontFamily: SITE_FONT, textShadow: "0 3px 14px rgba(90,58,34,.25), 0 0 30px " + (label === "시작!" ? "rgba(232,196,110,.6)" : "rgba(255,255,255,.25)") }}>
          {label}
        </motion.div>
      </AnimatePresence>
    </div>
  );
}
function ScorePop({ value, color }) {
  return (
    <span style={{ display: "inline-block", minWidth: 20, textAlign: "center" }}>
      <AnimatePresence mode="popLayout" initial={false}>
        <motion.span key={value} initial={{ y: -14, scale: 1.8, opacity: 0 }} animate={{ y: 0, scale: 1, opacity: 1 }} exit={{ y: 10, opacity: 0 }} transition={{ type: "spring", stiffness: 420, damping: 18 }}
          style={{ display: "inline-block", fontSize: 22, fontWeight: 900, color, fontFamily: SITE_FONT, fontVariantNumeric: "tabular-nums" }}>{value}</motion.span>
      </AnimatePresence>
    </span>
  );
}
// right — (v0.5.7) 상대 칸이 없는 혼자 플레이에서 오른쪽 자리에 넣을 요소(예: 다시하기 버튼).
function MinigameScoreHeader({ myScore, oppScore, oppLabel, center, right }) {
  const lead = myScore > oppScore ? "me" : oppScore > myScore ? "opp" : null;
  const oppInfo = useContext(MgOppContext); // (v0.5.7) 상대 점수 옆에 상대 프로필 사진 — 러시아워·무한 체크메이트처럼 보드를 따로 쓰는 게임에서도 상대가 보이게
  const side = (label, score, color, isLead, align) => (
    <div style={{ display: "flex", alignItems: "center", gap: 8, flexDirection: align === "right" ? "row-reverse" : "row", minWidth: 0 }}>
      {align === "right" && oppInfo && <MgOppBadge opp={oppInfo} size={20} inline />}
      <span style={{ fontSize: 11, fontWeight: 800, color: isLead ? T.ink : "rgba(90,58,34,.70)", whiteSpace: "nowrap" }}>{label}</span>
      <ScorePop value={score} color={color} />
    </div>
  );
  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, padding: "6px 12px", marginBottom: 8, borderRadius: 12, background: "linear-gradient(180deg,rgba(255,255,255,.55),rgba(255,255,255,.45))", border: "1px solid rgba(150,112,58,.37)", flexShrink: 0 }}>
      {side(t("나"), myScore, MG_GOLD, lead === "me", "left")}
      <div style={{ fontSize: 11, color: "rgba(90,58,34,.70)", fontWeight: 700, textAlign: "center", whiteSpace: "nowrap" }}>{center}</div>
      {oppLabel ? side(oppLabel, oppScore, "#8FC1EC", lead === "opp", "right") : (right || <span style={{ minWidth: 20 }} />)}
    </div>
  );
}
// result: "me" | "opp" | "draw" | null. roundKey가 바뀔 때마다 한 번씩만 효과음을 낸다.
function MinigameRoundBanner({ result, roundKey, text }) {
  const playedRef = useRef(null);
  useEffect(() => {
    if (!result || playedRef.current === roundKey) return;
    playedRef.current = roundKey;
    if (result === "me") { fx("roundWin"); buzz([30, 40, 30]); } else if (result === "opp") { fx("roundLose"); buzz(120); } else fx("roundDraw");
  }, [result, roundKey]);
  const color = result === "me" ? T.best : result === "opp" ? T.blunder : "#B89A6A";
  const label = text || (result === "me" ? t("라운드 승리") : result === "opp" ? t("라운드 패배") : t("무승부"));
  return (
    <div style={{ position: "absolute", inset: 0, zIndex: 15, display: "flex", alignItems: "center", justifyContent: "center", pointerEvents: "none" }}>
      <AnimatePresence>
        {result && (
          <motion.div key={roundKey} initial={{ y: 20, scale: 0.7, opacity: 0 }} animate={{ y: 0, scale: 1, opacity: 1 }} exit={{ y: -16, opacity: 0 }} transition={{ type: "spring", stiffness: 380, damping: 20 }}
            style={{ padding: "10px 22px", borderRadius: 14, background: "linear-gradient(180deg,#FFFAEE,#F3E6CB)", border: "2px solid " + color, boxShadow: "0 10px 26px -8px rgba(90,58,34,.45), 0 0 24px " + color + "55", fontSize: 18, fontWeight: 900, color, whiteSpace: "nowrap", fontFamily: SITE_FONT }}>{label}</motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
function useBoardShake() {
  const controls = useAnimationControls();
  const shake = useCallback(() => { controls.start({ x: [0, -9, 8, -6, 4, 0], transition: { duration: 0.36 } }); }, [controls]);
  return [controls, shake];
}
// 승리 시 결과 화면 위로 흩날리는 금빛 파티클(순수 장식).
function VictoryBurst() {
  const parts = useMemo(() => Array.from({ length: 26 }, (_, i) => ({ i, x: (Math.random() - 0.5) * 320, y: -80 - Math.random() * 220, r: Math.random() * 360, d: 0.9 + Math.random() * 0.8, s: 5 + Math.random() * 7, c: i % 3 === 0 ? T.brassHi : i % 3 === 1 ? "#F4E3B5" : T.best })), []);
  return (
    <div aria-hidden="true" style={{ position: "absolute", left: "50%", top: "38%", width: 0, height: 0, pointerEvents: "none" }}>
      {parts.map((p) => (
        <motion.span key={p.i} initial={{ x: 0, y: 0, opacity: 1, rotate: 0 }} animate={{ x: p.x, y: [0, p.y, p.y + 260], opacity: [1, 1, 0], rotate: p.r }} transition={{ duration: p.d + 0.8, ease: "easeOut", times: [0, 0.45, 1] }}
          style={{ position: "absolute", width: p.s, height: p.s * 0.55, borderRadius: 2, background: p.c }} />
      ))}
    </div>
  );
}
// outcome: "win" | "lose" | "draw". rounds: [{ result: "me"|"opp"|"draw", label, detail }].
// stats: [{ label, value }]. onRematch가 있으면 "다시 하기" 버튼을 함께 보여준다.
function MinigameResult({ outcome, myScore, oppScore, oppLabel, rounds, stats, note, onExit, onRematch, title: titleOverride, scoreText, rating, extraAction }) {
  const pvp = useContext(MgPvpContext); // (v0.5.7) 실시간 대전 결과면 재대국 신청 버튼
  useEffect(() => {
    if (outcome === "win") { fx("win"); buzz([40, 60, 40, 60, 120]); } else if (outcome === "lose") { fx("lose"); buzz(200); } else fx("roundDraw");
  }, [outcome]);
  // (v0.5.3) 혼자 플레이하기는 승패가 없어 title(예: "신기록!", "기록")·scoreText(예: "12개")로 바꿔 쓴다.
  const title = titleOverride || (outcome === "win" ? t("승리") : outcome === "lose" ? t("패배") : t("무승부"));
  const color = outcome === "win" ? MG_GOLD : outcome === "lose" ? T.blunder : "#9C8563";
  return (
    <div style={{ position: "relative", flex: 1, minHeight: 0, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", textAlign: "center", padding: "20px 6px", overflowY: "auto" }}>
      {outcome === "win" && <VictoryBurst />}
      <motion.div initial={{ scale: 0.4, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ type: "spring", stiffness: 260, damping: 16 }}
        style={{ fontSize: 40, fontWeight: 900, color, fontFamily: SITE_FONT, textShadow: outcome === "win" ? "0 0 28px rgba(232,196,110,.55)" : "none", marginBottom: 4 }}>{title}</motion.div>
      <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.15 }}
        style={{ display: "flex", alignItems: "center", gap: 14, fontSize: 13, fontWeight: 800, color: "rgba(90,58,34,.80)", marginBottom: 14 }}>
        {scoreText != null ? (typeof scoreText === "string" ? <span style={{ fontSize: 32, color: T.ink, fontFamily: SITE_FONT, fontVariantNumeric: "tabular-nums" }}>{scoreText}</span> : scoreText) : (<>
          <span>{t("나")}</span>
          <span style={{ fontSize: 32, color: T.ink, fontFamily: SITE_FONT, fontVariantNumeric: "tabular-nums" }}>{myScore} : {oppScore}</span>
          <span>{oppLabel}</span>
        </>)}
      </motion.div>
      {/* (v0.5.4) 실시간 대전 결과 — 랜덤 매칭이면 레이팅 변화, 친구 도전이면 친선전 안내. */}
      {rating && rating.unrated && <div style={{ fontSize: 10.5, fontWeight: 700, color: "rgba(90,58,34,.65)", marginBottom: 12 }}>{t("친선전: 전적만 기록, 레이팅 변동 없음")}</div>}
      {rating && !rating.unrated && <MinigameRatingChange rating={rating} />}
      {rounds && rounds.length > 0 && (
        <div style={{ display: "flex", flexWrap: "wrap", justifyContent: "center", gap: 6, marginBottom: 14, maxWidth: 380 }}>
          {rounds.map((r, i) => {
            const c = r.result === "me" ? T.best : r.result === "opp" ? T.blunder : "#9C8563";
            return (
              <motion.div key={i} initial={{ opacity: 0, scale: 0.6 }} animate={{ opacity: 1, scale: 1 }} transition={{ delay: 0.25 + i * 0.04 }}
                title={r.detail || ""}
                style={{ minWidth: 34, padding: "4px 6px", borderRadius: 8, background: c + "33", border: "1px solid " + c, fontSize: 10.5, fontWeight: 800, color: T.ink }}>
                <div style={{ opacity: 0.7 }}>{r.label || i + 1}</div>
                {r.detail && <div style={{ fontSize: 9.5, opacity: 0.85, marginTop: 1 }}>{r.detail}</div>}
              </motion.div>
            );
          })}
        </div>
      )}
      {stats && stats.length > 0 && (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(" + Math.min(3, stats.length) + ", minmax(0,1fr))", gap: 8, width: "100%", maxWidth: 360, marginBottom: 16 }}>
          {stats.map((s, i) => (
            <motion.div key={s.label} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.35 + i * 0.06 }}
              style={{ padding: "8px 6px", borderRadius: 10, background: "rgba(255,255,255,.55)", border: "1px solid rgba(150,112,58,.35)" }}>
              <div style={{ fontSize: 16, fontWeight: 900, color: T.ink, fontFamily: SITE_FONT }}>{s.value}</div>
              <div style={{ fontSize: 10, color: "rgba(90,58,34,.70)", marginTop: 2 }}>{s.label}</div>
            </motion.div>
          ))}
        </div>
      )}
      {note && <p style={{ fontSize: 11, color: "rgba(90,58,34,.70)", marginBottom: 14, maxWidth: 340, lineHeight: 1.5 }}>{note}</p>}
      <div style={{ display: "flex", gap: 8, alignItems: "flex-start", flexWrap: "wrap", justifyContent: "center" }}>
        {!onRematch && pvp && <MgPvpRematch pvp={pvp} />}
        {extraAction && <button onClick={extraAction.onClick} className="press" style={{ padding: "10px 16px", borderRadius: 10, border: "1px solid rgba(150,112,58,.45)", background: "transparent", color: T.ink, fontWeight: 800, fontSize: 12.5, cursor: "pointer" }}>{extraAction.label}</button>}
        {onRematch && <button onClick={onRematch} className="press" style={{ padding: "10px 22px", borderRadius: 10, border: "1px solid " + T.brass, background: "rgba(196,154,80,.14)", color: T.ink, fontWeight: 800, fontSize: 12.5, cursor: "pointer", display: "inline-flex", alignItems: "center", gap: 6 }}>{tx("{0}다시 하기", <RotateCcw size={14} />)}</button>}
        <button onClick={onExit} className="press" style={{ padding: "10px 26px", borderRadius: 10, border: "none", background: "linear-gradient(180deg," + T.brass + ",#A8842F)", color: "#241509", fontWeight: 800, fontSize: 12.5, cursor: "pointer" }}>{t("목록으로")}</button>
      </div>
    </div>
  );
}
// ============================================================ 라운드 정산 화면(v0.5.4) ============================================================
// (v0.5.4 기능, 사용자 요청 "라운드가 끝날 때마다 정산 페이지를 똑같은 디자인 형식으로") 라운드제 미니게임
// (나이트 경주 5전 3선승·러시아워 3판 2선승)에서 라운드가 확정될 때마다, 최종 결과 화면(MinigameResult)과
// 같은 디자인(큰 제목·점수·통계 카드·금색 버튼)으로 그 라운드를 정산해 보여준다 — 나와 상대의 결과·이동 수·
// 걸린 시간을 나란히 놓고 이긴 쪽을 강조하고, 왜 이겼는지(reason) 한 줄, 누적 스코어, 다음 라운드까지 남은
// 시간 막대를 띄운다. 보드 위 라운드 배너를 잠깐(ROUND_SETTLE_DELAY) 보여준 뒤 넘어가, 마지막 수(도착·잡힘)
// 장면이 묻히지 않게 한다. 실시간 대전은 두 사람이 같은 시각에 다음 라운드로 넘어가야 해서 건너뛰기 버튼이
// 없고, 봇·혼자 모드만 "다음 라운드"로 바로 넘길 수 있다.
const ROUND_SETTLE_DELAY = 900;
const ROUND_SETTLE_MS = 4500;
const ROUND_SETTLE_TOTAL = ROUND_SETTLE_DELAY + ROUND_SETTLE_MS;
// 라운드 roundKey가 확정(resolved)된 순간부터의 단계 — "play"(진행 중) → "banner"(보드 위 배너) → "settle"
// (정산 화면) → "done". 이미 오래전에 끝난 라운드(대전 재접속 등, resolvedAtMs가 한참 전)는 곧장 "done".
function useRoundSettle(roundKey, resolved, resolvedAtMs) {
  const [mark, setMark] = useState(null); // { key, t, skipped }
  useEffect(() => {
    if (!resolved) return;
    setMark((m) => (m && m.key === roundKey ? m : { key: roundKey, t: resolvedAtMs && Date.now() - resolvedAtMs > ROUND_SETTLE_TOTAL + 2000 ? -Infinity : Date.now(), skipped: false }));
  }, [resolved, roundKey, resolvedAtMs]);
  const active = !!(resolved && mark && mark.key === roundKey && !mark.skipped && Date.now() - mark.t < ROUND_SETTLE_TOTAL);
  const now = useNow(active, 150);
  const skip = useCallback(() => setMark((m) => (m ? { ...m, skipped: true } : m)), []);
  if (!resolved || !mark || mark.key !== roundKey) return { phase: resolved ? "banner" : "play", skip };
  const el = now - mark.t;
  if (mark.skipped || el >= ROUND_SETTLE_TOTAL) return { phase: "done", skip };
  if (el < ROUND_SETTLE_DELAY) return { phase: "banner", skip };
  return { phase: "settle", until: mark.t + ROUND_SETTLE_TOTAL, skip };
}
// rows: [{ label, me, opp, win: "me"|"opp"|null }] — opp가 없으면(혼자 플레이) 내 값만 한 칸으로 보여준다.
function MinigameRoundSettle({ roundNo, roundTotal, result, myScore, oppScore, oppLabel, rows, reason, sub, until, onNext, nextLabel = t("다음 라운드"), solo }) {
  useEffect(() => {
    if (result === "me") { fx("roundWin"); buzz([30, 40, 30]); } else if (result === "opp") { fx("roundLose"); buzz(120); } else fx("roundDraw");
  }, [result]);
  const now = useNow(true, 100);
  const left = Math.max(0, (until || now) - now);
  const title = solo ? (result === "me" ? t("도착 성공") : t("실패")) : result === "me" ? t("라운드 승리") : result === "opp" ? t("라운드 패배") : t("라운드 무승부");
  const color = result === "me" ? MG_GOLD : result === "opp" ? T.blunder : "#9C8563";
  const cellStyle = (hl) => ({ padding: "8px 6px", borderRadius: 10, background: hl ? "rgba(236,203,134,.16)" : "rgba(255,255,255,.55)", border: "1px solid " + (hl ? T.brassHi : "rgba(150,112,58,.35)"), textAlign: "center", minWidth: 0 });
  return (
    <div style={{ position: "relative", flex: 1, minHeight: 0, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", textAlign: "center", padding: "16px 6px", overflowY: "auto" }}>
      {result === "me" && <VictoryBurst />}
      <motion.div initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }} style={{ fontSize: 11.5, fontWeight: 800, letterSpacing: ".12em", color: "rgba(90,58,34,.65)", marginBottom: 4 }}>ROUND {roundNo}{roundTotal ? " / " + roundTotal : ""}</motion.div>
      <motion.div initial={{ scale: 0.4, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ type: "spring", stiffness: 260, damping: 16 }}
        style={{ fontSize: 34, fontWeight: 900, color, fontFamily: SITE_FONT, textShadow: result === "me" ? "0 0 28px rgba(232,196,110,.55)" : "none", marginBottom: 4 }}>{title}</motion.div>
      {!solo && (
        <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.12 }}
          style={{ display: "flex", alignItems: "center", gap: 14, fontSize: 13, fontWeight: 800, color: "rgba(90,58,34,.80)", marginBottom: 14 }}>
          <span>{t("나")}</span>
          <span style={{ fontSize: 30, color: T.ink, fontFamily: SITE_FONT, fontVariantNumeric: "tabular-nums" }}>{myScore} : {oppScore}</span>
          <span>{oppLabel}</span>
        </motion.div>
      )}
      {sub && <div style={{ fontSize: 11, color: "rgba(90,58,34,.70)", marginBottom: 10 }}>{sub}</div>}
      <div style={{ width: "100%", maxWidth: 360, display: "grid", gap: 6, marginBottom: 12 }}>
        {!solo && (
          <div style={{ display: "grid", gridTemplateColumns: "1fr 72px 1fr", gap: 6, fontSize: 10.5, fontWeight: 800, color: "rgba(90,58,34,.65)" }}>
            <span>{t("나")}</span><span /><span>{oppLabel}</span>
          </div>
        )}
        {rows.map((r, i) => (
          <motion.div key={r.label} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.25 + i * 0.07 }}
            style={{ display: "grid", gridTemplateColumns: solo ? "72px 1fr" : "1fr 72px 1fr", gap: 6, alignItems: "stretch" }}>
            {!solo && <div style={cellStyle(r.win === "me")}><div style={{ fontSize: 15, fontWeight: 900, color: T.ink, fontFamily: SITE_FONT }}>{r.me}</div></div>}
            <div style={{ display: "flex", alignItems: "center", justifyContent: "center", fontSize: 10.5, fontWeight: 800, color: "rgba(90,58,34,.70)" }}>{r.label}</div>
            {solo ? <div style={cellStyle(false)}><div style={{ fontSize: 15, fontWeight: 900, color: T.ink, fontFamily: SITE_FONT }}>{r.me}</div></div>
              : <div style={cellStyle(r.win === "opp")}><div style={{ fontSize: 15, fontWeight: 900, color: T.ink, fontFamily: SITE_FONT }}>{r.opp}</div></div>}
          </motion.div>
        ))}
      </div>
      {reason && <p style={{ fontSize: 11.5, color: "rgba(90,58,34,.82)", marginBottom: 14, maxWidth: 340, lineHeight: 1.5 }}>{reason}</p>}
      <div style={{ width: "100%", maxWidth: 260, marginBottom: 10 }}>
        <div style={{ height: 4, borderRadius: 999, background: "rgba(255,255,255,.55)", overflow: "hidden" }}>
          <div style={{ height: "100%", width: (100 * left / ROUND_SETTLE_MS) + "%", background: "linear-gradient(90deg,#A8842F," + T.brassHi + ")", transition: "width .1s linear" }} />
        </div>
        <div style={{ fontSize: 10.5, color: "rgba(90,58,34,.65)", marginTop: 5 }}>{tx("{0}까지 {1}초", nextLabel, Math.ceil(left / 1000))}</div>
      </div>
      {onNext && <button onClick={onNext} className="press" style={{ padding: "10px 26px", borderRadius: 10, border: "none", background: "linear-gradient(180deg," + T.brass + ",#A8842F)", color: "#241509", fontWeight: 800, fontSize: 12.5, cursor: "pointer" }}>{nextLabel}</button>}
    </div>
  );
}
const fmtSec = (ms) => (ms == null ? "-" : t("{0}초", ((Math.max(0, ms) / 1000).toFixed(1))));
// 나이트 경주 한 라운드 정산 행·사유. me/opp: { reached, moves, ms, captured } | null(미보고).
// dist — (v0.5.7) 거리 판정 라운드면 { basis, me, opp, meMs, oppMs }: 목표까지 거리·소모 시간 행과 사유를 더한다.
function knightSettleInfo(me, opp, result, par, solo, dist) {
  const st = (x) => (!x ? t("미완료") : x.reached ? t("도착") : x.captured ? t("잡힘") : t("실패"));
  const both = me && opp && me.reached && opp.reached;
  const rows = [
    { label: t("결과"), me: st(me), opp: st(opp), win: null },
    { label: t("이동 수"), me: me ? t("{0}수", (me.moves)) : "-", opp: opp ? t("{0}수", (opp.moves)) : "-", win: both && me.moves !== opp.moves ? (me.moves < opp.moves ? "me" : "opp") : null },
    { label: t("걸린 시간"), me: me && me.reached ? fmtSec(me.ms) : "-", opp: opp && opp.reached ? fmtSec(opp.ms) : "-", win: both && me.moves === opp.moves && me.ms !== opp.ms ? (me.ms < opp.ms ? "me" : "opp") : null },
  ];
  let reason;
  if (solo) reason = me && me.reached ? (me.moves <= par ? t("최소 수로 도착") : t("도착. 최소 {0}수로도 가능", par)) : me && me.captured ? t("상대 기물이 지배하는 칸에 들어가 나이트가 잡힘") : t("제한 안에 도착 못 함");
  else if (both) reason = me.moves !== opp.moves ? (result === "me" ? t("더 적은 수로 도착해 승리") : t("상대가 더 적은 수로 도착")) : result === "me" ? t("같은 수, 더 빨리 도착해 승리") : result === "opp" ? t("같은 수, 상대가 더 빨리 도착") : t("수도 시간도 같아 무승부");
  else if (me && me.reached) reason = opp && opp.captured ? t("상대 나이트가 잡혀 도착한 내가 승리") : t("나만 도착해 승리");
  else if (opp && opp.reached) reason = me && me.captured ? t("나이트가 잡혀 도착한 상대가 승리") : t("상대만 도착");
  else if (dist && dist.basis === "distance") reason = t("둘 다 도착 못 함. {0}", result === "me" ? t("내가 목표에 더 가까워 승리") : t("상대가 목표에 더 가까움"));
  else if (dist && dist.basis === "distanceTime") reason = t("둘 다 도착 못 했고 거리도 같음. {0}", result === "draw" ? t("시간도 같아 무승부") : result === "me" ? t("시간을 덜 써서 승리") : t("상대가 시간을 덜 씀"));
  else reason = t("둘 다 도착 못 함:{0}", result === "draw" ? t(" 무승부") : t(" 목표에 더 가까이 간 쪽 승리"));
  if (dist && (dist.basis === "distance" || dist.basis === "distanceTime")) {
    const dl = (d) => (d == null ? "-" : d >= 99 ? t("잡힘") : t("{0}수 거리", (d)));
    rows.push({ label: t("목표까지"), me: dl(dist.me), opp: dl(dist.opp), win: dist.me !== dist.opp ? ((dist.me ?? 99) < (dist.opp ?? 99) ? "me" : "opp") : null });
    if (dist.basis === "distanceTime") rows.push({ label: t("소모 시간"), me: fmtSec(dist.meMs), opp: fmtSec(dist.oppMs), win: dist.meMs !== dist.oppMs ? (dist.meMs < dist.oppMs ? "me" : "opp") : null });
  }
  return { rows, reason: reason + (par ? t(" (이 라운드 최소 {0}수)", par) : "") };
}
// 러시아워 한 라운드 정산 행·사유. me/opp: { solved, moves, ms, captured } | null.
function rushSettleInfo(me, opp, result, par) {
  const st = (x) => (!x ? t("미완료") : x.solved ? t("메이트") : x.captured ? t("룩 잡힘") : t("시간 초과"));
  const both = me && opp && me.solved && opp.solved;
  const rows = [
    { label: t("결과"), me: st(me), opp: st(opp), win: null },
    { label: t("이동 수"), me: me ? t("{0}수", (me.moves)) : "-", opp: opp ? t("{0}수", (opp.moves)) : "-", win: both && me.moves !== opp.moves ? (me.moves < opp.moves ? "me" : "opp") : null },
    { label: t("걸린 시간"), me: me && me.solved ? fmtSec(me.ms) : "-", opp: opp && opp.solved ? fmtSec(opp.ms) : "-", win: both && me.moves === opp.moves && me.ms !== opp.ms ? (me.ms < opp.ms ? "me" : "opp") : null },
  ];
  let reason;
  if (both) reason = me.moves !== opp.moves ? (result === "me" ? t("더 적은 수로 메이트해 승리") : t("상대가 더 적은 수로 메이트")) : result === "me" ? t("같은 수, 더 빨리 풀어 승리") : result === "opp" ? t("같은 수, 상대가 더 빨리 풂") : t("수도 시간도 같아 무승부");
  else if (me && me.solved) reason = opp ? t("나만 풀어 승리") : t("상대가 더 적은 수로 따라잡을 수 없어 승리");
  else if (opp && opp.solved) reason = me && me.captured ? t("룩이 잡힘. 푼 상대가 승리") : t("상대만 풂");
  else reason = t("둘 다 풀지 못해 무승부");
  return { rows, reason: reason + (par ? t(" (최단 {0}수)", par) : "") };
}
// 제한시간 막대 — 남은 비율이 25% 아래로 떨어지면 빨갛게 바뀌고 맥동한다.
function MinigameTimeBar({ pct }) {
  const low = pct < 0.25;
  return (
    <div style={{ height: 6, borderRadius: 999, background: "rgba(90,58,34,.12)", overflow: "hidden", marginBottom: 8, flexShrink: 0 }}>
      <motion.div animate={low ? { opacity: [1, 0.55, 1] } : { opacity: 1 }} transition={low ? { duration: 0.7, repeat: Infinity } : { duration: 0.2 }}
        style={{ width: (Math.max(0, Math.min(1, pct)) * 100) + "%", height: "100%", background: low ? T.blunder : "linear-gradient(90deg," + T.brass + "," + T.brassHi + ")", transition: "width .2s linear" }} />
    </div>
  );
}
// 보드 아래 크게 띄우는 목표 좌표 텍스트 — 라운드가 끝나(승자가 정해져) 다음 좌표를 기다리는
// 동안에는 자리만 차지하고 비워 둔다.
function CoordTargetLabel({ targetSq, roundIdx }) {
  return (
    <div style={{ textAlign: "center", margin: "10px 0", minHeight: 48, flexShrink: 0 }}>
      <AnimatePresence mode="popLayout">
        {targetSq && (
          <motion.span key={roundIdx + ":" + targetSq} initial={{ scale: 1.9, opacity: 0, y: -6 }} animate={{ scale: 1, opacity: 1, y: 0 }} exit={{ scale: 0.6, opacity: 0 }} transition={{ type: "spring", stiffness: 460, damping: 22 }}
            style={{ display: "inline-block", padding: "6px 24px", borderRadius: 12, background: "linear-gradient(180deg,#FFFAEE,#F3E6CB)", border: "1px solid " + T.brass, boxShadow: "0 0 22px rgba(232,196,110,.28)", fontSize: 28, fontWeight: 800, color: MG_GOLD, fontFamily: "ui-monospace,monospace", letterSpacing: ".04em" }}>{targetSq}</motion.span>
        )}
      </AnimatePresence>
    </div>
  );
}
// (v0.5.3 연출 강화) 좌표 인지 게임 공용 피드백 — 라운드마다 목표 좌표가 "내 화면에 뜬" 로컬 시각을
// 기억해 두었다가 내가 정답을 맞힌 순간의 반응속도(ms)를 잰다(서버 시각과 무관하게 내 화면 기준이라
// 네트워크 지연이 섞이지 않는다). 정답/오답 효과음·진동·보드 흔들림도 여기서 한 번에 처리한다.
function useCoordFeedback(roundIdx, targetSq) {
  const shownAtRef = useRef(0);
  const [reactions, setReactions] = useState([]); // 내가 가져간 라운드의 반응속도(ms)
  const [misses, setMisses] = useState(0);
  const [shakeControls, shake] = useBoardShake();
  useEffect(() => { if (targetSq) { shownAtRef.current = Date.now(); fx("whoosh"); } }, [roundIdx, targetSq]);
  // (v0.5.5 연출, 사용자 요청) 누른 칸에 조준경이 먼저 조준하고(COORD_AIM_MS) 그 뒤에 정답·오답 연출(효과음·진동·흔들림)이
  // 나온다 — 반응속도는 클릭한 순간 기준으로 잰다.
  const onMyClick = useCallback((correct) => {
    const rt = Date.now() - shownAtRef.current;
    if (correct) setReactions((rs) => [...rs, rt]); else setMisses((m) => m + 1);
    setTimeout(() => {
      if (correct) { fx("correct"); buzz(25); }
      else { fx("wrong"); buzz([60, 40, 60]); shake(); }
    }, COORD_AIM_MS);
  }, [shake]);
  const stats = useMemo(() => {
    const avg = reactions.length ? Math.round(reactions.reduce((a, b) => a + b, 0) / reactions.length) : null;
    const best = reactions.length ? Math.min(...reactions) : null;
    const fmt = (ms) => (ms == null ? "-" : t("{0}초", ((ms / 1000).toFixed(2))));
    return [{ label: t("평균 반응속도"), value: fmt(avg) }, { label: t("최고 반응속도"), value: fmt(best) }, { label: t("오답 클릭"), value: t("{0}회", (misses)) }];
  }, [reactions, misses]);
  return { onMyClick, shakeControls, stats };
}
function coordRoundChips(rounds, meKey, oppKey) {
  return rounds.map((r, i) => ({ result: r.winner === meKey ? "me" : r.winner === oppKey ? "opp" : "draw", label: String(i + 1), detail: r.sq }));
}
function CoordRaceBoard({ game: initialGame, myUid, onExit, onStatusChange }) {
  const [game, setGame] = useState(initialGame);
  const advanceLockRef = useRef(false);
  useEffect(() => { onStatusChange && onStatusChange(game.status); }, [game.status, onStatusChange]);
  useRealtimeTable("pvp_games", "id=eq." + initialGame.id, useCallback((payload) => {
    if (payload && payload.new) setGame(payload.new);
    else if (!payload) { sbSelect("pvp_games?id=eq." + initialGame.id + "&select=*").then((rows) => { if (rows && rows[0]) setGame(rows[0]); }).catch(() => { }); }
  }, [initialGame.id]), true, 3000);
  const isWhite = myUid === game.white_uid;
  const myColor = isWhite ? "w" : "b";
  const oppColor = isWhite ? "b" : "w";
  const rounds = game.sans || [];
  const roundIdx = Math.max(0, rounds.length - 1);
  const round = rounds[roundIdx] || null;
  const myScore = rounds.filter((r) => r.winner === myColor).length;
  const oppScore = rounds.filter((r) => r.winner === oppColor).length;
  const finished = game.status !== "active";
  // (v0.5.1 UI, 사용자 요청) 보드 하나만 화면 정중앙에 크게 쓴다 — 그 슬롯을 ResizeObserver로
  // 실측해 정사각형 한 변 길이를 구한다.
  const [boardSize, boardFitRef] = useSquareFit();
  // (v0.5.3 연출 강화) 첫 라운드 전 3초 카운트다운 — 매칭 직후 두 클라이언트가 거의 같은 순간에 이
  // 화면을 띄우므로, 각자 3초를 센 뒤에 첫 좌표를 요청한다(먼저 부른 쪽이 공개하고, 다른 쪽은 그
  // 결과를 받는다). 이미 라운드가 진행 중인 대국에 다시 들어온 경우엔 카운트다운 없이 바로 이어간다.
  const [countdownAt] = useState(() => ((initialGame.sans || []).length === 0 ? Date.now() + 3000 : 0));
  const [countdownDone, setCountdownDone] = useState(() => countdownAt === 0);
  useEffect(() => { if (countdownDone) return; const t = setTimeout(() => setCountdownDone(true), Math.max(0, countdownAt - Date.now())); return () => clearTimeout(t); }, [countdownAt, countdownDone]);
  // (v0.5.1 기능, 사용자 요청) 라운드 동안 내가·상대가 실제로 눌러 본 칸을 전부 기록해 보드 위에
  // 함께 표시한다(오답도 지워지지 않고 계속 남는다) — 라운드가 바뀌면 초기화한다. 내 클릭은 좌표가
  // 이미 공개돼 있어(round.sq) 서버 응답을 기다리지 않고 그 자리에서 바로 판정해 추가한다. 상대
  // 클릭은 coord_click이 (정답이든 오답이든) 매번 기록해 두는 round.clicks[상대색]을 realtime으로
  // 받아, 그 at(시각)이 바뀔 때마다 "새 클릭이 있었다"로 보고 추가한다.
  const [myClicks, setMyClicks] = useState([]); // [{ sq, correct }]
  const [oppClicks, setOppClicks] = useState([]);
  const lastOppClickAtRef = useRef(null);
  useEffect(() => { setMyClicks([]); setOppClicks([]); lastOppClickAtRef.current = null; }, [roundIdx]);
  useEffect(() => {
    const c = round && round.clicks && round.clicks[oppColor];
    if (!c || !c.at || c.at === lastOppClickAtRef.current) return;
    lastOppClickAtRef.current = c.at;
    if (!c.correct) fx("tap");
    setOppClicks((cs) => (cs.some((x) => x.sq === c.sq) ? cs : [...cs, { sq: c.sq, correct: c.correct }]));
  }, [round, oppColor]);
  const targetSq = round && !round.winner ? round.sq : null;
  const { onMyClick, shakeControls, stats } = useCoordFeedback(roundIdx, targetSq);
  // (v0.5.1 기능, 사용자 요청) 라운드 제한시간을 없앴다 — 누군가 정답을 맞혀 winner가 생길 때까지는
  // 그대로 두고, winner가 생긴 뒤에만(짧게 결과를 보여준 뒤) coord_reveal_next로 다음 라운드를
  // 요청한다. 두 참가자의 클라이언트가 거의 동시에 불러도 서버 쪽 행 잠금이 안전하게 막아준다.
  useEffect(() => {
    if (finished || !countdownDone) return;
    if (rounds.length === 0) { sbRpc("coord_reveal_next", { p_game_id: game.id }).then((g) => g && setGame(g)).catch(() => { }); return; }
    if (!round || !round.winner || rounds.length >= COORD_TOTAL_ROUNDS) return; // 마지막 라운드 뒤엔 다음 라운드가 없다 — 결과 확정은 아래 effect
    const delay = Math.max(500, 900 - (Date.now() - new Date(round.resolvedAt || round.revealedAt).getTime()));
    const t = setTimeout(() => {
      if (advanceLockRef.current) return;
      advanceLockRef.current = true;
      sbRpc("coord_reveal_next", { p_game_id: game.id }).then((g) => { advanceLockRef.current = false; if (g) setGame(g); }).catch(() => { advanceLockRef.current = false; });
    }, delay);
    return () => clearTimeout(t);
  }, [game.id, rounds.length, round && round.winner, finished, countdownDone]);
  // 총 라운드가 다 찼으면 결과를 확정한다 — coord_finish는 sans에 이미 서버가 기록해 둔 라운드
  // 승자만 다시 세어 계산하므로, 누가(또는 양쪽 다) 불러도 결과는 항상 같다.
  // (v0.5.7 BUG-033) 예전 의존성은 [game.id, rounds.length, finished]뿐이었다 — 마지막(15번째) 라운드가 공개될 때는 아직 승자가 없어
  // 그냥 지나가고, 그 뒤 승자가 기록돼도 라운드 수가 그대로라 이 effect가 다시 돌지 않아 결과가 확정되지 않았다(아래 reveal_next도
  // 15라운드에선 행을 그대로 돌려줘 아무 변화가 없었다). 마지막 라운드의 승자를 의존성에 넣는다. 서버도 마지막 라운드 정답 클릭에서
  // 곧장 결과를 확정한다(coord_click) — 둘 중 하나만 동작해도 바로 정산 화면이 뜬다.
  const lastWinner = rounds.length ? rounds[rounds.length - 1].winner : null;
  useEffect(() => {
    if (finished || rounds.length < COORD_TOTAL_ROUNDS || !lastWinner) return;
    sbRpc("coord_finish", { p_game_id: game.id }).then((g) => g && setGame(g)).catch(() => { });
  }, [game.id, rounds.length, lastWinner, finished]);
  const onCell = (sq) => {
    if (finished || !round || round.winner || !countdownDone) return;
    if (myClicks.some((x) => x.sq === sq)) return;
    const correct = sq === round.sq;
    onMyClick(correct);
    setMyClicks((cs) => [...cs, { sq, correct }]);
    sbRpc("coord_click", { p_game_id: game.id, p_round: roundIdx, p_sq: sq }).then((g) => g && setGame(g)).catch(() => { });
  };
  if (finished) {
    const iWon = (isWhite && game.status === "white_won") || (!isWhite && game.status === "black_won");
    const isDraw = game.status === "draw";
    const byForfeit = game.result_reason === "coord_forfeit";
    return <MinigameResult outcome={isDraw ? "draw" : iWon ? "win" : "lose"} myScore={myScore} oppScore={oppScore} oppLabel={t("상대")} rating={minigameRatingOf(game, myUid)}
      rounds={coordRoundChips(rounds.filter((r) => r.winner), myColor, oppColor)} stats={stats}
      note={byForfeit ? (iWon ? t("상대가 대전 포기") : t("대전 포기")) : null} onExit={onExit} />;
  }
  const lastDone = round && round.winner ? (round.winner === myColor ? "me" : round.winner === oppColor ? "opp" : "draw") : null;
  return (
    <div style={{ flex: 1, minHeight: 0, display: "flex", flexDirection: "column" }}>
      <MinigameScoreHeader myScore={myScore} oppScore={oppScore} oppLabel={t("상대")} center={t("{0} / {1} 라운드", (rounds.length ? roundIdx + 1 : 1), COORD_TOTAL_ROUNDS)} />
      <MinigameScorePips results={rounds.map((r) => r.winner === myColor ? "me" : r.winner === oppColor ? "opp" : r.winner === "draw" ? "draw" : null)} total={COORD_TOTAL_ROUNDS} />
      <div ref={boardFitRef} style={{ flex: 1, minHeight: 0, display: "flex", alignItems: "center", justifyContent: "center" }}>
        <motion.div animate={shakeControls} style={{ position: "relative" }}>
          <CoordRaceGrid size={boardSize} onCell={onCell} myClicks={myClicks} oppClicks={oppClicks} />
          {countdownAt > 0 && <MinigameCountdown startAt={countdownAt} />}
          <MinigameRoundBanner result={lastDone} roundKey={roundIdx} text={lastDone === "me" ? t("정답 +1") : lastDone === "opp" ? t("상대 득점") : null} />
        </motion.div>
      </div>
      <CoordTargetLabel targetSq={targetSq} roundIdx={roundIdx} />
    </div>
  );
}
// (v0.5.0 기능, 사용자 요청) 봇과 플레이하기 — 서버(pvp_games)를 전혀 쓰지 않는 완전한 로컬 시뮬레이션.
// 체스의 봇 대국과 같은 사상(네트워크 왕복 없이 클라이언트에서 그 자리에서 상대를 흉내 낸다)을 따른다.
// 라운드마다 무작위 좌표를 하나 고르고, 봇은 무작위 반응 시간(사람이 이길 수 있을 정도로 관대한
// 0.9~3.6초 — v0.5.3에서 0.5~2.6초보다 느리게 낮춤, 사용자 요청) 뒤에 정답을 "클릭"한다 — 내가 그보다 먼저 실제로 클릭하면 내가 그 라운드를 가져간다.
// (v0.5.1 기능, 사용자 요청) 제한시간을 없애 무승부 라운드 자체가 사라졌고(누군가 정답을 맞힐 때까지
// 계속 진행), 봇도 가끔(v0.5.3부터 50% 확률) 정답을 클릭하기 전에 오답을 한 번 눌러 보게 해서 "상대가 어디를
// 누르든 보드에 표시된다"는 기능이 봇 대전에서도 실제로 보이게 했다.
const COORD_BOT_REACT_MIN_MS = 900;
const COORD_BOT_REACT_MAX_MS = 3600;
function CoordRaceBotBoard({ onExit, onStatusChange, onRematch }) {
  const [rounds, setRounds] = useState([]); // [{ sq, winner: "w"|"b"|null }]
  const timersRef = useRef([]);
  const clearTimers = () => { timersRef.current.forEach(clearTimeout); timersRef.current = []; };
  useEffect(() => () => clearTimers(), []);
  const roundIdx = rounds.length - 1;
  const round = rounds[roundIdx] || null;
  const myScore = rounds.filter((r) => r.winner === "w").length;
  const botScore = rounds.filter((r) => r.winner === "b").length;
  const finished = rounds.length >= COORD_TOTAL_ROUNDS && round && round.winner;
  // (버그 수정) 봇 대전은 pvp_games 행이 없어 game.status가 없으므로, 실제 PvP처럼 onStatusChange로
  // "끝났다"는 사실을 부모(CoordRaceGame)에 알려야 한다 — 안 그러면 이미 끝난 대전인데도 뒤로가기가
  // "정말 나가시겠어요?"(기권 확인)를 계속 띄운다.
  useEffect(() => { onStatusChange && onStatusChange(finished ? "finished" : "active"); }, [finished, onStatusChange]);
  const [boardSize, boardFitRef] = useSquareFit();
  const [countdownAt] = useState(() => Date.now() + 3000);
  const [myClicks, setMyClicks] = useState([]); // [{ sq, correct }]
  const [botClicks, setBotClicks] = useState([]);
  useEffect(() => { setMyClicks([]); setBotClicks([]); }, [roundIdx]);
  const targetSq = round && !round.winner ? round.sq : null;
  const { onMyClick, shakeControls, stats } = useCoordFeedback(roundIdx, targetSq);
  const startRound = useCallback(() => {
    const sq = COORD_FILES[Math.floor(Math.random() * 8)] + (1 + Math.floor(Math.random() * 8));
    setRounds((rs) => [...rs, { sq, winner: null }]);
    const resolve = (winner) => setRounds((rs) => {
      const i = rs.length - 1;
      if (i < 0 || rs[i].winner) return rs;
      const copy = rs.slice(); copy[i] = { ...copy[i], winner };
      return copy;
    });
    if (Math.random() < 0.5) {
      const wrongDelay = 250 + Math.random() * 350;
      timersRef.current.push(setTimeout(() => {
        let wrongSq;
        do { wrongSq = COORD_FILES[Math.floor(Math.random() * 8)] + (1 + Math.floor(Math.random() * 8)); } while (wrongSq === sq);
        fx("tap");
        setBotClicks((cs) => (cs.some((x) => x.sq === wrongSq) ? cs : [...cs, { sq: wrongSq, correct: false }]));
      }, wrongDelay));
    }
    const botDelay = COORD_BOT_REACT_MIN_MS + Math.random() * (COORD_BOT_REACT_MAX_MS - COORD_BOT_REACT_MIN_MS);
    timersRef.current.push(setTimeout(() => {
      setBotClicks((cs) => (cs.some((x) => x.sq === sq) ? cs : [...cs, { sq, correct: true }]));
      resolve("b");
    }, botDelay));
  }, []);
  useEffect(() => {
    if (rounds.length !== 0) return;
    const t = setTimeout(startRound, Math.max(0, countdownAt - Date.now()));
    return () => clearTimeout(t);
  }, [startRound, rounds.length, countdownAt]);
  useEffect(() => {
    if (!round || !round.winner || rounds.length >= COORD_TOTAL_ROUNDS) return;
    const t = setTimeout(startRound, 900);
    timersRef.current.push(t);
    return () => clearTimeout(t);
  }, [round && round.winner, rounds.length, startRound]);
  const onCell = (sq) => {
    if (!round || round.winner) return;
    if (myClicks.some((x) => x.sq === sq)) return;
    const correct = sq === round.sq;
    onMyClick(correct);
    setMyClicks((cs) => [...cs, { sq, correct }]);
    if (correct) {
      // (버그 수정) 내가 먼저 맞히면 이 라운드에 예약해 둔 봇 타이머(오답·정답 클릭)를 바로 치운다 —
      // 예전엔 그대로 남아, 다음 라운드가 시작된 뒤에 뒤늦게 터지며 "마지막 라운드"(=새 라운드)를 봇
      // 승리로 끝내 버리거나 이전 좌표를 새 라운드 보드에 봇 클릭으로 찍는 일이 있었다.
      clearTimers();
      setRounds((rs) => { const i = rs.length - 1; if (rs[i].winner) return rs; const copy = rs.slice(); copy[i] = { ...copy[i], winner: "w" }; return copy; });
    }
  };
  if (finished) {
    const iWon = myScore > botScore, isDraw = myScore === botScore;
    return <MinigameResult outcome={isDraw ? "draw" : iWon ? "win" : "lose"} myScore={myScore} oppScore={botScore} oppLabel={t("봇")}
      rounds={coordRoundChips(rounds, "w", "b")} stats={stats} onExit={onExit} onRematch={onRematch} />;
  }
  const lastDone = round && round.winner ? (round.winner === "w" ? "me" : "opp") : null;
  return (
    <div style={{ flex: 1, minHeight: 0, display: "flex", flexDirection: "column" }}>
      <MinigameScoreHeader myScore={myScore} oppScore={botScore} oppLabel={t("봇")} center={t("{0} / {1} 라운드", (Math.max(1, rounds.length)), COORD_TOTAL_ROUNDS)} />
      <MinigameScorePips results={rounds.map((r) => r.winner === "w" ? "me" : r.winner === "b" ? "opp" : null)} total={COORD_TOTAL_ROUNDS} />
      <div ref={boardFitRef} style={{ flex: 1, minHeight: 0, display: "flex", alignItems: "center", justifyContent: "center" }}>
        <motion.div animate={shakeControls} style={{ position: "relative" }}>
          <CoordRaceGrid size={boardSize} onCell={onCell} myClicks={myClicks} oppClicks={botClicks} />
          <MinigameCountdown startAt={countdownAt} />
          <MinigameRoundBanner result={lastDone} roundKey={roundIdx} text={lastDone === "me" ? t("정답 +1") : lastDone === "opp" ? t("봇 득점") : null} />
        </motion.div>
      </div>
      <CoordTargetLabel targetSq={targetSq} roundIdx={roundIdx} />
    </div>
  );
}
// ============================================================ 미니게임 공용 허브(v0.5.3) ============================================================
// (v0.5.3, 사용자 요청: "네 모드 모두 혼자 플레이하기·봇과 플레이하기·친구와 플레이하기·랜덤 매칭이 가능하도록
// 하고 버튼 레이아웃도 통일") 네 게임이 제각각 복사해 갖고 있던 로비(대기열 합류/이탈·매칭 감시·친구 도전·
// 기권 확인)를 MinigameHub 하나로 합쳤다. 게임마다 다른 건 규칙 안내, 각 모드의 실제 화면(render*),
// 기권 RPC 이름뿐이다. 로비 버튼 배치는 MinigameLobby가 네 게임 모두 똑같이 그린다 — 위에 규칙 카드,
// 가운데 "혼자 플레이하기 · 봇과 플레이하기 · 랜덤 매칭" 3칸, 아래 "친구와 플레이하기" 목록.
// 대전·봇·혼자 모드에서 결과 화면의 "목록으로"(또는 기권)는 이 허브의 로비로 돌아온다.
const MINIGAME_BEST_KEY = "occ_minigame_best";
function loadMinigameBest(key) { try { return (JSON.parse(window.localStorage.getItem(MINIGAME_BEST_KEY) || "{}") || {})[key] ?? null; } catch { return null; } }
function saveMinigameBestLocal(key, value) { try { const all = JSON.parse(window.localStorage.getItem(MINIGAME_BEST_KEY) || "{}") || {}; all[key] = value; window.localStorage.setItem(MINIGAME_BEST_KEY, JSON.stringify(all)); } catch { } }
// (v0.5.4) 기록을 로컬에 남기는 동시에, 로그인해 있으면 서버(minigame_stats.best_*)에도 올려 랭킹에 반영한다.
function saveMinigameBest(key, value) { saveMinigameBestLocal(key, value); submitMinigameBest(key, value); }
// 혼자 플레이 기록 → 서버가 줄세우는 "높을수록 좋은" 숫자 하나. 나이트 경주만 {도달 수, 걸린 시간}이라
// 도달 수 ×100만 − 시간(ms)으로 합친다(도달 수가 같으면 빠른 쪽이 높다).
function minigameBestScore(game, v) {
  if (v == null) return null;
  if (game === "knight") return v.reached > 0 ? v.reached * 1e6 - Math.min(999999, Math.round(v.ms || 0)) : null;
  return typeof v === "number" && v > 0 ? v : null;
}
function submitMinigameBest(game, value) {
  const score = minigameBestScore(game, value);
  if (score == null || !SB_ON || !SB_TOKEN) return;
  sbRpc("minigame_submit_best", { p_game: game, p_score: score, p_detail: game === "knight" ? value : null }).catch(() => { });
}
// 러시아워 혼자 풀기의 "기록"은 전체 별 수다(레벨별 최소 수는 로컬 진행도에만 둔다).
function rushTotalStars(progress) { return RUSH_LEVELS.reduce((a, l) => a + (progress[l.id] ? rushStars(progress[l.id], l.par) : 0), 0); }
function minigameLocalBest(game) { return game === "rush" ? (rushTotalStars(loadRushProgress()) || null) : loadMinigameBest(game); }
// 내 전적 한 게임분 — tick이 바뀔 때마다(대전을 마치고 로비로 돌아올 때) 다시 읽는다. 읽은 김에 로컬 기록과
// 서버 기록을 맞춘다: 로컬이 더 좋으면(로그인 전에 세운 기록·v0.5.4 이전 기록) 서버로 올리고, 서버가 더
// 좋으면(다른 기기에서 세운 기록) 로컬에 받아 둔다 — 혼자 플레이 화면의 "이전 최고 기록"이 서버와 같아진다.
function useMinigameMyStats(myUid, game, tick) {
  const [row, setRow] = useState(null);
  useEffect(() => {
    if (!myUid) { setRow(null); return; }
    let cancelled = false;
    fetchMinigameStats(myUid).then((all) => {
      if (cancelled) return;
      const r = all[game] || null;
      const serverBest = r ? minigameBestFromServer(game, r.best_score, r.best_detail) : null;
      const localBest = minigameLocalBest(game);
      const ls = minigameBestScore(game, localBest), ss = minigameBestScore(game, serverBest);
      if (ls != null && (ss == null || ls > ss)) submitMinigameBest(game, localBest);
      else if (ss != null && game !== "rush" && (ls == null || ss > ls)) saveMinigameBestLocal(game, serverBest);
      setRow(r);
    }).catch(() => { });
    return () => { cancelled = true; };
  }, [myUid, game, tick]);
  return row;
}
// 로비 상단 — 내 레이팅·전적·혼자 최고 기록 + 랭킹 버튼.
function MinigameStatsBar({ myUid, game, row, onOpenRanking }) {
  const localBest = minigameLocalBest(game);
  const serverBest = row ? minigameBestFromServer(game, row.best_score, row.best_detail) : null;
  const best = (minigameBestScore(game, serverBest) || 0) > (minigameBestScore(game, localBest) || 0) ? serverBest : localBest;
  const placed = row && row.rated_games >= MINIGAME_PLACEMENT;
  const cell = (label, value, sub, first) => (
    <div style={{ minWidth: 0, flex: 1, padding: "2px 6px", textAlign: "center", borderLeft: first ? "none" : "1px solid " + MG_LOBBY_LINE }}>
      <div style={{ fontSize: 10.5, fontWeight: 700, color: "rgba(90,58,34,.6)", marginBottom: 3 }}>{label}</div>
      <div style={{ fontSize: 19, fontWeight: 900, color: T.ink, fontFamily: SITE_FONT, fontVariantNumeric: "tabular-nums", lineHeight: 1.1, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{value}</div>
      <div style={{ fontSize: 10, fontWeight: 700, color: "rgba(90,58,34,.55)", marginTop: 3, minHeight: 13, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{sub || ""}</div>
    </div>
  );
  return (
    <div style={{ ...MG_LOBBY_CARD_STYLE, padding: "12px 14px 14px" }}>
      <div className="flex items-center justify-between" style={{ marginBottom: myUid ? 12 : 8 }}>
        <span style={{ fontSize: 12, fontWeight: 800, color: T.ink }}>{t("내 기록")}</span>
        <button onClick={onOpenRanking} className="press" aria-label={t("랭킹")}
          style={{ display: "inline-flex", alignItems: "center", gap: 4, padding: "4px 8px 4px 9px", borderRadius: 999, border: "1px solid rgba(169,122,44,.35)", background: "rgba(196,154,80,.1)", color: MG_GOLD, fontSize: 11, fontWeight: 800, cursor: "pointer" }}>
          {tx("{0}랭킹{1}", <Trophy size={12} />, <ChevronRight size={12} />)}
        </button>
      </div>
      {myUid ? (
        <div style={{ display: "flex" }}>
          {cell(t("레이팅"), row ? row.rating : 1200, placed ? t("최고 {0}", row.peak_rating) : t("배치 {0}/{1}", Math.min(row ? row.rated_games : 0, MINIGAME_PLACEMENT), MINIGAME_PLACEMENT), true)}
          {cell(t("전적"), minigameRecordText(row), row && row.streak >= 2 ? t("{0}연승 중", (row.streak)) : row && row.best_streak >= 2 ? t("최다 {0}연승", row.best_streak) : null)}
          {cell(t("혼자 최고"), best == null ? "-" : minigameBestLabel(game, best))}
        </div>
      ) : (
        <div style={{ fontSize: 11.5, color: "rgba(90,58,34,.72)", lineHeight: 1.55 }}>{t("로그인하면 전적·레이팅·기록이 랭킹에 반영")}</div>
      )}
    </div>
  );
}
function MinigameSegmented({ value, options, onChange }) {
  return (
    <div style={{ display: "flex", padding: 3, borderRadius: 10, background: "rgba(255,255,255,.55)", border: "1px solid rgba(150,112,58,.35)" }}>
      {options.map((o) => {
        const on = o.key === value;
        return (
          <button key={o.key} onClick={() => !o.disabled && onChange(o.key)} disabled={o.disabled} className="press"
            style={{ flex: 1, padding: "6px 0", borderRadius: 8, border: "none", cursor: o.disabled ? "default" : "pointer", opacity: o.disabled ? 0.4 : 1, fontSize: 11.5, fontWeight: 800,
              background: on ? "linear-gradient(180deg," + T.brass + ",#A8842F)" : "transparent", color: on ? "#241509" : "rgba(90,58,34,.85)" }}>{o.label}</button>
        );
      })}
    </div>
  );
}
// 랭킹 한 줄 — 1~3위는 사이트 리더보드와 같은 메달 이미지, 내 행은 금색 테두리.
function MinigameRankRow({ r, game, kind, onOpenProfile, index }) {
  const p = r.pub || {};
  const name = p.nickname || p.displayId || r.username || "?";
  const value = kind === "best" ? minigameBestLabel(game, minigameBestFromServer(game, r.best_score, r.best_detail)) : r.rating;
  const sub = kind === "best" ? null : minigameRecordText(r);
  return (
    <motion.button initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.22, delay: Math.min(index, 12) * 0.03 }}
      onClick={() => onOpenProfile && r.username && onOpenProfile(r.username)} className="press"
      style={{ width: "100%", display: "flex", alignItems: "center", gap: 10, padding: "7px 10px", borderRadius: 10, cursor: "pointer", textAlign: "left",
        border: r.is_me ? "1.5px solid " + T.brassHi : "1px solid rgba(150,112,58,.29)", background: r.is_me ? "rgba(236,203,134,.14)" : "rgba(255,255,255,.035)" }}>
      <span style={{ width: 34, height: 34, flexShrink: 0, display: "inline-flex", alignItems: "center", justifyContent: "center" }}>
        {r.rank <= 3
          ? <img src={"/rank-" + r.rank + ".png"} alt={t("{0}위", (r.rank))} style={{ height: r.rank === 1 ? 34 : 29, width: "auto", filter: "drop-shadow(0 1px 2px rgba(0,0,0,.4))" }} />
          : <span style={{ fontSize: 13, fontWeight: 900, color: "rgba(90,58,34,.70)", fontFamily: SITE_FONT, fontVariantNumeric: "tabular-nums" }}>{r.rank}</span>}
      </span>
      {p.photo ? <img src={p.photo} alt="" style={{ width: 30, height: 30, borderRadius: 8, objectFit: "cover", flexShrink: 0 }} />
        : <span style={{ width: 30, height: 30, borderRadius: 8, flexShrink: 0, background: T.brass, color: "#241509", display: "inline-flex", alignItems: "center", justifyContent: "center", fontWeight: 800, fontSize: 12 }}>{name[0].toUpperCase()}</span>}
      <span style={{ minWidth: 0, flex: 1 }}>
        <span style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 12.5, fontWeight: 800, color: T.ink }}>
          <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{name}</span>
          {r.is_me && <span style={{ flexShrink: 0, fontSize: 9, fontWeight: 900, padding: "1px 5px", borderRadius: 999, background: T.brassHi, color: "#241509" }}>{t("나")}</span>}
        </span>
        {sub && <span style={{ display: "block", fontSize: 10, color: "rgba(90,58,34,.60)", marginTop: 1 }}>{sub}</span>}
      </span>
      <span style={{ flexShrink: 0, fontSize: 14, fontWeight: 900, color: r.rank <= 3 ? MG_GOLD : T.ink, fontFamily: SITE_FONT, fontVariantNumeric: "tabular-nums" }}>{value}</span>
    </motion.button>
  );
}
function MinigameLeaderboard({ game, myUid, onOpenProfile, onBack }) {
  const [kind, setKind] = useState("rating");
  const [scope, setScope] = useState("all");
  const [rows, setRows] = useState(null);
  const [err, setErr] = useState(false);
  useEffect(() => {
    if (!SB_ON) { setRows([]); return; }
    let cancelled = false;
    setRows(null); setErr(false);
    sbRpc("minigame_leaderboard", { p_game: game, p_kind: kind, p_scope: scope, p_limit: 50 })
      .then((r) => { if (!cancelled) setRows(Array.isArray(r) ? r : []); })
      .catch(() => { if (!cancelled) { setRows([]); setErr(true); } });
    return () => { cancelled = true; };
  }, [game, kind, scope]);
  const top = rows ? rows.filter((r) => r.rank <= 50) : [];
  const meOutside = rows ? rows.find((r) => r.is_me && r.rank > 50) : null;
  const empty = kind === "rating" ? t("랭킹 없음. 랜덤 매칭 {0}판을 마치면 등록", MINIGAME_PLACEMENT) : t("기록 없음. 혼자 플레이로 첫 기록 도전");
  // (v0.5.7) 데스크톱에서 탭·순위 줄이 화면 폭 끝까지 늘어나지 않게 로비(520px)보다 조금 넓은 폭으로 모은다.
  return (
    <div style={{ width: "100%", maxWidth: 600, margin: "0 auto", padding: "8px 2px 4px" }}>
      <div className="flex items-center justify-between" style={{ marginBottom: 10 }}>
        <button onClick={onBack} className="press" style={{ fontSize: 11.5, fontWeight: 800, color: "rgba(90,58,34,.85)", background: "transparent", border: "none", cursor: "pointer", display: "inline-flex", alignItems: "center", gap: 3, padding: 0 }}>{tx("{0}로비", <ChevronLeft size={14} />)}</button>
        <span style={{ fontSize: 13, fontWeight: 900, color: T.ink, display: "inline-flex", alignItems: "center", gap: 5 }}>{tx("{0}랭킹", <Trophy size={15} color={MG_GOLD} />)}</span>
        <span style={{ width: 40 }} />
      </div>
      <div style={{ display: "grid", gap: 6, marginBottom: 12 }}>
        <MinigameSegmented value={kind} onChange={setKind} options={[{ key: "rating", label: t("레이팅") }, { key: "best", label: t("혼자 플레이 기록") }]} />
        <MinigameSegmented value={scope} onChange={setScope} options={[{ key: "all", label: t("전체") }, { key: "friends", label: t("친구"), disabled: !myUid }]} />
      </div>
      {rows == null ? (
        <div style={{ textAlign: "center", padding: "28px 0" }}><PendingDots size={12} /></div>
      ) : top.length === 0 ? (
        <p style={{ textAlign: "center", fontSize: 11.5, color: "rgba(90,58,34,.70)", padding: "24px 10px", lineHeight: 1.6 }}>{err ? t("랭킹 로드 실패") : empty}</p>
      ) : (
        <div style={{ display: "grid", gap: 6 }}>
          {top.map((r, i) => <MinigameRankRow key={r.uid} r={r} game={game} kind={kind} onOpenProfile={onOpenProfile} index={i} />)}
          {meOutside && (<>
            <div style={{ textAlign: "center", color: "rgba(90,58,34,.45)", fontSize: 12, lineHeight: 1 }}>⋮</div>
            <MinigameRankRow r={meOutside} game={game} kind={kind} onOpenProfile={onOpenProfile} index={top.length} />
          </>)}
        </div>
      )}
      {kind === "rating" && <p style={{ fontSize: 10, color: "rgba(90,58,34,.55)", textAlign: "center", marginTop: 12, lineHeight: 1.5 }}>{t("레이팅은 랜덤 매칭에서만 변동. 친구 도전은 전적만 기록")}</p>}
    </div>
  );
}
// 대전 결과 화면에 넘길 레이팅 변화 — 레이팅 대전이면 { before, after }, 친선전이면 { unrated: true }.
function minigameRatingOf(game, myUid) {
  if (!game || game.status === "active" || game.status === "aborted") return null;
  if (!game.rated) return { unrated: true };
  const d = game.rating_delta && game.rating_delta[myUid === game.white_uid ? "w" : "b"];
  return d ? { before: d.before, after: d.after } : null;
}
function MinigameRatingChange({ rating }) {
  const diff = rating.after - rating.before;
  const shown = useRatingCountUp(rating.after, rating.before, 900);
  const c = diff > 0 ? "#3F8A3A" : diff < 0 ? T.blunder : "rgba(90,58,34,.80)";
  const Arrow = diff > 0 ? TrendingUp : diff < 0 ? TrendingDown : null;
  return (
    <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3 }}
      style={{ display: "inline-flex", alignItems: "center", gap: 8, padding: "6px 14px", borderRadius: 999, background: "rgba(255,255,255,.55)", border: "1px solid " + c, marginBottom: 14 }}>
      <span style={{ fontSize: 10.5, fontWeight: 800, color: "rgba(90,58,34,.70)" }}>{t("레이팅")}</span>
      <span style={{ fontSize: 17, fontWeight: 900, color: T.ink, fontFamily: SITE_FONT, fontVariantNumeric: "tabular-nums" }}>{shown}</span>
      <span style={{ display: "inline-flex", alignItems: "center", gap: 2, fontSize: 12.5, fontWeight: 900, color: c, fontVariantNumeric: "tabular-nums" }}>{Arrow && <Arrow size={14} />}{diff > 0 ? "+" + diff : diff}</span>
    </motion.div>
  );
}
function useRatingCountUp(target, from, ms) {
  const [v, setV] = useState(from);
  useEffect(() => {
    if (from === target) { setV(target); return; }
    const t0 = performance.now(); let raf;
    const step = (t) => { const k = Math.min(1, (t - t0) / ms); setV(Math.round(from + (target - from) * (1 - Math.pow(1 - k, 3)))); if (k < 1) raf = requestAnimationFrame(step); };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [target, from, ms]);
  return v;
}
function useMinigameMatch({ myUid, gameType, initialGame }) {
  const [game, setGame] = useState(initialGame || null);
  const [waiting, setWaiting] = useState(false);
  const [err, setErr] = useState("");
  const waitingRef = useRef(false);
  useEffect(() => { waitingRef.current = waiting; }, [waiting]);
  // 매칭 대기 중 이 화면을 벗어나면(뒤로가기 등) 대기열에 남지 않도록 정리한다.
  useEffect(() => () => { if (waitingRef.current) sbRpc("pvp_queue_leave", {}).catch(() => { }); }, []);
  const join = useCallback(async () => {
    if (!myUid) { setErr(t("로그인 후 이용 가능")); return; }
    setErr(""); setWaiting(true);
    try {
      const g = await sbRpcRow("pvp_queue_join", { p_time_control: "0-0", p_game_type: gameType });
      // (v0.5.5 버그 수정, 사용자 제보 "매칭 버튼을 누르면 대기열로 안 가고 바로 패배") 대기열에 상대가 없으면
      // pvp_queue_join은 SQL NULL을 돌려주는데, PostgREST는 이를 null이 아니라 "모든 필드가 null인 객체"로
      // 직렬화한다 — `if (g)`가 이걸 매칭된 대전으로 오인해 status가 null(=active 아님)인 빈 대전을 열었고,
      // 대전 화면이 곧장 "끝난 대전 → 패배"로 판정했다. 체스 PvP(joinPvpQueue)에서 v0.4.x에 고쳤던 것과 같은
      // 버그가 v0.5.3에서 미니게임 매칭 훅을 새로 만들며 되살아난 것 — 실제 대전(id가 있고 active)만 받는다.
      // 재접속 분기는 게임 종류와 무관하게 진행 중인 대전을 돌려주므로, 다른 게임(예: 체스)의 대전이면 열지 않는다.
      if (g && g.id != null && g.status === "active") {
        if (g.game_type && g.game_type !== gameType) { setErr(t("진행 중인 대전이 있음. 먼저 끝낼 것")); setWaiting(false); return; }
        setGame(g); setWaiting(false);
      }
    } catch { setErr(t("매칭 실패. 다시 시도")); setWaiting(false); }
  }, [myUid, gameType]);
  const leave = () => { setWaiting(false); sbRpc("pvp_queue_leave", {}).catch(() => { }); };
  const onMatch = useCallback((payload) => {
    if (payload && payload.new && payload.new.status === "active" && payload.new.game_type === gameType) { setGame(payload.new); setWaiting(false); }
    else if (!payload) join();
  }, [join, gameType]);
  useRealtimeTable("pvp_games", myUid ? "white_uid=eq." + myUid : null, onMatch, waiting && !!myUid, 5000);
  useRealtimeTable("pvp_games", myUid ? "black_uid=eq." + myUid : null, onMatch, waiting && !!myUid, 5000);
  const invite = useFriendPvpInvite({ myUid, gameType, onMatched: setGame });
  return { game, setGame, waiting, join, leave, err, friendList: invite.friendList, myInvite: invite.myInvite, sendInvite: invite.sendInvite, cancelInvite: invite.cancelInvite, inviteErr: invite.err };
}
// (v0.5.6 리디자인, 사용자 요청 "준비 화면을 더 세련되고 깔끔하게") 미니게임 준비 화면 — 폭을 520px로 모아 가운데에 두고,
// 내 기록 카드 → 플레이 모드(한 줄에 하나씩: 아이콘 타일·이름·설명·화살표) → 친구와 플레이하기 순으로 섹션을 나눈다. 규칙 설명은
// 화면에 늘 펼쳐 두지 않고 우상단 ? 버튼(MinigameHelpButton)을 눌렀을 때만 말풍선으로 보여 준다.
const MG_LOBBY_LINE = "rgba(150,112,58,.2)";
const MG_LOBBY_CARD = "rgba(255,255,255,.62)";
const MG_LOBBY_CARD_STYLE = { borderRadius: 14, background: MG_LOBBY_CARD, border: "1px solid " + MG_LOBBY_LINE, boxShadow: "0 1px 2px rgba(90,58,34,.06), 0 6px 18px -12px rgba(90,58,34,.35)" };
const MG_LOBBY_CSS = ".mg-row{transition:border-color .15s ease,background .15s ease,transform .08s ease}.mg-row:not(:disabled):hover{border-color:rgba(169,122,44,.55)!important;background:rgba(255,255,255,.85)!important}"
  + ".mg-row.primary:not(:disabled):hover{background:linear-gradient(180deg,#D6B064,#B48E3C)!important}";
function MgLobbyLabel({ children }) {
  return <div style={{ fontSize: 11.5, fontWeight: 800, color: "rgba(90,58,34,.6)", letterSpacing: ".02em", margin: "0 2px 8px" }}>{children}</div>;
}
function MinigameModeRow({ Icon, label, sub, onClick, disabled, primary, open, expandable }) {
  return (
    <button onClick={onClick} disabled={disabled} className={"press mg-row" + (primary ? " primary" : "")} aria-expanded={expandable ? !!open : undefined}
      style={{ width: "100%", display: "flex", alignItems: "center", gap: 12, padding: "11px 14px 11px 11px", textAlign: "left", cursor: disabled ? "default" : "pointer", opacity: disabled ? 0.55 : 1,
        ...MG_LOBBY_CARD_STYLE, ...(primary ? { background: "linear-gradient(180deg," + T.brass + ",#A8842F)", border: "1px solid rgba(120,84,30,.5)" } : null),
        ...(open ? { borderBottomLeftRadius: 0, borderBottomRightRadius: 0, borderColor: "rgba(169,122,44,.55)" } : null) }}>
      <span style={{ width: 40, height: 40, borderRadius: 11, flexShrink: 0, display: "inline-flex", alignItems: "center", justifyContent: "center",
        background: primary ? "rgba(36,21,9,.14)" : "rgba(196,154,80,.15)", color: primary ? "#241509" : MG_GOLD }}><Icon size={19} /></span>
      <span style={{ flex: 1, minWidth: 0 }}>
        <span style={{ display: "block", fontSize: 14, fontWeight: 800, color: primary ? "#241509" : T.ink, lineHeight: 1.25 }}>{label}</span>
        {sub && <span style={{ display: "block", fontSize: 11.5, fontWeight: 700, color: primary ? "rgba(36,21,9,.7)" : "rgba(90,58,34,.6)", marginTop: 2, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{sub}</span>}
      </span>
      <ChevronRight size={17} style={{ flexShrink: 0, color: primary ? "#241509" : "rgba(90,58,34,.45)", transform: open ? "rotate(90deg)" : "none", transition: "transform .2s ease" }} />
    </button>
  );
}
function MinigameLobby({ myUid, soloSub, botSub, botOptions, onSolo, onBot, onRandom, err, roster, footer, statsBar }) {
  const [pickBot, setPickBot] = useState(false);
  const botOpen = pickBot && !!botOptions;
  return (
    <div style={{ width: "100%", maxWidth: 520, margin: "0 auto", padding: "4px 0 8px", display: "flex", flexDirection: "column", gap: 20 }}>
      <style>{MG_LOBBY_CSS}</style>
      {statsBar}
      <div>
        <MgLobbyLabel>{t("플레이 모드")}</MgLobbyLabel>
        {err && <p style={{ fontSize: 11.5, color: T.blunder, margin: "0 2px 8px" }}>{err}</p>}
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <MinigameModeRow Icon={User} label={t("혼자 플레이하기")} sub={soloSub} onClick={onSolo} />
          <div>
            <MinigameModeRow Icon={Cpu} label={t("봇과 플레이하기")} sub={botSub} expandable={!!botOptions} open={botOpen} onClick={() => (botOptions ? setPickBot((v) => !v) : onBot(null))} />
            <AnimatePresence initial={false}>
              {botOpen && (
                <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} style={{ overflow: "hidden" }}>
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(" + botOptions.length + ",minmax(0,1fr))", gap: 6, padding: 8, borderRadius: "0 0 14px 14px", border: "1px solid rgba(169,122,44,.55)", borderTop: "none", background: "rgba(255,255,255,.45)" }}>
                    {botOptions.map((b) => (
                      <button key={b.key} onClick={() => onBot(b)} className="press mg-row" style={{ padding: "9px 0", borderRadius: 10, border: "1px solid " + MG_LOBBY_LINE, background: MG_LOBBY_CARD, color: T.ink, fontWeight: 800, fontSize: 12.5, cursor: "pointer" }}>
                        {b.label}{b.sub && <div style={{ fontSize: 10, fontWeight: 700, color: "rgba(90,58,34,.6)", marginTop: 2 }}>{b.sub}</div>}
                      </button>
                    ))}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
          <MinigameModeRow Icon={Shuffle} label={t("랜덤 매칭")} sub={myUid ? t("실시간 대전 상대 찾기") : t("로그인 후 이용 가능")} onClick={onRandom} disabled={!myUid} primary />
        </div>
      </div>
      {roster}
      {footer}
    </div>
  );
}
// (v0.5.6, 사용자 요청) 준비 화면 우상단 ? 버튼 — 누를 때만 게임 방법(예전엔 준비 화면에 늘 펼쳐 두던 규칙 설명)을 버튼에서
// 내려오는 말풍선으로 보여 준다. 바깥을 누르거나 Esc·닫기 버튼으로 닫는다.
function MinigameHelpButton({ title, children }) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef(null);
  useEffect(() => {
    if (!open) return undefined;
    const onDown = (e) => { if (wrapRef.current && !wrapRef.current.contains(e.target)) setOpen(false); };
    const onKey = (e) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("pointerdown", onDown);
    document.addEventListener("keydown", onKey);
    return () => { document.removeEventListener("pointerdown", onDown); document.removeEventListener("keydown", onKey); };
  }, [open]);
  return (
    <div ref={wrapRef} style={{ position: "relative", flexShrink: 0 }}>
      <button onClick={() => setOpen((v) => !v)} aria-label={t("게임 방법")} aria-expanded={open} className="press"
        style={{ width: 32, height: 32, borderRadius: 9, background: open ? T.brass : "rgba(255,255,255,.55)", border: "1px solid " + (open ? "rgba(120,84,30,.5)" : "rgba(90,58,34,.18)"), color: open ? "#241509" : T.ink, display: "inline-flex", alignItems: "center", justifyContent: "center", cursor: "pointer", fontSize: 15, fontWeight: 900, fontFamily: SITE_FONT, transition: "background .15s ease" }}>?</button>
      <AnimatePresence>
        {open && (
          <motion.div role="dialog" aria-label={t("{0} 게임 방법", (title))} initial={{ opacity: 0, scale: 0.92, y: -4 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0, scale: 0.95, y: -4 }} transition={{ duration: 0.16, ease: MOTION_EASE }}
            style={{ position: "absolute", top: 42, right: 0, zIndex: 20, width: "min(360px, calc(100vw - 28px))", transformOrigin: "calc(100% - 16px) -10px" }}>
            {/* 말풍선 꼬리 — ? 버튼 가운데를 가리킨다 */}
            <span aria-hidden="true" style={{ position: "absolute", top: -6, right: 11, width: 11, height: 11, background: "#FFFDF8", borderLeft: "1px solid " + MG_LOBBY_LINE, borderTop: "1px solid " + MG_LOBBY_LINE, transform: "rotate(45deg)", borderTopLeftRadius: 2 }} />
            <div style={{ borderRadius: 14, background: "#FFFDF8", border: "1px solid " + MG_LOBBY_LINE, boxShadow: "0 18px 40px -14px rgba(60,36,14,.45), 0 2px 6px rgba(60,36,14,.08)", padding: "13px 15px 14px", maxHeight: "min(70dvh, 560px)", overflowY: "auto" }}>
              <div className="flex items-center justify-between" style={{ marginBottom: 8 }}>
                <span style={{ fontSize: 13, fontWeight: 900, color: T.ink }}>{t("게임 방법")}</span>
                <button onClick={() => setOpen(false)} aria-label={t("닫기")} className="press" style={{ width: 24, height: 24, borderRadius: 7, border: "none", background: "transparent", color: "rgba(90,58,34,.55)", display: "inline-flex", alignItems: "center", justifyContent: "center", cursor: "pointer" }}><X size={15} /></button>
              </div>
              <div className="mg-help-body" style={{ textAlign: "left", fontSize: 12.5, lineHeight: 1.7, color: "rgba(90,58,34,.88)" }}>{children}</div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
      <style>{".mg-help-body>div+div,.mg-help-body>div>div+div{margin-top:6px}"}</style>
    </div>
  );
}
function MinigameForfeitConfirm({ onCancel, onConfirm, bot }) {
  return (
    <div onClick={onCancel} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.6)", zIndex: 200, display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}>
      <div onClick={(e) => e.stopPropagation()} style={{ maxWidth: 300, width: "100%", background: "linear-gradient(180deg,#F2E8D5,#E2D2B2)", borderRadius: 14, padding: 20, border: "1px solid #CDB98E", boxShadow: "0 20px 50px -10px rgba(0,0,0,.7)" }}>
        <div style={{ fontSize: 15, fontWeight: 800, color: T.ink, marginBottom: 6 }}>{t("정말 나갈까요?")}</div>
        <p style={{ fontSize: 13, color: T.inkSoft, marginBottom: 16 }}>{bot ? t("진행 중인 게임 종료, 기록 없음") : t("대전 포기 처리, 상대 승리")}</p>
        <div className="flex gap-2 justify-end">
          <button onClick={onCancel} className="press" style={{ padding: "8px 14px", borderRadius: 9, border: "1px solid #C9B58C", background: "transparent", color: T.ink, fontWeight: 700, cursor: "pointer" }}>{t("계속하기")}</button>
          <button onClick={onConfirm} className="press" style={{ padding: "8px 16px", borderRadius: 9, border: "none", background: T.blunder, color: "#fff", fontWeight: 800, cursor: "pointer" }}>{t("나가기")}</button>
        </div>
      </div>
    </div>
  );
}
// renderPvp/renderBot/renderSolo는 { onExit, onStatusChange, onRematch } 등을 받아 그 모드의 화면을 그린다.
// 각 모드 화면은 진행 중이면 onStatusChange("active"), 끝났으면 다른 값을 알린다 — "active"일 때만
// 뒤로가기가 기권 확인을 띄운다(러시아워 혼자 풀기처럼 알리지 않는 화면은 확인 없이 로비로 돌아간다).
// ---- (v0.5.7, 사용자 요청) 미니게임 상대 표시·재대국 ----
// MgOppContext — 지금 대전 상대({ photo, name } 또는 봇이면 { bot: true, name: "봇" }). 허브가 대전·봇 화면을 감싸 내려 주고, 보드·점수 줄이
// 상대가 누른 칸·상대 기물·상대 진행 표시의 우상단에 MgOppBadge(작은 프로필 사진)를 붙인다 — "지금 저건 상대가 한 것"이 한눈에 보이게.
// MgPvpContext — 실시간 대전 화면일 때만 { game, myUid, startNewGame }. MinigameResult가 이걸 보고 재대국 버튼(MgPvpRematch)을 그린다.
const MgOppContext = createContext(null);
const MG_BOT_OPP = { bot: true, name: t("봇") };
const MgPvpContext = createContext(null);
// 상대 프로필(사진·닉네임) — 대전 행의 두 참가자 중 내가 아닌 쪽.
function useMgOpponent(game, myUid) {
  const oppUid = game ? (game.white_uid === myUid ? game.black_uid : game.white_uid) : null;
  const [opp, setOpp] = useState(null);
  useEffect(() => {
    if (!oppUid) { setOpp(null); return; }
    let off = false;
    setOpp({ name: t("상대") });
    usersProfiles([oppUid]).then((m) => { if (off) return; const p = m[oppUid] || {}; setOpp({ photo: (p.pub && p.pub.photo) || null, name: (p.pub && p.pub.nickname) || p.username || t("상대") }); }).catch(() => { });
    return () => { off = true; };
  }, [oppUid]);
  return opp;
}
// 실시간 대전 결과 화면의 재대국 — 체스와 같은 pvp_rematch_offer(제안·수락이 한 함수, 새 대전은 같은 game_type)를 쓴다. 내가 먼저 누르면
// "상대 응답 기다리는 중"(다시 누르면 취소), 상대가 먼저 제안해 뒀으면 "재대국 수락". 새 대전이 만들어지면(rematch_game_id) 양쪽 모두
// 곧장 그 대전으로 넘어간다 — 받은 쪽이 결과 화면을 떠나 있으면 App의 GlobalMinigameRematchBanner가 화면 위에 수락/거절 알림을 띄운다.
function MgPvpRematch({ pvp }) {
  const { game: g0, myUid, startNewGame } = pvp;
  const [game, setGame] = useState(g0);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState("");
  const offeredRef = useRef(false);
  const startedRef = useRef(false);
  const go = useCallback(async (newId) => {
    if (startedRef.current || newId == null) return;
    startedRef.current = true;
    try { const rows = await sbSelect("pvp_games?id=eq." + newId + "&select=*"); if (rows && rows[0]) startNewGame(rows[0]); else startedRef.current = false; } catch { startedRef.current = false; }
  }, [startNewGame]);
  useRealtimeTable("pvp_games", "id=eq." + g0.id, useCallback(async (payload) => {
    let row = payload && payload.new;
    if (!row) { try { const rows = await sbSelect("pvp_games?id=eq." + g0.id + "&select=*"); row = rows && rows[0]; } catch { } }
    if (!row) return;
    setGame(row);
    if (row.rematch_game_id) go(row.rematch_game_id);
    else if (offeredRef.current && !row.rematch_offered_by) { offeredRef.current = false; setNote(t("상대가 재대국 거절")); }
  }, [g0.id, go]), true, 4000);
  // 제안해 둔 채 결과 화면을 떠나면 제안을 거둔다 — 안 그러면 상대가 나중에 수락했을 때 상대만 빈 대전에 들어간다.
  const gameIdRef = useRef(g0.id);
  useEffect(() => () => { if (offeredRef.current && !startedRef.current) sbRpc("pvp_rematch_decline", { p_game_id: gameIdRef.current }).catch(() => { }); }, []);
  const mine = game.rematch_offered_by === myUid, theirs = !!game.rematch_offered_by && !mine;
  const onClick = async () => {
    if (busy) return;
    setBusy(true); setNote("");
    try {
      if (mine) { await sbRpc("pvp_rematch_decline", { p_game_id: game.id }); offeredRef.current = false; setGame((g) => ({ ...g, rematch_offered_by: null })); }
      else {
        const r = await sbRpc("pvp_rematch_offer", { p_game_id: game.id });
        if (r && r.id !== game.id) go(r.id); // 상대가 먼저 제안해 둔 상태 → 곧장 새 대전
        else if (r) { offeredRef.current = true; setGame(r); if (r.rematch_game_id) go(r.rematch_game_id); }
      }
    } catch (e) { setNote(t("재대국 신청 실패")); }
    setBusy(false);
  };
  const label = mine ? t("상대 응답 대기 중… (취소)") : theirs ? t("재대국 수락") : t("재대국 신청");
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 6 }}>
      <button onClick={onClick} disabled={busy} className="press" style={{ padding: "10px 18px", borderRadius: 10, border: "1px solid " + T.brass, background: theirs ? "linear-gradient(180deg," + T.brass + ",#A8842F)" : "rgba(196,154,80,.14)", color: theirs ? "#241509" : T.ink, fontWeight: 800, fontSize: 12.5, cursor: busy ? "default" : "pointer", display: "inline-flex", alignItems: "center", gap: 6, whiteSpace: "nowrap" }}>
        {mine ? <PendingDots size={9} /> : <RotateCcw size={14} />}{label}
      </button>
      {note && <span style={{ fontSize: 10.5, fontWeight: 700, color: "rgba(90,58,34,.7)" }}>{note}</span>}
    </div>
  );
}
function MinigameHub({ title, gameType, myUid, onExit, onOpenProfile, initialGame, rules, lobbyExtra, footer, soloSub, botSub, botOptions, forfeitRpc, renderPvp, renderBot, renderSolo, soloScroll }) {
  const m = useMinigameMatch({ myUid, gameType, initialGame });
  const [mode, setMode] = useState(null); // null | { kind: "bot", opt } | { kind: "solo" }
  const [runKey, setRunKey] = useState(0);
  const [liveStatus, setLiveStatus] = useState(null);
  const [confirmForfeit, setConfirmForfeit] = useState(false);
  // (v0.5.4) 로비로 돌아올 때마다 statsTick을 올려 방금 끝난 대전·기록이 로비 전적 바에 바로 반영되게 한다.
  const [statsTick, setStatsTick] = useState(0);
  const myStats = useMinigameMyStats(myUid, gameType, statsTick);
  const toLobby = useCallback(() => { m.setGame(null); setMode(null); setLiveStatus(null); setStatsTick((t) => t + 1); }, [m.setGame]); // eslint-disable-line react-hooks/exhaustive-deps
  const start = (next) => { setLiveStatus(null); setRunKey((k) => k + 1); setMode(next); };
  const rematch = useCallback(() => { setLiveStatus(null); setRunKey((k) => k + 1); }, []);
  const inGame = !!m.game || !!mode;
  const requestExit = () => {
    if (inGame && liveStatus === "active") { setConfirmForfeit(true); return; }
    if (inGame) { toLobby(); return; }
    if (m.waiting) m.leave();
    if (m.myInvite) m.cancelInvite();
    onExit();
  };
  const doForfeit = async () => {
    setConfirmForfeit(false);
    if (m.game) { try { await sbRpc(forfeitRpc, { p_game_id: m.game.id }); } catch { } }
    toLobby();
  };
  const common = { runKey, onExit: toLobby, onStatusChange: setLiveStatus, onRematch: rematch };
  let body;
  const opp = useMgOpponent(m.game, myUid);
  const startNewGame = useCallback((g) => { setLiveStatus(null); m.setGame(g); }, [m.setGame]); // eslint-disable-line react-hooks/exhaustive-deps
  const pvpCtx = useMemo(() => (m.game ? { game: m.game, myUid, startNewGame } : null), [m.game, myUid, startNewGame]);
  if (m.game) body = <MgPvpContext.Provider value={pvpCtx}><MgOppContext.Provider value={opp}>{renderPvp({ ...common, runKey: "pvp" + m.game.id, game: m.game })}</MgOppContext.Provider></MgPvpContext.Provider>;
  else if (mode && mode.kind === "bot") body = <MgOppContext.Provider value={MG_BOT_OPP}>{renderBot({ ...common, opt: mode.opt })}</MgOppContext.Provider>;
  else if (mode && mode.kind === "solo") body = renderSolo(common);
  else if (mode && mode.kind === "rank") body = <MinigameLeaderboard game={gameType} myUid={myUid} onOpenProfile={onOpenProfile} onBack={toLobby} />;
  else if (m.waiting || m.myInvite) body = (
    <MatchmakingScreen active variant={m.myInvite ? "invite" : "queue"}
      opponent={m.myInvite ? { name: m.myInvite.toUsername || t("상대"), photo: m.myInvite.toPhoto } : null}
      timeControlLabel={title} onCancel={() => { if (m.waiting) m.leave(); if (m.myInvite) m.cancelInvite(); }} />
  );
  const inLobby = !m.game && !mode && !m.waiting && !m.myInvite;
  if (inLobby) body = (
    <MinigameLobby footer={footer} myUid={myUid} soloSub={soloSub} botSub={botSub} botOptions={botOptions}
      statsBar={<MinigameStatsBar myUid={myUid} game={gameType} row={myStats} onOpenRanking={() => start({ kind: "rank" })} />}
      onSolo={() => start({ kind: "solo" })} onBot={(opt) => start({ kind: "bot", opt })} onRandom={m.join} err={m.err || m.inviteErr}
      roster={<FriendPvpRoster lobby myUid={myUid} friendList={m.friendList} myInvite={m.myInvite} onInvite={m.sendInvite} onOpenProfile={onOpenProfile} />} />
  );
  const noScroll = !!m.game || (mode && mode.kind !== "rank" && !(mode.kind === "solo" && soloScroll));
  return (
    <MinigameScreen title={title} onBack={requestExit} noScroll={!!noScroll}
      headerRight={inLobby ? <MinigameHelpButton title={title}>{rules}{lobbyExtra && <div style={{ marginTop: 12 }}>{lobbyExtra}</div>}</MinigameHelpButton> : null}>
      {body}
      {confirmForfeit && <MinigameForfeitConfirm onCancel={() => setConfirmForfeit(false)} onConfirm={doForfeit} bot={!m.game} />}
    </MinigameScreen>
  );
}
// (v0.5.3) 좌표 인지 게임 — 혼자 플레이하기: 30초 타임어택. 좌표가 뜨면 맞힐 때마다 바로 다음 좌표가
// 뜨고, 30초 동안 몇 개를 맞혔는지로 기록에 도전한다(오답은 감점 없이 흔들림·오답 수로만 남는다).
const COORD_SOLO_MS = 30000;
// (v0.5.7, 사용자 요청) 혼자 플레이 난이도 — 하는 지금 그대로(좌표 표시, 백 시점), 중은 보드 가장자리 좌표를 지우고, 상은 좌표를 지운 채
// 흑 진영이 아래로 오게 뒤집는다. 맞힌 개수에 배율을 곱한 값이 최종 기록이다(하 ×1, 중 ×2 금색, 상 ×3 그랜드마스터 색).
const COORD_SOLO_LEVELS = [
  { key: "easy", label: t("하"), mult: 1, desc: t("좌표 표시 · 백 시점"), bg: "rgba(255,255,255,.7)", ink: T.ink, chip: "linear-gradient(180deg,#F4EBDA,#DCC9A4)" },
  { key: "mid", label: t("중"), mult: 2, desc: t("좌표 없이 · 백 시점"), hideCoords: true, bg: "linear-gradient(135deg,#FFF3D1,#F3D98E 55%,#D9A94A)", ink: "#4A3208", chip: "linear-gradient(135deg,#FDDB82,#C49A50 60%,#8A6428)" },
  { key: "hard", label: t("상"), mult: 3, desc: t("좌표 없이 · 흑 시점(보드 뒤집힘)"), hideCoords: true, flip: true, bg: "linear-gradient(135deg,rgba(185,131,255,.28),rgba(110,231,200,.26),rgba(255,143,209,.28))", ink: "#3B1F5E", chip: tierGradientCss("grandmaster") },
];
function coordSoloLevel(key) { return COORD_SOLO_LEVELS.find((l) => l.key === key) || COORD_SOLO_LEVELS[0]; }
// 혼자 플레이하기 진입점 — 난이도를 고른 뒤 보드를 연다. 이 컴포넌트는 key 없이 그려져 "다시하기"(보드만 새로 마운트)에도 난이도가
// 그대로 남고, 로비로 나가면(혼자 모드를 벗어나면) 사라져 다음에 다시 고른다.
function CoordSoloEntry({ runKey, onExit, onStatusChange, onRematch }) {
  const [levelKey, setLevelKey] = useState(null);
  if (!levelKey) return <CoordSoloLevelPick onPick={setLevelKey} />;
  return <CoordSoloBoard key={runKey} level={coordSoloLevel(levelKey)} onExit={onExit} onStatusChange={onStatusChange} onRematch={onRematch} onChangeLevel={() => setLevelKey(null)} />;
}
function CoordSoloLevelPick({ onPick }) {
  const best = loadMinigameBest("coord");
  return (
    <div style={{ flex: 1, minHeight: 0, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 10, padding: "12px 4px" }}>
      <MgLobbyLabel>{t("난이도 선택")}</MgLobbyLabel>
      <div style={{ fontSize: 11, color: "rgba(90,58,34,.72)", fontWeight: 700, marginTop: -4, marginBottom: 4, textAlign: "center" }}>{tx("30초 동안 맞힌 개수 × 난이도 배율 = 최종 기록{0}", best != null ? t(" · 최고 {0}점", best) : "")}</div>
      {COORD_SOLO_LEVELS.map((l, i) => (
        <motion.button key={l.key} onClick={() => onPick(l.key)} className="press" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.06 }}
          style={{ width: "100%", maxWidth: 420, display: "flex", alignItems: "center", gap: 12, padding: "12px 14px", borderRadius: 14, border: "1px solid " + MG_LOBBY_LINE, background: l.bg, cursor: "pointer", textAlign: "left", boxShadow: "0 2px 8px -4px rgba(90,58,34,.35)" }}>
          <span style={{ width: 40, height: 40, borderRadius: 12, background: l.chip, display: "inline-flex", alignItems: "center", justifyContent: "center", fontSize: 18, fontWeight: 900, color: l.key === "easy" ? T.ink : "#fff", textShadow: l.key === "easy" ? "none" : "0 1px 2px rgba(0,0,0,.35)", flexShrink: 0 }}>{l.label}</span>
          <span style={{ flex: 1, minWidth: 0 }}>
            <span style={{ display: "block", fontSize: 14, fontWeight: 900, color: l.ink }}>{tx("난이도 {0}", l.label)}</span>
            <span style={{ display: "block", fontSize: 11, fontWeight: 700, color: "rgba(90,58,34,.72)", marginTop: 2 }}>{l.desc}</span>
          </span>
          <CoordMultChip level={l} size={15} />
        </motion.button>
      ))}
    </div>
  );
}
// 배율 칩 — ×1 크림, ×2 금색, ×3 그랜드마스터 무지개.
function CoordMultChip({ level, size = 14 }) {
  return <span style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", padding: "3px 9px", borderRadius: 999, background: level.chip, color: level.key === "easy" ? T.ink : "#fff", fontSize: size, fontWeight: 900, fontFamily: SITE_FONT, textShadow: level.key === "easy" ? "none" : "0 1px 2px rgba(0,0,0,.4)", boxShadow: level.key === "hard" ? "0 0 10px rgba(185,131,255,.55)" : level.key === "mid" ? "0 0 8px rgba(232,196,110,.55)" : "none", whiteSpace: "nowrap", flexShrink: 0 }}>×{level.mult}</span>;
}
// 정산 화면의 "개수 × 배율 = 최종 기록" 연출 — 맞힌 개수 → 배율 칩이 튀어나오고 → 숫자가 최종값까지 올라가며 번쩍인다.
function CoordMultScore({ base, level }) {
  const final = base * level.mult;
  const [phase, setPhase] = useState(0); // 0 개수, 1 배율 등장, 2 곱하는 중, 3 최종
  const [shown, setShown] = useState(base);
  useEffect(() => {
    const t1 = setTimeout(() => setPhase(1), 700);
    const t2 = setTimeout(() => setPhase(2), 1350);
    return () => { clearTimeout(t1); clearTimeout(t2); };
  }, []);
  useEffect(() => {
    if (phase !== 2) return;
    if (final === base) { setPhase(3); return; }
    let raf; const t0 = performance.now(), dur = 650;
    const tick = (now) => { const k = Math.min(1, (now - t0) / dur); setShown(Math.round(base + (final - base) * (1 - Math.pow(1 - k, 3)))); if (k < 1) raf = requestAnimationFrame(tick); else { setPhase(3); fx("win"); } };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [phase, base, final]);
  return (
    <span style={{ display: "inline-flex", flexDirection: "column", alignItems: "center", gap: 2 }}>
      <span style={{ display: "inline-flex", alignItems: "center", gap: 10 }}>
        <motion.span key={phase >= 3 ? "fin" : "base"} initial={phase >= 3 ? { scale: 1.35 } : false} animate={{ scale: 1 }} transition={{ type: "spring", stiffness: 380, damping: 14 }}
          style={{ fontSize: 32, color: phase >= 3 ? level.ink : T.ink, fontFamily: SITE_FONT, fontVariantNumeric: "tabular-nums", ...(phase >= 3 && level.key !== "easy" ? { background: level.chip, WebkitBackgroundClip: "text", backgroundClip: "text", color: "transparent", filter: "drop-shadow(0 1px 1px rgba(0,0,0,.25))" } : {}) }}>
          {phase >= 2 ? shown : base}{phase >= 3 ? t("점") : phase === 2 ? "" : t("개")}
        </motion.span>
        <AnimatePresence>
          {phase >= 1 && phase < 3 && (
            <motion.span initial={{ scale: 0, rotate: -25, opacity: 0 }} animate={{ scale: 1, rotate: 0, opacity: 1 }} exit={{ scale: 0.4, opacity: 0, x: -30 }} transition={{ type: "spring", stiffness: 420, damping: 16 }}>
              <CoordMultChip level={level} size={18} />
            </motion.span>
          )}
        </AnimatePresence>
      </span>
      <span style={{ fontSize: 11, fontWeight: 800, color: "rgba(90,58,34,.72)", minHeight: 15 }}>{phase >= 3 ? t("최종 기록 · {0}개 × {1} (난이도 {2})", base, level.mult, level.label) : ""}</span>
    </span>
  );
}
const coordRandSq = (not) => { let sq; do { sq = COORD_FILES[Math.floor(Math.random() * 8)] + (1 + Math.floor(Math.random() * 8)); } while (sq === not); return sq; };
function CoordSoloBoard({ onExit, onStatusChange, onRematch, level = COORD_SOLO_LEVELS[0], onChangeLevel }) {
  const [startAt] = useState(() => Date.now() + 3000);
  const endAt = startAt + COORD_SOLO_MS;
  const now = useNow(true, 100);
  const started = now >= startAt, over = now >= endAt;
  const [target, setTarget] = useState(() => coordRandSq(null));
  const [n, setN] = useState(0);
  const [score, setScore] = useState(0);
  const [myClicks, setMyClicks] = useState([]);
  const [done, setDone] = useState([]); // 맞힌 좌표들(결과 칩용)
  const [flashes, setFlashes] = useState([]); // 방금 맞힌 칸(연출용, 잠깐만 남는다)
  const { onMyClick, shakeControls, stats } = useCoordFeedback(n, started && !over ? target : null);
  useEffect(() => { onStatusChange && onStatusChange(over ? "finished" : "active"); }, [over, onStatusChange]);
  const [best, setBest] = useState(null); // { prev, isNew }
  useEffect(() => {
    if (!over || best) return;
    // (v0.5.7) 기록은 맞힌 개수 × 난이도 배율(최종 기록) 기준 — 랭킹도 같은 값.
    const prev = loadMinigameBest("coord");
    const final = score * level.mult;
    const isNew = final > 0 && (prev == null || final > prev);
    if (isNew) saveMinigameBest("coord", final);
    setBest({ prev, isNew });
  }, [over, best, score, level.mult]);
  const [boardSize, boardFitRef] = useSquareFit();
  const onCell = (sq) => {
    if (!started || over || myClicks.some((x) => x.sq === sq)) return;
    const correct = sq === target;
    onMyClick(correct);
    if (correct) {
      setScore((v) => v + 1); setDone((d) => [...d, sq]); setMyClicks([]); setN((v) => v + 1); setTarget(coordRandSq(sq));
      // (v0.5.5) 맞히면 곧장 다음 좌표로 넘어가므로, 맞힌 칸은 조준 → 초록 연출이 끝날 때까지 잠깐 따로 남겨 둔다.
      const id = Date.now() + Math.random();
      setFlashes((fs) => [...fs, { sq, correct: true, id }]);
      setTimeout(() => setFlashes((fs) => fs.filter((f) => f.id !== id)), COORD_AIM_MS + 650);
    }
    else setMyClicks((cs) => [...cs, { sq, correct: false }]);
  };
  if (over) {
    if (!best) return null;
    return <MinigameResult outcome={best.isNew ? "win" : "draw"} title={best.isNew ? t("신기록") : t("시간 종료")} scoreText={<CoordMultScore base={score} level={level} />}
      rounds={done.map((sq, i) => ({ result: "me", label: String(i + 1), detail: sq }))} stats={stats}
      note={(best.prev != null ? t("이전 최고 기록 {0}점", best.prev) : t("첫 기록"))} onExit={onExit} onRematch={onRematch}
      extraAction={onChangeLevel ? { label: t("난이도 변경"), onClick: onChangeLevel } : null} />;
  }
  const left = endAt - Math.max(now, startAt);
  return (
    <div style={{ flex: 1, minHeight: 0, display: "flex", flexDirection: "column" }}>
      {/* (v0.5.7, 사용자 요청) 혼자 플레이 중에도 다시하기 — 보드를 새로 마운트해(허브의 onRematch = runKey 증가) 카운트다운·타이머·점수·
          클릭 기록을 모두 처음 상태로 되돌린다. 기록 저장은 시간이 다 됐을 때만 하므로 중간에 다시 해도 기록에 남지 않는다. */}
      <MinigameScoreHeader myScore={score} oppLabel={null} center={<span style={{ fontSize: 15, fontWeight: 900, color: left < 8000 ? T.blunder : T.ink, fontVariantNumeric: "tabular-nums" }}>{tx("{0}초", Math.ceil(left / 1000))}</span>}
        right={onRematch ? <button onClick={onRematch} className="press" aria-label={t("다시하기")} style={{ display: "inline-flex", alignItems: "center", gap: 4, padding: "5px 10px", borderRadius: 999, border: "1px solid rgba(150,112,58,.45)", background: "rgba(255,255,255,.6)", color: T.ink, fontSize: 11.5, fontWeight: 800, cursor: "pointer", whiteSpace: "nowrap" }}>{tx("{0}다시하기", <RotateCcw size={13} />)}</button> : null} />
      <MinigameTimeBar pct={left / COORD_SOLO_MS} />
      <div ref={boardFitRef} style={{ flex: 1, minHeight: 0, display: "flex", alignItems: "center", justifyContent: "center" }}>
        <motion.div animate={shakeControls} style={{ position: "relative" }}>
          <CoordRaceGrid size={boardSize} onCell={onCell} myClicks={[...myClicks, ...flashes.filter((f) => !myClicks.some((c) => c.sq === f.sq))]} oppClicks={[]} hideCoords={level.hideCoords} flip={level.flip} />
          <MinigameCountdown startAt={startAt} />
        </motion.div>
      </div>
      <CoordTargetLabel targetSq={started ? target : null} roundIdx={n} />
      <div className="flex items-center justify-center" style={{ gap: 6, fontSize: 10.5, color: "rgba(90,58,34,.65)", flexShrink: 0 }}>
        <span style={{ fontWeight: 800, color: level.ink }}>{tx("난이도 {0}", level.label)}</span><CoordMultChip level={level} size={10.5} />
        <span>· {loadMinigameBest("coord") == null ? t("첫 기록 도전") : t("최고 기록 {0}점", loadMinigameBest("coord"))}</span>
      </div>
    </div>
  );
}
// (v0.5.3) 나이트 경주 — 혼자 플레이하기: 봇 대전과 같은 5라운드(난이도 곡선 동일)를 봇 없이 풀어, 목표에
// 몇 번 도달했는지와 걸린 시간 합으로 기록에 도전한다(도달 수가 많을수록, 같으면 시간이 짧을수록 좋다).
function KnightSoloBoard({ onExit, onStatusChange, onRematch }) {
  const [rounds, setRounds] = useState([]);
  const idx = rounds.length - 1;
  const round = rounds[idx] || null;
  const finished = rounds.length >= KNIGHT_BO_TOTAL && round && round.winner;
  useEffect(() => { onStatusChange && onStatusChange(finished ? "finished" : "active"); }, [finished, onStatusChange]);
  const settle = useRoundSettle(idx, !!(round && round.winner));
  useEffect(() => {
    if (finished) return;
    if (rounds.length === 0) { setRounds([{ ...knightGenRound(0, { solo: true }), winner: null }]); return; }
    if (round && round.winner && settle.phase === "done") setRounds((rs) => (rs.length === idx + 1 ? [...rs, { ...knightGenRound(rs.length, { solo: true }), winner: null }] : rs));
  }, [rounds.length, round && round.winner, finished, settle.phase]); // eslint-disable-line react-hooks/exhaustive-deps
  const onRoundDone = useCallback((winner, mine) => {
    setRounds((rs) => { const i = rs.length - 1; if (i < 0 || rs[i].winner) return rs; const c = rs.slice(); c[i] = { ...c[i], winner, mine: mine ? { reached: mine.reached, moves: mine.moves, ms: mine.atMs, captured: !!mine.captured } : null }; return c; });
  }, []);
  const reached = rounds.filter((r) => r.mine && r.mine.reached);
  const totalMs = reached.reduce((a, r) => a + r.mine.ms, 0);
  const [best, setBest] = useState(null);
  useEffect(() => {
    if (!finished || best) return;
    const prev = loadMinigameBest("knight");
    const cur = { reached: reached.length, ms: totalMs };
    const isNew = cur.reached > 0 && (!prev || cur.reached > prev.reached || (cur.reached === prev.reached && cur.ms < prev.ms));
    if (isNew) saveMinigameBest("knight", cur);
    setBest({ prev, isNew });
  }, [finished, best]); // eslint-disable-line react-hooks/exhaustive-deps
  if (settle.phase === "settle") {
    const res = round.winner === "w" ? "me" : "opp";
    const info = knightSettleInfo(round.mine, null, res, round.par, true);
    return <MinigameRoundSettle solo roundNo={idx + 1} roundTotal={KNIGHT_BO_TOTAL} result={res} rows={info.rows.filter((r) => r.label !== t("결과"))} reason={info.reason}
      sub={t("지금까지 {0}회 도착", reached.length)} until={settle.until} onNext={settle.skip} nextLabel={finished ? t("최종 결과") : t("다음 라운드")} />;
  }
  if (finished && settle.phase === "done") {
    if (!best) return null;
    return <MinigameResult outcome={best.isNew ? "win" : "draw"} title={best.isNew ? t("신기록") : t("기록")} scoreText={t("{0} / {1} 도달", (reached.length), KNIGHT_BO_TOTAL)}
      rounds={rounds.map((r, i) => ({ result: r.winner === "w" ? "me" : "opp", label: "R" + (i + 1), detail: r.mine && r.mine.reached ? t("{0}수", (r.mine.moves)) : t("실패") }))}
      stats={knightResultStats(rounds.map((r) => r.mine))}
      note={best.prev ? t("이전 최고 기록 {0}회 도달 · {1}초", best.prev.reached, (best.prev.ms / 1000).toFixed(1)) : t("첫 기록")} onExit={onExit} onRematch={onRematch} />;
  }
  return (
    <div style={{ flex: 1, minHeight: 0, display: "flex", flexDirection: "column" }}>
      <MinigameScoreHeader myScore={reached.length} oppLabel={null} center={t("{0} / {1} 라운드 · 혼자 플레이", (Math.max(1, rounds.length)), KNIGHT_BO_TOTAL)} />
      <MinigameScorePips results={rounds.map((r) => r.winner === "w" ? "me" : r.winner === "b" ? "opp" : null)} total={KNIGHT_BO_TOTAL} />
      {round ? <KnightRaceBotRound key={idx} round={round} onRoundDone={onRoundDone} solo /> : <div style={{ textAlign: "center", padding: "20px 0" }}><PendingDots size={12} /></div>}
    </div>
  );
}
function CoordRaceGame({ myUid, onExit, onOpenProfile, initialGame }) {
  return (
    <MinigameHub title={t("좌표 인지 게임")} gameType={COORD_GAME_TYPE} myUid={myUid} onExit={onExit} onOpenProfile={onOpenProfile} initialGame={initialGame} forfeitRpc="coord_forfeit"
      rules={<>
        <div>{tx("• 무작위 좌표가 뜨면 {0} 그 칸 클릭. 15라운드 동안 더 많이 맞힌 쪽 승리", <b style={{ color: T.ink }}>{t("상대보다 먼저")}</b>)}</div>
        <div>{t("• 오답은 라운드가 끝나지 않음. 누군가 맞힐 때까지 계속")}</div>
        <div>{tx("• 혼자 플레이는 {0}. 난이도 하(×1) · 중(좌표 없음, ×2) · 상(좌표 없음 + 흑 시점, ×3), 기록은 맞힌 개수 × 배율", <b style={{ color: T.ink }}>{t("30초 타임어택")}</b>)}</div>
      </>}
      soloSub={loadMinigameBest("coord") == null ? t("30초 타임어택 · 난이도 3단계") : t("30초 · 난이도 3단계 · 최고 {0}점", loadMinigameBest("coord"))} botSub={t("15라운드")}
      renderPvp={(p) => <CoordRaceBoard key={p.runKey} game={p.game} myUid={myUid} onExit={p.onExit} onStatusChange={p.onStatusChange} />}
      renderBot={(p) => <CoordRaceBotBoard key={p.runKey} onExit={p.onExit} onStatusChange={p.onStatusChange} onRematch={p.onRematch} />}
      renderSolo={(p) => <CoordSoloEntry runKey={p.runKey} onExit={p.onExit} onStatusChange={p.onStatusChange} onRematch={p.onRematch} />} />
  );
}
function KnightRaceGame({ myUid, onExit, onOpenProfile, initialGame }) {
  const best = loadMinigameBest("knight");
  return (
    <MinigameHub title={t("나이트 레이스")} gameType={KNIGHT_GAME_TYPE} myUid={myUid} onExit={onExit} onOpenProfile={onOpenProfile} initialGame={initialGame} forfeitRpc="knight_forfeit"
      rules={<>
        <div>{tx("• 나이트로 목표 칸(★) 도달. {0}로 도착한 쪽이 라운드 승리, 같으면 {1} 도착한 쪽. 둘 다 못 가면 {2}, 거리도 같으면 {3} 승리. 제한시간은 10초에서 라운드마다 +2.5초, 7전 4선승", <b style={{ color: T.ink }}>{t("더 적은 수")}</b>, <b style={{ color: T.ink }}>{t("더 빨리")}</b>, <b style={{ color: T.ink }}>{t("목표에 더 가까운 쪽")}</b>, <b style={{ color: T.ink }}>{t("시간을 덜 쓴 쪽")}</b>)}</div>
        <div>{tx("• 1·2라운드는 방해 기물 없음. {0}, 라운드마다 증가. 상대 기물 칸에 도달하면 그 기물을 잡음. 상대가 지배하는 칸에 들어가면 내 나이트가 잡혀 라운드 종료. 공격선은 실제 체스처럼 다른 기물에 막힘", <b style={{ color: T.ink }}>{t("3라운드부터 상대 기물 등장")}</b>)}</div>
        <div>• {tx("{0}. 가장 어려운 라운드", <b style={{ color: T.ink }}>{t("7라운드에는 상대 퀸 등장")}</b>)}</div>
        <div>• {tx("{0}. 잡힌 쪽은 라운드 종료", <b style={{ color: T.ink }}>{t("상대 나이트 칸으로 이동하면 상대 나이트를 잡음")}</b>)}</div>
        <div>{tx("• 혼자 플레이는 7라운드를 모두 풀어 {0}으로 기록 도전", <b style={{ color: T.ink }}>{t("도달 횟수와 시간")}</b>)}</div>
      </>}
      soloSub={best ? t("7라운드 · 최고 {0}회", best.reached) : t("7라운드 기록 도전")} botSub={t("7전 4선승")}
      renderPvp={(p) => <KnightRaceBoard key={p.runKey} game={p.game} myUid={myUid} onExit={p.onExit} onStatusChange={p.onStatusChange} />}
      renderBot={(p) => <KnightRaceBotBoard key={p.runKey} onExit={p.onExit} onStatusChange={p.onStatusChange} onRematch={p.onRematch} />}
      renderSolo={(p) => <KnightSoloBoard key={p.runKey} onExit={p.onExit} onStatusChange={p.onStatusChange} onRematch={p.onRematch} />} />
  );
}
// ---- 나이트 경주(knight) — 사용자 설계 2호 실시간 PvP 미니게임. (v0.5.1 재설계, 사용자 요청) 두
// 참가자의 나이트·목표 칸을 보드 하나에 함께 그린다 — 목표 칸을 기준으로 두 시작 칸을 점대칭(180도
// 회전 대칭)으로 배치해 공정한 조건을 만든다(나이트 이동 벡터는 두 축 부호를 모두 뒤집어도 여전히
// 유효한 나이트 수라, 점대칭인 두 칸은 목표까지의 최短 거리가 항상 정확히 같다). 예전의 "방해
// 칸"(착지 자체가 금지된 칸) 대신, 서로 상대 색의 기물(비숍·룩)을 역시 점대칭으로 배치해 둔다 — 그
// 기물이 실제로 공격하는 칸에 들어가면 나이트가 잡혀 그 경로로는 더 이상 목표에 도달할 수 없다. 각자
// 자기 나이트로 먼저 목표 칸에 도달해야 그 라운드를 가져간다(5전 3선승, Bo5). 규칙·서버 권위 판정은
// supabase-setup.sql의 knight_start_round/knight_report/knight_resolve_round 참고.
const KNIGHT_GAME_TYPE = "knight";
const KNIGHT_BO_TOTAL = 7; // (v0.5.8, 사용자 요청) Bo7 — 7전 4선승
const KNIGHT_BO_TARGET = 4;
// 서버(knight_neighbors)와 완전히 같은 규칙의 클라이언트용 나이트 이웃 계산 — 어떤 칸을 눌러도 되는지
// (합법 수인지) 보드에서 즉시 판정하는 용도일 뿐, 서버는 이 결과를 신뢰하지 않고 최종 요약만 받는다
// (체스 pvp_move가 SAN을 신뢰하는 것과 같은 모델 — 위 SQL 주석 참고). p_illegal은 이제 "방해 칸"이
// 아니라 그 나이트 색 기준으로 위협 기물에게 잡히는(들어가면 안 되는) 칸 목록이다.
// (v0.5.1 신규) 칸 sq를 중심 칸 center 기준으로 점대칭(180도 회전) 이동한 칸을 구한다 — 보드 밖으로
// 나가면 null. supabase-setup.sql의 knight_reflect_sq와 완전히 같은 공식.
// (v0.5.1 신규) 위협 기물(비숍/룩)이 실제로 지배(공격)하는 칸 — 다른 기물에 막히는 것은 고려하지
// 않고 보드 끝까지 미끄러진다. supabase-setup.sql의 knight_attacked_squares와 완전히 같은 규칙.
// (v0.5.4 규칙 변경, 사용자 요청) 상대 기물은 더 이상 "못 가는 칸"을 만드는 벽이 아니다.
// ① 나이트가 상대 기물(색이 다른 hazards) 칸에 도달하면 그 기물을 잡아 없앤다 — 그 기물이 지배하던 칸도
//    함께 안전해진다. ② 상대 기물이 지배하는 칸에 들어가면 나이트가 잡혀 그 라운드 시도가 그대로 끝난다.
// ③ 자기 색 기물 칸에는 설 수 없다(실제 체스처럼). 서버 knight_danger와 같은 공식이다.
// color 나이트가 설 수 없는 칸 — 아직 남아 있는 자기 색 기물(상대 나이트가 잡아 간 것은 빼고).
// 한 수를 두었을 때 — 상대 기물을 잡았는지(tookPiece), 그 뒤 내 나이트가 잡혔는지(captured).
// 8×8 나이트 경주 보드 — 순수 표시용. 실시간 PvP(KnightRaceRound)와 봇 대전(KnightRaceBotRound) 둘
// 다 이 컴포넌트로 같은 보드를 그리고, 라운드 진행·판정 로직만 서로 다르게 가져간다.
// (버그 수정, 사용자 재지적) 보드·기물 모두 Board/PieceGlyph와 똑같이 SkinContext에서 지금 장착된
// 스킨을 읽어와 그린다 — ocean·grandmaster처럼 실제 이미지 스킨이면 그 이미지 그대로 보이는, 사이트
// 어디서나 쓰는 바로 그 보드·기물이다(하드코딩된 classic이 아니다). 칸끼리 간격을 두고 낱개 테두리·
// 모서리를 준 "타일 그리드" 모양도 실제 Board와 달랐다 — Board와 완전히 같은 틀(BOARD_GLOSS 금색
// 테두리, 칸 사이 간격 0, 칸 자체엔 테두리·둥근 모서리 없음)을 그대로 가져다 쓴다.
// (v0.5.1 리디자인, 사용자 요청) 내 보드·상대 보드로 나누던 것을 보드 하나로 합쳤다 — 내 나이트
// (myColor)·상대 나이트(oppColor)·목표 칸·위협 기물(hazards)을 모두 같은 보드 위에 그린다. flip이
// 참이면(내가 흑일 때) 보드를 180도 뒤집어, 시작 칸이 어느 색으로 배정됐든 항상 내 나이트가 내
// 화면의 아래쪽에 오도록 한다(서버가 백을 항상 목표보다 낮은 랭크에 배정해 두므로, 표준 체스처럼
// "내 색이 흑이면 보드를 뒤집는다"는 규칙만으로 이게 보장된다).
// (v0.5.4) dangerForMe — 들어가면 잡히는 칸(빨강, 이제 누를 수는 있다), removed — 잡혀서 사라진 기물 칸,
// myCaptured/oppCaptured — 그 나이트가 잡혀 시도가 끝났으면 흐리게 + 빨간 X로 그린다.
// judge(흑백 기준) → 정산 화면용(나/상대 기준)
function knightDistView(judge, myColor) {
  if (!judge || (judge.basis !== "distance" && judge.basis !== "distanceTime")) return null;
  const w = myColor === "w";
  return { basis: judge.basis, me: w ? judge.wDist : judge.bDist, opp: w ? judge.bDist : judge.wDist, meMs: w ? judge.wMs : judge.bMs, oppMs: w ? judge.bMs : judge.wMs };
}
// ---- (v0.5.7, 사용자 요청) 거리 판정 연출 ----
// 둘 다 목표에 못 닿은 라운드는 목표까지의 나이트 거리로 판정한다(knightJudge / 서버 knight_resolve_round의 round.judge). 그걸 눈으로
// 보여 주려고, 목표 칸에서 나이트 수(한 번 뛸 때마다 한 겹)로 칸들이 차례로 금색으로 물들며 퍼져 나간다 — 두 나이트 칸은 판정에 쓴 실제
// 거리(위협 칸을 피해 잰 값, 잡힌 나이트는 닿지 않음)의 겹에서 물든다. 더 가까운 나이트 칸이 먼저 물들고, 그 칸에 체크메이트 승자 연출
// (초록 칸 + 흰 왕관 + "승자", GameEndFx)이 뜬다. 거리가 같으면 두 칸이 동시에 물든 뒤 각자 소모 시간을 띄우고, 적게 쓴 쪽에 왕관.
const KD_STEP_MS = 320;          // 한 겹 퍼지는 간격
const KD_CAP = 8;                // 연출할 최대 겹(거리 99 = 잡힘은 물들지 않는다)
function knightDistFxPlan(judge) {
  if (!judge || (judge.basis !== "distance" && judge.basis !== "distanceTime")) return null;
  const lit = (d) => (d == null || d >= 99 ? null : Math.min(d, KD_CAP) * KD_STEP_MS);
  const wAt = lit(judge.wDist), bAt = lit(judge.bDist);
  const tie = judge.basis === "distanceTime";
  const winAt = judge.winner === "w" ? wAt : judge.winner === "b" ? bAt : Math.max(wAt || 0, bAt || 0);
  const timesAt = tie ? (winAt || 0) + 350 : null;
  const crownAt = (winAt || 0) + (tie ? 1250 : 320);
  const totalMs = crownAt + (judge.winner === "draw" ? 900 : GAME_END_MS + 350);
  return { wAt, bAt, tie, timesAt, crownAt, totalMs };
}
function knightDistFxMs(judge) { const p = knightDistFxPlan(judge); return p ? p.totalMs : 0; }
const KD_CSS = "@keyframes kdLit{0%{opacity:0;transform:scale(.55)}55%{opacity:1;transform:scale(1.06)}100%{opacity:1;transform:scale(1)}}"
  + "@keyframes kdRing{0%{opacity:.9;transform:translate(-50%,-50%) scale(0)}100%{opacity:0;transform:translate(-50%,-50%) scale(1)}}";
function KnightDistFx({ size, flip, target, info }) {
  const { judge, wSq, bSq } = info;
  const plan = knightDistFxPlan(judge);
  const [stage, setStage] = useState(0); // 1 시간 표시, 2 왕관
  useEffect(() => {
    if (!plan) return;
    const ts = [];
    if (plan.timesAt != null) ts.push(setTimeout(() => setStage((s) => Math.max(s, 1)), plan.timesAt));
    ts.push(setTimeout(() => { setStage(2); fx(judge.winner === "draw" ? "roundDraw" : "roundWin"); }, plan.crownAt));
    return () => ts.forEach(clearTimeout);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const layers = useMemo(() => {
    // 목표에서의 나이트 거리(벽 없이) — 일반 칸의 물드는 겹
    const d = {}; const q = [target]; d[target] = 0;
    while (q.length) { const sq = q.shift(); for (const n of knightNeighborsClient(sq, [])) if (d[n] == null) { d[n] = d[sq] + 1; q.push(n); } }
    return d;
  }, [target]);
  if (!plan) return null;
  const cell = size / 8;
  const rc = (sq) => { const r = 8 - parseInt(sq.slice(1), 10), c = sq.charCodeAt(0) - 97; return flip ? [7 - r, 7 - c] : [r, c]; };
  const maxAt = Math.max(plan.wAt || 0, plan.bAt || 0, plan.crownAt - 320);
  const cells = [];
  for (const sq of Object.keys(layers)) {
    let at = Math.min(layers[sq], KD_CAP) * KD_STEP_MS;
    if (sq === wSq) at = plan.wAt; else if (sq === bSq) at = plan.bAt;
    if (at == null || at > maxAt) continue;
    const [vr, vc] = rc(sq);
    const knight = sq === wSq || sq === bSq;
    cells.push(<span key={sq} aria-hidden="true" style={{ position: "absolute", left: vc * cell, top: vr * cell, width: cell, height: cell, zIndex: 1, pointerEvents: "none",
      background: sq === target ? "rgba(236,203,134,.75)" : knight ? "rgba(236,190,90,.72)" : "rgba(236,203,134,.42)", boxShadow: "inset 0 0 0 " + (knight ? 3 : 1.5) + "px " + (knight ? T.brassHi : "rgba(236,203,134,.85)"),
      animation: "kdLit 360ms cubic-bezier(.2,.9,.3,1.2) " + at + "ms both" }} />);
  }
  const [tr, tc] = rc(target);
  const pill = (sq, ms, win) => {
    const [vr, vc] = rc(sq);
    return (
      <motion.span key={"t" + sq} initial={{ opacity: 0, y: 6, scale: 0.8 }} animate={{ opacity: 1, y: 0, scale: 1 }} transition={{ type: "spring", stiffness: 420, damping: 22 }}
        // 시간 알약은 칸 아래(맨 아래 줄이면 위)에 — 오른쪽 위는 왕관 "승자" 알약·배지 자리라 겹치지 않게
        style={{ position: "absolute", left: vc * cell + cell / 2, top: vr === 7 ? vr * cell - 4 : (vr + 1) * cell + 3, transform: vr === 7 ? "translate(-50%,-100%)" : "translate(-50%,0)", zIndex: 9, pointerEvents: "none", whiteSpace: "nowrap",
          padding: "2px 7px", borderRadius: 999, fontSize: Math.max(10, cell * 0.24), fontWeight: 900, fontFamily: SITE_FONT, fontVariantNumeric: "tabular-nums",
          background: stage >= 2 && win ? GAME_END_COLOR.win : "rgba(36,21,9,.88)", color: "#fff", boxShadow: "0 2px 6px rgba(0,0,0,.35)" }}>{tx("{0}초", (Math.max(0, ms || 0) / 1000).toFixed(1))}</motion.span>
    );
  };
  const winSq = judge.winner === "w" ? wSq : judge.winner === "b" ? bSq : null;
  return (
    <>
      <style>{KD_CSS}</style>
      <span aria-hidden="true" style={{ position: "absolute", left: (tc + 0.5) * cell, top: (tr + 0.5) * cell, width: size * 2.2, height: size * 2.2, borderRadius: "50%", zIndex: 1, pointerEvents: "none",
        border: "3px solid " + T.brassHi, boxShadow: "0 0 18px rgba(236,203,134,.7)", animation: "kdRing " + Math.max(900, maxAt + 400) + "ms ease-out both" }} />
      {cells}
      {stage >= 1 && plan.tie && wSq && bSq && <>{pill(wSq, judge.wMs, judge.winner === "w")}{pill(bSq, judge.bMs, judge.winner === "b")}</>}
      {stage >= 2 && winSq && (() => { const [vr, vc] = rc(winSq); return (
        <div style={{ position: "absolute", left: vc * cell, top: vr * cell, width: cell, height: cell, zIndex: 8, pointerEvents: "none" }}>
          <GameEndFx role="win" endFx={{ kind: "checkmate" }} cell={cell} vc={vc} vr={vr} />
        </div>
      ); })()}
    </>
  );
}
// distFx — 거리 판정 라운드의 연출 정보 { judge, wSq, bSq } (없으면 연출 없음).
function KnightRaceGrid({ myPos, oppPos, target, hazards, removed, legalTargets, dangerForMe, myColor, oppColor, onCell, flip, size = 320, roundKey = "", myCaptured, oppCaptured, distFx }) {
  const oppInfo = useContext(MgOppContext); // (v0.5.7) 상대(봇) 나이트가 있는 칸 우상단에 상대 프로필 사진
  const ctx = useContext(SkinContext);
  const sk = BOARD_SKINS[ctx.boardSkin] || BOARD_SKINS.classic;
  const removedSet = new Set(removed || []);
  const hazBySq = {}; (hazards || []).forEach((h) => { if (!removedSet.has(h.sq)) hazBySq[h.sq] = h; });
  // (v0.5.5, 사용자 요청) 나이트가 잡히면 그 칸을 지배하던 상대 기물이 원래 칸에서 날아와 나이트를 잡는다 — 날아가는 동안은
  // 원래 칸에서 빼고 보드 위 오버레이로 그린다.
  const catchers = [];
  const addCatcher = (knightSq, knightColor, who) => {
    if (!knightSq) return;
    const h = knightCatcherOf(hazards, knightColor, knightSq, removed);
    if (h) { catchers.push({ ...h, to: knightSq, who }); delete hazBySq[h.sq]; }
  };
  // (v0.5.5) 두 나이트가 한 칸에 있으면 한쪽이 다른 쪽을 잡은 것 — 날아오는 기물 없이 그 칸에서 잡힌 쪽이 사라진다.
  const shared = !!(myPos && oppPos && myPos === oppPos);
  if (myCaptured && !shared) addCatcher(myPos, myColor, "me");
  if (oppCaptured && !shared) addCatcher(oppPos, oppColor, "opp");
  const viewRC = (sq) => { const r = 8 - parseInt(sq.slice(1), 10), c = sq.charCodeAt(0) - 97; return flip ? [7 - r, 7 - c] : [r, c]; };
  const legalSet = new Set(legalTargets || []);
  const drag = useGridDrag({
    size, cellAt: (vr, vc) => { const r = flip ? 7 - vr : vr, c = flip ? 7 - vc : vc; return COORD_FILES[c] + (8 - r); },
    canDrag: (sq) => sq === myPos && !myCaptured && legalSet.size > 0,
    onDrop: (from, to) => { if (to) onCell(to); },
    renderPiece: (sq, px) => <PieceGlyph type="N" color={myColor} size={px * 0.8} />,
  });
  // (v0.5.5, 사용자 요청) 상대 기물이 통제하는 칸(들어가면 잡히는 칸)은 설정 탭 "통제 칸 표시"를 켰을 때만 보인다 — 규칙은 그대로다.
  const { dangerOn } = useContext(MinigamePrefsContext);
  const illegalSet = new Set(dangerOn ? (dangerForMe || []) : []);
  const cells = [];
  for (let vr = 0; vr < 8; vr++) for (let vc = 0; vc < 8; vc++) {
    const r = flip ? 7 - vr : vr, c = flip ? 7 - vc : vc;
    const rank = 8 - r, file = COORD_FILES[c];
    const sq = file + rank;
    const isTarget = sq === target;
    const isMe = sq === myPos;
    const isOpp = sq === oppPos && !isMe;
    const isShared = shared && isMe; // 두 나이트가 같은 칸 — 잡힌 쪽을 아래에, 잡은 쪽을 위에 그린다
    const isMyIllegal = illegalSet.has(sq);
    const isLegal = legalSet.has(sq);
    const haz = hazBySq[sq];
    const light = (r + c) % 2 === 0;
    let overlay = null;
    if (isMyIllegal) overlay = "rgba(196,60,50,.32)";
    else if (isLegal && !isTarget) overlay = "rgba(196,154,80,.25)";
    // 잡을 수 있는 상대 기물 — 이동 가능한 칸 위의 상대 색 기물은 금색 테두리로 "잡을 수 있다"를 알린다.
    const canTake = isLegal && haz && haz.color === oppColor;
    cells.push(
      <button key={sq} onClick={() => onCell(sq)} className="press"
        style={{ position: "relative", border: "none", borderRadius: 0, cursor: isLegal ? "pointer" : "default", padding: 0, display: "flex", alignItems: "center", justifyContent: "center", overflow: "hidden", ...boardSquareBg(sk, light, r, c) }}>
        {overlay && <span aria-hidden="true" style={{ position: "absolute", inset: 0, background: overlay }} />}
        {isLegal && isMyIllegal && <span aria-hidden="true" style={{ position: "absolute", inset: 2, border: "2px dashed rgba(240,148,138,.9)", borderRadius: 3 }} />}
        {canTake && <motion.span aria-hidden="true" animate={{ opacity: [0.5, 1, 0.5] }} transition={{ duration: 1.1, repeat: Infinity }} style={{ position: "absolute", inset: 2, border: "2px solid " + T.brassHi, borderRadius: "50%" }} />}
        {/* (v0.5.5, 사용자 요청) 목표 칸 — 목록 버튼과 같은 맥동하는 금색 원 + 금색 별. 라운드마다 튀어나오고, 나이트가 도착하면 터지듯 번쩍인다. */}
        {isTarget && (
          <span key={"tgt" + roundKey} aria-hidden="true" style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1, animation: "kgPop .35s cubic-bezier(.2,.9,.3,1.3)" }}>
            <span style={{ position: "absolute", inset: "6%", borderRadius: "50%", boxShadow: "0 0 0 2px " + T.brassHi + ", 0 0 12px 3px rgba(236,203,134,.8)", background: isMe || isOpp ? "rgba(236,203,134,.6)" : (isLegal ? "rgba(236,203,134,.45)" : "rgba(236,203,134,.28)"), animation: isMe || isOpp ? "kgBurst .55s ease-out" : "kgPulse 1.4s ease-in-out infinite" }} />
            {!isMe && !isOpp && <Star size={Math.max(10, size / 8 * 0.46)} color={T.brassHi} fill={T.brassHi} style={{ position: "relative", filter: "drop-shadow(0 1px 1px rgba(0,0,0,.6))" }} />}
          </span>
        )}
        {haz && <PieceGlyph type={haz.type} color={haz.color} size={Math.max(12, Math.round(size / 320 * 22))} style={{ position: "relative", zIndex: 1 }} />}
        {isShared && <motion.div layoutId={"knight-opp-" + roundKey} transition={{ type: "spring", stiffness: 520, damping: 34 }} style={{ position: "absolute", inset: 0, zIndex: myCaptured ? 4 : 2, display: "flex", alignItems: "center", justifyContent: "center" }}><KnightCaughtGlyph color={oppColor} size={Math.max(14, Math.round(size / 320 * 24))} caught={oppCaptured} base={.88} />{myCaptured && <KnightCapturedMark />}</motion.div>}
        {isOpp && <motion.div layoutId={"knight-opp-" + roundKey} transition={{ type: "spring", stiffness: 520, damping: 34 }} style={{ position: "relative", zIndex: 2, display: "flex" }}><KnightCaughtGlyph color={oppColor} size={Math.max(14, Math.round(size / 320 * 24))} caught={oppCaptured} base={.88} />{oppCaptured && !catchers.some((x) => x.who === "opp") && <KnightCapturedMark />}</motion.div>}
        {(isOpp || (isShared && oppPos)) && oppInfo && <MgOppBadge opp={oppInfo} size={Math.max(13, Math.round(size / 8 * 0.34))} />}
        {isMe && <motion.div layoutId={"knight-me-" + roundKey} transition={{ type: "spring", stiffness: 520, damping: 34 }} style={{ position: "relative", zIndex: 3, display: "flex", opacity: drag.dragFrom === sq ? 0.35 : 1 }}><KnightCaughtGlyph color={myColor} size={Math.max(14, Math.round(size / 320 * 24))} caught={myCaptured} base={1} />{(isShared ? oppCaptured : myCaptured && !catchers.some((x) => x.who === "me")) && <KnightCapturedMark />}</motion.div>}

      </button>
    );
  }
  return (
    <div {...drag.bind} style={{ position: "relative", borderRadius: 4, overflow: "hidden", ...BOARD_GLOSS, boxSizing: "border-box", width: size, height: size, flexShrink: 0, display: "grid", gridTemplateColumns: "repeat(8,1fr)", gridTemplateRows: "repeat(8,1fr)", touchAction: "none" }}>
      <style>{KNIGHT_GRID_CSS}</style>
      {cells}
      {distFx && <KnightDistFx key={"kd" + roundKey} size={size} flip={flip} target={target} info={distFx} />}
      {drag.ghost}
      {catchers.map((h) => {
        const [fr, fc] = viewRC(h.sq), [tr, tc] = viewRC(h.to), cell = size / 8;
        return (
          <motion.div key={"catch-" + roundKey + h.who} aria-hidden="true" initial={{ x: fc * cell, y: fr * cell }} animate={{ x: tc * cell, y: tr * cell }}
            transition={{ delay: KNIGHT_CATCH_DELAY_S, duration: 0.34, ease: [0.5, 0, 0.25, 1] }}
            style={{ position: "absolute", left: 0, top: 0, width: cell, height: cell, zIndex: 4, display: "flex", alignItems: "center", justifyContent: "center", pointerEvents: "none" }}>
            <motion.span initial={{ opacity: 0 }} animate={{ opacity: [0, 1, 0.7] }} transition={{ delay: KNIGHT_CATCH_DELAY_S + 0.3, duration: 0.45 }}
              style={{ position: "absolute", inset: 0, background: "radial-gradient(circle, rgba(229,52,42,.7) 0%, rgba(229,52,42,.2) 72%)" }} />
            <motion.div initial={{ scale: 1 }} animate={{ scale: [1, 1.35, 1] }} transition={{ delay: KNIGHT_CATCH_DELAY_S, duration: 0.34 }} style={{ position: "relative", display: "flex", filter: "drop-shadow(0 4px 4px rgba(0,0,0,.45))" }}>
              <PieceGlyph type={h.type} color={h.color} size={Math.max(12, Math.round(size / 320 * 22))} />
            </motion.div>
            <KnightCapturedMark />
          </motion.div>
        );
      })}
    </div>
  );
}
// 나이트가 칸에 내려앉은 뒤(KNIGHT_CATCH_DELAY_S) 잡는 기물이 날아오고, 닿는 순간 나이트가 빨갛게 번쩍이며 사라진다.
const KNIGHT_CATCH_DELAY_S = 0.3;
function KnightCaughtGlyph({ color, size, caught, base }) {
  return (
    <motion.span initial={false} animate={caught ? { opacity: [base, base, 0], scale: [1, 1, 0.4] } : { opacity: base, scale: 1 }}
      transition={caught ? { delay: KNIGHT_CATCH_DELAY_S + 0.25, duration: 0.3, times: [0, 0.2, 1] } : { duration: 0 }}
      style={{ display: "flex", filter: caught ? "drop-shadow(0 0 6px rgba(229,52,42,.9))" : "none" }}>
      <PieceGlyph type="N" color={color} size={size} />
    </motion.span>
  );
}
const KNIGHT_GRID_CSS = "@keyframes kgPop{0%{transform:scale(.2);opacity:0}100%{transform:scale(1);opacity:1}}"
  + "@keyframes kgPulse{0%,100%{transform:scale(.86);opacity:.65}50%{transform:scale(1);opacity:1}}"
  + "@keyframes kgBurst{0%{transform:scale(.8)}45%{transform:scale(1.3);box-shadow:0 0 0 3px " + T.brassHi + ",0 0 22px 8px rgba(236,203,134,.95)}100%{transform:scale(1)}}";
function KnightCapturedMark() {
  return <motion.span initial={{ scale: 2, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ type: "spring", stiffness: 420, damping: 18, delay: KNIGHT_CATCH_DELAY_S + 0.45 }}
    style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", color: "#F0655A", fontWeight: 900, fontSize: "130%", textShadow: "0 1px 3px rgba(0,0,0,.8)" }}><X size="80%" strokeWidth={3.5} /></motion.span>;
}
// 보드 위 색이 각각 무슨 뜻인지 알려주는 범례 — 빨강은 위협 기물에게 잡히는(들어가면 안 되는) 칸,
// 금색은 지금 바로 이동할 수 있는 칸, 초록은 목표 칸이다.
function KnightRaceLegend() {
  const { dangerOn } = useContext(MinigamePrefsContext);
  const chip = (bg, label) => (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
      <span aria-hidden="true" style={{ width: 11, height: 11, borderRadius: 3, display: "inline-block", flexShrink: 0, ...(typeof bg === "string" ? { background: bg } : bg) }} />
      {label}
    </span>
  );
  return (
    <div style={{ display: "flex", justifyContent: "center", flexWrap: "wrap", gap: 12, fontSize: 10.5, color: "rgba(90,58,34,.65)", flexShrink: 0, marginTop: 6 }}>
      {dangerOn && chip("rgba(196,60,50,.75)", t("위협 칸 (진입 시 잡힘)"))}
      {chip({ background: "transparent", boxShadow: "inset 0 0 0 2px " + T.brassHi, borderRadius: "50%" }, t("상대 기물 (도달 시 잡음)"))}
      {chip("rgba(196,154,80,.6)", t("이동 가능"))}
      <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>{tx("{0}목표 칸", <Star size={11} color={MG_GOLD} fill={T.brassHi} />)}</span>
    </div>
  );
}
// (v0.5.3 연출 강화) 라운드 공통 피드백 — 내 나이트 이동음, 위협 칸이 가까운 칸 경고, 남은 시간 5초부터
// 초마다 경고음, 목표 도달 효과음을 한곳에서 처리한다.
function useKnightRoundFx(timeLeftMs, active) {
  const lastSecRef = useRef(null);
  useEffect(() => {
    if (!active) return;
    const sec = Math.ceil(timeLeftMs / 1000);
    if (sec <= 5 && sec >= 1 && lastSecRef.current !== sec) { lastSecRef.current = sec; fx("warn"); }
  }, [timeLeftMs, active]);
}
function KnightRaceRound({ game, myUid, roundIdx, round, onGameUpdate, revealed }) {
  const isWhite = myUid === game.white_uid;
  const myColor = isWhite ? "w" : "b";
  const oppColor = isWhite ? "b" : "w";
  const myStartSq = myColor === "w" ? round.whiteStart : round.blackStart;
  const [pos, setPos] = useState(myStartSq);
  const [movesUsed, setMovesUsed] = useState(0);
  const [reported, setReported] = useState(false);
  const [taken, setTaken] = useState([]); // (v0.5.4) 내가 잡은 상대 기물 칸
  const [captured, setCaptured] = useState(false); // (v0.5.4) 내 나이트가 잡혔는지
  const [tookOppSq, setTookOppSq] = useState(null); // (v0.5.5) 상대 나이트를 잡은 칸 — 서버 확인 전에도 곧바로 보여 준다
  const startMs = new Date(round.startedAt).getTime();
  const [timeLeftMs, setTimeLeftMs] = useState(() => Math.min(round.timeLimitMs, round.timeLimitMs - (Date.now() - startMs)));
  // (v0.5.3 연출 강화) 서버가 startedAt을 3초 뒤로 잡아 두므로 그때까지는 카운트다운만 보여주고 조작을 막는다.
  const [started, setStarted] = useState(() => Date.now() >= startMs);
  useEffect(() => { if (started) return; const t = setTimeout(() => setStarted(true), Math.max(0, startMs - Date.now())); return () => clearTimeout(t); }, [started, startMs]);
  const reportedRef = useRef(false);
  const myRep = round.reports && round.reports[myColor];
  const oppRep = round.reports && round.reports[oppColor];
  const iReported = !!myRep || reported;
  // (v0.5.0 기능, 사용자 요청) 상대 나이트가 실시간으로 움직이는 걸 보여주기 위해, round.positions에
  // 서버가 그때그때 기록해 둔 상대의 "지금 위치"를 그대로 읽어 같은 보드 위에 그린다 — 판정과 무관한
  // 순수 표시값이라(신뢰 모델은 knight_report와 동일) 검증 없이 그대로 믿는다.
  const oppStartSq = oppColor === "w" ? round.whiteStart : round.blackStart;
  const oppPosInfo = round.positions && round.positions[oppColor];
  const oppPos = (oppPosInfo && oppPosInfo.sq) || oppStartSq;
  const oppMovesUsed = (oppPosInfo && oppPosInfo.movesUsed) || 0;
  const oppTaken = (oppRep && oppRep.taken) || (oppPosInfo && oppPosInfo.taken) || [];
  const myDanger = useMemo(() => knightDangerFor(round, myColor, taken), [round, myColor, taken]);
  useEffect(() => { if (oppMovesUsed > 0) fx("tap"); }, [oppMovesUsed]);
  const [shakeControls, shake] = useBoardShake();
  // (v0.5.5) 상대 나이트가 내 나이트를 잡았다(서버가 내 시도를 "잡힘"으로 끝냈다) — 더 두지 못하게 막고 알린다.
  const knightTookMe = !!(myRep && myRep.captured) && !reportedRef.current;
  useEffect(() => {
    if (!knightTookMe) return;
    reportedRef.current = true; setReported(true); setCaptured(true);
    if (myRep.finalSq) setPos(myRep.finalSq);
    playSfx("capture"); fx("wrong"); shake(); buzz([80, 40, 120]);
  }, [knightTookMe, shake]); // eslint-disable-line react-hooks/exhaustive-deps
  const doReport = useCallback((reached, finalSq, moves, wasCaptured, takenSqs) => {
    if (reportedRef.current) return;
    reportedRef.current = true; setReported(true);
    sbRpc("knight_report", { p_game_id: game.id, p_round: roundIdx, p_reached: reached, p_moves_used: moves, p_final_sq: finalSq, p_captured: !!wasCaptured, p_taken: takenSqs || [] }).then((g) => g && onGameUpdate(g)).catch(() => { });
  }, [game.id, roundIdx, onGameUpdate]);
  // 제한시간 카운트다운 — 내가 아직 안 끝냈다면 0.2초마다 갱신하고, 다 되면 지금 위치·사용한 수
  // 그대로 실패로 자동 보고한다(시간 초과도 "시도했다"로 인정 — 위 SQL의 미보고 패널티 참고).
  useEffect(() => {
    if (iReported || !started) return;
    const t = setInterval(() => {
      const left = round.timeLimitMs - (Date.now() - startMs);
      setTimeLeftMs(left);
      if (left <= 0) { fx("wrong"); shake(); doReport(false, pos, movesUsed, false, taken); clearInterval(t); }
    }, 200);
    return () => clearInterval(t);
  }, [startMs, round.timeLimitMs, pos, movesUsed, taken, iReported, doReport, started, shake]);
  useKnightRoundFx(timeLeftMs, started && !iReported);
  // 이미 보고했는데 아직 이 라운드 승자가 안 정해졌으면(상대가 아직 진행 중이거나 미보고) 주기적으로
  // 확정을 시도한다 — 서버가 "둘 다 보고했거나 시간이 다 됐을 때"만 실제로 확정하므로 안전하다.
  useEffect(() => {
    if (!iReported || round.winner) return;
    const t = setInterval(() => { sbRpc("knight_resolve_round", { p_game_id: game.id }).then((g) => g && onGameUpdate(g)).catch(() => { }); }, 1200);
    return () => clearInterval(t);
  }, [iReported, round.winner, game.id, onGameUpdate]);
  const legalTargets = useMemo(() => (iReported || !started ? [] : knightNeighborsClient(pos, knightOwnBlocked(round, myColor, oppTaken))), [pos, round, myColor, oppTaken, iReported, started]);
  const onCell = (sq) => {
    if (iReported || !started || !legalTargets.includes(sq)) return;
    const nextMoves = movesUsed + 1;
    const mv = knightApplyMove(round, myColor, taken, sq);
    setPos(sq); setMovesUsed(nextMoves); setTaken(mv.taken);
    // (v0.5.5, 사용자 요청) 상대 나이트 칸으로 뛰어들면 상대 나이트를 잡는다 — 판정은 서버(knight_move_ping)가 서버에 기록된
    // 상대의 마지막 위치와 비교해 내리고, 잡힌 쪽의 라운드 시도를 "잡힘"으로 끝낸다.
    const tookOpp = !oppRep && sq === oppPos;
    if (tookOpp) setTookOppSq(sq);
    if (mv.tookPiece || tookOpp) { playSfx("capture"); fx("capture"); buzz(40); } else playSfx("move");
    // 이 수를 상대에게 실시간으로 중계한다(상대 나이트를 잡았는지 판정에도 쓰인다 — 실패해도 그냥 무시).
    sbRpc("knight_move_ping", { p_game_id: game.id, p_round: roundIdx, p_sq: sq, p_moves_used: nextMoves, p_taken: mv.taken }).catch(() => { });
    // (v0.5.4) 상대 기물이 지배하는 칸에 들어갔다 — 내 나이트가 잡혀 이 라운드 시도가 끝난다.
    if (mv.captured) { setCaptured(true); fx("wrong"); shake(); buzz([80, 40, 120]); doReport(false, sq, nextMoves, true, mv.taken); return; }
    if (sq === round.target) { fx("correct"); buzz([30, 30, 30]); doReport(true, sq, nextMoves, false, mv.taken); return; }
    if (nextMoves >= round.moveBudget) { fx("wrong"); shake(); doReport(false, sq, nextMoves, false, mv.taken); }
  };
  const timePct = Math.max(0, Math.min(1, timeLeftMs / round.timeLimitMs));
  // (v0.5.1 리디자인, 사용자 요청) 보드 하나만 화면 정중앙에 크게 쓴다 — 그 슬롯을 ResizeObserver로
  // 실측해 정사각형 한 변 길이를 구한다. flip: 내가 흑이면 보드를 뒤집어 내 나이트가 항상 화면
  // 아래쪽에 오도록 한다(서버가 백을 항상 목표보다 낮은 랭크에 배정해 두므로 이 규칙만으로 충분하다).
  const [boardSize, boardFitRef] = useSquareFit();
  const roundResult = round.winner && revealed ? (round.winner === myColor ? "me" : round.winner === "draw" ? "draw" : "opp") : null;
  return (
    <div style={{ flex: 1, minHeight: 0, display: "flex", flexDirection: "column" }}>
      <div className="flex items-center justify-between" style={{ marginBottom: 6, fontSize: 11, color: "rgba(90,58,34,.75)", fontWeight: 700, flexShrink: 0 }}>
        <span>{tx("내 수 {0}/{1} · 상대 {2}", <b style={{ color: T.ink }}>{movesUsed}</b>, round.moveBudget, oppMovesUsed)}</span>
        <span style={{ color: timePct < 0.25 ? T.blunder : "rgba(90,58,34,.90)", fontVariantNumeric: "tabular-nums" }}>{tx("{0}초", Math.max(0, Math.ceil(timeLeftMs / 1000)))}</span>
      </div>
      <MinigameTimeBar pct={timePct} />
      <div ref={boardFitRef} style={{ flex: 1, minHeight: 0, display: "flex", alignItems: "center", justifyContent: "center" }}>
        <motion.div animate={shakeControls} style={{ position: "relative" }}>
          <KnightRaceGrid size={boardSize} myPos={pos} oppPos={oppPos} target={round.target} hazards={round.hazards} removed={[...taken, ...oppTaken]} legalTargets={legalTargets} dangerForMe={myDanger} myColor={myColor} oppColor={oppColor} onCell={onCell} flip={myColor === "b"} roundKey={roundIdx}
            myCaptured={captured || !!(myRep && myRep.captured)} oppCaptured={!!(oppRep && oppRep.captured) || (!!tookOppSq && oppPos === tookOppSq && pos === tookOppSq)}
            distFx={round.winner && round.judge ? { judge: round.judge, wSq: round.reports && round.reports.w && round.reports.w.finalSq, bSq: round.reports && round.reports.b && round.reports.b.finalSq } : null} />
          <MinigameCountdown startAt={startMs} />
          <MinigameRoundBanner result={roundResult} roundKey={roundIdx} />
        </motion.div>
      </div>
      <div style={{ textAlign: "center", fontSize: 11.5, color: "rgba(90,58,34,.75)", fontWeight: 700, margin: "8px 0 2px", flexShrink: 0, minHeight: 16 }}>
        {round.winner ? "" : captured ? t("나이트가 잡힘. 상대 대기 중…") : iReported ? t("상대를 기다리는 중...") : (oppRep ? (oppRep.reached ? t("상대가 {0}수로 도착. 더 적은 수면 승리", oppRep.movesUsed) : t("상대 시도 완료")) : t("가장 적은 수로 목표 칸(★) 도달"))}
      </div>
      <KnightRaceLegend />
    </div>
  );
}
// (v0.5.0 기능, 사용자 요청) 봇과 플레이하기 — 서버 없이 완전히 로컬에서 라운드를 만들고 판정한다.
// 라운드 생성·위협 칸·잡기 규칙은 src/lib/knightRace.js(knightGenRound 등)가 단일 출처다 — 실시간 대전 서버
// (supabase-setup.sql의 _knight_gen_round)와 같은 규칙이라 봇 대전도 실전과 같은 난이도 곡선·공정성을 겪는다.
// 봇은 자기 시작 칸(항상 흑)에서 목표 칸까지 "잡지 않고도 확실히 가는" 최단 경로(knightSafeWalls 기준 BFS)를 계산해,
// 한 수당 무작위 시간(KNIGHT_BOT_PACE_*)을 두고 그 경로를 그대로 밟는다. 혼자 플레이하기는 knightGenRound(idx, { solo: true })
// — 상대가 없으니 흑 기물만 두고 그 배치로 par·이동 수 제한을 잰다.
// (v0.5.5) 봇의 한 수 간격 — 라운드 제한시간을 (par+1)수로 나눈 몫의 55~95%. 제한시간이 라운드마다 달라져(5~17초) 고정 간격이면
// 1라운드에선 봇이 시간 안에 못 가고 뒤 라운드에선 너무 느려진다.
const KNIGHT_BOT_PACE_MIN = 0.55;
const KNIGHT_BOT_PACE_MAX = 0.95;
const KNIGHT_ARRIVE_MS = 1200;   // 목표 도착·잡힘 연출(잡는 기물이 날아오는 것까지)이 끝까지 보이도록 결과(배너·정산)를 늦추는 시간
function KnightRaceBotRound({ round, onRoundDone, solo }) {
  const [pos, setPos] = useState(round.whiteStart);
  const [movesUsed, setMovesUsed] = useState(0);
  const [botPos, setBotPos] = useState(round.blackStart);
  const [botMovesUsed, setBotMovesUsed] = useState(0);
  // (v0.5.4) 잡은 기물·잡힘 — 나(백)는 흑 기물을, 봇(흑)은 백 기물을 잡는다.
  const [taken, setTaken] = useState([]);
  const [botTaken, setBotTaken] = useState([]);
  const [captured, setCaptured] = useState(false);
  const myDanger = useMemo(() => knightDangerFor(round, "w", taken), [round, taken]);
  const [myReport, setMyReport] = useState(null); // { reached, moves, atMs }
  const [botReport, setBotReport] = useState(null);
  const [timeLeftMs, setTimeLeftMs] = useState(round.timeLimitMs);
  // (v0.5.3 연출 강화) 라운드마다 3초 카운트다운 뒤에 시작 — 봇의 타이머도 그만큼 뒤로 민다.
  const startRef = useRef(Date.now() + 3000);
  const [started, setStarted] = useState(false);
  useEffect(() => { const t = setTimeout(() => setStarted(true), Math.max(0, startRef.current - Date.now())); return () => clearTimeout(t); }, []);
  const myReportRef = useRef(null);
  const timersRef = useRef([]);
  // (v0.5.5) 봇의 이동·보고 타이머는 따로 모아 둔다 — 내가 봇 나이트를 잡으면 봇의 남은 일정을 전부 취소한다.
  const botTimersRef = useRef([]);
  useEffect(() => () => { timersRef.current.forEach(clearTimeout); botTimersRef.current.forEach(clearTimeout); }, []);
  // 봇이 내 나이트 칸으로 뛰어들면 나를 잡는다 — 타이머 안에서 지금 내 위치·수를 읽어야 해서 ref로 들고 있는다.
  const posRef = useRef(round.whiteStart);
  const movesRef = useRef(0);
  const botPosRef = useRef(round.blackStart);
  const botMovesRef = useRef(0);
  const [shakeControls, shake] = useBoardShake();
  const shakeRef = useRef(shake); shakeRef.current = shake;
  // (v0.5.5, 사용자 요청) 목표 도착·잡힘은 나이트가 칸에 닿고 도착 연출(번쩍임·X)이 끝까지 보인 뒤(delayMs)에 결과로 반영한다 —
  // 기록 시간은 누른 순간 기준, 입력은 곧바로 막는다(myReportRef).
  const doMyReport = useCallback((reached, moves, wasCaptured, delayMs = 0) => {
    if (myReportRef.current) return;
    const rep = { reached, moves, atMs: Date.now() - startRef.current, captured: !!wasCaptured };
    myReportRef.current = rep;
    if (delayMs > 0) timersRef.current.push(setTimeout(() => setMyReport(rep), delayMs));
    else setMyReport(rep);
  }, []);
  useEffect(() => {
    if (myReport || !started) return;
    const t = setInterval(() => {
      const left = round.timeLimitMs - (Date.now() - startRef.current);
      setTimeLeftMs(left);
      if (left <= 0) { fx("wrong"); shake(); doMyReport(false, movesUsed); clearInterval(t); }
    }, 200);
    return () => clearInterval(t);
  }, [round.timeLimitMs, movesUsed, myReport, doMyReport, started, shake]);
  useKnightRoundFx(timeLeftMs, started && !myReport);
  // (v0.5.0 기능, 사용자 요청) 봇의 시도 — 예전엔 결과만 한 번에 반영했지만, 이제 실제로 한 수씩
  // 옮겨 다니는 모습을 같은 보드 위에 보여준다. 라운드가 시작되는 순간 최단 경로를 한 번만 계산해,
  // 그 경로의 각 수마다 무작위 간격(제한시간에 비례)으로 botPos를 옮기는 타이머를 미리 전부 예약해 둔다.
  // 봇은 항상 흑 역할이라 자신에게 위협적인 칸(bIllegal)을 피해 경로를 찾는다.
  useEffect(() => {
    if (solo) return; // (v0.5.3) 혼자 플레이하기 — 봇 없이 나만 시간·수 제한과 싸운다
    const lead = Math.max(0, startRef.current - Date.now());
    // (v0.5.7) 봇은 위협 칸과 모든 기물 칸을 피한다(knightSafeWalls) — 기물을 잡으면 그 기물이 막던 공격선이 열려 앞길이
    // 위험해질 수 있어서다. par도 같은 기준이라, 이 경로는 항상 규칙대로 통한다.
    const botAvoid = knightSafeWalls(round, "b");
    let path = knightShortestPathLocal(round.blackStart, round.target, botAvoid);
    // (v0.5.4) 이제 라운드는 "더 적은 수"로 이긴다 — 봇이 늘 최단 수로 가면 사람은 비기거나(시간 비교) 질
    // 수밖에 없으므로, 40% 확률로 봇이 첫 수를 "최단에서 한 수 벗어나는" 칸으로 둬 par+1수(이동 수 제한
    // 안)로 도착하게 한다 — 사람이 최단 경로를 찾아내면 이길 수 있다.
    if (path && Math.random() < 0.4) {
      const par = path.length - 1;
      const side = knightNeighborsClient(path[0], botAvoid).filter((sq) => sq !== round.target && knightDistanceLocal(sq, round.target, botAvoid) === par);
      if (side.length) {
        const first = side[Math.floor(Math.random() * side.length)];
        const rest = knightShortestPathLocal(first, round.target, botAvoid);
        if (rest && rest.length <= round.moveBudget) path = [path[0], ...rest];
      }
    }
    const moves = path ? path.length - 1 : Infinity;
    if (!path || moves > round.moveBudget) {
      botTimersRef.current.push(setTimeout(() => setBotReport({ reached: false, moves: 0, atMs: round.timeLimitMs }), lead + round.timeLimitMs));
      return;
    }
    let cumulative = 0;
    let stepsWithinTime = 0;
    for (let i = 0; i < moves; i++) {
      const slot = round.timeLimitMs / (round.par + 1);
      const delay = slot * (KNIGHT_BOT_PACE_MIN + Math.random() * (KNIGHT_BOT_PACE_MAX - KNIGHT_BOT_PACE_MIN));
      cumulative += delay;
      if (cumulative > round.timeLimitMs) break;
      stepsWithinTime = i + 1;
      const stepSq = path[i + 1];
      const fireAt = lead + cumulative;
      const takes = (round.hazards || []).some((h) => h.sq === stepSq && h.color === "w");
      botTimersRef.current.push(setTimeout(() => {
        botPosRef.current = stepSq; botMovesRef.current = i + 1;
        setBotPos(stepSq); setBotMovesUsed(i + 1);
        if (takes) { setBotTaken((t) => [...t, stepSq]); fx("capture"); } else fx("tap");
        // (v0.5.5, 사용자 요청) 봇이 내 나이트를 잡았다 — 내 라운드 시도가 그대로 끝난다.
        if (stepSq === posRef.current && !myReportRef.current) { setCaptured(true); playSfx("capture"); fx("wrong"); shakeRef.current(); buzz([80, 40, 120]); doMyReport(false, movesRef.current, true, KNIGHT_ARRIVE_MS); }
      }, fireAt));
    }
    if (stepsWithinTime === moves) {
      const at = cumulative;
      botTimersRef.current.push(setTimeout(() => setBotReport({ reached: true, moves, atMs: at }), lead + at));
    } else {
      botTimersRef.current.push(setTimeout(() => setBotReport({ reached: false, moves: stepsWithinTime, atMs: round.timeLimitMs }), lead + round.timeLimitMs));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const [winner, setWinner] = useState(null);
  const [distFx, setDistFx] = useState(null);
  useEffect(() => {
    if (!myReport || (!solo && !botReport) || winner) return;
    if (solo) { const w = myReport.reached ? "w" : "b"; setWinner(w); onRoundDone(w, myReport, botReport); return; }
    // (v0.5.7) 판정은 서버 knight_resolve_round와 같은 knightJudge 하나로 — 예전엔 둘 다 못 가면(잡힌 쪽 제외) 그냥 무승부였다.
    // 둘 다 못 갔으면 목표까지 거리 → 거리도 같으면 소모 시간. 거리로 정했으면 금색 퍼짐·왕관 연출을 다 보여 준 뒤 라운드를 넘긴다.
    const j = knightJudge(round,
      { ...myReport, finalSq: posRef.current, taken },
      { ...botReport, finalSq: botPosRef.current, taken: botTaken });
    setWinner(j.winner);
    const fxMs = knightDistFxMs(j);
    if (fxMs) {
      setDistFx({ judge: j, wSq: posRef.current, bSq: botPosRef.current });
      const t = setTimeout(() => onRoundDone(j.winner, myReport, botReport, j), fxMs);
      timersRef.current.push(t);
    } else onRoundDone(j.winner, myReport, botReport, j);
  }, [myReport, botReport, onRoundDone, winner]); // eslint-disable-line react-hooks/exhaustive-deps
  const legalTargets = useMemo(() => (myReport || !started ? [] : knightNeighborsClient(pos, knightOwnBlocked(round, "w", botTaken))), [pos, round, botTaken, myReport, started]);
  const onCell = (sq) => {
    if (myReportRef.current || !started || !legalTargets.includes(sq)) return;
    const nextMoves = movesUsed + 1;
    const mv = knightApplyMove(round, "w", taken, sq);
    posRef.current = sq; movesRef.current = nextMoves;
    setPos(sq); setMovesUsed(nextMoves); setTaken(mv.taken);
    // (v0.5.5, 사용자 요청) 봇 나이트가 있는 칸으로 뛰어들면 봇 나이트를 잡는다 — 봇의 이번 라운드 시도는 그대로 끝난다.
    const tookBot = !solo && !botReport && sq === botPosRef.current;
    if (tookBot) {
      botTimersRef.current.forEach(clearTimeout); botTimersRef.current = [];
      setBotReport({ reached: false, moves: botMovesRef.current, atMs: Date.now() - startRef.current, captured: true });
    }
    if (mv.tookPiece || tookBot) { playSfx("capture"); fx("capture"); buzz(40); } else playSfx("move");
    // (v0.5.4) 상대 기물이 지배하는 칸에 들어갔다 — 내 나이트가 잡혀 이 라운드 시도가 끝난다.
    if (mv.captured) { setCaptured(true); fx("wrong"); shake(); buzz([80, 40, 120]); doMyReport(false, nextMoves, true, KNIGHT_ARRIVE_MS); return; }
    if (sq === round.target) { fx("correct"); buzz([30, 30, 30]); doMyReport(true, nextMoves, false, KNIGHT_ARRIVE_MS); return; }
    if (nextMoves >= round.moveBudget) { fx("wrong"); shake(); doMyReport(false, nextMoves); }
  };
  const timePct = Math.max(0, Math.min(1, timeLeftMs / round.timeLimitMs));
  // (v0.5.1 리디자인, 사용자 요청) 보드 하나만 화면 정중앙에 크게 쓴다. 나는 항상 백 역할이라
  // flip은 필요 없다(백은 서버 생성 규칙상 항상 목표보다 낮은 랭크에서 시작해 화면 아래쪽에 온다).
  const [boardSize, boardFitRef] = useSquareFit();
  const roundResult = winner ? (winner === "w" ? "me" : winner === "b" ? "opp" : "draw") : null;
  return (
    <div style={{ flex: 1, minHeight: 0, display: "flex", flexDirection: "column" }}>
      <div className="flex items-center justify-between" style={{ marginBottom: 6, fontSize: 11, color: "rgba(90,58,34,.75)", fontWeight: 700, flexShrink: 0 }}>
        <span>{tx("내 수 {0}", <b style={{ color: T.ink }}>{movesUsed}</b>)}/{round.moveBudget}{solo ? "" : t(" · 봇 {0}", botMovesUsed)}</span>
        <span style={{ color: timePct < 0.25 ? T.blunder : "rgba(90,58,34,.90)", fontVariantNumeric: "tabular-nums" }}>{tx("{0}초", Math.max(0, Math.ceil(timeLeftMs / 1000)))}</span>
      </div>
      <MinigameTimeBar pct={timePct} />
      <div ref={boardFitRef} style={{ flex: 1, minHeight: 0, display: "flex", alignItems: "center", justifyContent: "center" }}>
        <motion.div animate={shakeControls} style={{ position: "relative" }}>
          <KnightRaceGrid size={boardSize} myPos={pos} oppPos={solo ? null : botPos} target={round.target} hazards={round.hazards} removed={[...taken, ...botTaken]} legalTargets={legalTargets} dangerForMe={myDanger} myColor="w" oppColor="b" onCell={onCell} roundKey={round.target + round.whiteStart} myCaptured={captured} oppCaptured={!!(botReport && botReport.captured)} distFx={distFx} />
          <MinigameCountdown startAt={startRef.current} />
          <MinigameRoundBanner result={roundResult} roundKey={round.target + round.whiteStart} text={solo ? (roundResult === "me" ? t("도달 성공") : t("실패")) : null} />
        </motion.div>
      </div>
      <div style={{ textAlign: "center", fontSize: 11.5, color: "rgba(90,58,34,.75)", fontWeight: 700, margin: "8px 0 2px", flexShrink: 0, minHeight: 16 }}>
        {winner ? "" : myReport ? (captured ? t("나이트가 잡힘. ") : "") + (solo ? "" : t("봇 시도 중…")) : t("가장 적은 수로 목표 칸(★) 도달")}
      </div>
      <KnightRaceLegend />
    </div>
  );
}
function knightResultStats(mine) {
  const reached = mine.filter((r) => r && r.reached);
  const fastest = reached.length ? Math.min(...reached.map((r) => r.ms)) : null;
  const avgMoves = reached.length ? (reached.reduce((a, r) => a + r.moves, 0) / reached.length).toFixed(1) : "-";
  return [
    { label: t("목표 도달"), value: reached.length + "/" + mine.length },
    { label: t("평균 이동 수"), value: avgMoves },
    { label: t("최단 도달"), value: fastest == null ? "-" : t("{0}초", ((fastest / 1000).toFixed(1))) },
  ];
}
function KnightRaceBotBoard({ onExit, onStatusChange, onRematch }) {
  const [rounds, setRounds] = useState([]); // [{ ...round, winner, mine }]
  const roundIdx = rounds.length - 1;
  const round = rounds[roundIdx] || null;
  const myWins = rounds.filter((r) => r.winner === "w").length;
  const botWins = rounds.filter((r) => r.winner === "b").length;
  const finished = (myWins >= KNIGHT_BO_TARGET || botWins >= KNIGHT_BO_TARGET || rounds.length >= KNIGHT_BO_TOTAL) && round && round.winner;
  // (버그 수정) 봇 대전은 pvp_games 행이 없어 실제 PvP처럼 onStatusChange로 "끝났다"는 사실을 부모
  // (KnightRaceGame)에 알려야 한다 — 안 그러면 이미 끝난 대전인데도 뒤로가기가 "정말 나가시겠어요?"
  // (기권 확인)를 계속 띄운다.
  useEffect(() => { onStatusChange && onStatusChange(finished ? "finished" : "active"); }, [finished, onStatusChange]);
  // (v0.5.4) 라운드가 끝나면 정산 화면(useRoundSettle)이 끝나거나 "다음 라운드"로 건너뛸 때 다음 라운드를 만든다.
  const settle = useRoundSettle(roundIdx, !!(round && round.winner));
  useEffect(() => {
    if (finished) return;
    if (rounds.length === 0) { setRounds([{ ...knightGenRound(0), winner: null }]); return; }
    if (round && round.winner && settle.phase === "done") setRounds((rs) => (rs.length === roundIdx + 1 ? [...rs, { ...knightGenRound(rs.length), winner: null }] : rs));
  }, [rounds.length, round && round.winner, finished, settle.phase]); // eslint-disable-line react-hooks/exhaustive-deps
  const onRoundDone = useCallback((winner, mine, bot, judge) => {
    const pack = (x) => (x ? { reached: x.reached, moves: x.moves, ms: x.atMs, captured: !!x.captured } : null);
    setRounds((rs) => { const i = rs.length - 1; if (i < 0 || rs[i].winner) return rs; const copy = rs.slice(); copy[i] = { ...copy[i], winner, mine: pack(mine), bot: pack(bot), judge: judge || null }; return copy; });
  }, []);
  if (settle.phase === "settle") {
    const res = round.winner === "w" ? "me" : round.winner === "b" ? "opp" : "draw";
    const info = knightSettleInfo(round.mine, round.bot, res, round.par, false, knightDistView(round.judge, "w"));
    return <MinigameRoundSettle roundNo={roundIdx + 1} roundTotal={KNIGHT_BO_TOTAL} result={res} myScore={myWins} oppScore={botWins} oppLabel={t("봇")}
      rows={info.rows} reason={info.reason} until={settle.until} onNext={settle.skip} nextLabel={finished ? t("최종 결과") : t("다음 라운드")} />;
  }
  if (finished && settle.phase === "done") {
    const iWon = myWins > botWins;
    const isDraw = myWins === botWins;
    return <MinigameResult outcome={isDraw ? "draw" : iWon ? "win" : "lose"} myScore={myWins} oppScore={botWins} oppLabel={t("봇")}
      rounds={rounds.map((r, i) => ({ result: r.winner === "w" ? "me" : r.winner === "b" ? "opp" : "draw", label: "R" + (i + 1), detail: r.mine && r.mine.reached ? t("{0}수", (r.mine.moves)) : t("실패") }))}
      stats={knightResultStats(rounds.map((r) => r.mine))} onExit={onExit} onRematch={onRematch} />;
  }
  return (
    <div style={{ flex: 1, minHeight: 0, display: "flex", flexDirection: "column" }}>
      <MinigameScoreHeader myScore={myWins} oppScore={botWins} oppLabel={t("봇")} center={t("{0} / {1} 라운드 · 4선승", (Math.max(1, rounds.length)), KNIGHT_BO_TOTAL)} />
      <MinigameScorePips results={rounds.map((r) => r.winner === "w" ? "me" : r.winner === "b" ? "opp" : r.winner === "draw" ? "draw" : null)} total={KNIGHT_BO_TOTAL} />
      {round ? <KnightRaceBotRound key={roundIdx} round={round} onRoundDone={onRoundDone} /> : <div style={{ textAlign: "center", padding: "20px 0" }}><PendingDots size={12} /></div>}
    </div>
  );
}
// 서버 라운드 보고 → 정산용 { reached, moves, ms, captured } (보고가 없으면 null).
function knightRepInfo(round, color) {
  const rep = round && round.reports && round.reports[color];
  if (!rep) return null;
  return { reached: !!rep.reached, moves: rep.movesUsed || 0, ms: new Date(rep.at).getTime() - new Date(round.startedAt).getTime(), captured: !!rep.captured };
}
// 매칭이 끝난 뒤 대전 전체(라운드 진행 + 스코어보드 + 다음 라운드 자동 진행 + 최종 결과)를 관리한다.
function KnightRaceBoard({ game: initialGame, myUid, onExit, onStatusChange }) {
  const [game, setGame] = useState(initialGame);
  useEffect(() => { onStatusChange && onStatusChange(game.status); }, [game.status, onStatusChange]);
  useRealtimeTable("pvp_games", "id=eq." + initialGame.id, useCallback((payload) => {
    if (payload && payload.new) setGame(payload.new);
    else if (!payload) { sbSelect("pvp_games?id=eq." + initialGame.id + "&select=*").then((rows) => { if (rows && rows[0]) setGame(rows[0]); }).catch(() => { }); }
  }, [initialGame.id]), true, 3000);
  const isWhite = myUid === game.white_uid;
  const myColor = isWhite ? "w" : "b";
  const rounds = game.sans || [];
  const roundIdx = Math.max(0, rounds.length - 1);
  const round = rounds[roundIdx] || null;
  const myWins = rounds.filter((r) => r.winner === (isWhite ? "w" : "b")).length;
  const oppWins = rounds.filter((r) => r.winner === (isWhite ? "b" : "w")).length;
  const finished = game.status !== "active";
  // 라운드가 없거나(첫 진입) 방금 끝났으면(승자 있음) 정산 화면을 보여준 뒤(v0.5.4) 다음 라운드를 요청한다.
  useEffect(() => {
    if (finished) return;
    if (rounds.length === 0) { sbRpc("knight_start_round", { p_game_id: game.id }).then((g) => g && setGame(g)).catch(() => { }); return; }
    if (round && round.winner) {
      const t = setTimeout(() => { sbRpc("knight_start_round", { p_game_id: game.id }).then((g) => g && setGame(g)).catch(() => { }); }, ROUND_SETTLE_TOTAL + KNIGHT_ARRIVE_MS + knightDistFxMs(round.judge));
      return () => clearTimeout(t);
    }
  }, [game.id, rounds.length, round && round.winner, finished]);
  // (v0.5.5, 사용자 요청) 승자가 정해져도 나이트 도착 애니메이션이 끝까지 재생된 뒤에 배너·정산을 띄운다.
  // 새로고침 등으로 이미 한참 전에 끝난 라운드라면 기다리지 않는다.
  const hasWinner = !!(round && round.winner);
  const resolvedAtMs = round && round.resolvedAt ? Date.parse(round.resolvedAt) : null;
  const [revealKey, setRevealKey] = useState(null);
  // (v0.5.7) 거리 판정 라운드면 금색 퍼짐·왕관 연출(knightDistFxMs)까지 보여 준 뒤에 배너·정산으로 — 두 화면 모두 같은 round.judge로 같은 시간을 센다.
  const revealDelay = KNIGHT_ARRIVE_MS + knightDistFxMs(round && round.judge);
  useEffect(() => {
    if (!hasWinner) return;
    const t = setTimeout(() => setRevealKey(roundIdx), revealDelay);
    return () => clearTimeout(t);
  }, [hasWinner, roundIdx, revealDelay]);
  const revealed = hasWinner && (revealKey === roundIdx || !!(resolvedAtMs && Date.now() - resolvedAtMs > revealDelay + 2000));
  const settle = useRoundSettle(roundIdx, revealed, resolvedAtMs ? resolvedAtMs + revealDelay : null);
  if (settle.phase === "settle") {
    const oppColor = isWhite ? "b" : "w";
    const res = round.winner === myColor ? "me" : round.winner === oppColor ? "opp" : "draw";
    const info = knightSettleInfo(knightRepInfo(round, myColor), knightRepInfo(round, oppColor), res, round.par, false, knightDistView(round.judge, myColor));
    return <MinigameRoundSettle roundNo={roundIdx + 1} roundTotal={KNIGHT_BO_TOTAL} result={res} myScore={myWins} oppScore={oppWins} oppLabel={t("상대")}
      rows={info.rows} reason={info.reason} until={settle.until} nextLabel={finished ? t("최종 결과") : t("다음 라운드")} />;
  }
  // 마지막 라운드도 배너 → 정산을 거친 뒤 최종 결과로(기권 등 라운드 승자 없이 끝난 대전은 곧장 결과).
  if (finished && (settle.phase === "done" || !(round && round.winner))) {
    const iWon = (isWhite && game.status === "white_won") || (!isWhite && game.status === "black_won");
    const isDraw = game.status === "draw";
    const mine = rounds.filter((r) => r.winner).map((r) => {
      const rep = r.reports && r.reports[myColor];
      return rep ? { reached: !!rep.reached, moves: rep.movesUsed, ms: new Date(rep.at).getTime() - new Date(r.startedAt).getTime() } : null;
    });
    return <MinigameResult outcome={isDraw ? "draw" : iWon ? "win" : "lose"} myScore={myWins} oppScore={oppWins} oppLabel={t("상대")} rating={minigameRatingOf(game, myUid)}
      rounds={rounds.filter((r) => r.winner).map((r, i) => ({ result: r.winner === myColor ? "me" : r.winner === "draw" ? "draw" : "opp", label: "R" + (i + 1), detail: mine[i] && mine[i].reached ? t("{0}수", (mine[i].moves)) : t("실패") }))}
      stats={knightResultStats(mine)} note={game.result_reason === "knight_forfeit" ? (iWon ? t("상대가 대전 포기") : t("대전 포기")) : null} onExit={onExit} />;
  }
  return (
    <div style={{ flex: 1, minHeight: 0, display: "flex", flexDirection: "column" }}>
      <MinigameScoreHeader myScore={myWins} oppScore={oppWins} oppLabel={t("상대")} center={t("{0} / {1} 라운드 · 4선승", (roundIdx + 1), KNIGHT_BO_TOTAL)} />
      <MinigameScorePips results={rounds.map((r) => r.winner === (isWhite ? "w" : "b") ? "me" : r.winner === (isWhite ? "b" : "w") ? "opp" : r.winner === "draw" ? "draw" : null)} total={KNIGHT_BO_TOTAL} />
      {round ? <KnightRaceRound key={roundIdx} game={game} myUid={myUid} roundIdx={roundIdx} round={round} onGameUpdate={setGame} revealed={revealed} /> : <div style={{ textAlign: "center", padding: "20px 0" }}><PendingDots size={12} /></div>}
    </div>
  );
}
// ---- 러시아워(rush) — 사용자 설계 3호 미니게임(v0.5.3). "그로테스크 퍼즐 + 러시아워": 내 기물들로
// 엉켜 있는 포지션에서 주인공 룩(금빛 테두리)을 탈출시켜 상대 백랭크로 보내 킹을 체크메이트한다.
// 규칙 엔진은 src/lib/rushHour.js(레벨 생성기와 공유), 레벨은 src/data/rushLevels.json(생성기가 BFS로
// 풀이·최소 수(par)를 검증해 둔 것만) — 자세한 규칙은 rushHour.js 머리 주석 참고.
// 모드: 혼자 풀기(레벨 선택·별 3개 평가), 봇과 플레이하기, 실시간 PvP(대전 상대 찾기·친구 도전).
// 대전은 3라운드(쉬움→보통→어려움) 2선승 — 같은 퍼즐을 동시에 풀어, 푼 쪽 > 못 푼 쪽, 둘 다 풀면 더
// 적은 수, 같으면 더 빨리 푼 쪽이 라운드를 가져간다(되돌리기·초기화로 버린 수는 세지 않는다).
const RUSH_GAME_TYPE = "rush";
const RUSH_ROUND_MS = 120000;
const RUSH_DIFFS = [
  { key: "easy", label: t("쉬움"), color: "#6FBF73" },
  { key: "normal", label: t("보통"), color: T.brass },
  { key: "hard", label: t("어려움"), color: "#E0795F" },
];
const RUSH_LEVELS_BY_DIFF = { easy: [], normal: [], hard: [] };
RUSH_LEVELS.forEach((l) => { (RUSH_LEVELS_BY_DIFF[l.diff] || (RUSH_LEVELS_BY_DIFF[l.diff] = [])).push(l); });
const rushLevelFor = (diff, seed) => { const list = RUSH_LEVELS_BY_DIFF[diff] || []; return list.length ? list[Math.abs(seed | 0) % list.length] : RUSH_LEVELS[0]; };
const RUSH_PROGRESS_KEY = "occ_rush_progress";
function loadRushProgress() { try { return JSON.parse(window.localStorage.getItem(RUSH_PROGRESS_KEY) || "{}") || {}; } catch { return {}; } }
function saveRushProgress(p) { try { window.localStorage.setItem(RUSH_PROGRESS_KEY, JSON.stringify(p)); } catch { } }
// 별 평가: par 그대로 풀면 3개, par+2 이내면 2개, 그 밖엔 1개.
const rushStars = (moves, par) => (moves <= par ? 3 : moves <= par + 2 ? 2 : 1);
// 보드 — 기물마다 고유 id를 붙여(layoutId) 내 수·상대의 유인 포획이 칸 사이를 미끄러지듯 움직인다.
function RushGrid({ view, selected, targets, danger, onCell, canDrag, size = 320, lastMove, levelId }) {
  const ctx = useContext(SkinContext);
  const sk = BOARD_SKINS[ctx.boardSkin] || BOARD_SKINS.classic;
  const targetSet = new Set(targets || []);
  const dangerSet = new Set(danger || []);
  const cell = size / 8;
  const drag = useGridDrag({
    size, cellAt: (vr, c) => (7 - vr) * 8 + c,
    canDrag: (i) => (canDrag ? canDrag(i) : !!(view.board[i] && view.board[i][0] === "w")),
    onStart: (i) => { if (i !== selected) onCell(i); },
    onDrop: (from, to) => { if (to != null) onCell(to); },
    renderPiece: (i, px) => (view.board[i] ? <PieceGlyph type={view.board[i][1]} color={view.board[i][0]} size={px * 0.87} /> : null),
  });
  const cells = [];
  for (let vr = 0; vr < 8; vr++) for (let c = 0; c < 8; c++) {
    const rank0 = 7 - vr;
    const i = rank0 * 8 + c;
    const p = view.board[i];
    const id = view.ids[i];
    const light = (vr + c) % 2 === 0;
    const isHero = i === view.hero;
    const isSel = i === selected;
    const isTarget = targetSet.has(i);
    const isLast = lastMove && (lastMove[0] === i || lastMove[1] === i);
    cells.push(
      <button key={i} onClick={() => onCell(i)} className="press"
        style={{ position: "relative", border: "none", borderRadius: 0, padding: 0, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", overflow: "visible", ...boardSquareBg(sk, light, vr, c) }}>
        {rank0 === 7 && <span aria-hidden="true" style={{ position: "absolute", inset: 0, background: "rgba(232,196,110,.14)", pointerEvents: "none" }} />}
        {isLast && <span aria-hidden="true" style={{ position: "absolute", inset: 0, background: "rgba(236,203,134,.32)", pointerEvents: "none" }} />}
        {dangerSet.has(i) && <span aria-hidden="true" style={{ position: "absolute", inset: 0, background: "rgba(196,60,50,.28)", pointerEvents: "none" }} />}
        {isSel && <span aria-hidden="true" style={{ position: "absolute", inset: 0, boxShadow: "inset 0 0 0 3px " + T.brassHi, background: "rgba(236,203,134,.25)", pointerEvents: "none" }} />}
        {p && (
          <motion.div layoutId={"rush-" + levelId + "-" + id} transition={{ type: "spring", stiffness: 480, damping: 34 }} style={{ position: "relative", zIndex: 2, display: "flex", alignItems: "center", justifyContent: "center", width: "100%", height: "100%", opacity: drag.dragFrom === i ? 0.35 : 1 }}>
            {isHero && <motion.span aria-hidden="true" animate={{ opacity: [0.55, 1, 0.55] }} transition={{ duration: 1.8, repeat: Infinity }} style={{ position: "absolute", inset: "8%", borderRadius: "50%", boxShadow: "0 0 0 2px " + T.brassHi + ", 0 0 14px 3px rgba(236,203,134,.75)" }} />}
            <PieceGlyph type={p[1]} color={p[0]} size={cell * 0.78} style={{ position: "relative" }} />
            {isHero && <Crown aria-hidden="true" size={Math.max(9, cell * 0.24)} color={T.brassHi} style={{ position: "absolute", top: 1, right: 2, filter: "drop-shadow(0 1px 1px rgba(0,0,0,.7))" }} />}
          </motion.div>
        )}
        {isTarget && <span aria-hidden="true" style={{ position: "absolute", zIndex: 3, width: p ? "86%" : "30%", height: p ? "86%" : "30%", borderRadius: "50%", background: p ? "transparent" : "rgba(40,24,10,.35)", boxShadow: p ? "inset 0 0 0 3px rgba(40,24,10,.45)" : "none", pointerEvents: "none" }} />}
        {c === 0 && <span aria-hidden="true" style={{ position: "absolute", top: 1, left: 2, zIndex: 4, fontSize: Math.max(8, cell * 0.15), fontWeight: 800, color: light ? "rgba(90,58,34,.7)" : "rgba(244,238,226,.7)", pointerEvents: "none" }}>{rank0 + 1}</span>}
        {vr === 7 && <span aria-hidden="true" style={{ position: "absolute", bottom: 0, right: 2, zIndex: 4, fontSize: Math.max(8, cell * 0.15), fontWeight: 800, color: light ? "rgba(90,58,34,.7)" : "rgba(244,238,226,.7)", pointerEvents: "none" }}>{"abcdefgh"[c]}</span>}
      </button>
    );
  }
  return (
    <LayoutGroup id="rush-board">
      <div {...drag.bind} style={{ position: "relative", borderRadius: 4, overflow: "hidden", ...BOARD_GLOSS, boxSizing: "border-box", width: size, height: size, flexShrink: 0, display: "grid", gridTemplateColumns: "repeat(8,1fr)", gridTemplateRows: "repeat(8,1fr)", touchAction: "none" }}>
        {cells}
        {drag.ghost}
      </div>
    </LayoutGroup>
  );
}
// 퍼즐 한 판의 조작 상태 — 선택·이동(탭·드래그)·되돌리기·초기화, 상대 응수(유인 포획)의 단계적 연출까지.
// 화면용 view는 { board, hero, ids } — ids는 칸마다 기물 고유 번호(애니메이션용)로, 엔진 상태와 함께
// 이벤트 순서대로 옮겨 둔다.
function rushView(state, ids) { return { board: state.board, hero: state.hero, ids }; }
function rushInitialIds(board) { let n = 0; return board.map((p) => (p ? ++n : null)); }
function rushMoveIds(ids, events) {
  const out = ids.slice();
  for (const e of events) { out[e.to] = out[e.from]; out[e.from] = null; }
  return out;
}
// (v0.5.4 규칙 변경, 사용자 요청 "나이트 경주처럼 상대 기물이 컨트롤하는 칸에 가면 그 즉시 룩이 잡히며
// 라운드가 끝나도록") 주인공 룩이 잡히면(상대 기물이 지배하는 칸에 들어가 유인 포획을 당하거나, 체크 응수로
// 잡히면) 예전처럼 그 수를 되돌려 주지 않는다 — 잡히는 장면을 그대로 보여주고 status를 "lost"로 두어 더
// 이상 둘 수 없게 한 뒤 onFailed를 부른다(대전은 그 라운드 실패, 혼자 풀기는 실패 화면 → 다시 풀기).
// 레벨의 par는 풀이기(rushSolve)가 원래 잡히는 수를 막다른 길로 다뤄 왔으므로 레벨을 다시 만들 필요가 없다.
function useRushPuzzle(level, { enabled = true, onSolved, onFailed } = {}) {
  const start = useMemo(() => rushParse(level.spec), [level.spec]);
  const startIds = useMemo(() => rushInitialIds(start.board), [start]);
  const [hist, setHist] = useState(() => [{ state: start, ids: startIds, last: null }]);
  const [view, setView] = useState(() => rushView(start, startIds));
  const [selected, setSelected] = useState(-1);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState("play"); // play | win | lost(v0.5.4 — 주인공 룩이 잡힘)
  const [msg, setMsg] = useState(null); // { text, tone }
  // (v0.5.6, 사용자 요청) 혼자 풀기의 힌트 기능은 없앴다.
  // (v0.5.5, 사용자 요청) 통제(위험) 칸 표시는 설정 탭 "통제 칸 표시"를 켰을 때만 — 켜져 있으면 처음부터 보이고 도구 모음 버튼으로 끌 수 있다.
  const { dangerOn } = useContext(MinigamePrefsContext);
  const [showDanger, setShowDanger] = useState(dangerOn);
  const [shakeControls, shake] = useBoardShake();
  const timersRef = useRef([]);
  useEffect(() => () => timersRef.current.forEach(clearTimeout), []);
  useEffect(() => {
    timersRef.current.forEach(clearTimeout); timersRef.current = [];
    setHist([{ state: start, ids: startIds, last: null }]); setView(rushView(start, startIds));
    setSelected(-1); setBusy(false); setStatus("play"); setMsg(null);
  }, [start, startIds]);
  const cur = hist[hist.length - 1];
  const moves = hist.length - 1;
  const flash = (text, tone, ms = 1800) => { setMsg({ text, tone, k: Date.now() }); const t = setTimeout(() => setMsg((m) => (m && m.text === text ? null : m)), ms); timersRef.current.push(t); };
  const targets = selected >= 0 && !busy ? rushTargetsFrom(cur.state, selected) : [];
  const danger = useMemo(() => {
    if (!showDanger || !dangerOn) return [];
    const out = [];
    for (let i = 0; i < 64; i++) if (!(cur.state.board[i] && cur.state.board[i][0] === "b") && rushAttacked(cur.state.board, i, "b")) out.push(i);
    return out;
  }, [showDanger, dangerOn, cur.state]);
  const onCell = (i) => {
    if (!enabled || busy || status !== "play") return;
    const p = cur.state.board[i];
    if (selected >= 0 && targets.includes(i)) { doMove(selected, i); return; }
    if (p && p[0] === "w") { setSelected(i === selected ? -1 : i); fx("tap"); return; }
    setSelected(-1);
  };
  const doMove = (from, to) => {
    setSelected(-1);
    const res = rushApply(cur.state, from, to);
    const first = res.events[0];
    playSfx(first.captured ? "capture" : "move");
    // 1단계: 내 수만 먼저 보여준다.
    const idsAfterMine = rushMoveIds(cur.ids, [first]);
    const mineBoard = cur.state.board.slice(); mineBoard[to] = mineBoard[from]; mineBoard[from] = null;
    setView({ board: mineBoard, hero: cur.state.hero === from ? to : cur.state.hero, ids: idsAfterMine });
    const rest = res.events.slice(1);
    const finish = () => {
      if (res.status === "fail") {
        fx("wrong"); buzz([80, 50, 80]); shake();
        flash(t("주인공 룩이 잡힘"), "bad", 4000);
        const ids = rushMoveIds(cur.ids, res.events);
        setHist((h) => [...h, { state: res.state, ids, last: [from, to] }]);
        setView(rushView(res.state, ids)); setBusy(false); setStatus("lost");
        onFailed && onFailed(hist.length);
        return;
      }
      if (res.status === "mateOther") {
        fx("wrong"); shake();
        flash(t("메이트는 주인공 룩으로"), "bad");
        setView(rushView(cur.state, cur.ids)); setBusy(false); return;
      }
      const ids = rushMoveIds(cur.ids, res.events);
      const entry = { state: res.state, ids, last: [from, to] };
      setHist((h) => [...h, entry]);
      setView(rushView(res.state, ids));
      setBusy(false);
      if (rest.some((e) => e.kind === "lure")) { fx("capture"); buzz(50); flash(t("상대 {0} 상대가 미끼를 물음", RUSH_PIECE_SUBJ[rest[0].piece[1]]), "info"); }
      else if (rest.some((e) => e.kind === "reply")) { fx("capture"); flash(t("체크. 상대 응수"), "info"); }
      if (res.status === "win") {
        setStatus("win");
        fx("correct"); buzz([40, 40, 40]);
        onSolved && onSolved(hist.length);
      }
    };
    if (rest.length) {
      setBusy(true);
      const t = setTimeout(() => {
        setView({ board: res.state.board, hero: res.state.hero < 0 ? -1 : res.state.hero, ids: rushMoveIds(cur.ids, res.events) });
        const t2 = setTimeout(finish, res.status === "fail" ? 650 : 260);
        timersRef.current.push(t2);
      }, 380);
      timersRef.current.push(t);
    } else finish();
  };
  const undo = () => {
    if (busy || status !== "play" || hist.length <= 1) return;
    const h = hist.slice(0, -1);
    setHist(h); setView(rushView(h[h.length - 1].state, h[h.length - 1].ids)); setSelected(-1); fx("whoosh");
  };
  const reset = () => {
    if (busy || status !== "play") return;
    setHist([{ state: start, ids: startIds, last: null }]); setView(rushView(start, startIds)); setSelected(-1); fx("whoosh");
  };
  // 풀고 난 뒤 "다시 풀기" — win 상태에서도 처음 포지션·play 상태로 완전히 되돌린다.
  const restart = () => {
    timersRef.current.forEach(clearTimeout); timersRef.current = [];
    setHist([{ state: start, ids: startIds, last: null }]); setView(rushView(start, startIds));
    setSelected(-1); setBusy(false); setMsg(null); setStatus("play"); fx("whoosh");
  };
  const canDrag = (i) => enabled && !busy && status === "play" && !!(cur.state.board[i] && cur.state.board[i][0] === "w");
  return { view, selected, targets, danger, showDanger, setShowDanger, onCell, canDrag, undo, reset, restart, moves, status, msg, shakeControls, lastMove: cur.last, busy };
}
const RUSH_PIECE_SUBJ = { P: t("폰이"), N: t("나이트가"), B: t("비숍이"), R: t("룩이"), Q: t("퀸이"), K: t("킹이") };
function RushMsg({ msg }) {
  return (
    <div style={{ minHeight: 26, display: "flex", justifyContent: "center", alignItems: "center", flexShrink: 0, margin: "6px 0 2px" }}>
      <AnimatePresence mode="popLayout">
        {msg && (
          <motion.div key={msg.k} initial={{ y: 8, opacity: 0, scale: 0.9 }} animate={{ y: 0, opacity: 1, scale: 1 }} exit={{ opacity: 0, y: -6 }}
            style={{ padding: "4px 12px", borderRadius: 999, fontSize: 11.5, fontWeight: 800, background: msg.tone === "bad" ? "rgba(196,60,50,.22)" : "rgba(127,214,255,.16)", border: "1px solid " + (msg.tone === "bad" ? "rgba(224,121,95,.6)" : "rgba(127,214,255,.5)"), color: msg.tone === "bad" ? "#F4B2A6" : "#CDEFFF" }}>{msg.text}</motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
function RushToolbar({ p }) {
  const { dangerOn } = useContext(MinigamePrefsContext);
  const btn = (onClick, Icon, label, disabled, active) => (
    <button onClick={onClick} disabled={disabled} className="press"
      style={{ flex: 1, display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 5, padding: "8px 0", borderRadius: 9, border: "1px solid " + (active ? T.brassHi : "rgba(150,112,58,.45)"), background: active ? "rgba(236,203,134,.18)" : "rgba(255,255,255,.55)", color: disabled ? "rgba(90,58,34,.40)" : T.ink, fontSize: 11.5, fontWeight: 800, cursor: disabled ? "default" : "pointer" }}>
      <Icon size={14} />{label}
    </button>
  );
  return (
    <div style={{ display: "flex", gap: 6, flexShrink: 0, marginTop: 4 }}>
      {btn(p.undo, Undo2, t("되돌리기"), p.moves === 0 || p.status !== "play")}
      {btn(p.reset, RotateCcw, t("처음부터"), p.moves === 0 || p.status !== "play")}
      {dangerOn && btn(() => p.setShowDanger((v) => !v), Eye, t("위험 칸"), false, p.showDanger)}
    </div>
  );
}
function RushRules({ compact }) {
  return (
    <div style={{ textAlign: "left", fontSize: 11.5, lineHeight: 1.6, color: "rgba(90,58,34,.82)", padding: compact ? 0 : "10px 12px", borderRadius: 10, background: compact ? "transparent" : "rgba(255,255,255,.45)", border: compact ? "none" : "1px solid rgba(150,112,58,.33)" }}>
      <div>• {tx("{0}을 빼내 상대 백랭크(맨 윗줄)에서 킹 메이트", <b style={{ color: MG_GOLD }}>{t("왕관 표시 룩")}</b>)}</div>
      <div>{tx("• 다른 기물은 실제 체스 규칙대로 이동. 길을 비켜 주거나 {0}으로 상대 기물 유인 가능", <b style={{ color: T.ink }}>{t("희생")}</b>)}</div>
      <div>{tx("• 상대 기물은 정지 상태. {0}이 공격 범위에 들어오면 잡으러 옴", <b style={{ color: T.ink }}>{t("방금 움직인 내 기물")}</b>)}</div>
      <div>{tx("• 주인공 룩이 {0}에 들어가면 즉시 잡혀 라운드 종료 (혼자 풀기는 실패, 다시 풀기). 적은 수로 풀수록 별 증가", <b style={{ color: "#F4B2A6" }}>{t("상대 기물이 지배하는 칸")}</b>)}</div>
    </div>
  );
}
// 퍼즐 한 판 화면(혼자 풀기) — 레벨 번호·난이도·수/par·별·다음 레벨.
function RushSoloPlay({ level, onBack, onNext, progress, onRecord }) {
  const [solvedMoves, setSolvedMoves] = useState(null);
  const [failed, setFailed] = useState(false);
  const p = useRushPuzzle(level, { onSolved: (m) => { setSolvedMoves(m); onRecord(level.id, m); }, onFailed: () => setTimeout(() => setFailed(true), 700) });
  const [boardSize, boardFitRef] = useSquareFit(460);
  const diff = RUSH_DIFFS.find((d) => d.key === level.diff);
  const best = progress[level.id];
  return (
    <div style={{ flex: 1, minHeight: 0, display: "flex", flexDirection: "column" }}>
      <div className="flex items-center justify-between" style={{ marginBottom: 8, flexShrink: 0 }}>
        <button onClick={onBack} className="press" style={{ fontSize: 11.5, fontWeight: 800, color: "rgba(90,58,34,.85)", background: "transparent", border: "none", cursor: "pointer", display: "inline-flex", alignItems: "center", gap: 3 }}>{tx("{0}레벨 목록", <ChevronLeft size={14} />)}</button>
        <span style={{ fontSize: 12, fontWeight: 800, color: diff.color }}>{diff.label} {level.id.slice(1)}{level.lure ? t(" · 희생") : ""}</span>
        <span style={{ fontSize: 11.5, fontWeight: 700, color: "rgba(90,58,34,.85)" }}>{tx("수 {0} · 목표 {1}수{2}", <b style={{ color: T.ink }}>{p.moves}</b>, level.par, best ? t(" · 최고 {0}", best) : "")}</span>
      </div>
      <div ref={boardFitRef} style={{ flex: 1, minHeight: 0, display: "flex", alignItems: "center", justifyContent: "center" }}>
        <motion.div animate={p.shakeControls} style={{ position: "relative" }}>
          <RushGrid view={p.view} selected={p.selected} targets={p.targets} danger={p.danger} onCell={p.onCell} canDrag={p.canDrag} size={boardSize} lastMove={p.lastMove} levelId={level.id} />
          <AnimatePresence>
            {failed && solvedMoves == null && (
              <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} style={{ position: "absolute", inset: 0, zIndex: 20, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", background: "rgba(250,244,230,.9)", borderRadius: 6 }}>
                <motion.div initial={{ scale: 0.5 }} animate={{ scale: 1 }} transition={{ type: "spring", stiffness: 300, damping: 15 }} style={{ fontSize: 28, fontWeight: 900, color: T.blunder, fontFamily: SITE_FONT }}>{t("룩이 잡힘")}</motion.div>
                <div style={{ fontSize: 12, color: "rgba(90,58,34,.90)", margin: "6px 0 12px" }}>{t("상대 기물이 지배하는 칸에 진입. 시도 실패")}</div>
                <button onClick={() => { setFailed(false); p.restart(); }} className="press" style={{ padding: "8px 18px", borderRadius: 9, border: "none", background: "linear-gradient(180deg," + T.brass + ",#A8842F)", color: "#241509", fontWeight: 800, fontSize: 12, cursor: "pointer", display: "inline-flex", alignItems: "center", gap: 5 }}>{tx("{0}다시 풀기", <RotateCcw size={13} />)}</button>
              </motion.div>
            )}
            {solvedMoves != null && (
              <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} style={{ position: "absolute", inset: 0, zIndex: 20, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", background: "rgba(250,244,230,.9)", borderRadius: 6 }}>
                <VictoryBurst />
                <motion.div initial={{ scale: 0.5 }} animate={{ scale: 1 }} transition={{ type: "spring", stiffness: 300, damping: 15 }} style={{ fontSize: 30, fontWeight: 900, color: MG_GOLD, fontFamily: SITE_FONT, textShadow: "0 0 24px rgba(232,196,110,.5)" }}>{t("체크메이트")}</motion.div>
                <div style={{ display: "flex", gap: 4, margin: "8px 0 4px" }}>
                  {[1, 2, 3].map((k) => <motion.span key={k} initial={{ scale: 0, rotate: -60 }} animate={{ scale: 1, rotate: 0 }} transition={{ delay: 0.2 + k * 0.15, type: "spring", stiffness: 400, damping: 14 }}><Star size={28} color={MG_GOLD} fill={k <= rushStars(solvedMoves, level.par) ? MG_GOLD : "transparent"} /></motion.span>)}
                </div>
                <div style={{ fontSize: 12, color: "rgba(90,58,34,.90)", marginBottom: 12 }}>{tx("{0}수 (최단 {1}수)", solvedMoves, level.par)}</div>
                <div style={{ display: "flex", gap: 8 }}>
                  <button onClick={() => { setSolvedMoves(null); p.restart(); }} className="press" style={{ padding: "8px 16px", borderRadius: 9, border: "1px solid " + T.brass, background: "rgba(196,154,80,.14)", color: T.ink, fontWeight: 800, fontSize: 12, cursor: "pointer" }}>{t("다시 풀기")}</button>
                  {onNext && <button onClick={onNext} className="press" style={{ padding: "8px 18px", borderRadius: 9, border: "none", background: "linear-gradient(180deg," + T.brass + ",#A8842F)", color: "#241509", fontWeight: 800, fontSize: 12, cursor: "pointer" }}>{t("다음 레벨")}</button>}
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </motion.div>
      </div>
      <RushMsg msg={p.msg} />
      <RushToolbar p={p} />
    </div>
  );
}
function RushLevelSelect({ progress, onPick }) {
  const total = RUSH_LEVELS.length;
  const stars = RUSH_LEVELS.reduce((a, l) => a + (progress[l.id] ? rushStars(progress[l.id], l.par) : 0), 0);
  // (v0.5.7) 데스크톱에선 난이도마다 8칸씩 두 줄로 딱 맞게 놓는다(자동 채우기면 13+3처럼 끝줄이 짧게 남았다).
  return (
    <div style={{ width: "100%", maxWidth: 600, margin: "0 auto" }}>
      <style>{"@media (min-width:" + (MG_DESKTOP_BP + 1) + "px){.rush-level-grid{grid-template-columns:repeat(8,minmax(0,1fr)) !important}}"}</style>
      <div className="flex items-center justify-between" style={{ marginBottom: 10 }}>
        <span style={{ fontSize: 12.5, fontWeight: 800, color: T.ink }}>{t("혼자 풀기")}</span>
        <span style={{ fontSize: 11.5, fontWeight: 800, color: MG_GOLD, display: "inline-flex", alignItems: "center", gap: 4 }}><Star size={13} fill={MG_GOLD} color={MG_GOLD} />{stars} / {total * 3}</span>
      </div>
      {RUSH_DIFFS.map((d) => (
        <div key={d.key} style={{ marginBottom: 12 }}>
          <div style={{ fontSize: 11, fontWeight: 800, color: d.color, marginBottom: 6, textAlign: "left" }}>{d.label}</div>
          <div className="rush-level-grid" style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(52px,1fr))", gap: 6 }}>
            {RUSH_LEVELS_BY_DIFF[d.key].map((l) => {
              const best = progress[l.id];
              const st = best ? rushStars(best, l.par) : 0;
              return (
                <button key={l.id} onClick={() => onPick(l)} className="press"
                  style={{ padding: "7px 0 5px", borderRadius: 9, border: "1px solid " + (best ? d.color : "rgba(150,112,58,.37)"), background: best ? d.color + "22" : "rgba(255,255,255,.45)", color: T.ink, cursor: "pointer" }}>
                  <div style={{ fontSize: 13, fontWeight: 900 }}>{l.id.slice(1)}</div>
                  <div style={{ display: "flex", justifyContent: "center", gap: 1, marginTop: 2 }}>
                    {[1, 2, 3].map((k) => <Star key={k} size={8} color={k <= st ? MG_GOLD : "rgba(90,58,34,.40)"} fill={k <= st ? MG_GOLD : "transparent"} />)}
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}
// 대전 한 라운드 — 봇·PvP 공용. opp는 { label, moves, solved, done }(표시용), onDone(solved, moves)는
// 내가 풀었거나 시간이 다 됐을 때 딱 한 번 부른다.
function RushRound({ level, startAt, timeLimitMs, opp, result, roundKey, onDone, onProgress }) {
  const oppInfo = useContext(MgOppContext);
  const [started, setStarted] = useState(() => Date.now() >= startAt);
  useEffect(() => { if (started) return; const t = setTimeout(() => setStarted(true), Math.max(0, startAt - Date.now())); return () => clearTimeout(t); }, [started, startAt]);
  const [done, setDone] = useState(false);
  const doneRef = useRef(false);
  const finish = useCallback((solved, moves, captured) => { if (doneRef.current) return; doneRef.current = true; setDone(true); onDone(solved, moves, !!captured); }, [onDone]);
  const p = useRushPuzzle(level, { enabled: started && !done, onSolved: (m) => finish(true, m), onFailed: (m) => finish(false, m, true) });
  const movesRef = useRef(0); movesRef.current = p.moves;
  useEffect(() => { if (onProgress && p.moves > 0) onProgress(p.moves); }, [p.moves]); // eslint-disable-line react-hooks/exhaustive-deps
  const now = useNow(started && !done, 200);
  const left = Math.max(0, timeLimitMs - (Math.max(now, startAt) - startAt));
  useKnightRoundFx(left, started && !done);
  useEffect(() => { if (started && !done && left <= 0) { fx("wrong"); finish(false, movesRef.current); } }, [left, started, done, finish]);
  const [boardSize, boardFitRef] = useSquareFit(460);
  const diff = RUSH_DIFFS.find((d) => d.key === level.diff);
  return (
    <div style={{ flex: 1, minHeight: 0, display: "flex", flexDirection: "column" }}>
      <div className="flex items-center justify-between" style={{ marginBottom: 6, fontSize: 11, color: "rgba(90,58,34,.80)", fontWeight: 700, flexShrink: 0 }}>
        <span className="flex items-center" style={{ gap: 5 }}><span>{tx("{0} · 내 수 {1}", <b style={{ color: diff.color }}>{diff.label}</b>, <b style={{ color: T.ink }}>{p.moves}</b>)} ·</span>
          {/* (v0.5.7) 상대 진행 — 상대 프로필 사진을 우상단에 단 파란 알약, 상대가 수를 둘 때마다 한 번 톡 튄다. */}
          <motion.span key={"om" + (opp.moves || 0) + (opp.done ? "d" : "")} initial={{ scale: 1.14 }} animate={{ scale: 1 }} transition={{ type: "spring", stiffness: 500, damping: 18 }}
            style={{ position: "relative", display: "inline-flex", alignItems: "center", padding: oppInfo ? "2px 20px 2px 8px" : "2px 8px", borderRadius: 999, background: "rgba(111,168,220,.14)", border: "1px solid rgba(111,168,220,.55)" }}>
            {opp.label} {opp.solved ? t("완료 {0}수", opp.moves) : opp.done ? t("실패") : t("{0}수", (opp.moves || 0))}
            {oppInfo && <MgOppBadge opp={oppInfo} size={15} />}
          </motion.span>
        </span>
        <span style={{ fontVariantNumeric: "tabular-nums", color: left < timeLimitMs * 0.25 ? T.blunder : "rgba(90,58,34,.95)" }}>{tx("{0}초", Math.ceil(left / 1000))}</span>
      </div>
      <MinigameTimeBar pct={left / timeLimitMs} />
      <div ref={boardFitRef} style={{ flex: 1, minHeight: 0, display: "flex", alignItems: "center", justifyContent: "center" }}>
        <motion.div animate={p.shakeControls} style={{ position: "relative" }}>
          <RushGrid view={p.view} selected={p.selected} targets={p.targets} danger={p.danger} onCell={p.onCell} canDrag={p.canDrag} size={boardSize} lastMove={p.lastMove} levelId={level.id + ":" + roundKey} />
          <MinigameCountdown startAt={startAt} />
          <MinigameRoundBanner result={result} roundKey={roundKey} />
        </motion.div>
      </div>
      {/* (v0.5.7, 사용자 요청) 안내 문구가 너무 연해 잘 안 보였다 — 본문 잉크색·굵게 */}
      <div style={{ textAlign: "center", fontSize: 12, color: T.ink, fontWeight: 800, marginTop: 6, minHeight: 16, flexShrink: 0 }}>
        {result ? "" : done ? (p.status === "win" ? t("풀이 완료 {0}를 기다리는 중...", opp.label) : p.status === "lost" ? t("룩이 잡힘. 결과 대기 중…") : t("시간 초과. 결과 대기 중…")) : (opp.solved ? t("{0}가 이미 풂. 더 적은 수로 역전 가능", (opp.label)) : t("목표: 최단 {0}수", level.par))}
      </div>
      <RushMsg msg={p.msg} />
      <RushToolbar p={p} />
    </div>
  );
}
function rushRoundChips(rounds, meKey, oppKey, mineOf) {
  return rounds.map((r, i) => {
    const mine = mineOf(r);
    return { result: r.winner === meKey ? "me" : r.winner === oppKey ? "opp" : "draw", label: RUSH_DIFFS[i] ? RUSH_DIFFS[i].label : "R" + (i + 1), detail: mine && mine.solved ? t("{0}수", (mine.moves)) : t("실패") };
  });
}
function rushStatsOf(list) {
  const solved = list.filter((x) => x && x.solved);
  return [
    { label: t("푼 퍼즐"), value: solved.length + "/" + list.length },
    { label: t("총 이동 수"), value: solved.length ? solved.reduce((a, x) => a + x.moves, 0) : "-" },
    { label: t("최단 대비"), value: solved.length ? "+" + solved.reduce((a, x) => a + (x.moves - x.par), 0) : "-" },
  ];
}
// 봇 대전 — 봇은 라운드마다 "par + 0~3수"를 "par × 5~10초 + 7초" 동안 푸는 것으로 흉내 낸다(어려운
// 퍼즐일수록 오래 걸린다). 진행 상황(수 개수)도 실제로 두는 것처럼 조금씩 올라간다.
function RushBotBoard({ onExit, onStatusChange, onRematch }) {
  const [rounds, setRounds] = useState([]); // [{ level, startAt, me: {solved,moves}|null, bot: {...}|null, botMoves, winner }]
  const timersRef = useRef([]);
  useEffect(() => () => timersRef.current.forEach(clearTimeout), []);
  const idx = rounds.length - 1;
  const round = rounds[idx] || null;
  const myWins = rounds.filter((r) => r.winner === "me").length;
  const botWins = rounds.filter((r) => r.winner === "opp").length;
  const finished = round && round.winner && (myWins >= 2 || botWins >= 2 || rounds.length >= 3);
  useEffect(() => { onStatusChange && onStatusChange(finished ? "finished" : "active"); }, [finished, onStatusChange]);
  const startRound = useCallback((n) => {
    const diff = RUSH_DIFFS[n].key;
    const level = rushLevelFor(diff, Math.floor(Math.random() * 1e6));
    const startAt = Date.now() + 3000;
    // (v0.5.3 난이도 완화, 사용자 요청) 성공률·최단 수 확률을 낮추고 풀이 시간을 늘렸다.
    const botSolves = Math.random() < (diff === "hard" ? 0.6 : diff === "normal" ? 0.75 : 0.85);
    const botMoves = level.par + (Math.random() < 0.25 ? 0 : 1 + Math.floor(Math.random() * 3));
    const botMs = Math.min(RUSH_ROUND_MS - 2000, 7000 + level.par * (5000 + Math.random() * 5000));
    setRounds((rs) => [...rs, { level, startAt, me: null, bot: null, botMoves: 0, winner: null, plan: { solves: botSolves, moves: botMoves } }]);
    for (let k = 1; k <= botMoves; k++) {
      timersRef.current.push(setTimeout(() => setRounds((rs) => { const c = rs.slice(); const r = c[n]; if (!r || r.bot || r.winner) return rs; c[n] = { ...r, botMoves: k }; return c; }), 3000 + (botMs * k) / (botMoves + 0.5)));
    }
    timersRef.current.push(setTimeout(() => setRounds((rs) => { const c = rs.slice(); const r = c[n]; if (!r || r.bot || r.winner) return rs; c[n] = { ...r, bot: botSolves ? { solved: true, moves: botMoves, ms: botMs } : { solved: false, moves: botMoves, ms: RUSH_ROUND_MS } }; return c; }), 3000 + (botSolves ? botMs : RUSH_ROUND_MS)));
  }, []);
  useEffect(() => { if (rounds.length === 0) startRound(0); }, [rounds.length, startRound]);
  // 판정 — 내 결과와 봇 결과가 둘 다 나오면(봇이 늦으면 시간 초과까지 기다린다).
  useEffect(() => {
    if (!round || round.winner || !round.me) return;
    const me = round.me, bot = round.bot;
    let w;
    if (!bot) {
      // 봇이 아직 푸는 중 — 봇이 더 적은 수로 풀 수도 있으니 결과를 기다린다.
      // (v0.5.5 버그 수정) 예전엔 봇이 끝날 때까지 무조건 기다려, 봇이 못 푸는 라운드면 내가 먼저 풀었거나 룩이
      // 잡혀도 제한시간 2분이 다 찰 때까지 "결과를 기다리는 중..."에 멈춰 있었다. 봇의 결과는 라운드 시작 때
      // 이미 정해져 있으니(plan), 봇이 끝까지 가도 승패가 바뀌지 않는 경우엔 바로 판정한다.
      const plan = round.plan;
      if (!plan) return;
      if (me.solved && (!plan.solves || plan.moves > me.moves)) w = "me";
      else if (!me.solved && !plan.solves) w = "draw";
      else return;
      setRounds((rs) => { const c = rs.slice(); c[idx] = { ...c[idx], winner: w }; return c; });
      return;
    }
    if (me.solved && !bot.solved) w = "me"; else if (bot.solved && !me.solved) w = "opp"; else if (!me.solved && !bot.solved) w = "draw";
    else if (me.moves !== bot.moves) w = me.moves < bot.moves ? "me" : "opp"; else w = me.ms <= bot.ms ? "me" : "opp";
    setRounds((rs) => { const c = rs.slice(); c[idx] = { ...c[idx], winner: w }; return c; });
  }, [round, idx]);
  // (v0.5.4) 정산 화면이 끝나거나 "다음 라운드"로 건너뛸 때 다음 라운드를 시작한다.
  const settle = useRoundSettle(idx, !!(round && round.winner));
  const startedNextRef = useRef(-1);
  useEffect(() => {
    if (!round || !round.winner || finished || settle.phase !== "done" || startedNextRef.current === idx) return;
    startedNextRef.current = idx;
    startRound(rounds.length);
  }, [round && round.winner, finished, rounds.length, startRound, settle.phase, idx]); // eslint-disable-line react-hooks/exhaustive-deps
  const onDone = useCallback((solved, moves, captured) => {
    setRounds((rs) => { const c = rs.slice(); const r = c[c.length - 1]; if (!r || r.me) return rs; c[c.length - 1] = { ...r, me: { solved, moves, ms: Date.now() - r.startAt, captured: !!captured } }; return c; });
  }, []);
  if (settle.phase === "settle") {
    const info = rushSettleInfo(round.me, round.bot, round.winner, round.level.par);
    return <MinigameRoundSettle roundNo={idx + 1} roundTotal={3} result={round.winner} myScore={myWins} oppScore={botWins} oppLabel={t("봇")}
      sub={RUSH_DIFFS[idx] ? t("{0} 퍼즐", (RUSH_DIFFS[idx].label)) : null} rows={info.rows} reason={info.reason} until={settle.until} onNext={settle.skip} nextLabel={finished ? t("최종 결과") : t("다음 라운드")} />;
  }
  if (finished && settle.phase === "done") {
    const outcome = myWins > botWins ? "win" : botWins > myWins ? "lose" : "draw";
    return <MinigameResult outcome={outcome} myScore={myWins} oppScore={botWins} oppLabel={t("봇")}
      rounds={rushRoundChips(rounds, "me", "opp", (r) => r.me)} stats={rushStatsOf(rounds.map((r) => r.me && { ...r.me, par: r.level.par }))} onExit={onExit} onRematch={onRematch} />;
  }
  return (
    <div style={{ flex: 1, minHeight: 0, display: "flex", flexDirection: "column" }}>
      <MinigameScoreHeader myScore={myWins} oppScore={botWins} oppLabel={t("봇")} center={t("{0} / 3 라운드 · 2선승", (Math.max(1, rounds.length)))} />
      {round && <RushRound key={idx} level={round.level} startAt={round.startAt} timeLimitMs={RUSH_ROUND_MS} roundKey={idx} result={round.winner}
        opp={{ label: t("봇"), moves: round.bot ? round.bot.moves : round.botMoves, solved: round.bot && round.bot.solved, done: !!round.bot }} onDone={onDone} />}
    </div>
  );
}
function RushPvpBoard({ game: initialGame, myUid, onExit, onStatusChange }) {
  const [game, setGame] = useState(initialGame);
  useEffect(() => { onStatusChange && onStatusChange(game.status); }, [game.status, onStatusChange]);
  useRealtimeTable("pvp_games", "id=eq." + initialGame.id, useCallback((payload) => {
    if (payload && payload.new) setGame(payload.new);
    else if (!payload) { sbSelect("pvp_games?id=eq." + initialGame.id + "&select=*").then((rows) => { if (rows && rows[0]) setGame(rows[0]); }).catch(() => { }); }
  }, [initialGame.id]), true, 3000);
  const isWhite = myUid === game.white_uid;
  const me = isWhite ? "w" : "b", opp = isWhite ? "b" : "w";
  const rounds = game.sans || [];
  const idx = Math.max(0, rounds.length - 1);
  const round = rounds[idx] || null;
  const myWins = rounds.filter((r) => r.winner === me).length;
  const oppWins = rounds.filter((r) => r.winner === opp).length;
  const finished = game.status !== "active";
  useEffect(() => {
    if (finished) return;
    if (rounds.length === 0) { sbRpc("rush_start_round", { p_game_id: game.id }).then((g) => g && setGame(g)).catch(() => { }); return; }
    if (round && round.winner) {
      const t = setTimeout(() => { sbRpc("rush_start_round", { p_game_id: game.id }).then((g) => g && setGame(g)).catch(() => { }); }, ROUND_SETTLE_TOTAL);
      return () => clearTimeout(t);
    }
  }, [game.id, rounds.length, round && round.winner, finished]);
  const settle = useRoundSettle(idx, !!(round && round.winner), round && round.resolvedAt ? Date.parse(round.resolvedAt) : null);
  const myRep = round && round.reports && round.reports[me];
  const oppRep = round && round.reports && round.reports[opp];
  // 내가 보고를 마쳤는데 아직 라운드가 안 끝났으면 주기적으로 확정을 시도한다(knight와 같은 패턴).
  useEffect(() => {
    if (!round || round.winner || !myRep) return;
    const t = setInterval(() => { sbRpc("rush_resolve_round", { p_game_id: game.id }).then((g) => g && setGame(g)).catch(() => { }); }, 1200);
    return () => clearInterval(t);
  }, [round && round.winner, !!myRep, game.id]);
  const onDone = useCallback((solved, moves, captured) => {
    sbRpc("rush_report", { p_game_id: game.id, p_round: idx, p_solved: solved, p_moves: moves, p_captured: !!captured }).then((g) => g && setGame(g)).catch(() => { });
  }, [game.id, idx]);
  if (settle.phase === "settle") {
    const info_ = (c) => { const r = round.reports && round.reports[c]; return r ? { solved: !!r.solved, moves: r.moves || 0, ms: new Date(r.at).getTime() - new Date(round.startedAt).getTime(), captured: !!r.captured } : null; };
    const res = round.winner === me ? "me" : round.winner === opp ? "opp" : "draw";
    const info = rushSettleInfo(info_(me), info_(opp), res, rushLevelFor(round.diff, round.seed).par);
    return <MinigameRoundSettle roundNo={idx + 1} roundTotal={3} result={res} myScore={myWins} oppScore={oppWins} oppLabel={t("상대")}
      sub={RUSH_DIFFS[idx] ? t("{0} 퍼즐", (RUSH_DIFFS[idx].label)) : null} rows={info.rows} reason={info.reason} until={settle.until} nextLabel={finished ? t("최종 결과") : t("다음 라운드")} />;
  }
  if (finished && (settle.phase === "done" || !(round && round.winner))) {
    const iWon = (isWhite && game.status === "white_won") || (!isWhite && game.status === "black_won");
    const done = rounds.filter((r) => r.winner);
    return <MinigameResult outcome={game.status === "draw" ? "draw" : iWon ? "win" : "lose"} myScore={myWins} oppScore={oppWins} oppLabel={t("상대")} rating={minigameRatingOf(game, myUid)}
      rounds={rushRoundChips(done, me, opp, (r) => r.reports && r.reports[me])}
      stats={rushStatsOf(done.map((r) => { const m = r.reports && r.reports[me]; return m && { ...m, par: rushLevelFor(r.diff, r.seed).par }; }))}
      note={game.result_reason === "rush_forfeit" ? (iWon ? t("상대가 대전 포기") : t("대전 포기")) : null} onExit={onExit} />;
  }
  const oppProg = round && round.progress && round.progress[opp];
  return (
    <div style={{ flex: 1, minHeight: 0, display: "flex", flexDirection: "column" }}>
      <MinigameScoreHeader myScore={myWins} oppScore={oppWins} oppLabel={t("상대")} center={t("{0} / 3 라운드 · 2선승", (idx + 1))} />
      {round ? <RushPvpRoundWrap key={idx} round={round} idx={idx} gameId={game.id} onDone={onDone}
        result={round.winner ? (round.winner === me ? "me" : round.winner === opp ? "opp" : "draw") : null}
        opp={{ label: t("상대"), moves: oppRep ? oppRep.moves : (oppProg && oppProg.moves) || 0, solved: !!(oppRep && oppRep.solved), done: !!oppRep }} />
        : <div style={{ textAlign: "center", padding: "20px 0" }}><PendingDots size={12} /></div>}
    </div>
  );
}
// PvP 라운드 래퍼 — 내 수 개수가 바뀔 때마다 rush_ping으로 상대 화면에 진행 상황을 중계한다.
function RushPvpRoundWrap({ round, idx, gameId, onDone, result, opp }) {
  const level = rushLevelFor(round.diff, round.seed);
  return <RushRound level={level} startAt={new Date(round.startedAt).getTime()} timeLimitMs={round.timeLimitMs || RUSH_ROUND_MS} roundKey={idx} result={result} opp={opp}
    onProgress={(moves) => sbRpc("rush_ping", { p_game_id: gameId, p_round: idx, p_moves: moves }).catch(() => { })} onDone={onDone} />;
}
// (v0.5.3) 러시아워 혼자 풀기 — 레벨 목록과 퍼즐 화면을 오간다(허브의 "혼자 플레이하기").
function RushSoloHub() {
  const [level, setLevel] = useState(null);
  const [progress, setProgress] = useState(loadRushProgress);
  // (v0.5.4) 풀 때마다 전체 별 수를 서버 기록으로도 올린다(서버는 더 높을 때만 바꾼다).
  const record = useCallback((id, moves) => setProgress((p) => { const best = p[id] ? Math.min(p[id], moves) : moves; const np = { ...p, [id]: best }; saveRushProgress(np); submitMinigameBest("rush", rushTotalStars(np)); return np; }), []);
  const i = level ? RUSH_LEVELS.findIndex((l) => l.id === level.id) : -1;
  if (level) return <RushSoloPlay key={level.id} level={level} progress={progress} onRecord={record} onBack={() => setLevel(null)} onNext={i >= 0 && i < RUSH_LEVELS.length - 1 ? () => setLevel(RUSH_LEVELS[i + 1]) : null} />;
  return <div style={{ padding: "8px 2px" }}><RushLevelSelect progress={progress} onPick={setLevel} /></div>;
}
function RushHourGame({ myUid, onExit, onOpenProfile, initialGame }) {
  const progress = loadRushProgress();
  const stars = RUSH_LEVELS.reduce((a, l) => a + (progress[l.id] ? rushStars(progress[l.id], l.par) : 0), 0);
  return (
    <MinigameHub title={t("백랭크 러시아워")} gameType={RUSH_GAME_TYPE} myUid={myUid} onExit={onExit} onOpenProfile={onOpenProfile} initialGame={initialGame} forfeitRpc="rush_forfeit"
      rules={<RushRules compact />} soloScroll
      soloSub={t("{0}레벨 · ★{1}", (RUSH_LEVELS.length), stars)} botSub={t("3라운드 2선승")}
      renderPvp={(p) => <RushPvpBoard key={p.runKey} game={p.game} myUid={myUid} onExit={p.onExit} onStatusChange={p.onStatusChange} />}
      renderBot={(p) => <RushBotBoard key={p.runKey} onExit={p.onExit} onStatusChange={p.onStatusChange} onRematch={p.onRematch} />}
      renderSolo={(p) => <RushSoloHub key={p.runKey} />} />
  );
}
// ---- 공격 모드(attack) — 사용자 설계 4호 미니게임(v0.5.3). "FIFA Mobile 공격 모드 + 체스": 강제
// 체크메이트 수순이 있는 포지션을 "공격 기회"로 두 참가자에게 각자 계속 부여한다. 3분 동안 기회는
// 무제한 — 하나를 끝내면(성공/실패) 곧바로 다음 기회가 온다. 더 많이 메이트시킨 쪽이 승리.
// 등급: 메이트 수순이 짧을수록 좋은 등급(S=1수·A=2수·B=3수·C=4수 이상). 레이팅이 낮은 쪽일수록 좋은
// 등급을 받을 확률이 높다(서버 _attack_grade, 봇 대전은 아래 attackGradeLocal — 같은 공식).
// 동점이면 ① 낮은 등급(C→B→A→S)부터 등급별 성공 수 비교 ② 그래도 같으면 불리한 확률로 싸운(레이팅이
// 높은) 쪽 승리 ③ 레이팅도 같으면 무승부. 정답 판정: 공격 측의 각 수는 기록된 수순과 같아야 하고,
// 어느 시점이든 그 수로 바로 체크메이트가 되면(더 빠른 메이트 포함) 성공으로 인정한다.
const ATTACK_GAME_TYPE = "attack";
const ATTACK_MATCH_MS = 180000;
// (v0.5.5, 사용자 요청) 화면에서는 S·A·B·C 글자 대신 리뷰의 수 등급 아이콘으로 보여준다 — 탁월(S)·유일(A)·최선(B)·우수(C).
// 내부 값(서버 _attack_grade·집계 키)은 그대로 S·A·B·C다.
const ATTACK_GRADES = [
  { g: "S", mate: 1, kind: "brilliant", name: t("탁월"), color: QCOLOR.brilliant, label: t("1수 메이트") },
  { g: "A", mate: 2, kind: "only", name: t("유일"), color: QCOLOR.only, label: t("2수 메이트") },
  { g: "B", mate: 3, kind: "best", name: t("최선"), color: QCOLOR.best, label: t("3수 메이트") },
  { g: "C", mate: 4, kind: "excellent", name: t("우수"), color: QCOLOR.excellent, label: t("4수 이상 메이트") },
];
const attackGradeInfo = (g) => ATTACK_GRADES.find((x) => x.g === g) || ATTACK_GRADES[3];
const attackGradeOfMate = (n) => (n <= 1 ? "S" : n === 2 ? "A" : n === 3 ? "B" : "C");
// supabase-setup.sql의 _attack_grade와 같은 공식 — 기본 분포 S25·A35·B25·C15%를, 상대보다 레이팅이
// 낮을수록(400점 차이에서 최대) S·A 쪽으로, 높을수록 B·C 쪽으로 기울인다.
function attackGradeLocal(my, opp) {
  const t = Math.max(-1, Math.min(1, ((opp || 800) - (my || 800)) / 400));
  const w = [0.25 * (1 + 0.8 * t), 0.35 * (1 + 0.3 * t), 0.25 * (1 - 0.3 * t), 0.15 * (1 - 0.8 * t)];
  let x = Math.random() * w.reduce((a, b) => a + b, 0);
  for (let i = 0; i < 4; i++) { if (x < w[i]) return ATTACK_GRADES[i].g; x -= w[i]; }
  return "C";
}
// 포지션 풀 — 번들 시드(src/data/attackPositions.json, 첫 진입 때만 지연 로드) + 개발자가 추가한 DB
// 포지션(attack_positions). 두 클라이언트가 같은 목록을 같은 순서로 갖도록 id 기준으로 정렬한다.
let attackPoolPromise = null;
function loadAttackPool(force) {
  if (attackPoolPromise && !force) return attackPoolPromise;
  attackPoolPromise = (async () => {
    const seed = (await import("../data/attackPositions.json")).default || [];
    let extra = [];
    if (SB_ON) { try { extra = (await sbSelect("attack_positions?select=id,fen,moves,mate_in,source&order=id")) || []; } catch { } }
    const all = [
      ...seed.map((p) => ({ id: p.id, fen: p.fen, moves: p.moves, mateIn: p.mateIn, src: p.src })),
      ...extra.map((r) => ({ id: "d" + r.id, dbId: r.id, fen: r.fen, moves: r.moves, mateIn: r.mate_in, src: r.source || "dev" })),
    ];
    const byGrade = { S: [], A: [], B: [], C: [] };
    all.forEach((p) => byGrade[attackGradeOfMate(p.mateIn)].push(p));
    return { all, byGrade, dev: all.filter((p) => p.dbId) };
  })();
  return attackPoolPromise;
}
function useAttackPool() {
  const [pool, setPool] = useState(null);
  const reload = useCallback((force) => { loadAttackPool(force).then(setPool).catch(() => { }); }, []);
  useEffect(() => { reload(false); }, [reload]);
  return [pool, () => reload(true)];
}
const attackPick = (pool, grade, pick) => { const list = (pool && pool.byGrade[grade]) || []; return list.length ? list[Math.abs(pick | 0) % list.length] : null; };
const uciOf = (m) => m.from + m.to + (m.promotion || "");
// 체스판 — chess.js 보드를 사이트 스킨으로 그린다. 공격 측이 항상 아래쪽.
function AttackGrid({ chess, flip, selected, targets, onCell, canDrag, size, lastMove, hintMove, mated, mark, moveFx }) {
  const ctx = useContext(SkinContext);
  const sk = BOARD_SKINS[ctx.boardSkin] || BOARD_SKINS.classic;
  const b = chess.board();
  const tset = new Set(targets || []);
  const cell = size / 8;
  const inCheck = chess.inCheck();
  const turn = chess.turn();
  const drag = useGridDrag({
    size, cellAt: (vr, vc) => { const r = flip ? 7 - vr : vr, c = flip ? 7 - vc : vc; return "abcdefgh"[c] + (8 - r); },
    canDrag: (sq) => !!(canDrag && canDrag(sq)),
    onStart: (sq) => { if (sq !== selected) onCell(sq); },
    onDrop: (from, to) => { if (to) onCell(to); },
    renderPiece: (sq, px) => { const pc = chess.get(sq); return pc ? <PieceGlyph type={pc.type.toUpperCase()} color={pc.color} size={px * 0.89} /> : null; },
  });
  const cells = [];
  for (let vr = 0; vr < 8; vr++) for (let vc = 0; vc < 8; vc++) {
    const r = flip ? 7 - vr : vr, c = flip ? 7 - vc : vc;
    const sq = "abcdefgh"[c] + (8 - r);
    const p = b[r][c];
    const light = (r + c) % 2 === 0;
    const isLast = lastMove && (lastMove[0] === sq || lastMove[1] === sq);
    const isHint = hintMove && (hintMove[0] === sq || hintMove[1] === sq);
    const kingInCheck = p && p.type === "k" && p.color === turn && inCheck;
    cells.push(
      <button key={sq} onClick={() => onCell(sq)} className="press" style={{ position: "relative", border: "none", borderRadius: 0, padding: 0, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", ...boardSquareBg(sk, light, r, c), zIndex: moveFx && moveFx.sq === sq ? 7 : undefined }}>
        {/* (v0.5.5) 메이트 수의 등급(탁월·유일·최선) 이펙트 — 분석 탭 보드와 같은 연출. */}
        {moveFx && moveFx.sq === sq && <span aria-hidden="true" style={{ position: "absolute", inset: 0, background: QCOLOR[moveFx.kind], opacity: 0.5 }} />}
        {moveFx && moveFx.sq === sq && <MoveClassFx key={moveFx.key} kind={moveFx.kind} cell={cell} vc={vc} vr={vr} clipTop />}
        {isLast && <span aria-hidden="true" style={{ position: "absolute", inset: 0, background: "rgba(236,203,134,.34)" }} />}
        {selected === sq && <span aria-hidden="true" style={{ position: "absolute", inset: 0, background: "rgba(236,203,134,.3)", boxShadow: "inset 0 0 0 3px " + T.brassHi }} />}
        {isHint && <motion.span aria-hidden="true" animate={{ opacity: [0.3, 1, 0.3] }} transition={{ duration: 0.8, repeat: Infinity }} style={{ position: "absolute", inset: 0, boxShadow: "inset 0 0 0 3px #7FD6FF", background: "rgba(127,214,255,.2)" }} />}
        {kingInCheck && <span aria-hidden="true" style={{ position: "absolute", inset: 0, background: mated ? "radial-gradient(circle, rgba(220,40,30,.95) 0%, rgba(220,40,30,.35) 70%)" : "radial-gradient(circle, rgba(230,60,40,.8) 0%, rgba(230,60,40,0) 72%)" }} />}
        {p && <PieceGlyph type={p.type.toUpperCase()} color={p.color} size={cell * 0.8} style={{ position: "relative", zIndex: 1, opacity: drag.dragFrom === sq ? 0.35 : 1 }} />}
        {/* (v0.5.5) 둔 칸 — 조준(청록 칸 + 조준경) → 정답 초록+체크 / 오답 빨강+X (좌표 인지 게임과 같은 이펙트) */}
        {mark && mark.sq === sq && (mark.ok == null ? (
          <span key={"aim" + mark.key} aria-hidden="true" className="cc-anim" style={{ position: "absolute", inset: 0, zIndex: 3, display: "flex", alignItems: "center", justifyContent: "center", background: "rgba(22,181,166,.42)", boxShadow: "inset 0 0 0 2px " + T.brilliant, animation: "ccAimSq " + COORD_AIM_MS + "ms ease-out both" }}>
            <span className="cc-anim" style={{ display: "flex", animation: "ccAim " + COORD_AIM_MS + "ms cubic-bezier(.2,.9,.3,1.2) both" }}><MgCrosshair size={Math.max(14, cell * 0.7)} /></span>
          </span>
        ) : (
          <span key={"res" + mark.key} aria-hidden="true" className="cc-anim" style={{ position: "absolute", inset: 0, zIndex: 3, display: "flex", alignItems: "flex-start", justifyContent: "flex-end", background: mark.ok ? "rgba(46,160,67,.5)" : "rgba(200,60,50,.55)", boxShadow: "inset 0 0 0 2px " + (mark.ok ? "#2E8F3E" : T.blunder), animation: "ccResult 280ms cubic-bezier(.2,.9,.3,1.3) both" }}>
            <span style={{ margin: "3% 3% 0 0", width: "38%", height: "38%", borderRadius: "50%", background: mark.ok ? "#2E9F45" : T.blunder, display: "flex", alignItems: "center", justifyContent: "center", boxShadow: "0 1px 3px rgba(0,0,0,.35)" }}>
              {mark.ok ? <Check size={Math.max(9, cell * 0.26)} color="#fff" strokeWidth={3.4} /> : <X size={Math.max(9, cell * 0.26)} color="#fff" strokeWidth={3.4} />}
            </span>
          </span>
        ))}
        {tset.has(sq) && <span aria-hidden="true" style={{ position: "absolute", zIndex: 2, width: p ? "88%" : "30%", height: p ? "88%" : "30%", borderRadius: "50%", background: p ? "transparent" : "rgba(40,24,10,.35)", boxShadow: p ? "inset 0 0 0 3px rgba(40,24,10,.45)" : "none" }} />}
        {vc === 0 && <span aria-hidden="true" style={{ position: "absolute", top: 1, left: 2, zIndex: 3, fontSize: Math.max(8, cell * 0.15), fontWeight: 800, color: light ? "rgba(90,58,34,.7)" : "rgba(244,238,226,.7)" }}>{8 - r}</span>}
        {vr === 7 && <span aria-hidden="true" style={{ position: "absolute", bottom: 0, right: 2, zIndex: 3, fontSize: Math.max(8, cell * 0.15), fontWeight: 800, color: light ? "rgba(90,58,34,.7)" : "rgba(244,238,226,.7)" }}>{"abcdefgh"[c]}</span>}
      </button>
    );
  }
  return <div {...drag.bind} style={{ position: "relative", borderRadius: 4, overflow: "hidden", ...BOARD_GLOSS, boxSizing: "border-box", width: size, height: size, flexShrink: 0, display: "grid", gridTemplateColumns: "repeat(8,1fr)", gridTemplateRows: "repeat(8,1fr)", touchAction: "none" }}><style>{COORD_GRID_CSS}</style>{cells}{drag.ghost}</div>;
}
function AttackGradeBadge({ grade, big }) {
  const gi = attackGradeInfo(grade);
  const sz = big ? 30 : 20;
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 5 }} title={gi.label}>
      <img src={BADGE_ICON_SRC[gi.kind]} alt={gi.name} draggable={false} style={{ width: sz, height: sz, display: "block", filter: big ? "drop-shadow(0 0 8px " + gi.color + "88)" : "none" }} />
      {big && <span style={{ fontSize: 11.5, fontWeight: 700, color: "rgba(90,58,34,.7)" }}>{gi.label}</span>}
    </span>
  );
}
// 공격 기회 하나 — 풀었으면 onResult(true), 틀렸으면 정답 수를 잠깐 보여준 뒤 onResult(false).
function AttackChance({ pos, grade, enabled, onResult, size }) {
  const chessRef = useRef(null);
  if (!chessRef.current) { try { chessRef.current = new Chess(pos.fen); } catch { chessRef.current = new Chess(); } }
  const chess = chessRef.current;
  const [, force] = useState(0);
  const rerender = () => force((n) => n + 1);
  const attacker = useMemo(() => new Chess(pos.fen).turn(), [pos.fen]);
  const [k, setK] = useState(0); // 다음 공격 수의 수순 인덱스
  const [selected, setSelected] = useState(null);
  const [lastMove, setLastMove] = useState(null);
  const [hintMove, setHintMove] = useState(null);
  const [state, setState] = useState("play"); // play | win | fail
  const [shakeControls, shake] = useBoardShake();
  const timersRef = useRef([]);
  useEffect(() => () => timersRef.current.forEach(clearTimeout), []);
  const targets = selected && state === "play" ? chess.moves({ square: selected, verbose: true }).map((m) => m.to) : [];
  const onCell = (sq) => {
    if (!enabled || state !== "play" || chess.turn() !== attacker) return;
    const p = chess.get(sq);
    if (selected && targets.includes(sq)) { tryMove(selected, sq); return; }
    if (p && p.color === attacker) { setSelected(sq === selected ? null : sq); fx("tap"); return; }
    setSelected(null);
  };
  // (v0.5.5 연출, 사용자 요청) 둔 칸에 곧바로 정답(초록+체크)·오답(빨강+X) 이펙트가 뜬다(좌표 인지 게임과 달리 조준경 단계는 없다).
  // 이펙트가 끝날 때까지는 다른 칸을 누를 수 없다(state "aim").
  const [mark, setMark] = useState(null); // { sq, ok: null(조준)|true|false, key }
  // (v0.5.5, 사용자 요청) 내가 둔 수를 엔진으로 채점해(분석 탭과 같은 규칙) 탁월·유일·최선이면 도착 칸에 수 등급 이펙트를 띄운다 —
  // 메이트를 완성한 수든 중간 수든 상관없다. 설정 탭 "시각 효과"로 끌 수 있다.
  const { moveFx: moveFxOn } = useContext(VisualPrefsContext);
  const engine = useContext(EngineContext);
  const fenRoot = useMemo(() => { try { return parseFenFull(pos.fen); } catch { return null; } }, [pos.fen]);
  const [moveFx, setMoveFx] = useState(null); // { sq, kind, key }
  const aliveRef = useRef(true);
  useEffect(() => () => { aliveRef.current = false; }, []);
  const moveSeqRef = useRef(0); // 몇 번째 수인지 — 채점이 늦게 끝나 이미 다음 수를 뒀으면 그 결과는 버린다
  const gradeMove = (prevSans, san) => (moveFxOn && fenRoot && engine && engine.status === "ready"
    ? classifyMoveKindQuick(engine, fenRoot, prevSans, san, 600, "attack-grade").catch(() => null)
    : Promise.resolve(null));
  const later = (ms, f) => timersRef.current.push(setTimeout(f, ms));
  const tryMove = (from, to) => {
    setSelected(null);
    const expected = pos.moves[k] || "";
    const promo = expected.slice(0, 4) === from + to && expected[4] ? expected[4] : "q";
    const prevSans = chess.history();
    let mv;
    try { mv = chess.move({ from, to, promotion: promo }); } catch { mv = null; }
    if (!mv) return;
    setMoveFx(null);
    const movedAt = Date.now();
    const seq = ++moveSeqRef.current;
    setLastMove([from, to]); rerender();
    playSfx(mv.captured ? "capture" : "move");
    const key = Date.now();
    setState("aim");
    const A = 0;
    if (chess.isCheckmate()) {
      later(A, () => { setMark({ sq: to, ok: true, key }); setState("win"); fx("correct"); buzz([40, 40, 40]); });
      // 다음 포지션으로 넘어가기 전에 등급을 기다린다(최대 1.6초) — 이펙트 등급이면 이펙트가 끝난 뒤에 넘어간다.
      let moved = false;
      const next = (ms) => { if (moved || !aliveRef.current) return; moved = true; later(ms, () => onResult(true)); };
      gradeMove(prevSans, mv.san).then((kind) => {
        if (!aliveRef.current || moved) return;
        if (MOVE_FX[kind]) { setMark(null); setMoveFx({ sq: to, kind, key }); next(MOVE_FX_MS + 250); }
        else next(Math.max(0, 900 - (Date.now() - movedAt)));
      });
      later(1600, () => next(0));
      return;
    }
    if (uciOf(mv) !== expected && mv.from + mv.to !== expected.slice(0, 4)) {
      later(A, () => { setMark({ sq: to, ok: false, key }); setState("fail"); fx("wrong"); buzz([80, 50, 80]); shake(); });
      later(A + 900, () => { chess.undo(); setMark(null); setLastMove(null); setHintMove([expected.slice(0, 2), expected.slice(2, 4)]); rerender(); });
      later(A + 2000, () => onResult(false));
      return;
    }
    // 정답 — 초록으로 확인해 준 뒤 수비 측 응수를 이어서 둔다. 등급은 응수를 기다리게 하지 않고, 나오는 대로 그 칸에 이펙트를 띄운다.
    const reply = pos.moves[k + 1];
    later(A, () => { setMark({ sq: to, ok: true, key }); fx("tap"); });
    gradeMove(prevSans, mv.san).then((kind) => {
      if (!aliveRef.current || !MOVE_FX[kind] || seq !== moveSeqRef.current) return;
      setMark((m) => (m && m.key === key ? null : m));
      setMoveFx({ sq: to, kind, key });
    });
    if (!reply) { later(A, () => setState("fail")); later(A + 900, () => onResult(false)); return; }
    later(A + 520, () => {
      try { const r = chess.move({ from: reply.slice(0, 2), to: reply.slice(2, 4), promotion: reply[4] || "q" }); if (r) { setLastMove([r.from, r.to]); playSfx(r.captured ? "capture" : "move"); } } catch { }
      setMark(null); setK((x) => x + 2); setState("play"); rerender();
    });
  };
  return (
    <motion.div animate={shakeControls} style={{ position: "relative" }}>
      <AttackGrid chess={chess} flip={attacker === "b"} selected={selected} targets={targets} onCell={onCell} canDrag={(sq) => { const pc = chess.get(sq); return enabled && state === "play" && chess.turn() === attacker && !!pc && pc.color === attacker; }} size={size} lastMove={lastMove} hintMove={hintMove} mated={state === "win"} mark={mark} moveFx={moveFx} />
      <AnimatePresence>
        {state === "win" && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} style={{ position: "absolute", inset: 0, zIndex: 8, display: "flex", alignItems: "center", justifyContent: "center", pointerEvents: "none" }}>
            <VictoryBurst />
            <motion.div initial={{ scale: 0.4 }} animate={{ scale: 1 }} transition={{ type: "spring", stiffness: 360, damping: 14 }} style={{ padding: "8px 20px", borderRadius: 14, background: "rgba(255,250,238,.95)", border: "2px solid " + attackGradeInfo(grade).color, fontSize: 22, fontWeight: 900, color: attackGradeInfo(grade).color, fontFamily: SITE_FONT }}>{t("체크메이트 +1")}</motion.div>
          </motion.div>
        )}
        {state === "fail" && (
          <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} style={{ position: "absolute", left: 0, right: 0, bottom: 8, zIndex: 8, display: "flex", justifyContent: "center", pointerEvents: "none" }}>
            <div style={{ padding: "5px 12px", borderRadius: 999, background: "rgba(196,60,50,.9)", color: "#fff", fontSize: 11.5, fontWeight: 800 }}>{t("공격 실패. 파란 칸이 정답")}</div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}
// 등급별 성공 집계 / 승자 판정(동점 타이브레이커 포함) — 서버 attack_finish와 같은 규칙.
function attackTally(list) { const t = { S: 0, A: 0, B: 0, C: 0, total: 0, tries: 0 }; list.forEach((e) => { if (e.ok == null) return; t.tries++; if (e.ok) { t[e.g]++; t.total++; } }); return t; }
function attackDecide(me, opp, myRating, oppRating) {
  if (me.total !== opp.total) return { winner: me.total > opp.total ? "me" : "opp", reason: null };
  for (const g of ["C", "B", "A", "S"]) {
    if (me[g] !== opp[g]) return { winner: me[g] > opp[g] ? "me" : "opp", reason: t("동점. {0} 성공 수로 결정 (긴 메이트부터 비교)", attackGradeInfo(g).label) };
  }
  if (myRating !== oppRating) return { winner: myRating > oppRating ? "me" : "opp", reason: t("등급별 성공 수도 같아 레이팅이 높은 쪽 승리") };
  return { winner: "draw", reason: t("모든 기록이 같아 무승부") };
}
function AttackLedger({ tally, label }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 10.5, color: "rgba(90,58,34,.75)", fontWeight: 700 }}>
      <span style={{ minWidth: 24 }}>{label}</span>
      {ATTACK_GRADES.map((gi) => (
        <span key={gi.g} style={{ display: "inline-flex", alignItems: "center", gap: 2 }}><AttackGradeBadge grade={gi.g} /><b style={{ color: T.ink, fontVariantNumeric: "tabular-nums" }}>{tally[gi.g]}</b></span>
      ))}
    </div>
  );
}
function attackClock(ms) { const s = Math.max(0, Math.ceil(ms / 1000)); return Math.floor(s / 60) + ":" + String(s % 60).padStart(2, "0"); }
// 대전 화면 공용 레이아웃 — 봇·PvP가 같은 화면을 쓰고, 기회 배분·결과 기록 방식만 다르다.
function AttackArena({ startAt, endAt, current, pool, myTally, oppTally, oppLabel, onResult, waitingNote }) {
  const now = useNow(true, 200);
  const left = endAt - Math.max(now, startAt);
  const started = now >= startAt;
  const over = now >= endAt;
  const [boardSize, boardFitRef] = useSquareFit(460, 46);   // 보드 바로 위 등급 표시 줄(46px)만큼 비워 둔다
  const lastSecRef = useRef(null);
  useEffect(() => { const sec = Math.ceil(left / 1000); if (started && sec <= 10 && sec >= 1 && lastSecRef.current !== sec) { lastSecRef.current = sec; fx("warn"); } }, [left, started]);
  const pos = current ? attackPick(pool, current.g, current.pick) : null;
  return (
    <div style={{ flex: 1, minHeight: 0, display: "flex", flexDirection: "column" }}>
      <MinigameScoreHeader myScore={myTally.total} oppScore={oppTally ? oppTally.total : 0} oppLabel={oppTally ? oppLabel : null}
        center={<span style={{ fontSize: 17, fontWeight: 900, color: left < 30000 ? T.blunder : T.ink, fontFamily: SITE_FONT, fontVariantNumeric: "tabular-nums" }}>{attackClock(left)}</span>} />
      <MinigameTimeBar pct={left / (endAt - startAt)} />
      <div style={{ display: "flex", justifyContent: "space-between", flexWrap: "wrap", gap: 4, marginBottom: 6, flexShrink: 0 }}>
        <AttackLedger tally={myTally} label={t("나")} />
        {oppTally && <AttackLedger tally={oppTally} label={oppLabel} />}
      </div>
      <div ref={boardFitRef} style={{ flex: 1, minHeight: 0, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center" }}>
        {/* (v0.5.5, 사용자 요청) 등급·차례·몇 수 메이트인지는 보드를 가리지 않게, 보드 바로 위에 붙여 둔다. */}
        <div style={{ height: 38, marginBottom: 8, flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center" }}>
          <AnimatePresence mode="popLayout">
            {current && pos && !over && (
              <motion.div key={current.key} initial={{ y: -8, opacity: 0, scale: 0.9 }} animate={{ y: 0, opacity: 1, scale: 1 }} exit={{ opacity: 0 }} transition={{ type: "spring", stiffness: 420, damping: 24 }}
                style={{ display: "inline-flex", alignItems: "center", gap: 8, padding: "5px 12px 5px 6px", borderRadius: 12, background: "rgba(255,255,255,.6)", border: "1px solid " + attackGradeInfo(current.g).color }}>
                <AttackGradeBadge grade={current.g} />
                <span style={{ fontSize: 12.5, fontWeight: 800, color: T.ink }}>{tx("{0} 차례 · {1}수 안에 메이트", pos.fen.split(" ")[1] === "w" ? t("백") : t("흑"), pos.mateIn)}</span>
                <span style={{ fontSize: 10.5, fontWeight: 700, color: "rgba(90,58,34,.6)" }}>#{current.n}</span>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
        <div style={{ position: "relative" }}>
          {pos && current ? <AttackChance key={current.key} pos={pos} grade={current.g} enabled={started && !over} onResult={onResult} size={boardSize} />
            : <div style={{ width: boardSize, height: boardSize, display: "flex", alignItems: "center", justifyContent: "center", borderRadius: 6, background: "rgba(255,255,255,.45)" }}><PendingDots size={12} /></div>}
          <MinigameCountdown startAt={startAt} />
          {over && <div style={{ position: "absolute", inset: 0, zIndex: 12, display: "flex", alignItems: "center", justifyContent: "center", background: "rgba(250,244,230,.82)", borderRadius: 6, fontSize: 26, fontWeight: 900, color: T.ink, fontFamily: SITE_FONT }}>{t("시간 종료")}</div>}
        </div>
      </div>
      <div style={{ textAlign: "center", minHeight: 22, marginTop: 8, flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}>
        {waitingNote && <span style={{ fontSize: 11.5, color: "rgba(90,58,34,.75)" }}>{waitingNote}</span>}
      </div>
    </div>
  );
}
function attackResultProps(myList, oppList, myRating, oppRating) {
  const me = attackTally(myList), opp = attackTally(oppList);
  const d = attackDecide(me, opp, myRating, oppRating);
  return {
    outcome: d.winner === "me" ? "win" : d.winner === "opp" ? "lose" : "draw",
    myScore: me.total, oppScore: opp.total,
    rounds: myList.filter((e) => e.ok != null).slice(0, 40).map((e) => ({ result: e.ok ? "me" : "opp", label: t("{0}수", (attackGradeInfo(e.g).mate + (e.g === "C" ? "+" : ""))) })),
    stats: [
      { label: t("성공 / 시도"), value: me.total + " / " + me.tries },
      { label: t("1·2수 메이트 성공"), value: me.S + me.A },
      { label: t("3수+ 메이트 성공"), value: me.B + me.C },
    ],
    note: d.reason,
  };
}
const ATTACK_BOTS = [
  // (v0.5.3 난이도 완화, 사용자 요청) 세 단계 모두 풀이 속도를 늦추고(speed 배율↑) 정답률을 낮췄다.
  { key: "easy", label: t("쉬움"), rating: 1000, speed: 2.1, acc: 0.58 },
  { key: "normal", label: t("보통"), rating: 1500, speed: 1.45, acc: 0.72 },
  { key: "hard", label: t("어려움"), rating: 2000, speed: 1.05, acc: 0.84 },
];
// 봇 대전 — 봇의 기회·풀이 시간·성공 여부를 대전 시작 순간에 전부 미리 정해 두고(등급은 같은 가중
// 공식), 시각이 되면 하나씩 반영한다. 등급이 낮을수록(긴 메이트) 오래 걸리고 실패 확률도 높다.
// (v0.5.3) bot이 없으면 혼자 플레이하기 — 봇 없이 3분 동안 몇 번 메이트하는지 기록에 도전한다(등급
// 배분은 상대 레이팅을 내 레이팅과 같게 둔 기본 분포).
function AttackBotBoard({ bot, myRating, onExit, onStatusChange, onRematch }) {
  const solo = !bot;
  const [pool] = useAttackPool();
  // (v0.5.5 버그 수정, 사용자 제보 "3초 카운트다운이 지나고도 포지션을 불러오느라 기다린다") 예전엔 화면이 뜨는 순간부터
  // 3초를 셌는데, 포지션 목록(번들 + 서버의 개발자 추가분)을 다 받기 전이면 카운트다운이 끝나고도 빈 보드로 기다렸다 —
  // 목록이 준비된 순간부터 3초를 센다.
  const [startAt, setStartAt] = useState(null);
  useEffect(() => { if (pool && startAt == null) setStartAt(Date.now() + 3000); }, [pool, startAt]);
  const endAt = startAt == null ? Infinity : startAt + ATTACK_MATCH_MS;
  const [mine, setMine] = useState([]); // [{ key, n, g, pick, ok }]
  const [botDone, setBotDone] = useState([]);
  const botPlan = useMemo(() => {
    const plan = []; let t = 0;
    if (!bot) return plan;
    const base = { S: [3500, 8000], A: [8000, 15000], B: [13000, 23000], C: [18000, 32000] };
    const accAdj = { S: 0.06, A: 0, B: -0.08, C: -0.16 };
    while (t < ATTACK_MATCH_MS) {
      const g = attackGradeLocal(bot.rating, myRating);
      const [lo, hi] = base[g];
      t += (lo + Math.random() * (hi - lo)) * bot.speed;
      if (t > ATTACK_MATCH_MS) break;
      plan.push({ g, at: t, ok: Math.random() < Math.min(0.99, bot.acc + accAdj[g]) });
    }
    return plan;
  }, [bot, myRating]);
  useEffect(() => {
    if (startAt == null) return undefined;
    const timers = botPlan.map((b, i) => setTimeout(() => { setBotDone((d) => [...d, b]); if (b.ok) fx("tap"); }, startAt - Date.now() + b.at));
    return () => timers.forEach(clearTimeout);
  }, [botPlan, startAt]);
  const now = useNow(true, 500);
  // 성공 보고는 메이트 연출 뒤 0.9초 늦게 오므로, 종료 직전 메이트가 집계되도록 결과 화면을 2.6초 뒤에 연다
  // (onResult는 종료 +2초까지의 성공을 인정한다).
  const over = now >= endAt + 2600;
  useEffect(() => { onStatusChange && onStatusChange(over ? "finished" : "active"); }, [over, onStatusChange]);
  const current = mine.length && mine[mine.length - 1].ok == null ? mine[mine.length - 1] : null;
  useEffect(() => {
    if (!pool || current || now >= endAt) return;
    setMine((m) => [...m, { key: "c" + m.length, n: m.length + 1, g: attackGradeLocal(myRating, bot ? bot.rating : myRating), pick: Math.floor(Math.random() * 1e6), ok: null }]);
  }, [pool, current, now >= endAt, myRating, bot]); // eslint-disable-line react-hooks/exhaustive-deps
  const [soloBest, setSoloBest] = useState(null); // { prev, isNew }
  useEffect(() => {
    if (!solo || !over || soloBest) return;
    const prev = loadMinigameBest("attack");
    const score = attackTally(mine).total;
    const isNew = score > 0 && (prev == null || score > prev);
    if (isNew) saveMinigameBest("attack", score);
    setSoloBest({ prev, isNew });
  }, [solo, over, soloBest, mine]);
  const onResult = useCallback((ok) => {
    setMine((m) => { if (!m.length || m[m.length - 1].ok != null) return m; const c = m.slice(); c[c.length - 1] = { ...c[c.length - 1], ok: Date.now() <= endAt + 2000 ? ok : false }; return c; });
  }, [endAt]);
  if (over && solo) {
    if (!soloBest) return null;
    const props = attackResultProps(mine, [], myRating || 800, myRating || 800);
    return <MinigameResult {...props} outcome={soloBest.isNew ? "win" : "draw"} title={soloBest.isNew ? t("신기록") : t("시간 종료")} scoreText={t("{0}회 메이트", (props.myScore))}
      note={soloBest.prev != null ? t("이전 최고 기록 {0}회", soloBest.prev) : t("첫 기록")} onExit={onExit} onRematch={onRematch} />;
  }
  if (over) {
    return <MinigameResult {...attackResultProps(mine, botDone, myRating || 800, bot.rating)} oppLabel={t("봇({0})", bot.label)} onExit={onExit} onRematch={onRematch} />;
  }
  if (startAt == null) return <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 10, color: "rgba(90,58,34,.7)", fontSize: 12.5, fontWeight: 700 }}>{tx("{0}포지션 로드 중…", <PendingDots size={12} />)}</div>;
  return <AttackArena startAt={startAt} endAt={endAt} current={current} pool={pool} myTally={attackTally(mine)} oppTally={solo ? null : attackTally(botDone)} oppLabel={t("봇")} onResult={onResult} />;
}
function AttackPvpBoard({ game: initialGame, myUid, onExit, onStatusChange }) {
  const [pool] = useAttackPool();
  const [game, setGame] = useState(initialGame);
  useEffect(() => { onStatusChange && onStatusChange(game.status); }, [game.status, onStatusChange]);
  useRealtimeTable("pvp_games", "id=eq." + initialGame.id, useCallback((payload) => {
    if (payload && payload.new) setGame(payload.new);
    else if (!payload) { sbSelect("pvp_games?id=eq." + initialGame.id + "&select=*").then((rows) => { if (rows && rows[0]) setGame(rows[0]); }).catch(() => { }); }
  }, [initialGame.id]), true, 3000);
  const me = myUid === game.white_uid ? "w" : "b";
  const events = game.sans || [];
  const head = events[0] && events[0].h ? events[0] : null;
  const finished = game.status !== "active";
  const list = events.map((e, i) => ({ ...e, idx: i })).filter((e) => !e.h);
  const mine = list.filter((e) => e.c === me).map((e, i) => ({ ...e, key: "p" + e.idx, n: i + 1 }));
  const theirs = list.filter((e) => e.c !== me);
  const current = mine.length && mine[mine.length - 1].ok == null ? mine[mine.length - 1] : null;
  const now = useNow(!finished, 500);
  const endAt = head ? new Date(head.endAt).getTime() : 0;
  const busyRef = useRef(false);
  useEffect(() => {
    if (finished) return;
    if (!head) { sbRpc("attack_start", { p_game_id: game.id }).then((g) => g && setGame(g)).catch(() => { }); return; }
    if (!current && now < endAt && !busyRef.current) {
      busyRef.current = true;
      sbRpc("attack_next", { p_game_id: game.id }).then((g) => { busyRef.current = false; if (g) setGame(g); }).catch(() => { busyRef.current = false; });
    }
  }, [finished, !!head, !!current, now >= endAt, game.id, mine.length]); // eslint-disable-line react-hooks/exhaustive-deps
  // 종료 시각(+3초)이 지나면 주기적으로 결과 확정을 시도한다(누가 불러도 서버가 같은 결과를 낸다).
  useEffect(() => {
    if (finished || !head) return;
    const t = setInterval(() => { if (Date.now() > endAt + 3000) sbRpc("attack_finish", { p_game_id: game.id }).then((g) => g && setGame(g)).catch(() => { }); }, 1500);
    return () => clearInterval(t);
  }, [finished, !!head, endAt, game.id]);
  // 결과 보고 → 곧바로 다음 기회 요청을 순서대로 이어 부른다(두 요청이 뒤바뀌어 도착하면 서버가 아직
  // 끝나지 않은 기회로 보고 새 기회를 주지 않기 때문).
  const onResult = useCallback((ok) => {
    if (!current) return;
    busyRef.current = true;
    sbRpc("attack_report", { p_game_id: game.id, p_idx: current.idx, p_ok: ok })
      .then((g) => { if (g) setGame(g); return sbRpc("attack_next", { p_game_id: game.id }); })
      .then((g) => { busyRef.current = false; if (g) setGame(g); })
      .catch(() => { busyRef.current = false; });
  }, [current, game.id]);
  if (finished) {
    const myRating = head ? (me === "w" ? head.wr : head.br) : 0, oppRating = head ? (me === "w" ? head.br : head.wr) : 0;
    const props = attackResultProps(mine, theirs, myRating, oppRating);
    const iWon = (me === "w" && game.status === "white_won") || (me === "b" && game.status === "black_won");
    const outcome = game.status === "draw" ? "draw" : iWon ? "win" : "lose";
    return <MinigameResult {...props} outcome={outcome} oppLabel={t("상대")} rating={minigameRatingOf(game, myUid)} note={game.result_reason === "attack_forfeit" ? (iWon ? t("상대가 대전 포기") : t("대전 포기")) : props.note} onExit={onExit} />;
  }
  if (!head) return <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center" }}><PendingDots size={12} /></div>;
  return <AttackArena startAt={new Date(head.startAt).getTime()} endAt={endAt} current={current} pool={pool} myTally={attackTally(mine)} oppTally={attackTally(theirs)} oppLabel={t("상대")} onResult={onResult}
    waitingNote={now >= endAt ? t("결과 집계 중...") : null} />;
}
// (v0.5.3 개발자 도구) 공격 기회 포지션 관리 — 개발자·공동 개발자만 보인다. ① 리체스 퍼즐 API에서
// N수 메이트 퍼즐을 가져와(프록시 api/lichess.js?puzzle=1) 검증 후 추가 ② FEN과 정답 수순을 직접
// 입력해 추가. 어느 쪽이든 chess.js로 수순이 합법이고 마지막 수가 체크메이트인지 확인한 뒤에만 넣는다.
function attackValidateLine(fen, moveTokens) {
  const c = new Chess(fen);
  const ucis = [];
  for (const tok of moveTokens) {
    let mv = null;
    try { mv = /^[a-h][1-8][a-h][1-8][qrbn]?$/.test(tok) ? c.move({ from: tok.slice(0, 2), to: tok.slice(2, 4), promotion: tok[4] || "q" }) : c.move(tok); } catch { mv = null; }
    if (!mv) return { error: t("수순 '{0}' 합법 수 아님", tok) };
    ucis.push(uciOf(mv));
  }
  if (!c.isCheckmate()) return { error: t("수순의 마지막이 체크메이트가 아님") };
  if (ucis.length % 2 === 0) return { error: t("공격 측 수로 끝나야 함 (수순 길이 홀수)") };
  return { moves: ucis, mateIn: (ucis.length + 1) / 2 };
}
async function fetchLichessMatePuzzle(mateIn) {
  const r = await fetch(LICHESS_API + "?puzzle=next&angle=mateIn" + mateIn);
  if (!r.ok) throw new Error("lichess " + r.status);
  const data = await r.json();
  const sans = String(data.game.pgn || "").trim().split(/\s+/);
  const sol = data.puzzle.solution || [];
  // initialPly 해석이 판마다 헷갈리지 않도록 두 후보(initialPly, initialPly+1수까지 재생)를 모두 시도해
  // 정답 수순이 실제로 체크메이트로 끝나는 쪽을 쓴다.
  for (const n of [data.puzzle.initialPly + 1, data.puzzle.initialPly]) {
    try {
      const c = new Chess();
      for (let i = 0; i < n; i++) c.move(sans[i]);
      const v = attackValidateLine(c.fen(), sol);
      if (!v.error) return { fen: c.fen(), ...v, source: "lichess:" + data.puzzle.id };
    } catch { }
  }
  throw new Error(t("퍼즐 수순 검증 실패"));
}
function AttackDevPanel({ pool, onChanged }) {
  const [open, setOpen] = useState(false);
  const [fen, setFen] = useState("");
  const [line, setLine] = useState("");
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);
  const save = async (row) => {
    await sbInsert("attack_positions", { fen: row.fen, moves: row.moves, mate_in: row.mateIn, source: row.source || "dev" });
    onChanged();
  };
  const addManual = async () => {
    setMsg("");
    let v;
    try { v = attackValidateLine(fen.trim(), line.trim().split(/[\s,]+/).filter((t) => t && !/^\d+\.+$/.test(t))); } catch { v = { error: t("FEN이 올바르지 않음") }; }
    if (v.error) { setMsg(v.error); return; }
    setBusy(true);
    try { await save({ fen: fen.trim(), ...v, source: "dev" }); setMsg(t("{0}수 메이트 포지션 추가됨", (v.mateIn))); setFen(""); setLine(""); }
    catch { setMsg(t("저장 실패 (이미 있는 FEN이거나 권한 문제)")); }
    setBusy(false);
  };
  const addLichess = async (n) => {
    setMsg(""); setBusy(true);
    try { const p = await fetchLichessMatePuzzle(n); await save(p); setMsg(t("리체스 {0} ({1}수 메이트) 추가됨", p.source.slice(8), p.mateIn)); }
    catch (e) { setMsg(t("가져오지 못했어요: {0}", e && e.message ? e.message : t("오류"))); }
    setBusy(false);
  };
  const remove = async (p) => {
    if (!p.dbId) return;
    try { await sbDelete("attack_positions?id=eq." + p.dbId); onChanged(); } catch { setMsg(t("삭제 실패")); }
  };
  const inp = { width: "100%", boxSizing: "border-box", padding: "7px 9px", borderRadius: 8, border: "1px solid rgba(150,112,58,.50)", background: "rgba(0,0,0,.25)", color: T.ink, fontSize: 11.5, fontFamily: "ui-monospace,monospace" };
  return (
    <div style={{ marginTop: 16, textAlign: "left", border: "1px dashed rgba(150,112,58,.55)", borderRadius: 10, padding: 10 }}>
      <button onClick={() => setOpen((v) => !v)} className="press" style={{ background: "transparent", border: "none", color: MG_GOLD, fontWeight: 800, fontSize: 12, cursor: "pointer", display: "flex", alignItems: "center", gap: 5, padding: 0 }}>
        {tx("{0}개발자: 공격 기회 포지션 관리 {1}{2}", <Wrench size={13} />, pool ? t("(번들 {0} + 추가 {1})", pool.all.length - pool.dev.length, pool.dev.length) : "", open ? <ChevronUp size={13} /> : <ChevronDown size={13} />)}
      </button>
      {open && (
        <div style={{ marginTop: 10, display: "flex", flexDirection: "column", gap: 8 }}>
          <div style={{ fontSize: 11, color: "rgba(90,58,34,.80)" }}>{t("리체스 퍼즐 API에서 가져오기")}</div>
          <div style={{ display: "flex", gap: 6 }}>
            {[1, 2, 3, 4].map((n) => <button key={n} disabled={busy} onClick={() => addLichess(n)} className="press" style={{ flex: 1, padding: "7px 0", borderRadius: 8, border: "1px solid " + attackGradeInfo(attackGradeOfMate(n)).color, background: "rgba(255,255,255,.55)", color: T.ink, fontSize: 11, fontWeight: 800, cursor: "pointer" }}>{tx("{0}수 메이트", n)}</button>)}
          </div>
          <div style={{ fontSize: 11, color: "rgba(90,58,34,.80)", marginTop: 4 }}>{t("FEN 직접 추가 (정답 수순: UCI 또는 SAN, 공백 구분, 공격·수비 번갈아, 메이트 수로 끝)")}</div>
          <input value={fen} onChange={(e) => setFen(e.target.value)} placeholder="FEN" style={inp} />
          <input value={line} onChange={(e) => setLine(e.target.value)} placeholder={t("예: Qh7+ Kf8 Qh8#")} style={inp} />
          <button disabled={busy || !fen.trim() || !line.trim()} onClick={addManual} className="press" style={{ padding: "8px 0", borderRadius: 8, border: "none", background: "linear-gradient(180deg," + T.brass + ",#A8842F)", color: "#241509", fontWeight: 800, fontSize: 12, cursor: "pointer" }}>{t("검증 후 추가")}</button>
          {msg && <div style={{ fontSize: 11.5, color: MG_GOLD }}>{msg}</div>}
          {pool && pool.dev.length > 0 && (
            <div style={{ maxHeight: 160, overflowY: "auto", borderTop: "1px solid rgba(150,112,58,.35)", paddingTop: 6 }}>
              {pool.dev.map((p) => (
                <div key={p.id} style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 10.5, color: "rgba(90,58,34,.85)", padding: "3px 0" }}>
                  <AttackGradeBadge grade={attackGradeOfMate(p.mateIn)} />
                  <span style={{ flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", fontFamily: "ui-monospace,monospace" }}>{p.src} · {p.fen}</span>
                  <button onClick={() => remove(p)} className="press" aria-label={t("삭제")} style={{ background: "transparent", border: "none", color: T.blunder, cursor: "pointer" }}><Trash2 size={13} /></button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
function AttackModeGame({ myUid, onExit, onOpenProfile, initialGame, myRating, canEditContent }) {
  const [pool, reloadPool] = useAttackPool();
  const counts = pool ? ATTACK_GRADES.map((gi) => pool.byGrade[gi.g].length) : null;
  return (
    <MinigameHub title={t("무한 체크메이트 게임")} gameType={ATTACK_GAME_TYPE} myUid={myUid} onExit={onExit} onOpenProfile={onOpenProfile} initialGame={initialGame} forfeitRpc="attack_forfeit"
      rules={<>
        <div>• {tx("{0} 동안 강제 체크메이트 포지션(공격 기회)이 계속 주어짐. 더 많이 성공시킨 쪽 승리", <b style={{ color: T.ink }}>{t("3분")}</b>)}</div>
        <div>{t("• 한 수라도 틀리면 그 기회는 실패, 바로 다음 기회로 이동")}</div>
        <div>{tx("• 짧은 메이트일수록 좋은 등급. {0}이 좋은 등급을 받을 확률이 높음", <b style={{ color: T.ink }}>{t("퍼즐 레이팅이 낮은 쪽")}</b>)}</div>
        <div>{t("• 동점이면 긴 메이트(4수 이상 → 3수 → 2수 → 1수) 성공 수부터 비교, 그래도 같으면 레이팅이 높은 쪽 승리")}</div>
      </>}
      lobbyExtra={
        <div style={{ display: "flex", justifyContent: "center", gap: 10, marginBottom: 14, flexWrap: "wrap" }}>
          {ATTACK_GRADES.map((gi, i) => (
            <span key={gi.g} style={{ display: "inline-flex", alignItems: "center", gap: 4, fontSize: 10.5, color: "rgba(90,58,34,.80)" }}><AttackGradeBadge grade={gi.g} />{gi.label}{counts ? " · " + counts[i] : ""}</span>
          ))}
        </div>
      }
      soloSub={loadMinigameBest("attack") == null ? t("3분 기록 도전") : t("3분 · 최고 {0}회", loadMinigameBest("attack"))} botSub={t("내 레이팅 {0}", myRating || 800)}
      botOptions={ATTACK_BOTS.map((b) => ({ ...b, sub: t("레이팅 {0}", b.rating) }))}
      footer={canEditContent ? <AttackDevPanel pool={pool} onChanged={reloadPool} /> : null}
      renderPvp={(p) => <AttackPvpBoard key={p.runKey} game={p.game} myUid={myUid} onExit={p.onExit} onStatusChange={p.onStatusChange} />}
      renderBot={(p) => <AttackBotBoard key={p.runKey} bot={p.opt} myRating={myRating || 800} onExit={p.onExit} onStatusChange={p.onStatusChange} onRematch={p.onRematch} />}
      renderSolo={(p) => <AttackBotBoard key={p.runKey} bot={null} myRating={myRating || 800} onExit={p.onExit} onStatusChange={p.onStatusChange} onRematch={p.onRematch} />} />
  );
}
export function PlayPage({ seed, onClose, engine, onOpenReview, profile, username, myUid, onOpenProfile, onPvpActiveChange, storeProps, specialResume, onConsumeSpecialResume, onResumeSpecial, myPuzzleRating, canEditContent }) {
  const fenRoot = (seed && seed.fenRoot) || null;
  const seedSans = (seed && seed.sans) || [];
  // (v0.5.0 기능, 사용자 요청) 플레이 페이지 최상단 "일반/스페셜" 토글 — "일반"은 지금까지의 봇/실시간
  // 대국 화면 그대로, "스페셜"은 앞으로 추가할 체스보드 위 오리지널 미니게임들을 모아 보여줄 자리다.
  // 아직 실제 미니게임은 없어 레이아웃(카드 그리드)만 먼저 만들어 둔다 — 나중에 게임이 정해지면
  // PLAY_SPECIAL_GAMES 배열에 항목만 추가하면 된다. step(setup/playing) 등 기존 상태는 이 토글과
  // 무관하게 그대로 유지되므로, "일반"으로 다시 돌아오면 하던 대국이 그대로 이어진다.
  // (v0.5.5, 사용자 요청) 일반 대국 설정(타임 컨트롤·상대)은 체스보드 버튼을 누르면 뜨는 별도 창에서 고른다 — 대국이
  // 시작되면(step → playing) 창을 닫고, 창을 닫을 때 진행 중이던 매칭 대기·친구 도전은 취소한다.
  const [setupOpen, setSetupOpen] = useState(false);
  // (v0.5.5, 사용자 요청) "일반/스페셜" 토글을 없애고 일반 대국 화면 아래에 미니게임 목록을 함께 보여준다 —
  // 전역 알람 박스에서 미니게임 친구 도전장을 수락하면(specialResume) PlaySpecialGames가 곧장 그 대국을 연다.
  const [step, setStep] = useState("setup"); // "setup" | "playing"
  const [colorPick, setColorPick] = useState("w"); // "w" | "b" | "random"
  const [botTier, setBotTier] = useState(PLAY_BOT_TIERS[2]);
  // (신규 기능) 사용자 요청 — /play에서 봇 대신 다른 OpenChess 사용자와 실시간으로 대국. mode가
  // "pvp"면 sans의 진실 공급원은 서버(pvp_games.sans)이고, 봇 자동 응수 effect는 아예 돌지 않는다.
  const [mode, setMode] = useState("bot"); // "bot" | "pvp"
  // (신규 기능) 사용자 요청 — 실시간 대국은 진영을 고르지 않고(서버가 항상 무작위 배정), 대신
  // "랜덤 매칭"(대기열)과 "친구와 플레이"(도전장) 중 하나를 고른다.
  const [pvpSubMode, setPvpSubMode] = useState("queue"); // "queue" | "friend"
  // (v0.4.3 UI 개편) 사용자 요청 — 설정 화면을 "타임 컨트롤 고르기 → 대국 상대 찾기/봇과 플레이하기/
  // 친구와 플레이하기 3택" 한 화면으로 합쳤다. "봇과 플레이하기"만 진영·봇 등급을 더 골라야 해서
  // "choose"(3택 화면) → "bot"(진영·등급 선택 화면)으로 넘어가는 하위 단계를 따로 둔다.
  const [setupPhase, setSetupPhase] = useState("choose"); // "choose" | "bot"
  const [pvpWaiting, setPvpWaiting] = useState(false);
  const [pvpGame, setPvpGame] = useState(null); // pvp_games 행(id, white_uid, black_uid, sans, status)
  const [pvpErr, setPvpErr] = useState("");
  const [opponentPub, setOpponentPub] = useState(null);
  const pvpFinishedRef = useRef(false); // 체크메이트/스테일메이트를 서버에 한 번만 보고하기 위한 가드
  // (v0.4.5 기능) 매칭 대기 화면 궤도 아이콘용 백그라운드 분석(classifyOwnMovesFast)을 새 대국이
  // 시작될 때마다 취소하기 위한 토큰 — startGame/rematch/applyPvpGame에서 증가시킨다.
  const qualityRunRef = useRef(0);
  // (v0.4.3 기능, 사용자 요청) 대국 도중 페이지를 벗어나면(뒤로가기·탭 이동 등) 기권으로 처리하기
  // 위해, 언마운트 시점에 최신 상태를 읽을 수 있도록 매 렌더마다 미러링해 둔다 — cleanup 함수는
  // 클로저가 마운트 시점 값에 고정되므로 ref로만 "지금 이 순간"의 값을 알 수 있다.
  const leaveCleanupRef = useRef({});
  // (신규 기능) 사용자 요청 — 봇/실시간 대국 모두 타임 컨트롤 선택. pvp에서는 매칭·초대 시점에
  // 서버(pvp_games.time_control)에 확정된 값을 그대로 따르도록 매칭 후 다시 맞춘다(아래 applyPvpGame).
  const [timeControl, setTimeControl] = useState(DEFAULT_TIME_CONTROL);
  const [clock, setClock] = useState(null); // { w: ms, b: ms } | null(무제한)
  const [flagged, setFlagged] = useState(null); // "w" | "b" | null — 시간 초과로 진 쪽
  const toMoveColorRef = useRef("w");
  // (v0.4.4 리디자인, 사용자 요청) 친구와 플레이 — 예전엔 버튼을 눌러야 펼쳐지는 드롭다운이었지만,
  // 이제 로그인만 돼 있으면 항상 고정으로 보이는 로스터(명단)로 바꿨다 — 도전할 친구를 찾으려고
  // 매번 펼쳤다 접을 필요 없이 설정 화면에 늘 떠 있다.
  const [friendList, setFriendList] = useState([]); // [{uid, username, pub}]
  const [myInvite, setMyInvite] = useState(null); // 내가 보낸 도전장(pvp_invites 행) — 응답 대기 중
  // (버그 수정) 이 대국 안에서 "이 포지션(FEN)에서 봇이 이미 골랐던 수"를 기억해 둔다 — pickBotMove가
  // 반복 수순에서 항상 같은 수만 고르지 않도록 가중치를 낮추는 데 쓴다. 새 대국을 시작할 때마다 비운다.
  const botMoveMemoryRef = useRef(new Map());
  const [activeColor, setActiveColor] = useState("w");
  const [sans, setSans] = useState(seedSans);
  const [sel, setSel] = useState(null);
  const [drag, setDrag] = useState(null);
  const [promoPrompt, setPromoPrompt] = useState(null);
  const [botThinking, setBotThinking] = useState(false);
  const [resigned, setResigned] = useState(false);
  // (사용자 요청) 대국 도중에도 지난 수를 눌러 그 시점 포지션을 되돌아볼 수 있게 — null이면 지금
  // 진행 중인 실제 포지션(라이브), 숫자면 그 수까지 재생된 과거 포지션(읽기 전용)을 보여준다.
  const [viewPly, setViewPly] = useState(null);
  const [optionsOpen, setOptionsOpen] = useState(false);
  const narrow = useNarrow(720);
  const narrowForShop = useNarrow(1040);
  const boardSize = narrow ? Math.min(380, (typeof window !== "undefined" ? window.innerWidth : 380) - 32) : 420;

  // (신규 기능) 실시간 대국 매칭 — 대기열에 합류해 상대를 기다린다. 이미 나를 기다리던 상대가 있으면
  // pvp_queue_join이 즉시 대국을 만들어 돌려주고, 없으면 내가 대기열에 들어가고 null을 받는다 —
  // 이후 다른 사람이 나를 찾아 매칭할 때까지는 realtime 구독(아래)으로 통보받는다.
  const applyPvpGame = useCallback((g) => {
    if (!g) return;
    // (버그 수정, 사용자 제보) 친구 초대를 "수락"하는 쪽은 이 화면에서 "실시간 대국" 토글을 직접
    // 누른 적이 없어 mode가 기본값 "bot"에 머물러 있었다 — 그 상태로 대국이 시작되면 봉 자동 응수
    // effect(mode==="bot"에서만 동작)가 실제 상대의 수 대신 로컬 봇을 상대로 돌고, 내가 둔 수도
    // 서버로 전송되지 않아(go()의 pvp_move 호출도 mode==="pvp" 조건) 완전히 다른 대국이 됐다.
    // applyPvpGame은 대기열 매칭·초대 수락·재접속 등 pvp 대국이 클라이언트에 반영되는 유일한
    // 통로이므로, 여기서 한 번에 mode를 "pvp"로 맞춰 모든 경로에서 이 문제가 재발하지 않게 한다.
    setMode("pvp");
    setPvpGame(g); setPvpWaiting(false); pvpFinishedRef.current = false; qualityRunRef.current++;
    setMyInvite(null);
    const myColor = g.white_uid === myUid ? "w" : "b";
    setActiveColor(myColor);
    setSans(g.sans || []);
    setViewPly(null);
    setResigned(false); setFlagged(null);
    // (신규 기능) 친구 초대로 매칭된 경우 상대가 고른 타임 컨트롤을 그대로 따른다(내가 직접 대기열에
    // 넣은 값과 다를 수 있음) — 서버가 확정한 g.time_control이 항상 우선.
    const tc = timeControlFromKey(g.time_control);
    setTimeControl(tc);
    setClock(tc.initialSec != null ? { w: tc.initialSec * 1000, b: tc.initialSec * 1000 } : null);
    setStep("playing");
    // (v0.5.1 버그 수정) 재접속·새로고침으로 이미 진행 중이던 대국을 이어받는 경우, 그사이(내가
    // 화면을 벗어나 있던 동안) 상대가 시간 초과됐는데도 아무도 서버에 보고하지 못한 채 그대로
    // active로 남아 있었을 수 있다 — 이어받는 즉시 서버 시계로 한 번 확인해 둔다(아직 시간이
    // 남았으면 그냥 그대로, 이미 다 됐으면 곧장 결과가 확정돼 realtime으로 반영된다).
    if (g.id != null) sbRpc("pvp_check_flag", { p_game_id: g.id }).catch(() => {});
  }, [myUid]);
  const joinPvpQueue = async () => {
    if (!myUid) { setPvpErr(t("로그인 후 이용 가능")); return; }
    setPvpErr(""); setPvpWaiting(true);
    try {
      const g = await sbRpcRow("pvp_queue_join", { p_time_control: timeControl.key, p_game_type: PVP_GAME_TYPE });
      // (버그 수정, 사용자 제보) pvp_queue_join은 매칭할 상대가 없으면(대기열에만 합류) SQL NULL을
      // 반환하는데, PostgREST가 단일 row를 반환하는 함수의 NULL을 순수 JSON null이 아니라 "모든 필드가
      // null인 객체"(예: {id:null, white_uid:null, ...})로 직렬화한다 — 이 객체는 `if (g)`로는 참(truthy)이라,
      // 상대를 못 찾았을 뿐인데도 곧장 이 텅 빈 "대국"을 실제로 매칭된 대국처럼 열어버렸다. white_uid가
      // null이라 내 uid와 같을 수 없으니 activeColor는 항상 "b"로, status는 "active"가 아닌 null이라
      // pvpResult가 즉시 계산돼("승리도 무승부도 아니면 패배") 대기 화면 한 번 보지 못하고 곧장 "패배"
      // 결과 팝업이 떴다 — 대기열이 비어 있을 때(같은 시간에 매칭될 다른 사람이 없을 때)마다 100% 재현.
      // 실제 대국인지는 id가 실제로 있는지로 가려낸다.
      if (g && g.id != null) applyPvpGame(g);
    } catch { setPvpErr(t("대기열 합류 실패. 잠시 후 다시 시도")); setPvpWaiting(false); }
  };
  const leavePvpQueue = async () => { setPvpWaiting(false); try { await sbRpc("pvp_queue_leave", {}); } catch { } };
  // (v0.4.3 기능, 사용자 요청) 페이지를 나갈 때(뒤로가기·탭 전환 등으로 이 컴포넌트가 언마운트될 때)
  // — 대기열에 있었으면 매칭 취소로 대기열에서 빼고, 실시간 대국이 결과 없이 진행 중이었으면 그
  // 자리에서 기권으로 처리해 서버·상대 화면에 즉시 반영한다. leaveCleanupRef가 렌더마다 최신 상태를
  // 담고 있으므로, deps를 [myUid]로 좁게 둬도(리마운트 없이) 언마운트 시점엔 항상 최신 값을 본다.
  useEffect(() => () => {
    if (!myUid) return;
    const { mode: m, step: s, pvpGame: g, result: r, activeColor: c } = leaveCleanupRef.current;
    if (m === "pvp" && s === "playing" && g && !r && !pvpFinishedRef.current) {
      pvpFinishedRef.current = true;
      const status = c === "w" ? "black_won" : "white_won";
      sbRpc("pvp_finish", { p_game_id: g.id, p_status: status }).catch(() => {});
      return;
    }
    sbRpc("pvp_queue_leave", {}).catch(() => {});
  }, [myUid]);
  // 대기 중일 때 — 다른 사람이 나를 찾아 매칭해도 내가 만든 pvp_games 행은 아니므로, 내가 white/black
  // 어느 쪽으로 들어가든 realtime으로 알 수 있도록 두 컬럼 각각을 구독한다(소켓이 끊겼을 때를 대비해
  // pvp_queue_join을 다시 불러 재확인하는 느슨한 안전망도 둔다).
  // (v0.4.8, v0.5.0 대비) game_type이 PVP_GAME_TYPE("chess")이 아닌 행은 무시한다 — 나중에 미니게임이
  // 같은 pvp_games 테이블에 자기 대국을 만들면, 그 매칭 이벤트가 이 체스 대기 화면을 잘못 끌고 가지
  // 않도록 하는 안전망(지금은 모든 행이 'chess'뿐이라 실질적인 동작 변화는 없다).
  useRealtimeTable("pvp_games", myUid ? "white_uid=eq." + myUid : null, (payload) => { if (payload && payload.new && payload.new.status === "active" && (payload.new.game_type || "chess") === PVP_GAME_TYPE) applyPvpGame(payload.new); else if (!payload) joinPvpQueue(); }, mode === "pvp" && pvpWaiting && !!myUid, 5000);
  useRealtimeTable("pvp_games", myUid ? "black_uid=eq." + myUid : null, (payload) => { if (payload && payload.new && payload.new.status === "active" && (payload.new.game_type || "chess") === PVP_GAME_TYPE) applyPvpGame(payload.new); else if (!payload) joinPvpQueue(); }, mode === "pvp" && pvpWaiting && !!myUid, 5000);
  // 대국 중 — 상대(또는 내 클라이언트가 보낸) 수·종료 상태를 실시간으로 반영한다. sans는 이 행이
  // 유일한 진실 공급원이라 그대로 덮어쓴다(내가 둔 수도 낙관적으로 먼저 반영해 두지만, 결국 같은
  // 배열로 확정된다).
  useRealtimeTable("pvp_games", pvpGame && pvpGame.id != null ? "id=eq." + pvpGame.id : null, async (payload) => {
    let row = payload && payload.new;
    if (!row) { try { const rows = await sbSelect("pvp_games?id=eq." + pvpGame.id + "&select=*"); row = rows && rows[0]; } catch { } }
    if (!row) return;
    setPvpGame(row);
    setSans(row.sans || []);
  }, mode === "pvp" && step === "playing" && !!pvpGame, 4000);
  // 상대 프로필(닉네임·사진) — 매칭되면 한 번만 가져온다.
  useEffect(() => {
    if (mode !== "pvp" || !pvpGame || !myUid) { setOpponentPub(null); return; }
    const oppUid = pvpGame.white_uid === myUid ? pvpGame.black_uid : pvpGame.white_uid;
    if (!oppUid) return;
    let cancelled = false;
    usersProfiles([oppUid]).then((m) => { if (!cancelled) setOpponentPub((m && m[oppUid] && m[oppUid].pub) || {}); }).catch(() => {});
    return () => { cancelled = true; };
  }, [mode, pvpGame && pvpGame.id, myUid]);

  // (v0.4.4 리디자인) 친구 로스터가 이제 항상 보이므로, 드롭다운을 여는 시점이 아니라 로그인 여부만
  // 보고 곧장 불러온다(수락된 friend_edges).
  useEffect(() => {
    if (!myUid) return;
    let cancelled = false;
    (async () => {
      const edges = await friendEdges();
      const ids = edges.filter((e) => e.status === "accepted").map((e) => (e.from_uid === myUid ? e.to_uid : e.from_uid));
      if (!ids.length) { if (!cancelled) setFriendList([]); return; }
      const profiles = await usersProfiles(ids);
      if (!cancelled) setFriendList(ids.map((uid) => ({ uid, username: (profiles[uid] || {}).username, pub: (profiles[uid] || {}).pub || {} })));
    })();
    return () => { cancelled = true; };
  }, [myUid]);
  const friendPresence = usePresenceMap(friendList.map((f) => f.uid));
  // (신규 기능) 사용자 요청 — 정렬은 최근 접속순, 그중 지금 접속 중인 친구가 여럿이면 퍼즐 티어(XP
  // 기준 사이트 전역 티어) → XP 순으로 다시 정렬한다.
  const sortedFriendList = useMemo(() => {
    const withMeta = friendList.map((f) => {
      const lastSeenMs = friendPresence[f.uid] || 0;
      const online = !!lastSeenMs && (Date.now() - lastSeenMs) < ONLINE_WINDOW_MS;
      const xp = f.pub.xp || 0;
      return { ...f, lastSeenMs, online, xp, tierIndex: tierFromXp(xp).tierIndex };
    });
    withMeta.sort((a, b) => {
      if (a.online !== b.online) return a.online ? -1 : 1;
      if (a.online && b.online) {
        if (b.tierIndex !== a.tierIndex) return b.tierIndex - a.tierIndex;
        if (b.xp !== a.xp) return b.xp - a.xp;
      }
      return (b.lastSeenMs || 0) - (a.lastSeenMs || 0);
    });
    return withMeta;
  }, [friendList, friendPresence]);
  const sendFriendInvite = async (f) => {
    if (!myUid) return;
    setPvpErr("");
    try {
      const inv = await sbRpc("pvp_invite_friend", { p_to_uid: f.uid, p_time_control: timeControl.key, p_game_type: PVP_GAME_TYPE });
      // (v0.4.3) 대기 화면에 "@닉네임의 응답을 기다리는 중..."을 보여주기 위해, 서버 응답(원본 초대
      // 행)에 클릭 시점에 이미 알고 있던 상대 표시 정보를 얹어 둔다 — 서버는 uid만 갖고 있다.
      setMyInvite({ ...inv, toUsername: f.pub.nickname || f.username, toPhoto: f.pub.photo || null });
    } catch (e) { setPvpErr(inviteFailText(e, t("도전장"))); } // (v0.5.9 BUG-035) 미니게임 로스터·채팅 /play처럼 서버가 알려 준 실패 이유를 보여 준다
  };
  const cancelFriendInvite = async () => {
    if (!myInvite) return;
    try { await sbRpc("pvp_invite_cancel", { p_invite_id: myInvite.id }); } catch { }
    setMyInvite(null);
  };
  // (v0.4.3 개편) 받은 도전장에 응답하는 UI·구독은 App 루트의 전역 알람 박스(GlobalPvpInviteBanner)로
  // 옮겼다 — "OpenChess에서 뭘 하고 있든" 보여야 해서 /play 페이지 안에서만 도는 이 컴포넌트 로컬
  // 구독으로는 부족했다. 수락 시 App 루트가 openPlay(seed.resumePvpGame)로 이 페이지를 열고, 아래
  // "seed.resumePvpGame 처리" effect가 곧장 applyPvpGame을 호출해 대국을 이어받는다.
  // 내가 보낸 도전장 — 상대가 수락/거절할 때까지 지켜본다.
  useRealtimeTable("pvp_invites", myInvite ? "id=eq." + myInvite.id : null, async (payload) => {
    let row = payload && payload.new;
    if (!row && myInvite) { try { const rows = await sbSelect("pvp_invites?id=eq." + myInvite.id + "&select=*"); row = rows && rows[0]; } catch { } }
    if (!row) return;
    if (row.status === "accepted" && row.game_id) {
      const rows = await sbSelect("pvp_games?id=eq." + row.game_id + "&select=*");
      if (rows && rows[0]) applyPvpGame(rows[0]);
    } else if (row.status === "declined") {
      setMyInvite(null); setPvpErr(t("상대가 도전장 거절"));
    } else if (row.status === "cancelled") {
      setMyInvite(null);
    }
  }, !!myInvite, 4000);
  // (v0.4.3 기능) 전역 알람 박스에서 도전장을 수락하면 App 루트가 openPlay(seed.resumePvpGame)로 이
  // 페이지를 새로 연다 — 마운트 시 한 번, 이미 서버에서 확정된 그 대국을 곧장 적용한다.
  // (v0.5.7, BUG-025) 예전엔 마운트 때 한 번만 봤다 — 그런데 플레이 탭은 한 번 열리면 숨겨진 채 계속 마운트돼 있어서(App의
  // playGame 주석 참고), 플레이 탭을 한 번이라도 연 뒤에 수락한 도전장은 탭만 바뀌고 대국에 들어가지 못했다. 재개할 대국이
  // 바뀔 때마다 적용한다.
  const resumeId = seed && seed.resumePvpGame ? seed.resumePvpGame.id : null;
  useEffect(() => {
    if (resumeId != null) applyPvpGame(seed.resumePvpGame);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resumeId]);
  // (버그 수정, 사용자 제보) 실시간 대국 도중 새로고침하거나(언마운트 cleanup이 걸리지 않는 하드
  // 리로드·탭 종료) 잠시 다른 곳에 있다가 /play로 다시 돌아오면, 이 컴포넌트는 항상 처음(설정 화면,
  // mode="bot")부터 새로 시작해 서버에는 여전히 "active"로 남아 있는 내 대국을 이어받을 방법이
  // 없었다 — 상대는 계속 내 응수를 기다리며 클럭만 줄어들고, 나는 새 대국을 시작하거나 그냥 나갈
  // 수밖에 없었다. seed로 이어받는 도전장 수락 경로와 별개로, 이 페이지에 들어올 때마다(그리고
  // seed에 이미 재개할 대국이 없을 때만) 서버에서 내가 참가자인 진행 중(active) pvp_games 행이
  // 있는지 한 번 확인해, 있으면 곧장 이어받는다.
  useEffect(() => {
    if (!myUid || (seed && seed.resumePvpGame)) return;
    let cancelled = false;
    (async () => {
      try {
        const rows = await sbSelect("pvp_games?status=eq.active&or=(white_uid.eq." + myUid + ",black_uid.eq." + myUid + ")&order=updated_at.desc&limit=1");
        const g = rows && rows[0];
        if (!g || cancelled) return;
        // (v0.5.9, BUG-041) 진행 중인 대전이 미니게임이면 체스 대국으로 열면 안 된다 — 새로고침하면 미니게임 대전(시계 0-0)이 체스 대국으로
        // 열려 "시간 초과 패배"가 뜨고 사이트가 잠시 먹통이 됐다. 체스가 아닌 대전은 그 미니게임 화면이 이어받는다(최근 10분 안일 때만).
        if ((g.game_type || PVP_GAME_TYPE) !== PVP_GAME_TYPE) {
          if (onResumeSpecial && PLAY_SPECIAL_GAMES.some((x) => x.gameType === g.game_type) && Date.now() - new Date(g.updated_at).getTime() <= 10 * 60 * 1000) onResumeSpecial(g);
          return;
        }
        // (버그 수정, 사용자 제보) 마지막 갱신이 오래전이면 상대도 나도 이미 떠난 죽은 대국일 수 있다.
        // 그런데도 무조건 이어받다 보니, 클럭이 진작 0을 지나 곧장 "패배" 화면으로 떨어지고 —
        // /play를 열 때마다(심지어 "대국 상대 찾기"를 누르기도 전에) 이 죽은 대국을 계속 다시 붙잡아,
        // 정작 새 매칭 화면에는 영영 들어갈 수 없게 만드는 원인이었다("오래전에 보낸 매칭이 여전히
        // 잡히는" 신고와 정확히 일치).
        // (버그 수정, 사용자 제보) 다만 여기서 곧장 pvp_finish(aborted)를 서버에 보고해 버리면, 상대가
        // 그저 긴 시간제어(예: 60|30)에서 오래 생각 중일 뿐인 멀쩡한 대국까지 내 쪽 새로고침/재방문
        // 한 번으로 강제 종료시켜 버렸다 — updated_at은 실제로 수를 둘 때만 갱신되고(pvp_move), 별도
        // 하트비트가 없어 "오래 생각 중"과 "정말 떠난 죽은 대국"을 서버 쪽 시간만으로는 구분할 수
        // 없기 때문이다. 그래서 이 페이지를 열 때(수동적으로) 발견한 오래된 대국은 중단 처리까지는
        // 하지 않고 그냥 이어받지 않기만 한다 — 대국 자체는 서버에 active로 남아, 상대가 아직 있다면
        // 계속 이어갈 수 있다. 실제 좀비 대국 정리는 "대국 상대 찾기"를 눌러 대기열에 합류할 때
        // pvp_queue_join의 2분 기준 좀비 판정(사용자가 명시적으로 새 대국을 요청한 시점)에서만 한다.
        const staleMs = Date.now() - new Date(g.updated_at).getTime();
        if (staleMs > 2 * 60 * 1000) return;
        applyPvpGame(g);
      } catch { }
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [myUid]);

  const board = useMemo(() => boardOfRoot(fenRoot, sans), [fenRoot, sans.join(" ")]);
  const replay = useMemo(() => (fenRoot ? replayFromFen(fenRoot, sans) : null), [fenRoot, sans.join(" ")]);
  const ep = fenRoot ? replay.ep : epTarget(sans);
  const toMoveColor = colorOfRoot(fenRoot, sans.length);
  const endState = useMemo(() => gameEndState(sans, fenRoot), [sans.join(" "), fenRoot]);
  // (신규 기능) pvp 모드에서는 내가 기권했을 때뿐 아니라, 서버가 이미 종료로 표시한 대국(상대가
  // 기권했거나 먼저 체크메이트를 보고한 경우)도 결과로 취급한다.
  const pvpResult = mode === "pvp" && pvpGame && pvpGame.status !== "active"
    ? { end: "pvp", status: pvpGame.status } : null;
  const flagResult = flagged ? { end: "flag", color: flagged } : null;
  const result = resigned ? { end: "resign", color: activeColor } : (endState.end ? endState : (flagResult || pvpResult));
  const userToMove = step === "playing" && !result && toMoveColor === activeColor;
  leaveCleanupRef.current = { mode, step, pvpGame, result, activeColor };
  // (v0.4.4 기능, 사용자 요청) 대국이 끝나면 chess.com처럼 팝업으로 결과를 보여준다 — result가
  // null에서 값이 생기는 그 순간에만 자동으로 연다(다시 설정하거나 재대결하면 result 자체가
  // null로 돌아가므로 자연히 닫힌 채로 남는다). result는 매 렌더 새로 계산되는 객체라(클럭이
  // 1초마다 리렌더시켜도 항상 새 참조) 객체 자체가 아니라 내용을 요약한 문자열 키로 "이미 이
  // 결과를 열어 봤는지"를 비교해야, 사용자가 닫은 뒤 클럭 틱 같은 무관한 리렌더로 다시 열리지 않는다.
  const resultKey = result ? result.end + ":" + (result.color || "") + ":" + (result.status || "") : null;
  const [resultModalOpen, setResultModalOpen] = useState(false);
  const { moveFx: playMoveFxOn } = useContext(VisualPrefsContext);
  const shownResultKeyRef = useRef(null);
  useEffect(() => {
    if (!resultKey) { shownResultKeyRef.current = null; setResultModalOpen(false); return; }
    if (shownResultKeyRef.current === resultKey) return;
    shownResultKeyRef.current = resultKey;
    // (v0.5.6) 체크메이트·스테일메이트·3회 동형 반복은 보드의 대국 종료 이펙트를 끝까지 보여 준 뒤 결과 창을 연다.
    const boardFx = playMoveFxOn && result && (result.end === "checkmate" || result.end === "stalemate" || result.end === "threefold");
    if (!boardFx) { setResultModalOpen(true); return undefined; }
    const t = setTimeout(() => setResultModalOpen(true), END_FX_GAP_MS + GAME_END_MS + 250);
    return () => clearTimeout(t);
  }, [resultKey]); // eslint-disable-line react-hooks/exhaustive-deps
  // (사용자 요청) 봇이 아닌 실시간 상대와 결과 없이 대국이 진행 중인 동안은, 뒤로가기·페이지 나가기
  // 요청이 오면(App 루트가 popstate/닫기 버튼에서 이 값을 읽는다) 곧장 나가는 대신 "정말 기권할지"
  // 확인 알림을 한 번 띄운다 — App 루트는 컴포넌트 트리 밖(브라우저 popstate)에서도 이 값을 읽어야
  // 하므로 상태가 아니라 ref로 올려 보낸다.
  useEffect(() => {
    const active = mode === "pvp" && step === "playing" && !!pvpGame && !resultKey;
    onPvpActiveChange && onPvpActiveChange(active);
    return () => { onPvpActiveChange && onPvpActiveChange(false); };
  }, [mode, step, pvpGame, resultKey, onPvpActiveChange]);

  // (v0.4.5 기능, 사용자 요청) 대국이 끝나면(봇·pvp 모두, 실제로 둔 수가 있을 때만) 매칭 대기 화면
  // 궤도 아이콘용으로 방금 대국의 탁월한 수·실수·블런더 개수를 백그라운드로 계산해 둔다 — 화면을
  // 막지 않도록 fire-and-forget으로 돌리고, 새 대국이 시작되면(qualityRunRef가 바뀌면) 다음 검사
  // 시점에 곧장 멈춘다.
  useEffect(() => {
    if (!resultKey || !sans.length || !engine) return;
    const myToken = ++qualityRunRef.current;
    const snapshot = sans.slice();
    const fr = fenRoot;
    const myColor = activeColor;
    classifyOwnMovesFast(snapshot, fr, myColor, engine, () => qualityRunRef.current !== myToken)
      .then((counts) => { if (qualityRunRef.current === myToken) saveLastGameQuality(counts); })
      .catch(() => { });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resultKey]);

  // (신규 기능) 체크메이트·스테일메이트·3회 동형 반복으로 대국이 끝나면, pvp 모드에서는 서버에도
  // 한 번만 결과를 보고해 상대 화면에도 즉시 반영되게 한다.
  // (버그 수정, 사용자 요청) 예전엔 이걸 그냥 pvp_finish RPC로 직접 불렀는데, pvp_finish는 "자기
  // 자신을 승자로 보고"하는 걸 막아서(위 pvp_move 설명대로 SAN 합법성조차 검증하지 않는 구조상
  // 안전을 위해 꼭 필요한 가드) 승자 쪽 클라이언트에서 이 effect가 실행돼도 조용히 실패했다 — 패자
  // 쪽이 결과 보고 전에 탭을 닫는 등으로 사라지면 그 pvp_games 행이 계속 active로 남아, 승자가
  // 다음 매칭을 시도할 때마다 이미 끝난 그 대국으로 되돌아가는 원인이었다(README v0.4.5 참고, 이
  // 가드를 클라이언트 쪽 플래그로 우회하려던 시도는 보안 리뷰에서 지적돼 되돌렸다). pvp_finish
  // 대신 pvpFinishVerified(api/pvp-finish.js)를 부른다 — 이 서버리스 함수가 sans를 chess.js로 직접
  // 재생해 실제로 이 결과가 맞는지 독립적으로 검증한 뒤에만 확정하므로, 승자·패자 어느 쪽 클라이언트가
  // 먼저(또는 유일하게) 살아 있어도 안전하게(클라이언트 주장을 그냥 믿지 않고) 결과가 확정된다.
  useEffect(() => {
    if (mode !== "pvp" || !pvpGame || pvpFinishedRef.current || !endState.end) return;
    pvpFinishedRef.current = true;
    const status = endState.end === "checkmate" ? (endState.color === "w" ? "black_won" : "white_won") : "draw";
    pvpFinishVerified(pvpGame.id, status);
  }, [mode, pvpGame && pvpGame.id, endState.end, endState.color]);

  // (신규 기능) 타임 컨트롤 — 매 턴, 지금 둘 차례인 쪽의 시계를 실시간으로 줄인다. 서버가 시간을
  // 재지 않으므로(권위 있는 클럭이 아니라 각 클라이언트가 로컬로 계산) 정확히 0.0초까지 양쪽이 완전히
  // 일치하진 않지만, 대국 하나를 진행하는 동안 실용적으로 충분하다.
  useEffect(() => { toMoveColorRef.current = toMoveColor; }, [toMoveColor]);
  useEffect(() => {
    if (step !== "playing" || result || !clock) return;
    let lastTick = Date.now();
    const id = setInterval(() => {
      const now = Date.now();
      const dt = now - lastTick;
      lastTick = now;
      setClock((c) => {
        if (!c) return c;
        const col = toMoveColorRef.current;
        return { ...c, [col]: Math.max(0, c[col] - dt) };
      });
    }, 200);
    return () => clearInterval(id);
  }, [step, !!result, !!clock]);
  // 수가 늘어날 때마다(내 수·봇 수·상대 수 무관) 방금 둔 쪽에 증가시간을 더한다.
  const prevSansLenRef = useRef(sans.length);
  useEffect(() => {
    if (clock && sans.length > prevSansLenRef.current && timeControl.incSec) {
      const moverColor = colorOfRoot(fenRoot, sans.length - 1);
      setClock((c) => (c ? { ...c, [moverColor]: c[moverColor] + timeControl.incSec * 1000 } : c));
    }
    prevSansLenRef.current = sans.length;
  }, [sans.length, clock != null, fenRoot, timeControl]);
  // 시간 초과 감지 — 로컬(봇 대국)이든 pvp든 클럭이 0에 닿으면 그 즉시 진 것으로 처리한다.
  useEffect(() => {
    if (!clock || result || flagged) return;
    if (clock.w <= 0) setFlagged("w");
    else if (clock.b <= 0) setFlagged("b");
  }, [clock, result, flagged]);
  // pvp 모드에서는 시간 초과도 서버에 보고한다 — 체크메이트와 같은 가드(pvpFinishedRef)를 공유해
  // 중복 보고를 막는다.
  // (v0.5.1 버그 수정) 예전엔 그냥 pvp_finish(자기 패배 자백만 허용)를 불렀는데, 진 쪽 클라이언트가
  // 결과를 보고하기 전에 사라지면(탭을 닫는 등) 이긴 쪽의 이 호출은 "자기 승리 선언 금지" 가드에
  // 막혀 조용히 실패해, 그 대국이 영원히 active로 남는 문제가 있었다(체크메이트의 옛 버전과 같은
  // 종류의 좀비 버그 — README v0.4.5 참고). pvp_check_flag는 클라이언트가 주장하는 승패를 전혀 받지
  // 않고 서버에 저장된 시계(pvp_move가 매 수마다 갱신하는 white_ms/black_ms/clock_synced_at)만으로
  // "지금 정말 시간이 다 됐는지"를 스스로 계산하므로, 이긴 쪽·진 쪽 어느 클라이언트가 불러도(둘 다
  // 사라지지만 않았다면 둘 다 거의 동시에 부른다) 안전하게 같은 결과로 확정된다.
  useEffect(() => {
    if (mode !== "pvp" || !pvpGame || pvpFinishedRef.current || !flagged) return;
    pvpFinishedRef.current = true;
    sbRpc("pvp_check_flag", { p_game_id: pvpGame.id }).catch(() => {});
  }, [mode, pvpGame && pvpGame.id, flagged]);

  const go = useCallback((san) => {
    if (result) return;
    playMoveSfx(san);
    setSans((prev) => [...prev, san]);
    setSel(null); setDrag(null); setViewPly(null);
    // (버그 수정, 사용자 제보) pvp_move가 실패해도(네트워크 오류, 서버가 아직 이전 상태라 "내 차례가
    // 아님"으로 걸린 경우 등) 예전엔 조용히 무시해 버렸다 — 이미 위에서 낙관적으로 sans에 내 수를
    // 추가해 둔 상태라, 실제로는 서버에 반영되지 않은 수가 내 화면에만 영원히 남는다(상대는 여전히
    // 내 차례를 기다리는데 내 클럭은 상대 차례처럼 계산되는 등 완전히 어긋난 상태로 굳는다). 실패하면
    // 서버가 마지막으로 확정한 sans로 다시 맞춰 되돌린다.
    if (mode === "pvp" && pvpGame) {
      sbRpc("pvp_move", { p_game_id: pvpGame.id, p_san: san }).catch(async () => {
        try {
          const rows = await sbSelect("pvp_games?id=eq." + pvpGame.id + "&select=*");
          if (rows && rows[0]) { setPvpGame(rows[0]); setSans(rows[0].sans || []); }
        } catch { }
      });
    }
  }, [result, mode, pvpGame]);

  const tryMove = useCallback((from, to) => {
    if (!userToMove) return false;
    if (from[0] === to[0] && from[1] === to[1]) return false;
    const dests = fenRoot ? fenLegalDests(from[0], from[1], activeColor, board, replay.rights, ep) : liveLegalDests(sans, from[0], from[1], activeColor, board, ep);
    if (!dests.some(([r, c]) => r === to[0] && c === to[1])) return false;
    const pc = board[from[0]][from[1]];
    if (pc && pc.t === "P" && ((activeColor === "w" && to[0] === 0) || (activeColor === "b" && to[0] === 7))) { setPromoPrompt({ from, to }); return true; }
    const san = buildSan(board, from[0], from[1], to[0], to[1], activeColor, ep);
    if (!san) return false;
    go(san);
    return true;
  }, [userToMove, board, activeColor, ep, go, fenRoot, replay]);

  const completePromo = useCallback((piece) => {
    if (!promoPrompt) return;
    const { from, to } = promoPrompt; setPromoPrompt(null); setSel(null); setDrag(null);
    const san = buildSan(board, from[0], from[1], to[0], to[1], activeColor, ep, piece);
    if (san) go(san);
  }, [promoPrompt, board, activeColor, ep, go]);

  const onSquareClick = useCallback((sq) => {
    if (!userToMove) return;
    const p = board[sq[0]][sq[1]];
    if (sel) { if (tryMove(sel, sq)) return; if (p && p.c === activeColor) { setSel(sq); return; } setSel(null); return; }
    if (p && p.c === activeColor) setSel(sq);
  }, [sel, board, activeColor, tryMove, userToMove]);
  const onPieceDrag = useCallback((sq) => { if (!userToMove) return; const p = board[sq[0]][sq[1]]; if (p && p.c === activeColor) { setDrag(sq); setSel(sq); } }, [board, activeColor, userToMove]);
  const onDrop = useCallback((sq) => { if (drag) { tryMove(drag, sq); setDrag(null); setSel(null); } }, [drag, tryMove]);

  const legalTargets = userToMove && sel ? (fenRoot ? fenLegalDests(sel[0], sel[1], activeColor, board, replay.rights, ep) : liveLegalDests(sans, sel[0], sel[1], activeColor, board, ep)) : [];

  // 봇 차례 — 유저 턴이 아니고 게임이 안 끝났으면 자동으로 둔다.
  useEffect(() => {
    if (mode !== "bot") return;
    if (step !== "playing" || result) return;
    if (toMoveColor === activeColor) return;
    if (!engine || engine.status !== "ready") return;
    let cancelled = false;
    setBotThinking(true);
    const fen = fenOfRoot(fenRoot, sans);
    const curSans = sans;
    Promise.all([pickBotMove(engine, fen, botTier.elo, botMoveMemoryRef.current), new Promise((r) => setTimeout(r, botThinkDelayMs(botTier.elo)))]).then(([uci]) => {
      if (cancelled) return;
      setBotThinking(false);
      if (!uci) return;
      const epNow = fenRoot ? replayFromFen(fenRoot, curSans).ep : epTarget(curSans);
      const bd = boardOfRoot(fenRoot, curSans);
      const mvColor = colorOfRoot(fenRoot, curSans.length);
      const san = uciToSan(bd, uci, mvColor, epNow);
      if (san) go(san);
    }).catch(() => { if (!cancelled) setBotThinking(false); });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, step, result, toMoveColor, activeColor, engine && engine.status, sans.join(" "), botTier]);

  const startGame = () => {
    const finalColor = colorPick === "random" ? (Math.random() < 0.5 ? "w" : "b") : colorPick;
    setActiveColor(finalColor);
    setSans(seedSans);
    setResigned(false); setFlagged(null);
    setViewPly(null);
    setClock(timeControl.initialSec != null ? { w: timeControl.initialSec * 1000, b: timeControl.initialSec * 1000 } : null);
    botMoveMemoryRef.current = new Map();
    qualityRunRef.current++;
    setStep("playing");
  };
  const rematch = () => {
    if (mode === "pvp") {
      leavePvpQueue(); setPvpGame(null); setOpponentPub(null); pvpFinishedRef.current = false;
      if (myInvite) cancelFriendInvite();
    }
    qualityRunRef.current++;
    setSans(seedSans); setResigned(false); setFlagged(null); setClock(null); setSel(null); setDrag(null); setViewPly(null); botMoveMemoryRef.current = new Map(); setSetupPhase("choose"); setStep("setup");
  };
  const resign = () => {
    setResigned(true); setOptionsOpen(false);
    if (mode === "pvp" && pvpGame && myUid) {
      const status = activeColor === "w" ? "black_won" : "white_won";
      sbRpc("pvp_finish", { p_game_id: pvpGame.id, p_status: status }).catch(() => {});
    }
  };
  // (사용자 요청) 실시간 대국 — 상대에게 합의 무승부를 제안한다. 서버는 draw_offered_by만 표시로
  // 기록해 두고, 상대가 실제로 수락(pvp_draw_accept)해야만 대국이 끝난다 — 한쪽이 일방적으로 무승부를
  // 강제할 수 없다(pvp_finish의 status='draw' 직접 호출은 스테일메이트 등 "객관적으로 계산되는" 무승부
  // 전용이라 여기 쓰지 않는다).
  const offerDraw = () => {
    setOptionsOpen(false);
    if (mode === "pvp" && pvpGame && myUid) sbRpc("pvp_draw_offer", { p_game_id: pvpGame.id }).then(setPvpGame).catch(() => {});
  };
  const respondDraw = (accept) => {
    if (mode === "pvp" && pvpGame && myUid) sbRpc(accept ? "pvp_draw_accept" : "pvp_draw_decline", { p_game_id: pvpGame.id }).then(setPvpGame).catch(() => {});
  };
  // 내가 이미 제안해 상대 응답을 기다리는 중인지 / 상대가 방금 나에게 제안했는지.
  const drawOfferedByMe = mode === "pvp" && pvpGame && pvpGame.draw_offered_by && pvpGame.draw_offered_by === myUid;
  const drawOfferedByOpp = mode === "pvp" && pvpGame && pvpGame.draw_offered_by && pvpGame.draw_offered_by !== myUid && !result;
  // (사용자 요청) 결과 팝업의 "재대결" — 봇 대국은 같은 조건(진영·봉 등급·타임 컨트롤)으로 설정
  // 화면을 거치지 않고 곧장 다시 시작한다. 실시간 대국은 랜덤 매칭 상대가 친구가 아닐 수도 있어
  // pvp_invite_friend를 못 쓰므로, 방금 끝난 그 대국 행 자체에 제안 상태를 기록해 뒀다가(서버 함수가
  // 제안/수락을 한 번에 처리 — 위 supabase-setup.sql 참고) 양쪽이 실시간 구독 중인 그 행에
  // rematch_game_id가 채워지는 순간 아래 effect가 자동으로 새 대국으로 옮겨 탄다.
  const requestRematch = () => {
    if (mode === "pvp") {
      if (pvpGame && myUid) sbRpc("pvp_rematch_offer", { p_game_id: pvpGame.id }).then(setPvpGame).catch(() => {});
      return;
    }
    setResultModalOpen(false);
    startGame();
  };
  const declineRematch = () => {
    if (mode === "pvp" && pvpGame && myUid) sbRpc("pvp_rematch_decline", { p_game_id: pvpGame.id }).then(setPvpGame).catch(() => {});
  };
  const rematchOfferedByMe = mode === "pvp" && pvpGame && pvpGame.rematch_offered_by === myUid;
  const rematchOfferedByOpp = mode === "pvp" && pvpGame && pvpGame.rematch_offered_by && pvpGame.rematch_offered_by !== myUid;
  useEffect(() => {
    if (mode !== "pvp" || !pvpGame || !pvpGame.rematch_game_id) return;
    let cancelled = false;
    sbSelect("pvp_games?id=eq." + pvpGame.rematch_game_id + "&select=*").then((rows) => {
      if (cancelled || !rows || !rows[0]) return;
      setResultModalOpen(false);
      applyPvpGame(rows[0]);
    }).catch(() => {});
    return () => { cancelled = true; };
  }, [mode, pvpGame && pvpGame.rematch_game_id]);

  const flip = activeColor === "b";
  // (사용자 요청) chess.com 대국 화면처럼 상단에 수순 스트립(수 번호 + 백/흑 수, 누르면 그 시점으로
  // 되돌아본다)을 둔다. sans에 이미 buildSan/uciToSan이 매길 때 +/#가 반영돼 있어 별도 보정 없이
  // 그대로 쓴다.
  const startColor = fenRoot ? fenRoot.turn : "w";
  const moveRows = useMemo(() => {
    const rows = [];
    for (let i = 0; i < sans.length; i++) {
      if (plyIsWhite(i, startColor)) rows.push({ num: plyMoveNum(i, startColor), white: { ply: i + 1, san: sans[i] }, black: null });
      else if (rows.length) rows[rows.length - 1].black = { ply: i + 1, san: sans[i] };
      else rows.push({ num: plyMoveNum(i, startColor), white: null, black: { ply: i + 1, san: sans[i] } });
    }
    return rows;
  }, [sans.join(" "), startColor]);
  const highlightPly = viewPly != null ? viewPly : sans.length;
  const displaySans = viewPly != null ? sans.slice(0, viewPly) : sans;
  const displayBoard = useMemo(() => boardOfRoot(fenRoot, displaySans), [fenRoot, displaySans.join(" ")]);
  const canGoBack = (viewPly == null ? sans.length : viewPly) > 0;
  const canGoForward = viewPly != null;
  const stepBack = () => setViewPly((p) => Math.max(0, (p == null ? sans.length : p) - 1));
  const stepForward = () => setViewPly((p) => { if (p == null) return null; const n = p + 1; return n >= sans.length ? null : n; });
  const isLive = viewPly == null;
  // (사용자 요청) 체스보드 아래 내 정보 줄에는 오픈체스 프로필 사진·아이디를 표시한다 — 로그인하지
  // 않은 상태면 기본 프로필(아이콘)과 "Unnamed"로 대신한다.
  const myPhoto = profile && profile.photo;
  const myName = (profile && (profile.nickname || profile.displayId)) || username || null;
  // (신규 기능) pvp 모드에서 위쪽(상대) 줄에는 봇 대신 실제로 매칭된 상대의 OpenChess 프로필을 보여준다.
  const oppName = (opponentPub && (opponentPub.nickname || opponentPub.displayId)) || null;
  const playerBar = (isTop) => (
    <div className="flex items-center justify-between" style={{ padding: "5px 2px" }}>
      <div className="flex items-center gap-2">
        {isTop && mode === "pvp" ? (
          opponentPub && opponentPub.photo ? <img src={opponentPub.photo} alt="" style={{ width: 28, height: 28, borderRadius: "50%", objectFit: "cover", flexShrink: 0 }} />
            : <span style={{ width: 28, height: 28, borderRadius: "50%", background: oppName ? "linear-gradient(180deg," + T.brass + ",#A8842F)" : "#5A4630", color: oppName ? "#241509" : T.ivory, display: "inline-flex", alignItems: "center", justifyContent: "center", fontWeight: 800, fontSize: 12, flexShrink: 0 }}>{oppName ? oppName[0].toUpperCase() : <User size={14} />}</span>
        ) : isTop ? (
          <span style={{ width: 28, height: 28, borderRadius: "50%", background: "#EDE1C6", color: T.inkSoft, display: "inline-flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}><Cpu size={14} /></span>
        ) : myPhoto ? (
          <img src={myPhoto} alt="" style={{ width: 28, height: 28, borderRadius: "50%", objectFit: "cover", flexShrink: 0 }} />
        ) : (
          <span style={{ width: 28, height: 28, borderRadius: "50%", background: myName ? "linear-gradient(180deg," + T.brass + ",#A8842F)" : "#5A4630", color: myName ? "#241509" : T.ivory, display: "inline-flex", alignItems: "center", justifyContent: "center", fontWeight: 800, fontSize: 12, flexShrink: 0 }}>
            {myName ? myName[0].toUpperCase() : <User size={14} />}
          </span>
        )}
        <span style={{ fontSize: 12.5, fontWeight: 800, color: T.ivoryHi }}>{isTop ? (mode === "pvp" ? (oppName || t("상대")) : t("{0} 봇", (botTier.label))) : (myName || "Unnamed")}</span>
      </div>
      <div className="flex items-center gap-8">
        {isTop && mode === "bot" && <span style={{ fontSize: 11, fontWeight: 700, color: botThinking && !result ? T.brassHi : "rgba(244,238,226,.6)", fontFamily: SITE_FONT }}>{botThinking && !result ? t("생각하는 중...") : t("레이팅 {0}", botTier.elo)}</span>}
        {/* (신규 기능) 사용자 요청 — 타임 컨트롤을 골랐으면 각 진영의 남은 시간을 시계처럼 보여준다. */}
        {clock && (() => {
          const barColor = isTop ? (activeColor === "w" ? "b" : "w") : activeColor;
          const isTicking = !result && toMoveColor === barColor;
          return (
            <span style={{ fontSize: 13, fontWeight: 800, fontFamily: "ui-monospace,monospace", padding: "3px 9px", borderRadius: 7, background: isTicking ? "rgba(196,154,80,.28)" : "rgba(0,0,0,.25)", color: clock[barColor] <= 10000 ? "#F4A0A0" : (isTicking ? T.brassHi : "rgba(244,238,226,.7)") }}>{fmtClock(clock[barColor])}</span>
          );
        })()}
      </div>
    </div>
  );

  // (v0.5.0 리디자인, 사용자 요청) 예전엔 이 페이지 전체가 화면을 덮는 별도 오버레이(고정 배경 +
  // 자체 로고 헤더)라 상단 사이트 헤더·하단 탭바가 함께 가려졌다 — 다른 탭과 똑같이 <main> 안에서
  // 그려지는 평범한 콘텐츠로 바꿔, 사이트 공용 헤더·하단 탭바가 이 탭에서도 항상 보이게 한다.
  const hubMaxW = narrow ? PLAY_HUB_MAX_W : PLAY_HUB_MAX_W_DESKTOP;
  // (v0.5.7, 사용자 요청 "데스크톱 레이아웃 비효율") 넓은 화면에선 상점을 대국·미니게임 버튼 아래(스크롤 한참 아래)가 아니라
  // 오른쪽 열에 나란히 둔다 — 예전엔 520px 한 줄 아래로 스킨 카드 6장이 이어져 양옆이 비고 상점은 스크롤해야만 보였다.
  const sideShop = !!storeProps && step === "setup" && !narrowForShop;
  const closeSetup = () => { if (pvpWaiting) leavePvpQueue(); if (myInvite) cancelFriendInvite(); setSetupOpen(false); };
  useEffect(() => { if (step === "playing") setSetupOpen(false); }, [step]);
  return (
    // (v0.5.5, 사용자 요청) 일반 대국(위, 460px)과 미니게임 목록(아래, 데스크톱에서 크게)을 한 화면에 — 바깥 폭은 넓게 두고
    // 일반 대국 부분만 460px로 가운데에 둔다.
    <div style={sideShop ? { maxWidth: PLAY_HUB_MAX_W_DESKTOP + 28 + 420, margin: "0 auto", display: "grid", gridTemplateColumns: PLAY_HUB_MAX_W_DESKTOP + "px minmax(0,1fr)", columnGap: 28, alignItems: "start" } : { maxWidth: 880, margin: "0 auto" }}>
      <div style={{ minWidth: 0 }}>
        <div style={{ maxWidth: step === "setup" ? hubMaxW : 460, margin: "0 auto" }}>
        {step === "setup" ? (
          <>
            {/* (v0.5.5, 사용자 요청) 일반 대국도 미니게임처럼 체스보드 버튼을 먼저 누르고, 별도 창에서 타임 컨트롤·상대를 고른다. */}
            <PlayNormalButton onClick={() => setSetupOpen(true)} />
            {setupOpen && (
              <MinigameScreen title={t("일반 대국")} onBack={closeSetup}>
                <div style={{ width: "100%", maxWidth: 460, margin: "0 auto", paddingTop: 4 }}>
                {
          /* (v0.4.4 리디자인, 사용자 요청) 매칭 대기(랜덤 상대 찾는 중 · 친구 응답 기다리는 중)는
             이제 설정 카드 안의 작은 블록이 아니라, 그 카드를 통째로 갈아치우는 별도 화면
             (MatchmakingScreen)이다 — 지금 벌어지고 있는 일에 화면 전체가 반응하는 느낌을 준다. */
          mode === "pvp" && (pvpWaiting || myInvite) ? (
            <MatchmakingScreen
              active={pvpWaiting || !!myInvite}
              variant={myInvite ? "invite" : "queue"}
              opponent={myInvite ? { name: myInvite.toUsername || t("상대"), photo: myInvite.toPhoto } : null}
              timeControlLabel={timeControl.label}
              onCancel={() => { if (pvpWaiting) leavePvpQueue(); if (myInvite) cancelFriendInvite(); }}
            />
          ) : (
          <div style={{ background: T.paper, border: "1px solid #DCCBA8", borderRadius: 14, padding: 16 }}>
            {/* (v0.4.3 개편) 받은 도전장 배너는 App 루트의 전역 알람 박스로 옮겨졌다(어느 화면에
                있든 항상 뜨도록) — 이 페이지 안에서 별도로 그리지 않는다. */}
            {/* (v0.4.3 UI 개편) 사용자 요청(스케치 제공) — "봇/실시간" 탭과 "랜덤 매칭/친구와 플레이" 탭을
                없애고, 타임 컨트롤을 4개 카테고리(불렛·블리츠·래피드·스탠다드) 3×4 그리드로 고른 뒤 곧장
                "대국 상대 찾기"(랜덤 매칭) · "봇과 플레이하기" · "친구와 플레이하기" 세 가지 중 하나를
                누르는 한 화면으로 합쳤다. "봇과 플레이하기"만 진영·봇 등급을 더 골라야 해서 그때만
                setupPhase가 "bot"으로 넘어간다. */}
            {setupPhase === "choose" ? (
              <>
                <div style={{ fontSize: 12.5, fontWeight: 800, color: T.ink, marginBottom: 8 }}>{t("타임 컨트롤")}</div>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 8, marginBottom: 14 }}>
                  {TIME_CONTROL_CATS.map((cat) => (
                    <div key={cat} style={{ display: "flex", flexDirection: "column", gap: 5 }}>
                      <div style={{ fontSize: 10.5, fontWeight: 800, color: T.inkSoft, textAlign: "center" }}>{cat}</div>
                      {TIME_CONTROLS.filter((t) => t.cat === cat).map((t) => (
                        <button key={t.key} onClick={() => setTimeControl(t)} className="press" style={{ padding: "7px 3px", borderRadius: 8, border: "1px solid " + (timeControl.key === t.key ? T.brass : "#C9B58C"), background: timeControl.key === t.key ? "linear-gradient(180deg," + T.brass + ",#A8842F)" : "transparent", color: timeControl.key === t.key ? "#241509" : T.ink, fontWeight: 800, fontSize: 10.5, lineHeight: 1.25, cursor: "pointer" }}>
                          {t.label}
                        </button>
                      ))}
                    </div>
                  ))}
                </div>
                <div style={{ height: 1, background: "#DCCBA8", margin: "0 0 14px" }} />
                {pvpErr && <div style={{ fontSize: 11.5, color: T.blunder, marginBottom: 10 }}>{pvpErr}</div>}
                <div className="flex gap-2" style={{ marginBottom: 10 }}>
                  <div style={{ padding: "11px 14px", borderRadius: 10, border: "1px solid #C9B58C", color: T.ink, fontWeight: 800, fontSize: 13, whiteSpace: "nowrap", display: "flex", alignItems: "center" }}>{timeControl.label}</div>
                  <button onClick={() => { setMode("pvp"); setPvpSubMode("queue"); setPvpErr(""); joinPvpQueue(); }} disabled={!myUid} className="press" style={{ flex: 1, display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 6, padding: "11px 0", borderRadius: 10, border: "none", background: !myUid ? "rgba(196,154,80,.3)" : "linear-gradient(180deg," + T.brass + ",#A8842F)", color: "#241509", fontWeight: 800, fontSize: 13.5, cursor: !myUid ? "default" : "pointer" }}>
                    <Play size={14} fill="#241509" />{!myUid ? t("로그인 후 이용 가능") : t("대국 상대 찾기")}
                  </button>
                </div>
                <button onClick={() => { setMode("bot"); setSetupPhase("bot"); }} className="press" style={{ width: "100%", display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 8, padding: "12px 0", borderRadius: 10, border: "1px solid " + T.brass, background: "rgba(196,154,80,.12)", color: T.ink, fontWeight: 800, fontSize: 13.5, cursor: "pointer", marginBottom: 16 }}>
                  {tx("{0} 봇과 플레이하기", <Cpu size={16} />)}</button>
                {/* (v0.4.4 리디자인, 사용자 요청) 친구 목록을 눌러야 펼쳐지는 드롭다운이 아니라, 로그인만
                    돼 있으면 항상 고정으로 보이는 로스터로 바꿨다 — 처음 한 번만 살짝 스태거되며
                    나타나고(motion), 이후 실시간 접속 갱신으로 순서가 바뀌어도 다시 애니메이션되지
                    않는다(행마다 key가 고정돼 있어 motion의 initial은 최초 마운트에만 적용됨). 각 행에서
                    프로필(사진·이름) 부분을 누르면 그 친구의 프로필 화면으로 이동하고(onOpenProfile),
                    오른쪽 "도전" 버튼을 눌러야 대국을 신청한다(두 동작을 실수로 섞어 누르지 않도록
                    버튼을 분리). */}
                <div className="flex items-center gap-2" style={{ marginBottom: 8 }}>
                  <User size={14} color={T.brass} />
                  <span style={{ fontSize: 12.5, fontWeight: 800, color: T.ink }}>{t("친구와 플레이하기")}</span>
                </div>
                {!myUid ? (
                  <div style={{ padding: "16px 10px", borderRadius: 10, border: "1px dashed #C9B58C", fontSize: 12, color: T.inkSoft, textAlign: "center" }}>{t("로그인 후 이용 가능")}</div>
                ) : (
                  <div style={{ border: "1px solid #DCCBA8", borderRadius: 10, maxHeight: 280, overflowY: "auto", background: "rgba(255,255,255,.4)" }}>
                    {sortedFriendList.length === 0 ? (
                      <div style={{ padding: "16px 10px", fontSize: 12, color: T.inkSoft, textAlign: "center" }}>{t("대국할 친구 없음")}</div>
                    ) : sortedFriendList.map((f, i) => (
                      <motion.div key={f.uid} layout="position"
                        initial={{ opacity: 0, x: -8 }} animate={{ opacity: 1, x: 0 }}
                        transition={{ duration: 0.28, delay: Math.min(i, 8) * 0.045, ease: MOTION_EASE }}
                        whileHover={{ backgroundColor: "rgba(196,154,80,.1)" }}
                        style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 10px", borderTop: i ? "1px solid rgba(0,0,0,.07)" : "none" }}>
                        <button onClick={() => onOpenProfile && onOpenProfile(f.username)} className="press" style={{ display: "flex", alignItems: "center", gap: 8, flex: 1, minWidth: 0, background: "transparent", border: "none", cursor: "pointer", textAlign: "left", padding: 0 }}>
                          <span style={{ position: "relative", flexShrink: 0, display: "inline-flex" }}>
                            {f.pub.photo ? <img src={f.pub.photo} alt="" style={{ width: 28, height: 28, borderRadius: "50%", objectFit: "cover" }} />
                              : <span style={{ width: 28, height: 28, borderRadius: "50%", background: T.brass, color: "#241509", display: "inline-flex", alignItems: "center", justifyContent: "center", fontWeight: 800, fontSize: 12 }}>{(f.pub.nickname || f.username || "?")[0].toUpperCase()}</span>}
                            {f.online && <motion.span animate={{ scale: [1, 1.5], opacity: [0.7, 0] }} transition={{ duration: 1.6, repeat: Infinity, ease: "easeOut" }} style={{ position: "absolute", right: -1, bottom: -1, width: 8, height: 8, borderRadius: "50%", background: T.brilliant }} />}
                            <OnlineDot lastSeenMs={f.lastSeenMs} overlay size={8} />
                          </span>
                          <span style={{ minWidth: 0, flex: 1 }}>
                            <span style={{ display: "block", fontSize: 12.5, fontWeight: 800, color: T.ink, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{f.pub.nickname || f.username}</span>
                            <span style={{ display: "block", fontSize: 10, color: T.inkSoft }}>{presenceLabel(f.lastSeenMs) || t("오프라인")}</span>
                          </span>
                        </button>
                        <button onClick={() => sendFriendInvite(f)} disabled={!!myInvite} className="press" style={{ flexShrink: 0, padding: "6px 13px", borderRadius: 8, border: "none", background: myInvite ? "rgba(196,154,80,.3)" : "linear-gradient(180deg," + T.brass + ",#A8842F)", color: "#241509", fontWeight: 800, fontSize: 11.5, cursor: myInvite ? "default" : "pointer" }}>{t("도전")}</button>
                      </motion.div>
                    ))}
                  </div>
                )}
              </>
            ) : (
              <>
                <button onClick={() => setSetupPhase("choose")} className="press" style={{ display: "inline-flex", alignItems: "center", gap: 4, marginBottom: 14, padding: "6px 10px 6px 6px", borderRadius: 8, border: "none", background: "transparent", color: T.brass, fontWeight: 800, fontSize: 12.5, cursor: "pointer" }}>
                  {tx("{0} 뒤로", <ChevronLeft size={16} />)}</button>
                <div style={{ fontSize: 12.5, fontWeight: 800, color: T.ink, marginBottom: 8 }}>{t("진영 선택")}</div>
                <div className="flex gap-2" style={{ marginBottom: 16 }}>
                  {[["w", t("백")], ["b", t("흑")], ["random", t("랜덤")]].map(([k, lb]) => (
                    <button key={k} onClick={() => setColorPick(k)} className="press" style={{ flex: 1, padding: "10px 0", borderRadius: 10, border: "1px solid " + (colorPick === k ? T.brass : "#C9B58C"), background: colorPick === k ? "linear-gradient(180deg," + T.brass + ",#A8842F)" : "transparent", color: colorPick === k ? "#241509" : T.ink, fontWeight: 800, fontSize: 13, cursor: "pointer" }}>{lb}</button>
                  ))}
                </div>
                <div style={{ fontSize: 12.5, fontWeight: 800, color: T.ink, marginBottom: 8 }}>{t("상대할 봇 선택")}</div>
                <div style={{ display: "flex", flexDirection: "column", gap: 6, marginBottom: 18 }}>
                  {PLAY_BOT_TIERS.map((t) => (
                    <button key={t.elo} onClick={() => setBotTier(t)} className="press" style={{ display: "flex", alignItems: "center", gap: 10, padding: "9px 12px", borderRadius: 10, border: "1px solid " + (botTier.elo === t.elo ? T.brass : "#C9B58C"), background: botTier.elo === t.elo ? "rgba(196,154,80,.14)" : "#fff", cursor: "pointer", textAlign: "left" }}>
                      <span style={{ width: 32, height: 32, borderRadius: "50%", background: botTier.elo === t.elo ? T.brass : "#EDE1C6", color: botTier.elo === t.elo ? "#241509" : T.inkSoft, display: "inline-flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}><Cpu size={16} /></span>
                      <span style={{ minWidth: 0, flex: 1 }}>
                        <span style={{ display: "block", fontFamily: SITE_FONT, fontWeight: 800, fontSize: 13.5, color: T.ink }}>{t.label}</span>
                        <span style={{ display: "block", fontSize: 11, color: T.inkSoft }}>{t.desc}</span>
                      </span>
                      {botTier.elo === t.elo && <Check size={16} color={T.brass} />}
                    </button>
                  ))}
                </div>
                <button onClick={startGame} disabled={!engine || engine.status !== "ready"} className="press" style={{ width: "100%", padding: "11px 0", borderRadius: 10, border: "none", background: (!engine || engine.status !== "ready") ? "rgba(196,154,80,.3)" : "linear-gradient(180deg," + T.brass + ",#A8842F)", color: "#241509", fontWeight: 800, fontSize: 14, cursor: (!engine || engine.status !== "ready") ? "default" : "pointer" }}>{(!engine || engine.status !== "ready") ? t("엔진을 준비하는 중...") : t("대국 시작")}</button>
              </>
            )}
          </div>
          )
                }
                </div>
              </MinigameScreen>
            )}
          </>
        ) : (
          <div>
            {/* (사용자 요청) chess.com 대국 화면과 같은 구성 — 맨 위 수순 스트립(누르면 그 시점으로
                되돌아본다), 상대(봇) 정보 줄, 보드, 내 정보 줄, 그 아래 결과/컨트롤. */}
            <div className="hide-scrollbar" style={{ display: "flex", gap: 10, overflowX: "auto", padding: "9px 10px", background: "rgba(0,0,0,.28)", borderRadius: 10, marginBottom: 10, border: "1px solid rgba(255,255,255,.08)" }}>
              {moveRows.length === 0
                ? <span style={{ fontSize: 11.5, color: "rgba(244,238,226,.4)", whiteSpace: "nowrap" }}>{t("둔 수 없음")}</span>
                : moveRows.map((row) => (
                  <div key={row.num} style={{ display: "flex", alignItems: "center", gap: 4, flexShrink: 0 }}>
                    <span style={{ fontSize: 11, color: "rgba(244,238,226,.45)", fontFamily: SITE_FONT }}>{row.num}.</span>
                    {row.white && <button onClick={() => setViewPly(row.white.ply)} className="press" style={{ border: "none", background: highlightPly === row.white.ply ? "rgba(196,154,80,.28)" : "transparent", color: highlightPly === row.white.ply ? T.brassHi : T.ivoryHi, fontWeight: 800, fontSize: 12.5, fontFamily: SITE_FONT, padding: "2px 5px", borderRadius: 5, cursor: "pointer" }}>{row.white.san}</button>}
                    {row.black && <button onClick={() => setViewPly(row.black.ply)} className="press" style={{ border: "none", background: highlightPly === row.black.ply ? "rgba(196,154,80,.28)" : "transparent", color: highlightPly === row.black.ply ? T.brassHi : T.ivoryHi, fontWeight: 800, fontSize: 12.5, fontFamily: SITE_FONT, padding: "2px 5px", borderRadius: 5, cursor: "pointer" }}>{row.black.san}</button>}
                  </div>
                ))}
            </div>
            {playerBar(true)}
            <div style={{ width: "100%", maxWidth: boardSize, margin: "6px auto" }}>
              <Board board={displayBoard} flip={flip} size={boardSize} selected={isLive ? sel : null} legalTargets={isLive ? legalTargets : []} onSquareClick={isLive ? onSquareClick : undefined} onPieceDrag={isLive ? onPieceDrag : undefined} onDrop={isLive ? onDrop : undefined} interactive={isLive && userToMove} showEval={false} showCoords
                endFx={isLive && endState.end ? { kind: endState.end, loser: endState.color } : null} />
            </div>
            {playerBar(false)}
            {promoPrompt && (
              <div style={{ marginTop: 10, textAlign: "center" }}>
                <div style={{ fontSize: 11.5, fontWeight: 700, color: "rgba(244,238,226,.7)", marginBottom: 6 }}>{t("승격할 기물 선택")}</div>
                <div className="flex justify-center gap-2">
                  {["Q", "R", "B", "N"].map((t) => (
                    <button key={t} onClick={() => completePromo(t)} className="press" style={{ width: 46, height: 46, borderRadius: 10, background: "linear-gradient(180deg,#FBF4E6,#E7D7BC)", border: "1px solid " + T.brass, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}><PieceGlyph type={t} color={activeColor} size={24} /></button>
                  ))}
                </div>
              </div>
            )}
            {result && (
              <div style={{ marginTop: 10, textAlign: "center", padding: "12px 14px", borderRadius: 10, background: "linear-gradient(180deg,#3A2516,#241509)", border: "1px solid " + T.brass }}>
                <div style={{ color: T.brassHi, fontWeight: 800, fontSize: 14, marginBottom: 4 }}>
                  {result.end === "checkmate" ? (result.color === activeColor ? t("패배: 체크메이트") : t("승리: 체크메이트")) :
                   result.end === "resign" ? t("기권") :
                   result.end === "flag" ? (result.color === activeColor ? t("패배: 시간 초과") : t("승리: 시간 초과")) :
                   result.end === "pvp" ? (
                     result.status === "draw" ? t("무승부") :
                     result.status === "aborted" ? t("대국 중단") :
                     ((result.status === "white_won" && activeColor === "w") || (result.status === "black_won" && activeColor === "b")) ? t("승리: 상대 기권") : t("패배: 상대 승리")
                   ) :
                   result.end === "stalemate" ? t("무승부: 스테일메이트") : t("무승부: 3회 동형 반복")}
                </div>
              </div>
            )}
            <AnimatePresence>
              {resultModalOpen && result && (
                <PlayResultModal result={result} activeColor={activeColor} mode={mode} botTier={botTier} opponentPub={opponentPub}
                  myPhoto={myPhoto} myName={myName} oppName={oppName} timeControl={clock ? timeControl : null}
                  onClose={() => setResultModalOpen(false)}
                  onReview={onOpenReview ? () => { onOpenReview({ sans, fenRoot }); setResultModalOpen(false); } : null}
                  onRematch={requestRematch} rematchOfferedByMe={rematchOfferedByMe} rematchOfferedByOpp={rematchOfferedByOpp} />
              )}
            </AnimatePresence>
            {/* (사용자 요청) 하단 컨트롤 — 옵션(기권·리뷰·다시 설정 팝업) · 뒤로 · 앞으로(수순 되돌아보기) */}
            <div className="flex items-center justify-center gap-3" style={{ marginTop: 14 }}>
              <div style={{ position: "relative" }}>
                <NavBtn onClick={() => setOptionsOpen((v) => !v)} active={optionsOpen}><Settings size={16} /></NavBtn>
                {optionsOpen && (
                  <>
                    <span onClick={() => setOptionsOpen(false)} style={{ position: "fixed", inset: 0, zIndex: 40 }} />
                    <div style={{ position: "absolute", bottom: "calc(100% + 8px)", left: "50%", transform: "translateX(-50%)", width: 170, background: "linear-gradient(180deg,#3A2516,#241509)", border: "1px solid " + T.brass, borderRadius: 10, padding: 5, zIndex: 41, display: "flex", flexDirection: "column", gap: 1, boxShadow: "0 10px 24px -8px rgba(0,0,0,.6)" }}>
                      {/* (사용자 요청) 실시간 대국(봇 아님) 중에는 기권 위에 무승부 제안 버튼을 둔다 — 이미
                          제안해 응답을 기다리는 중이면 "제안 취소"로 바뀐다. */}
                      {!result && mode === "pvp" && (
                        <button onClick={drawOfferedByMe ? () => respondDraw(false) : offerDraw} className="press" style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 10px", borderRadius: 7, background: "transparent", border: "none", color: T.ivoryHi, fontSize: 12.5, fontWeight: 700, cursor: "pointer", textAlign: "left" }}>
                          <Handshake size={14} />{drawOfferedByMe ? t("무승부 제안 취소") : t("무승부 제안")}
                        </button>
                      )}
                      {!result && <button onClick={resign} className="press" style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 10px", borderRadius: 7, background: "transparent", border: "none", color: "#F4A0A0", fontSize: 12.5, fontWeight: 700, cursor: "pointer", textAlign: "left" }}>{t("기권")}</button>}
                      {result && onOpenReview && <button onClick={() => { onOpenReview({ sans, fenRoot }); setOptionsOpen(false); }} className="press" style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 10px", borderRadius: 7, background: "transparent", border: "none", color: T.brassHi, fontSize: 12.5, fontWeight: 700, cursor: "pointer", textAlign: "left" }}>{t("대국 리뷰")}</button>}
                      {/* (사용자 요청) 봇이 아닌 실시간 상대와 대국을 하는 도중에는 "다시 설정"이 뜨지 않게
                          한다 — 상대는 그대로 둔 채 설정만 바꿔 새로 시작할 방법이 없어(재도전은 별도
                          흐름) 대국 중엔 이 버튼이 의미가 없고, 실수로 눌러 진행 중인 대국을 잃을 위험만
                          있다. 대국이 끝난 뒤에는(리뷰·새 대국 시작 용도로) 그대로 둔다. */}
                      {(mode !== "pvp" || result) && <button onClick={() => { rematch(); setOptionsOpen(false); }} className="press" style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 10px", borderRadius: 7, background: "transparent", border: "none", color: T.ivoryHi, fontSize: 12.5, fontWeight: 700, cursor: "pointer", textAlign: "left" }}>{t("다시 설정")}</button>}
                    </div>
                  </>
                )}
              </div>
              <NavBtn onClick={stepBack} disabled={!canGoBack}><ChevronLeft size={17} /></NavBtn>
              <NavBtn onClick={stepForward} disabled={!canGoForward}><ChevronRight size={17} /></NavBtn>
            </div>
          </div>
        )}
        </div>
        {/* (v0.5.5) 미니게임 — 일반 대국 설정 화면 아래에 이어서 보여준다. 대국 중에는 목록만 숨기고(PlaySpecialGames는
            그대로 마운트 — 친구 도전장 수락 등으로 연 미니게임은 자체 전체화면이라 계속 보인다). */}
        <div style={{ display: step === "setup" ? "block" : "none", marginTop: 14 }}>
          <PlaySpecialGames myUid={myUid} onOpenProfile={onOpenProfile} resume={specialResume} onConsumeResume={onConsumeSpecialResume} myRating={myPuzzleRating} canEditContent={canEditContent} hubMaxWidth={hubMaxW} />
        </div>
      </div>
      {/* (사용자 요청) 상대가 무승부를 제안하면, 지금 어느 화면(옵션 메뉴가 열려 있든 아니든)에 있든
          바로 보이도록 뷰포트 맨 아래에 고정된 알림 띠로 띄운다. */}
      <AnimatePresence>
        {drawOfferedByOpp && (
          <motion.div initial={{ y: 60, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: 60, opacity: 0 }} transition={{ duration: 0.22, ease: MOTION_EASE }}
            style={{ position: "fixed", left: 0, right: 0, bottom: 0, zIndex: 320, padding: "12px 16px calc(12px + env(safe-area-inset-bottom))", background: "linear-gradient(180deg,#3A2516,#241509)", borderTop: "1px solid " + T.brass, boxShadow: "0 -10px 24px -8px rgba(0,0,0,.6)" }}>
            <div style={{ maxWidth: 460, margin: "0 auto", display: "flex", alignItems: "center", gap: 10 }}>
              <Handshake size={18} color={T.brassHi} style={{ flexShrink: 0 }} />
              <span style={{ flex: 1, minWidth: 0, fontSize: 12.5, fontWeight: 700, color: T.ivoryHi }}>{t("{0} 무승부 제안", (oppName || t("상대")))}</span>
              <button onClick={() => respondDraw(false)} className="press" style={{ flexShrink: 0, padding: "7px 12px", borderRadius: 8, border: "1px solid rgba(255,255,255,.18)", background: "transparent", color: "rgba(244,238,226,.75)", fontWeight: 800, fontSize: 12, cursor: "pointer" }}>{t("거절")}</button>
              <button onClick={() => respondDraw(true)} className="press" style={{ flexShrink: 0, padding: "7px 14px", borderRadius: 8, border: "none", background: "linear-gradient(180deg," + T.brass + ",#A8842F)", color: "#241509", fontWeight: 800, fontSize: 12, cursor: "pointer" }}>{t("수락")}</button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
      {/* (사용자 요청) 상대가 재대결을 신청하면(결과 팝업을 이미 닫았어도) 뷰포트 맨 아래에 알림 띠로
          띄운다 — 무승부 제안 알림과 완전히 같은 자리·구조를 쓴다. */}
      <AnimatePresence>
        {rematchOfferedByOpp && !drawOfferedByOpp && (
          <motion.div initial={{ y: 60, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: 60, opacity: 0 }} transition={{ duration: 0.22, ease: MOTION_EASE }}
            style={{ position: "fixed", left: 0, right: 0, bottom: 0, zIndex: 320, padding: "12px 16px calc(12px + env(safe-area-inset-bottom))", background: "linear-gradient(180deg,#3A2516,#241509)", borderTop: "1px solid " + T.brass, boxShadow: "0 -10px 24px -8px rgba(0,0,0,.6)" }}>
            <div style={{ maxWidth: 460, margin: "0 auto", display: "flex", alignItems: "center", gap: 10 }}>
              <Repeat2 size={18} color={T.brassHi} style={{ flexShrink: 0 }} />
              <span style={{ flex: 1, minWidth: 0, fontSize: 12.5, fontWeight: 700, color: T.ivoryHi }}>{t("{0} 재대결 신청", (oppName || t("상대")))}</span>
              <button onClick={declineRematch} className="press" style={{ flexShrink: 0, padding: "7px 12px", borderRadius: 8, border: "1px solid rgba(255,255,255,.18)", background: "transparent", color: "rgba(244,238,226,.75)", fontWeight: 800, fontSize: 12, cursor: "pointer" }}>{t("거절")}</button>
              <button onClick={requestRematch} className="press" style={{ flexShrink: 0, padding: "7px 14px", borderRadius: 8, border: "none", background: "linear-gradient(180deg," + T.brass + ",#A8842F)", color: "#241509", fontWeight: 800, fontSize: 12, cursor: "pointer" }}>{t("수락")}</button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
      {/* (v0.5.0 개편, 사용자 요청) 상점 탭 → 플레이 탭 — 이 화면 밑에 기존 상점 UI를 그대로 이어
          붙인다(<main> 안의 이 페이지 자신을 아래로 스크롤하면 보인다). 분석 탭 PLAY 버튼 등
          storeProps 없이 여는 다른 진입 경로는 아무 것도 렌더링하지 않아 지금까지와 완전히
          동일하다. */}
      {storeProps && (
        <div style={sideShop
          ? { gridColumn: 2, gridRow: 1, minWidth: 0, padding: "18px 18px 20px", borderRadius: 16, border: "1px solid rgba(196,154,80,.25)", background: "rgba(0,0,0,.14)", position: "sticky", top: 12 }
          : { maxWidth: 460, margin: "0 auto", padding: "0 16px 60px", borderTop: "1px solid rgba(196,154,80,.25)", marginTop: 8, paddingTop: 22 }}>
          <StoreTab {...storeProps} />
        </div>
      )}
    </div>
  );
}
function StoreTab({ coins, ownedSkins, boardSkin, pieceSkin, onBuySkin, onEquipSkin }) {
  return (
    <div>
      {/* (디자인) 코인 보유 UI를 화면을 가로지르는 큰 배너 대신, 제목 옆 우상단의 작은 칩으로 축소. */}
      <div className="flex items-center justify-between" style={{ marginBottom: 16, flexWrap: "wrap", gap: 8 }}>
        {/* (버그 수정) 제목 옆 원형 아이콘이 하단 탭바의 상점 아이콘과 중복돼 제거. */}
        <div className="flex items-center gap-2"><h2 style={{ fontSize: 18, fontWeight: 800, color: T.ivoryHi }}>{t("상점")}</h2></div>
        <div className="flex items-center gap-2" style={{ flexWrap: "wrap" }}>
          <div className="flex items-center gap-1" title={t("보유 중인 OC 나이트 코인")} style={{ background: "linear-gradient(135deg,#3A2516,#241509)", border: "1px solid " + T.brass, borderRadius: 999, padding: "5px 11px 5px 6px" }}>
            <CoinIcon size={26} />
            <span style={{ fontSize: 13, fontWeight: 800, color: T.brassHi, fontFamily: SITE_FONT }}>{fmtFull(coins || 0)}</span>
          </div>
        </div>
      </div>
      <div style={{ fontSize: 12.5, fontWeight: 800, color: T.brassHi, marginBottom: 8 }}>{t("체스보드 스킨")}</div>
      <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 18 }}>
        {Object.entries(BOARD_SKINS).map(([id, sk], i) => (
          <FadeIn key={id} index={i}><SkinShopCard kind="board" id={id} sk={sk} owned={ownedSkins.has("board:" + id)} equipped={boardSkin === id} coins={coins || 0} onBuy={onBuySkin} onEquip={onEquipSkin} /></FadeIn>
        ))}
      </div>
      <div style={{ fontSize: 12.5, fontWeight: 800, color: T.brassHi, marginBottom: 8 }}>{t("기물 스킨")}</div>
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {Object.entries(PIECE_SKINS).map(([id, sk], i) => (
          <FadeIn key={id} index={i}><SkinShopCard kind="piece" id={id} sk={sk} owned={ownedSkins.has("piece:" + id)} equipped={pieceSkin === id} coins={coins || 0} onBuy={onBuySkin} onEquip={onEquipSkin} /></FadeIn>
        ))}
      </div>
    </div>
  );
}