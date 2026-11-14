// (v0.7.5, 사용자 요청) 도감 첫 화면 네 카드(오프닝·마스터·업적·스킨) — 사이트 공통 재료(흑단 바탕 위 아이보리 종이 패널, 갈색 잉크, 황동 칩·게이지, 나무 체스판).
//  테마 구분은 색이 아니라 카드 속 나무 체스판 조각 위의 장면으로 한다(오프닝: 방금 둔 첫 수 · 마스터: 마주 선 두 킹 · 업적: 월계관을 쓴 퀸 · 스킨: 스킨이 다른 나이트들).
// (v0.7.6, 사용자 요청) 레이아웃 재설계 — 레슨이 학습 탭으로 옮겨 가며 비어 버린 첫 화면을 "컬렉션 홀"로 다시 짰다.
//  · 머리: 큰 제목 "도감" + 한 줄 설명 + 모은 것 요약 칩(오프닝 해금률·칭호·스킨·마스터 수)
//  · 데스크톱(900px 이상): 벤토 격자 — 왼쪽 큰 오프닝 카드(두 줄 높이, 체스판이 위쪽을 채움), 오른쪽 위 넓은 마스터 카드(글 왼쪽·판 오른쪽), 오른쪽 아래 업적·스킨 타일 둘. 화면 높이에 맞춘다.
//  · 태블릿(640~899px): 오프닝·마스터가 한 줄씩, 업적·스킨이 나란히. · 모바일: 같은 순서에 크기만 줄인다(업적·스킨은 두 칸 타일).
//  · 카드 모양 세 가지: feature(판 위 + 글 아래, 큰 제목) · wide(글 왼쪽 + 판 오른쪽) · tile(판 위 + 글 아래, 작은 제목)
//  items: [{ key, label, Icon, percent(0~100|null), detail }] · summary: [{ key, label, value }]
import { FacetLeaf, taperedStem, facetRamp } from "./facetIcons.jsx";
import React from "react";
import { ChevronRight } from "./ocIcons.jsx";   // (v0.7.5) OpenChess 파셋 아이콘(예전 lucide 대체)
import { motion } from "framer-motion";
import { T, MOTION_EASE, PIECE_IMG_SETS } from "../lib/theme.js";
import { SITE_FONT } from "./engineLines.jsx";
import { t } from "../lib/i18n.js";

const LINE = "#DCCBA8", INK = "#2A1B0E", MUTED = "#7A6648", BRASS = "#A8842F", TRACK = "rgba(90,58,34,.12)";
// 체스판 조각: 4랭크 × 5파일을 그리고, 모바일은 오른쪽 3파일만 보인다(카드 높이에 맞춰 칸 크기가 정해진다). 장면 좌표의 열 2~4가 항상 보이는 칸.
const ROWS = 4, COLS = 5;
const img = (set, piece, color) => ((PIECE_IMG_SETS[set] || PIECE_IMG_SETS.classic).images[piece][color] || {}).src;

// 테마별 장면 — 칸 좌표는 [행(위→아래), 열(왼→오)]
const SCENES = {
  openings: { pieces: [{ at: [1, 3], src: img("classic", "P", "w") }, { at: [0, 4], src: img("classic", "N", "b") }, { at: [0, 0], src: img("classic", "P", "b") }, { at: [3, 1], src: img("classic", "N", "w") }], moved: [[3, 3], [1, 3]] },
  masters: { pieces: [{ at: [0, 3], src: img("classic", "K", "b") }, { at: [2, 3], src: img("classic", "K", "w") }, { at: [1, 0], src: img("classic", "P", "b") }, { at: [3, 1], src: img("classic", "R", "w") }] },
  titles: { pieces: [{ at: [1.45, 3], src: img("classic", "Q", "w") }, { at: [3, 0], src: img("classic", "P", "w") }, { at: [0, 1], src: img("classic", "B", "b") }], laurel: 3 },
  skins: { pieces: [{ at: [2, 2], src: img("classic", "N", "w") }, { at: [1, 3], src: img("crystal", "N", "w") }, { at: [2, 4], src: img("coral", "N", "w") }, { at: [1, 1], src: img("deco", "N", "w") }, { at: [3, 0], src: img("forest", "N", "w") }] },
};
const DESC = () => ({ openings: t("오프닝 수순 탐색과 해금"), masters: t("체스의 정점에 달한 선수들"), titles: t("모은 칭호와 다음 목표"), skins: t("기물·보드 세트 수집") });

