// (v0.6.4) 성장 센터 — 내 약점 지도 · 실수 복습 카드(간격 반복) · 마스터 스타일 매칭.
// 로직은 lib/weakness.js·lib/masterStyle.js(순수 함수, scripts/check-growth.mjs가 검사), 저장은 lib/growthStore.js.
// 대국 하이라이트 카드는 리뷰 공유 시트(review.jsx)에 있다.
import { useState, useEffect, useMemo, useCallback } from "react";
import { createPortal } from "react-dom";
import { Chess } from "chess.js";
import { X, Target, RotateCcw, Sparkles, Check } from "lucide-react";
import { T } from "../lib/theme.js";
import { SITE_FONT } from "../components/engineLines.jsx";
import { ChatMoveBoard } from "../components/chatPlus.jsx";
import { Board } from "./common.jsx";
import { parseFenFull } from "../lib/chessRules.js";
import { loadGrowth, saveGrowth } from "../lib/growthStore.js";
import { PHASES, THEMES, SRS_DAYS, phaseLabel, themeLabel, themeAdvice, weaknessReport, dueCards, gradeCard, srsStats, isCardAnswer } from "../lib/weakness.js";
import { styleFeatures, matchMasters, sharedTraits, traitLabel, STYLE_KEYS, MIN_STYLE_GAMES } from "../lib/masterStyle.js";
import { masterName, masterFlag } from "../data/masterNames.js";
import { t } from "../lib/i18n.js";

const BG = "radial-gradient(130% 120% at 50% -10%, #34230F 0%, #150C06 65%)";
const card = { background: "rgba(255,255,255,.045)", border: "1px solid rgba(196,154,80,.22)", borderRadius: 14, padding: "14px 15px", marginBottom: 12 };
const h2 = { fontSize: 13.5, fontWeight: 800, color: T.brassHi, margin: "0 0 10px", letterSpacing: ".01em" };
const dim = { fontSize: 12, color: "rgba(235,221,196,.62)", lineHeight: 1.6 };
const btn = (primary) => ({ padding: "9px 16px", borderRadius: 10, border: primary ? "none" : "1px solid rgba(196,154,80,.45)", background: primary ? "linear-gradient(180deg,#D8B26A,#B88A3E)" : "transparent", color: primary ? "#241509" : T.brassHi, fontWeight: 800, fontSize: 13, cursor: "pointer", fontFamily: SITE_FONT });

function useGrowth(uid) {
  const [data, setData] = useState(() => loadGrowth(uid));
  useEffect(() => { const f = () => setData(loadGrowth(uid)); setData(loadGrowth(uid)); window.addEventListener("occ-growth", f); return () => window.removeEventListener("occ-growth", f); }, [uid]);
  const update = useCallback((mistakes) => { const next = { ...loadGrowth(uid), mistakes }; saveGrowth(uid, next); setData(next); }, [uid]);
  return [data, update];
}

function Bar({ value, color = T.brass }) {
  return <div style={{ height: 8, borderRadius: 4, background: "rgba(255,255,255,.08)", overflow: "hidden", flex: 1 }}><div style={{ width: Math.round(Math.max(0, Math.min(1, value)) * 100) + "%", height: "100%", background: color, borderRadius: 4 }} /></div>;
}

