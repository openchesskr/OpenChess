// (v0.6.0, App.jsx 분할) 'dex' 화면과 그 화면만 쓰는 조각
// 동작 변경 없이 App.jsx에서 그대로 옮겼다(REFACTOR_NOTES.md Phase 3 참고).
import { stripSuffix, boardFromSans, moveNumber, sanSrc } from "../lib/chessRules.js";
import React, { useMemo, useState, useEffect, useRef, useCallback, useLayoutEffect } from "react";
import { fmtEvalCp } from "../lib/moveQuality.js";
import { T, BOARD_SKINS, PIECE_SKINS } from "../lib/theme.js";
import { Lock, Check, X, RotateCcw, ChevronRight, Cpu, Save } from "lucide-react";
import { SITE_FONT } from "../components/engineLines.jsx";
import { QCOLOR } from "../lib/moveKinds.js";
import { KeywordChip } from "../components/keywordScroll.jsx";
import { SCHEMATIC_DRAG_MULT, DEX_SELECT_FLOW_SPEED, SCHEMATIC_ELECTRIC, DEX_ELECTRIC_FLOW_SPEED, SCHEMATIC_BOX_W, SCHEMATIC_BOX_H, schematicCoord, SCHEMATIC_ZOOM_LABEL_BASE, snapSchematicZoom, clampSchematicPan, anchoredZoomPan, SCHEMATIC_TOP_INSET, SCHEMATIC_ZOOM_STEP, schematicZoomLabel, DIR_OF_ROOT } from "../lib/schematicGeometry.js";
import { badgeIcon } from "../components/badges.jsx";
import { DEX_LAYOUT } from "../lib/dexTreeLayout.js";
import { playSfx } from "../lib/prefs.js";
import { useFitPanelHeight } from "../lib/dexPanel.js";
import { MastersSchematic } from "./dexMasters.jsx";
import { sansToPgnText } from "../lib/pgn.js";
import { AnimatedMove, CONTENT, CircleBadge, FadeIn, SNAP, SkinShopCard, TITLE_OPENINGS, TITLE_TIERS, TitleBadge, WinBar, addsFor, assignTiers, computeDexLayout, deriveKeywords, fmtFull, forceKindFor, isBookMoveAt, mergeDevAdds, nameOverride, openingNameOf, snapNode, titleId, useNarrow, useSacConfirmTick } from "./common.jsx";

