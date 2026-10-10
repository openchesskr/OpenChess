// (v0.6.5) 도감 "마스터" 상세 카드의 선수 상세 — PGN Mentor 선수별 대국 모음에서 가공한 통계(src/data/masterProfiles.json, scripts/build-master-profiles.mjs).
//  전적·백흑 성적·최고 엘로와 엘로 추이·즐겨 두는 첫 수와 응수·자주 쓰는 오프닝·자주 만난 상대·자주 나온 대회·도감 대회 출전 기록·강한 상대를 이긴 대표 대국.
//  카드를 열 때 지연 로드한다. 프로필이 없는 선수(250명 밖)는 아무것도 그리지 않는다.
import React, { useEffect, useMemo, useState } from "react";
import { T } from "../lib/theme.js";
import { SITE_FONT } from "./engineLines.jsx";
import { t } from "../lib/i18n.js";
import { loadMasterProfiles, loadTournamentSearch } from "../lib/tournamentData.js";
import { findProfile, playedTournaments } from "../lib/masterProfile.js";
import { decodeMoves } from "../lib/moveCodec.js";
import { GameViewButton, BestMoveJumpButton } from "./uiPrimitives.jsx";
import { enName } from "../data/playerNames.js";
import { TOURNAMENTS } from "../data/chessTournaments.js";

const TOUR_BY_ID = new Map(TOURNAMENTS.map((x) => [x.id, x]));
const head = (txt) => <div style={{ fontSize: 10.5, fontWeight: 800, color: T.brass, margin: "12px 0 3px" }}>{txt}</div>;
const row = { fontSize: 12, fontWeight: 600, color: T.ink, lineHeight: 1.5, fontFamily: SITE_FONT };
const small = { fontSize: 10.5, color: T.inkSoft, fontFamily: SITE_FONT };
const pct = (a, n) => (n ? Math.round((a / n) * 100) : 0);

function WdlBar({ w, d, l }) {
  const n = w + d + l || 1;
  return (
    <div>
      <div style={{ display: "flex", height: 9, borderRadius: 5, overflow: "hidden", background: "rgba(90,58,20,.12)" }} role="img" aria-label={t("승 {0} · 무 {1} · 패 {2}", w, d, l)}>
        <span style={{ width: (w / n) * 100 + "%", background: "#3F7A3A" }} /><span style={{ width: (d / n) * 100 + "%", background: "#B8A98A" }} /><span style={{ width: (l / n) * 100 + "%", background: "#C8453B" }} />
      </div>
      <div style={{ ...small, marginTop: 2 }}>{t("승 {0} · 무 {1} · 패 {2}", w, d, l)}</div>
    </div>
  );
}
function Spark({ pts }) {
  if (pts.length < 2) return null;
  const W = 280, H = 56, xs = pts.map((p) => p[0]), ys = pts.map((p) => p[1]), x0 = Math.min(...xs), x1 = Math.max(...xs), y0 = Math.min(...ys) - 10, y1 = Math.max(...ys) + 10;
  const X = (x) => 4 + ((x - x0) / (x1 - x0 || 1)) * (W - 8), Y = (y) => H - 4 - ((y - y0) / (y1 - y0 || 1)) * (H - 8);
  return (
    <div>
      <svg width="100%" viewBox={"0 0 " + W + " " + H} style={{ display: "block" }} role="img" aria-label={t("엘로 추이")}>
        <polyline fill="none" stroke={T.brass} strokeWidth="2" strokeLinejoin="round" points={pts.map((p) => X(p[0]) + "," + Y(p[1])).join(" ")} />
        {pts.map((p, i) => <circle key={i} cx={X(p[0])} cy={Y(p[1])} r="2" fill="#8A6A2F" />)}
      </svg>
      <div className="flex justify-between" style={small}><span>{x0} · {Math.min(...ys)}</span><span>{x1} · {ys[ys.length - 1]}</span></div>
    </div>
  );
}
const MoveList = ({ list, prefix }) => <div style={row}>{list.map(([san, n, p]) => <span key={san} style={{ marginRight: 10, whiteSpace: "nowrap" }}>{prefix}{san} <span style={{ color: T.inkSoft }}>{t("{0}판", n)} · {p}%</span></span>)}</div>;
const EcoList = ({ list }) => <div>{list.map(([eco, name, n, p]) => <div key={eco} style={row}><b>{eco}</b> {name} <span style={{ color: T.inkSoft, fontSize: 11 }}>{t("{0}판", n)} · {p}%</span></div>)}</div>;

