import React, { useState, useEffect, useMemo, useRef } from "react";
import { Search } from "lucide-react";
import { T } from "../lib/theme.js";
import { SITE_FONT } from "../components/engineLines.jsx";
import { drawKindLabel } from "../lib/chessRules.js";
import { chessTcCategory } from "../lib/chessRating.js";
import { SB_ON, sbSelect } from "../lib/supabaseClient.js";
import { BestMoveJumpButton, ListPager } from "../components/uiPrimitives.jsx";
import { TIME_CLASS_LABEL, fmtFull, openingNameOf, usersProfiles } from "./common.jsx";
import { t, tx } from "../lib/i18n.js";

// (v0.6.2) chess.com 대국 통계(AccountChessStats)의 필터·전적·"최근 대국" UI를 공용으로 뺀 것 — chess.com 통계와 OpenChess 일반 대국 기록이 같은 컴포넌트를 쓴다.
// 대국 객체 형태는 chess.com 쪽과 같다: { moves, color: "w"|"b", result: "win"|"loss"|"draw", timeClass, endTime(초), rating, white/black: { username, rating }, opening, id }.

// (v0.2.6 기능) 기간별 레이팅 변동 그래프 — 지금 필터(시간 규정·흑/백)가 적용된 대국들을 시간순으로
// 이어 선 그래프로 보여준다. 최근 1주/1달/6개월/1년 중 고를 수 있는 기간 필터를 추가로 얹는다(위
// 시간 규정·흑백 필터와는 별개 축). 대국이 아예 없으면 표시하지 않고, 고른 기간 안에 대국이 2판
// 미만이면(선을 그릴 수 없음) 버튼은 그대로 둔 채 안내 문구만 보여준다.
const RATING_CHART_PERIODS = [
  { key: "1d", label: t("1일"), days: 1 },
  { key: "7d", label: t("1주"), days: 7 },
  { key: "30d", label: t("1달"), days: 30 },
  { key: "180d", label: t("6개월"), days: 182 },
  { key: "365d", label: t("1년"), days: 365 },
];
// (v0.2.6 버그 수정) 위 시간 규정 필터가 "전체"일 때 이 그래프가 래피드/블리츠/불릿 대국을 시간순으로
// 그냥 한 줄에 뒤섞어 그리고 있었다 — 세 시간 규정은 레이팅 체계 자체가 서로 달라(보통 래피드>블리츠>
// 불릿 순으로 값 자체가 다름) 뒤섞은 선은 오르내림이 실제 실력 변화가 아니라 그날 어떤 시간 규정을
// 뒀는지에 따라 요동치는, 사실상 의미 없는 그래프였다. "전체"일 때는 세 시간 규정을 각자 다른 색의
// 선으로 같은 그래프 위에 겹쳐 그리고 범례를 달아 구분하고(대국이 2판 이상 있는 시간 규정만), 특정
// 시간 규정 하나로 좁혀져 있을 때는 기존처럼 그 하나만 선 아래 영역 채우기와 함께 보여준다.
// (v0.2.6 UI) 색을 빛의 삼원색(RGB)에 가깝게 골랐다 — 아래 영역 채우기에 mix-blend-mode:screen
// (가산혼합)을 걸어, 두 색이 겹치는 자리는 그 둘을 섞은 밝은 색으로, 세 색이 다 겹치는 자리는 흰색에
// 가깝게 빛나 보인다. 특정 시간 규정 하나만 볼 때도 이제 평가치 등락 색 대신 이 색으로 고정해, 어느
// 화면에서 보든 같은 시간 규정은 항상 같은 색으로 알아볼 수 있게 했다.
const TIME_CLASS_CHART_COLOR = { rapid: "#FF3B30", blitz: "#34C759", bullet: "#0A84FF", standard: "#FF9F0A" };   // (v0.6.2) 스탠다드는 OpenChess 일반 대국 전용
// (버그 수정) "전체" 모드는 x좌표를 실제 시간(time-based)으로 잡는데, 대국이 적은 시간 규정(예:
// 블리츠 딱 2판)은 그 두 판이 실제로 짧은 시간 안에 몰려 있으면 전체 기간 폭 안에서 거의 한 점처럼
// 뭉쳐, 선이 그냥 수직으로 선 하나만 있는 것처럼 보였다(양옆으로 이어지는 선이 전혀 없으므로). 실제
// 대국 구간 앞뒤로 그 시점의 레이팅을 유지한 채 기간의 시작(cutoff)·끝(nowT)까지 수평으로 이어
// 붙여, 항상 기간 전체 폭을 채우는 선(대국이 있는 구간만 오르내리고 나머지는 평평)으로 보이게 한다.
function extendToPeriodEdges(points, cutoff, nowT) {
  if (!points.length) return points;
  const out = points.slice();
  if (out[0].endTime > cutoff) out.unshift({ endTime: cutoff, rating: out[0].rating });
  if (out[out.length - 1].endTime < nowT) out.push({ endTime: nowT, rating: out[out.length - 1].rating });
  return out;
}
// (v0.2.6 기능) 리뷰 페이지 EvalGraph와 같은 방식의 드래그 크로스헤어를 얹었다 — 그래프를 누른 채
// 좌우로 끌면(포인터 캡처) 그 x좌표에 해당하는 지점의 날짜·레이팅을 점선+역삼각형+말풍선으로 보여준다.
// "전체"(여러 시간 규정 동시 표시) 모드에서는 x좌표가 시간 값이라, 시리즈마다 그 시간에 가장 가까운
// 자기 지점을 각자 찾아 말풍선에 함께 나열한다.
export function RatingHistoryChart({ games, timeFilter, stillFetching }) {
  const allPoints = useMemo(() => [...games].filter((g) => g.rating != null && g.endTime).sort((a, b) => (a.endTime || 0) - (b.endTime || 0)), [games]);
  const [period, setPeriod] = useState("180d");
  const [dragFrac, setDragFrac] = useState(null);
  const wrapRef = useRef(null);
  const draggingRef = useRef(false);
  // (버그 수정) 대국이 아주 많은 계정은 달(月)을 배치로 병렬 로드해도 전체 기록을 다 받기까지 시간이
  // 걸린다 — 아직 로딩 중인데 이 시간 규정의 대국을 하나도 못 찾았다고 "그래프가 안 그려지는 버그"로
  // 오해하기 쉽다(예: 최근엔 안 둔 시간 규정이 사실은 더 최근 달에 있는데 아직 그 달을 못 받은 경우).
  // 로딩 중엔 아예 숨기는 대신 "불러오는 중" 안내를 보여준다.
  if (!allPoints.length) return stillFetching ? <div style={{ padding: "10px 12px", fontSize: 11, color: T.inkSoft }}>{t("대국 기록 로드 중…")}</div> : null;
  const periodDef = RATING_CHART_PERIODS.find((p) => p.key === period) || RATING_CHART_PERIODS[2];
  const cutoff = Date.now() / 1000 - periodDef.days * 86400;
  const inPeriod = allPoints.filter((g) => g.endTime >= cutoff);
  // (v0.2.6 UI) 그래프를 더 크게(320x120 → 360x210), 축 기준선도 더 촘촘하게(y 3단 → 5단, x축
  // 세로 기준선 신규) 다시 그렸다.
  const W = 360, H = 210, padL = 40, padR = 12, padT = 14, padB = 26;
  const plotW = W - padL - padR, plotH = H - padT - padB;
  const fmtAxisDate = (t) => { const dt = new Date(t * 1000); return (dt.getMonth() + 1) + "/" + dt.getDate(); };
  const isAll = timeFilter === "all";
  const jumpToClientX = (clientX) => {
    if (!wrapRef.current) return;
    const rect = wrapRef.current.getBoundingClientRect();
    if (!rect.width) return;
    setDragFrac(Math.max(0, Math.min(1, (clientX - rect.left) / rect.width)));
  };
  // (버그 수정) 드래그가 SVG 안의 축 라벨(<text>) 위를 지나가면 브라우저 기본 텍스트 선택이
  // 함께 시작돼, 크로스헤어 대신 파란 텍스트 선택 영역이 생기며 드래그 자체가 씹혔다 —
  // preventDefault로 마우스 드래그의 기본 선택 동작을 막고, CSS로도 선택을 비활성화한다.
  const onPointerDown = (e) => { e.preventDefault(); draggingRef.current = true; try { e.currentTarget.setPointerCapture(e.pointerId); } catch { /* noop */ } jumpToClientX(e.clientX); };
  const onPointerMove = (e) => { if (draggingRef.current) jumpToClientX(e.clientX); };
  const onPointerUp = (e) => { draggingRef.current = false; setDragFrac(null); try { e.currentTarget.releasePointerCapture(e.pointerId); } catch { /* noop */ } };
  const dragX = dragFrac != null ? dragFrac * W : null;
  // (v0.2.6 UI) 말풍선이 역삼각형 마커·점선을 가리지 않도록, 크로스헤어가 그래프 오른쪽 절반에
  // 있으면 말풍선을 좌하단에, 왼쪽 절반에 있으면 우하단에 붙여 옆으로 비켜서게 한다.
  const tooltipPos = (x) => {
    const rightHalf = x / W > 0.5;
    const leftPct = (x / W) * 100;
    const gap = 3;
    const anchorPct = rightHalf ? Math.max(6, leftPct - gap) : Math.min(94, leftPct + gap);
    return { left: anchorPct + "%", top: "56%", transform: rightHalf ? "translate(-100%, 0)" : "translate(0, 0)" };
  };
  const yTicks = (min, max) => [0, 0.25, 0.5, 0.75, 1].map((f) => Math.round(min + (max - min) * f));
  const xFracTicks = [0, 0.2, 0.4, 0.6, 0.8, 1];
  const emptyMsg = <div style={{ height: 150, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11, color: T.inkSoft }}>{stillFetching ? t("대국 기록 추가 로드 중…") : t("이 기간 대국 부족")}</div>;
  let body;
  if (isAll) {
    // (기능) 이 기간에 그 시간 규정 대국이 없어도(전체 기록엔 있으면) 마지막 대국 당시 레이팅(=현재
    // 레이팅)을 기간 전체에 걸친 평평한 선으로 이어 보여준다 — "기록이 없으니 그래프가 사라짐" 대신
    // "최근 그 값에서 머물러 있음"을 보여주기 위함.
    const nowT = Date.now() / 1000;
    const series = ["rapid", "blitz", "bullet", "standard"].map((k) => {
      const periodPts = inPeriod.filter((g) => g.timeClass === k);
      if (periodPts.length >= 2) return { key: k, label: TIME_CLASS_LABEL[k], color: TIME_CLASS_CHART_COLOR[k], points: extendToPeriodEdges(periodPts, cutoff, nowT), flat: false };
      const allForClass = allPoints.filter((g) => g.timeClass === k);
      if (!allForClass.length) return null;
      const lastRating = allForClass[allForClass.length - 1].rating;
      return { key: k, label: TIME_CLASS_LABEL[k], color: TIME_CLASS_CHART_COLOR[k], points: [{ endTime: cutoff, rating: lastRating }, { endTime: nowT, rating: lastRating }], flat: true };
    }).filter(Boolean);
    if (!series.length) {
      body = emptyMsg;
    } else {
      const allRatings = series.flatMap((s) => s.points.map((g) => g.rating));
      const min = Math.min(...allRatings), max = Math.max(...allRatings);
      const span = Math.max(1, max - min);
      const allTimes = series.flatMap((s) => s.points.map((g) => g.endTime));
      const tMin = Math.min(...allTimes), tMax = Math.max(...allTimes);
      const tSpan = Math.max(1, tMax - tMin);
      const xAt = (t) => padL + ((t - tMin) / tSpan) * plotW;
      const yAt = (r) => padT + plotH - ((r - min) / span) * plotH;
      // 드래그 중인 x좌표(시간)에서 시리즈마다 가장 가까운 지점을 각자 찾는다.
      const dragT = dragX != null ? tMin + ((dragX - padL) / plotW) * tSpan : null;
      const nearest = dragT != null ? series.map((s) => {
        let best = s.points[0], bestDiff = Infinity;
        for (const g of s.points) { const d = Math.abs(g.endTime - dragT); if (d < bestDiff) { bestDiff = d; best = g; } }
        return { key: s.key, label: s.label, color: s.color, point: best };
      }) : null;
      body = (
        <>
          <div ref={wrapRef} className="no-pan" onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={onPointerUp} onPointerCancel={onPointerUp}
            style={{ position: "relative", touchAction: "none", cursor: "ew-resize", userSelect: "none", WebkitUserSelect: "none" }}>
            {dragX != null && <div aria-hidden style={{ position: "absolute", top: -1, left: (dragX / W) * 100 + "%", transform: "translateX(-50%)", width: 0, height: 0, borderLeft: "5px solid transparent", borderRight: "5px solid transparent", borderTop: "7px solid " + T.brassHi, pointerEvents: "none", zIndex: 2 }} />}
            {nearest && (
              <div style={{ position: "absolute", ...tooltipPos(dragX), background: "#14100C", border: "1px solid rgba(255,255,255,.15)", borderRadius: 8, padding: "5px 8px", fontSize: 9.5, color: T.ivory, whiteSpace: "nowrap", pointerEvents: "none", zIndex: 3, boxShadow: "0 4px 12px rgba(0,0,0,.5)" }}>
                <div style={{ fontWeight: 800, marginBottom: 2, color: T.brassHi }}>{fmtAxisDate(dragT)}</div>
                {nearest.map((s) => (
                  <div key={s.key} style={{ display: "flex", alignItems: "center", gap: 4 }}>
                    <span aria-hidden style={{ width: 6, height: 6, borderRadius: 999, background: s.color, display: "inline-block", flexShrink: 0 }} />
                    {s.label} <b style={{ fontFamily: SITE_FONT }}>{s.point.rating}</b>
                  </div>
                ))}
              </div>
            )}
            <svg viewBox={"0 0 " + W + " " + H} style={{ display: "block", width: "100%", height: "auto", aspectRatio: W + " / " + H }}>
              <rect x="0" y="0" width={W} height={H} fill="#211A13" rx="8" />
              {yTicks(min, max).map((r, i) => (
                <g key={i}>
                  <line x1={padL} x2={W - padR} y1={yAt(r)} y2={yAt(r)} stroke="rgba(255,255,255,.08)" strokeWidth={1} />
                  <text x={padL - 4} y={yAt(r) + 3} fontSize={8} textAnchor="end" fill="#B8A98C">{r}</text>
                </g>
              ))}
              {xFracTicks.slice(1, -1).map((f, i) => (
                <line key={i} x1={padL + f * plotW} x2={padL + f * plotW} y1={padT} y2={padT + plotH} stroke="rgba(255,255,255,.06)" strokeWidth={1} />
              ))}
              <line x1={padL} x2={padL} y1={padT} y2={padT + plotH} stroke="rgba(255,255,255,.3)" strokeWidth={1} />
              <line x1={padL} x2={W - padR} y1={padT + plotH} y2={padT + plotH} stroke="rgba(255,255,255,.3)" strokeWidth={1} />
              {/* (v0.2.6 기능) 세 시리즈 모두 선 아래 반투명 영역을 채우고, isolate된 그룹 안에서
                  mix-blend-mode:screen(가산혼합)으로 겹쳐 — 두 색이 겹치면 둘을 섞은 밝은 색, 세 색이
                  다 겹치면 흰색에 가깝게 빛난다(빛의 삼원색 원리). */}
              <g style={{ isolation: "isolate" }}>
                {series.map((s) => {
                  const lineD = s.points.map((g, i) => (i === 0 ? "M" : "L") + xAt(g.endTime).toFixed(1) + "," + yAt(g.rating).toFixed(1)).join(" ");
                  const areaD = lineD + " L" + xAt(s.points[s.points.length - 1].endTime).toFixed(1) + "," + (padT + plotH) + " L" + xAt(s.points[0].endTime).toFixed(1) + "," + (padT + plotH) + " Z";
                  // (버그 수정) opacity를 너무 낮게(0.55) 두면 screen 블렌드가 배경과 다시 섞이며
                  // 밝아지는 정도가 옅어져 겹치는 자리가 탁한 카키색으로 보였다 — 그렇다고 너무
                  // 높이면(0.88) 반투명한 느낌 없이 거의 불투명한 색 블록처럼 보인다. 0.7 정도가
                  // 바닥까지 은은하게 비치면서도 겹침 구간은 여전히 또렷하게 밝아지는 절충점이다.
                  return <path key={s.key} d={areaD} fill={s.color} opacity={0.7} stroke="none" style={{ mixBlendMode: "screen" }} />;
                })}
              </g>
              {series.map((s) => (
                <path key={s.key} d={s.points.map((g, i) => (i === 0 ? "M" : "L") + xAt(g.endTime).toFixed(1) + "," + yAt(g.rating).toFixed(1)).join(" ")} fill="none" stroke={s.color} strokeWidth={1.8} strokeLinejoin="round" strokeLinecap="round" strokeDasharray={s.flat ? "4 3" : undefined} opacity={s.flat ? 0.65 : 1} />
              ))}
              {dragX != null && <line x1={dragX} x2={dragX} y1={padT} y2={padT + plotH} stroke={T.brassHi} strokeWidth={0.9} strokeDasharray="2.5 2.5" />}
              {nearest && nearest.map((s) => <circle key={s.key} cx={xAt(s.point.endTime)} cy={yAt(s.point.rating)} r="3" fill={s.color} stroke="#14100C" strokeWidth="0.8" />)}
              {xFracTicks.map((f, i) => (
                <text key={i} x={padL + f * plotW} y={H - 6} fontSize={8} textAnchor={i === 0 ? "start" : i === xFracTicks.length - 1 ? "end" : "middle"} fill="#B8A98C">{fmtAxisDate(tMin + f * tSpan)}</text>
              ))}
            </svg>
          </div>
          {/* (v0.2.6 UI) 범례를 그래프 위에서 아래로 옮겼다 — 시간 규정별 색상 점 + 첫 레이팅→마지막 레이팅.
              (v0.2.6 UI 재조정) 3개 항목이 줄바꿈 없이 한 줄에 들어가도록 글자·점·간격을 더 줄였다. */}
          <div className="flex items-center justify-center" style={{ gap: 8, marginTop: 8, flexWrap: "nowrap" }}>
            {series.map((s) => (
              <span key={s.key} style={{ display: "inline-flex", alignItems: "center", gap: 3, fontSize: 8.5, fontFamily: SITE_FONT, color: T.inkSoft, fontWeight: 700, whiteSpace: "nowrap" }}>
                <span aria-hidden style={{ width: 6, height: 6, borderRadius: 999, background: s.color, display: "inline-block", flexShrink: 0 }} />
                <b style={{ color: T.ink }}>{s.label}</b> {s.points[0].rating}→{s.points[s.points.length - 1].rating}
              </span>
            ))}
          </div>
        </>
      );
    }
  } else if (inPeriod.length < 2 && !allPoints.length) {
    body = emptyMsg;
  } else {
    // (기능) 이 기간에 대국이 없어도(전체 기록엔 있으면) 마지막 대국 당시 레이팅(=현재 레이팅)을
    // 기간 전체에 걸친 평평한 선으로 이어 보여준다 — inPeriod가 비었을 때만 쓰는 fallback이라
    // realCount(실제 이 기간 대국 수)는 별도로 남겨 "0판"이 정직하게 보이도록 한다.
    const flatFallback = inPeriod.length < 2;
    const realCount = inPeriod.length;
    const nowT = Date.now() / 1000;
    const points = flatFallback
      ? [{ endTime: cutoff, rating: allPoints[allPoints.length - 1].rating }, { endTime: nowT, rating: allPoints[allPoints.length - 1].rating }]
      : inPeriod;
    const ratings = points.map((g) => g.rating);
    const min = Math.min(...ratings), max = Math.max(...ratings);
    const span = Math.max(1, max - min);
    const xAt = (i) => padL + (i / (points.length - 1)) * plotW;
    const yAt = (r) => padT + plotH - ((r - min) / span) * plotH;
    const lineD = points.map((g, i) => (i === 0 ? "M" : "L") + xAt(i).toFixed(1) + "," + yAt(g.rating).toFixed(1)).join(" ");
    const areaD = lineD + " L" + xAt(points.length - 1).toFixed(1) + "," + (padT + plotH) + " L" + xAt(0).toFixed(1) + "," + (padT + plotH) + " Z";
    const first = points[0].rating, last = points[points.length - 1].rating;
    const rising = !flatFallback && last >= first;
    const lineColor = TIME_CLASS_CHART_COLOR[timeFilter] || T.brassHi;
    const dragIdx = dragX != null ? Math.round(Math.max(0, Math.min(1, (dragX - padL) / plotW)) * (points.length - 1)) : null;
    const dragPoint = dragIdx != null ? points[dragIdx] : null;
    body = (
      <>
        <div className="flex items-center justify-between" style={{ marginBottom: 4 }}>
          <span style={{ fontSize: 10.5, fontFamily: SITE_FONT, color: T.inkSoft }}>{tx("{0}판{1}", realCount, flatFallback && <span style={{ color: T.inkSoft, fontWeight: 700 }}>{" "}{t("· 최근 레이팅 유지")}</span>)}</span>
          <span style={{ fontSize: 11, fontFamily: SITE_FONT, color: T.ink, fontWeight: 800 }}>{first} → {last} {!flatFallback && <span style={{ color: rising ? T.best : last < first ? T.blunder : T.inkSoft }}>{rising ? "▲" : last < first ? "▼" : ""}</span>}</span>
        </div>
        <div ref={wrapRef} className="no-pan" onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={onPointerUp} onPointerCancel={onPointerUp}
          style={{ position: "relative", touchAction: "none", cursor: "ew-resize", userSelect: "none", WebkitUserSelect: "none" }}>
          {dragPoint && <div aria-hidden style={{ position: "absolute", top: -1, left: (xAt(dragIdx) / W) * 100 + "%", transform: "translateX(-50%)", width: 0, height: 0, borderLeft: "5px solid transparent", borderRight: "5px solid transparent", borderTop: "7px solid " + lineColor, pointerEvents: "none", zIndex: 2 }} />}
          {dragPoint && (
            <div style={{ position: "absolute", ...tooltipPos(xAt(dragIdx)), background: "#14100C", border: "1px solid rgba(255,255,255,.15)", borderRadius: 8, padding: "5px 8px", fontSize: 9.5, color: T.ivory, whiteSpace: "nowrap", pointerEvents: "none", zIndex: 3, boxShadow: "0 4px 12px rgba(0,0,0,.5)", textAlign: "center" }}>
              <div style={{ fontWeight: 800, color: T.brassHi }}>{fmtAxisDate(dragPoint.endTime)}</div>
              <div style={{ fontFamily: SITE_FONT }}>{dragPoint.rating}</div>
            </div>
          )}
          <svg viewBox={"0 0 " + W + " " + H} style={{ display: "block", width: "100%", height: "auto", aspectRatio: W + " / " + H }}>
            <rect x="0" y="0" width={W} height={H} fill="#211A13" rx="8" />
            {/* y축 그리드 — 값 라벨을 왼쪽에 함께 표시 */}
            {yTicks(min, max).map((r, i) => (
              <g key={i}>
                <line x1={padL} x2={W - padR} y1={yAt(r)} y2={yAt(r)} stroke="rgba(255,255,255,.08)" strokeWidth={1} />
                <text x={padL - 4} y={yAt(r) + 3} fontSize={8} textAnchor="end" fill="#B8A98C">{r}</text>
              </g>
            ))}
            {/* x축 세로 기준선 */}
            {xFracTicks.slice(1, -1).map((f, i) => (
              <line key={i} x1={padL + f * plotW} x2={padL + f * plotW} y1={padT} y2={padT + plotH} stroke="rgba(255,255,255,.06)" strokeWidth={1} />
            ))}
            {/* x/y축 선 */}
            <line x1={padL} x2={padL} y1={padT} y2={padT + plotH} stroke="rgba(255,255,255,.3)" strokeWidth={1} />
            <line x1={padL} x2={W - padR} y1={padT + plotH} y2={padT + plotH} stroke="rgba(255,255,255,.3)" strokeWidth={1} />
            {/* 선 아래 영역을 반투명하게 채움 */}
            <path d={areaD} fill={lineColor} opacity={flatFallback ? 0.22 : 0.4} stroke="none" />
            <path d={lineD} fill="none" stroke={lineColor} strokeWidth={1.8} strokeLinejoin="round" strokeLinecap="round" strokeDasharray={flatFallback ? "4 3" : undefined} opacity={flatFallback ? 0.65 : 1} />
            {dragPoint && <line x1={xAt(dragIdx)} x2={xAt(dragIdx)} y1={padT} y2={padT + plotH} stroke={T.brassHi} strokeWidth={0.9} strokeDasharray="2.5 2.5" />}
            {dragPoint && <circle cx={xAt(dragIdx)} cy={yAt(dragPoint.rating)} r="3.4" fill={lineColor} stroke="#14100C" strokeWidth="0.8" />}
            {/* x축 날짜 라벨 */}
            {xFracTicks.map((f, i) => (
              <text key={i} x={padL + f * plotW} y={H - 6} fontSize={8} textAnchor={i === 0 ? "start" : i === xFracTicks.length - 1 ? "end" : "middle"} fill="#B8A98C">{fmtAxisDate(points[Math.round(f * (points.length - 1))].endTime)}</text>
            ))}
          </svg>
        </div>
      </>
    );
  }
  return (
    <div style={{ background: "rgba(0,0,0,.04)", borderRadius: 10, padding: "10px 12px", marginBottom: 12 }}>
      <div className="flex items-center justify-between" style={{ marginBottom: 6, flexWrap: "wrap", gap: 6 }}>
        <span style={{ fontSize: 12.5, fontWeight: 800, color: T.ink }}>{t("기간별 레이팅 변동")}</span>
        <div className="inline-flex" style={{ borderRadius: 8, background: "rgba(0,0,0,.06)", padding: 2, gap: 2 }}>
          {RATING_CHART_PERIODS.map((p) => (
            <button key={p.key} onClick={() => setPeriod(p.key)} className="press" style={{ padding: "3px 7px", borderRadius: 6, border: "none", cursor: "pointer", fontSize: 9.5, fontWeight: 800, background: period === p.key ? T.ebony2 : "transparent", color: period === p.key ? T.brassHi : T.inkSoft }}>{p.label}</button>
          ))}
        </div>
      </div>
      {body}
    </div>
  );
}
// 알약 모양 필터 버튼 묶음 — options: [[값, 라벨], ...]
export function GameFilterPills({ options, value, onChange }) {
  return (
    <div className="inline-flex" style={{ borderRadius: 9, background: "rgba(0,0,0,.06)", padding: 3, gap: 2 }}>
      {options.map(([k, lab]) => (
        <button key={k} onClick={() => onChange(k)} className="press" style={{ padding: "5px 9px", borderRadius: 7, border: "none", cursor: "pointer", fontSize: 10.5, fontWeight: 800, background: value === k ? T.ebony2 : "transparent", color: value === k ? T.brassHi : T.inkSoft }}>{lab}</button>
      ))}
    </div>
  );
}

