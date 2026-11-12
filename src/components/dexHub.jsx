// (v0.7.5, 사용자 요청) 도감 첫 화면 네 카드(오프닝·마스터·업적·스킨) 재디자인 — 사이트 전체와 같은 재료로.
//  v0.7.4의 "포스터" 카드(테마별 파랑·보라·청록 네온 그라데이션 + 육각 메달 + 빛 쓸기)는 다른 화면과 소재가 달라 이질적이었다.
//  사이트의 공통 재료: 흑단 바탕 위 아이보리 종이 패널(#F1E6D0, 테두리 #DCCBA8), 갈색 잉크 글자, 황동 칩·게이지, 나무 체스판.
//  · 카드 = 플레이 탭 "일반 대국" 카드와 같은 종이 패널. 테마 구분은 색이 아니라 오른쪽에 붙은 나무 체스판 조각 위의 장면으로 한다.
//      오프닝: 폰이 두 칸 나아간 첫 수(보드의 "방금 둔 수" 칸 강조) · 마스터: 마주 선 두 킹(오퍼지션) · 업적: 월계관을 쓴 퀸 · 스킨: 스킨이 다른 나이트 셋
//  · 왼쪽 = 황동 아이콘 칩(퀘스트 패널과 같은 칩) + 굵은 제목(일반 대국과 같은 900 굵기) + 한 줄 설명 + 얇은 진행 게이지(퀘스트 진행 막대와 같은 모양).
//  · 데스크톱 2×2(플레이 탭과 같은 폭), 모바일은 한 줄에 하나. 올리면 플레이 탭 카드처럼 테두리가 황동으로, 바탕이 한 단계 밝아진다.
//  items: [{ key, label, Icon, percent(0~100|null), detail }]
import { FacetLeaf, taperedStem, facetRamp } from "./facetIcons.jsx";
import React from "react";
import { ChevronRight } from "lucide-react";
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
const DESC = () => ({ openings: t("오프닝 수순 탐색과 해금"), masters: t("명인 대국과 선수 프로필"), titles: t("모은 칭호와 다음 목표"), skins: t("기물·보드 세트 수집") });

/** 카드 오른쪽 나무 체스판 조각 — 높이는 카드에 맞추고 폭은 칸 비율로 정한다. */
const LAUREL = facetRamp(T.brassHi);
function BoardPlate({ scene }) {
  const pct = (v, n) => (v / n) * 100 + "%";
  return (
    <span aria-hidden="true" className="dexhub-plate" style={{ position: "relative", height: "100%", flexShrink: 0, overflow: "hidden", borderLeft: "1px solid " + LINE }}>
    <span style={{ position: "absolute", top: 0, right: 0, height: "100%", aspectRatio: COLS + " / " + ROWS, display: "grid", gridTemplateColumns: "repeat(" + COLS + ",1fr)", gridTemplateRows: "repeat(" + ROWS + ",1fr)" }}>
      {Array.from({ length: ROWS * COLS }, (_, i) => <span key={i} style={{ background: (Math.floor(i / COLS) + (i % COLS)) % 2 === 0 ? T.boardLight : T.boardDark }} />)}
      {/* 방금 둔 수의 출발·도착 칸 강조(황동 반투명) */}
      {(scene.moved || []).map(([r, c], i) => <span key={"m" + i} style={{ position: "absolute", left: pct(c, COLS), top: pct(r, ROWS), width: pct(1, COLS), height: pct(1, ROWS), background: "rgba(236,203,134,.55)", boxShadow: "inset 0 0 0 2px rgba(168,132,47,.55)" }} />)}
      {scene.laurel && (
        <svg viewBox="0 0 60 80" style={{ position: "absolute", left: pct(scene.laurel - 0.45, COLS), top: pct(0.95, ROWS), width: pct(1.9, COLS), height: pct(2.05, ROWS), filter: "drop-shadow(0 1px 1px rgba(0,0,0,.35))" }}>
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
          style={{ position: "absolute", left: pct(p.at[1] + 0.12, COLS), top: pct(p.at[0] + 0.1, ROWS), width: pct(0.76, COLS), height: pct(0.82, ROWS), objectFit: "contain", objectPosition: "center bottom", filter: "drop-shadow(0 2px 2px rgba(0,0,0,.35))" }} />
      ))}
    </span>
    </span>
  );
}

