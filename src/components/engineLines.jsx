import React, { useState, useEffect, useRef } from "react";
import { motion } from "framer-motion";
import { HelpCircle } from "lucide-react";
import { T, MOTION_EASE } from "../lib/theme.js";
import { matePliesOf, fmtEvalCp } from "../lib/moveQuality.js";
import { moveNumber } from "../lib/chessRules.js";

// (18차 UI6 → 사용자 요청으로 v0.3.3에 유산 기보 폰트로 통일) 기보 표기 전반에 쓰는 폰트 —
// 원래 Playfair Display였으나, 유산(Legacy) 재생 화면의 기보에 쓰던 폰트(LEGACY_FONT)로 맞췄다.
export const SEQ_FONT = "'Merriweather', 'Noto Sans KR', serif";
// (v0.3.9 사용자 요청 → 재요청으로 적용 범위 확대) 처음엔 리뷰 페이지 전용 폰트로 도입했다가,
// "특수하게 지정해 둔 부분(SEQ_FONT 기보 폰트, LEGACY_FONT, GAME_FONT 등 디자인 의도가 있는 폰트)만
// 빼고 사이트 전반에 IBM Plex Sans KR을 적용해 달라"는 재요청으로 범위를 넓혔다 — index.css의
// html/body 기본 폰트도 이미 IBM Plex Sans KR이라(상속) 대부분의 텍스트는 원래도 이 폰트였지만,
// 숫자·배지 등 곳곳에서 명시적으로 ui-monospace를 지정해 그 상속을 덮어쓰고 있던 자리들을 전부 이
// 상수로 바꿔, "명시적으로 지정했지만 실은 의도된 디자인 선택이 아니었던" 폰트들을 사이트 기본값과
// 다시 맞춘다. 리뷰 페이지와만 공유하던 컴포넌트(EvalBadge·EvalBar·SequenceBar 등)의 font(옵션)
// prop·기본값 구조는 이제 의미가 없어졌지만(기본값 자체가 이미 이 상수이므로), 굳이 걷어내지 않아도
// 동작에는 차이가 없어 그대로 둔다.
export const SITE_FONT = "'IBM Plex Sans KR', sans-serif";

// (17차) 메이트로 이어지는 수를 null로 버려 평가치 바(fallbackEval)에서 최선의 수가 누락되던 버그 수정 —
// posEval의 다른 경로(onEvalProgress)와 동일한 ±1000 표기 관례로 메이트도 값을 갖도록 한다.
// (20차) mate===0(이미 체크메이트인 포지션)은 부호를 잃으므로 live.win('w'|'b')으로 승자를 판별한다.
export const mateWhiteWins = (mate, win) => (win ? win === "w" : mate > 0);

// (v0.1.3 기능) 엔진 라인은 이미 둔 수(sans)는 빼고 "지금 위치에서의 다음 수"부터만 보여준다 —
// pvUciToSans로 얻은 이어지는 수(contSans)만 받아, 그 첫 수의 실제 수 번호(startPly)부터 표기한다.
// contSans 각 요소는 pvUciToSans가 buildSan으로 만들어 이미 +/# 기호가 붙어 있으므로 decorateLine이
// 필요 없다(decorateLine은 시작 위치부터 다시 재생해야 해 이 이어붙인 조각만으로는 쓸 수 없음).
function pvContinuationText(startPly, contSans) {
  const parts = [];
  contSans.forEach((san, i) => {
    const ply = startPly + i;
    if (ply % 2 === 0 || i === 0) parts.push(moveNumber(ply) + san);
    else parts[parts.length - 1] += " " + san;
  });
  return parts.join(" ");
}