// 대국 목록의 승·무·패 합계 — { total, w, d, l, winRate } | null
export function summarizeGames(games) {
  if (!games || !games.length) return null;
  let w = 0, d = 0, l = 0;
  for (const g of games) { if (g.result === "win") w++; else if (g.result === "loss") l++; else d++; }
  const total = w + d + l;
  return { total, w, d, l, winRate: total ? Math.round(100 * w / total) : 0 };
}

// "전체 기간 전적" 박스 — 승·무·패 글자와 비율 막대
export function GameRecordSummary({ overall }) {
  return (
    <div style={{ background: "rgba(0,0,0,.04)", borderRadius: 10, padding: "10px 12px", marginBottom: 12 }}>
      <div className="flex items-center justify-between" style={{ marginBottom: 6 }}>
        <span style={{ fontSize: 12.5, fontWeight: 800, color: T.ink }}>{t("전체 기간 전적")}</span>
        <span style={{ fontSize: 12, fontFamily: SITE_FONT, color: T.inkSoft }}>{tx("{0}판", fmtFull(overall.total))}</span>
      </div>
      <div style={{ fontSize: 13, fontFamily: SITE_FONT, color: T.ink }}>
        <span style={{ color: T.best, fontWeight: 800 }}>{tx("{0}승", overall.w)}</span> {tx("{0}무 {1} · 승률 {2}", overall.d, <span style={{ color: T.blunder, fontWeight: 800 }}>{tx("{0}패", overall.l)}</span>, <b>{overall.winRate}%</b>)}
      </div>
      <div style={{ display: "flex", height: 8, borderRadius: 4, overflow: "hidden", marginTop: 8, border: "1px solid rgba(0,0,0,.2)" }}>
        <div style={{ width: (100 * overall.w / overall.total) + "%", background: T.best }} />
        <div style={{ width: (100 * overall.d / overall.total) + "%", background: "#9C8A6A" }} />
        <div style={{ width: (100 * overall.l / overall.total) + "%", background: T.blunder }} />
      </div>
    </div>
  );
}

