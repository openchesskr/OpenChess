// (v0.6.0, App.jsx 분할) 'learn' 화면과 그 화면만 쓰는 조각
// 동작 변경 없이 App.jsx에서 그대로 옮겼다(REFACTOR_NOTES.md Phase 3 참고).
import { lichessFetchWithRetry, lichessForeground, LICHESS_API, loadMasterGameData, staticMasterGamesFor } from "../lib/lichessApi.js";
import { sansToUci, stripSuffix, looksLikeFen, parseFenFull, startBoard, sanSrc, applySan, boardToFen, sqName, STANDARD_START_FEN, EDITOR_EMPTY_FEN, castleRightsStr, epTargetFromMoveInfo, moveNumber, pvUciToSans, sansToFen, MAX_SEARCH_DEPTH, boardFromSans, uciToSan, decorateSan, canMove, drawKindLabel, replayFromFen, plyIsWhite, epTarget, countLegalMoves, gameEndState, fenOfRoot, colorOfRoot, boardOfRoot, fenLegalDests, liveLegalDests, buildSan } from "../lib/chessRules.js";
import { SB_ON, sbSelect, sbInsert, sbRpc, sbPatch, sbDelete } from "../lib/supabaseClient.js";
import { parsePgnMoves, sansToPgnText, parsePgnSans, autoResultFromPgn, splitPgnGames, parsePgnGameForImport } from "../lib/pgn.js";
import { mateWhiteWins, SITE_FONT, dedupeEngineLines, SEQ_FONT, EngineLines } from "../components/engineLines.jsx";
import React, { useState, useMemo, useRef, useEffect, useCallback, useLayoutEffect } from "react";
import { T, BOARD_GLOSS } from "../lib/theme.js";
import { Check, Copy, ClipboardPaste, RefreshCw, Trash2, Save, ChevronsLeft, RotateCcw, RotateCw, ChevronsRight, Play, X, ChevronLeft, ChevronRight, ThumbsUp, ThumbsDown, BookOpen, ChevronUp, ChevronDown, ArrowLeft, Book, Pencil, Crown, Sparkles, Search, ArrowUpDown, Cpu } from "lucide-react";
import { PieceGlyph } from "../components/pieces.jsx";
import { motion } from "framer-motion";
import { QCOLOR } from "../lib/moveKinds.js";
import { fmtEvalCp, matePliesOf, ownPriorMoveWasSacrifice, gradeMoveKind, isSacrifice } from "../lib/moveQuality.js";
import { KeywordScroll, KW } from "../components/keywordScroll.jsx";
import { PendingDots, QLABEL } from "../components/badges.jsx";
import { computeRatingChanges } from "../lib/chesscom.js";
import { BestMoveJumpButton, ListPager, NavBtn } from "../components/uiPrimitives.jsx";
import { playMoveSfx } from "../lib/prefs.js";
import { AnimatedMove, BoardWithMaterial, CONTENT, ChesscomLogo, CircleBadge, FadeIn, ImageSourceMenu, Mascot, MaterialIcon, ReviewPromoPrompt, SNAP, SequenceBar, TIME_CLASS_LABEL, WinBar, _lichessCache, addsFor, analyzePoolSize, assignTiers, bootAnalysisWorker, callEvaluateMulti, containsBannedWord, deriveKeywords, devAddEntry, fetchLichess, findOpeningPathByFuzzyName, fmtFull, forceKindFor, getAnalysisPool, gradeMoveKindConfirmed, isBookMoveAt, isUnbooked, lichessFetchJson, moverEval, nameOverride, poolWorker, relTime, sacCheckSync, sacConfirmListeners, sacVerdict, scanImageFile, singleRecaptureCheck, snapNode, useBoardSize, useNarrow, useSacConfirmTick } from "./common.jsx";

import { t, tx } from "../lib/i18n.js";
async function lichessFetchText(url) {
  const hit = _lichessCache.get(url);
  if (hit && Date.now() - hit.t < 10 * 60 * 1000) return hit.data;
  const data = await (await lichessFetchWithRetry(url)).text();
  _lichessCache.set(url, { t: Date.now(), data });
  return data;
}
// (기능) 집중분석의 "마스터 대국" 목록 — 이 수가 두어진 실제 마스터 게임(대국자·레이팅·결과).
// (버그 보충) 예전엔 12개만 가져와 전부를 한 화면에 나열했다 — Lichess 마스터 DB 익스플로러가
// 실제로 내려주는 최대치(15개)까지 가져와, 화면에서는 페이지를 넘기며(+ 정렬) 볼 수 있게 한다.
async function fetchMasterTopGames(sans, count = 15) {
  const uci = sansToUci(sans).join(",");
  const url = LICHESS_API + "?master=1&play=" + uci + "&moves=0&topGames=" + count;
  const j = await lichessFetchJson(url);
  return (j.topGames || []).map((g) => ({ id: g.id, winner: g.winner || null, white: g.white, black: g.black, year: g.year }));
}
// (v0.2.3 기능) 개발자가 수동으로 추가한 마스터 대국(master_games_dev) — Lichess 마스터 DB에 없는
// 유명 대국을 보충한다. sans(그 대국의 전체 SAN 배열)가 지금 보고 있는 수순을 접두사로 포함하는
// 대국만 골라 Lichess topGames와 같은 모양({id,winner,white,black,year})으로 변환해 돌려준다 —
// id에 "dev_" 접두사를 붙여 onOpenMasterGame/onOpenMasterGameReview가 Lichess PGN 엔드포인트 대신
// 이 테이블에서 곧장 기보를 가져오도록 구분한다.
async function fetchDevMasterGames(sans) {
  if (!SB_ON) return [];
  const rows = await sbSelect("master_games_dev?select=id,white_name,white_rating,black_name,black_rating,year,result,sans&order=year.desc&limit=500");
  const key = sans.map(stripSuffix);
  return (rows || [])
    .filter((r) => Array.isArray(r.sans) && r.sans.length >= key.length && key.every((s, i) => stripSuffix(r.sans[i]) === s))
    .map((r) => ({
      id: "dev_" + r.id,
      winner: r.result === "1-0" ? "white" : r.result === "0-1" ? "black" : null,
      white: { name: r.white_name, rating: r.white_rating },
      black: { name: r.black_name, rating: r.black_rating },
      year: r.year,
    }));
}
// (기능) 외부 대국 데이터베이스(선수/이벤트/오프닝 묶음)에서 뽑아낸 정적 마스터 대국 —
// scripts/build-master-games.mjs로 public/master-games.json 생성. Lichess 마스터 DB 표본이
// 적은 포지션을 보충하려고 만들었지만, 지금은 "출처 구분 없이 항상 합쳐서 보여주기"로 정해서
// 매번 Lichess·개발자 추가분과 함께 합친다. 최초 1회만 fetch해서 메모리에 캐싱 — 파일이 몇 MB급이라
// 초기 번들에는 안 넣고 마스터 대국을 처음 조회할 때만 지연 로드한다.
// Lichess 마스터 DB + 개발자 추가분 + 외부 정적 데이터를 한 목록으로 합친다 —
// 화면(FocusPanel)에서 출처를 구분하지 않는다.
async function fetchAllMasterGames(sans, count = 15) {
  const [lichess, dev, staticData] = await Promise.all([
    fetchMasterTopGames(sans, count).catch(() => []),
    fetchDevMasterGames(sans).catch(() => []),
    loadMasterGameData(),
  ]);
  const staticGames = staticMasterGamesFor(sans, staticData);
  return [...dev, ...staticGames, ...lichess];
}
async function addDevMasterGame({ whiteName, whiteRating, blackName, blackRating, year, pgn, sans, result }) {
  await sbInsert("master_games_dev", {
    white_name: whiteName, white_rating: whiteRating || null,
    black_name: blackName, black_rating: blackRating || null,
    year: year || null, pgn, sans, result,
  });
}
// PostgREST는 JSON 배열 하나를 POST 본문으로 보내면 여러 행을 한 번에 insert해 준다(sbInsert 그대로
// 재사용 가능) — 다만 대국이 아주 많을 때 요청 하나가 지나치게 커지지 않도록 묶음 단위로 나눠 보낸다.
async function addDevMasterGamesBulk(rows, chunkSize = 200) {
  for (let i = 0; i < rows.length; i += chunkSize) {
    const chunk = rows.slice(i, i + chunkSize).map((r) => ({
      white_name: r.whiteName, white_rating: r.whiteRating || null,
      black_name: r.blackName, black_rating: r.blackRating || null,
      year: r.year || null, pgn: r.pgn, sans: r.sans, result: r.result,
    }));
    await sbInsert("master_games_dev", chunk);
  }
}
async function fetchMasterGamePgn(id) {
  const text = await lichessFetchText(LICHESS_API + "?pgn=" + id);
  return parsePgnMoves(text);
}
// (v0.2.3 기능) id가 "dev_"로 시작하면 개발자가 추가한 마스터 대국(master_games_dev)에서, 아니면
// 기존처럼 Lichess에서 기보를 가져온다 — onOpenMasterGame/onOpenMasterGameReview가 출처를 몰라도
// 되도록 이 함수 하나로 분기를 감춘다.
async function fetchAnyMasterGamePgn(id) {
  if (typeof id === "string" && id.startsWith("dev_")) {
    if (!SB_ON) throw new Error("no-db");
    const rows = await sbSelect("master_games_dev?id=eq." + id.slice(4) + "&select=sans&limit=1");
    if (!rows || !rows[0]) throw new Error("not-found");
    return rows[0].sans;
  }
  if (typeof id === "string" && id.startsWith("extm_")) {
    const data = await loadMasterGameData();
    const g = data && data.games[+id.slice(5)];
    if (!g) throw new Error("not-found");
    return g.moves.split(" ");
  }
  return fetchMasterGamePgn(id);
}
/* ============================================================ 내부 해설 데이터 (한글) ============================================================ */
const EXPLAIN = {
  "": t("백의 첫 수. e4·d4가 압도적. b4(폴란드)·f4(버드)처럼 평가가 떨어지는 수는 부정확으로 분류"),
  "e4": t("킹 폰 오프닝. 중앙 점유, 비숍·퀸 길을 열어 빠른 전개와 공격"),
  "d4": t("퀸 폰 오프닝. e4보다 폐쇄적·전략적, 안정적인 중앙 장악"),
  "e4 e5 Nf3 Nc6 Bc4": t("이탈리안 게임. 비숍을 c4로 보내 f7 약점 공략. 흑 …Bc5(지우코 피아노) 또는 …Nf6(투 나이츠)"),
  "e4 e5 Nf3 Nc6 Bb5": t("루이 로페즈(스패니시). 흑 c6 나이트를 압박해 e5 폰 수비를 흔듦. 가장 깊이 연구된 오프닝 중 하나"),
  "e4 c5": t("시칠리안 디펜스. 비대칭 구조로 반격. 최상위에서 가장 인기 있는 e4 대응"),
  "d4 Nf6 c4 e6": t("님조/퀸즈 인디언 계열 입구. 흑이 유연하게 중앙 통제"),
};
function explainFor(sans) {
  const k = sans.join(" ");
  if (CONTENT.explains[k]) return CONTENT.explains[k];
  if (EXPLAIN[k]) return EXPLAIN[k];
  const n = snapNode(sans);
  if (n && n.opening) return t("{0} 정석 이론대로 전개되는 라인", (n.opening.name));
  return null;
}
function explainMove(sans, san) {
  const mk = sans.join(" ") + "|" + san;
  if (CONTENT.explains[mk]) return CONTENT.explains[mk];
  return explainFor([...sans, san]) || explainFor(sans);
}
/* ============================================================ 퍼즐: 실수 응징 시퀀스 ============================================================ */
/* key = "<경로 SAN 공백연결>|<실수 SAN>" ; line = 실수 이후 수순(첫 수가 응징하는 쪽) */
const PUNISH = {
  "e4 e5 Nf3|f6": {
    opening: "Damiano Defense", mistake: "f6",
    why: t("2...f6는 f7-킹 대각선을 약화시키고 나이트 출구를 막는 대표적인 악수. 백은 e5 폰을 희생해 바로 응징 가능"),
    line: ["Nxe5", "fxe5", "Qh5+"],
    steps: [t("3.Nxe5! 나이트를 내주고 폰을 잡으며 f7-h5 대각선 공략"), t("3...fxe5 받으면(거의 강제) e8-h5 대각선이 완전히 열림"), t("4.Qh5+ 더블 어택. 4...Ke7 5.Qxe5+로 룩까지 따내며 백 대승")],
  },
  "e4 e5 Nf3 Nc6 Bc4 Nf6 Ng5 d5 exd5|Nxd5": {
    opening: "Fried Liver Attack", mistake: "Nxd5",
    why: t("5...Nxd5?는 폰을 되찾지만 f7이 무방비. 백은 나이트를 희생하는 프라이드 리버로 응징"),
    line: ["Nxf7", "Kxf7", "Qf3+"],
    steps: [t("6.Nxf7! 나이트를 희생해 킹을 끌어냄"), t("6...Kxf7 받으면 킹이 노출"), t("7.Qf3+ 킹과 d5 나이트를 동시에 공격. 백이 주도권")],
  },
};
function punishFor(sans, san) { return PUNISH[sans.join(" ") + "|" + san] || null; }
// (18차 기능4) 주요 분기점 전면 개편 — 기존 분기점(BRANCH 기본값·구 branches 데이터)은 모두 폐기하고,
// 새로 지정하는 것만 branches18 네임스페이스에 저장한다. 분기점이 없으면 대신 "수 추천" 블록이 표시된다.
function branchFor(key) { const v = (CONTENT.branches18 || {})[key]; return v || null; }
function recommendReasonFor(key) { const v = (CONTENT.recommends || {})[key]; return v || null; }
function isMainline(key, san) { return !!CONTENT.mainline[key + "|" + san]; }
function escapeRegExp(s) { return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"); }
// (사용자 요청) 오프닝 명칭이 바뀌면, 그 이름을 접두사로 쓰던 자손 수들의 오프닝 명칭도 그 접두사만
// 자연스럽게 함께 바뀐다 — 예: "Queen's Gambit"을 "QG"로 바꾸면 "Queen's Gambit Declined"도
// "QG Declined"로. path 아래(자기 자신 제외) 실제 이론 트리(SNAP.tree)를 훑어, 그 자신의 이름
// (개발자 오버라이드 우선, 없으면 원본 ECO 이름)이 oldName으로 시작하는 노드만 오버라이드를 새로
// 써 넣는다 — 이름이 전혀 없거나 단순히 그 이름을 물려받기만 하는(자기 이름이 없는) 노드는 건드리지
// 않는다(부모 조회 시 자동으로 새 이름을 따라간다).
function cascadeRenameOpeningDescendants(path, oldName, newName) {
  if (!oldName || !newName || oldName === newName) return;
  const prefix = path.join(" ");
  const boundaryRe = new RegExp("^" + escapeRegExp(oldName) + "(?=[:,]|\\s|$)");
  for (const key in SNAP.tree) {
    if (key === prefix || !key.startsWith(prefix + " ")) continue;
    const nd = SNAP.tree[key];
    if (!nd || !nd.opening || !nd.opening.name) continue;
    const parts = key.split(" ");
    const lastSan = parts[parts.length - 1];
    const parentKey = parts.slice(0, -1).join(" ");
    const cur = nameOverride(parentKey, lastSan) ?? nd.opening.name;
    if (!boundaryRe.test(cur)) continue;
    CONTENT.names[parentKey + "|" + stripSuffix(lastSan)] = newName + cur.slice(oldName.length);
  }
}
function kwOverride(key, san) { const v = CONTENT.keywords[key + "|" + stripSuffix(san)]; return Array.isArray(v) ? v : null; }
// (버그 수정) 대국 목록의 수 체계 아이콘 표시(탁월/유일/실수/블런더 개수)는 목록에 뜨는 모든 대국을
// 자체 엔진으로 전체 분석해야 해서 계산 시간이 너무 오래 걸려 제거했다 — "게임 리뷰"(/review)의
// 명시적 분석 버튼을 눌렀을 때만 엔진 분석을 돌린다.
// 상보쌍: 한 묶음, 동시 선택 불가(둘 다 미선택은 가능)
const KW_PAIRS = [["MAIN-LINE", "SIDESTEPPING"], ["BALANCE", "IMBALANCE"], ["SHARP", "QUIET"], ["STRAIGHT-LINE", "FLEXIBLE"], ["OPEN", "CLOSED"]];
const KW_SINGLES = ["NORMAL", "TOP LEVEL", "LOW-LEVEL", "TRICKY", "INTUITIVE", "DRAWING-WEAPON", "ANTI-", "SWITCH"];
function kwPartner(k) { for (const [a, b] of KW_PAIRS) { if (a === k) return b; if (b === k) return a; } return null; }
function whiteEval(m) { if (m.live) return m.live.mate != null ? (mateWhiteWins(m.live.mate, m.live.win) ? 1000 : -1000) : m.live.cp; if (m.evalCp != null) return m.evalCp; if (m.mate != null) return m.mate > 0 ? 1000 : -1000; return null; }
// (20차) 평가치 바 표기용 — 숫자로 뭉개지 않고 {cp}|{mate,win}을 그대로 넘겨 메이트를 M수로 표기할 수 있게 한다.
function whiteEvalObj(m) {
  if (m.live) return m.live.mate != null ? { mate: m.live.mate, win: m.live.win || (m.live.mate > 0 ? "w" : "b"), plies: m.live.plies } : { cp: m.live.cp };
  if (m.evalCp != null) return { cp: m.evalCp };
  if (m.mate != null) return { mate: m.mate, win: m.mate > 0 ? "w" : "b" };
  return null;
}
// (UI2) 현재 기보 복사 + FEN/PGN 붙여넣기. PGN은 검증 후 분석 탭에 그대로 이어서 둘 수 있는 수순으로
// 불러오고, FEN은(사용자 요청, v0.3.3) 더 이상 읽기 전용 미리보기로만 보여주지 않는다 — onLoadFen으로
// 분석 탭을 아예 "FEN 모드"로 전환해, 그 위치(차례·캐슬링 권리·앙파상까지)에서부터 실제로 이어서 둘
// 수 있게 한다. 예전의 읽기 전용 FEN 미리보기 모달 코드는 폐기했다.
function NotationTools({ sans, startColor, onLoadPgn, onLoadFen }) {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");
  const [err, setErr] = useState("");
  const [copied, setCopied] = useState(false);
  const iconBtn = { width: 26, height: 26, borderRadius: 7, background: "rgba(255,255,255,.08)", border: "1px solid rgba(255,255,255,.18)", color: T.brassHi, display: "inline-flex", alignItems: "center", justifyContent: "center", cursor: "pointer", flexShrink: 0 };
  const copy = async () => {
    const out = sansToPgnText(sans, startColor) || t("(시작 위치)");
    try { await navigator.clipboard.writeText(out); setCopied(true); setTimeout(() => setCopied(false), 1500); } catch { }
  };
  const submit = () => {
    const raw = text.trim();
    if (!raw) { setErr(t("붙여넣을 내용을 입력하세요")); return; }
    if (looksLikeFen(raw)) {
      const fenRoot = parseFenFull(raw);
      if (!fenRoot) { setErr(t("올바른 FEN 형식이 아님")); return; }
      onLoadFen(fenRoot); setOpen(false); setText(""); setErr("");
      return;
    }
    const moves = parsePgnMoves(raw);
    if (!moves.length) { setErr(t("인식할 수 있는 기보 없음")); return; }
    let board = startBoard(), ok = true;
    for (let i = 0; i < moves.length; i++) {
      const color = i % 2 === 0 ? "w" : "b";
      if (!sanSrc(board, moves[i], color)) { ok = false; break; }
      board = applySan(board, moves[i], color);
    }
    if (!ok) { setErr(t("기보에 불법 수 포함")); return; }
    onLoadPgn(moves); setOpen(false); setText(""); setErr("");
  };
  return (
    <>
      <div className="flex items-center gap-2">
        <button onClick={copy} title={t("현재 기보 복사")} className="press" style={iconBtn}>{copied ? <Check size={13} /> : <Copy size={13} />}</button>
        <button onClick={() => { setOpen(true); setErr(""); }} title={t("FEN/PGN 붙여넣기")} className="press" style={iconBtn}><ClipboardPaste size={13} /></button>
      </div>
      {open && (
        <div onClick={() => setOpen(false)} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.6)", zIndex: 90, display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}>
          <div onClick={(e) => e.stopPropagation()} style={{ position: "relative", maxWidth: 420, width: "100%", background: "linear-gradient(180deg,#F6EEDD,#E6D6B6)", borderRadius: 16, padding: 20, border: "1px solid #CDB98E", boxShadow: "0 24px 60px -12px rgba(0,0,0,.7)" }}>
            <button onClick={() => setOpen(false)} aria-label={t("닫기")} className="press" style={{ position: "absolute", top: 12, right: 12, width: 28, height: 28, borderRadius: 8, background: T.ebony2, color: T.ivory, border: "1px solid #000", cursor: "pointer" }}>✕</button>
            <div style={{ fontSize: 14, fontWeight: 800, color: T.ink, marginBottom: 10, paddingRight: 30 }}>{t("FEN 또는 PGN 붙여넣기")}</div>
            <textarea value={text} onChange={(e) => setText(e.target.value)} rows={5} placeholder={t("예: 1. e4 e5 2. Nf3 Nc6\n또는 FEN: rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1")} style={{ width: "100%", fontSize: 12.5, padding: 10, borderRadius: 9, border: "1px solid #C9B58C", background: "#fff", color: T.ink, resize: "vertical", fontFamily: SITE_FONT, boxSizing: "border-box" }} />
            {err && <div style={{ fontSize: 11.5, color: T.blunder, marginTop: 6 }}>{err}</div>}
            <div className="flex gap-2" style={{ marginTop: 10 }}>
              <button onClick={submit} className="press" style={{ padding: "8px 16px", borderRadius: 9, background: "linear-gradient(180deg,#3A2516,#241509)", color: T.ivoryHi, fontWeight: 800, border: "none", cursor: "pointer", fontSize: 12.5 }}>{t("불러오기")}</button>
              <button onClick={() => setOpen(false)} className="press" style={{ padding: "8px 14px", borderRadius: 9, border: "1px solid #C9B58C", background: "transparent", color: T.inkSoft, fontWeight: 700, cursor: "pointer", fontSize: 12.5 }}>{t("취소")}</button>
            </div>
            <p style={{ fontSize: 10.5, color: T.inkSoft, marginTop: 10, lineHeight: 1.5 }}>{t("PGN은 검증 후 그 수순 그대로 분석 탭에서 이어 둘 수 있음. FEN은 그 포지션(차례·캐슬링 권리·앙파상 포함)부터 이어 두는 FEN 모드로 전환되고, 처음 두는 수가 1수로 표기됨")}</p>
          </div>
        </div>
      )}
    </>
  );
}
// (v0.3.5 기능) 사용자 요청 — 분석 탭 보드 편집기. 팔레트에서 기물을 골라 보드 칸에 콕콕 찍어 원하는
// 포지션을 처음부터 구성하고, 차례·캐슬링 권리를 직접 지정한 뒤 완료하면 NotationTools의 FEN
// 붙여넣기와 똑같은 계약(onLoadFen(parseFenFull 결과))으로 그 포지션의 FEN 모드로 들어간다.
const EDITOR_PALETTE_PIECES = ["K", "Q", "R", "B", "N", "P"];
// (v0.5.1 기능, 사용자 요청 → 항상 켜짐으로 변경) 보드 편집기 — 그 캐슬링에 필요한 킹·룩이 표준
// 시작 칸(백 K:e1·h1, Q:e1·a1 / 흑 k:e8·h8, q:e8·a8 — board[r][c]는 r=0이 랭크8, c=0이 파일a이므로
// 각각 [7,4]/[7,7]/[7,0]과 [0,4]/[0,7]/[0,0])에 정확히 있지 않은 순간 그 권리를 자동으로 꺼 준다.
// 반대(다시 제자리로 돌아오면 권리가 되살아나는 것)는 절대 하지 않는다 — 캐슬링 권리는 "그 기물이
// 게임 시작 이후 한 번도 움직이지 않았다"는 과거 이력에 관한 정보라, 편집기 조작으로 우연히 다시
// 표준 칸과 같은 배치가 됐다고 그 이력까지 되살아나는 건 아니기 때문이다(실제 체스 규칙과 같은
// 태도 — updateCastleRights가 실제 대국에서 하는 일과 동일한 원칙, 다만 이쪽은 "한 수" 단위가
// 아니라 "지금 이 순간의 배치"만 보고 판단한다는 점이 다르다). 처음엔 기본 꺼짐인 opt-in
// 체크박스로 뒀다가, 사용자 요청으로 옵션 자체를 없애고 항상 적용되도록 바꿨다.
function clearInvalidCastleRights(board, rights) {
  const has = (r, c, color, type) => { const p = board[r][c]; return !!p && p.c === color && p.t === type; };
  const wK = has(7, 4, "w", "K"), bK = has(0, 4, "b", "K");
  return {
    K: !!rights.K && wK && has(7, 7, "w", "R"),
    Q: !!rights.Q && wK && has(7, 0, "w", "R"),
    k: !!rights.k && bK && has(0, 7, "b", "R"),
    q: !!rights.q && bK && has(0, 0, "b", "R"),
  };
}
// (버그 수정) 예전엔 앙파상을 아예 다루지 않아, FEN을 직접 입력·붙여넣기·이미지 스캔해도 그 안의
// 앙파상 타깃 필드가 항상 "-"로 버려졌다 — 그렇게 만든 포지션으로 곧장 PLAY를 열면(seed.fenRoot로
// 그대로 전달됨) 원래는 가능해야 할 앙파상 캡처가 그 즉시 불가능해졌다. ep를 받아 그대로 필드에
// 반영한다 — 기물 배치를 직접 편집(팔레트/드래그)하면 호출부가 ep를 null로 넘겨 무효화한다.
function editorFenOf(board, turn, rights, ep) {
  const castle = (rights.K ? "K" : "") + (rights.Q ? "Q" : "") + (rights.k ? "k" : "") + (rights.q ? "q" : "");
  return boardToFen(board, 0, castle || "-", ep ? sqName(ep[0], ep[1]) : "-", turn);
}
// 보드 칸을 클릭으로 채우는 8x8 그리드 — 실제 대국 보드(Board)와 달리 기물 이동 규칙이 전혀 없고
// 좌표 라벨만 곁들인 순수 렌더링 그리드다.
// (v0.3.5 기능) 사용자 요청 — 클릭만이 아니라 실제 대국 보드처럼 드래그로도 기물을 옮길 수 있게
//한다. Board 컴포넌트가 이미 쓰고 있는 Pointer Events 기반 드래그(마우스·터치·펜을 하나의 API로
// 통일 — 네이티브 HTML5 드래그는 터치에서 아예 동작하지 않는다)를 그대로 본뜬다. 다만 이 그리드는
// 실제 대국 규칙이 없어 legalDests 같은 판정이 필요 없으므로, 드롭 위치 계산(gridRef 기준 좌표→칸)
// 로직만 가져오고 나머지(잡기/두기 판정)는 BoardEditorModal이 훨씬 단순하게 직접 처리한다.
function EditorBoardGrid({ board, flipped, size, selected, onSquareClick, gridRef, onPieceDown, dragOn, draggingFrom }) {
  const ranks = flipped ? [1, 2, 3, 4, 5, 6, 7, 8] : [8, 7, 6, 5, 4, 3, 2, 1];
  const files = flipped ? ["h", "g", "f", "e", "d", "c", "b", "a"] : ["a", "b", "c", "d", "e", "f", "g", "h"];
  const cellPx = size / 8;
  const cells = [];
  for (let rr = 0; rr < 8; rr++) for (let cc = 0; cc < 8; cc++) {
    const r = flipped ? 7 - rr : rr, c = flipped ? 7 - cc : cc;
    const light = (r + c) % 2 === 0;
    const p = board[r][c];
    const isSel = !!(selected && selected[0] === r && selected[1] === c);
    const isDragSource = !!(draggingFrom && draggingFrom[0] === r && draggingFrom[1] === c);
    cells.push(
      <div key={r + "_" + c} onClick={() => onSquareClick(r, c)} className="press"
        style={{ position: "relative", background: light ? T.boardLight : T.boardDark, display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", boxShadow: isSel ? "inset 0 0 0 3px " + T.only : "none", touchAction: "none" }}>
        {p && <PieceGlyph type={p.t} color={p.c} size={Math.round(cellPx * 0.82)} style={{ opacity: isDragSource ? 0.25 : 1, cursor: "grab" }} />}
        {/* (기능) 기물 위에만 얹는 투명 오버레이 — pointerdown이 눌린 칸만 드래그 시작점으로 잡고,
            빈 칸은 여전히 위 onClick(도장 찍기/기존 기물 두기)만으로 동작한다. */}
        {p && <div onPointerDown={(e) => onPieceDown(e, r, c)} onPointerMove={dragOn.onMove} onPointerUp={dragOn.onUp} onPointerCancel={dragOn.onCancel} style={{ position: "absolute", inset: 0 }} />}
      </div>
    );
  }
  return (
    <div style={{ display: "inline-flex", flexDirection: "column", flexShrink: 0 }}>
      <div className="flex">
        <div style={{ display: "flex", flexDirection: "column", width: 15, flexShrink: 0 }}>
          {ranks.map((n) => <div key={n} style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 10, fontWeight: 800, color: "rgba(244,238,226,.55)" }}>{n}</div>)}
        </div>
        <div ref={gridRef} style={{ width: size, height: size, display: "grid", gridTemplateColumns: "repeat(8,1fr)", gridTemplateRows: "repeat(8,1fr)", borderRadius: 6, overflow: "hidden", border: "1px solid #000", flexShrink: 0, ...BOARD_GLOSS }}>{cells}</div>
      </div>
      <div className="flex" style={{ marginLeft: 15 }}>
        {files.map((f) => <div key={f} style={{ width: size / 8, textAlign: "center", fontSize: 10, fontWeight: 800, color: "rgba(244,238,226,.55)" }}>{f}</div>)}
      </div>
    </div>
  );
}
function BoardEditorModal({ initialFen, onClose, onApply }) {
  const narrow = useNarrow(760);
  // (v0.5.1 버그 수정, 사용자 요청) 캐슬링 권리 자동 해제는 이제 옵션이 아니라 항상 켜져 있다 — 초기
  // 배치를 불러오는 시점부터 이미 무효한 권리(킹·룩이 표준 시작 칸을 벗어났는데 권리는 남아 있는 FEN)가
  // 있을 수 있으므로, startSnap 계산 시점에도 한 번 정리해 둔다.
  const startSnap = useMemo(() => {
    const p = (initialFen && parseFenFull(initialFen)) || parseFenFull(STANDARD_START_FEN);
    return { board: p.board, turn: p.turn, rights: clearInvalidCastleRights(p.board, p.rights), ep: p.ep || null };
  }, [initialFen]);
  // (기능) 되감기/빨리감기(◀◀▶▶)·되돌리기/다시하기(↶↷) — 스냅샷 배열 하나 + 인덱스로 관리해
  // board/turn/rights 세 state를 따로 두고 동기화하다 어긋나는 사고를 원천 차단한다.
  const [hist, setHist] = useState({ list: [startSnap], idx: 0 });
  const snap = hist.list[hist.idx];
  const { board, turn, rights, ep } = snap;
  // (v0.5.1 기능, 사용자 요청 → 항상 켜짐으로 변경) "캐슬링 권리 자동 해제" — 처음엔 opt-in 체크박스로
  // 뒀다가, 사용자 요청으로 옵션 자체를 없애고 항상 적용되도록 바꿨다. pushSnap을 거치는 모든 보드
  // 변경(팔레트 배치·드래그·FEN 붙여넣기·이미지 스캔 등)이 무조건 이 검사를 받는다.
  const pushSnap = (patch) => setHist((h) => {
    const next = { ...h.list[h.idx], ...patch };
    const list = [...h.list.slice(0, h.idx + 1), { ...next, rights: clearInvalidCastleRights(next.board, next.rights) }];
    return { list, idx: list.length - 1 };
  });
  const canUndo = hist.idx > 0, canRedo = hist.idx < hist.list.length - 1;
  const undo = () => canUndo && setHist((h) => ({ ...h, idx: h.idx - 1 }));
  const redo = () => canRedo && setHist((h) => ({ ...h, idx: h.idx + 1 }));
  const rewind = () => setHist((h) => ({ ...h, idx: 0 }));
  const fastForward = () => setHist((h) => ({ ...h, idx: h.list.length - 1 }));
  const [flipped, setFlipped] = useState(false);
  const [tool, setTool] = useState(null); // null | "delete" | { piece, color }
  const [pickedSq, setPickedSq] = useState(null); // 팔레트 없이 보드 위 기물을 직접 집어 옮기는 중인 칸
  // (버그 수정) 기물 배치를 직접 편집하면 그 전에 남아있던 ep(앙파상 타깃)는 더 이상 유효하지
  // 않다 — 편집으로 만들어진 배치가 "방금 그 폰이 두 칸을 전진해서" 나온 게 아닐 수 있으므로,
  // board를 바꾸는 모든 편집 동작은 ep를 명시적으로 null로 되돌린다.
  const placeAt = (r, c, piece) => { const b = board.map((row) => row.slice()); b[r][c] = piece; pushSnap({ board: b, ep: null }); };
  const onSqClick = (r, c) => {
    if (tool) { placeAt(r, c, tool === "delete" ? null : { c: tool.color, t: tool.piece }); return; }
    if (pickedSq) {
      if (pickedSq[0] === r && pickedSq[1] === c) { setPickedSq(null); return; }
      const b = board.map((row) => row.slice());
      b[r][c] = b[pickedSq[0]][pickedSq[1]]; b[pickedSq[0]][pickedSq[1]] = null;
      pushSnap({ board: b, ep: null }); setPickedSq(null);
      return;
    }
    if (board[r][c]) setPickedSq([r, c]);
  };
  // (사용자 요청) 이 화면에서도 자연스러운 드래그 무브 — Board 컴포넌트의 Pointer Events 패턴을
  // 그대로 옮겨왔다: 보드 위 기물뿐 아니라 팔레트의 기물도 드래그 출발점이 될 수 있어 source로 구분한다.
  // 팔레트로 옮긴 고스트는 그리드 내부 절대좌표가 아니라 position:fixed로 화면 전체에 그린다 — 팔레트가
  // 그리드 바깥에 있어 좌표계가 다르고, 드래그 도중 보드 경계를 자유로이 넘나들어야 하기 때문이다.
  const gridRef = useRef(null);
  const dragStartRef = useRef(null); // { source:"board"|"palette", from:[r,c]|null, piece:{c,t}, x, y }
  const suppressClickRef = useRef(false);
  // (v0.3.9 버그 수정) Board 컴포넌트와 동일한 이유 — ptrDrag에 손가락 좌표까지 담아 pointermove마다
  // setState하면 이 모달 전체가 매번 다시 렌더링돼 고스트가 무겁게 뒤처져 보인다. ptrDrag는 이제
  // {source,from,piece}만(드래그 임계값을 처음 넘는 순간 한 번만) 담고, 좌표는 ghostPosRef/ghostElRef로
  // React 렌더링 없이 직접 갱신한다.
  const [ptrDrag, setPtrDrag] = useState(null); // 드래그 임계값을 넘겼을 때만 채워짐(고스트 존재 여부·딤 처리용)
  const ghostPosRef = useRef({ x: 0, y: 0 });
  const ghostElRef = useRef(null);
  // (v0.3.9 재조정, 정정 → 재재조정 → 재정정 → 재요청) Board 컴포넌트와 동일하게 — 드래그 "시작"
  // 문턱은 최대한 낮게, "종료 지점" 판정만 관대하게. 자세한 이유는 그쪽 같은 이름 상수 주석 참고.
  const DRAG_THRESHOLD = 1;
  const onSqClickGuarded = (r, c) => { if (suppressClickRef.current) { suppressClickRef.current = false; return; } onSqClick(r, c); };
  const paletteClick = (fn) => () => { if (suppressClickRef.current) { suppressClickRef.current = false; return; } fn(); };
  // (v0.3.9 기능 → 재재조정 → 재요청) Board 컴포넌트의 DROP_TOLERANCE와 동일한 이유로, 이 보드
  // 편집기도 놓는 지점이 보드 경계를 살짝 벗어나면 가장 가까운 칸으로 스냅해 준다(이전엔 관용치가
  // 아예 없어 경계를 한 픽셀만 벗어나도 취소됐다).
  const DROP_TOLERANCE = 1.2 / 8;
  const squareFromClient = (clientX, clientY) => {
    const el = gridRef.current; if (!el) return null;
    const rect = el.getBoundingClientRect();
    if (!rect.width || !rect.height) return null;
    const relX = (clientX - rect.left) / rect.width, relY = (clientY - rect.top) / rect.height;
    if (relX < -DROP_TOLERANCE || relX >= 1 + DROP_TOLERANCE || relY < -DROP_TOLERANCE || relY >= 1 + DROP_TOLERANCE) return null;
    const clampedX = Math.min(1 - 1e-6, Math.max(0, relX)), clampedY = Math.min(1 - 1e-6, Math.max(0, relY));
    const vc = Math.min(7, Math.max(0, Math.floor(clampedX * 8))), vr = Math.min(7, Math.max(0, Math.floor(clampedY * 8)));
    return flipped ? [7 - vr, 7 - vc] : [vr, vc];
  };
  const startDragFromBoard = (e, r, c) => {
    if (tool) return; // 도구가 활성화된 동안은 클릭 스탬프만 — 드래그는 도구가 없을 때만 시작
    const piece = board[r][c]; if (!piece) return;
    e.preventDefault();
    try { e.currentTarget.setPointerCapture(e.pointerId); } catch { }
    dragStartRef.current = { source: "board", from: [r, c], piece, x: e.clientX, y: e.clientY, hist: [{ x: e.clientX, y: e.clientY, t: e.timeStamp }] };
  };
  const startDragFromPalette = (e, color, piece) => {
    e.preventDefault();
    try { e.currentTarget.setPointerCapture(e.pointerId); } catch { }
    dragStartRef.current = { source: "palette", from: null, piece: { c: color, t: piece }, x: e.clientX, y: e.clientY, hist: [{ x: e.clientX, y: e.clientY, t: e.timeStamp }] };
  };
  // position:fixed 고스트라 뷰포트 좌표를 그대로 쓴다(팔레트가 그리드 바깥에 있어 그리드 상대좌표로는
  // 못 그리므로 — 위 주석 참고).
  const moveGhostTo = (clientX, clientY) => {
    ghostPosRef.current = { x: clientX, y: clientY };
    const el = ghostElRef.current;
    if (el) { el.style.left = clientX + "px"; el.style.top = (clientY - 22) + "px"; }
  };
  const onDragPointerMove = (e) => {
    const d = dragStartRef.current; if (!d) return;
    e.preventDefault();
    const dx = e.clientX - d.x, dy = e.clientY - d.y;
    if (!ptrDrag && Math.hypot(dx, dy) < DRAG_THRESHOLD) return;
    d.hist.push({ x: e.clientX, y: e.clientY, t: e.timeStamp });
    if (d.hist.length > 4) d.hist.shift();
    moveGhostTo(e.clientX, e.clientY);
    if (!ptrDrag) setPtrDrag(d); // 딱 한 번만 — 이후엔 ref/DOM만 갱신
  };
  // (v0.3.9 기능) Board 컴포넌트와 동일한 재설계 — 자세한 이유는 그쪽 같은 함수 주석 참고. 진행
  // 방향의 후보 칸(0·1·2칸 앞)을 두고, 손을 뗀 실제 지점이 그 후보 중심에서 얼마나 가까운지로
  // 채점한다. 속도가 빠를수록 허용 거리가 늘어난다.
  const DROP_TOLERANCE_BASE_CELLS = 0.75;
  const DROP_TOLERANCE_SPEED_SCALE = 30;
  const DROP_TOLERANCE_SPEED_CAP_CELLS = 1.5;
  const resolveDropSquare = (d, clientX, clientY) => {
    const el = gridRef.current; if (!el) return null;
    const rect = el.getBoundingClientRect();
    if (!rect.width || !rect.height) return null;
    const cellW = rect.width / 8, cellH = rect.height / 8;
    const relX = clientX - rect.left, relY = clientY - rect.top;
    const hist = d.hist || [];
    let vx = 0, vy = 0;
    if (hist.length >= 2) {
      const first = hist[0], last = hist[hist.length - 1];
      const dt = last.t - first.t;
      if (dt > 0) { vx = (last.x - first.x) / dt; vy = (last.y - first.y) / dt; }
    }
    const speed = Math.hypot(vx, vy) / Math.min(cellW, cellH);
    const speedBonusCells = Math.min(DROP_TOLERANCE_SPEED_CAP_CELLS, speed * DROP_TOLERANCE_SPEED_SCALE);
    const dirLen = Math.hypot(vx, vy) || 1;
    const ux = vx / dirLen, uy = vy / dirLen;
    for (let step = 2; step >= 0; step--) {
      // (v0.3.9 버그 수정) 모든 후보 칸에 "기본 허용치 + 속도 보너스"를 똑같이 주면, 속도가 거의
      // 0인 정밀한 드래그도 경계 근처에서 옆 칸(step 1)으로 잘못 스냅될 수 있다(기본 허용치 0.75칸
      // 만으로도 옆 칸 중심에 닿는 경우가 흔함) — 실제로 Node.js 수치 시뮬레이션으로 재현·확인함.
      // 그래서 원래 놓인 칸(step 0)만 고정 기본 허용치를 쓰고, 방향으로 더 나아간 후보(step 1·2)는
      // 순수하게 속도에서 나온 보너스만으로 판정한다 — 느린 드래그는 절대 옆 칸으로 새지 않는다.
      const tolCells = step === 0 ? DROP_TOLERANCE_BASE_CELLS : speedBonusCells;
      const tolerancePx = tolCells * Math.min(cellW, cellH);
      const colF = relX / cellW + ux * step, rowF = relY / cellH + uy * step;
      const vc = Math.min(7, Math.max(0, Math.floor(colF))), vr = Math.min(7, Math.max(0, Math.floor(rowF)));
      const centerX = (vc + 0.5) * cellW, centerY = (vr + 0.5) * cellH;
      const dist = Math.hypot(relX - centerX, relY - centerY);
      if (dist <= tolerancePx) return flipped ? [7 - vr, 7 - vc] : [vr, vc];
    }
    return null;
  };
  // (v0.3.9 버그 수정) Board 컴포넌트와 동일 — 아주 빠른 드래그는 중간에 pointermove가 한 번도 안
  // 일어날 수 있어(브라우저 이벤트 코얼레싱) ptrDrag만으로는 항상 "드래그 아님"으로 남았다. 자세한
  // 이유는 그쪽 같은 함수 주석 참고.
  const endDrag = (e, drop) => {
    const d = dragStartRef.current;
    const wasDragging = !!ptrDrag || (d && Math.hypot(e.clientX - d.x, e.clientY - d.y) >= DRAG_THRESHOLD);
    dragStartRef.current = null;
    setPtrDrag(null);
    if (!d) return;
    if (drop && wasDragging) {
      suppressClickRef.current = true;
      const target = resolveDropSquare(d, e.clientX, e.clientY) || squareFromClient(e.clientX, e.clientY);
      if (d.source === "board") {
        if (target && (target[0] !== d.from[0] || target[1] !== d.from[1])) {
          const b = board.map((row) => row.slice());
          b[target[0]][target[1]] = d.piece; b[d.from[0]][d.from[1]] = null;
          pushSnap({ board: b, ep: null });
        } else if (!target) { // 보드 밖으로 드롭 = 기물 삭제
          const b = board.map((row) => row.slice());
          b[d.from[0]][d.from[1]] = null;
          pushSnap({ board: b, ep: null });
        }
        setPickedSq(null);
      } else if (d.source === "palette" && target) {
        placeAt(target[0], target[1], d.piece);
      }
    }
  };
  const onDragPointerUp = (e) => endDrag(e, true);
  const onDragPointerCancel = (e) => endDrag(e, false);
  const doReset = () => { const p = parseFenFull(STANDARD_START_FEN); pushSnap({ board: p.board, turn: p.turn, rights: p.rights, ep: null }); setTool(null); setPickedSq(null); };
  const doClear = () => { const p = parseFenFull(EDITOR_EMPTY_FEN); pushSnap({ board: p.board, turn: p.turn, rights: { K: false, Q: false, k: false, q: false }, ep: null }); setTool(null); setPickedSq(null); };
  const setTurnV = (t) => pushSnap({ turn: t });
  const toggleRight = (k) => pushSnap({ rights: { ...rights, [k]: !rights[k] } });
  const fenText = useMemo(() => editorFenOf(board, turn, rights, ep), [board, turn, rights, ep]);
  const [fenInput, setFenInput] = useState(fenText);
  const [fenErr, setFenErr] = useState("");
  useEffect(() => { setFenInput(fenText); }, [fenText]);
  const applyFenInput = () => {
    const p = parseFenFull(fenInput.trim());
    if (!p) { setFenErr(t("올바른 FEN 형식이 아님")); return; }
    pushSnap({ board: p.board, turn: p.turn, rights: p.rights, ep: p.ep || null }); setFenErr("");
  };
  const [copied, setCopied] = useState(false);
  const copyFen = async () => { try { await navigator.clipboard.writeText(fenText); setCopied(true); setTimeout(() => setCopied(false), 1500); } catch { } };
  const pasteFen = async () => {
    try {
      const raw = (await navigator.clipboard.readText()).trim();
      if (!looksLikeFen(raw)) { setFenErr(t("클립보드에 올바른 FEN 없음")); return; }
      const p = parseFenFull(raw);
      if (!p) { setFenErr(t("올바른 FEN 형식이 아님")); return; }
      pushSnap({ board: p.board, turn: p.turn, rights: p.rights, ep: p.ep || null }); setFenErr("");
    } catch { setFenErr(t("클립보드를 읽을 수 없음")); }
  };
  // (v0.3.5 기능 → v0.3.9 백엔드 재전환 → v0.4.2 텍스트 인식 확장) 사용자 요청 — 이미지 스캔(사진 →
  // FEN). 서버(api/scan-board.js, Gemini API)가 이제 체스판 배치 사진뿐 아니라 PGN/FEN 텍스트가 담긴
  // 사진도 인식한다. 보드 배치 사진이면 여전히 캐슬링 권리·차례는 사용자가 이미 이 화면에서 설정해
  // 둔 값을 그대로 두고, 텍스트(PGN 기보 또는 FEN 코드)면 FEN은 그대로 적용하고 PGN이면 그 수순을
  // 끝까지 재생해 최종 포지션을 보드에 적용한다(보드 편집기는 배치만 다루므로 수순 자체는 저장하지
  // 않는다).
  const [scanning, setScanning] = useState(false);
  const [scanProgress, setScanProgress] = useState(0);
  const onScanFile = async (file) => {
    setScanning(true); setScanProgress(0); setFenErr("");
    try {
      const data = await scanImageFile(file, setScanProgress);
      if (data.type === "board" && data.fen_board) {
        const p = parseFenFull(data.fen_board + " " + turn + " " + castleRightsStr(rights) + " - 0 1");
        if (!p) { setFenErr(t("인식된 배치를 적용할 수 없음")); return; }
        pushSnap({ board: p.board, ep: null });
        return;
      }
      if (data.type === "text" && data.recognized_text) {
        const raw = data.recognized_text.trim();
        if (looksLikeFen(raw)) {
          const p = parseFenFull(raw);
          if (!p) { setFenErr(t("인식된 FEN 형식이 올바르지 않음")); return; }
          pushSnap({ board: p.board, turn: p.turn, rights: p.rights, ep: p.ep || null });
          return;
        }
        const moves = parsePgnMoves(raw);
        let board = startBoard(), moveEp = null, ok = moves.length > 0;
        for (let i = 0; i < moves.length && ok; i++) {
          const color = i % 2 === 0 ? "w" : "b";
          const info = sanSrc(board, moves[i], color);
          if (!info) { ok = false; break; }
          moveEp = epTargetFromMoveInfo(info);
          board = applySan(board, moves[i], color);
        }
        if (!ok) { setFenErr(t("인식된 기보를 적용할 수 없음")); return; }
        pushSnap({ board, ep: moveEp });
        return;
      }
      setFenErr(t("이미지에서 체스판이나 기보를 인식하지 못함"));
    } catch (e) { setFenErr((e && e.message) || t("이미지 스캔 실패")); }
    finally { setScanning(false); setScanProgress(0); }
  };
  const handleDone = () => { const p = parseFenFull(fenText); if (p) onApply(p); };
  const boardSize = narrow ? Math.min(320, (typeof window !== "undefined" ? window.innerWidth : 360) - 64) : 400;
  const paletteSq = narrow ? Math.min(40, Math.floor((boardSize + 15) / 7) - 4) : 42;

  const resetClearRow = (
    <div className="flex gap-2">
      <button onClick={doReset} className="press" style={{ flex: 1, display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 6, padding: "9px 10px", borderRadius: 10, background: T.ebony2, color: T.brassHi, fontWeight: 800, fontSize: 12.5, border: "1px solid #000", cursor: "pointer" }}>{tx("{0} 초기화", <RefreshCw size={13} />)}</button>
      <button onClick={doClear} className="press" style={{ flex: 1, display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 6, padding: "9px 10px", borderRadius: 10, background: "rgba(200,69,59,.18)", color: "#F4A0A0", fontWeight: 800, fontSize: 12.5, border: "1px solid " + T.blunder, cursor: "pointer" }}>{tx("{0} 지우기", <Trash2 size={13} />)}</button>
      {/* (v0.6.2) 보드 뒤집기를 팔레트 안 작은 아이콘에서 꺼내 분석 탭과 같은 ⇅ 버튼으로 — 눈에 띄지 않아 "뒤집기가 없다"는 제보가 있었다. */}
      <button onClick={() => setFlipped((f) => !f)} title={t("보드 뒤집기")} aria-label={t("보드 뒤집기")} aria-pressed={flipped} className="press" style={{ flexShrink: 0, width: 44, display: "inline-flex", alignItems: "center", justifyContent: "center", borderRadius: 10, background: flipped ? "rgba(255,255,255,.18)" : T.ebony2, color: T.brassHi, border: "1px solid #000", cursor: "pointer" }}><ArrowUpDown size={17} /></button>
    </div>
  );
  const turnCastleGrid = (
    <div style={{ display: "grid", gridTemplateColumns: "auto auto 1fr", gap: "7px 16px", alignItems: "center", fontSize: 11 }}>
      <div />
      <div style={{ fontWeight: 800, color: "rgba(244,238,226,.6)" }}>{t("착수 차례")}</div>
      <div style={{ fontWeight: 800, color: "rgba(244,238,226,.6)" }}>{t("캐슬링 (표준)")}</div>
      {[["w", "K", "Q"], ["b", "k", "q"]].map(([col, kKey, qKey]) => (
        <React.Fragment key={col}>
          <label className="flex items-center" style={{ gap: 6, cursor: "pointer" }}>
            <input type="radio" checked={turn === col} onChange={() => setTurnV(col)} />
            <PieceGlyph type="P" color={col} size={20} />
          </label>
          <div />
          <div className="flex items-center" style={{ gap: 14 }}>
            <label className="flex items-center" style={{ gap: 5, cursor: "pointer", color: T.ivoryHi, fontWeight: 700 }}>
              <input type="checkbox" checked={rights[kKey]} onChange={() => toggleRight(kKey)} /> 0-0
            </label>
            <label className="flex items-center" style={{ gap: 5, cursor: "pointer", color: T.ivoryHi, fontWeight: 700 }}>
              <input type="checkbox" checked={rights[qKey]} onChange={() => toggleRight(qKey)} /> 0-0-0
            </label>
          </div>
        </React.Fragment>
      ))}
    </div>
  );
  const boardEl = <EditorBoardGrid board={board} flipped={flipped} size={boardSize} selected={pickedSq} onSquareClick={onSqClickGuarded} gridRef={gridRef} onPieceDown={startDragFromBoard} dragOn={{ onMove: onDragPointerMove, onUp: onDragPointerUp, onCancel: onDragPointerCancel }} draggingFrom={ptrDrag && ptrDrag.source === "board" ? ptrDrag.from : null} />;
  const paletteBtnStyle = (armed) => ({ width: paletteSq, height: paletteSq, borderRadius: 8, display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", border: armed ? "2px solid " + T.brassHi : "2px solid transparent", background: armed ? "rgba(255,255,255,.3)" : "transparent", touchAction: "none" });
  const isArmed = (color, piece) => !!(tool && tool !== "delete" && tool.color === color && tool.piece === piece);
  const paletteEl = (
    <div style={{ background: "linear-gradient(180deg,#D9A93A,#B8862A)", borderRadius: 10, padding: 6, border: "1px solid #8A6A2F" }}>
      <div className="flex" style={{ gap: 4, marginBottom: 4 }}>
        <button onClick={() => setTool((cur) => (cur === "delete" ? null : "delete"))} title={t("지우개(칸 비우기)")} className="press" style={{ ...paletteBtnStyle(tool === "delete"), background: tool === "delete" ? "rgba(255,255,255,.3)" : "rgba(0,0,0,.15)" }}><Trash2 size={Math.round(paletteSq * 0.42)} color="#3A1E0E" /></button>
        {EDITOR_PALETTE_PIECES.map((p) => (
          <button key={"w" + p}
            onClick={paletteClick(() => setTool((cur) => (cur && cur !== "delete" && cur.piece === p && cur.color === "w") ? null : { piece: p, color: "w" }))}
            onPointerDown={(e) => startDragFromPalette(e, "w", p)} onPointerMove={onDragPointerMove} onPointerUp={onDragPointerUp} onPointerCancel={onDragPointerCancel}
            className="press" style={paletteBtnStyle(isArmed("w", p))}><PieceGlyph type={p} color="w" size={Math.round(paletteSq * 0.8)} /></button>
        ))}
      </div>
      <div className="flex" style={{ gap: 4 }}>
        <div style={{ width: paletteSq, height: paletteSq }} aria-hidden="true" />
        {EDITOR_PALETTE_PIECES.map((p) => (
          <button key={"b" + p}
            onClick={paletteClick(() => setTool((cur) => (cur && cur !== "delete" && cur.piece === p && cur.color === "b") ? null : { piece: p, color: "b" }))}
            onPointerDown={(e) => startDragFromPalette(e, "b", p)} onPointerMove={onDragPointerMove} onPointerUp={onDragPointerUp} onPointerCancel={onDragPointerCancel}
            className="press" style={paletteBtnStyle(isArmed("b", p))}><PieceGlyph type={p} color="b" size={Math.round(paletteSq * 0.8)} /></button>
        ))}
      </div>
    </div>
  );
  const ghostEl = ptrDrag && (
    <div ref={ghostElRef} style={{ position: "fixed", left: ghostPosRef.current.x, top: ghostPosRef.current.y - 22, transform: "translate(-50%,-50%)", zIndex: 999, pointerEvents: "none", filter: "drop-shadow(0 8px 14px rgba(0,0,0,.55))" }}>
      <PieceGlyph type={ptrDrag.piece.t} color={ptrDrag.piece.c} size={Math.round(boardSize / 8 * 0.9)} />
    </div>
  );
  const fenActionsRow = (
    <div className="flex gap-2">
      <button onClick={pasteFen} className="press" style={{ flex: 1, padding: "8px 10px", borderRadius: 9, background: T.ebony2, color: T.ivoryHi, fontWeight: 700, fontSize: 11.5, border: "1px solid #000", cursor: "pointer" }}>{t("복사한 FEN 붙여넣기")}</button>
      <button onClick={copyFen} className="press" style={{ flex: 1, padding: "8px 10px", borderRadius: 9, background: T.ebony2, color: T.ivoryHi, fontWeight: 700, fontSize: 11.5, border: "1px solid #000", cursor: "pointer" }}>{copied ? t("복사됨") : t("FEN 복사")}</button>
    </div>
  );
  const fenInputRow = (
    <div>
      <div className="flex items-center gap-2">
        <span title={t("이 FEN을 보드에 반영")} style={{ flexShrink: 0, color: "rgba(244,238,226,.5)" }}><Save size={15} /></span>
        <input value={fenInput} onChange={(e) => { setFenInput(e.target.value); setFenErr(""); }} onKeyDown={(e) => e.key === "Enter" && applyFenInput()} onBlur={applyFenInput}
          style={{ flex: 1, minWidth: 0, padding: "8px 10px", borderRadius: 8, border: "1px solid #000", background: "rgba(0,0,0,.35)", color: T.ivoryHi, fontFamily: SITE_FONT, fontSize: 11 }} />
      </div>
      {fenErr && <div style={{ fontSize: 10.5, color: T.blunder, marginTop: 4 }}>{fenErr}</div>}
    </div>
  );
  const scanAndHistoryRow = (
    <div className="flex items-center justify-between">
      <ImageSourceMenu onFile={onScanFile} disabled={scanning} busy={scanning} label={t("이미지 스캔")} busyLabel={t("인식하는 중... {0}%", scanProgress)}
        buttonStyle={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "7px 11px", borderRadius: 9, background: scanning ? "rgba(255,255,255,.06)" : T.ebony2, color: scanning ? "rgba(244,238,226,.4)" : T.brassHi, fontWeight: 700, fontSize: 11.5, border: "1px solid " + (scanning ? "rgba(255,255,255,.15)" : "#000"), cursor: scanning ? "default" : "pointer" }} />
      <div className="flex items-center" style={{ gap: 4 }}>
        <button onClick={rewind} disabled={!canUndo} title={t("처음으로")} className="press" style={{ width: 30, height: 30, borderRadius: 8, background: "rgba(255,255,255,.08)", color: T.brassHi, border: "1px solid rgba(255,255,255,.15)", cursor: canUndo ? "pointer" : "default", opacity: canUndo ? 1 : 0.4, display: "inline-flex", alignItems: "center", justifyContent: "center" }}><ChevronsLeft size={15} /></button>
        <button onClick={undo} disabled={!canUndo} title={t("되돌리기")} className="press" style={{ width: 30, height: 30, borderRadius: 8, background: "rgba(255,255,255,.08)", color: T.brassHi, border: "1px solid rgba(255,255,255,.15)", cursor: canUndo ? "pointer" : "default", opacity: canUndo ? 1 : 0.4, display: "inline-flex", alignItems: "center", justifyContent: "center" }}><RotateCcw size={14} /></button>
        <button onClick={redo} disabled={!canRedo} title={t("다시하기")} className="press" style={{ width: 30, height: 30, borderRadius: 8, background: "rgba(255,255,255,.08)", color: T.brassHi, border: "1px solid rgba(255,255,255,.15)", cursor: canRedo ? "pointer" : "default", opacity: canRedo ? 1 : 0.4, display: "inline-flex", alignItems: "center", justifyContent: "center" }}><RotateCw size={14} /></button>
        <button onClick={fastForward} disabled={!canRedo} title={t("마지막으로")} className="press" style={{ width: 30, height: 30, borderRadius: 8, background: "rgba(255,255,255,.08)", color: T.brassHi, border: "1px solid rgba(255,255,255,.15)", cursor: canRedo ? "pointer" : "default", opacity: canRedo ? 1 : 0.4, display: "inline-flex", alignItems: "center", justifyContent: "center" }}><ChevronsRight size={15} /></button>
      </div>
    </div>
  );
  const footerButtons = (
    <div className="flex flex-col" style={{ gap: 8 }}>
      <div className="flex gap-2">
        <button onClick={onClose} className="press" style={{ flex: 1, padding: "11px 0", borderRadius: 10, border: "1px solid rgba(255,255,255,.2)", background: "transparent", color: T.ivoryHi, fontWeight: 800, fontSize: 13, cursor: "pointer" }}>{t("취소")}</button>
        <button onClick={handleDone} className="press" style={{ flex: 1, padding: "11px 0", borderRadius: 10, border: "none", background: "linear-gradient(180deg," + T.brass + ",#A8842F)", color: "#241509", fontWeight: 800, fontSize: 13, cursor: "pointer" }}>{t("완료")}</button>
      </div>
    </div>
  );
  const header = (
    <div className="flex items-center justify-between">
      <div style={{ fontSize: 15, fontWeight: 800, color: T.ivoryHi }}>{t("보드 편집")}</div>
      <button onClick={onClose} aria-label={t("닫기")} className="press" style={{ width: 30, height: 30, borderRadius: 9, background: "rgba(255,255,255,.08)", color: T.ivoryHi, border: "1px solid rgba(255,255,255,.15)", cursor: "pointer" }}>✕</button>
    </div>
  );
  if (narrow) {
    return (
      <div style={{ position: "fixed", inset: 0, background: "rgba(10,6,3,.7)", zIndex: 95, display: "flex" }}>
        {ghostEl}
        <div style={{ width: "100%", display: "flex", flexDirection: "column", background: "linear-gradient(180deg,#2E1B10,#160C06)" }}>
          <div style={{ padding: "14px 16px", borderBottom: "1px solid rgba(255,255,255,.1)" }}>{header}</div>
          <div style={{ flex: 1, minHeight: 0, overflowY: "auto", padding: 16, display: "flex", flexDirection: "column", gap: 14 }}>
            {resetClearRow}
            {turnCastleGrid}
            <div className="flex justify-center">{boardEl}</div>
            {paletteEl}
            {fenActionsRow}
            {fenInputRow}
            {scanAndHistoryRow}
          </div>
          <div style={{ padding: 16, borderTop: "1px solid rgba(255,255,255,.1)" }}>{footerButtons}</div>
        </div>
      </div>
    );
  }
  // (사용자 요청) 데스크톱 — 체스보드만 남기고 나머지 UI는 전부 보드 오른쪽에 모아, 가로 비율의 창 하나로.
  return (
    <div onClick={onClose} style={{ position: "fixed", inset: 0, background: "rgba(10,6,3,.7)", zIndex: 95, display: "flex", alignItems: "center", justifyContent: "center", padding: 24 }}>
      {ghostEl}
      <div onClick={(e) => e.stopPropagation()} style={{ width: "min(880px, 100%)", maxHeight: "min(680px, 100%)", display: "flex", gap: 26, background: "linear-gradient(180deg,#2E1B10,#160C06)", borderRadius: 18, border: "1px solid #000", boxShadow: "0 30px 70px -16px rgba(0,0,0,.7)", padding: 24, overflow: "auto" }}>
        <div style={{ flexShrink: 0 }}>{boardEl}</div>
        <div style={{ flex: 1, minWidth: 280, display: "flex", flexDirection: "column", gap: 14 }}>
          {header}
          {resetClearRow}
          {turnCastleGrid}
          {paletteEl}
          {fenActionsRow}
          {fenInputRow}
          {scanAndHistoryRow}
          <div style={{ flex: 1 }} />
          {footerButtons}
        </div>
      </div>
    </div>
  );
}
// (v0.4.5 기능, 사용자 요청) 수 블록의 리체스 대국 수(a/b)가 0부터 실제 값까지 빠르게 카운팅되며 올라가는
// 연출 — b(포지션 전체 대국 수)가 먼저 끝나고 a(그 수의 대국 수)가 끝까지 이어서 세도록 duration을 다르게 둔다.
function useCountUp(target, durationMs, decimals = 0) {
  const [display, setDisplay] = useState(target ?? 0);
  const rafRef = useRef(null);
  useEffect(() => {
    if (target == null) return;
    cancelAnimationFrame(rafRef.current);
    const start = performance.now();
    const p = Math.pow(10, decimals);
    const tick = (now) => {
      const t = Math.min(1, (now - start) / durationMs);
      const eased = 1 - Math.pow(1 - t, 3);
      // (버그 수정, 사용자 제보) 채택률(%) 등 소수점 표기가 반올림된 값으로 보였다 — 애니메이션이
      // 끝나는 마지막 프레임(eased=1)의 값이 그대로 최종 표시값이 되는데, 여기서 Math.round를 쓰면
      // 예를 들어 12.347%가 12.35%로 반올림돼 보였다. 반올림 대신 내림(버림)으로 잘라, 실제 값의
      // 소수점 이하를 부풀리지 않는 근삿값(항상 실제 값 이하)을 보여준다. games처럼 decimals=0인
      // 정수 카운터는 target 자체가 정수라 최종값에는 영향이 없다.
      setDisplay(Math.floor(target * eased * p) / p);
      if (t < 1) rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafRef.current);
  }, [target, durationMs, decimals]);
  return target == null ? null : display;
}
// (v0.5.6 기능, 사용자 요청) 분석 탭 수 블록의 일일 퀘스트 표시 — 블록이 나타날 때 아이콘이 톡 튀어나오고, 오른쪽으로 두루마리
// (원통)가 굴러가며 펴지듯 "퀘스트" 알약이 펼쳐진다(탁월/유일/최선 이펙트의 알약처럼). 움직임은 전부 합성기 값(opacity·transform
// 문자열·clipPath)만 쓴다(SquareFx 주석 참고).
// (v0.5.7, 사용자 요청 "흔들림이 부자연스럽다") 몇 초마다 태그 전체를 까딱까딱 회전시키던 흔들림을 없앴다 — 이제 태그는 제자리에
// 가만히 있고, 주기마다 아이콘 뒤에서 금빛 고리가 한 번 퍼져 나가며 사라지고(ping), 이어서 알약 위로 빛줄기가 한 번 스쳐 지나간다
// (금속 광택). 태그가 움직이지 않아 글자가 흔들려 읽기 어렵거나 블록 가장자리에서 삐져나오는 일이 없다.
const QUEST_TAG_H = 22, QUEST_TAG_W = 64;
const QUEST_TAG_POP = 0.12, QUEST_TAG_ROLL = 0.5;      // 아이콘 등장 뒤 펼치기 시작(초), 펼치는 시간(초)
const QUEST_IDLE_START = QUEST_TAG_POP + QUEST_TAG_ROLL + 0.9;   // 펼쳐진 뒤 첫 손짓까지(초)
const QUEST_IDLE_PERIOD = 3.8;                                    // 손짓 주기(초) — 고리·빛줄기가 같은 주기로 반복된다
const QUEST_PING_DUR = 0.95, QUEST_SHINE_DUR = 0.7, QUEST_SHINE_LAG = 0.18;
function QuestTag({ onClick }) {
  const H = QUEST_TAG_H, W = QUEST_TAG_W, R = QUEST_TAG_POP, D = QUEST_TAG_ROLL;
  const clipClosed = "inset(0px " + (W - H) + "px 0px 0px round 999px)", clipOpen = "inset(0px 0px 0px 0px round 999px)";
  const Tag = onClick ? motion.button : motion.span;
  return (
    <Tag onClick={onClick ? (e) => { e.stopPropagation(); onClick(); } : undefined} title={onClick ? t("일일 퀘스트 오프닝. 눌러서 퀘스트 보기") : t("일일 퀘스트 오프닝")}
      whileHover={onClick ? { transform: "scale(1.05)" } : undefined} whileTap={onClick ? { transform: "scale(0.95)" } : undefined}
      style={{ position: "absolute", top: -8, left: -8, width: W, height: H, padding: 0, border: "none", background: "transparent", zIndex: 5, cursor: onClick ? "pointer" : "default", transformOrigin: H / 2 + "px 50%", filter: "drop-shadow(0 2px 3px rgba(0,0,0,.38))" }}>
      {/* 손짓 1 — 아이콘 뒤에서 퍼져 나가며 옅어지는 금빛 고리(알약·아이콘 아래에 깔려 왼쪽·위·아래로만 보인다) */}
      <motion.span initial={{ opacity: 0, transform: "scale(1)" }} animate={{ opacity: [0.9, 0], transform: ["scale(1)", "scale(1.9)"] }}
        transition={{ duration: QUEST_PING_DUR, delay: QUEST_IDLE_START, ease: "easeOut", repeat: Infinity, repeatDelay: QUEST_IDLE_PERIOD - QUEST_PING_DUR }}
        style={{ position: "absolute", left: 0, top: 0, width: H, height: H, borderRadius: "50%", border: "2px solid " + T.brassHi, boxSizing: "border-box", willChange: "transform, opacity" }} />
      {/* 펼쳐지는 알약 — 왼쪽(아이콘 뒤)에 말려 있다가 clipPath로 오른쪽까지 드러난다 */}
      <motion.span initial={{ clipPath: clipClosed }} animate={{ clipPath: clipOpen }} transition={{ duration: D, delay: R, ease: [0.3, 0.7, 0.3, 1] }}
        style={{ position: "absolute", inset: 0, borderRadius: 999, background: "linear-gradient(180deg," + T.brassHi + "," + T.brass + ")", border: "2px solid " + T.paper, boxSizing: "border-box", overflow: "hidden", willChange: "clip-path" }}>
        <motion.span initial={{ opacity: 0, transform: "translateX(-8px)" }} animate={{ opacity: 1, transform: "translateX(0px)" }} transition={{ duration: D * 0.8, delay: R + D * 0.3, ease: "easeOut" }}
          style={{ position: "absolute", left: H - 2, right: 0, top: 0, bottom: 0, display: "flex", alignItems: "center", justifyContent: "center", color: "#241509", fontSize: 10.5, fontWeight: 900, fontFamily: SITE_FONT, letterSpacing: "-0.02em", whiteSpace: "nowrap" }}>{t("퀘스트")}</motion.span>
        {/* 두루마리 심 — 펼쳐지는 가장자리를 따라 굴러가는 원통 음영, 다 펴지면 사라진다 */}
        <motion.span initial={{ opacity: 1, transform: "translateX(" + (H - 12) + "px)" }} animate={{ opacity: [1, 1, 0], transform: ["translateX(" + (H - 12) + "px)", "translateX(" + (W - 14) + "px)", "translateX(" + (W - 14) + "px)"] }}
          transition={{ duration: D + 0.15, delay: R, times: [0, D / (D + 0.15), 1], ease: [[0.3, 0.7, 0.3, 1], "linear"] }}
          style={{ position: "absolute", left: 0, top: 0, bottom: 0, width: 10, borderRadius: 999, background: "linear-gradient(90deg,#6E5424 0%," + T.brassHi + " 45%,#FFF6DE 55%,#8A6C2F 100%)", willChange: "transform, opacity" }} />
        {/* 손짓 2 — 고리가 퍼진 직후 알약 위를 왼쪽에서 오른쪽으로 스치는 비스듬한 빛줄기(알약 overflow로 잘린다) */}
        <motion.span initial={{ transform: "translateX(-20px) skewX(-22deg)" }} animate={{ transform: ["translateX(-20px) skewX(-22deg)", "translateX(" + (W + 6) + "px) skewX(-22deg)"] }}
          transition={{ duration: QUEST_SHINE_DUR, delay: QUEST_IDLE_START + QUEST_SHINE_LAG, ease: [0.45, 0, 0.35, 1], repeat: Infinity, repeatDelay: QUEST_IDLE_PERIOD - QUEST_SHINE_DUR }}
          style={{ position: "absolute", left: 0, top: -2, bottom: -2, width: 14, background: "linear-gradient(90deg, rgba(255,248,225,0) 0%, rgba(255,248,225,.9) 50%, rgba(255,248,225,0) 100%)", pointerEvents: "none", willChange: "transform" }} />
      </motion.span>
      {/* 아이콘 원 */}
      <motion.span initial={{ opacity: 0, transform: "scale(0.3)" }} animate={{ opacity: 1, transform: "scale(1)" }} transition={{ duration: 0.32, ease: [0.2, 0.9, 0.3, 1.35] }}
        style={{ position: "absolute", left: 0, top: 0, width: H, height: H, borderRadius: "50%", background: T.brass, border: "2px solid " + T.paper, boxSizing: "border-box", display: "flex", alignItems: "center", justifyContent: "center", willChange: "transform, opacity" }}>
        <MaterialIcon name="assignment" size={12} color="#241509" />
      </motion.span>
    </Tag>
  );
}
function MoveTile({ m, ply, startColor, onClick, onFocus, hideFocus, posGames, statsLoading, questBadge, onQuestBadgeClick }) {
  const kind = m.kind || "good";
  const color = QCOLOR[kind];
  const kws = m.book ? deriveKeywords(m) : (Array.isArray(m.kw) ? m.kw : []);   // 비이론 수는 개발자가 추가한 키워드만 표기
  const evTxt = m.live ? fmtEvalCp(m.live.cp, m.live.mate, m.live.plies) : (m.evalCp != null || m.mate != null ? fmtEvalCp(m.evalCp, m.mate) : null);
  const gamesDisp = useCountUp(m.games, 900);
  const posGamesDisp = useCountUp(posGames, 500);
  const adoptDisp = useCountUp(m.adopt, 900, 2);
  return (
    <div style={{ minWidth: 0, borderRadius: 12, marginBottom: 9, background: "linear-gradient(180deg," + T.ivoryHi + " 0%," + T.ivory + " 60%,#DFD0B2 100%)", borderLeft: "5px solid " + color, boxShadow: "0 4px 0 #B59A6E, 0 9px 16px -9px rgba(0,0,0,.55)", padding: "10px 12px", overflow: "visible", position: "relative" }}>
      {/* (20차 UI4) 오늘의 일일 퀘스트(오프닝 플레이) 수순에 해당하는 블록임을 알려주는 배지.
          (사용자 요청) 누르면 즉시 학습 탭으로 이동해 해당 퀘스트를 하이라이트한다. */}
      {questBadge && <QuestTag onClick={onQuestBadgeClick} />}
      <div style={{ display: "flex", alignItems: "center", gap: 13 }}>
        <span onClick={(e) => e.stopPropagation()}><CircleBadge kind={kind} descOnClick /></span>
        <div style={{ minWidth: 0, flex: 1 }}>
          <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 8 }}>
            <div style={{ minWidth: 0, flex: 1, cursor: "pointer" }} onClick={onClick}>
              <div style={{ marginBottom: 6 }}><KeywordScroll kws={kws} /></div>
              <div style={{ display: "flex", alignItems: "baseline", gap: 8, flexWrap: "wrap" }}>
                <span style={{ fontSize: 16, fontWeight: 800, color: T.ink }}>{moveNumber(ply, startColor)}{m.disp || m.san}</span>
                {m.name ? <span style={{ fontSize: 12.5, color: T.ink, fontWeight: 600, wordBreak: "keep-all" }}>{m.name}</span> : m.isMain ? <span style={{ fontSize: 12, color: T.inkSoft, fontWeight: 600 }}>Main Line</span> : null}
                <span style={{ fontFamily: SITE_FONT, fontSize: 13, fontWeight: 700, color }}>{evTxt || (m.book ? t("이론") : "…")}</span>
              </div>
            </div>
            {!hideFocus && (
              <button onClick={(e) => { e.stopPropagation(); onFocus && onFocus(); }} className="press" style={{ flexShrink: 0, display: "inline-flex", alignItems: "center", gap: 3, padding: "5px 9px", borderRadius: 8, background: T.ebony2, color: T.brassHi, fontSize: 10.5, fontWeight: 700, border: "1px solid #000", cursor: "pointer", whiteSpace: "nowrap" }}>{tx("{0} 분석", <Play size={11} />)}</button>
            )}
          </div>
          <div onClick={onClick} style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 7, cursor: "pointer" }}>
            {/* (사용자 요청) "a/b" 회수 표기가 자릿수가 많아지면 잘려 보이던 문제, 그리고 채택률(%)
                오른쪽 여백이 부족하던 문제를 함께 고치기 위해 게이지 바 폭을 다시 한번 줄였다
                (55% → 34% → 20%) — 확보한 여백은 옆 텍스트 쪽(회수 전체 표시 + % 오른쪽 여백)으로 돌아간다. */}
            <div style={{ flex: "0 1 20%", minWidth: 0, height: 5, borderRadius: 3, background: "rgba(0,0,0,.12)", overflow: "hidden" }}>
              <div style={{ width: Math.min(100, m.adopt || 0) + "%", height: "100%", background: color, opacity: .85 }} />
            </div>
            {/* (사용자 요청) 채택률(%) 텍스트는 항상 블록 기준 오른쪽 정렬 — 게임 수 텍스트가 길어져도
                justify-content: space-between으로 %는 항상 오른쪽 끝에 고정된다. 통계가 아직 도착
                전(statsLoading)이면 "—" 대신 3-dot bounce 인디케이터로 로딩 중임을 보여준다. */}
            <span style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 10, flex: 1, minWidth: 0, fontSize: 10, color: T.inkSoft, fontFamily: SITE_FONT }}>
              <span style={{ whiteSpace: "nowrap" }}>{m.games != null ? fmtFull(gamesDisp) + " / " + fmtFull(posGamesDisp) : statsLoading ? <PendingDots size={10} /> : "—"}</span>
              <span style={{ color: T.ink, fontWeight: 700, flexShrink: 0, textAlign: "right" }}>{m.adopt != null ? adoptDisp.toFixed(2) + "%" : statsLoading ? <PendingDots size={10} /> : "—"}</span>
            </span>
          </div>
          {/* (UI) 도감 탭과 동일한 형식(백/무/흑 바 + %)으로 이 수의 승률 표기 */}
          {m.wdl && <div onClick={onClick} style={{ marginTop: 7, cursor: "pointer" }}><WinBar wdl={m.wdl} height={6} /></div>}
        </div>
      </div>
    </div>
  );
}
/* 수 품질·상황 → 마스코트 이모트 */
const Q_MASCOT = { brilliant: ["kokoa", "celebrate"], best: ["milku", "great"], excellent: ["milku", "wink"], good: ["milku", "great"], book: ["milku", "wink"], only: ["milku", "surprise"], pending: ["milku", "think"], inaccuracy: ["kokoa", "think"], miss: ["kokoa", "surprise"], mistake: ["kokoa", "surprise"], blunder: ["kokoa", "angry"] };
function mascotForKind(kind) { return Q_MASCOT[kind] || ["milku", "great"]; }
/* ============================================================ 병합 훅 (Lichess 우선 + 사용자 착수 블록 + 백관점 평가) ============================================================ */
function useMergedMoves(sans, engine, liveOn, extraSans, contentVer, mode, sortBy) {
  const node = snapNode(sans);
  const key = sans.join(" ");
  const ply = sans.length;
  const color = ply % 2 === 0 ? "w" : "b";
  const [moves, setMoves] = useState([]);
  const [posGames, setPosGames] = useState(node ? node.posGames : null);
  const [statsLoading, setStatsLoading] = useState(false); // (사용자 요청) 리체스 회수/채택률 fetch가 아직 안 끝났음을 알려주는 플래그
  const [posEval, setPosEval] = useState(null);
  const [engineLines, setEngineLines] = useState([]); // (v0.1.3 기능) 엔진 상위 3줄(MultiPV) 전체 수순
  // (버그 수정) 수를 둘 때마다 engineLines를 곧장 []로 비웠다가 재계산이 끝나면 다시 채웠는데, 그
  // 사이(재요청 왕복 시간만큼) belowEval 자리가 통째로 사라져 그 아래 보드·기보가 위로 들썩였다
  // (레이아웃 높이가 0↔실제 높이로 튐). 이제 engineLines는 새 결과가 도착할 때만 교체하고, 계산
  // 중인지는 이 별도 플래그(linesPending)로만 표시한다 — 이전 포지션의 라인을 옅게 유지한 채
  // "계산 중" 표시를 얹어, 사라졌다 나타나는 대신 제자리에서 갱신되는 것처럼 보이게 한다.
  const [linesPending, setLinesPending] = useState(false);
  const [curDepth, setCurDepth] = useState(null); // (17차) 평가치 바 위에 표기할 실시간 엔진 depth
  // (19차 UX1) 표기용 depth는 한 포지션 안에서 단조 증가(+1)만 하도록 한다. 원래는 위치 평가(→16)에
  // 이어 후보 수마다 별도 go depth(→15)를 돌려 setCurDepth가 1~15를 여러 번 반복해 표기가 튀었다.
  // 포지션(key)이 바뀔 때만 0으로 리셋하고, 이후엔 max로만 갱신한다.
  const depthKeyRef = useRef(null);
  const bumpDepth = useCallback((d) => { if (d == null) return; setCurDepth((prev) => (prev == null || d > prev) ? d : prev); }, []);
  // (성능) 아래 실시간 평가 effect는 dep에 moves.length가 있어, 이 effect 자신이 후보 수를 채워
  // moves가 늘어날 때마다 처음부터 다시 실행된다. 예전엔 재실행될 때마다 이 포지션 평가(be)와
  // MultiPV-10 보충(pvs)을 매번 엔진에 다시 물어봤는데, 둘 다 sans(포지션)에만 의존하지 이미 채워진
  // moves 개수와는 무관해 재실행 사이에 결과가 달라지지 않는다 — 포지션이 그대로인 한 캐시해 재질의를 건너뛴다.
  const posCacheRef = useRef({ key: null, multiPromise: null, live: new Map() });
  // (성능) 화면에 보이는 후보 수(캡 없이 최대 수십 개)의 실시간 평가가 메인 엔진 큐 하나로 한 번에
  // 하나씩 순서대로 처리되고 있었다 — 후보 수가 많은 포지션일수록 총 대기 시간이 후보 수 개수에
  // 정비례해 늘어(수당 최대 700ms) 체감 지연의 핵심 원인이었다. depth·movetime(정확도)은 그대로
  // 두고, 게임 리뷰(analyzeGame)와 같은 방식으로 독립된 워커 풀을 여러 개 띄워 후보 수들을 나눠
  // 동시에 계산한다 — 총 계산량은 그대로지만 벽시계 시간만 풀 크기만큼 줄어든다.
  // (버그 수정) analyzeGame은 배치 하나가 끝나면 풀을 바로 버리지만, 이 실시간 평가는 사용자가
  // 수를 둘 때마다 반복해서 도는 effect라 매번 새로 부팅하면(워커 로딩 자체가 초 단위) 오히려
  // 더 느려진다 — 엔진 프로필(설정에서 바꾸는 lite/full)이 그대로인 한 한 번 띄운 풀을 계속
  // 재사용하고, 프로필이 바뀔 때만 기존 풀을 정리하고 새로 띄운다.
  // epoch: 이 풀이 몇 번째로 새로 띄운 세대인지 — 프로필이 바뀌거나 이전 세대가 완전히 부팅
  // 실패했을 때만 올라간다. cache.live(아래)에 넣는 진행 중 Promise마다 만들어진 시점의 epoch를
  // 같이 저장해 두고, 그 사이 세대가 넘어갔다면(=워커가 이미 terminate돼 다시는 응답이 안 옴)
  // 캐시를 버리고 새 세대 워커로 재요청한다.
  const livePoolRef = useRef({ profile: null, workers: [], booting: null, epoch: 0, failed: false });
  useEffect(() => {
    const st = livePoolRef.current;
    return () => { st.unmounted = true; st.workers.forEach((w) => w.terminate()); };
  }, []);
  const getLivePool = useCallback(async () => {
    const st = livePoolRef.current;
    if (st.profile === engine.profile) {
      if (st.workers.length || st.booting) return st.booting ? await st.booting : st.workers;
      // (버그 수정) 풀 부팅이 이 프로필로 완전히 실패했던 적이 있으면(workers=[], booting=null,
      // failed=true) — 매번 재시도하면(부팅 자체가 URL당 최대 4초) 수를 둘 때마다 반복해서
      // 몇 초씩 멈춘다. 같은 프로필인 한 재시도하지 않고 곧장 빈 배열(→ 메인 엔진 폴백)을 돌려준다.
      if (st.failed) return [];
    }
    st.workers.forEach((w) => w.terminate());
    const epoch = st.epoch + 1;
    const size = analyzePoolSize(engine.profile);
    const booting = Promise.all(Array.from({ length: size }, () => bootAnalysisWorker(engine.urls))).then((ws) => ws.filter(Boolean));
    livePoolRef.current = { ...st, profile: engine.profile, workers: [], booting, epoch, failed: false };
    const workers = await booting;
    // (버그 수정) 이 await 도중 컴포넌트가 언마운트됐다면, 방금 부팅된 워커를 livePoolRef에
    // 반영하지 않고 바로 정리한다 — 반영해도 아무도 안 쓰지만 정리 없이 방치하면 워커 스레드가
    // 누수된다(언마운트 cleanup은 이미 이전 시점의 workers 배열만 정리하고 끝났으므로).
    if (livePoolRef.current.unmounted) { workers.forEach((w) => w.terminate()); return []; }
    // 그 사이 프로필이 또 바뀌어 더 최신 epoch가 이미 진행 중이면, 지금 막 부팅된 이 워커들은
    // 이미 낡은 세대다 — 반영하지 않고 정리한다.
    if (livePoolRef.current.epoch !== epoch) { workers.forEach((w) => w.terminate()); return livePoolRef.current.workers; }
    livePoolRef.current = { profile: engine.profile, workers, booting: null, epoch, failed: workers.length === 0 };
    return workers;
  }, [engine.profile, engine.urls]);
  const [engineNote, setEngineNote] = useState("");
  const [masterEmpty, setMasterEmpty] = useState(false); // 마스터 기보가 실제로 없는 경우(엔진 추천 허용)
  const extraKey = (extraSans || []).join(",");
  const isMaster = mode === "master";

  useEffect(() => {
    let cancelled = false;
    const base = node ? node.moves.map((m) => ({ ...m })) : [];
    const withExtra = (list) => {
      const seen = new Set(list.map((m) => stripSuffix(m.san)));
      addsFor(key).forEach((a) => { if (!seen.has(stripSuffix(a.san))) { list.push(devAddEntry(key, a)); seen.add(stripSuffix(a.san)); } });
      (extraSans || []).forEach((s) => { if (!seen.has(stripSuffix(s))) { list.push({ san: s, book: false, adopt: null, games: null, user: true }); seen.add(stripSuffix(s)); } });
      return list;
    };
    setMoves(withExtra(base.map((m) => ({ ...m })))); setPosGames(node ? node.posGames : null); setPosEval(null); setEngineNote(""); setMasterEmpty(false);
    // (사용자 요청) 리체스 통계(회수/채택률) fetch가 실제로 도착하기 전까지는 각 수 블록·현재 수
    // 블록이 이 플래그를 보고 "—" 대신 3-dot bounce 인디케이터를 보여준다.
    setStatsLoading(liveOn);
    if (!liveOn) return;
    // (사용자 요청, 성능) 일반·마스터 통계를 둘 다 기다렸다가 한꺼번에 반영하던 것을, 먼저 도착한 쪽부터
    // 곧바로 화면에 반영한다 — 일반 통계(기본 화면)는 마스터 응답을 기다리지 않고, 마스터 응답은 뒤늦게
    // 와도 마스터 채택률·상위 표시만 덧붙인다. 마스터 모드는 마스터 응답이 오는 즉시(실패면 일반 통계로 대체).
    let normal = null, master = null, nDone = false, mDone = false, applied = false;
    const applyMain = () => {
      // (기능1) 마스터/일반 통계 반영. 마스터 fetch 실패와 "기보 없음"을 구분.
      let active = null, emptyMaster = false;
      if (isMaster) {
        if (master && master.moves.length) { active = master; }
        else if (master && !master.moves.length) { setPosGames(master.posTotal); setEngineNote(t("이 포지션의 마스터 기보 없음. 엔진 추천 수 표시")); emptyMaster = true; }
        else { active = normal; setEngineNote(normal && normal.moves.length ? t("마스터 기보 로드 실패. 일반 통계 표시") : t("기보를 불러오지 못함")); }
      } else {
        active = normal || master;
      }
      setMasterEmpty(emptyMaster);
      if (!active || !active.moves.length) { if (emptyMaster) setMoves(withExtra([])); return; }
      setPosGames(active.posTotal);
      const snapBy = Object.fromEntries(base.map((m) => [stripSuffix(m.san), m]));
      // (기능3) 새로 추가한 이론 수(addsFor)와 스냅샷에 원래 있던 이론 수를 구분하지 않는다 —
      // 둘 다 여기서 같은 "책 등록부"로 합쳐서 봄. 그렇지 않으면 dev가 추가한 수가 Lichess의
      // 일반 후보 수로도 함께 돌아올 때 book 여부가 스냅샷 쪽(false)으로 덮여버려 헤더에서
      // 비이론 수로 잘못 표기되는 문제가 있었음.
      const devAddsBy = Object.fromEntries(addsFor(key).map((a) => [stripSuffix(a.san), a]));
      const masterAdoptBy = master ? Object.fromEntries(master.moves.map((m) => [stripSuffix(m.san), m.adopt])) : {};
      const masterTopSans = master ? master.moves.slice(0, 3).map((m) => stripSuffix(m.san)) : [];
      const mk = (l) => {
        const k = stripSuffix(l.san);
        const s = snapBy[k] || {};
        const dev = devAddsBy[k];
        const unb = isUnbooked(key, l.san);
        const book = !unb && (!!s.book || !!(dev && dev.theory));
        return { san: l.san, adopt: l.adopt, games: l.games, wdl: l.wdl, book, name: s.name ?? (dev && dev.name), kw: s.kw, evalCp: s.evalCp, isMain: s.isMain, masterAdopt: masterAdoptBy[k] ?? null, masterTop: masterTopSans.includes(k) };
      };
      const all = active.moves.map(mk);
      // (버그 수정) Lichess가 이 위치의 후보 수 목록에 큐레이션된 이론 수를 포함하지 않으면(희귀한
      // 변형 등) 그 수가 통째로 빠져, 보드 위 추천 화살표가 아예 안 그려지거나(채택률 데이터가 없는
      // 수만 남아) 두께·투명도가 전부 최솟값으로 뭉개져 보이는 문제가 있었다 — 스냅샷의 이론 수는
      // Lichess 응답에 없어도 항상 포함되도록 보강한다.
      const coveredSans = new Set(all.map((m) => stripSuffix(m.san)));
      for (const s of base) {
        if (!s.book) continue;
        const k = stripSuffix(s.san);
        if (coveredSans.has(k)) continue;
        const dev = devAddsBy[k];
        all.push({ san: s.san, adopt: null, games: null, wdl: null, book: true, name: s.name ?? (dev && dev.name), kw: s.kw, evalCp: s.evalCp, isMain: s.isMain, masterAdopt: masterAdoptBy[k] ?? null, masterTop: masterTopSans.includes(k) });
        coveredSans.add(k);
      }
      const books = all.filter((m) => m.book);
      const nonbook = all.filter((m) => !m.book);
      // Lichess가 응답한 비이론 수는 전부 유지(임의 캡 금지) — 수 체계와 무관하게 표시되는 모든 수가 통계를 가져야 함
      const out = [...books, ...nonbook];
      // 엔진이 먼저 끝나 이미 live 평가·보충 수가 들어와 있어도 지워지지 않게 합친다.
      setMoves((prev) => {
        const pb = Object.fromEntries(prev.map((m) => [stripSuffix(m.san), m]));
        const merged = withExtra(out).map((m) => { const o = pb[stripSuffix(m.san)]; return o && o.live ? { ...m, live: o.live } : m; });
        const have = new Set(merged.map((m) => stripSuffix(m.san)));
        prev.forEach((m) => { if (m.engine && !have.has(stripSuffix(m.san))) merged.push(m); });
        return merged;
      });
    };
    const patchMaster = () => {
      const adoptBy = Object.fromEntries(master.moves.map((m) => [stripSuffix(m.san), m.adopt]));
      const top = master.moves.slice(0, 3).map((m) => stripSuffix(m.san));
      setMoves((prev) => prev.map((m) => { const k = stripSuffix(m.san); return { ...m, masterAdopt: adoptBy[k] ?? m.masterAdopt ?? null, masterTop: top.includes(k) }; }));
    };
    const onArrive = () => {
      if (cancelled) return;
      if (!applied) {
        const ready = isMaster ? (mDone && (master || nDone)) : (normal ? true : (nDone && mDone));
        if (!ready) return;
        applied = true;
        try { applyMain(); } catch (_) { /* 차단 시 스냅샷 유지 */ }
        setStatsLoading(false);
      } else if (!isMaster && master && mDone) {
        patchMaster();
      }
    };
    // (v0.6.1 버그 수정) 포지션 통계 조회가 레이트리밋·일시 오류로 한 번 실패하면 posGames·채택률이 비어 "회수 / —"와
    // 빈 막대만 남았다(보충 조회는 나중에 성공해 회수만 채워짐). 실패하면 잠시 뒤 두 번 더 시도한다.
    const fetchWithRetry = async (isM) => {
      for (let attempt = 0; ; attempt++) {
        try { return await fetchLichess(sans, isM); }
        catch (e) {
          if (attempt >= 2 || cancelled) throw e;
          await new Promise((r) => setTimeout(r, 1500 * (attempt + 1)));
          if (cancelled) throw e;
        }
      }
    };
    lichessForeground(fetchWithRetry(false)).then((v) => { normal = v; }, () => { }).finally(() => { nDone = true; onArrive(); });
    lichessForeground(fetchWithRetry(true)).then((v) => { master = v; }, () => { }).finally(() => { mDone = true; onArrive(); });
    return () => { cancelled = true; };
  }, [key, liveOn, extraKey, contentVer, isMaster]);

  // liveOn을 끄면(설정 토글) 더 이상 갱신되지 않을 이전 포지션의 엔진 라인이 계속 옅게 남아 있을
  // 이유가 없다 — 이때만 확실히 비운다(수를 둘 때마다는 비우지 않음, 위 참고).
  useEffect(() => { if (!liveOn) { setEngineLines([]); setLinesPending(false); } }, [liveOn]);

  useEffect(() => {
    let cancelled = false;
    if (!liveOn || engine.status !== "ready") return;
    if (depthKeyRef.current !== key) { depthKeyRef.current = key; setCurDepth(null); } // (19차 UX1) 포지션 바뀔 때만 리셋
    setLinesPending(true); // 이 포지션의 새 엔진 라인을 계산하는 동안, 이전 라인은 옅게 유지한 채 "계산 중"만 표시한다
    const baseWhite = ply % 2 === 0 ? 1 : -1;
    const childWhite = (ply + 1) % 2 === 0 ? 1 : -1;
    (async () => {
      // (기능1) 최종 depth까지 기다리지 않고, 얕은 depth부터 실시간으로 평가치를 갱신해 보여준다.
      // (20차) 메이트를 ±1000cp 숫자로 뭉개지 않고 {mate,win} 객체로 보존 — 평가치 바가 M수로 표기한다.
      // mate>0=둘 차례가 메이트를 부름, mate===0=둘 차례가 이미 메이트당한 상태.
      const mkPosEval = (ev) => ev.mate != null
        ? { mate: ev.mate * baseWhite, win: (ev.mate > 0) === (baseWhite === 1) ? "w" : "b", plies: matePliesOf(ev.mate) }
        : { cp: ev.cp * baseWhite };
      // (버그 수정) 이 콜백이 예전엔 이 effect 실행(generation) 하나에만 묶인 `cancelled` 플래그로
      // 막았는데, 바로 아래 cache.multiPromise/extraKey 가드가 "같은 포지션이면 진행 중인 요청을
      // 이어받아 재사용"하도록 설계돼 있어(중복 요청 방지) 실제 엔진 작업은 여러 번의 effect 재실행
      // (moves.length가 점진적으로 채워지며 자주 재실행됨)을 가로질러 계속 살아있다 — 그런데 그
      // 작업을 처음 만든 특정 실행이 재실행으로 정리(cleanup)되며 그 실행의 cancelled만 true가 되면,
      // 이 콜백은 그 뒤로 영원히 아무 일도 안 하는 채로 조용히 죽어버렸다(엔진은 계속 depth를 파고
      // 있는데도 평가치 바·"n수 후까지 탐색 중" depth 표시만 그 시점에서 멈춘 것처럼 보임 — 특히
      // 5초짜리 심화 탐색 도중 moves.length가 바뀌기 쉬워 눈에 띄게 됐다). streamLines와 동일하게
      // "지금도 같은 포지션인가"(posCacheRef.current.key !== key)만으로 판단해, 어느 실행이 이
      // 콜백을 만들었든 포지션이 그대로인 한 계속 살아있게 한다.
      const onEvalProgress = (partial) => {
        if (posCacheRef.current.key !== key || !partial) return;
        setPosEval(mkPosEval(partial));
        bumpDepth(partial.depth);
      };
      // (성능) 예전엔 movetime 없이 depth만 줘서, 복잡한 포지션에서는 depth에 도달할 때까지 무제한으로
      // 오래 걸릴 수 있었다(수를 둘 때마다 이 effect가 다시 돌아 체감 지연으로 이어짐). analyzeGame·
      // puzzleCandidatesAt처럼 movetime 상한을 둬 depth·시간 중 먼저 도달하는 쪽에서 멈추게 한다 —
      // 대부분의 평범한 포지션은 이 시간 안에 목표 depth에 이미 도달하므로 체감 변화가 없고, 유독
      // 오래 걸리던 복잡한 포지션만 실제로 빨라진다.
      // (버그 수정) moves.length가 빠르게 연달아 바뀌면(예: 초반 이론 수가 순차 도착) 이 effect도
      // 연달아 재실행되는데, 앞선 실행의 엔진 요청이 아직 끝나기 전(=캐시에 값이 채워지기 전)에
      // 다음 실행이 시작되면 "값이 없으니 또 요청"하게 되어 캐시가 무력화된다. 값이 아니라 진행 중인
      // Promise 자체를 즉시(await 전에) 캐시해 둬야, 뒤이은 재실행들이 새 요청 대신 같은 Promise를
      // 기다리게 되어 중복 요청이 완전히 사라진다.
      // (성능) 예전엔 이 포지션 하나를 depth16 단일PV(평가치 바) → depth15 멀티PV-3(엔진 상위 3줄) →
      // depth13 멀티PV-10(후보 수 보충, 아래) 순서로 메인 엔진에 세 번 연달아 물어봤다 — 셋 다 "같은
      // 포지션의 상위 수순"이라는 같은 정보를 서로 다른 depth·개수로 중복 탐색하고 있었을 뿐이다.
      // Stockfish의 MultiPV는 한 번의 탐색으로 원하는 개수만큼의 최상위 수를 동시에 얻으므로, 한 번의
      // MultiPV-10 탐색(depth 16)으로 통합한다: 1순위 줄=평가치 바(단일PV처럼 depth가 깊어지며 진행
      // 갱신, 위 handleLine 참고), 1~3순위=엔진 상위 3줄, 1~10순위=후보 수 보충. 중복 탐색을 없애
      // 벽시계 시간을 (기존 세 요청 순차 합산 대비) 크게 줄인다. 부가효과로, 겹치는 수의 평가치가 서로
      // 다른 탐색에서 미세하게 갈려 블록과 엔진 라인 표시가 어긋나던 문제도 근본적으로 사라진다(하나의
      // 결과만 쓰므로).
      // (v0.2.2 성능) 엔진 라인이 확정되기까지의 상한(movetime)을 3000ms에서 700ms로 낮춘다 — 엔진
      // 라인은 depth가 깊어질 때마다 이미 실시간으로 흘러 나오므로(streamLines), 사용자가 체감하는
      // "라인이 계산되는 시간"은 이 상한이 결정한다. 평범한 학습·오프닝 포지션은 이 시간 안에 목표
      // depth에 도달해 표시가 그대로이고, 유독 오래 걸리던 복잡한 포지션만 0.5~0.7초 안에서 (그 시점의
      // 충분히 깊은 라인으로) 확정돼 대기감이 사라진다. 개별 후보 수 평가는 아래에서 여전히 독립된
      // depth 15 검색으로 채워지므로 수 블록 정확도에는 영향이 없다.
      if (posCacheRef.current.key !== key) posCacheRef.current = { key, multiPromise: null, live: new Map() };
      const cache = posCacheRef.current;
      // (v0.2.1) 엔진 상위 3줄을 최종 결과 한 번이 아니라 depth마다 실시간으로 갱신한다 — 평가치가 살아
      // 움직이고 수순이 점점 길어진다. 이 effect는 후보 수가 채워질 때마다 재실행되므로(cancelled가 금방
      // true가 됨) cancelled 대신 "지금 포지션 key가 그대로인가"로 가드해 탐색 내내 스트리밍을 유지한다.
      // (버그 수정, 사용자 제보) "모바일에서 분석 탭 엔진 라인이 안 뜬다"(평가치 바는 정상) — 원인은
      // pvUciToSans(SAN 변환)가 특정 PV에서 예외를 던지면 이 map() 전체가 중단돼, 그 뒤에 이어지는
      // setEngineLines(lines)·setLinesPending(false)까지 통째로 실행되지 못했던 것. posEval(평가치
      // 바)은 SAN 변환이 필요 없는 별도 경로(onEvalProgress)라 영향이 없어, "평가치는 뜨는데 엔진
      // 3줄만 안 뜬다"는 증상과 정확히 일치한다. 모바일은 CPU가 느려 얕은 depth에서 멈추는 일이
      // 잦고, 얕은 depth일수록 PV 끝부분에 이런 변환 실패를 유발하는 거친 수순이 섞이기 쉬워
      // 모바일에서 특히 잘 재현됐을 것으로 보인다. 한 줄의 변환 실패가 나머지 줄·이후 로직 전체를
      // 막지 않도록, 줄 단위로 감싸 실패한 줄만 걸러낸다.
      const toLines3 = (raw) => dedupeEngineLines((raw || []).filter((pv) => pv && pv.pv && pv.pv.length).map((pv) => {
        try {
          return {
            ev: pv.mate != null ? { mate: pv.mate * baseWhite, win: (pv.mate > 0) === (baseWhite === 1) ? "w" : "b", plies: matePliesOf(pv.mate) } : { cp: pv.cp * baseWhite },
            sans: pvUciToSans(sans, pv.pv, 15),
          };
        } catch { return null; }
      }).filter((l) => l && l.sans && l.sans.length)).slice(0, 3);
      // (사용자 요청) 엔진 depth가 한 단계 깊어질 때마다 수 블록의 평가치(live)도 그 depth의 결과로 곧바로
      // 갱신해, 블록 정렬이 단계가 끝날 때(0.7초·5초·20초)까지 기다리지 않고 depth마다 따라 움직이게 한다.
      // 각 줄의 depth 합이 이전 반영보다 커졌을 때만 반영한다(심화 단계가 다시 얕은 depth부터 시작해도 이미
      // 반영한 더 깊은 값을 얕은 값으로 되돌리지 않음). MultiPV 상위 줄의 첫 수만 대상이다.
      const liveBoard = boardFromSans(sans), liveColor = ply % 2 === 0 ? "w" : "b";
      const applyDepthEvals = (raw) => {
        if (!raw || !raw.length) return;
        const sig = raw.reduce((a, pv) => a + (pv && pv.depth ? pv.depth : 0), 0);
        if (!(sig > (cache.sortSig || 0))) return;
        cache.sortSig = sig;
        const evBy = {};
        raw.forEach((pv) => {
          if (!pv || !pv.uci || (pv.mate == null && pv.cp == null)) return;
          try {
            const san = uciToSan(liveBoard, pv.uci, liveColor);
            if (san) evBy[stripSuffix(san)] = pv.mate != null ? { mate: pv.mate * baseWhite, win: (pv.mate > 0) === (baseWhite === 1) ? "w" : "b", plies: matePliesOf(pv.mate) } : { cp: pv.cp * baseWhite };
          } catch { }
        });
        if (Object.keys(evBy).length) setMoves((prev) => prev.map((m) => { const hit = evBy[stripSuffix(m.san)]; return hit ? { ...m, live: hit } : m; }));
      };
      const streamLines = (raw) => { if (livePoolRef.current.unmounted || posCacheRef.current.key !== key) return; const l = toLines3(raw); if (l.length) setEngineLines(l); applyDepthEvals(raw); };
      // (v0.2.4) depth 16→20, MultiPV 10→7 — movetime(700ms) 체감 속도는 그대로 유지한다.
      // (기능) 사용자 요청으로 MultiPV를 7→5로 더 낮춘다 — 순위가 늘어날수록 노드당 비용이 커져
      // 목표 depth에 도달하기 더 어려워지므로, 후보 수 보충(아래)에 필요한 최소치만 남긴다.
      // (v0.2.4 성능) slot="learn-lines" — 빠르게 다음/이전 수로 넘기면 이전 포지션의 계산이 아직 큐에
      // 남아 있어도 즉시 중단되고 지금 포지션의 요청이 바로 시작된다(더 이상 순서대로 밀리지 않음).
      // (v0.2.9 기능) 사용자 요청 — depth에 더 이상 인위적인 상한(예전엔 20)을 두지 않는다. "go depth"에
      // 넘기는 값은 UCI 프로토콜상 어차피 필요하지만, 스톡피시가 몇 초 안에 실제로 도달할 수 있는
      // depth보다 훨씬 큰 값(MAX_SEARCH_DEPTH)을 넘겨 사실상 "무제한"으로 취급한다 — 각 단계를 실제로
      // 멈추는 건 depth가 아니라 movetime(아래 세 단계의 시간 상한)이므로, 주어진 시간 안에서 depth가
      // 끝까지(더 이상 못 깊어질 때까지) 계속 늘어난다.
      if (!cache.multiPromise) cache.multiPromise = engine.evaluateMulti(sansToFen(sans), MAX_SEARCH_DEPTH, 5, 700, onEvalProgress, streamLines, "learn-lines");
      const pvsAll = await cache.multiPromise;
      if (cancelled) return;
      if (!pvsAll || !pvsAll.length) { setLinesPending(false); return; } // 엔진이 이 포지션을 평가하지 못했다 — "계산 중" 표시가 영영 안 꺼지지 않도록 여기서도 해제
      const p0 = pvsAll[0];
      setPosEval(p0 && (p0.mate != null || p0.cp != null) ? mkPosEval(p0) : null);
      // (v0.2.1 버그) 스트리밍뿐 아니라 최종 확정 결과도 dedupe해, 같은 첫 수가 겹치는 라인이 남지 않게 한다.
      const lines = toLines3(pvsAll);
      // (버그 수정) 위 linesPending 주석 참고 — 이 포지션의 결과가 나온 시점(빈 배열이어도, 예: 외통
      // 직전 포지션)에만 실제로 engineLines를 교체하고 "계산 중" 표시를 끈다.
      setEngineLines(lines);
      // (기능) 사용자 요청 — 엔진 라인·평가치·수 체계 아이콘을 전부 기존 movetime(700ms) 안에 먼저
      // 확정해 화면이 바로 반응하게 한 다음, 이 자리에서 추가로 5초("extra movetime")를 더 들여
      // 같은 포지션을 더 깊이 파본다. 스톡피시는 "go" 명령 사이에도 치환
      // 테이블(Hash)이 그대로 남아 있으므로, 이 두 번째 탐색은 사실상 처음부터 다시 하는 게 아니라
      // 얕은 depth는 대부분 캐시 적중으로 순식간에 훑고 지나가 방금 700ms 안에 못 갔던 더 깊은
      // depth부터 실질적으로 이어간다. 같은 slot("learn-lines")을 그대로 써서, 사용자가 다른
      // 수·포지션으로 넘어가 이 effect가 다시 실행되면(key가 바뀌어 새 요청이 같은 slot으로 들어옴)
      // 아직 안 끝난 5초 심화 탐색은 evaluateMulti의 supersede로 자동 중단된다. moves.length 변화로
      // 이 effect가 같은 포지션에서 여러 번 재실행돼도(비이론 수 보충 등) posCacheRef에 시작 여부를
      // 남겨 심화 탐색이 한 포지션당 한 번만 시작되게 한다.
      if (cache.extraKey !== key) {
        cache.extraKey = key;
        engine.evaluateMulti(sansToFen(sans), MAX_SEARCH_DEPTH, 5, 5000, onEvalProgress, streamLines, "learn-lines").then((deepPvs) => {
          if (posCacheRef.current.key !== key || !deepPvs || !deepPvs.length) return;
          setPosEval(mkPosEval(deepPvs[0]));
          const deepLines = toLines3(deepPvs);
          setEngineLines(deepLines);
          if (deepLines.length) {
            const deepEvBySan = {};
            deepLines.forEach((l) => { if (l.sans && l.sans.length) deepEvBySan[stripSuffix(l.sans[0])] = l.ev; });
            setMoves((prev) => prev.map((m) => { const hit = deepEvBySan[stripSuffix(m.san)]; return hit ? { ...m, live: hit } : m; }));
          }
          // (v0.2.9 기능) 사용자 요청 — 세 번째 단계("third movetime")를 추가한다. 5초 심화 탐색이 끝난
          // 뒤에도 사용자가 이 포지션에 그대로 머물러 있다면, 같은 slot으로 한 번 더(이번엔 20초) 이어서
          // 판다 — 위와 마찬가지로 Hash 적중으로 처음부터 다시 하는 게 아니라 5초 지점에서 이어간다.
          // extraKey와 별개인 thirdKey로 한 포지션당 정확히 한 번만 시작되게 가드한다.
          if (cache.thirdKey !== key) {
            cache.thirdKey = key;
            engine.evaluateMulti(sansToFen(sans), MAX_SEARCH_DEPTH, 5, 20000, onEvalProgress, streamLines, "learn-lines").then((deeperPvs) => {
              if (posCacheRef.current.key !== key || !deeperPvs || !deeperPvs.length) return;
              setPosEval(mkPosEval(deeperPvs[0]));
              const deeperLines = toLines3(deeperPvs);
              setEngineLines(deeperLines);
              if (deeperLines.length) {
                const deeperEvBySan = {};
                deeperLines.forEach((l) => { if (l.sans && l.sans.length) deeperEvBySan[stripSuffix(l.sans[0])] = l.ev; });
                setMoves((prev) => prev.map((m) => { const hit = deeperEvBySan[stripSuffix(m.san)]; return hit ? { ...m, live: hit } : m; }));
              }
            }).catch(() => {});
          }
        }).catch(() => {});
      }
      setLinesPending(false);
      // 비이론 수 9개 보장: 엔진 평가 상위 수로 보충.
      let cur = moves;
      // (버그 수정) 수 블록(MoveTile) 목록의 개별 평가치는 이 아래에서 별도의 빠른 풀(depth 15,
      // movetime 700ms 상한)로 채워지는데, 그 수가 방금 구한 엔진 상위 3줄(MultiPV-3, movetime
      // 3000ms — 훨씬 더 정확) 중 하나의 첫 수와 같다면 서로 다른 검색에서 나온 값이 미세하게
      // 갈려 같은 수인데 블록과 엔진 라인의 평가치가 서로 다르게 보였다. 겹치는 수는 항상 이
      // 줄의 값을 그대로 가져다 쓰도록 live를 맞춰 두면(아래 개별 검색 루프는 live가 이미 채워진
      // 수를 건너뛰므로) 두 표시가 항상 정확히 일치한다 — 집중 분석 화면도 같은 live 필드를
      // 그대로 물려받으므로 결과적으로 분석 탭 전체가 하나의 엔진 결과로 통일된다.
      if (lines.length) {
        const lineEvBySan = {};
        lines.forEach((l) => { if (l.sans && l.sans.length) lineEvBySan[stripSuffix(l.sans[0])] = l.ev; });
        cur = cur.map((m) => { const hit = lineEvBySan[stripSuffix(m.san)]; return hit ? { ...m, live: hit } : m; });
        setMoves((prev) => prev.map((m) => { const hit = lineEvBySan[stripSuffix(m.san)]; return hit ? { ...m, live: hit } : m; }));
      }
      const curNonbook = () => cur.filter((m) => !m.book).length;
      if ((!isMaster || masterEmpty) && curNonbook() < 9) {
        const brd = boardFromSans(sans);
        const snapBy = node ? Object.fromEntries(node.moves.map((m) => [m.san, m])) : {};
        // (16차) 이 보충 경로도 개발자가 추가한 이론 수(forceKind/treeAdds)를 스냅샷과 동일하게 반영해야
        // 한다 — 그렇지 않으면 스냅샷/Lichess에 없는 dev 전용 이론 수가 엔진 보충으로 뒤늦게 채워질 때
        // book 플래그가 빠진 채(비이론으로) 들어가는 경우가 생긴다.
        const devAddsBy2 = Object.fromEntries(addsFor(key).map((a) => [stripSuffix(a.san), a]));
        const pvs = pvsAll; // (성능) 위에서 이미 받은 MultiPV-10 결과를 그대로 재사용 — 별도 요청 없음
        if (!cancelled && pvs && pvs.length) {
          const have = new Set(cur.map((m) => m.san));
          const add = [];
          for (const pv of pvs) {
            const san = uciToSan(brd, pv.uci, ply % 2 === 0 ? "w" : "b");
            if (san && !have.has(san)) {
              const k = stripSuffix(san);
              const s = snapBy[san] || {};
              const dev = devAddsBy2[k];
              const forced = forceKindFor(key, san);
              const unb = isUnbooked(key, san);
              const book = !unb && (forced === "book" || (!!s.book && forced == null) || !!(dev && dev.theory));
              add.push({ san, book, name: s.name ?? (dev && dev.name), evalCp: s.evalCp, adopt: null, games: null, engine: true });
              have.add(san);
            }
            if (curNonbook() + add.filter((a) => !a.book).length >= 9) break;
          }
          if (add.length && !cancelled) {
            cur = [...cur, ...add];
            setMoves((prev) => { const have2 = new Set(prev.map((m) => m.san)); const fresh = add.filter((a) => !have2.has(a.san)); return fresh.length ? [...prev, ...fresh] : prev; });
          }
        }
      }
      // (성능) moves.length가 늘어 이 effect가 재실행되어도, 이전 실행에서 이미 live 평가를 받은
      // 수는 다시 계산하지 않고 새로 추가된(아직 live가 없는) 수만 평가한다.
      const list = cur.filter((m) => m.live == null).map((m) => m.san);
      if (list.length) {
        const mkLive = (ev2) => ev2.mate != null
          ? { mate: ev2.mate * childWhite, win: (ev2.mate > 0) === (childWhite === 1) ? "w" : "b", plies: matePliesOf(ev2.mate) }
          : { cp: ev2.cp * childWhite };
        // (성능) 후보 수마다 depth 15/movetime 700ms 상한은 그대로(정확도 손실 없음) — 예전엔 이
        // 목록을 한 번에 하나씩 순서대로 물어봐 후보 수 개수에 정비례해 총 시간이 늘었다. 게임
        // 리뷰(analyzeGame)와 동일한 work-stealing 패턴으로, 독립된 워커 여러 개가 같은 목록에서
        // 하나씩 꺼내 동시에 처리하게 해 총 계산량은 그대로 두고 벽시계 시간만 줄인다.
        const pooled = await getLivePool();
        if (cancelled) return;
        const epoch = livePoolRef.current.epoch;
        const workers = pooled.length ? pooled : [engine];
        let nextIdx = 0;
        const runWorker = async (w) => {
          for (;;) {
            if (cancelled) return;
            const i = nextIdx++; if (i >= list.length) return;
            const san = list[i];
            // (기능1) 이 수는 낮은 depth 결과부터 즉시 반영 → 등급/정렬이 계산 도중 자연스럽게
            // 갱신되며 "엔진이 계산하며 평가를 수정하는" 과정이 시각적으로 보인다. 최종 depth에서
            // 한 번 더 확정. (20차) mate===0(그 수로 체크메이트 완성)일 때 부호가 사라지므로 win으로
            // 승자를 함께 보존한다.
            const onMoveProgress = (partial) => {
              if (cancelled || !partial) return;
              setMoves((prev) => prev.map((x) => x.san === san ? { ...x, live: mkLive(partial) } : x));
              // (v0.2.4 버그 수정) 이 후보 수 개별 평가는 여전히 depth 15 고정이다(즉각 반응 유지 목적,
              // 건드리지 않기로 함) — 그 depth를 "?" 도움말의 curDepth에 함께 반영하면, 후보 수가
              // 많아 이 depth-15 검색들이 자주 완료돼 값을 15로 계속 밀어붙이는 바람에, 정작 depth
              // 20을 목표로 하는 메인 검색(onEvalProgress)의 실제 진행 상황이 15에서 멈춘 것처럼
              // 가려 보였다. 도움말은 메인 검색 하나만의 진행률을 보여줘야 하므로 여기서는 bumpDepth
              // 를 부르지 않는다.
            };
            // (버그 수정) 위의 be/pvs와 같은 이유로, 재실행 사이의 경합으로 같은 수를 두 번
            // 물어보는 걸 막기 위해 진행 중인 Promise를 수(san)별로 캐시한다. 다만 이 캐시가 "지금
            // 이 워커 세대(epoch)"에 걸린 것인지도 함께 저장한다 — 그 사이 엔진 프로필이 바뀌어
            // 캐시된 Promise를 만든 워커가 이미 terminate됐다면(다시는 bestmove가 안 옴) 그 낡은
            // Promise를 계속 기다리는 대신 버리고 지금 풀로 재요청해야, 이 수의 평가가 영영 안
            // 뜨는 채로 멈추지 않는다.
            const cached = cache.live.get(san);
            if (!cached || cached.epoch !== epoch) cache.live.set(san, { epoch, promise: w.evaluate(sansToFen([...sans, san]), 15, onMoveProgress, 700) });
            const ev = await cache.live.get(san).promise;
            if (cancelled || !ev) continue;
            setMoves((prev) => prev.map((x) => x.san === san ? { ...x, live: mkLive(ev) } : x));
          }
        };
        await Promise.all(workers.map(runWorker));
      }
    })();
    return () => { cancelled = true; };
  }, [key, liveOn, engine.status, moves.length, isMaster, masterEmpty]);

  const statMountedRef = useRef(true);
  useEffect(() => () => { statMountedRef.current = false; }, []);
  const statDoneRef = useRef(new Set());
  const statKeyRef = useRef(key);
  statKeyRef.current = key;
  useEffect(() => { statDoneRef.current = new Set(); }, [key]);
  // (17차) tiled 정렬(ev())과 동일하게, 라이브 분석 중에는 아직 그 depth의 live 값이 없는 수를
  // 오래된 스냅샷(evalCp)과 섞어 비교하지 않는다 — 이 불일치가 "평가치 바와 1위 수 평가치가
  // 서로 다르게 보이는" 문제의 원인이었다(스냅샷과 live는 서로 다른 depth의 값이라 직접 비교 불가).
  const fallbackEval = useMemo(() => {
    const liveActive = liveOn && engine && engine.status === "ready";
    const cands = moves.filter((m) => !(liveActive && !m.live)).map((m) => ({ m, v: whiteEval(m) })).filter((x) => x.v != null);
    if (!cands.length) return null;
    // (20차) 숫자 비교로 최선 수를 고르되, 평가치 바에는 메이트 정보가 살아있는 객체를 넘긴다(M수 표기).
    const pick = cands.reduce((a, b) => (ply % 2 === 0 ? (b.v > a.v ? b : a) : (b.v < a.v ? b : a)));
    return whiteEvalObj(pick.m);
  }, [moves, ply, liveOn, engine && engine.status]);

  const board = useMemo(() => boardFromSans(sans), [key]);
  const sacTick = useSacConfirmTick();   // 희생 엔진 확인이 끝나면 등급을 다시 매긴다(v0.5.9 BUG-038)
  const tiled = useMemo(() => {
    const seen = new Set();
    const uniq = moves.filter((m) => { const k = stripSuffix(m.san); if (seen.has(k)) return false; seen.add(k); return true; });
    let t = assignTiers(uniq, ply, board, key, sans).map((m) => {
      const mainMain = isMainline(key, m.san) ? { isMain: true } : {};
      const nm = nameOverride(key, m.san); const kwo = kwOverride(key, m.san);
      return { ...m, ...mainMain, ...(nm !== null ? { name: nm } : {}), ...(kwo ? { kw: kwo } : {}), disp: decorateSan(board, m.san, color) };
    });
    // (UI6/UX1) 비이론 수 정렬 기준: 평가치(둘 차례 관점 최선이 맨 위) 또는 채택률(가장 많이 둔 순).
    // 라이브 엔진 평가 중에는 아직 자기 차례(live)가 오지 않은 수를 오래된 스냅샷 evalCp로 순위에
    // 끼워넣지 않는다 — 서로 다른(스냅샷 대 실시간, depth도 다른) 값을 섞어 비교하면 "정렬이 이상하다"고
    // 보이는 원인이었다. live가 아직 없는 수는 평가가 도착하기 전까지 맨 아래로 밀어둔다.
    const liveActive = liveOn && engine && engine.status === "ready";
    const ev = (m) => {
      if (liveActive && !m.live) return -Infinity;
      const v = moverEval(m, ply); return v == null ? -Infinity : v;
    };
    const adopt = (m) => (m.adopt != null ? m.adopt : (m.games != null ? m.games : -Infinity));
    const rank = sortBy === "adopt" ? adopt : ev;
    // (버그 수정) 예전엔 이론 수(book)를 정렬 대상에서 아예 빼고 고정 순서로 뒀다 — 그래서 라이브
    // 분석 depth가 깊어지며 각 수의 평가치(m.live)가 계속 바뀌어도(화면엔 숫자만 갱신됨) 이론 수
    // 블록의 순서는 절대 움직이지 않아 "정렬되지 않고 멈춘 것처럼" 보였다. 이론 수도 똑같이 rank로
    // 정렬해, depth가 바뀔 때마다 이론 수 블록도 함께 순위를 다시 매기고(FadeIn layout이 그 이동을
    // 애니메이션으로 보여준다) — 이론 수 묶음이 비이론 수보다 항상 먼저 온다는 것만 유지한다.
    const books = t.filter((m) => m.book).sort((a, b) => rank(b) - rank(a));
    const nonbooks = t.filter((m) => !m.book).sort((a, b) => rank(b) - rank(a));
    return [...books, ...nonbooks];
  }, [moves, ply, board, key, contentVer, sortBy, liveOn, engine && engine.status, sacTick]);
  // (표본, 사용자 요청 성능) 비이론 수 중 통계가 없는 수(엔진 보충, 보드에서 직접 둔 수 등)는 그 수를 둔 뒤
  // 위치의 Lichess 총 게임수로 채운다. 예전엔 목록 전체를 한 수씩 순서대로 가져와 수가 많을수록 맨 아래
  // 블록은 한참 뒤에야 채워졌다 — 이제 화면에 보이는 순서(위쪽 블록부터)대로 STAT_CONCURRENCY개씩 동시에
  // 가져오고, 한 수의 응답이 오는 즉시 그 블록만 바로 갱신한다(다른 수를 기다리지 않음). 같은 주소의 중복
  // 요청은 lichessFetchJson이 합치고, 화면에 필요한 수가 모두 끝난 뒤에야 다음 수 후보의 미리 가져오기를 한다.
  const STAT_CONCURRENCY = 6;
  const statInflightRef = useRef(0);
  const statPumpRef = useRef(() => { });
  const statPrefetchedRef = useRef("");
  const statOrder = tiled.filter((m) => m.games == null).map((m) => m.san).join("|");
  statPumpRef.current = () => {
    if (!liveOn || !statMountedRef.current) return;
    const myKey = statKeyRef.current;
    const need = tiled.filter((m) => m.games == null && !statDoneRef.current.has(myKey + "|" + m.san));
    while (statInflightRef.current < STAT_CONCURRENCY && need.length) {
      const m = need.shift();
      statDoneRef.current.add(myKey + "|" + m.san);
      statInflightRef.current++;
      lichessForeground(fetchLichess([...sans, m.san], false)).then((child) => {
        const g = child && child.posTotal != null ? child.posTotal : null;
        if (g != null && statMountedRef.current && statKeyRef.current === myKey) {
          setMoves((prev) => prev.map((x) => x.san === m.san && x.games == null ? { ...x, games: g, adopt: posGames ? (100 * g / posGames) : x.adopt } : x));
        }
      }).catch(() => { }).finally(() => { statInflightRef.current--; statPumpRef.current(); });
    }
    // 화면에 필요한 통계가 모두 끝났으면, 다음에 눌릴 가능성이 높은 상위 4수의 다음 포지션을 미리 캐시에 채운다.
    if (!need.length && statInflightRef.current === 0 && statPrefetchedRef.current !== myKey && posGames != null) {
      statPrefetchedRef.current = myKey;
      [...tiled].sort((a, b) => (b.games || 0) - (a.games || 0)).slice(0, 4).forEach((m) => { fetchLichess([...sans, m.san], isMaster).catch(() => { }); });
    }
  };
  useEffect(() => { statPumpRef.current(); }, [statOrder, key, liveOn, posGames, statsLoading]);
  // (v0.6.1 버그 수정) 포지션 전체 표본(posGames)이 보충 조회보다 늦게 도착하면 이미 회수가 채워진 수의 채택률이
  // 영영 null로 남았다 — posGames가 정해지면 채택률이 비어 있는 수를 다시 계산한다. 끝내 전체 표본을 못 얻으면
  // (조회 실패) 수별 회수의 합을 대신 써서 "—"가 남지 않게 한다.
  useEffect(() => {
    if (!liveOn || statsLoading) return;
    setMoves((prev) => {
      let total = posGames;
      if (total == null) {
        const sum = prev.reduce((a, m) => a + (m.games || 0), 0);
        if (!sum || prev.some((m) => m.games == null)) return prev;
        total = sum;
      }
      if (!prev.some((m) => m.games != null && m.adopt == null)) return prev;
      return prev.map((m) => (m.games != null && m.adopt == null ? { ...m, adopt: 100 * m.games / total } : m));
    });
    if (posGames == null) {
      const sum = moves.reduce((a, m) => a + (m.games || 0), 0);
      if (sum && !moves.some((m) => m.games == null)) setPosGames(sum);
    }
  }, [posGames, statsLoading, liveOn, moves]);

  // (UX1) 보드 위 평가치 바는 항상 "현재 후보 수 중 최선의 수" 평가에서 유도한다(같은 계산에서
  // 파생되므로 평가치순 1위 수의 평가치와 구조적으로 항상 일치). 엔진의 포지션 직접 평가(posEval)는
  // 후보 수 평가가 하나도 없을 때(막 포지션에 진입한 순간)의 임시 표시값으로만 사용한다.
  // (v0.1.3 버그 수정) 평가치 바와 엔진 라인 1번째(최선의 수) 표기가 서로 다른 엔진 요청(후보 수
  // 목록의 개별 라이브 평가 vs MultiPV-3 전용 요청)에서 나와 미세하게 어긋나 보일 수 있었다 —
  // engineLines가 준비돼 있으면(대개 posEval과 거의 같은 시점에 함께 채워짐) 그 1번째 줄의 평가치를
  // 그대로 평가치 바에 써서 항상 같은 값이 되도록 한다. 아직 준비 전(포지션 진입 직후)에만 기존
  // fallback(후보 수 중 최선)·posEval(포지션 직접 평가) 순으로 대체한다.
  // (버그 수정) engineLines를 더 이상 포지션이 바뀔 때 곧장 비우지 않으므로(위 linesPending 참고),
  // linesPending 중에는 engineLines가 "이전" 포지션의 값일 수 있다 — 그 값을 이 포지션의 평가치 바에
  // 잘못 쓰지 않도록, 아직 이 포지션 결과가 아니면 지금 포지션 기준으로 실시간 갱신되는
  // posEval/fallbackEval을 대신 쓴다.
  const barEval = (!linesPending && engineLines.length) ? engineLines[0].ev : (fallbackEval != null ? fallbackEval : posEval);
  return { moves: tiled, posGames, statsLoading, engineNote, posEval: barEval, engineLines, linesPending, curDepth, node };
}
// (사용자 요청) 방금 옮긴 기물이 상대의 무엇을 공격하는지 보여주던 금색(idea) 화살표를 없애고, 그
// 기물이 상대에게 공격받는다는 빨간색(danger) 화살표만 남긴다 — 리뷰 기능과 같은 의미(위험 경고)만
// 남기고, 서로 다른 두 색 화살표가 뒤섞여 복잡해 보이던 것을 정리했다.
function brilliantArrows(sans, san) {
  const color = sans.length % 2 === 0 ? "w" : "b"; const enemy = color === "w" ? "b" : "w";
  const before = boardFromSans(sans); const info = sanSrc(before, san, color);
  if (!info || info.castle) return [];
  const after = boardFromSans([...sans, san]); const [tr, tc] = info.to; const out = [];
  for (let r = 0; r < 8; r++) for (let c = 0; c < 8; c++) { const p = after[r][c]; if (p && p.c === enemy && canMove(after, p.t, enemy, r, c, tr, tc, true)) out.push({ from: [r, c], to: [tr, tc], kind: "danger" }); }
  return out.slice(0, 6);
}
// (UI/UX) 집중분석을 별개의 전체 창으로 띄우지 않고, 기존에 쓰던 집중분석 UI를 그대로
// 체스보드 하단(왼쪽 칼럼)에 배치한다 — 오른쪽 칼럼은 집중분석 중에도 항상 수 블록 목록을 보여준다.
// 상태/부수효과(퍼즐 자동저장 등)는 하나의 훅(useFocusAnalysis)에 모아 중복 실행을 막는다.
function useFocusAnalysis(focus, { chesscom, engine, canEdit, canAdd, bumpContent, puzzles, contentVer }) {
  const active = !!focus;
  const sans = active ? focus.sans : [];
  const san = active ? focus.san : "";
  const ply = active ? focus.ply : 0;
  const sansKey = sans.join(" ");
  // (16차) focus.m은 집중분석에 "들어간 시점"에 찍힌 스냅샷이라, 그 상태에서 개발자가 이론 등록/키워드/이름을
  // 바꿔도 반영되지 않았다. book·name·kw만은 매 렌더마다(contentVer 변경 시) CONTENT에서 다시 계산해 덮어써
  // 지금 보고 있는 집중분석 화면에도 즉시 라이브로 반영되도록 한다.
  const m = useMemo(() => {
    if (!active) return {};
    const base = focus.m || {};
    const k = stripSuffix(san);
    const unb = isUnbooked(sansKey, san);
    const dev = addsFor(sansKey).find((a) => stripSuffix(a.san) === k);
    const forced = forceKindFor(sansKey, san);
    const book = !unb && (forced === "book" || (!!base.book && forced == null) || !!(dev && dev.theory));
    const name = nameOverride(sansKey, san) ?? (dev && dev.name) ?? base.name;
    const kw = kwOverride(sansKey, san) || base.kw;
    return { ...base, book, name, kw };
  }, [active, sansKey, san, focus && focus.m, contentVer]);
  const node = active ? snapNode(sans) : null;
  const title = active ? (m.name || (node && node.opening ? node.opening.name : null)) : null;
  const [liveKind, setLiveKind] = useState(null);
  useEffect(() => {
    let cancel = false; setLiveKind(null);
    if (!active) return;
    if (m.book || (m.kind && m.kind !== "good" && m.kind !== "pending")) return;   // 이론 수 또는 이미 품질 있음
    if (!engine || engine.status !== "ready") return;
    const col = sans.length % 2 === 0 ? "w" : "b";
    // (v0.2.4) '최선의 수'는 엔진 1순위 수와 일치할 때만 부여(가짜 최선 수 방지) — best는 안정된
    // 기준값이라 한 번만 구하고, after만 depth가 깊어질 때마다(onProgress) 다시 등급을 매겨 아이콘을
    // 계속 갱신한다(최대 5초 동안 여러 번 바뀔 수 있음 — depth 20·moveTime 5초 상한, 대부분의
    // 포지션은 그 전에 depth 20에서 먼저 끝나 체감 속도는 기존과 비슷하게 유지된다).
    const sacEvalRef = { current: null };
    const gradeFrom = (bestCp, secondCp, bestSan, after) => {
      const afterOpp = after.mate != null ? (after.mate > 0 ? 1e5 : -1e5) : after.cp;
      const matched = !!bestSan && stripSuffix(bestSan) === stripSuffix(san);
      const ourCp = -afterOpp; const loss = matched ? 0 : bestCp - ourCp;
      // 규칙은 gradeMoveKind 하나로(v0.5.9 BUG-037) — 승부가 기울었는지는 두기 전(bestCp) 기준.
      return gradeMoveKindConfirmed({
        loss, matched, bestCp, playedCp: ourCp, secondCp,
        priorSac: ownPriorMoveWasSacrifice(sans, col),
        singleRecapture: singleRecaptureCheck(sans, san, col), san,
      }, { fenRoot: null, prevSans: sans, san, color: col, evaluate: sacEvalRef.current });   // 탁월 후보는 엔진 확인(v0.5.9 BUG-038)
    };
    (async () => {
      // (버그 수정) best/after는 서로 다른 독립된 포지션이라 순서를 지킬 이유가 없는데도, 단일
      // 공용 엔진의 FIFO 큐에서 순차 처리돼(최대 5초+5초) "탁월한 수"가 한참 뒤에야 확정되면서
      // 그동안 "좋은 수"로 잘못 표시되고 그 확정을 기다리는 퍼즐 생성도 함께 지연됐다. 세션 내내
      // 재사용되는 공용 풀(getAnalysisPool)에서 워커 두 개를 받아 완전히 병렬로 평가한다(풀 부팅
      // 실패 시 기존처럼 단일 engine으로 폴백).
      const pool = await getAnalysisPool(engine.profile, engine.urls).catch(() => null);
      if (cancel) return;
      const wBest = (pool && pool[0]) || engine, wAfter = (pool && pool[1]) || engine;
      const bestPromise = callEvaluateMulti(wBest, sansToFen(sans), 20, 2, 5000, "focus-best");   // 2순위까지 — 유일한 수 판정(v0.5.9 BUG-037)
      const afterPromise = wAfter.evaluate(sansToFen([...sans, san]), 20, undefined, 5000, "focus-after");
      const [pvs, after] = await Promise.all([bestPromise, afterPromise]);
      const best = pvs && pvs[0];
      if (cancel || !best || !after) return;
      const cpOf = (x) => (x.mate != null ? (x.mate > 0 ? 1e5 : -1e5) : x.cp);
      const bestSan = best.uci ? uciToSan(boardFromSans(sans), best.uci, col) : null;
      sacEvalRef.current = (fen) => wAfter.evaluate(fen, 20, undefined, 5000, "focus-sac");
      const k = await gradeFrom(cpOf(best), pvs[1] ? cpOf(pvs[1]) : null, bestSan, after);
      if (!cancel) setLiveKind(k);
    })();
    return () => { cancel = true; };
  }, [active, sansKey, san, active && m.kind, active && m.book, engine && engine.status, engine && engine.profile]);
  const kind = active ? (liveKind || (m.kind && m.kind !== "good" ? m.kind : null) || (m.book ? "book" : "pending")) : null;
  const evTxt = active ? (m.live ? fmtEvalCp(m.live.cp, m.live.mate, m.live.plies) : (m.evalCp != null || m.mate != null ? fmtEvalCp(m.evalCp, m.mate) : null)) : null;
  // (v0.2.2 기능) 언더프로모션(=/=Q 아닌 승진)으로 "탁월한 수"가 매겨진 경우는 실제 기물 희생이 아니라
  // 규칙상 완화된 표기일 뿐이라, "내 기물이 공격받는다" 경고 화살표를 보여주지 않는다.
  const isUnderpromo = /=/.test(san) && !/=Q/.test(san);
  const extraArrows = active && kind === "brilliant" && !isUnderpromo ? brilliantArrows(sans, san) : [];
  const mkKey = active ? sansKey + "|" + san : "";
  const explain = active ? explainMove(sans, san) : null;
  const [showExpl, setShowExpl] = useState(false);
  const [devEdit, setDevEdit] = useState(false);
  const [nameDraft, setNameDraft] = useState("");
  const [kwDraft, setKwDraft] = useState([]);
  const [addedTheory, setAddedTheory] = useState(false);
  // 집중분석 대상 수가 바뀌면(=예전엔 FocusMode가 다시 마운트되던 상황) 이전 수의 편집 UI 상태를 초기화한다.
  useEffect(() => { if (!active) return; setShowExpl(false); setDevEdit(false); setNameDraft(""); setKwDraft([]); setAddedTheory(false); }, [active, sansKey, san]);
  const isPunishable = active && ["mistake", "blunder"].includes(kind);
  const curated = isPunishable ? punishFor(sans, san) : null;
  const stats = active && chesscom && chesscom.status === "ready" ? chesscom.analyze([...sans, san], { excludeBullet: true }) : null;
  // (UI1) 개발자: 수 이름·키워드 편집 + 이론 수에서 삭제
  const editKey = sansKey;
  const openDevEdit = () => {
    let parentName = "";
    if (sans.length) { const pj = sans.slice(0, -1).join(" "); const last = sans[sans.length - 1]; const ov = nameOverride(pj, last); if (ov) parentName = ov; else { const nd = snapNode(sans.slice(0, -1)); const mm = nd && nd.moves.find((x) => stripSuffix(x.san) === stripSuffix(last)); parentName = (mm && mm.name) || ""; } }
    setNameDraft(nameOverride(editKey, san) ?? (m.name || parentName)); setKwDraft(kwOverride(editKey, san) || deriveKeywords(m)); setDevEdit(true);
  };
  const saveMeta = async () => {
    const k = editKey + "|" + stripSuffix(san);
    const newName = nameDraft.trim();
    // (사용자 요청) 이름이 바뀌면 그 이름을 접두사로 쓰던 자손 수들의 오프닝 명칭도 함께 갱신한다.
    const oldName = nameOverride(editKey, san) ?? m.name ?? null;
    CONTENT.names[k] = newName; CONTENT.keywords[k] = kwDraft;
    if (newName) cascadeRenameOpeningDescendants([...sans, san], oldName, newName);
    await bumpContent(); setDevEdit(false);
  };
  const toggleUnbook = async () => { const k = editKey + "|" + stripSuffix(san); if (CONTENT.unbook[k]) delete CONTENT.unbook[k]; else CONTENT.unbook[k] = true; await bumpContent(); };
  const toggleKw = (kw) => setKwDraft((d) => { if (d.includes(kw)) return d.filter((x) => x !== kw); const p = kwPartner(kw); return [...d.filter((x) => x !== p), kw]; });
  const explainLong = !!explain && explain.length > 90;
  const [mistakes, setMistakes] = useState([]);
  const [analyzing, setAnalyzing] = useState(false);   // (UI8) 실수 분석 진행 표시
  useEffect(() => {
    setMistakes([]); setAnalyzing(false);
    if (!active || !engine || engine.status !== "ready" || !stats || !stats.lines || !stats.lines.length) return;
    let cancelled = false;
    setAnalyzing(true);
    (async () => {
      const base = [...sans, san];
      // (사용자 요청) 로딩 속도 개선 — 후보 라인(stats.lines)들은 서로 앞부분(접두사)을 공유하는
      // 경우가 많은데, 예전엔 라인마다 처음부터 다시 평가해 같은 포지션을 몇 번이고 중복 계산했다.
      // 이번 분석 세션 동안 포지션(FEN) 기준으로 평가를 캐시해 재사용 — 같은 포지션은 딱 한 번만
      // 엔진에 묻는다(Promise 자체를 캐시해, 아직 계산 중인 포지션도 중복 호출 없이 함께 기다린다).
      const evalCache = new Map();
      const evalPos = (sansUpTo) => {
        const fen = sansToFen(sansUpTo);
        let p = evalCache.get(fen);
        if (!p) { p = engine.evaluate(fen, 20, undefined, 5000, "focus-mistakes"); evalCache.set(fen, p); }
        return p;
      };
      const base0 = await evalPos(base);
      // stats.lines는 이미 빈도(count) 내림차순 — 상위 5개를 이미 확보했는데 다음 라인의 빈도가
      // 다섯 번째로 확보한 실수보다 낮거나 같다면, 그 이후 어떤 라인도 top-5를 밀어낼 수 없으므로
      // 더 계산하지 않고 멈춘다(조기 종료로 불필요한 엔진 호출을 더 줄인다).
      let collected = [];
      for (const ln of stats.lines) {
        if (cancelled) return;
        if (collected.length >= 5 && ln.count <= collected[collected.length - 1].count) break;
        const full = [...base, ...ln.seq];
        let prev = base0;
        for (let i = base.length; i < full.length; i++) {
          if (cancelled) return;
          const after = await evalPos(full.slice(0, i + 1));
          if (!prev || !after) { prev = after; continue; }
          const moverWhite = i % 2 === 0;
          const isUser = (moverWhite && ln.color === "w") || (!moverWhite && ln.color === "b");
          const pcp = prev.mate != null ? (prev.mate > 0 ? 1000 : -1000) : prev.cp;
          const acp = after.mate != null ? (after.mate > 0 ? 1000 : -1000) : after.cp;
          const drop = pcp + acp;   // prev=착수자 POV, after=상대 POV → 착수자 손실 = pcp-(-acp)
          if (isUser && drop >= 100) {
            collected.push({ seq: full.slice(base.length, i + 1), kind: drop >= 250 ? "blunder" : "inaccuracy", count: ln.count, color: ln.color });
            collected.sort((a, b) => b.count - a.count);
            if (collected.length > 5) collected = collected.slice(0, 5);
            // (사용자 요청) 다 모아서 마지막에 한꺼번에 보여주지 않고, 계산이 끝나는 대로 하나씩 바로 표시한다.
            if (!cancelled) setMistakes([...collected]);
            break;
          }
          prev = after;
        }
      }
      if (!cancelled) setAnalyzing(false);
    })();
    return () => { cancelled = true; setAnalyzing(false); };
  }, [active, sansKey, san, engine && engine.status, chesscom && chesscom.status, stats && stats.total]);
  // (v0.4.4 개편, 사용자 요청) "집중 분석에서 퍼즐을 만들 때도 바로 퍼즐 카드로 들어가지 말고 퍼즐
  // 마법사 화면으로 이동해야 한다" — 예전엔 여기서 곧장 엔진으로 트리를 만들어 조용히 저장하고
  // (auto:true), 다 되면 "퍼즐 풀기" 버튼이 바로 PuzzleSolver를 열었다. 이제 이 훅은 더 이상 엔진을
  // 돌리거나 저장하지 않는다 — 대신 퍼즐 탭의 "퍼즐 만들기" 마법사가 그대로 받을 수 있는 PGN·목표
  // 수·테마만 계산해 둔다(wizardSeed). 실제 생성·중복 확인·저장은 전부 마법사(그 안에서 이미
  // "이미 존재하면 ~님이 이미 이 퍼즐을 만들었어요! + 퍼즐 풀기"로 처리하도록 고쳐 둔 바로 그 화면)가
  // 맡는다 — 두 경로(집중 분석에서 진입/퍼즐 탭에서 직접 만들기)가 완전히 같은 코드를 탄다.
  const wizardSeed = useMemo(() => {
    if (!active) return null;
    // 실수/블런더 → 실수 응징하기, 부정확한 수 → 우위 점하기, 탁월한 수 → 기물 희생하기: 세 경우
    // 모두 마법사의 2단계 후보 목록(analyzeGame의 moves[i] — ply===i, san===fullSans[i])이 이 수(san)
    // 자신을 인덱스 sans.length에서 후보로 찾아낼 수 있도록, san까지 포함한 PGN을 넘긴다(희생 테마는
    // 마법사가 스스로 그 직전 수를 자동 응수로 떼어 낸다 — submitPuzzleCreate 참고).
    if (isPunishable || kind === "inaccuracy" || (kind === "brilliant" && sans.length >= 1)) {
      const theme = isPunishable ? "punish" : kind === "inaccuracy" ? "advantage" : "sacrifice";
      return { pgn: sansToPgnText([...sans, san], "w"), targetPly: sans.length, theme };
    }
    return null;
  }, [active, sansKey, san, kind]);
  const baseId = active ? sansKey + "|" + san : "";
  const expectedPuzzleId = active ? ((isPunishable || kind === "inaccuracy" || kind === "brilliant") ? baseId : null) : null;
  // (참고용) 로컬에 이미 이 퍼즐이 있는지만 가볍게 확인 — 네트워크 호출 없이 버튼 문구를 미리
  // 조금 더 정확히 보여주는 용도일 뿐, 진짜 중복 판정(서버 포함)은 마법사가 다시 한다.
  const existingPuzzle = (expectedPuzzleId && puzzles) ? puzzles.find((p) => p.id === expectedPuzzleId) : null;
  // (UI1) 집중 분석 중인 수를 이론 수로 등록 — 스냅샷의 기존 이론 수와 구분 없이 동일하게 취급됨(기능3)
  const posKey = sansKey;
  const addAsTheory = async () => {
    if (!CONTENT.treeAdds[posKey]) CONTENT.treeAdds[posKey] = [];
    const existing = CONTENT.treeAdds[posKey].find((x) => x.san === san);
    if (existing) existing.theory = true; else CONTENT.treeAdds[posKey].push({ san, theory: true });
    await bumpContent();
    setAddedTheory(true);
  };
  const isTheory = active && (m.book || addedTheory);
  // 이 수가 실제로 두어진 마스터 대국(대국자/레이팅/결과) — 목록에서 클릭하면 그 대국의 마지막 포지션을 연다.
  const [masterGames, setMasterGames] = useState([]);
  const [loadingMasterGames, setLoadingMasterGames] = useState(false);
  // (버그 수정) fetch가 실패해도(네트워크 오류 등) masterGames가 그냥 빈 배열([])로 남아, "결과가
  // 없다"는 메시지와 "요청이 실패했다"는 상황을 화면에서 구분할 수 없었다 — 별도 에러 상태를 둬서
  // 다르게 안내하고, 재시도 버튼으로 다시 불러올 수 있게 한다.
  const [masterGamesError, setMasterGamesError] = useState(false);
  const [masterRetry, setMasterRetry] = useState(0);
  useEffect(() => {
    setMasterGames([]); setLoadingMasterGames(false); setMasterGamesError(false);
    if (!active) return;
    let cancelled = false;
    setLoadingMasterGames(true);
    fetchAllMasterGames([...sans, san]).then((gs) => { if (!cancelled) { setMasterGames(gs); setLoadingMasterGames(false); } }).catch(() => { if (!cancelled) { setLoadingMasterGames(false); setMasterGamesError(true); } });
    return () => { cancelled = true; };
  }, [active, sansKey, san, masterRetry]);
  return {
    active, sans, san, m, ply, title, kind, evTxt, extraArrows, explain, mkKey,
    explainLong,
    showExpl, setShowExpl, editKey, devEdit, setDevEdit, nameDraft, setNameDraft, kwDraft, setKwDraft,
    openDevEdit, saveMeta, toggleUnbook, toggleKw, isPunishable, curated, stats, mistakes, analyzing,
    expectedPuzzleId, existingPuzzle, wizardSeed, addAsTheory, isTheory, canEdit, canAdd, bumpContent, engine, chesscom,
    masterGames, loadingMasterGames, masterGamesError, onRetryMasterGames: () => setMasterRetry((n) => n + 1),
  };
}
// (20차 UI2) 최선 수(연두색+별) 바로가기 버튼 — 누르면 그 대국을 즉시 분석 모드로 연다.
// (v0.3.5 기능) title을 선택적으로 받는다 — 호출부마다 문맥에 맞는 문구를 쓸 수 있도록(기본값은
// 기존 문구 그대로 유지해 기존 호출부는 전부 무수정으로 동일하게 동작한다).
// (v0.2.3 기능) 개발자 전용 — 마스터 대국(Lichess 마스터 DB)에 없는 유명 대국을 직접 등록한다.
// PGN을 붙여넣으면 parsePgnSans로 즉시 검증(합법성까지는 확인하지 않고 SAN 형식만)하고, 결과는
// PGN의 결과 토큰 또는 마지막 수의 체크메이트 기호(#)로 자동 채우되 항상 수동으로 덮어쓸 수 있다.
function AddMasterGameModal({ onClose, onSaved }) {
  const [mode, setMode] = useState("single"); // "single" | "bulk" — (v0.2.3 기능) 외부에서 받은 여러 대국 묶음을 한 번에 가져오는 대량 가져오기 탭
  const [whiteName, setWhiteName] = useState("");
  const [whiteRating, setWhiteRating] = useState("");
  const [blackName, setBlackName] = useState("");
  const [blackRating, setBlackRating] = useState("");
  const [year, setYear] = useState("");
  const [pgn, setPgn] = useState("");
  const [result, setResult] = useState("");
  const [resultTouched, setResultTouched] = useState(false);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState("");
  const parsed = useMemo(() => { try { return parsePgnSans(pgn); } catch { return []; } }, [pgn]);
  useEffect(() => {
    if (resultTouched) return;
    const auto = autoResultFromPgn(pgn, parsed);
    if (auto) setResult(auto);
  }, [pgn, parsed, resultTouched]);
  const canSave = whiteName.trim() && blackName.trim() && parsed.length >= 1 && result && !saving;
  const save = async () => {
    if (!canSave) return;
    setSaving(true); setErr("");
    try {
      await addDevMasterGame({
        whiteName: whiteName.trim(), whiteRating: whiteRating ? parseInt(whiteRating, 10) : null,
        blackName: blackName.trim(), blackRating: blackRating ? parseInt(blackRating, 10) : null,
        year: year ? parseInt(year, 10) : null, pgn: pgn.trim(), sans: parsed, result,
      });
      onSaved && onSaved();
      onClose();
    } catch (e) { setErr(t("저장 실패. 다시 시도")); } finally { setSaving(false); }
  };
  // (v0.2.3 기능) 대량 가져오기 — 여러 대국이 이어 붙은 PGN 텍스트(외부 대국 데이터베이스의 선수/
  // 오프닝별 zip을 풀면 나오는 .pgn 파일 등)를 파일로 올리거나 그대로 붙여넣으면, 대국 단위로 쪼개 각각의 White/
  // Black/Elo/Date/Result 헤더를 자동으로 채우고 한 번에 저장한다.
  const [bulkText, setBulkText] = useState("");
  const [bulkSaving, setBulkSaving] = useState(false);
  const [bulkDone, setBulkDone] = useState(null); // { saved, skipped } | null
  const [bulkErr, setBulkErr] = useState("");
  const bulkGames = useMemo(() => splitPgnGames(bulkText).map(parsePgnGameForImport), [bulkText]);
  const bulkOk = bulkGames.filter((g) => g.ok);
  const bulkSkipped = bulkGames.length - bulkOk.length;
  const onPickFile = async (e) => {
    const f = e.target.files && e.target.files[0]; if (!f) return;
    try { setBulkText(await f.text()); } catch { setBulkErr(t("파일 읽기 실패")); }
    e.target.value = "";
  };
  const saveBulk = async () => {
    if (!bulkOk.length || bulkSaving) return;
    setBulkSaving(true); setBulkErr(""); setBulkDone(null);
    try {
      await addDevMasterGamesBulk(bulkOk);
      setBulkDone({ saved: bulkOk.length, skipped: bulkSkipped });
      onSaved && onSaved();
    } catch (e) { setBulkErr(t("저장 실패. 다시 시도")); } finally { setBulkSaving(false); }
  };
  const inputStyle = { width: "100%", padding: "7px 9px", borderRadius: 8, border: "1px solid #DCCBA8", background: T.paper, color: T.ink, fontSize: 12.5, boxSizing: "border-box" };
  const labelStyle = { fontSize: 10.5, fontWeight: 800, color: T.brass, marginBottom: 3, display: "block" };
  return (
    <div onClick={onClose} style={{ position: "fixed", inset: 0, zIndex: 300, background: "rgba(6,3,1,.75)", display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}>
      <div onClick={(e) => e.stopPropagation()} style={{ width: "100%", maxWidth: 420, maxHeight: "85vh", overflowY: "auto", background: "linear-gradient(180deg,#F6EEDD,#E6D6B6)", borderRadius: 14, border: "1px solid " + T.brass, padding: 16 }}>
        <div className="flex items-center justify-between" style={{ marginBottom: 10 }}>
          <span style={{ fontSize: 13.5, fontWeight: 900, color: T.ink }}>{t("마스터 대국 추가")}</span>
          <button onClick={onClose} className="press" style={{ width: 28, height: 28, borderRadius: 8, border: "1px solid " + T.brass, background: "transparent", color: T.brass, cursor: "pointer" }}><X size={15} /></button>
        </div>
        <div className="inline-flex" style={{ borderRadius: 8, background: "rgba(0,0,0,.06)", padding: 2, gap: 2, marginBottom: 12 }}>
          {[["single", t("직접 입력")], ["bulk", t("대량 가져오기")]].map(([k, label]) => (
            <button key={k} onClick={() => setMode(k)} className="press" style={{ fontSize: 11, fontWeight: 800, padding: "5px 10px", borderRadius: 6, border: "none", cursor: "pointer", background: mode === k ? T.brass : "transparent", color: mode === k ? "#241509" : T.inkSoft }}>{label}</button>
          ))}
        </div>
        {mode === "single" ? (<>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 80px", gap: 8, marginBottom: 8 }}>
          <div><label style={labelStyle}>{t("백(GM 이름)")}</label><input value={whiteName} onChange={(e) => setWhiteName(e.target.value)} style={inputStyle} placeholder={t("예: Garry Kasparov")} /></div>
          <div><label style={labelStyle}>{t("레이팅")}</label><input value={whiteRating} onChange={(e) => setWhiteRating(e.target.value.replace(/\D/g, ""))} style={inputStyle} placeholder="2800" /></div>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 80px", gap: 8, marginBottom: 8 }}>
          <div><label style={labelStyle}>{t("흑(GM 이름)")}</label><input value={blackName} onChange={(e) => setBlackName(e.target.value)} style={inputStyle} placeholder={t("예: Anatoly Karpov")} /></div>
          <div><label style={labelStyle}>{t("레이팅")}</label><input value={blackRating} onChange={(e) => setBlackRating(e.target.value.replace(/\D/g, ""))} style={inputStyle} placeholder="2700" /></div>
        </div>
        <div style={{ marginBottom: 8 }}><label style={labelStyle}>{t("대국 연도")}</label><input value={year} onChange={(e) => setYear(e.target.value.replace(/\D/g, ""))} style={inputStyle} placeholder="1985" /></div>
        <div style={{ marginBottom: 8 }}>
          <label style={labelStyle}>{t("PGN 기보")}</label>
          <textarea value={pgn} onChange={(e) => setPgn(e.target.value)} rows={5} style={{ ...inputStyle, fontFamily: SITE_FONT, resize: "vertical" }} placeholder="1.e4 e5 2.Nf3 Nc6 3.Bb5 ..." />
          <div style={{ fontSize: 10.5, color: T.inkSoft, marginTop: 3 }}>{parsed.length > 0 ? t("{0}수 인식됨", (parsed.length)) : t("인식된 수 없음")}</div>
        </div>
        <div style={{ marginBottom: 14 }}>
          <label style={labelStyle}>{tx("대국 결과{0}", !resultTouched && result && <span style={{ color: T.inkSoft, fontWeight: 600 }}>{" "}{t("(자동 입력됨)")}</span>)}</label>
          <div className="flex" style={{ gap: 6 }}>
            {[["1-0", t("백 승")], ["0-1", t("흑 승")], ["1/2-1/2", t("무승부")]].map(([k, label]) => (
              <button key={k} onClick={() => { setResult(k); setResultTouched(true); }} className="press" style={{ flex: 1, fontSize: 11.5, fontWeight: 800, padding: "7px 4px", borderRadius: 8, border: "1px solid " + T.brass, cursor: "pointer", background: result === k ? T.brass : "transparent", color: result === k ? "#241509" : T.brass }}>{label}</button>
            ))}
          </div>
        </div>
        {err && <p style={{ fontSize: 11.5, color: T.blunder, marginBottom: 8 }}>{err}</p>}
        <button onClick={save} disabled={!canSave} className="press" style={{ width: "100%", padding: "9px 0", borderRadius: 9, border: "none", background: canSave ? "linear-gradient(180deg," + T.brass + ",#A8842F)" : "#C9BDA0", color: "#241509", fontWeight: 900, fontSize: 12.5, cursor: canSave ? "pointer" : "default" }}>{saving ? t("저장 중…") : t("저장")}</button>
        </>) : (<>
        <div style={{ fontSize: 11.5, color: T.inkSoft, marginBottom: 8, lineHeight: 1.5 }}>{t("여러 대국이 담긴 .pgn 파일을 올리거나 붙여넣기. 헤더(White/Black/Elo/Date/Result)는 자동 입력")}</div>
        <div style={{ marginBottom: 8 }}>
          <label style={labelStyle}>{t(".pgn 파일 선택")}</label>
          <input type="file" accept=".pgn,.txt,text/plain" onChange={onPickFile} style={{ fontSize: 11.5, color: T.ink }} />
        </div>
        <div style={{ marginBottom: 8 }}>
          <label style={labelStyle}>{t("PGN 텍스트 붙여넣기")}</label>
          <textarea value={bulkText} onChange={(e) => { setBulkText(e.target.value); setBulkDone(null); }} rows={6} style={{ ...inputStyle, fontFamily: SITE_FONT, resize: "vertical" }} placeholder={'[Event "..."]\n[White "Kasparov, Garry"]\n[Black "Karpov, Anatoly"]\n...\n\n1.e4 e5 2.Nf3 ...'} />
        </div>
        {bulkGames.length > 0 && (
          <div style={{ fontSize: 11.5, color: T.inkSoft, marginBottom: 10 }}>
            {tx("{0}개 대국 인식, {1}", bulkGames.length, <b style={{ color: T.best }}>{tx("{0}개 가져오기 가능", bulkOk.length)}</b>)}
            {bulkSkipped > 0 && <span style={{ color: T.blunder }}> · {tx("{0}개는 대국자·수순·결과 확인 불가로 제외", bulkSkipped)}</span>}
          </div>
        )}
        {bulkErr && <p style={{ fontSize: 11.5, color: T.blunder, marginBottom: 8 }}>{bulkErr}</p>}
        {bulkDone && <p style={{ fontSize: 11.5, color: T.best, marginBottom: 8, fontWeight: 800 }}>{tx("{0}개 대국 저장 완료{1}", bulkDone.saved, bulkDone.skipped > 0 ? t(" ({0}개 건너뜀)", bulkDone.skipped) : "")}.</p>}
        <button onClick={saveBulk} disabled={!bulkOk.length || bulkSaving} className="press" style={{ width: "100%", padding: "9px 0", borderRadius: 9, border: "none", background: bulkOk.length && !bulkSaving ? "linear-gradient(180deg," + T.brass + ",#A8842F)" : "#C9BDA0", color: "#241509", fontWeight: 900, fontSize: 12.5, cursor: bulkOk.length && !bulkSaving ? "pointer" : "default" }}>{bulkSaving ? t("가져오는 중…") : bulkOk.length ? t("{0}개 일괄 저장", (bulkOk.length)) : t("가져올 대국 없음")}</button>
        </>)}
      </div>
    </div>
  );
}
// (v0.2.6 버그 수정) 미니보드 하단 콘텐츠(chess.com 통계+마스터 대국 / 다음 수 블록)를 좌우로
// 드래그하거나 </> 버튼으로 넘기는 2페이지 구성 — 집중분석이 전체화면 오버레이라 다음 수 블록이
// 화면 아래로 스크롤해도 보이지 않던 문제(특히 모바일)를 해결한다. 휠·트랙패드 스크롤에는 반응하지
// 않고(overflow가 아니라 transform 기반 캐러셀이라 애초에 스크롤 이벤트를 받지 않음), 오직
// 드래그와 화살표 버튼으로만 페이지가 넘어간다.
function FocusBoxPager({ pages }) {
  const [idx, setIdx] = useState(0);
  const [dragging, setDragging] = useState(false);
  const [dragDx, setDragDx] = useState(0);
  // (버그 수정) flex row(양옆으로 페이지를 늘어놓는 트랙)는 기본적으로 자기 자식 중 가장 키가 큰
  // 페이지(보통 다음 수 블록 목록)에 맞춰 전체 높이가 정해진다 — 짧은 페이지(chess.com 통계 등)를
  // 보고 있을 때도 항상 가장 긴 페이지 높이만큼 빈 공간이 아래에 크게 남았다. 각 페이지의 실제
  // 콘텐츠 높이를 ResizeObserver로 재 두고, 지금 보이는 페이지의 높이로만 바깥 wrapper 높이를
  // 맞춰(부드러운 트랜지션과 함께) 페이지를 넘길 때마다 자연스럽게 늘었다 줄었다 하게 한다.
  const [heights, setHeights] = useState([]);
  const wrapRef = useRef(null);
  const dragRef = useRef(null);
  const pageRefs = useRef([]);
  const n = pages.length;
  useEffect(() => { setIdx((i) => Math.min(i, n - 1)); }, [n]);
  useLayoutEffect(() => {
    const measure = () => setHeights(pageRefs.current.map((el) => (el ? el.offsetHeight : 0)));
    measure();
    if (typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(measure);
    pageRefs.current.forEach((el) => el && ro.observe(el));
    return () => ro.disconnect();
  }, [pages, n]);
  if (n <= 1) return pages[0] || null;
  const goTo = (i) => setIdx(Math.max(0, Math.min(n - 1, i)));
  // (버그 수정) 정렬·검색·페이지 이동 버튼이 이 드래그 캐러셀 안에 있으면 눌러도 반응하지 않던
  // 문제 — onPointerDown이 어디를 눌렀든 무조건 setPointerCapture를 걸어, 뒤이어 발생하는 클릭
  // 이벤트의 타깃이 실제로 누른 버튼이 아니라 이 캡처한 바깥 div로 리다이렉트됐다. 버튼·링크·
  // 입력창 등 상호작용 요소 위에서 시작한 포인터는 애초에 드래그로 잡지 않도록 건너뛴다.
  const onPointerDown = (e) => {
    if (e.target.closest && e.target.closest('button, a, input, select, textarea, [role="button"]')) return;
    dragRef.current = { x: e.clientX };
    setDragging(true);
    if (e.currentTarget.setPointerCapture) { try { e.currentTarget.setPointerCapture(e.pointerId); } catch { /* noop */ } }
  };
  const onPointerMove = (e) => {
    if (!dragRef.current) return;
    setDragDx(e.clientX - dragRef.current.x);
  };
  const endDrag = () => {
    if (dragRef.current) {
      const w = (wrapRef.current && wrapRef.current.clientWidth) || 300;
      const threshold = w * 0.16;
      if (dragDx < -threshold && idx < n - 1) goTo(idx + 1);
      else if (dragDx > threshold && idx > 0) goTo(idx - 1);
    }
    dragRef.current = null;
    setDragging(false);
    setDragDx(0);
  };
  const activeHeight = heights[idx];
  return (
    <div>
      <div ref={wrapRef} className="no-pan" onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={endDrag} onPointerCancel={endDrag}
        style={{ overflow: "hidden", touchAction: "pan-y", cursor: dragging ? "grabbing" : "grab", height: activeHeight != null ? activeHeight : "auto", transition: dragging ? "none" : "height .32s cubic-bezier(.22,.9,.32,1)" }}>
        <div style={{ display: "flex", alignItems: "flex-start", transform: "translateX(calc(" + (-idx * 100) + "% + " + dragDx + "px))", transition: dragging ? "none" : "transform .32s " + "cubic-bezier(.22,.9,.32,1)" }}>
          {pages.map((p, i) => <div key={i} ref={(el) => { pageRefs.current[i] = el; }} style={{ width: "100%", flexShrink: 0, minWidth: 0 }}>{p}</div>)}
        </div>
      </div>
      <div className="flex items-center justify-center" style={{ gap: 10, marginTop: 8 }}>
        <button onClick={() => goTo(idx - 1)} disabled={idx === 0} aria-label={t("이전 페이지")} className="press" style={{ width: 26, height: 26, borderRadius: 8, border: "none", background: "rgba(0,0,0,.06)", color: idx === 0 ? "#C9B58C" : T.inkSoft, cursor: idx === 0 ? "default" : "pointer", display: "inline-flex", alignItems: "center", justifyContent: "center" }}><ChevronLeft size={15} /></button>
        <div className="flex items-center" style={{ gap: 5 }}>
          {pages.map((_, i) => <span key={i} style={{ width: i === idx ? 16 : 6, height: 5, borderRadius: 999, background: i === idx ? T.brass : "#DCCBA8", transition: "all .25s ease" }} />)}
        </div>
        <button onClick={() => goTo(idx + 1)} disabled={idx === n - 1} aria-label={t("다음 페이지")} className="press" style={{ width: 26, height: 26, borderRadius: 8, border: "none", background: "rgba(0,0,0,.06)", color: idx === n - 1 ? "#C9B58C" : T.inkSoft, cursor: idx === n - 1 ? "default" : "pointer", display: "inline-flex", alignItems: "center", justifyContent: "center" }}><ChevronRight size={15} /></button>
      </div>
    </div>
  );
}
// 체스보드 하단(왼쪽 칼럼)에 기존에 쓰던 집중분석 UI를 그대로 배치한다. 미니보드 하단부(chess.com
// 통계+마스터 대국, 다음 수 블록)는 FocusBoxPager로 2페이지에 나눠 담는다 — 다음 수 블록은
// nextMovesPanel prop으로 LearnTab에서 미리 만들어 전달받는다(LearnTab 쪽 상태·로직을 그대로 재사용).
// (v0.2.9 기능) 사용자 요청 — "수 설명" 작성 권한을 개발자 전용에서 로그인한 모든 사용자로 열되,
// 글자 수를 카드 하나에 다 들어갈 만큼 제한하고, 여러 개면 스크롤·자동 넘김이 되는 캐러셀로 보여주고,
// 개발자 권한은 편집·삭제로 남겨 둔다. 예전의 단일 dev 전용 "해설 편집"(CONTENT.explains, app_content
// 테이블 — is_content_editor로 서버가 잠가둔 공유 콘텐츠 블롭)을 그대로 열 수는 없었다 — 단일 값이라
// "여러 개"를 표현할 수 없고, 무엇보다 그 테이블 자체가 RLS로 콘텐츠 에디터만 쓸 수 있게 고정돼 있어
// UI만 바꿔서는 일반 유저의 등록이 서버에서 그대로 거부된다. 대신 새 테이블 move_notes(수마다 여러 행,
// 1인 1수당 1개, RLS: 누구나 읽기·로그인 유저 본인 것만 쓰기·개발자만 수정·삭제)를 새로 만들어 이
// 기능 전용으로 완전히 분리했다 — supabase-setup.sql 15번 섹션 참고.
const MOVE_NOTE_MAX_LEN = 150;
// (v0.4.0 기능) 사용자 요청 — 수 설명 본문에서 실제로 그 위치에서 둘 수 있는 SAN을 언급하면 자동으로
// 집중분석으로 바로 이동하는 링크가 되게 한다. 문장에서 SAN처럼 생긴 토큰만 우선 정규식으로 후보로
// 뽑고("모양"만 걸러내는 용도), 진짜로 그 위치에서 합법인지는 반드시 sanSrc(기존 수 적용 로직,
// applySan/boardFromSans가 이미 쓰는 것과 같은 함수)로 재검증한다 — 그냥 SAN처럼 보이기만 하는
// 우연의 일치 단어를 링크로 만들지 않기 위해서다.
// (버그 수정, 사용자 요청) 앞에 수 번호(예: "12.", "12...")가 없으면 그냥 문장 속 우연히 SAN처럼
// 생긴 낱말(예: "e5"가 좌표가 아니라 그냥 지명·약어인 경우)까지 링크로 잡히는 오탐이 있었다 — 뒤에서
// 볼(lookbehind) 수 번호 접두사가 바로 앞에 있을 때만 후보로 인정한다(대괄호 구문도 동일하게
// renderMoveNoteBody에서 별도로 요구한다).
const SAN_TOKEN_RE = /(?<=\d+\.(?:\.\.)?\s*)(?:O-O-O|O-O|[KQRBN][a-h]?[1-8]?x?[a-h][1-8]|[a-h]x[a-h][1-8]|[a-h][1-8])(?:=[QRBN])?[+#]?\b/g;
// moveKey는 "그 수 이전까지의 수순(공백 join) + '|' + 그 수 자체"로 만들어진다(mkKey 정의부 참고).
// 이 함수는 반대로 moveKey에서 "이 설명이 달린 바로 그 위치"까지의 전체 수순(sans 배열, 그 수까지
// 포함)을 복원한다 — 이후 이 위치를 기준으로 다음 수 합법성을 검사하고, 링크 클릭 시 enterFocusAt에
// 넘겨줄 sans로 쓴다.
function ownSansFromMoveKey(moveKey) {
  if (!moveKey) return [];
  const bar = moveKey.lastIndexOf("|");
  if (bar === -1) return [];
  const priorPart = moveKey.slice(0, bar);
  const san = moveKey.slice(bar + 1);
  const prior = priorPart ? priorPart.split(" ") : [];
  return san ? [...prior, san] : prior;
}
// baseSans 위치에서 seq(SAN 배열)를 순서대로 재생해본다 — 하나라도 그 시점 보드에서 합법이 아니면
// 즉시 null(실패)을 돌려주고, 전부 성공하면 재생이 끝난 보드를 돌려준다(호출부는 성공 여부만 보면
// 충분해 보드 자체는 안 쓰지만, 판정 로직을 sanSrc/applySan에 그대로 위임하기 위해 실제로 둬 본다).
function tryReplaySanSequence(baseSans, seq) {
  if (!seq || !seq.length) return null;
  let board = boardFromSans(baseSans);
  let color = baseSans.length % 2 === 0 ? "w" : "b";
  for (const san of seq) {
    const info = sanSrc(board, san, color);
    if (!info) return null;
    board = applySan(board, san, color);
    color = color === "w" ? "b" : "w";
  }
  return board;
}
// 수 설명 본문을 렌더링용 노드 배열로 바꾼다 — [[e5 Nf3 Nc6 Bb5]] 같은 이중 대괄호 구간은 그 안의
// SAN 수순 전체를 baseSans 위치부터 재생해보고, 전부 합법이면 링크(대괄호는 표시에서 제거)로,
// 하나라도 불합법이면 그냥 대괄호만 벗긴 일반 텍스트로 보여준다. 대괄호 밖 일반 문장에서는 SAN처럼
// 생긴 낱말 하나하나가 "바로 다음 수"로 합법일 때만(길이 1 재생) 같은 방식으로 링크가 된다 — 대괄호
// 구문은 이 length-1 케이스를 여러 수로 확장한 것뿐이라 같은 tryReplaySanSequence를 재사용한다.
function renderMoveNoteBody(body, baseSans, onJump) {
  const text = body || "";
  if (!onJump || !baseSans) return text;
  const linkStyle = { color: T.brass, fontWeight: 800, textDecoration: "underline", textDecorationStyle: "dotted", cursor: "pointer" };
  const renderPlain = (str, keyPrefix) => {
    const out = [];
    let last = 0, i = 0, mm;
    SAN_TOKEN_RE.lastIndex = 0;
    while ((mm = SAN_TOKEN_RE.exec(str))) {
      const token = mm[0];
      if (tryReplaySanSequence(baseSans, [token])) {
        if (mm.index > last) out.push(str.slice(last, mm.index));
        out.push(<a key={keyPrefix + "-t" + (i++)} onClick={() => onJump(baseSans, token)} style={linkStyle}>{token}</a>);
        last = SAN_TOKEN_RE.lastIndex;
      }
    }
    if (last < str.length) out.push(str.slice(last));
    return out;
  };
  const parts = [];
  const bracketRe = /\[\[([^[\]]+)\]\]/g;
  // (사용자 요청) 대괄호 구문도 첫 수 앞에 수 번호(예: "12." · "12...")가 있어야만 인식한다 — 없으면
  // 그냥 대괄호만 벗긴 일반 텍스트로 보여준다(기존 동작과 동일한 폴백).
  const bracketNumRe = /^(\d+\.(?:\.\.)?)\s*(.*)$/;
  let last = 0, bm, k = 0;
  while ((bm = bracketRe.exec(text))) {
    if (bm.index > last) parts.push(...renderPlain(text.slice(last, bm.index), "p" + k));
    const seqStr = bm[1].trim();
    const numMatch = bracketNumRe.exec(seqStr);
    const seq = numMatch ? numMatch[2].split(/\s+/).filter(Boolean) : [];
    const board = numMatch ? tryReplaySanSequence(baseSans, seq) : null;
    if (board) {
      const prefixedSans = [...baseSans, ...seq.slice(0, -1)];
      const lastSan = seq[seq.length - 1];
      parts.push(<a key={"b" + k} onClick={() => onJump(prefixedSans, lastSan)} style={linkStyle}>{seqStr}</a>);
    } else {
      parts.push(seqStr);
    }
    last = bracketRe.lastIndex; k++;
  }
  if (last < text.length) parts.push(...renderPlain(text.slice(last), "p" + k));
  return parts;
}
// (사용자 요청) 150자 제한을 셀 때, [[...]] 대괄호 안(인식용 수순)은 실제 설명 내용이 아니라 링크
// 대상을 지정하는 구문일 뿐이므로 글자 수에 포함하지 않는다.
function moveNoteEffectiveLen(text) {
  return (text || "").replace(/\[\[[^[\]]*\]\]/g, "").length;
}
// (사용자 요청) 수 설명에 유튜브 댓글처럼 좋아요/싫어요를 달 수 있게 — move_note_vote RPC 하나가
// 토글(같은 값을 다시 누르면 취소, 다른 값이면 전환)까지 서버에서 처리하고, 그 결과(내 새 투표 상태·
// 갱신된 좋아요/싫어요 수)를 그 자리에서 돌려준다.
async function moveNoteVote(noteId, value) {
  try { const rows = await sbRpc("move_note_vote", { p_note_id: noteId, p_value: value }); return (Array.isArray(rows) ? rows[0] : rows) || null; }
  catch { return null; }
}
// 정렬 옵션 — MoveExplainBlock의 noteSort 값과 PostgREST order 절 매핑을 한곳에 묶어 둔다.
const MOVE_NOTE_SORTS = {
  popular: { label: t("인기순"), order: "score.desc,created_at.asc" },
  date: { label: t("날짜순"), order: "created_at.asc" },
  recent: { label: t("최신순"), order: "created_at.desc" },
};
function MoveNoteCard({ n, canModerate, uid, onSaved, onDeleted, ownSans, onJump, onVote }) {
  // (사용자 요청) 예전엔 작성자 본인도 스스로 못 고치고 개발자(canModerate)만 편집·삭제할 수
  // 있었다 — 이제 자기 글은 본인이 자유롭게 고치고 지울 수 있고, 개발자/공동개발자는 그대로
  // 모든 글에 대해 편집 권한을 유지한다(RLS도 함께 맞춤, supabase-setup.sql 15번 섹션 참고).
  const canEditThis = canModerate || (!!uid && n.uid === uid);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(n.body);
  const [busy, setBusy] = useState(false);
  const save = async () => {
    const t = draft.trim();
    if (!t || moveNoteEffectiveLen(t) > MOVE_NOTE_MAX_LEN || containsBannedWord(t)) return;
    setBusy(true);
    try { await sbPatch("move_notes", "id=eq." + n.id, { body: t }); onSaved(n.id, t); setEditing(false); } catch { } finally { setBusy(false); }
  };
  const remove = async () => {
    setBusy(true);
    try { await sbDelete("move_notes", "id=eq." + n.id); onDeleted(n.id); } catch { setBusy(false); }
  };
  return (
    <div style={{ flexShrink: 0, scrollSnapAlign: "start", boxSizing: "border-box", minHeight: 96, display: "flex", flexDirection: "column", justifyContent: "space-between", paddingBottom: 8 }}>
      <div>
        <div className="flex items-center justify-between" style={{ marginBottom: 4 }}>
          <span style={{ fontSize: 11, fontWeight: 800, color: T.brass }}>@{n.author_username || t("익명")}</span>
          <span style={{ fontSize: 9.5, color: T.inkSoft, flexShrink: 0 }}>{relTime(n.created_at)}</span>
        </div>
        {editing ? (
          <div>
            <textarea value={draft} onChange={(e) => { const v = e.target.value; if (moveNoteEffectiveLen(v) <= MOVE_NOTE_MAX_LEN) setDraft(v); }} rows={3} style={{ width: "100%", fontSize: 12, padding: 8, borderRadius: 8, border: "1px solid #C9B58C", background: "#fff", color: T.ink, resize: "none", boxSizing: "border-box" }} />
            <div className="flex items-center justify-between" style={{ marginTop: 4 }}>
              <span style={{ fontSize: 10, color: T.inkSoft }}>{moveNoteEffectiveLen(draft)}/{MOVE_NOTE_MAX_LEN}</span>
              <div className="flex gap-2">
                <button disabled={busy} onClick={save} className="press" style={{ fontSize: 10.5, fontWeight: 700, padding: "3px 9px", borderRadius: 6, border: "none", background: T.brass, color: "#241509", cursor: "pointer" }}>{t("저장")}</button>
                <button disabled={busy} onClick={() => { setEditing(false); setDraft(n.body); }} className="press" style={{ fontSize: 10.5, padding: "3px 9px", borderRadius: 6, border: "1px solid " + T.brass, background: "transparent", color: T.inkSoft, cursor: "pointer" }}>{t("취소")}</button>
              </div>
            </div>
          </div>
        ) : (
          <p style={{ fontSize: 12.5, color: T.ink, fontWeight: 600, lineHeight: 1.55, margin: 0, wordBreak: "break-word" }}>{renderMoveNoteBody(n.body, ownSans, onJump)}</p>
        )}
      </div>
      {!editing && (
        <div className="flex items-center justify-between" style={{ marginTop: 6 }}>
          {/* (사용자 요청) 유튜브 댓글처럼 좋아요/싫어요 — 같은 걸 다시 누르면 취소, 반대를 누르면
              그쪽으로 바뀐다. 로그인하지 않았으면(uid 없음) 카운트만 보이고 누를 수 없다. */}
          <div className="flex items-center gap-2">
            <button onClick={() => uid && onVote(n.id, 1)} disabled={!uid} className="press" style={{ display: "inline-flex", alignItems: "center", gap: 3, background: "none", border: "none", padding: 0, cursor: uid ? "pointer" : "default", color: n.my_vote === 1 ? T.brass : T.inkSoft }}>
              <ThumbsUp size={12} fill={n.my_vote === 1 ? T.brass : "none"} /><span style={{ fontSize: 10.5, fontWeight: 700 }}>{n.likes || 0}</span>
            </button>
            <button onClick={() => uid && onVote(n.id, -1)} disabled={!uid} className="press" style={{ display: "inline-flex", alignItems: "center", gap: 3, background: "none", border: "none", padding: 0, cursor: uid ? "pointer" : "default", color: n.my_vote === -1 ? T.blunder : T.inkSoft }}>
              <ThumbsDown size={12} fill={n.my_vote === -1 ? T.blunder : "none"} /><span style={{ fontSize: 10.5, fontWeight: 700 }}>{n.dislikes || 0}</span>
            </button>
          </div>
          {canEditThis && (
            <div className="flex gap-2">
              <button onClick={() => setEditing(true)} className="press" style={{ fontSize: 10, fontWeight: 700, padding: "2px 7px", borderRadius: 6, border: "1px solid " + T.brass, background: "transparent", color: T.cocoa || "#5A3A22", cursor: "pointer" }}>{t("편집")}</button>
              <button disabled={busy} onClick={remove} className="press" style={{ fontSize: 10, padding: "2px 7px", borderRadius: 6, border: "1px solid " + T.blunder, background: "transparent", color: T.blunder, cursor: "pointer" }}><Trash2 size={10} /></button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
// (v0.3.0 기능) 사용자 요청 — 수 설명 캐러셀을 보드 옆의 별도 카드로 따로 두지 않고, 기존 "해설"
// 박스 자리에 그대로 병합한다. 설명이 하나도 없을 때만 기존 개발자 정적 해설(explain)을 그 자리에
// 보여주는 폴백으로 남긴다. 가로 스와이프 대신 세로로 자동 스크롤되도록 축을 바꿨고(5초 간격),
// 카드 좌상단에 "@아이디"를 보여준다. 손으로 위아래 스크롤하면 기존과 동일하게 6초간 자동 넘김을 쉰다.
function MoveExplainBlock({ moveKey, canModerate, uid, username, explain, explainLong, title, setShowExpl, noteCap, onJump }) {
  const [notes, setNotes] = useState(null); // null=로딩 중
  const [idx, setIdx] = useState(0);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  // (사용자 요청) 수 설명 정렬 — 인기순(좋아요-싫어요 점수)/날짜순(오래된 순)/최신순. 기존 기본
  // 동작(오래된 순)을 그대로 유지하기 위해 기본값은 "date"로 둔다.
  const [noteSort, setNoteSort] = useState("date");
  const scrollerRef = useRef(null);
  const pauseUntilRef = useRef(0);
  const scrollDebounceRef = useRef(null);
  // (버그 수정, 사용자 제보) 정렬을 바꿔 카드 순서가 재배치되는 순간, 이 스크롤 컨테이너에서
  // 브라우저가 자체적으로(scroll-snap 재계산 등 정확한 원인은 특정하지 못했지만 실기기·헤드리스
  // 브라우저 모두에서 재현됨) 원치 않는 scroll 이벤트를 흘려보내는 경우가 있었다 — 그 이벤트가
  // onManualScroll의 "사용자가 직접 스크롤했다"는 판단(120ms 디바운스 후 그 스크롤 위치로 idx를
  // 되맞춤)을 건드려, 방금 0으로 되돌려 둔 idx를 다시 엉뚱한 값으로 덮어써 버렸다(카드 내용은
  // 새 순서로 바뀌는데 캐러셀 위치만 어긋나 보이는 원인). moveKey·noteSort가 바뀐 직후 짧은
  // 유예 시간 동안은 onManualScroll이 무엇을 보든 idx를 건드리지 않게 막아, 그 사이 어떤 스크롤
  // 이벤트가 오더라도 우리가 이미 정한 idx(0)가 안전하게 유지되게 한다.
  const suppressScrollSyncUntilRef = useRef(0);
  // (v0.4.0 기능) 이 설명이 달린 바로 그 위치까지의 전체 수순 — 본문에 언급된 SAN을 그 위치 기준으로
  // 합법성 검사하고, 링크 클릭 시 그 위치에서부터 집중분석으로 이동하기 위해 필요하다.
  const ownSans = useMemo(() => ownSansFromMoveKey(moveKey), [moveKey]);
  const load = useCallback(async () => {
    if (!moveKey) { setNotes([]); return; }
    // (사용자 요청) 좋아요/싫어요 집계·내 투표 상태가 함께 딸려오는 뷰(move_notes_with_votes)를
    // move_notes 대신 읽는다 — 글 등록/수정/삭제는 여전히 move_notes 테이블에 직접 한다.
    try { setNotes(await sbSelect("move_notes_with_votes?select=*&move_key=eq." + encodeURIComponent(moveKey) + "&order=" + MOVE_NOTE_SORTS[noteSort].order)); }
    catch { setNotes([]); }
  }, [moveKey, noteSort]);
  // (사용자 요청) moveKey가 바뀌면(다른 수로 이동) 완전히 새로 시작하고, noteSort만 바뀌면(같은 수,
  // 정렬만 전환) 작성 중이던 글(draft)까지 지울 필요는 없이 목록만 다시 정렬해 불러온다 — 두 경우를
  // 하나의 effect에서 prevMoveKeyRef로 구분한다(따로 두면 load의 deps가 noteSort까지 포함해 매번
  // 새 함수가 되므로, moveKey 전용 effect가 load를 deps에 넣을 때 정렬 변경에도 불필요하게 같이
  // 돌며 draft/err를 지워버린다).
  const prevMoveKeyRef = useRef(moveKey);
  useEffect(() => {
    const moveKeyChanged = prevMoveKeyRef.current !== moveKey;
    prevMoveKeyRef.current = moveKey;
    if (moveKeyChanged) { setNotes(null); setDraft(""); setErr(""); }
    setIdx(0);
    // (버그 수정, 사용자 제보) 정렬을 바꾸면 카드 순서가 재배치되면서 이 스크롤 컨테이너에
    // 브라우저가 자체적으로 scroll 이벤트를 흘려보내는 경우가 있었다(scroll-snap 재계산 등) —
    // 그게 onManualScroll의 120ms 디바운스를 건드려, 방금 위에서 0으로 되돌린 idx를 그 사이에
    // 엉뚱한 값으로 다시 덮어써 버렸다(카드 내용은 새 순서로 바뀌었는데 캐러셀 인덱스만 어긋나
    // 보이는 원인). 이 재정렬 시점에 걸려 있을 수 있는 그 디바운스 타이머를 확실히 지우고,
    // suppressScrollSyncUntilRef로 짧은 유예 시간 동안 onManualScroll이 idx를 건드리지 못하게 막는다.
    // (실측) 그 브라우저 자체 스크롤 이동은 이 효과가 도는 시점으로부터 대략 300~400ms 사이에
    // 벌어진다 — idx는 지켰지만 실제 스크롤 위치가 여전히 어긋나 있을 수 있으므로, 그 구간을
    // 지나 두 번(350ms·550ms) 강제로 맨 위(scrollTop 0)로 되돌려 최종 위치를 확정한다.
    if (scrollDebounceRef.current) { clearTimeout(scrollDebounceRef.current); scrollDebounceRef.current = null; }
    pauseUntilRef.current = Date.now() + 600;
    suppressScrollSyncUntilRef.current = Date.now() + 600;
    load();
    const t1 = setTimeout(() => { if (scrollerRef.current) scrollerRef.current.scrollTop = 0; }, 350);
    const t2 = setTimeout(() => { if (scrollerRef.current) scrollerRef.current.scrollTop = 0; }, 550);
    return () => { clearTimeout(t1); clearTimeout(t2); };
  }, [moveKey, load]);
  useEffect(() => {
    if (!notes || notes.length < 2) return;
    const iv = setInterval(() => { if (Date.now() >= pauseUntilRef.current) setIdx((i) => (i + 1) % notes.length); }, 5000);
    return () => clearInterval(iv);
  }, [notes]);
  useEffect(() => {
    const el = scrollerRef.current;
    if (!el) return;
    el.scrollTo({ top: idx * el.clientHeight, behavior: "smooth" });
  }, [idx]);
  const jump = (i) => { pauseUntilRef.current = Date.now() + 6000; setIdx(i); };
  const onManualScroll = () => {
    if (Date.now() < suppressScrollSyncUntilRef.current) return;
    pauseUntilRef.current = Date.now() + 6000;
    if (scrollDebounceRef.current) clearTimeout(scrollDebounceRef.current);
    scrollDebounceRef.current = setTimeout(() => {
      if (Date.now() < suppressScrollSyncUntilRef.current) return;
      const el = scrollerRef.current;
      if (!el || !el.clientHeight) return;
      const i = Math.round(el.scrollTop / el.clientHeight);
      setIdx((cur) => (i !== cur ? i : cur));
    }, 120);
  };
  // (v0.3.4 기능) 사용자 요청 — 개발자 계정은 한 수에 남길 수 있는 설명 개수가 무제한이고, 그랜드
  // 마스터 티어에 도달한 일반 계정은 2개까지(그 외는 기존과 같이 1개) 남길 수 있다. 실제 한도는
  // 서버(move_notes_cap, supabase-setup.sql 15번 섹션)가 최종 결정하므로, 여기서는 noteCap을
  // 못 받은 경우에도 안전하게 기존 동작(1개)으로 되돌아간다.
  const cap = noteCap != null ? noteCap : 1;
  const myNotes = uid && notes ? notes.filter((n) => n.uid === uid) : [];
  const canAddMore = !!uid && myNotes.length < cap;
  const submit = async () => {
    const t_ = draft.trim();
    if (!t_) return;
    if (moveNoteEffectiveLen(t_) > MOVE_NOTE_MAX_LEN) { setErr(t("글자 수가 너무 길어요({0}자까지).", MOVE_NOTE_MAX_LEN)); return; }
    if (containsBannedWord(t_)) { setErr(t("부적절한 표현 포함")); return; }
    setBusy(true); setErr("");
    try {
      await sbInsert("move_notes", { move_key: moveKey, uid, author_username: username || "", body: t_ });
      setDraft(""); await load();
    } catch { setErr(t("등록 실패. 잠시 후 다시 시도")); }
    setBusy(false);
  };
  const hasNotes = notes && notes.length > 0;
  // (사용자 요청) 좋아요/싫어요 투표 — 서버(move_note_vote)가 토글까지 처리하고 갱신된 집계·내 투표
  // 상태를 돌려주므로 그대로 반영한다. 정렬이 "인기순"이어도 투표 직후 바로 재정렬하지는 않는다 —
  // 지금 보고 있는 카드가 갑자기 다른 자리로 튀거나 캐러셀 인덱스가 어긋나는 걸 피하기 위해서고,
  // 다음에 이 수를 다시 열면(load가 다시 불림) 새 순서로 자연스럽게 반영된다.
  const onVote = async (noteId, value) => {
    const res = await moveNoteVote(noteId, value);
    if (!res) return;
    setNotes((prev) => prev ? prev.map((x) => (x.id === noteId ? { ...x, my_vote: res.my_vote, likes: res.likes, dislikes: res.dislikes } : x)) : prev);
  };
  return (
    <div style={{ background: T.paper, border: "1px solid #DCCBA8", borderRadius: 12, padding: 12, boxSizing: "border-box" }}>
      <div className="flex items-center justify-between" style={{ marginBottom: 6 }}>
        <div className="flex items-center gap-2"><BookOpen size={14} style={{ color: T.brass }} /><span style={{ fontSize: 12.5, fontWeight: 800, color: T.ink }}>{t("해설")}</span>{hasNotes && notes.length > 1 && <span style={{ fontSize: 10.5, color: T.inkSoft }}>{idx + 1}/{notes.length}</span>}</div>
        {hasNotes && notes.length > 1 && (
          <div className="flex items-center gap-1">
            <button onClick={() => jump((idx - 1 + notes.length) % notes.length)} aria-label={t("이전 설명")} className="press" style={{ width: 22, height: 22, borderRadius: 6, border: "1px solid " + T.brass, background: "transparent", color: T.brass, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}><ChevronUp size={13} /></button>
            <button onClick={() => jump((idx + 1) % notes.length)} aria-label={t("다음 설명")} className="press" style={{ width: 22, height: 22, borderRadius: 6, border: "1px solid " + T.brass, background: "transparent", color: T.brass, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}><ChevronDown size={13} /></button>
          </div>
        )}
      </div>
      {/* (사용자 요청) 인기순(좋아요-싫어요)/날짜순(오래된 순)/최신순 정렬 선택 — 설명이 2개 이상일
          때만 의미가 있으므로 그때만 보여준다. */}
      {hasNotes && notes.length > 1 && (
        <div className="flex items-center gap-1" style={{ marginBottom: 8 }}>
          {Object.entries(MOVE_NOTE_SORTS).map(([key, s]) => (
            <button key={key} onClick={() => setNoteSort(key)} className="press" style={{ fontSize: 10, fontWeight: 700, padding: "3px 8px", borderRadius: 999, border: "1px solid " + (noteSort === key ? T.brass : "#DCCBA8"), background: noteSort === key ? T.brass : "transparent", color: noteSort === key ? "#241509" : T.inkSoft, cursor: "pointer" }}>{s.label}</button>
          ))}
        </div>
      )}
      {notes === null ? (
        <p style={{ fontSize: 11.5, color: T.inkSoft }}>{t("불러오는 중…")}</p>
      ) : hasNotes ? (
        <>
          {/* (버그 수정, 사용자 제보) 정렬을 바꾸면 카드 순서가 재배치되는데, 각 카드 키(n.id)는
              그대로라 리액트가 기존 DOM 노드를 새로 만들지 않고 그 자리에서 순서만 바꾼다 — 이
              스크롤 컨테이너는 scroll-snap-type이 걸려 있어, 자식이 재배치되는 순간 브라우저가
              스냅 위치를 다시 계산하며 스크롤을 슬쩍 움직였다(idx는 이미 0으로 되돌려 뒀는데도
              화면은 엉뚱한 카드에 멎어 있고, 그 스크롤이 onManualScroll을 "사용자가 직접
              스크롤한 것"으로 오인시켜 idx 상태 자체까지 어긋나 보였다). key를 noteSort로 주면
              정렬이 바뀔 때마다 이 컨테이너 자체를 통째로 새로 만들어, scrollTop이 항상
              0에서 시작하는 새 DOM으로 시작하므로 위 문제가 애초에 생길 자리가 없다. */}
          <div key={noteSort} ref={scrollerRef} onScroll={onManualScroll} className="hide-scrollbar" style={{ display: "flex", flexDirection: "column", overflowY: "auto", scrollSnapType: "y mandatory", maxHeight: 140, WebkitOverflowScrolling: "touch" }}>
            {notes.map((n) => (
              <MoveNoteCard key={n.id} n={n} canModerate={canModerate} uid={uid} ownSans={ownSans} onJump={onJump} onVote={onVote}
                onSaved={(id, body) => setNotes((prev) => prev.map((x) => (x.id === id ? { ...x, body } : x)))}
                onDeleted={(id) => setNotes((prev) => { const next = prev.filter((x) => x.id !== id); setIdx((i) => Math.min(i, Math.max(0, next.length - 1))); return next; })} />
            ))}
          </div>
          {notes.length > 1 && (
            <div className="flex items-center justify-center gap-1" style={{ marginTop: 6 }}>
              {notes.map((n, i) => <button key={n.id} onClick={() => jump(i)} aria-label={t("{0}번째 설명", (i + 1))} className="press" style={{ width: i === idx ? 14 : 6, height: 6, borderRadius: 999, border: "none", background: i === idx ? T.brass : "#DCCBA8", cursor: "pointer", padding: 0, transition: "width .2s" }} />)}
            </div>
          )}
        </>
      ) : (
        <p style={{ fontSize: 12.5, color: T.ink, lineHeight: 1.6 }}>{explain ? (explainLong ? explain.slice(0, 88) + "… " : explain) : (title ? t("{0} 라인", (title)) : t("해설 없음"))}{explainLong && <button onClick={() => setShowExpl(true)} className="press" style={{ fontSize: 11.5, fontWeight: 800, color: T.brass, background: "none", border: "none", cursor: "pointer", padding: 0 }}>{t("더보기")}</button>}</p>
      )}
      <div style={{ height: 1, background: "#E4D5B6", margin: "10px 0" }} />
      {!uid ? (
        <p style={{ fontSize: 11, color: T.inkSoft }}>{t("로그인 후 설명 작성 가능")}</p>
      ) : !canAddMore ? (
        <p style={{ fontSize: 11, color: T.inkSoft }}>{cap > 1 ? t("이미 이 수에 설명을 {0}개 남겼어요(최대 {1}개). 위 카드에서 수정·삭제 가능", myNotes.length, cap) : t("이미 작성함. 위 카드에서 수정·삭제 가능")}</p>
      ) : (
        <div>
          <textarea value={draft} onChange={(e) => { const v = e.target.value; if (moveNoteEffectiveLen(v) <= MOVE_NOTE_MAX_LEN) setDraft(v); setErr(""); }} rows={2} placeholder={t("이 수의 짧은 설명 작성")} style={{ width: "100%", fontSize: 12, padding: 8, borderRadius: 8, border: "1px solid #C9B58C", background: "#fff", color: T.ink, resize: "none", boxSizing: "border-box" }} />
          <div className="flex items-center justify-between" style={{ marginTop: 5 }}>
            <span style={{ fontSize: 10, color: moveNoteEffectiveLen(draft) >= MOVE_NOTE_MAX_LEN ? T.blunder : T.inkSoft }}>{moveNoteEffectiveLen(draft)}/{MOVE_NOTE_MAX_LEN}</span>
            <button disabled={busy || !draft.trim()} onClick={submit} className="press" style={{ fontSize: 11, fontWeight: 700, padding: "5px 12px", borderRadius: 7, border: "none", background: T.brass, color: "#241509", cursor: busy ? "default" : "pointer", opacity: busy || !draft.trim() ? 0.6 : 1 }}>{t("등록")}</button>
          </div>
          {/* (v0.4.0 기능) 바로 다음 수는 SAN을 그냥 문장에 적기만 해도 자동으로 링크가 된다는 것과,
              더 뒤쪽 수로 링크를 걸려면 [[...]] 안에 이어지는 수순을 적어야 한다는 걸 안내한다. */}
          <p style={{ fontSize: 9.5, color: T.inkSoft, marginTop: 4, lineHeight: 1.4 }}>{tx("Tip: \"12.Nf3\"처럼 수 번호와 함께 적으면 해당 수로 이동하는 링크가 됨. 이어지는 수순으로 링크하려면 {0}처럼 대괄호 두 개 안에 수 번호와 수순을 공백으로 구분해 적기. 대괄호 안은 150자 제한에서 제외", <code style={{ fontSize: 9.5 }}>[[12.e5 Nf3 Nc6 Bb5]]</code>)}</p>
          {err && <p style={{ fontSize: 10.5, color: T.blunder, marginTop: 4 }}>{err}</p>}
        </div>
      )}
    </div>
  );
}
// (버그 수정) 마스터 대국이 Lichess 마스터 DB·개발자 추가분·구매한 외부 대국 데이터베이스 세 소스를 출처 구분 없이
// 합친 것이다 보니, 같은 선수라도 소스마다 표기가 달라("Carlsen, M.", "Carlsen, Magnus",
// "Carlsen,M") 검색창 추천 목록에 사실상 같은 이름이 중복으로 여러 줄 뜨는 문제가 있었다.
// "성, 이름 이니셜"까지만 뽑아 정규화한 키로 묶어(성과 이름 첫 글자가 같으면 동일인으로 간주),
// 실제 필터링(부분 문자열 매칭)은 그대로 두고 추천 목록만 대표 이름 하나로 압축한다.
function normalizePlayerKey(name) {
  const s = (name || "").toLowerCase().replace(/\./g, "").trim();
  const comma = s.indexOf(",");
  if (comma === -1) return s;
  const last = s.slice(0, comma).trim();
  const first = s.slice(comma + 1).trim();
  return last + "|" + (first ? first[0] : "");
}
// (v0.5.5 버그 수정) 예전엔 FocusPanel 본문 맨 앞에서 `if (!fa.active) return null`로 조기 반환한 뒤 수십 개의 훅을
// 불러, 같은 인스턴스에서 active가 바뀌면 훅 개수가 달라져 React 오류가 날 수 있는 구조였다 — 조기 반환은
// 얇은 껍데기에 두고 훅을 쓰는 본문은 FocusPanelBody로 분리한다.
function FocusPanel(props) {
  if (!props.fa.active) return null;
  return <FocusPanelBody {...props} />;
}
function FocusPanelBody({ fa, onBack, onOpenPuzzleWizard, onJump, onOpenMasterGame, onOpenMasterGameReview, onOpenMyGame, onOpenMyGameAnalyze, nextMovesPanel, uid, username, noteCap }) {
  const {
    sans, san, m, ply, title, kind, evTxt, extraArrows, explain, mkKey,
    explainLong, showExpl, setShowExpl, editKey, devEdit, setDevEdit,
    nameDraft, setNameDraft, kwDraft, openDevEdit, saveMeta, toggleUnbook, toggleKw, isPunishable, curated,
    stats, mistakes, analyzing, canEdit, canAdd, engine, chesscom, isTheory, addAsTheory, wizardSeed, existingPuzzle,
    masterGames, loadingMasterGames, masterGamesError, onRetryMasterGames,
  } = fa;
  const punish = curated;
  const [openingGameId, setOpeningGameId] = useState(null);
  const [gameOpenError, setGameOpenError] = useState(false);
  const [addGameOpen, setAddGameOpen] = useState(false);   // (v0.2.3 기능) 개발자 마스터 대국 추가 모달
  // (19차 기능2) 이 수([...sans, san])가 실제로 두어진 내 chess.com 대국 — 최근순으로 나열.
  // (버그 보충) 예전엔 최근 8판까지만 잘라 보여줬다 — 이제 전부 가져오고 화면에서 페이지를 넘겨 본다.
  // (v0.2.6 기능) 프로필 카드의 chess.com 통계와 동일하게, 이 수가 두어진 내 대국 목록도 시간
  // 규정·진영으로 나눠 볼 수 있게 한다.
  const [myTimeFilter, setMyTimeFilter] = useState("all");
  const [myColorFilter, setMyColorFilter] = useState("all");
  // (사용자 요청) 오프닝 실수 수순을 누르면 곧장 분석 탭으로 이동하는 대신, 그 수순으로 실제 진행된
  // 내 chess.com 대국을 바로 아래에 펼쳐 보여준다 — 펼쳐진 항목의 인덱스.
  const [expandedMistakeIdx, setExpandedMistakeIdx] = useState(null);
  useEffect(() => { setExpandedMistakeIdx(null); }, [sans.join(","), san]);
  const myGames = useMemo(() => {
    if (!chesscom || chesscom.status !== "ready") return [];
    const path = [...sans, san];
    let out = chesscom.games.filter((g) => g.moves.length >= path.length && path.every((s, i) => g.moves[i] === s));
    if (myTimeFilter !== "all") out = out.filter((g) => g.timeClass === myTimeFilter);
    if (myColorFilter !== "all") out = out.filter((g) => g.color === myColorFilter);
    return out.sort((a, b) => (b.endTime || 0) - (a.endTime || 0));
  }, [chesscom && chesscom.games, chesscom && chesscom.status, sans.join(","), san, myTimeFilter, myColorFilter]);
  const MY_GAMES_PAGE_SIZE = 5;
  const [myGamesPage, setMyGamesPage] = useState(0);
  useEffect(() => { setMyGamesPage(0); }, [sans.join(","), san, myTimeFilter, myColorFilter]);
  const myGamesPageCount = Math.max(1, Math.ceil(myGames.length / MY_GAMES_PAGE_SIZE));
  const myGamesPageItems = myGames.slice(myGamesPage * MY_GAMES_PAGE_SIZE, myGamesPage * MY_GAMES_PAGE_SIZE + MY_GAMES_PAGE_SIZE);
  // (버그 보충) 레이팅 증감치 — 같은 타임클래스(rapid/blitz/bullet 등)끼리 시간순으로 정렬해, 바로
  // 직전 대국 대비 이번 대국에서의 내 레이팅 변화량을 미리 계산해 둔다(레이팅 풀이 다르면 의미가
  // 없으므로 클래스별로 나눠서 비교). chess.com API가 대국별 레이팅을 주므로 별도 요청 없이 계산 가능.
  const ratingChanges = useMemo(() => (chesscom && chesscom.status === "ready" ? computeRatingChanges(chesscom.games) : new Map()), [chesscom && chesscom.games, chesscom && chesscom.status]);
  const fmtGameDate = (t) => { if (!t) return ""; const d = new Date(t * 1000); return d.getFullYear() + "." + String(d.getMonth() + 1).padStart(2, "0") + "." + String(d.getDate()).padStart(2, "0"); };
  // (버그 보충) 마스터 대국 정렬(최신순/레이팅순) + 페이지네이션. 처음 20개를 보여주고, 페이지를
  // 넘기면 나머지 매칭 대국을 계속 보여준다 — masterGames는 이미 fetchAllMasterGames가 전부
  // 불러와 둔 배열이라(build-master-games.mjs가 더 이상 노드당 상한을 두지 않음) 페이지를 넘길 때
  // 추가 네트워크 요청 없이 그대로 슬라이스만 바뀐다.
  const MASTER_PAGE_SIZE = 20;
  const [masterSort, setMasterSort] = useState("default"); // default(원래 채택률순) | recent(최신순) | rating(레이팅순)
  const [masterPage, setMasterPage] = useState(0);
  // (기능) 마스터 이름 검색 — 백/흑 어느 쪽이든 이름에 검색어가 포함된 대국만 남긴다.
  // 입력창에 포커스가 있는 동안엔 실시간으로 일치하는 선수 이름을 추천해 보여준다.
  const [masterSearch, setMasterSearch] = useState("");
  const [masterSearchFocused, setMasterSearchFocused] = useState(false);
  useEffect(() => { setMasterPage(0); }, [sans.join(","), san, masterSort, masterSearch]);
  const sortedMasterGames = useMemo(() => {
    if (masterSort === "recent") return [...masterGames].sort((a, b) => (b.year || 0) - (a.year || 0));
    if (masterSort === "rating") return [...masterGames].sort((a, b) => Math.max((b.white && b.white.rating) || 0, (b.black && b.black.rating) || 0) - Math.max((a.white && a.white.rating) || 0, (a.black && a.black.rating) || 0));
    return masterGames;
  }, [masterGames, masterSort]);
  // 검색창 추천어(자동완성)용 — 지금까지 불러온 마스터 대국에 등장하는 선수 이름을 모으되,
  // normalizePlayerKey로 같은 사람의 표기 차이(정식 이름/이니셜 등)를 하나로 묶고 그중 가장
  // 정보가 많은(긴) 표기 하나만 대표로 남긴다.
  const masterPlayerNames = useMemo(() => {
    const byKey = new Map();
    const consider = (name) => {
      if (!name) return;
      const key = normalizePlayerKey(name);
      const cur = byKey.get(key);
      if (!cur || name.length > cur.length) byKey.set(key, name);
    };
    for (const g of masterGames) {
      if (g.white) consider(g.white.name);
      if (g.black) consider(g.black.name);
    }
    return [...byKey.values()].sort((a, b) => a.localeCompare(b));
  }, [masterGames]);
  const masterSearchQuery = masterSearch.trim().toLowerCase();
  // 추천 목록에서 대표 이름 하나를 골라 클릭하면(예: "Carlsen, Magnus") 검색어와 표기가 다른
  // 같은 선수의 대국("Carlsen,M")은 부분 문자열로는 안 걸린다 — normalizePlayerKey가 같으면
  // (성 + 이름 이니셜 일치) 동일인으로 보고 함께 포함시킨다.
  const masterSearchKey = masterSearchQuery ? normalizePlayerKey(masterSearch) : "";
  const filteredMasterGames = useMemo(() => {
    if (!masterSearchQuery) return sortedMasterGames;
    return sortedMasterGames.filter((g) => {
      const wName = (g.white && g.white.name) || "";
      const bName = (g.black && g.black.name) || "";
      if (wName.toLowerCase().includes(masterSearchQuery) || bName.toLowerCase().includes(masterSearchQuery)) return true;
      return masterSearchKey && (normalizePlayerKey(wName) === masterSearchKey || normalizePlayerKey(bName) === masterSearchKey);
    });
  }, [sortedMasterGames, masterSearchQuery, masterSearchKey]);
  const masterSuggestions = useMemo(() => {
    if (!masterSearchQuery) return [];
    return masterPlayerNames.filter((nm) => nm.toLowerCase().includes(masterSearchQuery)).slice(0, 8);
  }, [masterPlayerNames, masterSearchQuery]);
  const masterPageCount = Math.max(1, Math.ceil(filteredMasterGames.length / MASTER_PAGE_SIZE));
  const masterPageItems = filteredMasterGames.slice(masterPage * MASTER_PAGE_SIZE, masterPage * MASTER_PAGE_SIZE + MASTER_PAGE_SIZE);
  const handleOpenGame = async (id) => {
    if (!onOpenMasterGame || openingGameId) return;
    setOpeningGameId(id); setGameOpenError(false);
    try { await onOpenMasterGame(id); } catch (e) { console.error("마스터 대국 열기 실패:", e); setGameOpenError(true); } finally { setOpeningGameId(null); }
  };
  // (v0.2.1 기능) chess.com 통계의 "보기"+초록 리뷰 버튼 쌍과 동일하게, 마스터 대국도 목록에서
  // 바로 /review로 진입할 수 있게 한다 — "보기"(handleOpenGame)와 별개 상태로 바쁨/에러를 추적한다.
  const [reviewingGameId, setReviewingGameId] = useState(null);
  const [reviewOpenError, setReviewOpenError] = useState(false);
  const handleReviewGame = async (g) => {
    if (!onOpenMasterGameReview || reviewingGameId) return;
    setReviewingGameId(g.id); setReviewOpenError(false);
    try { await onOpenMasterGameReview(g); } catch (e) { console.error("마스터 대국 리뷰 열기 실패:", e); setReviewOpenError(true); } finally { setReviewingGameId(null); }
  };
  return (
    <div>
      <div className="flex items-center justify-between" style={{ marginBottom: 10, gap: 8 }}>
        <button onClick={onBack} className="press" title={t("집중 분석 종료")} style={{ width: 36, height: 36, borderRadius: 10, background: T.ebony2, color: T.ivoryHi, border: "1px solid #000", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", flexShrink: 0 }}><ArrowLeft size={18} /></button>
        <div className="flex items-center gap-2">
          {(canEdit || canAdd) && !isTheory && <button onClick={addAsTheory} className="press" title={t("이론 수로 추가")} style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "8px 13px", borderRadius: 10, background: T.ebony2, color: T.brassHi, fontWeight: 800, fontSize: 12.5, border: "1px solid #000", cursor: "pointer" }}>{tx("{0} 이론 수로 추가", <Book size={14} />)}</button>}
          {/* (18차 UX8) 이 수가 이론 수라면 개발자 모드에서 삭제(비이론화) 가능 — 추가 버튼과 동일 레이아웃 */}
          {canEdit && isTheory && <button onClick={toggleUnbook} className="press" title={t("이론 수에서 삭제")} style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "8px 13px", borderRadius: 10, background: T.ebony2, color: "#F4A8A8", fontWeight: 800, fontSize: 12.5, border: "1px solid #000", cursor: "pointer" }}>{tx("{0} 이론 수에서 삭제", <Trash2 size={14} />)}</button>}
        </div>
      </div>
      {/* 헤더: 아이콘 · 수/이름(크게) · 평가치·등급(수 이름 바로 옆) · 퍼즐 만들기 버튼(우측) */}
      {/* (사용자 요청) 평가치·등급 텍스트를 우측 끝(별도 칼럼)이 아니라 수 이름 바로 옆으로 옮기고,
          둘 다 같은 진한 색(QCOLOR를 검정과 섞어 더 짙게)·같은 폰트(사이트 기본 IBM Plex Sans KR,
          예전엔 평가치만 monospace라 서로 다른 폰트로 보였다)로 통일했다. 그렇게 비게 된 우측 자리엔
          위 툴바에 있던 "퍼즐 풀기" 버튼(생성 중이면 진행 게이지)을 옮겨 왔다. */}
      <div className="flex items-center gap-3" style={{ marginBottom: 12 }}>
        <CircleBadge kind={kind} big descOnClick />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontFamily: SEQ_FONT, fontSize: 30, fontWeight: 800, color: T.ivoryHi, lineHeight: 1.05, textShadow: "0 1px 2px rgba(0,0,0,.5)" }}>{moveNumber(ply)}{m.san}</div>
          <div className="flex items-center gap-2 flex-wrap" style={{ marginTop: 4 }}>
            {title && <div style={{ fontSize: 16, color: T.brassHi, fontWeight: 800, lineHeight: 1.25 }}>{title}</div>}
            {/* (사용자 요청) 어두운 배경 위에서 색을 더 짙게(color-mix로 검정을 섞음) 했더니 오히려
                더 안 보였다 — 반대로 배경과 대비가 가장 뚜렷한 크림색으로 통일한다. (재조정) T.ivoryHi
                (#FAF2E2)는 흰색에 너무 가까워 보인다는 피드백으로, 더 진한 크림색인 T.ivory(#EBDDC4)로 낮춘다. */}
            <div style={{ fontSize: 15, fontWeight: 800, color: T.ivory }}>{evTxt || (kind === "book" ? t("이론") : "—")}</div>
            <div style={{ fontSize: 12, fontWeight: 800, color: T.ivory }}>{QLABEL[kind]}</div>
          </div>
        </div>
        {/* (v0.4.4 개편, 사용자 요청) 예전엔 여기서 곧장 퍼즐을 만들어(auto:true) 준비되는 대로
            "퍼즐 풀기"가 PuzzleSolver를 직접 열었다 — 이제는 항상 퍼즐 탭의 "퍼즐 만들기" 마법사로
            이동한다. 같은 위치에 이미 누군가(나 자신 포함) 만든 퍼즐이 있으면 마법사가 곧장
            "~님이 이미 이 퍼즐을 만들었어요!"와 "퍼즐 풀기"를 보여준다(퍼즐 탭에서 직접 만들 때와
            완전히 같은 코드 경로). 로컬에 이미 있는 걸 알고 있으면 버튼 문구만 미리 맞춰 둔다. */}
        {wizardSeed && onOpenPuzzleWizard && (
          <button onClick={() => onOpenPuzzleWizard(wizardSeed)} className="press" style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "8px 15px", borderRadius: 10, background: "linear-gradient(180deg," + T.brass + ",#A8842F)", color: "#241509", fontWeight: 800, fontSize: 13, border: "none", cursor: "pointer", boxShadow: "0 3px 0 #7A5E22", flexShrink: 0 }}>
            <Pencil size={14} /> {existingPuzzle && existingPuzzle.tree ? t("퍼즐 풀기") : t("퍼즐 만들기")}
          </button>
        )}
      </div>
      {/* 미니보드(좌) + 해설(우) */}
      <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
        <div style={{ flexShrink: 0 }}>
          <AnimatedMove sans={sans} san={san} size={200} extraArrows={extraArrows} />
          {/* (18차 UI5) 미니보드 하단 범례 텍스트 삭제 */}
        </div>
        <div style={{ flex: 1, minWidth: 180 }}>
          <MoveExplainBlock moveKey={mkKey} canModerate={canEdit} uid={uid} username={username} explain={explain} explainLong={explainLong} title={title} setShowExpl={setShowExpl} noteCap={noteCap} onJump={onJump} />
        </div>
      </div>
      {(canEdit || canAdd) && (
        <div style={{ background: "linear-gradient(180deg,#3A2516,#241509)", border: "1px solid " + T.brass, borderRadius: 12, padding: 12, marginTop: 12 }}>
          <div className="flex items-center justify-between" style={{ marginBottom: devEdit ? 8 : 0 }}>
            <div className="flex items-center gap-2" style={{ color: T.brassHi, fontWeight: 800, fontSize: 12.5 }}>{tx("{0} 개발자 편집", <Crown size={14} />)}</div>
            {!devEdit && <div className="flex gap-2">
              <button onClick={openDevEdit} className="press" style={{ fontSize: 10.5, fontWeight: 700, padding: "3px 9px", borderRadius: 7, border: "1px solid " + T.brass, background: "transparent", color: T.brassHi, cursor: "pointer" }}>{t("이름·키워드 편집")}</button>
              {canEdit && (m.book || isUnbooked(editKey, san)) && <button onClick={toggleUnbook} className="press" style={{ fontSize: 10.5, fontWeight: 700, padding: "3px 9px", borderRadius: 7, border: "1px solid " + (isUnbooked(editKey, san) ? T.excellent : T.blunder), background: "transparent", color: isUnbooked(editKey, san) ? T.excellent : T.blunder, cursor: "pointer" }}>{isUnbooked(editKey, san) ? t("이론 수로 복구") : t("이론 수에서 삭제")}</button>}
            </div>}
          </div>
          {devEdit && (
            <div>
              <input value={nameDraft} onChange={(e) => setNameDraft(e.target.value)} placeholder={t("수 이름 (예: 이탈리안 게임)")} style={{ width: "100%", fontSize: 12, padding: 8, borderRadius: 8, border: "1px solid #C9B58C", background: "#fff", color: T.ink, marginBottom: 8, boxSizing: "border-box" }} />
              <div style={{ marginBottom: 8 }}>
                {KW_PAIRS.map(([a, b]) => (
                  <div key={a} className="flex items-center gap-2" style={{ marginBottom: 5 }}>
                    {[a, b].map((k) => { const on = kwDraft.includes(k); return <button key={k} onClick={() => toggleKw(k)} className="press" style={{ flex: 1, fontSize: 9.5, fontWeight: 800, padding: "5px 7px", borderRadius: 5, border: "1px solid " + (on ? KW[k].fg : "rgba(255,255,255,.15)"), background: on ? KW[k].bg : "rgba(255,255,255,.06)", color: on ? KW[k].fg : T.ivory, cursor: "pointer" }}>{k}</button>; })}
                  </div>
                ))}
                <div className="flex flex-wrap gap-1" style={{ marginTop: 8 }}>
                  {KW_SINGLES.map((k) => { const on = kwDraft.includes(k); return <button key={k} onClick={() => toggleKw(k)} className="press" style={{ fontSize: 9.5, fontWeight: 800, padding: "3px 7px", borderRadius: 5, border: "1px solid " + (on ? KW[k].fg : "transparent"), background: on ? KW[k].bg : "rgba(255,255,255,.08)", color: on ? KW[k].fg : T.ivory, cursor: "pointer" }}>{k}</button>; })}
                </div>
              </div>
              <div className="flex gap-2">
                <button onClick={saveMeta} className="press" style={{ fontSize: 11, fontWeight: 700, padding: "5px 12px", borderRadius: 7, border: "none", background: T.brass, color: "#241509", cursor: "pointer" }}>{t("저장")}</button>
                <button onClick={() => setDevEdit(false)} className="press" style={{ fontSize: 11, padding: "5px 12px", borderRadius: 7, border: "1px solid #C9B58C", background: "transparent", color: T.ivory, cursor: "pointer" }}>{t("취소")}</button>
              </div>
            </div>
          )}
        </div>
      )}
      {/* 응징 시퀀스(퍼즐) */}
      {punish && (
        <div style={{ background: "linear-gradient(180deg,#3A2516,#241509)", border: "1px solid " + T.brass, borderRadius: 12, padding: 13, marginTop: 12 }}>
          <div className="flex items-center gap-2" style={{ color: T.brassHi, fontWeight: 800, fontSize: 13, marginBottom: 6 }}>{tx("{0} 응징 시퀀스 · 퍼즐로 저장됨", <Sparkles size={15} />)}</div>
          <p style={{ color: T.ivory, fontSize: 12.5, lineHeight: 1.55, marginBottom: 8 }}>{punish.why}</p>
          <ol style={{ margin: 0, paddingLeft: 18, color: T.ivory, fontSize: 12.5, lineHeight: 1.7 }}>{punish.steps.map((s, i) => <li key={i}>{s}</li>)}</ol>
        </div>
      )}
      {/* (v0.2.6 버그 수정) 미니보드 하단 콘텐츠를 2페이지로 나눈다 — 1페이지: chess.com 통계+마스터
          대국(기존과 동일), 2페이지: 다음 수 블록(nextMovesPanel, LearnTab에서 전달). 드래그 또는
          </> 버튼으로만 넘긴다(휠·스크롤 무반응). */}
      <FocusBoxPager pages={[
        <>
      {/* (버그) 내 chess.com 통계를 마스터 대국보다 위에 표시 — 최근 대국 목록 + 전적 요약 통합 블록 */}
      <div style={{ background: T.paper, border: "1px solid " + T.brass, borderRadius: 12, padding: 13, marginTop: 12 }}>
        <div className="flex items-center gap-2" style={{ marginBottom: 8 }}><span className="flex items-center" style={{ gap: 6, fontSize: 14, fontWeight: 800, color: T.ink }}>{tx("{0} 통계", <ChesscomLogo height={19} />)}</span></div>
        {/* (v0.2.6 기능) 프로필 카드의 chess.com 통계와 동일하게 시간 규정·진영 선택 박스를 추가 —
            이 수가 두어진 내 대국 목록을 시간 규정/진영으로 좁혀 볼 수 있다. */}
        {chesscom && chesscom.status === "ready" && (
          <div className="flex items-center" style={{ gap: 6, marginBottom: 10, flexWrap: "wrap" }}>
            <div className="inline-flex" style={{ borderRadius: 9, background: "rgba(0,0,0,.06)", padding: 3, gap: 2 }}>
              {[["all", t("전체")], ["rapid", t("래피드")], ["blitz", t("블리츠")], ["bullet", t("불릿")]].map(([k, lab]) => (
                <button key={k} onClick={() => setMyTimeFilter(k)} className="press" style={{ padding: "5px 9px", borderRadius: 7, border: "none", cursor: "pointer", fontSize: 10.5, fontWeight: 800, background: myTimeFilter === k ? T.ebony2 : "transparent", color: myTimeFilter === k ? T.brassHi : T.inkSoft }}>{lab}</button>
              ))}
            </div>
            <div className="inline-flex" style={{ borderRadius: 9, background: "rgba(0,0,0,.06)", padding: 3, gap: 2 }}>
              {[["all", t("전체")], ["w", t("백")], ["b", t("흑")]].map(([k, lab]) => (
                <button key={k} onClick={() => setMyColorFilter(k)} className="press" style={{ padding: "5px 9px", borderRadius: 7, border: "none", cursor: "pointer", fontSize: 10.5, fontWeight: 800, background: myColorFilter === k ? T.ebony2 : "transparent", color: myColorFilter === k ? T.brassHi : T.inkSoft }}>{lab}</button>
              ))}
            </div>
          </div>
        )}
        {!chesscom || chesscom.status === "idle" ? <p style={{ fontSize: 12, color: T.inkSoft }}>{t("설정에서 chess.com 계정을 연동하면 이 수의 내 대국과 통계 표시")}</p>
          : chesscom.status === "loading" ? <p style={{ fontSize: 12, color: T.inkSoft }}>{t("기보를 불러오는 중…")}</p>
            : chesscom.status === "error" ? <p style={{ fontSize: 12, color: T.blunder }}>{t("기보 로드 실패. 계정 확인 필요")}</p>
              : (
                <div>
                  {/* 이 수가 두어진 내 최근 대국 — 없으면 "없다"고 표시 */}
                  <div className="flex items-center gap-2" style={{ marginBottom: 6 }}><span style={{ fontSize: 11.5, fontWeight: 800, color: T.brass }}>{t("이 수를 둔 내 최근 대국")}</span>{myGames.length > 0 && <span style={{ fontSize: 10.5, color: T.inkSoft }}>{tx("{0}판", myGames.length)}</span>}</div>
                  {myGames.length === 0 ? <p style={{ fontSize: 12, color: T.inkSoft, margin: "0 0 10px" }}>{t("최근 대국 없음")}</p>
                    : <div style={{ marginBottom: 10 }}>{myGamesPageItems.map((g, i) => {
                        const won = g.result === "win", lost = g.result === "loss";
                        const rc = ratingChanges.get(g);
                        // (v0.2.6 버그 수정) 프로필 카드의 "최근 대국" 목록과 UI를 통일 —
                        // "⬜ 백"/"⬛ 흑" 텍스트 대신 진영 색 막대, 상대 닉네임·레이팅 표시를 그대로 반영.
                        const oppSide = g.color === "w" ? g.black : g.white;
                        return (
                          <div key={i} style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 2px", borderTop: i === 0 ? "none" : "1px solid #E4D5B6" }}>
                            <span title={g.color === "w" ? t("백") : t("흑")} style={{ width: 5, alignSelf: "stretch", minHeight: 30, flexShrink: 0, borderRadius: 3, background: g.color === "w" ? "linear-gradient(180deg,#FFFDF7,#E7DABB)" : "linear-gradient(180deg,#4A3826,#241509)", border: "1px solid " + (g.color === "w" ? "#D8C9A8" : "#000") }} />
                            <div style={{ minWidth: 0, flex: 1 }}>
                              <div style={{ fontSize: 12.5, color: T.ink }}><b style={{ color: won ? T.best : lost ? T.blunder : T.inkSoft }}>{won ? t("승리") : lost ? t("패배") : t("무승부")}</b>
                                {!won && !lost && <span style={{ marginLeft: 4, fontSize: 10, fontWeight: 700, color: T.inkSoft }}>({drawKindLabel(g.moves)})</span>}
                                {rc != null && <span style={{ fontWeight: 800, fontFamily: SITE_FONT, color: rc > 0 ? T.best : rc < 0 ? T.blunder : T.inkSoft }}>({rc > 0 ? "+" + rc : rc})</span>}
                                {g.timeClass && <span style={{ marginLeft: 6, fontSize: 10.5, fontWeight: 700, color: T.inkSoft }}>{TIME_CLASS_LABEL[g.timeClass] || g.timeClass}{g.endTime ? " (" + fmtGameDate(g.endTime) + ")" : ""}</span>}
                              </div>
                              {oppSide && oppSide.username && <div style={{ fontSize: 11, color: T.inkSoft, marginTop: 2 }}>vs <b style={{ color: T.ink }}>{oppSide.username}</b>{oppSide.rating != null && <span style={{ fontFamily: SITE_FONT }}>({oppSide.rating})</span>}</div>}
                              {g.opening && <div style={{ fontSize: 10.5, color: T.inkSoft, marginTop: 2 }}>{g.opening}</div>}
                            </div>
                            <div className="flex items-center gap-2" style={{ flexShrink: 0 }}>
                              {/* (v0.2.6 버그 수정) 이 버튼만 28px로 옆의 리뷰 버튼(BestMoveJumpButton, 30px)과
                                  크기가 미묘하게 달랐다 — 프로필 카드·마스터 대국 목록과 같은 30px로 통일. */}
                              <button onClick={() => onOpenMyGame && onOpenMyGame(g.moves)} aria-label={t("대국 보기")} title={t("대국 보기")} className="press" style={{ width: 30, height: 30, borderRadius: 8, background: "linear-gradient(180deg," + T.brass + ",#A8842F)", color: "#241509", border: "none", cursor: "pointer", display: "inline-flex", alignItems: "center", justifyContent: "center" }}><Search size={13} /></button>
                              <BestMoveJumpButton onClick={() => onOpenMyGameAnalyze && onOpenMyGameAnalyze(g)} />
                            </div>
                          </div>
                        );
                      })}
                      <ListPager page={myGamesPage} setPage={setMyGamesPage} pageCount={myGamesPageCount} />
                    </div>}
                  {/* 전적 요약 */}
                  {!stats ? <p style={{ fontSize: 12, color: T.inkSoft, margin: 0, paddingTop: 10, borderTop: "1px solid #E4D5B6" }}>{t("이 수순의 대국 통계 없음")}</p>
                    : (
                  <div style={{ fontSize: 12.5, color: T.ink, fontWeight: 600, lineHeight: 1.7, paddingTop: 10, borderTop: "1px solid #E4D5B6" }}>
                    <div><b>{tx("{0} 게임", fmtFull(stats.total))}</b> · <span style={{ color: T.best }}>{tx("{0}승", stats.w)}</span> {tx("{0}무 {1} · 승률 {2}", stats.d, <span style={{ color: T.blunder }}>{tx("{0}패", stats.l)}</span>, <b>{stats.winRate}%</b>)}</div>
                    {stats.top.length > 0 && (
                      <div style={{ marginTop: 6 }}>
                        <div style={{ fontWeight: 800, color: T.inkSoft, fontSize: 11.5, marginBottom: 2 }}>{t("자주 둔 다음 수")}</div>
                        {/* (버그 수정) 그냥 텍스트라 눌러도 아무 반응이 없었다 — 오프닝 실수 목록과 동일하게
                            onJump로 그 수의 집중분석 모드로 바로 이동할 수 있게 한다. */}
                        {stats.top.map((t) => (
                          <button key={t.san} onClick={() => onJump && onJump([...sans, san], t.san)} className="press text-left" style={{ display: "block", width: "100%", textAlign: "left", fontFamily: SEQ_FONT, fontSize: 12, color: T.ink, fontWeight: 600, background: "none", border: "none", cursor: "pointer", padding: "2px 0" }}>{moveNumber(ply + 1)}{t.san}({tx("{0} 게임) • 총 {1}승 {2}무 {3}패 • 승률 {4}", t.n, t.w, t.d, t.l, t.wr)}%</button>
                        ))}
                      </div>
                    )}
                    <div style={{ marginTop: 8 }}>
                      <div style={{ fontWeight: 800, color: T.mistake, fontSize: 11.5, marginBottom: 4 }}>{t("오프닝 실수")}</div>
                      {analyzing && mistakes.length === 0 ? (
                        <div className="flex items-center gap-2" style={{ padding: "4px 0" }}>
                          <Mascot name={ply % 2 === 0 ? "kokoa" : "milku"} emotion="think" size={62} />
                          <span style={{ fontSize: 11.5, color: T.inkSoft }}>{t("내 대국 분석 중…")}</span>
                        </div>
                      ) : (!analyzing && mistakes.length === 0) ? <div style={{ fontSize: 11.5, color: T.inkSoft }}>{engine && engine.status === "ready" ? t("15수 이내 두드러진 실수 없음") : t("엔진 준비 후 분석")}</div>
                        : mistakes.map((mt, idx) => {
                          const seqStr = [san, ...mt.seq]; // 표기: 집중 분석 수부터
                          // (사용자 요청) 이 실수 수순으로 실제로 진행된 내 chess.com 대국 — 클릭하면
                          // 곧장 분석 탭으로 이동하는 대신, 프로필 카드와 같은 UI로 바로 아래에 펼쳐
                          // 보여주고, 그 안의 검색·리뷰 버튼으로 각자 분석 탭/리뷰로 이동한다.
                          const fullPrefix = [...sans, san, ...mt.seq];
                          const isOpen = expandedMistakeIdx === idx;
                          const mtGames = isOpen && chesscom && chesscom.status === "ready"
                            ? chesscom.games.filter((g) => g.moves.length >= fullPrefix.length && fullPrefix.every((s, i) => stripSuffix(g.moves[i]) === stripSuffix(s))).sort((a, b) => (b.endTime || 0) - (a.endTime || 0))
                            : [];
                          return (
                            <div key={idx}>
                              <button onClick={() => setExpandedMistakeIdx(isOpen ? null : idx)} className="press text-left" style={{ display: "block", width: "100%", textAlign: "left", fontFamily: SEQ_FONT, fontSize: 12, color: T.ink, fontWeight: 600, background: "none", border: "none", cursor: "pointer", padding: "3px 0", lineHeight: 1.6, whiteSpace: "normal" }}>
                                {seqStr.map((mv, i) => {
                                  const isMistake = i === seqStr.length - 1;
                                  const moverWhite = (ply + i) % 2 === 0;
                                  const isUserMove = (moverWhite && mt.color === "w") || (!moverWhite && mt.color === "b");
                                  const num = moveNumber(ply + i);
                                  const st = isMistake ? { fontWeight: 900, textDecoration: "underline", color: mt.kind === "blunder" ? T.blunder : T.inaccuracy }
                                    : isUserMove ? { fontWeight: 800, color: T.ink } : { color: T.inkSoft, fontWeight: 500 };
                                  return <span key={i} style={st}>{num}{mv} </span>;
                                })}
                                <span style={{ color: T.inkSoft }}>({tx("{0}회)", mt.count)}</span>
                              </button>
                              {isOpen && (
                                <div style={{ margin: "2px 0 6px", padding: "4px 8px", borderRadius: 8, background: "rgba(0,0,0,.04)" }}>
                                  {mtGames.length === 0 ? <div style={{ fontSize: 11, color: T.inkSoft, padding: "4px 0" }}>{t("대국을 찾을 수 없음")}</div>
                                    : mtGames.map((g, gi) => {
                                      const won = g.result === "win", lost = g.result === "loss";
                                      const rc = ratingChanges.get(g);
                                      const oppSide = g.color === "w" ? g.black : g.white;
                                      return (
                                        <div key={gi} style={{ display: "flex", alignItems: "center", gap: 8, padding: "6px 2px", borderTop: gi === 0 ? "none" : "1px solid #E4D5B6" }}>
                                          <span title={g.color === "w" ? t("백") : t("흑")} style={{ width: 5, alignSelf: "stretch", minHeight: 30, flexShrink: 0, borderRadius: 3, background: g.color === "w" ? "linear-gradient(180deg,#FFFDF7,#E7DABB)" : "linear-gradient(180deg,#4A3826,#241509)", border: "1px solid " + (g.color === "w" ? "#D8C9A8" : "#000") }} />
                                          <div style={{ minWidth: 0, flex: 1 }}>
                                            <div style={{ fontSize: 12.5, color: T.ink }}><b style={{ color: won ? T.best : lost ? T.blunder : T.inkSoft }}>{won ? t("승리") : lost ? t("패배") : t("무승부")}</b>
                                              {!won && !lost && <span style={{ marginLeft: 4, fontSize: 10, fontWeight: 700, color: T.inkSoft }}>({drawKindLabel(g.moves)})</span>}
                                              {rc != null && <span style={{ fontWeight: 800, fontFamily: SITE_FONT, color: rc > 0 ? T.best : rc < 0 ? T.blunder : T.inkSoft }}>({rc > 0 ? "+" + rc : rc})</span>}
                                              {g.timeClass && <span style={{ marginLeft: 6, fontSize: 10.5, fontWeight: 700, color: T.inkSoft }}>{TIME_CLASS_LABEL[g.timeClass] || g.timeClass}{g.endTime ? " (" + fmtGameDate(g.endTime) + ")" : ""}</span>}
                                            </div>
                                            {oppSide && oppSide.username && <div style={{ fontSize: 11, color: T.inkSoft, marginTop: 2 }}>vs <b style={{ color: T.ink }}>{oppSide.username}</b>{oppSide.rating != null && <span style={{ fontFamily: SITE_FONT }}>({oppSide.rating})</span>}</div>}
                                            {g.opening && <div style={{ fontSize: 10.5, color: T.inkSoft, marginTop: 2 }}>{g.opening}</div>}
                                          </div>
                                          <div className="flex items-center gap-2" style={{ flexShrink: 0 }}>
                                            <button onClick={() => onOpenMyGame && onOpenMyGame(g.moves)} aria-label={t("대국 보기")} title={t("대국 보기")} className="press" style={{ width: 30, height: 30, borderRadius: 8, background: "linear-gradient(180deg," + T.brass + ",#A8842F)", color: "#241509", border: "none", cursor: "pointer", display: "inline-flex", alignItems: "center", justifyContent: "center" }}><Search size={13} /></button>
                                            <BestMoveJumpButton onClick={() => onOpenMyGameAnalyze && onOpenMyGameAnalyze(g)} />
                                          </div>
                                        </div>
                                      );
                                    })}
                                </div>
                              )}
                            </div>
                          );
                        })}
                    </div>
                  </div>
                    )}
                </div>
                )}
      </div>
      {/* 마스터 통계 — 클릭하면 집중분석을 종료하고 그 대국의 마지막 포지션 + 기보를 연다 (chess.com 통계 아래에 표시) */}
      <div style={{ background: T.paper, border: "1px solid #DCCBA8", borderRadius: 12, padding: 13, marginTop: 12 }}>
        <div className="flex items-center justify-between" style={{ marginBottom: 8 }}>
          <div className="flex items-center gap-2"><span style={{ fontSize: 12.5, fontWeight: 800, color: T.ink }}>{t("마스터 통계")}</span>{masterGames.length > 0 && <span style={{ fontSize: 10.5, color: T.inkSoft }}>{tx("{0}판", filteredMasterGames.length)}</span>}
            {/* (v0.2.3 기능) 개발자 전용 — Lichess 마스터 DB에 없는 유명 대국을 직접 등록 */}
            {canAdd && <button onClick={() => setAddGameOpen(true)} className="press" title={t("마스터 대국 추가")} aria-label={t("마스터 대국 추가")} style={{ width: 20, height: 20, borderRadius: 6, border: "1px solid " + T.brass, background: "transparent", color: T.brass, cursor: "pointer", display: "inline-flex", alignItems: "center", justifyContent: "center", fontSize: 13, fontWeight: 900, lineHeight: 1, padding: 0 }}>+</button>}
          </div>
          {/* (버그 보충) 정렬 — 기본(채택률 순, API 원래 순서) / 최신순(연도) / 레이팅순(더 높은 쪽 레이팅) */}
          {masterGames.length > 1 && (
            <div className="inline-flex" style={{ borderRadius: 8, background: "rgba(0,0,0,.06)", padding: 2, gap: 2 }}>
              {[["default", t("기본")], ["recent", t("최신순")], ["rating", t("레이팅순")]].map(([k, label]) => (
                <button key={k} onClick={() => setMasterSort(k)} className="press" style={{ fontSize: 10.5, fontWeight: 800, padding: "3px 7px", borderRadius: 6, border: "none", cursor: "pointer", background: masterSort === k ? T.brass : "transparent", color: masterSort === k ? "#241509" : T.inkSoft }}>{label}</button>
              ))}
            </div>
          )}
        </div>
        {/* (기능) 마스터 이름 검색 — 백/흑 어느 쪽 이름에든 검색어가 포함된 대국만 남긴다.
            포커스 중이고 입력이 있으면 일치하는 선수 이름을 실시간으로 추천해 보여준다. */}
        {masterGames.length > 1 && (
          <div style={{ position: "relative", marginTop: 10, marginBottom: 10 }}>
            <input value={masterSearch} onChange={(e) => setMasterSearch(e.target.value)}
              onFocus={() => setMasterSearchFocused(true)} onBlur={() => setMasterSearchFocused(false)}
              placeholder={t("선수 이름으로 검색…")} style={{ width: "100%", boxSizing: "border-box", padding: "7px 10px", borderRadius: 8, border: "1px solid #C9B58C", background: "#fff", color: T.ink, fontSize: 12 }} />
            {masterSearchFocused && masterSuggestions.length > 0 && (
              <div style={{ position: "absolute", top: "100%", left: 0, right: 0, marginTop: 4, background: T.paper, border: "1px solid #C9B58C", borderRadius: 8, boxShadow: "0 10px 24px -8px rgba(0,0,0,.35)", zIndex: 5, overflow: "hidden" }}>
                {masterSuggestions.map((nm) => (
                  // onMouseDown(포커스 잃기 전에 먼저 발생)으로 골라야, input의 onBlur가 먼저 실행돼
                  // 추천 목록이 사라지면서 클릭이 무산되는 걸 막을 수 있다.
                  <div key={nm} onMouseDown={(e) => { e.preventDefault(); setMasterSearch(nm); }} className="press" style={{ padding: "7px 10px", fontSize: 12, color: T.ink, cursor: "pointer" }}>{nm}</div>
                ))}
              </div>
            )}
          </div>
        )}
        {loadingMasterGames ? <p style={{ fontSize: 12, color: T.inkSoft }}>{t("마스터 대국 검색 중…")}</p>
          : masterGamesError ? (
            <p style={{ fontSize: 12, color: T.inkSoft }}>{t("마스터 대국 로드 실패")}{" "}<button onClick={onRetryMasterGames} className="press" style={{ fontSize: 11.5, fontWeight: 800, padding: "2px 8px", borderRadius: 6, border: "1px solid " + T.brass, background: "transparent", color: T.brass, cursor: "pointer", marginLeft: 4 }}>{t("다시 시도")}</button></p>
          )
          : masterGames.length === 0 ? <p style={{ fontSize: 12, color: T.inkSoft }}>{t("일치하는 마스터 대국 없음")}</p>
          : filteredMasterGames.length === 0 ? <p style={{ fontSize: 12, color: T.inkSoft }}>"{tx("{0}\" 검색 결과 없음", masterSearch.trim())}</p>
            : (<>
            {masterPageItems.map((g) => (
              <div key={g.id} style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 2px", borderTop: "1px solid #E4D5B6", opacity: ((openingGameId && openingGameId !== g.id) || (reviewingGameId && reviewingGameId !== g.id)) ? 0.5 : 1 }}>
                <div style={{ minWidth: 0, flex: 1 }}>
                  <div className="flex items-center justify-between" style={{ fontSize: 12.5 }}>
                    <span>⬜ <b style={{ color: T.ink }}>{(g.white && g.white.name) || "?"}</b> <span style={{ color: T.inkSoft, fontFamily: SITE_FONT }}>{(g.white && g.white.rating) ?? "—"}</span> {g.winner === "white" && <span title={t("승리")}>👑</span>}</span>
                    <span style={{ fontWeight: 800, fontFamily: SITE_FONT, color: g.winner === "white" ? T.best : g.winner === "black" ? T.blunder : T.inkSoft }}>{g.winner === "white" ? "1–0" : g.winner === "black" ? "0–1" : "½–½"}</span>
                  </div>
                  <div style={{ fontSize: 12.5, marginTop: 2 }}>⬛ <b style={{ color: T.ink }}>{(g.black && g.black.name) || "?"}</b> <span style={{ color: T.inkSoft, fontFamily: SITE_FONT }}>{(g.black && g.black.rating) ?? "—"}</span> {g.winner === "black" && <span title={t("승리")}>👑</span>}</div>
                  <div style={{ fontSize: 10.5, color: T.inkSoft, marginTop: 2 }}>{g.year || ""}{openingGameId === g.id ? t(" · 기보를 불러오는 중…") : reviewingGameId === g.id ? t(" · 리뷰를 여는 중…") : ""}</div>
                </div>
                <div className="flex items-center gap-2" style={{ flexShrink: 0 }}>
                  {/* (18차 UX8) "보기" 버튼 — 전체 기보를 불러오되, 집중분석에서 보던 수부터 보드에 표기 */}
                  <button onClick={() => handleOpenGame(g.id)} disabled={!!openingGameId || !!reviewingGameId} aria-label={t("대국 보기")} title={t("대국 보기")} className="press" style={{ flexShrink: 0, width: 30, height: 30, borderRadius: 8, background: T.ebony2, color: T.brassHi, border: "1px solid #000", cursor: (openingGameId || reviewingGameId) ? "default" : "pointer", display: "inline-flex", alignItems: "center", justifyContent: "center" }}><Search size={13} /></button>
                  {/* (v0.2.1 기능) chess.com 통계와 동일한 초록 리뷰 버튼 — 이 마스터 대국을 곧바로 /review로 연다. */}
                  {onOpenMasterGameReview && <BestMoveJumpButton onClick={() => handleReviewGame(g)} disabled={!!openingGameId || !!reviewingGameId} />}
                </div>
              </div>
            ))}
            <ListPager page={masterPage} setPage={setMasterPage} pageCount={masterPageCount} />
            </>)}
        {gameOpenError && <p style={{ fontSize: 11.5, color: T.blunder, marginTop: 6 }}>{t("기보 로드 실패. 잠시 후 다시 시도")}</p>}
        {reviewOpenError && <p style={{ fontSize: 11.5, color: T.blunder, marginTop: 6 }}>{t("리뷰 열기 실패. 잠시 후 다시 시도")}</p>}
      </div>
        </>,
        nextMovesPanel,
      ]} />
      {addGameOpen && <AddMasterGameModal onClose={() => setAddGameOpen(false)} onSaved={onRetryMasterGames} />}
      {showExpl && (
        <div onClick={() => setShowExpl(false)} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.6)", zIndex: 90, display: "flex", alignItems: "center", justifyContent: "center", padding: 18 }}>
          <div onClick={(e) => e.stopPropagation()} style={{ maxWidth: 420, width: "100%", maxHeight: "80vh", overflowY: "auto", background: "linear-gradient(180deg,#F6EEDD,#E6D6B6)", borderRadius: 16, padding: 20, border: "1px solid #CDB98E", boxShadow: "0 24px 60px -12px rgba(0,0,0,.7)" }}>
            <div className="flex items-center justify-between" style={{ marginBottom: 10 }}>
              <div className="flex items-center gap-2"><BookOpen size={16} style={{ color: T.brass }} /><span style={{ fontSize: 14, fontWeight: 800, color: T.ink }}>{tx("{0}{1} 해설", moveNumber(ply), san)}</span></div>
              <button onClick={() => setShowExpl(false)} className="press" style={{ fontSize: 13, fontWeight: 800, color: T.inkSoft, background: "none", border: "none", cursor: "pointer" }}>✕</button>
            </div>
            <p style={{ fontSize: 13.5, color: T.ink, fontWeight: 600, lineHeight: 1.7, whiteSpace: "pre-wrap" }}>{explain}</p>
          </div>
        </div>
      )}
    </div>
  );
}
/* ============================================================ 분석 탭 ============================================================ */
function mascotFor(sans, san) {
  const n = snapNode([...sans, san]); const om = n && n.opening ? n.opening.name : null;
  if (om) return t("{0} 라인 진입. 보드에서 직접 두며 확인", (om));
  return t("{0} 보드에서 자유롭게 탐구", (moveNumber(sans.length) + san));
}
// (18차 기능4) 수 추천 블록의 "추천 이유"를 개발자 모드에서 직접 편집(비우면 자동 문구로 복귀).
function RecommendReasonEditor({ sentKey, bumpContent }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");
  useEffect(() => { setEditing(false); }, [sentKey]);
  const save = async () => {
    if (!CONTENT.recommends) CONTENT.recommends = {};
    const t = draft.trim();
    if (t) CONTENT.recommends[sentKey] = t; else delete CONTENT.recommends[sentKey];
    await bumpContent(); setEditing(false); setDraft("");
  };
  if (!editing) return <button onClick={() => { setDraft(recommendReasonFor(sentKey) || ""); setEditing(true); }} className="press" style={{ marginTop: 8, fontSize: 10.5, fontWeight: 700, padding: "3px 9px", borderRadius: 7, border: "1px solid " + T.brass, background: "transparent", color: "#8A6A18", cursor: "pointer" }}>{t("✎ 추천 이유 편집")}</button>;
  return (
    <div style={{ marginTop: 8 }}>
      <textarea value={draft} onChange={(e) => setDraft(e.target.value)} rows={2} placeholder={t("추천 이유 (비우면 자동)")} style={{ width: "100%", fontSize: 12, padding: 8, borderRadius: 8, border: "1px solid #C9B58C", background: "#fff", color: T.ink, boxSizing: "border-box" }} />
      <div className="flex gap-2" style={{ marginTop: 5 }}>
        <button onClick={save} className="press" style={{ fontSize: 11, fontWeight: 700, padding: "4px 11px", borderRadius: 7, border: "none", background: T.brass, color: "#241509", cursor: "pointer" }}>{t("저장")}</button>
        <button onClick={() => setEditing(false)} className="press" style={{ fontSize: 11, padding: "4px 11px", borderRadius: 7, border: "1px solid #C9B58C", background: "transparent", color: T.inkSoft, cursor: "pointer" }}>{t("취소")}</button>
      </div>
    </div>
  );
}
function BranchBanner({ sentKey, canEdit, canAdd, bumpContent }) {
  const reason = branchFor(sentKey);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");
  useEffect(() => { setEditing(false); }, [sentKey]);
  const save = async () => { if (!CONTENT.branches18) CONTENT.branches18 = {}; CONTENT.branches18[sentKey] = draft.trim() || t("주요 분기점"); await bumpContent(); setEditing(false); setDraft(""); };
  const remove = async () => { if (CONTENT.branches18) delete CONTENT.branches18[sentKey]; await bumpContent(); };
  if (!reason && !editing) {
    if (canEdit || canAdd) return <button onClick={() => { setDraft(""); setEditing(true); }} className="press" style={{ marginBottom: 12, fontSize: 11.5, fontWeight: 700, padding: "6px 12px", borderRadius: 9, border: "1px dashed " + T.brass, background: "transparent", color: T.brassHi, cursor: "pointer" }}>{t("+ 주요 분기점으로 지정")}</button>;
    return null;
  }
  if (editing) return (
    <div style={{ background: "linear-gradient(180deg,#3A2516,#241509)", borderRadius: 12, padding: 12, border: "1px solid " + T.brass, marginBottom: 12 }}>
      <textarea value={draft} onChange={(e) => setDraft(e.target.value)} rows={2} placeholder={t("분기점 설명")} style={{ width: "100%", fontSize: 12, padding: 8, borderRadius: 8, border: "1px solid #C9B58C", background: "#fff", color: T.ink, boxSizing: "border-box" }} />
      <div className="flex gap-2" style={{ marginTop: 6 }}><button onClick={save} className="press" style={{ fontSize: 11, fontWeight: 700, padding: "5px 12px", borderRadius: 7, border: "none", background: T.brass, color: "#241509", cursor: "pointer" }}>{t("저장")}</button><button onClick={() => setEditing(false)} className="press" style={{ fontSize: 11, padding: "5px 12px", borderRadius: 7, border: "1px solid #C9B58C", background: "transparent", color: T.ivory, cursor: "pointer" }}>{t("취소")}</button></div>
    </div>
  );
  return (
    <div style={{ background: "linear-gradient(180deg,#3A2516,#241509)", borderRadius: 12, padding: "11px 14px", border: "1px solid " + T.brass, marginBottom: 12 }}>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2" style={{ color: T.brassHi, fontSize: 13, fontWeight: 800 }}>{tx("{0} 주요 분기점", <Sparkles size={15} />)}</div>
        {canEdit && <div className="flex gap-2"><button onClick={() => { setDraft(reason); setEditing(true); }} className="press" style={{ fontSize: 10.5, padding: "2px 7px", borderRadius: 6, border: "1px solid " + T.brass, background: "transparent", color: T.brassHi, cursor: "pointer" }}>{t("편집")}</button><button onClick={remove} className="press" style={{ fontSize: 10.5, padding: "2px 7px", borderRadius: 6, border: "1px solid " + T.blunder, background: "transparent", color: T.blunder, cursor: "pointer" }}>{t("해제")}</button></div>}
      </div>
      <p style={{ color: T.ivory, fontSize: 12.5, marginTop: 5, lineHeight: 1.55 }}>{reason}</p>
    </div>
  );
}
// (v0.2.3 성능) 이 depth(13)에서 사실상 항상 여유 있게 끝나는 movetime 안전망(analyzeGame의 movetime과
// 같은 종류일 뿐 정확도 손실이 아니다). 분석 탭(evalMoveKind)·리뷰 페이지(자유 탐색 판정) 양쪽이 같은
// 값을 공유해야 같은 위치·같은 수에 항상 같은 등급이 나온다 — 모듈 스코프 상수로 둔다.
const MOVETIME_MS = 260;
export function LearnTab({ engine, liveOn, onFocusActive, unlockOpening, chesscom, contentVer, canEdit, canAdd, bumpContent, sans, setSans, future, setFuture, extra, setExtra, focus, setFocus, puzzles, onOpenPuzzle, onOpenPuzzleWizard, onOpenReview, onOpenPlay, dailyQuest, uid, user, noteCap, onQuestBadgeClick, fenSeed, onConsumeFenSeed }) {
  // (20차 UI4) 오늘의 일일 퀘스트(오프닝 플레이)에 해당하는 오프닝 이름 집합 — 수 블록 배지 판정용.
  // (20차 UI4) 부분 일치로 비교 — 퀘스트는 "London System" 같은 간단한 이름을 쓰지만 실제 트리의 오프닝
  // 이름은 "Queen's Pawn Game: Accelerated London System"처럼 더 세부적일 수 있어, 정확히 같지 않아도
  // 한쪽이 다른 쪽을 포함하면 같은 오프닝으로 간주한다.
  const questOpeningNames = useMemo(() => (dailyQuest && dailyQuest.quests || []).filter((q) => q.type === "opening").map((q) => q.opening).filter(Boolean), [dailyQuest]);
  // (버그) 배지가 해당 오프닝을 "완성하는" 마지막 수 블록에만 표시돼, 그 오프닝으로 가는 상위 수순
  // (예: Italian Game이 목표면 1.e4, 1...e5, 2.Nf3, 2...Nc6)에는 표시되지 않았다. 오프닝의 전체 수순
  // 경로를 미리 구해두고, 지금 두려는 수가 그 경로의 접두사(prefix)이기만 하면(= 그 방향으로 가는
  // 수라면) 배지를 표시한다.
  const questPaths = useMemo(() => questOpeningNames.map((name) => ({ name, path: findOpeningPathByFuzzyName(name) })).filter((x) => x.path), [questOpeningNames]);
  const matchesQuestPath = (path) => questPaths.some((qp) => qp.path.length >= path.length && path.every((s, i) => qp.path[i] === s));
  // (UI) 사용자 요청 — 퀘스트 배지를 눌렀을 때 학습 탭에서 정확히 어느 퀘스트를 가리키는지 알 수
  // 있도록, 매칭된 퀘스트의 오프닝 이름까지 함께 돌려준다.
  const matchedQuestOpeningName = (path) => { const hit = questPaths.find((qp) => qp.path.length >= path.length && path.every((s, i) => qp.path[i] === s)); return hit ? hit.name : null; };
  const [flip, setFlip] = useState(false);
  // (디자인) 분석 탭 메인 보드를 조금 더 키운다.
  // (사용자 요청) 보드 컨테이너의 CSS 상한(360px, 데스크톱 2단 레이아웃에서만 유지)을 모바일에서는
  // 풀어 카드 폭 그대로 커지게 했으므로, 이 훅 내부 상한도 그만큼 넉넉히 올려 실제 측정된 폭을
  // 다시 400px로 잘라버리지 않도록 한다 — 데스크톱은 여전히 CSS lg:max-w-360가 먼저 재는
  // 폭 자체를 360 근처로 묶어 두므로 이 값이 커져도 영향이 없다.
  // (사용자 요청) 분석 탭 보드를 조금 더 키운다 — 틀 여유값을 42→24로 줄이고(실제 틀 22px) 데스크톱 상한도 360→400px로.
  const [boardSize, boardRef] = useBoardSize(720, 24);
  const [sel, setSel] = useState(null);
  const [drag, setDrag] = useState(null);
  const [promoPrompt, setPromoPrompt] = useState(null);   // (기능5) 프로모션 선택 대기 {from,to}
  // (v0.5.1 UI, 사용자 요청) 승격 선택 오버레이를 실제 8x8 그리드 안으로 포털하기 위한 참조.
  const [promoGridEl, setPromoGridEl] = useState(null);
  const [lastMascot, setLastMascot] = useState(EXPLAIN[""]);
  const [lastQ, setLastQ] = useState(null);
  // (v0.2.2 버그 수정) 다음 수 블록(assignTiers)에 표시된 수 체계 아이콘과, 그 수를 실제로 뒀을 때
  // 보드 도착칸·현재 수 블록에 뜨는 아이콘이 서로 달랐다 — 후자는 아래 재평가 effect가 evalMoveKind
  // (형제 수 대신 새 depth 검색으로 판정하고, decided 완화·언더프로모션→탁월·'유일한 수' 미생성 등
  // assignTiers와 다른 규칙을 쓰는 별개 알고리즘)로 매번 다시 계산해 덮어써서 어긋났다. 블록에 실제로
  // 떠 있던 각 수의 확정 등급을 "이 위치 key + 수"로 pin해 두고, 그 수로 도달했을 때(클릭·드래그·엔진
  // 라인·앞으로/되돌리기) 블록과 정확히 같은 아이콘을 쓰게 한다.
  const pinnedKindRef = useRef({});
  // (v0.2.6 버그 수정) 다음 수 블록(MoveTile)에 뜬 수 키워드(TOP LEVEL/SIDESTEPPING 등)를 그 수를
  // 실제로 두면 현재 수 블록이 다시 계산해 다른 결과를 보여주는 문제 — MoveTile은 useMergedMoves가
  // 만든 "지금 포지션의 다음 수" 객체(마스터/Lichess 채택률이 이미 채워져 있음)로 deriveKeywords를
  // 부르는데, 현재 수 블록은 그 수를 둔 뒤 한 칸 전 포지션을 snapNode(정적 북 데이터, 채택률 필드
  // 없음)로 다시 조회해 같은 함수를 불러 전혀 다른 입력으로 다른 결과를 냈다. 위 pinnedKindRef와
  // 똑같은 패턴으로, 블록에 실제로 떴던 키워드 배열(순서까지)을 "이 위치 key + 수"로 pin해 두고
  // 현재 수 블록은 그 값을 그대로 재사용한다.
  const pinnedKwRef = useRef({});
  const [showAllNb, setShowAllNb] = useState(false);   // (UX1) 비이론 수 더보기(전체)
  // (사용자 요청) FEN 모드 — 분석 탭 메인 보드에 FEN을 붙여넣으면 표준 시작 위치 대신 그 포지션(차례·
  // 캐슬링 권리·앙파상까지)에서부터 이어서 둘 수 있다. fenRoot가 있는 동안 sans는 "표준 시작 위치부터의
  // 수순"이 아니라 "이 FEN부터 둔 수순"을 의미하도록 재해석된다 — 표준 시작을 가정하는 공용
  // replaySans/boardFromSans(모듈 전역 캐시)는 건드리지 않고, 이 컴포넌트 안에서만 로컬로 재생한다.
  const [fenRoot, setFenRoot] = useState(null);
  const [fenCopied, setFenCopied] = useState(null); // "fen" | "pgn" | null — 복사 버튼 체크 표시용
  const key = sans.join(" ");
  const stdBoard = useMemo(() => boardFromSans(sans), [key]);
  const fenReplay = useMemo(() => (fenRoot ? replayFromFen(fenRoot, sans) : null), [key, fenRoot]);
  const board = fenRoot ? fenReplay.board : stdBoard;
  const color = fenRoot ? (plyIsWhite(sans.length, fenRoot.turn) ? "w" : "b") : (sans.length % 2 === 0 ? "w" : "b");
  const ply = sans.length;
  // (v0.5.7, 사용자 요청) 수 번호 표기의 시작 색 — FEN이 흑 차례면 "b"라 첫 수가 1...부터(백·흑 구분). 이 화면의 모든 moveNumber·기보·엔진 라인에 넘긴다.
  const startColor = fenRoot ? fenRoot.turn : undefined;
  const stdEp = useMemo(() => epTarget(sans), [key]);
  const ep = fenRoot ? fenReplay.ep : stdEp;
  // (UI) 사용자 요청 — 둘 수 있는 수가 1~2개뿐인 국면(사실상 강제된 수순)에서는 엔진 라인의 남은
  // 줄과 평가치 박스를 표시하지 않는다.
  const legalMoveCount = useMemo(() => countLegalMoves(board, color, ep), [board, color, ep]);
  const forcedPosition = legalMoveCount > 0 && legalMoveCount <= 2;
  const onLoadFen = (root) => { setFocus(null); setFocusStack([]); setFenRoot(root); setSans([]); setFuture([]); setSel(null); setLastQ(null); };
  const exitFenMode = () => { setFenRoot(null); setSans([]); setFuture([]); setSel(null); setLastQ(null); };
  // (v0.4.9 기능, 사용자 요청) FEN 기반 퍼즐 풀이 카드에서 FEN 코드를 눌러 학습 탭으로 넘어오면, 그
  // FEN 포지션을 곧바로 NotationTools의 FEN 붙여넣기·보드 편집기 완료와 똑같은 계약(onLoadFen)으로
  // 불러온다 — App.jsx가 top-level learnFenSeed를 이 prop으로 흘려보내고, 한 번 소비한 뒤에는
  // onConsumeFenSeed로 비워 재마운트·재렌더에서 같은 시드가 중복 적용되지 않게 한다.
  useEffect(() => {
    if (fenSeed) { onLoadFen(fenSeed); onConsumeFenSeed && onConsumeFenSeed(); }
  }, [fenSeed]);
  // (v0.3.5 기능) 사용자 요청 — 보드 편집기(BoardEditorModal) 열림 상태. 완료를 누르면 onLoadFen과
  // 같은 계약으로 그 포지션의 FEN 모드로 들어간다(NotationTools의 FEN 붙여넣기와 동일한 경로).
  const [editorOpen, setEditorOpen] = useState(false);
  // (v0.4.8 기능) FEN 모드 리뷰 — v0.3.5에서 "표준 시작 위치만 전제하는 채점 로직" 때문에 막아
  // 두었던 것을 되돌린다. ReviewPage는 이미 v0.3.4~v0.3.5에 걸쳐 game.fenRoot를 받아 legalDests
  // (fenLegalDests)·gameEndState·평가·코치 카드까지 전부 그 위치 기준으로 정확히 계산하도록 완성돼
  // 있었다(9691행 이하 참고) — 다만 이 진입점(리뷰 버튼)만 여전히 막힌 채 남아 있어 실제로는 완성된
  // 기능을 쓸 수 없었다.
  // (v0.2.3 기능 → v0.3.5) 스테일메이트·3회 동형 반복 판정 — 체크메이트는 legalDests가 이미 자연히
  // 더 이상의 수를 막으므로 별도 처리가 필요 없지만, 3회 동형 반복은 규칙상 여전히 "합법적으로 둘 수
  // 있는" 수가 남아 있어 게이팅이 없으면 계속 둘 수 있었다. drawState.end가 stalemate/threefold면 더
  // 이상 수를 둘 수 없게 하고 보드 하단에 무승부를 표시한다. gameEndState가 fenRoot를 받도록 고쳐져
  // (예전엔 "범위 밖"으로 미룬 항목) FEN 모드에서도 이제 정확히 판정한다 — sans는 이미 "이 FEN부터
  // 둔 수순"이라 gameEndState(sans, fenRoot)에 그대로 넘기면 된다.
  const drawState = useMemo(() => gameEndState(sans, fenRoot), [key, fenRoot]);
  const gameDrawn = drawState.end === "stalemate" || drawState.end === "threefold";
  const [mode, setMode] = useState("normal");
  const [sortBy, setSortBy] = useState("eval");   // 비이론 수 정렬 기준: "eval"(평가치순) | "adopt"(채택률순)
  // (버그) 분석 모달이 열려 있는 동안엔 분석 탭의 실시간 평가를 멈춰 엔진을 분석에 양보한다(분석 멈춤/지연 방지).
  // (사용자 요청) FEN 모드에서는 sans가 표준 시작 위치 기준이 아니므로, 이 훅이 내부적으로 만드는 FEN·
  // 후보 수 조회가 전부 엉뚱한 포지션을 가리킨다 — liveOn을 꺼서 실시간 엔진 평가(와 그 계산 비용)만
  // 막는다(book 조회 자체는 애초에 이 위치가 스냅샷에 없어 자연히 빈 배열을 돌려준다).
  // (사용자 요청, 버그 수정) useMergedMoves는 sans 배열의 내용만으로 정적 스냅샷(snapNode)을 조회한다
  // — FEN 모드에서도 sans는 "이 FEN부터 둔 수순"일 뿐 그 배열 자체는(특히 아직 한 수도 안 뒀을 때는
  // 완전히 같은 []) 표준 시작 위치의 책 데이터와 구분되지 않아, 전혀 무관한 위치의 이론 추천·엔진
  // 평가·엔진 라인이 그대로 노출됐다(실제로 붙여넣은 엔드게임 FEN에 "1.e4 King's Pawn Game" 추천이
  // 뜨는 것으로 확인). liveOn만 꺼서는 이 정적 스냅샷 자체를 막지 못하므로, FEN 모드에서는 결과를
  // 아예 중립값으로 덮어써 이 위치와 무관한 데이터가 화면에 노출되지 않게 한다.
  const mergedMoves = useMergedMoves(sans, engine, liveOn && !fenRoot, extra[key], contentVer, mode, sortBy);
  // (v0.3.5 기능) 사용자 요청 — FEN 모드에서도 평가치 바와 엔진 상위 줄은 작동해야 한다(위 이론 수·
  // 마스터 통계 등 "책" 데이터만 이 위치와 무관해 계속 중립값이다). useMergedMoves 내부는 이론 수
  // 보충 로직과 실시간 평가가 한 effect 안에 뒤엉켜 있어(sansToFen·boardFromSans·MultiPV 후보 수
  // 보충이 전부 표준 시작 위치를 전제) 그 훅 자체를 fenRoot 인식하게 고치는 건 위험이 크다 — 대신
  // ReviewPage의 엔진 라인 effect(fenOfRoot·colorOfRoot·pvUciToSans(...,fenRoot) 패턴, 이미 FEN 인식)를
  // 그대로 옮겨온, 훨씬 단순한 별도 effect로 posEval·engineLines·curDepth만 채운다.
  // (v0.5.1 기능, 사용자 요청 → 버그 수정) FEN 모드에서도 "다음 수" 블록을 보여준다 — 다만 이 위치는
  // 이론 DB에 없으므로(book/adopt/games 같은 크라우드소싱 데이터 자체가 존재하지 않는다) 실제 후보
  // 수는 이미 같은 요청으로 받아 둔 엔진 MultiPV 결과(위 engineLines가 쓰는 것과 같은 raw 배열,
  // multipv 5)에서 그대로 뽑는다.
  // (버그 수정, 사용자 제보) 처음엔 "순위 1위는 최선의 수(best), 나머지는 전부 좋은 수(good)"로만
  // 단순하게 표시했는데, 이러면 실제 손실(loss)이나 희생 여부를 전혀 안 보므로 등급이 자주 틀렸다 —
  // 1위가 아니어도 손실이 미미하면 최선급인데 "좋은 수"로만 뜨고, 반대로 진짜 희생 기반의 "탁월한
  // 수"는 애초에 이 로직에 그 범주 자체가 없어 절대 뜰 수 없었다. classifyMoveKindDetailed(다른 세
  // 호출부가 쓰는 표준 채점 로직)와 같은 규칙(tierOf(loss) → 희생 보정 → 결정난 승부 완화 → 언더
  // 프로모션 보정)을 그대로 적용하되, 그 함수처럼 각 후보 수마다 별도로 engine.evaluate를 두 번씩
  // 더 부르지 않는다 — 이미 받아 둔 이 MultiPV 배치 자체가 "이 위치에서 그 수를 뒀을 때"의 평가를
  // 전부 담고 있으므로(raw[i].cp는 UCI 관례상 전부 "지금 둘 차례" 관점으로 서로 비교 가능한 같은
  // 척도다), loss = raw[0]의 cp(mate면 ±1e5) − raw[i]의 cp로 바로 계산할 수 있다.
  const [fenMoves, setFenMoves] = useState([]);
  const [fenEval, setFenEval] = useState({ posEval: null, engineLines: [], linesPending: false, curDepth: null });
  useEffect(() => {
    if (!fenRoot || !liveOn || engine.status !== "ready") { setFenEval({ posEval: null, engineLines: [], linesPending: false, curDepth: null }); setFenMoves([]); return; }
    let cancelled = false;
    const fen = fenOfRoot(fenRoot, sans);
    const baseWhite = colorOfRoot(fenRoot, sans.length) === "w" ? 1 : -1;
    setFenEval({ posEval: null, engineLines: [], linesPending: true, curDepth: null });
    const mkEv = (ev) => ev.mate != null
      ? { mate: ev.mate * baseWhite, win: (ev.mate > 0) === (baseWhite === 1) ? "w" : "b", plies: matePliesOf(ev.mate) }
      : { cp: ev.cp * baseWhite };
    const toLines = (raw) => dedupeEngineLines((raw || []).filter((pv) => pv && pv.pv && pv.pv.length).map((pv) => ({ ev: mkEv(pv), sans: pvUciToSans(sans, pv.pv, 15, fenRoot) }))).slice(0, 3);
    // 엔진 라인과 같은 raw MultiPV 결과에서 각 줄의 첫 수만 뽑아 "다음 수" 블록 형태(MoveTile이
    // 기대하는 필드)로 바꾼다 — book/adopt/games는 이 위치엔 존재하지 않는 데이터라 그대로 없앤다.
    const board = boardOfRoot(fenRoot, sans);
    const col = colorOfRoot(fenRoot, sans.length);
    const cpOf = (pv) => pv.mate != null ? (pv.mate > 0 ? 1e5 : -1e5) : pv.cp;
    const toMoveTiles = (raw) => {
      const seen = new Set(); const out = [];
      const bestCp = raw && raw[0] ? cpOf(raw[0]) : null;
      (raw || []).forEach((pv, i) => {
        if (!pv || !pv.pv || !pv.pv.length) return;
        const san = pvUciToSans(sans, pv.pv, 1, fenRoot)[0];
        if (!san || seen.has(san)) return;
        seen.add(san);
        const e = mkEv(pv);
        let kind = "good";
        if (bestCp != null) {
          const thisCp = cpOf(pv);
          const matched = i === 0;
          const loss = matched ? 0 : bestCp - thisCp;
          // (v0.5.9 BUG-037) 규칙은 gradeMoveKind 하나로 — 1순위 줄은 2순위 줄과의 차이로 유일한 수도 가린다(예전엔 FEN 모드에 유일한 수 규칙 자체가 없었다).
          const second = raw.find((q, j) => j > 0 && q && q.pv && q.pv.length);
          kind = gradeMoveKind({
            loss, matched, bestCp, playedCp: thisCp, secondCp: matched && second ? cpOf(second) : undefined,   // 2순위 줄이 아직 없으면(스트리밍 중) 모름
            isSac: sacCheckSync(fenRoot, sans, san, col, board), priorSac: ownPriorMoveWasSacrifice(sans, col, fenRoot),   // 엔진 확인된 희생만(v0.5.9 BUG-038)
            singleRecapture: singleRecaptureCheck(sans, san, col, fenRoot), san,
          });
        }
        out.push({ san, kind, evalCp: e.cp != null ? e.cp : null, mate: e.mate != null ? e.mate : null, adopt: null, games: null, book: false });
      });
      return out;
    };
    // (버그 수정) 분석 풀(getAnalysisPool)이 돌려주는 워커 래퍼의 evaluateMulti는 공용 엔진(engine)과
    // 인자 개수가 다르다 — onProgress 없이 (fen,d,multipv,mt,onLines,slot) 6개뿐이다(callEvaluateMulti
    // 주석 참고). 순위 1위 줄(top)의 평가·depth를 posEval·curDepth로도 함께 쓴다.
    // (v0.5.9 BUG-038) 희생 엔진 확인이 끝나면 마지막 후보 줄로 등급을 다시 매긴다(sacCheckSync는 확인 전엔 탁월로 치지 않는다).
    let lastRaw = null;
    const onSacConfirmed = () => { if (!cancelled && lastRaw) { const mt = toMoveTiles(lastRaw); if (mt.length) setFenMoves(mt); } };
    sacConfirmListeners.add(onSacConfirmed);
    const onLines = (raw) => {
      if (cancelled || !raw || !raw.length) return;
      lastRaw = raw;
      const l = toLines(raw);
      const top = raw[0];
      setFenEval((prev) => ({
        ...prev,
        engineLines: l.length ? l : prev.engineLines,
        posEval: (top && (top.cp != null || top.mate != null)) ? mkEv(top) : prev.posEval,
        curDepth: (top && top.depth != null && (prev.curDepth == null || top.depth > prev.curDepth)) ? top.depth : prev.curDepth,
      }));
      const mt = toMoveTiles(raw);
      if (mt.length) setFenMoves(mt);
    };
    (async () => {
      try {
        // (버그 수정) 분석 탭의 기본 후보 수 패널(useMergedMoves)이 표준 시작 위치용 "learn-lines" 작업을
        // 공용 엔진(engine, 워커 하나짜리 단일 FIFO 큐) 위에서 이미 돌리고 있을 수 있다 — 같은 engine
        // 객체에 바로 요청하면 그 작업(최대 20초짜리 심화 탐색 단계 포함) 뒤에 줄을 서게 되어 FEN 모드
        // 평가가 한참 늦게 뜬다. 게임 리뷰 엔진 라인과 동일하게 독립된 풀에서 전용 워커를 받아 쓴다.
        // (v0.6.2 BUG-054) 풀 부팅을 끝까지 기다리지 않는다 — 신경망이 큰 프로필(모바일)은 워커 여러 개를 차례로 부팅하느라 수십 초가 걸려,
        // 그동안 FEN 모드의 평가치(0.00)·엔진 라인·후보 수가 통째로 비어 보였다. 2.5초 안에 풀이 안 뜨면 이미 떠 있는 공용 엔진으로 바로 시작한다.
        const pool = await Promise.race([getAnalysisPool(engine.profile, engine.urls), new Promise((r) => setTimeout(() => r(null), 2500))]);
        if (cancelled) return;
        const w = poolWorker(pool, 0, engine);
        const pvsAll = await w.evaluateMulti(fen, MAX_SEARCH_DEPTH, 5, 700, onLines, "learn-fen-lines");
        if (cancelled) return;
        onLines(pvsAll);
        setFenEval((prev) => ({ ...prev, linesPending: false }));
        const deep = await w.evaluateMulti(fen, MAX_SEARCH_DEPTH, 5, 5000, onLines, "learn-fen-lines");
        if (cancelled) return;
        onLines(deep);
      } catch { if (!cancelled) setFenEval((prev) => ({ ...prev, linesPending: false })); }
    })();
    return () => { cancelled = true; sacConfirmListeners.delete(onSacConfirmed); };
  }, [fenRoot, key, liveOn, engine.status, engine.profile]);
  const { moves, posGames, statsLoading, engineNote, posEval, engineLines, linesPending, curDepth } = fenRoot
    ? { moves: fenMoves, posGames: null, statsLoading: false, engineNote: null, ...fenEval }
    : mergedMoves;
  // (v0.2.2) 후보 블록에 지금 떠 있는 각 수의 확정 등급(pending 제외)을 pin — 아래 마지막 수 재평가
  // effect가 이 값을 그대로 재사용해 블록과 보드·현재 수 블록의 수 체계 아이콘을 일치시킨다. 등급은
  // 엔진 depth가 깊어지며 갱신되므로, 매 변경마다 최신값으로 덮어써 두면 그 수를 두는 시점의 표시가
  // 그대로 pin된다.
  useEffect(() => {
    moves.forEach((m) => {
      if (m.kind && m.kind !== "pending") pinnedKindRef.current[key + "|" + stripSuffix(m.san)] = m.kind;
      // MoveTile과 완전히 동일한 식으로 계산해(순서·종류까지) pin — 아래 curKws가 그대로 재사용한다.
      pinnedKwRef.current[key + "|" + stripSuffix(m.san)] = m.book ? deriveKeywords(m) : (Array.isArray(m.kw) ? m.kw : []);
    });
  }, [key, moves]);
  // (20차 UX4) 스크롤이 많이 내려간 상태(예: 깊은 수 블록 클릭)에서 집중 분석에 들어가면, 페이지
  // 스크롤 위치가 그대로 유지되어 미니 보드가 화면 아래로 밀려 하단 탭에 가려 보이는 문제가 있었다 —
  // 진입 시 맨 위로 스크롤해 보드가 항상 하단 탭 위쪽 여유 공간 안에서 시작하도록 한다.
  useEffect(() => {
    onFocusActive && onFocusActive(!!focus);
    if (!focus) return;
    window.scrollTo({ top: 0, behavior: "auto" });
    if (boardRef.current) boardRef.current.scrollIntoView({ block: "nearest", behavior: "auto" });
  }, [focus]);
  useEffect(() => { setShowAllNb(false); }, [key]);   // (UX1) 위치가 바뀌면 더보기 접기
  // (기능2) 퍼즐 자동 생성은 사용자가 "분석" 버튼을 눌러 FocusMode에 실제로 진입했을 때만 일어난다.
  // 예전엔 이 트리 탐색 화면을 그냥 넘겨보기만 해도(분석 버튼을 누르지 않아도) moves 배열이
  // 갱신될 때마다 여기서도 똑같이 퍼즐을 만들었는데, 이때의 kind는 엔진이 아직 얕은 깊이로만
  // 평가한 상태라 이론 수가 실수로 오분류되거나, 포지션 전환 중간의 불안정한 상태를 그대로
  // 저장해 버리는 등 오생성 버그의 근원이었다. FocusMode(아래 onSavePuzzle 호출부)만으로 충분하다.

  // (v0.2.2 기능/버그 수정) 제안 화살표를 이론 수로만 한정하지 않고 지금 보이는 모든 후보 수로 넓히되,
  // 화면이 복잡해지지 않도록 지금 선택된 정렬 기준(평가치순/채택률순)으로 상위 3수만 화살표로 보여준다.
  // 예전엔 두께·투명도가 "평가치순"을 선택해도 항상 채택률(adopt) 기준으로만 계산돼, 정렬 기준을
  // 바꿔도 화살표 시각화가 전혀 달라지지 않는 버그도 함께 고친다 — Board는 weight(0~1, 이미 정규화된
  // 값)를 그대로 두께·투명도에 쓰므로, sortBy에 맞춰 서로 다른 순위·값을 계산해 넘긴다.
  // (v0.5.7, 사용자 요청 "FEN 모드에서도 제안 화살표") FEN 모드의 후보 수(fenMoves)는 전용 엔진 줄에서 만든 것이라 live·채택률이 없다 —
  // 예전엔 "live 없는 수는 제외"·"채택률 없는 수는 제외" 규칙에 전부 걸러져 화살표가 하나도 안 나왔다. FEN 모드에선 그 두 규칙을 빼고
  // 평가치로만 순위를 매긴다. 또 moverEval의 ply 짝수=백 가정은 흑 차례 FEN에서 부호가 뒤집히므로, 실제 둘 차례(color)로 넘긴다.
  const arrows = useMemo(() => {
    const liveActive = liveOn && engine && engine.status === "ready";
    const moverPly = color === "w" ? 0 : 1;
    const byAdopt = sortBy === "adopt" && !fenRoot;
    const rankKey = byAdopt
      ? (m) => (m.adopt != null ? m.adopt : (m.games != null ? m.games : -Infinity))
      : (m) => { if (liveActive && !fenRoot && !m.live) return -Infinity; const v = moverEval(m, moverPly); return v == null ? -Infinity : v; };
    const ranked = moves.filter((m) => rankKey(m) > -Infinity).sort((a, b) => rankKey(b) - rankKey(a)).slice(0, 3);
    if (!ranked.length) return [];
    if (byAdopt) {
      return ranked.map((m) => { const info = sanSrc(board, m.san, color); return info && info.from ? { from: info.from, to: info.to, weight: Math.min(1, Math.max(0, (m.adopt || 0) / 60)) } : null; }).filter(Boolean);
    }
    // sortBy === "eval" — 상위 3수 중 최선(가장 높은 moverEval) 대비 손실이 클수록 화살표를 얇고
    // 옅게 만든다(200cp 이상 차이 나면 최소값으로 고정).
    const evs = ranked.map((m) => moverEval(m, moverPly));
    const best = Math.max(...evs.filter((v) => v != null));
    return ranked.map((m, i) => {
      const info = sanSrc(board, m.san, color); if (!info || !info.from) return null;
      const v = evs[i];
      const weight = v != null ? Math.max(0, 1 - (best - v) / 200) : 0.3;
      return { from: info.from, to: info.to, weight };
    }).filter(Boolean);
  }, [moves, board, color, sortBy, fenRoot, liveOn, engine && engine.status]);
  // (사용자 요청) FEN 모드에서는 legalDests의 캐슬링 판정(기물 배치만 봄)을 그대로 쓰지 않고,
  // FEN에서 유래한 캐슬링 권리로 한 번 더 걸러낸다(fenLegalDests).
  const legalTargets = useMemo(() => {
    if (!sel) return [];
    return fenRoot ? fenLegalDests(sel[0], sel[1], color, board, fenReplay.rights, ep) : liveLegalDests(sans, sel[0], sel[1], color, board, ep);
  }, [sel, board, color, ep, fenRoot, fenReplay]);

  // 수를 두면 항상 도착 칸에 수 체계 아이콘을 띄운다(블록에 없거나 아직 미평가면 우선 '분석 중', 엔진으로 갱신)
  // (UX2) onKind가 주어지면 "이 수 이후" 평가가 depth를 높여가며 갱신될 때마다 그 시점 기준의 등급을
  // 다시 계산해 즉시 보고한다 — 보드 위 수 아이콘도 다른 곳과 동일하게 점진적으로 정확해진다.
  // (v0.2.0 성능) 예전엔 "두기 전"(best) 포지션을 먼저 평가한 뒤에야 "둔 뒤"(after) 포지션을
  // 평가했다 — 둘은 서로 다른 독립된 포지션이라(after는 best의 결과를 알 필요가 없다) 순서를 지킬
  // 이유가 없었는데도 메인 엔진의 단일 큐로 순차 처리돼 총 대기 시간이 두 배로 들었다. 세션 내내
  // 재사용되는 공용 풀(getAnalysisPool)에서 워커 두 개를 받아 완전히 병렬로 평가한다 — depth(13)는
  // 그대로 두고, MOVETIME_MS(모듈 상수)만 더해 벽시계 시간을 절반 가까이 줄인다.
  const evalMoveKind = useCallback(async (prevSans, san, onKind, fenRootParam) => {
    if (!liveOn || engine.status !== "ready") return null;
    const pool = await getAnalysisPool(engine.profile, engine.urls);
    const wBest = pool[0] || engine, wAfter = pool[1] || engine;
    const col = plyIsWhite(prevSans.length, fenRootParam ? fenRootParam.turn : "w") ? "w" : "b";
    let bestCp = null, matched = null, secondCp;
    // 규칙은 gradeMoveKind 하나로(v0.5.9 BUG-037) — 승부가 기울었는지는 두기 전(bestCp) 기준이라 팽팽하던 위치를 스스로
    // 무너뜨린 블런더가 실수로 격하되지 않는다. (v0.5.9 BUG-038) 진행 중 갱신(partial)은 이미 끝난 엔진 확인 결과만 쓰고(아직 없으면
    // 탁월 아님), 최종 채점만 엔진 확인을 기다린다.
    const kindArgs = (after) => {
      const afterOpp = after.mate != null ? (after.mate > 0 ? 1e5 : -1e5) : after.cp; // 상대 관점
      const ourCp = -afterOpp;
      return {
        loss: matched ? 0 : bestCp - ourCp, matched, bestCp, playedCp: ourCp, secondCp,
        priorSac: ownPriorMoveWasSacrifice(prevSans, col, fenRootParam),
        singleRecapture: singleRecaptureCheck(prevSans, san, col, fenRootParam), san,
      };
    };
    const computeKind = (after) => gradeMoveKind({ ...kindArgs(after), isSac: () => isSacrifice(boardOfRoot(fenRootParam, prevSans), san, col) && sacVerdict(fenRootParam, prevSans, san) === true });
    // (20차) '최선의 수'는 엔진 1순위 수와 일치할 때만 — depth 노이즈로 차선 수에 별이 붙던 문제 수정.
    // (v0.5.9 BUG-037) 유일한 수를 가리려면 2순위 평가가 필요해 MultiPV 2로 평가한다 — 예전엔 1순위만 봐서 분석 탭에서 직접 둔 수에는
    // 유일한 수가 절대 뜨지 않았다.
    const cpOf = (x) => (x.mate != null ? (x.mate > 0 ? 1e5 : -1e5) : x.cp);
    const bestPromise = callEvaluateMulti(wBest, fenOfRoot(fenRootParam, prevSans), 13, 2, MOVETIME_MS).then((pvs) => {
      const best = pvs && pvs[0];
      if (!best) return null;
      bestCp = cpOf(best);     // 둘 차례(=우리) 관점 최선
      secondCp = pvs[1] ? cpOf(pvs[1]) : null;
      const bestSan = best.uci ? uciToSan(boardOfRoot(fenRootParam, prevSans), best.uci, col) : null;
      matched = !!bestSan && stripSuffix(bestSan) === stripSuffix(san);
      return best;
    });
    // (성능) 진행 중 갱신(onKind)은 best가 아직 안 끝났으면 bestCp를 몰라 등급을 못 매기므로,
    // best가 끝날 때까지만 기다렸다가 적용한다 — 병렬로 시작해도 최종 확정 시점은 그대로다.
    const afterPromise = wAfter.evaluate(fenOfRoot(fenRootParam, [...prevSans, san]), 13, onKind ? async (partial) => { await bestPromise; if (bestCp != null) onKind(computeKind(partial)); } : undefined, MOVETIME_MS);
    const [best, after] = await Promise.all([bestPromise, afterPromise]);
    if (!best || !after) return null;
    return gradeMoveKindConfirmed(kindArgs(after), { fenRoot: fenRootParam, prevSans, san, color: col, evaluate: (fen) => wAfter.evaluate(fen, 13, undefined, MOVETIME_MS) });
  }, [liveOn, engine.status, engine.profile, engine.urls]);

  const stampQ = useCallback((prevSans, brd, col, san, mm) => {
    const src = sanSrc(brd, san, col); const to = src && src.to ? src.to : null;
    if (!to) { setLastQ(null); return; }
    const known = !!mm && mm.kind && mm.kind !== "pending";
    // (v0.2.2) 블록에서 고른 수의 등급을 즉시 pin — 위 기록 effect가 아직 안 돈 타이밍(방금 확정된
    // 수를 곧바로 클릭)에도 아래 마지막 수 재평가 effect가 이 값을 그대로 써서 블록과 어긋나지 않는다.
    if (known) pinnedKindRef.current[prevSans.join(" ") + "|" + stripSuffix(san)] = mm.kind;
    setLastQ({ to, kind: known ? mm.kind : "pending" });
    if (!known) {
      const onKind = (k) => { if (k) setLastQ((q) => (q && q.to && q.to[0] === to[0] && q.to[1] === to[1]) ? { ...q, kind: k } : q); };
      // (버그 수정) FEN 모드에서 goFen이 fenMoves에 없는 수(사용자가 직접 둔, 다음 수 블록의 상위
      // 몇 개 후보 밖의 수)로 이 fallback을 타면, fenRoot를 안 넘겨 evalMoveKind가 표준 시작
      // 위치를 전제하고 완전히 엉뚱한 포지션을 평가하고 있었다 — 이 콜백은 fenRoot를 직접 클로저로
      // 갖고 있으므로 그대로 넘긴다.
      evalMoveKind(prevSans, san, onKind, fenRoot).then(onKind);
    }
  }, [evalMoveKind, fenRoot]);

  // (수 아이콘 지속 + UI5 정확도) 현재 포지션에 도달한 '마지막 수'의 품질을 항상 재계산.
  // 되돌리기/앞으로 등 어떤 방식으로 도달하든 보드 도착칸 아이콘과 헤더 수 체계가 정확히 표시되도록 엔진으로 티어를 다시 평가한다.
  useEffect(() => {
    if (!sans.length) { setLastQ(null); return; }
    const prev = sans.slice(0, -1);
    const lastSan = sans[sans.length - 1];
    const brd = boardOfRoot(fenRoot, prev);
    const col = plyIsWhite(prev.length, fenRoot ? fenRoot.turn : "w") ? "w" : "b";
    const src = sanSrc(brd, lastSan, col);
    const to = src && src.to ? src.to : null;
    if (!to) { setLastQ(null); return; }
    // (버그 수정) 정적 스냅샷(snapNode)만 보고 이론 여부를 판정해서, 개발자 모드에서 새로 추가한
    // 이론 수(treeAdds/forceKind)는 후보 목록(useMergedMoves)에서는 이론으로 잘 보이다가도, 그 수를
    // 실제로 보드에서 두는 순간(여기)엔 다시 비이론으로 판정돼 평가치 아이콘("우수한 수" 등)으로
    // 바뀌어 보였다 — analyzeGame 등 다른 곳과 동일한 isBookMoveAt(스냅샷+개발자 추가+강제지정 전부
    // 확인)으로 통일한다. (FEN 모드는 표준 시작 위치를 전제하는 이론 DB 자체가 대응되지 않으므로
    // 이 확인을 건너뛰고 바로 아래 엔진 등급 판정으로 넘어간다.)
    if (!fenRoot && isBookMoveAt(prev.join(" "), lastSan)) { setLastQ({ to, kind: "book" }); return; } // 이론 수는 항상 책 아이콘(평가치 아이콘으로 덮어쓰지 않음)
    // (v0.2.2 버그 수정 → v0.5.1 FEN 모드까지 확장) 이 마지막 수가 후보 블록에 떠 있던(=사용자가 등급을
    // 이미 본) 수라면, 블록이 표시한 그 등급을 그대로 써서 보드·현재 수 블록의 아이콘을 다음 수 블록과
    // 정확히 일치시킨다 — evalMoveKind로 다시 계산하지 않아 두 곳이 어긋나지 않는다. 블록에 없던 수
    // (사용자가 직접 둔 비이론 수 등)만 아래 재평가 경로로 넘어간다. (버그 수정, 사용자 제보) FEN
    // 모드는 처음엔 "후보 블록 자체가 없다"는 이유로 이 pin 자체를 건너뛰었는데, fenMoves(다음 수
    // 블록)가 생긴 뒤에도 이 예외가 그대로 남아 있어 FEN 모드의 현재 수 블록이 항상 별도의 얕은
    // 재탐색으로 다시 계산돼 다음 수 블록과 어긋났다 — goFen이 이제 fenMoves에서 찾은 등급을 pin해
    // 두므로(위 goFen 참고) 여기서도 fenRoot 여부와 무관하게 pin을 그대로 신뢰한다.
    const pinned = pinnedKindRef.current[prev.join(" ") + "|" + stripSuffix(lastSan)];
    if (pinned && pinned !== "pending") { setLastQ({ to, kind: pinned }); return; }
    setLastQ({ to, kind: "pending" });
    let cancelled = false;
    if (liveOn && engine.status === "ready") {
      const applyKind = (k) => {
        if (cancelled || !k) return;
        const under = /=/.test(lastSan) && !/=Q/.test(lastSan); if (under && !["inaccuracy", "mistake", "blunder"].includes(k)) k = "brilliant";
        setLastQ((q) => (q && q.to && q.to[0] === to[0] && q.to[1] === to[1]) ? { ...q, kind: k } : q);
      };
      evalMoveKind(prev, lastSan, applyKind, fenRoot).then(applyKind);
    }
    return () => { cancelled = true; };
  }, [key, liveOn, engine.status, fenRoot]);

  const go = useCallback((san, isExtra) => {
    if (gameDrawn) return;   // (v0.2.3 버그 수정) 스테일메이트·3회 동형 반복으로 이미 끝난 국면에서는 더 이상 수를 둘 수 없다
    playMoveSfx(san);   // (v0.1.4 기능) 수 블록 클릭·드래그·엔진 라인 클릭·프로모션 전부 이 함수 하나로 모이므로 여기 한 곳에서만 재생하면 된다.
    if (isExtra) setExtra((prev) => { const cur = prev[key] || []; if (cur.includes(san)) return prev; return { ...prev, [key]: [...cur, san] }; });
    const mm = moves.find((x) => stripSuffix(x.san) === stripSuffix(san));
    stampQ(sans, board, color, san, mm);
    const next = [...sans, san]; setSans(next);
    // (UI4) 되돌아간 뒤 원래 있던 다음 수와 같은 수를 다시 선택하면(=단순 재진입) 그 이후 기보를 보존하고,
    // 실제로 다른 수를 선택했을 때(=분기)만 이후 기보를 새 라인으로 교체한다.
    setFuture((f) => (f.length && stripSuffix(f[0]) === stripSuffix(san)) ? f.slice(1) : []);
    setSel(null); setDrag(null);
    setLastMascot(mascotFor(sans, san));
  }, [sans, key, moves, board, color, stampQ, future, gameDrawn]);
  // (사용자 요청) FEN 모드 전용 — 이론 후보(moves)·수 체계 평가(stampQ/evalMoveKind)·퀘스트 추적 없이
  // 그냥 그 수를 둔다. 이 값들은 전부 "표준 시작 위치에서의 이 sans"를 전제하므로, FEN 모드의 sans에
  // 그대로 적용하면 완전히 엉뚱한 포지션을 기준으로 평가해 버린다.
  // (v0.5.1 버그 수정, 사용자 제보) FEN 모드에서 "다음 수" 블록(fenMoves)에 뜬 등급과, 그 수를 실제로
  // 둔 뒤 보드·현재 수 블록에 뜨는 등급이 서로 달랐다("누가 봐도 최선 수인데 좋은 수로 뜬다" 등) —
  // goFen이 stampQ를 아예 부르지 않아, 이 마지막 수 재평가 effect(아래)가 매번 독립적으로
  // evalMoveKind(짧은 movetime의 별도 얕은 탐색)를 새로 돌려 fenMoves가 이미 계산해 둔(훨씬 깊은
  // MultiPV 탐색 결과 기반) 등급과 어긋났다. 표준 모드의 go()가 이미 하는 것과 똑같이, fenMoves에서
  // 이 수를 찾아 그 등급을 그대로 pin해 두 곳이 항상 일치하게 한다.
  const goFen = useCallback((san) => {
    if (gameDrawn) return;   // (v0.3.5 버그 수정) gameEndState가 fenRoot를 지원하게 되면서 FEN 모드도 이제 정확히 판정되므로, 표준 모드(go)와 똑같이 게이팅한다.
    playMoveSfx(san);
    const fm = fenMoves.find((x) => stripSuffix(x.san) === stripSuffix(san));
    stampQ(sans, board, color, san, fm);
    setSans([...sans, san]);
    setFuture((future.length && stripSuffix(future[0]) === stripSuffix(san)) ? future.slice(1) : []);
    setSel(null); setDrag(null);
  }, [sans, future, gameDrawn, fenMoves, board, color, stampQ]);

  const tryMove = useCallback((from, to) => {
    if (from[0] === to[0] && from[1] === to[1]) return false;
    const dests = fenRoot ? fenLegalDests(from[0], from[1], color, board, fenReplay.rights, ep) : liveLegalDests(sans, from[0], from[1], color, board, ep);
    if (!dests.some(([r, c]) => r === to[0] && c === to[1])) return false;
    const pc = board[from[0]][from[1]];
    if (pc && pc.t === "P" && ((color === "w" && to[0] === 0) || (color === "b" && to[0] === 7))) { setPromoPrompt({ from, to }); return true; }   // (기능5) 프로모션 선택
    const san = buildSan(board, from[0], from[1], to[0], to[1], color, ep);
    if (!san) return false;
    if (fenRoot) { goFen(san); return true; }
    const mm = moves.find((x) => stripSuffix(x.san) === stripSuffix(san));
    if (mm) go(mm.san, false); else go(san, true);   // 블록에 있으면 표준 SAN으로, 없으면 사용자 수 블록 생성
    return true;
  }, [board, color, go, goFen, moves, ep, fenRoot, fenReplay]);
  // (v0.1.3 기능) 엔진 라인을 클릭하면 그 라인의 첫 수(지금 위치에서 바로 다음 수)를 둔다 —
  // tryMove와 같은 규칙으로, 후보 수 블록에 이미 있으면 그 표준 SAN으로, 없으면 사용자 수로 둔다.
  // (FEN 모드에는 애초에 후보 수 패널이 없어 이 경로로 호출될 일이 없다.)
  const playEngineMove = useCallback((san) => {
    if (focus) return;
    const mm = moves.find((x) => stripSuffix(x.san) === stripSuffix(san));
    if (mm) go(mm.san, false); else go(san, true);
  }, [focus, moves, go]);
  const completePromo = useCallback((piece) => {
    if (!promoPrompt) return;
    const { from, to } = promoPrompt; setPromoPrompt(null); setSel(null); setDrag(null);
    const san = buildSan(board, from[0], from[1], to[0], to[1], color, ep, piece);
    if (!san) return;
    if (fenRoot) { goFen(san); return; }
    const mm = moves.find((x) => stripSuffix(x.san) === stripSuffix(san));
    if (mm) go(mm.san, false); else go(san, true);
  }, [promoPrompt, board, color, ep, moves, go, goFen, fenRoot]);

  const onSquareClick = useCallback((sq) => {
    const p = board[sq[0]][sq[1]];
    if (sel) { if (tryMove(sel, sq)) return; if (p && p.c === color) { setSel(sq); return; } setSel(null); return; }
    if (p && p.c === color) setSel(sq);
  }, [sel, board, color, tryMove]);
  const onPieceDrag = useCallback((sq) => { const p = board[sq[0]][sq[1]]; if (p && p.c === color) { setDrag(sq); setSel(sq); } }, [board, color]);
  const onDrop = useCallback((sq) => { if (drag) { tryMove(drag, sq); setDrag(null); setSel(null); } }, [drag, tryMove]);

  // (UI4) 기보의 특정 수(ply)로 바로 이동 — 지나쳐 되돌린 수들은 지우지 않고 future 앞쪽에 보존한다.
  // <(뒤로) 버튼도 결국 "한 수만큼 되돌리기"이므로 이 함수로 통일한다.
  const jumpTo = (ply) => {
    if (ply < 0 || ply === sans.length) return;
    // (18차 UX3) 앞으로 점프 — 기보에 계속 표시되는 future(되돌린 수들)를 클릭하면 그 수까지 다시 둔다.
    if (ply > sans.length) {
      const take = ply - sans.length;
      if (take > future.length) return;
      setSans([...sans, ...future.slice(0, take)]);
      setFuture(future.slice(take));
      setSel(null); setLastQ(null);
      return;
    }
    const dropped = sans.slice(ply);
    setExtra((prev) => {
      let changed = false; const n = { ...prev };
      for (let i = sans.length - 1; i >= ply; i--) {
        const mv = sans[i]; const pkey = sans.slice(0, i).join(" ");
        if (n[pkey] && n[pkey].includes(mv)) { const arr = n[pkey].filter((x) => x !== mv); if (arr.length) n[pkey] = arr; else delete n[pkey]; changed = true; }
      }
      return changed ? n : prev;
    });
    setFuture((f) => [...dropped, ...f]);
    setSans(sans.slice(0, ply)); setSel(null); setLastQ(null);
  };
  const back = () => jumpTo(sans.length - 1);
  const fwd = () => {
    if (!future.length) return; const h = future[0];
    if (fenRoot) { setSans([...sans, h]); setFuture(future.slice(1)); setSel(null); return; }
    const mm = moves.find((x) => stripSuffix(x.san) === stripSuffix(h));
    stampQ(sans, board, color, h, mm);
    setSans([...sans, h]); setFuture(future.slice(1)); setSel(null);
  };
  const reset = () => { setSans([]); setFuture([]); setSel(null); setLastQ(null); };
  // (v0.1.3 기능) 컴퓨터 환경에서 A/D키나 </>키로 보드 하단의 이전/다음 버튼과 동일하게 수를 되돌리고
  // 넘길 수 있게 한다. 입력창에 타이핑 중이거나(PGN 붙여넣기·퍼즐 번호 입력 등) 단축키 조합(Ctrl/Alt/
  // Meta) 중에는 가로채지 않고, 집중분석 중에는 버튼 자체가 비활성화되므로 키보드도 함께 끈다.
  useEffect(() => {
    const onKey = (e) => {
      if (focus || e.ctrlKey || e.metaKey || e.altKey) return;
      const tag = e.target && e.target.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || (e.target && e.target.isContentEditable)) return;
      if (e.key === "a" || e.key === "A" || e.key === "<") { e.preventDefault(); back(); }
      else if (e.key === "d" || e.key === "D" || e.key === ">") { e.preventDefault(); fwd(); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [focus, back, fwd]);

  // (사용자 요청) 집중 분석 화면 안에서 다른 수의 집중 분석으로 이동(onJump=enterFocusAt)했다가
  // "<-"(뒤로가기)를 누르면, 홈(보드)으로 곧장 나가 버리는 대신 방금 있던 집중 분석으로 한 단계씩
  // 되돌아가야 한다 — 지나온 집중 분석들을 스택으로 쌓아 둔다.
  const [focusStack, setFocusStack] = useState([]);
  const enterFocus = (m) => {
    const childKey = [...sans, m.san].join(" ");
    const name = m.name || (snapNode([...sans, m.san]) || {}).opening?.name || m.san;
    const isNew = m.book ? unlockOpening(childKey, name) : false;   // (UX2) 비이론 수는 도감 해금/알림 없음
    setFocusStack([]); // 보드에서 새로 들어가는 진입이라, 되돌아갈 이전 집중 분석이 없다.
    setFocus({ sans: [...sans], san: m.san, m, ply, isNew, name });
  };
  // (버그 수정) 집중분석 중 다른 수의 집중분석으로 이동(onJump)했다가 나가면, 보드가 원래 진입했던
  // 위치로 돌아가 버려 방금 살펴본 수순이 사라졌었다 — 나갈 때 보드를 마지막으로 보던 집중분석
  // 위치(수순)로 맞춘다.
  const exitFocus = () => {
    // (사용자 요청) 스택에 이전 집중 분석이 남아 있으면 홈으로 나가지 않고 그 자리로 한 단계 되돌아간다.
    if (focusStack.length) {
      const prev = focusStack[focusStack.length - 1];
      setFocusStack((s) => s.slice(0, -1));
      setSans([...prev.sans, prev.san]); setFuture([]); setSel(null); setLastQ(null);
      setFocus(prev);
      return;
    }
    if (focus) { setSans([...focus.sans, focus.san]); setFuture([]); setSel(null); setLastQ(null); }
    setFocus(null);
  };
  const enterFocusAt = (tSans, tSan) => {
    const node2 = snapNode([...tSans, tSan]);
    const name = (node2 && node2.opening) ? node2.opening.name : tSan;
    unlockOpening([...tSans, tSan].join(" "), name);
    const pnode = snapNode(tSans); const mm = pnode && pnode.moves.find((x) => stripSuffix(x.san) === stripSuffix(tSan));
    // 이미 집중 분석 중이었다면(다른 집중 분석에서 링크를 눌러 옮겨온 것) 그 집중 분석을 스택에
    // 쌓아 뒤로가기로 되돌아올 수 있게 한다. 집중 분석 밖(보드·PGN 등)에서의 진입이면 새 세션이다.
    setFocusStack((s) => (focus ? [...s, focus] : []));
    setFocus({ sans: [...tSans], san: tSan, m: mm || { san: tSan }, ply: tSans.length, isNew: false, name });
  };
  // (기능) 집중분석의 마스터 대국을 클릭 — 집중분석을 종료하고 그 대국의 마지막 포지션으로 보드를 옮긴 뒤,
  // 보드 상단 SequenceBar에 그 대국의 전체 기보가 표시되도록 sans를 그 대국의 전체 수순으로 교체한다.
  const onOpenMasterGame = async (gameId) => {
    const gameSans = await fetchAnyMasterGamePgn(gameId);   // 실패하면 그대로 throw — 호출부(FocusPanel)에서 오류 메시지를 표시한다
    if (!gameSans || !gameSans.length) throw new Error(t("빈 기보"));
    // (18차 UX8) 전체 기보를 불러오되, 보드는 집중분석에서 보던 수까지만 진행된 상태로 열고
    // 이후 수들은 future로 보존 — 기보에는 전체 수순이 흐리게 표시되고 클릭/▶로 이어볼 수 있다.
    const upto = focus ? Math.min(focus.ply + 1, gameSans.length) : gameSans.length;
    setFocus(null); setFocusStack([]); setSans(gameSans.slice(0, upto)); setFuture(gameSans.slice(upto)); setSel(null); setLastQ(null);
  };
  // (v0.2.1 기능) 마스터 대국의 초록 리뷰 버튼 — "보기"(onOpenMasterGame)와 달리 분석 보드는 그대로
  // 두고, 그 대국의 전체 기보를 곧장 /review로 넘긴다. Lichess 마스터 DB의 white/black은 {name,rating}
  // 형태라 reviewPlayerInfo가 기대하는 {username,rating}로 옮겨 담아야 실제 대국자 이름·레이팅이 뜬다.
  const onOpenMasterGameReview = async (g) => {
    const gameSans = await fetchAnyMasterGamePgn(g.id);   // 실패하면 그대로 throw — 호출부(FocusPanel)에서 오류 메시지를 표시한다
    if (!gameSans || !gameSans.length) throw new Error(t("빈 기보"));
    onOpenReview && onOpenReview({
      sans: gameSans,
      white: { username: (g.white && g.white.name) || null, rating: (g.white && g.white.rating != null) ? g.white.rating : null },
      black: { username: (g.black && g.black.name) || null, rating: (g.black && g.black.rating != null) ? g.black.rating : null },
    });
  };
  // (19차 기능2) 내 chess.com 대국을 클릭 — 기보를 이미 갖고 있으므로(fetch 불필요) 그대로 보드에 로드.
  const onOpenMyGame = (gameSans) => {
    if (!gameSans || !gameSans.length) return;
    const upto = focus ? Math.min(focus.ply + 1, gameSans.length) : gameSans.length;
    setFocus(null); setFocusStack([]); setSans(gameSans.slice(0, upto)); setFuture(gameSans.slice(upto)); setSel(null); setLastQ(null);
  };
  // (v0.2.0 기능) "게임 리뷰" — 예전엔 대국을 분석 보드에 불러오며 즉석 분석 모드(AnalysisModal)를
  // 자동으로 열었는데, 이제 결과·상대·타임클래스 같은 대국 메타데이터까지 갖춘 전용 /review
  // 페이지로 완전히 넘긴다(분석 보드 상태는 건드리지 않는다).
  const onOpenMyGameAnalyze = (g) => { onOpenReview && onOpenReview({ sans: g.moves, color: g.color, result: g.result, rating: g.rating, timeClass: g.timeClass, opening: g.opening, endTime: g.endTime, white: g.white, black: g.black, id: g.id }); };
  // (UI2) PGN 붙여넣기로 검증된 수순을 그대로 이어서 두도록 불러온다(FEN 모드였다면 표준 시작
  // 위치로 돌아가는 것이므로 함께 해제한다).
  const onLoadPgn = (movesList) => { setFocus(null); setFocusStack([]); setFenRoot(null); setSans(movesList); setFuture([]); setSel(null); setLastQ(null); };

  // (버그 수정) FEN 모드에서는 sans가 표준 시작 위치 기준 스냅샷과 무관하므로 조회하지 않는다 — 특히
  // sans=[]는 실제 표준 시작 위치와 구분되지 않아, 조회하면 이 위치와 무관한 이론 정보가 섞여 든다.
  const node = fenRoot ? null : snapNode(sans);
  const openingName = node && node.opening ? node.opening.name : null;
  const stageTitle = fenRoot ? t("{0} {1} 차례", (moveNumber(ply, startColor)), color === "w" ? t("백") : t("흑")) : ply === 0 ? t("1수 · 백의 첫 수") : (openingName || t("{0} 차례", (moveNumber(ply))));

  // (UI5) 헤더 블록에 현재 수(직전에 두어진 수) 정보 표기
  const lastSan = sans.length ? sans[sans.length - 1] : null;
  const parentKey = sans.length ? sans.slice(0, -1).join(" ") : "";
  const parentNode = (!fenRoot && sans.length) ? snapNode(sans.slice(0, -1)) : null;
  const curMove = (parentNode && lastSan) ? parentNode.moves.find((mm) => stripSuffix(mm.san) === stripSuffix(lastSan)) : null;
  const curName = (nameOverride(parentKey, lastSan) ?? (curMove ? curMove.name : null));
  const curKind = (lastQ && lastQ.kind && lastQ.kind !== "pending") ? lastQ.kind : (curMove ? (curMove.book ? "book" : "good") : null);
  // (v0.2.6 버그 수정) snapNode의 curMove는 마스터/Lichess 채택률 필드가 없는 정적 데이터라, 다음 수
  // 블록(MoveTile)이 이미 그 필드들로 계산해 보여준 키워드와 다시 계산하면 자주 어긋났다 — 블록에
  // 실제로 떴던 키워드(pinnedKwRef)가 있으면 그걸 그대로 쓰고, 없을 때만(블록을 거치지 않고 바로
  // 도달한 경우 등) 기존 방식으로 계산한다.
  const pinnedKw = lastSan ? pinnedKwRef.current[parentKey + "|" + stripSuffix(lastSan)] : null;
  const curKws = pinnedKw || ((curMove && curMove.book) ? deriveKeywords(curMove) : (kwOverride(parentKey, lastSan) || []));   // 비이론 수는 개발자 키워드만
  const curGames = curMove && curMove.games != null ? curMove.games : null;
  // (18차 UI9) 현재 수 블록에도 일반 수 블록과 동일한 통계(채택률 바·회수·승률 바)를 표기 —
  // 부모 포지션의 Lichess 통계에서 현재 수의 wdl/adopt/games를 가져온다.
  const [curStat, setCurStat] = useState(null);
  // (사용자 요청) 이 fetch가 아직 끝나지 않은 동안 통계 블록 자체를 숨기는 대신 3-dot bounce
  // 인디케이터로 로딩 중임을 보여준다 — MoveTile의 statsLoading과 같은 목적.
  const [curStatLoading, setCurStatLoading] = useState(false);
  useEffect(() => {
    let cc = false; setCurStat(null);
    // (v0.5.1 버그 수정) FEN 모드의 sans는 "이 FEN부터 둔 수순"이라 표준 시작 위치 기준의 Lichess
    // 조회(fetchLichess)와 무관하다 — liveOn만으로는 이 조회 자체를 막지 못해(liveOn은 실시간 엔진
    // 평가용 플래그일 뿐), FEN 모드 현재 수 블록에 전혀 무관한 위치의 채택률·승률 통계가 섞여
    // 들었다. fenRoot가 있으면 아예 조회하지 않는다.
    if (!lastSan || !liveOn || fenRoot) { setCurStatLoading(false); return; }
    setCurStatLoading(true);
    fetchLichess(sans.slice(0, -1)).then((r) => {
      if (cc || !r) return;
      const mm = r.moves.find((x) => stripSuffix(x.san) === stripSuffix(lastSan));
      if (mm) setCurStat({ wdl: mm.wdl, adopt: mm.adopt, games: mm.games, posTotal: r.posTotal });
    }).catch(() => { }).finally(() => { if (!cc) setCurStatLoading(false); });
    return () => { cc = true; };
  }, [key, liveOn, fenRoot]);
  // (사용자 요청) v0.4.5/0.4.6에서 일반 수 블록(MoveTile)에만 적용됐던 리체스 통계 개선(0에서
  // 실제 값까지 세어 올라가는 애니메이션, 채택률 소수 둘째 자리 표기, 더 진한 강조색)을 이 "현재
  // 수 블록"에도 완전히 동일하게 적용한다.
  const curGamesCountDisp = useCountUp(curStat ? curStat.games : null, 900);
  const curPosTotalDisp = useCountUp(curStat ? curStat.posTotal : null, 500);
  const curAdoptDisp = useCountUp(curStat ? curStat.adopt : null, 900, 2);

  const fa = useFocusAnalysis(focus, { chesscom, engine, canEdit, canAdd, bumpContent, puzzles, contentVer });

  // (v0.2.6 버그 수정) 예전엔 이 "다음 수" 블록 목록(전체/마스터·채택률순/평가치순 선택 포함)이 항상
  // 오른쪽 칼럼에 그려져 있었지만, 집중분석(focus)이 켜지면 전체화면 오버레이(position:fixed,inset:0)가
  // 화면 전체를 덮어 이 칼럼은 실제로는 절대 보이지 않았다(특히 모바일에서 두드러짐 — 미니보드
  // 아래로 스크롤할 화면 자체가 없다). 이 JSX를 미리 변수로 뽑아 두고, focus가 꺼져 있을 때는 기존
  // 위치(오른쪽 칼럼)에 그대로 두되, focus가 켜지면 FocusPanel 안(미니보드 하단 페이지 2)으로
  // 넘겨 실제로 보이게 한다.
  const nextMovesContent = (
    <>
      <div className="flex items-center justify-between flex-wrap" style={{ gap: 10, marginBottom: 10 }}>
        <div className="inline-flex" style={{ borderRadius: 9, background: "rgba(0,0,0,.06)", padding: 3, gap: 3 }} title={t("통계 범위: 전체 유저 대국 / 마스터 대국만")}>
          <button onClick={() => setMode("normal")} className="press" style={{ padding: "6px 12px", borderRadius: 7, border: "none", cursor: "pointer", fontSize: 11.5, fontWeight: 800, background: mode === "normal" ? T.ebony2 : "transparent", color: mode === "normal" ? T.brassHi : T.inkSoft }}>{t("전체")}</button>
          <button onClick={() => setMode("master")} className="press" style={{ padding: "6px 12px", borderRadius: 7, border: "none", cursor: "pointer", fontSize: 11.5, fontWeight: 800, background: mode === "master" ? T.ebony2 : "transparent", color: mode === "master" ? T.brassHi : T.inkSoft }}>{t("마스터")}</button>
        </div>
        <div className="inline-flex" style={{ borderRadius: 9, background: "rgba(0,0,0,.06)", padding: 3, gap: 3 }} title={t("비이론 수 정렬 기준")}>
          <button onClick={() => setSortBy("eval")} className="press" style={{ padding: "6px 12px", borderRadius: 7, border: "none", cursor: "pointer", fontSize: 11.5, fontWeight: 800, background: sortBy === "eval" ? T.ebony2 : "transparent", color: sortBy === "eval" ? T.brassHi : T.inkSoft }}>{t("평가치순")}</button>
          <button onClick={() => setSortBy("adopt")} className="press" style={{ padding: "6px 12px", borderRadius: 7, border: "none", cursor: "pointer", fontSize: 11.5, fontWeight: 800, background: sortBy === "adopt" ? T.ebony2 : "transparent", color: sortBy === "adopt" ? T.brassHi : T.inkSoft }}>{t("채택률순")}</button>
        </div>
      </div>
      {/* (v0.2.0 기능) 엔진이 이 포지션의 후보 수(수 블록)를 계산하는 동안 마스코트 안내를
          보여준다 — linesPending은 이미 "새 엔진 결과를 기다리는 중"을 정확히 추적하고
          있던 플래그라 그대로 재사용한다. */}
      {linesPending && (
        <div className="flex items-center gap-2" style={{ marginBottom: 8 }}>
          <Mascot name={ply % 2 === 0 ? "milku" : "kokoa"} emotion="think" size={30} />
          <span style={{ fontSize: 11.5, color: T.inkSoft, fontWeight: 700 }}>{tx("{0} 수 계산 중", ply % 2 === 0 ? "MILKU" : "KOKOA")}</span>
        </div>
      )}
      {moves.length === 0 ? (
        <div style={{ background: T.paper, borderRadius: 12, padding: 16, border: "1px dashed #C9B58C", textAlign: "center" }}>
          <div style={{ display: "flex", justifyContent: "center" }}><Mascot name="milku" emotion="sleep" size={92} /></div>
          <p style={{ fontSize: 13, color: T.inkSoft, marginTop: 8 }}>{t("제안된 수 없음. 보드에서 직접 두면 평가 후 블록으로 추가")}</p>
        </div>
      ) : (() => {
        const bk = moves.filter((m) => m.book);
        const nb = moves.filter((m) => !m.book);
        const shownNb = (showAllNb ? nb : nb.slice(0, 3));
        const shown = [...bk, ...shownNb];
        return (
          <>
            {/* (v0.2.4 기능) 평가치가 스트리밍되며 순위가 바뀌면(tiled의 rank 정렬) key가 그대로라
                React는 DOM을 그 자리에서 순간이동시킬 뿐이었다 — FadeIn(motion.div layout)으로
                감싸 순위가 바뀔 때 블록이 새 위치로 부드럽게 애니메이션되게 한다. */}
            {/* (v0.5.1 기능) FEN 모드의 수 블록은 goFen(이론/퀘스트 추적 없이 그냥 그 수를 둠)으로
                두고, 일일 퀘스트 배지와 "분석"(집중 분석 진입) 버튼은 전부 표준 시작 위치 데이터를
                전제하므로 숨긴다(hideFocus — 사용자 요청, MoveTile 참고). */}
            {shown.map((m) => <FadeIn key={m.san} layout><MoveTile m={m} ply={ply} startColor={startColor} posGames={posGames} statsLoading={statsLoading} onClick={() => (fenRoot ? goFen(m.san) : go(m.san, false))} onFocus={fenRoot ? undefined : () => enterFocus(m)} hideFocus={!!fenRoot} questBadge={!fenRoot && matchesQuestPath([...sans, m.san])} onQuestBadgeClick={(!fenRoot && onQuestBadgeClick) ? () => onQuestBadgeClick(matchedQuestOpeningName([...sans, m.san])) : undefined} /></FadeIn>)}
            {nb.length > 3 && (
              <button onClick={() => setShowAllNb((v) => !v)} className="press" style={{ width: "100%", display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 6, padding: "8px 0", borderRadius: 10, border: "1px dashed " + T.brass, background: "transparent", color: T.brassHi, fontSize: 12, fontWeight: 800, cursor: "pointer" }}>
                <ChevronRight size={14} style={{ transform: showAllNb ? "rotate(-90deg)" : "rotate(90deg)", transition: "transform .15s" }} />
                {showAllNb ? t("접기") : t("더보기")}
              </button>
            )}
          </>
        );
      })()}
    </>
  );

  return (
    <div className="grid gap-5 lg:grid-cols-2">
      {/* (버그 수정) 이 div는 grid 아이템인데 min-width 기본값이 auto라, 내부 기보 바 등이
          overflow-x:auto+min-width:0으로 자체 스크롤 처리를 해도 grid 트랙 자체가 콘텐츠의
          최소 폭(min-content)만큼 억지로 넓어져 모바일에서 보드가 화면 밖으로 밀려나는 원인이었다. */}
      <div style={{ minWidth: 0 }}>
        <div style={{ position: "relative", background: "linear-gradient(160deg,#2E1B10,#1B0F07)", borderRadius: 14, padding: 14, border: "1px solid #000", boxShadow: "inset 0 1px 0 rgba(255,255,255,.05)", minWidth: 0 }}>
          {/* (사용자 요청) FEN 모드에서는 상단 기보(SequenceBar)가 "이 포지션부터 둔 수순"만 보여줄 뿐
              어느 FEN에서 시작했는지는 화면 어디에도 남지 않았다 — 시작 포지션의 FEN 코드와, 그
              위치부터 이어지는 PGN 기보를 각각 복사할 수 있는 줄을 기보 바로 위에 둔다.
              (v0.5.1 UI, 사용자 요청) 예전엔 이 위에 "FEN 모드 — ..." 안내 배지 + 종료 버튼을 별도
              박스로 뒀는데, FEN 코드 줄과 중복된 정보였다 — 안내 박스를 없애고 종료 버튼만 이 줄로
              옮겼다. (v0.5.1 UI, 사용자 요청) FEN·PGN 두 줄을 별도 "column" 컨테이너로 감싸고, 종료
              버튼은 그 컨테이너의 형제(sibling)로 밖에 둬 — 바깥 flex 컨테이너의 align-items:center
              덕분에 종료 버튼이 저절로 두 줄을 합친 높이의 정중앙에 오게 한다(각 줄 안에 끼워 넣으면
              그 줄 하나의 높이에만 맞춰지므로 정중앙이 아니게 된다). 두 줄 모두 이제 "라벨(28px 고정
              폭) + 코드(flex) + 복사 버튼"으로 구조가 완전히 같아, 복사 버튼의 x좌표도 코드 길이와
              무관하게 두 줄에서 항상 같은 자리에 온다. */}
          {fenRoot && (
            <div style={{ marginBottom: 10, padding: "8px 11px", borderRadius: 9, background: "rgba(0,0,0,.18)", border: "1px solid rgba(255,255,255,.08)", display: "flex", alignItems: "center", gap: 10 }}>
              <div style={{ flex: "1 1 auto", minWidth: 0, display: "flex", flexDirection: "column", gap: 6 }}>
                {[
                  { label: "FEN", key: "fen", value: fenRoot.raw },
                  { label: "PGN", key: "pgn", value: sansToPgnText(sans, fenRoot.turn) || t("(시작 위치)") },
                ].map((row) => (
                  <div key={row.key} className="flex items-center gap-2">
                    <span style={{ fontSize: 10, fontWeight: 800, color: T.brassHi, flexShrink: 0, width: 28 }}>{row.label}</span>
                    <code style={{ flex: "1 1 auto", minWidth: 0, overflowX: "auto", whiteSpace: "nowrap", fontSize: 11, color: T.ivoryHi, fontFamily: SEQ_FONT, WebkitOverflowScrolling: "touch" }}>{row.value}</code>
                    <button onClick={async () => { try { await navigator.clipboard.writeText(row.value); setFenCopied(row.key); setTimeout(() => setFenCopied((c) => (c === row.key ? null : c)), 1500); } catch { } }}
                      title={t("{0} 복사", (row.label))} className="press" style={{ flexShrink: 0, width: 22, height: 22, borderRadius: 6, background: "rgba(255,255,255,.08)", border: "1px solid rgba(255,255,255,.18)", color: T.brassHi, display: "inline-flex", alignItems: "center", justifyContent: "center", cursor: "pointer" }}>
                      {fenCopied === row.key ? <Check size={11} /> : <Copy size={11} />}
                    </button>
                  </div>
                ))}
              </div>
              <button onClick={exitFenMode} title={t("FEN 모드 종료")} className="press" style={{ flexShrink: 0, padding: "4px 10px", borderRadius: 7, border: "1px solid " + T.brass, background: "transparent", color: T.brassHi, fontWeight: 800, fontSize: 11, cursor: "pointer" }}>{t("종료")}</button>
            </div>
          )}
          <div className="mb-3 flex items-center justify-between gap-2">
            <SequenceBar sans={sans} future={future} onJump={focus ? undefined : jumpTo} drawn={gameDrawn} startColor={fenRoot ? fenRoot.turn : undefined} font={SITE_FONT} />
            <div className="flex items-center gap-2" style={{ flexShrink: 0 }}>
              {/* (v0.3.5 기능) 사용자 요청 — 예전에 "분석" 버튼이 있던 자리에 보드 편집기(펜 아이콘)를
                  두고, 분석 버튼은 다른 화면에서 쓰는 연두색+별 모양 리뷰 버튼(BestMoveJumpButton)으로
                  바꿔 이 줄의 맨 오른쪽으로 옮겼다.
                  (UI) 사용자 요청 — 펜/리뷰 버튼을 복사·붙여넣기 버튼과 같은 26px 크기로 맞추고, 펜
                  버튼 디자인도 복사/붙여넣기 버튼(iconBtn)과 동일하게 통일. 네 버튼 모두 같은 부모의
                  gap-2(8px)로 감싸 간격도 통일한다. */}
              <button onClick={() => setEditorOpen(true)} title={t("보드 편집")} className="press" style={{ width: 26, height: 26, borderRadius: 7, background: "rgba(255,255,255,.08)", border: "1px solid rgba(255,255,255,.18)", color: T.brassHi, cursor: "pointer", display: "inline-flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}><Pencil size={13} /></button>
              <NotationTools sans={sans} startColor={fenRoot ? fenRoot.turn : undefined} onLoadPgn={onLoadPgn} onLoadFen={onLoadFen} />
              {/* (18차 UI5) 와이파이 아이콘 + "라이브" 상태 텍스트 삭제 */}
              {/* (v0.2.0 기능) 기보 위 리뷰 버튼 — 예전엔 이 자리에서 즉석 분석 모드(AnalysisModal)를
                  띄웠지만, 이제 현재 기보(진행분+이후분)를 그대로 전용 /review 페이지로 넘긴다.
                  (v0.4.8 기능) FEN 모드에서도 그대로 리뷰를 연다 — ReviewPage가 이미 fenRoot를 온전히
                  지원하므로, 붙여넣은 포지션의 원본 FEN 문자열(fenRoot.raw)만 함께 넘기면 된다. */}
              <BestMoveJumpButton title={t("기보 분석(리뷰)")} size={26}
                onClick={() => onOpenReview && onOpenReview({ sans: [...sans, ...future], fenRoot: fenRoot ? fenRoot.raw : null })}
                disabled={(!fenRoot && [...sans, ...future].length < 1) || engine.status !== "ready"} />
            </div>
          </div>
          {/* (사용자 요청) 퍼즐 만들기 기능은 이 보드 편집기(분석 탭 수정 버튼)가 아니라 퍼즐 탭에서만
              가능하도록 옮겼다 — 여기서는 순수하게 포지션을 편집/적용하는 용도로만 쓴다. */}
          {editorOpen && (
            <BoardEditorModal
              initialFen={fenOfRoot(fenRoot, sans)}
              onClose={() => setEditorOpen(false)}
              onApply={(root) => { onLoadFen(root); setEditorOpen(false); }}
            />
          )}
          {/* (사용자 요청) "잘리지 않을 정도로 최대한 크게" — 예전엔 이 폭을 모바일에서도 항상
              360px로 묶어 둬, 화면이 그보다 넓은 기기에서는 보드 좌우로 불필요한 여백만 남았다.
              lg(2단 레이아웃으로 바뀌는 지점) 미만에서는 카드 폭(100%)에 카드 자신의 좌우 패딩(14px
              씩)만큼 음수 마진으로 "흘러넘쳐" 카드 테두리까지 꽉 채우고, lg 이상(보드+다음 수 목록이
              좌우로 나란히 놓이는 데스크톱)에서만 흘러넘침 없이 기존처럼 360px로 묶어 옆 칼럼과
              균형을 맞춘다(className이 그 폭에서 margin/width를 다시 0/100%로 되돌린다). */}
          <div ref={boardRef} className="lg:max-w-360 board-bleed" style={{ width: "calc(100% + 28px)", margin: "0 -14px", position: "relative", scrollMarginBottom: 84 }}>
            <BoardWithMaterial board={board} endFx={drawState.end ? { kind: drawState.end, loser: drawState.color } : null} flip={flip} textColor={T.brassHi} size={boardSize} arrows={arrows} legalTargets={legalTargets} selected={sel} onSquareClick={!focus ? onSquareClick : undefined} onPieceDrag={!focus ? onPieceDrag : undefined} onDrop={!focus ? onDrop : undefined} onMove={!focus ? tryMove : undefined} evalCp={posEval} evalDepth={liveOn ? curDepth : null} interactive={!focus} lastQ={lastQ} hideMaterial showEval={!forcedPosition} reserveEvalGap gridRef={setPromoGridEl}
              belowEval={<EngineLines lines={engineLines} pending={linesPending} sans={sans} startColor={startColor} width={Math.floor(boardSize / 8) * 8} onPlayFirst={!focus ? playEngineMove : undefined} forced={forcedPosition} maxLines={forcedPosition ? legalMoveCount : 3} />} />
            {promoPrompt && (
              <ReviewPromoPrompt onPick={completePromo} onCancel={() => { setPromoPrompt(null); setSel(null); setDrag(null); }} color={promoPrompt.to[0] === 0 ? "w" : "b"} portalTo={promoGridEl} />
            )}
          </div>
          {/* (사용자 요청) 보드가 커진 만큼 그 아래 버튼들(뒤집기·초기화·PLAY·뒤로·앞으로)도 함께
              키워 균형을 맞춘다 — NavBtn 기본 40px 대신 46px, 아이콘도 한 단계씩 키운다. */}
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, marginTop: 12 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <NavBtn size={46} onClick={() => setFlip((v) => !v)} active={flip}><ArrowUpDown size={19} /></NavBtn>
              <NavBtn size={46} onClick={reset} disabled={!sans.length || !!focus}><RotateCcw size={18} /></NavBtn>
            </div>
            {/* (사용자 요청) 봇과 직접 대국을 시작하는 PLAY 버튼 — 별도 줄 대신 나머지 네 버튼(뒤집기·
                초기화·뒤로·앞으로)과 같은 줄, 가운데에 작게 둔다. 전용 페이지(/play)를 새 히스토리
                항목으로 연다. */}
            {/* (버그 수정, 사용자 요청) 예전엔 지금 보드에 입력돼 있는 임의의 수순·포지션(sans/fenRoot)을
                그대로 넘겨, 보드 편집기로 만든 포지션(앙파상 등 특수 규칙 정보가 깨지기 쉬운)이나
                PGN 붙여넣기로 불러온 중간 국면에서도 곧장 봇 대국을 시작할 수 있었다 — 실제로 그런
                경로에서 앙파상이 불가능해지는 버그가 있었다. 근본적으로 "모든 /play 대국은 공통된
                표준 시작 위치로만" 진입하도록, 지금 보드가 표준 시작 위치 그대로가 아니면(fenRoot가
                있거나 sans에 이미 둔 수가 있으면) 이 버튼 자체를 비활성화하고 항상 빈 sans만 넘긴다. */}
            {onOpenPlay && !focus && (() => {
              const atStart = !fenRoot && sans.length === 0;
              return (
                <button onClick={() => atStart && onOpenPlay({ sans: [] })} disabled={!atStart} className="press" title={atStart ? t("PLAY: 봇과 대국") : t("PLAY: 표준 시작 위치에서만 가능")} style={{ display: "inline-flex", alignItems: "center", gap: 6, height: 46, padding: "0 14px", borderRadius: 11, background: atStart ? "linear-gradient(180deg," + T.brass + ",#A8842F)" : T.ebony2, color: atStart ? "#241509" : "rgba(244,238,226,.35)", fontWeight: 800, fontSize: 13, border: "1px solid #000", boxShadow: atStart ? "0 3px 0 #000" : "none", cursor: atStart ? "pointer" : "not-allowed", opacity: atStart ? 1 : 0.6, flexShrink: 0 }}>
                  <Play size={15} color={atStart ? "#241509" : "rgba(244,238,226,.35)"} fill={atStart ? "#241509" : "rgba(244,238,226,.35)"} />PLAY
                </button>
              );
            })()}
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <NavBtn size={46} onClick={back} disabled={!sans.length || !!focus}><ChevronLeft size={19} /></NavBtn>
              <NavBtn size={46} onClick={fwd} disabled={!future.length || !!focus}><ChevronRight size={19} /></NavBtn>
            </div>
          </div>
        </div>
        {/* (18차 UX8) 집중분석은 전체 화면을 차지하는 별도 창(오버레이)으로 표시한다. */}
        {focus && (
          <div style={{ position: "fixed", inset: 0, zIndex: 70, background: "radial-gradient(130% 120% at 50% -10%, #34230F 0%, #150C06 65%)", overflowY: "auto" }}>
            <div style={{ maxWidth: 620, margin: "0 auto", padding: "18px 16px 60px" }}>
              <FocusPanel fa={fa} onBack={exitFocus} onOpenPuzzleWizard={onOpenPuzzleWizard} onJump={enterFocusAt} onOpenMasterGame={onOpenMasterGame} onOpenMasterGameReview={onOpenMasterGameReview} onOpenMyGame={onOpenMyGame} onOpenMyGameAnalyze={onOpenMyGameAnalyze} nextMovesPanel={nextMovesContent} uid={uid} username={user} noteCap={noteCap} />
            </div>
          </div>
        )}
        <div style={{ marginTop: 16 }}>
          {focus ? null : (
            <>
              {/* (18차 기능4) 주요 분기점이 설정된 위치는 기존 블록 그대로, 미설정 위치는 같은 디자인의
                  "수 추천" 블록(로고·텍스트만 교체)으로 이 위치의 추천 수와 그 이유를 보여준다.
                  (18차 UI9) 마스코트는 현재 수 블록에서 이 블록의 우상단으로 이동.
                  (v0.5.1 버그 수정) branchFor/recommendReasonFor가 순수하게 sans.join(" ")만으로
                  키를 만드는데, FEN 모드도 아직 한 수도 안 뒀을 때는 sans가 똑같이 []라 표준 시작
                  위치와 키가 겹친다 — 그 결과 전혀 무관한 FEN 포지션에서 "1.e4·1.d4가 압도적" 같은
                  표준 오프닝 추천 문구가 그대로 노출됐다(실제 재현 확인). 이 카드 자체가 표준 시작
                  위치의 큐레이션 데이터를 전제하므로 FEN 모드에서는 통째로 숨긴다. */}
              {!fenRoot && (() => {
                const branch = branchFor(key);
                const rec = !branch ? (moves.find((m) => m.book && m.isMain) || moves.find((m) => m.book) || moves[0] || null) : null;
                const recSan = rec ? (rec.disp || rec.san) : null;
                const autoReason = rec ? ((rec.name ? t("‘{0}’ 이어지는 ", rec.name) : t("이 위치의 ")) + (rec.book ? t("대표 이론 수") : t("유력한 수")) + (rec.adopt != null ? t(". 전체 대국의 {0}%가 선택", rec.adopt.toFixed(1)) : "")) : null;
                const reason = recommendReasonFor(key) || autoReason;
                return (
                  <div style={{ position: "relative", background: T.paper, borderRadius: 12, padding: "12px 14px", border: "1px solid #DCCBA8", marginBottom: 16, boxShadow: "0 3px 0 #D7C19A" }}>
                    <div style={{ position: "absolute", top: 4, right: 12 }}><Mascot name={color === "w" ? "milku" : "kokoa"} emotion={(lastQ && lastQ.kind ? mascotForKind(lastQ.kind) : ["milku", "wink"])[1]} size={52} /></div>
                    {branch ? (
                      <>
                        <span style={{ display: "inline-flex", alignItems: "center", gap: 5, background: "linear-gradient(180deg,#3A2516,#241509)", color: T.brassHi, fontSize: 10, fontWeight: 800, letterSpacing: ".02em", padding: "3px 9px", borderRadius: 8, marginBottom: 8 }}>{tx("{0} 주요 분기점", <Cpu size={12} />)}</span>
                        <p style={{ fontSize: 12.5, color: T.ink, fontWeight: 600, lineHeight: 1.6, margin: 0, paddingRight: 56 }}>{branch}</p>
                      </>
                    ) : (
                      <>
                        <span style={{ display: "inline-flex", alignItems: "center", gap: 5, background: "linear-gradient(180deg,#3A2516,#241509)", color: T.brassHi, fontSize: 10, fontWeight: 800, letterSpacing: ".02em", padding: "3px 9px", borderRadius: 8, marginBottom: 8 }}>{tx("{0} 수 추천", <ThumbsUp size={12} />)}</span>
                        {rec ? (
                          <p style={{ fontSize: 12.5, color: T.ink, fontWeight: 600, lineHeight: 1.6, margin: 0, paddingRight: 56 }}>
                            <b style={{ fontSize: 13.5 }}>{moveNumber(ply, startColor)}{recSan}</b>
                            {reason ? " · " + reason : null}
                          </p>
                        ) : (
                          <p style={{ fontSize: 12.5, color: T.ink, fontWeight: 600, lineHeight: 1.6, margin: 0, paddingRight: 56 }}>{lastMascot}</p>
                        )}
                        {canEdit && <RecommendReasonEditor sentKey={key} bumpContent={bumpContent} />}
                      </>
                    )}
                    <span style={{ position: "absolute", bottom: -7, right: 30, width: 13, height: 13, background: T.paper, borderRight: "1px solid #DCCBA8", borderBottom: "1px solid #DCCBA8", transform: "rotate(45deg)" }} />
                  </div>
                );
              })()}
              {!fenRoot && (canEdit || canAdd) && <BranchBanner sentKey={key} canEdit={canEdit} canAdd={canAdd} bumpContent={bumpContent} />}
              {/* 헤더(현재 수) 블록 — 마스코트 우상단 + 분석 버튼.
                  (17차) ply(=sans.length)는 "다음에 둘 차례"의 홀짝이므로, 직전에 두어진 수(이 블록이 보여주는 수)를
                  둔 쪽은 그 반대다 — ply 짝수(다음이 백 차례)면 직전 수는 흑이 두었으므로 KOKOA, 그 반대는 MILKU. */}
              {/* (19차 선행) 아무 수도 두어지지 않은 시작 위치(ply 0)에서는 현재 수 블록을 아예 표시하지 않는다. */}
              {sans.length > 0 && (
              <div style={{ position: "relative", background: T.paper, borderRadius: 12, padding: "16px 18px", border: "1px solid #DCCBA8", boxShadow: "0 3px 0 #D7C19A" }}>
                {/* (18차 UI9) 마스코트는 위의 주요 분기점/수 추천 블록으로 이동. (19차 선행) 총 대국수 표기 제거.
                    (버그) 제목 헤더(✨ 오프닝 이름)는 UI에서 삭제 — 상세 블록이 첫 요소가 되어 상단 구분선/여백 제거. */}
                {lastSan && (
                  <div>
                    <div className="flex items-center flex-wrap" style={{ gap: 13 }}>
                      {curKind && QCOLOR[curKind] && <CircleBadge kind={curKind} descOnClick />}
                      <span style={{ fontSize: 16, fontWeight: 800, color: T.ink, letterSpacing: ".02em" }}>{moveNumber(ply - 1, startColor)}{lastSan}</span>
                      {curName && <span style={{ fontSize: 12.5, fontWeight: 600, color: T.ink, wordBreak: "keep-all" }}>{curName}</span>}
                      {/* (사용자 요청) 집중 분석은 표준 시작 위치의 오프닝 이론을 전제로 하므로 FEN 모드에서는 숨긴다. */}
                      {!fenRoot && <button onClick={() => enterFocusAt(sans.slice(0, -1), lastSan)} className="press" style={{ marginLeft: "auto", flexShrink: 0, display: "inline-flex", alignItems: "center", gap: 4, padding: "5px 11px", borderRadius: 8, background: T.ebony2, color: T.brassHi, fontSize: 11, fontWeight: 800, border: "1px solid #000", cursor: "pointer" }}>{tx("{0} 분석", <Play size={11} />)}</button>}
                    </div>
                    <div className="flex items-center flex-wrap" style={{ gap: 16, marginTop: 12 }}>
                      {curKind && <span style={{ fontSize: 12, fontWeight: 800, color: QCOLOR[curKind] || T.inkSoft }}>{QLABEL[curKind]}</span>}
                      {curGames != null && <span style={{ fontSize: 11.5, color: T.inkSoft, fontFamily: SITE_FONT }}>{tx("{0}회 진행", fmtFull(curGames))}</span>}
                    </div>
                    {curKws.length > 0 && (
                      <div style={{ marginTop: 10 }}><KeywordScroll kws={curKws} chipStyle={{ fontSize: 9.5, padding: "2px 7px" }} /></div>
                    )}
                    {/* (18차 UI9) 일반 수 블록과 동일한 레이아웃의 수 통계(채택률 바 + 회수/%) + 승률 바.
                        (사용자 요청) MoveTile과 완전히 동일하게 — 게이지 바 폭을 다시 한번 줄여(20%)
                        "a/b" 회수 표기와 채택률(%) 오른쪽 여백을 모두 확보하고, 회수는 0부터 세어
                        올라가는 애니메이션, 채택률은 소수 둘째 자리까지 진한 강조색으로 표기한다.
                        fetch가 아직 안 끝났으면(curStatLoading) 블록을 숨기는 대신 3-dot bounce
                        인디케이터를 보여준다. */}
                    {(curStat || curStatLoading) && (
                      <>
                        <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 10 }}>
                          <div style={{ flex: "0 1 20%", minWidth: 0, height: 5, borderRadius: 3, background: "rgba(0,0,0,.12)", overflow: "hidden" }}>
                            <div style={{ width: Math.min(100, (curStat && curStat.adopt) || 0) + "%", height: "100%", background: QCOLOR[curKind] || T.brass, opacity: .85 }} />
                          </div>
                          {/* (사용자 요청) 채택률(%) 텍스트는 항상 블록 기준 오른쪽 정렬. */}
                          <span style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 10, flex: 1, minWidth: 0, fontSize: 10, color: T.inkSoft, fontFamily: SITE_FONT }}>
                            <span style={{ whiteSpace: "nowrap" }}>{curStat && curStat.games != null ? fmtFull(curGamesCountDisp) + (curStat.posTotal != null ? " / " + fmtFull(curPosTotalDisp) : "") : curStatLoading ? <PendingDots size={10} /> : "—"}</span>
                            <span style={{ color: T.ink, fontWeight: 700, flexShrink: 0, textAlign: "right" }}>{curStat && curStat.adopt != null ? curAdoptDisp.toFixed(2) + "%" : curStatLoading ? <PendingDots size={10} /> : "—"}</span>
                          </span>
                        </div>
                        {curStat && curStat.wdl && <div style={{ marginTop: 8 }}><WinBar wdl={curStat.wdl} height={6} /></div>}
                      </>
                    )}
                  </div>
                )}
                {explainFor(sans) && <p style={{ color: T.inkSoft, fontSize: 12, marginTop: 12, lineHeight: 1.6 }}>{explainFor(sans)}</p>}
              </div>
              )}
            </>
          )}
        </div>
      </div>
      {/* (사용자 요청, 방어적 보강) 왼쪽 보드 칼럼(위 minWidth:0 주석 참고)과 똑같이, 이 오른쪽
          그리드 아이템도 minWidth:0을 명시한다 — 다음 수 블록 안의 긴 오프닝 이름·회수 텍스트 등이
          늘어나도 이 grid 트랙 자체가 콘텐츠의 최소 폭만큼 억지로 넓어지지 않게 막아, 그로 인해
          같은 열(모바일 단일 컬럼)에 있는 보드 칸 폭이 수를 둘 때마다 미세하게 흔들리는 걸 예방한다. */}
      <div style={{ minWidth: 0 }}>
        {/* (v0.2.6 버그 수정) 집중분석(focus) 중엔 이 오른쪽 칼럼이 전체화면 오버레이에 완전히 가려
            보이지 않았다 — nextMovesContent를 FocusPanel 안(미니보드 하단 페이지 2)으로 넘겨 거기서
            보여주므로, 여기서는 focus가 꺼져 있을 때만 렌더링해 중복 렌더를 피한다. */}
        <div>{!focus && nextMovesContent}</div>
      </div>
    </div>
  );
}