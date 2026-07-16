import React, { useState, useRef, useEffect, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  GraduationCap, Library, Puzzle, Target, Crown, Users, ArrowRight, Sparkles,
  Palette, MousePointer, Zap, Wrench, Shield, ChevronLeft, ChevronRight,
  Send, Compass, Rocket,
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
// (기존 TierLogoDisc와 동일한 브라스 그러데이션 원 — 마스코트 초상을 감싸는 원형 배경에 재사용)
const GOLD_DISC = {
  borderRadius: "50%",
  background: "radial-gradient(70% 70% at 32% 28%," + T.brassHi + "," + T.brass + " 68%,#8A6C2F 100%)",
  border: "1px solid #6E5424",
  boxShadow: "inset 0 1px 2px rgba(255,255,255,.5), inset 0 -3px 6px rgba(0,0,0,.25), 0 2px 6px rgba(0,0,0,.35)",
};

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
function Reveal({ children, delay = 0, y = 16, once = true }) {
  return (
    <motion.div initial={{ opacity: 0, y }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once, amount: 0.25 }} transition={{ duration: 0.55, delay, ease: [0.22, 0.9, 0.32, 1] }}>
      {children}
    </motion.div>
  );
}

// (기존 MascotBubble과 동일한 시각 언어 — 원형 초상 + 이름표 + 말풍선)
function SpeechBubble({ src, name, children, align = "left" }) {
  const avatar = <div style={{ width: 76, height: 76, flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center", ...GOLD_DISC }}><img src={src} alt="" style={{ width: 64, height: 64, objectFit: "contain" }} /></div>;
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

// 기능 소개 한 줄(이미지 액자 ↔ 텍스트, 좌우 번갈아 배치) — 참고 이미지의 "대사+삽화" 레이아웃을
// 그대로 빌리되, 액자·색은 사이트의 금색 광택(GLOSS_BORDER) 스타일을 그대로 쓴다.
function FeatureRow({ Icon, eyebrow, title, desc, quote, img, reverse }) {
  return (
    <div className="flex items-center flex-wrap" style={{ gap: 32, flexDirection: reverse ? "row-reverse" : "row" }}>
      <motion.div initial={{ opacity: 0, scale: 0.85, rotate: reverse ? 4 : -4 }} whileInView={{ opacity: 1, scale: 1, rotate: 0 }} viewport={{ once: true, amount: 0.4 }} transition={{ duration: 0.5, ease: [0.22, 0.9, 0.32, 1] }}
        style={{ flex: "0 0 auto", width: 200, maxWidth: "100%", margin: "0 auto" }}>
        <div style={{ position: "relative", borderRadius: 16, overflow: "hidden", ...GLOSS_BORDER, background: "linear-gradient(160deg,#3A2516,#20140B)", padding: 18, display: "flex", alignItems: "center", justifyContent: "center" }}>
          <img src={img} alt="" style={{ width: "100%", maxWidth: 150, filter: "drop-shadow(0 6px 14px rgba(0,0,0,.5))" }} />
        </div>
      </motion.div>
      <Reveal delay={0.1}>
        <div style={{ flex: "1 1 300px", minWidth: 260 }}>
          <div className="flex items-center gap-2" style={{ marginBottom: 8 }}>
            <span style={{ width: 30, height: 30, borderRadius: 9, background: "rgba(196,154,80,.15)", border: "1px solid " + T.brass, display: "inline-flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}><Icon size={15} color={T.brassHi} /></span>
            <span style={{ fontSize: 11, fontWeight: 800, color: T.brass, letterSpacing: ".08em" }}>{eyebrow}</span>
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
  { Icon: GraduationCap, eyebrow: "학습", title: "엔진과 함께 배우기", img: "/emoji/milku_9.png",
    desc: "Stockfish 엔진의 실시간 분석과 함께 수를 두며 배워요. chess.com 계정을 연동하면 내가 실제로 둔 대국을 그대로 불러와, 어디서 무엇을 놓쳤는지 짚어줍니다.",
    quote: "네가 둔 수, 하나하나 같이 복기해 줄게." },
  { Icon: Library, eyebrow: "도감", title: "오프닝 나침반", img: "/emoji/milku_3.png",
    desc: "1.e4·1.d4·1.c4·1.Nf3 네 방향으로 뻗어나가는 오프닝 트리에서 각 수의 채택률·평가치·이름을 한눈에 살펴보세요. 이탈리안 게임, 루이 로페즈 같은 대표 오프닝은 별도 칭호로 모아둡니다.",
    quote: "이 갈래 끝에 뭐가 있는지, 같이 따라가 보자." },
  { Icon: Puzzle, eyebrow: "퍼즐", title: "내 실수로 만든 퍼즐", img: "/emoji/kokoa_1.png",
    desc: "\"기물 희생하기\" · \"우위 점하기\" · \"실수 응징하기\" 세 테마로, 실전에서 나온 실수를 바탕으로 자동 생성되는 맞춤형 전술 퍼즐을 풀어보세요. 친구에게 퍼즐을 공유할 수도 있어요.",
    quote: "이 수, 정말 최선이었을까? 한번 찾아봐." },
  { Icon: Target, eyebrow: "퀘스트", title: "매일 조금씩", img: "/emoji/kokoa_7.png",
    desc: "매일 새로 갱신되는 일일 퀘스트와, 챕터별 퀴즈로 진행하는 메인 퀘스트를 완료하고 OC 나이트 코인을 모아보세요.",
    quote: "오늘의 퀘스트, 벌써 확인했어?" },
];

function TierStrip() {
  const tiers = [
    { key: "iron", label: "아이언", img: "/iron-pawn.png" },
    { key: "bronze", label: "브론즈", img: "/bronze-knight.png" },
    { key: "silver", label: "실버", img: "/silver-bishop.png" },
    { key: "gold", label: "골드", img: "/gold-rook.png" },
    { key: "diamond", label: "다이아몬드", img: "/diamond-queen.png" },
    { key: "master", label: "마스터", img: "/master-king.png" },
    { key: "grandmaster", label: "그랜드마스터", img: "/grandmaster.png" },
  ];
  return (
    <div style={{ overflowX: "auto", paddingBottom: 4 }}>
      <motion.div className="flex items-end" style={{ gap: 14, minWidth: 560, padding: "6px 2px 2px" }}
        initial="hidden" whileInView="show" viewport={{ once: true, amount: 0.3 }}
        variants={{ hidden: {}, show: { transition: { staggerChildren: 0.07 } } }}>
        {tiers.map((t, i) => (
          <motion.div key={t.key} className="flex flex-col items-center" style={{ gap: 6, flex: 1 }}
            variants={{ hidden: { opacity: 0, y: 20, scale: 0.7 }, show: { opacity: 1, y: 0, scale: 1 } }} transition={{ duration: 0.4, ease: [0.22, 0.9, 0.32, 1] }}>
            <div style={{ width: 56 + i * 3, height: 56 + i * 3, display: "flex", alignItems: "center", justifyContent: "center", ...GOLD_DISC }}>
              <img src={t.img} alt={t.label} style={{ width: "72%", height: "72%", objectFit: "contain" }} />
            </div>
            <span style={{ fontSize: 9.5, fontWeight: 800, color: T.brassHi, whiteSpace: "nowrap" }}>{t.label}</span>
          </motion.div>
        ))}
      </motion.div>
    </div>
  );
}

// 페이지1 — 소개(히어로+기능+티어+CTA). 기존에 만들어 둔 내용을 그대로 페이저의 첫 페이지로 옮겼다.
function IntroPage() {
  return (
    <div style={{ maxWidth: 1000, margin: "0 auto", padding: "56px 20px 72px" }}>
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
            <img src="/emoji/milku_2.png" alt="MILKU" style={{ width: "78%", height: "78%", objectFit: "contain", filter: "drop-shadow(0 10px 22px rgba(0,0,0,.55))" }} />
          </motion.div>
        </motion.div>
      </section>

      <SectionDivider />

      <section style={{ maxWidth: 640, margin: "0 auto 8px" }}>
        <SpeechBubble src="/emoji/milku_1.png" name="MILKU 코치">
          안녕하세요! 저는 MILKU예요. OpenChess에서는 그냥 체스를 두는 게 아니라, 왜 그 수가 좋았는지·나빴는지까지 함께 살펴봐요. 아래에서 하나씩 소개해 드릴게요.
        </SpeechBubble>
      </section>

      <SectionDivider />

      <section className="flex flex-col" style={{ gap: 52 }}>
        {FEATURES.map((f, i) => <FeatureRow key={f.title} {...f} reverse={i % 2 === 1} />)}
      </section>

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

      <SectionDivider />

      <section style={{ maxWidth: 640, margin: "0 auto" }}>
        <SpeechBubble src="/emoji/kokoa_3.png" name="KOKOA 코치" align="right">
          친구를 추가하고 채팅하며, 서로 얼마나 풀었는지·어떤 칭호를 얻었는지 프로필에서 확인해 보세요. 퍼즐을 공유하면 친구가 풀었을 때 저도 경험치를 조금 나눠 받아요.
        </SpeechBubble>
      </section>

      <Reveal delay={0.05}>
        <section className="flex items-center flex-wrap" style={{ gap: 28, marginTop: 64, padding: "36px 28px", borderRadius: 18, background: "linear-gradient(160deg,#3A2516,#20140B)", ...GLOSS_BORDER, justifyContent: "space-between" }}>
          <div style={{ flex: "1 1 260px", minWidth: 220 }}>
            <h3 style={{ fontSize: 20, fontWeight: 900, color: T.ivoryHi, margin: "0 0 8px" }}>지금 바로 시작해 보세요</h3>
            <p style={{ fontSize: 13, color: T.inkSoft, margin: 0 }}>가입 없이 게스트로도 바로 둘러볼 수 있어요.</p>
          </div>
          <div className="flex items-center" style={{ gap: 18 }}>
            <img src="/emoji/kokoa_2.png" alt="" style={{ width: 64, height: 64, objectFit: "contain", flexShrink: 0 }} />
            <a href="/" className="press" style={{ display: "inline-flex", alignItems: "center", gap: 8, padding: "13px 24px", borderRadius: 999, background: "linear-gradient(180deg," + T.brass + ",#A8842F)", color: "#241509", fontWeight: 800, fontSize: 14, textDecoration: "none", boxShadow: "0 4px 0 #7A5E22", whiteSpace: "nowrap" }}>
              무료로 시작하기 <ArrowRight size={16} />
            </a>
          </div>
        </section>
      </Reveal>
      <div style={{ textAlign: "center", padding: "28px 0 8px" }}><span style={{ fontSize: 11, color: T.inkSoft }}>© OpenChess</span></div>
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
    version: "0.1.1", date: "2026.7.16",
    summary: "티어 UI를 실제 이미지로 전면 개편하고, 자잘한 버그를 여럿 정리했어요.",
    mascot: {
      intro: { src: "/emoji/milku_6.png", name: "MILKU 코치", align: "left", text: "짜잔! 이번엔 티어 화면을 통째로 다시 그렸어요. 아이언부터 그랜드마스터까지, 이제 전부 진짜 그림으로 만나보세요!" },
      outro: { src: "/emoji/kokoa_9.png", name: "KOKOA 코치", align: "right", text: "승급할 때 화면이 확 바뀌는 연출도 새로 넣었어요 — 직접 티어를 올려서 확인해 보세요!" },
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
      intro: { src: "/emoji/kokoa_2.png", name: "KOKOA 코치", align: "left", text: "이번 버전의 주인공은 \"공유\"예요. 마음에 드는 퍼즐을 친구에게 바로 보내보세요!" },
      outro: { src: "/emoji/milku_10.png", name: "MILKU 코치", align: "right", text: "친구가 제가 보낸 퍼즐을 풀면요? 저한테도 경험치가 조금 돌아와요. 두근두근!" },
    },
    highlight: { kind: "icon", Icon: Send, color: "#8FB55E", label: "퍼즐 공유하기" },
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
      intro: { src: "/emoji/kokoa_3.png", name: "KOKOA 코치", align: "left", text: "레벨을 아이언부터 그랜드마스터까지, 랭크 게임처럼 7단계 티어로 완전히 새로 만들었어요." },
      outro: { src: "/emoji/milku_4.png", name: "MILKU 코치", align: "right", text: "그리고 도감 탭이 버벅이던 오래된 문제도 이번에 뿌리를 뽑았어요. 이제 훨씬 부드러워요." },
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
      intro: { src: "/emoji/kokoa_10.png", name: "KOKOA 코치", align: "left", text: "이번엔 눈에 보이지 않는 곳을 손봤어요 — 서버 쪽 보안 구멍 세 군데를 막았답니다." },
      outro: { src: "/emoji/milku_5.png", name: "MILKU 코치", align: "right", text: "알림이랑 채팅도 이제 실시간으로 훨씬 빠르게 와요." },
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
      intro: { src: "/emoji/milku_11.png", name: "MILKU 코치", align: "left", text: "게임 리뷰가 느리다는 얘기, 저도 들었어요. 그래서 이번엔 속도를 확 끌어올렸어요." },
      outro: { src: "/emoji/kokoa_7.png", name: "KOKOA 코치", align: "right", text: "퍼즐 만들다가 화면을 나가도 이제 처음부터 다시 안 만들어도 돼요." },
    },
    highlight: { kind: "icon", Icon: Zap, color: T.brassHi, label: "게임 리뷰 속도 개선" },
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
      intro: { src: "/emoji/milku_7.png", name: "MILKU 코치", align: "left", text: "도감 탭 오프닝 트리를 나침반처럼 동서남북으로 뻗어나가게 다시 그렸어요." },
      outro: { src: "/emoji/kokoa_4.png", name: "KOKOA 코치", align: "right", text: "트리가 그려지는 동안 화면이 흔들리던 것도 이번에 다 잡았어요." },
    },
    highlight: { kind: "icon", Icon: Compass, color: "#6FA8DC", label: "나침반형 오프닝 트리" },
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
      intro: { src: "/emoji/milku_12.png", name: "MILKU 코치", align: "left", text: "긴 대국을 리뷰하면 느려지다 멈추는 것 같았죠? 저도 답답했어요." },
      outro: { src: "/emoji/kokoa_9.png", name: "KOKOA 코치", align: "right", text: "이제 훨씬 정확하고 빠르게 계산해요. 확인해 보세요!" },
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
      intro: { src: "/emoji/milku_1.png", name: "MILKU 코치", align: "left", text: "베타를 열고 나서 처음 받은 피드백들을 하나씩 다듬은 버전이에요." },
      outro: { src: "/emoji/kokoa_1.png", name: "KOKOA 코치", align: "right", text: "모바일 화면도, 로그인 창도 한결 매끄러워졌을 거예요." },
    },
    highlight: { kind: "icon", Icon: Sparkles, color: T.brassHi, label: "구석구석 다듬기" },
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
      intro: { src: "/emoji/kokoa_2.png", name: "KOKOA 코치", align: "left", text: "안녕하세요! OpenChess 베타를 시작합니다. 오프닝 학습이랑 퍼즐 풀이, 핵심만 먼저 들고 왔어요." },
      outro: { src: "/emoji/milku_2.png", name: "MILKU 코치", align: "right", text: "앞으로 계속 다듬어 나갈게요. 잘 부탁드려요!" },
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
            <div style={{ width: 76, height: 76, display: "flex", alignItems: "center", justifyContent: "center", ...GOLD_DISC }}>
              <img src={cur.img} alt="" style={{ width: "70%", height: "70%", objectFit: "contain" }} />
            </div>
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
function VersionHighlight({ h }) {
  if (!h) return null;
  if (h.kind === "icon") return <IconHighlight Icon={h.Icon} color={h.color} label={h.label} />;
  if (h.kind === "tierStrip") return (
    <Reveal><div style={{ margin: "8px 0 28px", padding: "18px 14px", borderRadius: 16, background: "linear-gradient(160deg,#241509,#150C05)", ...GLOSS_BORDER }}><TierStrip /></div></Reveal>
  );
  if (h.kind === "tierPromo") return <TierPromoDemo />;
  return null;
}

function ItemRow({ text, color, delay }) {
  return (
    <Reveal delay={delay} y={10}>
      <div className="flex items-start gap-2" style={{ padding: "9px 12px", borderRadius: 10, background: "rgba(0,0,0,.18)", border: "1px solid #4A3521", marginBottom: 6 }}>
        <span style={{ width: 6, height: 6, borderRadius: "50%", background: color, flexShrink: 0, marginTop: 6 }} />
        <p style={{ margin: 0, fontSize: 12.5, color: T.ivory, lineHeight: 1.65 }}>{text}</p>
      </div>
    </Reveal>
  );
}

function CategoryGroup({ cat, items }) {
  const c = CAT[cat];
  return (
    <div style={{ marginBottom: 20 }}>
      <Reveal y={8}>
        <div className="flex items-center gap-2" style={{ marginBottom: 8 }}>
          <span style={{ width: 22, height: 22, borderRadius: 7, background: c.color + "26", border: "1px solid " + c.color, display: "inline-flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}><c.Icon size={12} color={c.color} /></span>
          <span style={{ fontSize: 11, fontWeight: 800, color: c.color, letterSpacing: ".04em" }}>{c.label}</span>
        </div>
      </Reveal>
      {items.map((t, i) => <ItemRow key={i} text={t} color={c.color} delay={i * 0.04} />)}
    </div>
  );
}

// 버전 기록 한 페이지 — 공지 모달과 같은 소재를 쓰지만(App.jsx CHANGELOG와는 별도로 이 파일 안에
// VERSION_HISTORY로 옮겨 적음), 카테고리별로 나누고 조금 더 풀어 쓴 문장으로 자세히 보여준다.
// (v0.1.2 기능) 마스코트가 이번 버전을 직접 소개하는 말풍선(도입부)과 소감을 남기는 말풍선(마무리)
// 사이에, 대표 기능을 이미지·애니메이션으로 보여주는 하이라이트를 넣어 참고 이미지의 "삽화+대사"
// 구성을 재현한다.
function VersionPage({ v, isLatest }) {
  return (
    <div style={{ maxWidth: 720, margin: "0 auto", padding: "56px 20px 96px" }}>
      <Reveal>
        <div style={{ marginBottom: 24 }}>
          <div className="flex items-center gap-2" style={{ marginBottom: 6 }}>
            <span style={{ fontSize: 24, fontWeight: 900, color: T.brassHi, fontFamily: "ui-monospace,monospace" }}>v{v.version}</span>
            {isLatest && <span style={{ fontSize: 10, fontWeight: 800, color: "#241509", background: "linear-gradient(180deg," + T.brass + ",#A8842F)", borderRadius: 999, padding: "2px 9px" }}>최신</span>}
            <span style={{ fontSize: 11.5, color: T.inkSoft }}>{v.date}</span>
          </div>
          <p style={{ margin: 0, fontSize: 14, color: T.ivoryHi, fontWeight: 700, lineHeight: 1.5 }}>{v.summary}</p>
        </div>
      </Reveal>

      {v.mascot && (
        <div style={{ marginBottom: 8 }}>
          <SpeechBubble src={v.mascot.intro.src} name={v.mascot.intro.name} align={v.mascot.intro.align}>{v.mascot.intro.text}</SpeechBubble>
        </div>
      )}

      <VersionHighlight h={v.highlight} />

      {v.sections.map((s, i) => <CategoryGroup key={s.cat} cat={s.cat} items={s.items} />)}

      {v.mascot && (
        <div style={{ marginTop: 28 }}>
          <SpeechBubble src={v.mascot.outro.src} name={v.mascot.outro.name} align={v.mascot.outro.align}>{v.mascot.outro.text}</SpeechBubble>
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

      {/* 페이지 넘김 안내 바 — 이전/다음 버튼 + 지금 몇 페이지인지, 스와이프해도 동일하게 반응 */}
      <div className="flex items-center justify-center" style={{ position: "relative", zIndex: 3, flexShrink: 0, gap: 10, padding: "8px 16px", background: "rgba(27,16,9,.92)", backdropFilter: "blur(6px)", borderBottom: "1px solid #000" }}>
        <button onClick={() => goTo(page - 1)} disabled={page === 0} className="press" aria-label="이전 페이지" style={{ width: 28, height: 28, borderRadius: 8, border: "1px solid " + T.brass, background: "transparent", color: page === 0 ? T.inkSoft : T.brassHi, opacity: page === 0 ? 0.4 : 1, cursor: page === 0 ? "default" : "pointer", display: "inline-flex", alignItems: "center", justifyContent: "center" }}><ChevronLeft size={15} /></button>
        <span style={{ fontSize: 11, fontWeight: 800, color: T.brassHi, minWidth: 96, textAlign: "center" }}>{page === 0 ? "소개" : "v" + VERSION_HISTORY[page - 1].version} · {page + 1}/{total}</span>
        <button onClick={() => goTo(page + 1)} disabled={page === total - 1} className="press" aria-label="다음 페이지" style={{ width: 28, height: 28, borderRadius: 8, border: "1px solid " + T.brass, background: "transparent", color: page === total - 1 ? T.inkSoft : T.brassHi, opacity: page === total - 1 ? 0.4 : 1, cursor: page === total - 1 ? "default" : "pointer", display: "inline-flex", alignItems: "center", justifyContent: "center" }}><ChevronRight size={15} /></button>
      </div>

      <div ref={pagerRef} onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={onPointerUp} onPointerLeave={onPointerUp} onPointerCancel={onPointerUp}
        style={{ position: "relative", zIndex: 1, flex: 1, minHeight: 0, overflow: "hidden", touchAction: "pan-y" }}>
        <div style={{ display: "flex", width: total * 100 + "%", height: "100%", transform: "translateX(calc(" + (-page * 100) / total + "% + " + dragPx + "px))", transition: dragging ? "none" : "transform .38s cubic-bezier(.22,.9,.32,1)" }}>
          <div ref={(el) => (pageElRefs.current[0] = el)} style={{ width: 100 / total + "%", flexShrink: 0, height: "100%", overflowY: "auto", WebkitOverflowScrolling: "touch" }}><IntroPage /></div>
          {VERSION_HISTORY.map((v, i) => (
            <div key={v.version} ref={(el) => (pageElRefs.current[i + 1] = el)} style={{ width: 100 / total + "%", flexShrink: 0, height: "100%", overflowY: "auto", WebkitOverflowScrolling: "touch" }}>
              <VersionPage v={v} isLatest={i === 0} />
              {i === VERSION_HISTORY.length - 1 && <div style={{ textAlign: "center", padding: "8px 0 24px" }}><span style={{ fontSize: 11, color: T.inkSoft }}>© OpenChess</span></div>}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