/** 카드 속 나무 체스판 조각. side: 카드 오른쪽에 붙고 높이를 카드에 맞춤(폭은 칸 비율). top: 카드 위쪽을 가로로 채우고 가운데를 기준으로 위아래를 잘라 보인다. */
const LAUREL = facetRamp(T.brassHi);
function BoardPlate({ scene, mode = "side" }) {
  const top = mode === "top";
  // top 모드는 판을 더 크게(8랭크 × 7파일) 깔고 장면을 가운데로 옮긴다 — 세로로 긴 칸(데스크톱 오프닝 카드)을 덮어도 칸이 지나치게 커지지 않게.
  const R = top ? 8 : ROWS, C = top ? 7 : COLS, dr = top ? 2 : 0, dc = top ? 1 : 0;
  const pct = (v, n) => (v / n) * 100 + "%";
  const X = (c) => pct(c + dc, C), Y = (r) => pct(r + dr, R);
  return (
    <span aria-hidden="true" className={top ? "dexhub-plate-top" : "dexhub-plate"} style={top ? { position: "relative", display: "block", flex: 1, minHeight: 0, width: "100%", overflow: "hidden", borderBottom: "1px solid " + LINE, containerType: "size" } : { position: "relative", height: "100%", flexShrink: 0, overflow: "hidden", borderLeft: "1px solid " + LINE }}>
    <span style={{ position: "absolute", ...(top ? { left: "50%", top: "50%", transform: "translate(-50%,-50%)", width: "max(100cqw, " + (100 * C / R) + "cqh)" } : { top: 0, right: 0, height: "100%" }), aspectRatio: C + " / " + R, display: "grid", gridTemplateColumns: "repeat(" + C + ",1fr)", gridTemplateRows: "repeat(" + R + ",1fr)" }}>
      {Array.from({ length: R * C }, (_, i) => <span key={i} style={{ background: (Math.floor(i / C) + (i % C) + dr + dc) % 2 === 0 ? T.boardLight : T.boardDark }} />)}
      {/* 방금 둔 수의 출발·도착 칸 강조(황동 반투명) */}
      {(scene.moved || []).map(([r, c], i) => <span key={"m" + i} style={{ position: "absolute", left: X(c), top: Y(r), width: pct(1, C), height: pct(1, R), background: "rgba(236,203,134,.55)", boxShadow: "inset 0 0 0 2px rgba(168,132,47,.55)" }} />)}
      {scene.laurel && (
        <svg viewBox="0 0 60 80" style={{ position: "absolute", left: X(scene.laurel - 0.45), top: Y(0.95), width: pct(1.9, C), height: pct(2.05, R), filter: "drop-shadow(0 1px 1px rgba(0,0,0,.35))" }}>
          {/* (v0.7.5, 사용자 요청) 파셋 규칙: 잎은 밝은 반·어두운 반, 줄기는 가늘어지는 채운 면 */}
          {[-1, 1].map((s) => (
            <g key={s} transform={s < 0 ? "translate(60 0) scale(-1 1)" : undefined}>
              <path d={taperedStem(30, 76, 3, 52, 9, 20, 2.4, 0.8)} fill={LAUREL.l4} />
              {[[9, 24], [7.5, 35], [8.5, 46], [12, 57], [18, 66]].map(([x, y], i) => {
                const d = -120 + i * 14, r = (d * Math.PI) / 180, L = 9.6;   // 예전 타원 잎 자리·각도, 잎 끝은 위로
                return <FacetLeaf key={i} x={x - Math.cos(r) * L / 2} y={y - Math.sin(r) * L / 2} rot={d} sz={L / 1.35} R={LAUREL} mirror={s < 0} />;
              })}
            </g>
          ))}
        </svg>
      )}
      {scene.pieces.map((p, i) => (
        <img key={i} src={p.src} alt="" draggable={false} loading="lazy"
          style={{ position: "absolute", left: X(p.at[1] + 0.12), top: Y(p.at[0] + 0.1), width: pct(0.76, C), height: pct(0.82, R), objectFit: "contain", objectPosition: "center bottom", filter: "drop-shadow(0 2px 2px rgba(0,0,0,.35))" }} />
      ))}
    </span>
    </span>
  );
}