// "최근 대국" — 5판씩 페이지로 넘겨 본다. ratingChanges: Map<대국 객체, 레이팅 증감>. onSelectGame이 있으면 보기·분석 버튼 대신 "선택" 버튼(유산 관리 화면용).
const RECENT_GAMES_PAGE_SIZE = 5;
export function RecentGamesList({ games, ratingChanges, username, resetKey, onOpenGame, onOpenGameAnalyze, onSelectGame, selectedGameId }) {
  const [recentPage, setRecentPage] = useState(0);
  useEffect(() => { setRecentPage(0); }, [resetKey]);
  const allGames = useMemo(() => [...games].sort((a, b) => (b.endTime || 0) - (a.endTime || 0)), [games]);
  if (!allGames.length) return null;
  const pageCount = Math.max(1, Math.ceil(allGames.length / RECENT_GAMES_PAGE_SIZE));
  const page = Math.min(recentPage, pageCount - 1);
  const recent = allGames.slice(page * RECENT_GAMES_PAGE_SIZE, page * RECENT_GAMES_PAGE_SIZE + RECENT_GAMES_PAGE_SIZE);
  const fmtD = (ts) => { if (!ts) return ""; const d = new Date(ts * 1000); return d.getFullYear() + "." + String(d.getMonth() + 1).padStart(2, "0") + "." + String(d.getDate()).padStart(2, "0"); };
  return (
    <div style={{ marginBottom: 12 }}>
      <div className="flex items-center gap-2" style={{ marginBottom: 4 }}><span style={{ fontSize: 12, fontWeight: 800, color: T.brass }}>{t("최근 대국")}</span><span style={{ fontSize: 10.5, color: T.inkSoft }}>{tx("{0}판", allGames.length)}</span></div>
      {recent.map((g, i) => {
        const won = g.result === "win", lost = g.result === "loss";
        const rc = ratingChanges ? ratingChanges.get(g) : null;
        // 상대 닉네임·대국 당시 레이팅 — 내 진영(g.color)의 반대쪽
        const oppSide = g.color === "w" ? g.black : g.white;
        return (
          <div key={g.id != null ? g.id : i} style={{ display: "flex", alignItems: "center", gap: 8, padding: "6px 0", borderTop: "1px solid #E4D5B6" }}>
            {/* 분석 탭 수 블록처럼 행 좌측에 진영 색 막대 */}
            <span title={g.color === "w" ? t("백") : t("흑")} style={{ width: 5, alignSelf: "stretch", minHeight: 30, flexShrink: 0, borderRadius: 3, background: g.color === "w" ? "linear-gradient(180deg,#FFFDF7,#E7DABB)" : "linear-gradient(180deg,#4A3826,#241509)", border: "1px solid " + (g.color === "w" ? "#D8C9A8" : "#000") }} />
            <div style={{ minWidth: 0, flex: 1 }}>
              <div style={{ fontSize: 12.5, color: T.ink }}><b style={{ color: won ? T.best : lost ? T.blunder : T.inkSoft }}>{won ? t("승리") : lost ? t("패배") : t("무승부")}</b>
                {!won && !lost && <span style={{ marginLeft: 4, fontSize: 10, fontWeight: 700, color: T.inkSoft }}>({drawKindLabel(g.moves)})</span>}
                {rc != null && <span style={{ fontWeight: 800, fontFamily: SITE_FONT, color: rc > 0 ? T.best : rc < 0 ? T.blunder : T.inkSoft }}>({rc > 0 ? "+" + rc : rc})</span>}
                {g.timeClass && <span style={{ marginLeft: 6, fontSize: 10.5, fontWeight: 700, color: T.inkSoft }}>{TIME_CLASS_LABEL[g.timeClass] || g.timeClass}{g.endTime ? " (" + fmtD(g.endTime) + ")" : ""}</span>}
              </div>
              {oppSide && oppSide.username && <div style={{ fontSize: 11, color: T.inkSoft, marginTop: 2 }}>vs <b style={{ color: T.ink }}>{oppSide.username}</b>{oppSide.rating != null && <span style={{ fontFamily: SITE_FONT }}>({oppSide.rating})</span>}</div>}
              {g.opening && <div style={{ fontSize: 10.5, color: T.inkSoft, marginTop: 2 }}>{g.opening}</div>}
            </div>
            {onSelectGame ? (() => {
              const gid = g.id != null ? g.id : g.endTime; const isSel = selectedGameId != null && gid === selectedGameId;
              return <button onClick={() => onSelectGame(g, gid)} className="press" style={{ flexShrink: 0, padding: "7px 14px", borderRadius: 8, background: isSel ? "linear-gradient(180deg,#3E7CC4,#2C5A94)" : "linear-gradient(180deg," + T.brass + ",#A8842F)", color: isSel ? "#fff" : "#241509", border: "none", cursor: "pointer", fontSize: 11.5, fontWeight: 800 }}>{isSel ? t("선택됨") : t("선택")}</button>;
            })() : (
              <div className="flex items-center gap-2" style={{ flexShrink: 0 }}>
                <button onClick={() => onOpenGame && onOpenGame(g.moves)} aria-label={t("대국 보기")} title={t("대국 보기")} className="press" style={{ width: 30, height: 30, borderRadius: 8, background: "linear-gradient(180deg," + T.brass + ",#A8842F)", color: "#241509", border: "none", cursor: "pointer", display: "inline-flex", alignItems: "center", justifyContent: "center" }}><Search size={13} /></button>
                {onOpenGameAnalyze && <BestMoveJumpButton onClick={() => onOpenGameAnalyze({ sans: g.moves, color: g.color, result: g.result, rating: g.rating, timeClass: g.timeClass, opening: g.opening, endTime: g.endTime, username, white: g.white, black: g.black, id: g.id })} />}
              </div>
            )}
          </div>
        );
      })}
      <ListPager page={page} setPage={setRecentPage} pageCount={pageCount} />
    </div>
  );
}

