// (v0.6.3) 도감 "마스터" — 역대 세계 체스 챔피언 모식도.
// 위→아래가 시간 순서(1886 → 현재)이고, 챔피언 노드 옆에는 그 챔피언에게 도전했다가 타이틀전에서 탈락한 마스터가 붙는다.
// 1993~2006 분열기에는 정통 계보가 PCA→클래식(왼쪽)·FIDE(오른쪽) 두 줄로 갈라졌다가 통합전에서 다시 합쳐진다.
// 데이터: src/data/worldChampions.js · 배치: src/lib/masterTreeLayout.js · 팬/줌: 오프닝 모식도와 같은 기하 함수(src/lib/schematicGeometry.js).
import React, { useRef, useState, useEffect, useCallback, useLayoutEffect } from "react";
import { X } from "lucide-react";
import { T } from "../lib/theme.js";
import { SITE_FONT } from "../components/engineLines.jsx";
import { t, lang } from "../lib/i18n.js";
import { CHAMPIONS, TRANSFERS, SPLIT_ROWS, UPCOMING } from "../data/worldChampions.js";
import { TOURNAMENTS } from "../data/chessTournaments.js";
import { COUNTRY_KO, WINNERS, WINNER_KIND } from "../data/chessTournamentWinners.js";
import { dbPlayerName, playerName } from "../data/playerNames.js";
import { laurelBranch, leafPath } from "../lib/laurel.js";
import { ordinalParam } from "../lib/ordinal.js";
import { MT, championAt, clampMasterPan, layoutMasters, transferPath } from "../lib/masterTreeLayout.js";
import { useFitPanelHeight } from "../lib/dexPanel.js";
import { MASTER_ZOOM_LABEL_BASE, MASTER_ZOOM_STEP, SCHEMATIC_DRAG_MULT, anchoredZoomPan, masterZoomLabel, snapMasterZoom } from "../lib/schematicGeometry.js";

const LAYOUT = layoutMasters(CHAMPIONS, TRANSFERS, SPLIT_ROWS, UPCOMING, TOURNAMENTS);
const TOUR_COLOR = { elite: "#B8862F", cycle: "#7B5EA7", team: "#3F7A3A", speed: "#D9822B", women: "#C0507A", historic: "#8A7A66" };
const TOUR_LABEL = () => ({ elite: t("슈퍼 토너먼트"), cycle: t("세계선수권 사이클"), team: t("팀 대회"), speed: t("속기·프리스타일·온라인"), women: t("여자 대회"), historic: t("역사적 대회") });
const FREQ_LABEL = () => ({ annual: t("매년"), biennial: t("격년"), oneoff: t("일회성") });
const tourPeriod = (r) => (r.to === r.from ? String(r.from) : r.from + "–" + (r.to == null ? "" : r.to));
const tourPlace = (r) => (r.place === "various" ? t("개최지 매번 변경") : r.place === "online" ? t("온라인") : (lang === "ko" && r.placeKo ? r.placeKo : r.place) + (r.cc ? " (" + r.cc + ")" : ""));
const BY_ID = new Map(CHAMPIONS.map((c) => [c.id, c]));
const LANE_COLOR = { C: T.brass, L: "#5B8DB8", R: "#C0624F" };
const personName = (p) => (lang === "ko" && p.ko ? p.ko : (p.name || p.opp));
const TAG_LABEL = () => ({ PCA: "PCA", FIDE: "FIDE", CLASSIC: t("클래식") });
// "6대 챔피언(1기)" · en "6th (Reign 1)" — 재위가 한 번뿐인 사람은 "(n기)"를 붙이지 않는다.
const numText = (c) => (!c.no ? "" : c.reign ? t("{0}대 챔피언({1}기)", ordinalParam(c.no, lang), c.reign) : t("{0}대 챔피언", ordinalParam(c.no, lang)));
const reignText = (c) => c.from + "–" + (c.to == null ? "" : c.to);
const KIND_LABEL = () => ({ tournament: t("토너먼트"), forfeit: t("몰수승"), split: t("분열"), unify: t("통합전"), knockout: t("녹아웃"), vacated: t("반납") });
const edgeLabel = (tr) => { const k = KIND_LABEL()[tr.kind]; return tr.y + (k ? " · " + k : "") + (tr.score ? " · " + tr.score : ""); };

function CountryChip({ cc, dark }) {
  return <span style={{ fontSize: 9, fontWeight: 800, fontFamily: SITE_FONT, letterSpacing: ".04em", padding: "1px 5px", borderRadius: 5, background: dark ? "rgba(236,203,134,.16)" : "rgba(60,40,20,.08)", color: dark ? T.brassHi : T.inkSoft }}>{cc}</span>;
}