function HubCard({ item, onOpen, index, desc }) {
  const { Icon, label, percent, detail } = item;
  const pct = percent == null ? null : Math.max(0, Math.min(100, percent));
  const scene = SCENES[item.key] || SCENES.openings;
  return (
    <motion.button initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.35, delay: 0.05 * index, ease: MOTION_EASE }}
      onClick={() => onOpen(item.key)} className="press dexhub-card" aria-label={label}
      style={{ display: "flex", alignItems: "stretch", width: "100%", padding: 0, textAlign: "left", borderRadius: 14, overflow: "hidden", cursor: "pointer", fontFamily: SITE_FONT, color: INK }}>
      <span style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", justifyContent: "space-between", gap: 10, padding: "14px 14px 13px 16px" }}>
        <span style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <span aria-hidden="true" style={{ alignSelf: "flex-start", width: 34, height: 34, flexShrink: 0, borderRadius: 10, display: "flex", alignItems: "center", justifyContent: "center", background: BRASS + "24", border: "1px solid " + BRASS + "66", color: BRASS }}>
            <Icon size={18} strokeWidth={1.9} />
          </span>
          <span style={{ minWidth: 0 }}>
            <span className="dexhub-title" style={{ display: "block", fontWeight: 900, letterSpacing: "-.03em", lineHeight: 1.05 }}>{label}</span>
            <span style={{ display: "block", marginTop: 4, fontSize: 12.5, fontWeight: 600, color: MUTED, lineHeight: 1.35 }}>{desc}</span>
          </span>
        </span>
        <span style={{ display: "flex", alignItems: "center", gap: 10 }}>
          {pct != null ? (
            <span aria-hidden="true" style={{ flex: 1, height: 5, borderRadius: 3, background: TRACK, overflow: "hidden" }}>
              <span style={{ display: "block", width: pct + "%", height: "100%", borderRadius: 3, background: "linear-gradient(90deg," + BRASS + "," + T.brassHi + ")" }} />
            </span>
          ) : <span style={{ flex: 1 }} />}
          <span style={{ fontSize: 12, fontWeight: 800, color: BRASS, fontVariantNumeric: "tabular-nums", whiteSpace: "nowrap" }}>{detail || ""}</span>
          <ChevronRight className="dexhub-chev" size={16} strokeWidth={2.2} color={MUTED} aria-hidden="true" />
        </span>
      </span>
      <BoardPlate scene={scene} />
    </motion.button>
  );
}

/** items: [{ key, label, Icon, percent(0~100|null), detail }] */
export function DexHub({ items, onOpen }) {
  const desc = DESC();
  return (
    <div style={{ maxWidth: 1060, margin: "0 auto" }}>
      <style>{`
        .dexhub-card { background: ${T.paper}; border: 1px solid ${LINE}; box-shadow: 0 4px 14px -4px rgba(0,0,0,.45); height: 116px; transition: background .2s, border-color .2s; }
        .dexhub-card:hover { background: #F7EEDC; border-color: ${T.brass}; }
        .dexhub-card:focus-visible { outline: 2px solid ${T.brassHi}; outline-offset: 2px; }
        .dexhub-card .dexhub-chev { transition: transform .2s; }
        .dexhub-card:hover .dexhub-chev { transform: translateX(3px); }
        .dexhub-title { font-size: 21px; }
        .dexhub-plate { aspect-ratio: 3 / 4; }
        @media (min-width: 640px) { .dexhub-card { height: 164px; } .dexhub-title { font-size: 28px; } .dexhub-plate { aspect-ratio: 5 / 4; } }
      `}</style>
      <div className="grid grid-cols-1 sm:grid-cols-2" style={{ gap: 14 }}>
        {items.map((it, i) => <HubCard key={it.key} item={it} onOpen={onOpen} index={i} desc={desc[it.key] || ""} />)}
      </div>
    </div>
  );
}
