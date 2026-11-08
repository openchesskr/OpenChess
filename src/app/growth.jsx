// (v0.7.4) 성장 분석 — 프로필 헤더(/user 상단 정보) + 리뷰 5판 게이트 + 마스터 스타일.
// 약점 지도·복습 카드·오프닝 실수·실수 요약은 "리뷰하는 대로 약점을 분석하고 성장 가능성을 찾는다"는 방향으로 처음부터 다시 설계하려고 모두 삭제했다(전용 라이브러리 3개 포함).
// 마스터 스타일 로직은 lib/masterStyle.js(순수 함수, scripts/check-growth.mjs가 검사).
import { useState, useEffect, useMemo, Fragment } from "react";
import { Lock, Users, TrendingUp, Target, Layers, BarChart3, Grid3x3, AlertTriangle } from "lucide-react";
import { T } from "../lib/theme.js";
import { SITE_FONT } from "../components/engineLines.jsx";
import { OnlineDot, titleDef, REVIEW_RESULT_CACHE_VERSION, Board } from "./common.jsx";
import { collectMyReviews, GROWTH_MIN_REVIEWS } from "../lib/reviewedCount.js";
import { analyzeGame, buildGrowth, classifyPending, loadCauseCache, saveCauseCache, WORST_COUNT, phaseLabel, causeLabel, causeAdvice, pieceLabel, actionLabel, PHASES, MIN_PHASE_GAMES, MIN_TYPE_MOVES } from "../lib/growthAnalysis.js";
import { boardFromSans, moveNumber } from "../lib/chessRules.js";
import { BestMoveJumpButton } from "../components/uiPrimitives.jsx";
import { badgeIcon, QLABEL } from "../components/badges.jsx";
import { EquippedTitleFit } from "./social.jsx";
import { TierRatingRow } from "./profile.jsx";
import { gmPhotoRingStyle, tierFromXp } from "../lib/tierSystem.js";
import { SB_ON, sbSelect } from "../lib/supabaseClient.js";
import UgcText from "../components/UgcText.jsx";
import { styleFeatures, retreatStats, RETREAT_GAMES_APP, matchMasters, MIN_STYLE_GAMES, CRITERIA_GROUPS, criterionLabel, criterionGroupLabel, formatCriterion, formatDiff, compareCriteria, levelLabel } from "../lib/masterStyle.js";
import { masterName, masterFlag } from "../data/masterNames.js";
import { masterInfoLine } from "../lib/masterSearchInfo.js";
import { rankMasterMatches } from "../lib/masterNameSearch.js";
import { SearchResultRow, searchDropStyle } from "../components/searchResultRow.jsx";
import { t } from "../lib/i18n.js";