/* ============================================================ 평가 막대 (백=왼쪽, 숫자 항상 보이게) ============================================================ */
// (v0.1.3 기능) 평가치를 소수점 둘째 자리까지, 유리한 쪽 색으로 채운 배지로 보여준다 — 백 유리는
// 흰 바탕에 검정 글자, 흑 유리는 검정 바탕에 흰 글자, 0.00(팽팽)은 좌우 반반으로 갈라 보여준다
// (같은 텍스트를 두 번 겹쳐 그리고 각각 clip-path로 절반씩만 드러낸다 — 정중앙에서 흰 바탕 위
// 검정 글자가 검정 바탕 위 흰 글자로 자연스럽게 이어진다). 평가치 바 좌측 배지·엔진 라인 각 줄의
// 배지가 이 컴포넌트를 함께 쓴다.
// (v0.1.3 기능) 평가치 텍스트(소수점 둘째 자리 · 메이트는 M수 · 종국은 결과)를 EvalBadge(박스형)와
// EvalBar의 좌측 회색 텍스트가 함께 쓴다 — 항상 같은 값을 같은 규칙으로 표기하도록 로직을 한곳에 둔다.
function evalDisplayText(ev) {
  return !ev ? "0.00" : (ev.mate === 0 ? (mateWhiteWins(ev.mate, ev.win) ? "1-0" : "0-1") : fmtEvalCp(ev.cp, ev.mate, ev.plies));
}
// (v0.2.1) /review 세로 평가치 막대 전용 — 부호는 위치(위=흑 우세, 아래=백 우세)로 이미 드러나므로
// 크기(절댓값)만 표기한다. 메이트는 M수, 종국은 체크메이트 기호(#). 소수 한 자리로 줄여 좁은 막대 안에 맞춘다.
function evalBarText(ev) {
  if (!ev) return "0.0";
  if (ev.mate === 0) return "#";
  if (ev.mate != null) return "M" + (ev.plies != null ? ev.plies : matePliesOf(ev.mate));
  return (Math.abs(ev.cp || 0) / 100).toFixed(1);
}
// (v0.3.9 사용자 요청 → 재요청으로 site-wide 폰트가 SITE_FONT 자체가 되며 이 prop은 사실상
// 무의미해졌다 — font를 넘기든 안 넘기든 이제 항상 SITE_FONT를 쓴다. 다만 걷어낼 이유도 없어(다른
// 화면에서 실수로 다른 폰트를 넘기고 싶어질 미래를 대비해) prop 구조 자체는 그대로 둔다.
export function EvalBadge({ ev, small, font }) {
  const num = !ev ? 0 : (ev.mate != null ? (mateWhiteWins(ev.mate, ev.win) ? 1000 : -1000) : (ev.cp || 0));
  const txt = evalDisplayText(ev);
  // (v0.1.3 UI) 엔진 라인(small)은 자리를 훨씬 더 압축한다 — 좌우 여백·최소폭·글자 크기를 크게 줄임.
  const base = { display: "inline-flex", alignItems: "center", justifyContent: "center", minWidth: small ? 32 : 50, padding: small ? "1px 3px" : "3px 8px", borderRadius: small ? 4 : 6, fontSize: small ? 9 : 11, fontWeight: 800, fontFamily: font || SITE_FONT, border: "1px solid rgba(0,0,0,.25)", boxShadow: "0 1px 2px rgba(0,0,0,.3)", flexShrink: 0 };
  if (num > 0) return <span style={{ ...base, background: "#FFFFFF", color: "#0E0907" }}>{txt}</span>;
  if (num < 0) return <span style={{ ...base, background: "#0E0907", color: "#FFFFFF" }}>{txt}</span>;
  return (
    <span style={{ ...base, position: "relative", background: "linear-gradient(90deg,#FFFFFF 50%,#0E0907 50%)", overflow: "hidden" }}>
      <span aria-hidden="true" style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", color: "#0E0907", clipPath: "inset(0 50% 0 0)" }}>{txt}</span>
      <span aria-hidden="true" style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", color: "#FFFFFF", clipPath: "inset(0 0 0 50%)" }}>{txt}</span>
      <span style={{ opacity: 0 }}>{txt}</span>
    </span>
  );
}
// Board 컴포넌트의 프레임(격자 바깥 여백) 두께 — 바깥 div의 padding 10 + border 1 = 격자가 프레임
// 안쪽으로 들어와 있는 px. 세로 평가치 막대를 이만큼 위아래로 들여, 막대 양끝이 프레임이 아니라
// 실제 격자(8행 위 끝·1행 아래 끝)에 맞도록 한다.
const BOARD_FRAME_INSET = 11;
// (v0.2.1 기능) vertical=true면 세로 막대(백 아래·흑 위)로 그린다 — /review 메인 보드 좌측용.
// 막대 바깥 틀은 alignSelf:stretch로 옆 보드(flex items-stretch)의 실제 렌더 높이(=보드 바깥 프레임
// 포함)에 맞추되, 실제 색 채움(fill)은 위아래로 프레임 두께(BOARD_FRAME_INSET)만큼 들여 격자 높이에
// 딱 맞춘다 — 그러면 막대 위끝=8행 위, 아래끝=1행 아래, 세로 중앙(0.0)=4·5행 사이가 된다. 한 칸당
// 1점, 최대 ±4점(그 밖은 e를 ±4로 클램프하므로 막대가 유리한 쪽 한 색으로 통일됨). 가로 막대(기존
// 분석 탭 등)는 vertical 없이 그대로 동작한다.
export function EvalBar({ cp, width, depth, vertical, font }) {
  // (20차) cp는 숫자(cp) 또는 {cp}|{mate,win} 객체 — 메이트 수순에서 +10.00이 아니라 M수로 표기한다.
  const ev = cp == null ? null : (typeof cp === "number" ? { cp } : cp);
  const num = ev == null ? 0 : (ev.mate != null ? (mateWhiteWins(ev.mate, ev.win) ? 1000 : -1000) : ev.cp);
  const e = Math.max(-4, Math.min(4, num / 100));
  const whitePct = ((4 + e) / 8) * 100;
  // (18차 UX5) depth 숫자 대신, 타이핑 인디케이터풍 3-dot 바운스로 "엔진이 탐색 중"임을 표현하고
  // 옆의 흰색 도움말 아이콘을 누르면 말풍선으로 "n수 후까지 탐색 중.." 수치를 자세히 보여준다.
  const [tipOpen, setTipOpen] = useState(false);
  useEffect(() => { if (depth == null) setTipOpen(false); }, [depth == null]);
  if (vertical) {
    return (
      <div style={{ width: 22, alignSelf: "stretch", flexShrink: 0, position: "relative", zIndex: tipOpen ? 50 : 1 }}>
        {/* fill은 stretch된 막대에서 위아래로 프레임 두께만큼 들여, 격자(8~1행) 높이에 정확히 맞춘다. */}
        <div style={{ position: "absolute", top: BOARD_FRAME_INSET, bottom: BOARD_FRAME_INSET, left: 0, right: 0, borderRadius: 5, overflow: "hidden", border: "1px solid #000" }}>
          {/* 백이 항상 아래쪽 — whitePct는 백이 유리할수록 커지는 값이라 bottom 기준 높이로 그대로 쓴다. */}
          <div style={{ position: "absolute", left: 0, right: 0, bottom: 0, height: whitePct + "%", background: "#FFFFFF" }} />
          <div style={{ position: "absolute", left: 0, right: 0, top: 0, height: (100 - whitePct) + "%", background: "#140C07" }} />
        </div>
        {/* 부호 없이 크기만 — 위치(아래=백/위=흑)로 유불리를 구분한다. 폭(22px)에 다 들어오도록 글자를 줄인다. */}
        <span style={{ position: "absolute", left: 0, right: 0, textAlign: "center", fontSize: 7.5, fontWeight: 800, fontFamily: font || SITE_FONT, lineHeight: 1, letterSpacing: "-.02em", ...(num >= 0 ? { bottom: BOARD_FRAME_INSET + 3, color: "#140C07" } : { top: BOARD_FRAME_INSET + 3, color: "#FFFFFF" }) }}>{evalBarText(ev)}</span>
      </div>
    );
  }
  return (
    <div style={{ width, margin: "0 auto 8px", position: "relative", zIndex: tipOpen ? 50 : 1 }}>
      {/* (버그 수정) 흰 구간 색이 엔진 라인 평가치 박스(EvalBadge, 순백 #FFFFFF)와 달리 살짝 크림빛
          도는 T.ivoryHi(#FAF2E2)였다 — 같은 "백 유리"를 나타내는 색인데 바와 박스가 서로 다른 흰색을
          쓰면 불일치해 보이므로 EvalBadge와 동일한 순백으로 맞춘다. */}
      <div style={{ display: "flex", height: 18, borderRadius: 5, overflow: "hidden", border: "1px solid #000" }}>
        <div style={{ width: whitePct + "%", background: "#FFFFFF" }} />
        <div style={{ width: (100 - whitePct) + "%", background: "#140C07" }} />
      </div>
      {/* (v0.1.3 UI) 색이 채워진 박스 배지 대신, 소수점 둘째 자리까지 표기한 텍스트를 바에 직접
          얹는다(박스 배경 없음) — 백이 유리하면 흰 구간(좌측)에 검은 텍스트를 좌측 끝에, 흑이
          유리하면 검은 구간(우측)에 흰 텍스트를 우측 끝에 두어 항상 자신이 놓인 구간과 대비되게 한다. */}
      <span style={{ position: "absolute", top: "50%", transform: "translateY(-50%)", fontSize: 11, fontWeight: 800, fontFamily: font || SITE_FONT, ...(num >= 0 ? { left: 6, color: "#140C07" } : { right: 6, color: "#FFFFFF" }) }}>{evalDisplayText(ev)}</span>
      {/* (버그 수정) 평가치 텍스트가 백 유리 시 좌측, 흑 유리 시 우측으로 옮겨 다니게 되면서, 항상
          우측 고정이던 탐색 인디케이터와 겹칠 수 있어 평가치 텍스트의 반대편에 두도록 바꾼다. */}
      {depth != null && (
        <span style={{ position: "absolute", top: "50%", ...(num >= 0 ? { right: 4 } : { left: 4 }), transform: "translateY(-50%)", display: "inline-flex", alignItems: "center", gap: 4 }}>
          {/* (18차 보충 UX5) dot 크기를 살짝 줄임(4→3px) */}
          <span style={{ display: "inline-flex", alignItems: "center", gap: 2 }}>
            {[0, 1, 2].map((i) => <span key={i} style={{ width: 3, height: 3, borderRadius: "50%", background: T.brassHi, display: "inline-block", animation: "dotbounce 1.1s ease-in-out " + (i * 0.18) + "s infinite" }} />)}
          </span>
          {/* (버그 수정) 이 아이콘은 백이 크게 유리해지면(흰 구간이 바 전체를 거의 채움) 우측 끝까지
              흰 배경 위에 놓이는데, 색이 고정 흰색(#fff)이라 그 위에서 완전히 안 보였다 — 배경이
              흰색이든 검은색이든 늘 뚜렷이 보이도록 순백 대신 사이트 테마의 브라스 골드로 바꾼다. */}
          <button onClick={() => setTipOpen((v) => !v)} aria-label="탐색 상태 도움말" style={{ width: 14, height: 14, padding: 0, border: "none", background: "transparent", color: T.brass, cursor: "pointer", display: "inline-flex", alignItems: "center", justifyContent: "center", opacity: .9 }}><HelpCircle size={12} /></button>
          {/* (18차 보충 UX5) 말풍선이 체스보드에 가려지던 문제 — 바 아래가 아니라 위쪽으로 띄우고 z-index를 높인다 */}
          {/* (v0.3.9 버그 수정) 이 말풍선은 항상 right:0(자기 오른쪽 끝 기준 좌측으로 확장)로 고정돼
              있었는데, 바깥 인디케이터가 흑 유리 시 left:4로(=바 왼쪽 끝 근처) 옮겨가도 말풍선은 여전히
              그 좁은 인디케이터의 오른쪽 끝에서부터 왼쪽으로 자라 나가 바/보드 왼쪽 바깥으로 넘어갔다 —
              모바일 좁은 화면에서 잘려 보인 원인. 인디케이터와 같은 조건으로 말풍선도 반대편(왼쪽 유리
              시 left:0, 오른쪽으로 확장)으로 뒤집어 항상 바 안쪽으로만 자라도록 한다. */}
          {/* (v0.3.9 버그 수정, 2차) 위 수정에서 꼬리표(삼각형)의 테두리 쪽도 borderLeft로 함께
              뒤집었는데, 이건 잘못이었다 — rotate(45deg)는 정사각형의 "우하단" 모서리를 화면상
              "정하단"으로 보낸다(다른 세 모서리는 각각 상/우/좌로 감), 그래서 아래로 뾰족하게 보이려면
              항상 borderRight+borderBottom 조합이어야 하고, 왼쪽으로 뒤집어야 하는 건 이 사각형
              자체의 좌우 위치(left/right: 10)뿐이다 — 테두리까지 같이 뒤집으면 꼬리가 아래가 아니라
              옆(왼쪽)을 향한 모양으로 비뚤어져 보인다(사용자 신고 "모양이 왜곡되는 문제"의 원인).
              위치만 좌우로 바꾸고 테두리 조합은 두 경우 모두 동일하게 유지한다. */}
          {tipOpen && (
            <span style={{ position: "absolute", bottom: 24, whiteSpace: "nowrap", background: "rgba(20,12,6,.97)", color: T.ivoryHi, fontSize: 10.5, fontWeight: 700, borderRadius: 8, border: "1px solid " + T.brass, padding: "5px 9px", zIndex: 999, boxShadow: "0 6px 16px -6px rgba(0,0,0,.6)", ...(num >= 0 ? { right: 0 } : { left: 0 }) }}>
              <span style={{ position: "absolute", bottom: -4, width: 7, height: 7, background: "rgba(20,12,6,.97)", transform: "rotate(45deg)", borderRight: "1px solid " + T.brass, borderBottom: "1px solid " + T.brass, ...(num >= 0 ? { right: 10 } : { left: 10 }) }} />
              {depth}수 후까지 탐색 중..
            </span>
          )}
        </span>
      )}
    </div>
  );
}

