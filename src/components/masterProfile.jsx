// (v0.6.5) 도감 "마스터" 상세 카드의 선수 상세 — 선수별 PGN 대국 모음에서 가공한 통계(src/data/masterProfiles.json, scripts/build-master-profiles.mjs).
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
import { MasterNameLink } from "./masterLink.jsx";
import { masterDisplayName } from "../lib/masterPages.js";
import { Section, StatGrid, TimeRow, ChipList } from "./dexCardKit.jsx";

const TOUR_BY_ID = new Map(TOURNAMENTS.map((x) => [x.id, x]));
const SubHead = ({ txt }) => <div style={{ fontSize: 10, fontWeight: 800, color: T.inkSoft, margin: "6px 0 4px", fontFamily: "inherit" }}>{txt}</div>;
const row = { fontSize: 12, fontWeight: 600, color: T.ink, lineHeight: 1.5, fontFamily: SITE_FONT };
const small = { fontSize: 10.5, color: T.inkSoft, fontFamily: SITE_FONT };
const pct = (a, n) => (n ? Math.round((a / n) * 100) : 0);

function WdlBar({ w, d, l }) {
  const n = w + d + l || 1;
  return (
    <div>
      <div style={{ display: "flex", height: 9, borderRadius: 5, overflow: "hidden", background: "rgba(90,58,20,.12)" }} role="img" aria-label={t("승 {0}, 무 {1}, 패 {2}", w, d, l)}>
        <span style={{ width: (w / n) * 100 + "%", background: "#3F7A3A" }} /><span style={{ width: (d / n) * 100 + "%", background: "#B8A98A" }} /><span style={{ width: (l / n) * 100 + "%", background: "#C8453B" }} />
      </div>
      <div style={{ ...small, marginTop: 2 }}>{t("승 {0}, 무 {1}, 패 {2}", w, d, l)}</div>
    </div>
  );
}
function Spark({ pts }) {
  if (pts.length < 2) return null;
  const W = 280, H = 56, xs = pts.map((p) => p[0]), ys = pts.map((p) => p[1]), x0 = Math.min(...xs), x1 = Math.max(...xs), y0 = Math.min(...ys) - 10, y1 = Math.max(...ys) + 10;
  const X = (x) => 4 + ((x - x0) / (x1 - x0 || 1)) * (W - 8), Y = (y) => H - 4 - ((y - y0) / (y1 - y0 || 1)) * (H - 8);
  return (
    <div style={{ maxWidth: 560 }}>{/* (v0.7.6) 넓은 마스터 페이지에서 그래프가 지나치게 커지지 않게 */}
      <svg width="100%" viewBox={"0 0 " + W + " " + H} style={{ display: "block" }} role="img" aria-label={t("엘로 추이")}>
        <polyline fill="none" stroke={T.brass} strokeWidth="2" strokeLinejoin="round" points={pts.map((p) => X(p[0]) + "," + Y(p[1])).join(" ")} />
        {pts.map((p, i) => <circle key={i} cx={X(p[0])} cy={Y(p[1])} r="2" fill="#8A6A2F" />)}
      </svg>
      <div className="flex justify-between" style={small}><span>{x0}, {Math.min(...ys)}</span><span>{x1}, {ys[ys.length - 1]}</span></div>
    </div>
  );
}
const EcoList = ({ list }) => <div>{list.map(([eco, name, n, p]) => <div key={eco} style={row}><b>{eco}</b> {name} <span style={{ color: T.inkSoft, fontSize: 11 }}>{t("{0}판", n)}, {p}%</span></div>)}</div>;

