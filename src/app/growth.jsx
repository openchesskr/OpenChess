// (v0.6.4) 성장 분석 — 학습 탭 안에 한 화면으로 펼쳐 보이는 약점 지도 · 실수 복습 카드(간격 반복) · 마스터 스타일 매칭.
// 로직은 lib/weakness.js·lib/masterStyle.js(순수 함수, scripts/check-growth.mjs가 검사), 저장은 lib/growthStore.js.
// 대국 하이라이트 카드는 리뷰 공유 시트(review.jsx)에 있다.
import { useState, useEffect, useMemo, useCallback } from "react";
import { Chess } from "chess.js";
import { Target, Check, Sparkles, RotateCcw } from "lucide-react";
import { T } from "../lib/theme.js";
import { SITE_FONT } from "../components/engineLines.jsx";
import { ChatMoveBoard } from "../components/chatPlus.jsx";
import { Board } from "./common.jsx";
import { parseFenFull } from "../lib/chessRules.js";
import { loadGrowth, saveGrowth } from "../lib/growthStore.js";
import { PHASES, THEMES, SRS_DAYS, phaseLabel, themeLabel, themeAdvice, weaknessReport, dueCards, gradeCard, srsStats, isCardAnswer } from "../lib/weakness.js";
import { styleFeatures, matchMasters, sharedTraits, traitLabel, STYLE_KEYS, MIN_STYLE_GAMES, CRITERIA_GROUPS, criterionLabel, criterionGroupLabel, formatCriterion, compareCriteria, levelLabel } from "../lib/masterStyle.js";
import { masterName, masterFlag } from "../data/masterNames.js";
import { t } from "../lib/i18n.js";

// 학습 탭의 다른 카드(일일 퀘스트 등)와 같은 종이 카드 톤.
const card = { background: T.paper, border: "1px solid #DCCBA8", borderRadius: 12, padding: 14, marginBottom: 12 };
const h3 = { fontSize: 13, fontWeight: 800, color: T.ink, margin: 0 };
const sub = { fontSize: 11.5, color: T.inkSoft, lineHeight: 1.55 };
const chip = (on) => ({ padding: "5px 11px", borderRadius: 999, fontSize: 11.5, fontWeight: 800, cursor: "pointer", whiteSpace: "nowrap", fontFamily: SITE_FONT, border: "1px solid " + (on ? T.brass : "#DCCBA8"), background: on ? "rgba(196,154,80,.2)" : "transparent", color: on ? T.ink : T.inkSoft });
const btn = (primary) => ({ padding: "9px 14px", borderRadius: 10, border: primary ? "none" : "1px solid #C9B58C", background: primary ? "linear-gradient(180deg,#3A2516,#241509)" : "transparent", color: primary ? T.ivoryHi : T.ink, fontWeight: 800, fontSize: 12.5, cursor: "pointer", whiteSpace: "nowrap", fontFamily: SITE_FONT });
const LEVEL_COLOR = { same: "#3F7A3A", close: "#7FA04A", far: "#D9822B", veryFar: "#C8453B", na: "#9A8B72" };

