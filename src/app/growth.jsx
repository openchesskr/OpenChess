// (v0.6.4) 성장 분석 — 학습 탭 안에 한 화면으로 펼쳐 보이는 약점 지도 · 실수 복습 카드(간격 반복) · 마스터 스타일 매칭.
// 로직은 lib/weakness.js·lib/masterStyle.js(순수 함수, scripts/check-growth.mjs가 검사), 저장은 lib/growthStore.js.
// 대국 하이라이트 카드는 리뷰 공유 시트(review.jsx)에 있다.
import { useState, useEffect, useMemo, useCallback, Fragment } from "react";
import { Chess } from "chess.js";
import { Target, Check, Sparkles, RotateCcw, BookOpen, Users } from "lucide-react";
import { T } from "../lib/theme.js";
import { SITE_FONT, SEQ_FONT } from "../components/engineLines.jsx";
import { ChatMoveBoard } from "../components/chatPlus.jsx";
import { Board, getAnalysisPool, OnlineDot, titleDef, useNarrow } from "./common.jsx";
import { EquippedTitleFit } from "./social.jsx";
import { TierRatingRow } from "./profile.jsx";
import { gmPhotoRingStyle, tierFromXp } from "../lib/tierSystem.js";
import { SB_ON, sbSelect } from "../lib/supabaseClient.js";
import UgcText from "../components/UgcText.jsx";
import { BestMoveJumpButton } from "../components/uiPrimitives.jsx";
import { parseFenFull, sansToFen, moveNumber } from "../lib/chessRules.js";
import { OM, eligibleGames, findOpeningMistakes, gamesOfLine } from "../lib/openingMistakes.js";
import { loadGrowth, saveGrowth } from "../lib/growthStore.js";
import { PHASES, THEMES, SRS_DAYS, phaseLabel, themeLabel, themeAdvice, weaknessReport, dueCards, gradeCard, srsStats, isCardAnswer } from "../lib/weakness.js";
import { styleFeatures, matchMasters, MIN_STYLE_GAMES, CRITERIA_GROUPS, criterionLabel, criterionGroupLabel, formatCriterion, formatDiff, compareCriteria, levelLabel } from "../lib/masterStyle.js";
import { masterName, masterFlag } from "../data/masterNames.js";
import { masterInfoLine } from "../lib/masterSearchInfo.js";
import { rankMasterMatches } from "../lib/masterNameSearch.js";
import { SearchResultRow, searchDropStyle } from "../components/searchResultRow.jsx";
import { t, tx } from "../lib/i18n.js";

// 학습 탭의 다른 카드(일일 퀘스트 등)와 같은 종이 카드 톤.
const card = { background: T.paper, border: "1px solid #DCCBA8", borderRadius: 16, padding: 16, marginBottom: 12, boxShadow: "0 1px 0 rgba(255,255,255,.55) inset, 0 6px 18px -12px rgba(0,0,0,.55)" };
const h3 = { fontSize: 14, fontWeight: 800, color: T.ink, margin: 0, letterSpacing: "-.01em" };
const sub = { fontSize: 11.5, color: T.inkSoft, lineHeight: 1.55 };
const chip = (on) => ({ padding: "5px 11px", borderRadius: 999, fontSize: 11.5, fontWeight: 800, cursor: "pointer", whiteSpace: "nowrap", fontFamily: SITE_FONT, border: "1px solid " + (on ? T.brass : "#DCCBA8"), background: on ? "rgba(196,154,80,.2)" : "transparent", color: on ? T.ink : T.inkSoft });
const btn = (primary) => ({ padding: "9px 14px", borderRadius: 10, border: primary ? "none" : "1px solid #C9B58C", background: primary ? "linear-gradient(180deg,#3A2516,#241509)" : "transparent", color: primary ? T.ivoryHi : T.ink, fontWeight: 800, fontSize: 12.5, cursor: "pointer", whiteSpace: "nowrap", fontFamily: SITE_FONT });
const critHead = { fontSize: 11, fontWeight: 800, color: T.inkSoft, paddingBottom: 2, paddingLeft: 12 };
const critCell = { borderTop: "1px solid rgba(0,0,0,.06)", padding: "6px 0" };
const critNum = { textAlign: "right", paddingLeft: 12, whiteSpace: "nowrap", fontVariantNumeric: "tabular-nums" };
const LEVEL_COLOR = { same: "#3F7A3A", close: "#7FA04A", far: "#D9822B", veryFar: "#C8453B", na: "#9A8B72" };