export default function MasterProfile({ name, onOpenGame, onOpenGameAnalyze, onOpenTour }) {
  const [prof, setProf] = useState(undefined), [search, setSearch] = useState(null);
  useEffect(() => { let off = false; loadMasterProfiles().then((x) => { if (!off) setProf(x); }); loadTournamentSearch().then((x) => { if (!off) setSearch(x); }); return () => { off = true; }; }, []);
  const p = useMemo(() => findProfile(prof, name), [prof, name]);
  const played = useMemo(() => playedTournaments(search, p ? p.name : name, 8), [search, p, name]);
  if (prof === undefined) return <div style={{ ...small, marginTop: 10 }}>{t("불러오는 중…")}</div>;
  if (!p && !played.length) return null;
  const myName = p ? enName(p.name) : enName(name);
  return (
    <div>
      {p && <>
        {head(t("전적 · {0}판 · {1}–{2}", p.n, p.y0, p.y1))}
        <WdlBar w={p.wdl[0]} d={p.wdl[1]} l={p.wdl[2]} />
        <div style={{ ...row, marginTop: 4 }}>{t("백")} {pct(p.w[0] + p.w[1] / 2, p.w[0] + p.w[1] + p.w[2])}% · {t("흑")} {pct(p.b[0] + p.b[1] / 2, p.b[0] + p.b[1] + p.b[2])}% <span style={{ color: T.inkSoft, fontSize: 11 }}>({t("점수율")})</span></div>
        <div style={row}>{t("평균 {0}수 · 무승부 {1}%", p.len, p.draw)}</div>
        {p.peak[0] > 0 && <>
          {head(t("최고 레이팅"))}
          <div style={row}>{p.peak[0]}{p.peak[1] ? " (" + p.peak[1] + ")" : ""}</div>
          <Spark pts={p.elo} />
        </>}
        {p.fm.length > 0 && <>{head(t("백 첫 수"))}<MoveList list={p.fm} prefix="1." /></>}
        {p.e4.length > 0 && <>{head(t("흑 · 1.e4에 대한 응수"))}<MoveList list={p.e4} prefix="1.e4 " /></>}
        {p.d4.length > 0 && <>{head(t("흑 · 1.d4에 대한 응수"))}<MoveList list={p.d4} prefix="1.d4 " /></>}
        {p.ecoW.length > 0 && <>{head(t("자주 둔 오프닝 · 백"))}<EcoList list={p.ecoW} /></>}
        {p.ecoB.length > 0 && <>{head(t("자주 둔 오프닝 · 흑"))}<EcoList list={p.ecoB} /></>}
        {p.opp.length > 0 && <>{head(t("자주 만난 상대"))}{p.opp.map(([n, c, w, d, l]) => <div key={n} style={row}>{enName(n)} <span style={{ color: T.inkSoft, fontSize: 11 }}>{t("{0}판", c)} · {w}-{d}-{l}</span></div>)}</>}
        {p.ev.length > 0 && <>{head(t("자주 나온 대회"))}{p.ev.map(([n, c, y0, y1]) => <div key={n} style={row}>{n} <span style={{ color: T.inkSoft, fontSize: 11 }}>{t("{0}판", c)}{y0 ? " · " + y0 + (y1 !== y0 ? "–" + y1 : "") : ""}</span></div>)}</>}
      </>}
      {played.length > 0 && <>
        {head(t("대회 출전 기록"))}
        {played.map((x) => { const tr = TOUR_BY_ID.get(x.id); if (!tr) return null; return (
          <div key={x.id} style={row}>
            <button onClick={() => onOpenTour && onOpenTour(x.id)} className="press" style={{ border: "none", background: "none", padding: 0, cursor: onOpenTour ? "pointer" : "default", color: T.ink, textDecoration: onOpenTour ? "underline" : "none", fontWeight: 700, fontSize: 12, fontFamily: SITE_FONT, textAlign: "left" }}>{tr.name}</button>
            <span style={{ color: T.inkSoft, fontSize: 11 }}> {t("{0}회", x.n)} · {x.y0}{x.y1 !== x.y0 ? "–" + x.y1 : ""}</span>
          </div>); })}
      </>}
      {p && p.best.length > 0 && <>
        {head(t("강한 상대를 이긴 대표 대국"))}
        {p.best.map(([y, ev, opp, oe, color, code], i) => {
          const sans = () => decodeMoves(code), w = color === "w" ? myName : enName(opp), b = color === "w" ? enName(opp) : myName;
          return (
            <div key={i} className="flex items-center gap-1" style={{ marginBottom: 3 }}>
              <div style={{ flex: 1, minWidth: 0, background: "#fff", border: "1px solid #E4D5B6", borderRadius: 8, padding: "6px 8px", color: T.ink, fontFamily: SITE_FONT, fontSize: 11, fontWeight: 600, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{y || ""} · vs {enName(opp)} ({oe}) · {color === "w" ? t("백") : t("흑")} · {ev}</div>
              <GameViewButton onClick={() => onOpenGame && onOpenGame(sans())} />
              <BestMoveJumpButton onClick={() => onOpenGameAnalyze && onOpenGameAnalyze({ sans: sans(), white: { username: w, rating: color === "w" ? null : oe }, black: { username: b, rating: color === "w" ? oe : null } })} />
            </div>
          );
        })}
      </>}
      {p && <div style={{ ...small, marginTop: 10 }}>{t("래피드·블리츠·온라인 대국이 섞여 있음. 자료: PGN Mentor")}</div>}
    </div>
  );
}