// ---- OpenChess 일반 대국(실시간 pvp_games) 기록 ----
// 끝난 일반 대국 행(pvp_games) → chess.com 대국 객체. 봇과 둔 대국은 서버에 남지 않아 여기 없다(실시간·친구 대국만).
// 레이팅 증감·상대 레이팅은 서버 트리거가 채운 rating_delta(레이팅 대국만)에서 읽는다.
export function pvpRowToGame(row, myUid, names, myName) {
  const mine = row.white_uid === myUid ? "w" : "b";
  const oppUid = mine === "w" ? row.black_uid : row.white_uid;
  const status = row.status;
  const result = status === "draw" ? "draw" : (status === "white_won") === (mine === "w") ? "win" : "loss";
  const d = row.rating_delta || null;
  const side = (c) => (d && d[c] ? d[c] : null);
  const mk = (c, uid) => ({ username: uid === myUid ? (myName || null) : ((names[uid] && (names[uid].pub && names[uid].pub.nickname || names[uid].username)) || "?"), rating: side(c) ? side(c).before : null });
  const sans = Array.isArray(row.sans) ? row.sans : [];
  const mySide = side(mine);
  return {
    id: "pvp-" + row.id, moves: sans, color: mine, result,
    timeClass: chessTcCategory(row.time_control), endTime: Math.floor(new Date(row.updated_at || row.created_at).getTime() / 1000),
    rating: mySide ? mySide.after : null, rated: !!row.rated,
    white: mk("w", row.white_uid), black: mk("b", row.black_uid),
    opening: sans.length ? openingNameOf(sans) : null,
    _delta: mySide ? mySide.after - mySide.before : null,
  };
}

