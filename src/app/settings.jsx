// (v0.6.0, App.jsx 분할) 'settings' 화면과 그 화면만 쓰는 조각
// 동작 변경 없이 App.jsx에서 그대로 옮겼다(REFACTOR_NOTES.md Phase 3 참고).
import { parseFenFull, startBoard, plyIsWhite, sanSrc, applySan } from "../lib/chessRules.js";
import { SB_ON, sbSelect, sbRpc, sbInsert, sbUpsert, SB_TOKEN, SB_URL, sbHeaders } from "../lib/supabaseClient.js";
import { isNativeApp, oauthRedirectUrl, openMailto, startOAuthNavigation } from "../lib/nativeApp.js";
import { HEAVY_ENGINE_IDS, cancelEngineDownload, deleteDownloadedEngine, downloadEngine, engineDownloadSizeLabel, engineDownloadState, engineNeedsDownload, engineUsable, subscribeEngineDownloads } from "../lib/engineDownload.js";
import React, { useState, useEffect, useMemo, useCallback, useRef } from "react";
import { T } from "../lib/theme.js";
import { ChevronDown, HelpCircle, MessageCircle, Star, Crown, Wifi, WifiOff, Cpu, Volume2, VolumeX, ChevronUp, Users, Copy, Lock, Globe, User, SlidersHorizontal, Puzzle, Sparkles } from "lucide-react";
import LangPicker from "../components/LangPicker.jsx";
import { loadUgcTranslatePref, saveUgcTranslatePref } from "../lib/prefs.js";
import { tierFromXp, TIER_XP_REQ, tierDisplayLabel, TIERS, DIVISION_ROMAN, xpForTierDivision, gmPhotoRingStyle } from "../lib/tierSystem.js";
import { SITE_FONT } from "../components/engineLines.jsx";
import { parsePgnMoves } from "../lib/pgn.js";
import { chatBlocksFetch, chatBlockSet } from "../lib/chatApi.js";
import { AnimatePresence, motion } from "framer-motion";
import { BlockListSheet, ReportsDevPanel } from "../components/chatPlus.jsx";
import { normalizeMoveFxMode, ALNUM, ANALYSIS_ENGINE_IDS, AppleLogo, CONTENT, CoinIcon, DEV_ACCOUNT, ENGINE_PROFILES, FacebookLogo, GoogleG, InviteLinkBox, REVIEW_DEPTH, fmtFull, genPuzzleTree, primaryTheme, puzzleDeleteRemote, puzzleFetch, puzzlePositionKey, puzzleThemeOpts, puzzleTreeOf, roleIcon, treeLinesOf, userProfile, usersProfiles } from "./common.jsx";
import { ProfileWindow } from "./social.jsx";
import { CHANGELOG } from "./changelog.js";
import { t, tx, lang, LANGS, setLang } from "../lib/i18n.js";

