// (v0.7.4) 성장 분석 — 프로필 헤더(/user 상단 정보) + 리뷰 5판 게이트 + 마스터 스타일.
// 약점 지도·복습 카드·오프닝 실수·실수 요약은 "리뷰하는 대로 약점을 분석하고 성장 가능성을 찾는다"는 방향으로 처음부터 다시 설계하려고 모두 삭제했다(전용 라이브러리 3개 포함).
// 마스터 스타일 로직은 lib/masterStyle.js(순수 함수, scripts/check-growth.mjs가 검사).
import { useState, useEffect, useMemo, Fragment } from "react";
import { Lock, Users } from "lucide-react";
import { T } from "../lib/theme.js";
import { SITE_FONT } from "../components/engineLines.jsx";
import { OnlineDot, titleDef, REVIEW_RESULT_CACHE_VERSION } from "./common.jsx";
import { countMyReviewedGames, GROWTH_MIN_REVIEWS } from "../lib/reviewedCount.js";
import { EquippedTitleFit } from "./social.jsx";
import { TierRatingRow } from "./profile.jsx";
import { gmPhotoRingStyle, tierFromXp } from "../lib/tierSystem.js";
import { SB_ON, sbSelect } from "../lib/supabaseClient.js";
import UgcText from "../components/UgcText.jsx";
import { styleFeatures, matchMasters, MIN_STYLE_GAMES, CRITERIA_GROUPS, criterionLabel, criterionGroupLabel, formatCriterion, formatDiff, compareCriteria, levelLabel } from "../lib/masterStyle.js";
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
  const [openG, setOpenG] = useState(() => new Set([CRITERIA_GROUPS[0] && CRITERIA_GROUPS[0].id]));
  useEffect(() => { let on = true; import("../data/masterStyles.json").then((m) => { if (on) setData(m.default || m); }); return () => { on = false; }; }, []);
  const feat = useMemo(() => styleFeatures((games || []).slice(0, 200).map((g) => ({ moves: g.moves, color: g.color, result: g.result }))), [games]);
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
  const toggleG = (id) => setOpenG((prev) => { const n = new Set(prev); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  if (!data) return <div style={card}><SectionHead Icon={Users} title={t("마스터 스타일")} /><p style={{ ...sub, margin: 0 }}>{t("불러오는 중…")}</p></div>;
  if (!m.ok) return (
    <div style={card}>
      <SectionHead Icon={Users} title={t("마스터 스타일")} />
      <p style={{ ...sub, margin: 0 }}>{t("chess.com 대국이 {0}판 이상 연동되면 나와 닮은 마스터를 알려 줌 (지금 {1}판)", MIN_STYLE_GAMES, m.n)}</p>
    </div>
  );
  const similarN = rows.filter((r) => r.level === "same" || r.level === "close").length, comparable = rows.filter((r) => r.level !== "na").length;
  const allKeys = CRITERIA_GROUPS.flatMap((g) => g.keys).filter((k) => byKey[k]);
  return (
    <div style={card}>
      <SectionHead Icon={Users} title={t("마스터 스타일")} right={<span style={sub}>{t("최근 {0}판 기준", m.n)}</span>} />
      <div style={{ borderRadius: 14, background: "linear-gradient(180deg,#2E1B10,#241509)", border: "1px solid #4A3322", padding: "14px 14px 12px", marginBottom: 10 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
          <SimRing pct={Math.round(picked.sim * 100)} />
          <div style={{ minWidth: 0, flex: 1 }}>
            <div style={{ fontSize: 17, fontWeight: 900, color: T.ivoryHi, fontFamily: "Georgia, serif", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{masterFlag(picked.name)} {masterName(picked.name, "en")}</div>
            <div style={{ fontSize: 11.5, color: "#CDBA98", marginTop: 3, lineHeight: 1.5 }}>{picked.elo ? peakText(picked.elo) + ", " : ""}{t("{0}판 분석", picked.games)}, {t("일치도 {0}%", Math.round(picked.sim * 100))}</div>
            <div style={{ fontSize: 12, fontWeight: 800, color: T.brassHi, marginTop: 3 }}>{t("비슷한 기준 {0}/{1}", similarN, comparable)}</div>
          </div>
        </div>
        <div style={{ display: "flex", gap: 3, marginTop: 12, flexWrap: "wrap" }} aria-hidden>
          {allKeys.map((k) => <span key={k} title={criterionLabel(k) + ": " + levelLabel(byKey[k].level)} style={{ flex: "1 1 0", minWidth: 6, height: 9, borderRadius: 3, background: LEVEL_COLOR[byKey[k].level] }} />)}
        </div>
      </div>
      <div style={{ display: "flex", gap: 6, marginBottom: 10 }}>
        {top3.map((x, i) => {
          const on = x.name === picked.name;
          return (
            <button key={x.name} className="press" onClick={() => choose(x)} aria-pressed={on} style={{ flex: 1, minWidth: 0, textAlign: "left", padding: "8px 10px", borderRadius: 11, cursor: "pointer", border: "1.5px solid " + (on ? T.brass : "#DCCBA8"), background: on ? "rgba(196,154,80,.18)" : "rgba(0,0,0,.025)", fontFamily: SITE_FONT }}>
              <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 4 }}>
                <span style={{ fontSize: 10.5, fontWeight: 900, color: i === 0 ? "#8A6C2F" : T.inkSoft }}>{i + 1}</span>
                <span style={{ fontSize: 13.5, fontWeight: 900, color: T.ink }}>{Math.round(x.sim * 100)}%</span>
              </div>
              <div style={{ fontSize: 11.5, fontWeight: 800, color: T.ink, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{masterFlag(x.name)} {masterName(x.name, "en").split(" ").slice(-1)[0]}</div>
            </button>
          );
        })}
      </div>
      {/* 이름을 입력해 다른 마스터를 골라 비교한다. */}
      <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", marginBottom: 12 }}>
        <div style={{ position: "relative", flex: "1 1 170px", minWidth: 150 }}>
          <input value={focus ? query : masterName(picked.name, "en")} onChange={(e) => setQuery(e.target.value)} onFocus={() => { setQuery(""); setFocus(true); }} onBlur={() => setTimeout(() => setFocus(false), 150)}
            onKeyDown={(e) => { if (e.key === "Enter" && suggestions[0]) choose(suggestions[0]); }} aria-label={t("마스터 이름으로 검색")}
            placeholder={focus ? t("마스터 이름으로 검색") : masterName(picked.name, "en")} style={{ width: "100%", height: 36, boxSizing: "border-box", padding: "0 9px", borderRadius: 9, border: "1px solid #5A4630", background: "rgba(36,21,9,.92)", color: T.ivoryHi, fontSize: 12, fontFamily: SITE_FONT }} />
          {focus && suggestions.length > 0 && (
            <div style={{ ...searchDropStyle, zIndex: 20 }}>
              {suggestions.map((x) => <SearchResultRow key={x.name} tag="master" tagLabel={t("마스터")} flag={masterFlag(x.name)} title={masterName(x.name, "en")} sub={masterInfoLine(x.name)} onClick={() => choose(x)} />)}
            </div>
          )}
        </div>
        <span style={{ fontSize: 13, fontWeight: 800, color: T.ink }}>{t("와(과) 기준별 비교")}</span>
      </div>
      {/* 묶음별 접이식 비교. 각 묶음은 한 격자라 숫자 3열은 내용 폭(auto) — 어떤 언어의 값 표기("1.2×"·"±16pp"·"1.2倍")도 안 잘리고 줄마다 정렬된다.
          판정 알약은 열이 아니라 라벨 아래에 두어, 알약 글자가 긴 언어에서도 칸 밖으로 넘치지 않는다(BUG-071). */}
      {CRITERIA_GROUPS.map((g) => {
        const ks = g.keys.filter((k) => byKey[k]); if (!ks.length) return null;
        const open = openG.has(g.id), sim = ks.filter((k) => byKey[k].level === "same" || byKey[k].level === "close").length;
        return (
          <div key={g.id} style={{ borderTop: "1px solid rgba(0,0,0,.08)" }}>
            <button className="press" onClick={() => toggleG(g.id)} aria-expanded={open} style={{ display: "flex", alignItems: "center", gap: 8, width: "100%", padding: "10px 2px", background: "none", border: "none", cursor: "pointer", fontFamily: SITE_FONT, textAlign: "left" }}>
              <span style={{ flex: 1, minWidth: 0, fontSize: 12.5, fontWeight: 800, color: T.ink }}>{criterionGroupLabel(g.id)}</span>
              <span style={{ display: "inline-flex", gap: 2 }} aria-hidden>{ks.map((k) => <span key={k} style={{ width: 7, height: 7, borderRadius: 2, background: LEVEL_COLOR[byKey[k].level] }} />)}</span>
              <span style={{ fontSize: 11.5, fontWeight: 800, color: T.inkSoft, flexShrink: 0 }}>{sim}/{ks.length}</span>
              <span aria-hidden style={{ fontSize: 11, color: T.inkSoft, display: "inline-block", transform: open ? "rotate(90deg)" : "none", transition: "transform .2s" }}>▸</span>
            </button>
            {open && (
              <div className="growth-crit-table" style={{ display: "grid", gridTemplateColumns: "minmax(0,1fr) auto auto auto", columnGap: 0, fontSize: 11.5, paddingBottom: 8 }}>
                <span />
                <span style={{ ...critHead, textAlign: "right" }}>{t("나")}</span>
                <span style={{ ...critHead, textAlign: "right", maxWidth: 76, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{masterName(picked.name, "en").split(" ").slice(-1)[0]}</span>
                <span style={{ ...critHead, textAlign: "right" }}>{t("차이")}</span>
                {ks.map((k) => {
                  const r = byKey[k];
                  return (
                    <Fragment key={k}>
                      <div style={{ ...critCell, minWidth: 0, display: "flex", flexDirection: "column", alignItems: "flex-start", gap: 4 }}>
                        <span style={{ color: T.ink, fontWeight: 700, lineHeight: 1.3, overflowWrap: "anywhere" }}>{criterionLabel(k)}</span>
                        <span style={{ fontSize: 11.5, fontWeight: 800, color: "#fff", background: LEVEL_COLOR[r.level], borderRadius: 999, padding: "2px 9px", lineHeight: 1.3, maxWidth: "100%", overflowWrap: "anywhere" }}>{levelLabel(r.level)}</span>
                      </div>
                      <span style={{ ...critCell, ...critNum, color: T.ink, fontWeight: 800 }} title={t("나")}>{formatCriterion(k, r.mine)}</span>
                      <span style={{ ...critCell, ...critNum, color: T.inkSoft, fontWeight: 700 }} title={masterName(picked.name, "en")}>{formatCriterion(k, r.theirs)}</span>
                      <span style={{ ...critCell, ...critNum, color: T.inkSoft, fontWeight: 700, fontSize: 11.5 }}>{formatDiff(k, r.diff)}</span>
                    </Fragment>
                  );
                })}
              </div>
            )}
          </div>
        );
      })}
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

/* 학습 탭의 성장 분석 — 맨 위 프로필 헤더, 그 아래는 리뷰 5판 게이트(미달) 또는 마스터 스타일(달성). */
export function GrowthPanel({ uid, games, me, onOpenTitle, ccName }) {
  useEffect(() => { purgeLegacyGrowthData(); }, []);
  const reviewed = useMemo(() => countMyReviewedGames({ ccName, version: REVIEW_RESULT_CACHE_VERSION }), [ccName, uid]);
  const open = reviewed >= GROWTH_MIN_REVIEWS;
  return (
    <section aria-label={t("성장 분석")} style={{ marginBottom: 8 }}>
      {me && <GrowthHeader uid={uid} me={me} onOpenTitle={onOpenTitle} />}
      {open ? <MasterStyle games={games} /> : <ReviewGate count={reviewed} need={GROWTH_MIN_REVIEWS} />}
    </section>
  );
}