export default function MasterProfile({ name, profileKey, onOpenGame, onOpenGameAnalyze, onOpenTour, hideHead }) {
  const [prof, setProf] = useState(undefined), [search, setSearch] = useState(null);
  useEffect(() => { let off = false; loadMasterProfiles().then((x) => { if (!off) setProf(x); }); loadTournamentSearch().then((x) => { if (!off) setSearch(x); }); return () => { off = true; }; }, []);
  const p = useMemo(() => (prof && profileKey && prof.p[profileKey]) || findProfile(prof, name), [prof, name, profileKey]);   // (v0.7.6) 마스터 페이지는 프로필 키로 바로 찾는다
  const played = useMemo(() => playedTournaments(search, p ? p.name : name, 8), [search, p, name]);
  if (prof === undefined) return <div style={{ ...small, marginTop: 10 }}>{t("불러오는 중…")}</div>;
  if (!p && !played.length) return null;
  const myName = enName(String(p ? p.name : name).split(":")[0]);   // (v0.7.6 BUG-167) 이름 칸에 다른 사람이 붙은 옛 데이터는 앞사람만
  const ws = p ? pct(p.w[0] + p.w[1] / 2, p.w[0] + p.w[1] + p.w[2]) : 0, bs = p ? pct(p.b[0] + p.b[1] / 2, p.b[0] + p.b[1] + p.b[2]) : 0;
  // (v0.7.9, 사용자 요청) 섹션·타일 체계(components/dexCardKit.jsx)로 다시 짰다 — 전적 → 수치 타일 → 레이팅 추이 → 첫 수·오프닝 → 상대·대회 → 대표 대국.
  return (
    <div>
      {p && <>
        <Section title={hideHead ? t("전적") : t("전적, {0}판, {1}–{2}", p.n, p.y0, p.y1)}>
          {/* (v0.7.5) 저장소의 마스터 대국 DB·대회 데이터로 보충한 프로필(build-master-profiles-db) — 선수의 전체 경력이 아니라 수록된 대국만 센 통계임을 밝힌다 */}
          {p.src === "db" && <div style={{ ...small, marginBottom: 4 }}>{t("OpenChess 마스터 대국 DB 수록 대국 기준 통계")}</div>}
          <WdlBar w={p.wdl[0]} d={p.wdl[1]} l={p.wdl[2]} />
          <div style={{ marginTop: 8 }}>
            <StatGrid items={[
              { label: t("백") + " (" + t("점수율") + ")", value: ws + "%" },
              { label: t("흑") + " (" + t("점수율") + ")", value: bs + "%" },
              { label: t("평균 수"), value: String(p.len) },
              { label: t("무승부"), value: p.draw + "%" },
            ]} />
          </div>
        </Section>
        {p.peak[0] > 0 && (
          <Section title={t("최고 레이팅")} aside={p.peak[0] + (p.peak[1] ? " (" + p.peak[1] + ")" : "")}>
            <div style={{ background: "#FFFBF2", border: "1px solid #E4D5B6", borderRadius: 10, padding: "8px 9px 6px" }}><Spark pts={p.elo} /></div>
          </Section>
        )}
        {(p.fm.length > 0 || p.e4.length > 0 || p.d4.length > 0) && (
          <Section title={t("즐겨 두는 수")}>
            {p.fm.length > 0 && <SubHead txt={t("백 첫 수")} />}{p.fm.length > 0 && <ChipList items={p.fm.map(([san, n, q]) => ({ main: "1." + san, sub: t("{0}판", n) + ", " + q + "%" }))} />}
            {p.e4.length > 0 && <SubHead txt={t("흑, 1.e4에 대한 응수")} />}{p.e4.length > 0 && <ChipList items={p.e4.map(([san, n, q]) => ({ main: "1.e4 " + san, sub: t("{0}판", n) + ", " + q + "%" }))} />}
            {p.d4.length > 0 && <SubHead txt={t("흑, 1.d4에 대한 응수")} />}{p.d4.length > 0 && <ChipList items={p.d4.map(([san, n, q]) => ({ main: "1.d4 " + san, sub: t("{0}판", n) + ", " + q + "%" }))} />}
          </Section>
        )}
        {(p.ecoW.length > 0 || p.ecoB.length > 0) && (
          <Section title={t("자주 둔 오프닝")}>
            {p.ecoW.length > 0 && <><SubHead txt={t("자주 둔 오프닝, 백")} /><EcoList list={p.ecoW} /></>}
            {p.ecoB.length > 0 && <><SubHead txt={t("자주 둔 오프닝, 흑")} /><EcoList list={p.ecoB} /></>}
          </Section>
        )}
        {p.opp.length > 0 && (
          <Section title={t("자주 만난 상대")} aside={p.opp.length}>
            {p.opp.map(([n, c, w, d, l]) => (
              <div key={n} className="flex items-center gap-2" style={{ padding: "4px 0", borderBottom: "1px dashed #E6D8BC" }}>
                <span style={{ ...row, flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}><MasterNameLink name={n}>{masterDisplayName(n) || enName(n.split(":")[0])}</MasterNameLink></span>
                <span style={{ ...small, whiteSpace: "nowrap" }}>{t("{0}판", c)}</span>
                <span style={{ fontSize: 10.5, fontWeight: 800, fontFamily: SITE_FONT, whiteSpace: "nowrap" }}><span style={{ color: T.best }}>{w}</span>-<span style={{ color: T.inkSoft }}>{d}</span>-<span style={{ color: "#B5483E" }}>{l}</span></span>
              </div>
            ))}
          </Section>
        )}
        {p.ev.length > 0 && (
          <Section title={t("자주 나온 대회")} aside={p.ev.length}>
            {p.ev.map(([n, c, y0, y1]) => <TimeRow key={n} when={y0 ? y0 + (y1 !== y0 ? "–" + String(y1).slice(-2) : "") : "—"}>{n} <span style={{ color: T.inkSoft, fontSize: 11 }}>{t("{0}판", c)}</span></TimeRow>)}
          </Section>
        )}
      </>}
      {played.length > 0 && (
        <Section title={t("대회 출전 기록")} aside={played.length}>
          {played.map((x) => { const tr = TOUR_BY_ID.get(x.id); if (!tr) return null; return (
            <TimeRow key={x.id} when={x.y0 + (x.y1 !== x.y0 ? "–" + String(x.y1).slice(-2) : "")}>
              <button onClick={() => onOpenTour && onOpenTour(x.id)} className="press" style={{ border: "none", background: "none", padding: 0, cursor: onOpenTour ? "pointer" : "default", color: T.ink, textDecoration: onOpenTour ? "underline" : "none", fontWeight: 700, fontSize: 12, fontFamily: SITE_FONT, textAlign: "left" }}>{tr.name}</button>
              <span style={{ color: T.inkSoft, fontSize: 11 }}> {t("{0}회", x.n)}</span>
            </TimeRow>); })}
        </Section>
      )}
      {p && p.best.length > 0 && (
        <Section title={t("강한 상대를 이긴 대표 대국")} aside={p.best.length}>
          {p.best.map(([y, ev, opp, oe, color, code], i) => {
            const oppName = masterDisplayName(opp) || enName(String(opp).split(":")[0]);
            const sans = () => decodeMoves(code), w = color === "w" ? myName : oppName, b = color === "w" ? oppName : myName;
            return (
              <div key={i} className="flex items-center gap-1" style={{ marginBottom: 4 }}>
                <div style={{ flex: 1, minWidth: 0, background: "#fff", border: "1px solid #E4D5B6", borderRadius: 9, padding: "5px 8px", color: T.ink, fontFamily: SITE_FONT, fontSize: 11, fontWeight: 600, lineHeight: 1.35 }}>
                  <div style={{ whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>vs {enName(opp)} ({oe}), {color === "w" ? t("백") : t("흑")}</div>
                  <div style={{ fontSize: 10, color: T.inkSoft, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{y || ""}{y ? ", " : ""}{ev}</div>
                </div>
                <GameViewButton onClick={() => onOpenGame && onOpenGame(sans())} />
                <BestMoveJumpButton onClick={() => onOpenGameAnalyze && onOpenGameAnalyze({ sans: sans(), white: { username: w, rating: color === "w" ? null : oe }, black: { username: b, rating: color === "w" ? oe : null } })} />
              </div>
            );
          })}
        </Section>
      )}
      {p && <div style={{ ...small, marginTop: 10 }}>{t("래피드·블리츠·온라인 대국이 섞여 있음.")}</div>}
    </div>
  );
}