// 학습 탭의 다른 카드와 같은 종이 카드 톤.
const card = { background: T.paper, border: "1px solid #DCCBA8", borderRadius: 16, padding: 16, marginBottom: 12, boxShadow: "0 1px 0 rgba(255,255,255,.55) inset, 0 6px 18px -12px rgba(0,0,0,.55)" };
const sub = { fontSize: 11.5, color: T.inkSoft, lineHeight: 1.55 };
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
      <text x="50%" y="50%" textAnchor="middle" dominantBaseline="central" fill={T.ivoryHi} style={{ fontSize: size * 0.27, fontWeight: 900, fontFamily: "Georgia, serif" }}>{pct}%</text>
    </svg>
  );
}
function MasterStyle({ games }) {
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
  if (!data) return <div style={card}><SectionHead Icon={Users} title={t("마스터 스타일")} /><p style={{ ...sub, margin: 0 }}>{t("불러오는 중…")}</p></div>;
  if (!m.ok) return (
    <div style={card}>
      <SectionHead Icon={Users} title={t("마스터 스타일")} />
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
    <div style={card}>
      <SectionHead Icon={Users} title={t("마스터 스타일")} right={<span style={sub}>{t("최근 {0}판 기준", m.n)}</span>} />
      <div style={{ borderRadius: 14, background: "linear-gradient(180deg,#2E1B10,#241509)", border: "1px solid #4A3322", padding: "10px 12px", marginBottom: 8 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <SimRing pct={Math.round(picked.sim * 100)} size={50} />
          <div style={{ minWidth: 0, flex: 1 }}>
            <div style={{ fontSize: 15.5, fontWeight: 900, color: T.ivoryHi, fontFamily: "Georgia, serif", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{masterFlag(picked.name)} {masterName(picked.name, "en")}</div>
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
function GrowthHeader({ uid, me, onOpenTitle }) {
  const mid = useMyMid(uid);
  const name = me.nickname || me.displayId || me.username || "";
  const isGM = tierFromXp(me.xp || 0).tier.key === "grandmaster";
  const hasTitle = !!(me.title && titleDef(me.title));
  const photo = 72;
  const identity = (
    <div style={{ display: "flex", alignItems: "center", gap: 14, minWidth: 0, flex: 1 }}>
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
  );
  return (
    <div style={{ ...card, padding: 0, overflow: "hidden", marginBottom: 12, position: "relative" }}>
      <div aria-hidden style={{ height: 6, background: "linear-gradient(90deg,#8A6C2F,#ECCB86 50%,#8A6C2F)" }} />
      <div style={{ padding: "14px 16px 12px" }}>
        {hasTitle && <div style={{ marginBottom: 10 }}><EquippedTitleFit id={me.title} onClick={onOpenTitle ? () => onOpenTitle(me.title) : undefined} /></div>}
        {identity}
      </div>
      <div style={{ padding: "10px 16px 4px", borderTop: "1px solid rgba(0,0,0,.07)", background: "rgba(0,0,0,.03)" }}>
        <TierRatingRow pub={{ xp: me.xp || 0, puzzleRating: me.puzzleRating }} />
      </div>
    </div>
  );
}

/* ── 리뷰 5판 게이트 ──
   성장 분석은 데이터가 충분해야 의미가 있어, 내가 리뷰한 대국이 GROWTH_MIN_REVIEWS(5)판 이상일 때만 열린다. 모자라면 게이지 바로 진행 상황과 "먼저 리뷰하라"는 안내를 보여 준다. */
function ReviewGate({ count, need }) {
  const n = Math.min(count, need), left = need - n;
  return (
    <div style={card}>
      <SectionHead Icon={Lock} title={t("성장 분석")} right={<span style={{ fontSize: 12.5, fontWeight: 900, color: T.ink, fontFamily: "Georgia, serif" }}>{n}/{need}</span>} />
      <p style={{ fontSize: 13, fontWeight: 800, color: T.ink, margin: "0 0 12px", lineHeight: 1.5 }}>{t("리뷰한 대국이 {0}판 이상이면 성장 분석이 열림", need)}</p>
      <div role="progressbar" aria-valuemin={0} aria-valuemax={need} aria-valuenow={n} aria-label={t("성장 분석")} style={{ display: "flex", gap: 5 }}>
        {Array.from({ length: need }, (_, i) => (
          <span key={i} style={{ flex: 1, height: 12, borderRadius: 6, background: i < n ? "linear-gradient(90deg,#C49A50,#ECCB86)" : "rgba(0,0,0,.1)", border: "1px solid " + (i < n ? "#A8842F" : "rgba(0,0,0,.06)"), transition: "background .4s ease" }} />
        ))}
      </div>
      <p style={{ fontSize: 12.5, fontWeight: 800, color: "#8A6C2F", margin: "10px 0 4px" }}>{t("{0}판 더 리뷰하면 열림", left)}</p>
      <p style={{ ...sub, margin: 0 }}>{t("최근 대국의 연두색 리뷰 버튼으로 내 대국을 리뷰하면 한 판씩 쌓임")}</p>
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
   요약 → 성장 곡선 → 지금 고칠 한 가지 → 구간 진단 → 반복되는 실수 원인 → 수 유형별 분석 → 가장 아쉬웠던 수. 계산은 lib/growthAnalysis.js(순수 함수).
   원인 분류가 느려서(전술 탐색) 화면은 빠른 계산을 먼저 그리고, 분류가 끝나는 대로 다시 그린다. */
const tacLabel = (k) => ({ fork: t("포크"), skewer: t("스큐어"), discoveredAttack: t("디스커버드 어택"), discoveredCheck: t("디스커버드 체크"), doubleCheck: t("더블 체크"), promotion: t("승격") }[k] || k);
const fmtDate = (sec) => { if (!sec) return ""; const d = new Date(sec * 1000); return String(d.getMonth() + 1).padStart(2, "0") + "." + String(d.getDate()).padStart(2, "0"); };
const reviewGameOf = (g) => ({ sans: g.sans, color: g.color, white: { username: g.white }, black: { username: g.black }, endTime: g.endTime, id: g.id, opening: g.opening, username: g.owner });
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
function MoveCard({ m, onReview }) {
  const g = m.game;
  return (
    <div style={{ display: "flex", gap: 12, padding: 10, borderRadius: 12, border: "1px solid #DCCBA8", background: "rgba(0,0,0,.025)", marginBottom: 8 }}>
      <MiniBoard sans={g.sans} ply={m.ply} color={g.color} />
      <div style={{ minWidth: 0, flex: 1, display: "flex", flexDirection: "column", gap: 4 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          {badgeIcon(m.kind, 16)}
          <span style={{ fontSize: 14, fontWeight: 900, color: T.ink, fontFamily: "Georgia, serif" }}>{moveNumber(m.ply)}{m.san}</span>
          <span style={{ marginLeft: "auto", fontSize: 13, fontWeight: 900, color: T.blunder, whiteSpace: "nowrap" }}>−{Math.round(m.loss)}%p</span>
        </div>
        <div style={{ ...sub, fontSize: 11.5 }}>{QLABEL[m.kind] || m.kind}{m.best ? " · " + t("최선의 수") + ": " : ""}{m.best && <b style={{ color: T.ink }}>{m.best}</b>}</div>
        {m.cause && <span style={{ alignSelf: "flex-start", fontSize: 10.5, fontWeight: 800, color: T.mistake, background: "rgba(217,130,43,.12)", border: "1px solid rgba(217,130,43,.35)", borderRadius: 999, padding: "1px 8px" }}>{causeLabel(m.cause)}{m.detail ? " · " + tacLabel(m.detail) : ""}</span>}
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: "auto" }}>
          <span style={{ ...sub, fontSize: 10.5, flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{fmtDate(g.endTime)}{g.opening ? " · " + g.opening : ""}</span>
          {onReview && <BestMoveJumpButton size={28} title={t("리뷰하기")} onClick={() => onReview(reviewGameOf(g))} />}
        </div>
      </div>
    </div>
  );
}

/* 요약: 평균 정확도, 최근 변화, 가장 약한 구간, 지금 고칠 것 */
function Overview({ g }) {
  const d = g.trend.delta, up = d != null && d >= 0.5, down = d != null && d <= -0.5;
  const chip = (txt, key) => <span key={key} style={{ fontSize: 11.5, fontWeight: 800, color: T.brassHi, background: "rgba(236,203,134,.12)", border: "1px solid rgba(236,203,134,.3)", borderRadius: 999, padding: "3px 10px" }}>{txt}</span>;
  return (
    <div style={{ ...darkPanel, padding: "14px 16px" }}>
      <div style={{ display: "flex", alignItems: "flex-end", gap: 16, flexWrap: "wrap" }}>
        <div>
          <div style={{ fontSize: 11.5, fontWeight: 700, color: "#CDBA98" }}>{t("평균 정확도")}</div>
          <div style={{ fontSize: 34, fontWeight: 900, color: T.ivoryHi, fontFamily: "Georgia, serif", lineHeight: 1.1 }}>{g.avgAcc != null ? g.avgAcc.toFixed(1) : "–"}<span style={{ fontSize: 16 }}>%</span></div>
          <div style={{ fontSize: 11, color: "#A8987C" }}>{t("리뷰한 {0}판 기준", g.n)}</div>
        </div>
        {d != null && (
          <div style={{ marginLeft: "auto", textAlign: "right" }}>
            <div style={{ fontSize: 11, color: "#CDBA98" }}>{t("최근 {0}판 기준 변화", g.trend.k)}</div>
            <div style={{ fontSize: 24, fontWeight: 900, color: up ? "#7DB68A" : down ? "#FF8A7A" : "#E3CC93", fontFamily: "Georgia, serif" }}>{up ? "▲" : down ? "▼" : "–"} {Math.abs(d).toFixed(1)}%p</div>
          </div>
        )}
      </div>
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 12 }}>
        {g.weakPhase && chip(t("가장 약한 구간: {0}", phaseLabel(g.weakPhase.key)), "ph")}
        {g.focus && chip(t("지금 고칠 것: {0}", causeLabel(g.focus.cause)), "fc")}
      </div>
      {g.pending > 0 && <div style={{ fontSize: 11, color: "#A8987C", marginTop: 8 }}>{t("실수 원인 분석 중, {0}개 남음", g.pending)}</div>}
    </div>
  );
}

/* ① 성장 곡선 */
function GrowthCurve({ g, onReview }) {
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
  return (
    <div style={card}>
      <SectionHead Icon={TrendingUp} title={t("성장 곡선")} right={<span style={{ ...sub, fontSize: 11 }}>{t("리뷰한 {0}판 기준", g.n)}</span>} />
      <svg viewBox={"0 0 " + W + " " + H} width="100%" role="img" aria-label={t("성장 곡선")} style={{ display: "block", overflow: "visible" }}>
        {g.trend.k > 0 && pts.length > g.trend.k && <rect x={x(recentFrom) - 8} y={PY - 8} width={W - x(recentFrom) + 8 - PX + 8} height={H - 2 * PY + 16} rx="8" fill="rgba(196,154,80,.14)" />}
        {g.avgAcc != null && <line x1={PX} x2={W - PX} y1={y(g.avgAcc)} y2={y(g.avgAcc)} stroke="#8A6C2F" strokeWidth="1" strokeDasharray="4 4" opacity=".7" />}
        <text x={PX} y={y(hi) - 2} fontSize="9" fill={T.inkSoft}>{hi}</text>
        <text x={PX} y={y(lo) + 10} fontSize="9" fill={T.inkSoft}>{lo}</text>
        <polyline points={pts.map((p, i) => x(i) + "," + y(p.acc).toFixed(1)).join(" ")} fill="none" stroke="#A8842F" strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
        {pts.map((p, i) => (
          <g key={p.key} onClick={() => setSel(i)} style={{ cursor: "pointer" }}>
            <circle cx={x(i)} cy={y(p.acc)} r="11" fill="transparent" />
            <circle cx={x(i)} cy={y(p.acc)} r={i === idx ? 6 : 4} fill={p.acc >= g.avgAcc ? T.best : T.mistake} stroke={i === idx ? T.ink : "#F1E6D0"} strokeWidth={i === idx ? 2 : 1.5} />
          </g>
        ))}
      </svg>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 8, padding: "8px 10px", borderRadius: 10, background: "rgba(0,0,0,.04)", border: "1px solid #DCCBA8" }}>
        <div style={{ minWidth: 0, flex: 1 }}>
          <div style={{ fontSize: 12.5, fontWeight: 800, color: T.ink }}>{t("정확도")} <span style={{ color: T.best, fontFamily: SITE_FONT }}>{cur.acc.toFixed(1)}%</span></div>
          <div style={{ ...sub, fontSize: 11, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{fmtDate(cur.endTime)}{cur.game.opening ? " · " + cur.game.opening : ""}</div>
        </div>
        {onReview && <BestMoveJumpButton size={28} title={t("리뷰하기")} onClick={() => onReview(reviewGameOf(cur.game))} />}
      </div>
      <p style={{ ...sub, margin: "8px 0 0", fontSize: 11 }}>{t("점을 눌러 그 대국의 정확도와 리뷰 보기")}</p>
    </div>
  );
}

/* ② 지금 고칠 한 가지 + 성장 가능성 */
function FocusCard({ g, onReview }) {
  const f = g.focus;
  return (
    <div style={{ ...card, borderColor: "#C49A50", background: "linear-gradient(180deg,#F6ECD6,#F1E6D0)" }}>
      <SectionHead Icon={Target} title={t("지금 고칠 한 가지")} />
      {!f ? (
        <p style={{ ...sub, margin: 0 }}>{g.pending > 0 ? t("실수 원인 분석 중, {0}개 남음", g.pending) : t("아직 두 판 이상에서 반복된 실수가 없음")}</p>
      ) : (
        <>
          <div style={{ fontSize: 19, fontWeight: 900, color: T.ink }}>{causeLabel(f.cause)}</div>
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap", margin: "8px 0 10px" }}>
            <span style={{ ...chipStyle }}>{t("{0}판에서 {1}회 반복", f.games, f.n)}</span>
            <span style={{ ...chipStyle }}>{t("전체 승률 손실의 {0}%", pct(f.share))}</span>
            {f.detail && <span style={{ ...chipStyle }}>{t("가장 자주 나온 전술: {0}", tacLabel(f.detail))}</span>}
          </div>
          {f.gain != null && f.gain > 0 && g.pending === 0 && (   /* 분류가 끝나기 전에는 상승폭이 계속 바뀌므로 완료 후에만 보여 준다 */
            <div style={{ padding: "10px 12px", borderRadius: 12, background: "rgba(63,122,58,.1)", border: "1px solid rgba(63,122,58,.4)", marginBottom: 10 }}>
              <div style={{ fontSize: 12.5, fontWeight: 800, color: T.best }}>{t("이 실수를 모두 없애면 평균 정확도 최대 약 +{0}%p", f.gain.toFixed(1))}</div>
            </div>
          )}
          <p style={{ fontSize: 13, fontWeight: 700, color: T.ink, margin: "0 0 12px", lineHeight: 1.5 }}>{causeAdvice(f.cause)}</p>
          {f.examples.map((m) => <MoveCard key={m.game.key + ":" + m.ply} m={m} onReview={onReview} />)}
        </>
      )}
    </div>
  );
}
const chipStyle = { fontSize: 11, fontWeight: 800, color: T.ink, background: "rgba(90,58,34,.1)", borderRadius: 999, padding: "3px 10px" };

/* ③ 구간 진단 */
function PhaseCard({ g }) {
  return (
    <div style={card}>
      <SectionHead Icon={Layers} title={t("구간 진단")} />
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        {g.phases.map((p) => {
          const weak = g.weakPhase && g.weakPhase.key === p.key, ok = p.acc != null && p.games >= MIN_PHASE_GAMES;
          return (
            <div key={p.key}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
                <span style={{ fontSize: 12.5, fontWeight: 800, color: T.ink }}>{phaseLabel(p.key)}</span>
                {weak && <span style={{ fontSize: 10.5, fontWeight: 900, color: "#fff", background: "#D9822B", borderRadius: 999, padding: "1px 8px" }}>{t("가장 약함")}</span>}
                <span style={{ marginLeft: "auto", fontSize: 12, fontWeight: 800, color: T.ink }}>{ok ? t("정확도 {0}%", p.acc.toFixed(1)) : t("표본 부족")}</span>
              </div>
              <div style={{ height: 10, borderRadius: 5, background: "rgba(0,0,0,.08)", overflow: "hidden" }}>
                {ok && <div style={{ width: Math.max(2, Math.min(100, p.acc)) + "%", height: "100%", borderRadius: 5, background: weak ? "#D9822B" : "linear-gradient(90deg,#C49A50,#ECCB86)", transition: "width .5s ease" }} />}
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
function CauseCard({ g }) {
  const [open, setOpen] = useState(null);
  if (!g.causes.length) return null;
  const rows = g.causes.slice(0, 6), max = Math.max(...rows.map((c) => c.share), 0.01);
  return (
    <div style={card}>
      <SectionHead Icon={BarChart3} title={t("반복되는 실수 원인")} />
      <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
        {rows.map((c) => (
          <div key={c.key}>
            <button className="press" onClick={() => setOpen(open === c.key ? null : c.key)} aria-expanded={open === c.key} style={{ display: "flex", alignItems: "center", gap: 9, width: "100%", padding: "6px 0", background: "none", border: "none", cursor: "pointer", fontFamily: SITE_FONT, textAlign: "left" }}>
              <span style={{ flex: "0 0 38%", minWidth: 0, fontSize: 12, fontWeight: 700, color: T.ink, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{causeLabel(c.key)}</span>
              <div style={{ flex: 1, minWidth: 0, height: 12, borderRadius: 6, background: "rgba(0,0,0,.07)", overflow: "hidden" }}><div style={{ width: Math.round(100 * c.share / max) + "%", height: "100%", background: "#D9822B", borderRadius: 6 }} /></div>
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
function TypeCard({ g }) {
  const groups = [["piece", t("기물별"), pieceLabel], ["action", t("수 종류별"), actionLabel]];
  if (!g.moveTypes.length) return null;
  return (
    <div style={card}>
      <SectionHead Icon={Grid3x3} title={t("수 유형별 분석")} right={g.weakType ? <span style={{ fontSize: 11, fontWeight: 800, color: "#D9822B" }}>{t("가장 약한 유형")}: {(g.weakType.group === "piece" ? pieceLabel : actionLabel)(g.weakType.key)}</span> : null} />
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

/* ⑥ 가장 아쉬웠던 수 */
function WorstCard({ g, onReview }) {
  // "지금 고칠 한 가지"의 예시와 같은 수는 한 번만 보여 준다(남는 게 없으면 구획을 숨김).
  const shown = new Set(g.focus ? g.focus.examples.map((m) => m.game.key + ":" + m.ply) : []);
  const list = g.worst.filter((m) => !shown.has(m.game.key + ":" + m.ply)).slice(0, WORST_COUNT);
  if (!list.length) return null;
  return (
    <div style={card}>
      <SectionHead Icon={AlertTriangle} title={t("가장 아쉬웠던 수")} />
      {list.map((m) => <MoveCard key={m.game.key + ":" + m.ply} m={m} onReview={onReview} />)}
    </div>
  );
}

/* 학습 탭의 성장 분석 — 맨 위 프로필 헤더, 그 아래는 리뷰 5판 게이트(미달) 또는 분석 본문(달성: 요약·성장 곡선·고칠 한 가지·구간 진단·실수 원인·수 유형·아쉬운 수·마스터 스타일). */
export function GrowthPanel({ uid, games, me, onOpenTitle, ccName, user, onOpenGameAnalyze }) {
  useEffect(() => { purgeLegacyGrowthData(); }, []);
  const records = useMemo(() => collectMyReviews({ names: [user], ccName, version: REVIEW_RESULT_CACHE_VERSION }), [ccName, user, uid]);
  const open = records.length >= GROWTH_MIN_REVIEWS;
  const g = useGrowthData(open ? records : []);
  return (
    <section aria-label={t("성장 분석")} style={{ marginBottom: 8 }}>
      {me && <GrowthHeader uid={uid} me={me} onOpenTitle={onOpenTitle} />}
      {!open ? <ReviewGate count={records.length} need={GROWTH_MIN_REVIEWS} /> : (
        <>
          {g ? (
            <>
              <Overview g={g} />
              <GrowthCurve g={g} onReview={onOpenGameAnalyze} />
              <FocusCard g={g} onReview={onOpenGameAnalyze} />
              <PhaseCard g={g} />
              <CauseCard g={g} />
              <TypeCard g={g} />
              <WorstCard g={g} onReview={onOpenGameAnalyze} />
            </>
          ) : <div style={card}><p style={{ ...sub, margin: 0 }}>{t("불러오는 중…")}</p></div>}
          <MasterStyle games={games} />
        </>
      )}
    </section>
  );
}
