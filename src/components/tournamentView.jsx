// (v0.6.5) 도감 "마스터" 대회 회차 화면 — 대회·연도 블록을 누르면 열린다.
//  순위·대진표 탭: 라운드로빈은 크로스테이블, 스위스·목록은 순위표, 매치는 국별 누적 점수, 녹아웃은 라운드별 대진표(승자 굵게·타이브레이크 표시).
//  대국 목록 탭: 라운드·선수 이름·결과·단계로 거르고, 눌러서 보드(수순 따라 두기)나 리뷰로 연다. 수순은 열 때 복원한다(src/lib/moveCodec.js).
//  데이터: src/data/tournaments/<id>.json(대회를 열 때만 지연 로드, src/lib/tournamentData.js). 계산: src/lib/tournamentView.js(순수 함수).
import React, { useEffect, useMemo, useState } from "react";
import { X, ChevronLeft, ChevronRight, Trophy, Swords } from "lucide-react";
import { T } from "../lib/theme.js";
import { SITE_FONT } from "./engineLines.jsx";
import { t } from "../lib/i18n.js";
import { loadTournament } from "../lib/tournamentData.js";
import { decodeMoves } from "../lib/moveCodec.js";
import { bracket, crosstable, filterGames, fmtScore, matchSummary, roundKey, roundsOf, standings, winnerOf, RES_TXT } from "../lib/tournamentView.js";
import { dbPlayerName } from "../data/playerNames.js";
import { flagEmoji } from "../lib/flags.js";

const FMT_LABEL = () => ({ rr: t("라운드로빈"), swiss: t("스위스"), ko: t("녹아웃"), match: t("매치"), list: t("기록") });
const ROUND_LABEL = () => ({ final: t("결승"), semi: t("준결승"), qf: t("8강"), r16: t("16강"), r32: t("32강"), r64: t("64강") });
const nm = (ed, i) => dbPlayerName(ed.pl[i][0], "en");
const cc = (site) => { const m = / ([A-Z]{3})$/.exec(site || ""); return m ? m[1] : ""; };
const cityOf = (site) => String(site || "").replace(/ [A-Z]{3}$/, "");
const dateText = (ed) => (ed.d0 ? ed.d0.replace(/\./g, "-") + (ed.d1 && ed.d1 !== ed.d0 ? " ~ " + ed.d1.replace(/\./g, "-") : "") : "");
const tab = (on) => ({ padding: "6px 12px", borderRadius: 999, fontSize: 12, fontWeight: 800, cursor: "pointer", fontFamily: SITE_FONT, border: "1px solid " + (on ? T.brass : "#DCCBA8"), background: on ? "rgba(196,154,80,.2)" : "transparent", color: on ? T.ink : T.inkSoft, whiteSpace: "nowrap" });
const th = { fontSize: 10.5, fontWeight: 800, color: T.inkSoft, padding: "4px 6px", textAlign: "center", whiteSpace: "nowrap", background: "#F6EEDC", position: "sticky", top: 0, zIndex: 1 };
const td = { fontSize: 12, fontWeight: 700, color: T.ink, padding: "3px 6px", textAlign: "center", borderTop: "1px solid rgba(0,0,0,.06)", whiteSpace: "nowrap" };
const CELL = { "1": { bg: "rgba(63,122,58,.20)", fg: "#2F6A2A" }, "½": { bg: "rgba(120,110,95,.14)", fg: "#6B5C46" }, "0": { bg: "rgba(200,69,59,.14)", fg: "#A53B31" } };