function useGrowth(uid) {
  const [data, setData] = useState(() => loadGrowth(uid));
  useEffect(() => { const f = () => setData(loadGrowth(uid)); setData(loadGrowth(uid)); window.addEventListener("occ-growth", f); return () => window.removeEventListener("occ-growth", f); }, [uid]);
  const update = useCallback((mistakes) => { const next = { ...loadGrowth(uid), mistakes }; saveGrowth(uid, next); setData(next); }, [uid]);
  return [data, update];
}

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
const miniLabel = { fontSize: 11, fontWeight: 800, color: T.inkSoft, letterSpacing: ".02em", marginBottom: 8 };

/* ── 약점 지도 (v0.7.4 진단 리포트형) ──
   구간별 실수는 세로 막대, 실수가 난 칸은 작은 보드 히트맵을 한 줄에 나란히 놓고,
   "무엇을 놓쳤나"는 유형별 한 줄 막대를 구간(오프닝·중반전·엔드게임)별로 쪼개 쌓아 예전의 구간×유형 표를 대신한다. */
const PHASE_COLOR = { opening: T.only, middle: "#D9822B", end: T.brilliant };
function WeaknessMap({ list, onPractice }) {
  const rep = useMemo(() => weaknessReport(list), [list]);
  if (!rep.total) return (
    <div style={card}>
      <SectionHead Icon={Target} title={t("약점 지도")} />
      <p style={{ ...sub, margin: 0 }}>{t("게임 리뷰를 열면 내가 둔 실수·블런더·놓친 수가 자동으로 쌓이고, 여기에 약점 지도가 그려짐")}</p>
    </div>
  );
  const maxPhase = Math.max(1, ...rep.byPhase.map((x) => x.n));
  const themeRows = rep.byTheme.slice(0, 5), maxTheme = Math.max(1, ...themeRows.map((x) => x.n));
  const split = (key) => PHASES.map((ph, ri) => ({ ph, n: rep.matrix[ri][THEMES.indexOf(key)] }));
  return (
    <div style={card}>
      <SectionHead Icon={Target} title={t("약점 지도")} />
      {rep.weakPhase && <div style={{ margin: "-4px 0 12px", padding: "8px 11px", borderRadius: 10, background: "rgba(217,130,43,.12)", border: "1px solid rgba(217,130,43,.35)", fontSize: 12, fontWeight: 800, color: T.ink }}>{t("가장 많이 흔들리는 구간: {0}", phaseLabel(rep.weakPhase.key))}</div>}
      <div style={{ display: "flex", gap: 18, flexWrap: "wrap", alignItems: "flex-start", marginBottom: 16 }}>
        <div style={{ flex: "1 1 190px", minWidth: 0 }}>
          <div style={miniLabel}>{t("구간별 실수")}</div>
          <div style={{ display: "flex", alignItems: "flex-end", gap: 10, height: 132 }}>
            {rep.byPhase.map((p) => {
              const hot = rep.weakPhase && p.key === rep.weakPhase.key;
              return (
                <div key={p.key} style={{ flex: 1, minWidth: 0, height: "100%", display: "flex", flexDirection: "column", justifyContent: "flex-end", alignItems: "center", gap: 5 }}>
                  <span style={{ fontSize: 14, fontWeight: 900, color: hot ? "#D9822B" : T.ink, fontFamily: "Georgia, serif" }}>{p.n}</span>
                  <div style={{ width: "100%", maxWidth: 54, height: 6 + Math.round(84 * p.n / maxPhase), borderRadius: "9px 9px 4px 4px", background: PHASE_COLOR[p.key], opacity: hot ? 1 : 0.62, transition: "height .5s ease" }} />
                  <span style={{ fontSize: 11.5, fontWeight: 800, color: T.ink, whiteSpace: "nowrap" }}>{phaseLabel(p.key)}</span>
                </div>
              );
            })}
          </div>
        </div>
        <div style={{ flex: "0 1 150px", minWidth: 120 }}>
          <div style={miniLabel}>{t("실수가 난 칸")}</div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(8,1fr)", width: "100%", border: "2px solid #B8955A", borderRadius: 4, overflow: "hidden" }} aria-label={t("실수한 수가 도착한 칸의 분포")}>
            {rep.heat.map((row, r) => row.map((n, f) => (
              <div key={r + "-" + f} title={n ? "abcdefgh"[f] + (8 - r) + ", " + n : undefined} style={{ aspectRatio: "1", background: (r + f) % 2 === 0 ? "#E8D2A6" : "#7C4F2E", position: "relative" }}>
                {n > 0 && <div style={{ position: "absolute", inset: 0, background: "rgba(200,69,59," + (0.25 + 0.7 * n / rep.heatMax).toFixed(2) + ")", display: "flex", alignItems: "center", justifyContent: "center", color: "#fff", fontSize: 9, fontWeight: 800 }}>{n}</div>}
              </div>)))}
          </div>
        </div>
      </div>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, flexWrap: "wrap", marginBottom: 8 }}>
        <div style={{ ...miniLabel, marginBottom: 0 }}>{t("무엇을 놓쳤나")}</div>
        <div style={{ display: "flex", gap: 10 }}>
          {PHASES.map((ph) => <span key={ph} style={{ display: "inline-flex", alignItems: "center", gap: 4, fontSize: 10.5, fontWeight: 700, color: T.inkSoft }}><span style={{ width: 8, height: 8, borderRadius: 3, background: PHASE_COLOR[ph] }} />{phaseLabel(ph)}</span>)}
        </div>
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 7, marginBottom: 16 }}>
        {themeRows.map((th) => (
          <div key={th.key} style={{ display: "flex", alignItems: "center", gap: 9 }}>
            <span style={{ flex: "0 0 36%", minWidth: 0, fontSize: 12, fontWeight: 700, color: T.ink, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{themeLabel(th.key)}</span>
            <div style={{ flex: 1, minWidth: 0, height: 14, borderRadius: 7, background: "rgba(0,0,0,.06)", overflow: "hidden" }}>
              <div style={{ width: Math.round(100 * th.n / maxTheme) + "%", height: "100%", display: "flex" }}>
                {split(th.key).map(({ ph, n }) => n > 0 && <div key={ph} title={phaseLabel(ph) + " " + n} style={{ flex: n, background: PHASE_COLOR[ph], minWidth: 3 }} />)}
              </div>
            </div>
            <span style={{ width: 26, textAlign: "right", fontSize: 12, fontWeight: 900, color: T.ink, flexShrink: 0 }}>{th.n}</span>
          </div>
        ))}
      </div>
      <div style={miniLabel}>{t("이렇게 보완하기")}</div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 8 }}>
        {rep.topThemes.map((th, i) => (
          <div key={th.key} style={{ padding: "10px 12px", borderRadius: 12, background: "rgba(0,0,0,.035)", border: "1px solid #DCCBA8", display: "flex", flexDirection: "column", gap: 6 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
              <span style={{ width: 20, height: 20, borderRadius: 7, background: i === 0 ? "#D9822B" : "rgba(0,0,0,.14)", color: i === 0 ? "#fff" : T.ink, fontSize: 11, fontWeight: 900, display: "inline-flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>{i + 1}</span>
              <span style={{ fontSize: 12.5, fontWeight: 800, color: T.ink, flex: 1, minWidth: 0 }}>{themeLabel(th.key)}</span>
            </div>
            <p style={{ ...sub, margin: 0, flex: 1 }}>{themeAdvice(th.key)}</p>
            <button className="press" onClick={() => onPractice(th.key)} style={{ ...chip(false), alignSelf: "flex-start", padding: "4px 11px", fontSize: 11 }}>{t("이 유형 복습")}</button>
          </div>
        ))}
      </div>
    </div>
  );
}

function squaresOf(fen, san) {
  try { const mv = new Chess(fen).move(String(san).replace(/[+#!?]+$/g, "")); const sq = (s) => [8 - parseInt(s[1], 10), "abcdefgh".indexOf(s[0])]; return [sq(mv.from), sq(mv.to)]; } catch { return []; }
}
/* ── 실수 복습 카드 (v0.7.4 덱형) ──
   유형 칩에 장수를 붙이고, 복습 간격 단계(1·3·7·14·30일)별 카드 분포를 막대로 보여 준 뒤 시작 버튼. 세션 중에는 진행 막대 + 큰 보드. 로직(간격 반복)은 그대로. */
function ReviewCards({ list, update, filter, setFilter }) {
  const stats = useMemo(() => srsStats(list), [list]);
  const pool = useMemo(() => (filter === "all" ? list : list.filter((m) => m.theme === filter)), [list, filter]);
  const dueN = useMemo(() => dueCards(pool).length, [pool]);
  const stages = useMemo(() => SRS_DAYS.slice(1).map((d, i) => ({ d, n: pool.filter((m) => Math.min(5, Math.max(1, m.box || 0)) === i + 1).length })), [pool]);
  const stageMax = Math.max(1, ...stages.map((x) => x.n));
  const [queue, setQueue] = useState(null);     // null=시작 전, 배열=세션 중(카드 id)
  const [done, setDone] = useState({ ok: 0, n: 0 });
  const [res, setRes] = useState(null);         // { ok, san } — 현재 카드의 결과
  const cur = queue && queue.length ? list.find((m) => m.id === queue[0]) : null;
  const root = useMemo(() => (cur ? parseFenFull(cur.fen) : null), [cur && cur.id]);
  const start = () => { setQueue(dueCards(pool, Date.now(), 10).map((m) => m.id)); setDone({ ok: 0, n: 0 }); setRes(null); };
  const grade = (ok, san) => { if (!cur || res) return; setRes({ ok, san }); setDone((d) => ({ ok: d.ok + (ok ? 1 : 0), n: d.n + 1 })); update(list.map((m) => (m.id === cur.id ? gradeCard(m, ok) : m))); };
  const next = () => { setRes(null); setQueue((q) => q.slice(1)); };
  const w = typeof window !== "undefined" ? Math.min(380, window.innerWidth - 64) : 320;
  const halo = res && cur ? squaresOf(cur.fen, cur.best) : [];
  const chips = [["all", t("전체"), list.length], ...THEMES.filter((th) => list.some((m) => m.theme === th)).map((th) => [th, themeLabel(th), list.filter((m) => m.theme === th).length])];
  const total = queue ? done.n + queue.length : 0;
  return (
    <div style={card}>
      <SectionHead Icon={RotateCcw} title={t("복습 카드")} right={queue ? <button className="press" onClick={() => setQueue(null)} style={{ ...chip(false), padding: "4px 11px" }}>{t("그만하기")}</button> : null} />
      {!list.length ? <p style={{ ...sub, margin: 0 }}>{t("게임 리뷰를 열면 내가 둔 실수가 복습 카드로 쌓임")}</p>
      : !queue ? (
        <div>
          <div style={{ display: "flex", gap: 6, overflowX: "auto", margin: "0 -2px 14px", padding: "2px", scrollbarWidth: "none" }}>
            {chips.map(([k, l, n]) => <button key={k} className="press" onClick={() => setFilter(k)} style={{ ...chip(filter === k), flexShrink: 0 }}>{l} <span style={{ opacity: .65, fontWeight: 700 }}>{n}</span></button>)}
          </div>
          <div style={{ display: "flex", alignItems: "flex-end", gap: 8, height: 78, marginBottom: 6 }} aria-label={t("익힌 카드")}>
            {stages.map((x, i) => (
              <div key={x.d} style={{ flex: 1, minWidth: 0, height: "100%", display: "flex", flexDirection: "column", justifyContent: "flex-end", alignItems: "center", gap: 3 }}>
                <span style={{ fontSize: 11.5, fontWeight: 900, color: x.n ? T.ink : T.inkSoft, opacity: x.n ? 1 : .5 }}>{x.n}</span>
                <div style={{ width: "100%", height: 5 + Math.round(40 * x.n / stageMax), borderRadius: "7px 7px 3px 3px", background: i >= 3 ? T.best : T.brass, opacity: x.n ? 1 : .3, transition: "height .5s ease" }} />
              </div>
            ))}
          </div>
          <div style={{ display: "flex", gap: 8, marginBottom: 14 }}>
            {stages.map((x) => <span key={x.d} style={{ flex: 1, minWidth: 0, textAlign: "center", fontSize: 10.5, fontWeight: 700, color: T.inkSoft, whiteSpace: "nowrap" }}>{t("{0}일", x.d)}</span>)}
          </div>
          <p style={{ ...sub, margin: "0 0 12px" }}>{t("내가 두었던 실수 포지션에서 엔진 최선수를 찾기. 맞히면 복습 간격이 늘어나고(1·3·7·14·30일), 틀리면 곧 다시 나옴")}</p>
          <button className="press" onClick={start} disabled={!dueN} style={{ ...btn(true), width: "100%", padding: "12px 14px", fontSize: 13.5, opacity: dueN ? 1 : .5, cursor: dueN ? "pointer" : "default" }}>{dueN ? t("{0}장 복습 시작", Math.min(dueN, 10)) : t("오늘 복습할 카드를 모두 마침")}</button>
          <p style={{ ...sub, margin: "8px 0 0", textAlign: "center" }}>{t("전체 {0}장, 익힌 카드 {1}장", stats.total, stats.mastered)}</p>
        </div>
      ) : !cur ? (
        <div style={{ textAlign: "center", padding: "14px 0 6px" }}>
          <Sparkles size={30} style={{ color: T.brass }} />
          <p style={{ fontSize: 16, fontWeight: 800, color: T.ink, margin: "8px 0 2px" }}>{t("오늘의 복습 끝")}</p>
          <p style={{ ...sub, margin: "0 0 14px" }}>{t("{0}장 중 {1}장 정답", done.n, done.ok)}</p>
          <button className="press" onClick={() => setQueue(null)} style={btn(true)}>{t("돌아가기")}</button>
        </div>
      ) : (
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10 }}>
            <div style={{ flex: 1, height: 7, borderRadius: 4, background: "rgba(0,0,0,.09)", overflow: "hidden" }}><div style={{ width: Math.round(100 * done.n / Math.max(1, total)) + "%", height: "100%", background: "linear-gradient(90deg,#C49A50,#ECCB86)", transition: "width .3s ease" }} /></div>
            <span style={{ ...sub, fontWeight: 800, flexShrink: 0 }}>{done.n + (res ? 0 : 1)}/{total}</span>
            <span style={{ ...chip(true), padding: "3px 10px", cursor: "default" }}>{themeLabel(cur.theme)}</span>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 8, margin: "0 0 10px" }}>
            <span aria-hidden style={{ width: 14, height: 14, borderRadius: 4, flexShrink: 0, background: cur.color === "w" ? "#FAF2E2" : "#2A1B10", border: "1.5px solid #8A6C2F" }} />
            <p style={{ fontSize: 13.5, fontWeight: 800, color: T.ink, margin: 0 }}>{cur.color === "w" ? t("백 차례, 최선수를 찾기") : t("흑 차례, 최선수를 찾기")}</p>
          </div>
          <div style={{ display: "flex", justifyContent: "center", marginBottom: 12 }}>
            <ChatMoveBoard Board={Board} root={root} sans={[]} size={w} flip={cur.color === "b"} interactive={!res} halo={halo} onMove={(san) => grade(isCardAnswer(cur, san), san)} />
          </div>
          {!res ? (
            <div style={{ display: "flex", justifyContent: "center" }}><button className="press" onClick={() => grade(false, null)} style={btn(false)}>{t("모르겠음, 정답 보기")}</button></div>
          ) : (
            <div style={{ padding: "12px 14px", borderRadius: 12, border: "1px solid " + (res.ok ? "rgba(63,122,58,.6)" : "rgba(200,69,59,.6)"), background: res.ok ? "rgba(63,122,58,.09)" : "rgba(200,69,59,.08)" }}>
              <p style={{ fontSize: 14, fontWeight: 800, margin: "0 0 4px", color: res.ok ? T.best : T.blunder, display: "flex", alignItems: "center", gap: 6 }}>{res.ok ? <Check size={16} /> : <Target size={16} />}{res.ok ? t("정답! 다음 복습은 {0}일 뒤", SRS_DAYS[(list.find((m) => m.id === cur.id) || cur).box] || 1) : t("아쉬워요. 정답은 {0}", cur.best)}</p>
              <p style={{ ...sub, margin: "0 0 10px" }}>{t("실제 대국에서는 {0}을(를) 두었음", cur.san)}, {themeAdvice(cur.theme)}</p>
              <button className="press" onClick={next} style={{ ...btn(true), width: "100%" }}>{t("다음 카드")}</button>
            </div>
          )}
        </div>
      )}
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


/* ── 오프닝 실수 (v0.6.9, 집중 분석에서 이전) ──
   내 chess.com 대국에서 반복해 둔 수순 중 평가가 크게 떨어지는 수를 색별로 찾는다. 로직은 lib/openingMistakes.js.
   엔진은 분석 풀의 마지막 워커(실시간 분석 큐와 분리)를 쓰고, 결과는 대국 수가 같은 동안 메모리에 캐시한다. */
const omCache = new Map();
const fmtDate = (ts) => { if (!ts) return ""; const d = new Date(ts * 1000); return d.getFullYear() + "." + String(d.getMonth() + 1).padStart(2, "0") + "." + String(d.getDate()).padStart(2, "0"); };
function OpeningMistakes({ uid, games, engine, onOpenReview, hasChesscom }) {
  const elig = useMemo(() => eligibleGames(games), [games]);
  const counts = useMemo(() => ({ w: elig.filter((g) => g.color === "w").length, b: elig.filter((g) => g.color === "b").length }), [elig]);
  const sig = (uid || "") + "|" + elig.length + "|" + ((elig[0] && elig[0].endTime) || 0) + "|" + (engine ? engine.profile : "");
  const [res, setRes] = useState({ w: { status: "idle", lines: [] }, b: { status: "idle", lines: [] } });
  const [nonce, setNonce] = useState(0);
  const [open, setOpen] = useState(null);   // "w:0" 같은 색:순번
  const [side, setSide] = useState("w");   // 보고 있는 색(v0.7.4: 백/흑 전환)
  const ready = !!engine && engine.status === "ready";
  useEffect(() => {
    if (!ready || !elig.length) return;
    let cancelled = false;
    const put = (c, v) => setRes((r) => ({ ...r, [c]: v }));
    (async () => {
      const pool = await getAnalysisPool(engine.profile, engine.urls).catch(() => null);
      const worker = (pool && pool.length ? pool[pool.length - 1] : null) || engine;
      const evalPos = (sans) => worker.evaluate(sansToFen(sans), 16, undefined, 3000);
      for (const c of ["w", "b"]) {
        if (cancelled) return;
        const ck = sig + "|" + c;
        if (omCache.has(ck)) { put(c, { status: "done", lines: omCache.get(ck) }); continue; }
        if (counts[c] < OM.MIN_GAMES) { put(c, { status: "few", lines: [] }); continue; }
        put(c, { status: "running", lines: [] });
        const out = await findOpeningMistakes({ games: elig, color: c, evalPos, isCancelled: () => cancelled, onUpdate: (lines) => { if (!cancelled) put(c, { status: "running", lines }); } });
        if (cancelled || out.cancelled) return;
        omCache.set(ck, out.lines);
        put(c, { status: "done", lines: out.lines });
      }
    })();
    return () => { cancelled = true; };
  }, [ready, sig, nonce]);
  const reanalyze = () => { for (const c of ["w", "b"]) omCache.delete(sig + "|" + c); setOpen(null); setNonce((n) => n + 1); };
  const running = res.w.status === "running" || res.b.status === "running";
  // (v0.7.4) 백·흑을 위아래로 쌓지 않고 전환 탭으로 — 탭에 찾은 수순 개수를 붙이고, 수순은 판정 색 띠가 붙은 카드로 보여 준다.
  const r = res[side];
  const lines = r.lines.map((mt, idx) => {
    const c = side, key = c + ":" + idx, isOpen = open === key;
    const list = isOpen ? gamesOfLine(games, mt.seq, c).slice(0, 8) : [];
    return (
      <div key={key} style={{ borderRadius: 12, border: "1px solid #DCCBA8", borderLeft: "4px solid " + (mt.kind === "blunder" ? T.blunder : T.inaccuracy), background: "rgba(0,0,0,.025)", overflow: "hidden", marginBottom: 8 }}>
        <button onClick={() => setOpen(isOpen ? null : key)} aria-expanded={isOpen} className="press" style={{ display: "flex", alignItems: "flex-start", gap: 10, width: "100%", textAlign: "left", fontFamily: SEQ_FONT, fontSize: 12, color: T.ink, fontWeight: 600, background: "none", border: "none", cursor: "pointer", padding: "9px 10px", lineHeight: 1.65, whiteSpace: "normal" }}>
          <span style={{ flex: 1, minWidth: 0 }}>
            {mt.seq.map((mv, i) => {
              const last = i === mt.seq.length - 1, mine = (i % 2 === 0) === (c === "w");
              const st = last ? { fontWeight: 900, textDecoration: "underline", color: mt.kind === "blunder" ? T.blunder : T.inaccuracy } : mine ? { fontWeight: 800, color: T.ink } : { color: T.inkSoft, fontWeight: 500 };
              return <span key={i} style={st}>{moveNumber(i)}{mv} </span>;
            })}
          </span>
          <span style={{ flexShrink: 0, padding: "2px 9px", borderRadius: 999, background: "rgba(0,0,0,.07)", fontFamily: SITE_FONT, fontSize: 11.5, fontWeight: 800, color: T.ink, whiteSpace: "nowrap" }}>{t("{0}회", mt.count)}</span>
        </button>
        {isOpen && (
          <div style={{ padding: "2px 10px 6px", borderTop: "1px solid #E4D5B6", background: "rgba(0,0,0,.03)" }}>
            {list.length === 0 ? <div style={{ ...sub, padding: "6px 0" }}>{t("대국을 찾을 수 없음")}</div> : list.map((g, gi) => {
              const won = g.result === "win", lost = g.result === "loss";
              const foe = (c === "w" ? g.black : g.white) || {};
              return (
                <div key={g.id || gi} style={{ display: "flex", alignItems: "center", gap: 8, padding: "6px 0", borderTop: gi ? "1px solid #E4D5B6" : "none" }}>
                  <span style={{ fontSize: 11, color: T.inkSoft, flexShrink: 0 }}>{fmtDate(g.endTime)}</span>
                  <span style={{ fontSize: 11.5, color: T.ink, fontWeight: 700, flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{foe.username || ""}</span>
                  <span style={{ fontSize: 11.5, fontWeight: 800, color: won ? T.best : lost ? T.blunder : T.inkSoft, flexShrink: 0 }}>{won ? "1" : lost ? "0" : "½"}</span>
                  <BestMoveJumpButton size={26} onClick={() => onOpenReview && onOpenReview({ sans: g.moves, color: g.color, result: g.result, rating: g.rating, timeClass: g.timeClass, opening: g.opening, endTime: g.endTime, white: g.white, black: g.black, id: g.id })} />
                </div>
              );
            })}
          </div>
        )}
      </div>
    );
  });
  return (
    <div style={card}>
      <SectionHead Icon={BookOpen} title={t("오프닝 실수")} right={ready && elig.length > 0 && !running ? <button onClick={reanalyze} className="press" style={chip(false)}>{t("다시 분석")}</button> : null} />
      <p style={{ ...sub, margin: "-4px 0 12px" }}>{t("내 chess.com 대국에서 반복한 수순 중 평가가 크게 떨어지는 수를 엔진으로 찾음")}</p>
      {!hasChesscom ? <p style={{ ...sub, margin: 0 }}>{t("chess.com 계정 연결 후 이용 가능")}</p>
        : !elig.length ? <p style={{ ...sub, margin: 0 }}>{t("최근 대국 없음")}</p>
        : (
          <>
            <div role="tablist" style={{ display: "flex", gap: 4, padding: 4, borderRadius: 12, background: "rgba(0,0,0,.07)", marginBottom: 12 }}>
              {[["w", t("백")], ["b", t("흑")]].map(([c, label]) => {
                const on = side === c, n = res[c].lines.length;
                return (
                  <button key={c} role="tab" aria-selected={on} onClick={() => { setSide(c); setOpen(null); }} className="press" style={{ flex: 1, display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 7, padding: "8px 10px", borderRadius: 9, border: "none", cursor: "pointer", fontFamily: SITE_FONT, fontSize: 12.5, fontWeight: 800, background: on ? T.paper : "transparent", color: on ? T.ink : T.inkSoft, boxShadow: on ? "0 1px 4px rgba(0,0,0,.2)" : "none" }}>
                    <span aria-hidden style={{ width: 11, height: 11, borderRadius: 3, background: c === "w" ? "#FAF2E2" : "#2A1B10", border: "1.5px solid #8A6C2F" }} />
                    {label}
                    {n > 0 && <span style={{ minWidth: 18, height: 18, padding: "0 5px", borderRadius: 9, background: T.mistake, color: "#fff", fontSize: 10.5, fontWeight: 900, display: "inline-flex", alignItems: "center", justifyContent: "center" }}>{n}</span>}
                  </button>
                );
              })}
            </div>
            {r.lines.length === 0 ? (
              <div style={sub}>
                {r.status === "few" ? tx("대국 수 부족. 최소 {0}판 필요", OM.MIN_GAMES)
                  : r.status === "running" ? t("내 대국 분석 중…")
                  : r.status === "done" ? t("15수 이내 두드러진 실수 없음") : t("엔진 준비 후 분석")}
              </div>
            ) : lines}
            {r.lines.length > 0 && r.status === "running" && <div style={sub}>{t("내 대국 분석 중…")}</div>}
          </>
        )}
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

/* ── 요약 띠: 분석한 실수·오늘 복습·익힌 카드 + 익힘 진행률 ── */
function GrowthSummary({ rep, st }) {
  const pct = st.total ? Math.round((st.mastered / st.total) * 100) : 0;
  const cell = (value, label, accent) => (
    <div style={{ flex: 1, minWidth: 0, textAlign: "center", padding: "12px 4px 10px" }}>
      <div style={{ fontSize: 24, fontWeight: 900, color: accent || T.ivoryHi, fontFamily: "Georgia, serif", lineHeight: 1.1 }}>{value}</div>
      <div style={{ fontSize: 11.5, fontWeight: 700, color: "#CDBA98", marginTop: 3, whiteSpace: "nowrap" }}>{label}</div>
    </div>
  );
  return (
    <div style={{ borderRadius: 16, background: "linear-gradient(180deg,#2E1B10,#241509)", border: "1px solid #4A3322", marginBottom: 12, overflow: "hidden" }}>
      <div style={{ display: "flex", alignItems: "stretch" }}>
        {cell(rep.total, t("분석한 실수"))}
        <span aria-hidden style={{ width: 1, background: "rgba(236,203,134,.18)", margin: "10px 0" }} />
        {cell(st.due, t("오늘 복습"), st.due ? "#FF8A7A" : undefined)}
        <span aria-hidden style={{ width: 1, background: "rgba(236,203,134,.18)", margin: "10px 0" }} />
        {cell(st.mastered, t("익힌 카드"), T.brassHi)}
      </div>
      <div role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={pct} style={{ height: 5, background: "rgba(255,255,255,.08)" }}>
        <div style={{ width: pct + "%", height: "100%", background: "linear-gradient(90deg,#C49A50,#ECCB86)", transition: "width .5s ease" }} />
      </div>
    </div>
  );
}

const GROWTH_SECTIONS = [
  { key: "weak", label: () => t("약점 지도"), Icon: Target },
  { key: "review", label: () => t("복습 카드"), Icon: RotateCcw },
  { key: "opening", label: () => t("오프닝 실수"), Icon: BookOpen },
  { key: "style", label: () => t("마스터 스타일"), Icon: Users },
];

/* 학습 탭에 들어가는 성장 분석 전체 — 맨 위 프로필 헤더, 요약 띠, 그 아래 네 영역을 구획 탭으로 나눠 보여 준다.
   (v0.7.4) 오늘 복습할 카드가 있으면 처음부터 복습 카드 구획이 열린다. */
export function GrowthPanel({ uid, games, engine, onOpenReview, hasChesscom, me, onOpenTitle }) {
  const [data, update] = useGrowth(uid);
  const [filter, setFilter] = useState("all");
  const st = useMemo(() => srsStats(data.mistakes), [data]);
  const rep = useMemo(() => weaknessReport(data.mistakes), [data]);
  const [sec, setSec] = useState(() => (st.due ? "review" : "weak"));
  const narrow = useNarrow(720);
  return (
    <section aria-label={t("성장 분석")} style={{ marginBottom: 8 }}>
      {me && <GrowthHeader uid={uid} me={me} onOpenTitle={onOpenTitle} />}
      <GrowthSummary rep={rep} st={st} />
      <div role="tablist" aria-label={t("성장 분석")} style={{ display: "grid", gridTemplateColumns: "repeat(4, minmax(0, 1fr))", gap: 6, margin: "0 0 12px" }}>
        {GROWTH_SECTIONS.map(({ key, label, Icon }) => {
          const on = sec === key;
          return (
            <button key={key} role="tab" aria-selected={on} onClick={() => setSec(key)} className="press"
              style={{ position: "relative", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 5, padding: "10px 4px 9px", borderRadius: 14, cursor: "pointer", fontFamily: SITE_FONT, fontSize: narrow ? 11 : 11.5, fontWeight: 800, lineHeight: 1.2, textAlign: "center", minWidth: 0,
                border: "1px solid " + (on ? T.brass : "#4A3322"), background: on ? "linear-gradient(180deg,#ECCB86,#C49A50)" : "rgba(255,255,255,.04)", color: on ? "#241509" : "#E3D3B3" }}>
              <Icon size={17} />
              <span style={{ wordBreak: "keep-all" }}>{label()}</span>
              {key === "review" && st.due > 0 && <span style={{ position: "absolute", top: -6, right: -4, minWidth: 18, height: 18, padding: "0 5px", borderRadius: 9, background: "#C8453B", color: "#fff", border: "2px solid #1B1009", boxSizing: "content-box", fontSize: 10.5, fontWeight: 900, display: "inline-flex", alignItems: "center", justifyContent: "center" }}>{st.due}</span>}
            </button>
          );
        })}
      </div>
      {sec === "weak" && <WeaknessMap list={data.mistakes} onPractice={(th) => { setFilter(th); setSec("review"); }} />}
      {sec === "review" && <ReviewCards list={data.mistakes} update={update} filter={filter} setFilter={setFilter} />}
      {sec === "opening" && <OpeningMistakes uid={uid} games={games} engine={engine} onOpenReview={onOpenReview} hasChesscom={hasChesscom} />}
      {sec === "style" && <MasterStyle games={games} />}
    </section>
  );
}