// (v0.1.3 기능) 분석 탭 메인 보드에 엔진 상위 3줄(MultiPV)을 보여준다. 각 줄은 왼쪽에 EvalBadge
// (그 줄의 평가치), 오른쪽에 이미 둔 수는 빼고 "지금 위치에서의 다음 수"부터 이어지는 수순(최대
// depth 15수, Playfair Display 기보 폰트)을 한 줄로 이어 붙이고, 줄이 보드 폭보다 길면 그 줄만
// 좌우로 스크롤해서 끝까지 볼 수 있다. 줄 자체를 누르면(스크롤 영역 자체 클릭 포함) 그 줄의 첫
// 수가 보드에서 그대로 두어진다 — 스크롤과 클릭이 같은 영역을 쓰므로, 드래그로 스크롤하다 손을
// 뗀 것까지 클릭으로 오인해 수를 두지 않도록 pointerdown/up 좌표 차이를 함께 확인한다.
// (버그 수정) 계산 중인 줄 자리에 실제 줄과 똑같은 높이의 뼈대(스켈레톤)를 깔아, 수를 두면 이
// 컴포넌트가 통째로 사라졌다 나타나며 아래 보드·기보를 들썩이게 하던 문제를 없앤다 — 3-dot
// 바운스(EvalBar의 "탐색 중" 표시와 같은 애니메이션)로 지금 계산 중임을 보여준다.
export function EngineLineSkeleton({ large }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: large ? 6 : 5, minWidth: 0, padding: large ? "4px 6px" : "1.5px 4px", borderRadius: 6, background: "rgba(0,0,0,.28)", border: "1px solid #3A2516" }}>
      <span style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", minWidth: large ? 50 : 32, height: 13 }}>
        {[0, 1, 2].map((i) => <span key={i} style={{ width: 3, height: 3, marginLeft: i ? 3 : 0, borderRadius: "50%", background: T.brassHi, display: "inline-block", animation: "dotbounceSm 1.1s ease-in-out " + (i * 0.18) + "s infinite" }} />)}
      </span>
    </div>
  );
}
// (UI) 사용자 요청 — 둘 수 있는 수가 1~2개뿐인 국면에서 남는 엔진 라인 자리를 채우는 빈 칸.
// 높이는 EngineLineSkeleton과 맞추되(레이아웃 들썩임 방지) 배경·테두리·점 애니메이션 없이 완전히 비워 둔다.
export function EngineLineBlank({ large }) {
  return <div style={{ height: large ? 30 : 16 }} aria-hidden="true" />;
}
// (v0.2.1) 엔진 라인 수순을 한 번에 다 찍지 않고 한 수씩 "타이핑"되듯 드러낸다 — posKey(포지션)가
// 바뀌면 처음부터 다시 타이핑하고, 같은 포지션에서 실시간 스트리밍으로 수순이 길어지면 이어서 드러낸다.
// (버그 수정 — 근본) 한 수씩 55ms 간격으로 늘려 보여주던 "타이핑" 애니메이션이 이 세션 내내
// 반복 재발한 버그들(줄어듦·멈춤·초기화 경쟁 등)의 근본 원인이었다 — 순전히 장식 효과 하나가
// 이렇게 많은 사이드 이펙트를 낳을 가치가 없다고 판단해 애니메이션 자체를 없앴다. 이제 지금까지
// 확보된 수순(sans)을 지연 없이 즉시 전부 렌더링한다. 그래도 같은 줄(같은 posKey+첫 수)이 depth
// 심화로 다시 보고될 때 PV가 일시적으로 더 짧아지는 건 정상적인 탐색 변동이므로, 화면에 보여준
// 적 있는 가장 긴 텍스트보다 짧아지지 않게 하는 안전장치만 그대로 유지한다.
// (버그 수정) 위 "가장 긴 텍스트 유지" 안전장치를 컴포넌트 인스턴스의 useRef에 뒀더니, MultiPV
// 순위가 흔들리며 이 후보 수가 화면 상위 3줄에서 잠깐 밀려났다 곧 다시 들어오는 순간(EngineLineRow가
// key={슬롯 번호}로 자리를 재사용하므로, 그 자리를 다른 후보가 잠깐 차지했다가 이 후보가 되돌아오면
// React가 이 컴포넌트를 완전히 새로 마운트한다) useRef가 통째로 초기화되며 지금까지 쌓아 둔 "가장
// 긴 텍스트" 기억이 사라졌다 — 실제로는 같은 포지션·같은 첫 수(=같은 후보 수)인데도 화면에는 그
// 수가 갑자기 처음 본 것처럼 짧게 다시 나타나, "특정 depth에서 라인이 뚝 끊긴다"는 제보로 이어졌다.
// 컴포넌트가 마운트·언마운트되어도 살아남도록, 이 기억을 React 트리 바깥의 모듈 레벨 캐시(posKeyBase
// 기준 — 포지션이 바뀌면 통째로 비움)로 옮긴다.
const engineLineMaxTextCache = { base: null, map: new Map() };
export function TypedMoveLine({ startPly, sans, posKeyBase }) {
  const text = pvContinuationText(startPly, sans);
  if (engineLineMaxTextCache.base !== posKeyBase) { engineLineMaxTextCache.base = posKeyBase; engineLineMaxTextCache.map = new Map(); }
  const firstMove = sans[0];
  const numCount = (text.match(/\d+\./g) || []).length;
  const prev = engineLineMaxTextCache.map.get(firstMove);
  if (!prev || numCount >= prev.numCount) { engineLineMaxTextCache.map.set(firstMove, { text, numCount }); return <>{text}</>; }
  return <>{prev.text}</>;
}
// (v0.2.1 버그) 멀티PV 스트리밍 도중 서로 다른 multipv 슬롯이 잠깐 같은 첫 수를 담아, 완전히 겹치는
// 라인이 나타났다 사라지는 깜빡임이 있었다 — 첫 수가 같은 라인은 먼저 나온 것만 남겨 중복을 제거한다.
export function dedupeEngineLines(list) {
  const seen = new Set();
  return list.filter((l) => { const k = l.sans && l.sans[0]; if (!k || seen.has(k)) return false; seen.add(k); return true; });
}
// (v0.2.5 버그 수정) 이전엔 이 줄의 좌우 스크롤을 브라우저 기본 overflow-x:auto 드래그 스크롤에
// 맡겼는데, 이는 터치에서만 자연스럽게 동작하고(WebkitOverflowScrolling:touch) 데스크톱 마우스로는
// 스크롤바를 정확히 붙잡거나 shift+휠을 써야 해 사실상 스크롤이 거의 불가능했다 — 뒷부분 수순이
// 항상 가려진 채 "끊긴" 것처럼 보이는 원인이었다. 여기서는 포인터 이벤트로 직접 scrollLeft를
// 옮기는 드래그 스크롤을 구현해 마우스·터치·펜 어디서나 동일하게 동작하게 하고, 실제로 끌었을
// 때(moved)만 스크롤로 처리하고 그렇지 않으면(제자리 클릭) 그 줄의 첫 수를 둔다 — 스크롤하다 손을
// 뗀 것이 수를 두는 클릭으로 오인되던 문제를 없앤다.
// (v0.2.6 버그 수정) 예전엔 타이핑 효과로 수순이 시야보다 길게 자라날 때마다 scrollLeft를 콘텐츠
// 오른쪽 끝에 맞춰 계속 따라가게 했는데, 그러면 지금 막 타이핑되는 수가 화면 맨 오른쪽 좁은 자리에
// 끼여 보일 뿐 아니라, 각 줄이 실제로 대변하는 "바로 다음 수"(l.sans[0], 이 줄의 첫 수)가 계속
// 화면 밖으로 밀려나 버렸다. 더 이상 타이핑에 맞춰 자동으로 스크롤을 옮기지 않고 항상 왼쪽 끝(=
// 다음 수)에 고정해 둔다 — 뒷부분을 보고 싶으면 사용자가 직접 끌어서 보면 된다(더 있으면 오른쪽에
// 옅은 그라데이션 페이드로 알려줌).
// (v0.2.6 버그 수정) 예전엔 이 컴포넌트를 그 줄의 첫 수(lineKey)로 키를 잡아, 탐색 depth가 깊어지며
// MultiPV 순위가 바뀔 때마다(포지션은 그대로인데 특정 자리에 다른 수순이 들어옴) React가 이 자리를
// 통째로 언마운트·재마운트했다 — 안의 TypedMoveLine도 함께 다시 만들어져 shown이 0으로 리셋되며
// 화면이 잠깐 완전히 비었다 다시 타이핑되길 반복했다(포지션은 안 바뀌었는데도 특정 줄이 계속
// 빈칸↔부분 타이핑을 오가며 "끝까지 안 써지는" 것처럼 보인 진짜 원인). 이제 이 자리(슬롯 번호,
// 포지션이 바뀌지 않는 한 항상 같음)로 키를 잡아, 순위가 바뀌어 다른 수순이 들어와도 같은 컴포넌트
// 인스턴스가 그대로 유지된다 — 안의 TypedMoveLine도 재마운트되지 않으므로 shown이 리셋되지 않고,
// 새 수순의 길이만큼 자연스럽게 이어서(또는 이미 더 길게 타이핑돼 있었다면 그대로) 표시된다.
// (되돌림 + 진짜 원인 수정) 한 줄 유지가 맞는 디자인이라는 지적을 받아 가로 스크롤로 되돌린다.
// 대신 이번엔 스크롤 자체를 자체 구현 pointer 드래그(setPointerCapture + 수동 scrollLeft 대입)
// 대신 브라우저 네이티브 터치 스크롤(overflowX:auto + WebkitOverflowScrolling:touch)에만 맡긴다 —
// 자체 구현 드래그가 일부 모바일 브라우저(특히 인앱 웹뷰)에서 네이티브 터치 스크롤과 충돌해 손가락
// 으로 밀어도 반응이 없는(=화면상 아무것도 안 움직이는) 경우가 있었을 것으로 보이는데, 사용자에게는
// "밀어도 안 움직이니 그 뒤에 수가 아예 없다(정보 누락)"로 보였을 것이다. 실제로는 pvUciToSans가
// maxPlies=15까지, MultiPV 탐색이 도달한 depth만큼 수를 이미 다 갖고 있고(TypedMoveLine이 그걸
// 전부 타이핑해 준다) 화면에 한 번에 안 보일 뿐이었다 — 네이티브 스크롤은 어떤 모바일 브라우저에서도
// 항상 동작이 보장되므로, 이제 실제로 밀면 반드시 나머지가 나온다.
export function EngineLineRow({ l, startPly, slotIdx, posKeyBase, pending, onPlayFirst, large, font }) {
  const outerRef = useRef(null);
  const innerRef = useRef(null);
  const [showFade, setShowFade] = useState(false);
  const identity = posKeyBase + ":" + slotIdx;
  const recompute = () => {
    const outer = outerRef.current, inner = innerRef.current;
    if (!outer || !inner) return;
    const overflowing = inner.scrollWidth > outer.clientWidth + 1;
    const atEnd = outer.scrollLeft + outer.clientWidth >= inner.scrollWidth - 1;
    setShowFade(overflowing && !atEnd);
  };
  useEffect(() => {
    if (outerRef.current) outerRef.current.scrollLeft = 0;
    recompute();
    const inner = innerRef.current;
    const iv = setInterval(recompute, 200);
    if (!inner || typeof ResizeObserver === "undefined") return () => clearInterval(iv);
    const ro = new ResizeObserver(recompute);
    ro.observe(inner);
    return () => { ro.disconnect(); clearInterval(iv); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [identity]);
  const downRef = useRef(null);
  const onPointerDownCap = (e) => { downRef.current = { x: e.clientX, y: e.clientY, moved: false }; };
  const onPointerMoveCap = (e) => { const d = downRef.current; if (d && (Math.abs(e.clientX - d.x) > 4 || Math.abs(e.clientY - d.y) > 4)) d.moved = true; };
  const onClick = () => { if (downRef.current && downRef.current.moved) return; if (l.sans[0]) onPlayFirst && onPlayFirst(l.sans[0]); };
  return (
    // (신규) depth가 깊어지며 MultiPV 순위가 바뀔 때 이 줄이 새 자리로 "이동"하는 것을 보여주기 위해
    // motion.div layout을 쓴다 — 아래 EngineLines에서 이 줄의 key를 슬롯 번호가 아니라 이 줄의 첫
    // 수(수의 정체성)로 잡아야, 순위가 바뀌어도 같은 컴포넌트 인스턴스가 유지되며 framer-motion이
    // 옛 위치→새 위치로의 이동을 자동으로(FLIP) 애니메이션할 수 있다.
    <motion.div layout transition={{ duration: 0.32, ease: MOTION_EASE }} className="no-pan" onPointerDown={onPointerDownCap} onPointerMove={onPointerMoveCap}
      style={{ display: "flex", alignItems: "center", gap: large ? 6 : 5, minWidth: 0, padding: large ? "4px 6px" : "1.5px 4px", borderRadius: 6, background: "rgba(0,0,0,.28)", border: "1px solid #3A2516", opacity: pending ? 0.5 : 1, transition: "opacity .25s ease", position: "relative" }}>
      <EvalBadge ev={l.ev} small={!large} font={font} />
      <div ref={outerRef} onScroll={recompute} onClick={onClick} className="press"
        style={{ flex: "1 1 auto", minWidth: 0, overflowX: "auto", whiteSpace: "nowrap", fontSize: large ? 13 : 10, color: T.ivory, fontFamily: font || SEQ_FONT, WebkitOverflowScrolling: "touch", cursor: onPlayFirst ? "pointer" : "default" }}>
        <span ref={innerRef} style={{ display: "inline-block" }}>
          <TypedMoveLine startPly={startPly} sans={l.sans} posKeyBase={posKeyBase} />
        </span>
      </div>
      {showFade && <div style={{ position: "absolute", right: 0, top: 0, bottom: 0, width: 26, pointerEvents: "none", background: "linear-gradient(to right, rgba(20,12,6,0), rgba(20,12,6,1) 80%)", borderRadius: "0 6px 6px 0" }} />}
    </motion.div>
  );
}
export function EngineLines({ lines, pending, sans, width, onPlayFirst, forced, large, font }) {
  const hasLines = lines && lines.length;
  const posKey = sans.join(" ");
  if (!hasLines && !pending) return null;
  // (v0.2.2 버그 수정) 실시간 스트리밍 도중 멀티PV 슬롯이 1개→2개→3개로 순차적으로 채워지면서
  // engineLines 배열 길이가 잠깐 1~2로 줄었다가 다시 3으로 늘어, 그때마다 이 블록의 높이가 바뀌어
  // 분석 탭 체스보드(belowEval 아래)가 위아래로 들썩였다 — 실제 줄 수와 무관하게 항상 3줄 높이를
  // 차지하도록, 모자란 슬롯은 스켈레톤으로 채워 넣는다.
  // (UI) 사용자 요청 — 둘 수 있는 수가 1~2개뿐인 국면(forced)에서는 어차피 스켈레톤이 계속 채워질
  // 리 없으므로(엔진이 그 이상 줄을 낼 수 없음), 남은 자리를 로딩 스켈레톤 대신 빈 칸으로 둔다.
  const missing = Math.max(0, 3 - (lines ? lines.length : 0));
  // (버그 수정) flex 자식은 기본적으로 min-width:auto라, 안의 기보 텍스트(nowrap)가 길면 이
  // 텍스트 div가 자기 콘텐츠 폭만큼 커지려 하고(overflow-x:auto가 있어도 그 자체로는 이 기본값을
  // 못 이긴다) — 그 결과 줄(row)과 이 wrapper, 나아가 분석 탭 grid 컬럼까지 전부 그 폭에 맞춰
  // 밀려 커지며 페이지 전체가 옆으로 밀려나 보드 오른쪽이 잘리는 모바일 왜곡의 원인이었다. 텍스트
  // div·줄(row) 모두에 minWidth:0을 줘 실제로 줄 폭만큼만 차지하고 나머지는 그 안에서만
  // 스크롤되도록(overflow-x:auto가 비로소 제대로 작동) 막는다. wrapper에도 overflow:hidden을
  // 더해, 혹시라도 새는 경우 이 컴포넌트 선에서 끝나고 위로 전파되지 않게 한다.
  return (
    <div style={{ width, minWidth: 0, margin: large ? "0 0 8px" : "0 auto 8px", display: "flex", flexDirection: "column", gap: 2, overflow: "hidden" }}>
      {hasLines
        ? <>
          {lines.map((l, i) => {
            // (v0.2.4 버그 수정, v0.2.6에서 슬롯 기반으로 재수정) 한때는 이 자리를 그 줄의 첫 수로
            // 키를 잡았었다(MultiPV 순위가 바뀌면 배열 인덱스만으로는 완전히 다른 수순이 같은 자리에
            // 재사용되며 이전 타이핑 진행 상태를 잘못 물려받는 문제가 있었기 때문). 그런데 첫 수로
            // 키를 잡으면 반대로, 순위가 바뀔 때마다(포지션은 그대로인데도) 이 자리 전체가
            // 언마운트·재마운트돼 타이핑이 처음부터 다시 시작되며 화면이 잠깐 비어 보이는 문제가
            // 있었다(EngineLineRow 위 주석 참고) — 배열 인덱스(슬롯 번호)로 다시 돌아가되, 대신
            // TypedMoveLine의 타이핑 진행 상태가 슬롯이 아니라 "포지션"에만 반응하도록 posKey를
            // 구성해(EngineLineRow 참고) 두 문제를 모두 피한다.
            // (신규) 이제는 타이핑 애니메이션 자체가 없어졌으므로(TypedMoveLine 주석 참고) 재마운트로
            // 인한 리스크가 사라졌다 — depth가 깊어지며 순위가 바뀔 때 그 이동을 그대로 보여주기
            // 위해, 슬롯 번호 대신 이 줄의 첫 수(수의 정체성)로 key를 잡는다. 같은 첫 수가 그대로
            // 다른 순위로 옮겨가면 React가 같은 DOM 노드를 재사용해 이동시키고, motion.div layout이
            // 그 이동을 부드러운 애니메이션으로 자동 보여준다(FLIP). 첫 수가 아예 새로 등장/이탈하면
            // (다른 후보로 완전히 교체) 자연스럽게 새 컴포넌트로 마운트/언마운트된다.
            const rowKey = (l.sans && l.sans[0]) || ("slot" + i);
            return (
              <EngineLineRow key={rowKey} l={l} startPly={sans.length} slotIdx={i} posKeyBase={posKey} pending={pending} onPlayFirst={onPlayFirst} large={large} font={font} />
            );
          })}
          {Array.from({ length: missing }, (_, i) => forced ? <EngineLineBlank key={"pad" + i} large={large} /> : <EngineLineSkeleton key={"pad" + i} large={large} />)}
        </>
        : [0, 1, 2].map((i) => <EngineLineSkeleton key={i} large={large} />)}
    </div>
  );
}