/* 대국 한 줄 — 보드·리뷰 버튼. 수순은 누를 때 복원한다. */
function GameRow({ ed, gi, onOpenGame, onOpenGameAnalyze, showRound = true }) {
  const g = ed.g[gi], sans = () => decodeMoves(g[5]);
  const st = g[7] ? ed.evs[g[7] - 1] : null;
  const label = (i) => nm(ed, i) + (ed.pl[i][1] ? " (" + ed.pl[i][1] + ")" : "");
  const btn = { flexShrink: 0, fontSize: 10.5, fontWeight: 800, padding: "4px 8px", borderRadius: 8, border: "1px solid #C9B58C", background: "transparent", color: T.inkSoft, cursor: "pointer", fontFamily: SITE_FONT };
  return (
    <div className="flex items-center gap-1" style={{ marginBottom: 3 }}>
      <button onClick={() => onOpenGame && onOpenGame(sans())} disabled={!g[5]} className="press" style={{ flex: 1, minWidth: 0, textAlign: "left", background: "#fff", border: "1px solid #E4D5B6", borderRadius: 8, padding: "5px 8px", cursor: g[5] ? "pointer" : "default", color: T.ink, fontFamily: SITE_FONT, fontSize: 11.5, fontWeight: 600, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", opacity: g[5] ? 1 : 0.55 }}>
        {showRound && g[0] ? <span style={{ color: T.brass, fontWeight: 800, marginRight: 6 }}>R{g[0]}{g[1] ? "." + g[1] : ""}</span> : null}
        {label(g[2])} <b style={{ margin: "0 3px" }}>{RES_TXT[g[4]]}</b> {label(g[3])}
        {g[6] ? <span style={{ color: T.inkSoft, marginLeft: 6, fontSize: 10.5 }}>{g[6]}</span> : null}
        {st ? <span style={{ color: T.inkSoft, marginLeft: 6, fontSize: 10.5 }}>· {st}</span> : null}
      </button>
      <button onClick={() => onOpenGameAnalyze && g[5] && onOpenGameAnalyze({ sans: sans(), white: { username: nm(ed, g[2]), rating: ed.pl[g[2]][1] || null }, black: { username: nm(ed, g[3]), rating: ed.pl[g[3]][1] || null } })} disabled={!g[5]} className="press" style={{ ...btn, opacity: g[5] ? 1 : 0.5 }}>{t("리뷰")}</button>
    </div>
  );
}

/* 라운드로빈 크로스테이블 — 행 선수 기준 결과. 칸을 누르면 그 두 사람의 대국이 아래에 나온다. 선수 이름을 누르면 그 선수의 대국만 본다. */
function Crosstable({ ed, ct, onPick, onPlayer, sel }) {
  const { rows, cells } = ct;
  return (
    <div style={{ overflow: "auto", maxHeight: 460, border: "1px solid #E4D5B6", borderRadius: 10, background: "#fff" }}>
      <table style={{ borderCollapse: "separate", borderSpacing: 0, minWidth: "100%" }}>
        <thead><tr>
          <th style={{ ...th, left: 0, zIndex: 3, textAlign: "left", minWidth: 150 }}>{t("선수")}</th>
          {rows.map((r, j) => <th key={j} style={th} title={nm(ed, r.i)}>{j + 1}</th>)}
          <th style={th}>{t("점수")}</th>
        </tr></thead>
        <tbody>{rows.map((r, a) => (
          <tr key={r.i}>
            <td style={{ ...td, textAlign: "left", position: "sticky", left: 0, background: "#FBF5E8", zIndex: 2 }}>
              <button onClick={() => onPlayer(r.i)} className="press" style={{ border: "none", background: "none", padding: 0, cursor: "pointer", color: T.ink, fontWeight: 800, fontSize: 12, fontFamily: SITE_FONT }}>{a + 1}. {nm(ed, r.i)}</button>
              {r.elo ? <span style={{ color: T.inkSoft, fontSize: 10, marginLeft: 5 }}>{r.elo}</span> : null}
            </td>
            {rows.map((q, b) => {
              if (a === b) return <td key={b} style={{ ...td, background: "rgba(0,0,0,.08)" }} />;
              const c = cells[a][b], on = sel && sel.a === a && sel.b === b;
              return <td key={b} style={{ ...td, padding: 0, background: on ? "rgba(34,211,240,.25)" : undefined }}>
                {c.length ? <button onClick={() => onPick(a, b)} className="press" style={{ width: "100%", minWidth: 28, padding: "4px 3px", border: "none", cursor: "pointer", fontSize: 12, fontWeight: 800, fontFamily: SITE_FONT, background: CELL[c[0].t].bg, color: CELL[c[0].t].fg }}>{c.map((x) => x.t).join(" ")}</button> : <span style={{ color: "#C9B58C" }}>·</span>}
              </td>;
            })}
            <td style={{ ...td, fontWeight: 900 }}>{fmtScore(r.score2)}</td>
          </tr>
        ))}</tbody>
      </table>
    </div>
  );
}

/* 스위스·기록 — 순위표. */
function Standings({ ed, onPlayer }) {
  const rows = useMemo(() => standings(ed), [ed]);
  const [all, setAll] = useState(false);
  const list = all ? rows : rows.slice(0, 40);
  return (
    <div>
      <div style={{ overflow: "auto", maxHeight: 440, border: "1px solid #E4D5B6", borderRadius: 10, background: "#fff" }}>
        <table style={{ borderCollapse: "separate", borderSpacing: 0, width: "100%" }}>
          <thead><tr><th style={th}>#</th><th style={{ ...th, textAlign: "left" }}>{t("선수")}</th><th style={th}>{t("엘로")}</th><th style={th}>{t("점수")}</th><th style={th}>{t("대국")}</th></tr></thead>
          <tbody>{list.map((r, k) => (
            <tr key={r.i}><td style={td}>{k + 1}</td>
              <td style={{ ...td, textAlign: "left" }}><button onClick={() => onPlayer(r.i)} className="press" style={{ border: "none", background: "none", padding: 0, cursor: "pointer", color: T.ink, fontWeight: 800, fontSize: 12, fontFamily: SITE_FONT }}>{nm(ed, r.i)}</button></td>
              <td style={td}>{r.elo || ""}</td><td style={{ ...td, fontWeight: 900 }}>{fmtScore(r.score2)}</td><td style={td}>{r.n}</td></tr>
          ))}</tbody>
        </table>
      </div>
      {!all && rows.length > 40 && <button onClick={() => setAll(true)} className="press" style={{ ...tab(false), marginTop: 6 }}>{t("더 보기")} ({rows.length - 40})</button>}
    </div>
  );
}

/* 녹아웃 — 라운드별 대진표(가로 스크롤). 승자는 굵게, 타이브레이크가 있으면 표시, 매치를 누르면 그 국들이 아래에 나온다. */
function Bracket({ ed, onMatch, sel }) {
  const br = useMemo(() => bracket(ed), [ed]);
  const total = br.length;
  return (
    <div style={{ overflowX: "auto", border: "1px solid #E4D5B6", borderRadius: 10, background: "#fff", padding: 10 }}>
      <div style={{ display: "flex", gap: 14, minWidth: "max-content", alignItems: "flex-start" }}>
        {br.map((rd, k) => {
          const real = rd.matches.filter((m) => !m.bronze).length, key = roundKey(real);
          const title = k === total - 1 && rd.matches.some((m) => m.bronze) ? t("결승·3위전") : key === "round" ? t("{0}라운드", rd.r) : ROUND_LABEL()[key];
          return (
            <div key={rd.r} style={{ width: 190, flexShrink: 0 }}>
              <div style={{ fontSize: 11, fontWeight: 900, color: T.brass, marginBottom: 6 }}>{title} <span style={{ color: T.inkSoft, fontWeight: 700 }}>({rd.matches.length})</span></div>
              <div style={{ display: "flex", flexDirection: "column", gap: 6, maxHeight: 420, overflowY: "auto", paddingRight: 2 }}>
                {rd.matches.map((m) => {
                  const on = sel && sel.r === rd.r && sel.a === m.a && sel.b === m.b;
                  const line = (i, sc) => <div style={{ display: "flex", justifyContent: "space-between", gap: 6, fontWeight: m.win === i ? 900 : 600, color: m.win === i ? T.ink : T.inkSoft, fontSize: 11.5 }}><span style={{ whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{m.win === i ? "✓ " : ""}{nm(ed, i)}</span><span>{sc}</span></div>;
                  return (
                    <button key={m.a + "-" + m.b} onClick={() => onMatch(rd.r, m)} className="press" style={{ textAlign: "left", padding: "6px 8px", borderRadius: 9, cursor: "pointer", fontFamily: SITE_FONT, background: on ? "rgba(34,211,240,.18)" : "#FBF5E8", border: "1.5px solid " + (on ? "#22D3F0" : m.bronze ? "#C9B58C" : "#DCCBA8") }}>
                      {line(m.a, m.sa)}{line(m.b, m.sb)}
                      {(m.tb || m.bronze) && <div style={{ fontSize: 9.5, color: T.inkSoft, marginTop: 2 }}>{m.bronze ? t("3위전") : t("타이브레이크")}</div>}
                    </button>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function MatchTable({ ed, onOpenGame, onOpenGameAnalyze }) {
  const sum = useMemo(() => matchSummary(ed), [ed]);
  const last = sum[sum.length - 1];
  return (
    <div>
      <div style={{ display: "flex", justifyContent: "center", alignItems: "center", gap: 14, margin: "6px 0 10px", fontFamily: SITE_FONT }}>
        <span style={{ fontSize: 14, fontWeight: 800, color: T.ink }}>{nm(ed, 0)}</span>
        <span style={{ fontSize: 22, fontWeight: 900, color: T.brass }}>{last ? fmtScore(last.a * 2) + " : " + fmtScore(last.b * 2) : "-"}</span>
        <span style={{ fontSize: 14, fontWeight: 800, color: T.ink }}>{nm(ed, 1)}</span>
      </div>
      {sum.map((x) => <div key={x.gi} className="flex items-center gap-1"><span style={{ width: 62, flexShrink: 0, fontSize: 10.5, fontWeight: 800, color: T.inkSoft, textAlign: "center" }}>{fmtScore(x.a * 2)} : {fmtScore(x.b * 2)}</span><div style={{ flex: 1, minWidth: 0 }}><GameRow ed={ed} gi={x.gi} onOpenGame={onOpenGame} onOpenGameAnalyze={onOpenGameAnalyze} /></div></div>)}
    </div>
  );
}

function GamesTab({ ed, filter, setFilter, onOpenGame, onOpenGameAnalyze }) {
  const rounds = useMemo(() => roundsOf(ed), [ed]);
  const list = useMemo(() => filterGames(ed, { round: filter.round, text: filter.text, res: filter.res, stage: filter.stage }), [ed, filter]);
  const [lim, setLim] = useState(60);
  useEffect(() => setLim(60), [ed, filter]);
  const sel = { padding: "6px 8px", borderRadius: 8, border: "1px solid #DCCBA8", background: "#fff", color: T.ink, fontSize: 12, fontFamily: SITE_FONT };
  return (
    <div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 8 }}>
        <input value={filter.text} onChange={(e) => setFilter({ ...filter, text: e.target.value })} placeholder={t("선수 이름 검색")} aria-label={t("선수 이름 검색")} style={{ ...sel, flex: "1 1 140px", minWidth: 120 }} />
        {rounds.length > 0 && <select value={filter.round} onChange={(e) => setFilter({ ...filter, round: +e.target.value })} aria-label={t("라운드")} style={sel}><option value={0}>{t("모든 라운드")}</option>{rounds.map((r) => <option key={r} value={r}>{t("{0}라운드", r)}</option>)}</select>}
        <select value={filter.res == null ? "" : filter.res} onChange={(e) => setFilter({ ...filter, res: e.target.value === "" ? null : +e.target.value })} aria-label={t("결과")} style={sel}><option value="">{t("모든 결과")}</option><option value={2}>{t("백 승")}</option><option value={1}>{t("무승부")}</option><option value={0}>{t("흑 승")}</option></select>
        {ed.evs.length > 0 && <select value={filter.stage == null ? "" : filter.stage} onChange={(e) => setFilter({ ...filter, stage: e.target.value === "" ? null : +e.target.value })} aria-label={t("단계")} style={sel}><option value="">{t("모든 단계")}</option><option value={0}>{ed.ev}</option>{ed.evs.map((x, i) => <option key={i} value={i + 1}>{x}</option>)}</select>}
      </div>
      <div style={{ fontSize: 11, color: T.inkSoft, marginBottom: 6 }}>{t("대국 {0}판", list.length)}</div>
      {list.slice(0, lim).map(({ i }) => <GameRow key={i} ed={ed} gi={i} onOpenGame={onOpenGame} onOpenGameAnalyze={onOpenGameAnalyze} />)}
      {list.length > lim && <button onClick={() => setLim(lim + 100)} className="press" style={{ ...tab(false), marginTop: 6 }}>{t("더 보기")} ({list.length - lim})</button>}
      {!list.length && <div style={{ fontSize: 12, color: T.inkSoft, padding: "12px 0" }}>{t("조건에 맞는 대국 없음")}</div>}
    </div>
  );
}

/** 대회(tour)의 year 회차 화면. years = 이 대회에 자료가 있는 연도(오름차순). */
export default function EditionView({ tour, year, years, onYear, onClose, onOpenGame, onOpenGameAnalyze }) {
  const [data, setData] = useState(undefined);   // undefined 불러오는 중 · null 자료 없음
  const [which, setWhich] = useState(0);         // 같은 해 회차가 여럿일 때 선택
  const [mode, setMode] = useState("table");
  const [filter, setFilter] = useState({ round: 0, text: "", res: null, stage: null });
  const [selPair, setSelPair] = useState(null);  // 크로스테이블·대진표에서 고른 대국 번호들
  useEffect(() => { let off = false; setData(undefined); loadTournament(tour.id).then((d) => { if (!off) setData(d); }); return () => { off = true; }; }, [tour.id]);
  useEffect(() => { setWhich(0); setSelPair(null); setFilter({ round: 0, text: "", res: null, stage: null }); }, [tour.id, year]);
  const eds = data ? data.eds.filter((e) => e.y === year) : [];
  const ed = eds[Math.min(which, eds.length - 1)];
  const win = useMemo(() => (ed ? winnerOf(ed) : null), [ed]);
  const ct = useMemo(() => (ed && ed.fmt === "rr" ? crosstable(ed) : null), [ed]);   // 라운드로빈만 크로스테이블
  const yi = years.indexOf(year);
  const go = (d) => { const y = years[yi + d]; if (y != null) onYear(y); };
  const playerFilter = (i) => { setFilter({ round: 0, text: String(ed.pl[i][0]).split(",")[0], res: null, stage: null }); setMode("games"); };
  return (
    <div className="no-pan" onPointerDown={(e) => e.stopPropagation()} role="dialog" aria-label={tour.name + " " + year}
      style={{ position: "absolute", inset: 8, zIndex: 70, display: "flex", flexDirection: "column", borderRadius: 14, background: T.paper, border: "1px solid #DCCBA8", boxShadow: "0 12px 30px -8px rgba(0,0,0,.45)", overflow: "hidden", cursor: "default" }}>
      <div style={{ padding: "10px 12px", borderBottom: "1px solid #E4D5B6", background: "#F6EEDC" }}>
        <div className="flex items-start justify-between gap-2">
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: 16, fontWeight: 800, color: T.ink, lineHeight: 1.25 }}>{tour.name} {year}</div>
            {ed && ed.ev && ed.ev !== tour.name && <div style={{ fontSize: 11.5, color: T.inkSoft, fontFamily: SITE_FONT }}>{ed.ev}</div>}
            {ed && <div style={{ fontSize: 11, color: T.inkSoft, fontFamily: SITE_FONT, marginTop: 2 }}>{flagEmoji(cc(ed.site)) ? flagEmoji(cc(ed.site)) + " " : ""}{cityOf(ed.site)}{dateText(ed) ? " · " + dateText(ed) : ""} · {FMT_LABEL()[ed.fmt]} · {t("{0}명 · {1}판", standings(ed).length || ed.pl.length, ed.g.length)}</div>}
          </div>
          <div className="flex items-center gap-1" style={{ flexShrink: 0 }}>
            <button onClick={() => go(-1)} disabled={yi <= 0} aria-label={t("이전 회차")} title={t("이전 회차")} className="press" style={{ width: 26, height: 26, borderRadius: 7, border: "1px solid #C9B58C", background: "transparent", cursor: yi > 0 ? "pointer" : "default", opacity: yi > 0 ? 1 : 0.35, display: "inline-flex", alignItems: "center", justifyContent: "center", color: T.inkSoft }}><ChevronLeft size={15} /></button>
            <select value={year} onChange={(e) => onYear(+e.target.value)} aria-label={t("연도")} style={{ height: 26, borderRadius: 7, border: "1px solid #C9B58C", background: "#fff", color: T.ink, fontSize: 12, fontWeight: 800, fontFamily: SITE_FONT }}>{years.map((y) => <option key={y} value={y}>{y}</option>)}</select>
            <button onClick={() => go(1)} disabled={yi < 0 || yi >= years.length - 1} aria-label={t("다음 회차")} title={t("다음 회차")} className="press" style={{ width: 26, height: 26, borderRadius: 7, border: "1px solid #C9B58C", background: "transparent", cursor: yi < years.length - 1 ? "pointer" : "default", opacity: yi < years.length - 1 ? 1 : 0.35, display: "inline-flex", alignItems: "center", justifyContent: "center", color: T.inkSoft }}><ChevronRight size={15} /></button>
            <button onClick={onClose} aria-label={t("닫기")} className="press" style={{ width: 26, height: 26, borderRadius: 7, background: T.ebony2, color: T.ivory, border: "1px solid #000", cursor: "pointer", display: "inline-flex", alignItems: "center", justifyContent: "center" }}><X size={14} /></button>
          </div>
        </div>
        {eds.length > 1 && <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 8 }}>{eds.map((e, k) => <button key={e.k} onClick={() => { setWhich(k); setSelPair(null); }} className="press" style={tab(k === which)}>{e.ev || e.k}</button>)}</div>}
      </div>
      <div style={{ flex: 1, minHeight: 0, overflowY: "auto", padding: 12 }}>
        {data === undefined && <div style={{ fontSize: 12, color: T.inkSoft }}>{t("불러오는 중…")}</div>}
        {data === null && <div style={{ fontSize: 12, color: T.inkSoft }}>{t("이 대회의 대국 자료가 없음")}</div>}
        {data && !ed && <div style={{ fontSize: 12, color: T.inkSoft }}>{t("이 연도의 대국 자료가 없음")}</div>}
        {ed && <>
          {win && <div className="flex items-center gap-2" style={{ marginBottom: 8, padding: "6px 10px", borderRadius: 10, background: "rgba(196,154,80,.16)", fontFamily: SITE_FONT, fontSize: 12.5, fontWeight: 800, color: T.ink }}>
            <Trophy size={14} style={{ color: T.brass, flexShrink: 0 }} /><span>{win.tie ? t("공동 우승") : t("우승")}: {win.names.map((n) => dbPlayerName(n, "en")).join(" · ")} ({fmtScore(win.score * 2)})</span>
          </div>}
          <div style={{ display: "flex", gap: 6, marginBottom: 10 }}>
            <button onClick={() => setMode("table")} className="press" style={tab(mode === "table")}>{ed.fmt === "ko" ? t("대진표") : ed.fmt === "rr" ? t("크로스테이블") : t("순위표")}</button>
            <button onClick={() => setMode("games")} className="press" style={tab(mode === "games")}>{t("대국 목록")}</button>
          </div>
          {mode === "table" && <>
            {ed.fmt === "rr" && <><Crosstable ed={ed} ct={ct} sel={selPair} onPlayer={playerFilter} onPick={(a, b) => setSelPair({ a, b, gis: ct.cells[a][b].map((x) => x.gi) })} />
              {ed.cov < 100 && <div style={{ fontSize: 10.5, color: T.inkSoft, marginTop: 4 }}>{t("자료에 없는 대국이 있어 일부 칸이 비어 있음")} ({ed.cov}%)</div>}</>}
            {(ed.fmt === "swiss" || ed.fmt === "list") && <Standings ed={ed} onPlayer={playerFilter} />}
            {ed.fmt === "match" && <MatchTable ed={ed} onOpenGame={onOpenGame} onOpenGameAnalyze={onOpenGameAnalyze} />}
            {ed.fmt === "ko" && <Bracket ed={ed} sel={selPair} onMatch={(r, m) => setSelPair({ r, a: m.a, b: m.b, gis: m.games })} />}
            {selPair && selPair.gis.length > 0 && ed.fmt !== "match" && <div style={{ marginTop: 10 }}>
              <div className="flex items-center gap-1" style={{ fontSize: 11, fontWeight: 800, color: T.brass, marginBottom: 4 }}><Swords size={12} /> {nm(ed, ct ? ct.rows[selPair.a].i : selPair.a)} – {nm(ed, ct ? ct.rows[selPair.b].i : selPair.b)}</div>
              {selPair.gis.map((gi) => <GameRow key={gi} ed={ed} gi={gi} onOpenGame={onOpenGame} onOpenGameAnalyze={onOpenGameAnalyze} />)}
            </div>}
          </>}
          {mode === "games" && <GamesTab ed={ed} filter={filter} setFilter={setFilter} onOpenGame={onOpenGame} onOpenGameAnalyze={onOpenGameAnalyze} />}
        </>}
      </div>
    </div>
  );
}