function Progress({ pct, detail }) {
  return (
    <span style={{ display: "flex", alignItems: "center", gap: 10 }}>
      {pct != null ? (
        <span aria-hidden="true" style={{ flex: 1, height: 5, borderRadius: 3, background: TRACK, overflow: "hidden" }}>
          <span style={{ display: "block", width: pct + "%", height: "100%", borderRadius: 3, background: "linear-gradient(90deg," + BRASS + "," + T.brassHi + ")" }} />
        </span>
      ) : <span style={{ flex: 1 }} />}
      <span style={{ fontSize: 12, fontWeight: 800, color: BRASS, fontVariantNumeric: "tabular-nums", whiteSpace: "nowrap" }}>{detail || ""}</span>
      <ChevronRight className="dexhub-chev" size={16} strokeWidth={2.2} color={MUTED} aria-hidden="true" />
    </span>
  );
}
/* variant: feature(판 위·큰 제목) · wide(글 왼쪽·판 오른쪽) · tile(판 위·작은 제목) */
function HubCard({ item, onOpen, index, desc, variant, area }) {
  const { Icon, label, percent, detail } = item;
  const pct = percent == null ? null : Math.max(0, Math.min(100, percent));
  const scene = SCENES[item.key] || SCENES.openings;
  const stacked = variant !== "wide";
  const text = (
    <span className={"dexhub-text dexhub-text-" + variant} style={{ flex: stacked ? "0 0 auto" : 1, minWidth: 0, display: "flex", flexDirection: "column", justifyContent: "space-between", gap: 10 }}>
      <span style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <span aria-hidden="true" className="dexhub-chip" style={{ alignSelf: "flex-start", flexShrink: 0, borderRadius: 10, display: "flex", alignItems: "center", justifyContent: "center", background: BRASS + "24", border: "1px solid " + BRASS + "66", color: BRASS }}>
          <Icon size={variant === "tile" ? 20 : 24} />
        </span>
        <span style={{ minWidth: 0 }}>
          <span className={"dexhub-title dexhub-title-" + variant} style={{ display: "block", fontWeight: 900, letterSpacing: "-.03em", lineHeight: 1.05 }}>{label}</span>
          <span className={"dexhub-desc dexhub-desc-" + variant} style={{ display: "block", marginTop: 4, fontWeight: 600, color: MUTED, lineHeight: 1.35 }}>{desc}</span>
        </span>
      </span>
      <Progress pct={pct} detail={detail} />
    </span>
  );
  return (
    <motion.button initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4, delay: 0.06 * index, ease: MOTION_EASE }}
      onClick={() => onOpen(item.key)} className={"press dexhub-card dexhub-" + variant} aria-label={label}
      style={{ gridArea: area, display: "flex", flexDirection: stacked ? "column" : "row", alignItems: "stretch", width: "100%", minWidth: 0, padding: 0, textAlign: "left", borderRadius: 16, overflow: "hidden", cursor: "pointer", fontFamily: SITE_FONT, color: INK }}>
      {stacked ? <><BoardPlate scene={scene} mode="top" />{text}</> : <>{text}<BoardPlate scene={scene} /></>}
    </motion.button>
  );
}

const VARIANT = { openings: "feature", masters: "wide", titles: "tile", skins: "tile" };
/** items: [{ key, label, Icon, percent(0~100|null), detail }] · summary: [{ key, label, value }](머리의 요약 칩) */
export function DexHub({ items, onOpen, summary = [] }) {
  const desc = DESC();
  return (
    <div className="dexhub" style={{ maxWidth: 1120, margin: "0 auto" }}>
      <style>{`
        .dexhub-card { background: ${T.paper}; border: 1px solid ${LINE}; box-shadow: 0 6px 18px -8px rgba(0,0,0,.55); transition: background .2s, border-color .2s, transform .2s, box-shadow .2s; }
        .dexhub-card:hover { background: #F7EEDC; border-color: ${T.brass}; transform: translateY(-2px); box-shadow: 0 12px 26px -10px rgba(0,0,0,.6); }
        .dexhub-card:focus-visible { outline: 2px solid ${T.brassHi}; outline-offset: 2px; }
        .dexhub-card .dexhub-chev { transition: transform .2s; }
        .dexhub-card:hover .dexhub-chev { transform: translateX(3px); }
        .dexhub-grid { display: grid; gap: 12px; grid-template-columns: 1fr 1fr; grid-template-areas: "openings openings" "masters masters" "titles skins"; }
        .dexhub-feature { height: 360px; } .dexhub-wide { height: 132px; } .dexhub-tile { height: 236px; }
        .dexhub-text { padding: 13px 14px 12px 14px; } .dexhub-text-tile { padding: 11px 12px 11px; }
        .dexhub-chip { width: 34px; height: 34px; } .dexhub-tile .dexhub-chip { width: 30px; height: 30px; }
        .dexhub-title-feature { font-size: 28px; } .dexhub-title-wide { font-size: 22px; } .dexhub-title-tile { font-size: 18px; }
        .dexhub-desc { font-size: 12.5px; } .dexhub-desc-tile { font-size: 11.5px; }
        .dexhub-plate { aspect-ratio: 3 / 4; }
        .dexhub-sum { display: flex; gap: 8px; flex-wrap: wrap; }
        @media (min-width: 640px) {
          .dexhub-grid { gap: 14px; }
          .dexhub-feature { height: 400px; } .dexhub-wide { height: 160px; } .dexhub-tile { height: 270px; }
          .dexhub-title-feature { font-size: 32px; } .dexhub-title-wide { font-size: 28px; } .dexhub-title-tile { font-size: 22px; }
          .dexhub-text { padding: 16px 18px 14px; } .dexhub-plate { aspect-ratio: 5 / 4; }
        }
        @media (min-width: 900px) {
          .dexhub-grid { grid-template-columns: 1.2fr 1fr 1fr; grid-template-rows: minmax(0, 0.9fr) minmax(0, 1.1fr); grid-template-areas: "openings masters masters" "openings titles skins"; height: max(520px, calc(100dvh - 300px)); }
          .dexhub-feature, .dexhub-wide, .dexhub-tile { height: auto; min-height: 0; }
          .dexhub-title-feature { font-size: 38px; }
          .dexhub-desc-feature { font-size: 14px; }
        }
      `}</style>
      <header style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", gap: 14, flexWrap: "wrap", margin: "2px 2px 14px" }}>
        <div style={{ minWidth: 0 }}>
          <div style={{ fontSize: 10.5, fontWeight: 800, letterSpacing: ".26em", color: T.brassHi }}>COLLECTION</div>
          <h1 style={{ margin: "2px 0 0", fontSize: 30, fontWeight: 900, color: T.ivoryHi, letterSpacing: "-.03em", lineHeight: 1.1 }}>{t("도감")}</h1>
          <div style={{ fontSize: 12.5, color: "#C9B58C", marginTop: 4 }}>{t("오프닝을 해금하고 마스터를 만나고 칭호와 스킨을 모으는 곳")}</div>
        </div>
        {summary.length > 0 && (
          <div className="dexhub-sum" role="list" aria-label={t("모은 것")}>
            {summary.map((x) => (
              <span key={x.key} role="listitem" style={{ display: "inline-flex", alignItems: "baseline", gap: 6, padding: "6px 11px", borderRadius: 999, background: "rgba(236,203,134,.08)", border: "1px solid rgba(236,203,134,.28)" }}>
                <span style={{ fontSize: 11, fontWeight: 700, color: "#C9B58C" }}>{x.label}</span>
                <span style={{ fontSize: 13.5, fontWeight: 900, color: T.brassHi, fontFamily: SITE_FONT, fontVariantNumeric: "tabular-nums" }}>{x.value}</span>
              </span>
            ))}
          </div>
        )}
      </header>
      <div className="dexhub-grid">
        {items.map((it, i) => <HubCard key={it.key} item={it} onOpen={onOpen} index={i} desc={desc[it.key] || ""} variant={VARIANT[it.key] || "tile"} area={it.key} />)}
      </div>
    </div>
  );
}