function useGrowth(uid) {
  const [data, setData] = useState(() => loadGrowth(uid));
  useEffect(() => { const f = () => setData(loadGrowth(uid)); setData(loadGrowth(uid)); window.addEventListener("occ-growth", f); return () => window.removeEventListener("occ-growth", f); }, [uid]);
  const update = useCallback((mistakes) => { const next = { ...loadGrowth(uid), mistakes }; saveGrowth(uid, next); setData(next); }, [uid]);
  return [data, update];
}
function Bar({ value, color = T.brass }) {
  return <div style={{ height: 8, borderRadius: 4, background: "rgba(0,0,0,.08)", overflow: "hidden", flex: 1, minWidth: 0 }}><div style={{ width: Math.round(Math.max(0, Math.min(1, value)) * 100) + "%", height: "100%", background: color, borderRadius: 4 }} /></div>;
}
function Stat({ value, label, accent }) {
  return (
    <div style={{ flex: 1, minWidth: 0, background: T.paper, border: "1px solid #DCCBA8", borderRadius: 12, padding: "10px 6px", textAlign: "center" }}>
      <div style={{ fontSize: 20, fontWeight: 900, color: accent || T.ink, fontFamily: "Georgia, serif", lineHeight: 1.15, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{value}</div>
      <div style={{ fontSize: 10.5, fontWeight: 700, color: T.inkSoft, marginTop: 2, whiteSpace: "nowrap" }}>{label}</div>
    </div>
  );
}

/* ── 약점 지도 ── */
function WeaknessMap({ list, onPractice }) {
  const rep = useMemo(() => weaknessReport(list), [list]);
  if (!rep.total) return (
    <div style={card}>
      <h3 style={h3}>{t("약점 지도")}</h3>
      <p style={{ ...sub, margin: "6px 0 0" }}>{t("게임 리뷰를 열면 내가 둔 실수·블런더·놓친 수가 자동으로 쌓이고, 여기에 약점 지도가 그려짐")}</p>
    </div>
  );
  const maxPhase = Math.max(1, ...rep.byPhase.map((x) => x.n)), maxTheme = Math.max(1, ...rep.byTheme.map((x) => x.n));
  const cols = THEMES.filter((th) => rep.matrix.some((row) => row[THEMES.indexOf(th)] > 0)), mMax = Math.max(1, ...rep.matrix.flat());
  return (
    <div style={card}>
      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 8, flexWrap: "wrap", marginBottom: 10 }}>
        <h3 style={h3}>{t("약점 지도")}</h3>
        <span style={sub}>{rep.weakPhase ? t("가장 많이 흔들리는 구간: {0}", phaseLabel(rep.weakPhase.key)) : ""}</span>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(250px, 1fr))", gap: 16 }}>
        <div>
          <div style={{ ...sub, fontWeight: 800, marginBottom: 6 }}>{t("구간별 실수")}</div>
          {rep.byPhase.map((p) => (
            <div key={p.key} style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 7 }}>
              <span style={{ width: 54, fontSize: 12, fontWeight: 700, color: T.ink, flexShrink: 0 }}>{phaseLabel(p.key)}</span>
              <Bar value={p.n / maxPhase} color={rep.weakPhase && p.key === rep.weakPhase.key ? "#D9822B" : T.brass} />
              <span style={{ width: 28, textAlign: "right", fontSize: 11.5, fontWeight: 800, color: T.ink, flexShrink: 0 }}>{p.n}</span>
            </div>
          ))}
          <div style={{ ...sub, fontWeight: 800, margin: "12px 0 6px" }}>{t("무엇을 놓쳤나")}</div>
          {rep.byTheme.slice(0, 5).map((th) => (
            <div key={th.key} style={{ marginBottom: 8 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <span style={{ width: 96, fontSize: 12, fontWeight: 700, color: T.ink, flexShrink: 0 }}>{themeLabel(th.key)}</span>
                <Bar value={th.n / maxTheme} color="#D9822B" />
                <span style={{ width: 28, textAlign: "right", fontSize: 11.5, fontWeight: 800, color: T.ink, flexShrink: 0 }}>{th.n}</span>
              </div>
            </div>
          ))}
        </div>
        <div>
          <div style={{ ...sub, fontWeight: 800, marginBottom: 6 }}>{t("실수가 난 칸")}</div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(8,1fr)", width: 168, maxWidth: "100%", border: "2px solid #B8955A" }} aria-label={t("실수한 수가 도착한 칸의 분포")}>
            {rep.heat.map((row, r) => row.map((n, f) => (
              <div key={r + "-" + f} title={n ? "abcdefgh"[f] + (8 - r) + " · " + n : undefined} style={{ aspectRatio: "1", background: (r + f) % 2 === 0 ? "#E8D2A6" : "#7C4F2E", position: "relative" }}>
                {n > 0 && <div style={{ position: "absolute", inset: 0, background: "rgba(200,69,59," + (0.25 + 0.7 * n / rep.heatMax).toFixed(2) + ")", display: "flex", alignItems: "center", justifyContent: "center", color: "#fff", fontSize: 9, fontWeight: 800 }}>{n}</div>}
              </div>)))}
          </div>
          <div style={{ ...sub, fontWeight: 800, margin: "12px 0 6px" }}>{t("구간 × 유형")}</div>
          <div style={{ overflowX: "auto" }}>
            <table style={{ borderCollapse: "separate", borderSpacing: 2, fontSize: 10.5, color: T.ink }}>
              <thead><tr><th />{cols.map((th) => <th key={th} style={{ fontWeight: 700, padding: "0 3px 3px", whiteSpace: "nowrap", color: T.inkSoft }}>{themeLabel(th)}</th>)}</tr></thead>
              <tbody>{PHASES.map((p, ri) => (
                <tr key={p}><td style={{ fontWeight: 700, paddingRight: 5, whiteSpace: "nowrap" }}>{phaseLabel(p)}</td>
                  {cols.map((th) => { const n = rep.matrix[ri][THEMES.indexOf(th)]; return <td key={th} style={{ textAlign: "center", minWidth: 36, height: 24, borderRadius: 5, fontWeight: 800, background: n ? "rgba(217,130,43," + (0.18 + 0.7 * n / mMax).toFixed(2) + ")" : "rgba(0,0,0,.04)", color: n ? "#fff" : T.inkSoft }}>{n || "·"}</td>; })}
                </tr>))}</tbody>
            </table>
          </div>
        </div>
      </div>
      <div style={{ ...sub, fontWeight: 800, margin: "14px 0 6px" }}>{t("이렇게 보완하기")}</div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(210px, 1fr))", gap: 8 }}>
        {rep.topThemes.map((th) => (
          <div key={th.key} style={{ padding: "9px 11px", borderRadius: 10, background: "rgba(0,0,0,.035)", border: "1px solid #DCCBA8" }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 6 }}>
              <span style={{ fontSize: 12.5, fontWeight: 800, color: T.ink }}>{themeLabel(th.key)}</span>
              <button className="press" onClick={() => onPractice(th.key)} style={{ ...chip(false), padding: "3px 9px", fontSize: 11 }}>{t("이 유형 복습")}</button>
            </div>
            <p style={{ ...sub, margin: "4px 0 0" }}>{themeAdvice(th.key)}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ── 실수 복습 카드 ── */
function squaresOf(fen, san) {
  try { const mv = new Chess(fen).move(String(san).replace(/[+#!?]+$/g, "")); const sq = (s) => [8 - parseInt(s[1], 10), "abcdefgh".indexOf(s[0])]; return [sq(mv.from), sq(mv.to)]; } catch { return []; }
}
function ReviewCards({ list, update, filter, setFilter }) {
  const stats = useMemo(() => srsStats(list), [list]);
  const pool = useMemo(() => (filter === "all" ? list : list.filter((m) => m.theme === filter)), [list, filter]);
  const dueN = useMemo(() => dueCards(pool).length, [pool]);
  const [queue, setQueue] = useState(null);     // null=시작 전, 배열=세션 중(카드 id)
  const [done, setDone] = useState({ ok: 0, n: 0 });
  const [res, setRes] = useState(null);         // { ok, san } — 현재 카드의 결과
  const cur = queue && queue.length ? list.find((m) => m.id === queue[0]) : null;
  const root = useMemo(() => (cur ? parseFenFull(cur.fen) : null), [cur && cur.id]);
  const start = () => { setQueue(dueCards(pool, Date.now(), 10).map((m) => m.id)); setDone({ ok: 0, n: 0 }); setRes(null); };
  const grade = (ok, san) => { if (!cur || res) return; setRes({ ok, san }); setDone((d) => ({ ok: d.ok + (ok ? 1 : 0), n: d.n + 1 })); update(list.map((m) => (m.id === cur.id ? gradeCard(m, ok) : m))); };
  const next = () => { setRes(null); setQueue((q) => q.slice(1)); };
  const w = typeof window !== "undefined" ? Math.min(340, window.innerWidth - 64) : 320;
  const halo = res && cur ? squaresOf(cur.fen, cur.best) : [];
  const chips = [["all", t("전체")], ...THEMES.filter((th) => list.some((m) => m.theme === th)).map((th) => [th, themeLabel(th)])];
  return (
    <div style={card}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, flexWrap: "wrap", marginBottom: 8 }}>
        <h3 style={h3}>{t("복습 카드")}</h3>
        {queue && <button className="press" onClick={() => setQueue(null)} style={{ ...chip(false), padding: "3px 10px" }}>{t("그만하기")}</button>}
      </div>
      {!list.length ? <p style={sub}>{t("게임 리뷰를 열면 내가 둔 실수가 복습 카드로 쌓임")}</p>
      : !queue ? (
        <div>
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 10 }}>
            {chips.map(([k, l]) => <button key={k} className="press" onClick={() => setFilter(k)} style={chip(filter === k)}>{l}</button>)}
          </div>
          <p style={{ ...sub, margin: "0 0 10px" }}>{t("내가 두었던 실수 포지션에서 엔진 최선수를 찾기. 맞히면 복습 간격이 늘어나고(1·3·7·14·30일), 틀리면 곧 다시 나옴")}</p>
          <button className="press" onClick={start} disabled={!dueN} style={{ ...btn(true), width: "100%", opacity: dueN ? 1 : .5, cursor: dueN ? "pointer" : "default" }}>{dueN ? t("{0}장 복습 시작", Math.min(dueN, 10)) : t("오늘 복습할 카드를 모두 마침")}</button>
          <p style={{ ...sub, margin: "8px 0 0", textAlign: "center" }}>{t("전체 {0}장 · 익힌 카드 {1}장", stats.total, stats.mastered)}</p>
        </div>
      ) : !cur ? (
        <div style={{ textAlign: "center", padding: "10px 0" }}>
          <Sparkles size={26} style={{ color: T.brass }} />
          <p style={{ fontSize: 15, fontWeight: 800, color: T.ink, margin: "6px 0 2px" }}>{t("오늘의 복습 끝")}</p>
          <p style={{ ...sub, margin: "0 0 12px" }}>{t("{0}장 중 {1}장 정답", done.n, done.ok)}</p>
          <button className="press" onClick={() => setQueue(null)} style={btn(true)}>{t("돌아가기")}</button>
        </div>
      ) : (
        <div>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
            <span style={{ ...sub, fontWeight: 700 }}>{t("남은 카드 {0}장", queue.length)}</span>
            <span style={chip(true)}>{themeLabel(cur.theme)}</span>
          </div>
          <p style={{ fontSize: 13, fontWeight: 700, color: T.ink, margin: "0 0 8px" }}>{cur.color === "w" ? t("백 차례 — 최선수를 찾기") : t("흑 차례 — 최선수를 찾기")}</p>
          <div style={{ display: "flex", justifyContent: "center", marginBottom: 10 }}>
            <ChatMoveBoard Board={Board} root={root} sans={[]} size={w} flip={cur.color === "b"} interactive={!res} halo={halo} onMove={(san) => grade(isCardAnswer(cur, san), san)} />
          </div>
          {!res ? (
            <div style={{ display: "flex", justifyContent: "center" }}><button className="press" onClick={() => grade(false, null)} style={btn(false)}>{t("모르겠음 · 정답 보기")}</button></div>
          ) : (
            <div style={{ padding: "10px 12px", borderRadius: 10, border: "1px solid " + (res.ok ? "rgba(63,122,58,.6)" : "rgba(200,69,59,.6)"), background: res.ok ? "rgba(63,122,58,.08)" : "rgba(200,69,59,.07)" }}>
              <p style={{ fontSize: 14, fontWeight: 800, margin: "0 0 3px", color: res.ok ? T.best : T.blunder, display: "flex", alignItems: "center", gap: 6 }}>{res.ok ? <Check size={16} /> : <Target size={16} />}{res.ok ? t("정답! 다음 복습은 {0}일 뒤", SRS_DAYS[(list.find((m) => m.id === cur.id) || cur).box] || 1) : t("아쉬워요. 정답은 {0}", cur.best)}</p>
              <p style={{ ...sub, margin: "0 0 9px" }}>{t("실제 대국에서는 {0}을(를) 두었음", cur.san)} · {themeAdvice(cur.theme)}</p>
              <button className="press" onClick={next} style={{ ...btn(true), width: "100%" }}>{t("다음 카드")}</button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/* ── 마스터 스타일 ── */
function MasterStyle({ games }) {
  const [data, setData] = useState(null);
  const [sel, setSel] = useState(0);
  useEffect(() => { let on = true; import("../data/masterStyles.json").then((m) => { if (on) setData(m.default || m); }); return () => { on = false; }; }, []);
  const feat = useMemo(() => styleFeatures((games || []).slice(0, 200).map((g) => ({ moves: g.moves, color: g.color, result: g.result }))), [games]);
  const m = useMemo(() => (data ? matchMasters(feat, data, 3) : null), [feat, data]);
  const picked = m && m.ok ? m.list[Math.min(sel, m.list.length - 1)] : null;
  const row = picked ? data.masters.find((r) => r[0] === picked.name) : null;
  const rows = useMemo(() => (row ? compareCriteria(m.u, row[3], data) : []), [row, m, data]);
  const byKey = useMemo(() => Object.fromEntries(rows.map((r) => [r.key, r])), [rows]);
  if (!data) return <div style={card}><h3 style={h3}>{t("마스터 스타일")}</h3><p style={{ ...sub, margin: "6px 0 0" }}>{t("불러오는 중…")}</p></div>;
  if (!m.ok) return (
    <div style={card}>
      <h3 style={h3}>{t("마스터 스타일")}</h3>
      <p style={{ ...sub, margin: "6px 0 0" }}>{t("chess.com 대국이 {0}판 이상 연동되면 나와 닮은 마스터를 알려 줌 (지금 {1}판)", MIN_STYLE_GAMES, m.n)}</p>
    </div>
  );
  const mine = m.z.map((z, i) => ({ key: STYLE_KEYS[i], z })).filter((x) => x.z != null && Math.abs(x.z) >= 0.5).sort((a, b) => Math.abs(b.z) - Math.abs(a.z)).slice(0, 3);
  const similarN = rows.filter((r) => r.level === "same" || r.level === "close").length, comparable = rows.filter((r) => r.level !== "na").length;
  return (
    <div style={card}>
      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 8, flexWrap: "wrap", marginBottom: 8 }}>
        <h3 style={h3}>{t("마스터 스타일")}</h3>
        <span style={sub}>{t("최근 {0}판 기준", m.n)}</span>
      </div>
      <div style={{ ...sub, fontWeight: 800, marginBottom: 4 }}>{t("내 스타일")}</div>
      <p style={{ ...sub, color: T.ink, margin: "0 0 12px" }}>{mine.length ? mine.map((x) => traitLabel(x.key, x.z > 0)).join(" · ") : t("평균적인 마스터와 비슷한 균형형")}</p>
      <div style={{ ...sub, fontWeight: 800, marginBottom: 6 }}>{t("나와 닮은 마스터")}</div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 8, marginBottom: 12 }}>
        {m.list.map((x, i) => (
          <button key={x.name} className="press" onClick={() => setSel(i)} aria-pressed={i === sel} style={{ textAlign: "left", padding: "9px 11px", borderRadius: 10, cursor: "pointer", border: "1.5px solid " + (i === sel ? T.brass : "#DCCBA8"), background: i === sel ? "rgba(196,154,80,.16)" : "rgba(0,0,0,.025)", fontFamily: SITE_FONT, minWidth: 0 }}>
            <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 6 }}>
              <span style={{ fontSize: 11, fontWeight: 900, color: i === 0 ? T.brass : T.inkSoft }}>{i + 1}</span>
              <span style={{ fontSize: 15, fontWeight: 900, color: T.ink }}>{Math.round(x.sim * 100)}%</span>
            </div>
            <div style={{ fontSize: 13, fontWeight: 800, color: T.ink, fontFamily: "Georgia, serif", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{masterFlag(x.name)} {masterName(x.name, "en")}</div>
            <div style={{ fontSize: 10.5, color: T.inkSoft, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{x.elo ? "Elo " + x.elo + " · " : ""}{t("{0}판 분석", x.games)}</div>
          </button>
        ))}
      </div>
      {picked && (
        <div>
          <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 8, flexWrap: "wrap", marginBottom: 6 }}>
            <span style={{ fontSize: 13, fontWeight: 800, color: T.ink }}>{t("{0}와(과) 기준별 비교", masterName(picked.name, "en"))}</span>
            <span style={{ ...sub, fontWeight: 800, color: T.ink }}>{t("비슷한 기준 {0}/{1}", similarN, comparable)}</span>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "minmax(0,1fr) 54px 54px 76px", gap: 6, fontSize: 10, fontWeight: 800, color: T.inkSoft, marginBottom: 2 }}>
            <span />
            <span style={{ textAlign: "right" }}>{t("나")}</span>
            <span style={{ textAlign: "right", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{masterName(picked.name, "en").split(" ").slice(-1)[0]}</span>
            <span />
          </div>
          {CRITERIA_GROUPS.map((g) => (
            <div key={g.id} style={{ marginBottom: 8 }}>
              <div style={{ fontSize: 10.5, fontWeight: 800, color: T.inkSoft, letterSpacing: ".04em", margin: "6px 0 3px" }}>{criterionGroupLabel(g.id)}</div>
              {g.keys.map((k) => {
                const r = byKey[k]; if (!r) return null;
                return (
                  <div key={k} style={{ display: "grid", gridTemplateColumns: "minmax(0,1fr) 54px 54px 76px", alignItems: "center", gap: 6, padding: "5px 0", borderTop: "1px solid rgba(0,0,0,.06)", fontSize: 11.5 }}>
                    <span style={{ color: T.ink, fontWeight: 700, lineHeight: 1.3 }}>{criterionLabel(k)}</span>
                    <span style={{ textAlign: "right", color: T.ink, fontWeight: 800 }} title={t("나")}>{formatCriterion(k, r.mine)}</span>
                    <span style={{ textAlign: "right", color: T.inkSoft, fontWeight: 700 }} title={masterName(picked.name, "en")}>{formatCriterion(k, r.theirs)}</span>
                    <span style={{ textAlign: "center", fontSize: 10.5, fontWeight: 800, color: "#fff", background: LEVEL_COLOR[r.level], borderRadius: 999, padding: "2px 0", whiteSpace: "nowrap" }}>{levelLabel(r.level)}</span>
                  </div>
                );
              })}
            </div>
          ))}
          <p style={{ ...sub, fontSize: 10.5, margin: "8px 0 0" }}>{t("13가지 기보 특징을 하나씩 비교함. 값의 차이를 마스터 900명의 흩어진 정도로 나눠 단계를 정하며(거의 같음·비슷함·다름·많이 다름), 실력 비교가 아님")}</p>
        </div>
      )}
    </div>
  );
}

/* 학습 탭에 들어가는 성장 분석 전체 — 별도 버튼 없이 세 영역을 한 번에 펼쳐 보인다. */
export function GrowthPanel({ uid, games }) {
  const [data, update] = useGrowth(uid);
  const [filter, setFilter] = useState("all");
  const st = useMemo(() => srsStats(data.mistakes), [data]);
  const rep = useMemo(() => weaknessReport(data.mistakes), [data]);
  return (
    <section aria-label={t("성장 분석")} style={{ marginBottom: 8 }}>
      <div className="flex items-center gap-2" style={{ margin: "4px 0 10px" }}><RotateCcw size={15} style={{ color: T.brassHi }} /><h2 style={{ fontSize: 16, fontWeight: 800, color: T.ivoryHi, margin: 0 }}>{t("성장 분석")}</h2></div>
      <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
        <Stat value={rep.total} label={t("분석한 실수")} />
        <Stat value={st.due} label={t("오늘 복습")} accent={st.due ? "#C8453B" : undefined} />
        <Stat value={st.mastered} label={t("익힌 카드")} />
      </div>
      <WeaknessMap list={data.mistakes} onPractice={(th) => setFilter(th)} />
      <ReviewCards list={data.mistakes} update={update} filter={filter} setFilter={setFilter} />
      <MasterStyle games={games} />
    </section>
  );
}