// 봇 대국 행(bot_games) → 같은 대국 객체. 봇은 레이팅이 대국 상대의 고정 등급(400~2800)이고, 레이팅 대국이 아니라 증감은 없다.
export function botRowToGame(row, myName) {
  const mine = row.color;
  const sans = Array.isArray(row.sans) ? row.sans : [];
  const me = { username: myName || null, rating: null }, bot = { username: t("봇"), rating: row.bot_elo };
  return {
    id: "bot-" + row.id, moves: sans, color: mine, result: row.result,
    timeClass: chessTcCategory(row.time_control), endTime: Math.floor(new Date(row.created_at).getTime() / 1000),
    rating: null, rated: false, white: mine === "w" ? me : bot, black: mine === "w" ? bot : me,
    opening: sans.length ? openingNameOf(sans) : null, _delta: null,
  };
}

// 내 일반 대국 기록 — chess.com 대국 통계와 같은 구성(시간 규정·색 필터 → 전체 기간 전적 → 최근 대국). tick이 바뀌면 다시 읽는다.
export function OpenChessGameHistory({ myUid, username, onOpenGame, onOpenGameAnalyze, tick }) {
  const [rows, setRows] = useState(null);
  const [names, setNames] = useState({});
  const [timeFilter, setTimeFilter] = useState("all");
  const [colorFilter, setColorFilter] = useState("all");
  const [botRows, setBotRows] = useState([]);
  useEffect(() => {
    if (!SB_ON || !myUid) { setBotRows([]); return undefined; }
    let cancelled = false;
    sbSelect("bot_games?uid=eq." + myUid + "&order=created_at.desc&limit=100&select=id,sans,color,result,bot_elo,time_control,created_at")
      .then((r) => { if (!cancelled) setBotRows(r || []); }).catch(() => { if (!cancelled) setBotRows([]); });
    return () => { cancelled = true; };
  }, [myUid, tick]);
  useEffect(() => {
    if (!SB_ON || !myUid) { setRows([]); return undefined; }
    let cancelled = false;
    sbSelect("pvp_games?game_type=eq.chess&status=in.(white_won,black_won,draw)&or=(white_uid.eq." + myUid + ",black_uid.eq." + myUid + ")&order=updated_at.desc&limit=100&select=id,white_uid,black_uid,sans,status,time_control,rated,rating_delta,created_at,updated_at")
      .then(async (r) => {
        const list = (r || []).filter((x) => Array.isArray(x.sans) && x.sans.length > 0);
        const uids = list.map((x) => (x.white_uid === myUid ? x.black_uid : x.white_uid)).filter(Boolean);
        const n = await usersProfiles(uids);
        if (!cancelled) { setNames(n); setRows(list); }
      })
      .catch(() => { if (!cancelled) setRows([]); });
    return () => { cancelled = true; };
  }, [myUid, tick]);
  const all = useMemo(() => [...(rows || []).map((r) => pvpRowToGame(r, myUid, names, username)), ...botRows.map((r) => botRowToGame(r, username))], [rows, botRows, myUid, names, username]);
  const games = useMemo(() => all.filter((g) => (timeFilter === "all" || g.timeClass === timeFilter) && (colorFilter === "all" || g.color === colorFilter)), [all, timeFilter, colorFilter]);
  const ratingChanges = useMemo(() => { const m = new Map(); games.forEach((g) => { if (g._delta != null) m.set(g, g._delta); }); return m; }, [games]);
  const overall = useMemo(() => summarizeGames(games), [games]);
  // 레이팅 그래프는 색 필터와 무관하게 시간 규정만 적용한 목록으로 — 레이팅은 어느 색으로 뒀든 하나로 합산된다. 레이팅 대국(rating 있음)만 점이 된다.
  const gamesForRating = useMemo(() => all.filter((g) => timeFilter === "all" || g.timeClass === timeFilter), [all, timeFilter]);
  if (!myUid || rows == null || !all.length) return null;
  return (
    <div style={{ marginTop: 14 }}>
      <div className="flex items-center" style={{ gap: 6, marginBottom: 12, flexWrap: "wrap" }}>
        <GameFilterPills options={[["all", t("전체")], ["bullet", t("불릿")], ["blitz", t("블리츠")], ["rapid", t("래피드")], ["standard", t("스탠다드")]]} value={timeFilter} onChange={setTimeFilter} />
        <GameFilterPills options={[["all", t("전체")], ["w", t("백")], ["b", t("흑")]]} value={colorFilter} onChange={setColorFilter} />
      </div>
      {overall ? <GameRecordSummary overall={overall} /> : <p style={{ fontSize: 12, color: T.inkSoft, marginBottom: 12 }}>{t("이 시간 규정의 대국 없음")}</p>}
      <RatingHistoryChart games={gamesForRating} timeFilter={timeFilter} stillFetching={false} />
      <RecentGamesList games={games} ratingChanges={ratingChanges} username={username} resetKey={timeFilter + "|" + colorFilter}
        onOpenGame={onOpenGame} onOpenGameAnalyze={onOpenGameAnalyze} />
    </div>
  );
}