/* ── 탭 1: 약점 지도 ── */
function WeaknessMap({ list, onPractice }) {
  const rep = useMemo(() => weaknessReport(list), [list]);
  if (!rep.total) return (
    <div style={card}>
      <p style={{ ...dim, color: T.ivory, fontSize: 13.5, margin: "0 0 6px", fontWeight: 700 }}>{t("아직 분석된 실수가 없음")}</p>
      <p style={dim}>{t("게임 리뷰를 열면 내가 둔 실수·블런더·놓친 수가 자동으로 쌓이고, 여기에 약점 지도가 그려짐")}</p>
    </div>
  );
  const maxN = Math.max(1, ...rep.byPhase.map((x) => x.n));
  const cols = THEMES.filter((th) => rep.matrix.some((row) => row[THEMES.indexOf(th)] > 0));
  const mMax = Math.max(1, ...rep.matrix.flat());
  return (
    <div>
      <div style={card}>
        <div style={{ color: T.ivoryHi, fontFamily: "Georgia, serif" }}><span style={{ fontSize: 15, fontWeight: 800 }}>{t("{0}개의 실수를 분석함", rep.total)}</span></div>
        {rep.weakPhase && <p style={{ ...dim, margin: "6px 0 0" }}>{t("가장 많이 흔들리는 구간: {0}", phaseLabel(rep.weakPhase.key))}</p>}
      </div>
      <div style={card}>
        <h3 style={h2}>{t("구간별 실수")}</h3>
        {rep.byPhase.map((p) => (
          <div key={p.key} style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 9 }}>
            <span style={{ width: 64, fontSize: 12.5, fontWeight: 700, color: T.ivory }}>{phaseLabel(p.key)}</span>
            <Bar value={p.n / maxN} color={p.key === (rep.weakPhase && rep.weakPhase.key) ? "#D9822B" : T.brass} />
            <span style={{ width: 86, fontSize: 11.5, color: "rgba(235,221,196,.7)", textAlign: "right" }}>{t("{0}개 · 평균 −{1}%p", p.n, Math.round(p.avgLoss))}</span>
          </div>
        ))}
      </div>
      <div style={card}>
        <h3 style={h2}>{t("무엇을 놓쳤나")}</h3>
        <div style={{ overflowX: "auto" }}>
          <table style={{ borderCollapse: "separate", borderSpacing: 3, fontSize: 11, color: T.ivory }}>
            <thead><tr><th />{cols.map((th) => <th key={th} style={{ fontWeight: 700, padding: "0 4px 4px", whiteSpace: "nowrap", color: "rgba(235,221,196,.75)" }}>{themeLabel(th)}</th>)}</tr></thead>
            <tbody>{PHASES.map((p, ri) => (
              <tr key={p}><td style={{ fontWeight: 700, paddingRight: 6, whiteSpace: "nowrap" }}>{phaseLabel(p)}</td>
                {cols.map((th) => { const n = rep.matrix[ri][THEMES.indexOf(th)]; return <td key={th} style={{ textAlign: "center", minWidth: 40, height: 30, borderRadius: 6, fontWeight: 800, background: n ? "rgba(217,130,43," + (0.16 + 0.7 * n / mMax).toFixed(2) + ")" : "rgba(255,255,255,.04)", color: n ? "#FFF3DC" : "rgba(235,221,196,.3)" }}>{n || "·"}</td>; })}
              </tr>))}</tbody>
          </table>
        </div>
      </div>
      <div style={card}>
        <h3 style={h2}>{t("실수가 난 칸")}</h3>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(8,1fr)", width: 216, maxWidth: "100%", margin: "0 auto", border: "2px solid rgba(196,154,80,.5)" }} aria-label={t("실수한 수가 도착한 칸의 분포")}>
          {rep.heat.map((row, r) => row.map((n, f) => (
            <div key={r + "-" + f} title={n ? "abcdefgh"[f] + (8 - r) + " · " + n : undefined} style={{ aspectRatio: "1", background: (r + f) % 2 === 0 ? "#E8D2A6" : "#7C4F2E", position: "relative" }}>
              {n > 0 && <div style={{ position: "absolute", inset: 0, background: "rgba(200,69,59," + (0.25 + 0.7 * n / rep.heatMax).toFixed(2) + ")", display: "flex", alignItems: "center", justifyContent: "center", color: "#fff", fontSize: 10, fontWeight: 800 }}>{n}</div>}
            </div>)))}
        </div>
      </div>
      <div style={card}>
        <h3 style={h2}>{t("이렇게 보완하기")}</h3>
        {rep.topThemes.map((th) => (
          <div key={th.key} style={{ marginBottom: 12 }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
              <span style={{ fontSize: 13, fontWeight: 800, color: T.ivoryHi }}>{themeLabel(th.key)} <span style={{ color: "rgba(235,221,196,.55)", fontWeight: 700 }}>· {th.n}</span></span>
              <button className="press" onClick={() => onPractice(th.key)} style={{ ...btn(false), padding: "5px 11px", fontSize: 11.5 }}>{t("이 유형 복습")}</button>
            </div>
            <p style={{ ...dim, margin: "3px 0 0" }}>{themeAdvice(th.key)}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ── 탭 2: 실수 복습 카드 ── */
function squaresOf(fen, san) {
  try { const mv = new Chess(fen).move(String(san).replace(/[+#!?]+$/g, "")); const sq = (s) => [8 - parseInt(s[1], 10), "abcdefgh".indexOf(s[0])]; return [sq(mv.from), sq(mv.to)]; } catch { return []; }
}
function ReviewCards({ list, update, filter, setFilter }) {
  const stats = useMemo(() => srsStats(list), [list]);
  const pool = useMemo(() => (filter === "all" ? list : list.filter((m) => m.theme === filter)), [list, filter]);
  const [queue, setQueue] = useState(null);     // null=시작 전, 배열=세션 중(카드 id)
  const [done, setDone] = useState({ ok: 0, n: 0 });
  const [res, setRes] = useState(null);         // { ok, san } — 현재 카드의 결과
  const cur = queue && queue.length ? list.find((m) => m.id === queue[0]) : null;
  const root = useMemo(() => (cur ? parseFenFull(cur.fen) : null), [cur && cur.id]);
  const start = () => { const q = dueCards(pool, Date.now(), 10).map((m) => m.id); setQueue(q); setDone({ ok: 0, n: 0 }); setRes(null); };
  const grade = (ok, san) => { if (!cur || res) return; setRes({ ok, san }); setDone((d) => ({ ok: d.ok + (ok ? 1 : 0), n: d.n + 1 })); update(list.map((m) => (m.id === cur.id ? gradeCard(m, ok) : m))); };
  const next = () => { setRes(null); setQueue((q) => q.slice(1)); };
  const w = typeof window !== "undefined" ? Math.min(340, window.innerWidth - 44) : 320;
  const halo = res && cur ? squaresOf(cur.fen, cur.best) : [];
  const chips = [["all", t("전체")], ...THEMES.filter((th) => list.some((m) => m.theme === th)).map((th) => [th, themeLabel(th)])];
  if (!list.length) return <div style={card}><p style={{ ...dim, color: T.ivory, fontSize: 13.5, margin: "0 0 6px", fontWeight: 700 }}>{t("복습할 카드가 없음")}</p><p style={dim}>{t("게임 리뷰를 열면 내가 둔 실수가 복습 카드로 쌓임")}</p></div>;
  if (!queue) return (
    <div>
      <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
        {[[t("오늘 복습"), stats.due], [t("익힌 카드"), stats.mastered], [t("전체"), stats.total]].map(([l, v]) => (
          <div key={l} style={{ ...card, flex: 1, marginBottom: 0, textAlign: "center", padding: "11px 6px" }}><div style={{ fontSize: 22, fontWeight: 900, color: T.ivoryHi, fontFamily: "Georgia, serif" }}>{v}</div><div style={{ fontSize: 11, color: "rgba(235,221,196,.62)", fontWeight: 700 }}>{l}</div></div>
        ))}
      </div>
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 12 }}>
        {chips.map(([k, l]) => <button key={k} className="press" onClick={() => setFilter(k)} style={{ padding: "5px 11px", borderRadius: 999, fontSize: 11.5, fontWeight: 700, cursor: "pointer", border: "1px solid " + (filter === k ? T.brass : "rgba(196,154,80,.3)"), background: filter === k ? "rgba(196,154,80,.22)" : "transparent", color: filter === k ? T.brassHi : "rgba(235,221,196,.7)" }}>{l}</button>)}
      </div>
      <div style={card}>
        <p style={{ ...dim, margin: "0 0 10px" }}>{t("내가 두었던 실수 포지션에서 엔진 최선수를 찾기. 맞히면 복습 간격이 늘어나고(1·3·7·14·30일), 틀리면 곧 다시 나옴")}</p>
        <button className="press" onClick={start} disabled={!dueCards(pool).length} style={{ ...btn(true), width: "100%", opacity: dueCards(pool).length ? 1 : .5 }}>{dueCards(pool).length ? t("{0}장 복습 시작", dueCards(pool).length) : t("오늘 복습할 카드를 모두 마침")}</button>
      </div>
    </div>
  );
  if (!cur) return (
    <div style={{ ...card, textAlign: "center", padding: 22 }}>
      <Sparkles size={28} style={{ color: T.brassHi }} />
      <p style={{ fontSize: 16, fontWeight: 800, color: T.ivoryHi, margin: "8px 0 4px" }}>{t("오늘의 복습 끝")}</p>
      <p style={{ ...dim, margin: "0 0 14px" }}>{t("{0}장 중 {1}장 정답", done.n, done.ok)}</p>
      <button className="press" onClick={() => setQueue(null)} style={btn(true)}>{t("돌아가기")}</button>
    </div>
  );
  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
        <span style={{ fontSize: 12, fontWeight: 700, color: "rgba(235,221,196,.7)" }}>{t("남은 카드 {0}장", queue.length)}</span>
        <span style={{ fontSize: 11.5, fontWeight: 800, color: T.brassHi, padding: "3px 9px", borderRadius: 999, border: "1px solid rgba(196,154,80,.4)" }}>{themeLabel(cur.theme)}</span>
      </div>
      <p style={{ fontSize: 13.5, fontWeight: 700, color: T.ivory, margin: "0 0 10px", lineHeight: 1.5 }}>{cur.color === "w" ? t("백 차례 — 최선수를 찾기") : t("흑 차례 — 최선수를 찾기")}</p>
      <div style={{ display: "flex", justifyContent: "center", marginBottom: 10 }}>
        <ChatMoveBoard Board={Board} root={root} sans={[]} size={w} flip={cur.color === "b"} interactive={!res} halo={halo} onMove={(san) => grade(isCardAnswer(cur, san), san)} />
      </div>
      {!res ? (
        <div style={{ display: "flex", justifyContent: "center" }}><button className="press" onClick={() => grade(false, null)} style={btn(false)}>{t("모르겠음 · 정답 보기")}</button></div>
      ) : (
        <div style={{ ...card, borderColor: res.ok ? "rgba(63,122,58,.7)" : "rgba(200,69,59,.7)" }}>
          <p style={{ fontSize: 14.5, fontWeight: 800, margin: "0 0 4px", color: res.ok ? "#8FD08A" : "#F08A80", display: "flex", alignItems: "center", gap: 6 }}>{res.ok ? <Check size={16} /> : <Target size={16} />}{res.ok ? t("정답! 다음 복습은 {0}일 뒤", SRS_DAYS[(list.find((m) => m.id === cur.id) || cur).box] || 1) : t("아쉬워요. 정답은 {0}", cur.best)}</p>
          <p style={{ ...dim, margin: "0 0 10px" }}>{t("실제 대국에서는 {0}을(를) 두었음", cur.san)} · {themeAdvice(cur.theme)}</p>
          <button className="press" onClick={next} style={{ ...btn(true), width: "100%" }}>{t("다음 카드")}</button>
        </div>
      )}
    </div>
  );
}

/* ── 탭 3: 마스터 스타일 ── */
function MasterStyle({ games }) {
  const [data, setData] = useState(null);
  useEffect(() => { let on = true; import("../data/masterStyles.json").then((m) => { if (on) setData(m.default || m); }); return () => { on = false; }; }, []);
  const feat = useMemo(() => styleFeatures((games || []).slice(0, 200).map((g) => ({ moves: g.moves, color: g.color, result: g.result }))), [games]);
  const m = useMemo(() => (data ? matchMasters(feat, data, 3) : null), [feat, data]);
  if (!data) return <p style={dim}>{t("불러오는 중…")}</p>;
  if (!m.ok) return (
    <div style={card}>
      <p style={{ ...dim, color: T.ivory, fontSize: 13.5, margin: "0 0 6px", fontWeight: 700 }}>{t("대국이 더 필요함")}</p>
      <p style={dim}>{t("chess.com 대국이 {0}판 이상 연동되면 나와 닮은 마스터를 알려 줌 (지금 {1}판)", MIN_STYLE_GAMES, m.n)}</p>
    </div>
  );
  const mine = m.z.map((z, i) => ({ key: STYLE_KEYS[i], z })).filter((x) => x.z != null && Math.abs(x.z) >= 0.5).sort((a, b) => Math.abs(b.z) - Math.abs(a.z)).slice(0, 3);
  return (
    <div>
      <div style={card}>
        <h3 style={h2}>{t("내 스타일")}</h3>
        {mine.length ? mine.map((x) => <p key={x.key} style={{ ...dim, color: T.ivory, margin: "0 0 4px" }}>• {traitLabel(x.key, x.z > 0)}</p>) : <p style={dim}>{t("평균적인 마스터와 비슷한 균형형")}</p>}
        <p style={{ ...dim, margin: "8px 0 0", fontSize: 11 }}>{t("최근 {0}판 기준", m.n)}</p>
      </div>
      {m.list.map((x, i) => {
        const row = data.masters.find((r) => r[0] === x.name), traits = row ? sharedTraits(m.z, row, data, 2) : [];
        return (
          <div key={x.name} style={{ ...card, borderColor: i === 0 ? "rgba(236,203,134,.7)" : card.border }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <span style={{ fontSize: 22, fontWeight: 900, color: i === 0 ? T.brassHi : "rgba(235,221,196,.5)", fontFamily: "Georgia, serif", width: 22 }}>{i + 1}</span>
              <div style={{ minWidth: 0, flex: 1 }}>
                <div style={{ fontSize: 16, fontWeight: 800, color: T.ivoryHi, fontFamily: "Georgia, serif" }}>{masterFlag(x.name)} {masterName(x.name, "en")}</div>
                <div style={{ fontSize: 11.5, color: "rgba(235,221,196,.6)" }}>{x.elo ? "Elo " + x.elo + " · " : ""}{t("{0}판 분석", x.games)}</div>
              </div>
              <span style={{ fontSize: 18, fontWeight: 900, color: T.brassHi }}>{Math.round(x.sim * 100)}%</span>
            </div>
            <div style={{ margin: "8px 0 6px" }}><Bar value={x.sim} /></div>
            {traits.map((tr) => <p key={tr.key} style={{ ...dim, margin: "0 0 2px" }}>• {traitLabel(tr.key, tr.high)}</p>)}
          </div>
        );
      })}
      <p style={{ ...dim, fontSize: 11 }}>{t("오프닝 선택·캐슬링·교환·체크 빈도 등 13가지 기보 특징을 비교한 결과이며, 실력 비교가 아님")}</p>
    </div>
  );
}

export function GrowthCenter({ uid, games, onClose, initialTab = "weak" }) {
  const [tab, setTab] = useState(initialTab);
  const [data, update] = useGrowth(uid);
  const [filter, setFilter] = useState("all");
  const tabs = [["weak", t("약점 지도")], ["cards", t("복습 카드")], ["style", t("마스터 스타일")]];
  return createPortal((
    <div role="dialog" aria-label={t("성장 센터")} style={{ position: "fixed", inset: 0, zIndex: 950, background: BG, overflowY: "auto", fontFamily: SITE_FONT, paddingBottom: "env(safe-area-inset-bottom)" }}>
      <div style={{ maxWidth: 560, margin: "0 auto", padding: "calc(env(safe-area-inset-top) + 14px) 16px 40px" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
          <h1 style={{ fontSize: 20, fontWeight: 900, color: T.ivoryHi, margin: 0, fontFamily: "Georgia, serif" }}>{t("성장 센터")}</h1>
          <button onClick={onClose} aria-label={t("닫기")} className="press" style={{ width: 34, height: 34, borderRadius: 10, border: "1px solid rgba(196,154,80,.5)", background: "rgba(0,0,0,.35)", color: T.brassHi, cursor: "pointer", display: "inline-flex", alignItems: "center", justifyContent: "center" }}><X size={17} /></button>
        </div>
        <div style={{ display: "flex", gap: 6, marginBottom: 14 }}>
          {tabs.map(([k, l]) => <button key={k} className="press" onClick={() => setTab(k)} style={{ flex: 1, padding: "9px 4px", borderRadius: 10, fontSize: 12.5, fontWeight: 800, cursor: "pointer", border: "1px solid " + (tab === k ? T.brass : "rgba(196,154,80,.28)"), background: tab === k ? "rgba(196,154,80,.24)" : "rgba(0,0,0,.25)", color: tab === k ? T.brassHi : "rgba(235,221,196,.7)" }}>{l}</button>)}
        </div>
        {tab === "weak" && <WeaknessMap list={data.mistakes} onPractice={(th) => { setFilter(th); setTab("cards"); }} />}
        {tab === "cards" && <ReviewCards list={data.mistakes} update={update} filter={filter} setFilter={setFilter} />}
        {tab === "style" && <MasterStyle games={games} />}
      </div>
    </div>
  ), document.body);
}

/* 퍼즐 탭 진입 카드 */
export function GrowthEntryCard({ uid, onOpen }) {
  const [data] = useGrowth(uid);
  const st = useMemo(() => srsStats(data.mistakes), [data]);
  return (
    <button onClick={onOpen} className="press" style={{ display: "flex", alignItems: "center", gap: 12, width: "100%", textAlign: "left", padding: "12px 14px", marginBottom: 12, borderRadius: 14, border: "1px solid rgba(196,154,80,.35)", background: "linear-gradient(135deg,#3A2516,#241509)", cursor: "pointer", color: T.ivory, fontFamily: SITE_FONT }}>
      <span style={{ width: 38, height: 38, borderRadius: 11, background: "rgba(196,154,80,.2)", display: "inline-flex", alignItems: "center", justifyContent: "center", color: T.brassHi, flexShrink: 0 }}><RotateCcw size={19} /></span>
      <span style={{ minWidth: 0, flex: 1 }}>
        <span style={{ display: "block", fontSize: 14, fontWeight: 800, color: T.ivoryHi }}>{t("성장 센터")}</span>
        <span style={{ display: "block", fontSize: 11.5, color: "rgba(235,221,196,.65)", marginTop: 2 }}>{st.total ? t("약점 지도 · 오늘 복습 {0}장", st.due) : t("약점 지도 · 복습 카드 · 닮은 마스터")}</span>
      </span>
      {st.due > 0 && <span style={{ minWidth: 22, height: 22, borderRadius: 11, background: "#C8453B", color: "#fff", fontSize: 12, fontWeight: 800, display: "inline-flex", alignItems: "center", justifyContent: "center", padding: "0 6px" }}>{st.due}</span>}
    </button>
  );
}