/* (v0.7.6, 사용자 요청) 도감 안쪽 화면(오프닝·마스터·업적·스킨) 위의 구획 전환 줄 — 첫 화면으로 돌아가지 않고 바로 다른 구획으로 간다.
   지금 구획은 황동으로 채우고, 각 칸에 아이콘·이름·진행(카드의 detail)을 작게 보여 준다. 좁은 화면에서는 가로로 밀어 본다. */
export function DexSectionNav({ items, current, onOpen }) {
  return (
    <nav aria-label={t("도감 구획")} className="dexnav" ref={(el) => { if (el) { const a = el.querySelector("[aria-current=page]"); if (a && a.scrollIntoView) try { a.scrollIntoView({ block: "nearest", inline: "nearest" }); } catch { } } }} style={{ display: "flex", gap: 6, overflowX: "auto", scrollbarWidth: "none", margin: "0 0 12px", padding: 3, borderRadius: 13, background: "rgba(0,0,0,.25)", border: "1px solid #3E2F21" }}>
      <style>{`@media (max-width: 640px) { .dexnav .dexnav-detail { display: none; } .dexnav button { padding: 0 8px !important; gap: 5px !important; } }`}</style>
      {items.map((it) => {
        const on = it.key === current, Icon = it.Icon;
        return (
          <button key={it.key} type="button" onClick={() => !on && onOpen(it.key)} aria-current={on ? "page" : undefined} className="press"
            style={{ flex: "1 0 auto", display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 7, height: 38, padding: "0 13px", borderRadius: 10, border: "none", cursor: on ? "default" : "pointer", fontFamily: SITE_FONT, whiteSpace: "nowrap",
              background: on ? "linear-gradient(180deg," + T.brassHi + "," + T.brass + ")" : "transparent", color: on ? "#241509" : T.ivory, boxShadow: on ? "0 2px 0 #7A5A20" : "none" }}>
            <Icon size={17} />
            <span style={{ fontSize: 13, fontWeight: 900 }}>{it.label}</span>
            {it.detail && <span className="dexnav-detail" style={{ fontSize: 11, fontWeight: 800, opacity: on ? 0.75 : 0.6, fontVariantNumeric: "tabular-nums" }}>{it.detail}</span>}
          </button>
        );
      })}
    </nav>
  );
}