// (v0.4.7 기능, 사용자 재제보) "퍼즐 컨트롤 센터"의 손상 검사가 라인 개수(0개)만 보다 보니, 트리·라인
// 구조 자체는 있지만 그 안의 수순이 실제로는 그 자리에서 둘 수 없는(예: setupSans·mistakeSan이 그
// 위치에 안 맞거나, 데이터가 뒤섞여 모든 라인의 수순이 불법인) 진짜 손상된 퍼즐(#569827 등)을
// "정상"으로 잘못 판정했다. isPuzzlePlayable·starsOf 등 앱 전역에서 쓰이는 기존 판정 기준은 그대로
// 두고(수십 곳에 걸친 핵심 판정이라 범위를 넓히면 회귀 위험이 크다), 이 관제 도구의 손상 판정만
// DailyPuzzleDevPanel의 PGN 검증과 같은 방식(sanSrc/applySan으로 실제 재생)으로 setupSans→
// mistakeSan→각 라인 수순을 끝까지 실제로 둬 보고, 그중 단 하나의 라인도 처음부터 끝까지 합법적으로
// 재생되지 않으면 손상으로 본다.
function puzzleReplayOk(data) {
  if (!data) return false;
  let board, turn;
  if (data.fen && (!data.setupSans || !data.setupSans.length)) {
    const root = parseFenFull(data.fen);
    if (!root) return false;
    board = root.board; turn = root.turn;
  } else {
    board = startBoard(); turn = "w";
  }
  const setup = data.setupSans || [];
  let ply = 0;
  for (; ply < setup.length; ply++) {
    const color = plyIsWhite(ply, turn) ? "w" : "b";
    if (!sanSrc(board, setup[ply], color)) return false;
    board = applySan(board, setup[ply], color);
  }
  if (data.mistakeSan) {
    const color = plyIsWhite(ply, turn) ? "w" : "b";
    if (!sanSrc(board, data.mistakeSan, color)) return false;
    board = applySan(board, data.mistakeSan, color);
    ply++;
  }
  const lines = treeLinesOf(puzzleTreeOf(data));
  if (!lines.length) return false;
  const rootPly = ply;
  return lines.some((line) => {
    let b = board;
    for (let i = 0; i < line.sans.length; i++) {
      const color = plyIsWhite(rootPly + i, turn) ? "w" : "b";
      if (!sanSrc(b, line.sans[i], color)) return false;
      b = applySan(b, line.sans[i], color);
    }
    return true;
  });
}
// (v0.3.4 기능) 개발자 전용 "전체 퍼즐 일괄 재생성" 도구용 — 존재하는 모든 퍼즐 번호를 페이지
// 단위로 끝까지 모아 온다(PostgREST 기본 최대 반환 행 수 제한을 limit/offset 페이지네이션으로
// 안전하게 우회 — 퍼즐은 유저가 계속 새로 공유하는 크라우드소싱 구조라 상한이 없다).
async function puzzleListAllNos() {
  if (!SB_ON) return [];
  const out = []; const pageSize = 1000; let offset = 0;
  for (;;) {
    let rows;
    try { rows = await sbSelect("puzzles?select=no&order=no.asc&limit=" + pageSize + "&offset=" + offset); }
    catch { break; }
    if (!rows || !rows.length) break;
    out.push(...rows.map((r) => r.no));
    if (rows.length < pageSize) break;
    offset += pageSize;
  }
  return out;
}
// (버그 수정, 사용자 제보) "중복 퍼즐 정리" 관제 도구용 — no·data·solves를 한 번에 페이지 단위로
// 받아온다(위 손상 검사처럼 no마다 puzzleFetch를 따로 부르지 않는다 — 어느 쪽을 남길지 정하려면
// solves도 함께 필요하고, 전체 스캔이라 요청 수를 줄이는 쪽이 낫다).
async function puzzleListAllForDedup() {
  if (!SB_ON) return [];
  const out = []; const pageSize = 1000; let offset = 0;
  for (;;) {
    let rows;
    try { rows = await sbSelect("puzzles?select=no,data,solves&order=no.asc&limit=" + pageSize + "&offset=" + offset); }
    catch { break; }
    if (!rows || !rows.length) break;
    out.push(...rows);
    if (rows.length < pageSize) break;
    offset += pageSize;
  }
  return out;
}
// (기능) 문의/FAQ — 아직 등록된 FAQ는 없고(개발진이 추후 이 배열에 직접 채워 넣음), "문의하기"를
// 누르면 메일 작성 화면(받는사람 openchesskr@gmail.com, 제목·본문 템플릿 미리 채움)으로 이동한다.
const FAQ_ITEMS = [];
function openInquiryEmail(user) {
  const subject = t("[OpenChess 문의]");
  const body = [
    t("문의 내용을 아래에 적기"),
    "",
    "─────────────",
    t("아이디: {0}", user || ""),
    t("문의 유형: (버그 제보 / 기능 제안 / 기타)"),
    "─────────────",
  ].join("\n");
  // (버그 수정) 예전엔 Gmail 웹 작성 화면 URL(mail.google.com/...)을 새 탭으로 열었다 — 데스크톱에서
  // 브라우저에 Gmail 계정으로 로그인해 둔 경우만 전제로 한 방식이라, 모바일에서는 (1) 브라우저에
  // 구글 로그인이 안 돼 있으면 제목·본문 없이 로그인 화면만 뜨거나, (2) 앱 안에서 새 탭을 여는
  // window.open 자체가 일부 모바일 브라우저(특히 인앱 브라우저)에서 막혀 아예 아무 창도 안 뜨는
  // 문제가 있었다 — "자동으로 채워지는 양식이 비어 있다"·"메일 보내는 창 자체가 안 뜬다"는 신고 모두
  // 이 두 증상과 일치한다. 표준 mailto: 링크로 바꿔 현재 위치에서 그대로 이동시키면, 데스크톱·모바일
  // 가리지 않고 운영체제가 지정한 기본 메일 앱(Gmail 앱·Outlook·기본 Mail 앱 등)이 제목·본문까지
  // 채워진 채로 열린다 — 특정 메일 서비스 로그인 여부에 의존하지 않는다.
  const url = "mailto:openchesskr@gmail.com?subject=" + encodeURIComponent(subject) + "&body=" + encodeURIComponent(body);
  openMailto(url);
}
function FaqAccordionItem({ q, a }) {
  const [open, setOpen] = useState(false);
  return (
    <div style={{ borderTop: "1px solid #E4D5B6" }}>
      <button onClick={() => setOpen((v) => !v)} className="press" style={{ width: "100%", textAlign: "left", padding: "10px 2px", background: "transparent", border: "none", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
        <span style={{ fontSize: 12.5, fontWeight: 700, color: T.ink }}>{q}</span>
        <ChevronDown size={14} style={{ color: T.inkSoft, flexShrink: 0, transform: open ? "rotate(180deg)" : "none", transition: "transform .15s ease" }} />
      </button>
      {open && <p style={{ fontSize: 12, color: T.inkSoft, margin: "0 0 10px", lineHeight: 1.5 }}>{a}</p>}
    </div>
  );
}
function InquiryModal({ onClose, user }) {
  return (
    <div onClick={onClose} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.6)", zIndex: 90, display: "flex", alignItems: "flex-start", justifyContent: "center", padding: "40px 16px", overflowY: "auto" }}>
      <div onClick={(e) => e.stopPropagation()} style={{ position: "relative", width: "100%", maxWidth: 420, background: T.paper, borderRadius: 16, border: "1px solid #DCCBA8", padding: 18, boxShadow: "0 20px 50px -10px rgba(0,0,0,.6)" }}>
        <button onClick={onClose} aria-label={t("닫기")} className="press" style={{ position: "absolute", top: 12, right: 12, zIndex: 10, width: 28, height: 28, borderRadius: 8, border: "none", background: "#0002", color: T.ink, cursor: "pointer" }}>✕</button>
        <div className="flex items-center gap-2" style={{ marginBottom: 4 }}><HelpCircle size={17} style={{ color: T.brass }} /><span style={{ fontSize: 16, fontWeight: 800, color: T.ink }}>{t("문의 / FAQ")}</span></div>
        <p style={{ fontSize: 12, color: T.inkSoft, margin: "0 0 12px" }}>{t("자주 묻는 질문을 먼저 확인. 해결되지 않으면 문의하기 버튼으로 이메일 발송")}</p>
        <div style={{ marginBottom: 14 }}>
          {FAQ_ITEMS.length === 0
            ? <p style={{ fontSize: 12, color: T.inkSoft }}>{t("등록된 FAQ 없음")}</p>
            : FAQ_ITEMS.map((f, i) => <FaqAccordionItem key={i} q={f.q} a={f.a} />)}
        </div>
        <button onClick={() => openInquiryEmail(user)} className="press" style={{ width: "100%", padding: "11px 14px", borderRadius: 10, background: "linear-gradient(180deg,#3A2516,#241509)", color: T.ivoryHi, fontWeight: 800, border: "none", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 6 }}>{tx("{0} 문의하기", <MessageCircle size={16} />)}</button>
        <p style={{ fontSize: 10.5, color: T.inkSoft, marginTop: 8, textAlign: "center" }}>{t("기본 메일 앱 작성 화면으로 이동 (openchesskr@gmail.com)")}</p>
      </div>
    </div>
  );
}
// (기능) 개발자 모드 전용 — 티어/경험치 테스트 패널. 실제로 퍼즐을 몇 주씩 풀어 XP를 쌓지 않아도,
// 임의 증감량을 즉시 적용하거나 특정 티어의 시작 지점(그 티어 5구간)으로 곧장 점프해 승급 연출·
// 색상·토스트·여정 지도를 바로 확인할 수 있게 한다. 티어 시작 누적치는 TIER_XP_REQ에서 그때그때
// 계산해, 그 상수가 나중에 바뀌어도(티어 요구치 재조정 등) 항상 맞는 값을 가리킨다.
// (v0.2.9 기능) 사용자 요청 — 개발자 권한으로 모든 재화(OC 코인·리뷰 티켓)와 티어·XP를 한 블록에서
// 숫자로 직접 설정한다. 이전 DevXpPanel(XP 증감만 가능)을 대체·확장한다. XP와 티어는 totalXp 하나를
// 공유 진실 소스로 삼아 서로 연동된다 — XP를 직접 입력해 적용하면 tierFromXp(totalXp)로 티어·구간
// 표시와 아래 티어/구간 선택기가 즉시 그 값에 맞춰 갱신되고(useEffect), 반대로 티어·구간(또는
// 그랜드마스터의 ★)을 골라 "티어 적용"을 누르면 xpForTierDivision으로 그 지점의 XP를 역산해
// setTotalXp에 반영한다 — 결과적으로 어느 쪽을 조작해도 항상 같은 totalXp 값으로 왕복 일치한다.
function DevResourcePanel({ totalXp, setTotalXp, ocCoins, setOcCoins, card }) {
  const info = tierFromXp(totalXp);
  const [xpInput, setXpInput] = useState(String(totalXp));
  const [coinInput, setCoinInput] = useState(String(ocCoins));
  const [tierSel, setTierSel] = useState(info.tier.key);
  const [divSel, setDivSel] = useState(info.division || 1);
  const [starSel, setStarSel] = useState(info.gmStars || 0);
  // 바깥에서(예: 티어 승급 보상 등) 값이 바뀌어도 입력창·선택기가 최신 값을 그대로 반영하게 동기화.
  useEffect(() => { setXpInput(String(totalXp)); const i2 = tierFromXp(totalXp); setTierSel(i2.tier.key); setDivSel(i2.division || 1); setStarSel(i2.gmStars || 0); }, [totalXp]);
  useEffect(() => { setCoinInput(String(ocCoins)); }, [ocCoins]);
  const tierStarts = useMemo(() => {
    let acc = 0; const starts = [0];
    for (const req of TIER_XP_REQ) { acc += req; starts.push(acc); }
    return starts; // starts[i] = TIERS[i]로 들어서는 데 필요한 누적 XP
  }, []);
  const rowStyle = { marginBottom: 10 };
  const inputStyle = { flex: 1, minWidth: 0, padding: "9px 11px", borderRadius: 9, border: "1px solid #C9B58C", background: "#fff", color: T.ink, boxSizing: "border-box", fontFamily: SITE_FONT };
  const selectStyle = { padding: "9px 8px", borderRadius: 9, border: "1px solid #C9B58C", background: "#fff", color: T.ink, boxSizing: "border-box" };
  const applyBtnStyle = { padding: "9px 14px", borderRadius: 9, background: "linear-gradient(180deg,#3A2516,#241509)", color: T.ivoryHi, fontWeight: 700, border: "none", cursor: "pointer", whiteSpace: "nowrap" };
  const btnStyle = { padding: "7px 10px", borderRadius: 8, border: "1px solid #C9B58C", background: "#fff", color: T.ink, fontWeight: 700, fontSize: 12, cursor: "pointer" };
  return (
    <div style={card}>
      <div style={{ fontSize: 13, fontWeight: 700, color: T.ink, marginBottom: 4 }}>{t("개발자: 재화·티어·경험치 설정")}</div>
      <div className="flex items-center gap-1 flex-wrap" style={{ fontSize: 11.5, color: T.inkSoft, marginBottom: 12 }}>{tx("지금 {0} · 누적 {1}", <b style={{ color: T.ink }}>{tierDisplayLabel(info)}</b>, fmtFull(totalXp))} XP · <CoinIcon size={16} /> {fmtFull(ocCoins)}
      </div>
      <div className="flex items-center gap-2" style={rowStyle}>
        <CoinIcon size={20} />
        <input type="number" value={coinInput} onChange={(e) => setCoinInput(e.target.value)} placeholder={t("OC 코인 수치")} style={inputStyle} />
        <button onClick={() => setOcCoins(Math.max(0, parseInt(coinInput, 10) || 0))} className="press" style={applyBtnStyle}>{t("적용")}</button>
      </div>
      <div style={{ height: 1, background: "#E4D5B6", margin: "12px 0" }} />
      <div className="flex items-center gap-2" style={rowStyle}>
        <Star size={14} style={{ color: T.brass, flexShrink: 0 }} />
        <input type="number" value={xpInput} onChange={(e) => setXpInput(e.target.value)} placeholder={t("누적 XP 수치")} style={inputStyle} />
        <button onClick={() => setTotalXp(Math.max(0, parseInt(xpInput, 10) || 0))} className="press" style={applyBtnStyle}>{t("XP 적용")}</button>
      </div>
      <div className="flex items-center gap-2 flex-wrap" style={rowStyle}>
        <select value={tierSel} onChange={(e) => setTierSel(e.target.value)} style={selectStyle}>
          {TIERS.map((t) => <option key={t.key} value={t.key}>{t.label}</option>)}
        </select>
        {tierSel === "grandmaster" ? (
          <input type="number" value={starSel} onChange={(e) => setStarSel(parseInt(e.target.value, 10) || 0)} placeholder={t("★ 프레스티지")} style={{ ...inputStyle, flex: "0 0 110px" }} />
        ) : (
          <select value={divSel} onChange={(e) => setDivSel(parseInt(e.target.value, 10))} style={selectStyle}>
            {[1, 2, 3, 4, 5].map((d) => <option key={d} value={d}>{tx("{0} 구간", DIVISION_ROMAN[d])}</option>)}
          </select>
        )}
        <button onClick={() => setTotalXp(xpForTierDivision(tierSel, divSel, starSel))} className="press" style={applyBtnStyle}>{t("티어 적용")}</button>
      </div>
      <div className="flex flex-wrap gap-2">
        {TIERS.map((t, i) => <button key={t.key} onClick={() => setTotalXp(tierStarts[i])} className="press" style={btnStyle}>{t.label}</button>)}
        <button onClick={() => setTotalXp(0)} className="press" style={{ ...btnStyle, color: T.blunder, borderColor: T.blunder }}>{t("XP 0으로 초기화")}</button>
      </div>
    </div>
  );
}
// (v0.2.4 기능 → v0.5.0 개편) 오늘의 퍼즐 개발자 관리 — ①커뮤니티 인기 퍼즐 자동 선정(daily_puzzle_picks,
// pg_cron) 현황 확인 + 테스트용 즉시 실행, ②미래 날짜 퍼즐을 PGN으로 직접 지정(비상/예약용, 그대로 유지).
// 둘 다 master_games_dev와 같은 패턴(is_content_editor 서버 RLS로 이중 검증되는 Supabase 테이블/함수)을 쓴다.
// (예전 "2주 오프닝 테마" 수동 로테이션 UI는 폐기됐다 — 태그 문자열을 파일명과 정확히 맞춰야 하는
// 관리 부담·오타 위험 때문에 자동 선정 방식으로 교체됐다.)
function DailyPuzzleDevPanel({ card }) {
  const [picks, setPicks] = useState(null); // null=로딩 중
  const [pickErr, setPickErr] = useState("");
  const [pickBusy, setPickBusy] = useState(false);
  const loadPicks = useCallback(async () => {
    try { setPicks(await sbSelect("daily_puzzle_picks?select=date,puzzle_no,score&order=date.desc&limit=10")); }
    catch { setPicks([]); }
  }, []);
  useEffect(() => { loadPicks(); }, [loadPicks]);
  const runPickNow = async () => {
    setPickBusy(true); setPickErr("");
    try { await sbRpc("daily_puzzle_pick_run", {}); await loadPicks(); }
    catch (e) { setPickErr(t("실행 실패: {0}", e.message)); }
    setPickBusy(false);
  };
  const [pzDate, setPzDate] = useState("");
  const [pzOpening, setPzOpening] = useState("");
  const [pzPgn, setPzPgn] = useState("");
  const [pzErr, setPzErr] = useState("");
  const [pzBusy, setPzBusy] = useState(false);
  const [pzOk, setPzOk] = useState(false);
  // (AddMasterGameModal과 동일한 검증 방식) 붙여넣은 수순을 시작 위치부터 재생해 합법적인지 확인 —
  // 하나라도 안 되면 그 지점까지만 인정한다.
  const pzMoves = useMemo(() => {
    const raw = parsePgnMoves(pzPgn);
    let board = startBoard(); const ok = [];
    for (let i = 0; i < raw.length; i++) {
      const color = i % 2 === 0 ? "w" : "b";
      if (!sanSrc(board, raw[i], color)) break;
      board = applySan(board, raw[i], color); ok.push(raw[i]);
    }
    return ok;
  }, [pzPgn]);
  const savePuzzle = async () => {
    const d = pzDate.trim();
    if (!d || pzMoves.length < 2) return;
    setPzBusy(true); setPzErr(""); setPzOk(false);
    try {
      // (마지막 수 = 퍼즐의 시작인 "상대의 실수") sans 전체와 그 실수의 인덱스(puzzle_ply)를 저장해
      // 두면, resolveDailyPuzzle이 그 위치부터 genPuzzleTree로 정답 라인을 직접 만들어 낸다.
      await sbInsert("daily_puzzles_dev", { date: d, pgn: pzPgn, sans: pzMoves, puzzle_ply: pzMoves.length - 1, opening: pzOpening.trim() || null });
      setPzOk(true); setPzDate(""); setPzOpening(""); setPzPgn("");
    } catch (e) { setPzErr(t("저장 실패: {0}", e.message)); }
    setPzBusy(false);
  };
  const inputStyle = { padding: "7px 9px", borderRadius: 8, border: "1px solid #C9B58C", background: "#fff", color: T.ink, fontSize: 12.5, boxSizing: "border-box" };
  const btnStyle = { padding: "7px 12px", borderRadius: 8, border: "none", background: "linear-gradient(180deg,#3A2516,#241509)", color: T.ivoryHi, fontWeight: 700, fontSize: 12, cursor: "pointer" };
  return (
    <div style={card}>
      <div style={{ fontSize: 13, fontWeight: 700, color: T.ink, marginBottom: 4 }}>{t("일일 퍼즐 (개발자)")}</div>
      <p style={{ fontSize: 11, color: T.inkSoft, marginBottom: 10 }}>{t("매일 밤 KST 23:50에 커뮤니티 인기 퍼즐로 자동 확정되는 다음 날 몫과, 미래 날짜 지정 퍼즐 관리")}</p>
      <div style={{ fontSize: 12, fontWeight: 700, color: T.ink, marginBottom: 6 }}>{t("최근 확정 내역")}</div>
      <div style={{ display: "flex", flexDirection: "column", gap: 3, marginBottom: 8, maxHeight: 110, overflowY: "auto" }}>
        {(picks || []).map((p) => (
          <div key={p.date} className="flex items-center justify-between" style={{ fontSize: 11, color: T.inkSoft }}>
            <span>{p.date}</span><span style={{ fontWeight: 700, color: T.ink }}>{tx("퍼즐 #{0} · 인기 점수 {1}", p.puzzle_no, Number(p.score || 0).toFixed(1))}</span>
          </div>
        ))}
        {picks && picks.length === 0 && <span style={{ fontSize: 11, color: T.inkSoft }}>{t("확정 내역 없음 (자정 전 자동 실행 대기, 또는 아래에서 바로 실행)")}</span>}
      </div>
      {pickErr && <p style={{ fontSize: 11, color: T.blunder, marginBottom: 4 }}>{pickErr}</p>}
      <button onClick={runPickNow} disabled={pickBusy} className="press" style={{ ...btnStyle, marginBottom: 14, opacity: pickBusy ? .6 : 1 }}>{t("다음 날 몫 선정 바로 실행 (테스트용)")}</button>
      <div style={{ fontSize: 12, fontWeight: 700, color: T.ink, marginBottom: 6 }}>{t("미래 날짜 퍼즐 직접 지정 (PGN)")}</div>
      <div className="flex gap-2" style={{ marginBottom: 6, flexWrap: "wrap" }}>
        <input type="date" value={pzDate} onChange={(e) => setPzDate(e.target.value)} style={{ ...inputStyle, flex: "1 1 130px" }} />
        <input value={pzOpening} onChange={(e) => setPzOpening(e.target.value)} placeholder={t("오프닝 이름(선택)")} style={{ ...inputStyle, flex: "1 1 130px" }} />
      </div>
      <textarea value={pzPgn} onChange={(e) => setPzPgn(e.target.value)} placeholder={t("PGN 수순 붙여넣기 (마지막 수가 상대의 실수, 퍼즐 시작)")} rows={3} style={{ ...inputStyle, width: "100%", marginBottom: 4, resize: "vertical" }} />
      <p style={{ fontSize: 10.5, color: T.inkSoft, marginBottom: 4 }}>{pzPgn.trim() ? (pzMoves.length ? t("{0}수 인식됨", (pzMoves.length)) : t("인식할 수 있는 수순 없음")) : ""}</p>
      {pzErr && <p style={{ fontSize: 11, color: T.blunder, marginBottom: 4 }}>{pzErr}</p>}
      {pzOk && <p style={{ fontSize: 11, color: T.best, marginBottom: 4 }}>{t("저장됨")}</p>}
      <button onClick={savePuzzle} disabled={pzBusy || pzMoves.length < 2 || !pzDate.trim()} className="press" style={{ ...btnStyle, opacity: (pzBusy || pzMoves.length < 2 || !pzDate.trim()) ? .5 : 1 }}>{t("퍼즐 저장")}</button>
    </div>
  );
}
// (v0.3.4 기능) 개발자 전용 — 이미 만들어진 모든 퍼즐을 최신 라인 종료 규칙(genPuzzleTree)으로
// 한꺼번에 다시 생성한다(요청: "기존 퍼즐에도 적용해 달라"). genPuzzleTree는 브라우저 WASM
// 엔진(getAnalysisPool)에 강하게 결합돼 있어 Node 스크립트로 서버에서 일괄 실행할 방법이 없다 —
// 개발자가 이 패널을 열어 둔 실제 브라우저 탭에서, 단일 퍼즐 재생성(regenerateWithTarget)과 정확히
// 같은 genPuzzleTree 호출을 퍼즐 번호 순서대로 하나씩(engine 내부 워커 풀은 그대로 재사용되므로
// 병렬 처리 자체는 유지된다) 실행해 puzzles 테이블에 직접 덮어쓴다. 퍼즐 수가 많으면 오래 걸릴 수
// 있어(요청 이전에 이미 그런 구조) 진행률·실패 목록을 보여주고 언제든 멈출 수 있게 한다. (주의)
// 재생성은 라인 태그를 새로 발급하므로, 기존 유저의 lineSolves(라인별 별 3개 보상 여부)가 재생성된
// 퍼즐에서 더 이상 일치하지 않을 수 있다 — 베타 단계라 이 위험을 감수하기로 확인받았다.
// (버그 수정, 사용자 제보) "개발자 도구" 카드는 SettingsTab에 key={"set-"+navNonce}가 걸려 있어(다른
// 탭들과 같은 "탭을 다시 누르면 그 화면 상태를 초기화" 패턴), 이 배치 재생성이 한창 도는 도중 설정
// 탭 아이콘을 다시 누르기만 해도(흔한 습관적 재탭) navNonce가 올라 이 패널이 통째로 새로 마운트되며
// 진행률 화면이 "대기" 상태로 리셋됐다 — 실제로는 orphan된 이전 루프가 백그라운드에서 계속 도는데
// (자바스크립트 비동기 함수는 컴포넌트가 언마운트돼도 저절로 멈추지 않는다) 화면엔 아무 반응도 없어
// 보여 "버튼이 제대로 동작하지 않는다"는 제보로 이어졌다. 진행 상태를 컴포넌트 밖 모듈 스코프의
// 싱글턴으로 옮겨, 패널이 다시 마운트돼도 이미 돌고 있는 작업을 그대로 이어 보여주고(그리고 "시작"
// 버튼이 새 루프를 중복으로 띄우지 않도록) 구조적으로 고친다.
const puzzleRegenRun = { status: "idle", total: 0, doneCount: 0, curNo: null, failed: [], stop: false, listeners: new Set() };
function puzzleRegenNotify() { for (const fn of puzzleRegenRun.listeners) fn(); }
function usePuzzleRegenRun() {
  const [, bump] = useState(0);
  useEffect(() => {
    const fn = () => bump((n) => n + 1);
    puzzleRegenRun.listeners.add(fn);
    return () => puzzleRegenRun.listeners.delete(fn);
  }, []);
  return puzzleRegenRun;
}
// (v0.4.7 기능, 사용자 요청) 배치 재생성 루프와 아래 "퍼즐 컨트롤 센터"의 번호 지정 재생성이 완전히
// 같은 로직(fetch → genPuzzleTree → upsert → 남아있는 override 정리)을 쓰도록 공용 함수로 뽑았다.
// 실패하면 던지고, 성공하면 이 번호의 개발자 override를 함께 지웠는지(그래서 bumpContent가
// 필요한지)만 알려준다 — 실제 upsert·CONTENT 변형은 이 함수가 전담한다.
async function regenerateOnePuzzle(engine, no) {
  const data = await puzzleFetch(no);
  if (!data) throw new Error(t("퍼즐 데이터를 찾을 수 없음"));
  const setup = [...(data.setupSans || []), data.mistakeSan].filter(Boolean);
  const fenRoot = (!data.setupSans || !data.setupSans.length) && data.fen ? parseFenFull(data.fen) : null;
  const th = primaryTheme(data);
  const ov = (CONTENT.puzzleOverrides || {})[no] || {};
  const curLines = treeLinesOf(puzzleTreeOf(data));
  const firstSan = th === "sacrifice" ? (curLines[0] && curLines[0].sans[0]) : null;
  const opts = { ...puzzleThemeOpts(th, ov.target, ov.puzzleType), firstSan, tagSeq: 0 };
  const gen = await genPuzzleTree(engine, setup, opts, undefined, fenRoot);
  if (!gen) throw new Error(t("이 기준으로는 트리를 만들 수 없음"));
  await sbUpsert("puzzles", { no, data: { ...data, tree: gen.tree, lines: gen.lines } });
  let overridesTouched = false;
  if (CONTENT.puzzleOverrides && CONTENT.puzzleOverrides[no]) { delete CONTENT.puzzleOverrides[no]; overridesTouched = true; }
  return { overridesTouched };
}
function PuzzleBatchRegenPanel({ engine, bumpContent, card }) {
  const run = usePuzzleRegenRun();
  const { status, total, doneCount, curNo, failed } = run;
  const running = status === "listing" || status === "running";
  const start = async () => {
    if (!engine || engine.status !== "ready" || running) return;
    run.stop = false;
    run.failed = []; run.doneCount = 0; run.curNo = null; run.total = 0;
    run.status = "listing"; puzzleRegenNotify();
    const nos = await puzzleListAllNos();
    run.total = nos.length; puzzleRegenNotify();
    run.status = "running"; puzzleRegenNotify();
    let overridesTouched = false;
    for (const no of nos) {
      if (run.stop) { run.status = "stopped"; puzzleRegenNotify(); return; }
      run.curNo = no; puzzleRegenNotify();
      try {
        const { overridesTouched: t } = await regenerateOnePuzzle(engine, no);
        if (t) overridesTouched = true;
      } catch (e) {
        run.failed = [...run.failed, { no, error: (e && e.message) || String(e) }];
      }
      run.doneCount += 1; puzzleRegenNotify();
    }
    if (overridesTouched && bumpContent) { try { await bumpContent(); } catch { } }
    run.curNo = null;
    run.status = "done"; puzzleRegenNotify();   // 여기 도달했다는 건 중간에 stop으로 멈추지 않고 목록을 끝까지 순회했다는 뜻.
  };
  const stop = () => { run.stop = true; };
  const btnStyle = { padding: "7px 10px", borderRadius: 8, border: "1px solid #C9B58C", background: "#fff", color: T.ink, fontWeight: 700, fontSize: 12, cursor: "pointer" };
  return (
    <div style={card}>
      <div style={{ fontSize: 13, fontWeight: 700, color: T.ink, marginBottom: 4 }}>{t("개발자: 전체 퍼즐 일괄 재생성")}</div>
      <p style={{ fontSize: 11.5, color: T.inkSoft, marginBottom: 10 }}>{t("모든 퍼즐을 최신 라인 종료 규칙으로 다시 생성. 창을 닫거나 새로고침하면 중단되고, 다시 시작하면 처음부터 순회. 퍼즐 수에 따라 오래 걸릴 수 있음. 기존 라인 태그가 바뀌어 유저의 라인별 풀이 기록과 맞지 않을 수 있음")}</p>
      <div className="flex items-center gap-2" style={{ marginBottom: 10 }}>
        {running
          ? <button onClick={stop} className="press" style={{ ...btnStyle, borderColor: T.blunder, color: T.blunder }}>{t("중단")}</button>
          : <button onClick={start} disabled={!engine || engine.status !== "ready"} className="press" style={{ padding: "9px 16px", borderRadius: 9, background: "linear-gradient(180deg,#3A2516,#241509)", color: T.ivoryHi, fontWeight: 700, border: "none", cursor: "pointer", opacity: (!engine || engine.status !== "ready") ? .5 : 1 }}>{status === "idle" ? t("전체 재생성 시작") : t("처음부터 다시 시작")}</button>}
        {!engine || engine.status !== "ready" ? <span style={{ fontSize: 10.5, color: T.blunder }}>{t("엔진 준비 후 시작 가능")}</span> : null}
      </div>
      {status !== "idle" && (
        <div style={{ marginBottom: 10 }}>
          <div style={{ fontSize: 11.5, color: T.inkSoft, marginBottom: 4 }}>
            {status === "listing" ? t("퍼즐 목록 로드 중…") : status === "done" ? t("완료") : status === "stopped" ? t("중단됨") : t("진행 중…")}
            {total > 0 && " · " + doneCount + " / " + total + (curNo != null && running ? t(" (지금 #{0})", curNo) : "")}
          </div>
          {total > 0 && (
            <div style={{ height: 8, borderRadius: 999, background: "#EEE2C6", overflow: "hidden", border: "1px solid #DCCBA8" }}>
              <div style={{ width: (100 * doneCount / total) + "%", height: "100%", background: "linear-gradient(90deg,#8A6A2F," + T.brass + ")", transition: "width .3s ease" }} />
            </div>
          )}
        </div>
      )}
      {failed.length > 0 && (
        <div style={{ maxHeight: 160, overflowY: "auto", padding: 8, borderRadius: 8, background: "rgba(213,88,88,.08)", border: "1px solid " + T.blunder }}>
          <div style={{ fontSize: 10.5, fontWeight: 800, color: T.blunder, marginBottom: 4 }}>{tx("실패 {0}건", failed.length)}</div>
          {failed.map((f) => <div key={f.no} style={{ fontSize: 10, color: T.blunder }}>#{f.no}: {f.error}</div>)}
        </div>
      )}
    </div>
  );
}
// (v0.4.7 기능, 사용자 요청) "전체 퍼즐 일괄 재생성"을 좀 더 다듬어 달라 — 손상된(라인 0개, 또는
// 아예 데이터를 못 찾는) 퍼즐을 한 번에 찾아 말소하고, 특정 번호 하나를 콕 집어 재생성·삭제할 수
// 있는 작은 관제 도구를 같은 카드 그룹에 추가한다. 스캔·삭제 진행 상태도 위 배치 재생성과 같은
// 패턴(모듈 스코프 싱글턴 + 리스너)으로 둬서, 도중에 설정 탭을 재마운트해도(navNonce) 이어서 보인다.
const puzzleScanRun = { status: "idle", total: 0, checked: 0, corrupted: [], deleteDone: 0, deleteFailed: [], stop: false, listeners: new Set() };
function puzzleScanNotify() { for (const fn of puzzleScanRun.listeners) fn(); }
function usePuzzleScanRun() {
  const [, bump] = useState(0);
  useEffect(() => {
    const fn = () => bump((n) => n + 1);
    puzzleScanRun.listeners.add(fn);
    return () => puzzleScanRun.listeners.delete(fn);
  }, []);
  return puzzleScanRun;
}
// (버그 수정, 사용자 제보) "중복된 포지션의 퍼즐이 서로 다른 번호로 여러 개 생성된다" — 만들 때의
// 예방(위 checkPcDuplicate) 외에, 이미 생성돼 버린 중복도 한 번에 찾아 정리할 수 있는 안전장치가
// 필요하다. 위 손상 검사와 같은 패턴(모듈 스코프 싱글턴 + 리스너)을 그대로 쓰되 별도 상태로 둔다
// (손상 검사와 동시에 돌려도 서로 간섭하지 않도록).
const puzzleDedupRun = { status: "idle", total: 0, checked: 0, groups: [], deleteDone: 0, deleteTarget: 0, deleteFailed: [], stop: false, listeners: new Set() };
function puzzleDedupNotify() { for (const fn of puzzleDedupRun.listeners) fn(); }
function usePuzzleDedupRun() {
  const [, bump] = useState(0);
  useEffect(() => {
    const fn = () => bump((n) => n + 1);
    puzzleDedupRun.listeners.add(fn);
    return () => puzzleDedupRun.listeners.delete(fn);
  }, []);
  return puzzleDedupRun;
}
function PuzzleControlCenterPanel({ engine, bumpContent, card }) {
  const run = usePuzzleScanRun();
  const { status, total, checked, corrupted, deleteDone, deleteFailed } = run;
  const scanning = status === "listing" || status === "scanning";
  const deleting = status === "deleting";
  const scan = async () => {
    if (scanning || deleting) return;
    run.stop = false;
    run.corrupted = []; run.checked = 0; run.total = 0; run.deleteDone = 0; run.deleteFailed = [];
    run.status = "listing"; puzzleScanNotify();
    const nos = await puzzleListAllNos();
    run.total = nos.length; puzzleScanNotify();
    run.status = "scanning"; puzzleScanNotify();
    for (const no of nos) {
      if (run.stop) { run.status = "stopped"; puzzleScanNotify(); return; }
      // 데이터를 아예 못 찾거나(공유 후 다른 곳에서 지워짐 등), 라인이 0개거나, 라인은 있어도 그
      // 어떤 라인도 실제로 합법적으로 끝까지 재생되지 않는(setupSans·mistakeSan·수순이 뒤섞인) 퍼즐을
      // "손상"으로 본다(puzzleReplayOk — 단순 라인 개수만 보던 isPuzzlePlayable보다 엄격하다).
      const data = await puzzleFetch(no);
      if (!data || !puzzleReplayOk(data)) run.corrupted = [...run.corrupted, no];
      run.checked += 1; puzzleScanNotify();
    }
    run.status = "scanned"; puzzleScanNotify();
  };
  const stopScan = () => { run.stop = true; };
  const deleteAll = async () => {
    if (status !== "scanned" || !corrupted.length || deleting) return;
    run.stop = false;
    run.status = "deleting"; run.deleteDone = 0; run.deleteFailed = []; puzzleScanNotify();
    for (const no of corrupted) {
      if (run.stop) { run.status = "stopped"; puzzleScanNotify(); return; }
      const ok = await puzzleDeleteRemote(no);
      if (!ok) run.deleteFailed = [...run.deleteFailed, no];
      run.deleteDone += 1; puzzleScanNotify();
    }
    run.status = "deleted"; puzzleScanNotify();
  };
  // (버그 수정, 사용자 제보) 중복 퍼즐 검사 — puzzlePositionKey(위 canonicalPositionFen 주석 참고)로
  // 전체 퍼즐을 다시 그룹 지어, 같은 국면인데 번호가 다른 행이 2개 이상이면 중복으로 본다. 저장된
  // data.positionKey에 기대지 않고 그 자리에서 다시 계산하므로, 이 필드가 없는 옛 퍼즐도 그대로
  // 잡아낸다(소급 정리).
  const dedup = usePuzzleDedupRun();
  const dedupScanning = dedup.status === "listing" || dedup.status === "scanning";
  const dedupDeleting = dedup.status === "deleting";
  const dedupScan = async () => {
    if (dedupScanning || dedupDeleting) return;
    dedup.stop = false;
    dedup.groups = []; dedup.checked = 0; dedup.total = 0; dedup.deleteDone = 0; dedup.deleteTarget = 0; dedup.deleteFailed = [];
    dedup.status = "listing"; puzzleDedupNotify();
    const rows = await puzzleListAllForDedup();
    dedup.total = rows.length; puzzleDedupNotify();
    dedup.status = "scanning"; puzzleDedupNotify();
    const byKey = new Map();
    for (const r of rows) {
      if (dedup.stop) { dedup.status = "stopped"; puzzleDedupNotify(); return; }
      let key = null;
      try { key = puzzlePositionKey(r.data); } catch { key = null; }
      if (key) {
        const arr = byKey.get(key) || [];
        arr.push({ no: r.no, solves: r.solves || 0 });
        byKey.set(key, arr);
      }
      dedup.checked += 1; puzzleDedupNotify();
    }
    // 그룹 안에서는 풀이 수가 가장 많은 행을 남기고(사람들이 실제로 그 번호로 이 퍼즐을 접했을
    // 가능성이 가장 크다), 동률이면 번호가 가장 작은(먼저 생성된) 쪽을 남긴다.
    dedup.groups = [...byKey.values()].filter((g) => g.length > 1).map((g) => {
      const sorted = [...g].sort((a, b) => (b.solves - a.solves) || (a.no - b.no));
      return { keep: sorted[0].no, remove: sorted.slice(1).map((x) => x.no) };
    });
    dedup.status = "scanned"; puzzleDedupNotify();
  };
  const dedupStop = () => { dedup.stop = true; };
  const dedupRemoveCount = dedup.groups.reduce((s, g) => s + g.remove.length, 0);
  const dedupDeleteAll = async () => {
    if (dedup.status !== "scanned" || !dedupRemoveCount || dedupDeleting) return;
    dedup.stop = false;
    dedup.status = "deleting"; dedup.deleteDone = 0; dedup.deleteTarget = dedupRemoveCount; dedup.deleteFailed = []; puzzleDedupNotify();
    for (const g of dedup.groups) {
      for (const no of g.remove) {
        if (dedup.stop) { dedup.status = "stopped"; puzzleDedupNotify(); return; }
        const ok = await puzzleDeleteRemote(no);
        if (!ok) dedup.deleteFailed = [...dedup.deleteFailed, no];
        dedup.deleteDone += 1; puzzleDedupNotify();
      }
    }
    dedup.status = "deleted"; puzzleDedupNotify();
  };
  const [ctlNo, setCtlNo] = useState("");
  const [ctlBusy, setCtlBusy] = useState(false);
  const [ctlMsg, setCtlMsg] = useState(null); // { ok, text }
  const parsedNo = parseInt(ctlNo, 10);
  const validNo = Number.isFinite(parsedNo) && String(parsedNo) === ctlNo.trim() && parsedNo > 0;
  const doRegenOne = async () => {
    if (!validNo || ctlBusy) return;
    setCtlBusy(true); setCtlMsg(null);
    try {
      const { overridesTouched } = await regenerateOnePuzzle(engine, parsedNo);
      if (overridesTouched && bumpContent) { try { await bumpContent(); } catch { } }
      setCtlMsg({ ok: true, text: t("#{0} 재생성 완료", parsedNo) });
    } catch (e) { setCtlMsg({ ok: false, text: t("#{0} 재생성 실패: {1}", parsedNo, (e && e.message) || String(e)) }); }
    setCtlBusy(false);
  };
  const doDeleteOne = async () => {
    if (!validNo || ctlBusy) return;
    setCtlBusy(true); setCtlMsg(null);
    const ok = await puzzleDeleteRemote(parsedNo);
    setCtlMsg(ok ? { ok: true, text: t("#{0} 삭제 완료", parsedNo) } : { ok: false, text: t("#{0} 삭제 실패 (없거나 권한 없음)", parsedNo) });
    setCtlBusy(false);
  };
  const btnStyle = { padding: "7px 10px", borderRadius: 8, border: "1px solid #C9B58C", background: "#fff", color: T.ink, fontWeight: 700, fontSize: 12, cursor: "pointer" };
  const darkBtnStyle = { padding: "9px 16px", borderRadius: 9, background: "linear-gradient(180deg,#3A2516,#241509)", color: T.ivoryHi, fontWeight: 700, border: "none", cursor: "pointer" };
  return (
    <div style={card}>
      <div style={{ fontSize: 13, fontWeight: 700, color: T.ink, marginBottom: 4 }}>{t("개발자: 퍼즐 컨트롤 센터")}</div>
      <p style={{ fontSize: 11.5, color: T.inkSoft, marginBottom: 10 }}>{t("손상된 퍼즐(라인 없음)을 찾아 한 번에 삭제, 특정 번호는 직접 재생성·삭제")}</p>

      <div style={{ fontSize: 12, fontWeight: 700, color: T.ink, marginBottom: 6 }}>{t("손상된 퍼즐 검사·말소")}</div>
      <div className="flex items-center gap-2" style={{ marginBottom: 10, flexWrap: "wrap" }}>
        {scanning || deleting
          ? <button onClick={stopScan} className="press" style={{ ...btnStyle, borderColor: T.blunder, color: T.blunder }}>{t("중단")}</button>
          : <button onClick={scan} className="press" style={btnStyle}>{status === "idle" ? t("손상된 퍼즐 검사") : t("다시 검사")}</button>}
        {status === "scanned" && corrupted.length > 0 && (
          <button onClick={deleteAll} disabled={deleting} className="press" style={{ ...darkBtnStyle, opacity: deleting ? .6 : 1 }}>{tx("손상된 퍼즐 {0}개 모두 말소", corrupted.length)}</button>
        )}
      </div>
      {status !== "idle" && (
        <div style={{ marginBottom: 10 }}>
          <div style={{ fontSize: 11.5, color: T.inkSoft, marginBottom: 4 }}>
            {status === "listing" ? t("퍼즐 목록 로드 중…")
              : status === "scanning" ? t("검사 중… {0} / {1} (손상 {2}건 발견)", checked, total, corrupted.length)
              : status === "scanned" ? (corrupted.length ? t("검사 완료: 손상된 퍼즐 {0}개 발견", corrupted.length) : t("검사 완료: 손상된 퍼즐 없음"))
              : status === "deleting" ? t("삭제 중… {0} / {1}", deleteDone, corrupted.length)
              : status === "deleted" ? t("삭제 완료: {0}개 지움{1}", deleteDone, deleteFailed.length ? t(" (실패 {0}건)", deleteFailed.length) : "")
              : status === "stopped" ? t("중단됨") : ""}
          </div>
          {(scanning || deleting) && total > 0 && (
            <div style={{ height: 8, borderRadius: 999, background: "#EEE2C6", overflow: "hidden", border: "1px solid #DCCBA8" }}>
              <div style={{ width: (100 * (deleting ? deleteDone / (corrupted.length || 1) : checked / total)) + "%", height: "100%", background: "linear-gradient(90deg,#8A6A2F," + T.brass + ")", transition: "width .3s ease" }} />
            </div>
          )}
        </div>
      )}
      {status === "scanned" && corrupted.length > 0 && (
        <div style={{ maxHeight: 120, overflowY: "auto", padding: 8, borderRadius: 8, background: "rgba(213,88,88,.08)", border: "1px solid " + T.blunder, marginBottom: 4, fontSize: 10, color: T.blunder }}>
          {corrupted.map((no) => "#" + no).join(", ")}
        </div>
      )}
      {deleteFailed.length > 0 && (
        <div style={{ maxHeight: 100, overflowY: "auto", padding: 8, borderRadius: 8, background: "rgba(213,88,88,.08)", border: "1px solid " + T.blunder, fontSize: 10, color: T.blunder }}>{tx("말소 실패: {0}", deleteFailed.map((no) => "#" + no).join(", "))}
        </div>
      )}

      <div style={{ height: 1, background: "#E4D5B6", margin: "14px 0" }} />

      <div style={{ fontSize: 12, fontWeight: 700, color: T.ink, marginBottom: 6 }}>{t("중복 퍼즐 검사·정리")}</div>
      <p style={{ fontSize: 11, color: T.inkSoft, marginBottom: 8 }}>{t("같은 포지션의 중복 퍼즐은 풀이 수가 가장 많은 하나만 남기고 삭제")}</p>
      <div className="flex items-center gap-2" style={{ marginBottom: 10, flexWrap: "wrap" }}>
        {dedupScanning || dedupDeleting
          ? <button onClick={dedupStop} className="press" style={{ ...btnStyle, borderColor: T.blunder, color: T.blunder }}>{t("중단")}</button>
          : <button onClick={dedupScan} className="press" style={btnStyle}>{dedup.status === "idle" ? t("중복 퍼즐 검사") : t("다시 검사")}</button>}
        {dedup.status === "scanned" && dedupRemoveCount > 0 && (
          <button onClick={dedupDeleteAll} disabled={dedupDeleting} className="press" style={{ ...darkBtnStyle, opacity: dedupDeleting ? .6 : 1 }}>{tx("중복 {0}개 정리(그룹 {1}개)", dedupRemoveCount, dedup.groups.length)}</button>
        )}
      </div>
      {dedup.status !== "idle" && (
        <div style={{ marginBottom: 10 }}>
          <div style={{ fontSize: 11.5, color: T.inkSoft, marginBottom: 4 }}>
            {dedup.status === "listing" ? t("퍼즐 목록 로드 중…")
              : dedup.status === "scanning" ? t("검사 중… {0} / {1} (중복 그룹 {2}개 발견)", dedup.checked, dedup.total, dedup.groups.length)
              : dedup.status === "scanned" ? (dedupRemoveCount ? t("검사 완료: 중복 그룹 {0}개(정리 대상 {1}개)", dedup.groups.length, dedupRemoveCount) : t("검사 완료: 중복 퍼즐 없음"))
              : dedup.status === "deleting" ? t("정리 중… {0} / {1}", dedup.deleteDone, dedup.deleteTarget)
              : dedup.status === "deleted" ? t("정리 완료: {0}개 지움{1}", dedup.deleteDone, dedup.deleteFailed.length ? t(" (실패 {0}건)", dedup.deleteFailed.length) : "")
              : dedup.status === "stopped" ? t("중단됨") : ""}
          </div>
          {(dedupScanning || dedupDeleting) && (dedup.total > 0 || dedup.deleteTarget > 0) && (
            <div style={{ height: 8, borderRadius: 999, background: "#EEE2C6", overflow: "hidden", border: "1px solid #DCCBA8" }}>
              <div style={{ width: (100 * (dedupDeleting ? dedup.deleteDone / (dedup.deleteTarget || 1) : dedup.checked / (dedup.total || 1))) + "%", height: "100%", background: "linear-gradient(90deg,#8A6A2F," + T.brass + ")", transition: "width .3s ease" }} />
            </div>
          )}
        </div>
      )}
      {dedup.status === "scanned" && dedup.groups.length > 0 && (
        <div style={{ maxHeight: 120, overflowY: "auto", padding: 8, borderRadius: 8, background: "rgba(213,88,88,.08)", border: "1px solid " + T.blunder, marginBottom: 4, fontSize: 10, color: T.blunder }}>
          {dedup.groups.map((g) => t("#{0} 유지 ← {1}", g.keep, g.remove.map((no) => "#" + no).join(", "))).join(" · ")}
        </div>
      )}
      {dedup.deleteFailed.length > 0 && (
        <div style={{ maxHeight: 100, overflowY: "auto", padding: 8, borderRadius: 8, background: "rgba(213,88,88,.08)", border: "1px solid " + T.blunder, fontSize: 10, color: T.blunder }}>{tx("정리 실패: {0}", dedup.deleteFailed.map((no) => "#" + no).join(", "))}
        </div>
      )}

      <div style={{ height: 1, background: "#E4D5B6", margin: "14px 0" }} />

      <div style={{ fontSize: 12, fontWeight: 700, color: T.ink, marginBottom: 6 }}>{t("번호로 재생성·삭제")}</div>
      <div className="flex gap-2" style={{ marginBottom: 6, flexWrap: "wrap" }}>
        <input value={ctlNo} onChange={(e) => { setCtlNo(e.target.value.replace(/[^0-9]/g, "")); setCtlMsg(null); }} placeholder={t("퍼즐 번호(no)")} inputMode="numeric" style={{ padding: "7px 9px", borderRadius: 8, border: "1px solid #C9B58C", background: "#fff", color: T.ink, fontSize: 12.5, boxSizing: "border-box", flex: "1 1 120px" }} />
        <button onClick={doRegenOne} disabled={!validNo || ctlBusy || !engine || engine.status !== "ready"} className="press" style={{ ...btnStyle, opacity: (!validNo || ctlBusy || !engine || engine.status !== "ready") ? .5 : 1 }}>{ctlBusy ? t("처리 중…") : t("재생성")}</button>
        <button onClick={doDeleteOne} disabled={!validNo || ctlBusy} className="press" style={{ ...btnStyle, borderColor: T.blunder, color: T.blunder, opacity: (!validNo || ctlBusy) ? .5 : 1 }}>{t("삭제")}</button>
      </div>
      {(!engine || engine.status !== "ready") && <p style={{ fontSize: 10.5, color: T.blunder, marginBottom: 4 }}>{t("재생성은 엔진 준비 후 가능 (삭제는 바로 가능)")}</p>}
      {ctlMsg && <p style={{ fontSize: 11, color: ctlMsg.ok ? T.best : T.blunder, fontWeight: 700 }}>{ctlMsg.text}</p>}
    </div>
  );
}
/* (v0.6.3, 앱) 앱에 포함되지 않은 큰 엔진의 내려받기 행 — 크기 안내 + 내려받기/진행률/취소/실패 재시도. */
function EngineDownloadRow({ id, label }) {
  const st = engineDownloadState(id);
  const busy = st.status === "downloading";
  const pct = Math.round((st.progress || 0) * 100);
  return (
    <div style={{ padding: "10px 12px", borderRadius: 10, border: "1.5px dashed #DCCBA8", background: "#fff" }}>
      <div className="flex items-center justify-between gap-2">
        <span style={{ fontSize: 13, fontWeight: 800, color: T.ink }}>{label}</span>
        {busy
          ? <button onClick={() => cancelEngineDownload(id)} className="press" style={{ fontSize: 11, fontWeight: 800, color: T.inkSoft, background: "none", border: "none", cursor: "pointer" }}>{t("취소")}</button>
          : <button onClick={() => downloadEngine(id)} className="press" style={{ fontSize: 11.5, fontWeight: 800, color: "#241509", background: "linear-gradient(180deg," + T.brass + ",#A8842F)", border: "none", borderRadius: 8, padding: "5px 10px", cursor: "pointer" }}>{t("{0} 내려받기", engineDownloadSizeLabel(id))}</button>}
      </div>
      {busy && (
        <div style={{ marginTop: 8 }}>
          <div style={{ height: 6, borderRadius: 3, background: "#EADFC6", overflow: "hidden" }}><div style={{ width: pct + "%", height: "100%", background: T.brass, transition: "width .25s" }} /></div>
          <div style={{ fontSize: 10.5, color: T.inkSoft, marginTop: 4 }}>{t("내려받는 중 {0}%", pct)}</div>
        </div>
      )}
      {!busy && st.status === "error" && <div style={{ fontSize: 10.5, color: T.blunder, marginTop: 6 }}>{t("내려받기 실패. 연결 확인 후 다시 시도")}</div>}
      {!busy && st.status !== "error" && <div style={{ fontSize: 10.5, color: T.inkSoft, marginTop: 6 }}>{t("앱에 포함되지 않은 엔진. 내려받은 뒤 사용")}</div>}
    </div>
  );
}
// (v0.6.5 기능, 사용자 요청) 다른 사람이 쓴 글(수 설명·프로필 소개글)을 내 언어로 번역해 보여줄지 — 언어 카드 안의 켜기/끄기. 채팅은 켜져 있어도 번역하지 않는다.
function UgcTranslateToggle() {
  const [on, setOn] = useState(loadUgcTranslatePref);
  const flip = () => { const v = !on; setOn(v); saveUgcTranslatePref(v); };
  return (
    <div style={{ marginTop: 12, paddingTop: 12, borderTop: "1px solid rgba(0,0,0,.08)" }}>
      <div className="flex items-center justify-between" style={{ gap: 12 }}>
        <div style={{ minWidth: 0 }}>
          <div style={{ fontSize: 12.5, fontWeight: 700, color: T.ink }}>{t("다른 언어로 쓴 글 자동 번역")}</div>
          <div style={{ fontSize: 10.5, color: T.inkSoft, marginTop: 2, lineHeight: 1.5 }}>{t("수 설명·프로필 소개글을 내 언어로 번역해 보여줌. 채팅 메시지는 번역하지 않음")}</div>
        </div>
        <button onClick={flip} role="switch" aria-checked={on} aria-label={t("다른 언어로 쓴 글 자동 번역")} className="press" style={{ width: 46, height: 26, borderRadius: 13, background: on ? T.excellent : "#C9B58C", position: "relative", cursor: "pointer", border: "none", flexShrink: 0 }}><span style={{ position: "absolute", top: 3, left: on ? 23 : 3, width: 20, height: 20, borderRadius: "50%", background: "#fff", transition: "left .15s" }} /></button>
      </div>
      <div style={{ fontSize: 10, color: T.inkSoft, marginTop: 6, lineHeight: 1.5 }}>{t("번역할 때 글이 번역 서비스(Google Gemini)로 전송됨")}</div>
    </div>
  );
}

export function SettingsTab({ profile, setProfile, engine, engineStatus, liveOn, setLiveOn, enginePref, setEnginePref, reviewSpeed, setReviewSpeed, sharpOn, setSharpOn, user, isDev, isCodev, devOn, setDevOn, codevOn, setCodevOn, canManageCodev, canEdit, bumpContent, contentVer, openAuth, totalXp, setTotalXp, ocCoins, setOcCoins, bgmOn, bgmVolume, onToggleBgm, onBgmVolumeChange, sfxOn, sfxVolume, onToggleSfx, onSfxVolumeChange, lineClearOn, setLineClearOn, puzzleClearOn, setPuzzleClearOn, coachBubbleOn, setCoachBubbleOn, mgDangerOn, setMgDangerOn, moveFxMode, setMoveFxMode,
  myUid, currentTitle, earnedTitles, onEquipTitle, onOpenOpening, onOpenGame, onOpenGameAnalyze, puzzleRating, solvedCount, mainQuest, puzzles, solved, likedPuzzles, likeCounts, onToggleLike, repostedPuzzles, repostCounts, onToggleRepost, shareCounts, onShare, onOpenPuzzle, reviewUnlocked, chesscomStatus, chesscom, onOpenAccountCenter, loginShakeTick, onOpenUserProfile }) {
  // (v0.6.3, 앱) 엔진 내려받기 진행·완료 상태가 바뀌면 이 탭을 다시 그린다(웹에서는 상태가 안 바뀌어 아무 일도 안 함).
  const [, setEngineUiTick] = useState(0);
  const bumpEngineUi = useCallback(() => setEngineUiTick((n) => n + 1), []);
  useEffect(() => subscribeEngineDownloads(bumpEngineUi), [bumpEngineUi]);
  const [codevId, setCodevId] = useState("");
  const [codevErr, setCodevErr] = useState("");
  const [codevBusy, setCodevBusy] = useState(false);
  // (사용자 요청) CONTENT.codev는 계정 고유 아이디(username, 항상 소문자 정규화 — 예: "g13sus4")를
  // 저장하는데, 정작 그 사람이 실제로 쓰는 표시용 대소문자 표기(displayId — 예: "G13sus4")는 따로
  // 있다. 개발진 블록에는 저장된 소문자 그대로가 아니라, 그 계정에 실제로 연결된 displayId로
  // 표시한다(아직 못 불러왔거나 없으면 원래 아이디로 폴백).
  const [codevDisplayIds, setCodevDisplayIds] = useState({});
  useEffect(() => {
    let cancelled = false;
    const ids = CONTENT.codev || [];
    if (!ids.length) { setCodevDisplayIds({}); return; }
    Promise.all(ids.map((id) => userProfile(id))).then((rows) => {
      if (cancelled) return;
      const m = {};
      rows.forEach((r, i) => { if (r && r.pub && r.pub.displayId) m[ids[i]] = r.pub.displayId; });
      setCodevDisplayIds(m);
    });
    return () => { cancelled = true; };
  }, [contentVer]);
  const [inquiryOpen, setInquiryOpen] = useState(false);
  // (v0.6.0, 스토어 심사 대비) 차단 목록 — 채팅·프로필에서 차단한 사용자를 한 곳에서 보고 해제한다.
  const [blockListOpen, setBlockListOpen] = useState(false);
  const [blockItems, setBlockItems] = useState([]);
  const [blockLoading, setBlockLoading] = useState(false);
  const openBlockList = async () => {
    setBlockListOpen(true); setBlockLoading(true);
    const uids = await chatBlocksFetch(myUid);
    const prof = uids.length ? await usersProfiles(uids) : {};
    setBlockItems(uids.map((uid) => ({ uid, name: (prof[uid] && ((prof[uid].pub && prof[uid].pub.nickname) || prof[uid].username)) || t("알 수 없는 사용자") })));
    setBlockLoading(false);
  };
  const unblockFromList = async (uid) => { if (await chatBlockSet(myUid, uid, false)) setBlockItems((l) => l.filter((x) => x.uid !== uid)); };
  const [devLogOpen, setDevLogOpen] = useState(false);
  // (v0.3.9 기능) 사용자 요청 — 로그아웃 상태에서 뜨는 "계정" 박스와 같은 자리에, 로그인 상태에서는
  // OpenChess 프로필의 상단 요소(아바타·칭호·닉네임·소개, MyProfileCard 최상단과 같은 구성)를 압축해
  // 보여주고 "자세히 보기"로 전체 프로필 카드(ProfileWindow)를 연다 — 헤더 드롭다운의 화살표 버튼과
  // 정확히 같은 모달이라, 이 탭에서도 같은 방식으로 연다(ProfileWindow가 필요로 하는 prop은 이미 이
  // 컴포넌트 호출부가 다 넘겨주고 있었다 — v0.3.8에서 상시 표시 MyProfileCard를 뺄 때 구조 분해에서만
  // 빠졌던 것들을 다시 받는다).
  const [profileWinOpen, setProfileWinOpen] = useState(false);
  // (v0.4.6 기능, 사용자 요청) 로그아웃 상태에서 친구 초대 링크를 열면 이 탭으로 넘어오면서
  // loginShakeTick이 바뀐다 — 그 순간에만 잠깐(lineShake 3회, 약 1.7초) 아래 계정 박스를 흔들어
  // "로그인이 필요하다"는 신호를 준다.
  const [loginShaking, setLoginShaking] = useState(false);
  useEffect(() => {
    if (!loginShakeTick) return; // 초기값(0)에는 흔들지 않는다 — tick이 실제로 1 이상 올라간 순간에만
    setLoginShaking(true);
    const t = setTimeout(() => setLoginShaking(false), 1700);
    return () => clearTimeout(t);
  }, [loginShakeTick]);
  const card = { background: T.paper, borderRadius: 14, padding: 16, border: "1px solid #DCCBA8", marginTop: 12, boxShadow: "0 1px 0 rgba(255,255,255,.5) inset, 0 4px 14px rgba(20,10,4,.12)" };
  // (v0.6.0, 설정 탭 정리) 카드 제목을 아이콘 + 굵은 글씨로 통일. 카드마다 제각각이던 제목 크기·간격을 한 곳에서 맞춘다.
  const cardTitle = (Icon, text) => (
    <div className="flex items-center gap-2" style={{ marginBottom: 12 }}>
      <Icon size={16} style={{ color: T.brass, flexShrink: 0 }} />
      <span style={{ fontSize: 14, fontWeight: 800, color: T.ink }}>{text}</span>
    </div>
  );
  // (v0.3.5 기능) 사용자 요청 — 흩어져 있던 개발자 전용 패널(자원 조정·공동 개발자 지정·일일 퍼즐
  // 관리·퍼즐 일괄 재생성)을 설정 탭 맨 아래 카드 하나("개발자 도구")로 모았다. 개발자/공동 개발자
  // 모드를 막 켰을 때만(false→true로 바뀐 순간) 이 블록으로 자동 스크롤한다 — 이미 켜진 채로
  // 새로고침·재접속한 경우(마운트 시점부터 true)에는 스크롤하지 않는다.
  const devToolsRef = useRef(null);
  const prevCanEditRef = useRef(canEdit);
  useEffect(() => {
    if (canEdit && !prevCanEditRef.current) {
      const id = requestAnimationFrame(() => { devToolsRef.current && devToolsRef.current.scrollIntoView({ behavior: "smooth", block: "start" }); });
      prevCanEditRef.current = canEdit;
      return () => cancelAnimationFrame(id);
    }
    prevCanEditRef.current = canEdit;
  }, [canEdit]);
  // (UX6) 존재하지 않는 아이디를 공동 개발자로 등록할 수 없도록, 추가 전 실제 계정 존재 여부를 확인한다.
  const addCodev = async () => {
    const id = codevId.trim();
    if (!ALNUM.test(id) || id === DEV_ACCOUNT) { setCodevErr(t("아이디 형식이 올바르지 않음")); return; }
    setCodevBusy(true); setCodevErr("");
    const found = await userProfile(id);
    setCodevBusy(false);
    if (!found) { setCodevErr(t("존재하지 않는 아이디")); return; }
    if (!CONTENT.codev.includes(found.username)) CONTENT.codev.push(found.username);
    await bumpContent();
    setCodevId(""); setCodevErr("");
  };
  const removeCodev = async (id) => { CONTENT.codev = CONTENT.codev.filter((x) => x !== id); await bumpContent(); };
  return (
    <div className="max-w-xl mx-auto settings-root">
      {/* (v0.5.7, 사용자 요청 "데스크톱 레이아웃 비효율") 넓은 화면에선 576px 한 줄로 카드 8~9장이 길게 이어져 양옆이 비었다 —
          카드를 두 단(CSS 다단, 위→아래 읽는 순서 유지)으로 흘려 한 화면에 더 많이 보이게 한다. 개발자 도구는 폭이 필요해 단 밖 아래에 둔다.
          단이 나뉘는 자리에선 위 여백이 잘려 오른쪽 단이 14px 올라가므로, 단 안에서는 카드 간격을 아래 여백으로 준다. */}
      <style>{"@media (min-width:1000px){.settings-root{max-width:1080px !important}.settings-cols{column-count:2;column-gap:18px}.settings-cols{padding-top:14px}.settings-cols>*{break-inside:avoid;margin-top:0 !important;margin-bottom:14px}}"}</style>
      {/* (버그 수정) 제목 옆 원형 아이콘이 하단 탭바의 설정 아이콘과 중복돼 제거. */}
      <div className="flex items-center gap-2"><h2 style={{ fontSize: 18, fontWeight: 800, color: T.ivoryHi }}>{t("설정")}</h2></div>
      <div className="settings-cols">

      {/* 계정 — 로그아웃 상태에서는 로그인 유도, 로그인 상태에서는 같은 자리에 프로필 미리보기(v0.3.9). */}
      {!user ? (
        <div style={{ ...card, animation: loginShaking ? "lineShake .55s ease 3" : "none" }}>
          {cardTitle(User, t("계정"))}
          <div className="flex items-center justify-between gap-3"><span style={{ fontSize: 12.5, color: T.inkSoft, minWidth: 0 }}>{t("로그인하면 진도가 계정에 저장됨")}</span><button onClick={() => openAuth("login")} className="press" style={{ flexShrink: 0, whiteSpace: "nowrap", padding: "7px 14px", borderRadius: 8, background: "linear-gradient(180deg,#3A2516,#241509)", color: T.ivoryHi, fontWeight: 700, border: "none", cursor: "pointer" }}>{t("로그인 / 회원가입")}</button></div>
        </div>
      ) : (
        <div style={card}>
          <div className="flex items-center justify-between" style={{ marginBottom: 12 }}>
            <span style={{ fontSize: 13, fontWeight: 700, color: T.ink, fontFamily: SITE_FONT }}>@{(profile.displayId || user)}{roleIcon(user)}</span>
            <div className="flex items-center gap-2">
              {/* (v0.4.3 기능, 사용자 요청) 로그인 수단 연결/해제·로그아웃·계정 탈퇴 — 계정 센터. */}
              {/* (버그 수정, 사용자 요청) 두 버튼이 패딩·폰트 크기는 같았지만 테두리가 하나만
                  1px solid이고 다른 하나는 none이라, border-box 기준으로 실제 렌더 높이가 2px
                  차이났다 — height를 똑같이 고정해 border 유무와 무관하게 항상 같은 높이가 되게 한다. */}
              <button onClick={onOpenAccountCenter} className="press" style={{ flexShrink: 0, height: 30, padding: "0 13px", borderRadius: 8, background: T.ebony2, color: T.ivory, fontWeight: 700, fontSize: 12, border: "1px solid #000", cursor: "pointer" }}>{t("계정 센터")}</button>
              <button onClick={() => setProfileWinOpen(true)} className="press" style={{ flexShrink: 0, height: 30, padding: "0 13px", borderRadius: 8, background: "linear-gradient(180deg,#3A2516,#241509)", color: T.ivoryHi, fontWeight: 700, fontSize: 12, border: "none", cursor: "pointer" }}>{t("자세히 보기")}</button>
            </div>
          </div>
          <div className="flex items-center gap-3">
            {profile.photo ? <img src={profile.photo} alt="" style={{ width: 56, height: 56, borderRadius: 14, objectFit: "cover", border: "1px solid #C9B58C", ...(gmPhotoRingStyle(tierFromXp(totalXp || 0).tier.key === "grandmaster") || {}) }} />
              : <span style={{ width: 56, height: 56, borderRadius: 14, background: "linear-gradient(180deg," + T.brass + ",#A8842F)", color: "#241509", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 800, fontSize: 22, flexShrink: 0 }}>{(profile.nickname || user || "?")[0].toUpperCase()}</span>}
            <div style={{ minWidth: 0 }}>
              <div style={{ fontSize: 16, fontWeight: 800, color: T.ink }}>{profile.nickname || profile.displayId || user}</div>
              {profile.bio && <div style={{ fontSize: 12, color: T.ink, marginTop: 4, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{profile.bio}</div>}
            </div>
          </div>
        </div>
      )}
      {profileWinOpen && user && (
        <ProfileWindow onClose={() => setProfileWinOpen(false)} profile={profile} setProfile={setProfile} user={user} myUid={myUid} currentTitle={currentTitle} totalXp={totalXp} puzzleRating={puzzleRating} solvedCount={solvedCount}
          onOpenOpening={onOpenOpening} onOpenGame={onOpenGame} onOpenGameAnalyze={onOpenGameAnalyze} mainQuest={mainQuest} puzzles={puzzles} solved={solved} likedPuzzles={likedPuzzles} likeCounts={likeCounts}
          onToggleLike={onToggleLike} repostedPuzzles={repostedPuzzles} repostCounts={repostCounts} onToggleRepost={onToggleRepost} shareCounts={shareCounts} onShare={onShare} onOpenPuzzle={onOpenPuzzle} reviewUnlocked={reviewUnlocked} engine={engine} earnedTitles={earnedTitles} onEquipTitle={onEquipTitle} isDev={isDev} isCodev={isCodev}
          devOn={devOn} codevOn={codevOn} chesscomStatus={chesscomStatus} chesscom={chesscom} />
      )}
      {/* (v0.6.0, 다국어) 언어 선택 — 바꾸면 저장 후 새로고침(모듈 최상위 문구까지 전부 새 언어로 다시 만들기 위해). 진행 중인 대국은 새로고침 후 이어받기. */}
      <div style={card}>
        {cardTitle(Globe, lang === "en" ? t("언어") : t("언어") + " / Language")}
        <LangPicker />
        <p style={{ fontSize: 11, color: T.inkSoft, margin: "8px 2px 0" }}>{t("선택하면 페이지가 새로고침됨")}</p>
        <UgcTranslateToggle />
      </div>

      {/* (18차 UI10) 개발자/공동 개발자 모드 — 블록·설명 없이 온오프 토글 한 줄만 */}
      {isDev && (
        <div className="flex items-center justify-between" style={{ marginTop: 14, padding: "6px 2px" }}>
          <div className="flex items-center gap-2"><Crown size={15} style={{ color: T.brass }} /><span style={{ fontSize: 13, fontWeight: 700, color: T.ivoryHi }}>{t("개발자 모드")}</span></div>
          <button onClick={() => setDevOn((v) => !v)} className="press" style={{ width: 46, height: 26, borderRadius: 13, background: devOn ? T.excellent : "#C9B58C", position: "relative", cursor: "pointer", border: "none" }}><span style={{ position: "absolute", top: 3, left: devOn ? 23 : 3, width: 20, height: 20, borderRadius: "50%", background: "#fff", transition: "left .15s" }} /></button>
        </div>
      )}
      {isCodev && (
        <div className="flex items-center justify-between" style={{ marginTop: 14, padding: "6px 2px" }}>
          <div className="flex items-center gap-2"><Crown size={15} style={{ color: T.brass }} /><span style={{ fontSize: 13, fontWeight: 700, color: T.ivoryHi }}>{t("공동 개발자 모드")}</span></div>
          <button onClick={() => setCodevOn((v) => !v)} className="press" style={{ width: 46, height: 26, borderRadius: 13, background: codevOn ? T.excellent : "#C9B58C", position: "relative", cursor: "pointer", border: "none" }}><span style={{ position: "absolute", top: 3, left: codevOn ? 23 : 3, width: 20, height: 20, borderRadius: "50%", background: "#fff", transition: "left .15s" }} /></button>
        </div>
      )}

      {/* (v0.3.9 사용자 요청) 내 프로필 카드는 이제 설정 탭에 상시 표시하지 않는다 — 헤더 드롭다운
          (HeaderProfileMenu)의 화살표 버튼으로 여는 별도 "프로필 창"(ProfileWindow, App 루트)으로
          옮겼다. */}

      {/* (v0.2.4 개편 → v0.3.5 통합 → v0.3.9 "리뷰 설정" 카드로 확장) 원래는 분석 엔진 선택만 있던
          카드였다(학습/퍼즐 탭 및 사이트 전반의 분석은 물론 게임 리뷰도 여기서 고른 엔진을 그대로
          쓴다 — 가볍고 빠른 Stockfish 18 Lite가 기본값이고, Stockfish 17.1이나 Stockfish 18(둘 다
          초기 로딩 용량이 크지만 더 강력함, 그중 18이 셋 중 가장 강력함)로 바꿀 수 있다). 사용자
          요청으로 게임 리뷰에만 영향을 주는 두 설정 — 리뷰 속도(더 빠르게/더 정확하게)와 포지션
          변동성 보정 on/off — 을 같은 카드에 추가해 "리뷰 설정"으로 확장한다. */}
      <div style={card}>
        <div className="flex items-center justify-between" style={{ marginBottom: 12 }}>
          <div className="flex items-center gap-2"><SlidersHorizontal size={16} style={{ color: T.brass }} /><span style={{ fontSize: 14, fontWeight: 800, color: T.ink }}>{t("리뷰 설정")}</span></div>
          <span className="flex items-center gap-1" style={{ fontSize: 10.5, fontWeight: 700, color: engineStatus === "ready" ? T.best : engineStatus === "off" ? T.blunder : T.inkSoft }}>
            {engineStatus === "ready" ? <Wifi size={12} /> : engineStatus === "off" ? <WifiOff size={12} /> : <Cpu size={12} />}
            {engineStatus === "ready" ? t("연결됨") : engineStatus === "off" ? t("연결 실패") : t("불러오는 중…")}
          </span>
        </div>
        <div style={{ fontSize: 11, fontWeight: 700, color: T.inkSoft, marginBottom: 6 }}>{t("분석 엔진")}</div>
        {/* (v0.5.1 기능) Stockfish 18은 신경망 파일이 108MB나 돼 느린 회선에서는 부팅에 몇 분씩 걸릴 수
            있다(실제 재현 사례) — "불러오는 중…"이 오래 떠 있으면 멈춘 것처럼 보이므로, 이 프로필을
            고른 채 아직 연결되지 않은 동안에는 그 이유를 짧게 안내한다. */}
        {enginePref === "full18" && engineStatus !== "ready" && engineStatus !== "off" && (
          <div style={{ fontSize: 10.5, color: T.inkSoft, marginBottom: 6 }}>{t("신경망 파일(108MB)이 커서 회선에 따라 부팅에 몇 분 소요")}</div>
        )}
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {ANALYSIS_ENGINE_IDS.map((id) => {
            const p = ENGINE_PROFILES[id];
            const on = enginePref === p.id;
            // (v0.6.3, 앱) 앱에 포함되지 않은 큰 엔진은 선택 대신 내려받기 행으로 보여 준다.
            if (engineNeedsDownload(id)) return <EngineDownloadRow key={p.id} id={p.id} label={p.label} />;
            return (
              <button key={p.id} onClick={() => setEnginePref(p.id)} className="press"
                style={{ textAlign: "left", padding: "10px 12px", borderRadius: 10, cursor: "pointer",
                  border: "1.5px solid " + (on ? T.brass : "#DCCBA8"), background: on ? "rgba(196,154,80,.12)" : "#fff" }}>
                <div className="flex items-center gap-2">
                  <span style={{ width: 16, height: 16, borderRadius: "50%", border: "2px solid " + (on ? T.brass : "#C9B58C"), background: on ? T.brass : "transparent", flexShrink: 0 }} />
                  <span style={{ fontSize: 13, fontWeight: 800, color: T.ink }}>{p.label}</span>
                </div>
              </button>
            );
          })}
          {/* (v0.6.3, 앱) 내려받은 큰 엔진 삭제 — 저장 공간 확보. 지금 쓰는 엔진은 지울 수 없다. */}
          {ANALYSIS_ENGINE_IDS.filter((id) => HEAVY_ENGINE_IDS.includes(id) && engineDownloadState(id).status === "ready" && engineUsable(id) && isNativeApp() && enginePref !== id).map((id) => (
            <button key={"del-" + id} onClick={() => deleteDownloadedEngine(id).then(() => bumpEngineUi())} className="press" style={{ alignSelf: "flex-start", background: "none", border: "none", padding: "2px 4px", fontSize: 10.5, fontWeight: 700, color: T.inkSoft, textDecoration: "underline", cursor: "pointer" }}>{ENGINE_PROFILES[id].label + " " + t("삭제")}</button>
          ))}
        </div>
        <p style={{ fontSize: 10.5, color: T.inkSoft, marginTop: 8 }}>{t("변경 즉시 새 엔진으로 재연결. 게임 리뷰에도 적용, 이 기기에만 저장")}</p>

        <div style={{ height: 1, background: "#E4D5B6", margin: "14px 0" }} />

        {/* (v0.3.9 기능) 사용자 요청 — 게임 리뷰의 분석 속도/정확도를 선택. "더 빠르게"는 기존
            그대로(REVIEW_DEPTH=20), "더 정확하게"는 포지션당 depth 상한을 25로 올린다 — movetime은
            그대로라 예전엔 depth 20에서 일찍 끝나던 쉬운 포지션들도 남는 시간을 마저 써서 depth
            25까지 더 파고들게 되고, 그만큼 리뷰 전체 시간도 자연히 늘어난다. */}
        <div style={{ fontSize: 11, fontWeight: 700, color: T.inkSoft, marginBottom: 6 }}>{t("리뷰 속도")}</div>
        <div style={{ display: "flex", gap: 8 }}>
          {[{ id: "fast", label: t("더 빠르게"), desc: "depth=" + REVIEW_DEPTH }, { id: "accurate", label: t("더 정확하게"), desc: "depth=25" }].map((o) => {
            const on = reviewSpeed === o.id;
            return (
              <button key={o.id} onClick={() => setReviewSpeed(o.id)} className="press"
                style={{ flex: 1, textAlign: "left", padding: "10px 12px", borderRadius: 10, cursor: "pointer",
                  border: "1.5px solid " + (on ? T.brass : "#DCCBA8"), background: on ? "rgba(196,154,80,.12)" : "#fff" }}>
                <div className="flex items-center gap-2" style={{ marginBottom: 2 }}>
                  <span style={{ width: 16, height: 16, borderRadius: "50%", border: "2px solid " + (on ? T.brass : "#C9B58C"), background: on ? T.brass : "transparent", flexShrink: 0 }} />
                  <span style={{ fontSize: 13, fontWeight: 800, color: T.ink }}>{o.label}</span>
                </div>
                <div style={{ fontSize: 10, color: T.inkSoft, marginLeft: 24 }}>{o.desc}</div>
              </button>
            );
          })}
        </div>

        <div style={{ height: 1, background: "#E4D5B6", margin: "14px 0" }} />

        {/* (v0.3.9 기능) 사용자 요청 — 포지션 변동성 보정(후보 수끼리 평가가 얼마나 팽팽했는지에 따라
            그 수의 손실을 더 엄격하게/관대하게 반영하는, chess.com 실제 방식을 본뜬 가중치) 자체를
            켜고 끌 수 있게 한다. 꺼도 재분석은 필요 없다 — 이미 저장된 손실·날카로움 값에서 최종
            정확도로 변환하는 마지막 단계만 건너뛴다(reviewPhaseAccuracy/buildRevealData 참고). */}
        <div className="flex items-center justify-between">
          <div>
            <div style={{ fontSize: 12.5, fontWeight: 700, color: T.ink }}>{t("포지션 변동성 보정")}</div>
            <div style={{ fontSize: 10, color: T.inkSoft, marginTop: 1 }}>{t("날카로운 포지션의 실수를 더 엄격하게 반영")}</div>
          </div>
          <button onClick={() => setSharpOn(!sharpOn)} className="press" style={{ width: 46, height: 26, borderRadius: 13, background: sharpOn ? T.excellent : "#C9B58C", position: "relative", cursor: "pointer", border: "none", flexShrink: 0 }}><span style={{ position: "absolute", top: 3, left: sharpOn ? 23 : 3, width: 20, height: 20, borderRadius: "50%", background: "#fff", transition: "left .15s" }} /></button>
        </div>
      </div>

      {/* (사용자 요청) 퍼즐 설정 — 라인 클리어·퍼즐 클리어 애니메이션과 퍼즐 풀이 중 코치 말풍선
          표시를 각각 켜고 끌 수 있다. 기본값은 모두 켜짐이고, 계정에 영구 저장된다(위 큰 로컬
          캐시·Supabase user_progress에 같이 실림 — 리뷰 속도 등과 달리 이 기기만이 아니라 다른
          기기에서 로그인해도 그대로 따라온다). */}
      <div style={card}>
        {cardTitle(Puzzle, t("퍼즐 설정"))}
        {[
          { label: t("LINE CLEAR 애니메이션"), desc: t("라인 클리어 시 배너 표시"), on: lineClearOn, set: setLineClearOn },
          { label: t("PUZZLE CLEAR 애니메이션"), desc: t("퍼즐의 모든 라인 클리어 시 배너 표시"), on: puzzleClearOn, set: setPuzzleClearOn },
          { label: t("코치 말풍선"), desc: t("퍼즐 풀이 중 코치 말풍선 표시"), on: coachBubbleOn, set: setCoachBubbleOn },
        ].map((o, i) => (
          <React.Fragment key={o.label}>
            {i > 0 && <div style={{ height: 1, background: "#E4D5B6", margin: "14px 0" }} />}
            <div className="flex items-center justify-between">
              <div>
                <div style={{ fontSize: 12.5, fontWeight: 700, color: T.ink }}>{o.label}</div>
                <div style={{ fontSize: 10, color: T.inkSoft, marginTop: 1 }}>{o.desc}</div>
              </div>
              <button onClick={() => o.set(!o.on)} className="press" style={{ width: 46, height: 26, borderRadius: 13, background: o.on ? T.excellent : "#C9B58C", position: "relative", cursor: "pointer", border: "none", flexShrink: 0 }}><span style={{ position: "absolute", top: 3, left: o.on ? 23 : 3, width: 20, height: 20, borderRadius: "50%", background: "#fff", transition: "left .15s" }} /></button>
            </div>
          </React.Fragment>
        ))}
      </div>

      {/* (v0.1.4 기능) 사운드 — 배경음악·효과음 켜기/끄기와 세부 음량을 이 카드 하나로 모은다.
          (헤더에는 따로 두지 않는다 — 조절은 항상 설정 탭에서만.) */}
      <div style={card}>
        {cardTitle(Volume2, t("사운드"))}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            {bgmOn ? <Volume2 size={15} style={{ color: T.brass }} /> : <VolumeX size={15} style={{ color: T.inkSoft }} />}
            <span style={{ fontSize: 12.5, fontWeight: 700, color: T.ink }}>{t("배경음악")}</span>
          </div>
          <button onClick={onToggleBgm} className="press" style={{ width: 46, height: 26, borderRadius: 13, background: bgmOn ? T.excellent : "#C9B58C", position: "relative", cursor: "pointer", border: "none" }}><span style={{ position: "absolute", top: 3, left: bgmOn ? 23 : 3, width: 20, height: 20, borderRadius: "50%", background: "#fff", transition: "left .15s" }} /></button>
        </div>
        <input type="range" min={0} max={1} step={0.05} value={bgmVolume} onChange={(e) => onBgmVolumeChange(parseFloat(e.target.value))} disabled={!bgmOn} aria-label={t("배경음악 음량")} style={{ width: "100%", marginTop: 8, accentColor: T.brass, opacity: bgmOn ? 1 : 0.4, cursor: bgmOn ? "pointer" : "default" }} />

        <div style={{ height: 1, background: "#E4D5B6", margin: "14px 0" }} />

        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            {sfxOn ? <Volume2 size={15} style={{ color: T.brass }} /> : <VolumeX size={15} style={{ color: T.inkSoft }} />}
            <span style={{ fontSize: 12.5, fontWeight: 700, color: T.ink }}>{t("효과음")}</span>
          </div>
          <button onClick={onToggleSfx} className="press" style={{ width: 46, height: 26, borderRadius: 13, background: sfxOn ? T.excellent : "#C9B58C", position: "relative", cursor: "pointer", border: "none" }}><span style={{ position: "absolute", top: 3, left: sfxOn ? 23 : 3, width: 20, height: 20, borderRadius: "50%", background: "#fff", transition: "left .15s" }} /></button>
        </div>
        <input type="range" min={0} max={1} step={0.05} value={sfxVolume} onChange={(e) => onSfxVolumeChange(parseFloat(e.target.value))} disabled={!sfxOn} aria-label={t("효과음 음량")} style={{ width: "100%", marginTop: 8, accentColor: T.brass, opacity: sfxOn ? 1 : 0.4, cursor: sfxOn ? "pointer" : "default" }} />
      </div>

      {/* (v0.5.5, 사용자 요청) 시각 효과 — 수 등급 이펙트(분석·학습·퍼즐 탭, 리뷰 페이지, 무한 체크메이트 게임). v0.6.3부터 모든 등급을
          지원하고 표시 범위를 고른다(기본 모두 표시), 계정에 저장된다. */}
      <div style={card}>
        {cardTitle(Sparkles, t("시각 효과"))}
        {/* (v0.6.3, 사용자 요청) 온·오프 토글 대신 표시 범위 선택 — 모두 표시 / 탁월한 수·유일한 수만 / 표시하지 않음. */}
        <div>
          <label htmlFor="move-fx-mode" style={{ display: "block", fontSize: 12.5, fontWeight: 700, color: T.ink }}>{t("수 등급 이펙트")}</label>
          <div style={{ fontSize: 10, color: T.inkSoft, marginTop: 1, marginBottom: 8 }}>{t("수를 두면 보드에 표시할 등급 이펙트의 범위")}</div>
          <select id="move-fx-mode" value={normalizeMoveFxMode(moveFxMode)} onChange={(e) => setMoveFxMode(normalizeMoveFxMode(e.target.value))}
            style={{ width: "100%", padding: "10px 12px", borderRadius: 10, border: "1.5px solid #C9B58C", background: "#fff", color: T.ink, fontSize: 12.5, fontWeight: 700, cursor: "pointer", boxSizing: "border-box" }}>
            <option value="all">{t("모두 표시")}</option>
            <option value="key">{t("탁월한 수 및 유일한 수만 표시")}</option>
            <option value="off">{t("표시하지 않음")}</option>
          </select>
        </div>
        <div style={{ height: 1, background: "#E4D5B6", margin: "14px 0" }} />
        {/* (v0.5.5) 통제 칸 표시 — 나이트 레이스·백랭크 러시아워에서 상대 기물이 통제하는(들어가면 잡히는) 칸을 보드에 빨갛게 표시할지. 기본 꺼짐. v0.6.0에서 미니게임 설정 카드를 없애고 시각 효과로 합침. */}
        <div className="flex items-center justify-between">
          <div>
            <div style={{ fontSize: 12.5, fontWeight: 700, color: T.ink }}>{t("통제 칸 표시")}</div>
            <div style={{ fontSize: 10, color: T.inkSoft, marginTop: 1 }}>{t("나이트 레이스·백랭크 러시아워에서 상대 기물이 통제하는 칸 표시")}</div>
          </div>
          <button onClick={() => setMgDangerOn(!mgDangerOn)} aria-pressed={!!mgDangerOn} aria-label={t("통제 칸 표시")} className="press" style={{ width: 46, height: 26, borderRadius: 13, background: mgDangerOn ? T.excellent : "#C9B58C", position: "relative", cursor: "pointer", border: "none", flexShrink: 0 }}><span style={{ position: "absolute", top: 3, left: mgDangerOn ? 23 : 3, width: 20, height: 20, borderRadius: "50%", background: "#fff", transition: "left .15s" }} /></button>
        </div>
      </div>

      {/* (18차 보충 기능3) 전역 퍼즐 수 길이 상한 설정은 삭제 — 개별 퍼즐의 수 길이는 퍼즐 풀이 창에서 개발자가 직접 조정한다. */}

      {/* (2차 개편) 이론 수 체계 추가는 도감 탭(오프닝)으로 이동 — 설정 탭에는 더 이상 두지 않는다. */}

      {/* 개발진 명단 (수 기호 안내 대체) */}
      <div style={card}>
        {cardTitle(Users, t("개발진"))}
        <div className="flex items-center gap-2" style={{ marginBottom: 6 }}>
          {/* (사용자 요청) 개발자 이름 왼쪽의 왕관 아이콘을 없앤다. (사용자 요청) 이름을 누르면 그
              아이디의 프로필로 이동한다. */}
          <button onClick={() => onOpenUserProfile && onOpenUserProfile(DEV_ACCOUNT)} className="press" style={{ display: "inline-flex", alignItems: "center", gap: 4, fontSize: 13.5, fontWeight: 800, color: T.cocoa || "#5A3A22", background: "none", border: "none", padding: 0, cursor: onOpenUserProfile ? "pointer" : "default" }}>{DEV_ACCOUNT}</button>
          <span style={{ fontSize: 11, color: T.inkSoft }}>{t("개발자")}</span>
        </div>
        {(CONTENT.codev || []).length === 0 ? <div style={{ fontSize: 12, color: T.inkSoft }}>{t("등록된 공동 개발자 없음")}</div>
          : (CONTENT.codev || []).map((id) => (
            <div key={id} className="flex items-center justify-between" style={{ marginBottom: 4 }}>
              <span style={{ fontSize: 13, fontWeight: 700, color: T.ink }}>
                <button onClick={() => onOpenUserProfile && onOpenUserProfile(id)} className="press" style={{ background: "none", border: "none", padding: 0, fontSize: 13, fontWeight: 700, color: T.ink, cursor: onOpenUserProfile ? "pointer" : "default" }}>{codevDisplayIds[id] || id}</button>{" "}
                <span style={{ fontSize: 11, color: T.inkSoft, fontWeight: 500 }}>{t("공동 개발자")}</span>
              </span>
              {canManageCodev && <button onClick={() => removeCodev(id)} className="press" style={{ fontSize: 10.5, padding: "2px 8px", borderRadius: 6, border: "1px solid " + T.blunder, background: "transparent", color: T.blunder, cursor: "pointer" }}>{t("해제")}</button>}
            </div>
          ))}
        {/* (v0.2.0) 업데이트 공지 팝업은 버전마다 최초 접속 시 한 번만 뜨고 다시 안 뜨므로, 그
            내용(버전·날짜·항목·참여 개발자)을 여기 "개발자 기록"으로 항상 남겨 언제든 다시 볼 수 있게 한다. */}
        <button onClick={() => setDevLogOpen((v) => !v)} className="press flex items-center justify-between" style={{ width: "100%", marginTop: 10, padding: "8px 10px", borderRadius: 8, border: "1px solid #DCCBA8", background: devLogOpen ? "#0000000d" : "transparent", color: T.ink, fontSize: 12.5, fontWeight: 700, cursor: "pointer" }}>{tx("개발자 기록 {0}", devLogOpen ? <ChevronUp size={14} /> : <ChevronDown size={14} />)}
        </button>
        {devLogOpen && (
          <div style={{ marginTop: 10, maxHeight: 320, overflowY: "auto", paddingRight: 4 }}>
            {CHANGELOG.map((v, i) => (
              <div key={v.version} style={{ marginBottom: 12, paddingBottom: 12, borderBottom: i < CHANGELOG.length - 1 ? "1px dashed #DCCBA8" : "none" }}>
                <div className="flex items-center gap-2" style={{ marginBottom: 4 }}>
                  <span style={{ fontSize: 12, fontWeight: 800, color: i === 0 ? T.brass : T.inkSoft, fontFamily: SITE_FONT }}>v{v.version}</span>
                  <span style={{ fontSize: 10.5, color: T.inkSoft }}>{v.date}</span>
                </div>
                <ul style={{ margin: 0, paddingLeft: 16 }}>
                  {v.items.map((t, j) => <li key={j} style={{ fontSize: 11.5, color: T.ink, fontWeight: 600, lineHeight: 1.55, marginBottom: 3 }}>{t}</li>)}
                </ul>
                {v.dev && v.dev.length > 0 && <div style={{ fontSize: 10.5, color: T.inkSoft, marginTop: 3 }}>{tx("개발: {0}", v.dev.join(", "))}</div>}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* (18차 UI10) chess.com 연동 UI는 프로필 편집 모달 안으로 이동 */}

      {/* (v0.6.0) 차단 목록 — 로그인한 경우만 */}
      {myUid && (
        <div style={card}>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2"><Users size={15} style={{ color: T.brass }} /><span style={{ fontSize: 13, fontWeight: 700, color: T.ink }}>{t("차단 목록")}</span></div>
            <button onClick={openBlockList} className="press" style={{ padding: "6px 13px", borderRadius: 8, background: T.ebony2, color: T.ivory, fontWeight: 700, fontSize: 12, border: "1px solid #000", cursor: "pointer" }}>{t("관리")}</button>
          </div>
        </div>
      )}
      {/* 문의 / FAQ */}
      <div style={card}>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2"><HelpCircle size={15} style={{ color: T.brass }} /><span style={{ fontSize: 13, fontWeight: 700, color: T.ink }}>{t("문의 / FAQ")}</span></div>
          <div className="flex items-center gap-2">
            {/* (v0.4.3 기능, 사용자 요청) /about처럼 반응형 타이포그래피·애니메이션 중심으로 만든
                별도 FAQ 페이지(/faq) — 이 카드에서 실제 페이지 이동(같은 탭 새 로드)으로 연결한다. */}
            <a href="/faq" className="press" style={{ padding: "6px 13px", borderRadius: 8, background: T.ebony2, color: T.ivory, fontWeight: 700, fontSize: 12, border: "1px solid #000", textDecoration: "none" }}>{t("FAQ 보기")}</a>
            <a href="/terms" className="press" style={{ padding: "6px 13px", borderRadius: 8, background: T.ebony2, color: T.ivory, fontWeight: 700, fontSize: 12, border: "1px solid #000", textDecoration: "none" }}>{t("이용약관")}</a>
            <a href="/privacy" className="press" style={{ padding: "6px 13px", borderRadius: 8, background: T.ebony2, color: T.ivory, fontWeight: 700, fontSize: 12, border: "1px solid #000", textDecoration: "none" }}>{t("개인정보처리방침")}</a>
            <button onClick={() => setInquiryOpen(true)} className="press" style={{ padding: "6px 13px", borderRadius: 8, background: "linear-gradient(180deg,#3A2516,#241509)", color: T.ivoryHi, fontWeight: 700, fontSize: 12, border: "none", cursor: "pointer" }}>{t("문의하기")}</button>
          </div>
        </div>
        <p style={{ fontSize: 11.5, color: T.inkSoft, marginTop: 6 }}>{t("자주 묻는 질문 확인 또는 이메일 문의")}</p>
      </div>
      </div>
      {inquiryOpen && <InquiryModal onClose={() => setInquiryOpen(false)} user={user} />}
      <AnimatePresence>
        {blockListOpen && <BlockListSheet key="block-list" items={blockItems} loading={blockLoading} onUnblock={unblockFromList} onClose={() => setBlockListOpen(false)} />}
      </AnimatePresence>

      {/* (v0.3.5 기능) 개발자 도구 — 예전엔 페이지 곳곳에 흩어져 있던 개발자 전용 패널을 관련 주제별로
          순서를 맞춰(권한 → 재화·티어 테스트 → 퍼즐 콘텐츠 관리) 카드 하나로 모았다. 스크롤을 내려야
          보이는 "2번째 페이지"처럼 맨 아래에 두고, 개발자/공동 개발자 모드를 막 켠 순간에는
          devToolsRef로 이 블록까지 자동 스크롤한다(위 devToolsRef 선언부 참고). */}
      {canEdit && (
        <div ref={devToolsRef} style={{ ...card, marginTop: 28, border: "1.5px solid " + T.brass, background: "linear-gradient(180deg,#FBF4E2,#F2E8D5)" }}>
          <div className="flex items-center gap-2" style={{ marginBottom: 4 }}>
            <Crown size={16} style={{ color: T.brass }} />
            <div style={{ fontSize: 14, fontWeight: 800, color: T.ink }}>{t("개발자 도구")}</div>
          </div>
          <p style={{ fontSize: 11, color: T.inkSoft, marginBottom: 14 }}>{isCodev && codevOn && !(isDev && devOn) ? t("공동 개발자 모드는 임명 권한을 제외한 모든 기능 사용 가능") : t("개발자 전용 도구")}</p>

          {canManageCodev && (
            <>
              <div style={{ fontSize: 12.5, fontWeight: 700, color: T.ink, marginBottom: 8 }}>{t("공동 개발자 지정")}</div>
              <div className="flex gap-2"><input value={codevId} onChange={(e) => { setCodevId(e.target.value); setCodevErr(""); }} placeholder={t("아이디 (영문+숫자)")} style={{ flex: 1, padding: "9px 11px", borderRadius: 9, border: "1px solid #C9B58C", background: "#fff", color: T.ink }} /><button onClick={addCodev} disabled={codevBusy} className="press" style={{ padding: "9px 16px", borderRadius: 9, background: "linear-gradient(180deg,#3A2516,#241509)", color: T.ivoryHi, fontWeight: 700, border: "none", cursor: "pointer" }}>{codevBusy ? t("확인 중…") : t("추가")}</button></div>
              {codevErr && <p style={{ fontSize: 11, color: T.blunder, marginTop: 6 }}>{codevErr}</p>}
              <p style={{ fontSize: 11, color: T.inkSoft, marginTop: 6 }}>{tx("공동 개발자는 트리·분기점·해설 {0}만 가능. 수정·삭제 불가", <b>{t("추가")}</b>)}</p>
              <div style={{ height: 1, background: "#E4D5B6", margin: "16px 0" }} />
            </>
          )}

          {/* (기능) 티어/경험치 승급 연출·색상·토스트를 실제로 몇 주씩 퍼즐을 풀지 않고도 바로
              확인할 수 있도록, 누적 경험치를 자유롭게 더하거나 특정 티어로 곧장 점프한다. */}
          <DevResourcePanel totalXp={totalXp} setTotalXp={setTotalXp} ocCoins={ocCoins} setOcCoins={setOcCoins} card={{}} />
          <div style={{ height: 1, background: "#E4D5B6", margin: "16px 0" }} />
          <DailyPuzzleDevPanel card={{}} />
          <div style={{ height: 1, background: "#E4D5B6", margin: "16px 0" }} />
          <PuzzleBatchRegenPanel engine={engine} bumpContent={bumpContent} card={{}} />
          <div style={{ height: 1, background: "#E4D5B6", margin: "16px 0" }} />
          <PuzzleControlCenterPanel engine={engine} bumpContent={bumpContent} card={{}} />
          {/* (v0.6.1, 사용자 요청) 신고 열람 — 대화 내용이 들어 있어 개발자 계정(공동 개발자 제외)만 */}
          {canManageCodev && (<>
            <div style={{ height: 1, background: "#E4D5B6", margin: "16px 0" }} />
            <ReportsDevPanel />
          </>)}
        </div>
      )}

    </div>
  );
}
/* (v0.4.3 기능) 계정 센터 — 로그인된 상태에서 현재 계정에 연결된 로그인 수단(identities) 목록.
   GoTrue /auth/v1/user는 로그인 응답과 달리 이 계정에 실제로 연결된 identities 배열을 그대로 준다. */
async function getUserIdentities() {
  if (!SB_ON || !SB_TOKEN) return [];
  try {
    const r = await fetch(SB_URL + "/auth/v1/user", { headers: sbHeaders() });
    if (!r.ok) return [];
    const j = await r.json();
    return (j && j.identities) || [];
  } catch { return []; }
}
/* 로그인된 상태에서 새 로그인 수단을 지금 계정에 추가로 연결한다(manual linking) — 일반 로그인용
   /authorize와 달리 "지금 로그인된 사용자에게 연결"이라는 의도를 서버가 알아야 하므로, 그냥
   href로 이동하는 대신 먼저 Authorization 헤더(현재 세션)를 실어 fetch로 리다이렉트 URL을 받아온
   뒤 그 URL로 이동한다. Supabase 대시보드에서 "Allow manual linking"이 켜져 있어야 한다
   (SETUP_OAUTH.md 참고) — 꺼져 있으면 여기서 오류가 난다. */
async function linkIdentityRedirect(provider) {
  if (!SB_ON || !SB_TOKEN) throw new Error("no session");
  const redirect = oauthRedirectUrl();
  const url = SB_URL + "/auth/v1/user/identities/authorize?provider=" + provider + "&redirect_to=" + encodeURIComponent(redirect);
  const r = await fetch(url, { headers: sbHeaders() });
  const j = await r.json().catch(() => null);
  if (!r.ok || !j || !j.url) throw new Error("link_failed");
  await startOAuthNavigation(j.url);
}
/* 연결된 로그인 수단 해제(마지막 하나는 서버가 거부한다 — 로그인 수단이 하나도 없는 계정을 막기
   위한 GoTrue 자체 규칙). */
async function unlinkIdentity(identityId) {
  if (!SB_ON || !SB_TOKEN) throw new Error("no session");
  const r = await fetch(SB_URL + "/auth/v1/user/identities/" + identityId, { method: "DELETE", headers: sbHeaders() });
  if (!r.ok) throw new Error("unlink_failed");
}
// (v0.4.3 기능, 사용자 요청) 계정 센터 — 로그인 수단(이메일/Google/Apple/Facebook) 연결·해제, 로그아웃,
// 계정 탈퇴를 한 곳에서. profiles.id(=auth.users.id)가 이미 "계정 하나에 대응하는 고유 UID"라 —
// 어떤 로그인 수단으로 들어와도 그 UID가 그대로 유지되며, 여기서 다른 수단을 추가로 연결(manual
// linking)해 두면 다음부터 그 수단으로도 같은 계정으로 로그인된다.
const ACCOUNT_CENTER_PROVIDERS = [
  { key: "google", label: "Google", Icon: GoogleG, chip: { background: "#fff", border: "1px solid #CDB98E" } },
  { key: "apple", label: "Apple", Icon: AppleLogo, chip: { background: "#000" } },
  { key: "facebook", label: "Facebook", Icon: FacebookLogo, chip: { background: "#1877F2" } },
];
export function AccountCenterModal({ onClose, myUid, username, onLogoutClick, onAccountDeleted }) {
  const [identities, setIdentities] = useState(null); // null=불러오는 중
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleteTyped, setDeleteTyped] = useState("");
  const [deleteErr, setDeleteErr] = useState("");
  const load = useCallback(async () => { setIdentities(await getUserIdentities()); }, []);
  useEffect(() => { load(); }, [load]);
  // (v0.4.3 기능, 사용자 요청) 계정마다 하나씩 부여되는 9자리 회원 번호(MID, v0.4.4부터 앞 영문
  // 대문자 5자리 + 뒤 숫자 4자리로 형식 고정 — 예: ABCDE1234) — profiles.mid는 가입 시(또는 이
  // 컬럼이 새로 생긴 기존 계정은 최초 조회 시) 서버가 자동으로 채워 두므로, 여기서는 조회만 한다.
  const [mid, setMid] = useState(null); // null=불러오는 중, ""=조회 실패
  const [midCopied, setMidCopied] = useState(false);
  useEffect(() => {
    let cancelled = false;
    if (!myUid) return;
    (async () => {
      try { const rows = await sbSelect("profiles?id=eq." + myUid + "&select=mid&limit=1"); if (!cancelled) setMid((rows && rows[0] && rows[0].mid) || ""); }
      catch { if (!cancelled) setMid(""); }
    })();
    return () => { cancelled = true; };
  }, [myUid]);
  const copyMid = async () => { if (!mid) return; try { await navigator.clipboard.writeText(mid); setMidCopied(true); setTimeout(() => setMidCopied(false), 1500); } catch { } };
  const hasEmail = (identities || []).some((i) => i.provider === "email");
  const linkCount = (identities || []).length;
  const doLink = async (provider) => {
    setErr(""); setBusy(true);
    try { await linkIdentityRedirect(provider); } catch { setErr(t("연결 시작 실패. Supabase 프로젝트에서 이 로그인 방식과 계정 연결(manual linking) 활성화 확인 필요")); setBusy(false); }
  };
  const doUnlink = async (identity) => {
    if (linkCount <= 1) { setErr(t("마지막 로그인 수단은 연결 해제 불가")); return; }
    setErr(""); setBusy(true);
    try { await unlinkIdentity(identity.identity_id); await load(); }
    catch { setErr(t("연결 해제 실패")); }
    finally { setBusy(false); }
  };
  const doDelete = async () => {
    setDeleteErr(""); setBusy(true);
    try { await sbRpc("delete_own_account", {}); onAccountDeleted(); }
    catch { setDeleteErr(t("계정 삭제 실패. 잠시 후 다시 시도")); setBusy(false); }
  };
  const row = { display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, padding: "10px 4px" };
  return (
    <motion.div
      onClick={onClose}
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.18 }}
      style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.6)", zIndex: 86, display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}
    >
      <motion.div
        onClick={(e) => e.stopPropagation()}
        initial={{ opacity: 0, y: 16, scale: 0.97 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: 10, scale: 0.97 }}
        transition={{ type: "spring", stiffness: 340, damping: 28 }}
        style={{ position: "relative", width: "100%", maxWidth: 360, maxHeight: "85vh", overflowY: "auto", background: "linear-gradient(180deg,#F2E8D5,#E2D2B2)", borderRadius: 16, padding: 20, border: "1px solid #CDB98E", boxShadow: "0 20px 50px -10px rgba(0,0,0,.7)" }}
      >
        <button onClick={onClose} className="press" style={{ position: "absolute", top: 12, right: 12, zIndex: 10, width: 28, height: 28, borderRadius: 8, border: "none", background: "#0002", color: T.ink, cursor: "pointer" }}>✕</button>
        <div style={{ fontSize: 17, fontWeight: 800, color: T.ink, marginBottom: 4, paddingRight: 30 }}>{t("계정 센터")}</div>
        <div style={{ fontSize: 12, color: T.inkSoft, marginBottom: 10 }}>@{username}</div>

        {/* (v0.4.3 기능, 사용자 요청) MID — 이 계정 고유의 9자리 영문+숫자 회원 번호. 로그인 수단이
            바뀌어도(연결·해제와 무관) 이 계정(profiles 행) 하나에 항상 같은 값으로 고정돼 있다. */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, padding: "9px 12px", marginBottom: 14, borderRadius: 10, background: "rgba(196,154,80,.12)", border: "1px solid rgba(196,154,80,.35)" }}>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: 10, fontWeight: 800, color: T.brass, letterSpacing: ".06em", marginBottom: 2 }}>MID</div>
            <div style={{ fontSize: 14, fontWeight: 800, color: T.ink, fontFamily: "ui-monospace,monospace", letterSpacing: ".05em" }}>{mid == null ? t("불러오는 중…") : (mid || "—")}</div>
          </div>
          {!!mid && (
            <button onClick={copyMid} className="press" style={{ flexShrink: 0, display: "inline-flex", alignItems: "center", gap: 5, padding: "6px 11px", borderRadius: 8, border: "1px solid #C9B58C", background: "#fff", color: T.ink, fontWeight: 700, fontSize: 11, cursor: "pointer" }}>
              <Copy size={12} />{midCopied ? t("복사됨") : t("복사")}
            </button>
          )}
        </div>
        <InviteLinkBox mid={mid} />


        <div style={{ fontSize: 12.5, fontWeight: 800, color: T.brass, marginBottom: 2 }}>{t("로그인 수단")}</div>
        {identities == null ? (
          <div style={{ fontSize: 12, color: T.inkSoft, padding: "10px 4px" }}>{t("불러오는 중…")}</div>
        ) : (
          <div style={{ borderTop: "1px solid rgba(0,0,0,.08)" }}>
            {hasEmail && (
              <div style={{ ...row, borderBottom: "1px solid rgba(0,0,0,.08)" }}>
                <div className="flex items-center gap-2"><span style={{ width: 26, height: 26, borderRadius: "50%", background: T.ebony2, display: "inline-flex", alignItems: "center", justifyContent: "center" }}><Lock size={13} color={T.ivory} /></span><span style={{ fontSize: 13, fontWeight: 700, color: T.ink }}>{t("이메일·비밀번호")}</span></div>
                <span style={{ fontSize: 11, fontWeight: 700, color: T.best }}>{t("연결됨")}</span>
              </div>
            )}
            {ACCOUNT_CENTER_PROVIDERS.map((p) => {
              const idn = identities.find((i) => i.provider === p.key);
              return (
                <div key={p.key} style={{ ...row, borderBottom: "1px solid rgba(0,0,0,.08)" }}>
                  <div className="flex items-center gap-2"><span style={{ width: 26, height: 26, borderRadius: "50%", display: "inline-flex", alignItems: "center", justifyContent: "center", ...p.chip }}><p.Icon /></span><span style={{ fontSize: 13, fontWeight: 700, color: T.ink }}>{p.label}</span></div>
                  {idn
                    ? <button onClick={() => doUnlink(idn)} disabled={busy} className="press" style={{ padding: "5px 11px", borderRadius: 7, border: "1px solid #C9B58C", background: "transparent", color: T.inkSoft, fontWeight: 700, fontSize: 11, cursor: busy ? "default" : "pointer" }}>{t("연결 해제")}</button>
                    : <button onClick={() => doLink(p.key)} disabled={busy} className="press" style={{ padding: "5px 11px", borderRadius: 7, border: "none", background: "linear-gradient(180deg," + T.brass + ",#A8842F)", color: "#241509", fontWeight: 800, fontSize: 11, cursor: busy ? "default" : "pointer" }}>{t("연결하기")}</button>}
                </div>
              );
            })}
          </div>
        )}
        {err && <div style={{ fontSize: 11.5, color: T.blunder, marginTop: 8, lineHeight: 1.5 }}>{err}</div>}
        <p style={{ fontSize: 10.5, color: T.inkSoft, marginTop: 8, lineHeight: 1.4 }}>{t("어떤 수단으로 로그인해도 같은 계정으로 연결. 다른 기기·로그인 방식을 함께 쓰려면 미리 연결")}</p>

        <div style={{ height: 1, background: "#C9B58C", margin: "16px 0" }} />
        <button onClick={onLogoutClick} className="press" style={{ width: "100%", padding: "10px 0", borderRadius: 10, border: "1px solid " + T.blunder, background: "transparent", color: T.blunder, fontWeight: 800, fontSize: 13, cursor: "pointer", marginBottom: 10 }}>{t("로그아웃")}</button>

        {!confirmDelete ? (
          <button onClick={() => { setConfirmDelete(true); setDeleteTyped(""); setDeleteErr(""); }} className="press" style={{ width: "100%", padding: "10px 0", borderRadius: 10, border: "none", background: "transparent", color: T.inkSoft, fontWeight: 700, fontSize: 11.5, cursor: "pointer", textDecoration: "underline" }}>{t("계정 탈퇴")}</button>
        ) : (
          <div style={{ padding: "12px 13px", borderRadius: 10, background: "rgba(200,69,59,.1)", border: "1px solid " + T.blunder }}>
            <p style={{ fontSize: 12, fontWeight: 700, color: T.ink, lineHeight: 1.6, marginBottom: 8 }}>{t("정말 탈퇴할까요? 프로필·퍼즐·친구·채팅 등 모든 데이터가 영구 삭제되며 되돌릴 수 없음")}</p>
            <input value={deleteTyped} onChange={(e) => setDeleteTyped(e.target.value)} placeholder={t("확인을 위해 \"{0}\" 입력", username)} style={{ width: "100%", padding: "8px 10px", borderRadius: 8, border: "1px solid #C9B58C", background: "#fff", color: T.ink, boxSizing: "border-box", marginBottom: 8, fontSize: 12.5 }} />
            {deleteErr && <div style={{ fontSize: 11.5, color: T.blunder, marginBottom: 8 }}>{deleteErr}</div>}
            <div className="flex gap-2">
              <button onClick={() => setConfirmDelete(false)} className="press" style={{ flex: 1, padding: "8px 0", borderRadius: 8, border: "1px solid #C9B58C", background: "transparent", color: T.ink, fontWeight: 700, fontSize: 12, cursor: "pointer" }}>{t("취소")}</button>
              <button onClick={doDelete} disabled={busy || deleteTyped !== username} className="press" style={{ flex: 1, padding: "8px 0", borderRadius: 8, border: "none", background: T.blunder, color: "#fff", fontWeight: 800, fontSize: 12, cursor: (busy || deleteTyped !== username) ? "default" : "pointer", opacity: (busy || deleteTyped !== username) ? 0.55 : 1 }}>{busy ? t("삭제하는 중…") : t("영구 삭제")}</button>
            </div>
          </div>
        )}
      </motion.div>
    </motion.div>
  );
}