import { t, tx } from "../lib/i18n.js";
// (개편) 도감 오프닝 해금 기준 — 예전에는 분석 탭에서 "집중 분석"에 진입하면 해금됐지만, 이제는
// chess.com 대국 기록에 그 수순이 실제로 한 번이라도 나온 적이 있어야 해금된다(개발자 devUnlockAll은
// 예외). chess.com 연동이 안 되어 있으면 시작 위치를 제외한 모든 수가 잠긴 채로 보인다.
function dexIsUnlocked(chesscom, ccReady, unlockAll, pathSans) {
  if (unlockAll) return true;
  if (!pathSans.length) return true;
  if (!ccReady) return false;
  // (v0.0.6 성능) analyze()로 매번 전체 대국을 훑는 대신, useChessCom이 미리 만들어 둔 접두어
  // Set에서 O(1)로 조회한다 — dexIsUnlocked는 도감 트리의 모든 노드(최대 4000개)마다 호출되므로
  // 이 차이가 대국 수가 많은 계정에서 체감되는 렉의 핵심 원인이었다.
  return chesscom.prefixSet.has(pathSans.map(stripSuffix).join(" "));
}
// (개편) 도감 오프닝 상세 블록 — 모식도 안, 그 수 노드 옆에 인라인으로 열리고 닫힌다. 기존 카드 내용
// (미리보기·해금 상태·WDL·내 chess.com 전적)에 수 체계 아이콘·평가치·채택률·수 키워드를 더해 보여준다.
function DexMoveBlock({ path, m, isUnlocked, cc, onClose, style, onOpenOpening, onOpenLearn, vertical, scale = 1, tailPos = null, canAdd, editInfo, onStageAdd, onUnstageAdd, onToggleRemove, boxRef }) {
  // (버그 수정) 흑의 6번째 수(ply 12)처럼 그 수 자신에게는 ECO 명칭이 새로 안 붙는(리체스 API가
  // 그 정확한 위치에 이름을 안 주는) 깊은 이론 라인을 열면, m.name이 없어 그냥 "Main Line"이라는
  // 뭉뚱그린 표시만 떴다 — 실제 원인은 체스 오프닝 이름이 매 수마다 새로 붙는 게 아니라 마지막으로
  // 이름 붙은 조상 위치부터 "그대로 이어지는"(sticky) 성격인데, 이 카드는 그 수 자신의 이름만
  // 보고 조상 쪽은 전혀 안 봤다는 점이다. openingNameOf(경로 전체)는 이미 게임 헤더 등에서 쓰는
  // "그 경로에서 가장 최근에 이름 붙은 조상"을 찾는 함수이므로, 그대로 재사용해 조상 이름을
  // 물려받게 하고, 정말 그 오프닝 자체가 아직 하나도 이름 붙지 않은 극초반에서만 "Main Line"으로
  // 남긴다.
  const label = nameOverride(path.join(" "), m.san) ?? m.name ?? openingNameOf([...path, m.san]) ?? (m.isMain ? "Main Line" : null);
  const ply = path.length;
  const board = useMemo(() => boardFromSans(path), [path.join(" ")]);
  const sacTick = useSacConfirmTick();   // 희생 엔진 확인이 끝나면 등급을 다시 매긴다(v0.5.9 BUG-038)
  const tier = useMemo(() => {
    const node = snapNode(path);
    const rawMoves = mergeDevAdds(path.join(" "), node ? node.moves : []);
    const tiered = assignTiers(rawMoves, ply, board, path.join(" "), path);
    return tiered.find((x) => x.san === m.san) || null;
  }, [path.join(" "), m.san, board, sacTick]);
  const kind = (tier && tier.kind) || (m.book ? "book" : "pending");
  const kws = m.book ? deriveKeywords(m) : (Array.isArray(m.kw) ? m.kw : []);
  const evTxt = m.evalCp != null ? fmtEvalCp(m.evalCp) : null;
  return (
    <div ref={boxRef} className="no-pan" onPointerDown={(e) => e.stopPropagation()} style={{ width: 280, borderRadius: 16, padding: 12, background: isUnlocked ? "linear-gradient(180deg,#FBF5E8,#E2D2B2)" : "linear-gradient(180deg,#33261A,#221610)", boxShadow: "0 10px 30px -8px rgba(0,0,0,.65)", border: "1px solid " + (isUnlocked ? "#CDB98E" : "#000"), position: "absolute", zIndex: 50, transform: scale !== 1 ? "scale(" + scale + ")" : undefined, transformOrigin: tailPos == null ? undefined : (vertical ? tailPos + "px 0px" : "0px " + tailPos + "px"), ...style }}>
      {/* (v0.2.2 UI#2) 말풍선 꼬리 — 이 설명 카드가 어느 수 블록에서 나왔는지 시각적으로 이어 주고,
          블록 자신은 가리지 않도록 카드를 블록 바깥(세로 모식도=아래, 가로 모식도=오른쪽)에 두고 그
          블록을 향해 삼각형 꼬리를 뻗는다. tailPos(px)는 카드 가장자리에서 블록 중심이 있는 지점. */}
      {tailPos != null && (
        <div aria-hidden="true" style={vertical
          ? { position: "absolute", top: -9, left: tailPos, transform: "translateX(-50%)", width: 0, height: 0, borderLeft: "9px solid transparent", borderRight: "9px solid transparent", borderBottom: "9px solid " + (isUnlocked ? "#FBF5E8" : "#33261A"), filter: "drop-shadow(0 -1px 0 " + (isUnlocked ? "#CDB98E" : "#000") + ")" }
          : { position: "absolute", left: -9, top: tailPos, transform: "translateY(-50%)", width: 0, height: 0, borderTop: "9px solid transparent", borderBottom: "9px solid transparent", borderRight: "9px solid " + (isUnlocked ? "#F1E4CB" : "#2C1E13"), filter: "drop-shadow(-1px 0 0 " + (isUnlocked ? "#CDB98E" : "#000") + ")" }} />
      )}
      {/* (버그 수정) 아래 보드 미리보기 래퍼(position:relative)가 z-index 없이도 DOM 순서상 이 버튼
          위에 그려져, 카드 폭 전체에 걸친 그 래퍼의 투명 영역이 X 버튼 클릭을 가로채고 있었다 —
          명시적 z-index로 항상 위에 오도록 고정한다. */}
      <button onClick={onClose} aria-label={t("블록 닫기")} className="press" style={{ position: "absolute", top: 8, right: 8, width: 24, height: 24, borderRadius: 7, border: "none", background: "rgba(0,0,0,.15)", color: isUnlocked ? T.ink : T.ivory, cursor: "pointer", zIndex: 5 }}>✕</button>
      <div style={{ position: "relative" }}>
        {isUnlocked ? <AnimatedMove sans={path} san={m.san} size={200} />
          : <div style={{ width: 162, height: 162, margin: "0 auto", borderRadius: 9, background: "repeating-linear-gradient(45deg,#2A1B10,#2A1B10 8px,#33261A 8px,#33261A 16px)", display: "flex", alignItems: "center", justifyContent: "center" }}><Lock size={28} style={{ color: T.brass }} /></div>}
      </div>
      <div className="flex items-center gap-2" style={{ marginTop: 10, flexWrap: "wrap" }}>
        <CircleBadge kind={kind} descOnClick />
        {/* (UI) 사용자 요청 — 이 수를 누르면 그 기보가 입력된 분석 탭으로 바로 이동한다(예전엔
            집중 분석 모드로 이동했었다). */}
        {onOpenLearn
          ? <button onClick={() => onOpenLearn([...path, m.san])} className="press" style={{ fontFamily: SITE_FONT, fontWeight: 800, fontSize: 17, color: isUnlocked ? T.ink : "#8A7458", background: "none", border: "none", padding: 0, cursor: "pointer", textDecoration: "underline", textUnderlineOffset: 2 }}>{moveNumber(ply)}{m.san}</button>
          : <span style={{ fontFamily: SITE_FONT, fontWeight: 800, fontSize: 17, color: isUnlocked ? T.ink : "#8A7458" }}>{moveNumber(ply)}{m.san}</span>}
        {evTxt && <span style={{ fontFamily: SITE_FONT, fontWeight: 700, fontSize: 12.5, color: QCOLOR[kind] }}>{evTxt}</span>}
        <span style={{ marginLeft: "auto" }}>{isUnlocked ? <span style={{ display: "inline-flex", alignItems: "center", color: T.best }}><Check size={15} /></span> : <span style={{ fontSize: 11, color: "#8A7458", fontWeight: 700 }}>{t("미해금")}</span>}</span>
      </div>
      {/* (사용자 요청) 도감의 수 키워드도 수 블록·현재 수 블록과 완전히 같은 클릭형 안전 영역 말풍선을 쓴다. */}
      {kws.length > 0 && <div className="flex flex-wrap gap-1" style={{ marginTop: 7 }}>{kws.map((k) => <KeywordChip key={k} k={k} />)}</div>}
      {/* (사용자 요청) 오프닝 이름을 누르면 그 기보가 입력된 분석 탭으로 바로 이동한다(예전엔
          집중 분석 모드로 이동했었다). */}
      {label && (onOpenLearn
        ? <button onClick={() => onOpenLearn([...path, m.san])} className="press text-left" style={{ display: "block", width: "100%", fontSize: 12.5, fontWeight: 700, color: isUnlocked ? T.brass : T.brassHi, marginTop: 6, wordBreak: "keep-all", background: "none", border: "none", padding: 0, cursor: "pointer", textDecoration: "underline" }}>{label}</button>
        : onOpenOpening
        ? <button onClick={() => onOpenOpening(label)} className="press text-left" style={{ display: "block", width: "100%", fontSize: 12.5, fontWeight: 700, color: isUnlocked ? T.brass : T.brassHi, marginTop: 6, wordBreak: "keep-all", background: "none", border: "none", padding: 0, cursor: "pointer", textDecoration: "underline" }}>{label}</button>
        : <div style={{ fontSize: 12.5, fontWeight: 700, color: isUnlocked ? T.ink : T.ivory, marginTop: 6, wordBreak: "keep-all" }}>{label}</div>)}
      {m.games != null && <div style={{ fontSize: 10.5, color: isUnlocked ? T.inkSoft : T.ivory, fontFamily: SITE_FONT, marginTop: 4 }}>{tx("채택률 {0} · {1}국", m.adopt != null ? m.adopt.toFixed(1) + "%" : "—", fmtFull(m.games))}</div>}
      {isUnlocked && m.wdl && <div style={{ marginTop: 8 }}><WinBar wdl={m.wdl} /></div>}
      {isUnlocked && cc && cc.total > 0 && (
        <div className="flex items-center justify-between" style={{ marginTop: 8, fontSize: 11, fontFamily: SITE_FONT, color: T.inkSoft, background: "rgba(60,138,60,.12)", border: "1px solid rgba(60,138,60,.3)", borderRadius: 7, padding: "6px 10px", gap: 8, flexWrap: "wrap", letterSpacing: ".02em" }}>
          <span style={{ fontWeight: 800, color: "#2E6E2E" }}>{tx("내 승률 {0}", cc.winRate)}%</span>
          <span><span style={{ color: T.best }}>{tx("{0}승", cc.w)}</span> {tx("{0}무 {1} · {2}판", cc.d, <span style={{ color: T.blunder }}>{tx("{0}패", cc.l)}</span>, fmtFull(cc.total))}</span>
        </div>
      )}
      {/* (사용자 요청) 개발자 모드 오프닝 트리 인라인 편집 — 별도 화면 대신 선택한 수의 이 카드
          안에서 바로 자녀·형제 수를 추가/삭제한다(저장 전까지 미반영). */}
      {canAdd && editInfo && <DexTreeEditSection path={path} san={m.san} isUnlocked={isUnlocked} editInfo={editInfo} onStageAdd={onStageAdd} onUnstageAdd={onUnstageAdd} onToggleRemove={onToggleRemove} />}
    </div>
  );
}
// (사용자 요청) 개발자 모드 오프닝 트리 인라인 편집 도구 — DexMoveBlock(선택한 수의 상세 카드) 안에
// 점선("유령") 테두리 블록으로 붙는다. 여기서 만드는 변경은 CONTENT에 바로 쓰이지 않고 draft에만
// 쌓인다(OpeningSchematic의 stageAdd/unstageAdd/toggleStageRemove) — 저장 버튼을 눌러야 실제
// 반영되어 트리가 재생성된다. 선택한 수 주변에만 이 작은 카드 하나가 늘어날 뿐이라 전체 트리
// 레이아웃에는 영향이 없다.
function DexTreeEditSection({ path, san, isUnlocked, editInfo, onStageAdd, onUnstageAdd, onToggleRemove }) {
  const [addKind, setAddKind] = useState(null); // null | "child" | "sibling"
  const [sanIn, setSanIn] = useState("");
  const [nameIn, setNameIn] = useState("");
  const [err, setErr] = useState("");
  const ghostStyle = { border: "1.5px dashed " + T.brassHi, borderRadius: 8, background: "rgba(236,203,134,.1)" };
  const openForm = (kind) => { setAddKind(kind); setSanIn(""); setNameIn(""); setErr(""); };
  const submit = () => {
    const targetPath = addKind === "child" ? [...path, san] : path;
    const errMsg = onStageAdd(targetPath, sanIn, nameIn);
    if (errMsg) { setErr(errMsg); return; }
    setAddKind(null);
  };
  const chip = (key, label, onRemove) => (
    <span key={key} style={{ ...ghostStyle, display: "inline-flex", alignItems: "center", gap: 5, padding: "3px 7px", fontSize: 10.5, fontWeight: 700, color: T.brassHi, marginRight: 5, marginBottom: 5 }}>
      {label}
      <button onClick={onRemove} aria-label={t("대기 취소")} className="press" style={{ background: "none", border: "none", color: T.brassHi, cursor: "pointer", padding: 0, display: "inline-flex" }}><X size={10} /></button>
    </span>
  );
  return (
    <div style={{ marginTop: 10, paddingTop: 10, borderTop: "1px dashed " + (isUnlocked ? "#CDB98E" : "#4A3826") }}>
      <div style={{ fontSize: 10, fontWeight: 800, color: isUnlocked ? T.inkSoft : T.ivory, marginBottom: 6 }}>{t("개발자 · 이론 수 편집(저장 전까지 미반영)")}</div>
      {(editInfo.childAdds.length > 0 || editInfo.siblingAdds.length > 0) && (
        <div>
          {editInfo.childAdds.map((a) => chip("c" + a.san, t("+ {0} (자녀)", a.san), () => onUnstageAdd([...path, san], a.san)))}
          {editInfo.siblingAdds.map((a) => chip("s" + a.san, t("+ {0} (형제)", a.san), () => onUnstageAdd(path, a.san)))}
        </div>
      )}
      <div className="flex items-center gap-2" style={{ flexWrap: "wrap" }}>
        <button onClick={() => openForm("child")} className="press" style={{ ...ghostStyle, padding: "4px 9px", display: "inline-flex", alignItems: "center", gap: 4, cursor: "pointer", color: T.brassHi, fontSize: 10.5, fontWeight: 800 }}>{t("＋ 자녀 수")}</button>
        <button onClick={() => openForm("sibling")} className="press" style={{ ...ghostStyle, padding: "4px 9px", display: "inline-flex", alignItems: "center", gap: 4, cursor: "pointer", color: T.brassHi, fontSize: 10.5, fontWeight: 800 }}>{t("＋ 형제 수")}</button>
        <button onClick={() => onToggleRemove(path, san)} className="press" style={{ ...ghostStyle, padding: "4px 9px", display: "inline-flex", alignItems: "center", gap: 4, cursor: "pointer", color: editInfo.selfRemoved ? T.blunder : T.inkSoft, fontSize: 10.5, fontWeight: 800, borderColor: editInfo.selfRemoved ? T.blunder : T.brassHi }}>
          {editInfo.selfRemoved ? t("삭제 취소") : t("이 수 삭제")}
        </button>
      </div>
      {addKind && (
        <div style={{ ...ghostStyle, marginTop: 6, padding: 8, display: "flex", flexDirection: "column", gap: 5 }}>
          <div style={{ fontSize: 10, color: T.brassHi, fontWeight: 800 }}>{addKind === "child" ? t("자녀 수 추가") : t("형제 수 추가")}</div>
          <input value={sanIn} onChange={(e) => setSanIn(e.target.value)} placeholder={t("SAN (예: Nf3)")} style={{ padding: "5px 7px", borderRadius: 6, border: "1px solid #C9B58C", fontSize: 11.5, boxSizing: "border-box" }} />
          <input value={nameIn} onChange={(e) => setNameIn(e.target.value)} placeholder={t("오프닝 이름(선택)")} style={{ padding: "5px 7px", borderRadius: 6, border: "1px solid #C9B58C", fontSize: 11.5, boxSizing: "border-box" }} />
          {err && <div style={{ fontSize: 10, color: T.blunder }}>{err}</div>}
          <div className="flex gap-2">
            <button onClick={submit} className="press" style={{ flex: 1, padding: "5px 0", borderRadius: 6, border: "none", background: T.brass, color: "#241509", fontWeight: 800, fontSize: 11, cursor: "pointer" }}>{t("추가 대기")}</button>
            <button onClick={() => setAddKind(null)} className="press" style={{ flex: 1, padding: "5px 0", borderRadius: 6, border: "1px solid #C9B58C", background: "transparent", color: T.inkSoft, fontWeight: 700, fontSize: 11, cursor: "pointer" }}>{t("닫기")}</button>
          </div>
        </div>
      )}
    </div>
  );
}
// (개편) 전체 수 트리 모식도 — 데스크톱은 가로(왼쪽→오른쪽), 모바일은 세로(위→아래)로 뻗어나간다.
// 클릭으로 펼칠 필요 없이 최소 3수 + 채택률 20% 이상 라인까지 미리 다 펼쳐진 트리가 렌더링되고,
// 노드를 클릭하면 그 수의 상세 블록이 모식도 안, 그 노드 옆에 바로 열리고 닫힌다.
// (버그 수정) 트리가 한쪽 방향(가로 한 줄)으로만 계속 길어져 세로 폭이 지나치게 커지고
// 괴랄해 보인다는 피드백 — 주요 첫 수 4개(1.e4/1.d4/1.c4/1.Nf3)만 정중앙에 모아 두고, 그
// 아래 갈래를 각각 동서남북 한 방향으로 뻗어나가게 한다. 나머지 덜 주요한(SIDESTEPPING) 첫 수
// (1.Nc3/1.b4/1.f4/1.g3)는 이 나침반형 모식도에서는 아예 다루지 않는다.
// (버그 수정) "부모·자녀 거리는 좋은데 겹침이 너무 많다" — 네 첫 수가 각자 ~90°(엄밀히는 그보다
// 좁은 SECTOR_HALF)씩 나눠 쓰던 각도 예산을 특단으로 늘린다. 대표 두 수(e4/d4)만 남기고 각각
// 화면의 위쪽 절반·아래쪽 절반(180°)을 통째로 쓰게 하면, 같은 부모·자녀 반지름 간격을 유지한
// 채로도 각 팔의 형제·리프가 나눠 쓸 각도 예산이 이전의 2배 이상(4개가 나누던 ~90°×0.94 대비
// 2개가 나누는 180°×0.94)으로 늘어나, 깊은 단계에서 각도 몫이 기하급수적으로 줄어드는 근본
// 문제(반지름 폭증의 원인이자 겹침의 원인)가 그만큼 완화된다.
// (v0.0.6 성능) 팬/드래그는 pan/zoom 상태만 바꾸고 items/edges 자체는 그대로인데도, 이 두 배열을
// 그리는 코드가 OpeningSchematic 함수 본문 안에 있으면 pan/zoom이 바뀔 때마다(드래그 중 초당
// 수십 번) React가 노드 수천 개의 스타일 객체를 처음부터 다시 계산했다 — 이게 트리가 클 때 드래그가
// 버벅이던 핵심 원인. 별도 memo 컴포넌트로 떼어내, items/edges(둘 다 pan/zoom과 무관하게 트리
// 구조가 실제로 바뀔 때만 새로 생성됨) 참조가 그대로인 동안은 다시 그리지 않게 한다.
const DexEdgesLayer = React.memo(function DexEdgesLayer({ edges, selectedKeySet, electric, selectedTargetR }) {
  // (사용자 요청) 선택 경로가 중심에서부터 거리 비례로(0.3~1초) 서서히 파란색으로 흘러가도록 —
  // 목표 노드까지의 거리(selectedTargetR)를 속도로 나눠 총 애니메이션 길이를 정한다.
  const selDuration = selectedTargetR ? Math.min(1, Math.max(0.3, selectedTargetR / DEX_SELECT_FLOW_SPEED)) : 0;
  return edges.map(([p, c]) => {
    if (p.depth === 0 || !c.edgeD) return null;
    const isSel = selectedKeySet && selectedKeySet.has(c.key);
    // (v0.2.2 UX#2) 회로 칩을 누르면 전류가 중앙에서 바깥으로 퍼져나가는 느낌을 주기 위해, 모든 선에
    // 거리에 비례한 delay로 전기 서지 애니메이션을 얹는다(선택된 선은 평소대로 흐름 유지).
    const surge = electric && !isSel;
    const wStroke = (isSel || surge) ? 3 : 2;
    const eStroke = (isSel || surge) ? SCHEMATIC_ELECTRIC : c.unlocked ? (c.kind === "book" ? T.book : T.brass) : "#C9B58C";
    const selDelay = isSel && selectedTargetR ? (c.r / selectedTargetR) * selDuration : 0;
    const surgeDelay = surge ? c.r / DEX_ELECTRIC_FLOW_SPEED : 0;
    return <path key={p.key + "→" + c.key} className={surge ? "dex-surge-line" : (isSel ? "dex-current-line" : undefined)} d={c.edgeD} fill="none" stroke={eStroke} strokeWidth={wStroke} opacity={(isSel || surge) ? 1 : c.unlocked ? 0.9 : 0.45} strokeLinecap="round" strokeLinejoin="round"
      style={(isSel || surge) ? { strokeDasharray: "7 5", transition: isSel ? "stroke .25s ease " + selDelay + "s, opacity .25s ease " + selDelay + "s" : undefined, animationDelay: surge ? surgeDelay + "s" : undefined } : undefined} />;
  });
});
const DexNodesLayer = React.memo(function DexNodesLayer({ items, openKey, selectedKeySet, onSelect, electric, selectedTargetR }) {
  const boxW = SCHEMATIC_BOX_W, boxH = SCHEMATIC_BOX_H;
  const selDuration = selectedTargetR ? Math.min(1, Math.max(0.3, selectedTargetR / DEX_SELECT_FLOW_SPEED)) : 0;
  return items.map((it) => {
    const { x, y } = schematicCoord(it);
    const isOpen = openKey === it.key;
    const isSel = selectedKeySet && selectedKeySet.has(it.key);
    const w = boxW, h = boxH;
    const kind = it.kind || "pending";
    const isBook = kind === "book";
    const sub = isOpen ? "#241509" : it.unlocked ? QCOLOR[kind] : "#8A7458";
    const evTxt = it.evalCp != null ? fmtEvalCp(it.evalCp) : null;
    const selDelay = isSel && selectedTargetR ? (it.r / selectedTargetR) * selDuration : 0;
    const surgeDelay = electric ? (it.r || 0) / DEX_ELECTRIC_FLOW_SPEED : 0;
    // (v0.5.6, 사용자 요청) 내 chess.com 전적·승률 칩 — 이 수순까지 실제로 둔 내 대국이 있으면 블록 아래 가장자리에 걸쳐 "7승 2무 3패 · 58%"를
    // 보여준다(예전엔 3판 이상일 때 오른쪽 위에 승률 %만). 승률 색은 기존 등급 색(최선=초록, 부정확=노랑, 블런더=빨강)을 쓰고, 표본이 3판
    // 미만이면 0%/100%로 튀어 오해를 살 수 있어 색 없이(회색) 보여준다. 칩이 블록 밖으로 나오는 높이(DEX_LAYOUT.CHIP_BELOW)만큼은
    // 배치 단계에서 라벨이 비켜 두므로 다른 요소와 겹치지 않는다.
    const showRec = it.myN >= 1 && it.myWr != null;
    const wrColor = it.myN < 3 ? "#8A7458" : it.myWr >= 60 ? T.best : it.myWr >= 40 ? T.inaccuracy : T.blunder;
    return (
      <div key={it.key} style={{ position: "absolute", left: x, top: y, width: boxW, height: boxH }}>
        <span style={{ position: "absolute", left: (boxW - w) / 2 - 6, top: (boxH - h) / 2 - 6, width: 17, height: 17, borderRadius: "50%", background: isOpen ? "#241509" : sub, color: isOpen ? T.brassHi : "#fff", border: "1.5px solid " + (it.unlocked ? "#fff" : "#8A7458"), display: "inline-flex", alignItems: "center", justifyContent: "center", boxShadow: "0 1px 3px rgba(0,0,0,.4)", zIndex: (isOpen ? 40 : 1) + 1, pointerEvents: "none" }}>{badgeIcon(kind, 14)}</span>
        <button onClick={() => onSelect(it.key)} className={"press" + (electric ? " dex-surge-node" : "")} style={{ position: "absolute", left: (boxW - w) / 2, top: (boxH - h) / 2, width: w, height: h, borderRadius: 8, border: isSel ? "2px solid " + SCHEMATIC_ELECTRIC : (isBook && it.unlocked && !isOpen ? "2px" : "1.5px") + " solid " + (isOpen ? T.brass : it.unlocked ? (isBook ? T.book : "#CDB98E") : "#00000055"), background: isOpen ? "linear-gradient(180deg," + T.brass + "," + T.book + ")" : it.unlocked ? (isBook ? "linear-gradient(160deg,#F3E6CC,#E2C89A)" : "linear-gradient(160deg,#F8F1E1,#EEE1C4)") : "repeating-linear-gradient(45deg,#2A1B10,#2A1B10 6px,#33261A 6px,#33261A 12px)", boxShadow: isSel ? "0 0 9px 1px rgba(34,211,240,.65)" : isBook && it.unlocked && !isOpen ? "inset 0 0 0 1px rgba(138,90,43,.35)" : "none", color: isOpen ? "#241509" : it.unlocked ? (isBook ? T.book : T.ink) : "#8A7458", fontFamily: SITE_FONT, fontWeight: 800, cursor: "pointer", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 1, padding: "2px 3px", zIndex: isOpen ? 40 : 1, boxSizing: "border-box", transition: isSel ? "border-color .25s ease " + selDelay + "s, box-shadow .25s ease " + selDelay + "s" : undefined, animationDelay: electric ? surgeDelay + "s" : undefined }}>
          <span style={{ display: "inline-flex", alignItems: "center", gap: 3, fontSize: 12 }}>
            {!it.unlocked && <Lock size={10} />}
            {moveNumber(it.path.length - 1)}{it.san}
          </span>
          {evTxt && <span style={{ fontSize: 8.5, fontWeight: 700, opacity: 0.85 }}>{evTxt}</span>}
        </button>
        {showRec && (
          <span title={t("내 chess.com 전적 {0}판: {1}승 {2}무 {3}패, 승률 {4}%", it.myN, it.myW, it.myD, it.myL, it.myWr)}
            style={{ position: "absolute", left: "50%", top: boxH + 3, transform: "translateX(-50%)", height: 16, padding: "0 6px", borderRadius: 8, background: "#FFFDF6", border: "1.5px solid " + wrColor, boxShadow: "0 1px 3px rgba(0,0,0,.3)", display: "inline-flex", alignItems: "center", gap: 4, whiteSpace: "nowrap", fontFamily: SITE_FONT, fontSize: 8.5, fontWeight: 800, color: T.ink, zIndex: (isOpen ? 40 : 1) + 1, pointerEvents: "none" }}>
            <span>{tx("{0}승 {1}무 {2}패", it.myW, it.myD, it.myL)}</span>
            <span style={{ color: wrColor }}>{it.myWr}%</span>
          </span>
        )}
      </div>
    );
  });
});
function OpeningSchematic({ tabsSlot, treeData, treeVersion, openKey, onToggleOpen, chesscom, ccReady, unlockAll, vertical, onOpenOpening, onOpenLearn, priorityRef, onUnlockStats, contentVer, canAdd, bumpContent, rightSlot }) {
  const boxW = SCHEMATIC_BOX_W, boxH = SCHEMATIC_BOX_H;
  // (v0.3.2 개편 → v0.5.6) 나침반형 방사 트리 — 1수(e4/d4)는 중심 회로 칩에서 정확히 위/아래 ROOT_GAP 거리에 두고, 그 아래는 팔마다
  // 반원 안에서 방사형으로 뻗는다. 각도·반지름·라벨 자리 계산 규칙은 전부 src/lib/dexTreeLayout.js 머리 주석에 모았다.
  const ROOT_GAP = DEX_LAYOUT.ROOT_GAP;
  // (기능) 나침반 정중앙에 두는 회로 칩 장식의 한 변 길이.
  const CHIP_SIZE = 60;
  // (v0.5.6 개편, 사용자 요청 "더 빠르게, 겹침 없이, 더 효율적으로") 배치를 두 단계로 나눈다.
  //  1) 구조 → 좌표(layout): 어떤 이론 수가 어떤 순서로 있는지(구조)만으로 좌표·라벨 자리를 계산한다(src/lib/dexTreeLayout.js).
  //     구조가 그대로면(키 목록 서명이 같으면) 이전 계산을 그대로 돌려줘, 배경에서 채택률·이름이 220ms마다 도착해도 좌표 계산은 다시
  //     돌지 않는다(예전엔 매번 4000개 노드 전체 배치 + O(라벨×블록) 라벨 배치를 다시 해 한 번에 최대 0.8초씩 화면이 멈췄다).
  //     좌표가 구조만의 함수라 블록이 로딩 중에 흔들릴 일도 없다 — 예전의 순서 캐시·좌표 캐시·보간 로직이 필요 없어졌다.
  //     형제 순서는 스냅샷(SNAP) 순서(= 채택률 순)로 가운데부터 좌우 번갈아(centerOrderByAdopt) — 늦게 도착하는 채택률에 흔들리지 않는다.
  //     라벨 이름도 로컬 데이터(개발자 수정 이름 → 스냅샷 이름 → openingNameOf)만 써서 구조와 함께 확정한다.
  //  2) 좌표 + 부가 데이터(items): 채택률·등급·평가치·해금·내 승률을 매 갱신마다 가볍게(O(노드 수)) 입힌다.
  // 구조 → 좌표(computeDexLayout, 모듈 캐시) — 구조가 그대로면 캐시를 그대로 돌려준다.
  const layout = useMemo(() => computeDexLayout(treeData, contentVer), [treeData, treeVersion, contentVer]); // eslint-disable-line react-hooks/exhaustive-deps
  const { centerX, centerY, width, height, bounds } = layout;
  const groups = layout.labels;
  const { items, edges, itemByKey } = useMemo(() => {
    const items = [], edges = [], itemByKey = new Map();
    const tierCache = new Map();
    const parentMoves = (parentKey, parentPath) => {
      if (tierCache.has(parentKey)) return tierCache.get(parentKey);
      // 채택률·이름 등은 treeData(리체스 병합)에서, 개발자 추가 수는 같은 모양(devAddEntry)으로 보충한다.
      const snapNodeHere = SNAP.tree[parentKey];
      const base = treeData.get(parentKey) || (snapNodeHere && snapNodeHere.moves) || [];
      const rawMoves = mergeDevAdds(parentKey, base);
      const filtered = (rawMoves || []).filter((m) => isBookMoveAt(parentKey, m.san));
      // 트리엔 이론 수만 있어 등급은 거의 항상 "이론"이다 — 희생 판정용 보드는 이론이 아닌 수가 섞인 드문 경우에만 만든다.
      const needBoard = filtered.some((m) => !m.book && !forceKindFor(parentKey, m.san));
      const tiered = assignTiers(filtered, parentPath.length, needBoard ? boardFromSans(parentPath) : null, parentKey, parentPath);
      const v = { rawMoves, tiered };
      tierCache.set(parentKey, v);
      return v;
    };
    for (const n of layout.nodes) {
      const parentPath = n.path.slice(0, -1), parentKey = parentPath.join(" ");
      const { rawMoves, tiered } = parentMoves(parentKey, parentPath);
      const m = rawMoves.find((x) => x.san === n.san) || { san: n.san };
      const t = tiered.find((x) => x.san === n.san);
      const own = treeData.get(n.key);
      const myStat = ccReady && chesscom.prefixStats ? chesscom.prefixStats.get(n.path.map(stripSuffix).join(" ")) : null;
      const it = {
        san: n.san, path: n.path, depth: n.depth, key: n.key, dir: n.dir,
        adopt: n.depth === 1 ? 100 : (m.adopt || 0), kind: t ? t.kind : (m.book ? "book" : "pending"), evalCp: m.evalCp != null ? m.evalCp : null,
        name: nameOverride(parentKey, n.san) ?? m.name ?? null,
        hasChildren: !!((own && own.length) || addsFor(n.key).length), unlocked: dexIsUnlocked(chesscom, ccReady, unlockAll, n.path),
        myWr: myStat ? Math.round(100 * myStat.w / myStat.n) : null, myN: myStat ? myStat.n : 0, myW: myStat ? myStat.w : 0, myD: myStat ? myStat.d : 0, myL: myStat ? myStat.l : 0,
        x: n.x, y: n.y, r: n.r, angle: n.angle, slotWidth: n.slotWidth, edgeD: n.edgeD, edgePts: n.edgePts,
      };
      items.push(it);
      itemByKey.set(n.key, it);
      if (n.depth >= 2) { const p = itemByKey.get(parentKey); if (p) edges.push([p, it]); }
    }
    return { items, edges, itemByKey };
  }, [layout, treeData, treeVersion, chesscom, ccReady, unlockAll]);
  // (사용자 요청) 모식도 위 안내 문구 자리에 표시할 "도감 해금률" — 지금까지 펼쳐진 노드(items) 중
  // 해금된 것의 비율을 트리가 자랄 때마다(items가 바뀔 때마다) 부모(CollectionTab)로 올려보낸다.
  useEffect(() => {
    if (!onUnlockStats) return;
    let unlocked = 0;
    for (const it of items) if (it.unlocked) unlocked++;
    onUnlockStats({ unlocked, total: items.length });
  }, [items, onUnlockStats]);
  // (버그 수정) 검색해서 오프닝을 고르면 그 갈래만 남기고 나머지를 다 숨기던 방식이 오히려 트리
  // 전체 맥락을 잃게 해 불편하다는 피드백 — 이제 트리는 항상 전체를 보여주고, 대신 고른 오프닝으로
  // 가는 수순(selectedPath)만 전선에 전류가 흐르듯 색이 강조되도록 한다.
  const [selectedPath, setSelectedPath] = useState(null);
  // (v0.2.2 UX#2) 나침반 정중앙 회로 칩을 누르면 전기 서지 — 칩이 잠깐 과충전되며, 이어지는 모든 선과
  // 블록에 중앙에서 바깥으로(depth 스태거) 전류가 튀며 퍼져나가는 애니메이션을 1회 재생한다.
  const [electric, setElectric] = useState(false);
  const electricTimerRef = useRef(null);
  const triggerElectric = useCallback(() => {
    playSfx("electric", 700);   // (v0.2.2) 전기 흐르는 소리는 처음 0.7초만 재생
    setElectric(false);
    // 다음 프레임에 다시 켜 애니메이션이 매 클릭마다 처음부터 재생되게 한다.
    requestAnimationFrame(() => {
      setElectric(true);
      if (electricTimerRef.current) clearTimeout(electricTimerRef.current);
      electricTimerRef.current = setTimeout(() => setElectric(false), 1500);
    });
  }, []);
  useEffect(() => () => { if (electricTimerRef.current) clearTimeout(electricTimerRef.current); }, []);
  const selectedKeySet = useMemo(() => {
    if (!selectedPath) return null;
    const s = new Set();
    for (let i = 1; i <= selectedPath.length; i++) s.add(selectedPath.slice(0, i).join(" "));
    return s;
  }, [selectedPath]);
  // (사용자 요청) 선택 경로 흐름 애니메이션의 총 길이를 정하기 위한 목표 지점까지의 거리.
  const selectedTargetR = useMemo(() => {
    if (!selectedPath || !selectedPath.length) return 0;
    const key = selectedPath.join(" ");
    const node = itemByKey.get(key);
    return node ? node.r : 0;
  }, [selectedPath, itemByKey]);
  const coord = schematicCoord;
  // (v0.5.6) 예전엔 로딩 중 블록이 흔들리는 걸 가리려고 트리를 열 때마다 3.2초 동안 "불러오는 중…"만 보여줬다. 이제 좌표가 구조만의
  // 함수라(위 layout) 흔들릴 일이 없고, 구조는 앱 시작 직후 로컬 스냅샷에서 한 번에 만들어지므로 기다리지 않고 곧바로 그린다.
  const ready = items.length > 0;
  const [pan, setPan] = useState({ x: 16, y: 16 });
  // (v0.0.6) 다들 첫 화면에서 곧장 75%로 축소해야 편하게 봤다는 피드백 — 그 배율을 새 기준(100%,
  // SCHEMATIC_ZOOM_LABEL_BASE)으로 재정의했으므로, 기본값도 그대로 그 값으로 시작한다.
  const [zoom, setZoom] = useState(SCHEMATIC_ZOOM_LABEL_BASE);
  const dragRef = useRef(null);
  const boxRef = useRef(null);
  const userPannedRef = useRef(false);
  // (사용자 요청) 모식도 영역이 스크롤 없이 한 화면에 다 담기도록, 고정 640px 대신 위쪽에 이미 자리한
  // 요소(탭 버튼줄·해금률 문구 등)와 하단 고정 내비게이션을 뺀 실제 남은 뷰포트 높이에 박스 높이를
  // 맞춘다 — 박스 자신의 top은 자기 높이와 무관(그 위 형제 요소들의 높이로만 결정)하므로 되먹임 없이
  // 한 번에 계산된다. 이렇게 박스가 항상 뷰포트 안에 통째로 들어오면, 나침반 중심 칩을 "박스 자신의
  // 중심"에 맞추는 것만으로도 항상 뷰포트 정중앙에 오게 된다(visibleBoxCenter류의 별도 보정 불필요).
  // (v0.6.3) 높이 계산은 src/lib/dexPanel.js(오프닝·마스터 모식도 공용).
  const panelH = useFitPanelHeight(boxRef, vertical);
  // (기능) 검색·클릭으로 오프닝을 선택하면 화면 중앙으로 이동시키고 살짝 확대해 강조하는데, 이후
  // 사용자가 직접 드래그·휠로 그 노드를 중앙에서 멀리 치워버리면(즉 더 이상 "선택 직후" 뷰가 아니게
  // 되면) 강조 확대만 100%로 되돌리고 색 강조는 그대로 유지한다. 팬/줌 핸들러(특히 한 번만 등록되는
  // 네이티브 휠 리스너)에서도 항상 최신 값을 보게 ref로 들고 있는다.
  const selectionLockRef = useRef(false);
  const itemsRef = useRef(items);
  useEffect(() => { itemsRef.current = items; }, [items]);
  const itemByKeyRef = useRef(itemByKey);
  itemByKeyRef.current = itemByKey;
  const boundsRef = useRef(bounds);
  useEffect(() => { boundsRef.current = bounds; }, [bounds]);
  const selectedPathRef = useRef(selectedPath);
  useEffect(() => { selectedPathRef.current = selectedPath; }, [selectedPath]);
  const panRef = useRef(pan);
  useEffect(() => { panRef.current = pan; }, [pan]);
  const zoomRef = useRef(zoom);
  useEffect(() => { zoomRef.current = zoom; }, [zoom]);
  // (성능) 트리는 최대 4000개 노드·엣지·1500개 라벨까지 자라는데, 컬링 없이 전부 항상 DOM에
  // 그리면 로딩 중(최대 20초, 220ms마다 새로 자람) 매번 그 전체가 다시 그려지고, 다 자란 뒤에도
  // 방대한 레이어(박스섀도우·그라디언트·텍스트 그라디언트 라벨 수천 개) 자체가 계속 화면에
  // 떠 있어 특히 모바일에서 트리를 열 때마다 심하게 버벅였다 — 실제 방사형 배치(items/edges/groups)는
  // 형제·사촌 간 전역 각도·반지름 계산 때문에 트리 전체를 대상으로 그대로 두되(useMemo 위), 화면
  // (뷰포트)보다 넉넉하게(CULL_REFRESH_PAD) 잡은 "그릴 범위" 안의 것만 실제 DOM으로 그린다.
  // 팬/줌이 바뀔 때마다 매번 다시 걸러내면(=CSS transform만으로 부드럽게 팬하던 기존 최적화가
  // 무력화돼) 오히려 매 프레임 필터링·재조정 비용이 든다 — 대신 그릴 범위를 벗어날 만큼
  // (CULL_REFRESH_DRIFT) 실제로 멀리 움직였을 때만, 또는 트리 구조 자체가 자랄 때만 다시 계산한다.
  // (사용자 요청) 빠르게 스크롤(드래그)할 때 그릴 범위 경계가 화면에 보이기 전에 새 블록이 걸러져
  // 나타나는 게 눈에 띄어, 여유를 1.4배 → 2배로 늘려 더 빠른 스크롤에서도 안정적으로 미리 그려 둔다.
  const CULL_REFRESH_PAD = 2;   // 뷰포트 크기의 배수 — 이만큼 여유 있게 미리 그려 둔다.
  const CULL_REFRESH_DRIFT = 0.5; // 뷰포트 크기의 배수만큼 벗어나야 다시 계산한다.
  const cullWindowRef = useRef(null);
  const [cullVersion, setCullVersion] = useState(0);
  const refreshCullWindow = useCallback((force) => {
    const rect = boxRef.current ? boxRef.current.getBoundingClientRect() : { width: 640, height: 640 };
    const p = panRef.current, z = zoomRef.current;
    const cx = (rect.width / 2 - p.x) / z, cy = (rect.height / 2 - p.y) / z;
    const prev = cullWindowRef.current;
    if (!force && prev) {
      const driftX = (rect.width * CULL_REFRESH_DRIFT) / z, driftY = (rect.height * CULL_REFRESH_DRIFT) / z;
      if (Math.abs(cx - prev.cx) < driftX && Math.abs(cy - prev.cy) < driftY) return;
    }
    const padX = (rect.width * CULL_REFRESH_PAD) / z, padY = (rect.height * CULL_REFRESH_PAD) / z;
    cullWindowRef.current = { cx, cy, minX: cx - padX, maxX: cx + padX, minY: cy - padY, maxY: cy + padY };
    setCullVersion((v) => v + 1);
  }, []);
  // 트리 구조가 자랄 때(로딩 중 계속 발생)마다 강제로 다시 계산해, 새로 나타난 노드가 지금 보이는
  // 범위 안에 있으면 곧바로 그려지게 한다.
  useEffect(() => { refreshCullWindow(true); }, [items, refreshCullWindow]);
  // 그 사이(팬/줌/확대버튼/검색 이동 애니메이션 등 팬을 바꾸는 모든 경로)는 여기 한 곳에서 주기적으로
  // 드리프트만 저렴하게 확인한다 — 매 지점마다 일일이 훅을 걸 필요가 없다.
  useEffect(() => {
    const id = setInterval(() => refreshCullWindow(), 150);
    return () => clearInterval(id);
  }, [refreshCullWindow]);
  // (기능) 처음 보여줄 기본 화면은 나침반 중심(centerX, centerY — 회로 칩 자신의 중심점)을 모식도 박스 정중앙에 맞춘다. 사용자가 직접 팬하기
  // 전까지는 박스 크기가 바뀔 때도 다시 맞춘다. (v0.5.6) 예전엔 150ms마다 도는 setInterval로 계속 setPan해 가만히 있어도 초당 7번씩
  // 다시 그렸다 — 좌표가 이제 흔들리지 않으므로, 그리기 전(useLayoutEffect)에 한 번, 그리고 박스 크기가 바뀔 때만 맞춘다.
  const centerRef = useRef({ x: centerX, y: centerY });
  centerRef.current = { x: centerX, y: centerY };
  const recenterHome = useCallback(() => {
    const rect = boxRef.current ? boxRef.current.getBoundingClientRect() : { width: 640, height: 640 };
    const z = zoomRef.current;
    const next = { x: rect.width / 2 - centerRef.current.x * z, y: rect.height / 2 - centerRef.current.y * z };
    setPan((p) => (Math.abs(p.x - next.x) < 0.5 && Math.abs(p.y - next.y) < 0.5 ? p : next));
  }, []);
  useLayoutEffect(() => { if (!userPannedRef.current) recenterHome(); }, [centerX, centerY, panelH, recenterHome]);
  useEffect(() => {
    const onResize = () => { if (!userPannedRef.current) recenterHome(); };
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, [recenterHome]);
  const clampZoom = snapSchematicZoom;
  // (버그 수정) 확대/축소 버튼이 zoom만 바꾸고 pan은 그대로 둬서, 화면 좌상단(콘텐츠 원점) 기준으로
  // 배율이 바뀌었다 — 팬으로 멀리 옮겨온 화면에서 버튼을 누르면 지금 보던 자리가 배율만큼 훌쩍
  // 밀려나 트리 전체가 화면 밖으로 사라진 것처럼 보였다. 지금 화면 중앙 아래 있는 콘텐츠 지점을
  // 그대로 유지하도록 pan을 함께 보정한다.
  const zoomBy = (delta, anchor) => {
    // (버그 수정) 비행 애니메이션이 도는 중에 버튼으로 확대/축소하면, 다음 애니메이션 프레임이
    // 이 변경을 곧장 덮어썼다 — 수동 조작이 시작되면 애니메이션을 멈춘다.
    stopMotion();
    const rect = boxRef.current ? boxRef.current.getBoundingClientRect() : { width: 640, height: 640 };
    const z = zoomRef.current, nz = clampZoom(z + delta);
    if (nz === z) return;
    const ax = anchor ? anchor.x : rect.width / 2, ay = anchor ? anchor.y : rect.height / 2;
    const nextPan = clampSchematicPan(anchoredZoomPan(panRef.current, z, nz, ax, ay), nz, rect.width, rect.height, boundsRef.current, boxW, boxH, SCHEMATIC_TOP_INSET);
    // (v0.5.6 조작감) 배율이 한 번에 툭 바뀌지 않고 짧게(160ms) 부드럽게 바뀐다 — 기준점(화면 중앙·커서·핀치 중심)은 그대로 고정.
    animateView(nextPan, nz, 160, () => checkSelectionDrift(nextPan, nz));
  };
  // (기능) selectionLockRef가 걸려 있는 동안 팬/줌이 바뀔 때마다, 선택된 노드가 화면 중앙에서 얼마나
  // 벗어났는지 검사한다 — 많이 벗어나면(사용자가 직접 화면을 옮긴 것) 확대 강조만 풀고(100%로),
  // 강조 색은 selectedPath가 그대로라 계속 유지된다. ref만 참조하므로 어느 렌더의 클로저에서
  // 호출되어도(예: 마운트 시 한 번만 등록되는 네이티브 휠 리스너) 항상 최신 값으로 동작한다.
  const checkSelectionDrift = (nextPan, nextZoom) => {
    if (!selectionLockRef.current || !selectedPathRef.current) return;
    const key = selectedPathRef.current.join(" ");
    const target = itemByKeyRef.current.get(key);
    if (!target) return;
    const rect = boxRef.current ? boxRef.current.getBoundingClientRect() : { width: 640, height: 640 };
    const c = coord(target);
    const sx = nextPan.x + (c.x + boxW / 2) * nextZoom, sy = nextPan.y + (c.y + boxH / 2) * nextZoom;
    // (버그 수정) 강조 확대를 풀 때 zoom만 되돌리고 pan은 그대로 두면, 화면 좌상단 원점 기준으로
    // 배율이 바뀌면서 지금 보고 있던 자리가 훌쩍 밀려나 트리가 사라진 것처럼 보였다 — 지금 보고
    // 있는 화면 중앙 지점을 그대로 유지하도록 pan도 함께 보정한다.
    if (Math.hypot(sx - rect.width / 2, sy - rect.height / 2) > 80) {
      selectionLockRef.current = false;
      if (nextZoom === SCHEMATIC_ZOOM_LABEL_BASE) return null;
      const anchoredPan = anchoredZoomPan(nextPan, nextZoom, SCHEMATIC_ZOOM_LABEL_BASE, rect.width / 2, rect.height / 2);
      applyView(anchoredPan, SCHEMATIC_ZOOM_LABEL_BASE);
      commitView();
      return anchoredPan; // 드래그 도중이면 호출부가 이 값에서 이어서 끈다(배율이 바뀌었으므로)
    }
    return null;
  };
  const checkSelectionDriftRef = useRef(checkSelectionDrift);
  checkSelectionDriftRef.current = checkSelectionDrift;
  // ---- (v0.5.6 조작감 개편) 팬·줌 제스처 ----
  // · 끄는 동안엔 React 상태를 바꾸지 않고 캔버스 transform만 직접 고친다(applyView) — 예전엔 포인터가 움직일 때마다 setPan으로 이
  //   컴포넌트 전체를 다시 그려(초당 수십 번) 큰 트리에서 드래그가 무거웠다. 손을 떼거나 휠이 멈추면 그때 한 번 상태로 반영(commitView).
  // · 블록 위에서 시작해도 끌 수 있다(예전엔 블록 위에서 누르면 팬이 안 돼, 블록이 빽빽한 곳에선 빈틈을 찾아 눌러야 했다). 6px 이상
  //   움직였으면 끌기로 보고, 손을 뗄 때 따라오는 블록 클릭은 무시한다.
  // · 손을 빠르게 튕기며 떼면 관성으로 조금 더 미끄러지다 멈춘다.
  // · 두 손가락 핀치로 확대/축소(핀치 중심 기준, 25%p 단계로 스냅 — 기존 규칙), 트랙패드 핀치(Ctrl/⌘+휠)도 커서 기준으로.
  // · 빈 곳 더블클릭/더블탭은 그 자리를 기준으로 한 단계 확대.
  // · 비행 애니메이션·관성·줌 애니메이션은 새 조작이 시작되면 즉시 멈춘다(stopMotion) — 여러 경로가 pan을 서로 덮어쓰던 예전 버그 방지.
  const canvasRef = useRef(null);
  const commitTimerRef = useRef(null);
  const motionRafRef = useRef(null);
  const applyView = (p, z) => {
    panRef.current = p; zoomRef.current = z;
    const el = canvasRef.current;
    if (el) el.style.transform = "translate(" + p.x + "px," + p.y + "px) scale(" + z + ")";
  };
  const commitView = () => {
    if (commitTimerRef.current) { clearTimeout(commitTimerRef.current); commitTimerRef.current = null; }
    setPan(panRef.current); setZoom(zoomRef.current);
  };
  const commitSoon = (ms = 140) => {
    if (commitTimerRef.current) clearTimeout(commitTimerRef.current);
    commitTimerRef.current = setTimeout(commitView, ms);
  };
  useEffect(() => () => { if (commitTimerRef.current) clearTimeout(commitTimerRef.current); if (motionRafRef.current) cancelAnimationFrame(motionRafRef.current); }, []);
  const stopMotion = () => {
    if (flightRafRef.current) { cancelAnimationFrame(flightRafRef.current); flightRafRef.current = null; setFlightPath(null); }
    if (motionRafRef.current) { cancelAnimationFrame(motionRafRef.current); motionRafRef.current = null; commitView(); }
  };
  const viewRect = () => (boxRef.current ? boxRef.current.getBoundingClientRect() : { width: 640, height: 640, left: 0, top: 0 });
  const clampView = (p, z) => { const rect = viewRect(); return clampSchematicPan(p, z, rect.width, rect.height, boundsRef.current, boxW, boxH, SCHEMATIC_TOP_INSET); };
  const animateView = (toPan, toZoom, ms, onDone) => {
    const fromPan = panRef.current, fromZoom = zoomRef.current, t0 = performance.now();
    if (motionRafRef.current) cancelAnimationFrame(motionRafRef.current);
    const step = (now) => {
      const t = Math.min(1, (now - t0) / ms), e = 1 - Math.pow(1 - t, 3);
      applyView({ x: fromPan.x + (toPan.x - fromPan.x) * e, y: fromPan.y + (toPan.y - fromPan.y) * e }, fromZoom + (toZoom - fromZoom) * e);
      if (t < 1) motionRafRef.current = requestAnimationFrame(step);
      else { motionRafRef.current = null; applyView(toPan, toZoom); commitView(); if (onDone) onDone(); }
    };
    motionRafRef.current = requestAnimationFrame(step);
  };
  // (v0.6.3, 사용자 요청) 드래그 감도는 마스터 트리와 같은 1배(SCHEMATIC_DRAG_MULT, schematicGeometry.js). 예전엔 3.3배였다.
  const SCHEMATIC_WHEEL_MULT = 1.5;
  const DRAG_THRESHOLD = 6;
  const pointersRef = useRef(new Map()); // pointerId -> {x, y}
  const pinchRef = useRef(null);         // { dist, zoom, content: {x,y} }
  const suppressClickRef = useRef(false);
  const velRef = useRef([]);             // 최근 포인터 표본 [{t, x, y}]
  const localPt = (e) => { const r = viewRect(); return { x: e.clientX - r.left, y: e.clientY - r.top }; };
  const startPinch = () => {
    const pts = [...pointersRef.current.values()];
    const mid = { x: (pts[0].x + pts[1].x) / 2, y: (pts[0].y + pts[1].y) / 2 };
    const p = panRef.current, z = zoomRef.current;
    pinchRef.current = { dist: Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y) || 1, zoom: z, content: { x: (mid.x - p.x) / z, y: (mid.y - p.y) / z } };
    dragRef.current = null;
  };
  const onPointerDown = (e) => {
    // 칩·확대 버튼·검색 등 조작 UI는 그대로 둔다(블록 위에서는 끌기를 허용).
    if (e.target.closest && e.target.closest(".no-pan")) return;
    stopMotion();
    pointersRef.current.set(e.pointerId, localPt(e));
    suppressClickRef.current = false;
    // 포인터 캡처는 실제로 끌기(또는 핀치)가 시작될 때만 건다 — 누르자마자 걸면 블록·버튼의 클릭이 캔버스로 넘어가 사라진다.
    if (pointersRef.current.size === 2) { for (const id of pointersRef.current.keys()) { try { e.currentTarget.setPointerCapture(id); } catch { } } startPinch(); suppressClickRef.current = true; return; }
    if (pointersRef.current.size > 2) return;
    dragRef.current = { sx: e.clientX, sy: e.clientY, px: panRef.current.x, py: panRef.current.y, moved: false };
    velRef.current = [{ t: performance.now(), x: e.clientX, y: e.clientY }];
  };
  const onPointerMove = (e) => {
    if (!pointersRef.current.has(e.pointerId)) return;
    pointersRef.current.set(e.pointerId, localPt(e));
    if (pinchRef.current && pointersRef.current.size >= 2) {
      const pts = [...pointersRef.current.values()];
      const mid = { x: (pts[0].x + pts[1].x) / 2, y: (pts[0].y + pts[1].y) / 2 };
      const dist = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y) || 1;
      const nz = clampZoom(pinchRef.current.zoom * dist / pinchRef.current.dist);
      const c = pinchRef.current.content;
      const next = clampView({ x: mid.x - c.x * nz, y: mid.y - c.y * nz }, nz);
      if (nz !== zoomRef.current || next.x !== panRef.current.x || next.y !== panRef.current.y) {
        userPannedRef.current = true; selectionLockRef.current = false;
        if (openKey) onToggleOpen(openKey);
        applyView(next, nz);
      }
      return;
    }
    const d = dragRef.current;
    if (!d) return;
    const dx = e.clientX - d.sx, dy = e.clientY - d.sy;
    if (!d.moved) {
      if (Math.hypot(dx, dy) < DRAG_THRESHOLD) return;
      d.moved = true; suppressClickRef.current = true;
      try { e.currentTarget.setPointerCapture(e.pointerId); } catch { }
      // (버그 수정) 끌기가 시작되면 비행 애니메이션·선택 고정을 확실히 풀어, 그 뒤로는 오직 이 드래그만 pan을 다룬다.
      userPannedRef.current = true; selectionLockRef.current = false;
      // 카드가 열려 있으면 끄는 순간 닫는다("스크롤하면 같이 사라지도록" 요청).
      if (openKey) onToggleOpen(openKey);
    }
    const now = performance.now();
    velRef.current.push({ t: now, x: e.clientX, y: e.clientY });
    while (velRef.current.length > 2 && now - velRef.current[0].t > 100) velRef.current.shift();
    const next = clampView({ x: d.px + dx * SCHEMATIC_DRAG_MULT, y: d.py + dy * SCHEMATIC_DRAG_MULT }, zoomRef.current);
    applyView(next, zoomRef.current);
    const moved = checkSelectionDrift(next, zoomRef.current);
    if (moved) dragRef.current = { sx: e.clientX, sy: e.clientY, px: moved.x, py: moved.y, moved: true };
  };
  const startInertia = (vx, vy) => {
    // 속도(px/ms, 화면 좌표)를 지수 감쇠시키며 이어서 미끄러진다. 경계에 닿은 축은 그 자리에서 멈춘다.
    let last = performance.now();
    const TAU = 320;
    const step = (now) => {
      const dt = Math.min(40, now - last); last = now;
      const decay = Math.exp(-dt / TAU);
      vx *= decay; vy *= decay;
      const p = panRef.current, raw = { x: p.x + vx * dt, y: p.y + vy * dt };
      const next = clampView(raw, zoomRef.current);
      if (next.x !== raw.x) vx = 0;
      if (next.y !== raw.y) vy = 0;
      applyView(next, zoomRef.current);
      if (Math.hypot(vx, vy) > 0.02) motionRafRef.current = requestAnimationFrame(step);
      else { motionRafRef.current = null; commitView(); }
    };
    motionRafRef.current = requestAnimationFrame(step);
  };
  const onPointerUp = (e) => {
    if (e && e.pointerId != null) pointersRef.current.delete(e.pointerId);
    if (pinchRef.current) {
      if (pointersRef.current.size < 2) { pinchRef.current = null; commitView(); }
      // 한 손가락이 남으면 그 손가락으로 이어서 끌 수 있게 기준점을 다시 잡는다.
      if (pointersRef.current.size === 1) {
        const [pt] = [...pointersRef.current.values()], r = viewRect();
        dragRef.current = { sx: pt.x + r.left, sy: pt.y + r.top, px: panRef.current.x, py: panRef.current.y, moved: true };
        velRef.current = [];
      }
      return;
    }
    const d = dragRef.current;
    dragRef.current = null;
    if (!d || !d.moved) return;
    const v = velRef.current, now = performance.now();
    const first = v.find((q) => now - q.t <= 100) || v[0], lastS = v[v.length - 1];
    const dt = lastS && first ? lastS.t - first.t : 0;
    if (dt > 8 && now - lastS.t < 60) {
      const vx = ((lastS.x - first.x) / dt) * SCHEMATIC_DRAG_MULT, vy = ((lastS.y - first.y) / dt) * SCHEMATIC_DRAG_MULT;
      if (Math.hypot(vx, vy) > 0.35) { startInertia(vx, vy); return; }
    }
    commitView();
  };
  // 끌고 난 뒤 손을 떼는 순간 따라오는 합성 click(블록 버튼)은 선택으로 치지 않는다.
  const onClickCapture = (e) => { if (suppressClickRef.current) { suppressClickRef.current = false; e.stopPropagation(); e.preventDefault(); } };
  const onDoubleClick = (e) => {
    if (e.target.closest && e.target.closest("button, .no-pan")) return;
    zoomBy(SCHEMATIC_ZOOM_STEP, localPt(e));
  };
  // (버그 수정) 마우스 휠은 확대/축소가 아니라 팬(스크롤) — 확대/축소는 우상단 버튼 전용(사용자 요청). React onWheel은 passive라
  // preventDefault가 안 먹어 페이지 전체가 같이 스크롤됐다 — ref에 { passive: false } 리스너를 직접 단다.
  // (v0.5.6) 트랙패드 핀치(브라우저가 Ctrl+휠로 보낸다)·Ctrl/⌘+휠은 커서 기준 확대/축소로 — 일반 휠은 그대로 팬.
  const wheelZoomAccRef = useRef(0);
  const zoomByRef = useRef(zoomBy);
  zoomByRef.current = zoomBy;
  useEffect(() => {
    const el = boxRef.current;
    if (!el) return;
    const handleWheel = (e) => {
      e.preventDefault();
      if (e.ctrlKey || e.metaKey) {
        wheelZoomAccRef.current += e.deltaY;
        if (Math.abs(wheelZoomAccRef.current) >= 40) {
          const r = el.getBoundingClientRect();
          zoomByRef.current(wheelZoomAccRef.current < 0 ? SCHEMATIC_ZOOM_STEP : -SCHEMATIC_ZOOM_STEP, { x: e.clientX - r.left, y: e.clientY - r.top });
          wheelZoomAccRef.current = 0;
        }
        return;
      }
      if (flightRafRef.current) { cancelAnimationFrame(flightRafRef.current); flightRafRef.current = null; setFlightPath(null); }
      if (motionRafRef.current) { cancelAnimationFrame(motionRafRef.current); motionRafRef.current = null; }
      const r = el.getBoundingClientRect();
      const p = panRef.current;
      const next = clampSchematicPan({ x: p.x - e.deltaX * SCHEMATIC_WHEEL_MULT, y: p.y - e.deltaY * SCHEMATIC_WHEEL_MULT }, zoomRef.current, r.width, r.height, boundsRef.current, boxW, boxH, SCHEMATIC_TOP_INSET);
      applyView(next, zoomRef.current);
      const moved = checkSelectionDriftRef.current(next, zoomRef.current);
      if (!moved) commitSoon();
    };
    el.addEventListener("wheel", handleWheel, { passive: false });
    return () => el.removeEventListener("wheel", handleWheel);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  // (버그 수정) 확대 정도(1.35배)가 너무 크다는 피드백 — 살짝만 확대되도록 낮춘다.
  // (기능) 검색·클릭으로 오프닝을 선택하면 그 노드를 화면 중앙으로 옮기고 살짝 확대해(SELECT_ZOOM)
  // "선택됨"이 시각적으로 드러나게 한다. 라벨 기준 125% — 새 기준(SCHEMATIC_ZOOM_LABEL_BASE)에 맞춰
  // 실제 CSS 배율로 환산한다.
  const SELECT_ZOOM = 1.25 * SCHEMATIC_ZOOM_LABEL_BASE;
  // (기능) 검색으로 오프닝을 고르면 예전엔 지금 보던 화면 중심 → 목표 위치까지 대각선으로 직행했다
  // — 트리 구조와 무관하게 허공을 가로질러 산만하다는 피드백으로, 이제는 나침반 중심(칩)에서
  // 시작해 그 오프닝까지 실제로 이어지는 트리 선(ㄱ자 커넥터)을 그대로 따라가며 이동한다.
  const parentOf = useMemo(() => { const m = new Map(); for (const [p, c] of edges) m.set(c.key, p); return m; }, [edges]);
  const buildFlightWaypoints = (target) => {
    const chain = [];
    let cur = target;
    while (cur) { chain.unshift(cur); const p = parentOf.get(cur.key); cur = p && p.depth >= 1 ? p : null; }
    // (v0.3.2 버그 수정) 방사형 좌표계에서 centerX/centerY는 이미 그 자체로 칩의 중심(반지름 0인
    // 지점)이다 — 예전 격자형 레이아웃 때 쓰던 +boxW/2,+boxH/2 보정을 그대로 남겨 두면 칩의 실제
    // 렌더 위치(아래 CHIP_SIZE 배치와도 어긋남)와 이 좌표가 서로 달라져, 동서남북 팔의 시작점이
    // 칩 중심에서 boxW·boxH만큼씩 어긋나 보이는 비대칭이 생겼다.
    const pts = [[centerX, centerY]];
    let prev = null;
    for (const node of chain) {
      if (prev) pts.push(...(node.edgePts || []));
      else { const nc = coord(node); pts.push([nc.x + boxW / 2, nc.y + boxH / 2]); }
      prev = node;
    }
    const tc = coord(target);
    pts.push([tc.x + boxW / 2, tc.y + boxH / 2]);
    return pts;
  };
  const flightRafRef = useRef(null);
  const [flightPath, setFlightPath] = useState(null);   // [[x,y], ...] (콘텐츠 좌표) | null
  const FLIGHT_MS = 220;
  const flyAlongPath = (waypoints, targetZoom, onDone) => {
    const rect = boxRef.current ? boxRef.current.getBoundingClientRect() : { width: 640, height: 640 };
    const fromZoom = zoomRef.current;
    if (flightRafRef.current) cancelAnimationFrame(flightRafRef.current);
    const segLens = [];
    let total = 0;
    for (let i = 1; i < waypoints.length; i++) {
      const d = Math.hypot(waypoints[i][0] - waypoints[i - 1][0], waypoints[i][1] - waypoints[i - 1][1]);
      segLens.push(d); total += d;
    }
    // 경로 위 임의의 누적 거리(dist)에 해당하는 콘텐츠 좌표 — 구간별 길이 비례로 선형 보간한다.
    const pointAt = (dist) => {
      if (total <= 0) return waypoints[waypoints.length - 1];
      let d = Math.max(0, Math.min(total, dist));
      for (let i = 0; i < segLens.length; i++) {
        if (d <= segLens[i] || i === segLens.length - 1) {
          const t = segLens[i] > 0 ? d / segLens[i] : 1;
          const [x1, y1] = waypoints[i], [x2, y2] = waypoints[i + 1];
          return [x1 + (x2 - x1) * t, y1 + (y2 - y1) * t];
        }
        d -= segLens[i];
      }
      return waypoints[waypoints.length - 1];
    };
    setFlightPath(waypoints);
    const t0 = performance.now();
    // 선을 따라가는 경로라 대각선 직행보다 길 수 있으니, 거리에 비례해 조금 더 시간을 준다(상한 있음).
    const duration = Math.min(900, Math.max(FLIGHT_MS, total * 0.5));
    const step = (now) => {
      const t = Math.min(1, (now - t0) / duration);
      const ease = 1 - Math.pow(1 - t, 3);   // ease-out — 빠르게 출발해 목표에서 부드럽게 멈춤
      const [cx, cy] = pointAt(total * ease);
      const z = fromZoom + (targetZoom - fromZoom) * ease;
      // (v0.5.6) 매 프레임 상태를 바꿔 컴포넌트 전체를 다시 그리던 것을, 캔버스 transform만 직접 고치고 끝에 한 번 반영하도록.
      applyView({ x: rect.width / 2 - cx * z, y: rect.height / 2 - cy * z }, z);
      if (t < 1) { flightRafRef.current = requestAnimationFrame(step); }
      else { flightRafRef.current = null; setFlightPath(null); commitView(); if (onDone) onDone(); }
    };
    flightRafRef.current = requestAnimationFrame(step);
  };
  useEffect(() => () => { if (flightRafRef.current) cancelAnimationFrame(flightRafRef.current); }, []);
  const centerOn = (it, z, onDone) => { flyAlongPath(buildFlightWaypoints(it), z, onDone); };
  // (버그 수정) 선택 직후 딱 한 번만 중앙으로 옮기면, 트리가 아직 배경에서 계속 자라는 중일 때
  // (최대 4000개 노드가 계속 로드되며 다른 노드들의 좌표(pos)도 함께 밀려남) 선택한 노드가 금방
  // 중앙에서 벗어나 버려 "고정이 안 된다"고 느껴졌다. items 변경에 반응하는 디바운스 effect로
  // 재정렬을 시도했지만, 배경 로딩이 80ms(bumpVersion 주기)마다 계속 items를 갱신하는 동안은
  // 120ms 디바운스가 매번 취소되기만 하고 끝내 한 번도 실행되지 못했다(디바운스 기아) — items
  // 변경 빈도와 무관하게 일정 주기로 도는 setInterval로 바꿔, 트리가 계속 자라는 중에도 확실히
  // 재중앙 정렬되게 한다. 사용자가 직접 손대면(selectionLockRef) 더 이상 재정렬하지 않는다.
  // (버그 수정) 노드를 클릭한 직후 centerOn이 시작하는 비행 애니메이션(최대 900ms)이 매 프레임
  // pan/zoom을 부드럽게 보간하는 동안, 이 interval은 그와 무관하게 150ms마다 "이미 다 도착한"
  // 좌표로 곧장 스냅해버렸다 — 둘 다 selectionLockRef가 걸린 상태에서 서로 모른 채 동시에 pan을
  // 덮어써, 150ms마다 (보간된 위치) ↔ (이미 도착한 위치) 사이를 오가며 화면이 좌우로 튀는 것처럼
  // 보였다(신고된 "클릭 직후 1~2초간 심하게 흔들리는" 현상의 정체). 비행 애니메이션이 도는
  // 동안에는 이 interval이 끼어들지 않도록 건너뛴다 — 애니메이션이 끝나면(flightRafRef.current가
  // null이 되면) 그 다음 tick부터 다시 정상적으로 재중앙 정렬을 이어간다.
  useEffect(() => {
    if (!selectedPath) return;
    const id = setInterval(() => {
      if (!selectionLockRef.current) return;
      if (flightRafRef.current) return;
      const target = itemByKeyRef.current.get(selectedPath.join(" "));
      if (!target) return;
      const rect = boxRef.current ? boxRef.current.getBoundingClientRect() : { width: 640, height: 640 };
      const c = coord(target);
      const z = zoomRef.current;
      const next = { x: rect.width / 2 - (c.x + boxW / 2) * z, y: rect.height / 2 - (c.y + boxH / 2) * z };
      // (v0.5.6) 이미 제자리면 상태를 바꾸지 않는다 — 예전엔 150ms마다 같은 값으로 setPan해 계속 다시 그렸다.
      setPan((p) => (Math.abs(p.x - next.x) < 0.5 && Math.abs(p.y - next.y) < 0.5 ? p : next));
    }, 150);
    return () => clearInterval(id);
  }, [selectedPath]);
  // (기능) 트리를 더 이상 필터링해서 숨기지 않으니, 이미 한 오프닝을 선택한 상태에서도 다른
  // 오프닝을 계속 검색할 수 있다.
  const [query, setQuery] = useState("");
  // (버그 수정) 예전엔 일치하는 오프닝이 여럿이어도 상위 8개만 items 순서(트리를 훑은 순서, 사실상
  // 임의 순서) 그대로 보여줬다 — 단어가 포함된 오프닝은 전부 보여주고(드롭다운은 이미 스크롤
  // 가능), "상위(더 넓은/더 유명한) 오프닝"이 위로 오도록 정렬한다. 수순이 짧을수록(=더 상위
  // 오프닝일수록) 우선, 같은 깊이면 채택률이 높은 쪽을 우선한다.
  const matches = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return [];
    const filtered = items.filter((it) => it.name && it.name.toLowerCase().includes(q));
    // (버그 수정) 같은 오프닝 이름이 부모 노드의 이름을 그대로 물려받아 여러 깊이(수순 길이)에
    // 걸쳐 완전히 똑같은 문자열로 중복 등장하는 경우가 있었다(예: "Benoni Defense: Old Benoni"가
    // 1.d4 c5와 1.d4 c5 2.d5 둘 다에 표시됨) — 검색 결과에는 그 이름으로 가장 먼저(수순이 가장
    // 짧게) 도달하는 노드 하나만 남긴다.
    const byName = new Map();
    for (const it of filtered) {
      const cur = byName.get(it.name);
      if (!cur || it.path.length < cur.path.length || (it.path.length === cur.path.length && (it.adopt || 0) > (cur.adopt || 0))) byName.set(it.name, it);
    }
    const cmp = (a, b) => (a.path.length - b.path.length) || ((b.adopt || 0) - (a.adopt || 0)) || a.name.localeCompare(b.name);
    // (버그 수정) 검색어가 오프닝 이름 맨 앞에 오는 결과(예: "Sicilian Defense…")와, 이름 중간
    // 어딘가에 등장하는 결과(예: "…Reversed Sicilian Variation")가 뒤섞여 나와, 찾으려던 오프닝이
    // 관련 없어 보이는 결과들 사이에 묻혔다 — 맨 앞에 오는 것들을 먼저, 그 뒤에 중간에 오는 것들을 보여준다.
    const deduped = [...byName.values()];
    const starts = deduped.filter((it) => it.name.toLowerCase().startsWith(q)).sort(cmp);
    const contains = deduped.filter((it) => !it.name.toLowerCase().startsWith(q)).sort(cmp);
    return [...starts, ...contains];
  }, [items, query]);
  // (기능) 검색 결과를 고르거나(jumpTo) 트리에서 수 블록을 직접 클릭해도(아래 button onClick)
  // 완전히 같은 효과를 낸다 — 그 수까지의 경로를 강조(selectedPath)하고, 화면 중앙으로 이동+확대하고,
  // 상세 블록을 연다.
  const selectNode = (it, opts) => {
    userPannedRef.current = true;
    setQuery("");
    setSelectedPath(it.path);
    // (v0.2.2 UX) 오프닝 트리 안에서 수 블록을 직접 클릭한 경우(opts.instant)는 이미 화면에 보이는
    // 자리를 누른 것이므로, 검색 결과 선택·키보드 이동 때와 달리 시점 이동(pan/zoom) 애니메이션 없이
    // 상세 카드만 즉시 열고 닫는다 — 방금 직접 본 자리로 카메라를 다시 움직이는 건 불필요한 연출이다.
    if (opts && opts.instant) { onToggleOpen(it.key); return; }
    selectionLockRef.current = true;
    if (openKey === it.key) {
      // 이미 열려 있는 수를 다시 선택하면 기존처럼 즉시 토글해서 닫는다.
      onToggleOpen(it.key);
      centerOn(it, SELECT_ZOOM);
      return;
    }
    // (v0.1.1) 검색·클릭으로 다른 수로 이동할 때는 화면이 그 수까지 다 이동한 뒤에야 수 설명
    // 카드가 나타나게 한다 — 전에는 이동 애니메이션이 도는 동안에도 카드가 곧장 뜬 채로 화면을
    // 따라 미끄러지듯 이동해 산만했다. 이동 중엔 기존에 열려 있던 카드도 먼저 닫는다.
    if (openKey) onToggleOpen(openKey);
    centerOn(it, SELECT_ZOOM, () => onToggleOpen(it.key));
  };
  // (v0.0.6 성능) DexNodesLayer가 팬/드래그 중에는 다시 그려지지 않도록 memo화되어 있는데, 클릭
  // 콜백을 매 렌더 새로 만드는 인라인 화살표 함수로 넘기면 그 참조가 매번 바뀌어 memo가 무력화된다
  // — selectNode의 "최신 버전"을 ref로 들고, key 문자열만 받는 안정된 래퍼를 한 번만 만든다.
  const selectNodeRef = useRef(selectNode);
  selectNodeRef.current = selectNode;
  const onSelectNode = useCallback((key) => {
    const it = itemByKeyRef.current.get(key);
    if (it) selectNodeRef.current(it, { instant: true });
  }, []);
  // (기능) 특정 수 블록을 선택한 상태에서는 WASD·방향키로 화면상 그 방향에 있는 가장 가까운
  // 블록으로 곧장 이동할 수 있게 한다 — 눌린 방향으로 실제 진행한 거리에 벗어난 정도(수직 편차)를
  // 페널티로 더해, "그 방향으로 곧장" 있는 블록을 우선 고른다. itemsRef/selectedPathRef로 항상
  // 최신 값을 읽으므로 이 effect는 마운트 시 한 번만 등록해도 된다.
  useEffect(() => {
    const KEY_DIR = { arrowup: [0, -1], arrowdown: [0, 1], arrowleft: [-1, 0], arrowright: [1, 0], w: [0, -1], s: [0, 1], a: [-1, 0], d: [1, 0] };
    const onKeyDown = (e) => {
      if (!selectedPathRef.current) return;
      const tag = (e.target && e.target.tagName) || "";
      if (tag === "INPUT" || tag === "TEXTAREA" || (e.target && e.target.isContentEditable)) return;
      const dirVec = KEY_DIR[e.key.toLowerCase()];
      if (!dirVec) return;
      e.preventDefault();
      const from = itemByKeyRef.current.get(selectedPathRef.current.join(" "));
      if (!from) return;
      const [dx, dy] = dirVec;
      let best = null, bestScore = Infinity;
      for (const it of itemsRef.current) {
        if (it.key === from.key) continue;
        const ddx = it.x - from.x, ddy = it.y - from.y;
        const primary = dx !== 0 ? ddx * dx : ddy * dy;
        if (primary <= 1) continue;
        const perp = dx !== 0 ? ddy : ddx;
        const score = primary + Math.abs(perp) * 2.5;
        if (score < bestScore) { bestScore = score; best = it; }
      }
      if (best) selectNode(best);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);
  // (기능) 지금 선택(고정)된 오프닝과, 지금 보고 있는 화면(뷰포트 중심)을 트리 자동 확장 큐
  // (useOpeningTreeAuto)에 알려준다 — 선택된 오프닝의 바리에이션을 최우선으로, 나머지는 화면
  // 중심에서 먼 갈래부터 먼저 펼치고 가까운(눈에 잘 띄는) 갈래는 가장 나중에 펼치게 해 화면 안,
  // 특히 지금 보고 있는 근처에서 갑자기 새 블록이 튀어나오는 산만함을 줄인다.
  useEffect(() => {
    if (!priorityRef) return;
    priorityRef.current.selectedKey = selectedPath ? selectedPath.join(" ") : null;
  }, [selectedPath, priorityRef]);
  // (v0.5.6) 예전엔 여기서 노드마다 화면 거리(distanceOf)를 계산해 구조 확장 순서를 정했다 — 구조가 로컬에서 즉시 만들어져 필요 없어졌다.
  // (성능) 위 refreshCullWindow가 관리하는 "그릴 범위"(cullWindowRef, cullVersion이 바뀔 때만
  // 갱신됨)로 실제 DOM에 그릴 부분집합만 골라낸다 — items/edges/groups(트리 전체 배치)는 검색·
  // 키보드 이동·비행 애니메이션·우선순위 계산 등 다른 로직이 여전히 전체를 봐야 하므로 그대로
  // 두고, 렌더링(DexNodesLayer/DexEdgesLayer/라벨)에 넘기는 값만 이걸로 바꾼다. 엣지는 두 끝
  // 중 하나라도 화면에 그려지는 노드면 남겨(잘린 선이라도 화면 안쪽 절반은 보이게) 부모가
  // 범위 밖으로 살짝 벗어나도 자식 쪽 연결선이 뚝 끊겨 보이지 않게 한다.
  const { culledItems, culledEdges, culledGroups } = useMemo(() => {
    // (v0.5.6 성능) 처음 그릴 때는 아직 그릴 범위가 없어 예전엔 트리 전체(블록 3,300여 개 + 라벨 1,500개)를 한꺼번에 DOM으로 만들었다가
    // 다음 렌더에서 걸러냈다 — 도감 탭을 열 때마다 약 2초씩 멈춘 원인. 첫 렌더부터 "처음 보여줄 화면"(트리 중심 · 기본 배율 · 창 크기)
    // 기준의 그릴 범위를 바로 잡는다.
    if (!cullWindowRef.current) {
      const vw = typeof window !== "undefined" ? window.innerWidth : 640, vh = typeof window !== "undefined" ? window.innerHeight : 640;
      const z = zoomRef.current, padX = (vw * CULL_REFRESH_PAD) / z, padY = (vh * CULL_REFRESH_PAD) / z;
      cullWindowRef.current = { cx: centerX, cy: centerY, minX: centerX - padX, maxX: centerX + padX, minY: centerY - padY, maxY: centerY + padY };
    }
    const w = cullWindowRef.current;
    const ci = items.filter((it) => it.x + boxW > w.minX && it.x < w.maxX && it.y + boxH > w.minY && it.y < w.maxY);
    const keySet = new Set(ci.map((it) => it.key));
    const ce = edges.filter(([p, c]) => p.depth === 0 || keySet.has(p.key) || keySet.has(c.key));
    const cg = groups.filter((g) => g.left + g.w > w.minX && g.left < w.maxX && g.top + 20 > w.minY && g.top < w.maxY);
    return { culledItems: ci, culledEdges: ce, culledGroups: cg };
  }, [items, edges, groups, cullVersion]);
  const openItem = openKey ? itemByKey.get(openKey) || null : null;
  const openParentM = openItem ? (treeData.get(openItem.path.slice(0, -1).join(" ")) || []).find((x) => x.san === openItem.san) : null;
  // (사용자 요청) 개발자 모드 오프닝 트리 인라인 편집 — 별도 화면(SchematicEditor) 대신 선택한 수의
  // 카드 안에서 자녀·형제 수를 추가/삭제할 수 있게 한다. 저장 버튼을 누르기 전까지는 CONTENT를 전혀
  // 건드리지 않고(따라서 트리도 실시간으로 재생성되지 않는다) 이 draft state에만 쌓아 둔다 —
  // 저장하면 그때 한 번에 CONTENT.treeAdds/names/forceKind/unbook에 반영하고 bumpContent()를
  // 호출해, 그 결과값으로 트리를 처음부터 다시(겹침 없이, 위 캐시 초기화 로직과 맞물려) 그린다.
  const [draft, setDraft] = useState({ adds: {}, removes: {} }); // adds: {parentKey:[{san,name}]}, removes: {"parentKey|san":true}
  const stageAdd = (parentPath, sanRaw, nameRaw) => {
    const san = (sanRaw || "").trim();
    if (!san) return t("수 입력 필요");
    const board = boardFromSans(parentPath);
    const color = parentPath.length % 2 === 0 ? "w" : "b";
    if (!sanSrc(board, san, color)) return t("불법 수");
    const key = parentPath.join(" ");
    let dup = false;
    setDraft((d) => {
      const list = d.adds[key] || [];
      if (list.some((x) => x.san === san)) { dup = true; return d; }
      return { ...d, adds: { ...d.adds, [key]: [...list, { san, name: (nameRaw || "").trim() }] } };
    });
    return dup ? t("이미 추가 대기 중인 수") : null;
  };
  const unstageAdd = (parentPath, san) => {
    const key = parentPath.join(" ");
    setDraft((d) => ({ ...d, adds: { ...d.adds, [key]: (d.adds[key] || []).filter((x) => x.san !== san) } }));
  };
  const toggleStageRemove = (parentPath, san) => {
    const rk = parentPath.join(" ") + "|" + stripSuffix(san);
    setDraft((d) => { const removes = { ...d.removes }; if (removes[rk]) delete removes[rk]; else removes[rk] = true; return { ...d, removes }; });
  };
  const draftAddCount = useMemo(() => Object.values(draft.adds).reduce((n, l) => n + l.length, 0), [draft]);
  const draftRemoveCount = Object.keys(draft.removes).length;
  const [draftSaving, setDraftSaving] = useState(false);
  const cancelDraft = () => setDraft({ adds: {}, removes: {} });
  const commitDraft = async () => {
    setDraftSaving(true);
    for (const parentKey in draft.adds) {
      for (const { san, name } of draft.adds[parentKey]) {
        if (!CONTENT.treeAdds[parentKey]) CONTENT.treeAdds[parentKey] = [];
        const existing = CONTENT.treeAdds[parentKey].find((x) => x.san === san);
        if (existing) existing.theory = true; else CONTENT.treeAdds[parentKey].push({ san, theory: true });
        CONTENT.forceKind[parentKey + "|" + san] = "book";
        if (name) CONTENT.names[parentKey + "|" + stripSuffix(san)] = name;
      }
    }
    for (const rk in draft.removes) CONTENT.unbook[rk] = true;
    await bumpContent();
    setDraft({ adds: {}, removes: {} });
    setDraftSaving(false);
  };
  const editInfo = useMemo(() => {
    if (!canAdd || !openItem) return null;
    const siblingPath = openItem.path.slice(0, -1);
    const childPath = openItem.path;
    const selfRemoveKey = siblingPath.join(" ") + "|" + stripSuffix(openItem.san);
    return {
      childAdds: draft.adds[childPath.join(" ")] || [],
      siblingAdds: draft.adds[siblingPath.join(" ")] || [],
      selfRemoved: !!draft.removes[selfRemoveKey],
    };
  }, [canAdd, openItem, draft]);
  // (사용자 요청, 버그 수정) v0.3.3에서 카드를 position:fixed(뷰포트 좌표계)로 옮겼지만, 그 좌표
  // 자체(left/top/tailPos)는 여전히 매 렌더 pan/zoom을 다시 읽어 앵커(수 블록)를 계속 따라가도록
  // 계산했다 — 그래서 드래그·휠 확대 도중에도 카드가 화면 위를 실시간으로 미끄러지듯 움직였는데,
  // 그 이동 자체가 clamp 경계를 넘나들며 말풍선 꼬리(tailPos) 각도가 뒤틀리고, 클램프가 한 프레임
  // 늦게 따라잡는 순간 잠깐씩 화면 밖으로 잘려 보이는 근본 원인이었다. 이제 카드를 연 "그 순간"의
  // pan/zoom으로 좌표를 딱 한 번만 계산해 openKey가 바뀌기 전까지 그대로 얼려 두고(useMemo dep이
  // openKey뿐이라 pan/zoom이 바뀌어도 재계산되지 않는다), 이후 사용자가 실제로 스크롤(팬)하거나
  // 확대/축소하면 카드를 따라오게 하는 대신 아예 닫아버린다(아래 useEffect) — 항상 화면 안에,
  // 뒤틀리지 않은 고정된 모양으로만 보인다.
  const frozenCard = useMemo(() => {
    if (!openItem || !openParentM) return null;
    const rect = boxRef.current ? boxRef.current.getBoundingClientRect() : { width: 640, height: 640, left: 0, top: 0 };
    const oc = coord(openItem);
    const nodeX = rect.left + pan.x + zoom * oc.x, nodeY = rect.top + pan.y + zoom * oc.y;
    const nodeW = boxW * zoom, nodeH = boxH * zoom;
    // (사용자 요청) 도감 오프닝 모식도에서 수 블록을 클릭하면 뜨는 상세 카드(DexMoveBlock)의 크기를
    // 2배로 키운다 — 이 카드는 이미 transform:scale(cardScale)로 균일하게 커지고 작아지도록 만들어져
    // 있었으므로(세로 모식도에서만 0.65배로 살짝 줄이던 것), 그 배율에 2를 곱하기만 하면 폰트·이미지·
    // 여백까지 전부 비율 그대로 2배가 된다.
    // (v0.5.6, 사용자 요청 "카드 크기를 좀 줄여줘" → "더 작게") 데스크톱 2배 → 1.5배 → 1.1배, 모바일 1.3배 → 1배 → 0.85배.
    const cardScale = vertical ? 0.85 : 1.1;
    const vw = typeof window !== "undefined" ? window.innerWidth : 480;
    const vh = typeof window !== "undefined" ? window.innerHeight : 800;
    const CARD_W = Math.max(240, Math.min(300, vw - 32));
    const cardH = 460 * cardScale;
    // 실제 화면에 렌더링되는(scale 적용 후) 카드 폭 — 화면 경계 클램프는 이 값을 기준으로 해야
    // 커진 카드가 뷰포트 밖으로 잘리지 않는다.
    const renderedW = CARD_W * cardScale;
    const BOTTOM_SAFE = 66 + 40;
    const nodeCX = nodeX + nodeW / 2, nodeCY = nodeY + nodeH / 2;
    const clamp = (v, lo, hi) => Math.max(lo, Math.min(v, hi));
    let left, top, tailPos;
    if (vertical) {
      left = clamp(nodeCX - renderedW / 2, 8, Math.max(8, vw - renderedW - 8));
      top = clamp(nodeY + nodeH + 11, 8, Math.max(8, vh - BOTTOM_SAFE - cardH));
      // tailPos는 transform-origin(스케일 전 카드 자신의 로컬 좌표계) 기준이라 CARD_W(스케일 전
      // 폭) 범위 그대로 둔다 — renderedW가 아니다.
      tailPos = clamp(nodeCX - left, 20, CARD_W - 20);
    } else {
      left = clamp(nodeX + nodeW + 11, 8, Math.max(8, vw - renderedW - 8));
      top = clamp(nodeCY - cardH / 2, 8, Math.max(8, vh - BOTTOM_SAFE - cardH));
      tailPos = clamp(nodeCY - top, 20, cardH - 20);
    }
    return { key: openItem.key, item: openItem, parentM: openParentM, left, top, tailPos, cardScale, CARD_W, pan, zoom, nodeX, nodeY, nodeW, nodeH };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- 의도적으로 openKey에만 반응한다(위 주석 참고): pan/zoom은 "연 순간" 값을 얼려두는 용도로만 읽는다.
  }, [openKey]);
  // 카드가 열려 있는 동안 실제로 팬(스크롤)하거나 확대/축소하면, 얼려 둔 좌표를 계속 우겨넣는 대신
  // 카드를 그냥 닫는다 — "스크롤하면 같이 사라지도록" 요청 그대로.
  useEffect(() => {
    if (!frozenCard) return;
    if (pan.x !== frozenCard.pan.x || pan.y !== frozenCard.pan.y || zoom !== frozenCard.zoom) onToggleOpen(frozenCard.key);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pan, zoom]);
  // (v0.5.6 버그 수정 BUG-011) 위 frozenCard는 카드 높이를 460px(×배율)로 어림하고, transform-origin(말풍선 꼬리 자리)을 기준으로 2배
  // 키운다는 점을 좌표에 반영하지 않아 카드가 늘 화면 밖으로 잘렸다(데스크톱: 위쪽 300px가량, 모바일: 왼쪽). 카드를 그린 직후(그리기
  // 전, useLayoutEffect) 실제 크기를 재서 — 꼬리가 수 블록을 가리키면서 카드 전체가 화면 안에 들어오는 — 위치·꼬리 자리·배율을 다시
  // 정한다. 화면보다 크면 배율을 줄인다. 내용이 늦게 채워져 크기가 바뀌면(ResizeObserver) 다시 맞춘다.
  const cardElRef = useRef(null);
  const [cardFit, setCardFit] = useState(null); // { key, left, top, tailPos, scale }
  useLayoutEffect(() => {
    if (!frozenCard) { setCardFit(null); return undefined; }
    const el = cardElRef.current;
    if (!el) return undefined;
    const fit = () => {
      const W = el.offsetWidth, H = el.offsetHeight;
      if (!W || !H) return;
      const vw = window.innerWidth, vh = window.innerHeight, M = 8, BOTTOM = vh - (66 + 40);
      const { nodeX, nodeY, nodeW, nodeH } = frozenCard;
      const nodeCX = nodeX + nodeW / 2, nodeCY = nodeY + nodeH / 2;
      const clamp = (v, lo, hi) => Math.max(lo, Math.min(v, hi));
      let sc = frozenCard.cardScale, left, top, tp;
      if (vertical) {
        // 카드는 블록 아래, 꼬리(가로 위치 tp)는 위쪽 변. 원점 (tp, 0) 기준으로 sc배 → 화면 왼쪽 끝 = nodeCX - sc·tp.
        sc = Math.min(sc, (vw - 2 * M) / W);
        tp = clamp(W / 2, W - (vw - M - nodeCX) / sc, (nodeCX - M) / sc);
        tp = clamp(tp, 20, W - 20);
        left = nodeCX - tp;
        top = Math.min(nodeY + nodeH + 11, BOTTOM - sc * H);
        top = Math.max(M, top);
      } else {
        // 카드는 블록 오른쪽, 꼬리(세로 위치 tp)는 왼쪽 변. 원점 (0, tp) 기준으로 sc배 → 화면 위쪽 끝 = nodeCY - sc·tp.
        // 블록 오른쪽 남은 폭에 들어가도록 배율을 줄인다(1배 밑으로는 안 줄이고, 그래도 모자라면 화면 안쪽으로 당긴다).
        sc = Math.min(sc, (BOTTOM - M) / H, (vw - 2 * M) / W, Math.max(1, (vw - M - (nodeX + nodeW + 11)) / W));
        left = clamp(nodeX + nodeW + 11, M, vw - M - sc * W);
        tp = clamp(H / 2, H - (BOTTOM - nodeCY) / sc, (nodeCY - M) / sc);
        tp = clamp(tp, 20, H - 20);
        top = nodeCY - tp;
      }
      setCardFit((prev) => (prev && prev.key === frozenCard.key && Math.abs(prev.left - left) < 0.5 && Math.abs(prev.top - top) < 0.5 && Math.abs(prev.tailPos - tp) < 0.5 && prev.scale === sc ? prev : { key: frozenCard.key, left, top, tailPos: tp, scale: sc }));
    };
    fit();
    const ro = typeof ResizeObserver !== "undefined" ? new ResizeObserver(fit) : null;
    if (ro) ro.observe(el);
    return () => { if (ro) ro.disconnect(); };
  }, [frozenCard, vertical]);
  // (사용자 요청) 검색창+새로고침(가운데 되돌리기) 버튼을 모식도 캔버스 위에 떠 있던 오버레이에서
  // 꺼내, 캔버스 "밖" 정상 흐름의 헤더 줄로 옮긴다 — 퍼즐 탭에서 방금 만든 검색창(오프닝·생성자
  // 통합 검색, searchQuery 부근)과 같은 시각 스타일(어두운 인풋 + 양피지색 드롭다운, 같은 보더/라운드/
  // 그림자)로 맞춘다. 오른쪽 빈자리에는 CollectionTab이 넘겨주는 도감 해금률(rightSlot)을 배치해
  // "검색+새로고침(좌) / 해금률(우)"의 좌우 배치 줄이 되도록 한다. 팬/줌/검색 매칭 로직 자체는
  // 그대로— 위치와 스타일만 바뀐다.
  const searchHeader = (
    <div style={{ display: "flex", alignItems: vertical ? "flex-start" : "center", justifyContent: "space-between", gap: 10, marginBottom: 8, flexWrap: vertical ? "wrap" : "nowrap" }}>
      {tabsSlot}
      <div className="no-pan" style={{ position: "relative", zIndex: 70, flex: vertical ? "1 1 100%" : "0 1 260px", minWidth: 150, marginRight: "auto" }}>
        <div style={{ display: "flex", gap: 4 }}>
          <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder={t("오프닝 이름으로 찾기")}
            style={{ flex: 1, minWidth: 0, boxSizing: "border-box", padding: "6px 9px", borderRadius: 9, border: "1px solid #5A4630", background: "rgba(0,0,0,.25)", color: T.ivoryHi, fontSize: 12 }} />
          {/* (기능) 검색·드래그·확대로 화면이 흐트러졌을 때, 첫 4수(e4/d4/c4/Nf3)가 보이는 정중앙
              기본 화면으로 한 번에 되돌리는 버튼 — 줌을 100%로, 팬은 나침반 중심으로 되돌리고
              userPannedRef를 풀어 이후 트리가 자라도 다시 자동으로 중앙을 따라가게 한다. */}
          <button onClick={() => {
            stopMotion();
            userPannedRef.current = false;
            selectionLockRef.current = false;
            setZoom(SCHEMATIC_ZOOM_LABEL_BASE);
            const rect = boxRef.current ? boxRef.current.getBoundingClientRect() : { width: 640, height: 640, top: 0, bottom: 640, left: 0, right: 640 };
            const vc = { x: rect.width / 2, y: rect.height / 2 };
            setPan({ x: vc.x - centerRef.current.x * SCHEMATIC_ZOOM_LABEL_BASE, y: vc.y - centerRef.current.y * SCHEMATIC_ZOOM_LABEL_BASE });
          }} title={t("화면 가운데로 되돌리기")} className="press" style={{ flexShrink: 0, width: 30, height: 30, borderRadius: 9, border: "1px solid #5A4630", background: "rgba(0,0,0,.25)", color: T.brassHi, cursor: "pointer", display: "inline-flex", alignItems: "center", justifyContent: "center" }}>
            <RotateCcw size={14} />
          </button>
        </div>
        {/* (버그 수정) "강조 해제" 버튼을 따로 둘 필요 없다는 피드백 — 화면을 손으로 옮기면
            (checkSelectionDrift) 확대 강조가 자동으로 풀리니, 검색 결과 드롭다운만 남긴다. */}
        {query.trim() && (
          <div style={{ position: "absolute", left: 0, right: 0, top: "100%", marginTop: 4, background: T.paper, border: "1px solid #DCCBA8", borderRadius: 9, overflow: "hidden", zIndex: 40, boxShadow: "0 8px 20px -6px rgba(0,0,0,.4)", maxHeight: 280, overflowY: "auto" }}>
            {matches.length === 0
              ? <div style={{ padding: "8px 10px", fontSize: 11, color: T.inkSoft }}>{t("일치하는 오프닝 없음")}</div>
              : matches.map((it) => (
                <button key={it.key} onClick={() => selectNode(it)} className="press" style={{ display: "block", width: "100%", textAlign: "left", padding: "7px 10px", background: "transparent", border: "none", borderBottom: "1px solid rgba(196,154,80,.25)", cursor: "pointer" }}>
                  <div style={{ fontSize: 12, fontWeight: 700, color: T.ink, display: "flex", alignItems: "center", gap: 4 }}>{!it.unlocked && <Lock size={9} />}{it.name}</div>
                  <div style={{ fontSize: 10, color: T.inkSoft, fontFamily: SITE_FONT, marginTop: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{sansToPgnText(it.path)}</div>
                </button>
              ))}
          </div>
        )}
      </div>
      {rightSlot && <div style={{ flexShrink: 0 }}>{rightSlot}</div>}
    </div>
  );
  return (
    <div>
    {searchHeader}
    <div ref={boxRef} onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={onPointerUp} onPointerCancel={onPointerUp} onClickCapture={onClickCapture} onDoubleClick={onDoubleClick}
      // (디자인) 양피지 단색 배경이 밋밋해 보여, 다른 화면의 브라스 와이어프레임 장식과 같은 톤의
      // 옅은 마름모 격자 무늬(대각 크로스해치)를 깔아 모식도 캔버스의 디자인 밀도를 높인다.
      style={{ position: "relative", overflow: "hidden", overscrollBehavior: "contain", height: panelH, borderRadius: 12, border: "1px solid #DCCBA8", background: "repeating-linear-gradient(45deg, rgba(196,154,80,.09) 0, rgba(196,154,80,.09) 1px, transparent 1px, transparent 26px), repeating-linear-gradient(-45deg, rgba(196,154,80,.09) 0, rgba(196,154,80,.09) 1px, transparent 1px, transparent 26px), #FBF5E8", touchAction: "none", userSelect: "none", WebkitUserSelect: "none", cursor: dragRef.current ? "grabbing" : "grab" }}>
      {!ready && (
        <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12.5, color: T.inkSoft }}>{t("불러오는 중…")}</div>
      )}
      <div className="flex no-pan" style={{ position: "absolute", top: 6, right: 6, zIndex: 60, gap: 3, background: "rgba(255,255,255,.9)", borderRadius: 8, border: "1px solid #DCCBA8", padding: 2, visibility: ready ? "visible" : "hidden" }}>
        <button onClick={() => zoomBy(-SCHEMATIC_ZOOM_STEP)} title={t("축소")} style={{ width: 22, height: 22, borderRadius: 6, border: "none", background: "transparent", color: T.inkSoft, fontWeight: 900, cursor: "pointer", fontSize: 14 }}>－</button>
        <button onClick={() => zoomBy(SCHEMATIC_ZOOM_LABEL_BASE - zoomRef.current)} title={t("초기화")} style={{ padding: "0 6px", height: 22, borderRadius: 6, border: "none", background: "transparent", color: T.inkSoft, fontWeight: 800, cursor: "pointer", fontSize: 9.5, fontFamily: SITE_FONT }}>{schematicZoomLabel(zoom)}</button>
        <button onClick={() => zoomBy(SCHEMATIC_ZOOM_STEP)} title={t("확대")} style={{ width: 22, height: 22, borderRadius: 6, border: "none", background: "transparent", color: T.inkSoft, fontWeight: 900, cursor: "pointer", fontSize: 14 }}>＋</button>
      </div>
      <div ref={canvasRef} style={{ position: "absolute", left: 0, top: 0, width, height, transform: "translate(" + pan.x + "px," + pan.y + "px) scale(" + zoom + ")", transformOrigin: "0 0", visibility: ready ? "visible" : "hidden", willChange: "transform" }}>
        {/* (v0.3.2 개편) 칭호(이름)가 붙은 오프닝을 점선 테두리로 묶어 보여주던 것을 없애고, 이름
            라벨만 그 오프닝에 진입하는 첫 수(그룹 뿌리) 블록 바로 위쪽에 남겨 둔다. */}
        {culledGroups.map((g) => (
          <div key={"grouplabel-" + g.key} style={{ position: "absolute", left: g.left, top: g.top, display: "flex", alignItems: "center", gap: 3, pointerEvents: "none", zIndex: 3 }}>
            {/* (사용자 요청) 이름을 자르지 않고 풀네임을 그대로 다 보여준다 — maxWidth·ellipsis 제거. */}
            <span style={{ fontFamily: "Georgia,'Noto Serif KR',serif", fontStyle: "italic", fontWeight: 700, fontSize: 13, letterSpacing: .2, whiteSpace: "nowrap", background: "linear-gradient(180deg,#F3DFAE,#C49A50 55%,#8A6C2F)", WebkitBackgroundClip: "text", backgroundClip: "text", color: "transparent", filter: "drop-shadow(0 1px 1px rgba(0,0,0,.35))" }}>
              ✦ {g.name} ✦
            </span>
            <ChevronRight size={13} strokeWidth={2.5} style={{ color: T.brass, transform: "rotate(45deg)", flexShrink: 0, filter: "drop-shadow(0 1px 1px rgba(0,0,0,.3))" }} />
          </div>
        ))}
        <svg width={width} height={height} style={{ position: "absolute", left: 0, top: 0, pointerEvents: "none", overflow: "visible" }}>
          {/* (기능) 검색으로 오프닝을 선택했을 때, 그 수까지 이어지는 트리 선(모식도 ㄱ자 커넥터)을
              그대로 따라가는 안내선 — flyAlongPath가 애니메이션 도중에만 채워 두고 도착하면 지운다. */}
          {flightPath && <polyline points={flightPath.map((q) => q[0] + "," + q[1]).join(" ")} fill="none" stroke="#3E7CC4" strokeWidth={3} opacity={0.85} strokeLinecap="round" strokeLinejoin="round" strokeDasharray="2 10" />}
          {/* (기능) 두 팔(e4=위쪽 절반, d4=아래쪽 절반)이 갈라지는 나침반 정중앙에 회로 칩 모양
              장식을 두어, 이 자리가 트리의 "발신지"임을 시각적으로 강조한다 — 칩 위·아래 변에서
              첫 수(e4/d4) 박스의 안쪽 변까지 짧은 회로 트레이스를 이어, 두 갈래가 실제로 이 칩에서
              뻗어나가는 것처럼 보이게 한다. */}
          {(() => {
            // (v0.3.2 버그 수정) centerX/centerY는 방사형 좌표계의 진짜 중심(반지름 0)이라, 예전
            // 격자형 레이아웃 때처럼 +boxW/2,+boxH/2를 더할 필요가 없다 — 이 보정이 남아 있으면
            // 칩과 팔 사이 트레이스 선이 팔마다 boxW·boxH만큼씩 다르게 어긋나 십자가 비대칭으로
            // 보였다.
            const ccx = centerX, ccy = centerY, half = CHIP_SIZE / 2;
            // (v0.5.6) 블록 위치가 라벨 줄·전적 칩 자리를 포함한 발자국 기준으로 정해지므로, 트레이스 끝은 실제 1수 블록의 안쪽 변에 맞춘다.
            const rootN = itemByKey.get("e4"), rootS = itemByKey.get("d4");
            const traces = {
              N: [ccx, ccy - half, ccx, rootN ? rootN.y + boxH : centerY - ROOT_GAP + boxH / 2],
              S: [ccx, ccy + half, ccx, rootS ? rootS.y : centerY + ROOT_GAP - boxH / 2],
            };
            // (사용자 요청) "회로와 e4, d4 사이에도(선택 시 파란색 선이) 적용되도록" — 지금까지는
            // electric(전체 서지)에만 반응했지 특정 수를 클릭해 선택했을 때는 칩→루트 구간이 전혀
            // 반응하지 않았다. 선택된 경로의 첫 수(e4 또는 d4)가 속한 방향이면 이 트레이스도 함께
            // 파란색으로, 같은 거리 비례 지연 규칙으로 켜지게 한다.
            const selDuration = selectedTargetR ? Math.min(1, Math.max(0.3, selectedTargetR / DEX_SELECT_FLOW_SPEED)) : 0;
            return Object.entries(traces).map(([dir, [x1, y1, x2, y2]]) => {
              const isSelArm = !!(selectedPath && selectedPath.length && DIR_OF_ROOT[stripSuffix(selectedPath[0])] === dir);
              const active = electric || isSelArm;
              const selDelay = isSelArm && selectedTargetR ? (ROOT_GAP / selectedTargetR) * selDuration : 0;
              const surgeDelay = electric ? ROOT_GAP / DEX_ELECTRIC_FLOW_SPEED : 0;
              return <line key={"chip-trace-" + dir} className={electric ? "dex-surge-line" : undefined} x1={x1} y1={y1} x2={x2} y2={y2} stroke={active ? SCHEMATIC_ELECTRIC : T.brass} strokeWidth={active ? 3 : 2} opacity={active ? 1 : 0.5} strokeLinecap="round"
                style={active ? { strokeDasharray: "7 5", transition: isSelArm ? "stroke .25s ease " + selDelay + "s, opacity .25s ease " + selDelay + "s" : undefined, animationDelay: electric ? surgeDelay + "s" : undefined } : undefined} />;
            });
          })()}
          <DexEdgesLayer edges={culledEdges} selectedKeySet={selectedKeySet} electric={electric} selectedTargetR={selectedTargetR} />
          {/* (v0.5.6) 라벨은 항상 블록 위쪽 — 이웃 라벨에 밀려 한 줄 이상 위로 올라간 라벨은 자기 블록까지 가는 점선 지시선을 긋는다. */}
          {culledGroups.map((g) => (g.lifted ? (
            <line key={"leader-" + g.key} x1={Math.min(Math.max(g.ax, g.left + 12), g.left + g.w - 12)} y1={g.top + 20} x2={g.ax} y2={g.ay} stroke={T.brass} strokeWidth={1.2} strokeDasharray="2 3" opacity={0.7} />
          ) : null))}
        </svg>
        {/* (기능) 나침반 정중앙 회로 칩 장식 — 네 변에 짧은 "다리(핀)"를 달아 실제 회로 칩처럼
            보이게 하고, 가운데 CPU 아이콘으로 "이 트리 전체가 여기서 뻗어나간다"는 발신지 느낌을 준다. */}
        <div className={"no-pan" + (electric ? " dex-chip-surge" : "")} onPointerDown={(e) => e.stopPropagation()} onClick={triggerElectric} title={t("회로에 전류 흘리기")} style={{ position: "absolute", left: centerX - CHIP_SIZE / 2, top: centerY - CHIP_SIZE / 2, width: CHIP_SIZE, height: CHIP_SIZE, cursor: "pointer", zIndex: 2 }}>
          <div style={{ position: "absolute", inset: 0, borderRadius: 14, background: "linear-gradient(155deg,#3A2516,#1E130B)", border: "1.5px solid " + (electric ? SCHEMATIC_ELECTRIC : T.brass), boxShadow: "0 0 0 3px rgba(196,154,80,.16), 0 6px 16px -6px rgba(0,0,0,.6), inset 0 1px 0 rgba(255,255,255,.08)" }} />
          {[0, 1, 2].map((i) => (
            <React.Fragment key={i}>
              <div style={{ position: "absolute", left: 11 + i * 15, top: -4, width: 6, height: 4, background: T.brass, borderRadius: 1, opacity: 0.75 }} />
              <div style={{ position: "absolute", left: 11 + i * 15, bottom: -4, width: 6, height: 4, background: T.brass, borderRadius: 1, opacity: 0.75 }} />
              <div style={{ position: "absolute", top: 11 + i * 15, left: -4, width: 4, height: 6, background: T.brass, borderRadius: 1, opacity: 0.75 }} />
              <div style={{ position: "absolute", top: 11 + i * 15, right: -4, width: 4, height: 6, background: T.brass, borderRadius: 1, opacity: 0.75 }} />
            </React.Fragment>
          ))}
          <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", color: T.brassHi }}>
            <Cpu size={26} strokeWidth={1.6} />
          </div>
        </div>
        <DexNodesLayer items={culledItems} openKey={openKey} selectedKeySet={selectedKeySet} onSelect={onSelectNode} electric={electric} selectedTargetR={selectedTargetR} />
      </div>
      {/* (버그 수정) 카드는 위 frozenCard(useMemo, dep=[openKey])가 "연 순간"에 딱 한 번 계산해 둔
          좌표를 그대로 쓴다 — 뷰포트 기준 고정 좌표(position:fixed)라는 점은 v0.3.2와 같지만, 그
          좌표 자체를 pan/zoom이 바뀔 때마다 다시 계산해 앵커를 따라가게 하지는 않는다(그 실시간
          추적이 드래그·휠 확대 중 말풍선 꼬리 뒤틀림과 프레임 지연 순간의 잘림의 원인이었다). 팬·
          줌이 실제로 바뀌면 위 useEffect가 카드를 아예 닫아버리므로, 카드가 떠 있는 동안은 항상
          연 순간 그대로의 고정된 모양으로만 보인다. */}
      {frozenCard && (
        <DexMoveBlock path={frozenCard.item.path.slice(0, -1)} m={frozenCard.parentM} isUnlocked={frozenCard.item.unlocked}
          cc={ccReady ? chesscom.analyze(frozenCard.item.path) : null} onClose={() => onToggleOpen(frozenCard.key)} onOpenOpening={onOpenOpening} onOpenLearn={onOpenLearn}
          vertical={vertical} scale={cardFit && cardFit.key === frozenCard.key ? cardFit.scale : frozenCard.cardScale} tailPos={cardFit && cardFit.key === frozenCard.key ? cardFit.tailPos : frozenCard.tailPos}
          canAdd={canAdd} editInfo={editInfo} onStageAdd={stageAdd} onUnstageAdd={unstageAdd} onToggleRemove={toggleStageRemove} boxRef={cardElRef}
          style={cardFit && cardFit.key === frozenCard.key
            ? { position: "fixed", left: cardFit.left, top: cardFit.top, width: frozenCard.CARD_W, zIndex: 70 }
            : { position: "fixed", left: frozenCard.left, top: frozenCard.top, width: frozenCard.CARD_W, zIndex: 70, visibility: "hidden" }} />
      )}
      {/* (사용자 요청) 개발자 모드일 때만, 모식도 영역 하단에 저장·취소 버튼 — 대기 중인 변경(추가/
          삭제)이 하나라도 있을 때만 나타난다. 저장을 눌러야 비로소 CONTENT에 반영되고 트리가
          재생성된다(그 전까지는 이 draft만 쌓일 뿐 실시간으로 다시 그려지지 않는다). */}
      {canAdd && (draftAddCount > 0 || draftRemoveCount > 0) && (
        <div className="no-pan" onPointerDown={(e) => e.stopPropagation()}
          style={{ position: "absolute", left: 10, right: 10, bottom: 10, zIndex: 62, display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, padding: "10px 14px", borderRadius: 12, background: "linear-gradient(180deg,#3A2516,#241509)", border: "1px solid " + T.brass, boxShadow: "0 10px 24px -8px rgba(0,0,0,.5)" }}>
          <span style={{ fontSize: 12, fontWeight: 800, color: T.brassHi }}>{tx("대기 중인 변경:{0}{1}", draftAddCount > 0 ? t(" 추가 {0}", draftAddCount) : "", draftRemoveCount > 0 ? t(" 삭제 {0}", draftRemoveCount) : "")}
          </span>
          <div className="flex items-center gap-2">
            <button onClick={cancelDraft} disabled={draftSaving} className="press" style={{ padding: "7px 14px", borderRadius: 9, border: "1px solid " + T.brass, background: "transparent", color: T.brassHi, fontWeight: 800, fontSize: 12, cursor: draftSaving ? "default" : "pointer", opacity: draftSaving ? .6 : 1 }}>{t("취소")}</button>
            <button onClick={commitDraft} disabled={draftSaving} className="press" style={{ padding: "7px 16px", borderRadius: 9, border: "none", background: "linear-gradient(180deg," + T.brass + ",#A8842F)", color: "#241509", fontWeight: 800, fontSize: 12, cursor: draftSaving ? "default" : "pointer", opacity: draftSaving ? .6 : 1, display: "inline-flex", alignItems: "center", gap: 5 }}><Save size={13} />{draftSaving ? t("저장 중…") : t("저장")}</button>
          </div>
        </div>
      )}
    </div>
    </div>
  );
}
export function CollectionTab({ unlockAll, liveOn, contentVer, chesscom, earnedTitles, titleCounts, ccTitleCounts, currentTitle, onEquipTitle, coins, ownedSkins, boardSkin, pieceSkin, onBuySkin, onEquipSkin, canAdd, bumpContent, onOpenOpening, onOpenLearn, treeData, treeVersion, genPriorityRef }) {
  const [dexView, setDexView] = useState("openings"); // (기능4) 오프닝 / 칭호 / (20차 UX1) 스킨
  const ccReady = chesscom && chesscom.status === "ready";
  const earned = earnedTitles || new Set();
  // (2차 개편) 도감 오프닝 — 클릭으로 펼치던 방식을 버리고 최소 3수+채택률 20% 이상 라인까지 자동으로
  // 미리 다 펼쳐진 트리(useOpeningTreeAuto)를 사용. openKey: 지금 블록으로 열려 있는 노드의 경로(key).
  // 모바일(≤768px)은 세로, 그 외는 가로 모식도.
  // (버그 수정) treeData/treeVersion/genPriorityRef는 이제 App(항상 마운트)에서 내려오는 props다 —
  // 예전처럼 이 컴포넌트 안에서 useOpeningTreeAuto를 직접 호출하면, 탭을 전환할 때마다 이 컴포넌트가
  // 통째로 언마운트되어 지금까지 쌓인 트리 깊이가 매번 사라졌다.
  const [openKey, setOpenKey] = useState(null);
  const vertical = useNarrow(768);
  const onToggleOpen = useCallback((k) => setOpenKey((prev) => (prev === k ? null : k)), []);
  // (v0.4.0 기능) 사용자 요청 — 도감 카드(openKey)도 브라우저 뒤로가기로 닫히게 한다. LessonMap과
  // 같은 방식(자체 popstate 리스너 + history.state.screens 배열의 "dexcard" 마커)을 쓴다. openKey는
  // 토글이라 null이 아닌 값 사이를 오갈 수 있는데(다른 노드를 바로 클릭), 그 경우엔 새 항목을 쌓지
  // 않고 열려 있는 카드가 그대로 바뀐 걸로 취급한다 — null↔값 전환에서만 push/pop한다.
  const prevOpenKeyRef = useRef(null);
  useEffect(() => {
    try {
      const was = prevOpenKeyRef.current;
      if (!was && openKey) {
        const cur = (window.history.state && window.history.state.screens) || [];
        if (!cur.includes("dexcard")) window.history.pushState({ ...(window.history.state || {}), screens: [...cur, "dexcard"] }, "", window.location.pathname);
      } else if (was && !openKey) {
        const cur = (window.history.state && window.history.state.screens) || [];
        if (cur.includes("dexcard")) window.history.back();
      }
    } catch { }
    prevOpenKeyRef.current = openKey;
  }, [openKey]);
  useEffect(() => {
    const onPop = () => {
      const screens = (window.history.state && window.history.state.screens) || [];
      if (!screens.includes("dexcard")) setOpenKey(null);
    };
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);
  // (사용자 요청) 모식도 위 안내 문구 자리에 표시할 도감 해금률 — { unlocked, total }.
  const [unlockStats, setUnlockStats] = useState(null);
  // (v0.6.3) 탭 알약 — 데스크톱의 오프닝·마스터 모식도는 검색·안내 줄과 같은 한 줄에 넣어(inlineTabs) 모식도 높이를 늘린다. 모바일·칭호·스킨은 예전처럼 위에 따로 둔다.
  const tabPills = (mb) => (
    <div className="flex items-center gap-2" style={{ marginBottom: mb, flexShrink: 0 }}>
      {[["openings", t("오프닝")], ["masters", t("마스터")], ["titles", t("칭호")], ["skins", t("스킨")]].map(([k, lb]) => { const on = dexView === k; return (
          <button key={k} onClick={() => setDexView(k)} className="press" style={{ fontSize: 13, fontWeight: 800, padding: "7px 16px", borderRadius: 999, border: "1px solid " + (on ? T.brass : "#5A4630"), background: on ? "linear-gradient(180deg," + T.brass + ",#A8842F)" : "transparent", color: on ? "#241509" : T.brassHi, cursor: "pointer" }}>{lb}</button>
        ); })}
    </div>
  );
  const inlineTabs = !vertical && (dexView === "openings" || dexView === "masters");
  return (
    <div>
      {!inlineTabs && tabPills(14)}
      {dexView === "masters" ? (
        <MastersSchematic vertical={vertical} tabsSlot={inlineTabs ? tabPills(0) : undefined} />
      ) : dexView === "skins" ? (
        <div>
          <p style={{ fontSize: 12.5, color: T.inkSoft, margin: "0 0 14px", lineHeight: 1.6 }}>{t("보드 스킨·기물 스킨 모음. 기본 스킨은 바로 장착, 상점에서 구매한 스킨도 여기서 장착·구매 가능. 미보유 스킨은 미리보기")}</p>
          <div style={{ fontSize: 12.5, fontWeight: 800, color: T.brassHi, marginBottom: 8 }}>{t("체스보드 스킨")}</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 18 }}>
            {Object.entries(BOARD_SKINS).map(([id, sk], i) => (
              <FadeIn key={id} index={i}><SkinShopCard kind="board" id={id} sk={sk} owned={(ownedSkins || new Set()).has("board:" + id)} equipped={boardSkin === id} coins={coins || 0} onBuy={onBuySkin} onEquip={onEquipSkin} /></FadeIn>
            ))}
          </div>
          <div style={{ fontSize: 12.5, fontWeight: 800, color: T.brassHi, marginBottom: 8 }}>{t("기물 스킨")}</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {Object.entries(PIECE_SKINS).map(([id, sk], i) => (
              <FadeIn key={id} index={i}><SkinShopCard kind="piece" id={id} sk={sk} owned={(ownedSkins || new Set()).has("piece:" + id)} equipped={pieceSkin === id} coins={coins || 0} onBuy={onBuySkin} onEquip={onEquipSkin} /></FadeIn>
            ))}
          </div>
        </div>
      ) : dexView === "titles" ? (
        <div>
          {/* (20차 UX2) 획득 조건 설명을 상시 노출하던 문단은 삭제 — 칭호를 클릭하면 그 칭호의 조건만
              애니메이션으로 잠깐 떴다 사라진다(TitleBadge 내부). 여기는 그 상호작용을 안내하는 짧은 힌트만. */}
          <p style={{ fontSize: 11.5, color: T.inkSoft, margin: "0 0 14px" }}>{t("칭호를 클릭하면 획득 조건 표시. 획득한 칭호는 클릭해 장착")}</p>
          {/* (18차 UI5) "현재 칭호" 블록 삭제 — 장착 상태는 목록의 "장착됨" 배지로만 표시 */}
          {/* (17차) 칭호 이미지가 오프닝당 세로로 이어지는 5단계 배너로 디자인되어 있어,
              오프닝을 가로로 나열하고 각 오프닝 내부에서는 등급을 위→아래로 쌓는다.
              모바일 한 행 2개, 데스크탑 한 행 4개 오프닝. */}
          <div className="grid grid-cols-2 lg:grid-cols-4" style={{ gap: 14 }}>
            {TITLE_OPENINGS.map((fam) => {
              const n = (titleCounts && titleCounts[fam.key]) || 0;
              const ccN = (ccTitleCounts && ccTitleCounts[fam.key]) || 0;
              return (
                <div key={fam.key}>
                  <div className="flex items-center justify-between" style={{ marginBottom: 4 }}>
                    <span style={{ fontSize: 12.5, fontWeight: 800, color: T.ivoryHi }}>{fam.label}</span>
                  </div>
                  {/* (19차 기능6) 퍼즐 해결 수 + chess.com 플레이 수를 함께 표기 */}
                  <div className="flex items-center gap-2" style={{ marginBottom: 8, fontSize: 10, color: T.inkSoft, fontFamily: SITE_FONT }}>
                    <span>{tx("퍼즐 {0}", fmtFull(n))}</span><span style={{ opacity: .5 }}>·</span><span>{tx("체스컴 {0}", fmtFull(ccN))}</span>
                  </div>
                  {/* (UI9) 해금된 단계는 정상 표시, 바로 다음 미해금 단계는 회색+진행도, 그 이후는 잠금 아이콘 */}
                  <div className="flex flex-col" style={{ gap: 6 }}>
                    {(() => { const nextIdx = TITLE_TIERS.findIndex((t) => !earned.has(titleId(fam.key, t.rank))); return TITLE_TIERS.map((t, i) => { const id = titleId(fam.key, t.rank); return (
                      <TitleBadge key={id} id={id} compact earned={earned.has(id)} locked={nextIdx !== -1 && i > nextIdx} equipped={currentTitle === id} progress={n} onEquip={onEquipTitle} />
                    ); }); })()}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      ) : (<>
      {/* (사용자 요청) "검색+새로고침" 헤더 줄과 같은 자리에 도감 해금률을 우측 배치하고(좌:검색,
          우:해금률), 예전의 작은 회색 캡션(11.5px)보다 "훨씬 더 크고 선명하게" — 굵고 큼직한
          브라스/금색 강조 숫자로 보이도록 스타일을 키운다. 실제 렌더 위치는 OpeningSchematic이
          캔버스 밖 헤더 줄에 rightSlot으로 꽂아 넣는다(검색창 옆 좌우 배치를 그 컴포넌트가 담당). */}
      <OpeningSchematic tabsSlot={inlineTabs ? tabPills(0) : undefined} treeData={treeData} treeVersion={treeVersion} openKey={openKey} onToggleOpen={onToggleOpen} chesscom={chesscom} ccReady={ccReady} unlockAll={unlockAll} vertical={vertical} onOpenOpening={onOpenOpening} onOpenLearn={onOpenLearn} priorityRef={genPriorityRef} onUnlockStats={setUnlockStats} contentVer={contentVer} canAdd={canAdd} bumpContent={bumpContent}
        rightSlot={
          <div style={{ textAlign: vertical ? "left" : "right" }}>
            <div style={{ fontSize: 22, fontWeight: 900, color: T.brassHi, lineHeight: 1.15, letterSpacing: .2, textShadow: "0 1px 2px rgba(0,0,0,.35)" }}>
              {unlockStats && unlockStats.total ? ((100 * unlockStats.unlocked) / unlockStats.total).toFixed(2) : "0.00"}<span style={{ fontSize: 14 }}>%</span>
            </div>
            <div style={{ fontSize: 11, fontWeight: 700, color: T.inkSoft, marginTop: 1 }}>{tx("도감 해금률 {0}", <span style={{ fontFamily: SITE_FONT, fontWeight: 600 }}>({fmtFull((unlockStats && unlockStats.unlocked) || 0)}/{fmtFull((unlockStats && unlockStats.total) || 0)})</span>)}
            </div>
          </div>
        } />
      </>)}
    </div>
  );
}