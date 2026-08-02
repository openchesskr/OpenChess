import React, { useState, useRef, useEffect, useMemo } from "react";
import { motion, AnimatePresence, useInView } from "framer-motion";
import {
  GraduationCap, Library, Puzzle, Target, Crown, Users, ArrowRight, Sparkles,
  Palette, MousePointer, Zap, Wrench, Shield, ChevronLeft, ChevronRight,
  Send, Compass, Rocket, Star,
} from "lucide-react";

// (v0.1.2 기능) 사이트를 소개하는 별도 페이지(/about) — App.jsx의 무거운 초기화(엔진 워커, Supabase
// 클라이언트, 계정 상태 등)와 완전히 분리된 가벼운 정적 컴포넌트로 둔다(main.jsx에서 경로에 따라
// App 대신 이 컴포넌트를 렌더링). 그래서 여기서 쓰는 색 토큰·장식 모티프는 App.jsx의 T 객체·
// BOARD_GLOSS·GeoBackdrop을 그대로 가져오지 않고, 같은 톤을 내도록 필요한 값만 옮겨 적었다
// (기존 사이트와 시각적으로 통일되게).
const T = {
  ebony: "#1B1009", ebony2: "#2E1B10",
  ivory: "#EBDDC4", ivoryHi: "#FAF2E2",
  ink: "#2A1A0E", inkSoft: "#B8A78C",
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
const TIER_DECAGON_PTS = (() => {
  const rx = 46, ry = 50;
  return Array.from({ length: 10 }, (_, i) => {
    const a = -Math.PI / 2 + i * (Math.PI / 5);
    return (50 + rx * Math.cos(a)).toFixed(2) + "," + (50 + ry * Math.sin(a)).toFixed(2);
  }).join(" ");
})();
function TierBadgeShape({ size, children }) {
  return (
    <div style={{ position: "relative", width: size, height: size, flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center" }}>
      <svg viewBox="0 0 100 100" width="100%" height="100%" style={{ position: "absolute", inset: 0 }}>
        <polygon points={TIER_DECAGON_PTS} fill="#FFFFFF" stroke="#D8CFB8" strokeWidth="2" />
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
// 이라는 요청 — App.jsx가 학습 탭 등 실제 UI 전반에서 이미 쓰고 있는 MASCOT_ART(플랫 벡터 일러스트,
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
            {ccBadge && <img src="/chess.com_Icon.png" alt="chess.com" title="chess.com 연동" style={{ width: 18, height: 18, borderRadius: 5, objectFit: "contain", marginLeft: 2 }} />}
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
  { Icon: GraduationCap, eyebrow: "학습", title: "엔진과 함께 배우기", shot: "/about/screenshot-study.webp", mascotChar: "milku", mascotExpr: "think", ccBadge: true,
    desc: "Stockfish 엔진의 실시간 분석과 함께 수를 두며 배워요. chess.com 계정을 연동하면 내가 실제로 둔 대국을 그대로 불러와, 어디서 무엇을 놓쳤는지 짚어줍니다.",
    quote: "네가 둔 수, 하나하나 같이 복기해 줄게." },
  { Icon: Library, eyebrow: "도감", title: "오프닝 나침반", shot: "/about/screenshot-dex.webp", mascotChar: "milku", mascotExpr: "wink",
    desc: "1.e4·1.d4·1.c4·1.Nf3 네 방향으로 뻗어나가는 오프닝 트리에서 각 수의 채택률·평가치·이름을 한눈에 살펴보세요. 이탈리안 게임, 루이 로페즈 같은 대표 오프닝은 별도 칭호로 모아둡니다.",
    quote: "이 갈래 끝에 뭐가 있는지, 같이 따라가 보자." },
  { Icon: Puzzle, eyebrow: "퍼즐", title: "내 실수로 만든 퍼즐", shot: "/about/screenshot-puzzle.webp", mascotChar: "kokoa", mascotExpr: "think",
    desc: "\"기물 희생하기\" · \"우위 점하기\" · \"실수 응징하기\" 세 테마로, 실전에서 나온 실수를 바탕으로 자동 생성되는 맞춤형 전술 퍼즐을 풀어보세요. 친구에게 퍼즐을 공유할 수도 있어요.",
    quote: "이 수, 정말 최선이었을까? 한번 찾아봐." },
  { Icon: Target, eyebrow: "퀘스트", title: "매일 조금씩", shot: "/about/screenshot-quest.webp", mascotChar: "kokoa", mascotExpr: "celebrate",
    desc: "매일 새로 갱신되는 일일 퀘스트와, 챕터별 퀴즈로 진행하는 메인 퀘스트를 완료하고 OC 나이트 코인을 모아보세요.",
    quote: "일일 퀘스트, 벌써 확인했어?" },
  { Icon: Wrench, eyebrow: "설정", title: "내게 맞게 조정하기", shot: "/about/screenshot-settings.webp", mascotChar: "milku", mascotExpr: "wink",
    desc: "정확도가 가장 높은 Stockfish 16과, 가볍고 빠른 Stockfish 18 Lite 중 기기에 맞는 분석 엔진을 골라보세요. 로그인하면 진도가 계정에 저장돼 어느 기기에서든 이어서 즐길 수 있어요.",
    quote: "빠르게 갈지, 정확하게 갈지 — 네가 골라." },
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
const POS_FOOLSMATE = { fen: "rnb1kbnr/pppp1ppp/8/4p3/6Pq/5P2/PPPPP2P/RNBQKBNR w KQkq - 1 3", move: { piece: "bQ", from: "d8", to: "h4" }, caption: "폴스 메이트 — 세계 최단 체크메이트 (단 2수)" };
const POS_SCHOLARSMATE = { fen: "r1bqkb1r/pppp1Qpp/2n2n2/4p3/2B1P3/8/PPPP1PPP/RNB1K1NR b KQkq - 0 4", move: { piece: "wQ", from: "h5", to: "f7" }, caption: "스칼라스 메이트 — 초보자 함정의 대명사" };
const POS_LEGALSTRAP = { fen: "rn1q1bnr/ppp1kB1p/3p2p1/3NN3/4P3/8/PPPP1PPP/R1BbK2R b KQ - 2 7", move: { piece: "wN", from: "c3", to: "d5" }, caption: "레갈의 함정 — 비숍을 미끼로 던지는 고전 트랩" };
const POS_FRIEDLIVER = { fen: "r1bq1b1r/ppp3pp/2n1k3/3np3/2B5/5Q2/PPPP1PPP/RNB1K2R w KQ - 2 8", move: { piece: "bK", from: "f7", to: "e6" }, caption: "프라이드 리버 어택 — 나이트 희생으로 왕을 끌어내다" };
const POS_IMMORTAL = { fen: "r1bk3r/p2pBpNp/n4n2/1p1NP2P/6P1/3P4/P1P1K3/q5b1 b - - 1 23", move: { piece: "wB", from: "d6", to: "e7" }, caption: "불멸의 게임 — 안더센 vs 키제리츠키, 1851" };
const POS_OPERA = { fen: "1n1Rkb1r/p4ppp/4q3/4p1B1/4P3/8/PPP2PPP/2K5 b k - 1 17", move: { piece: "wR", from: "d1", to: "d8" }, caption: "오페라 게임 — 모피 vs 브런즈윅 공작·이수아르 백작, 1858" };
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
const POS_ITALIAN = { fen: "r1bqkbnr/pppp1ppp/2n5/4p3/2B1P3/5N2/PPPP1PPP/RNBQK2R b KQkq - 3 3", move: { piece: "wB", from: "f1", to: "c4" }, caption: "이탈리안 게임" };
const POS_RUYLOPEZ = { fen: "r1bqkbnr/pppp1ppp/2n5/1B2p3/4P3/5N2/PPPP1PPP/RNBQK2R b KQkq - 3 3", move: { piece: "wB", from: "f1", to: "b5" }, caption: "루이 로페즈" };
const POS_SICILIAN = { fen: "rnbqkbnr/pp1ppppp/8/2p5/4P3/8/PPPP1PPP/RNBQKBNR w KQkq c6 0 2", move: { piece: "bP", from: "c7", to: "c5" }, caption: "시실리안 디펜스" };
const POS_GRUNFELD = { fen: "rnbqkb1r/ppp1pp1p/5np1/3p4/2PP4/2N5/PP2PPPP/R1BQKBNR w KQkq d6 0 4", move: { piece: "bP", from: "d7", to: "d5" }, caption: "그룬펠드 디펜스" };
const POS_FRENCH = { fen: "rnbqkbnr/pppp1ppp/4p3/8/4P3/8/PPPP1PPP/RNBQKBNR w KQkq - 0 2", move: { piece: "bP", from: "e7", to: "e6" }, caption: "프렌치 디펜스" };
const POS_CAROKANN = { fen: "rnbqkbnr/pp1ppppp/2p5/8/4P3/8/PPPP1PPP/RNBQKBNR w KQkq - 0 2", move: { piece: "bP", from: "c7", to: "c6" }, caption: "카로칸 디펜스" };
const POS_QUEENSGAMBIT = { fen: "rnbqkbnr/ppp1pppp/8/3p4/2PP4/8/PP2PPPP/RNBQKBNR b KQkq c3 0 2", move: { piece: "wP", from: "c2", to: "c4" }, caption: "퀸즈 갬빗" };
const POS_KINGSGAMBIT = { fen: "rnbqkbnr/pppp1ppp/8/4p3/4PP2/8/PPPP2PP/RNBQKBNR b KQkq f3 0 2", move: { piece: "wP", from: "f2", to: "f4" }, caption: "킹스 갬빗" };
const OPENING_DECO_LIST = [POS_ITALIAN, POS_RUYLOPEZ, POS_SICILIAN, POS_GRUNFELD, POS_FRENCH, POS_CAROKANN, POS_QUEENSGAMBIT, POS_KINGSGAMBIT].map(famousDeco);
function FamousOpeningsSection() {
  return (
    <section>
      <Reveal>
        <div className="flex items-center justify-center gap-2" style={{ marginBottom: 6 }}>
          <Library size={14} color={T.brass} />
          <span style={{ fontSize: 11, fontWeight: 800, color: T.brass, letterSpacing: ".08em" }}>OPENING</span>
        </div>
        <h3 style={{ fontSize: 21, fontWeight: 900, color: T.ivoryHi, margin: "0 0 8px", textAlign: "center" }}>체스 역사에 남은 유명한 오프닝들</h3>
        <p style={{ fontSize: 13, color: T.inkSoft, lineHeight: 1.75, margin: "0 0 26px", textAlign: "center", maxWidth: 520, marginLeft: "auto", marginRight: "auto" }}>
          이탈리안 게임부터 킹스 갬빗까지 — 도감 탭에서 만나볼 수 있는 대표 오프닝의 정석 수순을 실제 기보 그대로 체스보드에 재현했어요.
        </p>
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
    { key: "iron", label: "아이언", img: "/iron-pawn.png" },
    { key: "bronze", label: "브론즈", img: "/bronze-knight.png" },
    { key: "silver", label: "실버", img: "/silver-bishop.png" },
    { key: "gold", label: "골드", img: "/gold-rook.png" },
    { key: "diamond", label: "다이아몬드", img: "/diamond-queen.png" },
    { key: "master", label: "마스터", img: "/master-king.png" },
    { key: "grandmaster", label: "그랜드마스터", img: "/gm-piece.png" },
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
              <motion.img src="/gm-trophy-web.webp" alt="그랜드마스터 트로피" loading="lazy" animate={{ y: [0, -9, 0] }} transition={{ duration: 3.6, repeat: Infinity, ease: "easeInOut" }}
                style={{ width: "100%", display: "block", filter: "drop-shadow(0 14px 24px rgba(0,0,0,.6))" }} />
            </motion.div>
            <div style={{ flex: "1 1 300px", minWidth: 260 }}>
              <div className="flex items-center gap-2" style={{ marginBottom: 8 }}>
                <Crown size={15} color="#E8C6FF" />
                <span style={{ fontSize: 11, fontWeight: 800, letterSpacing: ".08em", background: GM_AURORA, WebkitBackgroundClip: "text", backgroundClip: "text", color: "transparent" }}>최종 티어</span>
              </div>
              <h3 style={{ fontSize: 23, fontWeight: 900, color: T.ivoryHi, margin: "0 0 10px" }}>그랜드마스터</h3>
              <p style={{ fontSize: 13, color: T.inkSoft, lineHeight: 1.75, margin: "0 0 16px" }}>
                아이언에서 시작해 여섯 단계를 모두 넘어야 도달하는 일곱 번째, 마지막 티어예요.
              </p>
              <div style={{ marginBottom: 16 }}>
                <div style={{ fontSize: 11, fontWeight: 800, color: T.brassHi, letterSpacing: ".04em", marginBottom: 6 }}>달성 조건</div>
                <p style={{ fontSize: 12.5, color: T.ivory, lineHeight: 1.75, margin: 0 }}>
                  퍼즐을 풀어 누적 <b style={{ color: T.brassHi }}>200,000 XP</b>를 모으면(아이언→브론즈→실버→골드→다이아몬드→마스터 순서로 전부 돌파) 도달해요. 그 뒤로도 XP는 계속 쌓이고, <b style={{ color: T.brassHi }}>100,000 XP</b>마다 프레스티지 별(★)이 하나씩 더해져요.
                </p>
              </div>
              <div style={{ marginBottom: 16 }}>
                <div style={{ fontSize: 11, fontWeight: 800, color: T.brassHi, letterSpacing: ".04em", marginBottom: 6 }}>그랜드마스터만의 혜택</div>
                <ul style={{ margin: 0, paddingLeft: 18, fontSize: 12.5, color: T.ivory, lineHeight: 1.85 }}>
                  <li>오로라처럼 일렁이는 전용 그러데이션 배지와, 끝없이 쌓이는 프레스티지 별(★) 카운터로 한눈에 구분돼요.</li>
                  <li>코인으로는 살 수 없는 전용 체스보드·기물 스킨이 티어 달성과 동시에 자동으로 해금돼요 — 상점에서 바로 장착할 수 있어요.</li>
                  <li>친구 목록·유저 검색·티어 리더보드 어디서든 그랜드마스터는 골드빛 테두리와 왕관 아이콘으로 항상 강조되어 보여요.</li>
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
        <CountStat value={7} label="티어 단계" />
        <CountStat value={4} label="오프닝 갈래" />
        <CountStat value={3} label="퍼즐 테마" />
        <CountStat value={100} suffix="%" label="무료로 시작" />
      </div>
    </Reveal>
  );
}

// (v0.1.4 기능) "chess.com 연계 통계·분석 기능도 소개해 달라"는 요청 — 실제로 학습 탭·도감 탭·설정
// 탭에 이미 있는 chess.com 연동 기능(대국 자동 동기화·게임 리뷰 정확도·레이팅 변화·오프닝별 승률)을
// 별도 섹션으로 모아 chess.com 아이콘과 함께 소개한다.
function CCStatTile({ label, sub, delay }) {
  return (
    <motion.div initial={{ opacity: 0, y: 16, scale: 0.9 }} whileInView={{ opacity: 1, y: 0, scale: 1 }} viewport={{ once: false, amount: 0.4 }} transition={{ duration: 0.45, delay, ease: [0.22, 0.9, 0.32, 1] }}
      whileHover={{ y: -4, transition: { duration: 0.2 } }}
      className="flex flex-col items-center" style={{ gap: 8, flex: "1 1 140px", minWidth: 140, padding: "18px 14px", borderRadius: 14, background: "rgba(0,0,0,.22)", border: "1px solid #4A3521" }}>
      <img src="/chess.com_Icon.png" alt="" style={{ width: 28, height: 28, objectFit: "contain" }} />
      <span style={{ fontSize: 12.5, fontWeight: 800, color: T.ivoryHi, textAlign: "center" }}>{label}</span>
      <span style={{ fontSize: 11, color: T.inkSoft, textAlign: "center", lineHeight: 1.55 }}>{sub}</span>
    </motion.div>
  );
}
const CC_TILES = [
  { label: "대국 자동 동기화", sub: "chess.com 계정만 연결하면 실제로 둔 대국이 그대로 들어와요." },
  { label: "게임 리뷰 정확도", sub: "chess.com과 같은 방식의 정확도(%)로 내 대국을 채점해요." },
  { label: "레이팅 변화 그래프", sub: "래피드·블리츠·불릿별로 대국마다 오르내린 레이팅을 보여줘요." },
  { label: "오프닝별 승률 통계", sub: "도감의 각 수마다 이 오프닝을 실전에서 얼마나, 어떻게 뒀는지 보여줘요." },
];
function ChessComSection() {
  return (
    <section>
      <Reveal>
        <div className="flex items-center justify-center gap-2" style={{ marginBottom: 6 }}>
          <img src="/chess.com_Icon.png" alt="" style={{ width: 18, height: 18, borderRadius: 4 }} />
          <span style={{ fontSize: 11, fontWeight: 800, color: T.brass, letterSpacing: ".08em" }}>CHESS.COM 연동</span>
        </div>
        <h3 style={{ fontSize: 21, fontWeight: 900, color: T.ivoryHi, margin: "0 0 8px", textAlign: "center" }}>내가 실제로 둔 대국까지 함께 분석해요</h3>
        <p style={{ fontSize: 13, color: T.inkSoft, lineHeight: 1.75, margin: "0 0 22px", textAlign: "center", maxWidth: 520, marginLeft: "auto", marginRight: "auto" }}>
          설정 탭에서 chess.com 아이디만 연결하면, 실전에서 둔 수만큼 도감이 해금되고 내 정확도·레이팅 변화까지 한눈에 볼 수 있어요.
        </p>
      </Reveal>
      <div className="flex flex-wrap items-stretch justify-center" style={{ gap: 12 }}>
        {CC_TILES.map((t, i) => <CCStatTile key={t.label} {...t} delay={i * 0.08} />)}
      </div>
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
function IntroPage() {
  return (
    <div>
      {/* (about 페이지 기능) ilust-1을 화면 맨 위 전체 폭 배너로 옮겼다 — 히어로보다 먼저 보이는
          첫 인상이 되도록. 배경 이미지답게 등장은 한 번만 페이드인하고, 그 안에서는 천천히
          확대·이동하는 카메라 무브(켄 번즈)를 무한 반복해 계속 움직이는 느낌을 준다(티어 여정
          지도 배경과 같은 연출). 하단 그러데이션으로 페이지 배경과 자연스럽게 이어붙인다. */}
      <div style={{ position: "relative", width: "100%", overflow: "hidden", maxHeight: 340 }}>
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.7 }}>
          <motion.img src="/ilust-1-web.webp" alt="MILKU와 KOKOA의 대국" loading="lazy"
            animate={{ scale: [1, 1.08, 1], x: ["0%", "-2%", "0%"] }}
            transition={{ duration: 16, repeat: Infinity, ease: "easeInOut" }}
            style={{ width: "100%", display: "block", objectFit: "cover", maxHeight: 340 }} />
        </motion.div>
        <div aria-hidden="true" style={{ position: "absolute", inset: 0, background: "linear-gradient(180deg, transparent 55%, #1B1009 100%)", pointerEvents: "none" }} />
      </div>

      <div style={{ maxWidth: 1000, margin: "0 auto", padding: "40px 20px 72px" }}>
      <section className="flex items-center flex-wrap" style={{ gap: 36, marginBottom: 8 }}>
        <div style={{ flex: "1 1 320px", minWidth: 280 }}>
          <Reveal><div className="flex items-center gap-2" style={{ marginBottom: 12 }}>
            <Sparkles size={14} color={T.brass} />
            <span style={{ fontSize: 12, fontWeight: 800, color: T.brass, letterSpacing: ".08em" }}>무료 체스 오프닝 학습·연습 애플리케이션</span>
          </div></Reveal>
          <Reveal delay={0.05}><h1 style={{ fontSize: 36, fontWeight: 900, color: T.ivoryHi, lineHeight: 1.28, margin: "0 0 16px" }}>오프닝을 배우고,<br />내 실수를 퍼즐로<br />복습하세요.</h1></Reveal>
          <Reveal delay={0.1}><p style={{ fontSize: 14, color: T.inkSoft, lineHeight: 1.75, margin: "0 0 26px", maxWidth: 440 }}>
            엔진 분석 기반 학습, 오프닝 트리 도감, 실전 실수에서 자동 생성되는 전술 퍼즐, 퀘스트와 티어 시스템까지 — MILKU·KOKOA와 함께 체스를 더 깊이 익혀보세요.
          </p></Reveal>
          <Reveal delay={0.15}><a href="/" className="press" style={{ display: "inline-flex", alignItems: "center", gap: 8, padding: "13px 24px", borderRadius: 999, background: "linear-gradient(180deg," + T.brass + ",#A8842F)", color: "#241509", fontWeight: 800, fontSize: 14, textDecoration: "none", boxShadow: "0 4px 0 #7A5E22" }}>
            무료로 시작하기 <ArrowRight size={16} />
          </a></Reveal>
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
        <SpeechBubble mascot={{ char: "milku", expr: "wink" }} name="MILKU 코치">
          안녕하세요! 저는 MILKU예요. OpenChess에서는 그냥 체스를 두는 게 아니라, 왜 그 수가 좋았는지·나빴는지까지 함께 살펴봐요. 아래에서 하나씩 소개해 드릴게요.
        </SpeechBubble>
      </section>

      <SectionDivider />

      <section className="flex flex-col" style={{ gap: 52 }}>
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

      <section>
        <Reveal>
          <div className="flex items-center gap-2" style={{ marginBottom: 6, justifyContent: "center" }}>
            <Crown size={16} color={T.brassHi} />
            <span style={{ fontSize: 11, fontWeight: 800, color: T.brass, letterSpacing: ".08em" }}>티어</span>
          </div>
          <h3 style={{ fontSize: 21, fontWeight: 900, color: T.ivoryHi, margin: "0 0 8px", textAlign: "center" }}>아이언부터 그랜드마스터까지</h3>
          <p style={{ fontSize: 13, color: T.inkSoft, lineHeight: 1.75, margin: "0 0 24px", textAlign: "center", maxWidth: 480, marginLeft: "auto", marginRight: "auto" }}>
            랭크 게임처럼 7단계 티어로 나뉜 경험치 시스템이에요. 퍼즐을 풀수록 경험치가 쌓이고 티어가 오릅니다.
          </p>
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
          <SpeechBubble mascot={{ char: "kokoa", expr: "happy" }} name="KOKOA 코치" align="right">
            친구를 추가하고 채팅하며, 서로 얼마나 풀었는지·어떤 칭호를 얻었는지 프로필에서 확인해 보세요. 퍼즐을 공유하면 친구가 풀었을 때 저도 경험치를 조금 나눠 받아요.
          </SpeechBubble>
        </div>
        <motion.div initial={{ opacity: 0, scale: 0.85, rotate: 5 }} whileInView={{ opacity: 1, scale: 1, rotate: 0 }} viewport={{ once: false, amount: 0.4 }} transition={{ duration: 0.55, ease: [0.22, 0.9, 0.32, 1] }}
          style={{ flex: "0 0 auto", width: 190, maxWidth: "100%", margin: "0 auto", borderRadius: 16, overflow: "hidden", ...GLOSS_BORDER }}>
          <FloatImg src="/ilust-2-web.webp" alt="MILKU와 KOKOA의 악수" delay={0.4} />
        </motion.div>
      </section>

      <Reveal>
        <div style={{ maxWidth: 280, margin: "40px auto 0", borderRadius: 16, overflow: "hidden", ...GLOSS_BORDER }}>
          <FloatImg src="/ilust-3-web.webp" alt="마주 앉아 대국을 두는 MILKU와 KOKOA" delay={0.8} />
        </div>
        <p style={{ textAlign: "center", fontSize: 12, color: T.inkSoft, marginTop: 10 }}>오늘도 누군가는 다음 수를 고민합니다.</p>
      </Reveal>

      <Reveal delay={0.05}>
        <section className="flex items-center flex-wrap" style={{ gap: 28, marginTop: 64, padding: "36px 28px", borderRadius: 18, background: "linear-gradient(160deg,#3A2516,#20140B)", ...GLOSS_BORDER, justifyContent: "space-between" }}>
          <div style={{ flex: "1 1 260px", minWidth: 220 }}>
            <h3 style={{ fontSize: 20, fontWeight: 900, color: T.ivoryHi, margin: "0 0 8px" }}>지금 바로 시작해 보세요</h3>
            <p style={{ fontSize: 13, color: T.inkSoft, margin: 0 }}>가입 없이 게스트로도 바로 둘러볼 수 있어요.</p>
          </div>
          <div className="flex items-center" style={{ gap: 18 }}>
            <Mascot char="kokoa" expr="celebrate" size={64} />
            <a href="/" className="press" style={{ display: "inline-flex", alignItems: "center", gap: 8, padding: "13px 24px", borderRadius: 999, background: "linear-gradient(180deg," + T.brass + ",#A8842F)", color: "#241509", fontWeight: 800, fontSize: 14, textDecoration: "none", boxShadow: "0 4px 0 #7A5E22", whiteSpace: "nowrap" }}>
              무료로 시작하기 <ArrowRight size={16} />
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
  feature: { label: "기능", Icon: Sparkles, color: "#8FB55E" },
  ui: { label: "UI", Icon: Palette, color: "#6FA8DC" },
  ux: { label: "UX", Icon: MousePointer, color: "#B98CFF" },
  perf: { label: "성능", Icon: Zap, color: T.brassHi },
  fix: { label: "버그 수정", Icon: Wrench, color: "#E0995F" },
  security: { label: "보안", Icon: Shield, color: "#D9736A" },
};
const VERSION_HISTORY = [
  {
    version: "0.2.8", date: "2026.8.2",
    summary: "MILKU·KOKOA가 정석 수를 뺀 거의 모든 수에 구체적인 이유(MEC)를 짚어줘요 — 교환 요청·재전개·예방 수·과보호·잠재 위협·되잡기·교환 희생·연결·중첩 같은 새 개념부터, 탁월한 수의 희생 종류와 엔진 수순 근거까지 훨씬 자세히 설명해줘요. 애니메이션이 있는 설명은 이제 실제 용어에만 밑줄이 생겨요. 체크메이트로 몰아가는 수순에서는 메이트까지 몇 수 남았는지 바로 알려주고, 엔진 추천 수 줄이 3개가 아니라 2개만 뜨던 문제도 근본 원인을 찾아 고쳤어요.",
    mascot: {
      intro: { char: "kokoa", expr: "great", name: "KOKOA 코치", align: "left", text: "이제 교환 요청, 예방 수, 연결·중첩처럼 더 세밀한 개념으로 수를 설명해드려요! 애니메이션이 있는 설명은 이제 그 용어에만 밑줄이 생겨요." },
      outro: { char: "milku", expr: "happy", name: "MILKU 코치", align: "right", text: "단순히 되잡는 수는 이제 '유일한 수'라고 놀라워하지 않고, 기물 상황을 유지했다고 담백하게 알려드려요." },
    },
    highlight: { kind: "icon", Icon: Sparkles, color: T.brassHi, label: "MILKU·KOKOA 코멘트 강화" },
    sections: [
      { cat: "feature", items: [
        "룩 2개 또는 나이트 2개가 서로 지켜주는 '연결'(룩이 오픈·세미오픈 파일에서 세로로 연결되면 '중첩')을 새로 알려주고, 눌러보면 서로를 향한 화살표가 차례로 나타나요.",
        "위협받던 기물을 지키는 '위협 대처' 설명에도 밑줄이 생겼어요 — 눌러보면 상대 공격자와 제 수비자 화살표가 차례로 나타나요. 과보호 애니메이션의 색도 진짜 상대 공격자는 빨강, 제 기물은 초록으로 바로잡았어요.",
        "위협·위협 대처·과보호·예방 수·연결·중첩처럼 애니메이션이 있는 설명은 이제 문장 전체가 아니라 그 용어 하나에만 밑줄이 생기고, 그 단어를 눌러야만 애니메이션이 재생돼요.",
        "엔진 추천 수 줄이 3개가 아니라 2개만 뜨고 다시 늘어나지 않던 문제의 근본 원인을 찾았어요 — 이제 요청한 줄 수가 전부 나올 때까지 기다렸다가 멈추도록 고쳤어요(학습 탭·게임 리뷰 둘 다).",
        "단순히 상대 기물을 되잡는 수는 더 이상 '유일한 수'로 표시하지 않고, '상대 기물을 되잡아서 기물 상황을 유지했다'고 알기 쉽게 설명해줘요.",
        "룩으로 상대의 지켜진 나이트·비숍을 교환하거나 그렇게 교환되도록 두는 수를 '교환 희생'으로 짚어주고, 쉽지 않은 선택이지만 지금 상황에선 탁월한 선택이라고 설명해줘요.",
        "체크메이트로 몰아가는 강제 수순에 들어가면, 기물 위협 설명 대신 메이트까지 몇 수 남았는지 바로 알려줘요.",
        "과보호 설명에도 밑줄이 생겼어요 — 눌러보면 그 기물을 지키는 이유가 된 상대 공격자들이 화살표로 차례로 나타나요.",
        "예방 수 설명에도 밑줄이 생겼어요 — 눌러보면 지키던 칸에 금빛 테두리가 뜨고, 상대가 노리던 진입 경로가 빨간 화살표로, 그걸 막은 제 대응이 초록 화살표로 나타나면서 빨간 화살표는 옅어지며 사라져요.",
        "과보호 설명에서 아직 한 번도 안 움직인 기물(퀸 등)이 실제로 지켜지는 폰을 제치고 잘못 뽑히던 문제를 고쳤어요.",
        "모바일 게임 리뷰 화면의 기보 줄을 스와이프로 빠르게 좌우로 넘길 수 있어요.",
        "엔진 추천 수 줄이 끝까지 안 써지던 문제의 진짜 원인을 찾아 고쳤어요 — 게임 리뷰를 열어도 그 밑에 있던 학습·퍼즐 화면이 배경에서 계속 엔진을 쓰고 있었던 게 문제였어요, 이제 리뷰가 열려 있는 동안은 그 화면들의 실시간 분석을 멈추고 엔진을 리뷰에 전부 양보해요.",
        "엔진 추천 수 줄이 특정 수순에서 조용히 끊기던 또 다른 진짜 원인(앙파상이 낀 예상 수순 처리 누락)을 찾아 고쳤어요.",
        "상대 기물을 잡는 수에는 더 이상 '재전개(재배치)' 설명이 붙지 않아요 — 캡처는 자리를 찾아가는 것과는 다른 목적이니까요.",
        "리뷰 화면에서 자유롭게 다른 수를 둬 봐도, 실제로 둔 수와 똑같이 MEC 설명이 붙어요.",
        "기물이 걸렸을 때 이제 정확히 어느 칸의 기물인지 좌표로 알려줘요.",
        "탁월한 수를 두면 방금 옮긴 기물뿐 아니라, 지금 상대에게 안전하게 잡힐 수 있는 다른 기물까지 전부 빨간 화살표로 한눈에 보여줘요.",
        "예방 수 설명에 이제 상대가 노리던 칸의 좌표를 직접 알려줘요. 과보호는 여러 기물이 후보일 때 상대 공격자가 많은 기물부터, 공격자 수가 같으면 더 값진 기물부터 짚어줘요.",
        "수 설명 중 '위협' 문구에는 밑줄이 생겼어요 — 눌러보면 그 기물을 노리는 내 공격자와 상대 수비자 화살표가 차례로 나타났다가 잠시 후 사라져요.",
        "MILKU·KOKOA의 코멘트가 훨씬 세밀해졌어요 — 같은 가치의 기물끼리 마주 보면 '위협'이 아니라 '교환 요청'으로, 그 요청을 잡거나 물리면 '수락/거절'로 표현하고, 같은 기물을 여러 번 움직여도 좋은 자리를 찾아간 거면 '재전개(재배치)'로, 상대가 특정 칸에 오는 걸 막기 위해 미리 자리를 잡거나 컨트롤을 늘렸으면 '예방 수'로 짚어줘요. 기물을 처음 전개하는 수, 캐슬링 전용 평가, 위협받지 않았는데 미리 보강하는 '과보호', 아직 잡을 순 없지만 공격자를 하나 더 늘린 '잠재 위협', 룩의 오픈/세미오픈 파일 배치, 다음 수 캐슬링 예고, 폰 희생까지 새로 알려줘요.",
        "나이트·비숍이 애써 전개했다가 시작 칸으로 그대로 되돌아가거나, 상대 폰에게 쫓겨 사실 한 수면 갈 수 있었던 자리에 두 수를 들여 도착하면 그 비효율을 짚어줘요.",
        "탁월한 수 설명이 훨씬 자세해졌어요 — 어떤 기물을 내주는 희생인지, 걸린 기물을 그대로 두고 더 큰 이득을 노린 수인지, 퀸이 아닌 다른 기물로 승진한 수인지부터 밝히고, 이후 수순을 분석해서 실제로 기물 점수를 되찾는 수순을 찾을 수 있으면 그걸 자세히, 못 찾으면 장기적으로 상대를 압박해 유리해지는 이유를 알려줘요. 이미 불리한 상황에서 무승부를 노린 희생이면 왜 그래야 했는지도, 최선의 수는 아니지만 감각적으로 찾은 수라면 그 사실도 짚어줘요.",
        "MILKU·KOKOA가 정석 수를 뺀 거의 모든 수에 '지금 이 수가 실제로 뭘 위협하는지·뭘 지키는지' 같은 구체적인 이유(MEC)를 짚어줘요 — 걸려 있던 기물을 피했으면 '회피', 피하면서 상대 기물까지 노렸으면 '반격', 폰끼리 서로 노려보고 있으면 '서로 폰을 노리고 있어요', 폰을 교환했으면 중앙 쪽으로 잡았는지까지 알려주고, 같은 상황도 매번 문구를 조금씩 다르게 말해줘요. 특히 유일한 수는 다른 후보를 뒀다면 상대가 어떻게 응징했을지, 탁월한 수는 희생 이후 무엇을 노릴 수 있는지, 블런더는 걸린 기물이 무엇인지까지 훨씬 자세히 알려줘요.",
        "공짜로 잡을 수 있는 상대 기물을 잡지 않아도, 그 수가 여전히 좋은 수면 '기물을 잡지 않았지만 여전히 좋은 수예요'라고 알려줘요. 그 기물을 잡는 게 사실 최선이었다면 그 사실까지 짚어줘요.",
        "기물을 교환하는 수에도 상황에 맞는 설명을 붙여줘요 — 유리할 때 교환은 게임을 쉽게 풀어가는 좋은 방법이라고, 불리할 때 교환은 원래 피하는 게 좋지만 이 교환이 불가피한 최선이었는지 알려주고, 반대로 상황에 안 맞는 교환이었다면 '목적을 갖고 교환해야 한다'고 짚어줘요.",
        "퍼즐 풀이 화면의 말풍선도 막연한 안내 대신 걸린 기물을 짚어주는 실질적인 힌트로 바뀌었어요.",
        "chess.com 레이팅 변동 그래프에서, 고른 기간 동안 그 시간 규정 대국이 없어도 그래프가 사라지지 않고 마지막으로 두었을 때의 레이팅을 점선으로 이어서 보여줘요.",
      ] },
      { cat: "ux", items: [
        "게임 리뷰 화면의 기보 줄 드래그 스크롤이 정해진 만큼씩 뻑뻑하게 움직이던 문제를 고쳤어요 — 이제 손가락·마우스 움직임에 그대로 반응하는 부드러운 스크롤이에요.",
      ] },
      { cat: "fix", items: [
        "실제로는 이기고 있는데 기물 교환에 대해 '지고 있을 때는 피하는 게 좋다'고 말하던 문제, 정상적으로 기물을 교환한 것뿐인데 '지켜야 한다'고 잘못 경고하던 문제, 폰이 한 칸만 전진해도 실질적인 이득(예: 상대 기물을 쫓아냄)이 있으면 '두 칸 갈 수 있었다'고 지적하지 않고, 정말 낭비였을 때만 그 수에 딱 한 번 짚어주도록 고쳤어요.",
        "엔진 추천 수 줄이 끝까지 다 써지지 않고 중간에 멈춰 보이던 문제를 진짜로 마지막까지 고쳤어요.",
        "MILKU·KOKOA의 코멘트에서 조사(을/를, 이/가)가 어색하게 붙던 문제를 고쳤어요 — 기물 이름에 맞게 자연스럽게 붙어요.",
        "'전체' 레이팅 그래프에서 대국이 적은 시간 규정이 그냥 수직선 하나처럼 보이던 문제를 고쳤어요 — 이제 대국이 없는 구간은 그 시점 레이팅으로 평평하게 이어져요.",
        "퍼즐 창을 열었을 때 평가치 막대가 거의 안 움직이는 것처럼 보이던 문제를 고쳤어요 — 이제 눈에 보이게 실시간으로 움직여요.",
        "일일 퍼즐 캐러셀에서 컴퓨터 마우스로 카드를 눌러도 간헐적으로 반응이 없던 문제의 진짜 원인을 찾아 완전히 고쳤어요.",
      ] },
      { cat: "perf", items: [
        "일일 퍼즐 캐러셀의 미리보기 체스보드가 뜨는 시간을 조금 더 줄였어요.",
      ] },
    ],
  },
  {
    version: "0.2.7", date: "2026.7.29",
    summary: "일일 퍼즐 화면을 좌우로 스크롤하는 캐러셀로 새로 만들고, 이름도 다른 퍼즐과 똑같이 보여주도록 통일했어요. 퍼즐 모식도의 마지막 수 잘림, 평가치 막대가 안 움직이던 문제도 고쳤어요.",
    mascot: {
      intro: { char: "kokoa", expr: "great", name: "KOKOA 코치", align: "left", text: "일일 퍼즐 화면이 완전히 달라졌어요! 좌우로 스크롤해서 날짜를 골라보세요." },
      outro: { char: "milku", expr: "happy", name: "MILKU 코치", align: "right", text: "이제 일일 퍼즐도 다른 퍼즐과 똑같은 이름으로 나와요. 오늘 몇 명이 풀었는지도 바로 보여드릴게요!" },
    },
    highlight: { kind: "icon", Icon: Puzzle, color: T.brassHi, label: "일일 퍼즐 캐러셀 UI" },
    sections: [
      { cat: "ui", items: [
        "일일 퍼즐 화면을 좌우로 스크롤해서 날짜를 고르는 캐러셀로 완전히 새로 만들었어요 — 가운데로 스크롤해 고른 날짜의 퍼즐은 크게 보이고, 다른 날짜들은 작고 흐리게 물러나요. 컴퓨터에서는 마우스로 눌러 끌어도 넘길 수 있고, 선택되지 않은 카드도 예전보다 덜 어둡게 잘 보이도록 밝기를 조정했어요.",
      ] },
      { cat: "feature", items: [
        "캐러셀에서 선택된 날짜의 퍼즐 밑에는 그날 몇 명이 풀었는지('OOO명이 풀었습니다!')를 바로 보여줘요.",
        "일일 퍼즐 이름도 이제 다른 퍼즐들과 똑같은 방식(예: 'Italian Game, 4.Ng5')으로 보여줘요 — 예전처럼 이름 뒤에 '— 오늘의 퍼즐'이 따로 붙지 않아요.",
        "일일 퍼즐도 다른 퍼즐과 똑같이 고유 번호가 매겨져 채팅으로 공유하거나 '번호로 풀기'로 바로 열어볼 수 있어요.",
      ] },
      { cat: "fix", items: [
        "엔진이 아직 준비되지 않았을 때 잠깐 대신 보여주던, 실제로는 나온 적 없는 일일 퍼즐(폴즈메이트 등 미리 정해둔 짧은 퍼즐 4개)을 완전히 없앴어요 — 이제는 진짜 일일 퍼즐이 준비될 때까지 기다렸다가 보여줘요.",
        "채팅에서 '/puzzle 000000' 명령어로 존재하지 않는 번호를 보내려 하면, 이제 전송 자체가 되지 않고 그 번호의 퍼즐을 찾을 수 없다는 안내가 떠요.",
        "퍼즐 풀이 화면의 수순 모식도에서, 해결한 라인의 가장 마지막 수가 옆의 '라인 N' 표시에 밀려 글자가 잘려 보이던 문제를 고쳤어요.",
        "퍼즐 창을 열면 평가치 막대가 곧바로 살아 움직이며 지금 포지션을 다시 훑어봐요.",
        "일일 퍼즐 캐러셀에서 카드를 눌러도 반응이 없던 문제를 완전히 고쳤어요.",
        "퍼즐 힌트가 단계별로 겹쳐 보이던 문제를 고쳤어요 — 1단계는 도착 칸만, 2단계는 기물 흔들림만, 3단계는 기물 흔들림과 경로를 따라 칸이 빛나는 연출만 순서대로 독립적으로 보여줘요. 빛나는 칸도 둥글게 보이던 것을 칸 전체를 채우는 더 진한 금빛으로 바꿨어요.",
        "리뷰 화면에서 빠르게 수를 넘길 때 엔진 추천 수 줄이 끝까지 다 써지지 않고 중간에 멈춰 보이던 문제를 완전히 고쳤어요.",
      ] },
      { cat: "ui", items: [
        "일일 퍼즐 알림 창을 달력 다이어리 모양으로 새로 꾸몄어요 — 마스코트가 위에서 내려다보고, 날짜와 오늘의 오프닝·수·풀이수를 한눈에 보여줘요.",
      ] },
    ],
  },
  {
    version: "0.2.6", date: "2026.7.28",
    summary: "게임 리뷰 페이지에 들어가면 흰 화면만 나오던 심각한 문제를 고쳤어요. '탁월한 수' 판정을 더 정교하게 다듬고, 캐슬링 애니메이션·엔진 라인 타이핑 버그를 고쳤어요. 퍼즐 화면을 크게 개편하고, 채팅에 프로필 사진·멘션·명령어를 더했어요.",
    mascot: {
      intro: { char: "milku", expr: "great", name: "MILKU 코치", align: "left", text: "게임 리뷰 화면이 안 열리던 심각한 문제, 바로 고쳤어요! 이제 다시 편하게 복기할 수 있어요." },
      outro: { char: "kokoa", expr: "happy", name: "KOKOA 코치", align: "right", text: "퍼즐 화면이 완전히 새로워졌어요 — 힌트가 3단계로, 코치 말풍선이 지금 자리를 요약해줘요. 채팅에서 프로필 사진과 멘션, '/' 명령어도 써보세요!" },
    },
    highlight: { kind: "icon", Icon: Wrench, color: T.brassHi, label: "게임 리뷰 페이지 복구" },
    sections: [
      { cat: "fix", items: [
        "게임 리뷰(/review) 페이지에 들어가면 흰 화면만 나오던 심각한 문제를 고쳤어요 — 리뷰 화면이 다시 정상적으로 열려요.",
        "'탁월한 수' 판정을 더 정교하게 다듬었어요 — 방치된 것처럼 보이지만 사실 더 안전한 칸으로 피할 수 있는 기물이나, 잡아도 안전한 기물을 노린 수는 이제 제대로 탁월로 인정되고, 이미 희생한 기물의 점수를 회복해가는 후속 수는 더 이상 탁월로 중복 표시되지 않아요.",
        "집중 학습 미니보드에서 캐슬링(00, 000)을 재생할 때 킹만 움직이고 룩은 제자리에 멈춰 있던 문제를 고쳤어요 — 이제 킹과 룩이 함께 움직여요.",
        "엔진 추천 수 줄이 타이핑되다가 중간에 멈춰 보이던 문제를 고쳤어요. 줄이 길어져도 더 이상 마지막 수 쪽으로 자동으로 밀리지 않고, 다음 수가 항상 왼쪽에 붙어 보여요.",
        "수를 빠르게 연달아 두거나 포지션을 빠르게 넘길 때, 엔진 추천 수 줄 하나가 특정 지점에서 영영 멈춰 보이던 진짜 원인을 찾아 고쳤어요 — 직전 포지션의 계산 결과가 새 포지션의 결과에 섞여 들어가던 문제였어요.",
        "모바일에서 수 아이콘 설명, 채팅 롱프레스 메뉴, 알림 카드가 화면 가장자리에서 잘려 보이던 문제를 고쳤어요.",
        "'가장 많이 둔 오프닝'의 '백 n수'/'흑 n수' 표시가 실제 오프닝과 안 맞던 문제(백 1수인데 Italian Game이 뜨는 등)를 근본적으로 고쳤어요 — 이제 표시된 n수에서 실제로 그 오프닝에 도달하는지 정확히 확인해요.",
        "chess.com 통계가 아주 많은 계정에서 특정 시간 규정의 대국이 아예 안 보이던 문제의 진짜 원인을 찾아 고쳤어요 — 여러 번 방문할수록 데이터가 점점 완전해져요.",
        "대국이 아주 많은 계정에서 특정 시간 규정(예: 불릿) 그래프가 계속 안 그려지던 문제를 더 고쳤어요 — 달별 기록을 여러 개씩 한꺼번에 받아와 최근 데이터가 훨씬 빨리 채워지고, 아직 받아오는 중일 땐 '불러오는 중'이라고 알려줘요.",
        "'가장 많이 둔 오프닝'의 백/흑 배지가 서로 다른 n을 동시에 보여주던 문제를 고쳤어요 — 이제 두 배지는 항상 같은 n을 함께 보여줘요.",
      ] },
      { cat: "ux", items: [
        "도감, 기보, 엔진 추천 수 줄에서 마우스나 손가락으로 끌어 스크롤할 때 더 잘 반응하도록 감도를 높였어요.",
      ] },
      { cat: "ui", items: [
        "'자주 두는 수'와 집중 학습에 표시되는 모든 수에 새 서체를 적용했어요. 프로필 카드의 OpenChess 정보와 chess.com 통계 사이에 구분선과 헤더를 추가했고, 집중 학습의 chess.com 통계 카드도 프로필 카드와 같은 스타일로 통일했어요.",
        "'백 n수'/'흑 n수' 배지를 오프닝 이름 위 별도 줄로 옮기고 금색으로 통일했어요.",
        "레이팅 변동 그래프의 '전체' 모드 아래 색칠이 조금 더 반투명해졌고, 범례 글자를 줄여 항상 한 줄에 다 들어가도록 했어요. 그래프를 끌 때 뜨는 말풍선이 화살표 모양 마커나 점선을 가리지 않도록 옆으로 살짝 비켜 뜨고, 손을 떼면 크로스헤어가 바로 사라져요.",
        "퍼즐 탭의 해결 완료 목록도 미해결 목록처럼 오프닝별로 한 줄에 담아 옆으로 스크롤해서 볼 수 있어요.",
        "퍼즐 힌트 애니메이션을 다듬었어요 — 기물이 옆으로 흔들리던 것을 윗부분을 잡고 흔드는 것처럼 각도가 바뀌며 흔들리도록 바꿨고, 두어야 할 칸과 이동 경로 칸은 윤곽선 대신 금색 그라데이션으로 채워지며 목적지에 가까울수록 색이 진해져요. 3단계에서 힌트 버튼을 한 번 더 누르면 힌트가 사라지고 원래대로 돌아가요.",
      ] },
      { cat: "feature", items: [
        "가장 많이 둔 오프닝을 수순 대신 이름으로 보여주고, 그 아래 흑 레퍼토리 오프닝도 함께 보여줘요. 승/패/무를 승리/패배/무승부로 풀어 쓰고, 레이팅 변동을 결과 옆에 바로 붙여 보여줘요(예: 승리(+9)).",
        "퍼즐 화면을 크게 다듬었어요 — 해결한 퍼즐도 오프닝별로 묶어 보여주고, 좋아요·재게시·공유 아이콘을 더 크고 보기 좋게 재배치했어요. 코치 말풍선이 지금 자리를 요약해 설명해주고, PGN은 따로 스크롤되는 한 줄 박스로 분리됐어요. 보드 아래엔 평가치 바가 새로 생겼고, 힌트는 칸 반짝임 → 기물 흔들림 → 이동 경로 표시의 3단계로 완전히 새로워졌어요.",
        "채팅에서 연속으로 온 상대 메시지 묶음 첫 줄에 프로필 사진이 보이고 눌러서 프로필로 이동할 수 있어요. '@사용자명' 멘션은 굵게 표시되고 누르면 그 사람 프로필로 이동해요. '/'를 입력하면 명령어 자동완성이 떠요 — '/puzzle 000000'으로 원하는 퍼즐을 바로 공유할 수 있어요.",
        "chess.com 통계를 시간 규정뿐 아니라 흑/백으로도 나눠 볼 수 있게 됐어요. '전체 기간 전적'과 '최근 대국' 사이에 기간별 레이팅 변동 그래프가 추가됐어요.",
        "'자주 두는 첫 수'가 백/흑 두 박스가 나란히 놓인 모습으로 바뀌었어요 — 왼쪽엔 자주 두는 첫 수(백), 오른쪽엔 백의 각 첫 수에 대한 흑의 응수를 한눈에 볼 수 있어요. 프로필의 '통계' 헤더 문구도 더 짧아졌어요.",
        "레이팅 변동 그래프에 축·눈금선이 생기고, 그래프 아래가 은은하게 채워져요. 최근 1주/1달/6개월/1년 중 원하는 기간을 골라 볼 수 있어요. '전체'로 두면 래피드·블리츠·불릿 세 그래프를 색으로 구분해 한 화면에서 볼 수 있어요.",
        "학습 탭에서 같은 자리에 머물러 있어도 엔진이 상위 몇 수의 순위를 다시 매길 때마다 그 줄이 빈칸으로 돌아갔다 다시 써지길 반복하던 진짜 원인을 찾아 고쳤어요 — 이제 순위가 바뀌어도 이어서 자연스럽게 이어져요.",
        "다음 수 블록에 뜬 키워드(TOP LEVEL 등)와, 그 수를 실제로 둔 뒤 현재 수 블록에 뜨는 키워드가 서로 다르게 보이던 문제를 고쳤어요 — 이제 항상 똑같이 보여요.",
        "집중학습의 '이 수가 두어진 내 대국' 목록에도 시간 규정·진영 선택 박스가 생겼어요. 대국 보기·리뷰 버튼 크기도 통일했어요.",
        "모바일에서 집중학습에 들어가면 다음 수 블록 목록이 화면 밖으로 밀려 보이지 않던 문제를 고쳤어요 — 이제 미니보드 아래를 옆으로 넘기면(드래그 또는 ‹/› 버튼) 1페이지엔 chess.com 통계·마스터 대국이, 2페이지엔 다음 수 블록이 나와요.",
        "레이팅 변동 그래프가 더 커졌어요. 그래프를 누른 채 끌면 점선과 화살표로 그 지점의 날짜·레이팅을 바로 볼 수 있어요. 래피드는 빨강, 블리츠는 초록, 불릿은 파랑으로 색이 고정돼서 어느 화면에서 보든 항상 같은 색이에요. '전체'로 보면 세 그래프 아래가 반투명하게 채워지고, 겹치는 자리는 색이 더해져 밝게(다 겹치면 거의 흰색으로) 빛나요. 눈금선도 더 촘촘해지고 범례는 그래프 아래로 옮겼어요.",
        "레이팅 변동 그래프가 흑/백 필터에 영향받지 않도록 고쳤어요 — 레이팅은 어느 색으로 두든 합산되니까요. '가장 많이 둔 오프닝'에 몇 번째로 많이 둔 오프닝인지 보여주는 '백 n수'/'흑 n수' 표시를 되살렸고, 오프닝 이름 글자를 조금 줄여 긴 이름도 잘리지 않게 했어요. '자주 두는 첫 수'의 흑 응수 목록도 한 줄에 두 개씩 담아 더 짧고 좁게 보여줘요.",
        "chess.com 통계를 로그인할 때만 새로 불러오고, 새로고침하거나 다른 페이지에 다녀와도 저장해둔 정보를 그대로 보여줘요(대국이 아주 많은 계정은 매번 불러오는 데 시간이 오래 걸렸었어요) — 최근에 끝난 실시간 대국만 그 위에 새로 얹어 갱신돼요.",
      ] },
    ],
  },
  {
    version: "0.2.5", date: "2026.7.24",
    summary: "엔진 추천 수 줄과 기보가 길 때 컴퓨터에서 마우스로 끌어도 스크롤이 잘 안 되던 문제, 계산이 깊어질수록 줄이 멈춘 것처럼 보이던 문제를 고쳤어요.",
    mascot: {
      intro: { char: "milku", expr: "great", name: "MILKU 코치", align: "left", text: "엔진 추천 수 줄과 기보가 화면보다 길 때, 이제 컴퓨터에서도 마우스로 편하게 끌어서 뒷부분까지 볼 수 있어요!" },
      outro: { char: "kokoa", expr: "happy", name: "KOKOA 코치", align: "right", text: "엔진이 계속 더 깊게 생각하며 줄이 길어지는 동안엔 화면이 자동으로 따라가고, 스크롤하려다 손을 뗐는데 실수로 수가 그대로 둬지거나 다른 수로 넘어가던 것도 이제 안 그래요." },
    },
    highlight: { kind: "icon", Icon: MousePointer, color: T.brassHi, label: "엔진 라인·기보 마우스 드래그 스크롤" },
    sections: [
      { cat: "fix", items: [
        "엔진 추천 수 줄과 학습 탭 상단 기보 줄이 화면 폭보다 길 때, 컴퓨터에서 마우스로 끌어도 좌우로 잘 스크롤되지 않아 뒷부분이 계속 가려져 있던 문제를 고쳤어요 — 이제 마우스·터치 모두 같은 방식으로 끌어서 볼 수 있어요.",
        "엔진이 수를 계속 더 깊게 계산하며 줄이 점점 길어질 때, 화면은 그대로인 채 뒷부분만 안 보이는 곳에서 계속 이어지고 있어 마치 멈춘 것처럼 보이던 문제를 고쳤어요 — 이제 새로 나오는 수를 계속 따라가며 화면이 자동으로 넘어가요.",
        "스크롤하려고 줄을 끌다가 손을 뗐을 때 실수로 그 수가 그대로 둬지거나(엔진 라인), 기보의 엉뚱한 수로 넘어가던(기보) 문제도 함께 고쳤어요.",
      ] },
      { cat: "ui", items: [
        "엔진 추천 수 줄 뒷부분에 아직 안 보이는 수순이 남아 있으면 오른쪽 끝에 옅은 그림자를 표시해 더 볼 내용이 있다는 걸 알려줘요.",
        "티어 여정 지도의 배경 그림을 화질이 더 좋은 새 파일로 교체했어요(아이언 배경도 다시 생겼어요).",
      ] },
    ],
  },
  {
    version: "0.2.4", date: "2026.7.24",
    summary: "게임 리뷰와 학습 탭이 각각 다른 엔진을 쓰도록 나누고 여러 속도·정확도 문제를 고쳤어요. 일일 퍼즐을 리체스 퍼즐 데이터베이스 기반으로 새로 만들었어요.",
    mascot: {
      intro: { char: "milku", expr: "great", name: "MILKU 코치", align: "left", text: "게임 리뷰는 항상 같은 엔진으로 공정하게, 학습 탭은 원하는 엔진으로 골라 쓸 수 있게 나눴어요 — 리뷰 여는 속도도 훨씬 빨라졌어요!" },
      outro: { char: "kokoa", expr: "happy", name: "KOKOA 코치", align: "right", text: "일일 퍼즐이 이제 리체스 데이터베이스에서 와요 — 2주마다 새 오프닝 테마로 바뀌고, 지난 날짜 퍼즐도 다시 풀 수 있어요!" },
    },
    highlight: { kind: "icon", Icon: Puzzle, color: T.brassHi, label: "리체스 퍼즐 DB 기반 오늘의 퍼즐" },
    sections: [
      { cat: "feature", items: [
        "게임 리뷰는 이제 항상 Stockfish 16(사람 최상급 수준으로 세기 제한)으로 고정되고, 학습·퍼즐 등 나머지 분석은 Stockfish 18 Lite(기본) 또는 17.1 중 설정 탭에서 골라 쓸 수 있어요.",
        "집중 학습 화면의 수 체계 아이콘이 더 깊은 수까지 내다보고 판정돼요(최대 5초 동안 판정이 점점 더 정확해지며 바뀔 수 있어요).",
        "일일 퍼즐을 리체스 퍼즐 데이터베이스 기반으로 새로 만들었어요 — 2주마다 새로운 오프닝 테마로 바뀌고, 지난 날짜의 퍼즐도 다시 풀어볼 수 있어요. 풀면 기존 퍼즐과 똑같이 경험치를 얻어요. 개발자는 미래 날짜의 퍼즐을 PGN으로 직접 지정할 수도 있어요.",
      ] },
      { cat: "perf", items: [
        "게임 리뷰를 여는 속도가 빨라졌어요 — 앱을 켜 두면 미리 준비해 두고, 다시 열 때 필요 없는 중복 준비 과정을 없앴어요.",
        "학습 탭·게임 리뷰에서 긴 기보를 빠르게 넘겨도 이전 위치 계산이 밀려 있지 않고 바로바로 지금 위치가 계산돼요.",
      ] },
      { cat: "fix", items: [
        "게임 리뷰에서 최선의 수를 뒀는데도 평가치가 흔들려 보이던 문제, 리뷰 화면에서 직접 둬본 추천 수가 다른 등급으로 잘못 매겨지던 문제를 고쳤어요.",
        "엔진이 추천하는 수가 타이핑되다가 중간에 멈춰 보이던 문제를 고쳤어요.",
      ] },
      { cat: "ui", items: [
        "학습 탭 다음 수 블록들이 평가치 순위가 바뀌면 순간이동하지 않고 부드럽게 자리를 바꿔요.",
      ] },
    ],
  },
  {
    version: "0.2.3", date: "2026.7.24",
    summary: "'탁월한 수' 판정을 더 정교하게 다듬고, 긴 대국에서 뒤로 갈수록 느려지던 문제를 근본적으로 고쳤어요. 스테일메이트·3회 동형 반복 무승부를 새로 인식하고, 개발자가 마스터 대국을 직접 등록할 수 있게 됐어요.",
    mascot: {
      intro: { char: "milku", expr: "great", name: "MILKU 코치", align: "left", text: "이번엔 속도와 정확도 둘 다 잡았어요 — 긴 기보를 넘길 때 더 이상 느려지지 않고, '탁월한 수' 판정도 훨씬 정교해졌어요!" },
      outro: { char: "kokoa", expr: "happy", name: "KOKOA 코치", align: "right", text: "스테일메이트나 3번 반복되는 자리는 이제 정확히 무승부로 인식해요 — 더 이상 헷갈릴 일 없어요." },
    },
    highlight: { kind: "icon", Icon: Zap, color: T.brassHi, label: "긴 대국에서도 항상 일정한 속도" },
    sections: [
      { cat: "fix", items: [
        "'탁월한 수' 판정을 4가지 상황에 맞춰 다듬었어요 — 방치된 내 기물과 맞먹는 상대 기물을 안전하게 반격만 하는 수(진짜 트레이드 제안일 뿐인 수)는 더 이상 탁월로 뜨지 않아요. 반대로 기물의 보호자가 옮겨져서 처음 위험해지는 경우나, 체크를 동반한 희생은 이제 탁월로 제대로 인정돼요.",
        "게임 리뷰에서 최선의 수를 뒀는데도 평가치가 잠깐 이상하게 바뀌었다 되돌아오던 문제를 고쳤어요.",
        "리뷰 페이지에서 자유롭게 둬본 수의 등급이 학습 탭과 다르게 매겨지던 문제를 고쳐, 이제 어디서 두든 같은 기준으로 채점돼요.",
        "일일 퍼즐 탭 첫 화면에 전날 퍼즐이 그대로 남아있던 버그를 고쳤어요 — 이제 매일 정확히 새 퍼즐로 갱신돼요.",
      ] },
      { cat: "perf", items: [
        "학습 탭·리뷰 페이지에서 긴 기보를 두거나 포지션을 빠르게 넘길 때 뒤로 갈수록 느려지던 문제를 근본적으로 고쳤어요 — 이제 대국이 아무리 길어져도 계산 속도가 늘 일정해요.",
      ] },
      { cat: "feature", items: [
        "스테일메이트나 같은 자리가 3번 반복되면 이제 정확히 무승부로 인식하고 더 이상 수를 둘 수 없어요. 최근 대국 목록의 '무' 옆에는 스테일메이트·3회 동형 반복·합의 무승부 중 어떤 무승부인지도 작게 표시돼요.",
        "티어를 승급하면 여정 지도에서 나이트 OC 코인을 보너스로 받아요.",
        "마스터 대국에 없는 유명한 대국을 개발자가 직접 등록할 수 있게 됐어요 — 대국 하나씩 추가하거나, 여러 대국이 담긴 PGN 파일을 한 번에 가져올 수도 있어요.",
      ] },
      { cat: "ui", items: [
        "티어 여정 지도의 닫기 버튼이 이제 화면 우상단에 고정돼 있어, 스크롤을 어디로 내려도 바로 닫을 수 있어요.",
        "학습 탭 메인 체스판에서 잡힌 기물·기물 점수 표시를 없애 더 깔끔해졌어요.",
        "집중 학습 미니보드에서 금색·빨간색 화살표가 겹쳐 보이던 걸 나란히 떨어뜨려 보여줘요.",
      ] },
    ],
  },
  {
    version: "0.2.2", date: "2026.7.23",
    summary: "학습 탭에서 엔진이 추천 수를 계산하는 시간을 크게 줄이고, 다음 수 블록에 뜬 수 체계 아이콘과 그 수를 실제로 뒀을 때 뜨는 아이콘이 달라 보이던 문제를 고쳤어요.",
    mascot: {
      intro: { char: "milku", expr: "great", name: "MILKU 코치", align: "left", text: "이제 학습 탭에서 엔진 추천 수(엔진 라인)가 훨씬 빨리 떠요 — 복잡한 자리에서도 0.5~0.7초면 라인이 확정돼서 기다리는 느낌이 거의 없을 거예요!" },
      outro: { char: "kokoa", expr: "wink", name: "KOKOA 코치", align: "right", text: "다음 수 블록에서 본 등급 아이콘이, 그 수를 두면 보드랑 현재 수 블록에도 똑같이 나와요 — 이제 헷갈릴 일 없어요." },
    },
    highlight: { kind: "icon", Icon: Zap, color: T.brassHi, label: "엔진 라인 계산 속도 개선" },
    sections: [
      { cat: "perf", items: [
        "학습 탭에서 엔진이 추천 수(엔진 라인)를 계산하는 시간을 크게 줄였어요 — 유독 오래 걸리던 복잡한 포지션에서도 0.5~0.7초 안에 충분히 깊은 라인으로 확정돼 기다리는 느낌이 사라졌어요. 라인은 예전처럼 계산이 깊어질 때마다 실시간으로 흐르며 나타나요.",
      ] },
      { cat: "fix", items: [
        "학습 탭에서 다음 수 블록에 뜬 수 체계 아이콘과, 그 수를 실제로 뒀을 때 체스판 도착칸·현재 수 블록에 뜨는 아이콘이 서로 다르게 보이던 문제를 고쳤어요 — 이제 블록에서 본 등급이 그대로 따라와, 어느 경로로 그 수에 도달하든 같은 아이콘으로 보여요.",
      ] },
      { cat: "feature", items: [
        "오늘의 퀘스트 두 번째 항목을 항상 ‘오늘의 퍼즐 풀기’로 고정했어요 — 퍼즐 탭 맨 위 오늘의 퍼즐을 풀면 바로 완료돼요.",
        "유저 검색의 티어 리더보드에 나 자신도(금색 윤곽선으로) 함께 표시되고, 상위 3명은 전용 순위 메달(골드·실버·브론즈)로 강조돼요.",
        "게임 리뷰 페이지에서 탁월한 수(언더프로모션 제외)가 나오면 체스판 위에 내 기물이 상대에게 어떻게 공격받는지 붉은색 화살표로 바로 보여줘요. 집중 학습 모드의 같은 화살표도 붉은색으로 통일했어요.",
        "연동된 chess.com 계정이 있으면 ‘자주 두는 첫 수’가 실제 대국 통계를 바탕으로 자동으로 채워져요.",
      ] },
      { cat: "ui", items: [
        "프로필 카드를 정돈했어요 — 티어는 흰 십각형 로고 하나만 두고 그 오른쪽에 금색 XP 게이지로 진척도를 보여줘요. 최근 대국은 진영을 색 막대로 표시하고 레이팅을 아이디에 붙여 적으며, chess.com 통계를 전체·래피드·블리츠·불릿으로 나눠 볼 수 있어요(일일·체스960 제외). 채팅 버튼은 이름 옆으로 옮기고, 최근 대국을 5판·25판 단위로 넘겨 볼 수 있어요.",
        "퍼즐 탭에서 미해결 퍼즐을 오프닝별 점선 영역으로 묶어 가로로 넘겨 보고, 다른 사람의 풀이 정보가 잘리지 않게 별도 줄로 보여줘요. 수 체계 칩도 한 줄에 깔끔히 들어가요.",
        "학습 탭의 제안 화살표가 이제 이론 수뿐 아니라 모든 후보 수 중 상위 3수를 보여주고, 평가치순/채택률순 선택에 따라 화살표 두께·투명도가 실제로 달라져요.",
        "게임 리뷰의 코치 설명에서 탁월한 수를 두면 어떤 기물을 희생했는지 콕 짚어 알려주고, 평가치 박스도 흰색/검은색으로 더 또렷하게 보여요.",
      ] },
      { cat: "ux", items: [
        "프로필의 ‘가장 많이 둔 오프닝’을 백의 첫 수 하나로 고정하지 않고, 백 1~6번째 수 각각에서 가장 많이 둔 수를 번갈아 애니메이션하며 보여줘요.",
        "도감 오프닝 모식도에서 수 블록을 누르면 뜨는 설명 카드가 이제 블록을 가리지 않고 말풍선처럼 이어져 나오고, 모바일에서는 카드 크기가 65% 수준으로 아담해졌어요.",
        "도감 오프닝 트리 정중앙의 회로 칩을 누르면 전기 효과음과 함께, 칩이 잠깐 과충전된 뒤 이어진 모든 선과 블록으로 전류가 퍼져나가는 연출이 재생돼요.",
        "그랜드마스터 보드 스킨에 은은한 광택이 주기적으로 지나가는 애니메이션을 더했어요.",
        "설정 탭 사운드 카드의 배경음악·효과음 설명 문구를 정리해 더 깔끔해졌어요.",
      ] },
      { cat: "perf", items: [
        "소개 페이지(/about)의 ‘유명한 오프닝들’ 갤러리에서 여러 보드가 함께 움직일 때 애니메이션이 버벅이던 문제를 고쳐, 스크롤도 애니메이션도 부드러워졌어요.",
      ] },
    ],
  },
  {
    version: "0.2.1", date: "2026.7.23",
    summary: "게임 리뷰 보드에서 이제 원하는 수를 자유롭게 둬볼 수 있고, 수 체계 아이콘을 누르면 등급 설명까지 말풍선으로 볼 수 있어요. 평가치 그래프·엔진 추천 수도 더 정확하고 매끄러워졌어요.",
    mascot: {
      intro: { char: "milku", expr: "wink", name: "MILKU 코치", align: "left", text: "게임 리뷰 보드에서 이제 학습 탭처럼 원하는 수를 자유롭게 둬볼 수 있어요 — 실제로 둔 수와 똑같이 평가치와 코치 설명까지 다 보여드릴게요!" },
      outro: { char: "kokoa", expr: "happy", name: "KOKOA 코치", align: "right", text: "수 체계 아이콘이 궁금했다면 한번 눌러보세요 — 그 등급이 어떤 수인지 말풍선으로 바로 설명해드려요." },
    },
    highlight: { kind: "icon", Icon: MousePointer, color: "#B98CFF", label: "리뷰 보드 자유 탐색" },
    sections: [
      { cat: "feature", items: [
        "게임 리뷰 보드에서 실제 기보에 없는 수를 자유롭게 둬볼 수 있어요 — 그 수에도 평가치·수 체계 아이콘·최선 수 제안·코치 설명이 실제로 둔 수와 똑같이 따라와요.",
        "게임 리뷰뿐 아니라 학습 탭·퍼즐의 수 체계 아이콘도 누르면 그 등급이 어떤 조건일 때 매겨지는지 말풍선으로 설명해줘요.",
        "게임 리뷰 요약 화면에서 두어지지 않은 수 등급도, 오프닝·엔드게임 단계도 항상 보여주고, 단계 아이콘을 누르면 그 구간의 정확도를 말풍선으로 알려줘요.",
        "게임 리뷰 보드에 연동한 chess.com 프로필 사진을 표시하고, 그랜드마스터 대국에도 초록색 즉시 리뷰 버튼을 추가했어요.",
        "평가치 그래프의 점을 수 체계에 맞춰 정리하고, 그래프를 누르거나 드래그하면 그 시점의 평가치를 점선과 마커로 바로 확인할 수 있어요.",
        "세로 평가치 막대가 이제 모든 화면에서 보드 옆에 항상 보이고, 엔진이 추천하는 상위 수들이 실시간으로 변하며 타이핑되듯 나타나요.",
      ] },
      { cat: "ux", items: [
        "평가치 표시에서 +/- 부호 대신 유리한 쪽 위치로 유불리를 보여주고, 코치가 백의 수엔 MILKU, 흑의 수엔 KOKOA로 항상 등장해요.",
        "게임 리뷰에서 뒤로가기를 누르면 항상 원래 들어왔던 화면(검색·프로필·마스터 대국 등)으로 돌아가요.",
        "게임 리뷰의 등급별 개수 숫자를 누르면 그 등급이 처음 나온 수로 바로 이동해요.",
        "코치 설명 카드에서 잘 안 쓰이던 Retry 버튼을 없애고, Show 버튼 아이콘을 최선의 수를 뜻하는 별 모양으로 바꿨어요.",
      ] },
      { cat: "fix", items: [
        "평가치 그래프가 컴퓨터 화면에서 찌그러져 보이던 문제를 고쳤어요.",
        "체크메이트로 끝난 대국의 평가치가 이상한 숫자로 뜨던 문제를 고쳤어요.",
        "엔진이 추천하는 수들이 잠깐 완전히 겹쳐 보였다 사라지던 깜빡임 문제를 고쳤어요.",
      ] },
    ],
  },
  {
    version: "0.2.0", date: "2026.7.22",
    summary: "게임 리뷰를 chess.com 스타일의 전체화면 페이지로 새로 만들고, 일일 퍼즐과 개발자 기록을 추가했어요. 분석 엔진이 더 다양해지고, 무엇보다 훨씬 빨라졌어요.",
    mascot: {
      intro: { char: "milku", expr: "great", name: "MILKU 코치", align: "left", text: "드디어 게임 리뷰가 전용 화면으로 독립했어요! 요약부터 수순별 코치 리뷰까지, chess.com처럼 한눈에 볼 수 있어요." },
      outro: { char: "kokoa", expr: "celebrate", name: "KOKOA 코치", align: "right", text: "매일 자정 새로운 퍼즐이 기다리고 있어요 — 퍼즐 탭 맨 위에서 \"오늘의 퍼즐\"을 확인해보세요!" },
    },
    highlight: { kind: "icon", Icon: Sparkles, color: T.brassHi, label: "새 게임 리뷰 페이지" },
    sections: [
      { cat: "feature", items: [
        "게임 리뷰를 chess.com 스타일의 전체화면 /review 페이지로 새로 만들었어요 — 모바일은 요약 화면부터 수순별 코치 리뷰까지, 데스크톱은 보드와 Review/Analysis/Details/Openings 탭으로 나뉜 화면을 볼 수 있어요.",
        "일일 퍼즐 기능을 추가했어요 — 매일 자정 새로운 퍼즐로 바뀌고, 오늘 처음 접속했을 때와(그리고 오늘의 퀘스트를 아직 못 끝냈다면) 3시간마다 알림이 떠요.",
        "업데이트 공지가 이제 버전마다 최초 접속 시 딱 한 번만 뜨고, 설정 탭의 개발진 박스에서 지금까지의 모든 업데이트 기록과 참여 개발자를 \"개발자 기록\"으로 언제든 다시 볼 수 있어요.",
        "게임 리뷰와 프로필의 최근 대국 목록에서 백·흑 양쪽 플레이어의 실제 이름과 그 대국 당시 레이팅을 함께 보여줘요.",
        "게임 리뷰와 학습 탭의 체스판에 상대에게 잡힌 기물과 기물 점수 차이를 보여줘요(유리한 쪽에만 표시하고, 점수가 같으면 표시하지 않아요).",
        "분석 엔진을 더 다양하게 고를 수 있어요 — 기존 두 엔진에 더해 셋 중 가장 강력한 Stockfish 17.1을 새로 추가했어요.",
      ] },
      { cat: "perf", items: [
        "수를 둘 때 수 체계 아이콘이 확정되는 속도를 크게 줄였어요.",
        "게임 리뷰에 걸리는 시간을 크게 줄였어요.",
        "학습 탭의 후보 수 블록도 훨씬 빠르게 나타나고, 계산되는 동안 마스코트가 계산 중이라고 알려줘요.",
      ] },
      { cat: "ux", items: [
        "학습 탭의 \"분석\" 버튼을 누르면 이제 새로운 게임 리뷰 화면으로 바로 이동해요.",
      ] },
      { cat: "fix", items: [
        "평가치 막대의 도움말 아이콘이 백이 크게 우세할 때 흰 배경에 묻혀 안 보이던 문제를 고쳤어요.",
        "프로필에 연동한 chess.com 아이디가 실제 표기와 다른 대소문자로 보이던 문제를 근본적으로 고쳤어요.",
        "기물을 희생해 상대를 압박하는 탁월한 수 판정이 캐슬링·폰 이동에서는 전혀 작동하지 않던 문제를 고쳤어요.",
        "모바일에서 문의하기를 눌러도 메일 양식이 채워지지 않거나 메일 창 자체가 안 뜨던 문제를 고쳤어요.",
        "일일 퍼즐 알림과 업데이트 공지가 동시에 뜨면서 서로 겹쳐 공지를 닫을 수 없던 문제를 고쳤어요.",
      ] },
    ],
  },
  {
    version: "0.1.5", date: "2026.7.18",
    summary: "사이트 곳곳의 카드·목록에 부드러운 애니메이션을 더하고, 채팅에 실시간 타이핑 표시·메시지 수정/삭제·퍼즐 전달 기능을, 설정 탭에는 잔잔한 배경음악과 효과음을 추가했어요.",
    mascot: {
      intro: { char: "milku", expr: "wink", name: "MILKU 코치", align: "left", text: "이번엔 퍼즐·퀘스트·상점 카드들이 툭 튀어나오는 대신 하나씩 부드럽게 떠오르며 나타나요. 훨씬 매끄러워졌을 거예요!" },
      outro: { char: "kokoa", expr: "happy", name: "KOKOA 코치", align: "right", text: "설정 탭의 \"사운드\" 카드를 열어보세요 — 드뷔시의 \"달빛\"이 은은하게 흘러나오고, 수를 둘 때마다 나무 소리도 나요. 체스 두는 분위기에 잘 어울리죠?" },
    },
    highlight: { kind: "img", src: "/gm.png", label: "그랜드마스터 배지 복구" },
    sections: [
      { cat: "ux", items: [
        "퍼즐 탭 카드 목록, 퀘스트 탭 챕터·퀘스트 카드, 상점 탭 스킨 목록, 친구·검색 목록, 알림, 채팅 목록이 이제 하나씩 순서대로 부드럽게 떠오르며 나타나요.",
        "친구 요청을 수락·거절하거나 알림을 지우면, 사라지는 항목도 갑자기 없어지지 않고 부드럽게 줄어들며 퇴장해요.",
        "집중 학습에서 퍼즐이 자동으로 만들어지는 동안, 진행률 표시만 보여주던 것을 지금 찾아낸 수를 미니 보드로 미리 보여주는 것으로 바꿨어요 — 퍼즐이 실제로 만들어지는 과정을 눈으로 볼 수 있어요.",
        "채팅에서 상대방이 메시지를 입력하고 있으면 말풍선 점 3개가 통통 튀며 \"입력 중\"이라고 실시간으로 알려줘요.",
      ] },
      { cat: "feature", items: [
        "체스판에 나무 결 질감과 파일(a~h)·랭크(1~8) 좌표를 더했어요.",
        "체스판 장식에 폴스 메이트·스칼라스 메이트·레갈의 함정·프라이드 리버 어택·불멸의 게임(안더센 vs 키제리츠키, 1851)·오페라 게임(모피 vs 브런즈윅 공작·이수아르 백작, 1858) 같은 실제로 유명한 대국·오프닝 함정을 정확히 재현해서 보여줘요.",
        "chess.com 계정을 연동하면 무엇을 볼 수 있는지(대국 자동 동기화·게임 리뷰 정확도·레이팅 변화·오프닝별 승률) 소개하는 섹션을 새로 추가했어요.",
        "이 버전 기록에서 v0.1.2·v0.1.3 두 버전이 빠져 있던 것을 발견해 다시 채워 넣었어요.",
        "채팅에서 내가 보낸 메시지를 꾹 누르면 수정하거나 삭제할 수 있어요. 수정한 메시지에는 읽음 표시처럼 \"수정됨\"이 붙어요.",
        "채팅에 공유된 퍼즐 카드도 옆으로 당기면 보낸 시각이 보이고, 꾹 누르면 삭제하거나 \"전달\" 버튼으로 다른 친구에게 바로 다시 공유할 수 있어요.",
        "드뷔시의 \"달빛\"이 잔잔하게 흘러나오는 배경음악과, 블록을 클릭하거나 체스판에서 수를 둘 때(기물을 잡을 땐 다른 소리로) 나는 효과음을 추가했어요. 설정 탭의 \"사운드\" 카드에서 각각 켜고 끄고 음량도 세밀하게 조절할 수 있어요.",
      ] },
      { cat: "fix", items: [
        "그랜드마스터 티어 배지에 기물 대신 오로라 사진이 잘못 표시되던 오래된 문제를 완전히 해결했어요 — 헤더 배지·여정 지도·퍼즐 탭·승급 연출 전부 원래의 왕관 기물 이미지로 보여요.",
        "티어 여정 지도가 좁은 화면(모바일)에서 오른쪽으로 밀려 잘려 보이던 문제를 고쳤어요.",
        "퍼즐 풀이·카드의 \"공유\" 버튼 텍스트가 두 줄로 잘려 보이던 문제를 고쳤어요.",
        "계정을 바꾸거나 로그아웃해도 이전 계정의 퍼즐·프로필 기록이 화면에 그대로 남아있던 문제를 고쳤어요.",
      ] },
      { cat: "ui", items: [
        "이 페이지의 마스코트 그림을 학습 탭 등 다른 화면에서 이미 쓰던 깔끔한 그림체로 통일했어요.",
        "티어 여정 지도에서 그랜드마스터(마지막 티어)를 가운데로 길게 강조해 \"여기가 끝\"이라는 느낌을 살렸고, 티어별 배경이 경계에서 끊기지 않고 자연스럽게 이어지도록 다듬었어요. 안내 문구 대신 이정표 아이콘을 넣었어요.",
      ] },
    ],
  },
  {
    version: "0.1.4", date: "2026.7.18",
    summary: "소개 페이지에 유명 오프닝 갤러리와 그랜드마스터 카드를 추가하고, 그랜드마스터 전용 체스보드·기물 스킨을 실제로 선보여요.",
    mascot: {
      intro: { char: "milku", expr: "great", name: "MILKU 코치", align: "left", text: "이번엔 이탈리안 게임부터 그룬펠드 디펜스까지, 유명한 오프닝 8개를 실제 기보 그대로 체스보드 위에 재현해서 보여드려요!" },
      outro: { char: "kokoa", expr: "celebrate", name: "KOKOA 코치", align: "right", text: "그랜드마스터 티어까지 오르면 코인으로도 못 사는 전용 체스보드·기물 스킨이 자동으로 열려요 — 오로라 크리스탈 세트, 정말 근사하지 않나요?" },
    },
    highlight: { kind: "img", src: "/gm-trophy-web.webp", label: "그랜드마스터 카드 추가" },
    sections: [
      { cat: "feature", items: [
        "이탈리안 게임·루이 로페즈·시실리안 디펜스·그룬펠드 디펜스 등 유명한 오프닝 8개를 실제 정석 수순 그대로 체스보드에 재현한 갤러리를 새로 추가했어요.",
        "그랜드마스터 티어를 소개하는 카드를 추가했어요 — 달성 조건(누적 200,000 XP, 이후 100,000 XP마다 프레스티지 별)과 그랜드마스터만의 혜택을 한눈에 볼 수 있어요.",
        "그랜드마스터 티어에 도달하면 코인으로 살 수 없는 전용 체스보드·기물 스킨(오로라 크리스탈+대리석 세트)이 자동으로 해금돼요 — 상점에서 바로 장착할 수 있어요.",
        "친구 목록·유저 검색·티어 리더보드 어디서든 그랜드마스터는 골드빛 테두리와 왕관 아이콘으로 항상 강조되어 보여요.",
        "프로필의 \"오프닝별 승률\" 목록을 갈래마다 접었다 펼 수 있게 했어요 — 세부 변형이 많은 계정도 목록이 처음부터 너무 길어지지 않아요.",
        "퍼즐 이름을 \"오프닝 이름, 수\"(예: Italian Game, 4.Ng5) 형식으로 통일했어요.",
      ] },
      { cat: "ui", items: [
        "MILKU·KOKOA 일러스트 4장을 이 페이지 곳곳에 새로 배치했어요 — 맨 위 전체 폭 배너를 포함해 전부 계속 은은하게 움직여요.",
        "상단의 페이지 안내 바를 없애고, 화면 좌우 중단에 떠 있는 화살표 버튼으로 페이지를 넘기도록 바꿨어요.",
        "퍼즐 카드 위쪽 라벨에는 세부 갈래 대신 최상위 오프닝 이름만 짧게 보여요.",
        "헤더 로고 아래 버전 표기를 로고에 더 붙였고, 누르면 이 소개 페이지로 바로 이동해요.",
      ] },
      { cat: "fix", items: [
        "오프닝 이름이 길어도 퍼즐 카드 높이가 항상 균일하게 유지되도록, 넘치는 이름만 글자 크기가 자동으로 줄어들게 했어요.",
        "티어 여정 지도에서 스크롤이 특정 지점에 멈추면 등장 애니메이션이 깜빡이며 반복되던 문제를 고쳤어요.",
      ] },
    ],
  },
  {
    version: "0.1.3", date: "2026.7.17",
    summary: "학습 탭에 엔진 상위 3줄 분석을 추가하고, 티어 여정 지도와 소개 페이지를 훨씬 풍성하게 꾸몄어요.",
    mascot: {
      intro: { char: "milku", expr: "great", name: "MILKU 코치", align: "left", text: "이번 버전에서는 학습 탭 메인 보드에 엔진이 추천하는 상위 3줄을 바로 보여줘요. 어떤 수가 더 좋았는지 한눈에 비교해 보세요!" },
      outro: { char: "kokoa", expr: "happy", name: "KOKOA 코치", align: "right", text: "티어 여정 지도랑 이 소개 페이지도 훨씬 화려해졌어요. 스크롤하면서 천천히 구경해 보세요!" },
    },
    highlight: { kind: "shot", src: "/about/screenshot-study.webp", label: "엔진 상위 3줄 분석", tilt: -3 },
    sections: [
      { cat: "feature", items: [
        "학습 탭 메인 보드에 엔진이 추천하는 상위 3줄을 평가치와 함께 보여줘요. 줄을 누르면 그 수가 바로 보드에 놓여요.",
        "평가치 바를 소수점 둘째 자리까지, 유리한 쪽에 맞는 위치·색으로 표시해요.",
        "상단 기보를 옆으로 넘겨볼 수 있게 했고, 수가 늘어나면 자동으로 최신 수가 보이도록 스크롤돼요. 컴퓨터에서는 A/D 또는 </> 키로도 수를 넘길 수 있어요.",
        "프로필 버튼을 눌러 나오는 카드에도 메인 퀘스트 진척도와 푼 퍼즐 목록이 보여요.",
        "소개 페이지(/about)의 애니메이션을 훨씬 풍성하게 만들었어요 — 스크롤할 때마다 반복 재생되고, 실제 화면 스크린샷도 많이 넣었어요.",
        "티어 여정 지도를 새로 단장했어요 — 이미 지나온 구간은 노란 선과 초록 체크로 표시되고, 티어마다 어울리는 배경 이미지가 스크롤에 따라 나타나요. 잠금 아이콘은 없앴고 이미지는 항상 원래 색 그대로 보여요.",
      ] },
      { cat: "ui", items: [
        "퍼즐 공유 버튼을 더 잘 보이도록 진하게 바꿨어요.",
        "헤더의 티어 진행바를 없애 더 깔끔해졌어요(자세한 진행도는 로고를 눌러 여정 지도에서 볼 수 있어요). 모든 화면에서 회색 스크롤바도 안 보이게 했어요.",
      ] },
      { cat: "fix", items: [
        "프로필의 \"푼 퍼즐\" 블록이 찌그러져 보이던 문제를 고쳤고, 5개까지 옆으로 넘겨볼 수 있어요.",
        "퍼즐·도감 모식도에서 화면을 움직일 때 가끔 멈춰버리던 문제를 고쳤어요.",
        "퍼즐에서 컴퓨터의 응징 수 아이콘이 깜빡이던 문제를 고쳤고, 최선의 수 배지도 표시돼요.",
        "학습 탭에서 같은 수인데 위치마다 평가치가 조금씩 다르게 보이던 문제를 고쳐 항상 똑같이 보이도록 했어요.",
        "일부 안드로이드 기기에서 학습 탭 화면이 옆으로 밀려나 보드와 기보가 잘려 보이던 문제를 해결했어요.",
        "일부 일일 퀘스트에서 클리어 조건 기보가 안 보이던 문제를 고쳤어요.",
      ] },
    ],
  },
  {
    version: "0.1.2", date: "2026.7.16",
    summary: "퍼즐 오답 시 응징 수를 보여주고, 사이트를 소개하는 /about 페이지를 새로 만들었어요.",
    mascot: {
      intro: { char: "kokoa", expr: "think", name: "KOKOA 코치", align: "left", text: "이번엔 퍼즐에서 틀린 수를 두면, 상대가 그 수를 어떻게 응징하는지부터 보여드려요. 왜 틀렸는지 바로 알 수 있겠죠?" },
      outro: { char: "milku", expr: "wink", name: "MILKU 코치", align: "right", text: "그리고 지금 보고 계신 이 소개 페이지도 이번에 처음 만들어졌어요. 다음 버전들도 계속 여기서 소개할게요!" },
    },
    highlight: { kind: "shot", src: "/about/screenshot-puzzle.webp", label: "오답 응징 수 시연", tilt: 3 },
    sections: [
      { cat: "feature", items: [
        "퍼즐에서 틀린 수를 두면 곧장 원위치로 되돌리지 않고, 상대라면 그 수를 어떻게 응징했을지 최선의 응수를 먼저 보여준 뒤 되돌려요.",
        "퍼즐 모식도·도감 오프닝 트리에서 블록이 하나도 없는 빈 공간까지 드래그해서 넘어갈 수 없도록 했어요.",
        "일일 퀘스트 4개의 클리어 보상을 경험치 대신 OC 나이트 코인으로 받아요(전체 완료 보너스 50개는 그대로예요).",
        "사이트를 소개하는 페이지를 새로 만들었어요. 좌우로 넘기면서 핵심 기능 소개와, 지금까지의 모든 버전 업데이트 내역을 마스코트 설명과 함께 자세히 볼 수 있어요. 업데이트 소식 창의 \"업데이트 내역 자세히 보기\"를 누르면 바로 이동해요.",
      ] },
      { cat: "fix", items: [
        "일부 퀘스트에서 오프닝 이름 자리에 \"오프닝\"이라는 글자만 뜨던 문제를 고쳤어요.",
        "퍼즐에서 컴퓨터가 둔 첫 수의 아이콘이 잠깐 계산 중으로 보였다가 다른 표시로 바뀌던 문제를 고쳤어요.",
      ] },
      { cat: "ui", items: [
        "티어 로고 원의 크기를 줄이고 색을 사이트 톤에 맞는 금색으로 바꿨어요. 퍼즐 탭의 티어 표시도 더 작고 슬림하게 정리했어요.",
        "헤더의 경험치 게이지 위치를 로고 아래로 옮기고, 로고 밑에는 현재 버전을 작게 표시했어요.",
      ] },
    ],
  },
  {
    version: "0.1.1", date: "2026.7.16",
    summary: "티어 UI를 실제 이미지로 전면 개편하고, 자잘한 버그를 여럿 정리했어요.",
    mascot: {
      intro: { char: "milku", expr: "great", name: "MILKU 코치", align: "left", text: "짜잔! 이번엔 티어 화면을 통째로 다시 그렸어요. 아이언부터 그랜드마스터까지, 이제 전부 진짜 그림으로 만나보세요!" },
      outro: { char: "kokoa", expr: "celebrate", name: "KOKOA 코치", align: "right", text: "승급할 때 화면이 확 바뀌는 연출도 새로 넣었어요 — 직접 티어를 올려서 확인해 보세요!" },
    },
    highlight: { kind: "tierPromo" },
    sections: [
      { cat: "feature", items: [
        "퍼즐 카드·풀이 화면의 공유 아이콘을 \"공유 수 표시\"와 \"공유하기 액션\" 두 개로 나눴어요. 숫자만 보려던 분들이 실수로 공유 시트를 여는 일이 줄었어요.",
        "퍼즐이 테마 태그 두 개(예: 기물 희생하기 + 실수 응징하기)를 동시에 가지면 카드 배경이 두 테마 색을 절반씩 나눠 함께 보여줘요.",
        "티어 화면을 디자이너가 제작한 실제 기물 이미지로 전면 재설계했어요. \"아이언 V\"처럼 글자로 표기하던 부분이 전부 그림으로 바뀌었고, 헤더 배지·퍼즐 탭·여정 지도 전반에 적용돼요.",
        "티어가 오르면 화면 전체가 어두워지며 기존 티어가 옆으로 사라지고 새 티어가 등장하는 승급 연출이 나와요. 예전의 작은 토스트 알림을 대신해요.",
      ] },
      { cat: "fix", items: [
        "퍼즐 좋아요·리포스트를 취소해도 숫자가 줄지 않던 문제를 고쳤어요.",
        "채팅 버튼을 누르면 화면이 멈추던 문제를 해결했어요.",
        "누군가 먼저 올린 퍼즐 태그가 다른 사람이 같은 퍼즐을 올리면 사라지던 문제를 고쳤어요.",
        "안드로이드 크롬에서 홈 화면에 추가하면 파비콘 대신 글자 아이콘이 뜨던 문제를 해결했어요.",
      ] },
      { cat: "ui", items: ["도감 탭 오프닝 트리의 대표 이름표 위치를 다시 자연스럽게 조정했어요."] },
    ],
  },
  {
    version: "0.1.0", date: "2026.7.16",
    summary: "퍼즐을 친구에게 공유하고, 리포스트하고, 공개 프로필에서 서로의 기록을 볼 수 있게 됐어요.",
    mascot: {
      intro: { char: "kokoa", expr: "happy", name: "KOKOA 코치", align: "left", text: "이번 버전의 주인공은 \"공유\"예요. 마음에 드는 퍼즐을 친구에게 바로 보내보세요!" },
      outro: { char: "milku", expr: "great", name: "MILKU 코치", align: "right", text: "친구가 제가 보낸 퍼즐을 풀면요? 저한테도 경험치가 조금 돌아와요. 두근두근!" },
    },
    highlight: { kind: "shot", src: "/about/screenshot-puzzle.webp", label: "퍼즐 공유하기", tilt: -3 },
    sections: [
      { cat: "feature", items: [
        "퍼즐을 친구에게 공유할 수 있어요. 카드·풀이 화면의 종이비행기 아이콘을 누르면 친구 목록이 뜨고, 고른 친구와의 대화창에 퍼즐 미리보기 카드가 남아요. 카드의 \"퍼즐 풀러 가기\" 버튼으로 바로 그 퍼즐을 풀 수 있어요.",
        "친구가 내가 공유한 퍼즐을 풀면, 그 친구가 얻는 경험치의 10%를 저에게도 실시간으로 나눠 줘요 — 화면 중앙 알림과 대화 기록으로 확인할 수 있어요.",
        "퍼즐 리포스트 기능을 추가했어요. 리포스트한 퍼즐은 풀이수·좋아요 수와 무관하게 내 추천 퍼즐 후보에 가끔씩 다시 등장해요.",
        "설정 탭 내 프로필에서만 보이던 메인 퀘스트 진척도·푼 퍼즐 목록을 유저 검색·친구 프로필에서도 볼 수 있어요. 3개까지 미리 보여주고 \"더 보기\"로 전체를 볼 수 있어요.",
      ] },
      { cat: "ui", items: [
        "퍼즐 카드·풀이 화면에 리포스트 수·공유 수를 좋아요 수와 나란히 표시해요.",
        "퍼즐 테마 3종의 카드 배경 패턴을 실제 수 체계 배지와 같은 색·기호로 새로 디자인했어요 — 기물 희생하기는 민트색 \"!!\", 우위 점하기는 부식된 느낌의 \"?!\", 실수 응징하기는 빨강→주황 그라데이션의 파손된 \"?\"·\"??\".",
      ] },
      { cat: "fix", items: [
        "도감 탭에서 대표 오프닝(이탈리안 게임, 루이 로페즈 등) 이름표가 엉뚱한 위치에 붙어 보이던 문제를 해결해, 항상 그 오프닝이 시작되는 수 바로 위에 오도록 했어요.",
        "실수를 응징하는 수가 동시에 탁월한 수이기도 한 경우, 사실상 같은 퍼즐이 \"실수 응징하기\"와 \"기물 희생하기\"로 따로 만들어지던 문제를 해결했어요 — 이제 하나로 합쳐지고 두 테마가 함께 표시돼요.",
      ] },
    ],
  },
  {
    version: "0.0.6", date: "2026.7.15",
    summary: "레벨 시스템을 랭크 게임 같은 티어로 새로 만들고, 도감 탭의 고질적인 성능·안정성 문제를 근본적으로 해결했어요.",
    mascot: {
      intro: { char: "kokoa", expr: "happy", name: "KOKOA 코치", align: "left", text: "레벨을 아이언부터 그랜드마스터까지, 랭크 게임처럼 7단계 티어로 완전히 새로 만들었어요." },
      outro: { char: "milku", expr: "wink", name: "MILKU 코치", align: "right", text: "그리고 도감 탭이 버벅이던 오래된 문제도 이번에 뿌리를 뽑았어요. 이제 훨씬 부드러워요." },
    },
    highlight: { kind: "tierStrip" },
    sections: [
      { cat: "feature", items: [
        "레벨 시스템을 아이언~그랜드마스터, 각 5단계 티어로 새로 만들었어요. 헤더의 티어 배지를 누르면 전체 여정 지도를 볼 수 있고, 퍼즐 탭에서도 지금 티어와 다음 단계를 바로 확인할 수 있어요.",
        "유저 검색창을 열면 친구의 친구, 티어가 높은 플레이어를 바로 추천해 줘요.",
      ] },
      { cat: "perf", items: [
        "chess.com 대국이 아주 많은 계정에서 도감 탭 오프닝 트리가 심하게 버벅이던 문제를 해결했어요.",
        "학습 탭에서 수를 둘 때마다 나오는 실시간 평가 속도를 여러 배 끌어올렸어요.",
      ] },
      { cat: "ui", items: [
        "도감 탭 오프닝 검색을 개선했어요 — 이름에 포함된 오프닝이 전부 나오고, 더 유명한 오프닝이 위쪽에 먼저 보여요. 이동 애니메이션도 트리 선을 따라 자연스럽게 움직여요.",
        "퍼즐 탭 아이콘을 퍼즐 조각 모양으로 바꿨어요.",
        "내 프로필에서 메인 퀘스트 진척도·푼 퍼즐 정보가 chess.com 대국 기록보다 먼저 보이도록 순서를 바꿨어요.",
      ] },
      { cat: "fix", items: [
        "오프닝·퍼즐 모식도에서 확대·축소를 조절하면 트리 전체가 갑자기 안 보이던 문제를 해결했어요.",
        "도감 탭에서 특정 수를 클릭했을 때 화면이 심하게 흔들리거나, 드래그하면 트리가 통째로 사라지던 오래된 문제를 근본적으로 해결했어요.",
        "체스 규칙 두 가지를 바로잡았어요 — 폰이 한 칸씩 두 번 나눠 전진해도 앙파상이 가능한 것처럼 보이던 오류, 캐슬링 이후에도 여전히 가능한 것처럼 엔진이 착각하던 오류.",
        "설정 탭 내 프로필의 오프닝별 승률 목록에서 이름이 길고 깊이 중첩될 때 글자가 겹쳐 보이던 문제를 해결했어요.",
        "그 밖에도 학습 탭의 수 등급 판정, 로그인·로그아웃 시 데이터 처리, 알림 반영 등 자잘한 버그 여러 개를 함께 고쳤어요.",
      ] },
    ],
  },
  {
    version: "0.0.5", date: "2026.7.14",
    summary: "서버 보안을 강화하고, 알림·채팅이 실시간으로 갱신되도록 개선했어요.",
    mascot: {
      intro: { char: "kokoa", expr: "think", name: "KOKOA 코치", align: "left", text: "이번엔 눈에 보이지 않는 곳을 손봤어요 — 서버 쪽 보안 구멍 세 군데를 막았답니다." },
      outro: { char: "milku", expr: "wink", name: "MILKU 코치", align: "right", text: "알림이랑 채팅도 이제 실시간으로 훨씬 빠르게 와요." },
    },
    highlight: { kind: "icon", Icon: Shield, color: "#D9736A", label: "서버 보안 강화" },
    sections: [
      { cat: "security", items: [
        "다른 사람이 내 퍼즐 풀이수·좋아요 수를 마음대로 조작할 수 있던 문제를 해결했어요.",
        "다른 사람 이름으로 가짜 알림(칭호 획득, 레벨 업 등)을 보낼 수 있던 문제를 해결했어요.",
        "친구가 아닌 사람에게도 채팅을 보낼 수 있던 문제를 해결했어요.",
      ] },
      { cat: "perf", items: ["알림·친구 요청·채팅창이 폴링 대신 실시간(Realtime) 구독으로 훨씬 빠르게 갱신되도록 개선했어요."] },
    ],
  },
  {
    version: "0.0.4", date: "2026.7.13",
    summary: "게임 리뷰 속도를 크게 끌어올리고, 퍼즐 생성·풀이 과정의 버그를 여럿 고쳤어요.",
    mascot: {
      intro: { char: "milku", expr: "think", name: "MILKU 코치", align: "left", text: "게임 리뷰가 느리다는 얘기, 저도 들었어요. 그래서 이번엔 속도를 확 끌어올렸어요." },
      outro: { char: "kokoa", expr: "happy", name: "KOKOA 코치", align: "right", text: "퍼즐 만들다가 화면을 나가도 이제 처음부터 다시 안 만들어도 돼요." },
    },
    highlight: { kind: "shot", src: "/about/screenshot-study.webp", label: "학습 탭 실시간 분석", tilt: 3 },
    sections: [
      { cat: "perf", items: [
        "게임 리뷰(전체 기보 분석)가 느리게 느껴지던 문제를 해결해 훨씬 빠르게 결과를 볼 수 있어요.",
        "체스판에서 수를 둘 때마다 실시간 분석이 느려지던 문제를 개선했어요.",
      ] },
      { cat: "fix", items: [
        "모바일에서 오프닝 이름이 길면 잘려서 안 보이던 문제를 고쳤어요.",
        "퍼즐을 만드는 도중 다른 화면으로 이동하면 처음부터 다시 만들어야 했던 문제를 해결하고, 만드는 동안 진행 표시줄을 보여줘요.",
        "퍼즐 풀이 화면에서 실제로는 풀 수 없는 수가 함께 보이던 문제를 없앴어요.",
        "퍼즐에서 컴퓨터가 둔 첫 수의 표시가 금방 사라지던 문제를 고쳤어요.",
        "퍼즐을 풀다가 \"처음부터\"를 누르면 이미 살펴본 내용까지 사라지던 문제를 해결했어요.",
      ] },
    ],
  },
  {
    version: "0.0.3", date: "2026.7.13",
    summary: "도감 탭 오프닝 트리를 나침반 모양으로 새롭게 디자인했어요.",
    mascot: {
      intro: { char: "milku", expr: "wink", name: "MILKU 코치", align: "left", text: "도감 탭 오프닝 트리를 나침반처럼 동서남북으로 뻗어나가게 다시 그렸어요." },
      outro: { char: "kokoa", expr: "happy", name: "KOKOA 코치", align: "right", text: "트리가 그려지는 동안 화면이 흔들리던 것도 이번에 다 잡았어요." },
    },
    highlight: { kind: "shot", src: "/about/screenshot-dex.webp", label: "나침반형 오프닝 트리", tilt: -3 },
    sections: [
      { cat: "ui", items: ["도감 탭의 오프닝 트리를 1.e4·1.d4·1.c4·1.Nf3이 동서남북 네 방향으로 뻗어나가는 나침반 모양으로 새롭게 디자인했어요."] },
      { cat: "fix", items: [
        "트리가 그려지는 동안 화면이 흔들리거나 버벅이던 문제를 해결했어요.",
        "수를 클릭하면 뜨는 설명 카드가 화면을 확대·축소할 때 잘리거나 커지던 문제를 고쳤어요.",
      ] },
    ],
  },
  {
    version: "0.0.2", date: "2026.7.12",
    summary: "게임 리뷰가 느려지다 멈추던 문제를 해결했어요.",
    mascot: {
      intro: { char: "milku", expr: "think", name: "MILKU 코치", align: "left", text: "긴 대국을 리뷰하면 느려지다 멈추는 것 같았죠? 저도 답답했어요." },
      outro: { char: "kokoa", expr: "celebrate", name: "KOKOA 코치", align: "right", text: "이제 훨씬 정확하고 빠르게 계산해요. 확인해 보세요!" },
    },
    highlight: { kind: "icon", Icon: Zap, color: T.brassHi, label: "실시간 분석 성능 개선" },
    sections: [
      { cat: "fix", items: ["게임 리뷰(전체 기보 분석)가 기보가 길어질수록 느려지다 멈추는 것처럼 보이던 문제를 해결했어요."] },
      { cat: "perf", items: ["실시간 분석 성능을 개선해 더 정확하고 빠르게 계산하도록 했어요(지원 브라우저 한정)."] },
    ],
  },
  {
    version: "0.0.1", date: "2026.7.11",
    summary: "모바일 UI를 정리하고, 여러 화면의 자잘한 사용성을 다듬었어요.",
    mascot: {
      intro: { char: "milku", expr: "wink", name: "MILKU 코치", align: "left", text: "베타를 열고 나서 처음 받은 피드백들을 하나씩 다듬은 버전이에요." },
      outro: { char: "kokoa", expr: "happy", name: "KOKOA 코치", align: "right", text: "모바일 화면도, 로그인 창도 한결 매끄러워졌을 거예요." },
    },
    highlight: { kind: "shot", src: "/about/screenshot-quest.webp", label: "구석구석 다듬기", tilt: 3 },
    sections: [
      { cat: "ui", items: [
        "모바일 화면에서 상단 메뉴가 잘리던 문제를 고치고 전체적으로 더 깔끔하게 정리했어요.",
        "학습 탭의 체스판을 더 크게 키웠어요.",
        "상점·설정 탭의 화면을 정리했어요.",
        "로그인·회원가입 창에 부드러운 애니메이션을 추가했어요.",
      ] },
      { cat: "feature", items: [
        "대국 기록에 래피드·블리츠·불릿 같은 시간 규정과 레이팅 변화가 함께 표시돼요.",
        "도감 탭에 오프닝 이름을 함께 표시했어요.",
      ] },
      { cat: "ux", items: [
        "집중 학습 모드에서 원하는 수를 클릭하면 바로 그 수의 학습 화면으로 이동해요.",
        "검색할 때 입력하는 즉시 결과가 나타나도록 했어요.",
      ] },
      { cat: "fix", items: [
        "마스터 대국 기록이 안 보이던 문제를 고쳤어요.",
        "퍼즐 탭에서 퍼즐이 하단 메뉴에 가려지던 문제와, 모바일에서 추천 퍼즐이 안 뜨던 문제를 해결했어요.",
      ] },
      { cat: "perf", items: ["chess.com 계정을 연동할 때 대국이 많아도 더 빠르게 정보가 표시돼요."] },
    ],
  },
  {
    version: "0.0.0", date: "2026.7.10",
    summary: "OpenChess 베타 서비스를 시작했어요.",
    mascot: {
      intro: { char: "kokoa", expr: "celebrate", name: "KOKOA 코치", align: "left", text: "안녕하세요! OpenChess 베타를 시작합니다. 오프닝 학습이랑 퍼즐 풀이, 핵심만 먼저 들고 왔어요." },
      outro: { char: "milku", expr: "great", name: "MILKU 코치", align: "right", text: "앞으로 계속 다듬어 나갈게요. 잘 부탁드려요!" },
    },
    highlight: { kind: "icon", Icon: Rocket, color: "#8FB55E", label: "OpenChess 베타 출시" },
    sections: [
      { cat: "feature", items: ["OpenChess 베타 서비스를 시작했어요! 오프닝 학습과 퍼즐 풀이 핵심 기능을 먼저 선보이며, 앞으로 계속 다듬어 나갈게요."] },
    ],
  },
];
// (v0.1.2 기능) 참고 이미지처럼 "마스코트가 말풍선으로 설명하고, 그 아래 실제로 어떻게 보이는지
// 이미지·애니메이션으로 보여주는" 구성 — 버전마다 대표 기능 하나를 뽑아 아이콘 펄스, 실제 티어
// 이미지, 또는 승급 연출을 그대로 재현한 미니 데모로 보여준다.
const PROMO_TIERS = [
  { img: "/iron-pawn.png", label: "아이언 승급!" },
  { img: "/bronze-knight.png", label: "브론즈 승급!" },
  { img: "/silver-bishop.png", label: "실버 승급!" },
  { img: "/gold-rook.png", label: "골드 승급!" },
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
              {isLatest && <span style={{ fontSize: 10, fontWeight: 800, color: "#241509", background: "linear-gradient(180deg," + T.brass + ",#A8842F)", borderRadius: 999, padding: "2px 9px" }}>최신</span>}
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
const PAGES_META = [{ key: "intro", label: "소개" }, ...VERSION_HISTORY.map((v) => ({ key: v.version, label: "v" + v.version }))];

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
    <div style={{ position: "relative", height: "100vh", display: "flex", flexDirection: "column", background: "linear-gradient(180deg,#241509,#1B0F07 40%,#1B1009)", color: T.ivory, fontFamily: "'Noto Sans KR', sans-serif", overflow: "hidden" }}>
      <Backdrop />
      <header style={{ position: "relative", zIndex: 2, flexShrink: 0, borderBottom: "1px solid #000", background: "linear-gradient(180deg,#3A2516,#2A1810)" }}>
        <div className="flex items-center justify-between" style={{ maxWidth: 1000, margin: "0 auto", padding: "14px 20px" }}>
          <img src="/OpenChessLogo.png" alt="OpenChess" style={{ display: "block", height: 34, width: "auto", filter: "drop-shadow(0 2px 3px rgba(0,0,0,.5))" }} />
          <a href="/" className="press" style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "8px 16px", borderRadius: 999, background: "linear-gradient(180deg," + T.brass + ",#A8842F)", color: "#241509", fontWeight: 800, fontSize: 13, textDecoration: "none" }}>
            시작하기 <ArrowRight size={14} />
          </a>
        </div>
      </header>

      {/* (about 페이지 기능) 상단의 "< 소개 · 1/13 >" 안내 바 대신, 화면 좌우 중단에 떠 있는
          화살표 버튼으로 페이지를 넘긴다 — 콘텐츠를 가리지 않게 뷰포트 기준으로 고정하고, 페이지
          안쪽 스크롤과 무관하게 항상 세로 중앙에 머문다. 스와이프는 그대로 동일하게 동작한다. */}
      <button onClick={() => goTo(page - 1)} disabled={page === 0} className="press" aria-label="이전 페이지"
        style={{ position: "fixed", left: 14, top: "50%", transform: "translateY(-50%)", zIndex: 20, width: 42, height: 42, borderRadius: "50%", border: "1px solid " + T.brass, background: "rgba(27,16,9,.85)", backdropFilter: "blur(6px)", color: page === 0 ? T.inkSoft : T.brassHi, opacity: page === 0 ? 0.35 : 1, cursor: page === 0 ? "default" : "pointer", display: "inline-flex", alignItems: "center", justifyContent: "center", boxShadow: "0 4px 14px rgba(0,0,0,.4)" }}>
        <ChevronLeft size={20} />
      </button>
      <button onClick={() => goTo(page + 1)} disabled={page === total - 1} className="press" aria-label="다음 페이지"
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
