import React, { useState, useRef, useEffect, useMemo } from "react";
import { motion, AnimatePresence, useInView } from "framer-motion";
import {
  GraduationCap, Library, Puzzle, Target, Crown, Users, ArrowRight, Sparkles,
  Palette, MousePointer, Zap, Wrench, Shield, ChevronLeft, ChevronRight,
  Send, Compass, Rocket, Star, Gem, Pin, Share2, Pencil, Play, Trophy,
} from "lucide-react";

import { t, tx } from "./lib/i18n.js";
import LangSwitch from "./components/LangSwitch.jsx";
// (v0.1.2 기능) 사이트를 소개하는 별도 페이지(/about) — App.jsx의 무거운 초기화(엔진 워커, Supabase
// 클라이언트, 계정 상태 등)와 완전히 분리된 가벼운 정적 컴포넌트로 둔다(main.jsx에서 경로에 따라
// App 대신 이 컴포넌트를 렌더링). 그래서 여기서 쓰는 색 토큰·장식 모티프는 App.jsx의 T 객체·
// BOARD_GLOSS·GeoBackdrop을 그대로 가져오지 않고, 같은 톤을 내도록 필요한 값만 옮겨 적었다
// (기존 사이트와 시각적으로 통일되게).
const T = {
  ebony: "#1B1009", ebony2: "#2E1B10",
  ivory: "#EBDDC4", ivoryHi: "#FAF2E2",
  ink: "#5A3A22", inkSoft: "#B8A78C",
  brass: "#C49A50", brassHi: "#ECCB86",
};
// (기존 BOARD_GLOSS와 동일한 금색 광택 테두리 — 보드·모식도 등 사이트 전역에서 쓰는 것과 같은 처리)
const GLOSS_BORDER = {
  border: "2px solid transparent",
  borderImage: "linear-gradient(135deg, #F3DFAE, #C49A50 45%, #8A6C2F) 1",
  boxShadow: "0 0 0 1px rgba(196,154,80,.3), inset 0 1px 3px rgba(255,255,255,.4), inset 0 -2px 5px rgba(0,0,0,.3)",
};
// 브라스 그러데이션 원 — 마스코트 초상(SpeechBubble 아바타·히어로 MILKU)을 감싸는 원형 배경 전용.
// (v0.1.3) 실제 티어 배지(App.jsx TierLogoDisc)는 흰색 십각형으로 바뀌었지만, 이 원은 티어가 아니라
// 마스코트 초상 프레임이라 그대로 둔다 — 아래 TierBadgeShape이 실제 티어 배지 쪽만 맞춰 바꾼다.
const GOLD_DISC = {
  borderRadius: "50%",
  background: "radial-gradient(70% 70% at 32% 28%," + T.brassHi + "," + T.brass + " 68%,#8A6C2F 100%)",
  border: "1px solid #6E5424",
  boxShadow: "inset 0 1px 2px rgba(255,255,255,.5), inset 0 -3px 6px rgba(0,0,0,.25), 0 2px 6px rgba(0,0,0,.35)",
};
// (v0.1.3 UI) App.jsx TierLogoDisc와 동일한 흰색 십각형 배지 — 이 페이지의 티어 스트립·승급 데모도
// 실제 사이트와 같은 모양으로 보여준다(같은 rx/ry 비율의 십각형 좌표 계산도 그대로 옮겨 적음).
// (사용자 요청) App.jsx/pieces.jsx의 TIER_DECAGON_PATH와 동일한 라운딩 알고리즘 — 이 페이지는
// App.jsx의 다른 모듈을 가져오지 않는 독립된 정적 페이지라 좌표 계산을 그대로 옮겨 적은 것처럼,
// 라운딩 계산도 그대로 옮겨 적는다(각 꼭짓점을 인접한 두 변을 따라 cornerRadius만큼 안쪽으로 들어간
// 두 점 사이를, 원래 꼭짓점을 제어점으로 삼는 2차 베지어 곡선으로 이어 붙인다).
function roundedPolygonPath(pts, r) {
  const n = pts.length;
  const dist = (a, b) => Math.hypot(b[0] - a[0], b[1] - a[1]);
  let d = "";
  for (let i = 0; i < n; i++) {
    const prev = pts[(i - 1 + n) % n], cur = pts[i], next = pts[(i + 1) % n];
    const dPrev = dist(cur, prev), dNext = dist(cur, next);
    const rr = Math.min(r, dPrev / 2, dNext / 2);
    const a = [cur[0] + (prev[0] - cur[0]) / dPrev * rr, cur[1] + (prev[1] - cur[1]) / dPrev * rr];
    const b = [cur[0] + (next[0] - cur[0]) / dNext * rr, cur[1] + (next[1] - cur[1]) / dNext * rr];
    d += (i === 0 ? "M " : "L ") + a[0].toFixed(2) + "," + a[1].toFixed(2) + " ";
    d += "Q " + cur[0].toFixed(2) + "," + cur[1].toFixed(2) + " " + b[0].toFixed(2) + "," + b[1].toFixed(2) + " ";
  }
  return d + "Z";
}
const TIER_DECAGON_PATH = (() => {
  const rx = 46, ry = 50;
  const pts = Array.from({ length: 10 }, (_, i) => {
    const a = -Math.PI / 2 + i * (Math.PI / 5);
    return [50 + rx * Math.cos(a), 50 + ry * Math.sin(a)];
  });
  return roundedPolygonPath(pts, 6);
})();
function TierBadgeShape({ size, children }) {
  return (
    <div style={{ position: "relative", width: size, height: size, flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center" }}>
      <svg viewBox="0 0 100 100" width="100%" height="100%" style={{ position: "absolute", inset: 0 }}>
        <path d={TIER_DECAGON_PATH} fill="#FFFFFF" stroke="#D8CFB8" strokeWidth="2" strokeLinejoin="round" />
      </svg>
      <div style={{ position: "relative", zIndex: 1, display: "flex", alignItems: "center", justifyContent: "center" }}>{children}</div>
    </div>
  );
}

function Diamond({ x, y, size = 16, opacity = 0.18 }) {
  return <rect x={x} y={y} width={size} height={size} transform={"rotate(45 " + (x + size / 2) + " " + (y + size / 2) + ")"} fill="none" stroke={T.brass} strokeWidth="1.2" opacity={opacity} />;
}
// (기존 GeoBackdrop과 같은 계열의 옅은 와이어프레임 다이아몬드 배경 — 톤을 맞추되 더 절제된 밀도로.
function Backdrop() {
  return (
    <svg aria-hidden="true" width="100%" height="100%" viewBox="0 0 1200 2400" preserveAspectRatio="xMidYMin slice" style={{ position: "fixed", inset: 0, zIndex: 0, pointerEvents: "none" }}>
      <circle cx="980" cy="180" r="320" fill="none" stroke={T.brass} strokeWidth="1" opacity="0.08" />
      <circle cx="120" cy="900" r="260" fill="none" stroke={T.brass} strokeWidth="1" opacity="0.06" strokeDasharray="2 9" />
      <circle cx="1080" cy="1500" r="300" fill="none" stroke={T.brass} strokeWidth="1" opacity="0.07" />
      <Diamond x={90} y={340} size={26} /><Diamond x={1040} y={480} size={18} opacity={0.12} />
      <Diamond x={60} y={1200} size={20} opacity={0.1} /><Diamond x={1120} y={1000} size={24} opacity={0.12} />
      <Diamond x={200} y={1900} size={22} opacity={0.1} /><Diamond x={980} y={2100} size={16} opacity={0.1} />
    </svg>
  );
}

// (v0.1.2 기능) 페이지 전반에 애니메이션을 많이 쓰고 싶다는 요청 — 스크롤로 보일 때마다(페이지를
// 넘겨 처음 등장할 때도 포함, 아래 Pager의 translateX 슬라이드가 곧 "뷰포트 안으로 들어옴"이라
// whileInView가 그대로 반응한다) 살짝 떠오르며 나타나는 하나의 재사용 wrapper로 통일한다.
// (v0.1.3 기능) "스크롤해서 Y좌표가 바뀌면 계속 재생되도록(1회성 아님)" 요청 — viewport once 기본값을
// false로 바꿔, 화면 밖으로 나갔다가 다시 들어올 때마다 매번 다시 재생되게 한다(whileInView는
// once:false일 때 뷰포트를 벗어나면 자동으로 initial 상태로 되돌아갔다가 재진입 시 다시 재생됨).
function Reveal({ children, delay = 0, y = 16, once = false }) {
  return (
    <motion.div initial={{ opacity: 0, y }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once, amount: 0.25 }} transition={{ duration: 0.55, delay, ease: [0.22, 0.9, 0.32, 1] }}>
      {children}
    </motion.div>
  );
}

// ============================================================ 마스코트 ============================================================
// (v0.1.4 기능) "마스코트 이미지는 선이 깔끔한 이미지만 쓰고, 이모티콘(스티커)용 이미지는 쓰지 말 것"
// 이라는 요청 — App.jsx가 분석 탭 등 실제 UI 전반에서 이미 쓰고 있는 MASCOT_ART(플랫 벡터 일러스트,
// 표정별 12종)를 그대로 재사용한다. public/emoji/*.png(스케치풍 스티커, 이모티콘 선택 창 전용)와는
// 완전히 다른 자산 — App.jsx에 인라인 base64로 박혀 있던 걸 이 페이지(무거운 초기화가 없는 정적
// 컴포넌트)에서도 가볍게 쓸 수 있도록 public/mascot/*.webp 파일로 그대로 추출해 둔 것을 가리킨다.
function Mascot({ char = "milku", expr = "great", size = 72 }) {
  return <img src={"/mascot/" + char + "_" + expr + ".webp"} alt="" style={{ width: size, height: size, objectFit: "contain" }} />;
}

// (기존 MascotBubble과 동일한 시각 언어 — 원형 초상 + 이름표 + 말풍선)
function SpeechBubble({ mascot, name, children, align = "left" }) {
  const avatar = <div style={{ width: 76, height: 76, flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center", ...GOLD_DISC }}><Mascot char={mascot.char} expr={mascot.expr} size={60} /></div>;
  const bubble = (
    <div style={{ minWidth: 0, flex: 1, background: "linear-gradient(180deg,#3A2516,#241509)", borderRadius: 14, padding: "13px 16px", border: "1px solid #000", boxShadow: "inset 0 1px 0 rgba(255,255,255,.05)" }}>
      <div style={{ color: T.brassHi, fontSize: 11, fontWeight: 800, marginBottom: 4 }}>{name}</div>
      <p style={{ color: T.ivory, fontSize: 13, lineHeight: 1.65, margin: 0 }}>{children}</p>
    </div>
  );
  return (
    <Reveal>
      <div className="flex items-start" style={{ gap: 12, flexDirection: align === "right" ? "row-reverse" : "row" }}>
        {avatar}{bubble}
      </div>
    </Reveal>
  );
}

// 섹션 사이 구분선 — 사이트 전역 장식(브라스 다이아몬드)과 같은 모티프 + 워드마크 반복.
function SectionDivider() {
  return (
    <Reveal y={0}>
      <div className="flex items-center" style={{ gap: 10, margin: "56px 0", opacity: 0.75 }}>
        <div style={{ flex: 1, height: 1, background: "linear-gradient(90deg,transparent," + T.brass + ")" }} />
        <motion.svg width="14" height="14" viewBox="0 0 14 14" animate={{ rotate: 360 }} transition={{ duration: 8, repeat: Infinity, ease: "linear" }}><rect x="2" y="2" width="10" height="10" transform="rotate(45 7 7)" fill="none" stroke={T.brass} strokeWidth="1.4" /></motion.svg>
        <span style={{ fontSize: 10, fontWeight: 800, letterSpacing: ".22em", color: T.brass }}>OPENCHESS</span>
        <motion.svg width="14" height="14" viewBox="0 0 14 14" animate={{ rotate: -360 }} transition={{ duration: 8, repeat: Infinity, ease: "linear" }}><rect x="2" y="2" width="10" height="10" transform="rotate(45 7 7)" fill="none" stroke={T.brass} strokeWidth="1.4" /></motion.svg>
        <div style={{ flex: 1, height: 1, background: "linear-gradient(90deg," + T.brass + ",transparent)" }} />
      </div>
    </Reveal>
  );
}

// (v0.1.3 기능) "실제 웹사이트 화면 스크린샷도 많이 사용해 달라"는 요청 — 게스트 모드로 각 탭을
// 직접 캡처해 public/about/에 넣어둔 실제 스크린샷을, 폰 베젤 느낌의 액자(GLOSS_BORDER 재사용)에
// 담아 보여준다. 세로로 긴 원본을 그대로 넣으면 액자가 너무 길어지므로 고정 높이 + object-fit:cover
// (상단 정렬)로 헤더~핵심 UI가 보이는 부분만 잘라 보여준다.
function PhoneFrame({ src, alt, tilt = 0, delay = 0 }) {
  return (
    <motion.div initial={{ opacity: 0, scale: 0.85, rotate: tilt + (tilt >= 0 ? 7 : -7), y: 18 }} whileInView={{ opacity: 1, scale: 1, rotate: tilt, y: 0 }} viewport={{ once: false, amount: 0.4 }} transition={{ duration: 0.55, delay, ease: [0.22, 0.9, 0.32, 1] }}>
      <motion.div animate={{ y: [0, -8, 0] }} transition={{ duration: 4, repeat: Infinity, ease: "easeInOut", delay }}
        style={{ borderRadius: 20, padding: 5, background: "linear-gradient(160deg,#3A2516,#20140B)", ...GLOSS_BORDER, boxShadow: GLOSS_BORDER.boxShadow + ", 0 20px 40px -16px rgba(0,0,0,.65)" }}>
        <div style={{ borderRadius: 15, overflow: "hidden", border: "1px solid #000", height: 340 }}>
          <img src={src} alt={alt} style={{ width: "100%", height: "100%", objectFit: "cover", objectPosition: "top center", display: "block" }} />
        </div>
      </motion.div>
    </motion.div>
  );
}

// 기능 소개 한 줄(실제 화면 스크린샷 ↔ 텍스트, 좌우 번갈아 배치) — 참고 이미지의 "대사+삽화" 레이아웃을
// 그대로 빌리되, 삽화 자리를 실제 서비스 스크린샷(PhoneFrame)으로 채우고, 마스코트는 그 모서리에
// 작은 스티커처럼 겹쳐 붙여 캐릭터성도 함께 남긴다.
function FeatureRow({ Icon, eyebrow, title, desc, quote, shot, mascotChar, mascotExpr, reverse, ccBadge }) {
  return (
    <div className="flex items-center flex-wrap" style={{ gap: 32, flexDirection: reverse ? "row-reverse" : "row" }}>
      <div style={{ flex: "0 0 auto", width: 180, maxWidth: "100%", margin: "0 auto", position: "relative" }}>
        <PhoneFrame src={shot} alt={title} tilt={reverse ? 4 : -4} />
        <motion.div initial={{ opacity: 0, scale: 0.4, rotate: reverse ? -16 : 16 }} whileInView={{ opacity: 1, scale: 1, rotate: reverse ? -9 : 9 }} viewport={{ once: false, amount: 0.5 }} transition={{ duration: 0.5, delay: 0.18, ease: [0.22, 0.9, 0.32, 1] }}
          style={{ position: "absolute", width: 58, height: 58, bottom: -12, [reverse ? "left" : "right"]: -16, filter: "drop-shadow(0 4px 8px rgba(0,0,0,.55))", zIndex: 3 }}>
          <Mascot char={mascotChar} expr={mascotExpr} size={58} />
        </motion.div>
      </div>
      <Reveal delay={0.1}>
        <div style={{ flex: "1 1 300px", minWidth: 260 }}>
          <div className="flex items-center gap-2" style={{ marginBottom: 8 }}>
            <span style={{ width: 30, height: 30, borderRadius: 9, background: "rgba(196,154,80,.15)", border: "1px solid " + T.brass, display: "inline-flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}><Icon size={15} color={T.brassHi} /></span>
            <span style={{ fontSize: 11, fontWeight: 800, color: T.brass, letterSpacing: ".08em" }}>{eyebrow}</span>
            {ccBadge && <span title={t("chess.com 연동")} style={{ fontSize: 10, fontWeight: 900, color: T.brass, border: "1px solid " + T.brass, borderRadius: 5, padding: "1px 5px", marginLeft: 2 }}>chess.com</span>}
          </div>
          <h3 style={{ fontSize: 21, fontWeight: 900, color: T.ivoryHi, margin: "0 0 10px" }}>{title}</h3>
          <p style={{ fontSize: 13, color: T.inkSoft, lineHeight: 1.75, margin: "0 0 12px" }}>{desc}</p>
          {quote && <p style={{ fontSize: 12.5, color: T.brassHi, fontWeight: 700, fontStyle: "italic", margin: 0, opacity: .9 }}>&ldquo;{quote}&rdquo;</p>}
        </div>
      </Reveal>
    </div>
  );
}

const FEATURES = [
  { Icon: GraduationCap, eyebrow: t("분석"), title: t("엔진과 함께 배우기"), shot: "/about/screenshot-study.webp", mascotChar: "milku", mascotExpr: "think", ccBadge: true,
    desc: t("Stockfish 엔진의 실시간 분석과 함께 수를 두며 학습. chess.com 계정을 연동하면 실제 대국을 불러와 어디서 무엇을 놓쳤는지 확인") },
  { Icon: Library, eyebrow: t("도감"), title: t("오프닝 나침반"), shot: "/about/screenshot-dex.webp", mascotChar: "milku", mascotExpr: "wink",
    desc: t("1.e4·1.d4·1.c4·1.Nf3 네 방향으로 뻗는 오프닝 트리에서 각 수의 채택률·평가치·이름 확인. 이탈리안 게임, 루이 로페즈 같은 대표 오프닝은 별도 칭호로 수집") },
  { Icon: Puzzle, eyebrow: t("퍼즐"), title: t("내 실수로 만든 퍼즐"), shot: "/about/screenshot-puzzle.webp", mascotChar: "kokoa", mascotExpr: "think",
    desc: t("\"기물 희생하기\" · \"우위 점하기\" · \"실수 응징하기\" 세 테마. 실전에서 나온 실수로 자동 생성되는 맞춤 전술 퍼즐. 친구에게 공유 가능") },
  { Icon: Target, eyebrow: t("학습"), title: t("매일 조금씩"), shot: "/about/screenshot-quest.webp", mascotChar: "kokoa", mascotExpr: "celebrate",
    desc: t("매일 갱신되는 일일 퀘스트와, 갈래를 따라 순서대로 열리는 메인 퀘스트 '레슨'을 완료하고 OC 나이트 코인 획득") },
  { Icon: Wrench, eyebrow: t("설정"), title: t("내게 맞게 조정하기"), shot: "/about/screenshot-settings.webp", mascotChar: "milku", mascotExpr: "wink",
    desc: t("가볍고 빠른 Stockfish 18 Lite와 더 강력한 Stockfish 17.1·18 중 기기에 맞는 분석 엔진 선택. 로그인하면 진도가 계정에 저장되어 어느 기기에서든 이어서 사용") },
];

// (v0.1.3 기능) "체스 웹사이트니까 사이사이에 체스보드를 많이 넣어달라"는 요청 — 실제 기물 이미지
// (App.jsx PieceGlyph와 같은 자산)로 8x8 보드를 그리고, 지정된 한 수를 무한 반복 슬라이드로
// 시연하는 장식용 미니 보드. 스크롤로 들어올 때마다 살짝 튀어오르며 등장하고(Reveal과 같은 방식,
// once:false), 등장 후에는 은은하게 위아래로 떠 있으며, 그 안의 기물은 스크롤과 무관하게 항상
// 같은 수를 반복 재생한다 — 페이지 전체가 "계속 움직이고 있다"는 인상을 준다.
// (v0.1.4 UI) "체스보드가 너무 간소하다 — 디테일을 더 넣어달라"는 요청 — 단색 사각형 대신 결이
// 보이는 원목 질감(가는 줄무늬 그러데이션 두 겹 + 미세한 밝기 편차)을 칸마다 깔고, 실제 체스 사이트처럼
// 가장자리에 파일(a~h)·랭크(1~8) 좌표를 옅게 새겨 넣는다. 보드 전체에는 네 모서리가 살짝 어두워지는
// 비네트를 얹어 입체감을 준다.
const SQ_LIGHT_BG = "repeating-linear-gradient(100deg, rgba(255,255,255,.16) 0px, rgba(255,255,255,.16) 1px, transparent 1px, transparent 3px), linear-gradient(155deg,#F2E1BE,#E8D2A6 55%,#DDC38F)";
const SQ_DARK_BG = "repeating-linear-gradient(100deg, rgba(0,0,0,.14) 0px, rgba(0,0,0,.14) 1px, transparent 1px, transparent 3px), linear-gradient(155deg,#8C5D38,#7C4F2E 55%,#68401F)";
const DECO_PIECE_SRC = {
  wP: "/White Pawn.png", wN: "/White Knight.png", wB: "/White Bishop.png", wR: "/White Rook.png", wQ: "/White Queen.png", wK: "/White King.png",
  bP: "/Black Pawn.png", bN: "/Black Knight.png", bB: "/Black Bishop.png", bR: "/Black Rook.png", bQ: "/Black Queen.png", bK: "/Black King.png",
};
const dpct = (n) => (n / 8 * 100) + "%";
const FILES = ["a", "b", "c", "d", "e", "f", "g", "h"];
function DecoBoard({ size = 148, pieces = [], move, caption, tilt = 0, delay = 0 }) {
  // (v0.2.2 UX#1 후속) 이 페이지엔 DecoBoard가 10개 넘게 동시에 마운트돼 있고, 예전엔 화면 밖에 있는
  // 보드도 계속 무한 반복 애니메이션(위아래 둥실임 + 수 이동)을 돌리고 있었다 — 스크롤 중엔 매 프레임
  // 그만큼의 transform 애니메이션이 동시에 재계산·합성돼야 해, 특히 "유명한 오프닝들"처럼 보드가
  // 많이 몰린 구간에서 스크롤이 심하게 버벅였다. useInView로 실제로 화면에 보이는 보드만 애니메이션을
  // 돌리고, 화면 밖으로 나가면 애니메이션을 완전히 멈춰(정지 상태로) CPU/GPU 부담을 줄인다.
  const wrapRef = useRef(null);
  const inView = useInView(wrapRef, { amount: 0.3, margin: "200px 0px 200px 0px" });
  return (
    <motion.div ref={wrapRef} initial={{ opacity: 0, scale: 0.8, rotate: tilt + (tilt >= 0 ? 8 : -8) }} whileInView={{ opacity: 1, scale: 1, rotate: tilt }} viewport={{ once: false, amount: 0.5 }} transition={{ duration: 0.6, delay, ease: [0.22, 0.9, 0.32, 1] }}
      style={{ width: size, flexShrink: 0 }}>
      <motion.div animate={inView ? { y: [0, -7, 0] } : { y: 0 }} transition={inView ? { duration: 3.6, repeat: Infinity, ease: "easeInOut", delay } : { duration: 0.3 }} style={{ willChange: "transform" }}>
        <div style={{ position: "relative", borderRadius: 12, overflow: "hidden", ...GLOSS_BORDER }}>
          <div style={{ position: "relative", width: "100%", aspectRatio: "1/1" }}>
            {Array.from({ length: 8 }, (_, r) => Array.from({ length: 8 }, (_, c) => {
              const light = (r + c) % 2 === 0;
              return (
                <div key={r + "_" + c} style={{ position: "absolute", top: dpct(r), left: dpct(c), width: "12.5%", height: "12.5%", background: light ? SQ_LIGHT_BG : SQ_DARK_BG, backgroundBlendMode: "overlay, normal" }}>
                  {c === 0 && <span style={{ position: "absolute", top: 1, left: 2, fontSize: Math.max(6, size * 0.052), fontWeight: 800, lineHeight: 1, color: light ? "rgba(124,79,46,.65)" : "rgba(232,210,166,.55)" }}>{8 - r}</span>}
                  {r === 7 && <span style={{ position: "absolute", bottom: 1, right: 2, fontSize: Math.max(6, size * 0.052), fontWeight: 800, lineHeight: 1, color: light ? "rgba(124,79,46,.65)" : "rgba(232,210,166,.55)" }}>{FILES[c]}</span>}
                </div>
              );
            }))}
            {/* 네 모서리를 살짝 어둡게 눌러주는 비네트 — 원목 보드 특유의 입체감 */}
            <div aria-hidden="true" style={{ position: "absolute", inset: 0, pointerEvents: "none", boxShadow: "inset 0 0 14px rgba(0,0,0,.35)" }} />
            {/* (버그 수정) img에 퍼센트 padding을 직접 주면 그 퍼센트가 자기 자신이 아니라 컨테이닝
                블록(보드 전체) 너비 기준으로 계산돼, 칸 하나(12.5%)보다 padding이 커져 콘텐츠 영역이
                찌그러지며 기물이 안 보였다 — 칸 크기의 셀 wrapper(flex 중앙 정렬) 안에 기물 이미지를
                그 비율(78%)로 넣는 방식으로 바꿔, 실제 보드(Board/PieceGlyph)와 동일하게 안전히 맞춘다. */}
            {pieces.map((p, i) => (
              <div key={i} style={{ position: "absolute", top: dpct(p.r), left: dpct(p.c), width: "12.5%", height: "12.5%", display: "flex", alignItems: "center", justifyContent: "center", boxSizing: "border-box" }}>
                <img src={DECO_PIECE_SRC[p.piece]} alt="" style={{ width: "78%", height: "78%", objectFit: "contain", filter: "drop-shadow(0 2px 2px rgba(0,0,0,.5))" }} />
              </div>
            ))}
            {move && (
              // (v0.2.2 UX#1) 예전엔 top/left(레이아웃 속성)를 무한 애니메이션해, "유명한 오프닝들"
              // 갤러리처럼 보드가 여러 개면 매 프레임 리플로우가 겹쳐 스크롤·애니메이션이 버벅였다 —
              // 시작 칸에 고정해 두고 transform(x/y translate, GPU 합성)만 애니메이션해 레이아웃을
              // 건드리지 않게 바꾼다. 이동 칸 수만큼 자기 크기(=한 칸)의 배수로 옮긴다.
              <motion.div
                initial={{ x: 0, y: 0 }}
                animate={inView ? { x: (move.to[1] - move.from[1]) * 100 + "%", y: (move.to[0] - move.from[0]) * 100 + "%" } : { x: 0, y: 0 }}
                transition={inView ? { duration: 1.1, repeat: Infinity, repeatType: "reverse", repeatDelay: 0.9, ease: [0.4, 1.1, 0.5, 1] } : { duration: 0.3 }}
                style={{ position: "absolute", top: dpct(move.from[0]), left: dpct(move.from[1]), width: "12.5%", height: "12.5%", display: "flex", alignItems: "center", justifyContent: "center", boxSizing: "border-box", zIndex: 2, willChange: "transform" }}>
                <img src={DECO_PIECE_SRC[move.piece]} alt="" style={{ width: "78%", height: "78%", objectFit: "contain", filter: "drop-shadow(0 3px 3px rgba(0,0,0,.55))" }} />
              </motion.div>
            )}
          </div>
        </div>
      </motion.div>
      {caption && <div style={{ marginTop: 10, textAlign: "center" }}><span style={{ fontSize: 10.5, fontWeight: 800, color: T.brassHi, background: "rgba(0,0,0,.35)", borderRadius: 999, padding: "4px 11px", border: "1px solid " + T.brass, display: "inline-block" }}>{caption}</span></div>}
    </motion.div>
  );
}
// (v0.1.4 기능) "체스보드에 더 다양한 포지션 — 그랜드마스터 명경기, 유명한 오프닝 함정을 정확히
// 재현해 달라"는 요청 — 추상적인 3기물 예시 대신, 실제로 존재하는 유명 대국·트랩의 SAN 기보를
// python-chess로 그대로 재현해 뽑아낸 최종 FEN + 마지막 수를 그대로 옮겨 적는다(스크래치패드에서
// 기보 전체를 한 수씩 합법성 검증까지 마친 결과 — 6개 전부 마지막 수까지 완전히 합법이었고, 5개는
// 실제 체크메이트로 끝난다). FEN → 보드 배치 변환은 아래 piecesFromFEN이 코드에서 직접 계산해,
// 좌표를 손으로 옮겨적다 생기는 오류 여지를 없앤다.
function algToRC(alg) {
  const file = alg.charCodeAt(0) - 97, rank = parseInt(alg[1], 10);
  return [7 - (rank - 1), file];
}
function piecesFromFEN(fen, excludeAlg) {
  const excludeRC = excludeAlg ? algToRC(excludeAlg) : null;
  const out = [];
  fen.split(" ")[0].split("/").forEach((row, r) => {
    let c = 0;
    for (const ch of row) {
      if (/\d/.test(ch)) { c += parseInt(ch, 10); continue; }
      if (excludeRC && excludeRC[0] === r && excludeRC[1] === c) { c += 1; continue; }
      out.push({ piece: (ch === ch.toUpperCase() ? "w" : "b") + ch.toUpperCase(), r, c });
      c += 1;
    }
  });
  return out;
}
function famousDeco(pos) {
  return { pieces: piecesFromFEN(pos.fen, pos.move.to), move: { piece: pos.move.piece, from: algToRC(pos.move.from), to: algToRC(pos.move.to) }, caption: pos.caption };
}
const POS_FOOLSMATE = { fen: "rnb1kbnr/pppp1ppp/8/4p3/6Pq/5P2/PPPPP2P/RNBQKBNR w KQkq - 1 3", move: { piece: "bQ", from: "d8", to: "h4" }, caption: t("폴스 메이트: 세계 최단 체크메이트 (단 2수)") };
const POS_SCHOLARSMATE = { fen: "r1bqkb1r/pppp1Qpp/2n2n2/4p3/2B1P3/8/PPPP1PPP/RNB1K1NR b KQkq - 0 4", move: { piece: "wQ", from: "h5", to: "f7" }, caption: t("스칼라스 메이트: 초보자 함정의 대명사") };
const POS_LEGALSTRAP = { fen: "rn1q1bnr/ppp1kB1p/3p2p1/3NN3/4P3/8/PPPP1PPP/R1BbK2R b KQ - 2 7", move: { piece: "wN", from: "c3", to: "d5" }, caption: t("레갈의 함정: 비숍을 미끼로 던지는 고전 트랩") };
const POS_FRIEDLIVER = { fen: "r1bq1b1r/ppp3pp/2n1k3/3np3/2B5/5Q2/PPPP1PPP/RNB1K2R w KQ - 2 8", move: { piece: "bK", from: "f7", to: "e6" }, caption: t("프라이드 리버 어택: 나이트 희생으로 왕을 끌어냄") };
const POS_IMMORTAL = { fen: "r1bk3r/p2pBpNp/n4n2/1p1NP2P/6P1/3P4/P1P1K3/q5b1 b - - 1 23", move: { piece: "wB", from: "d6", to: "e7" }, caption: t("불멸의 게임: 안더센 vs 키제리츠키, 1851") };
const POS_OPERA = { fen: "1n1Rkb1r/p4ppp/4q3/4p1B1/4P3/8/PPP2PPP/2K5 b k - 1 17", move: { piece: "wR", from: "d1", to: "d8" }, caption: t("오페라 게임: 모피 vs 브런즈윅 공작·이수아르 백작, 1858") };
const DECO_A = famousDeco(POS_FOOLSMATE);
const DECO_B = famousDeco(POS_SCHOLARSMATE);
const DECO_C = famousDeco(POS_LEGALSTRAP);
const DECO_D = famousDeco(POS_FRIEDLIVER);
const DECO_E = famousDeco(POS_IMMORTAL);
const DECO_F = famousDeco(POS_OPERA);
// (v0.1.3 기능) 버전 기록 페이지에도 데코 보드를 재사용 — 버전마다 순서대로 하나씩 돌려 써서 같은
// 장면이 매 페이지 반복되지 않게 한다.
const DECO_LIST = [DECO_A, DECO_B, DECO_C, DECO_D, DECO_E, DECO_F];
// 카테고리별로 배경에 옅게 깔아 둘 기물 — 각 카테고리 성격에 어울리는 기물을 하나씩 골랐다.
const CAT_PIECE = { feature: "wQ", ui: "wB", ux: "wN", perf: "wR", fix: "bK", security: "bR" };

// (about 페이지 기능) "유명한 오프닝들" 갤러리 전용 — 도감 탭이 인식하는 대표 오프닝(App.jsx의
// OPENING_LIST) 중 특히 잘 알려진 8개를 골라, 그 오프닝의 정석 수순을 실제로 두어 도달하는 최종
// 국면을 FEN으로 그대로 옮겨 적었다(모두 손으로 한 수씩 검증). DECO_LIST(유명한 명경기·트랩)와는
// 별개로, 여기서는 "명경기"가 아니라 "오프닝 그 자체"를 소개하는 게 목적이라 완전히 새로 분리해 둔다.
const POS_ITALIAN = { fen: "r1bqkbnr/pppp1ppp/2n5/4p3/2B1P3/5N2/PPPP1PPP/RNBQK2R b KQkq - 3 3", move: { piece: "wB", from: "f1", to: "c4" }, caption: t("이탈리안 게임") };
const POS_RUYLOPEZ = { fen: "r1bqkbnr/pppp1ppp/2n5/1B2p3/4P3/5N2/PPPP1PPP/RNBQK2R b KQkq - 3 3", move: { piece: "wB", from: "f1", to: "b5" }, caption: t("루이 로페즈") };
const POS_SICILIAN = { fen: "rnbqkbnr/pp1ppppp/8/2p5/4P3/8/PPPP1PPP/RNBQKBNR w KQkq c6 0 2", move: { piece: "bP", from: "c7", to: "c5" }, caption: t("시실리안 디펜스") };
const POS_GRUNFELD = { fen: "rnbqkb1r/ppp1pp1p/5np1/3p4/2PP4/2N5/PP2PPPP/R1BQKBNR w KQkq d6 0 4", move: { piece: "bP", from: "d7", to: "d5" }, caption: t("그룬펠드 디펜스") };
const POS_FRENCH = { fen: "rnbqkbnr/pppp1ppp/4p3/8/4P3/8/PPPP1PPP/RNBQKBNR w KQkq - 0 2", move: { piece: "bP", from: "e7", to: "e6" }, caption: t("프렌치 디펜스") };
const POS_CAROKANN = { fen: "rnbqkbnr/pp1ppppp/2p5/8/4P3/8/PPPP1PPP/RNBQKBNR w KQkq - 0 2", move: { piece: "bP", from: "c7", to: "c6" }, caption: t("카로칸 디펜스") };
const POS_QUEENSGAMBIT = { fen: "rnbqkbnr/ppp1pppp/8/3p4/2PP4/8/PP2PPPP/RNBQKBNR b KQkq c3 0 2", move: { piece: "wP", from: "c2", to: "c4" }, caption: t("퀸즈 갬빗") };
const POS_KINGSGAMBIT = { fen: "rnbqkbnr/pppp1ppp/8/4p3/4PP2/8/PPPP2PP/RNBQKBNR b KQkq f3 0 2", move: { piece: "wP", from: "f2", to: "f4" }, caption: t("킹스 갬빗") };
const OPENING_DECO_LIST = [POS_ITALIAN, POS_RUYLOPEZ, POS_SICILIAN, POS_GRUNFELD, POS_FRENCH, POS_CAROKANN, POS_QUEENSGAMBIT, POS_KINGSGAMBIT].map(famousDeco);
function FamousOpeningsSection() {
  return (
    <section>
      <Reveal>
        <div className="flex items-center justify-center gap-2" style={{ marginBottom: 6 }}>
          <Library size={14} color={T.brass} />
          <span style={{ fontSize: 11, fontWeight: 800, color: T.brass, letterSpacing: ".08em" }}>OPENING</span>
        </div>
        <h3 style={{ fontSize: 21, fontWeight: 900, color: T.ivoryHi, margin: "0 0 8px", textAlign: "center" }}>{t("유명한 오프닝")}</h3>
        <p style={{ fontSize: 13, color: T.inkSoft, lineHeight: 1.75, margin: "0 0 26px", textAlign: "center", maxWidth: 520, marginLeft: "auto", marginRight: "auto" }}>{t("이탈리안 게임부터 킹스 갬빗까지. 도감 탭의 대표 오프닝 정석 수순을 실제 기보 그대로 체스보드에 재현")}</p>
      </Reveal>
      <div className="flex items-start justify-center flex-wrap" style={{ gap: 28 }}>
        {OPENING_DECO_LIST.map((deco, i) => (
          <DecoBoard key={deco.caption} {...deco} size={118} tilt={i % 2 === 0 ? -6 : 6} delay={(i % 4) * 0.06} />
        ))}
      </div>
    </section>
  );
}

function TierStrip() {
  const tiers = [
    { key: "iron", label: t("아이언"), img: "/iron-pawn.png" },
    { key: "bronze", label: t("브론즈"), img: "/bronze-knight.png" },
    { key: "silver", label: t("실버"), img: "/silver-bishop.png" },
    { key: "gold", label: t("골드"), img: "/gold-rook.png" },
    { key: "diamond", label: t("다이아몬드"), img: "/diamond-queen.png" },
    { key: "master", label: t("마스터"), img: "/master-king.png" },
    { key: "grandmaster", label: t("그랜드마스터"), img: "/gm-piece.png" },
  ];
  return (
    <div style={{ overflowX: "auto", paddingBottom: 4 }}>
      <motion.div className="flex items-end" style={{ gap: 14, minWidth: 560, padding: "6px 2px 2px" }}
        initial="hidden" whileInView="show" viewport={{ once: false, amount: 0.3 }}
        variants={{ hidden: {}, show: { transition: { staggerChildren: 0.07 } } }}>
        {tiers.map((t, i) => (
          <motion.div key={t.key} className="flex flex-col items-center" style={{ gap: 6, flex: 1 }}
            variants={{ hidden: { opacity: 0, y: 20, scale: 0.7 }, show: { opacity: 1, y: 0, scale: 1 } }} transition={{ duration: 0.4, ease: [0.22, 0.9, 0.32, 1] }}>
            <TierBadgeShape size={56 + i * 3}>
              <img src={t.img} alt={t.label} style={{ width: "72%", height: "72%", objectFit: "contain" }} />
            </TierBadgeShape>
            <span style={{ fontSize: 9.5, fontWeight: 800, color: T.brassHi, whiteSpace: "nowrap" }}>{t.label}</span>
          </motion.div>
        ))}
      </motion.div>
    </div>
  );
}

// (about 페이지 기능) 최종 티어인 그랜드마스터만 따로 떼어 소개하는 카드 — 실제 티어 로직
// (App.jsx TIER_XP_REQ)에서 그대로 가져온 정확한 달성 조건과, 실제로 구현된 세 가지 혜택
// (오로라 배지·프레스티지 별 / 코인으로 못 사는 전용 보드 스킨 자동 해금 / 친구·검색·리더보드
// 강조 표시)을 그대로 설명한다 — 아직 만들지 않은 기능을 마치 있는 것처럼 적지 않는다.
const GM_AURORA = "linear-gradient(120deg,#B983FF,#6EE7C8 50%,#FF8FD1)";
// (about 페이지 기능) "코인으로 살 수 없는 전용 체스보드·기물 스킨" 혜택 문구를 말로만 설명하지
// 않고, 실제 상점에서 쓰는 것과 똑같은 이미지(App.jsx BOARD_SKINS.grandmaster·PIECE_SKINS.
// grandmaster가 가리키는 파일)로 미리 보여준다. 보드는 8x8 통짜 이미지라 4x4 조각만 잘라 보여줘도
// 질감이 충분히 드러난다.
function GrandmasterSkinPreview() {
  return (
    <div className="flex items-center" style={{ gap: 14 }}>
      <div style={{ width: 76, height: 76, borderRadius: 12, overflow: "hidden", flexShrink: 0, ...GLOSS_BORDER }}>
        <div style={{ width: "100%", height: "100%", backgroundImage: "url(/boards/grandmaster-board.jpg)", backgroundSize: "200% 200%", backgroundPosition: "0% 0%" }} />
      </div>
      <div className="flex items-center" style={{ gap: 4 }}>
        {["/pieces/grandmaster/white-queen.webp", "/pieces/grandmaster/black-knight.webp", "/pieces/grandmaster/white-rook.webp"].map((src) => (
          <div key={src} style={{ width: 52, height: 52, borderRadius: 10, background: "rgba(0,0,0,.28)", border: "1px solid #4A3521", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
            <img src={src} alt="" style={{ width: "78%", height: "78%", objectFit: "contain" }} />
          </div>
        ))}
      </div>
    </div>
  );
}
function GrandmasterCard() {
  return (
    <Reveal>
      <div style={{ position: "relative", borderRadius: 20, padding: "2px", background: GM_AURORA, boxShadow: "0 20px 50px -20px rgba(185,131,255,.35)" }}>
        <div style={{ borderRadius: 18, padding: "32px 28px", background: "linear-gradient(160deg,#241a33,#150C05 55%,#0f1f1a)" }}>
          <div className="flex items-center flex-wrap" style={{ gap: 28 }}>
            <motion.div initial={{ opacity: 0, scale: 0.8, rotate: -6 }} whileInView={{ opacity: 1, scale: 1, rotate: 0 }} viewport={{ once: false, amount: 0.5 }} transition={{ duration: 0.6, ease: [0.22, 0.9, 0.32, 1] }}
              style={{ flex: "0 0 auto", width: 168, margin: "0 auto" }}>
              <motion.img src="/gm-trophy-web.webp" alt={t("그랜드마스터 트로피")} loading="lazy" animate={{ y: [0, -9, 0] }} transition={{ duration: 3.6, repeat: Infinity, ease: "easeInOut" }}
                style={{ width: "100%", display: "block", filter: "drop-shadow(0 14px 24px rgba(0,0,0,.6))" }} />
            </motion.div>
            <div style={{ flex: "1 1 300px", minWidth: 260 }}>
              <div className="flex items-center gap-2" style={{ marginBottom: 8 }}>
                <Crown size={15} color="#E8C6FF" />
                <span style={{ fontSize: 11, fontWeight: 800, letterSpacing: ".08em", background: GM_AURORA, WebkitBackgroundClip: "text", backgroundClip: "text", color: "transparent" }}>{t("최종 티어")}</span>
              </div>
              <h3 style={{ fontSize: 23, fontWeight: 900, color: T.ivoryHi, margin: "0 0 10px" }}>{t("그랜드마스터")}</h3>
              <p style={{ fontSize: 13, color: T.inkSoft, lineHeight: 1.75, margin: "0 0 16px" }}>{t("아이언에서 시작해 여섯 단계를 모두 넘어야 도달하는 일곱 번째, 마지막 티어")}</p>
              <div style={{ marginBottom: 16 }}>
                <div style={{ fontSize: 11, fontWeight: 800, color: T.brassHi, letterSpacing: ".04em", marginBottom: 6 }}>{t("달성 조건")}</div>
                <p style={{ fontSize: 12.5, color: T.ivory, lineHeight: 1.75, margin: 0 }}>{tx("퍼즐을 풀어 누적 {0}를 모으면(아이언→브론즈→실버→골드→다이아몬드→마스터 순서로 전부 돌파) 도달. 이후에도 XP는 계속 쌓이고, {1}마다 프레스티지 별(★) 1개 추가", <b style={{ color: T.brassHi }}>200,000 XP</b>, <b style={{ color: T.brassHi }}>100,000 XP</b>)}</p>
              </div>
              <div style={{ marginBottom: 16 }}>
                <div style={{ fontSize: 11, fontWeight: 800, color: T.brassHi, letterSpacing: ".04em", marginBottom: 6 }}>{t("그랜드마스터만의 혜택")}</div>
                <ul style={{ margin: 0, paddingLeft: 18, fontSize: 12.5, color: T.ivory, lineHeight: 1.85 }}>
                  <li>{t("오로라처럼 일렁이는 전용 그러데이션 배지와 프레스티지 별(★) 카운터로 구분")}</li>
                  <li>{t("코인으로 살 수 없는 전용 체스보드·기물 스킨이 티어 달성과 동시에 해금. 상점에서 바로 장착 가능")}</li>
                  <li>{t("친구 목록·유저 검색·티어 리더보드에서 골드빛 테두리와 왕관 아이콘으로 강조")}</li>
                </ul>
              </div>
              <GrandmasterSkinPreview />
            </div>
          </div>
        </div>
      </div>
    </Reveal>
  );
}

// (v0.1.3 기능) 참고 영상의 "24/7 · 30%+ · <60 sec" 같은 스크롤 카운트업 통계 블록을 OpenChess
// 수치로 재현한다 — 화면에 들어올 때마다(once:false와 같은 취지) 0부터 다시 세어 올라가도록,
// framer-motion의 onViewportEnter/Leave로 직접 카운팅 애니메이션을 구동한다(whileInView는 style
// 값 보간만 하므로 "숫자 세기"에는 안 맞아 별도 rAF 루프를 쓴다).
function CountStat({ value, suffix = "", label }) {
  const [n, setN] = useState(0);
  const rafRef = useRef(null);
  const runCount = () => {
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    const start = performance.now(), dur = 1100;
    const step = (t) => {
      const p = Math.min(1, (t - start) / dur);
      const eased = 1 - Math.pow(1 - p, 3);
      setN(Math.round(value * eased));
      if (p < 1) rafRef.current = requestAnimationFrame(step);
    };
    rafRef.current = requestAnimationFrame(step);
  };
  useEffect(() => () => { if (rafRef.current) cancelAnimationFrame(rafRef.current); }, []);
  return (
    <motion.div onViewportEnter={runCount} onViewportLeave={() => setN(0)} viewport={{ once: false, amount: 0.7 }}
      className="flex flex-col items-center" style={{ gap: 4, flex: "1 1 110px", minWidth: 110 }}>
      <span style={{ fontSize: 30, fontWeight: 900, color: T.brassHi, fontFamily: "ui-monospace,monospace" }}>{n}{suffix}</span>
      <span style={{ fontSize: 11, color: T.inkSoft, fontWeight: 700, textAlign: "center" }}>{label}</span>
    </motion.div>
  );
}
function StatsRow() {
  return (
    <Reveal>
      <div className="flex flex-wrap items-center justify-center" style={{ gap: 8, padding: "26px 20px", borderRadius: 16, background: "linear-gradient(160deg,#241509,#150C05)", ...GLOSS_BORDER }}>
        <CountStat value={7} label={t("티어 단계")} />
        <CountStat value={4} label={t("오프닝 갈래")} />
        <CountStat value={3} label={t("퍼즐 테마")} />
        <CountStat value={100} suffix="%" label={t("무료로 시작")} />
      </div>
    </Reveal>
  );
}

// (v0.1.4 기능) "chess.com 연계 통계·분석 기능도 소개해 달라"는 요청 — 실제로 분석 탭·도감 탭·설정
// 탭에 이미 있는 chess.com 연동 기능(대국 자동 동기화·게임 리뷰 정확도·레이팅 변화·오프닝별 승률)을
// 별도 섹션으로 모아 chess.com 아이콘과 함께 소개한다.
function CCStatTile({ label, sub, delay }) {
  return (
    <motion.div initial={{ opacity: 0, y: 16, scale: 0.9 }} whileInView={{ opacity: 1, y: 0, scale: 1 }} viewport={{ once: false, amount: 0.4 }} transition={{ duration: 0.45, delay, ease: [0.22, 0.9, 0.32, 1] }}
      whileHover={{ y: -4, transition: { duration: 0.2 } }}
      className="flex flex-col items-center" style={{ gap: 8, flex: "1 1 140px", minWidth: 140, padding: "18px 14px", borderRadius: 14, background: "rgba(0,0,0,.22)", border: "1px solid #4A3521" }}>
      <span style={{ fontSize: 12.5, fontWeight: 800, color: T.ivoryHi, textAlign: "center" }}>{label}</span>
      <span style={{ fontSize: 11, color: T.inkSoft, textAlign: "center", lineHeight: 1.55 }}>{sub}</span>
    </motion.div>
  );
}
const CC_TILES = [
  { label: t("대국 자동 동기화"), sub: t("chess.com 계정만 연결하면 실제 대국이 그대로 반영") },
  { label: t("게임 리뷰 정확도"), sub: t("chess.com과 같은 방식의 정확도(%)로 채점") },
  { label: t("레이팅 변화 그래프"), sub: t("래피드·블리츠·불릿별 대국마다 오르내린 레이팅 표시") },
  { label: t("오프닝별 승률 통계"), sub: t("도감의 각 수마다 이 오프닝을 실전에서 얼마나, 어떻게 뒀는지 표시") },
];
function ChessComSection() {
  return (
    <section>
      <Reveal>
        <div className="flex items-center justify-center gap-2" style={{ marginBottom: 6 }}>
          <span style={{ fontSize: 11, fontWeight: 800, color: T.brass, letterSpacing: ".08em" }}>{t("CHESS.COM 연동")}</span>
        </div>
        <h3 style={{ fontSize: 21, fontWeight: 900, color: T.ivoryHi, margin: "0 0 8px", textAlign: "center" }}>{t("실제로 둔 대국까지 분석")}</h3>
        <p style={{ fontSize: 13, color: T.inkSoft, lineHeight: 1.75, margin: "0 0 22px", textAlign: "center", maxWidth: 520, marginLeft: "auto", marginRight: "auto" }}>{t("설정 탭에서 chess.com 아이디만 연결하면 실전에서 둔 수만큼 도감이 해금되고 정확도·레이팅 변화 확인 가능")}</p>
      </Reveal>
      <div className="flex flex-wrap items-stretch justify-center" style={{ gap: 12 }}>
        {CC_TILES.map((t, i) => <CCStatTile key={t.label} {...t} delay={i * 0.08} />)}
      </div>
    </section>
  );
}

// ============================================================ 정확도 체계 ============================================================
// (v0.3.9 기능, 사용자 요청) "이번 세션에서 만든 정확도 체계를 /about 첫 페이지에 내 사고 과정을 그대로
// 시각화해서 보여줘, 구체적인 계산 수식과 그래프를 적극 활용해서". 실제 App.jsx의 독립 정확도 체계
// (winPctFromCp·newAccuracyFromAvgLoss·newCumulativeAccuracy·sharpLossMultiplier)를 그 설계 과정
// 그대로 4단계로 재구성해 보여준다 — 이 페이지는 App.jsx와 별개 번들이라(파일 상단 T 팔레트 주석
// 참고) 공식을 import하지 않고 그대로 복사해 둔다. App.jsx 쪽 공식이 바뀌면(계수 조정 등) 이 사본도
// 함께 맞춰야 소개 페이지가 실제 동작과 어긋나지 않는다.
const AS_DECAY = 0.055;
const AS_SHARP_REF_MEAN = 8, AS_SHARP_REF_SD = 8;
const AS_SHARP_LO = 0.85, AS_SHARP_HI = 1.15;
// (사용자 재피드백, v0.3.9) App.jsx의 NEW_ACC_HARMONIC_FLOOR와 값을 맞춘다 — 조화평균에서 한 수가
// 기여할 수 있는 몫의 하한(극단적 블런더 한 수가 나머지 좋은 수들을 압도하지 못하게 막는다).
const AS_HARMONIC_FLOOR = 22;
function asWinPct(cp) { const c = Math.max(-1200, Math.min(1200, cp)); return 50 + 50 * (2 / (1 + Math.exp(-0.00368208 * c)) - 1); }
function asNormalCdf(z) {
  const t = 1 / (1 + 0.2316419 * Math.abs(z));
  const d = 0.3989423 * Math.exp(-z * z / 2);
  const p = d * t * (0.3193815 + t * (-0.3565638 + t * (1.781478 + t * (-1.821256 + t * 1.330274))));
  return z >= 0 ? 1 - p : p;
}
function asSharpMult(sharp) { return AS_SHARP_LO + (AS_SHARP_HI - AS_SHARP_LO) * asNormalCdf((sharp - AS_SHARP_REF_MEAN) / AS_SHARP_REF_SD); }
function asAccFromLoss(loss) { return Math.max(0, Math.min(100, 103.1668 * Math.exp(-AS_DECAY * Math.max(0, loss)) - 3.1669)); }
const AS_WINPCT_PTS = Array.from({ length: 49 }, (_, i) => { const cp = -1200 + i * 50; return [cp, asWinPct(cp)]; });
const AS_DECAY_PTS = Array.from({ length: 41 }, (_, i) => [i, asAccFromLoss(i)]);
const AS_SHARP_PTS = Array.from({ length: 26 }, (_, i) => [i, asSharpMult(i)]);
// 손 계산으로 재현 가능한 작은 예시 하나로 "손실을 먼저 평균 낸 뒤 변환" vs "각 수를 먼저 변환한 뒤
// 평균" 두 방식의 결과 차이를 보여준다 — 무난한 수 9개(손실 0)와 블런더 1개(손실 25%p)로 이뤄진
// 10수짜리 가상의 대국.
const AS_JENSEN_NAIVE = Math.round(asAccFromLoss(25 / 10) * 10) / 10;
const AS_JENSEN_CORRECT = Math.round((10 / (9 / 100 + 1 / Math.max(AS_HARMONIC_FLOOR, asAccFromLoss(25)))) * 10) / 10;
// 그래프 하나를 그리는 범용 SVG 라인 차트 — 격자·축 눈금·강조 점(marker)까지 갖춰, 이 섹션의 세
// 곡선(승률% 변환, 손실→정확도 감쇠, 날카로움 배율)을 모두 이 컴포넌트 하나로 그린다.
function AsLineChart({ points, xDomain, yDomain, xTicks, yTicks, markers = [], color = T.brassHi }) {
  const w = 300, h = 168, padL = 30, padR = 14, padT = 16, padB = 24;
  const [x0, x1] = xDomain, [y0, y1] = yDomain;
  const sx = (x) => padL + ((x - x0) / (x1 - x0)) * (w - padL - padR);
  const sy = (y) => (h - padB) - ((y - y0) / (y1 - y0)) * (h - padT - padB);
  const d = points.map((p, i) => (i === 0 ? "M" : "L") + sx(p[0]).toFixed(2) + "," + sy(p[1]).toFixed(2)).join(" ");
  return (
    <svg viewBox={"0 0 " + w + " " + h} style={{ width: "100%", maxWidth: 320, display: "block" }}>
      {yTicks.map((ty) => (
        <g key={"y" + ty}>
          <line x1={padL} x2={w - padR} y1={sy(ty)} y2={sy(ty)} stroke="rgba(184,167,140,.16)" strokeWidth={1} />
          <text x={padL - 6} y={sy(ty) + 3} textAnchor="end" fontSize="8.5" fill={T.inkSoft}>{ty}</text>
        </g>
      ))}
      {xTicks.map((tx) => (
        <text key={"x" + tx} x={sx(tx)} y={h - 8} textAnchor="middle" fontSize="8.5" fill={T.inkSoft}>{tx}</text>
      ))}
      <line x1={padL} x2={padL} y1={padT} y2={h - padB} stroke="rgba(184,167,140,.35)" strokeWidth={1} />
      <line x1={padL} x2={w - padR} y1={h - padB} y2={h - padB} stroke="rgba(184,167,140,.35)" strokeWidth={1} />
      <path d={d} fill="none" stroke={color} strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round" />
      {markers.map((m, i) => (
        <g key={i}>
          <circle cx={sx(m[0])} cy={sy(m[1])} r={3.2} fill={T.ivoryHi} stroke={color} strokeWidth={1.6} />
          <text x={sx(m[0])} y={sy(m[1]) - 8} textAnchor="middle" fontSize="8.5" fontWeight="800" fill={T.ivoryHi}>{m[2]}</text>
        </g>
      ))}
    </svg>
  );
}
// "손실을 먼저 평균 낸 뒤 변환" vs "각 수를 먼저 변환한 뒤 평균"을 나란한 막대 두 개로 비교.
function AsJensenBars() {
  const w = 240, h = 168, base = h - 26;
  const scaleY = (v) => base - (v / 100) * (base - 18);
  const bars = [
    { v: AS_JENSEN_NAIVE, label: t("손실 먼저 평균"), sub: t("(예전 방식)"), color: T.brass },
    { v: AS_JENSEN_CORRECT, label: t("정확도 먼저 평균"), sub: t("(현재 방식)"), color: "#8FB55E" },
  ];
  return (
    <svg viewBox={"0 0 " + w + " " + h} style={{ width: "100%", maxWidth: 260, display: "block" }}>
      <line x1={16} x2={w - 16} y1={base} y2={base} stroke="rgba(184,167,140,.35)" strokeWidth={1} />
      {bars.map((b, i) => {
        const bw = 64, x = 30 + i * 110;
        return (
          <g key={i}>
            <rect x={x} y={scaleY(b.v)} width={bw} height={base - scaleY(b.v)} rx={7} fill={b.color} opacity={0.88} />
            <text x={x + bw / 2} y={scaleY(b.v) - 9} textAnchor="middle" fontSize="14" fontWeight="900" fill={T.ivoryHi}>{b.v.toFixed(1)}</text>
            <text x={x + bw / 2} y={h - 10} textAnchor="middle" fontSize="9" fontWeight="800" fill={T.inkSoft}>{b.label}</text>
            <text x={x + bw / 2} y={h - 1} textAnchor="middle" fontSize="8" fill={T.inkSoft} opacity={0.8}>{b.sub}</text>
          </g>
        );
      })}
    </svg>
  );
}
// 공식을 그대로 보여주는 모노스페이스 코드 박스 — 이 섹션 전용.
function AsFormula({ children }) {
  return <div style={{ fontFamily: "ui-monospace,monospace", fontSize: 11.5, color: T.brassHi, background: "rgba(0,0,0,.28)", border: "1px solid rgba(196,154,80,.3)", borderRadius: 8, padding: "8px 12px", margin: "10px 0", overflowX: "auto", whiteSpace: "nowrap" }}>{children}</div>;
}
// 단계 하나(번호 배지 + 제목 + 설명 + 공식 + 그래프)를 좌우로 배치하는 카드. FeatureRow와 같은 구조를
// 재사용하되, 스크린샷 대신 직접 그린 SVG 그래프를 얹는다.
function AsStep({ n, title, children, formula, chart, reverse }) {
  return (
    <div className="flex items-center flex-wrap" style={{ gap: 28, flexDirection: reverse ? "row-reverse" : "row" }}>
      <Reveal delay={0.05}>
        <div style={{ flex: "1 1 300px", minWidth: 260 }}>
          <div className="flex items-center gap-2" style={{ marginBottom: 8 }}>
            <span style={{ width: 26, height: 26, borderRadius: "50%", background: "linear-gradient(180deg," + T.brass + ",#8A6C2F)", color: "#241509", fontWeight: 900, fontSize: 12.5, display: "inline-flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>{n}</span>
            <h4 style={{ fontSize: 16, fontWeight: 900, color: T.ivoryHi, margin: 0 }}>{title}</h4>
          </div>
          <div style={{ fontSize: 12.5, color: T.inkSoft, lineHeight: 1.75 }}>{children}</div>
          {formula}
        </div>
      </Reveal>
      <div style={{ flex: "0 0 auto", width: 280, maxWidth: "100%", margin: "0 auto" }}>
        <Reveal delay={0.15}>
          <div style={{ background: "rgba(0,0,0,.22)", border: "1px solid rgba(196,154,80,.25)", borderRadius: 14, padding: "14px 10px 8px" }}>
            {chart}
          </div>
        </Reveal>
      </div>
    </div>
  );
}
function AccuracySystemSection() {
  return (
    <section id="accuracy" style={{ scrollMarginTop: 24 }}>
      <Reveal>
        <div className="flex items-center justify-center gap-2" style={{ marginBottom: 6 }}>
          <Zap size={16} color={T.brassHi} />
          <span style={{ fontSize: 11, fontWeight: 800, color: T.brass, letterSpacing: ".08em" }}>{t("정확도 체계")}</span>
        </div>
        <h3 style={{ fontSize: 21, fontWeight: 900, color: T.ivoryHi, margin: "0 0 8px", textAlign: "center" }}>{t("정확도 계산 방식")}</h3>
        <p style={{ fontSize: 13, color: T.inkSoft, lineHeight: 1.75, margin: "0 0 22px", textAlign: "center", maxWidth: 560, marginLeft: "auto", marginRight: "auto" }}>{t("실수 횟수만 세지 않음. 게임 리뷰를 설계하며 거친 네 단계를 수식과 그래프로 소개")}</p>
      </Reveal>

      <section style={{ maxWidth: 620, margin: "0 auto 28px" }}>
        <SpeechBubble mascot={{ char: "kokoa", expr: "think" }} name="KOKOA 코치">{t("정확도 % 하나 뒤에 이런 계산이 있음")}</SpeechBubble>
      </section>

      <div className="flex flex-col" style={{ gap: 40 }}>
        <AsStep n={1} title={t("① 평가치(cp)를 승률로 변환")}
          formula={<AsFormula>win%(cp) = 50 + 50 × (2 / (1 + e^(&#8722;0.00368×cp)) &#8722; 1)</AsFormula>}
          chart={<AsLineChart points={AS_WINPCT_PTS} xDomain={[-1200, 1200]} yDomain={[0, 100]} xTicks={[-1200, 0, 1200]} yTicks={[0, 50, 100]} markers={[[0, 50, "0 → 50%"], [300, asWinPct(300), "+300 → " + asWinPct(300).toFixed(0) + "%"]]} />}>{tx("엔진 평가치(centipawn)는 그대로 쓰면 불공평함. 이미 +500으로 크게 앞설 때 100점을 잃는 것과 0점 근처에서 100점을 잃는 것은 승부에 미치는 영향이 다름. 그래서 cp를 이 포지션에서 이길 확률(win%)로 변환. 로지스틱 곡선이라 0 근처에서는 가파르고 승부가 기운 구간에서는 완만함 {0}로 정의", <b>{t("손실은 그 수 전후로 win%가 얼마나 떨어졌는지")}</b>)}</AsStep>

        <AsStep n={2} title={t("② 손실이 클수록 정확도는 더 가파르게 하락")} reverse
          formula={<AsFormula>{t("정확도 = 103.17 × e^(−0.055 × 손실) − 3.17")}</AsFormula>}
          chart={<AsLineChart points={AS_DECAY_PTS} xDomain={[0, 40]} yDomain={[0, 100]} xTicks={[0, 20, 40]} yTicks={[0, 50, 100]} markers={[[0, 100, "0 → 100"], [25, asAccFromLoss(25), "25 → " + asAccFromLoss(25).toFixed(1)]]} color="#8FB55E" />}>{tx("이 승률% 손실을 지수 감쇠(exponential decay) 곡선에 넣어 수 하나의 정확도로 변환. 손실이 0에 가까우면 정확도는 100 근처, 손실이 커질수록 완만하지 않고 {0} 하락. 작은 실수는 관대하게, 큰 블런더는 냉정하게 반영", <b>{t("점점 더 가파르게")}</b>)}</AsStep>

        <AsStep n={3} title={t("③ 계산 순서를 잘못 잡았던 부분")}
          formula={<AsFormula>❌ acc(mean(loss))  vs.  ✅ mean(acc(loss))</AsFormula>}
          chart={<AsJensenBars />}>{tx("처음엔 손실을 먼저 평균 낸 뒤 그 평균 하나만 정확도로 변환. 감쇠 곡선이 아래로 볼록(convex)해서, {0}에 따라 이 순서는 각 수를 먼저 변환해 평균 내는 것보다 항상 같거나 높게 나옴. 무난한 수가 많을수록 블런더 한 번의 타격이 옅게 희석됨. 왼쪽 예시(무난한 수 9개 + 블런더 1개인 가상의 10수)에서 예전 방식은 {1}이 나오지만, chess.com처럼 각 수의 정확도를 먼저 구하고 {2}으로 모으면 {3}으로 평균 내면 블런더 하나가 체감되는 만큼 반영됨", <b>{t("옌센 부등식(Jensen's inequality)")}</b>, <b>{tx("{0}점", AS_JENSEN_NAIVE.toFixed(1))}</b>, <b>{t("조화평균(harmonic mean)")}</b>, <b>{tx("{0}점", AS_JENSEN_CORRECT.toFixed(1))}</b>)}</AsStep>

        <AsStep n={4} title={t("④ 포지션에 따라 같은 실수의 무게가 다름")} reverse
          formula={<AsFormula>{t("배율 = 0.85 + 0.3 × Φ((날카로움 − 8) / 8)")}</AsFormula>}
          chart={<AsLineChart points={AS_SHARP_PTS} xDomain={[0, 25]} yDomain={[0.8, 1.2]} xTicks={[0, 8, 25]} yTicks={[0.85, 1, 1.15]} markers={[[8, 1, "8 → ×1.0"], [20, asSharpMult(20), "20 → ×" + asSharpMult(20).toFixed(2)]]} color="#E0B53A" />}>{tx("정답이 하나뿐인 날카로운 포지션(엔진 후보 1·2·3위 평가가 크게 벌어짐)의 실수는 엄격하게, 후보가 비슷한 무난한 포지션의 실수는 관대하게 반영. 후보 평가의 표준편차(Φ는 정규분포 누적분포함수)를 0.85~1.15배 배율로 매핑해 손실에 곱함. 마지막으로 이 값을 진영별로 처음부터 지금까지 {0}내면, 게임이 길어질수록 수 하나의 영향이 옅어지면서도 블런더는 뚜렷하게 드러나는 최종 정확도가 나옴", <b>{t("조화평균")}</b>)}</AsStep>
      </div>

      <section style={{ maxWidth: 620, margin: "28px auto 0" }}>
        <SpeechBubble mascot={{ char: "milku", expr: "wink" }} name="MILKU 코치">{t("이 네 단계와 포지션 변동성 보정은 설정 탭의 리뷰 설정 카드에서 켜고 끌 수 있음")}</SpeechBubble>
      </section>
    </section>
  );
}

// 페이지1 — 소개(히어로+기능+티어+CTA). 기존에 만들어 둔 내용을 그대로 페이저의 첫 페이지로 옮겼다.
// (about 페이지 기능) ilust-2·3·4처럼 액자에 담긴 일러스트는 등장(Reveal/motion) 애니메이션에
// 더해, 계속 은은하게 위아래로 떠 있는 연출(DecoBoard·PhoneFrame과 같은 방식)을 얹어 정지된
// 그림이 아니라 페이지가 늘 살아있는 느낌을 준다. delay를 다르게 줘 셋이 같은 박자로 움직이지
// 않게 한다.
function FloatImg({ src, alt, delay = 0 }) {
  return (
    <motion.div animate={{ y: [0, -8, 0] }} transition={{ duration: 3.6, repeat: Infinity, ease: "easeInOut", delay }}>
      <img src={src} alt={alt} loading="lazy" style={{ width: "100%", display: "block" }} />
    </motion.div>
  );
}
// (신규 기능) 사용자 요청 — 첫 페이지 배너와 히어로 카드 사이의 비어 보이던 공간을, 큼직한 타이포
// 그래피로 채운다. Pager는 각 페이지 내부(overflowY:auto)에서 스크롤되므로 window 기준
// useScroll/scrollYProgress는 이 레이아웃에서 정확히 동작하지 않는다 — 페이지 전반에서 이미 검증된
// whileInView(IntersectionObserver 기반이라 어느 요소가 스크롤되든 항상 정확) 패턴을 그대로 써서,
// 단어마다 스크롤로 들어올 때 다른 방향·크기로 튀어오르게 한다(한 번만이 아니라 다시 스크롤해
// 지나갈 때마다 반복 재생).
function KineticWord({ children, index, accent }) {
  return (
    <motion.span
      initial={{ opacity: 0, y: 40, scale: 0.82, rotate: index % 2 === 0 ? -4 : 4 }}
      whileInView={{ opacity: 1, y: 0, scale: 1, rotate: 0 }}
      viewport={{ once: false, amount: 0.6 }}
      transition={{ duration: 0.65, delay: index * 0.08, ease: [0.22, 0.9, 0.32, 1] }}
      style={{
        display: "inline-block",
        fontSize: "clamp(30px, 7.5vw, 68px)",
        fontWeight: 900,
        letterSpacing: "-.02em",
        lineHeight: 1.08,
        color: accent ? T.brassHi : T.ivoryHi,
        textShadow: accent ? "0 2px 20px rgba(196,154,80,.4)" : "0 2px 14px rgba(0,0,0,.3)",
      }}
    >{children}</motion.span>
  );
}
function KineticTagline() {
  const words = [
    { t: t("생각하고,"), accent: false },
    { t: t("분석하고,"), accent: false },
    { t: t("성장하는"), accent: true },
    { t: t("체스."), accent: true },
  ];
  return (
    <div style={{ padding: "18px 4px 44px", textAlign: "center", display: "flex", flexWrap: "wrap", justifyContent: "center", gap: "0 .32em" }}>
      {words.map((w, i) => <KineticWord key={w.t} index={i} accent={w.accent}>{w.t}</KineticWord>)}
    </div>
  );
}
function IntroPage() {
  return (
    <div>
      {/* (about 페이지 기능) ilust-1을 화면 맨 위 전체 폭 배너로 옮겼다 — 히어로보다 먼저 보이는
          첫 인상이 되도록. 배경 이미지답게 등장은 한 번만 페이드인하고, 그 안에서는 천천히
          확대·이동하는 카메라 무브(켄 번즈)를 무한 반복해 계속 움직이는 느낌을 준다(티어 여정
          지도 배경과 같은 연출). 하단 그러데이션으로 페이지 배경과 자연스럽게 이어붙인다. */}
      <div style={{ position: "relative", width: "100%", overflow: "hidden", maxHeight: 340 }}>
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.7 }}>
          <motion.img src="/ilust-1-web.webp" alt={t("MILKU와 KOKOA의 대국")} loading="lazy"
            animate={{ scale: [1, 1.08, 1], x: ["0%", "-2%", "0%"] }}
            transition={{ duration: 16, repeat: Infinity, ease: "easeInOut" }}
            style={{ width: "100%", display: "block", objectFit: "cover", maxHeight: 340 }} />
        </motion.div>
        <div aria-hidden="true" style={{ position: "absolute", inset: 0, background: "linear-gradient(180deg, transparent 55%, #1B1009 100%)", pointerEvents: "none" }} />
      </div>

      <div style={{ maxWidth: 1000, margin: "0 auto", padding: "40px 20px 72px" }}>
      <KineticTagline />
      <section className="flex items-center flex-wrap" style={{
        gap: 36, marginBottom: 8, padding: "32px 32px 30px", borderRadius: 28,
        background: "linear-gradient(160deg, rgba(46,27,16,.6), rgba(27,16,9,.15))",
        border: "1px solid rgba(196,154,80,.22)", boxShadow: "inset 0 1px 0 rgba(255,255,255,.05)",
      }}>
        <div style={{ flex: "1 1 320px", minWidth: 280 }}>
          <Reveal><div className="flex items-center gap-2" style={{ marginBottom: 14 }}>
            <Sparkles size={14} color={T.brass} />
            <span style={{ fontSize: 12, fontWeight: 800, color: T.brass, letterSpacing: ".08em" }}>{t("무료 체스 오프닝 학습·연습 애플리케이션")}</span>
          </div></Reveal>
          <Reveal delay={0.05}><h1 style={{ fontSize: "clamp(32px, 5vw, 44px)", fontWeight: 900, color: T.ivoryHi, lineHeight: 1.22, margin: "0 0 16px", letterSpacing: "-.01em" }}>{tx("오프닝 학습,{0}내 실수는 {1}로{2}복습", <br />, <span style={{ color: T.brassHi }}>{t("퍼즐")}</span>, <br />)}</h1></Reveal>
          <Reveal delay={0.1}><p style={{ fontSize: 14, color: T.inkSoft, lineHeight: 1.75, margin: "0 0 24px", maxWidth: 440 }}>{t("엔진 분석 기반 학습, 오프닝 트리 도감, 실전 실수로 자동 생성되는 전술 퍼즐, 로드맵형 레슨, 티어 시스템")}</p></Reveal>
          <Reveal delay={0.15}><div className="flex items-center flex-wrap" style={{ gap: 10, marginBottom: 26 }}>
            <a href="/" className="press" style={{ display: "inline-flex", alignItems: "center", gap: 8, padding: "13px 24px", borderRadius: 999, background: "linear-gradient(180deg," + T.brass + ",#A8842F)", color: "#241509", fontWeight: 800, fontSize: 14, textDecoration: "none", boxShadow: "0 4px 0 #7A5E22" }}>{tx("무료로 시작하기 {0}", <ArrowRight size={16} />)}
            </a>
            <a href="#features" className="press" style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "13px 20px", borderRadius: 999, border: "1px solid rgba(196,154,80,.4)", color: T.ivory, fontWeight: 700, fontSize: 13, textDecoration: "none" }}>{t("기능 둘러보기")}</a>
          </div></Reveal>
          <Reveal delay={0.2}><nav className="flex items-center flex-wrap" style={{ gap: 8 }}>
            {[["#features", t("학습·도감·퍼즐")], ["#tiers", t("티어")], ["#accuracy", t("정확도 체계")]].map(([href, label]) => (
              <a key={href} href={href} style={{
                fontSize: 11.5, fontWeight: 700, color: T.brass, letterSpacing: ".02em", textDecoration: "none",
                padding: "6px 12px", borderRadius: 999, border: "1px solid rgba(196,154,80,.28)",
                background: "rgba(196,154,80,.06)", transition: "background .15s, color .15s",
              }}
                onMouseEnter={(e) => { e.currentTarget.style.background = "rgba(196,154,80,.16)"; e.currentTarget.style.color = T.brassHi; }}
                onMouseLeave={(e) => { e.currentTarget.style.background = "rgba(196,154,80,.06)"; e.currentTarget.style.color = T.brass; }}
              >{label}</a>
            ))}
          </nav></Reveal>
        </div>
        <motion.div initial={{ opacity: 0, scale: 0.7, rotate: -8 }} animate={{ opacity: 1, scale: 1, rotate: 0 }} transition={{ duration: 0.6, ease: [0.22, 0.9, 0.32, 1] }}
          style={{ flex: "0 0 auto", width: 260, maxWidth: "100%", margin: "0 auto", position: "relative" }}>
          <motion.div animate={{ y: [0, -10, 0] }} transition={{ duration: 3.2, repeat: Infinity, ease: "easeInOut" }}
            style={{ width: 260, height: 260, maxWidth: "100%", aspectRatio: "1/1", display: "flex", alignItems: "center", justifyContent: "center", ...GOLD_DISC }}>
            <div style={{ filter: "drop-shadow(0 10px 22px rgba(0,0,0,.55))" }}><Mascot char="milku" expr="great" size={190} /></div>
          </motion.div>
          {/* (v0.1.3 기능) 체스 웹사이트답게 히어로 한쪽에도 작은 데코 보드를 겹쳐 둔다 */}
          <div style={{ position: "absolute", bottom: -16, left: -30, zIndex: 2 }}>
            <DecoBoard {...DECO_A} size={100} tilt={-11} />
          </div>
        </motion.div>
      </section>

      <SectionDivider />

      <section style={{ maxWidth: 640, margin: "0 auto 8px" }}>
        <SpeechBubble mascot={{ char: "milku", expr: "wink" }} name="MILKU 코치">{t("수를 두는 데서 끝나지 않고 그 수가 왜 좋았는지·나빴는지까지 확인. 아래에서 기능별로 소개")}</SpeechBubble>
      </section>

      <SectionDivider />

      <section id="features" className="flex flex-col" style={{ gap: 52, scrollMarginTop: 24 }}>
        {FEATURES.map((f, i) => (
          <React.Fragment key={f.title}>
            <FeatureRow {...f} reverse={i % 2 === 1} />
            {/* (v0.1.3 기능) 기능 소개 사이사이에 실제 기물로 시연하는 데코 보드를 끼워 넣는다 */}
            {i === 1 && (
              <div className="flex items-center justify-center flex-wrap" style={{ gap: 24, margin: "6px 0" }}>
                <DecoBoard {...DECO_B} tilt={-6} />
                <DecoBoard {...DECO_C} tilt={6} delay={0.12} />
              </div>
            )}
            {i === 3 && (
              <div className="flex items-center justify-center flex-wrap" style={{ gap: 24, margin: "6px 0" }}>
                <DecoBoard {...DECO_D} tilt={5} />
              </div>
            )}
          </React.Fragment>
        ))}
      </section>

      <SectionDivider />

      <FamousOpeningsSection />

      <SectionDivider />

      <StatsRow />

      <SectionDivider />

      <ChessComSection />

      <SectionDivider />

      <AccuracySystemSection />

      <SectionDivider />

      <section id="tiers" style={{ scrollMarginTop: 24 }}>
        <Reveal>
          <div className="flex items-center gap-2" style={{ marginBottom: 6, justifyContent: "center" }}>
            <Crown size={16} color={T.brassHi} />
            <span style={{ fontSize: 11, fontWeight: 800, color: T.brass, letterSpacing: ".08em" }}>{t("티어")}</span>
          </div>
          <h3 style={{ fontSize: 21, fontWeight: 900, color: T.ivoryHi, margin: "0 0 8px", textAlign: "center" }}>{t("아이언부터 그랜드마스터까지")}</h3>
          <p style={{ fontSize: 13, color: T.inkSoft, lineHeight: 1.75, margin: "0 0 24px", textAlign: "center", maxWidth: 480, marginLeft: "auto", marginRight: "auto" }}>{t("7단계 티어 경험치 시스템. 퍼즐을 풀수록 경험치가 쌓이고 티어 상승")}</p>
        </Reveal>
        <TierStrip />
      </section>

      <div style={{ marginTop: 44 }}>
        <GrandmasterCard />
      </div>

      <SectionDivider />

      {/* (about 페이지 기능) 두 코치의 "vs" 배너 — 티어(경쟁) 이야기에서 다음의 우정·커뮤니티
          이야기로 넘어가는 길목에 배치해, "라이벌이자 함께 크는 사이"라는 관계를 자연스럽게 이어준다. */}
      <Reveal>
        <div style={{ maxWidth: 360, margin: "0 auto", borderRadius: 16, overflow: "hidden", ...GLOSS_BORDER }}>
          <FloatImg src="/ilust-4-web.webp" alt="MILKU vs KOKOA" />
        </div>
      </Reveal>

      <SectionDivider />

      <section className="flex items-center flex-wrap" style={{ gap: 28, maxWidth: 760, margin: "0 auto" }}>
        <div style={{ flex: "1 1 300px", minWidth: 260 }}>
          <SpeechBubble mascot={{ char: "kokoa", expr: "happy" }} name="KOKOA 코치" align="right">{t("친구를 추가하고 채팅하며 프로필에서 서로의 풀이 수·칭호 확인. 퍼즐을 공유하면 친구가 풀었을 때 경험치를 일부 획득")}</SpeechBubble>
        </div>
        <motion.div initial={{ opacity: 0, scale: 0.85, rotate: 5 }} whileInView={{ opacity: 1, scale: 1, rotate: 0 }} viewport={{ once: false, amount: 0.4 }} transition={{ duration: 0.55, ease: [0.22, 0.9, 0.32, 1] }}
          style={{ flex: "0 0 auto", width: 190, maxWidth: "100%", margin: "0 auto", borderRadius: 16, overflow: "hidden", ...GLOSS_BORDER }}>
          <FloatImg src="/ilust-2-web.webp" alt={t("MILKU와 KOKOA의 악수")} delay={0.4} />
        </motion.div>
      </section>

      <Reveal>
        <div style={{ maxWidth: 280, margin: "40px auto 0", borderRadius: 16, overflow: "hidden", ...GLOSS_BORDER }}>
          <FloatImg src="/ilust-3-web.webp" alt={t("마주 앉아 대국을 두는 MILKU와 KOKOA")} delay={0.8} />
        </div>
      </Reveal>

      <Reveal delay={0.05}>
        <section className="flex items-center flex-wrap" style={{ gap: 28, marginTop: 64, padding: "36px 28px", borderRadius: 18, background: "linear-gradient(160deg,#3A2516,#20140B)", ...GLOSS_BORDER, justifyContent: "space-between" }}>
          <div style={{ flex: "1 1 260px", minWidth: 220 }}>
            <h3 style={{ fontSize: 20, fontWeight: 900, color: T.ivoryHi, margin: "0 0 8px" }}>{t("지금 시작")}</h3>
            <p style={{ fontSize: 13, color: T.inkSoft, margin: 0 }}>{t("가입 없이 게스트로 둘러보기 가능")}</p>
          </div>
          <div className="flex items-center" style={{ gap: 18 }}>
            <Mascot char="kokoa" expr="celebrate" size={64} />
            <a href="/" className="press" style={{ display: "inline-flex", alignItems: "center", gap: 8, padding: "13px 24px", borderRadius: 999, background: "linear-gradient(180deg," + T.brass + ",#A8842F)", color: "#241509", fontWeight: 800, fontSize: 14, textDecoration: "none", boxShadow: "0 4px 0 #7A5E22", whiteSpace: "nowrap" }}>{tx("무료로 시작하기 {0}", <ArrowRight size={16} />)}
            </a>
          </div>
        </section>
      </Reveal>

      <div className="flex items-center justify-center" style={{ marginTop: 40 }}>
        <DecoBoard {...DECO_E} size={124} tilt={0} />
      </div>
      <div style={{ textAlign: "center", padding: "28px 0 8px" }}><span style={{ fontSize: 11, color: T.inkSoft }}>© OpenChess</span></div>
      </div>
    </div>
  );
}

// ============================================================ 버전 기록 페이지 ============================================================
// (v0.1.2 기능) 접속 시 뜨는 공지 모달은 화면이 좁아 항목을 짧게 요약해서만 보여준다 — 여기서는
// 같은 내용을 카테고리(기능/UI/UX/성능/버그 수정/보안)로 나누고 조금 더 풀어서 설명한다. 공지
// 모달의 CHANGELOG 배열(App.jsx)과 이 배열은 서로 다른 목적(모달=한 줄 요약, 이 페이지=상세 기록)을
// 가지므로 의도적으로 분리해 두었다 — 새 버전을 낼 때는 두 곳 모두에 항목을 추가해야 한다.
const CAT = {
  feature: { label: t("기능"), Icon: Sparkles, color: "#8FB55E" },
  ui: { label: "UI", Icon: Palette, color: "#6FA8DC" },
  ux: { label: "UX", Icon: MousePointer, color: "#B98CFF" },
  perf: { label: t("성능"), Icon: Zap, color: T.brassHi },
  fix: { label: t("버그 수정"), Icon: Wrench, color: "#E0995F" },
  security: { label: t("보안"), Icon: Shield, color: "#D9736A" },
};
const VERSION_HISTORY = [
  {
    version: "0.6.2", date: "2026.10.2",
    summary: t("타임 컨트롤별 레이팅 · /user 성취도 정리 · FEN 모드 엔진 수정 · 희생 퍼즐 첫 수 보정 · 보드 편집 뒤집기."),
    highlight: { kind: "icon", Icon: Wrench, color: T.brassHi, label: t("타임 컨트롤별 레이팅 · /user 성취도 · FEN 모드 엔진 · 희생 퍼즐") },
    sections: [
      { cat: "feature", items: [
        t("플레이 탭에서 미니게임을 일반 대국보다 위에 표시. 일반 대국 아래에 chess.com 대국 통계와 같은 UI로 내 대국 기록(시간 규정·색 필터, 전체 기간 전적, 최근 대국 목록) 추가. 봇 대국은 기록되지 않음."),
        t("일반 대국 레이팅을 타임 컨트롤(불렛·블리츠·래피드·스탠다드)별로 분리. 타임 컨트롤 선택 화면의 분류 이름 옆에 레이팅 표시, 랭킹도 분류별 탭으로 구분. 기존 일반 대국 레이팅은 초기화."),
      ] },
      { cat: "ui", items: [
        t("/user 페이지의 XP·퍼즐 레이팅·레슨·총 대국 요약과 일반 대국(타임 컨트롤별)·미니게임 기록을 카드로 묶어 정리."),
        t("보드 편집 화면에 보드 뒤집기 버튼 추가."),
      ] },
      { cat: "fix", items: [
        t("분석 탭 FEN 모드에서 평가치가 0.00으로 남고 엔진 라인이 비던 문제 수정. 엔진 준비가 늦으면 이미 켜진 엔진으로 바로 분석."),
        t("퍼즐 만들기에서 FEN 포지션의 '기물 희생하기'가 희생이 아닌 최선수를 정답으로 만들던 문제 수정. 탁월한 수(희생)를 먼저 찾아 첫 수로 고정하고, 없으면 안내."),
      ] },
    ],
  },
  {
    version: "0.6.1", date: "2026.10.1",
    summary: t("일반 대국 랭킹 · 나이트 레이스 개선 · 무한 체크메이트 대폭 확장 · Lichess 통계 표시 수정."),
    highlight: { kind: "icon", Icon: Trophy, color: T.brassHi, label: t("일반 대국 랭킹 · 나이트 레이스 최단 경로 화살표 · 체크메이트 포지션 수천 개 · 상대 진행 상황 표시") },
    sections: [
      { cat: "feature", items: [
        t("일반 대국 전적·레이팅·랭킹 추가. 랜덤 매칭 결과가 미니게임과 같은 형태의 랭킹에 반영."),
        t("나이트 레이스 혼자 플레이에서 목표에 못 닿으면 정산 전에 최단 경로를 금색 화살표로 표시."),
        t("무한 체크메이트 포지션을 수천 개로 확대. 백랭크·스머더드 등 다양한 체크메이트 모양을 고르게 출제하며, 한 번 나온 포지션은 모두 소진하기 전까지 다시 나오지 않음."),
        t("무한 체크메이트 대전에서 상대의 진행 상황(수순 탐색 중·정확한 수순·실패·체크메이트 성공) 표시."),
        t("무한 체크메이트 동점 시 결과 화면 전에 등급별 성공 수를 하나씩 비교하는 정산 화면 추가."),
      ] },
      { cat: "ui", items: [
        t("프로필의 통계 전환 버튼을 'OpenChess'·'chess.com' 글자로 변경."),
        t("미니게임 랭킹 화면의 중복된 '로비' 버튼 삭제."),
        t("미니게임 육각형 엠블럼에서 'MiniGame' 글자 삭제."),
      ] },
      { cat: "ux", items: [
        t("/user 페이지 우상단 X 버튼을 점 3개 메뉴(신고·차단)로 교체. 좌상단에 @아이디 표시."),
        t("신고 사유를 체크박스로 중복 선택. 개발자 모드에서 신고자·신고 대상 아이디와 신고 내용(최근 대화 포함) 열람."),
        t("채팅창 상단에 '최근 활동' 표시. 신고·차단 버튼을 점 3개 메뉴로 통합."),
        t("채팅의 모든 요소(카드·알림 포함)에 반응 가능. 더블클릭하면 하트 반응. 반응 이모지를 말풍선에 붙여 표시."),
        t("나이트 레이스 이동 수 제한 삭제. 제한시간 안이면 몇 수든 이동 가능."),
      ] },
      { cat: "fix", items: [
        t("분석 탭 수 블록의 Lichess 통계가 '— / —'로 남거나 채택률 막대가 비던 문제 수정. 통계 조회가 실패하면 자동으로 다시 시도."),
        t("나이트 레이스 거리 판정 연출이 칸에서 어긋나던 문제 수정."),
        t("대국 신청 카드의 띄어쓰기 오류 수정. '끝난 대국'을 '대국 종료됨'으로 표기."),
      ] },
    ],
  },
  {
    version: "0.6.0", date: "2026.10.1",
    summary: t("다국어 지원 · 신고·차단 확대 · 개인정보처리방침·이용약관 · 분석 탭 개선 · 앱 출시 준비."),
    highlight: { kind: "icon", Icon: Sparkles, color: T.brassHi, label: t("5개 언어 선택 · 체스 용어 표준 번역 · 프로필 신고·차단 · 개인정보처리방침·이용약관 · 분석 탭 개선") },
    sections: [
      { cat: "feature", items: [
        t("다국어 지원. 설정 탭에서 English·日本語·中文(简体)·Español·हिन्दी 선택."),
        t("체스 용어(체크메이트·앙파상·캐슬링 등)를 언어별 표준 용어로 번역."),
        t("프로필 화면에서 사용자 신고·차단. 설정 탭 '차단 목록'에서 차단 해제."),
        t("개인정보처리방침(/privacy)·이용약관(/terms) 페이지 추가. 회원가입 화면·설정 탭에서 이동."),
      ] },
      { cat: "ui", items: [
        t("분석 탭 보드를 더 크게 표시. 엔진 라인·평가치 막대도 같은 폭으로 확대."),
        t("수 블록의 키워드가 끝에서 되돌아오지 않고 같은 순서로 계속 흘러감."),
        t("설정 탭 정리. 계정·언어 카드를 맨 위로 이동, '통제 칸 표시'를 시각 효과로 통합."),
        t("chess.com 로고 이미지를 글자 표기로 변경."),
      ] },
      { cat: "ux", items: [
        t("날짜·숫자 표기가 선택한 언어에 맞춰 표시됨."),
        t("처음 접속하면 기기 언어로 자동 설정. 직접 선택하면 그 언어로 고정."),
        t("엔진 depth가 한 단계 깊어질 때마다 수 블록 평가치·정렬 갱신."),
        t("레슨 본문·오프닝 설명 일부는 한국어로 표시됨. 순차 번역 예정."),
      ] },
      { cat: "perf", items: [
        t("수 블록의 Lichess 통계를 위쪽 블록부터 도착하는 대로 표시."),
        t("화면별 파일 분리로 내부 구조 개선. 사용 방식 변화 없음."),
      ] },
      { cat: "fix", items: [
        t("번역 화면의 복수형·대소문자·문장 연결 오류 수정. 체스 용어 표기 전수 점검."),
        t("차단이 채팅에만 적용되던 문제 수정. 차단하면 친구 요청·도전장도 불가, 친구 추천에도 표시되지 않음."),
        t("공유·초대 링크를 항상 openchess.kr 주소로 생성."),
      ] },
    ],
  },
  {
    version: "0.5.9", date: "2026.9.30",
    summary: t("도전장 전송 오류 수정 · 수 등급 판정 개선 · 사이트 문구 개조식 통일."),
    highlight: { kind: "icon", Icon: Sparkles, color: T.brassHi, label: t("도전장 전송 수정 · 탁월한 수·유일한 수 판정 · 이론 수 판정 · 문구 개조식 통일") },
    sections: [
      { cat: "ux", items: [
        t("사이트 전체 문구를 명사형·개조식으로 통일. 중요도가 낮은 안내 문구 삭제."),
        t("업데이트 내역·FAQ·공지 문구 전면 정리."),
      ] },
      { cat: "fix", items: [
        t("친구에게 대국·미니게임 도전장이 전송되지 않던 문제 수정."),
        t("게임 리뷰·분석에서 탁월한 수·유일한 수가 누락되던 문제 수정. 탁월한 수는 엔진이 희생 이후 수순을 확인해 판정."),
        t("게임 리뷰에서 이론 수가 비이론 수로 표시되던 문제 수정. 수순 전환과 이름 있는 오프닝(ECO) 포지션도 이론으로 인식."),
        t("나이트 레이스 '최소 수' 표시가 실제보다 크던 문제 수정. 기물을 잡는 지름길이 있는 라운드는 출제하지 않음."),
        t("친구와 미니게임 중 새로고침하면 사이트가 멈추고 패배 처리되던 문제 수정. 새로고침 후 미니게임 화면으로 복귀."),
      ] },
    ],
  },
  {
    version: "0.5.8", date: "2026.9.27",
    summary: t("미니게임 재대국 · 상대 프로필 표시 · 7전 4선승 나이트 레이스."),
    highlight: { kind: "icon", Icon: Trophy, color: T.brassHi, label: t("미니게임 재대국 · 상대 프로필 표시 · 좌표 난이도 ×1·×2·×3 · 나이트 레이스 Bo7·거리 판정 연출") },
    sections: [
      { cat: "feature", items: [
        t("미니게임 대전 결과 화면에서 재대국 신청. 받은 사람은 화면 위 알림으로 수락·거절."),
        t("좌표 인지 게임 혼자 플레이 난이도 추가. 하(×1), 중(좌표 없음, ×2), 상(좌표 없음 + 흑 시점, ×3). 기록은 개수 × 배율."),
        t("나이트 레이스 7전 4선승제. 1·2라운드 방해 기물 없음, 7라운드 상대 퀸 등장. 제한시간 10초에서 라운드마다 2.5초 증가."),
      ] },
      { cat: "ui", items: [
        t("상대가 누른 칸·상대 나이트·상대 점수 옆에 상대 프로필 사진 표시."),
        t("나이트 레이스에서 둘 다 목표에 못 가면 금색이 퍼지며 더 가까운 나이트에 왕관 표시."),
        t("게임 리뷰 정확도 그래프를 폰·데스크톱 모두 한 화면에 표시."),
        t("좌표 인지 게임 정산 화면에 개수 × 배율 애니메이션 추가. 보드 아래 색 범례 삭제."),
      ] },
      { cat: "ux", items: [
        t("좌표 인지 게임 혼자 플레이 중 다시하기 지원."),
        t("좌표 인지 게임에서 여러 칸 동시 클릭 차단."),
        t("채팅 도전장 실패 시 사유 표시. 백랭크 러시아워 안내 문구 가독성 개선."),
      ] },
      { cat: "fix", items: [
        t("좌표 인지 게임 대전에서 마지막 라운드 뒤 결과 화면이 뜨지 않던 문제 수정."),
        t("채팅 /play에 화면에 보이는 미니게임 이름을 쓰면 신청되지 않던 문제 수정."),
        t("신규 가입 계정의 회원 번호가 비어 친구 검색에 안 잡히던 문제 수정."),
      ] },
    ],
  },
  {
    version: "0.5.7", date: "2026.9.27",
    summary: t("채팅 메신저화: 답장·반응·검색, 보드 미리보기·수 투표·같이 보기, /play 미니게임 대결."),
    highlight: { kind: "icon", Icon: Send, color: T.brassHi, label: t("채팅 답장·반응·검색 · 보드 미리보기·수 투표·같이 보기 · 명령어 자동완성 · /play 미니게임 · 빠른 첫 로딩") },
    sections: [
      { cat: "feature", items: [
        t("채팅 메시지 꾹 누르기: 답장·이모지 반응·복사·신고. 위로 올려 이전 메시지 로딩, 대화 내 검색."),
        t("FEN·수순 전송 시 작은 보드로 표시. 수 투표와 친구와 함께 두는 같이 보기 보드 추가."),
        t("/play knight처럼 대화 중인 친구에게 미니게임 4종 대결 신청. 수락 시 바로 입장."),
        t("분석 탭 FEN 모드에서도 추천 화살표 표시."),
        t("나이트 레이스 5라운드에 상대 퀸이 나오는 고난도 포지션 고정."),
      ] },
      { cat: "ui", items: [
        t("블라인드 대국의 수를 말풍선으로 표시. 백은 크림색, 흑은 갈색, 금색 글씨와 기물 아이콘."),
        t("체스 대국·미니게임 도전장 카드 디자인 통일."),
        t("데스크톱 미니게임·랭킹·설정 화면과 플레이 탭 상점 레이아웃 정리."),
        t("대국 요약 알림에서 바뀐 전적 숫자 강조. 분석 탭 퀘스트 표시를 금빛 고리와 광택으로 변경."),
      ] },
      { cat: "ux", items: [
        t("채팅 명령어 정리. '/' 입력 시 명령어 필터링, /help는 본인에게만 표시, 블라인드 대국은 /blind로 준비 후 시작."),
        t("FEN 모드에서 흑부터 두면 기보를 1...부터 표시."),
        t("좋은 수 이펙트에서 기물이 한 번 더 움직이던 연출 삭제."),
        t("사용자 차단, 불쾌한 메시지 신고 기능 추가."),
      ] },
      { cat: "perf", items: [
        t("초기 접속 용량 절반 이하로 축소."),
      ] },
      { cat: "security", items: [
        t("채팅 메시지·리뷰 기록을 타인이 수정하지 못하도록 차단."),
      ] },
      { cat: "fix", items: [
        t("메시지가 많은 대화에서 최신 메시지가 안 보이던 문제 수정."),
        t("채팅 도전장 수락 후 대국에 못 들어가거나 엉뚱한 화면이 열리던 문제 수정."),
        t("나이트 레이스에서 답이 없던 라운드 수정. 지키는 칸을 실제 체스 규칙과 동일하게 계산."),
      ] },
    ],
  },
  {
    version: "0.5.6", date: "2026.9.26",
    summary: t("chess.com 대국 요약 알림 · 도감 오프닝 트리 개선."),
    highlight: { kind: "icon", Icon: Sparkles, color: T.brassHi, label: t("대국 요약 알림 · 새 도감 트리 · 전적 칩 · 대국 종료 이펙트 · 미니게임 드래그 무브") },
    sections: [
      { cat: "feature", items: [
        t("chess.com 대국 종료 시 요약 알림. 결과·상대·오프닝과 해당 오프닝 전적·승률 변화 표시, 검색·리뷰 버튼 제공. 미접속 중 둔 대국은 다음 접속 때 순서대로 표시."),
        t("대국 종료 이펙트 추가. 체크메이트(승자·패자), 스테일메이트, 3회 동형 반복."),
        t("도감 수 블록에 내 chess.com 전적·승률 표시."),
        t("미니게임 보드 기물 드래그 이동."),
      ] },
      { cat: "ui", items: [
        t("도감 오프닝 트리 블록·이름표·연결선 재배치. 겹침 제거, 이름표는 항상 블록 위."),
        t("수 이펙트 이름표를 '탁월한 수'로 변경, 가운데 정렬. 칸 기호를 수 체계 아이콘과 통일."),
        t("미니게임 준비 화면 정리. 규칙 설명은 오른쪽 위 ? 버튼의 말풍선."),
        t("분석 탭 수 블록 일일 퀘스트 표시를 두루마리 형태로 변경."),
        t("도감 수 카드와 데스크톱 플레이 탭 버튼 축소."),
      ] },
      { cat: "ux", items: [
        t("내 퍼즐이 오늘의 퍼즐로 뽑히면 팝업 대신 알림 창에 번호와 함께 표시. 도감 잠금 해제 알림 삭제."),
        t("퍼즐 오답 시 빨간 X 이펙트. 좋은 수 이펙트는 끝까지 재생 후 다음 수 진행."),
        t("도감 트리 드래그 관성, 핀치·Ctrl+휠·더블클릭 확대. 백랭크 러시아워 힌트 삭제."),
      ] },
      { cat: "perf", items: [
        t("도감 오프닝 트리 로딩 시간 대폭 단축."),
        t("수 이펙트·대국 종료 이펙트 GPU 재생. 20% 속도 향상."),
      ] },
      { cat: "fix", items: [
        t("기기의 '애니메이션 줄이기' 설정 시 사이트 애니메이션이 멈추던 문제 수정. 배포 전 자동 검사 추가."),
        t("개발자가 추가한 이론 수가 도감에서 이론으로 표시되지 않던 문제 수정. 배포 전 자동 검사 추가."),
        t("도감 수 카드가 화면 밖으로 잘리던 문제, 최근 대국 레이팅 변화 오표시 수정."),
      ] },
    ],
  },
  {
    version: "0.5.5", date: "2026.9.25",
    summary: t("플레이 탭 개편 · 수 등급 이펙트 · 상대 나이트 잡기."),
    highlight: { kind: "icon", Icon: Sparkles, color: T.brassHi, label: t("새 플레이 탭 · 수 등급 이펙트 · 상대 나이트 잡기 · 라운드별 제한시간 · 시각 효과·미니게임 설정") },
    sections: [
      { cat: "feature", items: [
        t("탁월한 수·유일한 수·최선의 수를 두면 칸이 등급 색으로 빛나고 이름표가 뜬 뒤 작은 배지로 축소. 분석·학습·퍼즐 탭, 게임 리뷰, 무한 체크메이트 게임에서 표시."),
        t("무한 체크메이트 게임에서 둔 수를 엔진이 즉시 채점. 탁월·유일·최선이면 이펙트 표시."),
        t("나이트 레이스에서 상대 나이트 잡기. 잡힌 쪽은 해당 라운드 종료."),
        t("설정 탭에 '시각 효과'(수 등급 이펙트, 기본 켜짐)와 '미니게임 설정'(상대 기물이 지키는 칸 표시, 기본 꺼짐) 추가."),
      ] },
      { cat: "ui", items: [
        t("일반 대국과 미니게임을 한 화면으로 통합. 미니게임 4종은 가운데 로고 주변 버튼으로 배치, 버튼 안 보드에 각 게임 장면 재생."),
        t("일반 대국 버튼 보드에서 마스터 대국을 랜덤 재생. 클릭 시 별도 창에서 시간 선택."),
        t("미니게임 이름 변경: 나이트 레이스·백랭크 러시아워·무한 체크메이트 게임. 미니게임 화면 배경을 크림색으로 통일."),
        t("좌표 인지 게임: 칸 선택 시 조준경, 정답 초록 체크, 오답 빨간 X. 무한 체크메이트 게임도 둔 칸에 체크·X 표시, 등급은 보드 위 아이콘."),
        t("나이트 레이스에서 나이트가 잡히면 지키던 기물이 날아와 잡는 연출. 목표 칸은 금색 별."),
      ] },
      { cat: "ux", items: [
        t("나이트 레이스 제한시간 1라운드 5초에서 라운드마다 증가(최대 17초). 후반부는 기물 최대 5쌍, 목표 거리 증가."),
        t("나이트 레이스는 도착·포획 장면을 끝까지 보여준 뒤 정산 화면 표시. 혼자 플레이에서는 내 진영 기물 미표시."),
        t("나이트 레이스·백랭크 러시아워에서 상대 기물이 지키는 칸을 기본 숨김."),
      ] },
      { cat: "fix", items: [
        t("미니게임 랜덤 매칭이 대기열 없이 곧장 패배 처리되던 문제 수정. 배포 전 자동 검사 추가."),
        t("무한 체크메이트 게임이 시작하자마자 동작하지 않던 문제 수정."),
        t("무한 체크메이트 버튼 속 장면이 메이트가 아닌데 메이트로 넘어가던 문제 수정."),
        t("백랭크 러시아워 봇 대전 결과가 늦게 뜨던 문제 수정."),
      ] },
    ],
  },
  {
    version: "0.5.4", date: "2026.9.24",
    summary: t("미니게임 레이팅·전적·랭킹."),
    highlight: { kind: "icon", Icon: Trophy, color: T.brassHi, label: t("미니게임 레이팅 · 전체·친구 랭킹 · 로비 전적 바 · 결과 화면 레이팅 변화") },
    sections: [
      { cat: "feature", items: [
        t("미니게임별 레이팅. 1200점 시작, 랜덤 매칭 승패로 변동, 처음 20판은 변동폭 확대."),
        t("미니게임 랭킹. 시작 화면 '랭킹' 버튼에서 레이팅·혼자 플레이 기록 순위를 전체·친구 기준으로 확인. 레이팅 순위는 랜덤 매칭 3판 완료 후 등재."),
        t("혼자 플레이 최고 기록 계정 저장. 기기 간 연동, 로그인 전 기록은 로그인 시 반영."),
        t("친구 도전은 친선전. 전적만 반영, 레이팅 변동 없음."),
        t("나이트 경주 규칙 추가. 상대 기물 칸 도달 시 포획(해당 기물이 막던 칸 해제), 상대 기물이 지배하는 빨간 칸 진입 시 라운드 종료, 내 색 기물 칸 진입 불가."),
        t("나이트 경주 승패 규칙. 더 적은 수로 도착한 쪽 승, 같으면 먼저 도착한 쪽 승."),
        t("러시아워 규칙 추가. 주인공 룩이 상대 기물 지배 칸에 진입하면 즉시 포획, 라운드 종료(혼자 풀기는 실패 화면에서 재도전)."),
      ] },
      { cat: "ux", items: [
        t("나이트 경주 난이도 상향. 첫 라운드부터 상대 기물 등장, 목표까지 최소 3~6수. 2라운드부터 최단 경로가 위협 칸으로 막혀 우회 또는 포획 필요. 이동 수 제한은 최소 수 +1, 제한시간 25초에서 15초로 단축."),
      ] },
      { cat: "ui", items: [
        t("미니게임 시작 화면 상단에 내 레이팅·전적(승·패·무, 연승)·혼자 플레이 최고 기록과 랭킹 버튼 추가."),
        t("실시간 대전 결과 화면에 레이팅 변동 수치 표시."),
        t("프로필에 미니게임별 레이팅·전적·혼자 최고 기록 표시. 스페셜 미니게임 목록에 게임별 레이팅 표시."),
        t("나이트 경주에서 포획 가능한 상대 기물은 금색 고리로 깜빡임, 잡힌 나이트는 흐려지며 빨간 X 표시."),
        t("나이트 경주·러시아워 라운드 종료 시 정산 화면 표시. 결과·이동 수·소요 시간 비교, 승리 사유, 누적 점수, 다음 라운드까지 남은 시간."),
      ] },
      { cat: "fix", items: [
        t("일일 퍼즐이 뜨지 않던 문제 수정. 오늘의 퍼즐이 비어 있으면 퍼즐 탭 진입 시 즉시 채움."),
        t("분석 탭에서 FEN 모드 종료 시 사이트가 멈추던 문제 수정."),
      ] },
    ],
  },
  {
    version: "0.5.3", date: "2026.9.24",
    summary: t("신규 미니게임 러시아워·공격 모드 · 미니게임 연출 강화."),
    highlight: { kind: "icon", Icon: Puzzle, color: T.brassHi, label: t("새 미니게임 러시아워 · 새 미니게임 공격 모드 · 미니게임 카운트다운·효과음·진동·애니메이션 · 새 결과 화면") },
    sections: [
      { cat: "feature", items: [
        t("신규 미니게임 '러시아워'. 내 기물 사이에 갇힌 룩(왕관 표시)을 빼내 상대 백랭크에서 체크메이트. 다른 기물은 실제 규칙대로 이동, 상대 수비 기물은 방금 움직인 내 기물이 공격 범위에 들어오면 포획."),
        t("러시아워 모드: 혼자 풀기(쉬움·보통·어려움 46레벨, 최단 수 기준 별 3개, 되돌리기·처음부터·위험 칸 보기·힌트), 봇 대전, 실시간 대전, 친구 도전. 대전은 3라운드 2선승, 같은 퍼즐을 동시에 풀어 적은 수(같으면 빠른 쪽) 승리."),
        t("신규 미니게임 '공격 모드'. 3분간 강제 체크메이트 포지션('공격 기회')이 반복 출제, 더 많이 메이트시킨 쪽 승리. 오답 시 정답 칸 표시 후 다음 기회로 이동."),
        t("공격 기회 등급: S 1수·A 2수·B 3수·C 4수. 퍼즐 레이팅이 낮을수록 높은 등급 확률 상승. 동점 시 낮은 등급 성공 수부터 비교, 그래도 같으면 레이팅 높은 쪽 승. 봇 대전은 쉬움·보통·어려움."),
        t("미니게임 4종 혼자 플레이하기. 좌표 인지 게임 30초 정답 수, 나이트 경주 5라운드 도달 횟수(같으면 소요 시간), 공격 모드 3분 메이트 수, 러시아워 레벨 풀이. 최고 기록은 기기에 저장, 신기록 시 화면 표시."),
        t("공격 기회 포지션 295개로 시작. 마스터 대국에서 추출해 엔진 검증. 개발자가 리체스 퍼즐·FEN으로 추가 가능."),
      ] },
      { cat: "ui", items: [
        t("미니게임 4종 시작 화면 배치 통일. 규칙 안내 아래 '혼자 플레이하기 · 봇과 플레이하기 · 랜덤 매칭', 그 아래 '친구와 플레이하기' 목록."),
        t("미니게임 4종 라운드 시작 전 3·2·1 카운트다운. 실시간 대전은 동시 시작."),
        t("점수 상승 시 숫자가 튀는 점수판, 라운드 종료 결과 배너, 남은 시간이 적으면 빨갛게 깜빡이는 시간 막대 추가."),
        t("나이트 경주의 나이트와 러시아워 기물이 칸 사이를 미끄러지듯 이동."),
        t("결과 화면 개편. 승리 시 금빛 파티클, 라운드별 기록, 게임별 통계(평균·최고 반응속도, 평균 이동 수, 최단 도달 시간, 등급별 성공 수). 봇 대전은 '다시 하기' 지원."),
      ] },
      { cat: "ux", items: [
        t("미니게임 효과음·진동 추가. 카운트다운, 정답·오답, 라운드 승패, 최종 승리. 설정의 효과음 켜기/끄기·볼륨 연동."),
        t("오답이나 위험 칸 이동 시 보드 좌우 흔들림."),
        t("미니게임 4종 봇 난이도 하향. 좌표 인지 봇은 반응 지연, 나이트 경주 봇은 이동 속도 저하와 오류 추가, 러시아워·공격 모드 봇은 소요 시간·실패율 증가."),
      ] },
      { cat: "fix", items: [
        t("좌표 인지 게임 봇 대전에서 앞 라운드 봇 클릭이 다음 라운드로 넘어가 새 라운드가 봇 득점으로 끝나던 문제 수정."),
      ] },
    ],
  },
  {
    version: "0.5.2", date: "2026.9.22",
    summary: t("캐슬링 권리 검증 수정 · 퍼즐 포지션 분류 개선 · 신규 기능 6종."),
    highlight: { kind: "icon", Icon: Shield, color: T.brassHi, label: t("캐슬링 권리 검증 누락 수정 · 퍼즐 국면 판정 개선 · 일일 퍼즐 스트릭·배지 · 적응형 퍼즐 난이도 · 오프닝 트리 내 승률 오버레이 · 프로필 약점 리포트 · 리뷰 공유 이미지 카드 · PvP 관전 모드") },
    sections: [
      { cat: "security", items: [
        t("표준 시작 위치의 모든 대국·퍼즐에서 킹이 제자리를 벗어났다가 돌아오면 캐슬링이 재개되던 규칙 위반 수정. 실시간 대국에서 악용 가능했던 문제."),
      ] },
      { cat: "fix", items: [
        t("퍼즐의 오프닝·미들게임·엔드게임 분류 기준 개선. 실전 대국 퍼즐은 진행 수 반영, 남은 기물이 적으면 항상 엔드게임."),
        t("퍼즐 탭 풀이 카드를 닫으면 목록 맨 위로 이동하던 문제 수정. 스크롤 위치 유지."),
        t("FEN 퍼즐 이름 변경 후 카드를 닫으면 원래 이름으로 돌아가던 문제 수정."),
        t("개발자·공동개발자의 퍼즐 생성자 회수·양도가 성공으로 표시되나 반영되지 않던 문제 수정."),
        t("같은 포지션 퍼즐이 다른 번호로 중복 생성되던 문제 수정. 수순 전위·FEN 표기 차이가 있어도 기존 퍼즐로 안내. 개발자 도구 '퍼즐 컨트롤 센터'에 중복 정리 기능 추가."),
        t("FEN 퍼즐의 모든 라인을 풀어도 카드가 초록색으로 바뀌지 않던 문제 수정."),
        t("퍼즐 자동 생성 시 캐슬링 이후 룩·킹의 재이동을 '기물 꺼내기'로 오판해 후보에서 제외하던 문제 수정."),
      ] },
      { cat: "feature", items: [
        t("게임 리뷰 코치 카드에 '계획' 버튼 추가. 엔진으로 이후 포지션을 분석해 여러 수에 걸친 기물 재배치 경로 제시."),
        t("일일 퍼즐 스트릭·배지. 퍼즐 탭에 불꽃 아이콘 표시, 최고 기록 별도 저장."),
        t("적응형 퍼즐 난이도. 최근 정답률과 풀이 경험치에 맞춰 목표 레이팅 자동 조정."),
        t("도감 오프닝 트리 블록에 chess.com 전적 기준 내 승률을 색으로 표시."),
        t("프로필 chess.com 통계에 '약점 리포트' 추가. 리뷰한 대국을 모아 블런더가 잦은 오프닝 표시."),
        t("리뷰 공유 이미지 카드. OpenChess 로고, 기물 아이콘, 상대 프로필 사진·레이팅, 수별 색상 흐름, 수 등급별 목록 포함."),
        t("PvP 관전 모드. 친구 목록에서 대국 중인 친구의 관전 버튼으로 진입."),
      ] },
    ],
  },
  {
    version: "0.5.1", date: "2026.9.13",
    summary: t("Stockfish 18 연결 실패 수정 · 서버 기준 시간 초과 판정 · 미니게임 전체 화면."),
    highlight: { kind: "icon", Icon: Shield, color: T.brassHi, label: t("Stockfish 18 연결 실패 · 퍼즐 이름 되돌림 · 실시간 대국 시간 초과 좀비 대국 근본 수정 · FEN 모드 다음 수·수 체계 아이콘 정확도 개선 · 이미지 스캔 속도·진행률 개선 · 캐슬링 권리 자동 해제 · 승격 선택 창 색상·크기·위치 개선 · 미니게임 전체화면 레이아웃 재설계") },
    sections: [
      { cat: "fix", items: [
        t("Stockfish 18 선택 시 항상 '연결 실패'로 멈추던 문제 수정. 신경망 파일을 사이트와 같은 곳에서 직접 받도록 변경, 설정 탭에 부팅 안내 추가."),
        t("퍼즐 이름 변경 후 '내가 만든 퍼즐'·오늘의 퍼즐에서 예전 이름이 보이던 문제 수정."),
        t("실시간 대국에서 시간 초과 후 상대가 결과를 보고하지 않고 이탈하면 대국이 서버에 남던 문제 수정. 서버가 양측 남은 시간을 직접 기억해 접속 여부와 관계없이 결과 확정."),
        t("분석 탭 FEN 모드의 '다음 수' 칸이 비거나 무관한 오프닝 문구가 섞이던 문제 수정. 엔진 후보 수 표시."),
        t("FEN 모드 '다음 수' 블록과 현재 수 블록의 등급이 서로 다르던 문제 수정."),
        t("이미지 스캔 중 일시적 인식 엔진 과부하 오류 시 자동 재시도."),
        t("폰 승격 선택 창이 항상 검은 기물만 표시하던 문제 수정. 승격 진영 색으로 표시."),
      ] },
      { cat: "perf", items: [
        t("이미지 스캔 속도 개선. 사진 축소·압축률 상향, 재시도 병렬 처리."),
      ] },
      { cat: "feature", items: [
        t("이미지 스캔 진행률(%) 실시간 표시."),
        t("보드 편집기에서 킹·룩이 시작 칸을 벗어나면 캐슬링 권리 자동 해제. 제자리로 돌아와도 복구되지 않음."),
      ] },
      { cat: "ui", items: [
        t("FEN 모드 상단 안내 박스 삭제. 종료 버튼을 FEN 코드 줄로 이동."),
        t("폰 승격 선택 창 버튼 확대, 8x8 판 정중앙에 표시."),
        t("수가 1~2개뿐인 포지션에서 엔진 상위 줄이 불필요한 빈 공간을 차지하던 문제 수정."),
        t("좌표 인지 게임·나이트 경주를 전체 화면 별도 레이아웃으로 재설계. 모바일은 내 보드 아래, 상대 보드 위, 스크롤 없이 두 보드 표시."),
        t("좌표 인지 게임: 보드 하나로 통합, 내 클릭은 금색 테두리·상대 클릭은 파란 테두리. 좌표축과 시작 배치 기물 표시. 오답으로는 라운드가 끝나지 않음."),
        t("나이트 경주: 보드 하나로 통합, 목표 칸 기준 점대칭 배치. 방해 칸 대신 상대 색 기물(비숍·룩) 배치, 공격 칸은 빨간색 표시."),
      ] },
    ],
  },
  {
    version: "0.5.0", date: "2026.9.12",
    summary: t("상점 탭을 플레이 탭으로 개편 · 실시간 미니게임 2종."),
    highlight: { kind: "icon", Icon: Target, color: T.brassHi, label: t("상점 탭 → 플레이 탭 개편 · 실시간 미니게임 '좌표 인지 게임'·'나이트 경주' · 채택률·모바일 엔진 라인 등 버그 수정") },
    sections: [
      { cat: "feature", items: [
        t("상점 탭을 플레이 탭으로 변경. 분석 탭 PLAY 버튼과 같은 대국 설정 화면으로 진입, 아래로 내리면 기존 상점(보드·기물 스킨)."),
        t("플레이 페이지 상단에 일반/스페셜 토글 추가."),
        t("스페셜 미니게임 '좌표 인지 게임'. 보드 아래에 표시된 좌표를 읽고 상대보다 먼저 클릭."),
        t("스페셜 미니게임 '나이트 경주'. 5전 3선승, 목표 칸에 먼저 도달. 라운드가 갈수록 방해 칸 증가."),
        t("미니게임 2종에 봇 대전·친구 도전 추가. 봇은 서버 없이 바로 대전."),
      ] },
      { cat: "ui", items: [
        t("플레이 탭에도 상단 헤더·하단 탭바 표시. 대국 중 탭을 이동해도 대국 유지."),
        t("스페셜 미니게임 목록을 한 줄 1게임 형태로 변경. 게임별 아이콘 색 구분."),
        t("미니게임 보드·기물에 장착 중인 스킨 적용."),
        t("좌표 인지 게임 정답 초록·오답 빨강 반짝임. 오답은 계속 시도 가능."),
        t("나이트 경주에 상대 보드 추가. 봇도 한 수씩 이동."),
        t("미니게임 점수 아래 라운드별 승패 점 표시."),
        t("하단 탭 순서 변경: 분석·플레이·퍼즐·학습·도감·설정."),
        t("도감 탭 오프닝 모식도 영역 확대(데스크톱)."),
      ] },
      { cat: "fix", items: [
        t("분석 탭 리체스 채택률(%) 반올림 오차 수정. 소수점 둘째 자리까지 표시."),
        t("모바일 분석 탭 엔진 라인(상위 3줄) 미표시 문제 수정."),
        t("퍼즐 삭제 버튼 무동작, FEN 퍼즐 이름 변경 미저장 문제 수정."),
        t("같은 원인으로 실패하던 계정 탈퇴, 채팅 메시지 수정·대화 삭제, 실시간 대국 대기열·초대 취소 정상화."),
        t("내 퍼즐이 오늘의 퍼즐로 선정돼도 알림이 오지 않던 문제 수정."),
        t("퍼즐 만들기 1단계에서 PGN·FEN 입력 후 '확인'이 무반응이던 문제 수정."),
      ] },
    ],
  },
  {
    version: "0.4.9", date: "2026.9.9",
    summary: t("일일 퍼즐 커뮤니티 자동 선정 · FEN 퍼즐 이름 · 분석 탭 보드 확대."),
    highlight: { kind: "icon", Icon: Zap, color: T.brassHi, label: t("일일 퍼즐 커뮤니티 자동 선정 · FEN 퍼즐 이름·표시 · 분석 탭 보드 확대·흔들림 고정") },
    sections: [
      { cat: "feature", items: [
        t("FEN 퍼즐 이름을 생성자·개발자가 직접 지정 가능. 수 설명과 같은 금칙어 검사 적용."),
        t("FEN 퍼즐 풀이 카드에 FEN 코드 표시. 클릭 시 학습 탭으로 이동해 포지션 로드."),
        t("일일 퍼즐 선정 방식 변경. 오프닝 테마 사전 등록 대신, 공개된 커뮤니티 퍼즐 중 인기 점수가 가장 높은 미선정 퍼즐을 매일 선정."),
        t("내 퍼즐이 일일 퍼즐로 선정되면 알림과 OC 나이트 코인 지급. 미접속 상태였으면 다음 접속 때 '받기' 팝업."),
      ] },
      { cat: "ui", items: [
        t("분석 탭 메인 보드가 모바일에서 360px로 고정되던 문제 수정. 카드 폭에 맞춰 확대, 보드 아래 버튼도 확대."),
        t("퍼즐 카드 레이팅 배지를 풀이 카드와 통일."),
        t("퍼즐 테마 카드 배경의 장식용 수 기호 삭제."),
        t("퍼즐 풀이 카드 제작자 ID 확대, 클릭 시 프로필로 이동."),
        t("퍼즐 풀이 카드의 코치 말풍선 토글 삭제. 기본 숨김, 설정 탭에서만 변경."),
        t("채팅 말풍선 최대 폭 제한, 자동 줄바꿈."),
        t("/user 페이지 친구 요청 상태 문구 삭제, 아이콘만 표시."),
        t("설정 탭 개발자 패널의 '2주 오프닝 테마' 등록 화면을 자동 선정 내역 확인·즉시 실행 버튼으로 교체."),
      ] },
      { cat: "perf", items: [
        t("채택률 상위 후보 수의 리체스 통계를 클릭 전 백그라운드에서 미리 로딩."),
        t("일일 퍼즐이 기존 커뮤니티 퍼즐 데이터를 재사용해 로컬 엔진 재계산 제거."),
        t("Stockfish 18 엔진 파일을 외부 저장소로 이전해 배포 용량 절감."),
      ] },
      { cat: "ux", items: [
        t("리체스 통계 도착 전 회수·채택률 자리에 로딩 인디케이터 표시."),
        t("채팅 블라인드 대국에서 같은 사람의 연속 입력 차단."),
      ] },
      { cat: "fix", items: [
        t("분석 탭 회수(a/b) 표기가 말줄임으로 잘리고 채택률 오른쪽 여백이 부족하던 문제 수정."),
        t("평가치 막대·엔진 라인 표시 여부에 따라 보드가 흔들리던 문제 수정. 높이 고정."),
        t("엔진 라인 생성·순위 변경 시 보드가 흔들리던 문제, 수 블록 키워드 수에 따른 보드 크기 변동 수정."),
        t("평가치 막대 '탐색 상태' 말풍선 미표시 수정."),
        t("일일 퍼즐 팝업·풀이 카드에서 집중 분석 진입 후 나가면 학습 탭 첫 화면으로 가던 문제 수정. 진입 화면으로 복귀."),
        t("퍼즐 카드 수 재생 애니메이션에서 기물 포획 순간이 표시되지 않던 문제 수정."),
        t("FEN 퍼즐 컴퓨터 응수 시 전체 기물이 순간 표시되던 문제, 풀이 카드 FEN 코드 첫 클릭이 무반응이던 문제 수정."),
        t("짧고 단순한 퍼즐 레이팅이 과대 산정되던 문제 완화. 기물 수 비중 축소, 라인 길이·응수 갈래 수 비중 확대."),
        t("채팅 블라인드 대국 /draw가 상대 동의 없이 무승부 처리되던 문제 수정."),
        t("About 페이지 버전 기록의 v0.4.8 항목 누락 보완."),
      ] },
    ],
  },
  {
    version: "0.4.8", date: "2026.9.6",
    summary: t("채팅 블라인드 대국 · FEN 모드 리뷰 복원 · 리뷰 카드 통일."),
    highlight: { kind: "icon", Icon: Sparkles, color: T.brassHi, label: t("채팅으로 블라인드 대국 · FEN 모드 리뷰 복원 · 리뷰 카드 통일") },
    sections: [
      { cat: "feature", items: [
        t("채팅 블라인드 대국. '1.e4'처럼 수순 번호가 붙은 SAN을 보내면 시작, 차례에 맞는 합법 수만 인식. 체크메이트·무승부 자동 판정, /resign·/draw·/eval 지원."),
        t("블라인드 대국 중 백그라운드에서 depth를 높여가며 분석. /eval 입력 시 현재까지 계산된 평가치와 depth 표시."),
      ] },
      { cat: "fix", items: [
        t("학습 탭 FEN 모드에서 대국 리뷰(/review) 진입 복원."),
        t("채팅 입력창에 '/'만 입력해도 사용 가능한 명령어 안내 표시."),
        t("퍼즐 컨트롤 센터 손상 검사 강화. 트리·라인 구조는 정상이나 수순이 불법인 퍼즐까지 검출."),
      ] },
      { cat: "ui", items: [
        t("채팅 리뷰 카드의 chess.com 대국 표시를 /user 프로필 chess.com 통계 행과 동일하게 통일."),
      ] },
    ],
  },
  {
    version: "0.4.7", date: "2026.9.5",
    summary: t("실시간 대국 무승부·재대결 · 수 설명 좋아요/싫어요."),
    highlight: { kind: "icon", Icon: Wrench, color: T.brassHi, label: t("실시간 대국 무승부·재대결 · 수 설명 좋아요/싫어요 · 여러 버그 수정") },
    sections: [
      { cat: "feature", items: [
        t("실시간 대국 무승부 제안. 상대가 봇이 아닐 때 '다시 설정' 대신 무승부 제안 버튼 표시, 제안받은 쪽은 하단 수락/거절 알림."),
        t("실시간 대국 중 이탈 시 즉시 기권 처리 대신 확인 창 표시."),
        t("대국 결과 팝업 '재대결' 버튼 작동. 봇은 같은 조건으로 즉시 시작, 실시간은 상대에게 신청."),
        t("채팅 이모티콘 박스 확대. MILKU·KOKOA 12개씩 한 판(6×4)에서 선택."),
        t("수 설명 좋아요·싫어요. 인기순·오래된 순·최신순 정렬."),
        t("개발자 도구 '퍼즐 컨트롤 센터'. 손상된 퍼즐 일괄 검사·말소, 번호 지정 퍼즐 관리."),
      ] },
      { cat: "ui", items: [
        t("수 키워드(TOP LEVEL 등) 말풍선을 키워드 옆에 꼬리와 함께 표시."),
        t("OC 나이트 코인 아이콘 교체."),
      ] },
      { cat: "fix", items: [
        t("분석 탭 체스보드가 수를 둘 때마다 미세하게 흔들리던 문제 수정. 크기 고정."),
        t("상단 헤더 버튼 테두리 잘림 수정, 프로필 버튼 y좌표를 알림 버튼과 일치."),
        t("이미 친구인 상대 프로필에서 '친구 요청' 버튼 미표시."),
        t("친구 요청 문구가 길어질 때 /user 페이지 요소가 밀리던 문제 수정."),
        t("대상 아이디에 대문자가 있으면 퍼즐 생성자 양도가 실패하던 문제 수정."),
      ] },
    ],
  },
  {
    version: "0.4.6", date: "2026.9.4",
    summary: t("/play 앙파상 버그 수정 · 표준 시작 위치 고정 · 친구 초대 링크 · 프로필 개편."),
    highlight: { kind: "icon", Icon: Wrench, color: T.brassHi, label: t("/play 앙파상 버그 수정 · 친구 초대 링크·프로필·채팅 개선") },
    sections: [
      { cat: "security", items: [
        t("/play는 항상 표준 시작 위치에서만 시작. 보드 편집이나 FEN/PGN 로드로 위치가 달라지면 PLAY 버튼 비활성화."),
      ] },
      { cat: "fix", items: [
        t("보드 편집기에서 앙파상이 가능한 포지션을 만들어 /play를 열면 앙파상이 잘못 적용되던 문제 수정."),
        t("이미지 스캔 모델 이름이 바뀌어도 자동으로 다른 모델로 전환."),
        t("'푼 퍼즐' 카드에 좋아요·리포스트·공유 버튼이 없고 클릭 시 이동하지 않던 문제 수정."),
        t("채팅창 고정은 한 번에 하나만 가능."),
        t("개발자가 타인 퍼즐을 삭제하지 못하던 문제, 퍼즐 생성자 양도·회수 실패 문제 수정."),
        t("chess.com 대국 리뷰의 오프닝 이름이 사이트 다른 곳과 다르던 문제 수정."),
        t("퍼즐 탭 말풍선이 화면 가장자리에서 잘리던 문제 수정."),
        t("퍼즐 오프닝·미들게임·엔드게임 분류 기준 조정."),
        t("프로필 버튼 정렬, /user 티어 여정 화면 겹침 수정."),
        t("/analysis, /learn 주소가 뒤바뀌어 있던 문제 수정."),
        t("학습 탭 첫 진입 시 화면이 순간 확대되던 문제 수정."),
        t("리체스 통계 서버 캐싱. 학습 탭 채택률 애니메이션 시작 지연 5~10초 대폭 단축."),
      ] },
      { cat: "feature", items: [
        t("친구 초대 링크 개선. 전체 링크 표시, 복사 버튼 아래 공유 버튼 추가."),
        t("채팅에 프로필 사진의 접속 표시 추가."),
        t("퍼즐 정렬 '인기순'. 좋아요·리포스트·공유를 사람 단위로 결합해 점수 산정."),
        t("학습·집중 분석·도감의 수 키워드(NORMAL·TOP LEVEL 등) 클릭 시 뜻 말풍선."),
        t("유저 검색 접두어 실시간 후보 표시. '#MID' 9자 전체 입력 불필요."),
      ] },
      { cat: "ui", items: [
        t("MID를 프로필 사진 아래 '#ABCDE1234' 형태로 표시."),
        t("'푼 퍼즐'을 가로 스크롤로 전체 표시."),
        t("상단 헤더 금색 경계선 추가, 버튼 높이·정렬 통일."),
        t("학습 탭 수 블록 채택률 게이지 폭 축소, 회수·채택률 간격 확대."),
        t("도감 오프닝 모식도 수 블록 상세 카드 2배 확대."),
        t("설정 탭 개발진 블록: 왕관 아이콘 삭제, 개발자·공동 개발자 표시를 아이콘으로 변경."),
        t("십각형 티어 이미지 확대, 꼭짓점 둥글게. 티어 여정 화면을 뷰포트 전체 비율로 표시."),
        t("채팅창 상단 프로필 사진·아이디 1.5배 확대, 클릭 시 프로필 이동."),
        t("채팅 리뷰 공유 카드를 프로필 '최근 대국' 행과 같은 비율로 변경. /help는 명령어 목록 카드로 기록."),
        t("설정 탭 프로필 카드의 '문제 a/b개 정답' 문구 삭제."),
        t("/user 페이지 순위 배지, 국적 박스 삭제. 데스크톱은 티어·퍼즐 레이팅을 왼쪽 유저 정보 아래 상시 표시."),
      ] },
    ],
  },
  {
    version: "0.4.5", date: "2026.9.3",
    summary: t("매칭 대기 화면 궤도 애니메이션 · 상대 찾기 즉시 패배 버그 수정."),
    highlight: { kind: "icon", Icon: Sparkles, color: T.brilliant, label: t("매칭 대기 화면 궤도 애니메이션 · 대국 상대 찾기 즉시 패배 버그 수정") },
    sections: [
      { cat: "feature", items: [
        t("매칭 대기 화면 궤도 애니메이션 개선. 반지름이 다른 궤도 위를 수 아이콘이 천체처럼 회전, 구성은 직전 대국 반영."),
      ] },
      { cat: "fix", items: [
        t("'동작 줄이기' 설정 시 궤도 애니메이션이 멈추던 문제 수정."),
        t("도감 탭이 오프닝 정보를 한꺼번에 요청해 에러가 반복되던 문제 수정."),
        t("'대국 상대 찾기' 클릭 시 대기 화면 없이 곧장 '패배' 화면이 뜨던 문제 수정."),
        t("대기열 대기 중 '대기열 합류에 실패했어요' 오류가 뜨던 문제 수정."),
        t("동시에 친구 요청을 보내 자동 친구가 된 경우 먼저 보낸 쪽에도 알림 전송."),
        t("상대가 오래 생각 중인데 새로고침·화면 이동 후 복귀하면 기권 처리되던 문제 수정."),
        t("결과 팝업 '대국 리뷰 보기' 버튼이 무반응이던 문제 수정."),
        t("체크메이트로 끝난 대국에 상대가 결과 확인 없이 나가면 '대국 상대 찾기'가 종료된 대국으로 돌아가던 문제 서버에서 수정."),
        t("친구 검색창에 #MID 검색 안내 추가."),
        t("일부 화면 글꼴이 IBM Plex Sans KR이 아니던 문제 수정."),
      ] },
      { cat: "ui", items: [
        t("'대국 리뷰 보기' 버튼을 연두색과 흰색 별 아이콘으로 변경."),
        t("학습 탭 수 블록 리체스 대국 수 통계 카운트업 애니메이션. 채택률 소수 둘째 자리 표시."),
      ] },
    ],
  },
  {
    version: "0.4.4", date: "2026.9.2",
    summary: t("퍼즐 만들기 핵심 버그 수정 · 언더프로모션 · MID 친구 초대 링크 · 프로필 페이지."),
    highlight: { kind: "icon", Icon: Wrench, color: T.brassHi, label: t("퍼즐 만들기 핵심 버그 · 언더프로모션 · MID 친구 초대 링크 · 프로필 페이지") },
    sections: [
      { cat: "feature", items: [
        t("집중 분석에서 실수·부정확한 수·탁월한 수의 '퍼즐 만들기' 클릭 시 퍼즐 카드로 바로 진입."),
        t("계정 센터 MID(회원 번호) 형식 고정. 영문 5자리 + 숫자 4자리(예: ABCDE1234)."),
        t("유저 검색창에서 '#MID'로 검색."),
        t("계정 센터에 친구 초대 링크 추가."),
        t("다른 유저 프로필을 고유 주소(openchess.kr/user/회원번호) 페이지로 표시."),
        t("/play 대국 종료 시 결과 팝업. 결과·사유, 상대 정보, 코치 한마디, 대국 리뷰 버튼."),
      ] },
      { cat: "ui", items: [
        t("퍼즐 카드 배지(오프닝·PGN·국면·FEN) 그룹화. 6자리 번호 왼쪽, 레이팅 오른쪽. 공유 버튼 우하단."),
        t("프로필 페이지 데스크톱 2단 배치. 접속 중인 사용자는 사진 테두리에 파동 표시."),
        t("/play 매칭 대기 화면을 전체 화면 전용 화면으로 변경."),
        t("/play 친구 목록을 드롭다운 대신 상시 표시."),
      ] },
      { cat: "fix", items: [
        t("새 포지션인데 '이미 존재하는 퍼즐'로 거부되던 퍼즐 만들기 핵심 문제 수정."),
        t("퍼즐 풀이 중 폰이 마지막 줄에 닿으면 승격 기물(퀸·룩·비숍·나이트) 선택 가능."),
        t("채팅 '/play 3' 명령이 무반응이던 문제 수정. 시간을 잘못 입력하면 안내 표시."),
        t("실시간 대국 중 새로고침·화면 이동 후 /play 복귀 시 대국 이어하기."),
        t("실시간 대국에서 수가 서버에 반영되지 않고 화면만 어긋나던 문제 수정."),
        t("방금 만든 퍼즐의 생성자 표시가 비던 문제 수정."),
        t("미완료 실시간 대국이 남아 /play 진입 시 매칭 화면에 못 들어가던 문제 수정."),
      ] },
    ],
  },
  {
    version: "0.4.3", date: "2026.8.31",
    summary: t("Apple·Facebook 로그인 · 계정 센터 · /play 재설계."),
    highlight: { kind: "icon", Icon: Shield, color: T.brassHi, label: t("Apple/Facebook 로그인 · 계정 센터(MID) · /play 재설계") },
    sections: [
      { cat: "feature", items: [
        t("Apple·Facebook 로그인."),
        t("계정 센터. 로그인 수단(이메일·Google·Apple·Facebook) 연결·해제, 로그아웃, 계정 탈퇴. 헤더 프로필 메뉴와 설정 탭에서 진입."),
        t("/play 설정 화면 재설계. 불렛·블리츠·래피드·스탠다드 타임 컨트롤을 한 화면에 배치."),
        t("친구와 플레이하기를 드롭다운 대신 카드 확장 목록으로 변경."),
        t("친구에게 대국 신청 시 사이트 어디서든 상단 알림 배너 표시, 채팅에도 카드로 기록."),
        t("실시간 대국 매칭 대기 화면에 레이더 애니메이션·경과 시간 표시."),
        t("/faq 페이지 추가. 설정 탭 '문의 / FAQ' 카드에서 진입."),
      ] },
      { cat: "ux", items: [
        t("30분 미활동 자동 로그아웃 폐지. 같은 기기에서 로그인 유지."),
        t("채팅 명령어 미리보기를 정확히 '/help' 입력 시에만 표시."),
      ] },
      { cat: "ui", items: [
        t("퍼즐 카드 높이 고정."),
      ] },
      { cat: "fix", items: [
        t("친구 초대 수락 시 실제 상대 대신 로컬 봇과 대국하던 문제 수정."),
        t("방치된 실시간 대국 때문에 랜덤 매칭이 응답 없는 상대에 연결되던 문제 수정."),
        t("학습 탭 이미지 스캔 소스 선택 메뉴 무반응 수정."),
        t("'내 파일에서 선택'이 Google Photo로 연결되던 문제 수정."),
        t("기물 희생하기 테마 퍼즐이 저장되지 않던 문제 수정. 선택한 수 직전 수는 컴퓨터가 자동 진행."),
        t("실시간 대국 적용·재대국 시 화면이 멈추던 문제 수정."),
      ] },
    ],
  },
  {
    version: "0.4.2", date: "2026.8.30",
    summary: t("/play 실시간 대국 · 접속 표시."),
    highlight: { kind: "icon", Icon: Users, color: T.brassHi, label: t("/play 실시간 대국(랜덤 매칭·친구 초대) · 실시간 접속 표시") },
    sections: [
      { cat: "feature", items: [
        t("/play 실시간 대국. 랜덤 매칭 또는 친구 목록에서 선택."),
        t("봇·실시간 대국 모두 타임 컨트롤(불릿·블리츠·래피드·클래식·무제한)을 상단에서 선택."),
        t("친구·프로필 카드에 실시간 접속 여부(초록 점)와 최근 접속 시간 표시. chess.com 최근 접속 시간 포함."),
        t("프로필 카드에서 chess.com 통계 선택 시 사진·아이디·소개·국적·시간 규정별 레이팅을 chess.com 기준으로 표시."),
        t("퍼즐 공개·비공개 설정. 생성 후에도 풀이 화면에서 변경 가능."),
        t("퍼즐 시작 포지션(오프닝·미들게임·엔드게임) 배지, 정렬·필터 기준으로 사용."),
        t("/about 첫 화면에 스크롤 반응형 타이포그래피 문구 추가."),
      ] },
      { cat: "ui", items: [
        t("퍼즐 카드·풀이 화면 좋아요·리포스트·공유 버튼 왼쪽 정렬, 순서 통일."),
        t("학습 탭 PLAY 버튼 디자인 통일."),
        t("프로필 카드의 칭호 표시 삭제. 획득 축하 팝업은 유지."),
      ] },
      { cat: "fix", items: [
        t("이미지 스캔이 항상 실패하던 문제 수정."),
        t("이미지 스캔 '내 파일에서 선택'이 Google Photo로 연결되던 문제 수정."),
        t("모바일에서 말풍선·드롭다운이 화면 가장자리에서 잘리던 문제 수정."),
        t("퍼즐 만들기 마법사에서 기물 희생하기 테마 선택 시 3단계 미리보기가 그 수 직전 위치를 표시."),
      ] },
    ],
  },
  {
    version: "0.4.1", date: "2026.8.28",
    summary: t("About 페이지 리디자인 · 버전 표시 버그 수정 · FEN 퍼즐·리뷰 · 퍼즐 레이팅 · 퍼즐 탭 개편."),
    highlight: { kind: "icon", Icon: Sparkles, color: T.brassHi, label: t("/about 페이지 리디자인 · 버전 표시 버그 수정 · FEN 퍼즐·리뷰 동등화 · 퍼즐 레이팅 · 퍼즐 탭 개편") },
    sections: [
      { cat: "feature", items: [
        t("게임 리뷰·분석 탭에서 FEN(임의 포지션) 시작 시에도 최선·탁월·유일한 수 판정을 대국과 동일하게 적용."),
        t("모든 퍼즐에 시작 포지션 FEN 코드 추가."),
        t("공개 퍼즐 레이팅 추가. 라인을 끝까지 풀면 상승, 오답 시 하락. 프로필 카드에 표시."),
        t("퍼즐 탭 개편. 추천/미해결/해결 완료 3분할과 오프닝별 가로 스크롤 삭제, 난이도 적합순 목록 도입."),
        t("퍼즐 만들기를 분석 탭 보드 편집기에서 퍼즐 탭으로 이동. '퍼즐 풀기/퍼즐 만들기' 선택 박스 추가."),
        t("퍼즐 만들기에서 선택한 chess.com 대국을 '선택됨'으로 표시."),
        t("유산 만들기 화면을 퍼즐 만들기 마법사와 같은 레이아웃으로 통일."),
        t("퍼즐 생성자가 풀이 화면 2페이지(모식도)에서 자신의 퍼즐 삭제. 삭제 전 확인."),
        t("이미지 스캔이 PGN 기보·FEN 코드 사진(책, 스크린샷, 메모)도 인식."),
        t("집중 분석에서 탁월한 수(희생) 시 금색 화살표 삭제, 희생된 기물이 공격받는 빨간 화살표 표시."),
        t("PLAY 버튼. 학습 탭 보드 아래, 뒤집기·초기화·뒤로·앞으로 버튼과 같은 줄에서 현재 보드로 대국 시작."),
        t("PLAY 페이지 상단 로고, 보드 아래 내 정보 줄에 프로필 사진·아이디 표시."),
      ] },
      { cat: "ui", items: [
        t("/about 첫 화면(히어로) 리디자인. '기능 둘러보기' 버튼 추가."),
        t("퍼즐 카드 세로 확대, 미리보기 보드를 카드 폭에 맞는 정사각형으로 확대."),
        t("퍼즐 탭 정렬 UI 정리. 검색창 옆 깔때기 아이콘으로 정렬 기준(추천순·최신순·레이팅순) 선택."),
        t("PGN·FEN 퍼즐은 레이팅 배지 왼쪽에 강조 표시."),
        t("퍼즐 레이팅 아이콘을 하단 탭 퍼즐 아이콘과 통일."),
        t("'번호로 풀기'·오프닝/생성자 검색창·필터 버튼 높이 통일."),
        t("퍼즐 풀이 화면 제작자 표시에서 '제작 ·' 삭제, 아이디만 표시."),
        t("학습 탭 수 블록 키워드를 한 줄로 표시, 넘치면 천천히 스크롤."),
      ] },
      { cat: "fix", items: [
        t("화면 구석과 /about에 표시되는 버전 번호가 실제 배포 버전보다 뒤처지던 문제 수정."),
        t("퍼즐 탭에서 퍼즐 클릭 시 화면이 멈추던 문제 수정."),
        t("FEN 기반 퍼즐 클릭 시 화면이 멈추던 문제 수정."),
        t("정렬·필터 드롭다운과 말풍선이 화면 가장자리에서 잘리거나 잔상이 남던 문제 수정."),
        t("퍼즐 카드 레이팅 말풍선이 잘못된 위치에 잠깐 표시되던 문제 수정."),
        t("퍼즐 만들기 1단계에서 인식되지 않는 입력에 '잘못된 기보 형식입니다.' 표시."),
        t("게임 리뷰 희생 경고 화살표에서 폰의 포획 방향이 반대로 표시되던 문제 수정."),
        t("집중 분석 수 설명에서 수 번호 없는 SAN이 링크로 잡히던 문제 수정."),
        t("PLAY 페이지 봇이 '생각하는 중...'에서 멈추던 문제 수정."),
        t("레이팅 2800 봇이 나쁜 수를 자주 두던 문제 수정. 레이팅이 높을수록 최선의 수에 가깝게 진행."),
        t("퍼즐 삭제가 서버에서도 실제로 반영되도록 수정. 타인 퍼즐을 삭제할 수 있던 권한 오류 차단."),
        t("집중 분석에서 다른 수로 이동 후 '←'를 누르면 홈 대신 직전 집중 분석으로 복귀."),
      ] },
    ],
  },
  {
    version: "0.4.0", date: "2026.8.28",
    summary: t("탭 이름 변경 · 메인 퀘스트 레슨 시스템 개편."),
    highlight: { kind: "icon", Icon: Compass, color: T.brassHi, label: t("메인 퀘스트 전면 개편 · 레슨 시스템") },
    sections: [
      { cat: "feature", items: [
        t("탭 이름 변경. 기존 '학습'은 '분석', 기존 '퀘스트'는 '학습'."),
        t("메인 퀘스트를 챕터 목록에서 갈래가 있는 나무형 로드맵의 순차 해금 '레슨' 시스템으로 개편."),
        t("퍼즐 탭 오프닝 검색과 생성자 검색을 하나의 검색창으로 통합, 정렬 옵션 추가."),
        t("수 설명에서 언급된 수를 누르면 해당 수까지 이동."),
        t("퍼즐 카드·오늘의 퍼즐 팝업 기보의 수를 누르면 집중 분석 진입."),
        t("검색·친구·채팅·프로필 창 등을 브라우저 뒤로가기로 닫기."),
      ] },
      { cat: "fix", items: [
        t("수 등급 판정을 여러 화면에서 하나로 통일. 탁월한 수 판정 규칙 일부 보완."),
        t("퍼즐 탭 일일 퍼즐 클릭 시 버벅임·멈춤 수정."),
      ] },
      { cat: "ui", items: [
        t("퍼즐 카드·일일 퍼즐 팝업 기보 밑줄 삭제. 분석 탭 아이콘 교체."),
      ] },
    ],
  },
  {
    version: "0.3.9", date: "2026.8.21",
    summary: t("데스크톱 리뷰 레이아웃 개편."),
    highlight: { kind: "icon", Icon: Rocket, color: T.brassHi, label: t("데스크톱 리뷰 레이아웃 개편") },
    sections: [
      { cat: "feature", items: [
        t("게임 리뷰를 데스크톱 전체 화면 전용 레이아웃으로 변경. 체스보드 확대."),
        t("리뷰 정확도 그래프 개편. 계산 중 안내, 확정 토스트, 구간별 등급 표시."),
        t("체스판 기물 드래그 조작 개선. 방향·속도로 목적지 칸 판단."),
        t("Stockfish 18(정식) 분석 엔진 추가, 목록 최상단 배치."),
      ] },
      { cat: "fix", items: [
        t("오프닝 이름 수정 시 해당 오프닝 퍼즐 이름에 즉시 반영."),
        t("도감 오프닝 트리에 이론 수 추가 시 즉시 반영."),
        t("게임 리뷰를 같은 수순으로 다시 열어도 진입 애니메이션 재생."),
        t("체스판 사진 스캔 복구."),
        t("일일 퀘스트 chess.com 링크가 앱을 열지 못하던 문제 수정."),
      ] },
      { cat: "ui", items: [
        t("사이트 전체 글꼴을 IBM Plex Sans KR로 통일. 로그인 상태에서 설정 탭 프로필 미리보기 표시."),
      ] },
    ],
  },
  {
    version: "0.3.8", date: "2026.8.19",
    summary: t("리뷰 진입 애니메이션 · 정확도 체계 개편."),
    highlight: { kind: "icon", Icon: Zap, color: T.brassHi, label: t("리뷰 진입 애니메이션 · 정확도 체계 전면 개편") },
    sections: [
      { cat: "feature", items: [
        t("게임 리뷰 진입 화면 개편. 일러스트가 순차 등장하고 수마다 등급 아이콘 표시."),
        t("리뷰 정확도 계산 방식 재설계. 대국이 길수록 수 하나가 정확도에 미치는 영향 완화. /about에 수식·그래프 소개 섹션 추가."),
        t("리뷰 화면 새로고침 시 보던 수에서 이어보기."),
        t("프로필 소개글. 프로필 카드와 유저 검색 결과에 표시."),
        t("설정 탭 '리뷰 설정' 카드. 리뷰 속도 '더 빠르게'(depth=20) / '더 정확하게' 선택."),
        t("설정 탭 '퍼즐 설정' 카드. LINE CLEAR·PUZZLE CLEAR 애니메이션, 퍼즐 풀이 중 코치 표시 설정."),
        t("프로필 카드 상단 OpenChess/chess.com 아이콘으로 통계 전환. 내 프로필 카드는 헤더의 내 아이디에서 진입."),
        t("LINE CLEAR 배너를 PUZZLE CLEAR와 같은 디자인으로 통일."),
      ] },
      { cat: "perf", items: [
        t("게임 리뷰 포지션당 분석 시간 확대. 복잡한 포지션 정확도 개선."),
        t("체스판 사진 이미지 스캔 인식률 개선."),
      ] },
      { cat: "ui", items: [
        t("라인/퍼즐 클리어 배너 전용 폰트, 화면 중앙 표시. PUZZLE CLEAR 글자 튕김 연출."),
        t("모바일 리뷰 엔진 라인 글자 확대·왼쪽 정렬. 단계별 정확도 말풍선 잘림 수정."),
        t("모바일에서 백·흑 정확도 그래프를 각각 별도 줄에 확대 표시."),
        t("평가치 그래프 0.0 점선 강조."),
        t("설정 탭 내 프로필 카드 상단 라벨을 내 아이디로 표시."),
      ] },
      { cat: "ux", items: [
        t("리뷰 요약 화면의 '기다리지 않고 바로 리뷰 시작' 버튼 삭제."),
        t("정확도 증감 숫자에 % 표시, 백·흑 정확도 박스 우하단에도 표시."),
      ] },
      { cat: "fix", items: [
        t("리뷰 페이지를 닫았다가 다시 열면 화면이 멈추던 문제 수정."),
        t("리뷰 진입 화면 그래프가 특정 대국에서 멈췄다가 한꺼번에 그려지던 문제 수정."),
        t("평가치 그래프 마커를 빠르게 끌면 엔진 라인이 멈추던 문제 수정."),
        t("정확도가 실제보다 높고 백·흑 차이가 작게 나오던 문제 수정."),
        t("체크메이트 대국 리뷰에서 마지막 수 아이콘이 '분석 중'에서 멈추던 문제 수정."),
        t("같은 대국을 다시 열 때 정확도가 미세하게 달라지던 문제 수정."),
        t("일부 포지션 분석 실패로 정확도 계산에서 빠지던 문제 완화."),
        t("LINE CLEAR와 PUZZLE CLEAR 애니메이션이 겹치던 문제 수정."),
        t("무난한 수가 대부분인 대국에서 블런더 하나로 정확도가 과도하게 떨어지던 문제 수정."),
      ] },
    ],
  },
  {
    version: "0.3.7", date: "2026.8.18",
    summary: t("퍼즐 클릭 시 흰 화면 오류 수정."),
    highlight: { kind: "icon", Icon: Wrench, color: T.brassHi, label: t("퍼즐 클릭 시 흰 화면 오류 수정") },
    sections: [
      { cat: "fix", items: [
        t("퍼즐 탭에서 퍼즐 클릭 시 흰 화면이 뜨며 사이트가 멈추던 문제 수정."),
        t("헤더 로고 아래 버전 표기가 실제 배포 버전보다 뒤처지던 문제 수정."),
      ] },
    ],
  },
  {
    version: "0.3.6", date: "2026.8.18",
    summary: t("기보 클릭 이동 · 라인·퍼즐 클리어 애니메이션."),
    highlight: { kind: "icon", Icon: Sparkles, color: T.brassHi, label: t("기보 클릭 이동 · 라인·퍼즐 클리어 애니메이션") },
    sections: [
      { cat: "feature", items: [
        t("퍼즐 풀이 화면·일일 퍼즐 팝업·도감 오프닝 트리의 기보에서 수 클릭 시 해당 수순이 입력된 학습 탭으로 이동."),
        t("라인 클리어 시 LINE CLEAR 배너, 퍼즐 전체 클리어 시 별 3개와 PUZZLE CLEAR 연출."),
        t("퍼즐 탭 오프닝·생성자 필터. 태그 다중 선택."),
        t("유산(Legacy) 블록 좋아요."),
        t("이론 수 이름 변경 시 그 이름을 접두사로 쓰는 하위 오프닝 이름도 자동 변경."),
      ] },
      { cat: "ui", items: [
        t("학습 탭 펜/리뷰 버튼을 복사·붙여넣기 버튼과 크기·간격 통일."),
        t("채팅 공유 퍼즐 블록을 퍼즐 탭과 같은 카드 UI로 변경."),
        t("프로필 카드 chess.com 레이팅 표기 정리, 레이팅 변동 그래프에 '1일' 옵션 추가."),
        t("모바일 리뷰 화면 코치 말풍선 축소, 평가치 그래프 추가."),
        t("좌상단 OpenChess 로고 클릭 시 openchess.kr 이동."),
      ] },
      { cat: "ux", items: [
        t("퀘스트 탭에서 일일 퀘스트를 메인 퀘스트 위에 표시."),
        t("학습 탭에서 수가 1~2개뿐인 포지션은 엔진 라인·평가치 바 미표시."),
        t("보드 편집기 이미지 스캔에서 기존 사진(갤러리) 선택 지원."),
      ] },
      { cat: "perf", items: [
        t("집중 학습 오프닝 실수 분석 속도 개선."),
      ] },
      { cat: "security", items: [
        t("유산 좋아요를 타인 명의로 등록·취소할 수 있던 권한 우회 차단."),
      ] },
    ],
  },
  {
    version: "0.3.5", date: "2026.8.16",
    summary: t("보드 편집기 · FEN 리뷰 자유 탐색."),
    highlight: { kind: "icon", Icon: Pencil, color: T.brassHi, label: t("보드 편집기 · FEN 리뷰 자유 탐색") },
    sections: [
      { cat: "feature", items: [
        t("학습 탭 체스보드 편집기(펜 아이콘). 팔레트에서 기물을 골라 배치·드래그."),
        t("보드 편집기 이미지 스캔. 체스판 사진 업로드(모바일은 카메라 촬영) 후 포지션 인식."),
        t("FEN 포지션 리뷰에서도 보드를 직접 조작해 가상의 수를 자유롭게 탐색."),
        t("학습 탭 FEN 모드에서도 평가치 바·엔진 상위 줄 표시."),
        t("게임 리뷰가 설정 탭 '분석 엔진'에서 고른 엔진(Stockfish 18 Lite / 17.1) 사용."),
        t("리뷰 티켓 제도 폐지. 게임 리뷰 횟수 제한 없음."),
      ] },
      { cat: "ui", items: [
        t("설정 탭에 흩어진 개발자 전용 도구를 한 곳으로 정리."),
        t("(개발자 전용) 퍼즐 모식도 라인 수 추가 시 평가치 순 후보 수 선택."),
        t("퍼즐 풀이 화면 '다음 라인 풀기' 버튼 삭제."),
        t("채팅 목록에서 알림을 끈 상대에 알림 해제 아이콘 표시."),
        t("학습 탭 FEN 모드 스테일메이트·3회 동형 반복 무승부 판정 정상화."),
        t("학습 탭 보드 위 '분석' 버튼을 연두색 별 모양 리뷰 버튼으로 변경."),
        t("퍼즐 공유 링크를 openchess.kr/puzzle/(번호)-(라인)으로 변경."),
      ] },
      { cat: "fix", items: [
        t("채팅 공유 리뷰 카드의 openchess.kr/review/... 주소 직접 진입 오류 수정."),
        t("내 퍼즐 편집 저장 직후 재편집이 실패하던 문제 수정."),
        t("유산 재생에서 유산 수 등장 후 위아래로 흔들리던 문제 수정."),
      ] },
    ],
  },
  {
    version: "0.3.4", date: "2026.8.13",
    summary: t("게임 리뷰 공유 · 정확도 개선."),
    highlight: { kind: "icon", Icon: Share2, color: T.brassHi, label: t("게임 리뷰 공유 · 정확도 개선") },
    sections: [
      { cat: "feature", items: [
        t("게임 리뷰 공유 버튼(모바일·데스크톱). 카카오톡·인스타그램 등 외부 앱 공유."),
        t("채팅 /review 명령어. '/review -recent'는 가장 최근 chess.com 대국 리뷰."),
        t("채팅 대화 목록 꾹 누르기(데스크톱은 우클릭)로 고정/고정 해제."),
        t("퍼즐 라인 클리어 후 자동으로 다음 라인 진행."),
        t("신규 퍼즐 생성 기준 강화. 3점 이상 기물 이득이 몇 수 뒤까지 유지될 것."),
        t("코치 코멘트에 체크메이트 전용 설명 추가."),
        t("퍼즐 풀이 카드에 최초 제작자 표시."),
        t("게임 리뷰·퍼즐 풀이 창 고유 주소 공유."),
        t("퍼즐 공유 시트에서 카카오톡·인스타그램 직접 공유."),
        t("학습 탭 '수 설명' 개수 제한을 등급별로 차등 적용."),
      ] },
      { cat: "ui", items: [
        t("코치 코멘트의 유일한 수·탁월한 수 문장 끝에 기보 표기(!, !!) 추가."),
        t("유산 만들기·전체 보기·공유 창을 모바일 전체 화면으로 표시."),
        t("채팅 메시지 수정/삭제 메뉴 위치 변경."),
        t("채팅 공유 유산 카드를 프로필 카드와 같은 디자인으로 통일."),
        t("유산 재생 애니메이션에서 유산 수가 위에서 떨어지는 연출."),
        t("퍼즐 라인 버튼에서 푼 라인은 초록 체크, 진행 중인 라인은 금색 테두리."),
      ] },
      { cat: "perf", items: [
        t("게임 리뷰 depth 20 도달 안정성 개선. 시간 배분 방식 변경."),
      ] },
      { cat: "fix", items: [
        t("리뷰 수의 등급·평가치가 늦게 뜨던 문제 수정."),
        t("집중 학습에서 '탁월한 수'가 처음에 '좋은 수'로 표시되던 문제 수정."),
        t("채팅 메시지 수정/삭제 실패 시 안내 없이 원복되던 문제 수정."),
        t("유산 재생에서 타이핑 전환 시 위치가 어긋나던 문제 수정."),
        t("일일 퀘스트 chess.com 링크가 모바일에서 웹사이트로만 열리던 문제 수정."),
        t("리뷰한 대국이 '리뷰한 대국만' 필터에서 안 보이던 문제 수정."),
        t("퍼즐 오답 시 상대 응징 수가 표시되지 않던 문제 수정."),
        t("유산 수가 다 등장하기 전에 주변 수 무너짐 연출이 시작되던 문제 수정."),
        t("도감 오프닝 트리 수 설명 카드가 화면 밖으로 잘리던 문제 수정."),
      ] },
    ],
  },
  {
    version: "0.3.3", date: "2026.8.12",
    summary: t("프로필 유산(Legacy) 도입."),
    highlight: { kind: "icon", Icon: Gem, color: T.brassHi, label: t("프로필 유산(Legacy) 도입") },
    sections: [
      { cat: "feature", items: [
        t("프로필 '유산'. 자랑스러운 대국의 한 수를 암석판에 룬 문자처럼 새겨 전시."),
        t("퍼즐·라인별 난이도 레이팅(100~3000). 수순 길이·얽힌 기물 수 등 반영."),
        t("퍼즐 풀이 화면에 라인 번호 선택 버튼 추가."),
        t("퍼즐 모식도에서 미해결 라인도 끝까지 형태 확인."),
        t("기물 드래그 인식 개선. 빠르고 부정확한 이동도 인식."),
        t("티어 리더보드에 경험치가 없는 계정도 표시."),
        t("유산 재생. PGN 기보 타이핑 연출 후 체스보드 재생, 재생된 모든 수의 등급 아이콘 표시."),
        t("유산 시작 수 지정(지정 수 앞 1~7수 선택)."),
        t("유산 이력. 삭제되거나 덮어써진 유산 열람('더보기')."),
        t("유산 채팅 공유. 유산 블록에 공유(종이비행기) 아이콘."),
        t("학습 탭 FEN 붙여넣기 시 해당 포지션부터 이어두는 FEN 모드."),
        t("그랜드마스터 티어 도달 시 프로필 사진·티어 로고 십각형 테두리에 무지개 그라데이션."),
        t("일일 퀘스트 오프닝 문구에 백·흑 색 표시."),
      ] },
      { cat: "perf", items: [
        t("도감 오프닝 트리 모바일 버벅임 수정. 화면에 보이는 블록만 렌더링."),
        t("빠른 스크롤 시 블록 사전 렌더링 범위 확대."),
      ] },
      { cat: "ui", items: [
        t("퍼즐 모식도 기본 배율 조정, 평가치 숫자 대신 등급 이름 표시."),
        t("추천 퍼즐을 데스크톱에서도 한 줄 가로 스크롤로 표시."),
        t("친구 창 모바일 전체 화면."),
        t("채팅 대화 진입 시 상단에 뒤로가기·상대 프로필 사진·아이디만 표시."),
        t("유산 블록을 금색·갈색 라운딩 사각형으로 변경. 종류별 세로 3열, 같은 종류는 같은 줄."),
        t("퀘스트 클리어·칭호 획득·티어 승급 팝업 제목 글꼴 변경."),
        t("도감 탭 모식도 위 안내 문구 삭제, 도감 해금률 소수점 둘째 자리 표시."),
        t("퍼즐 탭 '일일 퍼즐' 글자 크기를 '추천 퍼즐'과 통일, 아이콘을 달력으로 변경."),
        t("유산 재생 화면 정리. 배경·안내 문구·등급 이름·서체를 기보 서체와 통일. 체스보드 칸 밝기 반짝임 연출."),
        t("프로필 '자주 두는 첫 수' 데스크톱 크기 수정."),
        t("유산 블록 편집(✎) 아이콘 좌하단, 공유 아이콘 우하단."),
      ] },
      { cat: "ux", items: [
        t("도감 오프닝 트리 빈 공간 진입 시 스크롤 속도 급증 완화."),
        t("유산 만들기에서 'chess.com 대국에서 선택' 시 추가 창 대신 아래에 최근 대국 표시."),
        t("도감 수 카드에서 오프닝 이름을 눌러 집중 학습 진입 후 닫으면 도감 탭으로 복귀."),
        t("체스보드에서 기물이 있는 칸 어디를 눌러도 드래그 시작."),
        t("채팅 메시지 수정/삭제 메뉴를 데스크톱 우클릭으로도 열기."),
      ] },
      { cat: "fix", items: [
        t("채팅 메시지 메뉴가 가려지거나 겹치던 문제 수정."),
        t("도감 오프닝 트리 수 카드가 하단 메뉴 위로 삐져나오던 문제 수정."),
        t("퍼즐 탭 기물 드래그 불량 수정."),
        t("개발자가 추가한 이론 수가 도감 모식도에 안 나타나던 문제 수정."),
        t("퍼즐 탭 티어 표시에서 그랜드마스터 별 개수가 티어 이름과 겹치던 문제 수정."),
        t("도감 오프닝 트리 첫 진입 시 중앙 회로 칩 위치 수정."),
        t("모바일에서 chess.com 링크가 항상 같은 화면에서 열리도록 수정."),
        t("알림 카드·수 아이콘 말풍선 모바일 잘림 수정."),
        t("유산 수 아이콘 금색 테두리 크기·정렬·겹침 문제 수정."),
        t("유산 수 뒤 더 재생할 수가 없으면 체스보드 확대가 풀리지 않던 문제 수정."),
        t("채팅 퍼즐 '전달' 실패 시 안내 문구 표시."),
      ] },
    ],
  },
  {
    version: "0.3.2", date: "2026.8.12",
    summary: t("도감 오프닝 트리 재설계."),
    highlight: { kind: "icon", Icon: Compass, color: T.brassHi, label: t("도감 오프닝 트리 완전히 새로 디자인") },
    sections: [
      { cat: "feature", items: [
        t("도감 오프닝 트리 재설계. 블록 겹침 제거, 모든 수에 오프닝 이름 표시."),
        t("오프닝 트리에서 수를 클릭하면 중심에서 해당 수까지 파란 선이 흐르는 연출."),
        t("일일 퍼즐로 선정된 적 있는 퍼즐에 선정 날짜 표시."),
      ] },
      { cat: "ui", items: [
        t("채팅·프로필·검색 창 모바일 전체 화면."),
        t("집중 학습 화면 평가치·등급 글자색을 진한 크림색으로 변경."),
        t("모바일 추천 퍼즐 점선 테두리 한 줄 가로 스크롤."),
        t("일일 퍼즐 캐러셀 크림색 디자인 통일."),
        t("말풍선(채팅 메시지 메뉴 포함) 화면 가장자리 잘림 수정."),
        t("오프닝 트리 드래그·스크롤 속도 상향."),
        t("퍼즐 카드 그리드 크기 통일."),
        t("헤더 친구·채팅·알림 배지가 가려지던 문제 수정."),
        t("스테일메이트·3회 동형 반복 무승부를 기보 끝 ½-½로 표시."),
      ] },
      { cat: "fix", items: [
        t("아군 폰이 지키는 칸으로 이동하는 수의 판정 오류 수정."),
        t("퍼즐 풀이 평가치 막대가 정답 후에도 계속 변하던 문제 수정."),
        t("채팅에서 @아이디로 연 프로필 창이 닫아도 다시 열리던 문제 수정."),
        t("친구 목록에서 채팅 시작 시 상대 프로필 사진이 안 뜨던 문제 수정."),
        t("오프닝 트리 드래그 중 화면이 튀던 문제 수정."),
        t("오프닝 트리 일부 수에서 이름이 안 보이거나 'Main Line'으로만 뜨던 문제 수정."),
        t("채팅 목록에서 읽은 대화의 안읽음 표시가 남던 문제 수정."),
      ] },
    ],
  },
  {
    version: "0.3.1", date: "2026.8.10",
    summary: t("퍼즐 생성·검색 속도 개선 · 마스터 통계 검색."),
    highlight: { kind: "icon", Icon: Zap, color: T.brassHi, label: t("퍼즐 생성·검색 속도 대폭 개선") },
    sections: [
      { cat: "feature", items: [
        t("마스터 통계 선수 이름 검색. 자동완성 지원."),
        t("chess.com 통계에서 리뷰한 대국만 모아 보는 체크박스."),
        t("퍼즐 번호·날짜 검색 시 열어보지 않은 퍼즐도 추천에 표시."),
      ] },
      { cat: "perf", items: [
        t("마스터 대국을 얕은 오프닝일수록 다양하게, 깊을수록 적게 표시하도록 데이터 정리."),
        t("일일 퍼즐 캐러셀 로딩 속도 개선."),
        t("퍼즐 생성·검색 속도 개선."),
      ] },
      { cat: "ui", items: [
        t("'이 수가 두어진 마스터 대국'을 '마스터 통계'로 이름 변경."),
        t("일일 퍼즐 캐러셀 카드 간격 고정. 일일 퍼즐 알림 팝업 확대."),
        t("집중 학습 화면 평가치·등급을 크림색으로 수 이름 옆에 표시."),
      ] },
      { cat: "fix", items: [
        t("집중 학습 '마스터 대국' 목록이 포지션과 무관하게 5판만 표시되던 문제 수정."),
        t("마스터 통계 정렬·페이지 버튼 무반응 수정."),
        t("퍼즐 풀이 모식도 블록 겹침 수정."),
      ] },
    ],
  },
  {
    version: "0.3.0", date: "2026.8.9",
    summary: t("마스터 대국 데이터 확대 · 터치 드래그 · 수비자 제거 전술."),
    highlight: { kind: "icon", Icon: Crown, color: T.brassHi, label: t("마스터 대국 데이터 대거 추가") },
    sections: [
      { cat: "feature", items: [
        t("오프닝 실제 유명 변형 233개 추가(루이 로페즈 마셜, 시칠리안 나이도르프 6.Bg5 등)."),
        t("집중 학습 '마스터 대국' 목록에 GM 대국 수천 판 추가."),
        t("모바일 터치로 기물 드래그 이동."),
        t("코치 '수비자 제거' 전술 코멘트 추가."),
        t("엔진 분석 중 순위 변동 시 수 블록이 끊기지 않고 부드럽게 이동."),
      ] },
      { cat: "fix", items: [
        t("퍼즐에서 상대의 최선 수 대신 다른 수가 남던 문제 수정."),
        t("퍼즐이 체크메이트까지 정확히 끝나도록 종료 조건 보완."),
      ] },
      { cat: "perf", items: [
        t("퍼즐 생성 속도 개선."),
        t("게임 리뷰가 전체 분석 완료를 기다리지 않고 수별 채점 결과를 즉시 표시."),
      ] },
      { cat: "ui", items: [
        t("학습 탭 '수 설명'을 해설 박스 안에 통합. 세로 자동 전환."),
        t("OC 나이트 코인·리뷰 티켓 아이콘 확대."),
        t("본문 글자색을 갈색 톤으로 변경, 굵기 상향."),
      ] },
    ],
  },
  {
    version: "0.2.9", date: "2026.8.4",
    summary: t("일일 퀘스트 클리어 팝업 · 리뷰 실시간 평가치."),
    highlight: { kind: "icon", Icon: Target, color: T.brassHi, label: t("일일 퀘스트 클리어 팝업") },
    sections: [
      { cat: "feature", items: [
        t("게임 리뷰 평가치 막대가 실시간 엔진 1순위 평가를 따라 이동."),
        t("일일 퀘스트 5개 모두 클리어 시 팝업 표시. 퀘스트 1개 클리어 시에도 상단 팝업."),
        t("티어 승급·새 칭호 획득을 카드형 팝업으로 변경. 시간 경과·배경 클릭 시 닫힘."),
        t("사이트 기본 폰트를 IBM Plex Sans KR로 변경."),
        t("리뷰 티켓 소모 규칙. 대국을 리뷰로 열 때마다 1개 사용, 한 번 연 대국은 재열람 무료."),
        t("개발자 전용 설정 화면 통합. OC 코인·리뷰 티켓·경험치 직접 조정."),
        t("리뷰 티켓 아이콘 이미지 교체. 리뷰 로딩 화면 삽화 3장 순차 표시."),
        t("학습 탭 '수 설명'을 로그인한 사용자 누구나 작성 가능."),
      ] },
      { cat: "perf", items: [
        t("학습 탭 엔진 분석 심화. 첫 화면 확정(0.7초) 후 5초 심화 탐색."),
        t("게임 리뷰 화면에도 현재 포지션 엔진 라인·평가치 표시."),
      ] },
    ],
  },
  {
    version: "0.2.8", date: "2026.8.2",
    summary: t("MILKU·KOKOA 코멘트 강화(MEC)."),
    highlight: { kind: "icon", Icon: Sparkles, color: T.brassHi, label: t("MILKU·KOKOA 코멘트 강화") },
    sections: [
      { cat: "feature", items: [
        t("MILKU·KOKOA가 정석 수를 제외한 거의 모든 수에 구체적 이유(MEC) 코멘트. 위협·위협 대처·과보호·예방 수·연결·중첩·교환·재전개 등."),
        t("퍼즐 풀이 코치 말풍선에 걸린 기물을 짚는 실질적 힌트 표시."),
        t("애니메이션이 있는 설명(위협·위협 대처·과보호·예방 수·연결·중첩)에 밑줄 표시. 클릭 시 해당 칸 강조."),
        t("기물이 걸렸을 때 정확한 칸 좌표 표시. 예방 수 설명에 상대가 노리던 칸 좌표 표시."),
        t("체크메이트 강제 수순에서 메이트까지 남은 수 안내."),
        t("상대 기물을 되잡는 단순 수는 '유일한 수'로 표시하지 않음."),
        t("탁월한 수 설명 상세화. 희생 기물, 걸린 기물 구분."),
        t("게임 리뷰 자유 탐색 중 실제 기보의 수를 두면 재분석 없이 원래 결과 표시."),
        t("일일 퍼즐 캐러셀을 사용자 스케치대로 재설계. 카드 정사각형, 체스보드 약 3배 확대."),
        t("모바일 게임 리뷰 기보 줄 스와이프 이동."),
        t("퍼즐 풀이 화면 코치 말풍선 표시/숨김 버튼."),
        t("일일 퀘스트 알림 창 왼쪽 달력에 오늘의 퍼즐 포지션 표시."),
      ] },
      { cat: "perf", items: [
        t("일일 퍼즐 캐러셀 미리보기 보드 로딩 시간 단축."),
        t("엔진 추천 수 줄 타이핑 애니메이션 삭제. 계산된 수순 즉시 표시."),
        t("엔진 해시 테이블 확대. 짧은 시간에도 더 깊이 탐색."),
        t("학습 탭 엔진 계산 개선. 라인·평가치·아이콘 우선 표시 후 5초 심화."),
        t("'n수 후까지 탐색 중' depth 표시 오차 수정."),
      ] },
      { cat: "fix", items: [
        t("엔진 추천 수 줄이 2개만 표시되고 늘어나지 않던 문제, 끝까지 표시되지 않던 문제, 특정 수순(앙파상 포함)에서 끊기던 문제 수정."),
        t("엔진 추천 수 줄 스와이프 무반응 수정."),
        t("퍼즐 풀이 평가치 막대가 0.00에서 멈추던 문제 수정."),
        t("일일 퍼즐 캐러셀 카드 모양이 스크롤 중 바뀌던 문제, 마우스 클릭 무반응 수정."),
        t("이기고 있는데 교환을 피하라고 안내하던 문제 수정."),
        t("MILKU·KOKOA 코멘트의 조사(을/를, 이/가) 오류 수정."),
        t("'전체' 레이팅 그래프에서 대국이 적은 시간 규정이 수직선으로 표시되던 문제 수정."),
        t("퍼즐 창 X 버튼 클릭 시 사이트 전체가 멈추던 문제 수정."),
        t("게임 리뷰 기보 줄 드래그 스크롤이 뻑뻑하던 문제 수정."),
        t("상대 기물을 잡는 수에 '재전개' 설명이 붙던 문제 수정."),
      ] },
    ],
  },
  {
    version: "0.2.7", date: "2026.7.29",
    summary: t("일일 퍼즐 캐러셀 UI."),
    highlight: { kind: "icon", Icon: Puzzle, color: T.brassHi, label: t("일일 퍼즐 캐러셀 UI") },
    sections: [
      { cat: "ui", items: [
        t("일일 퍼즐 화면을 좌우 스크롤 캐러셀로 재설계. 날짜 선택."),
        t("일일 퍼즐 알림 창을 달력 다이어리 형태로 변경."),
      ] },
      { cat: "feature", items: [
        t("캐러셀 선택 날짜 퍼즐 아래에 해결 인원수 표시."),
        t("일일 퍼즐 이름을 다른 퍼즐과 같은 방식으로 표시(예: 'Italian Game, 4.Ng5')."),
        t("일일 퍼즐에도 고유 번호 부여. 채팅 공유·'번호로 풀기' 지원."),
      ] },
      { cat: "fix", items: [
        t("엔진 준비 전에 실제로 출제되지 않은 일일 퍼즐이 표시되던 문제 수정."),
        t("채팅 '/puzzle 000000'으로 없는 번호를 보내면 전송 자체를 차단."),
        t("퍼즐 모식도에서 해결한 라인의 마지막 수가 '라인 N' 표시에 가려지던 문제 수정."),
        t("퍼즐 창 진입 시 평가치 막대가 즉시 동작."),
        t("일일 퍼즐 캐러셀 카드 클릭 무반응 수정."),
        t("퍼즐 힌트 단계별 표시 겹침 수정. 1단계는 도착 칸, 2단계는 기물."),
        t("리뷰 화면에서 수를 빠르게 넘길 때 엔진 추천 수 줄이 중간에 끊기던 문제 수정."),
      ] },
    ],
  },
  {
    version: "0.2.6", date: "2026.7.28",
    summary: t("게임 리뷰 페이지 복구 · 탁월한 수 판정 보완 · chess.com 통계 개선."),
    highlight: { kind: "icon", Icon: Wrench, color: T.brassHi, label: t("게임 리뷰 페이지 복구") },
    sections: [
      { cat: "fix", items: [
        t("게임 리뷰(/review) 진입 시 흰 화면만 뜨던 문제 수정."),
        t("'탁월한 수' 판정 보완. 안전한 대안이 있는 희생 제외."),
        t("집중 학습 미니보드에서 캐슬링 재생 시 룩이 움직이지 않던 문제 수정."),
        t("엔진 추천 수 줄이 타이핑 중 멈추던 문제, 빠른 이동 시 줄이 어긋나던 문제 수정."),
        t("모바일에서 수 아이콘 설명·채팅 롱프레스 메뉴·알림 카드가 화면 가장자리에서 잘리던 문제 수정."),
        t("'가장 많이 둔 오프닝'의 '백 n수'/'흑 n수' 표시 불일치 수정."),
        t("chess.com 통계가 많은 계정에서 특정 시간 규정 대국이 누락되던 문제, 특정 시간 규정 그래프가 안 그려지던 문제 수정."),
      ] },
      { cat: "ux", items: [
        t("도감·기보·엔진 추천 수 줄의 드래그 스크롤 반응성 개선."),
      ] },
      { cat: "ui", items: [
        t("'자주 두는 수'·집중 학습 수 표시에 새 서체 적용."),
        t("'백 n수'/'흑 n수' 배지를 오프닝 이름 위 별도 줄에 금색으로 표시."),
        t("레이팅 변동 그래프 '전체' 모드 색칠 투명도 조정, 범례 글자 축소."),
        t("퍼즐 탭 해결 완료 목록을 오프닝별 한 줄 가로 스크롤로 표시."),
        t("퍼즐 힌트 애니메이션 개선."),
      ] },
      { cat: "feature", items: [
        t("가장 많이 둔 오프닝을 이름으로 표시, 아래에 흑 레퍼토리 오프닝 표시."),
        t("퍼즐 화면 개편. 해결한 퍼즐도 오프닝별 그룹화, 좋아요·리포스트 표시."),
        t("채팅 연속 메시지 묶음 첫 줄에 프로필 사진 표시, 클릭 시 프로필 이동."),
        t("chess.com 통계를 시간 규정뿐 아니라 흑/백으로 구분."),
        t("'자주 두는 첫 수'를 백/흑 두 박스로 표시."),
        t("레이팅 변동 그래프 축·눈금선 추가, 아래 영역 채움. 그래프를 끌면 해당 지점 정보 표시."),
        t("집중 학습 '이 수가 두어진 내 대국' 목록에 시간 규정·진영 선택 추가."),
        t("chess.com 통계를 로그인 시에만 새로 불러오고 이후 캐시 사용."),
      ] },
    ],
  },
  {
    version: "0.2.5", date: "2026.7.24",
    summary: t("엔진 라인·기보 마우스 드래그 스크롤."),
    highlight: { kind: "icon", Icon: MousePointer, color: T.brassHi, label: t("엔진 라인·기보 마우스 드래그 스크롤") },
    sections: [
      { cat: "fix", items: [
        t("엔진 추천 수 줄과 학습 탭 기보 줄이 길 때 마우스 드래그 스크롤이 안 되던 문제 수정."),
        t("엔진이 깊이 계산해 줄이 길어질 때 화면은 그대로이고 뒷부분만 늘어나던 문제 수정."),
        t("줄을 끌다가 손을 떼면 수가 실행되던 문제 수정."),
      ] },
      { cat: "ui", items: [
        t("엔진 추천 수 줄 뒷부분이 남아 있으면 오른쪽 끝에 그림자 표시."),
        t("티어 여정 지도 배경 이미지를 고화질로 교체."),
      ] },
    ],
  },
  {
    version: "0.2.4", date: "2026.7.24",
    summary: t("리체스 퍼즐 DB 기반 일일 퍼즐 · 리뷰·학습 엔진 분리."),
    highlight: { kind: "icon", Icon: Puzzle, color: T.brassHi, label: t("리체스 퍼즐 DB 기반 오늘의 퍼즐") },
    sections: [
      { cat: "feature", items: [
        t("게임 리뷰 전용 엔진 고정. 학습 탭과 엔진 분리."),
        t("집중 학습 수 체계 아이콘 판정 깊이 확대(최대 5초)."),
        t("일일 퍼즐을 리체스 퍼즐 데이터베이스 기반으로 재구성. 2주마다 테마 교체."),
      ] },
      { cat: "perf", items: [
        t("게임 리뷰 진입 속도 개선. 앱 실행 중 사전 준비."),
        t("긴 기보를 빠르게 넘길 때 이전 위치 계산이 밀리던 문제 수정."),
      ] },
      { cat: "fix", items: [
        t("게임 리뷰에서 최선의 수를 두어도 평가치가 흔들리던 문제 수정."),
        t("엔진 추천 수가 타이핑 중 멈추던 문제 수정."),
      ] },
      { cat: "ui", items: [
        t("학습 탭 다음 수 블록이 평가치 순위 변동 시 부드럽게 이동."),
      ] },
    ],
  },
  {
    version: "0.2.3", date: "2026.7.24",
    summary: t("탁월한 수 판정 보완 · 긴 대국 속도 유지."),
    highlight: { kind: "icon", Icon: Zap, color: T.brassHi, label: t("긴 대국에서도 항상 일정한 속도") },
    sections: [
      { cat: "fix", items: [
        t("'탁월한 수' 판정을 4가지 상황별로 보완."),
        t("게임 리뷰에서 최선의 수를 두어도 평가치가 잠깐 바뀌었다 돌아오던 문제 수정."),
        t("리뷰 페이지 자유 탐색 수의 등급이 학습 탭과 다르던 문제 수정."),
        t("일일 퍼즐 탭 첫 화면에 전날 퍼즐이 남아 있던 문제 수정."),
      ] },
      { cat: "perf", items: [
        t("긴 기보를 두거나 빠르게 넘길 때 뒤로 갈수록 느려지던 문제 수정."),
      ] },
      { cat: "feature", items: [
        t("스테일메이트·3회 동형 반복 무승부 인식."),
        t("티어 승급 시 여정 지도에서 나이트 OC 코인 보너스 지급."),
        t("마스터 대국에 없는 유명 대국을 개발자가 직접 등록."),
      ] },
      { cat: "ui", items: [
        t("티어 여정 지도 닫기 버튼 우상단 고정."),
        t("학습 탭 메인 체스판의 잡힌 기물·기물 점수 표시 삭제."),
        t("집중 학습 미니보드 금색·빨간색 화살표 겹침 수정."),
      ] },
    ],
  },
  {
    version: "0.2.2", date: "2026.7.23",
    summary: t("엔진 라인 계산 속도 개선."),
    highlight: { kind: "icon", Icon: Zap, color: T.brassHi, label: t("엔진 라인 계산 속도 개선") },
    sections: [
      { cat: "perf", items: [
        t("학습 탭 엔진 추천 수(엔진 라인) 계산 시간 대폭 단축."),
        t("소개 페이지(/about) '유명한 오프닝들' 갤러리 다중 보드 동작 부하 개선."),
      ] },
      { cat: "fix", items: [
        t("학습 탭 다음 수 블록의 수 체계 아이콘과 실제로 둔 뒤의 아이콘이 다르던 문제 수정."),
      ] },
      { cat: "feature", items: [
        t("오늘의 퀘스트 두 번째 항목을 '오늘의 퍼즐 풀기'로 고정."),
        t("티어 리더보드에 내 순위를 금색 윤곽선으로 표시."),
        t("게임 리뷰에서 탁월한 수(언더프로모션 제외) 시 체스판 위 표시."),
        t("chess.com 연동 계정의 실제 대국 통계 기반 '자주 두는 첫 수' 표시."),
      ] },
      { cat: "ui", items: [
        t("프로필 카드 정리. 티어는 흰 십각형 로고 하나로 표시."),
        t("퍼즐 탭 미해결 퍼즐을 오프닝별 점선 영역 가로 스크롤로 표시."),
        t("학습 탭 제안 화살표를 모든 후보 수 중 상위 3수로 확대."),
        t("게임 리뷰 코치 설명에서 탁월한 수의 희생 기물 지목."),
      ] },
      { cat: "ux", items: [
        t("'가장 많이 둔 오프닝'을 백 1~6번째 수까지 반영."),
        t("도감 오프닝 모식도 설명 카드가 블록을 가리지 않도록 이동."),
        t("도감 오프닝 트리 중앙 회로 칩 클릭 시 전기 효과음 재생."),
        t("그랜드마스터 보드 스킨에 주기적 광택 애니메이션 추가."),
        t("설정 탭 사운드 카드 설명 문구 정리."),
      ] },
    ],
  },
  {
    version: "0.2.1", date: "2026.7.23",
    summary: t("리뷰 보드 자유 탐색 · 수 체계 아이콘 설명."),
    highlight: { kind: "icon", Icon: MousePointer, color: "#B98CFF", label: t("리뷰 보드 자유 탐색") },
    sections: [
      { cat: "feature", items: [
        t("게임 리뷰 보드에서 기보에 없는 수를 자유롭게 두고 평가 확인."),
        t("게임 리뷰·학습 탭·퍼즐의 수 체계 아이콘 클릭 시 등급 설명 표시."),
        t("게임 리뷰 요약에 두어지지 않은 수 등급, 오프닝·엔드게임 단계 항상 표시."),
        t("게임 리뷰 보드에 연동한 chess.com 프로필 사진 표시."),
        t("평가치 그래프 점을 수 체계에 맞춰 정리. 그래프 클릭·드래그로 해당 수 이동."),
        t("세로 평가치 막대를 모든 화면에서 보드 옆에 상시 표시."),
      ] },
      { cat: "ux", items: [
        t("평가치를 +/- 부호 대신 유리한 쪽 위치로 표시."),
        t("게임 리뷰 뒤로가기 시 진입했던 화면으로 복귀."),
        t("게임 리뷰 등급별 개수를 누르면 해당 등급이 처음 나온 수로 이동."),
        t("코치 설명 카드의 Retry 버튼 삭제, Show 버튼 아이콘 변경."),
      ] },
      { cat: "fix", items: [
        t("평가치 그래프가 데스크톱에서 찌그러지던 문제 수정."),
        t("체크메이트로 끝난 대국의 평가치가 이상한 숫자로 표시되던 문제 수정."),
        t("엔진 추천 수가 잠깐 겹쳐 깜빡이던 문제 수정."),
      ] },
    ],
  },
  {
    version: "0.2.0", date: "2026.7.22",
    summary: t("신규 게임 리뷰 페이지 · 일일 퍼즐."),
    highlight: { kind: "icon", Icon: Sparkles, color: T.brassHi, label: t("새 게임 리뷰 페이지") },
    sections: [
      { cat: "feature", items: [
        t("게임 리뷰를 chess.com 스타일 전체 화면 /review 페이지로 신규 제작."),
        t("일일 퍼즐. 매일 자정 교체."),
        t("업데이트 공지를 버전마다 최초 접속 시 1회만 표시. 설정 탭 개발 기록에서 재열람."),
        t("게임 리뷰·프로필 최근 대국 목록에 양측 플레이어 실제 이름 표시."),
        t("게임 리뷰·학습 탭 체스판에 잡힌 기물과 기물 점수 차이 표시."),
        t("분석 엔진 선택지 확대. 기존 2종에 최강 엔진 추가."),
      ] },
      { cat: "perf", items: [
        t("수 체계 아이콘 확정 속도 단축."),
        t("게임 리뷰 소요 시간 대폭 단축."),
        t("학습 탭 후보 수 블록 표시 속도 개선."),
      ] },
      { cat: "ux", items: [
        t("학습 탭 '분석' 버튼 클릭 시 신규 게임 리뷰 화면으로 이동."),
      ] },
      { cat: "fix", items: [
        t("백이 크게 우세할 때 평가치 막대 도움말 아이콘이 흰 배경에 묻히던 문제 수정."),
        t("연동한 chess.com 아이디의 대소문자 표기 오류 수정."),
        t("기물을 희생해 압박하는 탁월한 수 판정이 캐슬링·폰 이동에서 동작하지 않던 문제 수정."),
        t("모바일 문의하기에서 메일 양식이 채워지지 않던 문제 수정."),
        t("일일 퍼즐 알림과 업데이트 공지가 겹쳐 공지를 닫을 수 없던 문제 수정."),
      ] },
    ],
  },
  {
    version: "0.1.5", date: "2026.7.18",
    summary: t("그랜드마스터 배지 복구 · 애니메이션 · 채팅 입력 표시."),
    highlight: { kind: "img", src: "/gm.png", label: t("그랜드마스터 배지 복구") },
    sections: [
      { cat: "ux", items: [
        t("퍼즐 탭·퀘스트 탭·상점 탭·친구·검색 목록에 부드러운 등장 애니메이션 추가."),
        t("친구 요청 수락·거절, 알림 삭제 시 항목이 자연스럽게 사라짐."),
        t("집중 학습 퍼즐 자동 생성 중 진행률 표시 개선."),
        t("채팅에서 상대가 입력 중이면 말풍선 점 3개 표시."),
      ] },
      { cat: "feature", items: [
        t("체스판에 나무 결 질감과 파일(a~h)·랭크(1~8) 좌표 추가."),
        t("체스판 장식에 폴스 메이트·스칼라스 메이트·레갈의 함정·프라이드 리버 어택 등 추가."),
        t("chess.com 계정 연동 시 이용 가능 기능(대국 자동 동기화, 게임 리뷰 정확도 등) 안내."),
        t("채팅에서 내가 보낸 메시지를 꾹 눌러 수정·삭제."),
        t("채팅 공유 퍼즐 카드에 보낸 시각 표시, 꾹 눌러 삭제."),
        t("배경음악(드뷔시 '달빛')과 블록·체스판 클릭 효과음 추가."),
        t("버전 기록에서 누락된 v0.1.2·v0.1.3 항목 보완."),
      ] },
      { cat: "fix", items: [
        t("그랜드마스터 티어 배지에 기물 대신 오로라 사진이 표시되던 문제 수정."),
        t("티어 여정 지도가 모바일에서 오른쪽으로 밀려 잘리던 문제 수정."),
        t("퍼즐 풀이·카드 '공유' 버튼 텍스트가 두 줄로 잘리던 문제 수정."),
        t("계정 변경·로그아웃 후 이전 계정의 퍼즐·프로필 기록이 남던 문제 수정."),
      ] },
      { cat: "ui", items: [
        t("마스코트 그림을 학습 탭 등 다른 화면과 통일."),
        t("티어 여정 지도에서 그랜드마스터(마지막 티어)를 가운데로 강조."),
      ] },
    ],
  },
  {
    version: "0.1.4", date: "2026.7.18",
    summary: t("소개 페이지 유명 오프닝 갤러리 · 그랜드마스터 카드."),
    highlight: { kind: "img", src: "/gm-trophy-web.webp", label: t("그랜드마스터 카드 추가") },
    sections: [
      { cat: "feature", items: [
        t("소개 페이지에 이탈리안 게임·루이 로페즈·시실리안 디펜스·그룬펠드 디펜스 등 유명 오프닝 갤러리 추가."),
        t("그랜드마스터 티어 소개 카드. 달성 조건(누적 200,000 XP 등) 안내."),
        t("그랜드마스터 도달 시 코인으로 살 수 없는 전용 체스보드·기물 스킨 지급."),
        t("친구 목록·유저 검색·티어 리더보드에서 그랜드마스터에 골드 테두리 표시."),
        t("프로필 '오프닝별 승률' 목록을 갈래별로 접기/펼치기."),
        t("퍼즐 이름을 '오프닝 이름, 수'(예: Italian Game, 4.Ng5) 형식으로 통일."),
      ] },
      { cat: "ui", items: [
        t("MILKU·KOKOA 일러스트 4장을 소개 페이지에 배치."),
        t("상단 페이지 안내 바 삭제. 좌우 화살표 버튼으로 페이지 이동."),
        t("퍼즐 카드 상단 라벨에 최상위 오프닝 이름만 표시."),
        t("헤더 로고 아래 버전 표기 위치 조정. 클릭 시 소개 페이지 이동."),
      ] },
      { cat: "fix", items: [
        t("긴 오프닝 이름에도 퍼즐 카드 높이 균일 유지."),
        t("티어 여정 지도에서 스크롤이 멈추면 등장 애니메이션이 깜빡이던 문제 수정."),
      ] },
    ],
  },
  {
    version: "0.1.3", date: "2026.7.17",
    summary: t("엔진 상위 3줄 분석 · 티어 여정 지도 개편."),
    highlight: { kind: "shot", src: "/about/screenshot-study.webp", label: t("엔진 상위 3줄 분석"), tilt: -3 },
    sections: [
      { cat: "feature", items: [
        t("학습 탭 메인 보드에 엔진 추천 상위 3줄과 평가치 표시."),
        t("평가치 바 소수점 둘째 자리 표시, 유리한 쪽에 맞는 위치·색."),
        t("상단 기보 가로 스크롤, 수가 늘면 최신 수로 자동 이동."),
        t("프로필 버튼 카드에 메인 퀘스트 진척도와 푼 퍼즐 목록 표시."),
        t("소개 페이지(/about) 스크롤 애니메이션 확충."),
        t("티어 여정 지도 개편. 지나온 구간은 노란 선과 초록 체크."),
      ] },
      { cat: "ui", items: [
        t("퍼즐 공유 버튼 강조."),
        t("헤더 티어 진행바 삭제. 상세 진행도는 로고 클릭으로 확인."),
      ] },
      { cat: "fix", items: [
        t("프로필 '푼 퍼즐' 블록 찌그러짐 수정. 5개까지 가로 스크롤."),
        t("퍼즐·도감 모식도 이동 중 멈춤 수정."),
        t("퍼즐 컴퓨터 응징 수 아이콘 깜빡임 수정."),
        t("학습 탭에서 같은 수의 평가치가 위치마다 다르던 문제 수정."),
        t("일부 안드로이드 기기에서 학습 탭 화면이 옆으로 밀려 잘리던 문제 수정."),
        t("일부 일일 퀘스트에서 클리어 조건 기보가 안 보이던 문제 수정."),
      ] },
    ],
  },
  {
    version: "0.1.2", date: "2026.7.16",
    summary: t("퍼즐 오답 응징 수 시연 · /about 페이지."),
    highlight: { kind: "shot", src: "/about/screenshot-puzzle.webp", label: t("오답 응징 수 시연"), tilt: 3 },
    sections: [
      { cat: "feature", items: [
        t("퍼즐 오답 시 즉시 원위치 대신 상대의 응징 수 시연."),
        t("퍼즐 모식도·도감 오프닝 트리에서 빈 공간까지 드래그 이동."),
        t("일일 퀘스트 4개 보상을 경험치 대신 OC 나이트 코인으로 변경."),
        t("사이트 소개 /about 페이지 추가. 좌우로 넘기며 핵심 기능 확인."),
      ] },
      { cat: "fix", items: [
        t("일부 퀘스트 오프닝 이름 자리에 '오프닝'만 표시되던 문제 수정."),
        t("퍼즐 컴퓨터의 첫 수 아이콘이 계산 중으로 잠깐 표시되던 문제 수정."),
      ] },
      { cat: "ui", items: [
        t("티어 로고 원 축소, 사이트 톤에 맞는 금색으로 변경."),
        t("헤더 경험치 게이지를 로고 아래로 이동, 현재 버전 표시."),
      ] },
    ],
  },
  {
    version: "0.1.1", date: "2026.7.16",
    summary: t("티어 UI 이미지 개편 · 버그 수정."),
    highlight: { kind: "tierPromo" },
    sections: [
      { cat: "feature", items: [
        t("퍼즐 카드·풀이 화면 공유 아이콘을 '공유 수 표시'와 '공유하기' 두 개로 분리."),
        t("퍼즐이 테마 태그 두 개를 동시에 가지면 카드에 함께 표시."),
        t("티어 화면을 실제 기물 이미지로 재설계."),
        t("티어 승급 시 화면이 어두워지며 기존 티어가 사라지고 새 티어 등장."),
      ] },
      { cat: "fix", items: [
        t("퍼즐 좋아요·리포스트 취소 시 숫자가 줄지 않던 문제 수정."),
        t("채팅 버튼 클릭 시 화면이 멈추던 문제 수정."),
        t("다른 사람이 같은 퍼즐을 올리면 먼저 올린 태그가 사라지던 문제 수정."),
        t("안드로이드 크롬 홈 화면 추가 시 파비콘 대신 글자 아이콘이 뜨던 문제 수정."),
      ] },
      { cat: "ui", items: [
        t("도감 탭 오프닝 트리 대표 이름표 위치 조정."),
      ] },
    ],
  },
  {
    version: "0.1.0", date: "2026.7.16",
    summary: t("퍼즐 공유 · 리포스트 · 공개 프로필 기록."),
    highlight: { kind: "shot", src: "/about/screenshot-puzzle.webp", label: t("퍼즐 공유하기"), tilt: -3 },
    sections: [
      { cat: "feature", items: [
        t("퍼즐 친구 공유. 카드·풀이 화면 종이비행기 아이콘."),
        t("공유한 퍼즐을 친구가 풀면 친구 획득 경험치의 10%를 공유자에게 지급."),
        t("퍼즐 리포스트."),
        t("메인 퀘스트 진척도·푼 퍼즐 목록을 유저 검색·프로필에서 열람."),
      ] },
      { cat: "ui", items: [
        t("퍼즐 카드·풀이 화면에 리포스트 수·공유 수를 좋아요 수 옆에 표시."),
        t("퍼즐 테마 3종 카드 배경 패턴을 수 체계 배지와 같은 색·기호로 변경."),
      ] },
      { cat: "fix", items: [
        t("도감 탭 대표 오프닝(이탈리안 게임, 루이 로페즈 등) 이름표 위치 오류 수정."),
        t("실수를 응징하는 수가 탁월한 수이기도 한 경우 같은 퍼즐이 중복 분류되던 문제 수정."),
      ] },
    ],
  },
  {
    version: "0.0.6", date: "2026.7.15",
    summary: t("티어 시스템 · 도감 탭 성능·안정성 개선."),
    highlight: { kind: "tierStrip" },
    sections: [
      { cat: "feature", items: [
        t("레벨 시스템을 아이언~그랜드마스터 각 5단계 티어로 개편."),
        t("유저 검색창에 친구의 친구, 상위 티어 플레이어 추천."),
      ] },
      { cat: "perf", items: [
        t("chess.com 대국이 많은 계정의 도감 탭 오프닝 트리 버벅임 수정."),
        t("학습 탭 실시간 평가 속도 여러 배 향상."),
      ] },
      { cat: "ui", items: [
        t("도감 탭 오프닝 검색 개선. 이름에 포함된 오프닝 전체 표시."),
        t("퍼즐 탭 아이콘을 퍼즐 조각 모양으로 변경."),
        t("내 프로필에서 메인 퀘스트 진척도·푼 퍼즐 정보를 chess.com 대국 기록보다 앞에 표시."),
      ] },
      { cat: "fix", items: [
        t("오프닝·퍼즐 모식도 확대·축소 시 트리 전체가 사라지던 문제 수정."),
        t("도감 탭 수 클릭 시 화면이 흔들리거나 드래그 시 트리가 튀던 문제 수정."),
        t("체스 규칙 2건 수정. 폰이 한 칸씩 두 번 나눠 전진해도 앙파상이 가능하던 오류 등."),
        t("내 프로필 오프닝별 승률 목록에서 이름이 길고 깊게 중첩되면 글자가 겹치던 문제 수정."),
        t("학습 탭 수 등급 판정, 로그인·로그아웃 데이터 처리, 알림 반영 등 다수 오류 수정."),
      ] },
    ],
  },
  {
    version: "0.0.5", date: "2026.7.14",
    summary: t("서버 보안 강화 · 실시간 알림·채팅."),
    highlight: { kind: "icon", Icon: Shield, color: "#D9736A", label: t("서버 보안 강화") },
    sections: [
      { cat: "security", items: [
        t("타인이 내 퍼즐 풀이수·좋아요 수를 조작할 수 있던 문제 수정."),
        t("타인 명의로 가짜 알림(칭호 획득, 레벨 업 등)을 보낼 수 있던 문제 수정."),
        t("친구가 아닌 사람에게 채팅을 보낼 수 있던 문제 수정."),
      ] },
      { cat: "perf", items: [
        t("알림·친구 요청·채팅창을 폴링 대신 실시간(Realtime) 구독으로 변경."),
      ] },
    ],
  },
  {
    version: "0.0.4", date: "2026.7.13",
    summary: t("학습 탭 실시간 분석 · 게임 리뷰 속도 개선."),
    highlight: { kind: "shot", src: "/about/screenshot-study.webp", label: t("학습 탭 실시간 분석"), tilt: 3 },
    sections: [
      { cat: "perf", items: [
        t("게임 리뷰(전체 기보 분석) 속도 대폭 향상."),
        t("체스판에서 수를 둘 때마다 실시간 분석이 느려지던 문제 개선."),
      ] },
      { cat: "fix", items: [
        t("모바일에서 긴 오프닝 이름이 잘리던 문제 수정."),
        t("퍼즐 제작 중 다른 화면으로 이동하면 처음부터 다시 만들어야 하던 문제 수정."),
        t("퍼즐 풀이 화면에 풀 수 없는 수가 함께 표시되던 문제 수정."),
        t("퍼즐 컴퓨터의 첫 수 표시가 금방 사라지던 문제 수정."),
        t("퍼즐 풀이 중 '처음부터'를 누르면 살펴본 내용까지 사라지던 문제 수정."),
      ] },
    ],
  },
  {
    version: "0.0.3", date: "2026.7.13",
    summary: t("나침반형 오프닝 트리."),
    highlight: { kind: "shot", src: "/about/screenshot-dex.webp", label: t("나침반형 오프닝 트리"), tilt: -3 },
    sections: [
      { cat: "ui", items: [
        t("도감 탭 오프닝 트리를 나침반 형태로 재설계. 1.e4·1.d4·1.c4·1.Nf3이 동서남북 네 방향으로 확장."),
      ] },
      { cat: "fix", items: [
        t("트리 렌더링 중 화면이 흔들리거나 버벅이던 문제 수정."),
        t("수 클릭 시 뜨는 설명 카드가 확대·축소 시 잘리거나 커지던 문제 수정."),
      ] },
    ],
  },
  {
    version: "0.0.2", date: "2026.7.12",
    summary: t("실시간 분석 성능 개선."),
    highlight: { kind: "icon", Icon: Zap, color: T.brassHi, label: t("실시간 분석 성능 개선") },
    sections: [
      { cat: "fix", items: [
        t("게임 리뷰(전체 기보 분석)가 기보가 길수록 느려지다 멈추던 문제 수정."),
      ] },
      { cat: "perf", items: [
        t("실시간 분석 정확도·속도 개선."),
      ] },
    ],
  },
  {
    version: "0.0.1", date: "2026.7.11",
    summary: t("모바일 UI 정리 · 사용성 개선."),
    highlight: { kind: "shot", src: "/about/screenshot-quest.webp", label: t("구석구석 다듬기"), tilt: 3 },
    sections: [
      { cat: "ui", items: [
        t("모바일 상단 메뉴 잘림 수정, 전체 정리."),
        t("학습 탭 체스판 확대."),
        t("상점·설정 탭 화면 정리."),
        t("로그인·회원가입 창 애니메이션 추가."),
      ] },
      { cat: "feature", items: [
        t("대국 기록에 래피드·블리츠·불릿 시간 규정과 레이팅 변화 표시."),
        t("도감 탭에 오프닝 이름 표시."),
      ] },
      { cat: "ux", items: [
        t("집중 학습 모드에서 수를 클릭하면 해당 수의 학습 화면으로 이동."),
        t("검색 입력 즉시 결과 표시."),
      ] },
      { cat: "fix", items: [
        t("마스터 대국 기록이 안 보이던 문제 수정."),
        t("퍼즐 탭에서 퍼즐이 하단 메뉴에 가려지던 문제, 모바일 추천 퍼즐 미표시 문제 수정."),
      ] },
      { cat: "perf", items: [
        t("chess.com 계정 연동 시 대국이 많아도 정보가 빠르게 표시."),
      ] },
    ],
  },
  {
    version: "0.0.0", date: "2026.7.10",
    summary: t("OpenChess 베타 서비스 시작."),
    highlight: { kind: "icon", Icon: Rocket, color: "#8FB55E", label: t("OpenChess 베타 출시") },
    sections: [
      { cat: "feature", items: [
        t("오프닝 학습과 퍼즐 풀이 핵심 기능으로 베타 서비스 시작."),
      ] },
    ],
  },
];
// (v0.1.2 기능) 참고 이미지처럼 "마스코트가 말풍선으로 설명하고, 그 아래 실제로 어떻게 보이는지
// 이미지·애니메이션으로 보여주는" 구성 — 버전마다 대표 기능 하나를 뽑아 아이콘 펄스, 실제 티어
// 이미지, 또는 승급 연출을 그대로 재현한 미니 데모로 보여준다.
const PROMO_TIERS = [
  { img: "/iron-pawn.png", label: t("아이언 승급") },
  { img: "/bronze-knight.png", label: t("브론즈 승급") },
  { img: "/silver-bishop.png", label: t("실버 승급") },
  { img: "/gold-rook.png", label: t("골드 승급") },
];
// v0.1.1에서 새로 생긴 "티어가 오르면 화면이 바뀌며 승급하는" 연출을, 실제 사이트에서 쓰는 것과
// 같은 시각 언어(GOLD_DISC)로 축소 재현한다 — 일정 간격으로 다음 티어로 자동 순환.
function TierPromoDemo() {
  const [i, setI] = useState(0);
  useEffect(() => { const id = setInterval(() => setI((v) => (v + 1) % PROMO_TIERS.length), 2200); return () => clearInterval(id); }, []);
  const cur = PROMO_TIERS[i];
  return (
    <Reveal>
      <div style={{ margin: "8px 0 28px", padding: "22px 16px", borderRadius: 16, background: "linear-gradient(160deg,#241509,#150C05)", ...GLOSS_BORDER, overflow: "hidden", position: "relative", height: 132 }}>
        <AnimatePresence mode="popLayout">
          <motion.div key={i} initial={{ x: 90, opacity: 0, scale: 0.7 }} animate={{ x: 0, opacity: 1, scale: 1 }} exit={{ x: -90, opacity: 0, scale: 0.7 }} transition={{ duration: 0.55, ease: [0.22, 0.9, 0.32, 1] }}
            style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 8 }}>
            <TierBadgeShape size={76}>
              <img src={cur.img} alt="" style={{ width: "70%", height: "70%", objectFit: "contain" }} />
            </TierBadgeShape>
            <span style={{ fontSize: 11.5, fontWeight: 800, color: T.brassHi }}>{cur.label}</span>
          </motion.div>
        </AnimatePresence>
      </div>
    </Reveal>
  );
}
// 사진 자산이 없는 항목(공유·보안·속도 등 개념적인 기능)은 아이콘을 크게 띄우고 은은한 펄스
// 애니메이션을 줘서 "그냥 텍스트"보다 시각적으로 보여준다.
function IconHighlight({ Icon, color, label }) {
  return (
    <Reveal>
      <div className="flex flex-col items-center" style={{ gap: 10, margin: "8px 0 28px" }}>
        <motion.div animate={{ boxShadow: ["0 0 0 0 " + color + "55", "0 0 0 16px " + color + "00"] }} transition={{ duration: 1.8, repeat: Infinity, ease: "easeOut" }}
          style={{ width: 92, height: 92, borderRadius: "50%", background: "radial-gradient(70% 70% at 32% 28%,#FFFFFF22," + color + "22)", border: "1px solid " + color, display: "flex", alignItems: "center", justifyContent: "center" }}>
          <motion.div animate={{ scale: [1, 1.12, 1] }} transition={{ duration: 1.8, repeat: Infinity, ease: "easeInOut" }}>
            <Icon size={38} color={color} />
          </motion.div>
        </motion.div>
        <span style={{ fontSize: 11.5, fontWeight: 800, color }}>{label}</span>
      </div>
    </Reveal>
  );
}
// (v0.1.3 기능) "게임 내 스크린샷도 사용해 달라"는 요청 — 실제 화면과 관련된 버전(공유 기능→퍼즐 탭,
// 실시간 분석→학습 탭, 오프닝 트리 개편→도감 탭 등)에는 아이콘 펄스 대신 그 탭의 실제 스크린샷을
// PhoneFrame에 담아 보여준다.
function ShotHighlight({ src, label, tilt = 0 }) {
  return (
    <Reveal>
      <div className="flex flex-col items-center" style={{ gap: 10, margin: "8px 0 28px" }}>
        <div style={{ width: 168 }}><PhoneFrame src={src} alt={label} tilt={tilt} /></div>
        <span style={{ fontSize: 11.5, fontWeight: 800, color: T.brassHi }}>{label}</span>
      </div>
    </Reveal>
  );
}
// (v0.1.4 기능) 그랜드마스터 배지 복구를 소개하는 v0.1.4 하이라이트 전용 — 로고 원본(gm.png,
// 기물+"GM" 워드마크 합성본)을 IconHighlight와 같은 펄스 글로우로 감싸되, 작은 반복 배지(TierBadgeShape)
// 안에 욱여넣지 않고 워드마크가 실제로 읽히는 크기로 그대로 보여준다.
function ImageHighlight({ src, label }) {
  return (
    <Reveal>
      <div className="flex flex-col items-center" style={{ gap: 10, margin: "8px 0 28px" }}>
        <motion.div animate={{ boxShadow: ["0 0 0 0 " + T.brass + "55", "0 0 0 16px " + T.brass + "00"] }} transition={{ duration: 1.8, repeat: Infinity, ease: "easeOut" }}
          style={{ width: 120, height: 120, borderRadius: "50%", background: "radial-gradient(70% 70% at 32% 28%,#FFFFFF22," + T.brass + "22)", border: "1px solid " + T.brass, display: "flex", alignItems: "center", justifyContent: "center" }}>
          <img src={src} alt="" style={{ width: "78%", height: "78%", objectFit: "contain" }} />
        </motion.div>
        <span style={{ fontSize: 11.5, fontWeight: 800, color: T.brassHi }}>{label}</span>
      </div>
    </Reveal>
  );
}
function VersionHighlight({ h }) {
  if (!h) return null;
  if (h.kind === "icon") return <IconHighlight Icon={h.Icon} color={h.color} label={h.label} />;
  if (h.kind === "img") return <ImageHighlight src={h.src} label={h.label} />;
  if (h.kind === "shot") return <ShotHighlight src={h.src} label={h.label} tilt={h.tilt} />;
  if (h.kind === "tierStrip") return (
    <Reveal><div style={{ margin: "8px 0 28px", padding: "18px 14px", borderRadius: 16, background: "linear-gradient(160deg,#241509,#150C05)", ...GLOSS_BORDER }}><TierStrip /></div></Reveal>
  );
  if (h.kind === "tierPromo") return <TierPromoDemo />;
  return null;
}

// (v0.1.3 기능) "텍스트만 있는 것 같다 — 좌우로 역동적으로 배치해 달라"는 요청 — 항목마다 좌/우
// 번갈아 여백을 주고 반대 방향에서 슬라이드해 들어오게 해, 한 줄로 죽 늘어선 목록이 아니라
// 지그재그로 읽히도록 바꾼다(once:false라 스크롤에서 벗어났다 다시 들어올 때마다 다시 슬라이드).
function ItemRow({ text, color, delay, index }) {
  const fromRight = index % 2 === 1;
  return (
    <motion.div initial={{ opacity: 0, x: fromRight ? 28 : -28 }} whileInView={{ opacity: 1, x: 0 }} viewport={{ once: false, amount: 0.4 }} transition={{ duration: 0.45, delay, ease: [0.22, 0.9, 0.32, 1] }}
      className="flex items-start gap-2" style={{ padding: "9px 12px", borderRadius: 10, background: "rgba(0,0,0,.18)", border: "1px solid #4A3521", marginBottom: 6, flexDirection: fromRight ? "row-reverse" : "row", marginLeft: fromRight ? 22 : 0, marginRight: fromRight ? 0 : 22 }}>
      <span style={{ width: 6, height: 6, borderRadius: "50%", background: color, flexShrink: 0, marginTop: 6 }} />
      <p style={{ margin: 0, fontSize: 12.5, color: T.ivory, lineHeight: 1.65, textAlign: fromRight ? "right" : "left" }}>{text}</p>
    </motion.div>
  );
}

// (v0.1.3 기능) "체스보드와 기물 이미지도 막 사용해 달라"는 요청 — 카테고리 헤더 뒤에 그 카테고리와
// 어울리는 기물(CAT_PIECE)을 옅게 워터마크처럼 깔아 둔다. 카테고리마다 좌/우를 번갈아 카드 자체도
// 살짝 지그재그로 등장하게 한다.
function CategoryGroup({ cat, items, index }) {
  const c = CAT[cat];
  const onRight = index % 2 === 1;
  const pieceSrc = DECO_PIECE_SRC[CAT_PIECE[cat] || "wQ"];
  return (
    <motion.div initial={{ opacity: 0, x: onRight ? 20 : -20 }} whileInView={{ opacity: 1, x: 0 }} viewport={{ once: false, amount: 0.2 }} transition={{ duration: 0.5, ease: [0.22, 0.9, 0.32, 1] }}
      style={{ marginBottom: 24, position: "relative", overflow: "hidden", borderRadius: 14, padding: 2 }}>
      <img src={pieceSrc} alt="" aria-hidden="true" style={{ position: "absolute", [onRight ? "right" : "left"]: -22, top: -14, width: 100, opacity: 0.07, pointerEvents: "none", filter: "grayscale(1) brightness(3)" }} />
      <div className="flex items-center gap-2" style={{ marginBottom: 8, position: "relative" }}>
        <span style={{ width: 22, height: 22, borderRadius: 7, background: c.color + "26", border: "1px solid " + c.color, display: "inline-flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}><c.Icon size={12} color={c.color} /></span>
        <span style={{ fontSize: 11, fontWeight: 800, color: c.color, letterSpacing: ".04em" }}>{c.label}</span>
      </div>
      <div style={{ position: "relative" }}>
        {items.map((t, i) => <ItemRow key={i} text={t} color={c.color} delay={i * 0.04} index={i} />)}
      </div>
    </motion.div>
  );
}

// 버전 기록 한 페이지 — 공지 모달과 같은 소재를 쓰지만(App.jsx CHANGELOG와는 별도로 이 파일 안에
// VERSION_HISTORY로 옮겨 적음), 카테고리별로 나누고 조금 더 풀어 쓴 문장으로 자세히 보여준다.
// (v0.1.2 기능) 마스코트가 이번 버전을 직접 소개하는 말풍선(도입부)과 소감을 남기는 말풍선(마무리)
// 사이에, 대표 기능을 이미지·애니메이션으로 보여주는 하이라이트를 넣어 참고 이미지의 "삽화+대사"
// 구성을 재현한다.
function VersionPage({ v, isLatest, idx = 0 }) {
  // (v0.1.3 기능) 버전마다 데코 보드를 하나씩 순서대로 돌려 써서(체스보드를 "막" 쓰되 매번 같은
  // 장면이 반복되지 않도록) 버전 헤더 옆에 작은 장식으로 붙인다.
  const deco = DECO_LIST[idx % DECO_LIST.length];
  return (
    <div style={{ maxWidth: 720, margin: "0 auto", padding: "56px 20px 96px" }}>
      <div className="flex items-start justify-between flex-wrap" style={{ gap: 14, marginBottom: 24 }}>
        <Reveal>
          <div>
            <div className="flex items-center gap-2" style={{ marginBottom: 6 }}>
              <motion.span initial={{ scale: 0.6, rotate: -6 }} whileInView={{ scale: 1, rotate: 0 }} viewport={{ once: false, amount: 0.6 }} transition={{ duration: 0.5, ease: [0.22, 0.9, 0.32, 1] }}
                style={{ display: "inline-block", fontSize: 24, fontWeight: 900, color: T.brassHi, fontFamily: "ui-monospace,monospace" }}>v{v.version}</motion.span>
              {isLatest && <span style={{ fontSize: 10, fontWeight: 800, color: "#241509", background: "linear-gradient(180deg," + T.brass + ",#A8842F)", borderRadius: 999, padding: "2px 9px" }}>{t("최신")}</span>}
              <span style={{ fontSize: 11.5, color: T.inkSoft }}>{v.date}</span>
            </div>
            <p style={{ margin: 0, fontSize: 14, color: T.ivoryHi, fontWeight: 700, lineHeight: 1.5, maxWidth: 420 }}>{v.summary}</p>
          </div>
        </Reveal>
        <div style={{ flexShrink: 0 }}><DecoBoard {...deco} size={90} tilt={idx % 2 === 0 ? -9 : 9} caption={null} /></div>
      </div>

      {v.mascot && (
        <div style={{ marginBottom: 8 }}>
          <SpeechBubble mascot={v.mascot.intro} name={v.mascot.intro.name} align={v.mascot.intro.align}>{v.mascot.intro.text}</SpeechBubble>
        </div>
      )}

      <VersionHighlight h={v.highlight} />

      {v.sections.map((s, i) => <CategoryGroup key={s.cat} cat={s.cat} items={s.items} index={i} />)}

      {v.mascot && (
        <div style={{ marginTop: 28 }}>
          <SpeechBubble mascot={v.mascot.outro} name={v.mascot.outro.name} align={v.mascot.outro.align}>{v.mascot.outro.text}</SpeechBubble>
        </div>
      )}
    </div>
  );
}

// ============================================================ 페이저 ============================================================
// (v0.1.2 기능) 퍼즐 풀이 화면(보드↔모식도)과 동일한 드래그 페이지 넘김 패턴 — 손가락/마우스로
// 옆 페이지를 살짝 당기면 미리 보이다가, 임계값을 넘기면 넘어가고 아니면 되돌아온다. 1페이지는
// 소개, 2페이지부터는 최신 버전순 업데이트 기록.
const PAGES_META = [{ key: "intro", label: t("소개") }, ...VERSION_HISTORY.map((v) => ({ key: v.version, label: "v" + v.version }))];

export default function AboutPage() {
  // 공지 모달의 "자세히 보기"에서 ?page=2로 들어오면(2페이지 = 최신 버전) 그 페이지부터 보여준다.
  const initialPage = useMemo(() => {
    try {
      const p = parseInt(new URLSearchParams(window.location.search).get("page"), 10);
      if (p >= 1 && p <= PAGES_META.length) return p - 1;
    } catch { }
    return 0;
  }, []);
  const [page, setPage] = useState(initialPage);
  const pagerRef = useRef(null);
  const dragRef = useRef(null);
  const [dragPx, setDragPx] = useState(0);
  const dragging = !!dragRef.current;
  const total = PAGES_META.length;
  const goTo = (n) => setPage(Math.max(0, Math.min(total - 1, n)));
  const onPointerDown = (e) => {
    if (e.target.closest && e.target.closest("a, button, .no-swipe")) return;
    dragRef.current = { x: e.clientX, w: pagerRef.current ? pagerRef.current.clientWidth : 380 };
    e.currentTarget.setPointerCapture(e.pointerId);
  };
  const onPointerMove = (e) => { if (!dragRef.current) return; setDragPx(e.clientX - dragRef.current.x); };
  const onPointerUp = () => {
    const st = dragRef.current; dragRef.current = null;
    if (!st) { setDragPx(0); return; }
    const threshold = st.w * 0.16;
    if (dragPx <= -threshold && page < total - 1) setPage((p) => p + 1);
    else if (dragPx >= threshold && page > 0) setPage((p) => p - 1);
    setDragPx(0);
  };
  // 페이지를 넘길 때마다 새 페이지는 항상 맨 위부터 보이도록(각 페이지가 독립 스크롤 영역이라
  // window가 아니라 그 페이지 자신을 스크롤 위치로 되돌린다).
  const pageElRefs = useRef([]);
  useEffect(() => { const el = pageElRefs.current[page]; if (el) el.scrollTo({ top: 0, behavior: "auto" }); }, [page]);

  return (
    // (v0.1.2 버그 수정) 페이지마다 실제 내용 길이가 크게 다른데(1페이지 소개는 길고, 짧은 버전
    // 기록은 훨씬 짧음) flex row에 폭만 나눠 넣으면 기본 정렬(stretch)로 모든 페이지가 가장 긴
    // 페이지(1페이지) 높이에 맞춰 늘어나, 짧은 페이지 아래로 거대한 빈 공간이 남았다 — 페이저
    // 영역 자체를 뷰포트 나머지 높이로 고정하고, 각 페이지가 그 안에서 독립적으로 세로 스크롤되게
    // 해 페이지마다 실제 내용 길이와 무관하게 항상 딱 맞게 보이도록 한다.
    <div style={{ position: "relative", height: "100vh", display: "flex", flexDirection: "column", background: "linear-gradient(180deg,#241509,#1B0F07 40%,#1B1009)", color: T.ivory, fontFamily: "'IBM Plex Sans KR', 'Noto Sans Devanagari', 'Noto Sans JP', 'Noto Sans SC', sans-serif", overflow: "hidden" }}>
      <Backdrop />
      <header style={{ position: "relative", zIndex: 2, flexShrink: 0, borderBottom: "1px solid #000", background: "linear-gradient(180deg,#3A2516,#2A1810)" }}>
        <div className="flex items-center justify-between" style={{ maxWidth: 1000, margin: "0 auto", padding: "14px 20px" }}>
          <img src="/OpenChessLogo.png" alt="OpenChess" style={{ display: "block", height: 34, width: "auto", filter: "drop-shadow(0 2px 3px rgba(0,0,0,.5))" }} />
          <span style={{ marginLeft: "auto", marginRight: 10 }}><LangSwitch /></span>
          <a href="/" className="press" style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "8px 16px", borderRadius: 999, background: "linear-gradient(180deg," + T.brass + ",#A8842F)", color: "#241509", fontWeight: 800, fontSize: 13, textDecoration: "none" }}>{tx("시작하기 {0}", <ArrowRight size={14} />)}
          </a>
        </div>
      </header>

      {/* (about 페이지 기능) 상단의 "< 소개 · 1/13 >" 안내 바 대신, 화면 좌우 중단에 떠 있는
          화살표 버튼으로 페이지를 넘긴다 — 콘텐츠를 가리지 않게 뷰포트 기준으로 고정하고, 페이지
          안쪽 스크롤과 무관하게 항상 세로 중앙에 머문다. 스와이프는 그대로 동일하게 동작한다. */}
      <button onClick={() => goTo(page - 1)} disabled={page === 0} className="press" aria-label={t("이전 페이지")}
        style={{ position: "fixed", left: 14, top: "50%", transform: "translateY(-50%)", zIndex: 20, width: 42, height: 42, borderRadius: "50%", border: "1px solid " + T.brass, background: "rgba(27,16,9,.85)", backdropFilter: "blur(6px)", color: page === 0 ? T.inkSoft : T.brassHi, opacity: page === 0 ? 0.35 : 1, cursor: page === 0 ? "default" : "pointer", display: "inline-flex", alignItems: "center", justifyContent: "center", boxShadow: "0 4px 14px rgba(0,0,0,.4)" }}>
        <ChevronLeft size={20} />
      </button>
      <button onClick={() => goTo(page + 1)} disabled={page === total - 1} className="press" aria-label={t("다음 페이지")}
        style={{ position: "fixed", right: 14, top: "50%", transform: "translateY(-50%)", zIndex: 20, width: 42, height: 42, borderRadius: "50%", border: "1px solid " + T.brass, background: "rgba(27,16,9,.85)", backdropFilter: "blur(6px)", color: page === total - 1 ? T.inkSoft : T.brassHi, opacity: page === total - 1 ? 0.35 : 1, cursor: page === total - 1 ? "default" : "pointer", display: "inline-flex", alignItems: "center", justifyContent: "center", boxShadow: "0 4px 14px rgba(0,0,0,.4)" }}>
        <ChevronRight size={20} />
      </button>

      <div ref={pagerRef} onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={onPointerUp} onPointerLeave={onPointerUp} onPointerCancel={onPointerUp}
        style={{ position: "relative", zIndex: 1, flex: 1, minHeight: 0, overflow: "hidden", touchAction: "pan-y" }}>
        <div style={{ display: "flex", width: total * 100 + "%", height: "100%", transform: "translateX(calc(" + (-page * 100) / total + "% + " + dragPx + "px))", transition: dragging ? "none" : "transform .38s cubic-bezier(.22,.9,.32,1)" }}>
          <div ref={(el) => (pageElRefs.current[0] = el)} style={{ width: 100 / total + "%", flexShrink: 0, height: "100%", overflowY: "auto", WebkitOverflowScrolling: "touch" }}><IntroPage /></div>
          {VERSION_HISTORY.map((v, i) => (
            <div key={v.version} ref={(el) => (pageElRefs.current[i + 1] = el)} style={{ width: 100 / total + "%", flexShrink: 0, height: "100%", overflowY: "auto", WebkitOverflowScrolling: "touch" }}>
              <VersionPage v={v} isLatest={i === 0} idx={i} />
              {i === VERSION_HISTORY.length - 1 && <div style={{ textAlign: "center", padding: "8px 0 24px" }}><span style={{ fontSize: 11, color: T.inkSoft }}>© OpenChess</span></div>}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
