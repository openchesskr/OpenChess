// (v0.6.0, App.jsx 분할) App 껍데기: 헤더·알림·모달 등 App만 쓰는 조각
// 동작 변경 없이 App.jsx에서 그대로 옮겼다(REFACTOR_NOTES.md Phase 3 참고).
import React, { useRef, useState, useCallback, useEffect, useMemo, useLayoutEffect } from "react";
import { SB_ON, sbUpsert, sbRpc, sbSelect, sbInsert, SB_URL, SB_KEY, setSbToken, SB_TOKEN, sbHeaders, sbPatch } from "../lib/supabaseClient.js";
import { tierFromXp, gmPhotoRingStyle, TIER_COLORS, tierGlowHex, TIERS, tierGradientCss } from "../lib/tierSystem.js";
import { TierLogoDisc } from "../components/pieces.jsx";
import { T, MOTION_EASE, tierPieceSrc } from "../lib/theme.js";
import { Sparkles, ChevronRight, Bell, Play, Search, Check, X, Target, Star, Crown, Library, Settings, Users, Info, ChevronDown, EyeOff, Eye } from "lucide-react";
import { SITE_FONT } from "../components/engineLines.jsx";
import { motion, AnimatePresence, useMotionValue, animate as animateMv } from "framer-motion";
import { drawKindLabel } from "../lib/chessRules.js";
import { BestMoveJumpButton } from "../components/uiPrimitives.jsx";
import { ALNUM, ANALYSIS_ENGINE_IDS, AnimatedMove, AppleLogo, CONTENT, CoinIcon, DEFAULT_QUEST_OPENINGS, ENGINE_PROFILES, FacebookLogo, FadeIn, GoogleG, MASCOT_ART, Mascot, MascotBubble, MgOppBadge, SNAP, SequenceBar, TIME_CLASS_LABEL, TITLE_OPENINGS, TITLE_TIERS, TitleBadge, fetchChesscomProfile, fetchLichess, fxEase, hasBatchim, isBookMoveAt, livePuzzleName, mergeDevAdds, notifySetResult, openingNameOf, questLabel, questLabelNode, questOpeningMovesText, questOpeningSide, relTime, resolveDailyPuzzleCached, roleIcon, seedRand, snapNode, solveCountText, timeControlFromKey, titleId, todayStr, useNarrow, useRealtimeTable, usersProfiles, tcCatLabel } from "./common.jsx";
import { CHANGELOG } from "./changelog.js";
import { PublicProfileStats } from "./profile.jsx";
import { PLAY_SPECIAL_GAMES } from "./play.jsx";