/* 월계수 가지 한 쪽 — 양쪽 모두 잎 끝이 안쪽(이름 쪽)을 향하게 그린다(왼쪽은 side=+1, 오른쪽은 side=-1). 그라데이션은 캔버스의 <MasterDefs/> 한 곳에 있다. */
function Laurel({ side, h = 60 }) {
  const b = React.useMemo(() => laurelBranch({ side, len: 36, leaves: 7, leaf: 7.5 }), [side]);
  const k = h / b.height;
  return (
    <svg width={b.width * k} height={h} viewBox={"0 0 " + b.width + " " + b.height} style={{ overflow: "visible", display: "block" }} aria-hidden="true">
      <path d={b.stem} fill="none" stroke="#8f6a22" strokeWidth="1.4" strokeLinecap="round" />
      {b.leaves.map((l, i) => <path key={i} transform={"translate(" + l.x + " " + l.y + ") rotate(" + l.rot + ")"} d={leafPath(l.sz)} fill="url(#mt-laurel-gold)" stroke="#8f6a22" strokeWidth=".5" />)}
    </svg>
  );
}
function MasterDefs() {
  return (
    <svg width="0" height="0" style={{ position: "absolute" }} aria-hidden="true">
      <defs><linearGradient id="mt-laurel-gold" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="#F6DE97" /><stop offset="1" stopColor="#B98A34" /></linearGradient></defs>
    </svg>
  );
}
/* 챔피언 블록(시안 A) — 금속성 금색 프레임 안의 어두운 명판, 이름 양옆에 월계수. 현 챔피언은 ♛와 금빛 발광. 줄(PCA·클래식/FIDE)은 태그 칩 색으로 구분한다. */
function ChampNode({ n, onPick, picked }) {
  const c = n.champ, current = c.to == null;
  return (
    <button className="press" onClick={() => onPick({ type: "champ", id: c.id })} aria-label={personName(c) + " " + numText(c) + " " + reignText(c)}
      style={{ position: "absolute", left: n.x, top: n.y, width: n.w, height: n.h, boxSizing: "border-box", padding: 0, cursor: "pointer", borderRadius: 14, border: "1.5px solid #6E4E18",
        background: "linear-gradient(135deg,#F7E3A1 0%,#E2B652 28%,#B98A34 52%,#E9C970 74%,#9C7228 100%)",
        boxShadow: "inset 0 1px 0 rgba(255,255,255,.7), inset 0 -2px 3px rgba(80,50,10,.45)," + (picked ? " 0 0 0 3px rgba(255,243,211,.85)," : "") + (current ? " 0 0 18px 4px rgba(236,203,134,.65)," : "") + " 0 4px 10px rgba(60,40,10,.38)" }}>
      <span aria-hidden="true" style={{ position: "absolute", inset: 5, borderRadius: 10, background: "linear-gradient(180deg,#3A2414,#1D1108)", boxShadow: "inset 0 0 0 1px rgba(236,203,134,.55), inset 0 2px 6px rgba(0,0,0,.6)" }} />
      <span style={{ position: "absolute", left: 9, top: "50%", transform: "translateY(-50%)" }}><Laurel side={1} /></span>
      <span style={{ position: "absolute", right: 9, top: "50%", transform: "translateY(-50%)" }}><Laurel side={-1} /></span>
      <span style={{ position: "absolute", inset: 0, padding: "9px 38px 7px", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 3, textAlign: "center", minWidth: 0 }}>
        {c.no && <span style={{ fontSize: 9.5, fontWeight: 900, padding: "1px 8px", borderRadius: 6, background: "linear-gradient(180deg,#F6DE97,#C49A50)", color: "#2A1807", whiteSpace: "nowrap" }}>{numText(c)}</span>}
        <span className="flex items-center justify-center gap-1" style={{ whiteSpace: "nowrap" }}>
          <span style={{ fontSize: 10, fontWeight: 800, color: T.brassHi, fontFamily: SITE_FONT }}>{reignText(c)}</span>
          {c.tag && <span style={{ fontSize: 8.5, fontWeight: 900, padding: "1px 5px", borderRadius: 5, background: LANE_COLOR[n.lane], color: "#fff" }}>{TAG_LABEL()[c.tag]}</span>}
        </span>
        <span style={{ maxWidth: "100%", fontSize: 14.5, fontWeight: 800, lineHeight: 1.2, color: "#FFF3D3", textShadow: "0 1px 0 #000", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{current ? "♛ " : ""}{personName(c)}</span>
      </span>
    </button>
  );
}

/* 오른쪽 대회 열의 대회 카드 — 왼쪽 띠 색이 종류(슈퍼 토너먼트·사이클·팀 …)다. */
function TourNode({ n, onPick, picked }) {
  const r = n.tour, color = TOUR_COLOR[r.type];
  return (
    <button className="press" onClick={() => onPick({ type: "tour", id: r.id })} aria-label={personName(r) + " " + tourPeriod(r)}
      style={{ position: "absolute", left: n.x, top: n.y, width: n.w, height: n.h, boxSizing: "border-box", padding: "6px 10px 6px 16px", textAlign: "left", cursor: "pointer", borderRadius: 11, overflow: "hidden",
        border: "1.5px solid " + (picked ? color : "#DCCBA8"), background: "#fff", color: T.ink, boxShadow: picked ? "0 0 0 3px " + color + "44" : "0 1px 4px rgba(60,40,20,.12)" }}>
      <span aria-hidden="true" style={{ position: "absolute", left: 0, top: 0, bottom: 0, width: 6, background: color }} />
      <div style={{ fontSize: 12.5, fontWeight: 800, lineHeight: 1.18, overflow: "hidden", display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical" }}>{personName(r)}</div>
      <div style={{ marginTop: 2, fontSize: 10, fontWeight: 700, color: T.inkSoft, fontFamily: SITE_FONT, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{tourPeriod(r)} · {tourPlace(r)}</div>
    </button>
  );
}

function SatNode({ n, onPick, picked }) {
  const s = n.sat;
  return (
    <button className="press" onClick={() => onPick({ type: "sat", id: n.id })} aria-label={personName(s) + " " + s.years.join(", ")}
      style={{ position: "absolute", left: n.x, top: n.y, width: n.w, height: n.h, boxSizing: "border-box", padding: "5px 10px", textAlign: "left", cursor: "pointer", borderRadius: 11,
        border: "1.5px solid " + (picked ? T.brass : "#C9B58C"), background: "#fff", color: T.ink, boxShadow: picked ? "0 0 0 3px rgba(196,154,80,.35)" : "0 1px 4px rgba(60,40,20,.12)" }}>
      <div style={{ fontSize: 12.5, fontWeight: 800, lineHeight: 1.2, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{personName(s)}</div>
      <div className="flex items-center justify-between gap-1" style={{ marginTop: 2 }}>
        <span style={{ fontSize: 10, fontWeight: 700, color: T.inkSoft, fontFamily: SITE_FONT }}>{s.years.join(" · ")}</span>
        <CountryChip cc={s.cc} />
      </div>
    </button>
  );
}

function UpcomingNode({ n }) {
  const u = n.upcoming;
  return (
    <div style={{ position: "absolute", left: n.x, top: n.y, width: n.w, height: n.h, boxSizing: "border-box", padding: "5px 10px", borderRadius: 11, border: "2px dashed " + T.brass, background: "rgba(196,154,80,.1)", color: T.ink }}>
      <div className="flex items-center justify-between gap-1">
        <span style={{ fontSize: 9.5, fontWeight: 900, color: T.brass, letterSpacing: ".04em" }}>{t("2026 타이틀전 · 예정")}</span>
        <CountryChip cc={u.cc} />
      </div>
      <div style={{ fontSize: 12.5, fontWeight: 800, marginTop: 2, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{personName(u)}</div>
      <div style={{ fontSize: 10, fontWeight: 700, color: T.inkSoft, fontFamily: SITE_FONT }}>{u.date}</div>
    </div>
  );
}

/* 선택한 노드의 상세 — 챔피언: 획득·상실·방어전 / 도전자: 도전 기록. */
/* 대회 카드 아래 — 역대 우승 기록(입력 자료 + DB 교차확인 ✓), 마스터 대국 DB 요약, DB 집계 결과, 대표 대국(눌러서 보드·리뷰로 열기). 색인(tournamentIndex.json)은 카드를 처음 열 때 지연 로드한다. */
const fmtScore = (n) => (Number.isInteger(n) ? String(n) : n.toFixed(1));
function TourExtra({ r, onOpenGame, onOpenGameAnalyze }) {
  const [idx, setIdx] = useState(null);
  useEffect(() => { let off = false; import("../data/tournamentIndex.json").then((m) => { if (!off) setIdx(m.default || m); }).catch(() => { }); return () => { off = true; }; }, []);
  const info = idx && idx.byId ? idx.byId[r.id] : null;
  const checks = (info && info.winnerCheck) || {};
  const winners = WINNERS[r.id] || [];
  const isTeam = r.type === "team";
  const winName = (n) => (isTeam ? (lang === "ko" && COUNTRY_KO[n] ? COUNTRY_KO[n] : n) : playerName(n, lang));
  const head = (txt) => <div style={{ fontSize: 10.5, fontWeight: 800, color: T.brass, margin: "10px 0 3px" }}>{txt}</div>;
  const rowSty = { fontSize: 12, fontWeight: 600, color: T.ink, lineHeight: 1.5, fontFamily: SITE_FONT };
  const results = info ? [...(info.complete || []).map((x) => ({ ...x, sure: true })), ...(info.partial || []).map((x) => ({ ...x, sure: false }))].sort((a, b) => b.y - a.y) : [];
  const openReview = (g) => onOpenGameAnalyze && onOpenGameAnalyze({ sans: g.m.split(" "), white: { username: dbPlayerName(g.w, "en"), rating: g.we }, black: { username: dbPlayerName(g.b, "en"), rating: g.be } });
  return (
    <div>
      {winners.length > 0 && <>
        {head(WINNER_KIND[r.id] === "titleChanges" ? t("챔피언이 바뀐 해") : t("역대 우승"))}
        <div style={{ maxHeight: 150, overflowY: "auto", paddingRight: 4 }}>
          {[...winners].reverse().map(([y, names]) => (
            <div key={y} style={rowSty}>{y} · {names.map(winName).join(" · ")}{checks[y] === "ok" && <span title={t("마스터 대국 DB의 출전자와 일치")} style={{ marginLeft: 5, fontSize: 9.5, fontWeight: 900, color: T.best }}>✓</span>}</div>
          ))}
        </div>
        <div style={{ fontSize: 9.5, color: T.inkSoft, marginTop: 3 }}>{t("✓ = 마스터 대국 DB 출전자와 대조 확인. 우승 기록은 검수 전 자료")}</div>
      </>}
      {head(t("마스터 대국 DB"))}
      {!idx ? <div style={rowSty}>{t("불러오는 중…")}</div> : !info || !info.games ? <div style={rowSty}>{t("수록된 대국 없음")}</div> : <>
        <div style={rowSty}>{t("대국 {0}판", info.games)} · {info.y0}{info.y1 !== info.y0 ? "–" + info.y1 : ""}</div>
        {info.players.length > 0 && <div style={{ ...rowSty, fontSize: 11.5 }}>{t("최다 출전")}: {info.players.map(([n, c]) => dbPlayerName(n, lang) + " (" + c + ")").join(" · ")}</div>}
        <div style={{ fontSize: 9.5, color: T.inkSoft, marginTop: 2 }}>{t("DB에는 일부 대국만 수록되어 실제 대회보다 적음")}</div>
        {results.length > 0 && <>
          {head(t("DB 집계 결과"))}
          {results.map((x) => <div key={x.y} style={rowSty}>{x.y} · {x.winners.map((n) => dbPlayerName(n, lang)).join(" · ")} ({fmtScore(x.score)}) · <span style={{ color: x.sure ? T.best : T.inkSoft, fontWeight: 800 }}>{x.sure ? t("확정") : t("참고") + " " + x.cov + "%"}</span></div>)}
          <div style={{ fontSize: 9.5, color: T.inkSoft, marginTop: 2 }}>{t("확정 = 모든 대국이 DB에 있음. 참고 = 일부 대국 누락")}</div>
        </>}
        {info.top.length > 0 && <>
          {head(t("대표 대국"))}
          {info.top.map((g) => (
            <div key={g.id} className="flex items-center gap-1" style={{ ...rowSty, fontSize: 11, marginBottom: 3 }}>
              <button onClick={() => onOpenGame && onOpenGame(g.m.split(" "))} className="press" style={{ flex: 1, minWidth: 0, textAlign: "left", background: "#fff", border: "1px solid #E4D5B6", borderRadius: 8, padding: "4px 7px", cursor: "pointer", color: T.ink, fontFamily: SITE_FONT, fontSize: 11, fontWeight: 600, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                {g.y} · {dbPlayerName(g.w, lang)} {g.we ? "(" + g.we + ")" : ""} – {dbPlayerName(g.b, lang)} {g.be ? "(" + g.be + ")" : ""} · {g.r}
              </button>
              <button onClick={() => openReview(g)} className="press" style={{ flexShrink: 0, fontSize: 10, fontWeight: 800, padding: "4px 7px", borderRadius: 8, border: "1px solid #C9B58C", background: "transparent", color: T.inkSoft, cursor: "pointer" }}>{t("리뷰")}</button>
            </div>
          ))}
        </>}
      </>}
    </div>
  );
}

function DetailCard({ pick, onClose, onOpenGame, onOpenGameAnalyze }) {
  let title = "", sub = "", cc = "", rows = [], blocks = [];
  if (pick.type === "champ") {
    const c = BY_ID.get(pick.id);
    title = personName(c); sub = lang === "ko" ? c.name : ""; cc = c.cc;
    const ins = TRANSFERS.filter((x) => x.to === c.id && !x.loser && x.kind !== "vacated"), outs = TRANSFERS.filter((x) => x.from === c.id && x.kind !== "split");
    blocks.push({ head: t("재위"), lines: [(c.no ? numText(c) : t("FIDE 세계 챔피언(분열기)")), reignText(c) + (c.tag ? " · " + TAG_LABEL()[c.tag] : "")] });
    if (ins.length) blocks.push({ head: t("타이틀 획득"), lines: ins.map((x) => edgeLabel(x) + " · " + personName(BY_ID.get(x.from))) });
    if (c.defenses.length) blocks.push({ head: t("타이틀전 기록"), lines: c.defenses.map((d) => d.y + " · " + personName(d) + " · " + d.score + (d.won ? " · " + t("등극") : d.draw ? " · " + t("무승부") : d.tourney ? " · " + t("토너먼트") : "")) });
    if (outs.length) blocks.push({ head: t("타이틀 상실"), lines: outs.map((x) => edgeLabel(x) + " · " + personName(BY_ID.get(x.to))) });
    if (c.to == null) blocks.push({ head: t("다음 타이틀전"), lines: [UPCOMING.date + " · " + personName(UPCOMING)] });
  } else if (pick.type === "tour") {
    const r = TOURNAMENTS.find((x) => x.id === pick.id), at = championAt(CHAMPIONS, r.from);
    title = personName(r); sub = lang === "ko" ? r.name : ""; cc = r.cc;
    blocks.push({ head: t("종류"), lines: [TOUR_LABEL()[r.type] + (r.freq ? " · " + FREQ_LABEL()[r.freq] : "")] });
    blocks.push({ head: t("기간"), lines: [tourPeriod(r)] });
    blocks.push({ head: t("개최지"), lines: [tourPlace(r)] });
    blocks.push({ head: t("개최 당시 세계 챔피언"), lines: [at ? personName(at) + (at.no ? " · " + numText(at) : "") : t("공위기")] });
  } else {
    const n = LAYOUT.byNodeId.get(pick.id), s = n.sat, c = BY_ID.get(n.champId);
    title = personName(s); sub = lang === "ko" ? s.name : ""; cc = s.cc;
    blocks.push({ head: t("세계선수권 도전 기록"), lines: s.matches.map((d) => d.y + " · " + personName(c) + " · " + d.score + (d.draw ? " · " + t("무승부") : d.tourney ? " · " + t("토너먼트") : " · " + t("패"))) });
  }
  return (
    <div className="no-pan" onPointerDown={(e) => e.stopPropagation()} role="dialog" aria-label={title}
      style={{ position: "absolute", top: 44, right: 8, zIndex: 65, width: pick.type === "tour" ? 340 : 290, maxWidth: "calc(100% - 16px)", maxHeight: "calc(100% - 56px)", overflowY: "auto", borderRadius: 14, background: T.paper, border: "1px solid #DCCBA8", boxShadow: "0 12px 30px -8px rgba(0,0,0,.45)", padding: 14 }}>
      <div className="flex items-start justify-between gap-2" style={{ marginBottom: 8 }}>
        <div style={{ minWidth: 0 }}>
          <div style={{ fontSize: 16, fontWeight: 800, color: T.ink, lineHeight: 1.25 }}>{title}</div>
          {sub && <div style={{ fontSize: 11, color: T.inkSoft, fontFamily: SITE_FONT, marginTop: 1 }}>{sub}</div>}
        </div>
        <div className="flex items-center gap-1" style={{ flexShrink: 0 }}>
          {cc ? <CountryChip cc={cc} /> : null}
          <button onClick={onClose} aria-label={t("닫기")} className="press" style={{ width: 24, height: 24, borderRadius: 7, background: T.ebony2, color: T.ivory, border: "1px solid #000", cursor: "pointer", display: "inline-flex", alignItems: "center", justifyContent: "center" }}><X size={13} /></button>
        </div>
      </div>
      {blocks.map((b, i) => (
        <div key={i} style={{ marginTop: i ? 10 : 0 }}>
          <div style={{ fontSize: 10.5, fontWeight: 800, color: T.brass, marginBottom: 3 }}>{b.head}</div>
          {(b.lines || []).map((l, j) => <div key={j} style={{ fontSize: 12, fontWeight: 600, color: T.ink, lineHeight: 1.5, fontFamily: SITE_FONT }}>{l}</div>)}
        </div>
      ))}
      {pick.type === "tour" && <TourExtra r={TOURNAMENTS.find((x) => x.id === pick.id)} onOpenGame={onOpenGame} onOpenGameAnalyze={onOpenGameAnalyze} />}
      {pick.type !== "tour" && <div style={{ fontSize: 9.5, color: T.inkSoft, marginTop: 12 }}>{t("점수는 챔피언–도전자 순. 괄호는 타이브레이크")}</div>}
    </div>
  );
}

export function MastersSchematic({ vertical, tabsSlot, onOpenGame, onOpenGameAnalyze }) {
  const boxRef = useRef(null);
  const panelH = useFitPanelHeight(boxRef, vertical);
  // (v0.6.3, 사용자 요청) 예전 75% 배율이 새 100%(MASTER_ZOOM_LABEL_BASE)다 — 데스크톱·모바일 모두 이 배율로 시작한다.
  const baseZ = MASTER_ZOOM_LABEL_BASE;
  const [view, setView] = useState({ x: 0, y: 0, z: baseZ });
  const viewRef = useRef(view); viewRef.current = view;
  const [pick, setPick] = useState(null);
  const dragRef = useRef(null), movedRef = useRef(false);
  const rect = () => (boxRef.current ? boxRef.current.getBoundingClientRect() : { width: 640, height: 640, left: 0, top: 0 });
  const clamp = (p, z) => { const r = rect(); return clampMasterPan(p, z, r.width, r.height, LAYOUT); };
  const apply = useCallback((p, z) => setView({ ...clamp(p, z), z }), []); // eslint-disable-line react-hooks/exhaustive-deps
  const zoomBy = useCallback((dz, ax, ay) => {
    const v = viewRef.current, r = rect(), nz = snapMasterZoom(v.z + dz); if (nz === v.z) return;
    const a = anchoredZoomPan(v, v.z, nz, ax != null ? ax : r.width / 2, ay != null ? ay : r.height / 2);
    apply(a, nz);
  }, [apply]);
  const toTop = useCallback(() => { const r = rect(), z = viewRef.current.z; apply({ x: r.width / 2 - (LAYOUT.width / 2) * z, y: 0 }, z); }, [apply]);
  useLayoutEffect(() => { toTop(); }, [panelH]); // eslint-disable-line react-hooks/exhaustive-deps
  // 휠은 세로 이동, Ctrl/⌘+휠은 확대·축소(브라우저 페이지 스크롤은 막는다 — 네이티브 리스너로 passive:false).
  useEffect(() => {
    const el = boxRef.current; if (!el) return undefined;
    const onWheel = (e) => {
      e.preventDefault();
      const v = viewRef.current;
      if (e.ctrlKey || e.metaKey) { const r = el.getBoundingClientRect(); zoomBy(e.deltaY < 0 ? MASTER_ZOOM_STEP : -MASTER_ZOOM_STEP, e.clientX - r.left, e.clientY - r.top); return; }
      apply({ x: v.x - e.deltaX, y: v.y - e.deltaY }, v.z);
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, [apply, zoomBy]);
  // 포인터: 한 손가락·마우스는 끌기(이동), 두 손가락은 핀치 확대·축소(오프닝 트리와 같은 방식 — 값은 25%p 단계로 스냅).
  const pointersRef = useRef(new Map()), pinchRef = useRef(null);
  const localPt = (e) => { const r = rect(); return { x: e.clientX - r.left, y: e.clientY - r.top }; };
  const startPinch = () => {
    const pts = [...pointersRef.current.values()], v = viewRef.current;
    const mid = { x: (pts[0].x + pts[1].x) / 2, y: (pts[0].y + pts[1].y) / 2 };
    pinchRef.current = { dist: Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y) || 1, zoom: v.z, content: { x: (mid.x - v.x) / v.z, y: (mid.y - v.y) / v.z } };
    dragRef.current = null; movedRef.current = true;   // 핀치가 끝나도 그 손가락 떼기가 노드 클릭으로 새지 않게
  };
  const onPointerDown = (e) => {
    if (e.target.closest && e.target.closest(".no-pan")) return;
    pointersRef.current.set(e.pointerId, localPt(e));
    if (pointersRef.current.size === 2) { for (const id of pointersRef.current.keys()) { try { e.currentTarget.setPointerCapture(id); } catch { } } startPinch(); return; }
    if (pointersRef.current.size > 2) return;
    // 노드 위에서도 끌 수 있게 노드는 no-pan이 아니다. 포인터 캡처는 실제로 끌기가 시작될 때만 건다(누르자마자 걸면 노드 클릭이 캔버스로 넘어가 사라진다).
    dragRef.current = { px: e.clientX, py: e.clientY, vx: viewRef.current.x, vy: viewRef.current.y }; movedRef.current = false;
  };
  const onPointerMove = (e) => {
    if (pointersRef.current.has(e.pointerId)) pointersRef.current.set(e.pointerId, localPt(e));
    if (pinchRef.current && pointersRef.current.size >= 2) {
      const pts = [...pointersRef.current.values()], pr = pinchRef.current;
      const mid = { x: (pts[0].x + pts[1].x) / 2, y: (pts[0].y + pts[1].y) / 2 };
      const dist = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y) || 1;
      const nz = snapMasterZoom(pr.zoom * dist / pr.dist);
      apply({ x: mid.x - pr.content.x * nz, y: mid.y - pr.content.y * nz }, nz);
      return;
    }
    const d = dragRef.current; if (!d) return;
    const dx = e.clientX - d.px, dy = e.clientY - d.py;
    if (!movedRef.current && Math.hypot(dx, dy) < 4) return;
    if (!movedRef.current) { try { e.currentTarget.setPointerCapture(e.pointerId); } catch { } }
    movedRef.current = true; apply({ x: d.vx + dx * SCHEMATIC_DRAG_MULT, y: d.vy + dy * SCHEMATIC_DRAG_MULT }, viewRef.current.z);
  };
  const onPointerUp = (e) => {
    if (e && e.pointerId != null) pointersRef.current.delete(e.pointerId);
    if (pinchRef.current) {
      if (pointersRef.current.size < 2) pinchRef.current = null;
      // 한 손가락이 남으면 그 손가락으로 이어서 끌 수 있게 기준점을 다시 잡는다.
      if (pointersRef.current.size === 1) { const [pt] = [...pointersRef.current.values()], r = rect(); dragRef.current = { px: pt.x + r.left, py: pt.y + r.top, vx: viewRef.current.x, vy: viewRef.current.y }; movedRef.current = true; }
      return;
    }
    dragRef.current = null;
  };
  const { nodes, edges, width, height } = LAYOUT;
  const champEdges = edges.filter((e) => e.kind === "transfer");
  return (
    <div>
      {tabsSlot && <div style={{ marginBottom: 8 }}>{tabsSlot}</div>}
      <div ref={boxRef} onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={onPointerUp} onPointerCancel={onPointerUp} onClickCapture={(e) => { if (movedRef.current) { e.stopPropagation(); e.preventDefault(); movedRef.current = false; } }}
        style={{ position: "relative", overflow: "hidden", overscrollBehavior: "contain", height: panelH, borderRadius: 12, border: "1px solid #DCCBA8", touchAction: "none", userSelect: "none", WebkitUserSelect: "none", cursor: dragRef.current ? "grabbing" : "grab",
          background: "repeating-linear-gradient(45deg, rgba(196,154,80,.09) 0, rgba(196,154,80,.09) 1px, transparent 1px, transparent 26px), repeating-linear-gradient(-45deg, rgba(196,154,80,.09) 0, rgba(196,154,80,.09) 1px, transparent 1px, transparent 26px), #FBF5E8" }}>
        <div className="no-pan flex" style={{ position: "absolute", top: 6, right: 6, zIndex: 60, gap: 3, background: "rgba(255,255,255,.9)", borderRadius: 8, border: "1px solid #DCCBA8", padding: 2 }}>
          <button onClick={() => zoomBy(-MASTER_ZOOM_STEP)} title={t("축소")} style={{ width: 22, height: 22, borderRadius: 6, border: "none", background: "transparent", color: T.inkSoft, fontWeight: 900, cursor: "pointer", fontSize: 14 }}>－</button>
          <button onClick={() => zoomBy(baseZ - viewRef.current.z)} title={t("초기화")} style={{ padding: "0 6px", height: 22, borderRadius: 6, border: "none", background: "transparent", color: T.inkSoft, fontWeight: 800, cursor: "pointer", fontSize: 9.5, fontFamily: SITE_FONT }}>{masterZoomLabel(view.z)}</button>
          <button onClick={() => zoomBy(MASTER_ZOOM_STEP)} title={t("확대")} style={{ width: 22, height: 22, borderRadius: 6, border: "none", background: "transparent", color: T.inkSoft, fontWeight: 900, cursor: "pointer", fontSize: 14 }}>＋</button>
        </div>
        <div style={{ position: "absolute", left: 0, top: 0, width, height, transform: "translate(" + view.x + "px," + view.y + "px) scale(" + view.z + ")", transformOrigin: "0 0", willChange: "transform" }}>
          <MasterDefs />
          <svg width={width} height={height} style={{ position: "absolute", left: 0, top: 0, pointerEvents: "none", overflow: "visible" }}>
            {edges.filter((e) => e.kind === "sat").map((e, i) => {
              const a = e.a, b = e.b, ay = a.y + a.h / 2, by = b.y + b.h / 2;
              const ax = e.side === "L" ? a.x : a.x + a.w, bx = e.side === "L" ? b.x + b.w : b.x;
              return <line key={"s" + i} x1={ax} y1={ay} x2={bx} y2={by} stroke="#C9B58C" strokeWidth={1.6} />;
            })}
            {LAYOUT.rail && <line x1={LAYOUT.rail.x} y1={LAYOUT.rail.y1} x2={LAYOUT.rail.x} y2={LAYOUT.rail.y2} stroke="#DCCBA8" strokeWidth={3} strokeLinecap="round" />}
            {LAYOUT.rail && nodes.filter((n) => n.kind === "tour").map((n) => <g key={"r" + n.id}><line x1={LAYOUT.rail.x} y1={n.y + n.h / 2} x2={n.x} y2={n.y + n.h / 2} stroke="#DCCBA8" strokeWidth={2} /><circle cx={LAYOUT.rail.x} cy={n.y + n.h / 2} r={5} fill={TOUR_COLOR[n.tour.type]} stroke="#fff" strokeWidth={1.5} /></g>)}
            {edges.filter((e) => e.kind === "upcoming").map((e, i) => { const p = transferPath(e.a, e.b); return <path key={"u" + i} d={p.d} fill="none" stroke={T.brass} strokeWidth={2} strokeDasharray="5 5" />; })}
            {champEdges.map((e, i) => {
              const p = transferPath(e.a, e.b), lane = e.b.lane !== "C" ? e.b.lane : e.a.lane;
              return <path key={"t" + i} d={p.d} fill="none" stroke={e.t.loser ? "#C9B58C" : LANE_COLOR[lane] || T.brass} strokeWidth={3} strokeLinecap="round" strokeDasharray={e.t.loser ? "6 6" : undefined} />;
            })}
          </svg>
          {champEdges.filter((e) => !e.t.loser && (e.t.score || e.t.kind !== "match")).map((e, i) => {
            const p = transferPath(e.a, e.b);
            return <span key={"l" + i} style={{ position: "absolute", left: p.lx, top: p.ly, transform: "translate(-50%,-50%)", fontSize: 10.5, fontWeight: 800, fontFamily: SITE_FONT, whiteSpace: "nowrap", padding: "2px 8px", borderRadius: 999, background: "#fff", border: "1px solid #DCCBA8", color: T.ink, boxShadow: "0 1px 3px rgba(60,40,20,.15)" }}>{edgeLabel(e.t)}</span>;
          })}
          {LAYOUT.labels.map((l) => (
            <div key={"label-" + l.key} style={{ position: "absolute", left: l.x, top: l.y, width: l.w, height: l.h, display: "flex", alignItems: "center", justifyContent: "center", pointerEvents: "none", zIndex: 3 }}>
              <span style={{ fontFamily: "Georgia,'Noto Serif KR',serif", fontStyle: "italic", fontWeight: 700, fontSize: 16, letterSpacing: .2, whiteSpace: "nowrap", background: "linear-gradient(180deg,#F3DFAE,#C49A50 55%,#8A6C2F)", WebkitBackgroundClip: "text", backgroundClip: "text", color: "transparent", filter: "drop-shadow(0 1px 1px rgba(0,0,0,.35))" }}>
                ✦ {l.key === "champs" ? t("역대 세계 챔피언") : t("주요 대회")} ✦
              </span>
            </div>
          ))}
          {nodes.map((n) => n.kind === "champ" ? <ChampNode key={n.id} n={n} onPick={setPick} picked={pick && pick.id === n.id} />
            : n.kind === "tour" ? <TourNode key={n.id} n={n} onPick={setPick} picked={pick && pick.id === n.tour.id} />
            : n.kind === "sat" ? <SatNode key={n.id} n={n} onPick={setPick} picked={pick && pick.id === n.id} /> : <UpcomingNode key={n.id} n={n} />)}
        </div>
        {pick && <DetailCard pick={pick} onClose={() => setPick(null)} onOpenGame={onOpenGame} onOpenGameAnalyze={onOpenGameAnalyze} />}
      </div>
      <div className="flex items-center gap-3" style={{ marginTop: 8, flexWrap: "wrap", fontSize: 10.5, fontWeight: 700, color: T.inkSoft }}>
        {Object.keys(TOUR_COLOR).map((k) => <span key={k} className="flex items-center gap-1"><span style={{ width: 9, height: 9, borderRadius: 3, background: TOUR_COLOR[k] }} />{TOUR_LABEL()[k]}</span>)}
        <span style={{ opacity: .4 }}>|</span>
        {[["C", t("정통 계보")], ["L", t("PCA·클래식(1993–2006)")], ["R", t("FIDE(1993–2006)")]].map(([k, lb]) => (
          <span key={k} className="flex items-center gap-1"><span style={{ width: 14, height: 4, borderRadius: 2, background: LANE_COLOR[k] }} />{lb}</span>
        ))}
      </div>
    </div>
  );
}
