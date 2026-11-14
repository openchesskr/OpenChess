// (v0.7.4) 성장 분석 — 프로필 헤더(/user 상단 정보) + 리뷰 5판 게이트 + 마스터 스타일.
// 약점 지도·복습 카드·오프닝 실수·실수 요약은 "리뷰하는 대로 약점을 분석하고 성장 가능성을 찾는다"는 방향으로 처음부터 다시 설계하려고 모두 삭제했다(전용 라이브러리 3개 포함).
// 마스터 스타일 로직은 lib/masterStyle.js(순수 함수, scripts/check-growth.mjs가 검사).
import { useState, useEffect, useMemo, Fragment, createContext, useContext } from "react";
import { motion } from "framer-motion";
import { OC_EASE } from "../components/motionKit.jsx";
import { isLite } from "../lib/perfMode.js";
import { Search } from "../components/ocIcons.jsx";
import { AnalysisScanner, GrowthFxStyle, Reveal, StatPop, CountDec, CountUpFrom0, ReportStrip } from "./growthMotion.jsx";
import { T } from "../lib/theme.js";
import { SITE_FONT } from "../components/engineLines.jsx";
import { OnlineDot, Board, useNarrow, fmtFull, REVIEW_DEPTH } from "./common.jsx";
import { loadCachedReviewDepth } from "./reviewCache.js";
import { explainMistake } from "../lib/mistakeWhy.js";
import { GROWTH_RECENT_GAMES, recordOf } from "../lib/recentGames.js";
import { recentPerformance, RECENT_PERF_MIN_GAMES } from "../lib/recentPerformance.js";
import { ensureReview, cachedReviewOf, reviewKeyOf } from "./autoReview.js";
import { analyzeGame, buildGrowth, classifyPending, loadCauseCache, saveCauseCache, betterMoves, phaseLabel, causeLabel, causeAdvice, causeWhat, causeWhy, causeFix, splitSteps, pieceLabel, actionLabel, PHASES, MIN_PHASE_GAMES, MIN_TYPE_MOVES } from "../lib/growthAnalysis.js";
import { boardFromSans, moveNumber } from "../lib/chessRules.js";
import { BestMoveJumpButton } from "../components/uiPrimitives.jsx";
import { badgeIcon, QLABEL } from "../components/badges.jsx";
import { gmPhotoRingStyle, tierFromXp } from "../lib/tierSystem.js";
import { SB_ON, sbSelect } from "../lib/supabaseClient.js";
import UgcText from "../components/UgcText.jsx";
import { styleFeatures, retreatStats, RETREAT_GAMES_APP, matchMasters, MIN_STYLE_GAMES, CRITERIA_GROUPS, criterionLabel, criterionGroupLabel, formatCriterion, formatDiff, compareCriteria, levelLabel } from "../lib/masterStyle.js";
import { masterName, masterFlag } from "../data/masterNames.js";
import { MasterNameLink } from "../components/masterLink.jsx";   // (v0.7.6) 마스터 이름 → /master 페이지
import { masterInfoLine } from "../lib/masterSearchInfo.js";
import { rankMasterMatches } from "../lib/masterNameSearch.js";
import { SearchResultRow, searchDropStyle } from "../components/searchResultRow.jsx";
import { t } from "../lib/i18n.js";

// 학습 탭의 다른 카드와 같은 종이 카드 톤.
// (v0.7.4, 사용자 요청) 성장 분석의 모든 구획은 프로필의 크림색 블록 안에 들어간다 — 구획마다 따로 카드를 두지 않고 얇은 선으로 나눈다.
const card = { padding: "14px 16px", borderTop: "1px solid #E4D5B6" };
const sub = { fontSize: 11.5, color: T.inkSoft, lineHeight: 1.55 };
// 테마 묶음 안에서는 구획이 자체 테두리·머리말 없이(bare) 들어가고, 머리말은 ThemeSection이 한 번만 그린다.
const wrap = (bare) => (bare ? { padding: "2px 16px 14px" } : card);
const h3 = { fontSize: 14, fontWeight: 800, color: T.ink, margin: 0, letterSpacing: "-.01em" };
const critHead = { fontSize: 11, fontWeight: 800, color: T.inkSoft, paddingBottom: 2, paddingLeft: 12 };
const critCell = { borderTop: "1px solid rgba(0,0,0,.06)", padding: "6px 0" };
const critNum = { textAlign: "right", paddingLeft: 12, whiteSpace: "nowrap", fontVariantNumeric: "tabular-nums" };
const LEVEL_COLOR = { same: "#3F7A3A", close: "#7FA04A", far: "#D9822B", veryFar: "#C8453B", na: "#9A8B72" };

/* ── 공용: 구획 머리말 ── */
function SectionHead({ Icon, title, right }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 9, marginBottom: 12 }}>
      <span style={{ width: 30, height: 30, borderRadius: 10, background: "rgba(196,154,80,.22)", color: "#8A6C2F", display: "inline-flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}><Icon size={16} /></span>
      <h3 style={{ ...h3, flex: 1, minWidth: 0 }}>{title}</h3>
      {right}
    </div>
  );
}

/* ── 테마 묶음 (v0.7.4, 사용자 요청: 중구난방 나열 → 합칠 수 있는 건 한 테마로, 정보를 체계적으로 구분) ──
   성장 분석은 네 테마로 나뉜다: ① 성장 요약(평균·변화·곡선) ② 약점 진단(구간·원인·유형 탭 + 지금 고칠 한 가지) ③ 실수 기록 ④ 마스터 스타일. 각 테마는 번호·제목·한 줄 설명 머리말 하나만 갖는다. */
function ThemeSection({ id, no, title, desc, right, children }) {
  // (v0.7.5, 사용자 요청) 테마마다 화면에 들어올 때 한 번 떠오르고(Reveal), 번호 표지는 계속 은은하게 빛난다(ab-textglow).
  return (
    <div id={id} style={{ borderTop: "1px solid #E4D5B6", padding: "16px 0 4px", scrollMarginTop: 8 }}>
      <Reveal>
      <div style={{ display: "flex", alignItems: "flex-end", gap: 10, padding: "0 16px 12px" }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div className="ab-textglow" style={{ fontSize: 10.5, fontWeight: 900, letterSpacing: ".14em", color: "#A8842F", fontFamily: SITE_FONT, animationDelay: (no * 0.7) + "s" }}>{"0" + no}</div>
          <h3 style={{ ...h3, fontSize: 17, marginTop: 1 }}>{title}</h3>
          <div style={{ ...sub, fontSize: 11.5, marginTop: 2 }}>{desc}</div>
        </div>
        {right}
      </div>
      </Reveal>
      <Reveal delay={0.12}>{children}</Reveal>
    </div>
  );
}
/* 테마로 바로 이동하는 칩 줄 — 성장 분석이 길어서 어디에 무엇이 있는지 먼저 보여 준다. */
function SectionNav({ items }) {
  const go = (id) => { try { const el = document.getElementById(id); if (el) el.scrollIntoView({ behavior: isLite() ? "auto" : "smooth", block: "start" }); } catch { /* ignore */ } };
  return (
    <div role="navigation" style={{ display: "flex", gap: 6, overflowX: "auto", padding: "0 16px 12px", scrollbarWidth: "none" }}>
      {items.map(([id, label], i) => (
        <motion.button key={id} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4, delay: 0.2 + i * 0.08, ease: OC_EASE }} className="press" onClick={() => go(id)} style={{ display: "inline-flex", alignItems: "center", gap: 6, flexShrink: 0, padding: "6px 12px", borderRadius: 999, border: "1px solid #DCCBA8", background: "rgba(255,255,255,.45)", cursor: "pointer", fontFamily: SITE_FONT, fontSize: 12, fontWeight: 800, color: T.ink, whiteSpace: "nowrap" }}>
          <span style={{ fontSize: 10, fontWeight: 900, color: "#A8842F", fontFamily: SITE_FONT }}>{"0" + (i + 1)}</span>{label}
        </motion.button>
      ))}
    </div>
  );
}
/* 약점 진단 — 구간별·원인별·유형별을 한 카드의 탭으로 합친다(같은 질문 "어디서 잃나"의 세 가지 단면). */
function DiagnosisTabs({ g }) {
  const tabs = [["phase", t("구간별"), g.phases.length > 0], ["cause", t("원인별"), g.causes.length > 0], ["type", t("유형별"), g.moveTypes.length > 0]].filter((x) => x[2]);
  const [tab, setTab] = useState("phase");
  if (!tabs.length) return null;
  const cur = tabs.some((x) => x[0] === tab) ? tab : tabs[0][0];
  return (
    <div>
      <div role="tablist" style={{ display: "flex", gap: 4, padding: "3px", margin: "0 16px 10px", borderRadius: 12, background: "rgba(90,58,34,.08)" }}>
        {tabs.map(([k, label]) => (
          <button key={k} role="tab" aria-selected={cur === k} className="press" onClick={() => setTab(k)} style={{ flex: 1, padding: "7px 6px", borderRadius: 9, border: "none", cursor: "pointer", fontFamily: SITE_FONT, fontSize: 12.5, fontWeight: 900, color: cur === k ? T.ink : T.inkSoft, background: cur === k ? "#FBF4E4" : "transparent", boxShadow: cur === k ? "0 1px 4px rgba(0,0,0,.18)" : "none" }}>{label}</button>
        ))}
      </div>
      {cur === "phase" && <PhaseCard g={g} bare />}
      {cur === "cause" && <CauseCard g={g} bare />}
      {cur === "type" && <TypeCard g={g} bare />}
    </div>
  );
}