import { t, tx } from "../lib/i18n.js";
import { lichessForegroundBusy, whenLichessIdle } from "../lib/lichessApi.js";
// (17차) 배경 장식의 기하학적 밀도 강화 — 저폴리곤 기물 아이콘과 어울리도록 와이어프레임 큐브·정팔면체·
// 육각형 등을 페이지 전반(상단뿐 아니라 하단까지)에 흩뿌려 첨부 레퍼런스 이미지의 "떠있는 도형들" 느낌을 낸다.
// (v0.0.5 성능) props 없는 순수 장식 SVG인데도 memo가 없으면 App이 리렌더될 때마다(3~30초 폴링 등)
// 매번 다시 그려졌다 — React.memo로 최초 한 번만 계산하도록 고정.
export const GeoBackdrop = React.memo(function GeoBackdrop() {
  const g = "#C49A50";
  const dia = (x, y, sz, o) => <rect x={x} y={y} width={sz} height={sz} transform={"rotate(45 " + (x + sz / 2) + " " + (y + sz / 2) + ")"} fill="none" stroke={g} strokeWidth="1.2" opacity={o} />;
  const tri = (x, y, sz, o, filled) => <path d={"M" + x + " " + (y - sz) + " L" + (x + sz * 0.87) + " " + (y + sz * 0.5) + " L" + (x - sz * 0.87) + " " + (y + sz * 0.5) + " Z"} fill={filled ? g : "none"} stroke={g} strokeWidth="1" opacity={o} />;
  // 와이어프레임 큐브(등각투상 육각형 실루엣 + 내부 3면 경계선)
  const cube = (x, y, sz, o) => (
    <g opacity={o} fill="none" stroke={g} strokeWidth="1">
      <path d={"M" + x + "," + (y - sz * 0.5) + " L" + (x + sz * 0.87) + "," + (y - sz) + " L" + (x + sz * 1.74) + "," + (y - sz * 0.5) + " L" + (x + sz * 1.74) + "," + (y + sz * 0.5) + " L" + (x + sz * 0.87) + "," + (y + sz) + " L" + x + "," + (y + sz * 0.5) + " Z"} />
      <path d={"M" + x + "," + (y - sz * 0.5) + " L" + (x + sz * 0.87) + "," + y + " L" + (x + sz * 1.74) + "," + (y - sz * 0.5)} />
      <line x1={x + sz * 0.87} y1={y} x2={x + sz * 0.87} y2={y + sz} />
    </g>
  );
  // 정팔면체(가로선으로 나뉜 마름모) 실루엣
  const octa = (x, y, w, h, o) => (
    <g opacity={o} fill="none" stroke={g} strokeWidth="1">
      <path d={"M" + x + "," + (y - h) + " L" + (x + w) + "," + y + " L" + x + "," + (y + h) + " L" + (x - w) + "," + y + " Z"} />
      <line x1={x - w} y1={y} x2={x + w} y2={y} />
    </g>
  );
  const hexOutline = (x, y, sz, o) => { const pts = Array.from({ length: 6 }, (_, i) => { const a = Math.PI / 3 * i - Math.PI / 6; return (x + sz * Math.cos(a)) + "," + (y + sz * Math.sin(a)); }).join(" "); return <polygon points={pts} fill="none" stroke={g} strokeWidth="1" opacity={o} />; };
  return (
    <svg aria-hidden="true" width="100%" height="100%" viewBox="0 0 1200 1600" preserveAspectRatio="xMidYMin slice" style={{ position: "fixed", inset: 0, zIndex: -1, pointerEvents: "none" }}>
      <g fill="none" stroke={g}>
        <circle cx="600" cy="230" r="360" strokeWidth="1.2" opacity="0.10" />
        <circle cx="600" cy="230" r="250" strokeWidth="1" opacity="0.07" strokeDasharray="2 9" />
        <circle cx="120" cy="980" r="220" strokeWidth="1" opacity="0.06" strokeDasharray="2 9" />
        <circle cx="1100" cy="1300" r="300" strokeWidth="1.1" opacity="0.07" />
        <line x1="0" y1="230" x2="1200" y2="230" strokeWidth="1" opacity="0.05" />
        <line x1="600" y1="-120" x2="600" y2="600" strokeWidth="1" opacity="0.05" />
        <line x1="110" y1="-60" x2="540" y2="370" strokeWidth="1" opacity="0.06" />
        <line x1="1090" y1="-60" x2="660" y2="370" strokeWidth="1" opacity="0.06" />
        <line x1="80" y1="1480" x2="420" y2="1120" strokeWidth="1" opacity="0.05" />
        <line x1="1150" y1="1500" x2="820" y2="1080" strokeWidth="1" opacity="0.05" />
      </g>
      {dia(150, 350, 28, 0.12)}{dia(1006, 286, 32, 0.12)}{dia(978, 520, 16, 0.09)}{dia(214, 560, 16, 0.08)}
      {dia(90, 1180, 20, 0.09)}{dia(1120, 940, 24, 0.1)}{dia(760, 1460, 18, 0.08)}
      <path d="M120 940 L140 902 L160 940 Z" fill={g} opacity="0.08" />
      <path d="M1058 1010 L1078 972 L1098 1010 Z" fill={g} opacity="0.08" />
      {tri(340, 1240, 16, 0.1, true)}{tri(980, 1180, 12, 0.08, false)}{tri(1140, 640, 14, 0.09, false)}
      {cube(60, 500, 26, 0.09)}{cube(1000, 760, 22, 0.08)}{cube(300, 1360, 20, 0.07)}{cube(880, 1440, 24, 0.08)}
      {octa(1080, 200, 22, 30, 0.09)}{octa(180, 800, 18, 26, 0.08)}{octa(620, 1000, 16, 22, 0.07)}{octa(1000, 1240, 20, 28, 0.08)}
      {hexOutline(500, 880, 34, 0.06)}{hexOutline(1140, 480, 26, 0.07)}{hexOutline(220, 1480, 30, 0.06)}
      {/* (17차) 버튼/카드 개별 장식(geo-cut, geo-card)을 제거하는 대신, 배경(갈색 여백)의 기하학 밀도를
          더 높여 첨부 레퍼런스의 "떠있는 도형들" 느낌을 UI 블록이 아닌 배경 쪽에서만 낸다. */}
      {dia(430, 140, 14, 0.08)}{dia(690, 660, 18, 0.07)}{dia(60, 760, 12, 0.08)}{dia(1150, 1120, 16, 0.07)}
      {dia(360, 1560, 20, 0.07)}{dia(940, 60, 14, 0.08)}
      <path d="M540 480 L556 448 L572 480 Z" fill={g} opacity="0.07" />
      <path d="M800 1300 L818 1266 L836 1300 Z" fill={g} opacity="0.07" />
      {tri(60, 1040, 12, 0.08, false)}{tri(1180, 320, 10, 0.09, true)}{tri(460, 1500, 14, 0.07, false)}
      {cube(500, 60, 16, 0.07)}{cube(1150, 560, 18, 0.07)}{cube(40, 1440, 20, 0.07)}
      {octa(360, 240, 14, 20, 0.07)}{octa(860, 900, 18, 24, 0.06)}
      {hexOutline(60, 260, 20, 0.06)}{hexOutline(700, 1560, 24, 0.06)}{hexOutline(1180, 900, 18, 0.06)}
      <circle cx="500" cy="1140" r="3" fill={g} opacity="0.15" />
      <circle cx="1080" cy="700" r="2.4" fill={g} opacity="0.14" />
      <circle cx="240" cy="440" r="2.6" fill={g} opacity="0.13" />
      <circle cx="900" cy="1440" r="3" fill={g} opacity="0.14" />
    </svg>
  );
});
// (성능) SharedArrayBuffer 기반 멀티스레드 Stockfish는 교차 출처 격리(Cross-Origin-Opener/Embedder
// Policy)가 걸린 페이지에서만 쓸 수 있다 — vite.config.js(개발)·vercel.json(배포)에서 헤더를 설정해
// 뒀을 때만 true가 된다. 격리가 안 된 환경(구형 브라우저, 헤더 미지원 배포지 등)에서는 이 값이
// false라 아래 engineBootList가 조용히 기존 단일 스레드 빌드로만 폴백한다.
function crossOriginIsolatedOK() {
  return typeof SharedArrayBuffer !== "undefined" && typeof window !== "undefined" && window.crossOriginIsolated === true;
}
// (v0.2.4) 분석 엔진의 스레드 수를 2로 고정한다 — 기기 코어 수에 비례해 늘리지 않는다.
function mainEngineThreads() { return 2; }
// 부팅 시도 목록 — 격리가 가능하면 멀티스레드 빌드(같은 출처만)를 맨 앞에 두고, 그 뒤로 기존
// 단일 스레드 빌드(로컬 → CDN)를 그대로 이어 붙여, 멀티스레드 부팅이 실패해도 기존 폴백 경로가
// 그대로 살아있게 한다.
function engineBootList(profileId, threads) {
  const profile = ENGINE_PROFILES[profileId] || ENGINE_PROFILES[defaultEnginePref()];
  // (v0.2.0 버그 수정) Stockfish 17.1(최고 성능) 프로필은 신경망이 조각(-part-N.wasm)째로 수십MB에
  // 달해, 다 받아 이어 붙이고 컴파일하는 데 기존 4초 부팅 타임아웃보다 오래 걸릴 수 있다 — 이
  // 타임아웃이 먼저 끝나 워커를 강제 종료하면 파일을 받던 중이라 "연결 실패"로 이어졌다. 신경망이
  // 조각나 있는 프로필(profile.parts)만 훨씬 넉넉한 타임아웃을 준다(가벼운 기존 두 엔진은 그대로 4초).
  // (v0.5.1 버그 수정, 사용자 제보) "Stockfish 18을 고르면 항상 연결 실패로 멈춘다" — Stockfish
  // 18(정식)의 신경망은 조각을 다 합치면 약 108MB로, 같은 조각 방식을 쓰는 17.1(약 80MB)보다도 크고
  // 게다가 앱과 같은 출처가 아닌 외부 CDN(Vercel Blob)에서 받는다(위 ENGINE_PROFILES.full18 주석
  // 참고) — 그런데도 그 17.1과 똑같이 45초 타임아웃을 나눠 쓰고 있었다. 45초 안에 108MB를 받으려면
  // 최소 초당 2.4MB(≈19Mbps) 이상 꾸준히 나와야 하는데, 특히 첫 요청이라 캐시도 없는 외부 CDN
  // 왕복까지 겹치면 흔한 가정용/모바일 환경에서도 이 기준을 못 채우는 경우가 많다 — 17.1의 옛
  // 버그(README v0.2.0)와 정확히 같은 종류로, 다 받기도 전에 타임아웃이 먼저 끝나 워커를 강제
  // 종료해 "연결 실패"로 보였다. profile에 개별 부팅 타임아웃을 지정할 수 있게 하고(bootTimeoutMs
  // 필드, 없으면 기존처럼 parts 여부로 45초/4초 결정), full18만 90초로 넉넉히 늘렸다.
  const bootTimeoutMs = profile.bootTimeoutMs != null ? profile.bootTimeoutMs : (profile.parts ? 45000 : 4000);
  const list = profile.urls.map((url) => ({ url, threads: 1, bootTimeoutMs }));
  if (profile.mtUrl && crossOriginIsolatedOK()) list.unshift({ url: profile.mtUrl, threads, bootTimeoutMs });
  return list;
}
const ENGINE_PREF_KEY = "occ_engine_pref";
// (v0.2.4) 기기 종류와 무관하게 항상 Stockfish 18 Lite를 기본값으로 쓴다.
export function defaultEnginePref() { return "lite"; }
export function loadEnginePref() {
  try { const v = window.localStorage.getItem(ENGINE_PREF_KEY); if (v && ANALYSIS_ENGINE_IDS.includes(v)) return v; } catch { }
  return defaultEnginePref();
}
export function saveEnginePref(v) { try { window.localStorage.setItem(ENGINE_PREF_KEY, v); } catch { } }
/* ============================================================ 라이브 Stockfish (Web Worker) ============================================================ */
export function useEngine(enginePref) {
  const ref = useRef(null);
  const [status, setStatus] = useState("loading");
  const queue = useRef([]);
  const running = useRef(false);
  const offRef = useRef(false);
  const swallowBest = useRef(0); // 강제 해제된 작업의 뒤늦은 bestmove를 무시할 개수
  const settle = (job, val) => { if (job.settled) return; job.settled = true; clearTimeout(job.watch); clearTimeout(job.hardWatch); clearTimeout(job.softTimer); job.resolve(val); };
  const resultOf = (job, bm) => job.multi ? Object.keys(job.lines).sort((a, b) => a - b).map((k) => job.lines[k]) : (job.last ? { ...job.last, best: bm || "" } : (bm ? { best: bm } : null));
  // (v0.2.4 성능) 같은 slot의 새 요청이 들어오면 이전 요청을 큐에서 즉시 치운다 — 아직 실행 전이면
  // 그냥 빼내고, 이미 엔진에 보낸(실행 중인) 요청이면 "stop"으로 즉시 중단시키고 그 뒤늦은 bestmove는
  // 무시한다(swallowBest, 워치독과 동일한 메커니즘). slot을 넘기지 않는 호출(예: 게임 리뷰 전체 분석처럼
  // 모든 포지션이 다 끝나야 하는 배치 작업)은 지금처럼 그대로 FIFO로 순서대로 처리된다 — 사용자가 이미
  // 관심을 끊은 포지션(빠르게 넘긴 이전 수)의 계산이 큐를 막아 다음 요청을 지연시키던 문제만 없앤다.
  const supersede = useCallback((slot) => {
    if (slot == null) return;
    const i = queue.current.findIndex((j) => j.slot === slot);
    if (i < 0) return;
    const job = queue.current[i];
    if (i === 0 && running.current) {
      settle(job, job.multi ? [] : null);
      try { ref.current && ref.current.postMessage("stop"); } catch (_) { }
      // (v0.2.6 버그 수정) 예전엔 여기서 곧장 큐에서 빼고 running을 false로 되돌려, 바로 이어지는
      // pump()가 다음 요청의 "position"/"go"를 같은 엔진 워커에 즉시 보냈다 — 그런데 방금 보낸 "stop"의
      // 실제 bestmove 응답은 아직 도착하기 전이라, 그 사이에 뒤늦게 도착하는 이전 탐색의 info 줄들이
      // handleLine에서 "지금 큐 맨 앞"(=이미 새로 들어온 다음 요청)의 결과 버퍼에 그대로 합쳐졌다 —
      // 전혀 다른 포지션의 PV가 새 요청의 MultiPV 줄에 섞여 들어가, 그 지점부터 SAN 변환이 실패하며
      // 엔진 라인이 중간에 멈춘 것처럼 영원히 끊겨 보이는 원인이었다(빠르게 다음 수를 두거나 다른
      // 포지션으로 넘길 때 특히 잘 재현됨). 이 자리를 곧장 비우지 않고 그대로 큐에 남겨 두면(호출자는
      // 위 settle로 이미 즉시 진행), 실제 bestmove가 와서 아래 handleLine의 bestmove 분기가 자연스럽게
      // shift·pump할 때까지는 다음 요청이 엔진에 보내지지 않는다 — 그동안 들어오는 뒤늦은 info 줄은
      // 여전히 이 이미 settle된 자리로만 흘러가(그 자리의 onLines/onProgress는 자신의 key 검사에서
      // 걸러 아무 일도 안 함), 다음 요청의 결과와 섞일 일이 없다. 혹시 bestmove가 끝내 안 오는
      // 예외적인 경우에도, 이 job이 pump() 때 이미 걸어 둔 watch/hardWatch 워치독이 그대로 안전망
      // 역할을 한다.
    } else {
      settle(job, job.multi ? [] : null);
      queue.current.splice(i, 1);
    }
  }, []);
  const pump = useCallback(() => {
    if (running.current) return;
    const job = queue.current[0]; if (!job) return;
    if (!ref.current) { if (offRef.current) { queue.current.shift(); settle(job, job.multi ? [] : null); pump(); } return; }
    running.current = true;
    job.cmds.forEach((c) => ref.current.postMessage(c));
    // (버그 수정) bootAnalysisWorker.pump()와 동일한 이유 — MultiPV 요청은 movetime을 "go"에 직접
    // 넣지 않고(아래 evaluateMulti), 요청한 순위(multipvTarget) 전부가 적어도 한 번씩 보고될
    // 때까지 여기서 기다렸다가 stop을 보낸다. 느린 기기에서 낮은 순위 줄이 movetime 안에 한 번도
    // 못 나온 채 엔진이 스스로 멈춰, 그 줄이 통째로 빠진 채 확정되던 문제(분석 탭 엔진 라인이 3개가
    // 아니라 2개만 뜨는 현상)를 없앤다.
    clearTimeout(job.softTimer);
    if (job.multi && job.mt) {
      const trySoftStop = () => {
        if (queue.current[0] !== job || job.settled) return;
        if (Object.keys(job.lines).length >= job.multipvTarget) { try { ref.current && ref.current.postMessage("stop"); } catch (_) { } }
        else job.softTimer = setTimeout(trySoftStop, 150);
      };
      job.softTimer = setTimeout(trySoftStop, job.mt);
    }
    // (버그 수정) 워치독 — 배치 분석 중 특정 포지션에서 엔진이 bestmove를 끝내 안 보내면 running이
    // true로 굳어 이후 모든 요청이 큐에서 멈춘다(그래프가 도중부터 일자·정확도 100). 제한 시간 안에
    // bestmove가 없으면 부분 결과로 마무리하고 'stop'을 보내 큐를 다시 흐르게 한다. stop 후에도 응답이
    // 없으면(워커 완전 정지) 큐를 강제로 흘려보내 분석 전체가 멈추지 않게 한다.
    clearTimeout(job.watch);
    job.watch = setTimeout(() => {
      if (queue.current[0] !== job || job.settled) return;
      settle(job, resultOf(job, ""));                  // 콜러(analyzeGame 등)는 부분 결과로 즉시 진행
      try { ref.current && ref.current.postMessage("stop"); } catch (_) { }
      job.hardWatch = setTimeout(() => {
        if (queue.current[0] !== job) return;
        queue.current.shift(); running.current = false; swallowBest.current++; pump();
      }, 1500);
    }, job.watchMs || 15000);
  }, []);
  useEffect(() => {
    let worker = null, killed = false, idx = 0;
    // (20차 기능2) 엔진 선택이 바뀌면 이 effect가 다시 돌면서 기존 워커를 정리하고 새로 붙는다 —
    // 이때 이전 워커를 가리키던 참조·상태를 반드시 초기화해야, 막 종료된 워커에 메시지를 보내
    // 응답이 영영 오지 않는 채로 남는 사고를 막는다.
    ref.current = null; offRef.current = false; running.current = false; setStatus("loading");
    const bootList = engineBootList(enginePref, mainEngineThreads());
    function handleLine(line) {
      const cb = queue.current[0]; if (!cb) return;
      const sc = line.match(/score (cp|mate) (-?\d+)/);
      if (line.startsWith("info") && cb.multi) {
        const mp = line.match(/multipv (\d+)/);
        // (v0.1.3 기능) 예전엔 " pv " 뒤 첫 수만 뽑았다(후보 수 목록에 어느 수를 보충할지만 필요했음) —
        // 분석 탭에 엔진 라인을 전체 수순으로 보여주려면 그 뒤에 이어지는 전체 PV(공백으로 이어진
        // UCI 수 목록)가 다 필요하다. "pv " 이후 줄 끝까지를 통째로 잘라 공백 기준으로 나눈다.
        const pvIdx = line.indexOf(" pv ");
        const pvList = pvIdx >= 0 ? line.slice(pvIdx + 4).trim().split(/\s+/) : null;
        const dm = line.match(/^info depth (\d+)/);
        if (mp && pvList && pvList.length && sc) {
          const entry = { uci: pvList[0], pv: pvList, depth: dm ? parseInt(dm[1], 10) : null, cp: sc[1] === "cp" ? parseInt(sc[2], 10) : null, mate: sc[1] === "mate" ? parseInt(sc[2], 10) : null };
          cb.lines[parseInt(mp[1], 10)] = entry;
          // (성능) MultiPV 탐색도 1순위 줄(가장 좋은 수)만큼은 단일PV 탐색과 똑같이 depth가 점점
          // 깊어지며 갱신된다 — 평가치 바처럼 "이 포지션 자체의 평가"가 필요한 곳은 굳이 별도의
          // 단일PV 탐색을 또 돌리지 않고 이 진행 상황을 그대로 재사용할 수 있다.
          if (cb.onProgress && parseInt(mp[1], 10) === 1) cb.onProgress(entry);
          // (v0.2.1) 엔진 라인을 최종 결과 한 번이 아니라 depth가 깊어질 때마다 실시간으로 흘려보낸다
          // (throttle ~90ms) — 평가치가 살아 움직이고 수순도 점점 길어져 "한꺼번에 팝업"되는 끊김이 사라진다.
          if (cb.onLines) { const now = Date.now(); if (!cb.lastLinesEmit || now - cb.lastLinesEmit >= 90) { cb.lastLinesEmit = now; cb.onLines(Object.keys(cb.lines).sort((a, b) => a - b).map((k) => cb.lines[k])); } }
        }
      } else if (sc && !cb.multi) {
        cb.last = sc[1] === "mate" ? { mate: parseInt(sc[2], 10) } : { cp: parseInt(sc[2], 10) };
        // (v0.5.9 BUG-038) 탁월 판정이 "상대가 실제로 기물을 따 가는지"를 엔진 수순으로 확인할 수 있게 단일 PV 평가도 수순을 함께 담는다.
        { const pvIdx = line.indexOf(" pv "); if (pvIdx >= 0) cb.last.pv = line.slice(pvIdx + 4).trim().split(/\s+/); }
        // (기능1) go depth N 한 번의 탐색 안에서도 스톡피시는 얕은 depth부터 점점 깊여 결과를 낸다.
        // 이 중간 info 라인을 그대로 콜백으로 흘려보내면 최종 depth를 기다리지 않고도
        // 점진적으로 갱신되는 평가치를 보여줄 수 있다(추가 탐색 없이 공짜로 얻는 진행 표시).
        if (cb.onProgress) { const dm = line.match(/^info depth (\d+)/); cb.onProgress({ ...cb.last, depth: dm ? parseInt(dm[1], 10) : null }); }
      }
      if (line.startsWith("bestmove")) {
        if (swallowBest.current > 0) { swallowBest.current--; return; } // 강제 해제된 작업의 뒤늦은 응답 무시
        const bm = (line.split(" ")[1] || "").trim(); const d = queue.current.shift(); running.current = false;
        if (d) settle(d, resultOf(d, bm));
        pump();
      }
    }
    function tryNext() {
      if (idx >= bootList.length) { console.warn("[engine] all boot candidates exhausted, profile:", enginePref); offRef.current = true; setStatus("off"); pump(); return; }
      const { url, threads, bootTimeoutMs } = bootList[idx++];
      try {
        let w;
        if (url.startsWith("/")) w = new Worker(url);
        else { const blob = new Blob(["importScripts('" + url + "');"], { type: "text/javascript" }); w = new Worker(URL.createObjectURL(blob)); }
        let booted = false;
        w.onmessage = (e) => { const line = typeof e.data === "string" ? e.data : ""; if (!booted && (line.includes("uciok") || line.includes("Stockfish"))) { booted = true; ref.current = w; setStatus("ready"); pump(); } handleLine(line); };
        // (v0.5.1 버그 수정) 부팅 실패 경로(여기·아래 타임아웃·바깥 catch) 전부가 지금까지 아무 로그도
        // 남기지 않고 조용히 다음 후보로 넘어갔다 — 그래서 "엔진이 연결 실패로 멈춘다"는 제보가 와도
        // 콘솔에서 원인(어떤 URL이, 왜 — 404/CORS 에러였는지 타임아웃이었는지)을 전혀 구분할 수 없었다.
        w.onerror = (e) => { console.warn("[engine] boot failed:", url, e && e.message); try { w.terminate(); } catch (_) {} if (!booted && !killed) tryNext(); };
        w.postMessage("uci");
        if (threads > 1) w.postMessage("setoption name Threads value " + threads);   // 멀티스레드 빌드에서만 의미 있음
        // (성능) 스톡피시 WASM 빌드의 기본 Hash(치환 테이블)는 보통 16MB로 아주 작다 — 같은 국면을
        // 반복해서 다시 계산하는 비중이 커져, movetime(700ms) 같은 짧은 시간 상한 안에서는 도달하는
        // depth 자체가 눈에 띄게 줄어든다. 64MB로 올리면 같은 700ms 안에서도 치환 테이블 적중률이
        // 높아져 실질적으로 더 깊이 탐색할 수 있다 — 이 엔진 인스턴스는 워커 1개뿐이라 메모리 부담도
        // 작다(태블릿·저사양 기기에서도 64MB는 안전한 수준).
        w.postMessage("setoption name Hash value 64");
        w.postMessage("isready"); worker = w;
        setTimeout(() => { if (!booted && !killed) { console.warn("[engine] boot timeout(" + (bootTimeoutMs || 4000) + "ms):", url); try { w.terminate(); } catch (_) {} tryNext(); } }, bootTimeoutMs || 4000);
      } catch (e) { console.warn("[engine] boot threw:", url, e); tryNext(); }
    }
    tryNext();
    return () => {
      killed = true;
      try { worker && worker.terminate(); } catch (_) { }
      // 엔진 전환 중 대기 중이던 요청이 있다면 영영 응답이 안 오므로 빈 결과로 정리해 콜러가 멈추지 않게 한다.
      while (queue.current.length) { const j = queue.current.shift(); settle(j, j.multi ? [] : null); }
      running.current = false; swallowBest.current = 0;
    };
  }, [pump, enginePref]);
  // (분석 최적화) movetime(ms)을 주면 `go depth N movetime M`으로 보내 depth·시간 중 먼저 도달하는 쪽에서 멈춘다.
  // 쉬운 포지션은 목표 depth까지 깊게, 복잡한 포지션은 movetime 상한에서 끊어 전체 분석 시간을 예측 가능하게 만든다.
  // watchMs: 이 요청의 워치독 제한. movetime을 준 배치 분석은 짧게(+버퍼), movetime 없는 실시간
  // 평가는 depth까지 오래 걸릴 수 있으므로 넉넉히 둔다.
  const evaluate = useCallback((fen, depth = 14, onProgress, movetime, slot) => new Promise((resolve) => {
    supersede(slot);
    const go = "go depth " + depth + (movetime ? " movetime " + movetime : "");
    queue.current.push({ resolve, last: null, onProgress, slot, watchMs: movetime ? movetime + 4000 : 15000, cmds: ["setoption name MultiPV value 1", "position fen " + fen, go] }); pump();
  }), [pump, supersede]);
  const evaluateMulti = useCallback((fen, depth = 12, multipv = 5, movetime, onProgress, onLines, slot) => new Promise((resolve) => {
    supersede(slot);
    // (버그 수정) movetime을 "go"에 직접 넣지 않는다 — pump()의 soft-stop 타이머가 multipv개 순위가
    // 전부 보고될 때까지 기다렸다가 stop을 보낸다.
    const go = "go depth " + depth;
    queue.current.push({ resolve, multi: true, lines: {}, onProgress, onLines, mt: movetime, multipvTarget: multipv, slot, watchMs: movetime ? movetime + 4000 : 15000, cmds: ["setoption name MultiPV value " + multipv, "position fen " + fen, go] }); pump();
  }), [pump, supersede]);
  // (성능) 게임 리뷰의 병렬 워커 풀(analyzeGame/bootAnalysisWorker)이 지금 선택된 엔진과 같은
  // 프로필(같은 실행 파일·신경망)로 워커를 추가로 띄울 수 있도록 profile 식별자와 부팅 URL을 함께 내보낸다.
  const urls = (ENGINE_PROFILES[enginePref] || ENGINE_PROFILES[defaultEnginePref()]).urls;
  return { status, evaluate, evaluateMulti, profile: enginePref, urls };
}
export async function saveContent() {
  const v = CONTENT;
  if (SB_ON) { try { await sbUpsert("app_content", { key: "global", value: v }); } catch { } }
  try { window.localStorage.setItem("occ_content", JSON.stringify(v)); } catch { }
  if (!SB_ON) { try { if (typeof window !== "undefined" && window.storage) await window.storage.set("occ_content", JSON.stringify(v), true); } catch { } }
}
export const CC_LIVE = { live: true };
// (v0.2.9 디자인 → v0.3.3 폰트 교체) 퀘스트 클리어·티어 승급 같은 "게임 보상 화면" 팝업의 큰
// 제목에만 적용하는 디스플레이 폰트 — 문단 본문에 쓰기엔 너무 두꺼워 가독성이 떨어진다.
// (사용자 요청) 알림 창·팝업에 등장하는 한글 Title 텍스트는 Google Fonts의 Bagel Fat One으로.
const GAME_FONT = "'Bagel Fat One', 'Noto Sans KR', cursive";
let mascotPreloaded = false;
export function preloadMascotArt() {
  if (mascotPreloaded || typeof window === "undefined") return;
  mascotPreloaded = true;
  Object.values(MASCOT_ART).forEach((src) => { const im = new Image(); im.decoding = "async"; im.src = src; });
}
const josaIGa = (w) => w + (hasBatchim(w) ? "이" : "가");
export function useOpeningTreeAuto(priorityRef, contentVer) {
  const [version, setVersion] = useState(0);
  const mapRef = useRef(new Map());
  useEffect(() => {
    let cancelled = false;
    mapRef.current = new Map();
    // (성능) 응답이 캐시에서 오거나 실패로 즉시 끝나면 setVersion이 노드 수만큼(최대 4000번) 연달아
    // 불려, 그때마다 모식도 전체(items/edges)를 처음부터 다시 계산·렌더링해 트리가 무겁게 그려졌다 —
    // 짧은 시간 안에 몰린 갱신은 한 번으로 모아, 실제 리렌더 횟수를 데이터가 들어오는 속도가 아니라
    // 화면이 그릴 수 있는 속도에 맞춘다.
    // (버그 수정) 나침반 트리는 방향별 좌표를 캐싱해 이미 자리 잡은 블록은 그대로 두므로(자세한
    // 이유는 OpeningSchematic의 posCacheRef 주석 참고), 너무 잦게(80ms) 다시 그리면 블록이 계속
    // 움찔거려 깜빡이는 느낌이 들었다 — 간격을 넉넉히 늘려 눈에 띄게 덜 자주, 대신 한 번에 여러
    // 개씩 모아 반영되게 한다(위치 변화 자체는 CSS 트랜지션으로 부드럽게 이어짐).
    let bumpTimer = null;
    const bumpVersion = () => {
      if (bumpTimer) return;
      bumpTimer = setTimeout(() => { bumpTimer = null; setVersion((v) => v + 1); }, 220);
    };
    setVersion((v) => v + 1);
    // (버그 수정) 이론 수는 깊이 제한 없이 계속 펼치게 되면서 노드 수가 예전보다 늘 수 있어, 이론
    // 트리가 잘리지 않도록 상한을 여유 있게 올린다(이론 자체는 개발자가 큐레이션한 유한한 집합).
    // (v0.3.2 성능) 트리가 깊어지는 속도(구조 확장)는 더 이상 채택률 조회(리체스 fetch, 아래
    // enqueueFetch 참고)를 기다리지 않으므로, 동시에 펼칠 수 있는 노드 수(MAX_CONCURRENT)를
    // 늘려도 리체스 쪽에는 부담이 안 간다.
    const MAX_CONCURRENT = 12, MAX_NODES = 4000;
    let active = 0, started = 0;
    const queue = [{ path: [], depth: 0 }];
    // (v0.3.2 성능) 채택률(리체스 익스플로러) 조회는 트리 구조 확장과 분리된 별도의 동시성 한도로
    // 처리한다 — API에 한꺼번에 너무 많은 요청을 보내지 않으면서도, 구조 확장 자체는 네트워크
    // 응답을 전혀 기다리지 않고 계속 진행된다.
    const MAX_FETCH_CONCURRENT = 8;
    let fetchActive = 0;
    const fetchQueue = [];
    // (v0.5.6 성능) 우선순위(선택한 오프닝 먼저)는 이제 네트워크를 타는 채택률 조회에만 의미가 있다 — 구조는 아래 run이 로컬
    // 스냅샷으로 즉시 만들어 순서가 결과에 영향을 주지 않는다. 예전엔 구조 큐에서 매번 큐 전체를 훑어(노드마다 화면 거리 계산 포함)
    // 다음 노드를 골라 O(노드 수²)로 앱 시작을 늦췄다 — 구조 큐는 순서대로(FIFO), 조회 큐만 선택 갈래를 앞당긴다.
    let idleWaiting = false;
    const runFetchQueue = () => {
      // 분석 탭 같은 앞쪽 조회가 진행 중이면 새 백그라운드 조회는 그 조회가 끝난 뒤(+짧은 여유)에 시작한다.
      if (fetchQueue.length && lichessForegroundBusy()) {
        if (!idleWaiting) { idleWaiting = true; whenLichessIdle().then(() => setTimeout(() => { idleWaiting = false; if (!cancelled) runFetchQueue(); }, 250)); }
        return;
      }
      while (fetchActive < MAX_FETCH_CONCURRENT && fetchQueue.length) {
        const sel = priorityRef && priorityRef.current ? priorityRef.current.selectedKey : null;
        let idx = 0;
        if (sel) { const i = fetchQueue.findIndex((j) => j.key === sel || j.key.startsWith(sel + " ")); if (i > 0) idx = i; }
        const job = fetchQueue.splice(idx, 1)[0];
        fetchActive++;
        job.run().finally(() => { fetchActive--; runFetchQueue(); });
      }
    };
    const enqueueFetch = (key, run) => { fetchQueue.push({ key, run }); runFetchQueue(); };
    const runNext = () => {
      if (cancelled) return;
      while (active < MAX_CONCURRENT && queue.length && started < MAX_NODES) {
        const job = queue.shift();
        started++; active++;
        run(job).finally(() => { active--; runNext(); });
      }
    };
    // (v0.3.2 성능) 이론(book) 여부는 SNAP 스냅샷·CONTENT만으로 네트워크 없이 즉시 판정할 수
    // 있다 — 예전엔 채택률을 주는 리체스 fetch가 끝나야만(await) 자식을 큐에 넣었는데, 정작 그
    // 결과(adopt/games/wdl)는 다음 자식을 펼칠지 말지에는 전혀 쓰이지 않는 부가 정보였다. 이제
    // rawMoves를 받는 즉시(네트워크 왕복 전에) 자식을 큐에 넣고 다음 노드로 넘어가며, 채택률
    // 병합은 별도의 동시성 한도(enqueueFetch)로 백그라운드에서 진행해 트리 구조가 훨씬 빨리
    // 깊어진다 — 화면엔 먼저 수 이름만 뜨고, 채택률·전적은 뒤이어 채워진다.
    function run({ path, depth }) {
      const key = path.join(" ");
      const node = snapNode(path);
      const rawMoves = mergeDevAdds(key, node ? node.moves : (path.length === 0 && SNAP.tree[""] ? SNAP.tree[""].moves : []));
      if (!rawMoves.length) { mapRef.current.set(key, []); if (!cancelled) bumpVersion(); return Promise.resolve(); }
      mapRef.current.set(key, rawMoves.map((m) => ({ ...m, adopt: 0, games: 0, wdl: null })));
      bumpVersion();
      // (v0.3.2 개편) 도감 오프닝 트리는 이제 이론 수(book)만 보여준다 — 채택률이 높다는 이유만으로
      // 딸려 오던 비이론 수는 더 이상 트리에 펼치지 않는다(이론 수는 개발자가 큐레이션한 유한한
      // 집합이라 전부 펼쳐도 안전하다).
      for (const m of rawMoves) { if (isBookMoveAt(key, m.san)) queue.push({ path: [...path, m.san], depth: depth + 1 }); }
      enqueueFetch(key, async () => {
        let lcMoves = [];
        try { const lc = await fetchLichess(path); lcMoves = (lc && lc.moves) || []; } catch { }
        if (cancelled) return;
        const merged = rawMoves.map((m) => {
          const hit = lcMoves.find((x) => x.san === m.san);
          return { ...m, adopt: hit ? hit.adopt : 0, games: hit ? hit.games : 0, wdl: hit ? hit.wdl : null, name: m.name || (hit && hit.name) || null };
        });
        mapRef.current.set(key, merged);
        bumpVersion();
      });
      return Promise.resolve();
    }
    runNext();
    return () => { cancelled = true; if (bumpTimer) clearTimeout(bumpTimer); };
  // (v0.5.6 버그 수정 BUG-015) 개발자 콘텐츠(서버)가 앱 시작 뒤에 도착하거나 개발자가 수를 추가하면(contentVer) 다시 펼친다 — 예전엔
  // 앱 시작 때 한 번만 돌아, 그 뒤 추가된 이론 수는 채택률 조회·하위 수 펼치기에서 빠졌다.
  }, [contentVer]); // eslint-disable-line react-hooks/exhaustive-deps
  return { data: mapRef.current, version };
} // 6자리
// (UX6) 전역 풀이수: Supabase RPC 'puzzle_solve'(증가, 새 카운트 반환) / 테이블 'puzzle_stats' 조회. 미설정·미생성 시 무해하게 비활성.
export async function puzzleSolveInc(no) { if (!SB_ON) return null; try { const r = await sbRpc("puzzle_solve", { p_no: no }); return typeof r === "number" ? r : (r && r.solves) || null; } catch { return null; } }
export async function puzzleSolveCounts() { if (!SB_ON) return {}; try { const rows = await sbSelect("puzzles?select=no,solves"); const m = {}; (rows || []).forEach((x) => { m[x.no] = x.solves; }); return m; } catch { return {}; } }
// (사용자 요청) 퍼즐 탭 필터(생성자) — 번호별 생성자 아이디를 한 번에 가져온다. solves/likes와 같은
// 패턴으로 no,creator_username 두 컬럼만 읽어 가볍다.
export async function puzzleCreatorUsernames() { if (!SB_ON) return {}; try { const rows = await sbSelect("puzzles?select=no,creator_username"); const m = {}; (rows || []).forEach((x) => { if (x.creator_username) m[x.no] = x.creator_username; }); return m; } catch { return {}; } }
// (기능) 퍼즐 좋아요 — 풀이수(solves)와 달리 취소 가능해야 하므로 RPC 'puzzle_like_toggle'이 현재
// 상태를 보고 등록/취소를 알아서 판단해, 그 결과(liked·likes)를 한 번에 돌려준다. 테이블/RPC
// 미생성 시 무해하게 비활성(하트를 눌러도 아무 반응 없음).
export async function puzzleLikeToggle(no, uid) {
  if (!SB_ON || !uid) return null;
  try { const r = await sbRpc("puzzle_like_toggle", { p_no: no, p_uid: uid }); const row = Array.isArray(r) ? r[0] : r; return row ? { liked: !!row.liked, likes: row.likes || 0 } : null; }
  catch { return null; }
}
export async function puzzleLikeCounts() { if (!SB_ON) return {}; try { const rows = await sbSelect("puzzles?select=no,likes"); const m = {}; (rows || []).forEach((x) => { m[x.no] = x.likes; }); return m; } catch { return {}; } }
// (v0.1.0) 퍼즐 리포스트 — 좋아요와 동일한 토글 패턴(puzzle_repost_toggle RPC가 등록/취소를 알아서 판단).
export async function puzzleRepostToggle(no, uid) {
  if (!SB_ON || !uid) return null;
  try { const r = await sbRpc("puzzle_repost_toggle", { p_no: no, p_uid: uid }); const row = Array.isArray(r) ? r[0] : r; return row ? { reposted: !!row.reposted, reposts: row.reposts || 0 } : null; }
  catch { return null; }
}
export async function puzzleRepostCounts() { if (!SB_ON) return {}; try { const rows = await sbSelect("puzzles?select=no,reposts"); const m = {}; (rows || []).forEach((x) => { m[x.no] = x.reposts; }); return m; } catch { return {}; } }
export async function puzzleShareCounts() { if (!SB_ON) return {}; try { const rows = await sbSelect("puzzles?select=no,shares"); const m = {}; (rows || []).forEach((x) => { m[x.no] = x.shares; }); return m; } catch { return {}; } }
// (사용자 요청) 퍼즐 탭 "인기순" 정렬용 — 좋아요/리포스트/공유를 사람 단위로 결합한 인기 점수
// (puzzle_popularity_all RPC, 위 7-1번 섹션 근처 참고)를 전체 퍼즐에 대해 한 번에 받아 온다.
export async function puzzlePopularityScores() {
  if (!SB_ON) return {};
  try {
    const rows = await sbRpc("puzzle_popularity_all", {});
    const m = {}; (Array.isArray(rows) ? rows : []).forEach((x) => { m[x.no] = Number(x.score) || 0; });
    return m;
  } catch { return {}; }
}
// (v0.1.0) 친구가 내가 공유한 퍼즐을 풀어 얻은 XP의 10%를 나에게 돌려준다 — p_share_msg_id로 그 공유
// 메시지가 실제로 나(호출자)에게 온 것인지 서버가 검증하므로, 임의 메시지 id로 위조 보상을 요청할 수
// 없다. RPC는 보상 금액 자체를 내 XP에 더하지 않고 공유자에게 갈 chat_messages 시스템 메시지만 남긴다
// (XP는 각자 자기 클라이언트만 갱신 가능 — checkUnreadChat이 이 메시지를 realtime으로 받아 적용한다).
export async function puzzleShareReward(shareMsgId, amount) {
  if (!SB_ON || shareMsgId == null) return false;
  try { return !!(await sbRpc("puzzle_share_reward", { p_share_msg_id: shareMsgId, p_amount: amount })); } catch { return false; }
}
// (16차) "이 퍼즐을 푼 친구" 표기용 — 퍼즐 번호별 해결자 uid 기록. 테이블 puzzle_solvers(no, uid) PK(no,uid) 필요.
// 테이블이 없거나 Supabase 미설정이면 무해하게 비활성(전체 풀이수만 표시).
export async function puzzleSolverAdd(no, uid) { if (!SB_ON || !uid) return; try { await sbUpsert("puzzle_solvers", { no, uid }); } catch { } }
export async function puzzleSolversBatch(nos) {
  if (!SB_ON || !nos || !nos.length) return {};
  try {
    const rows = await sbSelect("puzzle_solvers?no=in.(" + nos.join(",") + ")&select=no,uid");
    const m = {};
    (rows || []).forEach((r) => { (m[r.no] = m[r.no] || []).push(r.uid); });
    return m;
  } catch { return {}; }
}
// (16차) 퍼즐 추천 랭킹 — 매 해결(중복 풀이 포함)마다 이벤트 한 줄을 기록하고, 기간별(day/week/month) 집계는
// RPC 'puzzle_rank'로 서버에서 수행한다. 테이블/RPC 미생성 시 무해하게 비활성(추천 목록이 그냥 비어있음).
export async function puzzleSolveEventAdd(no, uid) { if (!SB_ON) return; try { await sbInsert("puzzle_solve_events", { no, uid: uid || null }); } catch { } }
export function isSameLocalDay(unixSeconds, dateStr) { if (!unixSeconds) return false; return todayStr(new Date(unixSeconds * 1000)) === dateStr; }
// (v0.4.0 버그 수정) 오프닝 퀘스트는 그 오프닝을 정의하는 수순의 마지막 수를 둔 진영(questOpeningSide)
// 으로 플레이해야 클리어로 인정돼야 하는데, 기존엔 오프닝 이름만 같으면(내가 백/흑 어느 쪽으로 뒀는지와
// 무관하게) 클리어로 쳐줬다 — 예를 들어 "슬라브 디펜스"(흑 오프닝)를 백으로 둬도(=상대가 슬라브를
// 받아준 것뿐인데) 클리어됐다. 진영까지 맞아야 클리어로 본다. questOpeningSide가 "백"/"흑" 대신
// null을 돌려주는 경우(수순을 못 구한 경우)는 예전처럼 오프닝 이름만으로 판정한다.
function questOpeningColor(name) {
  const side = questOpeningSide(name);
  return side === "백" ? "w" : side === "흑" ? "b" : null;
}
export function questOpeningCleared(q, games) {
  const col = questOpeningColor(q.opening);
  return games.some((g) => openingNameOf(g.moves) === q.opening && (!col || g.color === col));
}
// (v0.2.9 기능) 일일 퀘스트 클리어 팝업(DailyQuestClearedModal)에서 "이 퀘스트를 실제로 클리어한
// 대국"을 보여주기 위해, 오늘의 판정 effect(dailyQuest.done 갱신 로직)와 정확히 같은 기준으로 오늘
// chess.com 대국 중 그 퀘스트 조건에 맞는 것만 골라낸다 — play5/win3는 특정 한 판이 아니라 오늘의
// 활동 전체가 조건이므로, 오늘 대국 전부(win3는 그중 승리한 것만)를 후보로 돌려주고 호출부에서 최근
// 순으로 필요한 만큼만 보여준다.
function questMatchingGames(q, chesscom) {
  if (!q || !chesscom || !chesscom.games || !chesscom.games.length) return [];
  const t = todayStr();
  const todays = chesscom.games.filter((g) => isSameLocalDay(g.endTime, t));
  if (q.type === "opening") { const col = questOpeningColor(q.opening); return todays.filter((g) => openingNameOf(g.moves) === q.opening && (!col || g.color === col)); }
  if (q.type === "win3") return todays.filter((g) => g.result === "win");
  if (q.type === "play5") return todays;
  return [];
}
// (v0.2.9 기능) 5개 퀘스트 슬롯 키("puzzle"/"dailypuzzle"/"cc_0"~"cc_2")를 사람이 읽는 라벨로 — 클리어
// 팝업(DailyQuestClearedModal)의 체크리스트와, 개별 퀘스트 하나를 클리어했을 때 뜨는 토스트가 똑같은
// 라벨 로직을 공유해야 두 화면에서 같은 퀘스트를 다른 이름으로 부르는 일이 없다.
export function questSlotLabel(key, dq) {
  if (key === "puzzle") return t("새 퍼즐 {0}회 풀기", (dq && dq.puzzleTarget) || 2);
  if (key === "dailypuzzle") return t("일일 퍼즐 풀기");
  if (key.indexOf("cc_") === 0) {
    const i = parseInt(key.slice(3), 10);
    const q = dq && dq.quests && dq.quests[i];
    return q ? questLabel(q) : t("chess.com 활동 퀘스트");
  }
  return "";
}
// (기능2→18차 보충 UX2) 오늘의 퀘스트 생성 — 퍼즐 2회 풀기(고정) + 활동 퀘스트 3개(오프닝 플레이 / 5회 플레이 / 3회 승리).
// recentOpenings에는 5수 이상 진행한 하위 오프닝 이름도 들어오므로(집중분석/퍼즐 경로) 그대로 후보가 된다.
export function genDailyQuest(recentOpenings, dateStr) {
  const rnd = seedRand(dateStr);
  const openings = [...new Set([...(recentOpenings || []), ...DEFAULT_QUEST_OPENINGS])].filter(Boolean);
  const shuffledOpenings = openings.map((v) => [v, rnd()]).sort((a, b) => a[1] - b[1]).map(([v]) => v);
  // 특수(오프닝 무관) 퀘스트 0~2개를 결정적으로 섞고, 나머지 슬롯은 오프닝 플레이로 채운다.
  const specials = [{ type: "play5" }, { type: "win3" }].map((v) => [v, rnd()]).sort((a, b) => a[1] - b[1]).map(([v]) => v);
  const nSpecial = Math.floor(rnd() * 3); // 0,1,2
  const chosenSpecials = specials.slice(0, nSpecial);
  const nOpening = 3 - chosenSpecials.length;
  const openingQuests = shuffledOpenings.slice(0, nOpening).map((o) => ({ type: "opening", opening: o }));
  while (openingQuests.length < nOpening) openingQuests.push({ type: "opening", opening: DEFAULT_QUEST_OPENINGS[openingQuests.length % DEFAULT_QUEST_OPENINGS.length] });
  const quests = [...chosenSpecials, ...openingQuests].map((v) => [v, rnd()]).sort((a, b) => a[1] - b[1]).map(([v]) => v);
  // seen: 완료 애니메이션용 확인 플래그. done: 슬롯별 완료 여부(인덱스 기반). resetUsed/banned: 오프닝 퀘스트 1회 리롤.
  // (v0.2.9) clearAnnounced: 전체 클리어 축하 팝업(DailyQuestClearedModal)을 이미 띄웠는지 — bonusClaimed와
  // 분리해 둬야, 접속하지 않은 사이(예: chess.com 연동만으로) 이미 클리어됐지만 아직 못 본 경우도 다음 접속 시 띄울 수 있다.
  return { date: dateStr, quests, puzzleTarget: 2, puzzleCount: 0, done: {}, claimed: {}, bonusClaimed: false, clearAnnounced: false, seen: {}, rerolled: {}, banned: [], v: 2 };
}
// (v0.1.2 버그 수정) "오프닝로 chess.com에서 1국 플레이"처럼 오프닝 이름이 비어 questLabel의
// 기본값("오프닝")으로 대체 표시되던 문제 — 18차 이전의 구버전 스키마(quests 대신 featured: 문자열
// 배열)로 저장된 사용자 데이터는 이미 !dailyQuest.quests로 걸러 재생성됐지만, quests 배열 자체는
// 있으면서 그 안의 opening 타입 항목에 opening 값이 비어 있는(또는 문자열이 아닌) 손상된 저장값은
// 걸러내지 못해 그대로 화면에 남아 있었다. 매 로드 시 이 유효성도 함께 검사해, 하나라도 깨져 있으면
// 그날 퀘스트 전체를 다시 생성한다(사용자별로 한 번만 자동 복구되고, claimed 등은 오늘 다시 시작).
export function dailyQuestQuestsValid(quests) {
  return Array.isArray(quests) && quests.length > 0 && quests.every((q) => q && (q.type === "play5" || q.type === "win3" || (q.type === "opening" && typeof q.opening === "string" && q.opening.trim().length > 0)));
}
// (v0.2.7) 계산이 끝나기 전에는 null을 반환한다(예전엔 즉시 보여줄 큐레이션 폴백이 있었으나 제거됨
// — 호출부는 dailyPuzzle && ... 형태로 이미 null을 안전하게 다루고 있었다).
export function useDailyPuzzle(engine, dateStr) {
  const t = dateStr || todayStr();
  const [resolved, setResolved] = useState(null); // {date, puzzle}
  useEffect(() => {
    let cancelled = false;
    // (v0.5.0 변경) 대부분의 경로(커뮤니티 선정)는 엔진이 필요 없어져, 엔진 준비를 기다리지 않고
    // 곧바로 시도한다 — 드문 개발자 오버라이드 경로만 엔진이 필요한데, resolveDailyPuzzleCached가
    // 그 경우엔 캐시를 확정하지 않으므로 엔진이 나중에 준비되면(의존성 배열의 engine.status 변화로)
    // 이 effect가 다시 실행되어 자연히 재시도된다.
    resolveDailyPuzzleCached(t, engine).then((pz) => { if (!cancelled) setResolved({ date: t, puzzle: pz }); });
    return () => { cancelled = true; };
  }, [t, engine && engine.status]);
  return (resolved && resolved.date === t) ? resolved.puzzle : null;
}
export const ALL_TITLE_IDS = TITLE_OPENINGS.flatMap((f) => TITLE_TIERS.map((t) => titleId(f.key, t.rank)));
function titleLabel(id) { const [k, r] = id.split(":"); const fam = TITLE_OPENINGS.find((f) => f.key === k); const t = TITLE_TIERS.find((x) => x.rank === r); return fam && t ? fam.label + " " + t.suffix : ""; }
function puzzleFamilyKey(p) {
  if (!p) return null;
  const names = []; const path = [...(p.setupSans || []), ...(p.mistakeSan ? [p.mistakeSan] : [])];
  for (let i = 1; i <= path.length; i++) { const nd = snapNode(path.slice(0, i)); if (nd && nd.opening && nd.opening.name) names.push(nd.opening.name); }
  if (p.opening) names.push(p.opening);
  for (const fam of TITLE_OPENINGS) { if (names.some((n) => fam.rx.test(n))) return fam.key; }
  return null;
}
export function familyCounts(puzzles, solved) {
  const c = {}; for (const p of puzzles) { if (!solved.has(p.id)) continue; const k = puzzleFamilyKey(p); if (k) c[k] = (c[k] || 0) + 1; } return c;
}
// (19차 기능6) chess.com 게임의 오프닝 이름을 6개 칭호 오프닝 패밀리로 분류해 플레이 횟수를 집계.
// (v0.4.0 버그 수정) g.opening은 chess.com이 자체적으로 붙인 ECO URL 기반 이름(ecoOpeningName)이라
// 우리 오프닝 트리(openingNameOf — 가장 많이 둔 오프닝·오프닝별 승률·일일 퀘스트가 모두 쓰는 기준)와
// 명명 방식이 달라(세분화 깊이·표기가 서로 다름) 같은 대국인데도 여기서만 다른(또는 아예 못 찾는)
// 오프닝으로 집계됐다 — chess.com이 ECO를 못 준 대국(예: 분석 전 오래된 대국)은 아예 집계에서
// 빠지기도 했다. 사이트 전체와 같은 기준(openingNameOf)으로 통일한다.
export function ccFamilyCounts(games) {
  const c = {}; if (!games) return c;
  for (const g of games) { const nm = openingNameOf(g.moves); if (!nm) continue; for (const fam of TITLE_OPENINGS) { if (fam.rx.test(nm)) { c[fam.key] = (c[fam.key] || 0) + 1; break; } } }
  return c;
}
// (19차 기능6) 칭호 획득 = 퍼즐 해결 수(counts) ‘그리고’ chess.com 오프닝 플레이 수(ccCounts)를 모두 만족.
export function achievableTitles(counts, ccCounts) {
  const out = new Set(); const cc = ccCounts || {};
  for (const fam of TITLE_OPENINGS) { const n = counts[fam.key] || 0; const m = cc[fam.key] || 0; for (const t of TITLE_TIERS) if (n >= t.min && m >= t.ccMin) out.add(titleId(fam.key, t.rank)); }
  return out;
}
// (기능1) 별 3개(라인) 아이콘 — 해결한 라인 수만큼 채워서 표시
// (v0.0.6 개편) 헤더에 상시 표기되는 티어 배지 — 현재 티어와 다음 티어까지 남은 경험치를 진행바 +
// 텍스트로 보여준다. 눌러서 여정 지도(TierJourneyMap)를 연다.
// 진행바는 폭이 바뀔 때마다 눈에 띄게 차오르도록 긴 이징 트랜지션을 건다("+N XP" 자체는 화면 중앙 토스트로 별도 표시).
// (18차 UI8) 티어 텍스트(좌)와 게이지(우)를 가로로 나란히 배치 — 헤더에서 아이디 왼쪽에 표시된다.
// (v0.1.1) "아이언 V" 같은 이름+구간 텍스트를 없애고, 그 구간 전용 이미지(로마 숫자가 이미지
// 안에 이미 그려져 있음) 하나로 티어와 구간을 함께 나타낸다.
// (v0.1.1) 로고 이미지를 훨씬 크게 키우고, 로고 주위를 감싸던 원형 테두리는 없앴다 — 서로 다른
// 티어 이미지는 원본 캔버스 크기가 제각각이라(TIER_IMG_NATIVE_H 주석 참고), 하단(로고 밑)을
// 기준으로 맞춰야(items-end) 이미지 안에 그려진 로마 숫자끼리 높이가 나란히 맞는다.
export function TierBadge({ totalXp, compact, onClick }) {
  const info = useMemo(() => tierFromXp(totalXp), [totalXp]);
  const { tier, division } = info;
  // (v0.1.3 UI) 헤더 티어 배지에서 진행바·XP 텍스트를 없애고 로고만 남긴다 — 자세한 진행도는
  // 눌러서 여는 여정 지도에서 이미 볼 수 있어 헤더는 배지만으로 충분히 간결하게 유지한다.
  // (버그 수정) 바로 옆 검색 버튼과 너무 붙어 있어 눌러야 할 두 버튼이 시각적으로 뭉쳐 보였다 —
  // 오른쪽에 여백을 더 주고, 로고 자체도 살짝 키워 헤더에서 더 잘 보이게 한다.
  return (
    <div onClick={onClick} className="press flex flex-col items-center" style={{ flexShrink: 0, position: "relative", cursor: onClick ? "pointer" : "default", marginRight: compact ? 10 : 18 }}>
      <TierLogoDisc tierKey={tier.key} division={division} size={compact ? 38 : 47} discSize={compact ? 40 : 49} />
    </div>
  );
}
export function findOpeningPathByName(name) {   // (UX2) 이름이 같은 첫(최단) 이론 수 경로 탐색
  let queue = [[]]; const seen = new Set([""]); let steps = 0;
  while (queue.length && steps < 8000) {
    const path = queue.shift(); steps++;
    const nd = snapNode(path);
    if (path.length && nd && nd.opening && nd.opening.name === name) return path;
    if (nd && nd.moves) for (const mv of nd.moves) { const np = [...path, mv.san]; const k = np.join(" "); if (!seen.has(k) && np.length <= 12) { seen.add(k); queue.push(np); } }
  }
  return null;
}
// (v0.2.0 버그 수정) 예전엔 "다시 보지 않기" 체크박스를 직접 체크해야만 이 버전을 확정 처리했다 —
// 체크 없이 닫으면(바깥 클릭·X 버튼) dismissedAnnounceVersion이 그대로라 다음 접속 때 완전히 같은
// 공지가 또 떴다. "버전 단위 업데이트 이후 최초 접속 시에만 팝업으로 뜨게" 하려면 닫는 방법과
// 무관하게 항상 이 버전을 "봤음"으로 확정해야 한다 — 같은 내용은 설정 탭의 "개발자 기록"에 항상
// 그대로 남아 있으니(DeveloperLogCard) 다시 보고 싶으면 언제든 거기서 볼 수 있어, 체크박스 자체를
// 없애도 정보가 사라지지 않는다.
export function AnnouncementModal({ onClose }) {
  const latest = CHANGELOG[0];
  return (
    <div onClick={onClose} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.6)", zIndex: 96, display: "flex", alignItems: "flex-start", justifyContent: "center", padding: "40px 16px", overflowY: "auto" }}>
      <div onClick={(e) => e.stopPropagation()} style={{ position: "relative", width: "100%", maxWidth: 440, background: T.paper, borderRadius: 16, border: "1px solid #DCCBA8", padding: 18, boxShadow: "0 20px 50px -10px rgba(0,0,0,.6)" }}>
        <button onClick={onClose} aria-label={t("닫기")} className="press" style={{ position: "absolute", top: 12, right: 12, zIndex: 10, width: 28, height: 28, borderRadius: 8, border: "none", background: "#0002", color: T.ink, cursor: "pointer" }}>✕</button>
        <div className="flex items-center gap-2" style={{ marginBottom: 4, paddingRight: 32 }}>
          <Sparkles size={17} style={{ color: T.brass, flexShrink: 0 }} />
          <span style={{ fontSize: 16, fontWeight: 800, color: T.ink }}>{t("업데이트 소식")}</span>
        </div>
        <p style={{ fontSize: 12, color: T.inkSoft, margin: "0 0 8px" }}>{tx("최신 버전 {0}({1}) 변경 사항", <b style={{ color: T.ink, fontFamily: SITE_FONT }}>v{latest.version}</b>, latest.date)}</p>
        {/* (v0.1.2 기능) 소개 페이지(/about)의 버전 기록 파트로 이동 — 2페이지가 최신 버전(카테고리별로
            나뉜 더 자세한 설명)이라 ?page=2로 곧장 연다. */}
        <a href="/about?page=2" target="_blank" rel="noopener noreferrer" className="press flex items-center gap-1" style={{ marginBottom: 12, fontSize: 11.5, fontWeight: 800, color: T.brass, textDecoration: "none", width: "fit-content" }}>{tx("전체 업데이트 내역 {0}", <ChevronRight size={13} />)}
        </a>
        <div style={{ maxHeight: 360, overflowY: "auto", paddingRight: 4 }}>
          {CHANGELOG.map((v, i) => (
            <div key={v.version} style={{ marginBottom: 14, paddingBottom: 14, borderBottom: i < CHANGELOG.length - 1 ? "1px dashed #DCCBA8" : "none" }}>
              <div className="flex items-center gap-2" style={{ marginBottom: 6 }}>
                <span style={{ fontSize: 12.5, fontWeight: 800, color: i === 0 ? T.brass : T.inkSoft, fontFamily: SITE_FONT }}>v{v.version}</span>
                <span style={{ fontSize: 10.5, color: T.inkSoft }}>{v.date}</span>
                {i === 0 && <span style={{ fontSize: 9.5, fontWeight: 800, color: "#fff", background: T.brass, borderRadius: 999, padding: "1px 7px" }}>{t("최신")}</span>}
              </div>
              <ul style={{ margin: 0, paddingLeft: 18 }}>
                {v.items.map((t, j) => <li key={j} style={{ fontSize: 12, color: T.ink, fontWeight: 600, lineHeight: 1.6, marginBottom: 4 }}>{t}</li>)}
              </ul>
              {v.dev && v.dev.length > 0 && <div style={{ fontSize: 10.5, color: T.inkSoft, marginTop: 4 }}>{tx("개발: {0}", v.dev.join(", "))}</div>}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
// (v0.2.0 기능2) 일일 퍼즐 알림 — 이 모달만 예전 AnnouncementModal처럼 "오늘 하루 다시 보지
// 않기" 체크박스를 그대로 둔다(공지 모달과 달리 하루 안에서도 여러 번 다시 뜨는 게 의도된 동작이라,
// 완전히 끄고 싶다는 명시적 의사 표시가 있을 때만 그날 하루 동안 억제한다).
// (v0.2.7 개편) 사용자가 그려 준 스케치(마스코트가 위에서 내려다보는 달력 다이어리 형태 — 왼쪽
// 페이지는 날짜+달력 모식, 오른쪽 페이지는 오늘의 오프닝·풀이수·풀기 버튼)를 그대로 옮겼다.
// (기능) 사용자 요청 — 팝업을 조금 더 키운다. 모바일(narrow)은 기존 좌우 2단 "다이어리"
// 레이아웃 대신 체스보드를 상단에 별도로 크게 배치해 위아래로 늘리고(좁은 화면에서 104px짜리
// 보드는 너무 작았다), 데스크톱은 레이아웃 구조(좌: 날짜+보드, 우: 점선 구분선+텍스트+버튼)는
// 그대로 두고 크기 비율만 전체적으로 키운다.
export function DailyPuzzleNoticeModal({ puzzle, solveCount, onOpen, onClose, onOpenLearn }) {
  const [hide, setHide] = useState(false);
  const close = () => onClose(hide);
  const t_ = todayStr();
  const dateLabel = t_.slice(0, 4) + "." + parseInt(t_.slice(5, 7), 10) + "." + parseInt(t_.slice(8, 10), 10);
  // (스케치 개편) 격자는 더 이상 장식용 달력 모식이 아니라, 캐러셀 카드와 같은 실제 오늘의 퍼즐
  // 포지션 미리보기(AnimatedMove)다 — 사용자 스케치의 "정사각형 격자 = 미니 체스보드" 의도를
  // 그대로 반영한다.
  const flip = ((puzzle.setupSans ? puzzle.setupSans.length : 0) + 1) % 2 !== 0;
  const puzzleSans = (puzzle.setupSans || []).concat(puzzle.mistakeSan ? [puzzle.mistakeSan] : []);
  const narrow = useNarrow(640);
  // (버그 수정) 모바일 보드 상자를 width:100%로 키워도 AnimatedMove의 size는 고정 220px이라 상자
  // 안에 실제 보드보다 훨씬 큰 빈 여백이 남았다(화면 폭에 따라 폭 차이가 커서 고정값 하나로는
  // 맞출 수 없음) — ResizeObserver로 상자의 실제 렌더 폭을 재서 그 값을 그대로 size로 넘겨,
  // 화면 폭이 얼마든 보드가 상자를 정확히 꽉 채우게 한다.
  const boardWrapRef = useRef(null);
  const [boardW, setBoardW] = useState(280);
  useLayoutEffect(() => {
    if (!narrow) return;
    const el = boardWrapRef.current;
    if (!el) return;
    const measure = () => setBoardW(el.clientWidth);
    measure();
    if (typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [narrow]);
  const dateRow = <div style={{ fontSize: narrow ? 14.5 : 20, fontWeight: 800, color: T.ink, marginBottom: 6, fontFamily: SITE_FONT }}>{dateLabel}</div>;
  // (사용자 요청) 데스크톱은 텍스트·버튼 크기를 많이 줄여 오른쪽 칼럼 폭을 좁히고, 그렇게 확보한
  // 자리를 왼쪽 보드 칼럼에 몰아줘 보드를 훨씬 크게 그린다.
  const labelRow = (
    <div className="flex items-center gap-1" style={{ marginBottom: 4 }}>
      <Bell size={narrow ? 12 : 11} style={{ color: T.brass, flexShrink: 0 }} />
      <span style={{ fontSize: narrow ? 10.5 : 10, fontWeight: 800, color: T.brass }}>{t("일일 퍼즐")}</span>
    </div>
  );
  const titleRow = <div style={{ fontSize: narrow ? 14.5 : 13, fontWeight: 800, color: T.ink, lineHeight: 1.3, marginBottom: narrow ? 6 : 5 }}>{livePuzzleName(puzzle) || puzzle.opening}</div>;
  const solveRow = solveCountText(solveCount, null) && <div style={{ fontSize: narrow ? 11 : 10, color: "#2E6E2E", fontWeight: 700, marginBottom: narrow ? 10 : 7 }}>{solveCountText(solveCount, null)}</div>;
  // (사용자 요청) 풀기 버튼은 기존 금색 그라데이션을 그대로 유지한다.
  const playBtn = <button onClick={onOpen} className="press" style={{ width: "100%", display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 6, padding: narrow ? "9px 0" : "7px 0", borderRadius: 10, background: "linear-gradient(180deg," + T.brass + ",#A8842F)", color: "#241509", fontWeight: 800, fontSize: narrow ? 13 : 11.5, border: "none", cursor: "pointer" }}>{tx("{0}풀기", <Play size={narrow ? 13 : 11} fill="#241509" />)}</button>;
  return (
    <div onClick={close} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.6)", zIndex: 96, display: "flex", alignItems: "center", justifyContent: "center", padding: 16, overflowY: "auto" }}>
      <div onClick={(e) => e.stopPropagation()} style={{ position: "relative", width: "100%", maxWidth: narrow ? 380 : 620, margin: "auto" }}>
        {/* (스케치) 다이어리 위에서 내려다보는 마스코트 — 카드 위 왼쪽에 살짝 겹쳐 뜬다. */}
        <div style={{ position: "absolute", top: narrow ? -38 : -54, left: 10, zIndex: 2 }}><Mascot name="kokoa" emotion="wink" size={narrow ? 62 : 96} /></div>
        <div style={{ position: "relative", background: T.paper, borderRadius: 16, border: "1px solid #DCCBA8", boxShadow: "0 20px 50px -10px rgba(0,0,0,.6)", padding: narrow ? "20px 18px 16px" : "40px 36px 32px" }}>
          <button onClick={close} aria-label={t("닫기")} className="press" style={{ position: "absolute", top: 10, right: 10, zIndex: 10, width: 26, height: 26, borderRadius: 7, border: "none", background: "#0002", color: T.ink, cursor: "pointer", fontSize: 13, lineHeight: 1 }}>✕</button>
          {narrow ? (
            /* 모바일 — 보드를 상단에 별도의 큰 정사각형 구획으로 두고, 그 아래로 텍스트·버튼이 이어진다. */
            <>
              <div ref={boardWrapRef} style={{ width: "100%", aspectRatio: "1 / 1", borderRadius: 12, border: "2px solid " + T.brass, background: "linear-gradient(135deg,#3A2516,#241509)", overflow: "hidden", display: "flex", alignItems: "center", justifyContent: "center", marginBottom: 14 }}>
                <AnimatedMove sans={puzzle.setupSans} san={puzzle.mistakeSan} size={boardW} loopMs={2400} flip={flip} />
              </div>
              {dateRow}
              {labelRow}
              {titleRow}
              {solveRow}
              {playBtn}
            </>
          ) : (
            /* 데스크톱 — 기존 "펼친 다이어리 두 페이지"(좌: 날짜+보드, 우: 점선 구분선+텍스트+버튼)
               구조와 좌우 칼럼 비율은 그대로 두고, 우측 칼럼 안에서 퍼즐 이름과 "풀기" 버튼 사이에
               기보(한 줄 스크롤, SequenceBar 재사용)와 코치 말풍선(MascotBubble 재사용)만 끼워 넣는다. */
            <div className="flex items-start" style={{ gap: 20, paddingRight: 14 }}>
              <div style={{ flexShrink: 0, width: 300 }}>
                {dateRow}
                <div style={{ width: "100%", aspectRatio: "1 / 1", borderRadius: 10, border: "1.5px solid " + T.brass, background: "linear-gradient(135deg,#3A2516,#241509)", overflow: "hidden", display: "flex", alignItems: "center", justifyContent: "center" }}>
                  <AnimatedMove sans={puzzle.setupSans} san={puzzle.mistakeSan} size={296} loopMs={2400} flip={flip} />
                </div>
              </div>
              <div style={{ minWidth: 0, flex: 1, paddingTop: 2, borderLeft: "1px dashed #DCCBA8", paddingLeft: 16 }}>
                {labelRow}
                {titleRow}
                {solveRow}
                {/* 기보 — 시작 위치부터 이 포지션까지의 수순을 한 줄로, 길면 드래그해 스크롤.
                    (UI) 사용자 요청 — 임의의 수를 누르면 그 기보가 입력된 분석 탭으로 이동한다.
                    집중 분석을 나가면 이 팝업이 다시 뜨는 것은 App.jsx의 onOpenLearnFocus가 닫기
                    전에 기억해 뒀다가 focus를 나갈 때 다시 열어주는 방식으로 처리한다. */}
                <div style={{ marginBottom: 10, padding: "8px 10px", borderRadius: 9, background: "linear-gradient(160deg,#2E1B10,#1B0F07)", border: "1px solid #000" }}>
                  <SequenceBar sans={puzzleSans} onJump={onOpenLearn ? (ply) => { onOpenLearn(puzzleSans.slice(0, ply)); close(); } : undefined} />
                </div>
                <div style={{ marginBottom: 20 }}>
                  <MascotBubble text={t("{0}  포지션. 최선의 수 찾기", (livePuzzleName(puzzle) || puzzle.opening))} ply={0} mascot="kokoa" emotion="wink" stacked />
                </div>
                {playBtn}
              </div>
            </div>
          )}
          <label className="flex items-center gap-2" style={{ fontSize: narrow ? 12 : 15, color: T.inkSoft, cursor: "pointer", marginTop: narrow ? 14 : 20 }}>
            <input type="checkbox" checked={hide} onChange={(e) => setHide(e.target.checked)} />{t("오늘 하루 다시 보지 않기")}</label>
        </div>
      </div>
    </div>
  );
}
// (v0.2.9 기능) 일일 퀘스트 전체 클리어 축하 팝업 — 예전엔 작은 코인 토스트(1.8초, 다른 보상 토스트와
// 구분 안 됨) 하나로만 알렸는데, 사용자가 그걸 놓치기 쉽다며 더 명시적인 팝업을 요청했다. 특히 접속하지
// 않는 동안(예: chess.com에서만 대국을 두어 활동 퀘스트가 채워진 경우) 클리어됐다면, 그걸 알아챌 계기가
// 전혀 없었으므로 다음 접속(로드) 시 반드시 이 팝업으로 알려준다 — App의 dailyQuest.clearAnnounced
// 플래그로 "이미 이 팝업을 띄운 적 있는지"를 bonusClaimed(보상 지급 여부)와 별도로 추적한다.
// (디자인) 은은한 별빛 반짝임 — 이미 있는 xpStarPop 키프레임(팝인→살짝 떠오르며 사라짐)을 재사용해,
// 배너 안에 위치·크기·지연만 다르게 흩뿌려 한 번의 축하 반짝임을 연출한다. animation-fill-mode:
// forwards가 없으면 애니메이션이 끝난 뒤 인라인 style의 기본 opacity로 되돌아가(다시 보였다 사라지는
// 것처럼) 깜빡여 보이므로, longhand로 각 속성을 명시해 최종 상태(투명)를 그대로 유지한다.
const QUEST_CLEAR_SPARKLES = [
  { left: "12%", top: "20%", size: 12, delay: "0s" },
  { left: "85%", top: "16%", size: 10, delay: ".15s" },
  { left: "50%", top: "6%", size: 9, delay: ".3s" },
  { left: "20%", top: "72%", size: 9, delay: ".45s" },
  { left: "82%", top: "68%", size: 12, delay: ".22s" },
];
// (디자인) 종이 조각처럼 떨어지는 색색 컨페티 조각 — 사용자 요청("게임처럼")에 맞춰 별 반짝임만으로는
// 부족했던 "보상 화면" 느낌을 더한다. 작은 사각형을 questConfettiFall로 위에서 아래로 흩뿌리며 회전·
// 페이드시킨다(별과 같은 이유로 animationFillMode:forwards 필수).
const QUEST_CLEAR_CONFETTI = [
  { left: "8%", color: "#F3DFAE", delay: "0s", rot: 0 },
  { left: "22%", color: "#FFFFFF", delay: ".12s", rot: 20 },
  { left: "38%", color: "#7BC47F", delay: ".05s", rot: -15 },
  { left: "58%", color: "#F3DFAE", delay: ".2s", rot: 10 },
  { left: "70%", color: "#EAA23A", delay: ".08s", rot: -25 },
  { left: "84%", color: "#FFFFFF", delay: ".18s", rot: 15 },
  { left: "94%", color: "#7BC47F", delay: ".1s", rot: -10 },
];
// (디자인) 보상 숫자가 0에서 목표치까지 빠르게 카운트업되는 연출 — 게임의 보상 화면에서 흔한 패턴.
// ease-out(세제곱)으로 처음엔 빠르게, 끝에는 서서히 목표치에 도달한다.
function AnimatedCountUp({ to, duration = 550 }) {
  const [n, setN] = useState(0);
  useEffect(() => {
    let raf, start;
    const step = (t) => {
      if (start == null) start = t;
      const p = Math.min(1, (t - start) / duration);
      setN(Math.round(to * (1 - Math.pow(1 - p, 3))));
      if (p < 1) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [to, duration]);
  return n;
}
// (v0.2.9 기능) 대국 한 판을 압축해 보여주는 행 — 프로필의 chess.com "최근 대국" 행(AccountChessStats)과
// 같은 요소(진영 색 막대, 승/패/무, 타임컨트롤·날짜, 상대 닉네임·레이팅, 분석 이동 버튼)를 그대로 쓰되,
// 이 팝업의 좁은 폭·paper 배경에 맞춰 크기와 색만 줄인 버전이다.
function QuestClearGameRow({ g, onOpenGameAnalyze }) {
  const won = g.result === "win", lost = g.result === "loss";
  const oppSide = g.color === "w" ? g.black : g.white;
  const fmtD = (t) => { if (!t) return ""; const d = new Date(t * 1000); return (d.getMonth() + 1) + "." + d.getDate() + "."; };
  return (
    <div className="flex items-center gap-2" style={{ marginTop: 5, padding: "6px 8px", borderRadius: 8, background: "rgba(0,0,0,.05)", border: "1px solid #E4D5B6" }}>
      <span title={g.color === "w" ? t("백") : t("흑")} style={{ width: 4, alignSelf: "stretch", minHeight: 24, flexShrink: 0, borderRadius: 3, background: g.color === "w" ? "linear-gradient(180deg,#FFFDF7,#E7DABB)" : "linear-gradient(180deg,#4A3826,#241509)", border: "1px solid " + (g.color === "w" ? "#D8C9A8" : "#000") }} />
      <div style={{ minWidth: 0, flex: 1 }}>
        <div style={{ fontSize: 11, color: T.ink }}>
          <b style={{ color: won ? T.best : lost ? T.blunder : T.inkSoft }}>{won ? t("승리") : lost ? t("패배") : t("무승부")}</b>
          {g.timeClass && <span style={{ marginLeft: 5, fontSize: 10, fontWeight: 700, color: T.inkSoft }}>{(TIME_CLASS_LABEL[g.timeClass] || g.timeClass) + (g.endTime ? " · " + fmtD(g.endTime) : "")}</span>}
        </div>
        {oppSide && oppSide.username && <div style={{ fontSize: 10, color: T.inkSoft, marginTop: 1 }}>vs {oppSide.username}{oppSide.rating != null && <span style={{ fontFamily: SITE_FONT }}> ({oppSide.rating})</span>}</div>}
      </div>
      {onOpenGameAnalyze && g.moves && g.moves.length > 0 && (
        <button onClick={() => onOpenGameAnalyze({ sans: g.moves, color: g.color, result: g.result, rating: g.rating, timeClass: g.timeClass, opening: g.opening, endTime: g.endTime, white: g.white, black: g.black, id: g.id })} aria-label={t("대국 분석")} title={t("대국 분석")} className="press"
          style={{ width: 24, height: 24, borderRadius: 7, flexShrink: 0, background: "linear-gradient(180deg," + T.brass + ",#A8842F)", color: "#241509", border: "none", cursor: "pointer", display: "inline-flex", alignItems: "center", justifyContent: "center" }}><Search size={11} /></button>
      )}
    </div>
  );
}
// (v0.2.9 기능) 클리어한 퀘스트 한 줄 — 오프닝 퀘스트는 그 오프닝의 기보(수순)를, chess.com 활동
// 퀘스트는 실제로 그 조건을 채운 오늘의 대국(들)을 함께 보여준다(questMatchingGames). 대국은 최근
// 것부터 최대 2개까지만 — 5판 채우기 퀘스트라고 5판을 다 늘어놓으면 팝업이 한없이 길어진다.
function QuestClearRow({ label, moveText, games, onOpenGameAnalyze }) {
  return (
    <div style={{ padding: "8px 10px", borderRadius: 9, background: "rgba(60,138,60,.12)", border: "1px solid rgba(120,200,120,.4)" }}>
      <div className="flex items-center gap-2">
        <span style={{ width: 16, height: 16, borderRadius: 999, flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center", background: T.best }}><Check size={10} color="#fff" strokeWidth={3} /></span>
        <span style={{ fontSize: 11.5, fontWeight: 700, color: T.ink, textAlign: "left" }}>{label}</span>
      </div>
      {moveText && <div style={{ fontSize: 10, fontFamily: SITE_FONT, color: T.inkSoft, marginTop: 5, marginLeft: 24, textAlign: "left", lineHeight: 1.5 }}>{moveText}</div>}
      {games && games.slice(0, 2).map((g, i) => <QuestClearGameRow key={i} g={g} onOpenGameAnalyze={onOpenGameAnalyze} />)}
    </div>
  );
}
export function DailyQuestClearedModal({ dailyQuest, chesscom, onOpenGameAnalyze, onClose }) {
  const dq = dailyQuest;
  // (버그 방지) 이 팝업은 dq.bonusClaimed가 true가 되는 순간에만 열리므로 dq 자체는 항상 존재하지만,
  // 방어적으로 없으면 목록 없이(체크리스트만 비워) 그려 화면이 깨지지 않게 한다.
  const rows = useMemo(() => {
    if (!dq) return [];
    const list = [
      { key: "puzzle", label: questSlotLabel("puzzle", dq), moveText: null, games: [] },
      { key: "dailypuzzle", label: questSlotLabel("dailypuzzle", dq), moveText: null, games: [] },
    ];
    (dq.quests || []).forEach((q, i) => {
      list.push({ key: "cc_" + i, label: questLabelNode(q), moveText: q.type === "opening" ? questOpeningMovesText(q.opening) : null, games: questMatchingGames(q, chesscom) });
    });
    return list;
  }, [dq, chesscom]);
  // (v0.2.9 기능) 사용자 요청 — 배경을 눌러도 실수로 닫히지 않게, 우측 상단 X 버튼(또는 "확인" 버튼)을
  // 눌러야만 닫히도록 배경 div의 onClick(닫기)을 없앴다.
  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.18 }}
      style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.7)", zIndex: 97, display: "flex", alignItems: "center", justifyContent: "center", padding: 16, overflowY: "auto" }}>
      <motion.div initial={{ opacity: 0, scale: 0.85, y: 10 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0, scale: 0.92, y: 6 }}
        transition={{ type: "spring", stiffness: 340, damping: 24 }}
        style={{ position: "relative", width: "100%", maxWidth: 340, margin: "auto", borderRadius: 20, overflow: "hidden", boxShadow: "0 24px 60px -12px rgba(0,0,0,.7), 0 0 0 1px rgba(196,154,80,.3)" }}>
        {/* 상단 배너 — 사이트 전역 배경과 같은 짙은 라디얼 그러데이션 위에, 마스코트를 금빛 원판(다른 곳의
            GOLD_DISC와 같은 톤)에 얹어 "보상 연출"임을 한눈에 알아보게 한다. (디자인 2차) 사용자가
            "게임처럼" 더 만들어 달라고 요청 — 게임 보상 화면의 흔한 문법인 (1) 원판 뒤에서 천천히 도는
            햇살(sunburst) 광선, (2) 원판 테두리를 숨쉬듯 부풀리는 발광 펄스, (3) 별 반짝임에 더해 위에서
            떨어지는 색색 컨페티까지 겹쳐 "보상을 열었다"는 느낌을 강하게 준다. */}
        <div style={{ position: "relative", padding: "30px 20px 24px", background: "radial-gradient(120% 140% at 50% -10%,#3A2610 0%,#1B0F07 70%)", display: "flex", justifyContent: "center", overflow: "hidden" }}>
          {/* 햇살 광선 — conic-gradient로 만든 부채꼴들을 원판 뒤에 두고 천천히 회전시킨다. */}
          <div aria-hidden="true" style={{ position: "absolute", left: "50%", top: "50%", width: 220, height: 220, marginTop: -6, transform: "translate(-50%,-50%)", background: "repeating-conic-gradient(from 0deg, rgba(243,223,174,.35) 0deg 7deg, transparent 7deg 22deg)", borderRadius: "50%", opacity: 0.7, animationName: "questRaySpin", animationDuration: "16s", animationTimingFunction: "linear", animationIterationCount: "infinite" }} />
          {QUEST_CLEAR_CONFETTI.map((c, i) => (
            <span key={"c" + i} aria-hidden="true" style={{ position: "absolute", left: c.left, top: -6, width: 6, height: 10, background: c.color, borderRadius: 1, transform: "rotate(" + c.rot + "deg)", animationName: "questConfettiFall", animationDuration: "1.6s", animationTimingFunction: "ease-in", animationDelay: c.delay, animationIterationCount: 1, animationFillMode: "forwards" }} />
          ))}
          {QUEST_CLEAR_SPARKLES.map((p, i) => (
            <Sparkles key={i} size={p.size} style={{ position: "absolute", left: p.left, top: p.top, color: "#F3DFAE", animationName: "xpStarPop", animationDuration: "1.3s", animationTimingFunction: "ease", animationDelay: p.delay, animationIterationCount: 1, animationFillMode: "forwards" }} />
          ))}
          <button onClick={onClose} aria-label={t("닫기")} className="press" style={{ position: "absolute", top: 10, right: 10, zIndex: 10, width: 26, height: 26, borderRadius: 8, border: "none", background: "rgba(0,0,0,.4)", color: "#F2E8D5", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}><X size={13} /></button>
          <div style={{ position: "relative", zIndex: 1, width: 82, height: 82, borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center", background: "radial-gradient(70% 70% at 32% 28%," + T.brassHi + "," + T.brass + " 68%,#8A6C2F 100%)", border: "1px solid #6E5424", animationName: "questGlowPulse", animationDuration: "1.8s", animationTimingFunction: "ease-in-out", animationIterationCount: "infinite" }}>
            <Mascot name="kokoa" emotion="celebrate" size={68} />
          </div>
        </div>
        {/* 하단 본문 — 종이 카드 */}
        <div style={{ background: T.paper, padding: "18px 18px 20px", textAlign: "center" }}>
          {/* (디자인) 제목을 밋밋한 잉크색 텍스트 대신, 게임 보상 화면의 "각인된 금속 글자" 느낌으로 —
              금빛 세로 그러데이션을 텍스트에 그대로 입히고(backgroundClip:text) 아래로 진한 그림자를
              깔아 도드라져 보이게 한다. 양옆의 가는 금선+다이아몬드로 "배너/현판"처럼 감싼다. */}
          <div className="flex items-center justify-center gap-2" style={{ marginBottom: 6 }}>
            <span style={{ width: 22, height: 1, background: "linear-gradient(90deg,transparent," + T.brass + ")", flexShrink: 0 }} />
            <Target size={14} style={{ color: T.brassHi, flexShrink: 0 }} />
            <span style={{ fontFamily: GAME_FONT, fontSize: 19, fontWeight: 400, letterSpacing: ".01em", background: "linear-gradient(180deg,#FFF6DE,#F3DFAE 45%,#C49A50 100%)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent", backgroundClip: "text", filter: "drop-shadow(0 2px 1px rgba(0,0,0,.55))" }}>{t("오늘의 퀘스트 클리어")}</span>
            <Target size={14} style={{ color: T.brassHi, flexShrink: 0 }} />
            <span style={{ width: 22, height: 1, background: "linear-gradient(90deg," + T.brass + ",transparent)", flexShrink: 0 }} />
          </div>
          <p style={{ fontSize: 12, color: T.inkSoft, margin: "0 0 12px", lineHeight: 1.5 }}>{tx("일일 퀘스트 5개 모두 완료{0}완료 보상 획득", <br />)}</p>
          {/* (디자인) 보상 배지는 카드가 자리 잡은 뒤 살짝 늦게, 하나씩 튕기며 등장하고(questBadgePop),
              숫자는 0에서 목표치까지 빠르게 카운트업된다 — 둘 다 게임 보상 화면에서 흔히 보이는 연출. */}
          <div className="flex items-center justify-center" style={{ gap: 8, marginBottom: 16 }}>
            <span className="flex items-center gap-1" style={{ fontSize: 12.5, fontWeight: 800, color: T.brassHi, padding: "6px 13px", borderRadius: 999, background: "rgba(196,154,80,.1)", border: "1px solid " + T.brass, animationName: "questBadgePop", animationDuration: ".5s", animationTimingFunction: "cubic-bezier(.34,1.56,.64,1)", animationDelay: ".25s", animationFillMode: "backwards" }}><Star size={12} fill={T.brassHi} style={{ color: T.brassHi }} />+<AnimatedCountUp to={20} /> XP</span>
            <span className="flex items-center gap-1" style={{ fontSize: 12.5, fontWeight: 800, color: T.brassHi, padding: "6px 13px", borderRadius: 999, background: "rgba(196,154,80,.1)", border: "1px solid " + T.brass, animationName: "questBadgePop", animationDuration: ".5s", animationTimingFunction: "cubic-bezier(.34,1.56,.64,1)", animationDelay: ".38s", animationFillMode: "backwards" }}><CoinIcon size={18} />+<AnimatedCountUp to={50} /></span>
          </div>
          {rows.length > 0 && (
            <>
              <div style={{ fontSize: 10.5, fontWeight: 800, color: T.brass, textAlign: "left", marginBottom: 6 }}>{t("오늘 완료한 퀘스트")}</div>
              {/* (버그 방지) 바깥 배경(overflowY:auto)이 이미 팝업 전체 스크롤을 맡고 있으므로, 여기 안에
                  또 maxHeight+overflow로 중첩 스크롤 상자를 만들면 그 상자 높이를 넘는 항목(예: 5개 슬롯
                  중 세 번째 chess.com 퀘스트)이 안 보이면서도 스크롤 힌트가 없어 통째로 빠진 것처럼
                  보였다 — 목록은 그냥 자연스러운 높이로 흐르게 두고 스크롤은 바깥 하나로 통일한다. */}
              <div style={{ display: "flex", flexDirection: "column", gap: 6, marginBottom: 16 }}>
                {rows.map((r, i) => (
                  <motion.div key={r.key} initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.3 + i * 0.06, duration: 0.28 }}>
                    <QuestClearRow label={r.label} moveText={r.moveText} games={r.games} onOpenGameAnalyze={onOpenGameAnalyze} />
                  </motion.div>
                ))}
              </div>
            </>
          )}
          {/* (디자인) 확인 버튼에 gm-board-shine(다른 화면의 금속 광택 스윕과 동일한 클래스)을 얹어, 다른
              "특별한" 화면들과 같은 시각 언어로 은은한 하이라이트가 주기적으로 스쳐 지나가게 한다. */}
          <button onClick={onClose} className="press" style={{ position: "relative", overflow: "hidden", width: "100%", display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 6, padding: "11px 0", borderRadius: 11, background: "linear-gradient(180deg," + T.brass + ",#A8842F)", color: "#241509", fontWeight: 800, fontSize: 13.5, border: "none", cursor: "pointer" }}>
            <span className="gm-board-shine" style={{ borderRadius: 11 }} />
            {tx("{0}확인", <Check size={14} strokeWidth={3} />)}</button>
        </div>
      </motion.div>
    </motion.div>
  );
}
// (v0.2.9 기능) 사용자 요청 — 칭호 획득도 일일 퀘스트 클리어·티어 승급과 같은 "보상 화면" 팝업으로.
// 예전에는 상단에 잠깐 떴다 6초 뒤 자동으로 사라지는 작은 토스트뿐이었다 — 같은 시각 언어(금빛 원판
// 마스코트·햇살·컨페티·반짝임, DailyQuestClearedModal과 동일한 구성 요소를 그대로 재사용)로 확대하고,
// 자동/배경 클릭으로 닫히지 않고 X·확인 버튼을 눌러야만 닫히도록 다른 두 팝업과 동작을 통일한다.
export function TitleEarnedModal({ id, currentTitle, onEquip, onClose }) {
  const [famKey, rank] = id.split(":");
  const fam = TITLE_OPENINGS.find((f) => f.key === famKey);
  const tier = TITLE_TIERS.find((t) => t.rank === rank);
  if (!fam || !tier) return null;
  const equipped = currentTitle === id;
  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.18 }}
      style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.7)", zIndex: 97, display: "flex", alignItems: "center", justifyContent: "center", padding: 16, overflowY: "auto" }}>
      <motion.div initial={{ opacity: 0, scale: 0.85, y: 10 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0, scale: 0.92, y: 6 }}
        transition={{ type: "spring", stiffness: 340, damping: 24 }}
        style={{ position: "relative", width: "100%", maxWidth: 340, margin: "auto", borderRadius: 20, overflow: "hidden", boxShadow: "0 24px 60px -12px rgba(0,0,0,.7), 0 0 0 1px rgba(196,154,80,.3)" }}>
        <div style={{ position: "relative", padding: "30px 20px 24px", background: "radial-gradient(120% 140% at 50% -10%,#3A2610 0%,#1B0F07 70%)", display: "flex", justifyContent: "center", overflow: "hidden" }}>
          <div aria-hidden="true" style={{ position: "absolute", left: "50%", top: "50%", width: 220, height: 220, marginTop: -6, transform: "translate(-50%,-50%)", background: "repeating-conic-gradient(from 0deg, rgba(243,223,174,.35) 0deg 7deg, transparent 7deg 22deg)", borderRadius: "50%", opacity: 0.7, animationName: "questRaySpin", animationDuration: "16s", animationTimingFunction: "linear", animationIterationCount: "infinite" }} />
          {QUEST_CLEAR_CONFETTI.map((c, i) => (
            <span key={"c" + i} aria-hidden="true" style={{ position: "absolute", left: c.left, top: -6, width: 6, height: 10, background: c.color, borderRadius: 1, transform: "rotate(" + c.rot + "deg)", animationName: "questConfettiFall", animationDuration: "1.6s", animationTimingFunction: "ease-in", animationDelay: c.delay, animationIterationCount: 1, animationFillMode: "forwards" }} />
          ))}
          {QUEST_CLEAR_SPARKLES.map((p, i) => (
            <Sparkles key={i} size={p.size} style={{ position: "absolute", left: p.left, top: p.top, color: "#F3DFAE", animationName: "xpStarPop", animationDuration: "1.3s", animationTimingFunction: "ease", animationDelay: p.delay, animationIterationCount: 1, animationFillMode: "forwards" }} />
          ))}
          <button onClick={onClose} aria-label={t("닫기")} className="press" style={{ position: "absolute", top: 10, right: 10, zIndex: 10, width: 26, height: 26, borderRadius: 8, border: "none", background: "rgba(0,0,0,.4)", color: "#F2E8D5", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}><X size={13} /></button>
          <div style={{ position: "relative", zIndex: 1, width: 82, height: 82, borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center", background: "radial-gradient(70% 70% at 32% 28%," + T.brassHi + "," + T.brass + " 68%,#8A6C2F 100%)", border: "1px solid #6E5424", animationName: "questGlowPulse", animationDuration: "1.8s", animationTimingFunction: "ease-in-out", animationIterationCount: "infinite" }}>
            <Mascot name="milku" emotion="wink" size={68} />
          </div>
        </div>
        <div style={{ background: T.paper, padding: "18px 18px 20px", textAlign: "center" }}>
          <div className="flex items-center justify-center gap-2" style={{ marginBottom: 6 }}>
            <span style={{ width: 22, height: 1, background: "linear-gradient(90deg,transparent," + T.brass + ")", flexShrink: 0 }} />
            <Crown size={14} style={{ color: T.brassHi, flexShrink: 0 }} />
            <span style={{ fontFamily: GAME_FONT, fontSize: 19, fontWeight: 400, letterSpacing: ".01em", background: "linear-gradient(180deg,#FFF6DE,#F3DFAE 45%,#C49A50 100%)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent", backgroundClip: "text", filter: "drop-shadow(0 2px 1px rgba(0,0,0,.55))" }}>{t("새 칭호 획득")}</span>
            <Crown size={14} style={{ color: T.brassHi, flexShrink: 0 }} />
            <span style={{ width: 22, height: 1, background: "linear-gradient(90deg," + T.brass + ",transparent)", flexShrink: 0 }} />
          </div>
          <p style={{ fontSize: 12, color: T.inkSoft, margin: "0 0 14px", lineHeight: 1.5 }}>{tx("{0} 오프닝을 충분히 연습해서{1}새 칭호 획득", fam.label, <br />)}</p>
          <div style={{ padding: "0 6px", marginBottom: 10 }}>
            <TitleBadge id={id} earned equipped={equipped} onEquip={onEquip} />
          </div>
          <p style={{ fontSize: 10.5, color: T.inkSoft, margin: "0 0 16px" }}>{equipped ? t("현재 장착 중인 칭호") : t("칭호를 눌러 바로 장착")}</p>
          <button onClick={onClose} className="press" style={{ position: "relative", overflow: "hidden", width: "100%", display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 6, padding: "11px 0", borderRadius: 11, background: "linear-gradient(180deg," + T.brass + ",#A8842F)", color: "#241509", fontWeight: 800, fontSize: 13.5, border: "none", cursor: "pointer" }}>
            <span className="gm-board-shine" style={{ borderRadius: 11 }} />
            {tx("{0}확인", <Check size={14} strokeWidth={3} />)}</button>
        </div>
      </motion.div>
    </motion.div>
  );
}
// (v0.5.6 기능, 사용자 요청) chess.com 대국 요약 알림 — 도감 잠금 해제 토스트가 있던 자리·크기(상단 가운데,
// 최대 360px)에, chess.com 대국이 한 판 끝날 때마다 뜬다. 접속하지 않은 사이 끝난 대국들은 다음 접속 때
// 오래된 것부터 한 장씩 이어서 뜬다(App의 ccQueue). 프로필 "최근 대국" 행과 같은 정보(결과·레이팅 증감·
// 상대·오프닝)에 검색(분석 보드로 불러오기)·리뷰 버튼을 달고, 도감 전적 칩과 같은 칩으로 이 대국이 전적을
// 어떻게 바꿨는지(승/무/패 숫자가 넘어가고 승률이 새 값까지 올라가거나 내려감) 보여 준다.
const CC_TOAST_MS = 8000;       // 자동으로 닫히기까지(마우스를 올려 두면 멈춤)
const CC_TOAST_REVEAL_MS = 900; // 직전 전적을 먼저 보여 주고, 이 대국을 반영하기까지
// (v0.5.6 사용자 요청) 전적 칩 앞 오프닝 이름(예: "Italian Game: Classical Variation") 서체 — 결과 줄에서 이 자리로 옮겼다.
const CC_TOAST_LABEL_FONT = "'Playfair Display', 'Nanum Myeongjo', serif";
const ccWrColor = (n, wr) => (n < 3 || wr == null ? "#8A7458" : wr >= 60 ? T.best : wr >= 40 ? T.inaccuracy : T.blunder); // 도감 전적 칩과 같은 규칙
function useCountTween(from, to, run, ms = 750) {
  const [v, setV] = useState(from);
  useEffect(() => {
    if (!run || from === to) { setV(run ? to : from); return; }
    let raf, t0 = null;
    const step = (t) => {
      if (t0 == null) t0 = t;
      const k = Math.min(1, (t - t0) / ms), e = 1 - Math.pow(1 - k, 3);
      setV(Math.round(from + (to - from) * e));
      if (k < 1) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [from, to, run, ms]);
  return v;
}
// (v0.5.7, 사용자 요청 "전적 변화를 더 부각 — 숫자가 흔들리면서 변하게") 흔들림 래퍼 — active가 켜지는 순간 한 번, 좌우로 떨리며
// 커졌다가 제자리로 가라앉는다. 숫자가 넘어가는(flip) 동안 함께 흔들려 "바뀌는 중"이라는 느낌을 준다. 떨림 폭은 점점 줄어든다.
// 흔들림은 넘어가는 숫자를 자르는 overflow 칸 바깥에 걸어, 커져도 숫자가 잘리지 않는다. transform 문자열만 쓴다(합성기, SquareFx 주석 참고).
const CC_SHAKE_STRONG = [
  "translateX(0px) rotate(0deg) scale(1)", "translateX(-2.5px) rotate(-10deg) scale(1.3)", "translateX(2.5px) rotate(9deg) scale(1.45)",
  "translateX(-2px) rotate(-7deg) scale(1.45)", "translateX(1.5px) rotate(5deg) scale(1.38)", "translateX(-1px) rotate(-2.5deg) scale(1.25)", "translateX(0px) rotate(0deg) scale(1)",
];
const CC_SHAKE_SOFT = [
  "translateX(0px) rotate(0deg) scale(1)", "translateX(-1.5px) rotate(-4deg) scale(1.12)", "translateX(1.5px) rotate(4deg) scale(1.18)",
  "translateX(-1.2px) rotate(-3deg) scale(1.18)", "translateX(1px) rotate(2deg) scale(1.14)", "translateX(-0.5px) rotate(-1deg) scale(1.08)", "translateX(0px) rotate(0deg) scale(1)",
];
function CcShake({ active, strong, delay = 0, duration = 0.62, children }) {
  const frames = strong ? CC_SHAKE_STRONG : CC_SHAKE_SOFT;
  return (
    <motion.span initial={{ transform: frames[0] }} animate={active ? { transform: frames } : { transform: frames[0] }}
      transition={active ? { duration, delay, times: [0, 0.14, 0.3, 0.47, 0.64, 0.82, 1], ease: fxEase(7, "easeInOut") } : { duration: 0 }}
      style={{ display: "inline-flex", transformOrigin: "50% 60%", position: "relative", zIndex: active ? 1 : undefined }}>
      {children}
    </motion.span>
  );
}
// 숫자가 바뀌면 아래에서 위로 넘어가며 바뀐다(바뀐 칸만 색으로 강조). hot이면 넘어가는 동안 크게 흔들리고, 뒤에 같은 색 빛이 번진다.
function CcFlipNum({ value, hot, color }) {
  return (
    <CcShake active={hot} strong>
      {hot && <motion.span aria-hidden="true" initial={{ opacity: 0, transform: "scale(0.4)" }} animate={{ opacity: [0, 0.55, 0], transform: ["scale(0.4)", "scale(1.3)", "scale(1.9)"] }}
        transition={{ duration: 0.7, times: [0, 0.35, 1], ease: fxEase(3, "easeOut") }}
        style={{ position: "absolute", left: "50%", top: "50%", width: "1.5em", height: "1.5em", marginLeft: "-0.75em", marginTop: "-0.75em", borderRadius: "50%", background: "radial-gradient(circle," + color + " 0%, rgba(0,0,0,0) 70%)", pointerEvents: "none" }} />}
      <span style={{ position: "relative", display: "inline-flex", justifyContent: "center", minWidth: String(value).length * 0.62 + "em", height: "1.25em", overflow: "hidden", verticalAlign: "bottom" }}>
        <AnimatePresence initial={false} mode="popLayout">
          <motion.span key={value} initial={{ opacity: 0, transform: "translateY(85%)" }} animate={{ opacity: 1, transform: "translateY(0%)" }} exit={{ opacity: 0, transform: "translateY(-85%)" }}
            transition={{ duration: 0.38, ease: [0.2, 0.8, 0.3, 1] }} style={{ display: "inline-block", lineHeight: "1.25em", color: hot ? color : undefined, transition: "color .3s" }}>{value}</motion.span>
        </AnimatePresence>
      </span>
    </CcShake>
  );
}
export function ChesscomGameToast({ game, rec, ratingDelta, more, onSearch, onReview, onClose }) {
  const won = game.result === "win", lost = game.result === "loss";
  const resColor = won ? T.best : lost ? T.blunder : T.inkSoft;
  const opp = game.color === "w" ? game.black : game.white;
  const [phase, setPhase] = useState(0); // 0: 직전 전적, 1: 이 대국 반영
  useEffect(() => { const t = setTimeout(() => setPhase(1), CC_TOAST_REVEAL_MS); return () => clearTimeout(t); }, []);
  const cur = phase ? rec.next : rec.prev;
  const wrTween = useCountTween(rec.prev.wr != null ? rec.prev.wr : 0, rec.next.wr, phase === 1);
  const wr = phase ? wrTween : rec.prev.wr;
  const chipColor = ccWrColor(cur.n, wr);
  const dWr = rec.prev.wr != null ? rec.next.wr - rec.prev.wr : null;
  const hotColor = rec.changed === "w" ? T.best : rec.changed === "l" ? T.blunder : "#8A7458";
  // 자동 닫힘 — 아래 진행 막대가 줄어들고, 마우스를 올려 두면(hover) 멈춘다.
  const left = useMotionValue(1);
  const ctlRef = useRef(null);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  const [hover, setHover] = useState(false);
  useEffect(() => {
    const c = animateMv(left, 0, { duration: CC_TOAST_MS / 1000, ease: "linear", onComplete: () => closeRef.current() });
    ctlRef.current = c;
    return () => c.stop();
  }, [left]);
  useEffect(() => { const c = ctlRef.current; if (!c) return; if (hover) c.pause(); else c.play(); }, [hover]);
  const iconBtn = { width: 30, height: 30, borderRadius: 8, background: "linear-gradient(180deg," + T.brass + ",#A8842F)", color: "#241509", border: "none", cursor: "pointer", display: "inline-flex", alignItems: "center", justifyContent: "center", flexShrink: 0 };
  return (
    <motion.div role="status" onPointerEnter={() => setHover(true)} onPointerLeave={() => setHover(false)}
      initial={{ opacity: 0, transform: "translateY(-14px) scale(0.96)" }} animate={{ opacity: 1, transform: "translateY(0px) scale(1)" }} exit={{ opacity: 0, transform: "translateY(-10px) scale(0.97)" }}
      transition={{ duration: 0.34, ease: [0.22, 1.2, 0.36, 1] }}
      style={{ position: "relative", overflow: "hidden", pointerEvents: "auto", background: "linear-gradient(160deg,#F3E6CC,#E2C89A)", color: T.ink, padding: "9px 12px 12px", borderRadius: 12, border: "2px solid " + T.book, boxShadow: "inset 0 0 0 1px rgba(138,90,43,.35), 0 12px 30px -8px rgba(0,0,0,.6)" }}>
      <div className="flex items-center gap-2" style={{ marginBottom: 6 }}>
        <span style={{ fontSize: 10.5, fontWeight: 800, color: T.book }}>{t("최근 대국")}</span>
        {game.timeClass && <span style={{ fontSize: 10, fontWeight: 700, color: T.inkSoft }}>· {TIME_CLASS_LABEL[game.timeClass] || game.timeClass}</span>}
        <span style={{ flex: 1 }} />
        {more > 0 && <span style={{ fontSize: 9.5, fontWeight: 800, color: "#FFF6DE", background: T.book, borderRadius: 999, padding: "1px 7px" }}>{tx("다음 {0}판", more)}</span>}
        <button onClick={onClose} aria-label={t("닫기")} className="press" style={{ width: 20, height: 20, padding: 0, border: "none", background: "transparent", color: T.inkSoft, cursor: "pointer", fontSize: 15, lineHeight: 1 }}>×</button>
      </div>
      <div className="flex items-center gap-2">
        <span title={game.color === "w" ? t("백") : t("흑")} style={{ width: 5, alignSelf: "stretch", minHeight: 34, flexShrink: 0, borderRadius: 3, background: game.color === "w" ? "linear-gradient(180deg,#FFFDF7,#E7DABB)" : "linear-gradient(180deg,#4A3826,#241509)", border: "1px solid " + (game.color === "w" ? "#C9B58C" : "#000") }} />
        <div style={{ minWidth: 0, flex: 1 }}>
          <div style={{ fontSize: 14, lineHeight: 1.2 }}>
            <b style={{ color: resColor }}>{won ? t("승리") : lost ? t("패배") : t("무승부")}</b>
            {!won && !lost && <span style={{ marginLeft: 4, fontSize: 10, fontWeight: 700, color: T.inkSoft }}>({drawKindLabel(game.moves)})</span>}
            {ratingDelta != null && <span style={{ marginLeft: 4, fontSize: 12, fontWeight: 800, fontFamily: SITE_FONT, color: ratingDelta > 0 ? T.best : ratingDelta < 0 ? T.blunder : T.inkSoft }}>({ratingDelta > 0 ? "+" + ratingDelta : ratingDelta})</span>}
          </div>
          {opp && opp.username && <div style={{ fontSize: 11, color: T.inkSoft, marginTop: 2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>vs <b style={{ color: T.ink }}>{opp.username}</b>{opp.rating != null && <span style={{ fontFamily: SITE_FONT }}>({opp.rating})</span>}</div>}
        </div>
        <button onClick={onSearch} aria-label={t("대국 보기")} title={t("분석 보드로 불러오기")} className="press" style={iconBtn}><Search size={13} /></button>
        <BestMoveJumpButton title={t("게임 리뷰")} onClick={onReview} />
      </div>
      <div className="flex items-center gap-2" style={{ marginTop: 9 }}>
        <span title={rec.scope === "opening" ? game.opening : undefined} style={{ minWidth: 0, flex: "1 1 auto", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", fontFamily: rec.scope === "opening" ? CC_TOAST_LABEL_FONT : undefined, fontSize: rec.scope === "opening" ? 12.5 : 10.5, fontWeight: 700, color: T.book }}>{rec.scope === "opening" ? game.opening : t("전체 전적")}</span>
        {/* (v0.5.7, 사용자 요청) 전적 칩은 오른쪽 끝에 고정 — 오프닝 이름 길이나 뒤늦게 나타나는 승률 변화(▲8%p)에 밀려 움직이지 않게,
            변화 표시는 칩 왼쪽의 고정 폭 자리에 오른쪽 정렬로 둔다. */}
        <span style={{ flexShrink: 0, width: 58, display: "inline-flex", justifyContent: "flex-end" }}>
          <AnimatePresence>
            {phase === 1 && (
              <motion.span key="d" initial={{ opacity: 0, transform: "translateX(-6px)" }} animate={{ opacity: 1, transform: "translateX(0px)" }} transition={{ duration: 0.3, delay: 0.55 }}
                style={{ flexShrink: 0, fontSize: 10.5, fontWeight: 800, fontFamily: SITE_FONT, whiteSpace: "nowrap", color: dWr == null ? T.book : dWr > 0 ? T.best : dWr < 0 ? T.blunder : T.inkSoft }}>
                {dWr == null ? t("첫 대국") : dWr > 0 ? "▲" + dWr + "%p" : dWr < 0 ? "▼" + (-dWr) + "%p" : t("승률 유지")}
              </motion.span>
            )}
          </AnimatePresence>
        </span>
        <span style={{ position: "relative", flexShrink: 0, display: "inline-flex", alignItems: "center", gap: 5, height: 21, padding: "0 8px", borderRadius: 11, background: "#FFFDF6", border: "1.5px solid " + chipColor, boxShadow: "0 1px 3px rgba(0,0,0,.3)", whiteSpace: "nowrap", fontFamily: SITE_FONT, fontSize: 11, fontWeight: 800, color: T.ink, transition: "border-color .3s" }}>
          {phase === 1 && <motion.span aria-hidden="true" initial={{ opacity: 0.8, transform: "scale(1)" }} animate={{ opacity: 0, transform: "scale(1.35)" }} transition={{ duration: 0.7, ease: "easeOut" }}
            style={{ position: "absolute", inset: -2, borderRadius: 12, border: "2px solid " + hotColor, pointerEvents: "none" }} />}
          <span>{tx("{0}승 {1}무 {2}패", <CcFlipNum value={cur.w} hot={phase === 1 && rec.changed === "w"} color={hotColor} />, <CcFlipNum value={cur.d} hot={phase === 1 && rec.changed === "d"} color={hotColor} />, <CcFlipNum value={cur.l} hot={phase === 1 && rec.changed === "l"} color={hotColor} />)}</span>
          {/* 승률은 새 값까지 세어 가는 동안(useCountTween 750ms) 잔잔하게 떨리다 멈춘다 — 바뀐 전적 숫자보다 한 박자 뒤 */}
          <CcShake active={phase === 1 && dWr !== 0} delay={0.12} duration={0.75}><span style={{ color: chipColor, transition: "color .3s" }}>{wr != null ? wr + "%" : "–"}</span></CcShake>
        </span>
      </div>
      <motion.span aria-hidden="true" style={{ position: "absolute", left: 0, right: 0, bottom: 0, height: 2.5, background: T.book, transformOrigin: "left", scaleX: left, opacity: 0.8 }} />
    </motion.div>
  );
}
/* ============================================================ 저장 + 셸 ============================================================ */
const mem = {};
export const store = {
  async get(k) {
    try { if (typeof window !== "undefined" && window.storage) { const r = await window.storage.get(k); return r ? r.value : null; } } catch { }
    try { const v = window.localStorage.getItem(k); if (v != null) return v; } catch { }
    return mem[k] ?? null;
  },
  async set(k, v) {
    mem[k] = v;
    try { if (typeof window !== "undefined" && window.storage) { await window.storage.set(k, v); return; } } catch { }
    try { window.localStorage.setItem(k, v); } catch { }
  },
};
// (v0.4.0 UI) 사용자 요청 — 탭 이름 개편: 기존 "학습" 탭은 "분석"으로, 기존 "퀘스트" 탭은
// "학습"으로 이름만 바꾼다(내부 key·라우팅·기능은 그대로 유지 — 이 학습 탭(구 퀘스트 탭)의
// 메인 퀘스트를 강화하기 위한 개편의 첫 단계).
// (v0.5.0 개편, 사용자 요청) 상점 탭 → 플레이 탭 — 내부 키("store")·경로 매핑 구조는 그대로 두고
// 라벨·아이콘만 바꾼다(아래 TAB_PATH/PATH_TAB에서 경로도 /store → /play로 함께 바뀐다).
// (사용자 요청) 하단 탭 순서를 분석/플레이/퍼즐/학습/도감/설정으로 재배치 — 내부 키·경로 매핑은
// 그대로 두고 배열 순서만 바꾼다(렌더링이 이 배열을 그대로 순회하므로 그 외 변경 불필요).
export const TABS = [{ key: "learn", label: t("분석"), Icon: null }, { key: "store", label: t("플레이"), Icon: Play }, { key: "puzzle", label: t("퍼즐"), Icon: null }, { key: "quest", label: t("학습"), Icon: null }, { key: "dex", label: t("도감"), Icon: Library }, { key: "set", label: t("설정"), Icon: Settings }];
// (16차) 탭 ↔ 서브패스 라우팅. openchess.kr/learn, /book, /puzzle, /quest, /store, /setting 으로 각 탭에 직접 접근 가능하도록 한다.
// (사용자 요청) 탭 내부 키("learn"=분석, "quest"=학습)와 실제로 화면에 뜨는 URL 경로가 서로
// 뒤바뀌어 있었다 — 분석 탭이 /learn으로, 학습 탭이 /quest로 보였다. 내부 키 이름은 그대로 두고
// (다른 코드 전반에서 이미 광범위하게 참조하므로), 경로만 각 탭의 실제 한국어 라벨과 일치하도록
// 바로잡는다: 분석("learn" 키) → /analysis, 학습("quest" 키) → /learn.
export const TAB_PATH = { learn: "/analysis", dex: "/book", puzzle: "/puzzle", quest: "/learn", store: "/play", set: "/setting" };
const PATH_TAB = { "/analysis": "learn", "/book": "dex", "/puzzle": "puzzle", "/learn": "quest", "/play": "store", "/setting": "set" };
export function tabFromPath(pathname) { return PATH_TAB[(pathname || "").replace(/\/$/, "") || "/"] || null; }
// (UX7) 로컬 캐시를 계정(uid) 단위로 분리 — 이걸 안 하면 같은 기기에서 다른 계정으로 로그인할 때
// 퍼즐·프로필·칭호·chess.com 연동 등이 이전 계정 것을 그대로 물려받는 사고가 남(실제로 있었음).
// 로그인 안 한 상태(게스트)는 별도로 "guest" 버킷에 담아 계정 데이터와 절대 섞이지 않게 한다.
export function localKeyFor(uidVal) { return "chess_state_v5:" + (uidVal || "guest"); }
/* ---- Supabase Auth (이메일+비번, GoTrue REST 직접 호출). 세션은 refresh_token 만 영속화 ---- */
const SESS_KEY = "occ_sess";
function saveRefresh(t) { try { if (t) window.localStorage.setItem(SESS_KEY, t); else window.localStorage.removeItem(SESS_KEY); } catch { } }
function loadRefresh() { try { return window.localStorage.getItem(SESS_KEY) || null; } catch { return null; } }
async function gotrue(path, body) {
  const r = await fetch(SB_URL + "/auth/v1/" + path, { method: "POST", headers: { apikey: SB_KEY, "Content-Type": "application/json" }, body: JSON.stringify(body || {}) });
  const j = await r.json().catch(() => ({}));
  return { ok: r.ok, status: r.status, data: j };
}
function applySession(d) { if (!d || !d.access_token) return null; setSbToken(d.access_token); saveRefresh(d.refresh_token || null); return (d.user && d.user.id) || null; }
function clearSession() { setSbToken(null); saveRefresh(null); }
/* uid → { uid, username, pub, progress } */
async function loadAccount(uid) {
  let username = "", pub = {}, progress = {};
  try { const rows = await sbSelect("profiles?id=eq." + uid + "&select=username,pub&limit=1"); if (rows && rows[0]) { username = rows[0].username || ""; pub = rows[0].pub || {}; } } catch { }
  try { const rows = await sbSelect("user_progress?id=eq." + uid + "&select=progress&limit=1"); if (rows && rows[0]) progress = rows[0].progress || {}; } catch { }
  return { uid, username, pub, progress };
}
/* 가입: 이메일+비번 → Auth → profiles insert(username). 반환 { ok, error?, account? } */
async function authSignup(email, password, username) {
  if (!SB_ON) return { ok: false, error: "offline" };
  const uname = (username || "").toLowerCase();
  try { const avail = await sbRpc("username_available", { p_username: uname }); if (avail === false) return { ok: false, error: "username_taken" }; } catch { }
  // username 을 user_metadata 로 전달 → 서버 트리거가 auth.users 와 같은 트랜잭션에서 profiles 생성(원자적)
  const r = await gotrue("signup", { email, password, data: { username: uname } });
  if (!r.ok) {
    const m = String((r.data && (r.data.msg || r.data.error_description || r.data.error_code || r.data.error || r.data.message)) || "");
    if (/registered|already/i.test(m)) return { ok: false, error: "email_taken" };
    // 트리거가 username 충돌/형식으로 막은 경우(사전 체크 통과 후의 race 등) → DB 오류로 표면화
    return { ok: false, error: /database|check|username|constraint/i.test(m) ? "username_taken" : "signup_failed" };
  }
  const uid = applySession(r.data);
  if (!uid) return { ok: false, error: "confirm_required" }; // Confirm email ON: profiles 는 트리거가 이미 생성, 인증 후 로그인
  return { ok: true, account: { uid, username: uname, pub: { displayId: (username || "").trim() }, progress: {} } };
}
/* 로그인 */
async function authLogin(loginOrEmail, password) {
  if (!SB_ON) return { ok: false, error: "offline" };
  let email = (loginOrEmail || "").trim();
  if (!email) return { ok: false, error: "invalid" };
  if (!email.includes("@")) {   // 아이디로 로그인 → 이메일로 해석(username 은 중복 불가라 1:1)
    try { const e = await sbRpc("email_for_username", { p_username: email.toLowerCase() }); email = (typeof e === "string" ? e : (e && e.email)) || ""; } catch { email = ""; }
    if (!email) return { ok: false, error: "invalid" };
  }
  const r = await gotrue("token?grant_type=password", { email, password });
  if (!r.ok) return { ok: false, error: "invalid", email };
  const uid = applySession(r.data);
  if (!uid) return { ok: false, error: "invalid", email };
  return { ok: true, account: await loadAccount(uid) };
}
/* 이메일이 어떤 제공자(이메일/구글)로 가입돼 있는지 조회 → 같은 메일 다른 방식 가입 시 안내용 */
async function accountProviders(email) {
  if (!SB_ON || !email || !email.includes("@")) return [];
  try { const r = await sbRpc("account_providers", { p_email: email.trim().toLowerCase() }); return Array.isArray(r) ? r : []; } catch { return []; }
}
/* 구글 콜백 오류(예: 이미 다른 방식으로 가입된 이메일과 충돌) 파싱 */
// (버그 수정) URLSearchParams는 application/x-www-form-urlencoded 규칙으로 파싱되므로 .get()이
// 이미 퍼센트 이스케이프 디코딩과 "+"→공백 치환을 다 해준다 — 그런데 그 결과를 decodeURIComponent로
// 한 번 더 디코딩하고 있었다. 에러 메시지 안에 이스케이프 시퀀스가 아닌 순수 "%"(예: "50% quota")가
// 하나라도 있으면 이 이중 디코딩이 URIError를 던졌고, 바깥 try/catch가 그걸 삼켜 사용자에게는
// 아무 에러 안내도 안 뜨고 #error=... 해시도 지워지지 않는 채로 조용히 실패했다.
export function parseOAuthError() {
  try {
    const h = (typeof window !== "undefined" && window.location.hash) || "";
    if (h.indexOf("error") < 0) return null;
    const p = new URLSearchParams(h.replace(/^#/, ""));
    return p.get("error_description") || p.get("error") || null;
  } catch { return null; }
}
/* 세션 복원(앱 로드): refresh_token → 새 access_token. 반환 account | null */
export async function authRestore() {
  if (!SB_ON) return null;
  const refresh = loadRefresh();
  if (!refresh) return null;
  const r = await gotrue("token?grant_type=refresh_token", { refresh_token: refresh });
  if (!r.ok) { clearSession(); return null; }
  const uid = applySession(r.data);
  if (!uid) { clearSession(); return null; }
  return await loadAccount(uid);
}
// (v0.4.3 기능) authRestore와 같은 refresh_token 갱신이지만, 프로필·진도까지 다시 불러오는
// loadAccount는 건너뛴다 — 액세스 토큰이 조용히 만료되기 전에 주기적으로 미리 갱신만 해 두는
// 가벼운 백그라운드 유지용(App 루트의 REFRESH_INTERVAL_MS 타이머 전용).
export async function refreshAccessToken() {
  if (!SB_ON) return false;
  const refresh = loadRefresh();
  if (!refresh) return false;
  const r = await gotrue("token?grant_type=refresh_token", { refresh_token: refresh });
  if (!r.ok) return false;
  return !!applySession(r.data);
}
export async function authLogout() {
  if (SB_ON && SB_TOKEN) { try { await fetch(SB_URL + "/auth/v1/logout", { method: "POST", headers: sbHeaders() }); } catch { } }
  clearSession();
}
/* 비밀번호 재설정 요청: 아이디 또는 이메일 → 연동된 이메일로 재설정 링크 발송. 존재 여부는 노출하지 않음(항상 성공 응답). */
async function authRecover(loginOrEmail) {
  if (!SB_ON) return { ok: false, error: "offline" };
  let email = (loginOrEmail || "").trim();
  if (!email) return { ok: false, error: "empty" };
  if (!email.includes("@")) {
    try { const e = await sbRpc("email_for_username", { p_username: email.toLowerCase() }); email = (typeof e === "string" ? e : (e && e.email)) || ""; } catch { email = ""; }
  }
  if (!email) return { ok: true };   // 미존재 계정도 동일 응답(열거 방지)
  try { await gotrue("recover", { email }); } catch { }
  return { ok: true };
}
/* 복구 링크로 진입했는지(해시에 type=recovery & access_token) 판별 */
export function parseRecoveryHash() {
  try {
    const h = (typeof window !== "undefined" && window.location.hash) || "";
    if (h.indexOf("type=recovery") < 0) return null;
    const p = new URLSearchParams(h.replace(/^#/, ""));
    const at = p.get("access_token"); if (!at) return null;
    return { access_token: at, refresh_token: p.get("refresh_token") || null };
  } catch { return null; }
}
/* 새 비밀번호 설정(복구 세션 사용) → 성공 시 자동 로그인 account 반환 */
async function authSetPassword(recovery, password) {
  if (!SB_ON) return { ok: false, error: "offline" };
  setSbToken(recovery.access_token);
  try {
    const r = await fetch(SB_URL + "/auth/v1/user", { method: "PUT", headers: sbHeaders(), body: JSON.stringify({ password }) });
    const j = await r.json().catch(() => null);
    if (!r.ok) { clearSession(); return { ok: false, error: "reset_failed" }; }
    const uid = applySession({ access_token: recovery.access_token, refresh_token: recovery.refresh_token, user: j });
    try { window.history.replaceState(null, "", window.location.pathname + window.location.search); } catch { }
    if (!uid) return { ok: true };
    return { ok: true, account: await loadAccount(uid) };
  } catch { clearSession(); return { ok: false, error: "reset_failed" }; }
}
/* 진도 저장(본인만; RLS 가 auth.uid()=id 강제) */
export async function progressSave(uid, progress) { if (!SB_ON || !uid) return; try { await sbUpsert("user_progress", { id: uid, progress }); } catch { } }
// (기능2) 공개 프로필: 별도 테이블 profiles_public 에 클라이언트가 업서트/조회(계정 스키마와 독립). 미설정 시 무해하게 비활성.
export async function publishProfile(uid, username, pub) { if (!SB_ON || !uid) return; try { await sbUpsert("profiles", { id: uid, username: (username || "").toLowerCase(), pub }); } catch { } }
async function notifyList(uid) { if (!SB_ON || !uid) return []; try { return (await sbSelect("notifications?to_uid=eq." + uid + "&order=created_at.desc&limit=30")) || []; } catch { return []; } }
// (18차 보충 UX4) 여러 미확인 알림을 한 번에 읽음 처리(개별 PATCH가 실패해도 나머지는 진행).
// (버그 수정) 예전엔 실패를 그냥 삼키고 아무것도 돌려주지 않아, 호출부(NotificationBell)의 낙관적
// UI 업데이트(안 읽음 배지 즉시 숨김)가 실제 PATCH 실패 여부와 무관하게 그대로 유지됐다 — 서버는
// 여전히 안 읽음인데 화면은 재조회 전까지 계속 읽음으로 보였다. 실제로 성공한 id만 담은 Set을
// 돌려줘, 실패한 항목만 호출부가 되돌릴 수 있게 한다.
async function notifyMarkReadMany(rows) {
  if (!SB_ON || !rows || !rows.length) return new Set((rows || []).map((r) => r.id));
  const targets = rows.filter((r) => r.id != null);
  const ok = await Promise.all(targets.map((r) => sbPatch("notifications", "id=eq." + r.id, { read: true }).then(() => true).catch(() => false)));
  return new Set(targets.filter((_, i) => ok[i]).map((r) => r.id));
}
// (v0.5.0 기능, 사용자 요청) 커뮤니티 인기 퍼즐이 오늘의 퍼즐로 선정되면 그 제작자에게 알림이 가고,
// 알림 창의 "받기" 버튼을 눌러야 보상(OC 나이트 코인)이 지급된 것으로 표시된다 — notifySetResult와
// 같은 패턴으로 payload에 claimed:true만 남긴다(실제 코인 지급은 다른 보상들과 동일하게 클라이언트
// progress에 반영, App.jsx의 onClaimNotif 참고).
async function notifySetClaimed(row) { if (!SB_ON || row.id == null) return true; try { await sbPatch("notifications", "id=eq." + row.id, { read: true, payload: { ...(row.payload || {}), claimed: true } }); return true; } catch { return false; } }
// (19차 UI1) 알림 부분/전체 삭제 — id 필터로 개별 삭제, to_uid 필터로 내 알림 전체 삭제.
// (버그 수정) 성공 여부(HTTP 상태 포함)를 돌려줘, 실패 시 호출부가 낙관적으로 지운 알림 항목을
// 되살릴 수 있게 한다 — DELETE는 sbPatch와 달리 non-2xx여도 fetch 자체는 던지지 않으므로 r.ok도 확인한다.
async function notifyDelete(row) { if (!SB_ON || row.id == null) return true; try { const r = await fetch(SB_URL + "/rest/v1/notifications?id=eq." + row.id, { method: "DELETE", headers: { ...sbHeaders(), Prefer: "return=minimal" } }); return r.ok; } catch { return false; } }
async function notifyDeleteAll(uid) { if (!SB_ON || !uid) return true; try { const r = await fetch(SB_URL + "/rest/v1/notifications?to_uid=eq." + uid, { method: "DELETE", headers: { ...sbHeaders(), Prefer: "return=minimal" } }); return r.ok; } catch { return false; } }
function notifText(n) {
  const p = n.payload || {};
  if (n.kind === "friend_request") return t("{0}님이 친구 요청을 보냄", (p.fromUsername || t("누군가")));
  if (n.kind === "friend_accepted") return t("{0}님이 친구 요청을 수락함", (p.byUsername || t("상대")));
  if (n.kind === "title_earned") return t("새 칭호 획득: {0}", titleLabel(p.titleId) || p.titleId);
  if (n.kind === "tier_up") return t("티어 {0} 승급", p.tierLabel);
  // (v0.5.6, 사용자 요청) 선정 팝업(PuzzleSelectedModal)을 없애고 알림 창에서만 알린다 — 어떤 퍼즐인지 번호까지.
  if (n.kind === "daily_puzzle_selected") return p.no != null ? t("내가 만든 {0:이/가} 오늘의 퍼즐로 선정", t("퍼즐 #{0}", p.no)) : t("내 퍼즐이 오늘의 퍼즐로 선정");
  return t("알림");
}
function notifIcon(kind) {
  if (kind === "friend_request" || kind === "friend_accepted") return <Users size={15} style={{ color: T.brass }} />;
  if (kind === "title_earned") return <Star size={15} style={{ color: T.brassHi }} />;
  if (kind === "tier_up") return <Sparkles size={15} style={{ color: T.brassHi }} />;
  if (kind === "daily_puzzle_selected") return <Target size={15} style={{ color: T.brassHi }} />;
  return <Info size={15} style={{ color: T.inkSoft }} />;
}
export function NotificationBell({ myUid, onAccept, onReject, onClaim, compact }) {
  const [items, setItems] = useState([]);
  const [open, setOpen] = useState(false);
  // (18차 UX4) 읽음/응답 처리한 알림이 30초 폴링(서버 반영 지연)으로 다시 미확인으로 되살아나지 않도록
  // 로컬에서 확정한 상태를 refresh 결과 위에 덮어쓴다.
  const localReadRef = useRef(new Set());
  const localResultRef = useRef({});
  const localClaimedRef = useRef(new Set()); // (v0.5.0) "받기" 버튼을 누른 daily_puzzle_selected 알림
  const wrapRef = useRef(null);
  const applyLocal = (rows) => rows.map((n) => {
    let payload = n.payload;
    if (localResultRef.current[n.id]) payload = { ...(payload || {}), result: localResultRef.current[n.id] };
    if (localClaimedRef.current.has(n.id)) payload = { ...(payload || {}), claimed: true };
    return { ...n, read: n.read || localReadRef.current.has(n.id), payload };
  });
  const refresh = useCallback(async () => { if (!myUid) return; setItems(applyLocal(await notifyList(myUid))); }, [myUid]);
  useEffect(() => { refresh(); }, [refresh]);
  // (v0.0.5 성능) 30초 폴링 대신 내 알림(to_uid=나) 변경을 Realtime으로 즉시 반영, 소켓이 끊겼을 때를
  // 대비해 2분 간격의 느슨한 안전망만 남긴다.
  useRealtimeTable("notifications", myUid ? "to_uid=eq." + myUid : null, refresh, !!myUid, 120000);
  // (18차 UX4) 패널 밖(검색·친구 버튼 포함) 아무 곳이나 클릭하면 알림 패널이 자동으로 닫힌다.
  useEffect(() => {
    if (!open) return;
    const onDocClick = (e) => { if (wrapRef.current && !wrapRef.current.contains(e.target)) setOpen(false); };
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, [open]);
  const unread = items.filter((n) => !n.read).length;
  // (버그 수정) 아래 네 핸들러 모두 서버 요청이 실패해도 낙관적 업데이트가 되돌아가지 않아, 서버는
  // 여전히 이전 상태인데 화면(과 새로고침 전까지의 localRead/localResult 오버레이)은 계속 성공한
  // 것처럼 보였다 — 성공 여부를 확인해 실패하면 해당 항목의 로컬 오버레이를 지우고 refresh()로
  // 서버의 실제 상태와 다시 맞춘다.
  // (사용자 요청, 버그 수정) position:absolute + translateX 보정만으로는, 이 벨이 overflow:hidden인
  // 조상(헤더 등) 안에 있으면 dx 계산이 맞아도 카드 자체가 그 조상 경계에서 잘렸다 — 도감 수 카드와
  // 똑같은 근본 원인. position:fixed로 바꿔 뷰포트 좌표로 직접 계산하면 어떤 조상의 overflow와도
  // 무관하게 항상 화면 안에 온전히 그려진다.
  const [notifRect, setNotifRect] = useState(null); // { left, top, width, maxHeight }
  const toggle = () => {
    const next = !open; setOpen(next);
    if (next && wrapRef.current) {
      const anchor = wrapRef.current.getBoundingClientRect();
      const margin = 8;
      const width = Math.min(320, window.innerWidth - margin * 2);
      const left = Math.max(margin, Math.min(anchor.right - width, window.innerWidth - width - margin));
      const top = anchor.bottom + 6;
      const BOTTOM_SAFE = 66 + 24; // 하단 고정 내비게이션(66px) + 여유
      const maxHeight = Math.max(160, Math.min(420, window.innerHeight - top - BOTTOM_SAFE));
      setNotifRect({ left, top, width, maxHeight });
    }
    // (18차 UX4→보충) 최초 확인 시 서버에 PATCH로 read=true를 확실히 반영 — 새로고침 후에도 배지가 되살아나지 않는다.
    if (next && unread) {
      const stale = items.filter((n) => !n.read);
      stale.forEach((n) => localReadRef.current.add(n.id));
      setItems((prev) => prev.map((n) => ({ ...n, read: true })));
      notifyMarkReadMany(stale).then((okIds) => {
        const failed = stale.filter((n) => !okIds.has(n.id));
        if (!failed.length) return;
        failed.forEach((n) => localReadRef.current.delete(n.id));
        refresh();
      });
    }
  };
  const respond = (n, result) => {
    // (18차 UX4) 응답 즉시 버튼을 없애고 결과를 고정 — 중복 클릭·수락 후 거절 번복을 차단한다.
    localResultRef.current[n.id] = result;
    setItems((prev) => prev.map((x) => x.id === n.id ? { ...x, payload: { ...(x.payload || {}), result } } : x));
    notifySetResult(n, result).then((ok) => { if (!ok) { delete localResultRef.current[n.id]; refresh(); } });
    if (result === "accepted") { onAccept && onAccept(n); } else { onReject && onReject(n); }
  };
  // (v0.5.0 기능, 사용자 요청) daily_puzzle_selected 알림의 "받기" 버튼 — 낙관적으로 즉시 claimed 처리하고
  // 실패하면 되돌린다(respond와 동일 패턴). 실제 코인 지급은 onClaim(App.jsx)이 담당한다.
  const claim = (n) => {
    if (n.payload && n.payload.claimed) return;
    localClaimedRef.current.add(n.id);
    setItems((prev) => prev.map((x) => x.id === n.id ? { ...x, read: true, payload: { ...(x.payload || {}), claimed: true } } : x));
    notifySetClaimed(n).then((ok) => { if (!ok) { localClaimedRef.current.delete(n.id); refresh(); } });
    onClaim && onClaim(n);
  };
  // (19차 UI1) 알림 개별/전체 삭제 — 낙관적으로 목록에서 즉시 제거하고 서버에도 DELETE 반영.
  const removeOne = (n) => { setItems((prev) => prev.filter((x) => x.id !== n.id)); notifyDelete(n).then((ok) => { if (!ok) refresh(); }); };
  const clearAll = () => { if (!myUid) return; setItems([]); notifyDeleteAll(myUid).then((ok) => { if (!ok) refresh(); }); };
  return (
    <div ref={wrapRef} style={{ position: "relative" }}>
      {/* (버그 수정, 사용자 재제보) outline은 브라우저마다 border-radius를 따라 둥글게 그려지는지가
          달라 "테두리가 잘려 보인다"는 제보가 반복됐다 — border-box 사이징의 진짜 border로 바꿔
          어느 브라우저에서도 항상 같은 모양으로 그려지게 한다(옆 세그먼트·프로필 버튼과 동일 처리).
          box-sizing:border-box라 border를 더해도 바깥 치수(width/height)는 그대로 27/34로 남는다. */}
      <button onClick={toggle} aria-label={t("알림")} className="press" style={{ position: "relative", width: compact ? 27 : 34, height: compact ? 27 : 34, borderRadius: 9, background: T.ebony3, color: T.brassHi, border: "1px solid " + T.brass, boxSizing: "border-box", cursor: "pointer", display: "inline-flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
        <Bell size={compact ? 13 : 16} />
        {unread > 0 && <span style={{ position: "absolute", top: -6, right: -6, minWidth: 16, height: 16, padding: "0 3px", borderRadius: 999, background: T.blunder, color: "#fff", fontSize: 9.5, fontWeight: 800, display: "flex", alignItems: "center", justifyContent: "center", border: "1px solid #000", lineHeight: 1, zIndex: 5 }}>{unread > 9 ? "9+" : unread}</span>}
      </button>
      <AnimatePresence>
      {open && (
        <motion.div initial={{ opacity: 0, y: -6, scale: 0.97 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: -6, scale: 0.97 }} transition={{ duration: 0.18, ease: MOTION_EASE }}
          onClick={(e) => e.stopPropagation()} style={{ position: "fixed", top: (notifRect && notifRect.top) || 40, left: (notifRect && notifRect.left) || 0, width: (notifRect && notifRect.width) || 320, maxHeight: (notifRect && notifRect.maxHeight) || 420, overflowY: "auto", background: T.paper, borderRadius: 12, border: "1px solid #DCCBA8", boxShadow: "0 16px 40px -10px rgba(0,0,0,.6)", zIndex: 90 }}>
          <div className="flex items-center justify-between" style={{ padding: "10px 14px", borderBottom: "1px solid #E4D5B6" }}>
            <span style={{ fontSize: 12.5, fontWeight: 800, color: T.ink }}>{t("알림")}</span>
            {items.length > 0 && <button onClick={clearAll} className="press" style={{ padding: "3px 8px", borderRadius: 6, background: "transparent", color: T.inkSoft, fontWeight: 700, fontSize: 10.5, border: "1px solid #C9B58C", cursor: "pointer" }}>{t("전체 삭제")}</button>}
          </div>
          {items.length === 0 ? <div style={{ padding: 16, fontSize: 12, color: T.inkSoft }}>{t("알림 없음")}</div> : (
            <div>
              <AnimatePresence>
              {items.map((n, i) => { const result = n.payload && n.payload.result; return (
                <FadeIn key={n.id} index={i} y={6} style={{ display: "flex", alignItems: "flex-start", gap: 8, padding: "10px 14px", borderBottom: "1px solid #EFE3C8" }}>
                  <span style={{ marginTop: 1 }}>{notifIcon(n.kind)}</span>
                  <div style={{ minWidth: 0, flex: 1 }}>
                    <div style={{ fontSize: 12, color: T.ink, fontWeight: 600, lineHeight: 1.4 }}>{notifText(n)}</div>
                    <div style={{ fontSize: 10, color: T.inkSoft, marginTop: 2 }}>{relTime(n.created_at)}</div>
                    {n.kind === "friend_request" && (result ? (
                      <div style={{ marginTop: 6, fontSize: 11, fontWeight: 800, color: result === "accepted" ? T.best : T.inkSoft }}>{result === "accepted" ? t("수락함") : t("거절함")}</div>
                    ) : (
                      <div className="flex items-center gap-2" style={{ marginTop: 6 }}>
                        <button onClick={() => respond(n, "accepted")} className="press" style={{ padding: "4px 10px", borderRadius: 7, background: "linear-gradient(180deg," + T.brass + ",#A8842F)", color: "#241509", fontWeight: 800, fontSize: 11, border: "none", cursor: "pointer" }}>{t("수락")}</button>
                        <button onClick={() => respond(n, "rejected")} className="press" style={{ padding: "4px 10px", borderRadius: 7, background: "transparent", color: T.inkSoft, fontWeight: 700, fontSize: 11, border: "1px solid #C9B58C", cursor: "pointer" }}>{t("거절")}</button>
                      </div>
                    ))}
                    {n.kind === "daily_puzzle_selected" && ((n.payload && n.payload.claimed) ? (
                      <div style={{ marginTop: 6, fontSize: 11, fontWeight: 800, color: T.best }}>{t("수령 완료")}</div>
                    ) : (
                      <button onClick={() => claim(n)} className="press flex items-center gap-1" style={{ marginTop: 6, padding: "4px 10px", borderRadius: 7, background: "linear-gradient(180deg," + T.brass + ",#A8842F)", color: "#241509", fontWeight: 800, fontSize: 11, border: "none", cursor: "pointer" }}>+{(n.payload && n.payload.reward) || 0} {tx("{0} 받기", <CoinIcon size={13} />)}</button>
                    ))}
                  </div>
                  <button onClick={() => removeOne(n)} aria-label={t("알림 삭제")} className="press" style={{ flexShrink: 0, width: 20, height: 20, marginTop: 1, padding: 0, border: "none", background: "transparent", color: T.inkSoft, cursor: "pointer", display: "inline-flex", alignItems: "center", justifyContent: "center", fontSize: 15, lineHeight: 1 }}>×</button>
                </FadeIn>
              ); })}
              </AnimatePresence>
            </div>
          )}
        </motion.div>
      )}
      </AnimatePresence>
    </div>
  );
}
// (버그 수정) 헤더의 "아이디 + 로그아웃"을 아바타 알약 하나로 묶는다 — 좁은 화면에서는 아바타만
// 보여주고(이니셜), 이름은 펼침 메뉴 안에서만 보여줘 한 줄 폭을 아낀다. 넓은 화면에서는 아바타 옆에
// 이름도 함께 표시한다. NotificationBell과 동일하게 바깥 클릭 시 자동으로 닫힌다.
// (기능) 펼침 메뉴 안에는 설정 탭의 "내 프로필"과 동일한 미리보기(아바타·칭호·아이디·티어·퍼즐 수·
// 자주 두는 첫 수 — PublicProfileStats 재사용)를 보여주고, 그 아래 로그아웃 버튼을 둔다. 아바타/이름/
// 아이디를 누르면 메뉴를 닫고 설정 탭의 내 프로필로 이동한다.
export function HeaderProfileMenu({ user, profile, currentTitle, totalXp, puzzleRating, solvedCount, onOpenOpening, onOpenGame, onOpenGameAnalyze, compact, onLogoutClick, onGoToProfile, onOpenAccountCenter, mainQuestSummary, solvedNos, onOpenPuzzle, mySolved, myLineSolves, myUid, likedPuzzles, likeCounts, onToggleLike, repostedPuzzles, repostCounts, onToggleRepost, shareCounts, onShare }) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef(null);
  useEffect(() => {
    if (!open) return;
    const onDocClick = (e) => { if (wrapRef.current && !wrapRef.current.contains(e.target)) setOpen(false); };
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, [open]);
  const name = (profile.displayId || user) + roleIcon(user);
  const initial = (profile.nickname || profile.displayId || user || "?")[0].toUpperCase();
  // (v0.1.3 기능) 설정 탭 "내 프로필"에서만 보이던 메인 퀘스트 진척도·푼 퍼즐을 이 헤더 드롭다운에도
  // 보여준다 — PublicProfileStats는 이미 pub.mainQuestSummary/solvedNos가 있으면 그 두 블록을
  // 자동으로 그려주므로(다른 유저 공개 프로필과 동일한 컴포넌트), myPub에 그대로 채워 넣기만 하면 된다.
  const myPub = { nickname: profile.nickname, photo: profile.photo, bio: profile.bio, chesscom: profile.chesscom, title: currentTitle, firstMoves: profile.firstMoves, xp: totalXp || 0, puzzleRating: puzzleRating || 800, solvedCount, displayId: profile.displayId, mainQuestSummary, solvedNos, legacies: profile.legacies, legacyHistory: profile.legacyHistory };
  const goToProfile = () => { setOpen(false); onGoToProfile(); };
  return (
    <div ref={wrapRef} style={{ position: "relative", flexShrink: 0 }}>
      {/* (버그 수정, 사용자 재제보) outline은 브라우저마다 border-radius를 따라 둥글게 그려지는지가
          달라 "테두리가 잘려 보인다"는 제보가 반복됐고, 알림 버튼과 y좌표가 미묘하게 어긋나 보인다는
          제보도 함께 있었다 — border-box 사이징의 진짜 border로 통일한다. box-sizing:border-box라
          border를 더해도 바깥 높이는 여전히 다른 두 버튼과 똑같은 27/34로 고정되고, 내용물(아바타·
          닉네임·화살표)의 세로 정렬은 그대로 alignItems:center가 맡으므로 border 유무와 무관하게
          항상 옆 버튼들과 정확히 같은 y좌표에 놓인다. */}
      <button onClick={() => setOpen((o) => !o)} aria-label={t("계정 메뉴")} className="press" style={{ display: "inline-flex", alignItems: "center", gap: compact ? 4 : 6, height: compact ? 27 : 34, boxSizing: "border-box", padding: compact ? "0 5px" : "0 10px 0 4px", borderRadius: 9, background: T.ebony3, border: "1px solid " + T.brass, cursor: "pointer" }}>
        {/* (버그 수정) 그랜드마스터 사진 테두리(gmPhotoRingStyle)는 border+바깥쪽 glow box-shadow를
            더하는데, 이 아바타는 다른 곳(56~64px)과 달리 22/27px로 아주 작아 그 9px 블러 glow가
            버튼 테두리 밖으로 넘쳐 나가 이 버튼만 유독 위아래로 더 커 보이는 원인이었다(그랜드마스터
            계정에서만 재현). box-sizing:border-box로 테두리를 더해도 아바타 전체 크기가 그대로
            22/27이 되게 고정하고, 이 작은 크기에서는 안 어울리는 바깥쪽 glow를 없앤다. */}
        {myPub.photo ? <img src={myPub.photo} alt="" style={{ width: compact ? 22 : 27, height: compact ? 22 : 27, borderRadius: 7, objectFit: "cover", boxSizing: "border-box", flexShrink: 0, ...(gmPhotoRingStyle(tierFromXp(myPub.xp || 0).tier.key === "grandmaster", 2) || {}), boxShadow: "none" }} />
          : <span style={{ width: compact ? 22 : 27, height: compact ? 22 : 27, borderRadius: 7, background: "linear-gradient(180deg," + T.brass + ",#A8842F)", color: "#241509", fontSize: compact ? 10.5 : 12, fontWeight: 800, display: "inline-flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>{initial}</span>}
        {!compact && <span style={{ color: T.brassHi, fontSize: 13, fontWeight: 800, maxWidth: 90, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{name}</span>}
        <ChevronDown size={compact ? 12 : 14} style={{ color: T.brassHi, flexShrink: 0, transform: open ? "rotate(180deg)" : "none", transition: "transform .15s ease" }} />
      </button>
      {open && (
        <div onClick={(e) => e.stopPropagation()} style={{ position: "absolute", top: "calc(100% + 6px)", right: 0, width: 300, maxWidth: "90vw", maxHeight: 460, overflowY: "auto", background: T.paper, borderRadius: 12, border: "1px solid #DCCBA8", boxShadow: "0 16px 40px -10px rgba(0,0,0,.6)", zIndex: 90, padding: 14 }}>
          {/* (v0.3.9 사용자 요청) MyProfileCard와 같은 헤더 구성 — "@아이디" 라벨을 상단에 두고,
              이름·소개 사이에 따로 있던 @아이디 줄은 없앤다. 우상단 화살표 버튼을 누르면 설정 탭
              대신 별도 "프로필 창"(ProfileWindow)이 열려 통계·유산·chess.com 연동까지 자세히 볼 수
              있다(예전엔 이 카드 전체를 눌러야 했다). */}
          <div className="flex items-center justify-between" style={{ marginBottom: 10 }}>
            <span style={{ fontSize: 12.5, fontWeight: 700, color: T.ink, fontFamily: SITE_FONT, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>@{(myPub.displayId || user)}{roleIcon(user)}</span>
            <button onClick={goToProfile} aria-label={t("프로필 자세히 보기")} title={t("프로필 자세히 보기")} className="press" style={{ flexShrink: 0, width: 26, height: 26, borderRadius: 7, border: "1px solid #C9B58C", background: "#fff", color: T.ink, cursor: "pointer", display: "inline-flex", alignItems: "center", justifyContent: "center" }}><ChevronRight size={15} /></button>
          </div>
          <div className="flex items-center gap-3" style={{ marginBottom: 12 }}>
            {myPub.photo ? <img src={myPub.photo} alt="" style={{ width: 52, height: 52, borderRadius: 14, objectFit: "cover", border: "1px solid #C9B58C", flexShrink: 0, ...(gmPhotoRingStyle(tierFromXp(myPub.xp || 0).tier.key === "grandmaster") || {}) }} />
              : <span style={{ width: 52, height: 52, borderRadius: 14, background: "linear-gradient(180deg," + T.brass + ",#A8842F)", color: "#241509", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 800, fontSize: 21, flexShrink: 0 }}>{initial}</span>}
            <div style={{ minWidth: 0 }}>
              <div style={{ fontSize: 14.5, fontWeight: 800, color: T.ink, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{myPub.nickname || myPub.displayId || user}</div>
              {myPub.bio && <div style={{ fontSize: 11, color: T.ink, marginTop: 5, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{myPub.bio}</div>}
            </div>
          </div>
          {/* (버그 수정) 이 드롭다운은 로그아웃 버튼까지 한눈에 보여야 하는데, chess.com 최근 대국·
              오프닝별 승률까지 다 표시하면 내용이 너무 길어져 로그아웃 버튼이 화면 아래로 밀려났다 —
              여기서는 chess.com 정보를 빼고, 자세한 내용은 위 화살표 버튼으로 여는 프로필 창에서 보게 한다. */}
          <PublicProfileStats pub={myPub} hideChesscom
            onOpenOpening={onOpenOpening && ((n) => { setOpen(false); onOpenOpening(n); })}
            onOpenGame={onOpenGame && ((m) => { setOpen(false); onOpenGame(m); })}
            onOpenGameAnalyze={onOpenGameAnalyze && ((m) => { setOpen(false); onOpenGameAnalyze(m); })}
            onOpenPuzzle={onOpenPuzzle && ((id, fallback) => { setOpen(false); onOpenPuzzle(id, fallback); })}
            mySolved={mySolved} myLineSolves={myLineSolves} ownerUid={myUid} viewerUid={myUid}
            likedPuzzles={likedPuzzles} likeCounts={likeCounts} onToggleLike={onToggleLike} repostedPuzzles={repostedPuzzles} repostCounts={repostCounts} onToggleRepost={onToggleRepost} shareCounts={shareCounts} onShare={onShare}
          />
          {/* (v0.4.3 기능, 사용자 요청) 로그인 수단 연결/해제·로그아웃·계정 탈퇴를 한 곳에서 다루는
              계정 센터로 가는 입구. */}
          <button onClick={() => { setOpen(false); onOpenAccountCenter(); }} className="press" style={{ width: "100%", textAlign: "center", padding: "9px 12px", borderRadius: 9, background: T.ebony2, border: "1px solid #000", color: T.ivory, fontWeight: 800, fontSize: 12.5, cursor: "pointer", marginBottom: 8, display: "flex", alignItems: "center", justifyContent: "center", gap: 6 }}>{tx("{0}계정 센터", <Settings size={14} />)}</button>
          <button onClick={() => { setOpen(false); onLogoutClick(); }} className="press" style={{ width: "100%", textAlign: "center", padding: "9px 12px", borderRadius: 9, background: "transparent", border: "1px solid " + T.blunder, color: T.blunder, fontWeight: 800, fontSize: 12.5, cursor: "pointer" }}>{t("로그아웃")}</button>
        </div>
      )}
    </div>
  );
}
// (v0.2.9 디자인) 티어 승급 팝업의 "폭죽" — 카드 여섯 곳(TIER_FIREWORK_SPOTS)에서 시차를 두고 하나씩
// 순서대로 터진다. 매 지점의 파티클 각도·거리·크기(TIER_FIREWORK_PARTICLES)는 고정 배열이라 폭죽
// 하나하나의 "모양"은 같지만, 위치와 시작 시점이 다 달라 실제로는 매번 다른 폭죽처럼 보인다.
const TIER_FIREWORK_PARTICLES = [
  { angle: 0, radius: 34, size: 5 }, { angle: 45, radius: 46, size: 4 }, { angle: 90, radius: 30, size: 6 },
  { angle: 135, radius: 42, size: 3 }, { angle: 180, radius: 36, size: 5 }, { angle: 225, radius: 48, size: 4 },
  { angle: 270, radius: 32, size: 6 }, { angle: 315, radius: 44, size: 3 },
];
const TIER_FIREWORK_SPOTS = [
  { left: "16%", top: "14%", delay: 0 },
  { left: "84%", top: "16%", delay: 320 },
  { left: "10%", top: "50%", delay: 640 },
  { left: "90%", top: "52%", delay: 960 },
  { left: "22%", top: "86%", delay: 1280 },
  { left: "78%", top: "84%", delay: 1600 },
];
// (디자인) 일반 티어는 그 티어의 짙은(.lo) 색 위주로 채도·명도를 확보하고(밝은 .hi색은 골드·실버처럼
// 밝은 카드 배경과 비슷한 톤이면 묻혀 보여서 뺐다) 짙은 잉크색 스파크로 대비를 준다. 그랜드마스터는
// 사용자 요청대로 그 홀로그램 그러데이션에서 색을 "스포이드로 여러 개 따서"(3색 stops + 금색·잉크색
// 스파크) 더 화려하게 만든다.
function fireworkColorsFor(tierKey) {
  if (tierKey === "grandmaster") return [...TIER_COLORS.grandmaster.stops, "#D98A2B", T.ink];
  const c = TIER_COLORS[tierKey];
  const hex = (c && c.lo) || "#8A6428";
  return [hex, hex, T.ink];
}
// (v0.1.1) 티어(대분류)가 실제로 바뀔 때 전체 화면을 덮는 승급 연출 — 반투명 검은 배경으로 화면을
// 어둡게 가리고, 그 위에서 이전 티어 이미지가 좌우로 살짝 흔들리다 왼쪽 바깥으로 밀려나며, 오른쪽
// 바깥에서 새 티어 이미지가 들어와 가운데 자리를 대신한다(각 단계 시간은 phase별 setTimeout으로
// 순서대로 넘긴다). 배경을 눌러도 언제든 바로 스킵하고 닫을 수 있다.
// (v0.2.9 디자인) 사용자 요청 — 일일 퀘스트 클리어 팝업과 비슷하게, 이 승급 연출도 맨 텍스트+이미지
// 대신 카드형 "팝업 창"에 담고 추가 장식을 더해 달라는 것. 기존 흔들림→퇴장→등장 애니메이션과 반투명
// 배경(rgba(6,3,1,.75))은 그대로 두고, 그 위에 카드(라운드 코너·테두리·그림자)를 얹었다. 카드 안
// 장식(햇살·발광 펄스·제목 그러데이션)은 도달한 티어 고유 색(TIER_COLORS)으로 물들여, 예를 들어
// 다이아몬드 승급은 시안 톤으로, 마스터 승급은 보라 톤으로 승급마다 다른 색감이 느껴지게 했다 —
// 퀘스트 팝업의 반짝임·컨페티(QUEST_CLEAR_SPARKLES/CONFETTI)는 그대로 재사용해 "이 앱의 축하 연출"
// 이라는 공통 언어는 유지한다. 예전엔 승급 보상(+N 코인)이 이 오버레이(zIndex 200)에 완전히 가려진
// 별도 토스트(zIndex 65)로만 표시돼 사실상 안 보였는데, 이제 카드 안에 직접 보여준다.
export function TierUpOverlay({ fromTierKey, fromDivision, toTierKey, toDivision, reward, onDone }) {
  const [phase, setPhase] = useState("shake"); // shake(흔들림) -> exit(퇴장) -> enter(새 티어 등장)
  // (v0.2.9 디자인) 사용자 요청 — 폭죽이 처음부터 다 같이 뜨지 않고, 기물 교체 애니메이션(흔들림→
  // 퇴장→등장, 등장 슬라이드 자체도 0.5초 걸림)이 완전히 끝난 뒤에야 터지기 시작해야 한다. enter로
  // phase가 바뀌는 1050ms에 그 슬라이드가 막 시작되므로, 슬라이드가 끝나는 시점(+0.5s)보다 살짝
  // 뒤인 1650ms에 켠다.
  const [fireworksOn, setFireworksOn] = useState(false);
  // (v0.2.9 기능) 사용자 요청 — 자동으로 닫히거나 배경을 눌러 실수로 닫히지 않고, 우측 상단 X 버튼을
  // 눌러야만 닫히도록 바꿨다. 기존엔 4초 뒤 자동으로 닫히는 타이머(onDone)와 배경 전체를 덮는
  // onClick={onDone}이 있었는데 둘 다 없앴다 — 폭죽이 다 터지는 데 시간이 걸려도(마지막 폭죽이
  // 1650+1600=3250ms에 시작) 사용자가 직접 닫기 전까지 서두르지 않고 계속 볼 수 있다.
  useEffect(() => {
    const t1 = setTimeout(() => setPhase("exit"), 650);
    const t2 = setTimeout(() => setPhase("enter"), 1050);
    const t3 = setTimeout(() => setFireworksOn(true), 1650);
    return () => { clearTimeout(t1); clearTimeout(t2); clearTimeout(t3); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const glowHex = tierGlowHex(toTierKey);
  const toLabel = (TIERS.find((t) => t.key === toTierKey) || {}).label || "";
  const fireColors = fireworkColorsFor(toTierKey);
  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 200, background: "rgba(6,3,1,.75)", display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}>
      {/* (v0.2.9 디자인) 사용자 요청 — 어두운 카드 대신 MILKU 마스코트 톤의 밝은 종이색(T.paper·T.ivoryHi
          계열)으로 바꿨다. 어두운 배경 전제로 골랐던 글자·장식 색(T.ivory 계열, 옅은 tier hi색 등)도
          전부 밝은 카드에서 읽히도록 다시 골랐다 — tierGlowHex가 이제 더 짙고 채도 높은 tier .lo색을
          돌려주도록 바꿔, 실버처럼 거의 흰색인 .hi색이 밝은 카드 위에서 안 보이는 문제도 함께 없앴다. */}
      <motion.div initial={{ opacity: 0, scale: 0.85, y: 10 }} animate={{ opacity: 1, scale: 1, y: 0 }} transition={{ type: "spring", stiffness: 320, damping: 22 }}
        style={{ position: "relative", width: "100%", maxWidth: 340, borderRadius: 22, overflow: "hidden", padding: "30px 20px 26px", display: "flex", flexDirection: "column", alignItems: "center", background: "radial-gradient(130% 120% at 50% -10%,#FFFDF7 0%,#F1E6D0 70%)", border: "1px solid #DCCBA8", boxShadow: "0 20px 50px -10px rgba(0,0,0,.6)" }}>
        <button onClick={onDone} aria-label={t("닫기")} className="press" style={{ position: "absolute", top: 10, right: 10, zIndex: 10, width: 26, height: 26, borderRadius: 8, border: "none", background: "#0002", color: T.ink, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}><X size={13} /></button>
        {/* (v0.2.9 디자인) 사용자 피드백 — 뒤에서 돌아가던 부채꼴 햇살이 "풍차 같다"는 지적으로 제거했다.
            위에서 떨어지는 색종이 컨페티도 이 카드와 안 어울린다는 이전 피드백으로 이미 뺐고, 대신
            기물 교체가 다 끝난 뒤(fireworksOn) 카드 곳곳에서 하나씩 순서대로 터지는 진짜 "폭죽"만
            남긴다. 각 지점(TIER_FIREWORK_SPOTS)의 파티클(TIER_FIREWORK_PARTICLES)은 CSS 커스텀
            프로퍼티(--dx/--dy)로 각자 다른 방향·거리로 튀어나가고, animationFillMode:"both"라 자기
            차례(그 지점의 delay)가 오기 전에는 완전히 숨어 있다가 터진 뒤엔 다시 사라진 채로 남는다. */}
        {fireworksOn && TIER_FIREWORK_SPOTS.map((spot, si) => (
          <div key={si} aria-hidden="true" style={{ position: "absolute", left: spot.left, top: spot.top, width: 0, height: 0 }}>
            {TIER_FIREWORK_PARTICLES.map((p, pi) => {
              const rad = (p.angle * Math.PI) / 180;
              const dx = Math.round(Math.cos(rad) * p.radius);
              const dy = Math.round(Math.sin(rad) * p.radius);
              return (
                <span key={pi} style={{ position: "absolute", left: 0, top: 0, width: p.size, height: p.size, borderRadius: "50%", background: fireColors[(si + pi) % fireColors.length], "--dx": dx + "px", "--dy": dy + "px", animationName: "tierFirework", animationDuration: ".7s", animationTimingFunction: "ease-out", animationDelay: spot.delay + "ms", animationIterationCount: 1, animationFillMode: "both" }} />
              );
            })}
          </div>
        ))}
        {QUEST_CLEAR_SPARKLES.map((p, i) => (
          <Sparkles key={i} size={p.size} style={{ position: "absolute", left: p.left, top: p.top, color: glowHex, animationName: "xpStarPop", animationDuration: "1.3s", animationTimingFunction: "ease", animationDelay: p.delay, animationIterationCount: 1, animationFillMode: "forwards" }} />
        ))}
        <div style={{ position: "relative", fontFamily: GAME_FONT, fontSize: 21, fontWeight: 400, letterSpacing: ".01em", marginBottom: 10, background: tierGradientCss(toTierKey), WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent", backgroundClip: "text", filter: "drop-shadow(0 2px 2px rgba(0,0,0,.35))" }}>{t("티어 승급")}</div>
        {/* (버그 수정) 기물 이미지 자체가 흰색/밝은 선화라 카드를 밝은 색으로 바꾸자 거의 안 보이게
            됐다(그랜드마스터만 홀로그램 다색이라 그나마 보임) — 사이트 전역 배경과 같은 톤의 짙은
            원판을 기물 전용 "무대"로 깔아, 카드는 밝게 유지하면서 기물만 원래처럼 잘 보이게 한다. */}
        <div style={{ position: "relative", width: 220, height: 220, borderRadius: "50%", background: "radial-gradient(130% 130% at 50% 35%,#3A2610 0%,#150C06 75%)", border: "1px solid rgba(196,154,80,.35)", boxShadow: "inset 0 2px 8px rgba(0,0,0,.4), 0 8px 20px -6px rgba(0,0,0,.35)" }}>
          <div style={{ position: "absolute", inset: 10 }}>
            {/* 숨쉬듯 부풀었다 가라앉는 발광 — 기물 이미지 뒤에서 도달한 티어 색으로. */}
            <div aria-hidden="true" style={{ position: "absolute", left: "50%", top: "50%", width: 190, height: 190, transform: "translate(-50%,-50%)", borderRadius: "50%", background: "radial-gradient(circle," + glowHex + "77 0%, transparent 72%)", animationName: "tierGlowPulse", animationDuration: "1.8s", animationTimingFunction: "ease-in-out", animationIterationCount: "infinite" }} />
            <AnimatePresence>
              {phase !== "enter" && (
                <motion.img
                  key="from"
                  src={tierPieceSrc(fromTierKey, fromDivision)}
                  alt=""
                  initial={{ x: 0, opacity: 1 }}
                  animate={phase === "shake" ? { x: [0, -16, 16, -12, 12, -5, 5, 0] } : { x: -260, opacity: 0 }}
                  transition={phase === "shake" ? { duration: 0.6, ease: "easeInOut" } : { duration: 0.4, ease: "easeIn" }}
                  style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "contain" }}
                />
              )}
              {phase === "enter" && (
                <motion.img
                  key="to"
                  src={tierPieceSrc(toTierKey, toDivision)}
                  alt=""
                  initial={{ x: 260, opacity: 0 }}
                  animate={{ x: 0, opacity: 1 }}
                  transition={{ duration: 0.5, ease: "easeOut" }}
                  style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "contain" }}
                />
              )}
            </AnimatePresence>
          </div>
        </div>
        {toLabel && <div style={{ position: "relative", fontSize: 13.5, fontWeight: 800, color: T.ink, marginTop: 6 }}>{tx("{0} 티어 도달", toLabel)}</div>}
        {reward > 0 && (
          <div className="flex items-center justify-center flex-wrap" style={{ gap: 8, marginTop: 12 }}>
            <span className="flex items-center gap-1" style={{ position: "relative", fontSize: 13, fontWeight: 800, color: T.brassHi, padding: "6px 14px", borderRadius: 999, background: "rgba(196,154,80,.12)", border: "1px solid " + T.brass, animationName: "questBadgePop", animationDuration: ".5s", animationTimingFunction: "cubic-bezier(.34,1.56,.64,1)", animationDelay: ".55s", animationFillMode: "backwards" }}><CoinIcon size={19} />+{tx("{0} OC 나이트 코인", <AnimatedCountUp to={reward} />)}</span>
          </div>
        )}
        {/* (v0.2.9 기능) 우측 상단 X와 같은 역할의 확인 버튼 — 일일 퀘스트 클리어 팝업과 같은 스타일로,
            눌러야만 닫히는 걸 명확한 CTA로도 한 번 더 보여준다. */}
        <button onClick={onDone} className="press" style={{ position: "relative", width: "100%", display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 6, marginTop: 18, padding: "11px 0", borderRadius: 11, background: "linear-gradient(180deg," + T.brass + ",#A8842F)", color: "#241509", fontWeight: 800, fontSize: 13.5, border: "none", cursor: "pointer" }}>{tx("{0}확인", <Check size={14} strokeWidth={3} />)}</button>
      </motion.div>
    </div>
  );
}
// (v0.4.3 기능) OAuth 시작 — Google 전용이던 것을 provider 인자로 일반화(구글/애플/페이스북 공통).
// GoTrue authorize 로 리다이렉트. 복귀 시 URL 해시에 세션 토큰이 담겨 돌아온다.
function authOAuthStart(provider) {
  if (!SB_ON) return;
  const redirect = window.location.origin + window.location.pathname;
  window.location.href = SB_URL + "/auth/v1/authorize?provider=" + provider + "&redirect_to=" + encodeURIComponent(redirect);
}
const OAUTH_PROVIDER_LABELS = { google: "Google", apple: "Apple", facebook: "Facebook" };
/* OAuth 복귀 해시(access_token 있고 recovery 아님) 파싱 */
export function parseOAuthHash() {
  try {
    const h = (typeof window !== "undefined" && window.location.hash) || "";
    if (h.indexOf("access_token") < 0 || h.indexOf("type=recovery") >= 0) return null;
    const p = new URLSearchParams(h.replace(/^#/, ""));
    const at = p.get("access_token"); if (!at) return null;
    return { access_token: at, refresh_token: p.get("refresh_token") || null };
  } catch { return null; }
}
/* OAuth 해시 → 세션 적용 + 계정 로드. username 이 비어 있으면(최초 구글 로그인) 아이디 설정 필요 */
export async function authFromHash(h) {
  if (!SB_ON) return null;
  setSbToken(h.access_token); saveRefresh(h.refresh_token || null);
  let uid = null;
  try { const r = await fetch(SB_URL + "/auth/v1/user", { headers: sbHeaders() }); if (r.ok) { const u = await r.json(); uid = (u && u.id) || null; } } catch { }
  if (!uid) { clearSession(); return null; }
  return await loadAccount(uid);
}
/* 최초 구글 로그인 후 아이디 확정 → profiles 행 생성(기존 username 체계 공유) */
async function claimUsername(uid, username) {
  if (!SB_ON || !uid) return { ok: false, error: "offline" };
  const uname = (username || "").toLowerCase();
  if (!ALNUM.test(uname) || uname.length < 3 || uname.length > 20) return { ok: false, error: "invalid" };
  // 서버측 원자적 확정: claim_username 은 auth.uid() 로 본인 행을 만들고, 타인이 쓰는 아이디면 'taken' 반환.
  // 동시성 레이스는 username UNIQUE 제약으로 차단. 예외/예상외 응답이면 진행하지 않음(fail-closed → 도용 불가).
  try {
    const res = await sbRpc("claim_username", { p_username: uname });
    const v = Array.isArray(res) ? res[0] : res;
    if (v === "ok" || v === "already") return { ok: true };
    if (v === "taken") return { ok: false, error: "username_taken" };
    if (v === "invalid") return { ok: false, error: "invalid" };
    return { ok: false, error: "failed" };
  } catch { return { ok: false, error: "failed" }; }
}
export function UsernameSetupModal({ account, onDone, onCancel }) {
  const [id, setId] = useState(""); const [err, setErr] = useState(""); const [busy, setBusy] = useState(false);
  const [ccId, setCcId] = useState(""); // (18차 UX6) Google 최초 가입 시에도 chess.com 아이디를 함께 입력(선택)
  const submit = async () => {
    setErr("");
    if (!ALNUM.test(id) || id.length < 3 || id.length > 20) { setErr(t("아이디는 영문+숫자 3~20자")); return; }
    setBusy(true);
    try {
      const r = await claimUsername(account.uid, id);
      if (!r.ok) { setErr(r.error === "username_taken" ? t("이미 사용 중인 아이디") : r.error === "invalid" ? t("아이디 형식이 올바르지 않음") : t("처리 중 오류 발생")); setBusy(false); return; }
      // (버그 수정) AuthModal의 이메일 가입 경로와 같은 문제 — 여기서도 chess.com 아이디를 검증 없이
      // 사용자가 입력한 원형 그대로 저장하고 있었다. fetchChesscomProfile로 실제 계정의 정확한
      // 대소문자를 조회해 저장하고, 조회 실패 시에만 입력한 원형을 그대로 대체값으로 쓴다.
      const ccRaw = ccId.trim();
      let ccFinal = ccRaw;
      if (ccRaw) { try { const p = await fetchChesscomProfile(ccRaw); ccFinal = p.username; } catch { } }
      onDone({ uid: account.uid, username: id.toLowerCase(), pub: { ...(account.pub || {}), displayId: id.trim(), ...(ccFinal ? { chesscom: ccFinal } : {}) }, progress: account.progress || {} });
    } catch { setErr(t("처리 중 오류 발생")); setBusy(false); }
  };
  // (17차) box-sizing 기본값(content-box)에서 width:100%에 padding/border가 더해져 입력 박스가
  // 모달 바깥으로 삐져나오던 버그 — border-box로 명시.
  const inputStyle = { width: "100%", padding: "10px 12px", borderRadius: 9, border: "1px solid #C9B58C", marginBottom: 8, background: "#fff", color: T.ink, boxSizing: "border-box" };
  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.6)", zIndex: 90, display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}>
      <div style={{ width: "100%", maxWidth: 340, background: "linear-gradient(180deg,#F2E8D5,#E2D2B2)", borderRadius: 16, padding: 20, border: "1px solid #CDB98E", boxShadow: "0 20px 50px -10px rgba(0,0,0,.7)" }}>
        <div className="flex items-center justify-between" style={{ marginBottom: 8 }}>
          <div style={{ fontSize: 17, fontWeight: 800, color: T.ink }}>{t("아이디 설정")}</div>
          <button onClick={onCancel} className="press" style={{ width: 28, height: 28, borderRadius: 8, border: "none", background: "#0002", color: T.ink, cursor: "pointer" }}>✕</button>
        </div>
        <p style={{ fontSize: 12.5, color: T.inkSoft, lineHeight: 1.5, marginBottom: 12 }}>{t("Google 계정으로 첫 로그인. 친구 검색·프로필에 표시될 아이디 설정")}</p>
        <input value={id} onChange={(e) => setId(e.target.value)} placeholder={t("아이디 (영문+숫자 3~20자)")} autoComplete="username" onKeyDown={(e) => e.key === "Enter" && submit()} style={inputStyle} />
        <input value={ccId} onChange={(e) => setCcId(e.target.value)} placeholder={t("chess.com 아이디 (선택)")} onKeyDown={(e) => e.key === "Enter" && submit()} style={inputStyle} />
        <p style={{ fontSize: 10.5, color: T.inkSoft, margin: "-2px 0 8px" }}>{t("chess.com 아이디는 생략 가능, 나중에 설정 탭에서 변경")}</p>
        {err && <div style={{ fontSize: 12, color: T.blunder, marginBottom: 8 }}>{err}</div>}
        <button onClick={submit} disabled={busy} className="press" style={{ width: "100%", padding: "11px 0", borderRadius: 10, background: "linear-gradient(180deg,#3A2516,#241509)", color: T.ivoryHi, fontWeight: 800, border: "none", cursor: "pointer" }}>{busy ? t("설정 중…") : t("시작하기")}</button>
        <div style={{ textAlign: "center", marginTop: 8 }}><button onClick={onCancel} style={{ color: T.inkSoft, fontSize: 12, background: "none", border: "none", cursor: "pointer", textDecoration: "underline" }}>{t("취소하고 로그아웃")}</button></div>
      </div>
    </div>
  );
}
export function AuthModal({ onClose, onAuth, initialMode }) {
  const [mode, setMode] = useState(initialMode || "login");
  const [email, setEmail] = useState(""); const [id, setId] = useState(""); const [pw, setPw] = useState("");
  const [chesscomId, setChesscomId] = useState(""); // (17차) 회원가입 시 선택 입력하는 chess.com 아이디
  const [err, setErr] = useState(""); const [busy, setBusy] = useState(false); const [sent, setSent] = useState(false);
  const [pw2, setPw2] = useState(""); const [showPw, setShowPw] = useState(false);
  // (v0.4.3 기능) 구글 전용이던 힌트를 일반화 — 이 이메일이 실제로 가입된 다른 OAuth 제공자 이름을
  // 그대로 담는다("google"|"apple"|"facebook"|null).
  const [hintProvider, setHintProvider] = useState(null);
  const submit = async () => {
    setErr(""); setHintProvider(null);
    if (mode === "reset") {
      const who = email.trim();
      if (!who) { setErr(t("아이디 또는 이메일 입력 필요")); return; }
      setBusy(true);
      try { await authRecover(who); } catch { }
      setBusy(false); setSent(true);
      return;
    }
    const isEmail = email.includes("@");
    const em = email.trim();
    if (mode === "signup" && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(em)) { setErr(t("올바른 이메일 입력 필요")); return; }
    if (mode === "login" && !em) { setErr(t("아이디 또는 이메일 입력 필요")); return; }
    if (pw.length < 6) { setErr(t("비밀번호는 6자 이상")); return; }
    if (mode === "signup") {
      if (!ALNUM.test(id) || id.length < 3 || id.length > 20) { setErr(t("아이디는 영문+숫자 3~20자")); return; }
      if (pw !== pw2) { setErr(t("비밀번호 불일치")); return; }
    }
    setBusy(true);
    try {
      if (mode === "signup") {
        const r = await authSignup(em, pw, id);
        if (!r || !r.ok) {
          if (r && r.error === "email_taken") {
            const provs = await accountProviders(em);
            const other = ["google", "apple", "facebook"].find((p) => provs.indexOf(p) >= 0 && provs.indexOf("email") < 0);
            if (other) { const lb = OAUTH_PROVIDER_LABELS[other]; setHintProvider(other); setErr(t("이 이메일은 {0} 계정으로 가입됨. 아래 ‘{1}로 계속하기’로 로그인", lb, lb)); setBusy(false); return; }
            setErr(t("이미 가입된 이메일. 로그인 필요")); setBusy(false); return;
          }
          setErr(r && r.error === "username_taken" ? t("이미 사용 중인 아이디")
            : r && r.error === "confirm_required" ? t("확인 메일 발송. 인증 후 로그인")
            : r && r.error === "offline" ? t("서버 연결 필요")
            : t("가입 처리 중 오류 발생"));
          setBusy(false); return;
        }
        // (17차) 회원가입 시 chess.com 아이디도 함께 입력받는다(생략 가능, 나중에 설정에서 변경 가능).
        // (버그 수정) 존재 여부를 확인조차 하지 않고 무조건 소문자로 저장했었다 — chess.com의 실제
        // 표시 대소문자(예: "Hikaru")를 전혀 반영하지 못하고 항상 전부 소문자로만 보이는 원인이었다.
        // fetchChesscomProfile로 실제 계정의 정확한 대소문자를 조회해 저장하고, 조회 실패(오프라인·
        // 아직 안 만든 계정 등)했을 때만 사용자가 입력한 원형을 그대로 대체값으로 쓴다 — 이 경우에도
        // 강제로 소문자화하지는 않는다(가입 자체를 이 조회 실패로 막지 않기 위해 결과를 기다리되 실패는 무시).
        const ccRaw = chesscomId.trim();
        let ccId = ccRaw;
        if (ccRaw) { try { const p = await fetchChesscomProfile(ccRaw); ccId = p.username; } catch { } }
        if (ccId && r.account) r.account.pub = { ...(r.account.pub || {}), chesscom: ccId, chesscomChangedAt: Date.now() };
        onAuth(r.account);
      } else {
        const r = await authLogin(em, pw);
        if (!r || !r.ok) {
          if (r && r.error === "offline") { setErr(t("서버 연결 필요")); setBusy(false); return; }
          const probe = (r && r.email) || (isEmail ? em : "");
          if (probe) {
            const provs = await accountProviders(probe);
            const other = ["google", "apple", "facebook"].find((p) => provs.indexOf(p) >= 0 && provs.indexOf("email") < 0);
            if (other) { const lb = OAUTH_PROVIDER_LABELS[other]; setHintProvider(other); setErr(t("이 계정은 {0}로 가입됨. 아래 ‘{1}로 계속하기’로 로그인", lb, lb)); setBusy(false); return; }
          }
          setErr(t("아이디/이메일 또는 비밀번호가 올바르지 않음")); setBusy(false); return;
        }
        onAuth(r.account);
      }
    } catch { setErr(t("처리 중 오류 발생")); }
    setBusy(false);
  };
  // (17차) box-sizing 기본값(content-box)에서 width:100%에 padding/border가 더해져 입력 박스가
  // 모달 바깥으로 삐져나오던 버그 — border-box로 명시.
  const inputStyle = { width: "100%", padding: "10px 12px", borderRadius: 9, border: "1px solid #C9B58C", marginBottom: 8, background: "#fff", color: T.ink, boxSizing: "border-box" };
  const title = mode === "login" ? t("로그인") : mode === "signup" ? t("회원가입") : t("비밀번호 찾기");
  return (
    <motion.div
      onClick={onClose}
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.18 }}
      style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.6)", zIndex: 80, display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}
    >
      <motion.div
        onClick={(e) => e.stopPropagation()}
        initial={{ opacity: 0, y: 16, scale: 0.97 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: 10, scale: 0.97 }}
        transition={{ type: "spring", stiffness: 340, damping: 28 }}
        style={{ position: "relative", width: "100%", maxWidth: 340, background: "linear-gradient(180deg,#F2E8D5,#E2D2B2)", borderRadius: 16, padding: 20, border: "1px solid #CDB98E", boxShadow: "0 20px 50px -10px rgba(0,0,0,.7)" }}
      >
        {/* (UI6) 창 닫기 버튼은 항상 블록 우상단 고정 */}
        <button onClick={onClose} className="press" style={{ position: "absolute", top: 12, right: 12, zIndex: 10, width: 28, height: 28, borderRadius: 8, border: "none", background: "#0002", color: T.ink, cursor: "pointer" }}>✕</button>
        {/* (디자인) 로그인/회원가입 창의 마스코트 캐릭터 대신 OpenChess 로고를 표시 — 학습·퍼즐 탭
            바깥에서는 마스코트를 쓰지 않는다는 원칙에 맞춘다. */}
        <div style={{ display: "flex", justifyContent: "center", marginBottom: 14, marginTop: 4 }}>
          {/* (버그 수정) 로고 이미지의 투명 여백을 잘라낸 뒤로는 height 값이 곧 실제 크기이므로 줄인다. */}
          <img src="/OpenChessLogo.png" alt="OpenChess" style={{ display: "block", height: 30, width: "auto" }} />
        </div>
        <div style={{ marginBottom: 14, paddingRight: 30 }}>
          <div style={{ fontSize: 17, fontWeight: 800, color: T.ink }}>{title}</div>
        </div>
        {mode === "reset" ? (sent ? (
          <>
            <p style={{ fontSize: 13, color: T.ink, fontWeight: 600, lineHeight: 1.6, marginBottom: 14 }}>{t("입력한 계정이 존재하면 연동된 이메일로 재설정 링크 발송. 스팸함 포함 메일함 확인")}</p>
            <button onClick={() => { setMode("login"); setSent(false); setErr(""); setPw(""); }} className="press" style={{ width: "100%", padding: "11px 0", borderRadius: 10, background: "linear-gradient(180deg,#3A2516,#241509)", color: T.ivoryHi, fontWeight: 800, border: "none", cursor: "pointer" }}>{t("로그인으로 돌아가기")}</button>
          </>
        ) : (
          <>
            <p style={{ fontSize: 12, color: T.inkSoft, lineHeight: 1.5, marginBottom: 10 }}>{t("가입 시 사용한 아이디 또는 이메일 입력. 연동된 이메일로 재설정 링크 발송")}</p>
            <input value={email} onChange={(e) => setEmail(e.target.value)} placeholder={t("아이디 또는 이메일")} autoComplete="username" onKeyDown={(e) => e.key === "Enter" && submit()} style={inputStyle} />
            {err && <div style={{ fontSize: 12, color: T.blunder, marginBottom: 8 }}>{err}</div>}
            <button onClick={submit} disabled={busy} className="press" style={{ width: "100%", padding: "11px 0", borderRadius: 10, background: "linear-gradient(180deg,#3A2516,#241509)", color: T.ivoryHi, fontWeight: 800, border: "none", cursor: "pointer", marginBottom: 10 }}>{busy ? t("보내는 중…") : t("재설정 메일 보내기")}</button>
            <div style={{ textAlign: "center", fontSize: 12.5, color: T.inkSoft }}>
              <button onClick={() => { setMode("login"); setErr(""); }} style={{ color: "#5A3A22", fontWeight: 800, background: "none", border: "none", cursor: "pointer", textDecoration: "underline" }}>{t("로그인으로 돌아가기")}</button>
            </div>
          </>
        )) : (
          <>
            <input value={email} onChange={(e) => setEmail(e.target.value)} placeholder={mode === "login" ? t("아이디 또는 이메일") : t("이메일")} type={mode === "login" ? "text" : "email"} autoComplete={mode === "login" ? "username" : "email"} onKeyDown={(e) => e.key === "Enter" && submit()} style={inputStyle} />
            {mode === "signup" && <input value={id} onChange={(e) => setId(e.target.value)} placeholder={t("아이디 (영문+숫자 3~20자, 공개 표시)")} style={inputStyle} />}
            {mode === "signup" && <input value={chesscomId} onChange={(e) => setChesscomId(e.target.value)} placeholder={t("chess.com 아이디 (선택, 나중에 변경 가능)")} autoComplete="off" style={inputStyle} />}
            <div style={{ position: "relative" }}>
              <input type={showPw ? "text" : "password"} value={pw} onChange={(e) => setPw(e.target.value)} placeholder={t("비밀번호 (6자 이상)")} autoComplete={mode === "login" ? "current-password" : "new-password"} onKeyDown={(e) => e.key === "Enter" && submit()} style={{ ...inputStyle, paddingRight: 40 }} />
              <button type="button" onClick={() => setShowPw((v) => !v)} aria-label={showPw ? t("비밀번호 숨기기") : t("비밀번호 보이기")} title={showPw ? t("비밀번호 숨기기") : t("비밀번호 보이기")} style={{ position: "absolute", right: 6, top: 5, width: 30, height: 30, display: "flex", alignItems: "center", justifyContent: "center", background: "none", border: "none", cursor: "pointer", color: T.inkSoft }}>{showPw ? <EyeOff size={17} /> : <Eye size={17} />}</button>
            </div>
            {mode === "signup" && <input type={showPw ? "text" : "password"} value={pw2} onChange={(e) => setPw2(e.target.value)} placeholder={t("비밀번호 확인")} autoComplete="new-password" onKeyDown={(e) => e.key === "Enter" && submit()} style={inputStyle} />}
            {err && <div style={{ fontSize: 12, color: hintProvider ? T.ink : T.blunder, marginBottom: 8, lineHeight: 1.5, fontWeight: hintProvider ? 700 : 400 }}>{err}</div>}
            <button onClick={submit} disabled={busy} className="press" style={{ width: "100%", padding: "11px 0", borderRadius: 10, background: "linear-gradient(180deg,#3A2516,#241509)", color: T.ivoryHi, fontWeight: 800, border: "none", cursor: "pointer", marginBottom: 10 }}>{busy ? t("처리 중…") : (mode === "login" ? t("로그인") : t("가입하고 시작"))}</button>
            {mode === "signup" && <p style={{ fontSize: 11, color: T.inkSoft, lineHeight: 1.6, margin: "0 0 10px", textAlign: "center" }}>{tx("가입 시 {0}·{1}에 동의로 간주", <a href="/terms" target="_blank" rel="noopener noreferrer" style={{ color: "#5A3A22", fontWeight: 800 }}>{t("이용약관")}</a>, <a href="/privacy" target="_blank" rel="noopener noreferrer" style={{ color: "#5A3A22", fontWeight: 800 }}>{t("개인정보처리방침")}</a>)}</p>}
            <div style={{ display: "flex", alignItems: "center", gap: 8, margin: "2px 0 10px" }}><div style={{ flex: 1, height: 1, background: "#C9B58C" }} /><span style={{ fontSize: 11, color: T.inkSoft }}>{t("또는")}</span><div style={{ flex: 1, height: 1, background: "#C9B58C" }} /></div>
            {/* (v0.4.3 기능, 사용자 요청) Apple/Facebook 로그인 추가 — Google과 완전히 같은 방식(GoTrue
                authorize 리다이렉트, provider 이름만 다름)이라 authOAuthStart(provider) 하나로 통일했다. */}
            <button onClick={() => authOAuthStart("google")} className="press" style={{ width: "100%", padding: "10px 0", borderRadius: 10, background: "#fff", color: "#3c4043", fontWeight: 700, border: "1px solid #CDB98E", cursor: "pointer", marginBottom: 8, display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}>{tx("{0} Google로 계속하기", <GoogleG />)}</button>
            <button onClick={() => authOAuthStart("apple")} className="press" style={{ width: "100%", padding: "10px 0", borderRadius: 10, background: "#000", color: "#fff", fontWeight: 700, border: "none", cursor: "pointer", marginBottom: 8, display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}>{tx("{0} Apple로 계속하기", <AppleLogo />)}</button>
            <button onClick={() => authOAuthStart("facebook")} className="press" style={{ width: "100%", padding: "10px 0", borderRadius: 10, background: "#1877F2", color: "#fff", fontWeight: 700, border: "none", cursor: "pointer", marginBottom: 10, display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}>{tx("{0} Facebook으로 계속하기", <FacebookLogo />)}</button>
            {mode === "login" && <div style={{ textAlign: "center", marginBottom: 8 }}><button onClick={() => { setMode("reset"); setErr(""); setSent(false); setPw(""); }} style={{ color: T.inkSoft, fontSize: 12, background: "none", border: "none", cursor: "pointer", textDecoration: "underline" }}>{t("비밀번호 찾기")}</button></div>}
            <div style={{ textAlign: "center", fontSize: 12.5, color: T.inkSoft }}>
              {mode === "login" ? t("계정이 없나요? ") : t("이미 계정이 있나요? ")}
              <button onClick={() => { setMode(mode === "login" ? "signup" : "login"); setErr(""); setHintProvider(null); setPw2(""); }} style={{ color: "#5A3A22", fontWeight: 800, background: "none", border: "none", cursor: "pointer", textDecoration: "underline" }}>{mode === "login" ? t("회원가입") : t("로그인")}</button>
            </div>
            <p style={{ fontSize: 10.5, color: T.inkSoft, marginTop: 10, lineHeight: 1.4 }}>{t("이메일·비밀번호로 가입. 아이디는 친구 검색·프로필에 공개 표시, 진도(도감·해결한 퍼즐)는 계정에 저장")}</p>
          </>
        )}
      </motion.div>
    </motion.div>
  );
}
export function NewPasswordModal({ recovery, onDone, onClose }) {
  const [pw, setPw] = useState(""); const [pw2, setPw2] = useState("");
  const [err, setErr] = useState(""); const [busy, setBusy] = useState(false);
  const submit = async () => {
    setErr("");
    if (pw.length < 6) { setErr(t("비밀번호는 6자 이상")); return; }
    if (pw !== pw2) { setErr(t("비밀번호 불일치")); return; }
    setBusy(true);
    try { const r = await authSetPassword(recovery, pw); if (!r.ok) { setErr(t("재설정 실패. 링크가 만료되었을 수 있음")); setBusy(false); return; } onDone(r.account || null); }
    catch { setErr(t("처리 중 오류 발생")); setBusy(false); }
  };
  // (17차) box-sizing 기본값(content-box)에서 width:100%에 padding/border가 더해져 입력 박스가
  // 모달 바깥으로 삐져나오던 버그 — border-box로 명시.
  const inputStyle = { width: "100%", padding: "10px 12px", borderRadius: 9, border: "1px solid #C9B58C", marginBottom: 8, background: "#fff", color: T.ink, boxSizing: "border-box" };
  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.6)", zIndex: 90, display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}>
      <div style={{ width: "100%", maxWidth: 340, background: "linear-gradient(180deg,#F2E8D5,#E2D2B2)", borderRadius: 16, padding: 20, border: "1px solid #CDB98E", boxShadow: "0 20px 50px -10px rgba(0,0,0,.7)" }}>
        <div className="flex items-center justify-between" style={{ marginBottom: 14 }}>
          <div style={{ fontSize: 17, fontWeight: 800, color: T.ink }}>{t("새 비밀번호 설정")}</div>
          <button onClick={onClose} className="press" style={{ width: 28, height: 28, borderRadius: 8, border: "none", background: "#0002", color: T.ink, cursor: "pointer" }}>✕</button>
        </div>
        <input type="password" value={pw} onChange={(e) => setPw(e.target.value)} placeholder={t("새 비밀번호 (6자 이상)")} autoComplete="new-password" style={inputStyle} />
        <input type="password" value={pw2} onChange={(e) => setPw2(e.target.value)} placeholder={t("새 비밀번호 확인")} autoComplete="new-password" onKeyDown={(e) => e.key === "Enter" && submit()} style={inputStyle} />
        {err && <div style={{ fontSize: 12, color: T.blunder, marginBottom: 8 }}>{err}</div>}
        <button onClick={submit} disabled={busy} className="press" style={{ width: "100%", padding: "11px 0", borderRadius: 10, background: "linear-gradient(180deg,#3A2516,#241509)", color: T.ivoryHi, fontWeight: 800, border: "none", cursor: "pointer" }}>{busy ? t("설정 중…") : t("비밀번호 변경하고 로그인")}</button>
      </div>
    </div>
  );
}
// (v0.4.3 기능, 사용자 요청) 친구 대국 신청(pvp_invites) 전역 알람 박스 — App 루트에 항상 마운트해
// 두어, 상대가 사이트 안에서 어느 탭·화면에 있든(로그인만 돼 있으면) 상단에 뜬다. 자동으로 사라지지
// 않고 수락·거절하거나(내가) 상대가 취소할 때만(실시간 구독) 닫힌다. 여러 화면에서 각자 따로
// 구독·응답하면 중복 팝업이나 엇갈린 상태가 생기므로, 응답 로직 전체를 여기 한 곳에만 둔다.
export function GlobalPvpInviteBanner({ myUid, onAccepted }) {
  const [invite, setInvite] = useState(null); // { ...pvp_invites 행, fromPub, fromUsername }
  const loadPending = useCallback(async () => {
    if (!myUid) { setInvite(null); return; }
    try {
      const rows = await sbSelect("pvp_invites?to_uid=eq." + myUid + "&status=eq.pending&order=created_at.desc&limit=1");
      const row = rows && rows[0];
      if (!row) { setInvite(null); return; }
      const profiles = await usersProfiles([row.from_uid]);
      setInvite({ ...row, fromPub: (profiles[row.from_uid] || {}).pub || {}, fromUsername: (profiles[row.from_uid] || {}).username });
    } catch { }
  }, [myUid]);
  useEffect(() => { loadPending(); }, [loadPending]);
  // 새로 온 도전장 — 소켓이 끊겼을 때를 대비해 폴백(15초)으로도 다시 확인한다.
  useRealtimeTable("pvp_invites", myUid ? "to_uid=eq." + myUid : null, () => loadPending(), !!myUid, 15000);
  // 지금 보여주는 도전장 자체의 상태 변화(상대가 취소했거나, 다른 화면에서 이미 응답한 경우) 감시 —
  // 상태가 더 이상 pending이 아니면 곧장 닫는다.
  useRealtimeTable("pvp_invites", invite ? "id=eq." + invite.id : null, (payload) => {
    const row = payload && payload.new;
    if (row) { if (row.status !== "pending") setInvite(null); }
    else loadPending();
  }, !!invite, 6000);
  if (!myUid || !invite) return null;
  // (v0.5.0 기능, 사용자 요청) 미니게임 친구 도전장도 이 전역 알람 박스로 똑같이 받는다 — game_type은 문구에만 쓰고,
  // 수락한 대전을 어느 화면으로 열지는 App의 enterPvpGame이 정한다(v0.5.7, BUG-024).
  const specialGame = PLAY_SPECIAL_GAMES.find((g) => g.gameType === invite.game_type);
  const respond = async (accept) => {
    const id = invite.id;
    setInvite(null);
    try {
      const inv = await sbRpc("pvp_invite_respond", { p_invite_id: id, p_accept: accept });
      if (accept && inv && inv.game_id) {
        const rows = await sbSelect("pvp_games?id=eq." + inv.game_id + "&select=*");
        const g = rows && rows[0];
        if (g && onAccepted) onAccepted(g); // 게임 종류별 화면 선택은 App의 enterPvpGame이 한다
      }
    } catch { }
  };
  const tc = timeControlFromKey(invite.time_control);
  return (
    <div style={{ position: "fixed", top: 12, left: "50%", transform: "translateX(-50%)", zIndex: 10090, width: "min(360px, calc(100vw - 24px))" }}>
      <div style={{ padding: "12px 14px", borderRadius: 12, background: "linear-gradient(180deg,#3A2516,#241509)", border: "1px solid " + T.brass, boxShadow: "0 14px 34px -10px rgba(0,0,0,.65)" }}>
        <div className="flex items-center gap-2" style={{ marginBottom: 10 }}>
          {invite.fromPub.photo ? <img src={invite.fromPub.photo} alt="" style={{ width: 30, height: 30, borderRadius: "50%", objectFit: "cover", flexShrink: 0 }} />
            : <span style={{ width: 30, height: 30, borderRadius: "50%", background: "linear-gradient(180deg," + T.brass + ",#A8842F)", color: "#241509", display: "inline-flex", alignItems: "center", justifyContent: "center", fontWeight: 800, flexShrink: 0 }}>{(invite.fromPub.nickname || invite.fromUsername || "?")[0].toUpperCase()}</span>}
          <div style={{ minWidth: 0, fontSize: 12.5, fontWeight: 800, color: T.ivoryHi }}>
            @{tx("{0}님이 {1} 신청{2}", invite.fromUsername || t("누군가"), specialGame ? t("실시간 대결을") : t("대국을"), <span style={{ display: "block", fontSize: 10.5, fontWeight: 700, color: "rgba(244,238,226,.6)", marginTop: 2 }}>{specialGame ? specialGame.name : tc.label + (tc.cat ? " · " + tcCatLabel(tc.cat) : "")}</span>)}
          </div>
        </div>
        <div className="flex gap-2">
          <button onClick={() => respond(true)} className="press" style={{ flex: 1, padding: "8px 0", borderRadius: 8, border: "none", background: "linear-gradient(180deg," + T.brass + ",#A8842F)", color: "#241509", fontWeight: 800, fontSize: 12.5, cursor: "pointer" }}>{t("수락")}</button>
          <button onClick={() => respond(false)} className="press" style={{ flex: 1, padding: "8px 0", borderRadius: 8, border: "1px solid #C9B58C", background: "transparent", color: T.ivoryHi, fontWeight: 800, fontSize: 12.5, cursor: "pointer" }}>{t("거절")}</button>
        </div>
      </div>
    </div>
  );
}
// (v0.5.7, 사용자 요청) 미니게임 재대국 신청 알림 — 상대가 대전 결과 화면에서 "재대국 신청"을 누르면(pvp_rematch_offer), 받은 쪽이
// 어디에 있든(결과 화면을 이미 떠났어도) 화면 맨 위에 수락/거절 알림을 띄운다. 제안은 끝난 대전 행 자체에 기록되므로(rematch_offered_by)
// 내가 참가한 최근 3분 안의 미니게임 대전 중 상대가 제안했고 아직 새 대전이 안 만들어진 것을 찾는다. 수락하면 새 대전으로 곧장 들어간다
// (App의 enterPvpGame이 게임 종류별 화면을 연다). 체스는 결과 팝업 안에 자체 재대결 UI가 있어 제외한다.
export function GlobalMinigameRematchBanner({ myUid, onAccepted }) {
  const [offer, setOffer] = useState(null); // { game, name, photo }
  const [busy, setBusy] = useState(false);
  const hiddenRef = useRef(new Set()); // 이번 세션에서 이미 응답한 제안(같은 제안이 다시 뜨지 않게)
  const load = useCallback(async () => {
    if (!myUid) { setOffer(null); return; }
    try {
      const since = new Date(Date.now() - 3 * 60 * 1000).toISOString();
      const rows = await sbSelect("pvp_games?or=(white_uid.eq." + myUid + ",black_uid.eq." + myUid + ")&status=neq.active&game_type=neq.chess&rematch_offered_by=neq." + myUid + "&rematch_game_id=is.null&updated_at=gt." + encodeURIComponent(since) + "&order=updated_at.desc&limit=1&select=*");
      const g = rows && rows[0];
      if (!g || hiddenRef.current.has(g.id + ":" + g.rematch_offered_by + ":" + g.updated_at)) { setOffer(null); return; }
      const who = g.rematch_offered_by;
      const prof = await usersProfiles([who]);
      const p = prof[who] || {};
      setOffer({ game: g, name: (p.pub && p.pub.nickname) || p.username || t("상대"), photo: (p.pub && p.pub.photo) || null });
    } catch { }
  }, [myUid]);
  useEffect(() => { load(); }, [load]);
  useRealtimeTable("pvp_games", myUid ? "white_uid=eq." + myUid : null, () => load(), !!myUid, 15000);
  useRealtimeTable("pvp_games", myUid ? "black_uid=eq." + myUid : null, () => load(), !!myUid, 15000);
  if (!offer) return null;
  const g = offer.game;
  const special = PLAY_SPECIAL_GAMES.find((x) => x.gameType === g.game_type);
  const hide = () => { hiddenRef.current.add(g.id + ":" + g.rematch_offered_by + ":" + g.updated_at); setOffer(null); };
  const respond = async (accept) => {
    if (busy) return;
    setBusy(true);
    try {
      if (accept) {
        const r = await sbRpc("pvp_rematch_offer", { p_game_id: g.id });
        hide();
        if (r && r.id !== g.id && onAccepted) onAccepted(r);
      } else { await sbRpc("pvp_rematch_decline", { p_game_id: g.id }); hide(); }
    } catch { hide(); }
    setBusy(false);
  };
  return (
    <div style={{ position: "fixed", top: 12, left: "50%", transform: "translateX(-50%)", zIndex: 10091, width: "min(360px, calc(100vw - 24px))" }}>
      <motion.div initial={{ opacity: 0, y: -14 }} animate={{ opacity: 1, y: 0 }} transition={{ type: "spring", stiffness: 420, damping: 30 }}
        style={{ padding: "12px 14px", borderRadius: 12, background: "linear-gradient(180deg,#3A2516,#241509)", border: "1px solid " + T.brass, boxShadow: "0 14px 34px -10px rgba(0,0,0,.65)" }}>
        <div className="flex items-center gap-2" style={{ marginBottom: 10 }}>
          <MgOppBadge opp={{ photo: offer.photo, name: offer.name }} size={30} inline />
          <div style={{ minWidth: 0, fontSize: 12.5, fontWeight: 800, color: T.ivoryHi }}>
            {tx("{0}님이 재대국 신청{1}", offer.name, <span style={{ display: "block", fontSize: 10.5, fontWeight: 700, color: "rgba(244,238,226,.6)", marginTop: 2 }}>{special ? special.name : t("미니게임")}</span>)}
          </div>
        </div>
        <div className="flex gap-2">
          <button onClick={() => respond(true)} disabled={busy} className="press" style={{ flex: 1, padding: "8px 0", borderRadius: 8, border: "none", background: "linear-gradient(180deg," + T.brass + ",#A8842F)", color: "#241509", fontWeight: 800, fontSize: 12.5, cursor: "pointer" }}>{t("수락")}</button>
          <button onClick={() => respond(false)} disabled={busy} className="press" style={{ flex: 1, padding: "8px 0", borderRadius: 8, border: "1px solid #C9B58C", background: "transparent", color: T.ivoryHi, fontWeight: 800, fontSize: 12.5, cursor: "pointer" }}>{t("거절")}</button>
        </div>
      </motion.div>
    </div>
  );
}