/* ── 마스터 스타일 (v0.7.4) ──
   가장 닮은 마스터를 히어로 카드(일치도 링)로 크게 보여 주고, 후보 3명은 한 줄 탭, 기준 전체의 일치 여부는 "지문 띠"(기준 하나당 칸 하나, 색=판정)로 한눈에, 세부 비교는 묶음별로 접어 연다.
   비교할 마스터는 이름으로 직접 검색해 고를 수도 있다(검색창은 퍼즐 탭 "오프닝 · 생성자로 검색"과 같은 디자인).
   최고 레이팅 표기는 모든 언어에서 "Peak 2xxx"로 통일한다(번역하지 않는 고정 표기). */
const peakText = (elo) => (elo ? "Peak " + elo : "");
function SimRing({ pct, size = 66 }) {
  const r = (size - 8) / 2, c = 2 * Math.PI * r;
  return (
    <svg width={size} height={size} viewBox={"0 0 " + size + " " + size} aria-hidden style={{ flexShrink: 0 }}>
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="rgba(255,255,255,.14)" strokeWidth="6" />
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={T.brassHi} strokeWidth="6" strokeLinecap="round" strokeDasharray={c} strokeDashoffset={c * (1 - Math.max(0, Math.min(1, pct / 100)))} transform={"rotate(-90 " + size / 2 + " " + size / 2 + ")"} style={{ transition: "stroke-dashoffset .6s ease" }} />
      <text x="50%" y="50%" textAnchor="middle" dominantBaseline="central" fill={T.ivoryHi} style={{ fontSize: size * 0.27, fontWeight: 900, fontFamily: SITE_FONT }}>{pct}%</text>
    </svg>
  );
}
function MasterStyle({ games, bare }) {
  const [data, setData] = useState(null);
  const [pickedName, setPickedName] = useState(null);   // 사용자가 고른 마스터(null이면 가장 닮은 마스터)
  const [query, setQuery] = useState("");
  const [focus, setFocus] = useState(false);
  useEffect(() => { let on = true; import("../data/masterStyles.json").then((m) => { if (on) setData(m.default || m); }); return () => { on = false; }; }, []);
  const styleGames = useMemo(() => (games || []).slice(0, 200).map((g) => ({ moves: g.moves, color: g.color, result: g.result })), [games]);
  const feat0 = useMemo(() => styleFeatures(styleGames), [styleGames]);
  // 후퇴 수 비율은 chess.js로 수순을 재생해야 해서(수당 약 90µs) 첫 화면을 먼저 그린 뒤 이어서 계산해 채운다.
  const [retreat, setRetreat] = useState(null);
  useEffect(() => {
    setRetreat(null);
    if (!styleGames.length) return undefined;
    const id = setTimeout(() => setRetreat(retreatStats(styleGames, RETREAT_GAMES_APP)), 60);
    return () => clearTimeout(id);
  }, [styleGames]);
  const feat = useMemo(() => { if (!retreat) return feat0; const vec = feat0.vec.slice(), den = feat0.den.slice(); vec[13] = retreat.rate; den[13] = retreat.den; return { ...feat0, vec, den }; }, [feat0, retreat]);
  const m = useMemo(() => (data ? matchMasters(feat, data, data.masters.length) : null), [feat, data]);
  const top3 = m && m.ok ? m.list.slice(0, 3) : [];
  const picked = m && m.ok ? (m.list.find((x) => x.name === pickedName) || m.list[0]) : null;
  const row = picked ? data.masters.find((r) => r[0] === picked.name) : null;
  const rows = useMemo(() => (row ? compareCriteria(m.u, row[3]) : []), [row, m]);
  const byKey = useMemo(() => Object.fromEntries(rows.map((r) => [r.key, r])), [rows]);
  // 검색: 영문 이름에서 "맨 앞 일치 → 단어 앞 일치 → 포함 일치" 순서(도감·퍼즐 검색과 같은 규칙, src/lib/masterNameSearch.js). 개수 제한 없음(드롭다운 스크롤).
  const suggestions = useMemo(() => {
    if (!query.trim() || !m || !m.ok) return [];
    return rankMasterMatches(m.list, query, (x) => masterName(x.name, "en"), (x) => x.name, (x) => x.elo);
  }, [query, m]);
  const choose = (x) => { setPickedName(x.name); setQuery(""); setFocus(false); try { if (document.activeElement && document.activeElement.blur) document.activeElement.blur(); } catch { /* ignore */ } };
  if (!data) return <div style={wrap(bare)}><p style={{ ...sub, margin: 0 }}>{t("불러오는 중…")}</p></div>;
  if (!m.ok) return (
    <div style={wrap(bare)}>
      <p style={{ ...sub, margin: 0 }}>{t("chess.com 대국이 {0}판 이상 연동되면 나와 닮은 마스터를 알려 줌 (지금 {1}판)", MIN_STYLE_GAMES, m.n)}</p>
    </div>
  );
  const similarN = rows.filter((r) => r.level === "same" || r.level === "close").length, comparable = rows.filter((r) => r.level !== "na").length;
  // (v0.7.4, 사용자 요청) 막대 그래프 레이아웃 — 백 첫 수(1.e4·1.d4·기타)와 흑 응수 레퍼토리는 비율을 채운 누적 막대 바로 아래에 같은 마스터의 막대를 붙여 견주고,
  // 미들게임·엔드게임 성향은 한 줄에 "나 / 마스터" 막대 한 쌍. 판정(거의 같음~많이 다름)은 줄 끝의 색 점(툴팁에 판정·차이)과 하단 범례.
  const lastName = masterName(picked.name, "en").split(" ").slice(-1)[0];
  const phaseRows = CRITERIA_GROUPS.map((gr) => ({ id: gr.id, ks: gr.keys.filter((k) => byKey[k]) })).filter((x) => x.ks.length);
  const simOf = (ks) => ks.filter((k) => byKey[k].level === "same" || byKey[k].level === "close").length;
  const levelsOf = (ks) => ks.map((k) => byKey[k]).filter((r) => r && r.level !== "na");
  const worstLevel = (ks) => { const ls = levelsOf(ks); if (!ls.length) return "na"; return ["veryFar", "far", "close", "same"].find((lv) => ls.some((r) => r.level === lv)); };
  const levelTip = (ks) => levelLabel(worstLevel(ks));
  const dot = (lv, size = 9) => <span aria-hidden style={{ display: "inline-block", width: size, height: size, borderRadius: "50%", background: LEVEL_COLOR[lv], flexShrink: 0 }} />;
  const val = (k, who) => (byKey[k] ? byKey[k][who] : null);
  const ONE = t("기타"), STACK_COLORS = [T.brass, "#3E7CC4", "#9A8B72"];
  const stack = (title, segs, ks, { other = true } = {}) => {
    // segs: [[이름, 키 또는 (who) => 값]…] — other(기본 true)면 마지막에 "기타"(1 − 합)를 붙인다. 합이 정확히 1인 구성(킹사이드+퀸사이드)은 other: false.
    const rowOf = (who) => {
      const vs = segs.map(([, k]) => (typeof k === "function" ? k(who) : val(k, who))), ok = vs.every((v) => v != null), sum = vs.reduce((a, v) => a + (v || 0), 0);
      return ok ? (other ? [...vs, Math.max(0, 1 - sum)] : vs) : null;
    };
    const names = other ? [...segs.map(([nm]) => nm), ONE] : segs.map(([nm]) => nm);
    return (
      <div style={{ padding: "5px 0 6px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", marginBottom: 3 }}>
          <span style={{ fontSize: 11.5, fontWeight: 800, color: T.ink }}>{title}</span>
          <span style={{ display: "inline-flex", gap: 8, flexWrap: "wrap", fontSize: 10.5, fontWeight: 700, color: T.inkSoft }}>
            {names.map((nm, i) => <span key={nm + i} style={{ display: "inline-flex", alignItems: "center", gap: 3 }}><span aria-hidden style={{ width: 8, height: 8, borderRadius: 2, background: STACK_COLORS[i] }} />{nm}</span>)}
          </span>
          <span style={{ marginLeft: "auto" }} title={levelTip(ks)}>{dot(worstLevel(ks), 10)}</span>
        </div>
        {[["mine", t("나"), true], ["theirs", lastName, false]].map(([who, who_label, me]) => {
          const r = rowOf(who);
          return (
            <div key={who} style={{ display: "flex", alignItems: "center", gap: 6, marginTop: me ? 0 : 2 }}>
              <span style={{ width: 52, flexShrink: 0, fontSize: 10.5, fontWeight: 800, color: me ? T.ink : T.inkSoft, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={who_label}>{who_label}</span>
              <div style={{ flex: 1, minWidth: 0, height: 16, borderRadius: 5, overflow: "hidden", display: "flex", background: "rgba(0,0,0,.07)", opacity: me ? 1 : 0.85 }}>
                {r ? r.map((v, i) => v > 0.0005 && (
                  <div key={i} title={names[i] + " " + Math.round(v * 100) + "%"} style={{ flex: v, minWidth: 2, background: STACK_COLORS[i], display: "flex", alignItems: "center", justifyContent: "center", fontSize: 10, fontWeight: 900, color: i === 2 ? "#fff" : "#241509", whiteSpace: "nowrap", overflow: "hidden" }}>{v >= 0.12 ? Math.round(v * 100) + "%" : ""}</div>
                )) : <span style={{ fontSize: 10.5, color: T.inkSoft, margin: "auto" }}>–</span>}
              </div>
            </div>
          );
        })}
      </div>
    );
  };
  // 한 기준 = 한 줄: 왼쪽 이름, 가운데 "나 / 마스터" 막대 한 쌍(그 줄 안에서 큰 값 기준 길이), 오른쪽 판정 점
  const pair = (k) => {
    const a = val(k, "mine"), b = val(k, "theirs"), top = Math.max(a || 0, b || 0, 0.001) * 1.25;
    const bar = (v, color, who_label) => (
      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
        <div style={{ flex: 1, minWidth: 0, height: 7, borderRadius: 4, background: "rgba(0,0,0,.08)", overflow: "hidden" }} title={who_label}>{v != null && <div style={{ width: Math.max(2, (v / top) * 100) + "%", height: "100%", background: color, borderRadius: 4, transition: "width .5s ease" }} />}</div>
        <span style={{ width: 54, flexShrink: 0, textAlign: "right", fontSize: 10.5, fontWeight: 800, color: color === T.brass ? T.ink : T.inkSoft, whiteSpace: "nowrap", fontVariantNumeric: "tabular-nums" }}>{formatCriterion(k, v)}</span>
      </div>
    );
    return (
      <div key={k} style={{ display: "flex", alignItems: "center", gap: 10, padding: "5px 0", borderTop: "1px solid rgba(0,0,0,.06)" }}>
        <span style={{ flex: "0 0 40%", minWidth: 0, fontSize: 11.5, fontWeight: 700, color: T.ink, lineHeight: 1.3 }} title={criterionLabel(k)}>{criterionLabel(k)}</span>
        <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: 3 }}>{bar(a, T.brass, t("나"))}{bar(b, "#9A8B72", lastName)}</div>
        <span title={levelLabel(byKey[k].level) + (byKey[k].diff != null ? " · " + formatDiff(k, byKey[k].diff) : "")} style={{ flexShrink: 0 }}>{dot(byKey[k].level, 10)}</span>
      </div>
    );
  };
  const section = (p, body) => (
    <div key={p.id} style={{ marginTop: 6 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "6px 0 2px", borderTop: "1px solid rgba(0,0,0,.1)" }}>
        <span style={{ fontSize: 12.5, fontWeight: 800, color: T.ink }}>{criterionGroupLabel(p.id)}</span>
        <span style={{ fontSize: 10.5, fontWeight: 900, color: T.ink, background: "rgba(90,58,34,.1)", borderRadius: 999, padding: "1px 8px" }}>{simOf(p.ks)}/{p.ks.length}</span>
        <span style={{ marginLeft: "auto", display: "inline-flex", alignItems: "center", gap: 8, fontSize: 10.5, fontWeight: 700, color: T.inkSoft }}>
          <span style={{ display: "inline-flex", alignItems: "center", gap: 3 }}><span aria-hidden style={{ width: 10, height: 5, borderRadius: 2, background: T.brass }} />{t("나")}</span>
          <span style={{ display: "inline-flex", alignItems: "center", gap: 3 }}><span aria-hidden style={{ width: 10, height: 5, borderRadius: 2, background: "#9A8B72" }} />{lastName}</span>
        </span>
      </div>
      {body}
    </div>
  );
  return (
    <div style={wrap(bare)}>
      <div style={{ borderRadius: 14, background: "linear-gradient(180deg,#2E1B10,#241509)", border: "1px solid #4A3322", padding: "10px 12px", marginBottom: 8 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <SimRing pct={Math.round(picked.sim * 100)} size={50} />
          <div style={{ minWidth: 0, flex: 1 }}>
            <div style={{ fontSize: 15.5, fontWeight: 900, color: T.ivoryHi, fontFamily: SITE_FONT, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{masterFlag(picked.name)} <MasterNameLink name={picked.name}>{masterName(picked.name, "en")}</MasterNameLink></div>
            <div style={{ fontSize: 11, color: "#CDBA98", marginTop: 2, lineHeight: 1.4 }}>{picked.elo ? peakText(picked.elo) + " · " : ""}{t("{0}판 분석", picked.games)}</div>
            <div style={{ fontSize: 11.5, fontWeight: 800, color: T.brassHi, marginTop: 1 }}>{t("비슷한 기준 {0}/{1}", similarN, comparable)}</div>
          </div>
        </div>
      </div>
      {/* 후보 3명 + 이름 검색(다른 마스터와 비교) — 한 줄 */}
      <div style={{ display: "flex", gap: 6, alignItems: "stretch", flexWrap: "wrap", marginBottom: 8 }}>
        {top3.map((x, i) => {
          const on = x.name === picked.name;
          return (
            <button key={x.name} className="press" onClick={() => choose(x)} aria-pressed={on} title={masterName(x.name, "en")} style={{ display: "inline-flex", alignItems: "center", gap: 6, height: 32, padding: "0 10px", borderRadius: 10, cursor: "pointer", border: "1.5px solid " + (on ? T.brass : "#DCCBA8"), background: on ? "rgba(196,154,80,.18)" : "rgba(0,0,0,.025)", fontFamily: SITE_FONT, minWidth: 0 }}>
              <span style={{ fontSize: 10.5, fontWeight: 900, color: i === 0 ? "#8A6C2F" : T.inkSoft }}>{i + 1}</span>
              <span style={{ fontSize: 11.5, fontWeight: 800, color: T.ink, maxWidth: 84, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{masterFlag(x.name)} {masterName(x.name, "en").split(" ").slice(-1)[0]}</span>
              <span style={{ fontSize: 11.5, fontWeight: 900, color: T.ink }}>{Math.round(x.sim * 100)}%</span>
            </button>
          );
        })}
        <div style={{ position: "relative", flex: "1 1 120px", minWidth: 110 }}>
          <input value={focus ? query : masterName(picked.name, "en")} onChange={(e) => setQuery(e.target.value)} onFocus={() => { setQuery(""); setFocus(true); }} onBlur={() => setTimeout(() => setFocus(false), 150)}
            onKeyDown={(e) => { if (e.key === "Enter" && suggestions[0]) choose(suggestions[0]); }} aria-label={t("마스터 이름으로 검색")}
            placeholder={focus ? t("마스터 이름으로 검색") : masterName(picked.name, "en")} style={{ width: "100%", height: 32, boxSizing: "border-box", padding: "0 9px", borderRadius: 9, border: "1px solid #5A4630", background: "rgba(36,21,9,.92)", color: T.ivoryHi, fontSize: 12, fontFamily: SITE_FONT }} />
          {focus && suggestions.length > 0 && (
            <div style={{ ...searchDropStyle, zIndex: 20 }}>
              {suggestions.map((x) => <SearchResultRow key={x.name} tag="master" tagLabel={t("마스터")} flag={masterFlag(x.name)} title={masterName(x.name, "en")} sub={masterInfoLine(x.name)} onClick={() => choose(x)} />)}
            </div>
          )}
        </div>
      </div>
      <div className="growth-style-bars">
        {phaseRows.map((p) => section(p,
          p.id === "open" ? (
            <>
              {stack(t("백 첫 수"), [["1.e4", "w_e4"], ["1.d4", "w_d4"]], ["w_e4", "w_d4", "w_flank"])}
              {stack(t("흑 응수: 1.e4에 대해"), [["…e5", "b_e5"], ["…c5", "b_c5"]], ["b_e5", "b_c5"])}
              {stack(t("흑 응수: 1.d4에 대해"), [["…d5", "b_d5"], ["…Nf6", "b_nf6"]], ["b_d5", "b_nf6"])}
            </>
          ) : p.id === "mid" ? (
            <>
              {p.ks.filter((k) => k !== "castleQ").map((k) => pair(k))}
              {byKey.castleQ && stack(t("캐슬링 방향(캐슬링한 대국 중)"), [[t("킹사이드"), (who) => (val("castleQ", who) == null ? null : 1 - val("castleQ", who))], [t("퀸사이드"), (who) => val("castleQ", who)]], ["castleQ"], { other: false })}
            </>
          ) : p.ks.map((k) => pair(k))
        ))}
      </div>
      <div style={{ display: "flex", gap: 10, flexWrap: "wrap", justifyContent: "flex-end", marginTop: 10, fontSize: 10.5, fontWeight: 700, color: T.inkSoft }} aria-hidden>
        {["same", "close", "far", "veryFar"].map((lv) => <span key={lv} style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>{dot(lv, 8)}{levelLabel(lv)}</span>)}
      </div>
    </div>
  );
}

/* ── 프로필 헤더 ──
   (v0.7.4, 사용자 요청) /user 페이지 상단에 있던 신원 정보(장착 칭호·프로필 사진·이름·소개·MID·티어/퍼즐 레이팅)를 성장 분석 맨 위에 그대로 가져온다.
   내 정보이므로 친구 요청·신고 메뉴는 없고, 접속 표시는 항상 켜 둔다. */
function useMyMid(uid) {
  const [mid, setMid] = useState("");
  useEffect(() => {
    if (!uid || !SB_ON) { setMid(""); return undefined; }
    let off = false;
    sbSelect("profiles?id=eq." + uid + "&select=mid&limit=1").then((rows) => { if (!off) setMid((rows && rows[0] && rows[0].mid) || ""); }).catch(() => {});
    return () => { off = true; };
  }, [uid]);
  return mid;
}
function ProfileBlock({ uid, me, onOpenTitle, children }) {
  const mid = useMyMid(uid);
  const name = me ? me.nickname || me.displayId || me.username || "" : "";
  const isGM = me ? tierFromXp(me.xp || 0).tier.key === "grandmaster" : false;
  const photo = 72;
  return (
    <div style={{ background: T.paper, border: "1px solid #DCCBA8", borderRadius: 16, marginBottom: 12, overflow: "hidden", position: "relative", boxShadow: "0 1px 0 rgba(255,255,255,.55) inset, 0 6px 18px -12px rgba(0,0,0,.55)" }}>
      <div aria-hidden style={{ height: 6, background: "linear-gradient(90deg,#8A6C2F,#ECCB86 50%,#8A6C2F)" }} />
      {me && (
        <div style={{ padding: "14px 16px 12px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 14, minWidth: 0 }}>
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", flexShrink: 0 }}>
              <span style={{ position: "relative", display: "inline-flex" }}>
                {me.photo
                  ? <img src={me.photo} alt="" style={{ width: photo, height: photo, borderRadius: 20, objectFit: "cover", border: "1px solid #C9B58C", ...(gmPhotoRingStyle(isGM) || {}) }} />
                  : <span style={{ width: photo, height: photo, borderRadius: 20, background: "linear-gradient(180deg," + T.brass + ",#A8842F)", color: "#241509", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 800, fontSize: 30 }}>{(name || "?")[0].toUpperCase()}</span>}
                <OnlineDot lastSeenMs={Date.now()} overlay size={13} />
              </span>
              {!!mid && <div style={{ fontSize: 9.5, fontWeight: 700, color: T.inkSoft, fontFamily: "ui-monospace,monospace", marginTop: 4 }}>#{mid}</div>}
            </div>
            <div style={{ minWidth: 0, flex: 1 }}>
              <div style={{ fontSize: 19, fontWeight: 800, color: T.ink, lineHeight: 1.2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{name}</div>
              <div style={{ fontSize: 12, color: T.ink, marginTop: 3, minHeight: 15, lineHeight: 1.4, overflow: "hidden", display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical" }}>{me.bio ? <UgcText text={me.bio} kind="bio" inline render={(shown, tg) => <>{tg}{shown}</>} /> : ""}</div>
            </div>
          </div>
        </div>
      )}
      {children}
    </div>
  );
}

// 예전 성장 분석(실수 기록·복습 카드)이 이 기기에 남긴 저장 데이터(occ_growth_v1:*)를 한 번 정리한다.
function purgeLegacyGrowthData() {
  try {
    const keys = [];
    for (let i = 0; i < window.localStorage.length; i++) { const k = window.localStorage.key(i); if (k && k.startsWith("occ_growth_v1:")) keys.push(k); }
    keys.forEach((k) => window.localStorage.removeItem(k));
  } catch { /* 저장소 접근 불가 */ }
}


/* ── 성장 분석 본문 (v0.7.4) ──
   요약 → 성장 곡선 → 지금 고칠 한 가지 → 구간 진단 → 반복되는 실수 원인 → 수 유형별 분석 → 실수 기록(수 하나씩 블록). 계산은 lib/growthAnalysis.js(순수 함수).
   원인 분류가 느려서(전술 탐색) 화면은 빠른 계산을 먼저 그리고, 분류가 끝나는 대로 다시 그린다. */
const tacLabel = (k) => ({ fork: t("포크"), skewer: t("스큐어"), discoveredAttack: t("디스커버드 어택"), discoveredCheck: t("디스커버드 체크"), doubleCheck: t("더블 체크"), promotion: t("승격") }[k] || k);
const fmtDate = (sec) => { if (!sec) return ""; const d = new Date(sec * 1000); return String(d.getMonth() + 1).padStart(2, "0") + "." + String(d.getDate()).padStart(2, "0"); };
const reviewGameOf = (g) => ({ sans: g.sans, color: g.color, white: { username: g.white }, black: { username: g.black }, endTime: g.endTime, id: g.id, opening: g.opening, username: g.owner });
// 대국 보기(검색 아이콘) 동작은 GrowthPanel이 context로 내려 준다 — 수 블록·대표 실수·곡선 선택 대국이 같은 버튼 쌍(검색 + 리뷰)을 쓴다.
const OpenGameCtx = createContext(null);
const searchBtnStyle = (size) => ({ width: size, height: size, borderRadius: 8, background: "linear-gradient(180deg," + T.brass + ",#A8842F)", color: "#241509", border: "none", cursor: "pointer", display: "inline-flex", alignItems: "center", justifyContent: "center", flexShrink: 0 });
function GameActions({ g, onReview, size = 28 }) {
  const openGame = useContext(OpenGameCtx);
  if (!onReview && !openGame) return null;
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 6, flexShrink: 0 }}>
      {openGame && <button onClick={() => openGame(g.sans)} aria-label={t("대국 보기")} title={t("대국 보기")} className="press" style={searchBtnStyle(size)}><Search size={13} /></button>}
      {onReview && <BestMoveJumpButton size={size} title={t("리뷰하기")} onClick={() => onReview(reviewGameOf(g))} />}
    </span>
  );
}
const darkPanel = { borderRadius: 16, background: "linear-gradient(180deg,#2E1B10,#241509)", border: "1px solid #4A3322", marginBottom: 12 };
const miniLabel = { fontSize: 11, fontWeight: 800, color: T.inkSoft, letterSpacing: ".02em", marginBottom: 8 };
const pct = (x) => (x == null ? "–" : Math.round(x * 100));

function useGrowthData(records) {
  const [data, setData] = useState(null);
  useEffect(() => {
    let off = false, timer = null, steps = 0;
    const cache = loadCauseCache();
    const games = records.map((r) => analyzeGame(r, cache)).filter((g) => g && g.mine.length);
    setData(buildGrowth(games));
    const step = () => {
      if (off) return;
      const { left, changed } = classifyPending(games, cache, 100);
      if (changed) setData(buildGrowth(games));
      if (++steps % 8 === 0) saveCauseCache(cache);
      if (left > 0) timer = setTimeout(step, 20); else saveCauseCache(cache);
    };
    timer = setTimeout(step, 40);
    return () => { off = true; clearTimeout(timer); saveCauseCache(cache); };
  }, [records]);
  return data;
}

function MiniBoard({ sans, ply, color, size = 92 }) {
  const board = useMemo(() => { try { return boardFromSans((sans || []).slice(0, ply)); } catch { return null; } }, [sans, ply]);
  return (
    <div style={{ width: size, flexShrink: 0, pointerEvents: "none", borderRadius: 6, overflow: "hidden", alignSelf: "flex-start" }}>
      {board ? <Board board={board} flip={color === "b"} size={size} interactive={false} showCoords={false} showEval={false} /> : <div style={{ width: size, height: size, background: "rgba(0,0,0,.08)" }} />}
    </div>
  );
}
function MoveCard({ m, onReview, noBoard }) {
  const g = m.game;
  return (
    <div style={{ display: "flex", gap: 12, padding: 10, borderRadius: 12, border: "1px solid #DCCBA8", background: "rgba(0,0,0,.025)", marginBottom: 8 }}>
      {!noBoard && <MiniBoard sans={g.sans} ply={m.ply} color={g.color} />}
      <div style={{ minWidth: 0, flex: 1, display: "flex", flexDirection: "column", gap: 4 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          {badgeIcon(m.kind, 16)}
          <span style={{ fontSize: 14, fontWeight: 900, color: T.ink, fontFamily: SITE_FONT }}>{moveNumber(m.ply)}{m.san}</span>
          <span style={{ marginLeft: "auto", fontSize: 13, fontWeight: 900, color: T.blunder, whiteSpace: "nowrap" }}>−{Math.round(m.loss)}%p</span>
        </div>
        <div style={{ ...sub, fontSize: 11.5 }}>{QLABEL[m.kind] || m.kind}{m.best ? " · " + t("최선의 수") + ": " : ""}{m.best && <b style={{ color: T.ink }}>{m.best}</b>}</div>
        {m.cause && <span style={{ alignSelf: "flex-start", fontSize: 10.5, fontWeight: 800, color: T.mistake, background: "rgba(217,130,43,.12)", border: "1px solid rgba(217,130,43,.35)", borderRadius: 999, padding: "1px 8px" }}>{causeLabel(m.cause)}{m.detail ? " · " + tacLabel(m.detail) : ""}</span>}
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: "auto" }}>
          <span style={{ ...sub, fontSize: 10.5, flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{fmtDate(g.endTime)}{g.opening ? " · " + g.opening : ""}</span>
          <GameActions g={g} onReview={onReview} />
        </div>
      </div>
    </div>
  );
}

/* (v0.7.6, 사용자 요청) 퍼포먼스 레이팅 — /user 프로필(최근 10판)에서 옮겨 와, 성장 분석이 자동 리뷰한 최근 5판의 수를 합산한다(src/lib/recentPerformance.js).
   한 판의 값은 오차가 커서 보여 주지 않는다. 합산할 판이 RECENT_PERF_MIN_GAMES보다 적으면(짧은 대국·분석 실패) "–"와 안내만. */
function PerfHero({ perf, games }) {
  const lab = { fontSize: 11, fontWeight: 800, color: "#CDBA98", lineHeight: 1.25, letterSpacing: "-.01em" };
  const note = { fontSize: 10.5, color: "#A8987C", lineHeight: 1.35, marginTop: 3 };
  return (
    <StatPop i={0} style={{ borderRadius: 14, background: "linear-gradient(100deg,rgba(236,203,134,.14),rgba(236,203,134,.04) 70%)", border: "1px solid rgba(236,203,134,.28)", padding: "12px 13px", marginBottom: 8, display: "flex", alignItems: "center", gap: 12 }}>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={lab}>{t("퍼포먼스 레이팅")}</div>
        <div style={note}>
          {perf ? <>{t("최근 {0}판 기준", perf.games)}{perf.provisional ? " · " + t("보정 전 임시 수치") : ""}</> : t("리뷰한 대국이 {0}판 이상 쌓이면 표시 (현재 {1}판)", RECENT_PERF_MIN_GAMES, games)}
        </div>
        <div style={{ ...note, marginTop: 2 }}>{t("상대 레이팅과 무관하게 둔 수의 질만으로 계산")}</div>
      </div>
      <div style={{ flexShrink: 0, fontFamily: SITE_FONT, fontVariantNumeric: "tabular-nums", fontSize: 32, fontWeight: 900, letterSpacing: "-.03em", lineHeight: 1, color: perf ? T.brassHi : "#A8987C" }}>
        {perf ? <CountUpFrom0 value={Math.round(perf.rating)} format={(n) => fmtFull(Math.round(n))} /> : "–"}
      </div>
    </StatPop>
  );
}

/* 요약 히어로 — 퍼포먼스 레이팅 한 줄(v0.7.6), 핵심 숫자 세 개(평균 정확도·최근 변화·가장 약한 구간)를 타일로, 그 아래에 성장 곡선을 한 패널에 담는다. */
function Overview({ g, onReview, perf }) {
  const d = g.trend.delta, up = d != null && d >= 0.5, down = d != null && d <= -0.5;
  const wk = g.weakPhase ? g.phases.find((p) => p.key === g.weakPhase.key) : null;
  // (v0.7.4, 사용자 요청: UI·폰트 정리) 세 타일 모두 같은 구조 — 한 줄 라벨 · 숫자(굵은 기본 글꼴, 같은 높이·밑줄 정렬) · 보조 문구. 숫자 글꼴은 세리프를 버리고 사이트 기본 글꼴의 고정폭 숫자.
  const tile = { borderRadius: 14, background: "rgba(255,255,255,.05)", border: "1px solid rgba(236,203,134,.16)", padding: "11px 11px 10px", minWidth: 0, minHeight: 116, display: "flex", flexDirection: "column", justifyContent: "space-between", gap: 6 };
  const lab = { fontSize: 11, fontWeight: 800, color: "#CDBA98", lineHeight: 1.25, minHeight: 27, letterSpacing: "-.01em" };
  const row = { display: "flex", alignItems: "baseline", gap: 2, minHeight: 30, whiteSpace: "nowrap", fontFamily: SITE_FONT, fontVariantNumeric: "tabular-nums" };
  const big = { fontSize: 25, fontWeight: 900, letterSpacing: "-.03em", lineHeight: 1 };
  const unit = { fontSize: 12, fontWeight: 800, opacity: 0.85 };
  const note = { fontSize: 10.5, color: "#A8987C", lineHeight: 1.3, minHeight: 27 };
  const dc = up ? "#7DB68A" : down ? "#FF8A7A" : "#E3CC93";
  return (
    <div style={{ padding: "0 16px 14px" }}>
      <div style={{ ...darkPanel, marginBottom: 0, padding: 12 }}>
        <PerfHero perf={perf ? perf.value : null} games={perf ? perf.games : 0} />
        <div style={{ display: "grid", gridTemplateColumns: "minmax(0,1fr) minmax(0,1.2fr) minmax(0,1fr)", gap: 8 }}>
          <StatPop i={1} style={tile}>
            <div style={lab}>{t("평균 정확도")}</div>
            <div style={{ ...row, color: T.ivoryHi }}><span style={big}><CountDec value={g.avgAcc} /></span><span style={unit}>%</span></div>
            <div style={note}>{t("최근 {0}판 기준", g.n)}</div>
          </StatPop>
          <StatPop i={2} style={tile}>
            <div style={lab}>{t("최근 변화")}</div>
            <div style={{ ...row, color: dc }}>
              {d != null && <span style={{ fontSize: 11, marginRight: 3, alignSelf: "center" }}>{up ? "▲" : down ? "▼" : "±"}</span>}
              <span style={big}>{d == null ? "–" : <CountDec value={Math.abs(d)} />}</span>{d != null && <span style={unit}>%p</span>}
            </div>
            <div style={note}>{t("최근 {0}판 기준", g.trend.k)}</div>
          </StatPop>
          <StatPop i={3} style={tile}>
            <div style={lab}>{t("가장 약한 구간")}</div>
            <div style={{ ...row, whiteSpace: "normal", color: g.weakPhase ? "#FFB066" : T.ivoryHi }}><span style={{ ...big, fontSize: g.weakPhase && phaseLabel(g.weakPhase.key).length > 7 ? 14 : 18, letterSpacing: "-.02em", lineHeight: 1.1, wordBreak: "keep-all" }}>{g.weakPhase ? phaseLabel(g.weakPhase.key) : "–"}</span></div>
            <div style={note}>{wk && wk.acc != null ? t("정확도 {0}%", wk.acc.toFixed(1)) : "\u00A0"}</div>
          </StatPop>
        </div>
        <GrowthCurve g={g} onReview={onReview} bare dark />
      </div>
      {g.pending > 0 && <div style={{ ...sub, marginTop: 8 }}>{t("실수 원인 분석 중, {0}개 남음", g.pending)}</div>}
    </div>
  );
}

/* ① 성장 곡선 */
function GrowthCurve({ g, onReview, bare, dark }) {
  const ink = dark ? "#CDBA98" : T.inkSoft, line = dark ? T.brassHi : "#A8842F", ring = dark ? "#2E1B10" : "#F1E6D0";
  const pts = g.curve.filter((c) => c.acc != null);
  const [sel, setSel] = useState(null);
  const idx = sel != null && sel < pts.length ? sel : pts.length - 1;
  if (!pts.length) return null;
  const W = 320, H = 124, PX = 14, PY = 14;
  const lo = Math.max(0, Math.floor(Math.min(...pts.map((p) => p.acc)) - 5)), hi = Math.min(100, Math.ceil(Math.max(...pts.map((p) => p.acc)) + 5));
  const x = (i) => (pts.length === 1 ? W / 2 : PX + ((W - 2 * PX) * i) / (pts.length - 1));
  const y = (v) => PY + (H - 2 * PY) * (1 - (v - lo) / Math.max(1, hi - lo));
  const cur = pts[idx];
  const recentFrom = pts.length - g.trend.k;
  const ptsAttr = pts.map((p, i) => x(i) + "," + y(p.acc).toFixed(1)).join(" ");
  return (
    <div style={dark ? { marginTop: 12 } : wrap(bare)}>
      {/* (v0.7.7 BUG-161) 축 숫자는 SVG 밖 HTML로 — SVG 안 글자는 viewBox(320) 확대 비율을 따라 넓은 화면에서 약 20px까지 커졌다. 위치만 % 로 맞춘다. */}
      <div style={{ position: "relative" }}>
      <span aria-hidden="true" style={{ position: "absolute", left: (PX / W) * 100 + "%", top: ((y(hi) - 2) / H) * 100 + "%", transform: "translateY(-100%)", fontSize: 10, lineHeight: 1, color: ink, fontVariantNumeric: "tabular-nums", pointerEvents: "none" }}>{hi}</span>
      <span aria-hidden="true" style={{ position: "absolute", left: (PX / W) * 100 + "%", top: ((y(lo) + 3) / H) * 100 + "%", fontSize: 10, lineHeight: 1, color: ink, fontVariantNumeric: "tabular-nums", pointerEvents: "none" }}>{lo}</span>
      <svg viewBox={"0 0 " + W + " " + H} width="100%" role="img" aria-label={t("성장 곡선")} style={{ display: "block", overflow: "visible" }}>
        {g.trend.k > 0 && pts.length > g.trend.k && <rect x={x(recentFrom) - 8} y={PY - 8} width={W - x(recentFrom) + 8 - PX + 8} height={H - 2 * PY + 16} rx="8" fill={dark ? "rgba(236,203,134,.1)" : "rgba(196,154,80,.14)"} />}
        {g.avgAcc != null && <line x1={PX} x2={W - PX} y1={y(g.avgAcc)} y2={y(g.avgAcc)} stroke={dark ? "#9A8B72" : "#8A6C2F"} strokeWidth="1" strokeDasharray="4 4" opacity=".7" />}
        {/* (v0.7.5, 사용자 요청) 곡선이 화면에 들어올 때 왼쪽부터 그려지고, 그 위를 빛 한 점이 계속 흘러간다. 점은 차례로 튀어나오고 선택한 점은 맥동한다. */}
        <motion.polyline points={ptsAttr} fill="none" stroke={line} strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" initial={{ pathLength: 0 }} whileInView={{ pathLength: 1 }} viewport={{ once: true }} transition={{ duration: 1.1, ease: OC_EASE }} />
        <polyline points={ptsAttr} fill="none" stroke={dark ? "#FFF7DC" : "#FFF1B8"} strokeWidth="3" strokeLinecap="round" pathLength="100" strokeDasharray="6 94" className="gx-flow" style={{ filter: "drop-shadow(0 0 4px rgba(236,203,134,.9))" }} />
        {pts.map((p, i) => (
          <motion.g key={p.key} onClick={() => setSel(i)} style={{ cursor: "pointer", transformBox: "fill-box", transformOrigin: "center" }} initial={{ opacity: 0, scale: 0 }} whileInView={{ opacity: 1, scale: 1 }} viewport={{ once: true }} transition={{ duration: 0.35, delay: 0.3 + (i / Math.max(1, pts.length)) * 0.8, ease: OC_EASE }}>
            <circle cx={x(i)} cy={y(p.acc)} r="11" fill="transparent" />
            {i === idx && <circle cx={x(i)} cy={y(p.acc)} r="6" fill={p.acc >= g.avgAcc ? T.best : T.mistake} className="gx-ping" />}
            <circle cx={x(i)} cy={y(p.acc)} r={i === idx ? 6 : 4} fill={p.acc >= g.avgAcc ? T.best : T.mistake} stroke={i === idx ? (dark ? T.ivoryHi : T.ink) : ring} strokeWidth={i === idx ? 2 : 1.5} />
          </motion.g>
        ))}
      </svg>
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 8, padding: "8px 10px", borderRadius: 10, background: dark ? "rgba(255,255,255,.05)" : "rgba(0,0,0,.04)", border: dark ? "1px solid rgba(236,203,134,.14)" : "1px solid #DCCBA8" }}>
        <div style={{ minWidth: 0, flex: 1 }}>
          <div style={{ fontSize: 12.5, fontWeight: 800, color: dark ? T.ivoryHi : T.ink }}>{t("정확도")} <span style={{ color: T.best, fontFamily: SITE_FONT }}>{cur.acc.toFixed(1)}%</span></div>
          <div style={{ ...sub, color: ink, fontSize: 11, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{fmtDate(cur.endTime)}{cur.game.opening ? " · " + cur.game.opening : ""}</div>
        </div>
        <GameActions g={cur.game} onReview={onReview} />
      </div>
      <p style={{ ...sub, color: ink, margin: "8px 0 0", fontSize: 11 }}>{t("점을 눌러 그 대국의 정확도와 리뷰 보기")}</p>
    </div>
  );
}

/* ② 지금 고칠 한 가지 + 성장 가능성 */
/* 지금 고칠 한 가지 — 가장 손실이 큰 반복 원인을 ① 무엇이 문제인가(설명 + 내 수치) ② 왜 생기나 ③ 이렇게 고쳐 보기로 풀어 쓰고, 고쳤을 때의 성장 가능성과 대표 실수를 붙인다. */
function FocusPart({ title, children }) {
  return (
    <div style={{ marginBottom: 12 }}>
      <div style={{ fontSize: 11.5, fontWeight: 900, color: "#8A6C2F", letterSpacing: ".02em", marginBottom: 4 }}>{title}</div>
      {children}
    </div>
  );
}
function FocusCard({ g, onReview }) {
  const narrow = useNarrow(720);
  const f = g.focus;
  const text = { fontSize: 12.5, color: T.ink, lineHeight: 1.65, margin: 0 };
  const w = f && f.worst;
  return (
    <div style={{ margin: "6px 16px 14px", padding: "14px 14px 4px", borderRadius: 14, background: "rgba(196,154,80,.1)", border: "1px solid rgba(196,154,80,.4)", borderLeft: "4px solid #C49A50" }}>
      <div style={{ fontSize: 11, fontWeight: 900, letterSpacing: ".04em", color: "#8A6C2F", marginBottom: 4 }}>{t("지금 고칠 한 가지")}</div>
      {!f ? (
        <p style={{ ...sub, margin: 0 }}>{g.pending > 0 ? t("실수 원인 분석 중, {0}개 남음", g.pending) : t("아직 두 판 이상에서 반복된 실수가 없음")}</p>
      ) : (
        <>
          <div style={{ fontSize: 19, fontWeight: 900, color: T.ink }}>{causeLabel(f.cause)}</div>
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap", margin: "8px 0 12px" }}>
            <span style={{ ...chipStyle }}>{t("{0}판에서 {1}회 반복", f.games, f.n)}</span>
            <span style={{ ...chipStyle }}>{t("전체 승률 손실의 {0}%", pct(f.share))}</span>
            {f.detail && <span style={{ ...chipStyle }}>{t("가장 자주 나온 전술: {0}", tacLabel(f.detail))}</span>}
          </div>
          <FocusPart title={t("무엇이 문제인가")}>
            <p style={text}>{causeWhat(f.cause)}</p>
            <ul style={{ margin: "6px 0 0", padding: "8px 10px 8px 26px", borderRadius: 10, background: "rgba(0,0,0,.04)", fontSize: 12, color: T.ink, lineHeight: 1.65 }}>
              {f.avgDrop != null && <li>{t("최근 {0}판에서 {1}번 나왔고 한 번 나올 때마다 평균 승률이 {2}%p 하락", g.n, f.n, f.avgDrop.toFixed(1))}</li>}
              {f.pctOfMoves != null && <li>{t("내가 둔 수 {0}개 중 {1}개({2}%)가 이 유형", f.movesTotal, f.n, f.pctOfMoves)}</li>}
              {f.topPhase && <li>{t("가장 많이 나온 구간: {0}", phaseLabel(f.topPhase))}</li>}
              {w && w.winBefore != null && w.winAfter != null && <li>{t("가장 큰 실수: {0}의 {1}, 승률 {2}%에서 {3}%로 하락", w.game.opening || t("오프닝 정보 없음"), moveNumber(w.ply) + w.san, Math.round(w.winBefore), Math.round(w.winAfter))}</li>}
            </ul>
          </FocusPart>
          <FocusPart title={t("왜 생기나")}><p style={text}>{causeWhy(f.cause)}</p></FocusPart>
          <FocusPart title={t("이렇게 고쳐 보기")}>
            <ol style={{ margin: 0, padding: "0 0 0 20px", ...text }}>{splitSteps(causeFix(f.cause)).map((x, i) => <li key={i} style={{ marginBottom: 2 }}>{x}</li>)}</ol>
          </FocusPart>
          {f.gain != null && f.gain > 0 && g.pending === 0 && (   /* 분류가 끝나기 전에는 상승폭이 계속 바뀌므로 완료 후에만 보여 준다 */
            <div style={{ padding: "10px 12px", borderRadius: 12, background: "rgba(63,122,58,.1)", border: "1px solid rgba(63,122,58,.4)", marginBottom: 12 }}>
              <div style={{ fontSize: 12.5, fontWeight: 800, color: T.best }}>{t("이 실수를 모두 없애면 평균 정확도 최대 약 +{0}%p", f.gain.toFixed(1))}</div>
            </div>
          )}
          {f.examples.map((m) => <MoveCard key={m.game.key + ":" + m.ply} m={m} onReview={onReview} noBoard={narrow} />)}
        </>
      )}
    </div>
  );
}
const chipStyle = { fontSize: 11, fontWeight: 800, color: T.ink, background: "rgba(90,58,34,.1)", borderRadius: 999, padding: "3px 10px" };

/* (v0.7.5, 사용자 요청) 통계 막대 — 화면에 들어오면 차례로 차오르고(등장), 빛줄기가 주기적으로 훑는다(반복, ab-glint). */
function GrowBar({ width, bg, radius = 5, i = 0 }) {
  return (
    <motion.div className="ab-glint" initial={{ width: 0 }} whileInView={{ width: width + "%" }} viewport={{ once: true, amount: 0.5 }} transition={{ duration: 0.8, delay: 0.1 + i * 0.1, ease: OC_EASE }}
      style={{ height: "100%", borderRadius: radius, background: bg, animationDelay: (i * 0.6) + "s" }} />
  );
}
/* ③ 구간 진단 */
function PhaseCard({ g, bare }) {
  return (
    <div style={wrap(bare)}>
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        {g.phases.map((p, pi) => {
          const weak = g.weakPhase && g.weakPhase.key === p.key, ok = p.acc != null && p.games >= MIN_PHASE_GAMES;
          return (
            <div key={p.key}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
                <span style={{ fontSize: 12.5, fontWeight: 800, color: T.ink }}>{phaseLabel(p.key)}</span>
                {weak && <span style={{ fontSize: 10.5, fontWeight: 900, color: "#fff", background: "#D9822B", borderRadius: 999, padding: "1px 8px" }}>{t("가장 약함")}</span>}
                <span style={{ marginLeft: "auto", fontSize: 12, fontWeight: 800, color: T.ink }}>{ok ? t("정확도 {0}%", p.acc.toFixed(1)) : t("표본 부족")}</span>
              </div>
              <div style={{ height: 10, borderRadius: 5, background: "rgba(0,0,0,.08)", overflow: "hidden" }}>
                {ok && <GrowBar i={pi} width={Math.max(2, Math.min(100, p.acc))} radius={5} bg={weak ? "#D9822B" : "linear-gradient(90deg,#C49A50,#ECCB86)"} />}
              </div>
              {p.total > 0 && <div style={{ ...sub, fontSize: 11, marginTop: 3 }}>{t("실수 {0}%", pct(p.badRate))}</div>}
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* ④ 반복되는 실수 원인 */
function CauseCard({ g, bare }) {
  const [open, setOpen] = useState(null);
  if (!g.causes.length) return null;
  const rows = g.causes.slice(0, 6), max = Math.max(...rows.map((c) => c.share), 0.01);
  return (
    <div style={wrap(bare)}>
      <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
        {rows.map((c, ci) => (
          <div key={c.key}>
            <button className="press" onClick={() => setOpen(open === c.key ? null : c.key)} aria-expanded={open === c.key} style={{ display: "flex", alignItems: "center", gap: 9, width: "100%", padding: "6px 0", background: "none", border: "none", cursor: "pointer", fontFamily: SITE_FONT, textAlign: "left" }}>
              <span style={{ flex: "0 0 38%", minWidth: 0, fontSize: 12, fontWeight: 700, color: T.ink, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{causeLabel(c.key)}</span>
              <div style={{ flex: 1, minWidth: 0, height: 12, borderRadius: 6, background: "rgba(0,0,0,.07)", overflow: "hidden" }}><GrowBar i={ci} width={Math.round(100 * c.share / max)} radius={6} bg="#D9822B" /></div>
              <span style={{ flexShrink: 0, fontSize: 11.5, fontWeight: 800, color: T.ink, whiteSpace: "nowrap" }}>{t("{0}회", c.n)} · {pct(c.share)}%</span>
            </button>
            {open === c.key && <p style={{ ...sub, margin: "0 0 6px", padding: "6px 10px", borderRadius: 8, background: "rgba(0,0,0,.04)" }}>{causeAdvice(c.key)}</p>}
          </div>
        ))}
      </div>
    </div>
  );
}

/* ⑤ 수 유형별 분석 */
function TypeCard({ g, bare }) {
  const groups = [["piece", t("기물별"), pieceLabel], ["action", t("수 종류별"), actionLabel]];
  if (!g.moveTypes.length) return null;
  return (
    <div style={wrap(bare)}>
      {groups.map(([gk, title, lab]) => {
        const rows = g.moveTypes.filter((r) => r.group === gk); if (!rows.length) return null;
        return (
          <div key={gk} style={{ marginBottom: 10 }}>
            <div style={miniLabel}>{title}</div>
            <div style={{ display: "grid", gridTemplateColumns: "minmax(0,1fr) auto auto auto", fontSize: 11.5 }}>
              <span /><span style={{ ...critHead, textAlign: "right" }}>{t("횟수")}</span><span style={{ ...critHead, textAlign: "right" }}>{t("실수율")}</span><span style={{ ...critHead, textAlign: "right" }}>{t("평균 손실")}</span>
              {rows.map((r) => {
                const weak = g.weakType && g.weakType.key === r.key && g.weakType.group === r.group, thin = r.n < MIN_TYPE_MOVES;
                const base = { ...critCell, ...critNum, background: weak ? "rgba(217,130,43,.12)" : undefined, opacity: thin ? 0.6 : 1 };
                return (
                  <Fragment key={r.key}>
                    <span style={{ ...critCell, background: weak ? "rgba(217,130,43,.12)" : undefined, fontWeight: 700, color: T.ink, paddingLeft: 6, opacity: thin ? 0.6 : 1 }}>{lab(r.key)}</span>
                    <span style={{ ...base, color: T.ink, fontWeight: 700 }}>{r.n}</span>
                    <span style={{ ...base, color: weak ? "#D9822B" : T.ink, fontWeight: 800 }}>{pct(r.badRate)}%</span>
                    <span style={{ ...base, color: T.inkSoft, fontWeight: 700, paddingRight: 6 }}>−{r.avgLoss != null ? r.avgLoss.toFixed(1) : "0"}%p</span>
                  </Fragment>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}

/* ⑥ 실수 기록 (v0.7.4 — 예전 "오프닝 실수"를 되살려 발전시킴)
   리뷰한 내 대국의 실수·블런더·놓친 수를 한 수씩 블록으로 보여 준다. 블록: 미니 보드 · 구간(오프닝·미들게임·엔드게임) · 그 대국의 오프닝 · 승률 변동(평가치를 로지스틱 곡선으로 바꾼 값, 전→후) ·
   미들게임·엔드게임 실수는 유형 · MEC가 이 수가 왜 실수인지 설명 · 대신 둘 수 있었던 좋은 수(최선수 + 승률 차이 GOOD_ALT_MARGIN 이내 후보). */
const PHASE_TINT = { opening: "#3E7CC4", middle: "#D9822B", end: "#16B5A6" };
const explainCache = new Map(), explainQueue = [];
let explainBusy = false;
// 승률이 떨어진 이유(lib/mistakeWhy.js)는 전술 탐색이 들어가면 수당 수백 ms라 한 번에 하나씩 대기열로 계산한다 — 화면에서 사라진 블록의 작업은 건너뛴다. 같은 수는 한 번만 계산해 캐시.
function explainPump() {
  if (explainBusy) return;
  let job; while ((job = explainQueue.shift()) && job.dead) { /* 건너뜀 */ }
  if (!job) return;
  explainBusy = true;
  setTimeout(() => { try { job.run(); } finally { explainBusy = false; explainPump(); } }, 0);
}
function useWhy(m) {
  const g = m.game, key = g.key + ":" + m.ply;
  const [v, setV] = useState(() => explainCache.get(key) || null);
  useEffect(() => {
    if (explainCache.has(key)) { setV(explainCache.get(key)); return undefined; }
    const job = { dead: false, run: () => {
      let out = { reasons: [], motive: null };
      try { out = explainMistake({ sansBefore: g.sans.slice(0, m.ply), san: m.san, best: m.best, winBefore: m.winBefore, winAfter: m.winAfter, phase: m.phase }) || out; } catch { out = { reasons: [], motive: null }; }
      if (explainCache.size > 500) explainCache.clear();
      explainCache.set(key, out);
      if (!job.dead) setV(out);
    } };
    explainQueue.push(job); explainPump();
    return () => { job.dead = true; };
  }, [key]);   // eslint-disable-line react-hooks/exhaustive-deps
  return v;
}
/* 승률 변동 막대: 전→후. 남은 승률은 초록(50% 미만이면 주황), 잃은 구간은 붉게. */
function WinDrop({ before, after }) {
  if (before == null || after == null) return null;
  const lost = Math.max(0, before - after), delta = after - before;
  return (
    <div title={t("승률은 평가치를 로지스틱 곡선으로 바꾼 값")}>
      <div style={{ display: "flex", alignItems: "baseline", gap: 6, marginBottom: 3 }}>
        <span style={{ fontSize: 11, fontWeight: 800, color: T.inkSoft }}>{t("승률")}</span>
        <span style={{ fontSize: 12.5, fontWeight: 900, color: T.ink, fontFamily: SITE_FONT }}>{Math.round(before)}% → {Math.round(after)}%</span>
        <span style={{ marginLeft: "auto", fontSize: 12.5, fontWeight: 900, color: T.blunder }}>{delta > 0 ? "+" : delta < 0 ? "−" : ""}{Math.abs(Math.round(delta))}%p</span>
      </div>
      <div style={{ display: "flex", height: 10, borderRadius: 5, overflow: "hidden", background: "rgba(0,0,0,.09)" }} aria-hidden>
        <div style={{ width: Math.max(0, Math.min(100, after)) + "%", background: after >= 50 ? T.best : "#D9822B" }} />
        <div style={{ width: Math.max(0, Math.min(100 - after, lost)) + "%", background: "rgba(200,69,59,.6)" }} />
      </div>
    </div>
  );
}
function MistakeBlock({ m, onReview, noBoard }) {
  const g = m.game, why = useWhy(m), better = betterMoves(m), late = m.phase !== "opening";
  return (
    <div style={{ borderRadius: 14, border: "1px solid #DCCBA8", background: "rgba(0,0,0,.025)", padding: 10, marginBottom: 10 }}>
      <div style={{ display: "flex", gap: 12 }}>
        {!noBoard && <MiniBoard sans={g.sans} ply={m.ply} color={g.color} />}
        <div style={{ minWidth: 0, flex: 1, display: "flex", flexDirection: "column", gap: 6 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
            {badgeIcon(m.kind, 16)}
            <span style={{ fontSize: 15, fontWeight: 900, color: T.ink, fontFamily: SITE_FONT }}>{moveNumber(m.ply)}{m.san}</span>
            <span style={{ fontSize: 10.5, fontWeight: 900, color: "#fff", background: PHASE_TINT[m.phase], borderRadius: 999, padding: "1px 8px" }}>{phaseLabel(m.phase)}</span>
            <span style={{ ...sub, fontSize: 11 }}>{QLABEL[m.kind] || m.kind}</span>
            <span style={{ marginLeft: "auto" }}><GameActions g={g} onReview={onReview} /></span>
          </div>
          <div style={{ ...sub, fontSize: 11, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={g.opening || undefined}>{g.opening || t("오프닝 정보 없음")} · {fmtDate(g.endTime)}</div>
          <WinDrop before={m.winBefore} after={m.winAfter} />
          {late && (m.cause
            ? <span style={{ alignSelf: "flex-start", fontSize: 10.5, fontWeight: 800, color: T.mistake, background: "rgba(217,130,43,.12)", border: "1px solid rgba(217,130,43,.35)", borderRadius: 999, padding: "1px 8px" }}>{causeLabel(m.cause)}{m.detail ? " · " + tacLabel(m.detail) : ""}</span>
            : <span style={{ ...sub, fontSize: 10.5 }}>…</span>)}
        </div>
      </div>
      {why === null ? <p style={{ ...sub, margin: "8px 0 0" }}>{t("설명 분석 중…")}</p>
        : (why.reasons.length > 0 || why.motive) && (
          <div style={{ marginTop: 8, padding: "8px 10px", borderRadius: 10, background: "rgba(200,69,59,.07)", border: "1px solid rgba(200,69,59,.22)" }}>
            <div style={{ fontSize: 11, fontWeight: 800, color: T.blunder, marginBottom: 3 }}>{t("승률이 떨어진 이유")}</div>
            {why.reasons.map((r) => <p key={r.id} style={{ fontSize: 12, color: T.ink, lineHeight: 1.6, margin: "0 0 3px" }}>{r.text}</p>)}
            {why.motive && <p style={{ fontSize: 12, color: T.inkSoft, lineHeight: 1.6, margin: "3px 0 0" }}>{why.motive}</p>}
          </div>
        )}
      {better.length > 0 && (
        <div style={{ marginTop: 8 }}>
          <div style={{ ...sub, fontSize: 11, fontWeight: 800, marginBottom: 4 }}>{t("대신 둘 수 있는 수")}</div>
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
            {better.map((b) => (
              <span key={b.san} title={b.best ? t("최선의 수") : undefined} style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "3px 10px", borderRadius: 10, border: "1px solid " + (b.best ? T.best : "#DCCBA8"), background: b.best ? "rgba(63,122,58,.1)" : "rgba(0,0,0,.03)", fontSize: 12, fontWeight: 800, color: T.ink }}>
                <span style={{ fontFamily: SITE_FONT }}>{moveNumber(m.ply)}{b.san}</span>
                {b.win != null && <span style={{ fontSize: 11, fontWeight: 800, color: b.best ? T.best : T.inkSoft }}>{Math.round(b.win)}%</span>}
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
const PAGE = 3;
function MistakeLog({ g, onReview, bare }) {
  const narrow = useNarrow(720);   // (v0.7.4, 사용자 요청) 모바일에서는 체스보드 미리보기 없음
  const [phase, setPhase] = useState("all"), [sort, setSort] = useState("recent"), [shown, setShown] = useState(PAGE);
  const all = g.badMoves;
  if (!all.length) return null;
  const drop = (m) => (m.winBefore != null && m.winAfter != null ? m.winBefore - m.winAfter : m.loss || 0);
  const count = (ph) => (ph === "all" ? all.length : all.filter((m) => m.phase === ph).length);
  const list = all.filter((m) => phase === "all" || m.phase === phase).sort(sort === "recent" ? (a, b) => (b.game.endTime || 0) - (a.game.endTime || 0) || a.ply - b.ply : (a, b) => drop(b) - drop(a));
  const pick = (setter) => (v) => { setter(v); setShown(PAGE); };
  const pill = (on) => ({ display: "inline-flex", alignItems: "center", gap: 5, padding: "5px 11px", borderRadius: 999, flexShrink: 0, cursor: "pointer", whiteSpace: "nowrap", fontFamily: SITE_FONT, fontSize: 11.5, fontWeight: 800, border: "1px solid " + (on ? T.brass : "#DCCBA8"), background: on ? "rgba(196,154,80,.2)" : "transparent", color: on ? T.ink : T.inkSoft });
  return (
    <div style={wrap(bare)}>
      <div style={{ display: "flex", gap: 6, overflowX: "auto", margin: "0 -2px 8px", padding: "2px", scrollbarWidth: "none" }}>
        {[["all", t("전체")], ...PHASES.map((ph) => [ph, phaseLabel(ph)])].map(([k, label]) => (
          <button key={k} className="press" onClick={() => pick(setPhase)(k)} aria-pressed={phase === k} style={pill(phase === k)}>{label}<span style={{ opacity: 0.65, fontWeight: 700 }}>{count(k)}</span></button>
        ))}
      </div>
      <div style={{ display: "flex", gap: 6, marginBottom: 10 }}>
        {[["recent", t("최신순")], ["big", t("큰 실수순")]].map(([k, label]) => <button key={k} className="press" onClick={() => pick(setSort)(k)} aria-pressed={sort === k} style={{ ...pill(sort === k), padding: "3px 10px", fontSize: 11 }}>{label}</button>)}
      </div>
      {list.slice(0, shown).map((m, i) => <Reveal key={m.game.key + ":" + m.ply} delay={(i % PAGE) * 0.08}><MistakeBlock m={m} onReview={onReview} noBoard={narrow} /></Reveal>)}
      {list.length > shown && <button className="press" onClick={() => setShown((n) => n + PAGE)} style={{ ...pill(false), width: "100%", justifyContent: "center", padding: "8px 11px" }}>{t("더 보기")} <span style={{ opacity: 0.65, fontWeight: 700 }}>{list.length - shown}</span></button>}
    </div>
  );
}

/* 학습 탭의 성장 분석 — 맨 위 프로필 헤더, 그 아래는 리뷰 5판 게이트(미달) 또는 분석 본문(달성: 요약·성장 곡선·고칠 한 가지·구간 진단·실수 원인·수 유형·아쉬운 수·마스터 스타일). */
/* 최근 대국 5판을 엔진이 백그라운드에서 자동 리뷰한다 — 캐시·서버 공유 캐시에 있으면 엔진 없이, 없으면 한 판씩 분석(리뷰 화면과 같은 캐시라 나중에 열면 바로 보임).
   새 대국이 생겨 최근 5판이 바뀌면 새 판만 분석한다(항상 최신). 반환: 분석이 끝난 판의 기록 목록과 진행 상황. */
function useAutoReview({ recent, engine, reviewSpeed, quick, paused }) {
  const [tick, setTick] = useState(0), [failed, setFailed] = useState(() => new Set()), [activeKey, setActiveKey] = useState(null);
  const sig = recent.map((g) => reviewKeyOf(g)).join("|");
  const ready = !!engine && engine.status === "ready";
  useEffect(() => {
    let cancelled = false;
    (async () => {
      for (const game of recent) {
        if (cancelled) return;
        const key = reviewKeyOf(game);
        if (!key || cachedReviewOf(game)) continue;
        setActiveKey(key);                        // (v0.7.5) 진행 화면이 지금 분석 중인 판을 보여 준다
        if (!ready || paused) return;             // 엔진이 준비되면(또는 화면에 보이면) 이 효과가 다시 돈다
        const r = await ensureReview(game, { engine, reviewSpeed, quick });
        if (cancelled) return;
        if (r) setTick((n) => n + 1); else setFailed((prev) => new Set(prev).add(key));
      }
      if (!cancelled) setActiveKey(null);
    })();
    return () => { cancelled = true; };
  }, [sig, ready, reviewSpeed, quick, paused]);   // eslint-disable-line react-hooks/exhaustive-deps
  const records = useMemo(() => recent.map((game) => { const key = reviewKeyOf(game), result = key ? cachedReviewOf(game) : null; return result ? recordOf(game, key, result) : null; }).filter(Boolean), [sig, tick]);   // eslint-disable-line react-hooks/exhaustive-deps
  const states = {};
  for (const r of records) states[r.key] = "done";
  for (const key of failed) if (!states[key]) states[key] = "fail";
  const failedN = recent.filter((game) => states[reviewKeyOf(game)] === "fail").length;
  return { records, done: records.length, total: recent.length, settled: recent.length > 0 && records.length + failedN >= recent.length, states, activeKey };
}

/* (v0.7.6) 학습 탭 맞춤 학습(복습·추천 레슨)용 — 엔진을 돌리지 않고, 성장 분석이 이미 리뷰해 둔(캐시) 최근 판만 모아 같은 분석(useGrowthData)을 만든다. */
export function useCachedGrowth(recent) {
  const sig = (recent || []).map((g) => reviewKeyOf(g)).join("|");
  const records = useMemo(() => (recent || []).map((game) => { const key = reviewKeyOf(game), result = key ? cachedReviewOf(game) : null; return result ? recordOf(game, key, result) : null; }).filter(Boolean), [sig]);   // eslint-disable-line react-hooks/exhaustive-deps
  return { g: useGrowthData(records), reviewed: records.length };
}
export { MiniBoard, tacLabel, reviewGameOf };

/* 학습 탭의 성장 분석 — 프로필의 크림색 블록 하나 안에 헤더(칭호·사진·이름·소개)와 분석 구획이 모두 들어간다. 최근 5판이 자동 분석되기 전에는 게이지 바 안내만 보인다. */
// (v0.7.6, 사용자 요청) 학습 탭에서 분석 탭(데스크톱: 아래쪽, 모바일: 옆으로 넘기는 2페이지)으로 옮겼다. active=false면(아직 화면에 안 보임) 엔진 자동 리뷰를 미뤄,
// 분석 탭의 실시간 평가와 엔진 대기열을 다투지 않게 한다. 캐시에 있는 판은 그대로 보인다.
export function GrowthPanel({ uid, games, me, onOpenTitle, recent = [], gamesLoading, engine, reviewSpeed, quick, onOpenGameAnalyze, onOpenGame, active = true }) {
  useEffect(() => { purgeLegacyGrowthData(); }, []);
  const need = GROWTH_RECENT_GAMES;
  const enough = recent.length >= need;
  const auto = useAutoReview({ recent: enough ? recent : [], engine, reviewSpeed, quick, paused: !active });
  const showResults = enough && auto.settled && auto.done >= 1;
  const g = useGrowthData(showResults ? auto.records : []);
  // (v0.7.6) 퍼포먼스 레이팅: 자동 리뷰가 끝난 최근 5판(기록)을 원래 대국 객체(진영·시간 규정·레이팅)와 짝지어 합산한다.
  const perf = useMemo(() => {
    if (!showResults) return null;
    const byKey = new Map(recent.map((game) => [reviewKeyOf(game), game]));
    // (v0.7.7 BUG-095) 퍼포먼스 곡선은 깊이 20(REVIEW_DEPTH) 분석으로 맞췄다 — "더 빠르게" 설정의 얕은 분석 결과까지 섞으면 값이 어긋나므로 그 깊이 이상만 합산한다.
    const items = auto.records.filter((r) => (loadCachedReviewDepth(r.key) ?? 0) >= REVIEW_DEPTH)
      .map((r) => ({ game: byKey.get(r.key), moves: r.result && r.result.moves })).filter((x) => x.game && Array.isArray(x.moves));
    return { value: recentPerformance(items, GROWTH_RECENT_GAMES), games: items.length };
  }, [showResults, auto.records]);   // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <section aria-label={t("성장 분석")} style={{ marginBottom: 8 }}>
      <GrowthFxStyle />
      <OpenGameCtx.Provider value={onOpenGame || null}>
      <ProfileBlock uid={uid} me={me} onOpenTitle={onOpenTitle}>
        {!showResults ? (
          <AnalysisScanner phase={gamesLoading && !enough ? "loading" : !enough ? "need" : "analyze"} games={recent.slice(0, need)} states={auto.states} activeKey={auto.activeKey} need={need} engineStatus={engine ? engine.status : "off"} />
        ) : (
          <>
            {g ? (
              <>
                <ReportStrip n={auto.done} />
                <SectionNav items={[["gp-sum", t("성장 요약")], ["gp-diag", t("약점 진단")], ...(g.badMoves.length ? [["gp-log", t("실수 기록")]] : []), ["gp-style", t("마스터 스타일")]]} />
                <ThemeSection id="gp-sum" no="1" title={t("성장 요약")} desc={t("최근 대국의 정확도와 변화 흐름")}>
                  <Overview g={g} onReview={onOpenGameAnalyze} perf={perf} />
                </ThemeSection>
                <ThemeSection id="gp-diag" no="2" title={t("약점 진단")} desc={t("어느 구간에서, 어떤 원인으로, 어떤 수에서 승률을 잃는지")}>
                  <DiagnosisTabs g={g} />
                  <FocusCard g={g} onReview={onOpenGameAnalyze} />
                </ThemeSection>
                {g.badMoves.length > 0 && (
                  <ThemeSection id="gp-log" no="3" title={t("실수 기록")} desc={t("승률이 크게 떨어진 수를 한 수씩 모아 보기")} right={<span style={{ ...sub, fontSize: 11, whiteSpace: "nowrap" }}>{t("실수·블런더 {0}개", g.badMoves.length)}</span>}>
                    <MistakeLog g={g} onReview={onOpenGameAnalyze} bare />
                  </ThemeSection>
                )}
              </>
            ) : <AnalysisScanner phase="analyze" games={recent.slice(0, need)} states={auto.states} activeKey={null} need={need} engineStatus={engine ? engine.status : "off"} />}
            <ThemeSection id="gp-style" no="4" title={t("마스터 스타일")} desc={t("내 플레이를 마스터들과 비교")}>
              <MasterStyle games={games} bare />
            </ThemeSection>
          </>
        )}
      </ProfileBlock>
      </OpenGameCtx.Provider>
    </section>
  );
}
