import React, { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { ArrowRight, ArrowLeft, ChevronDown, HelpCircle, Sparkles, Mail } from "lucide-react";

import { t, tx } from "./lib/i18n.js";
// (v0.4.3 기능, 사용자 요청) 사이트를 소개하는 /about과 마찬가지로, App(엔진 워커·Supabase 클라이언트
// 등 무거운 초기화)을 거치지 않는 별도의 가벼운 정적 페이지(/faq)로 분리한다(main.jsx가 경로만 보고
// App 대신 이 컴포넌트를 렌더링). 그래서 여기서 쓰는 색 토큰·장식 모티프도 App.jsx의 T 객체를 그대로
// 가져오지 않고, AboutPage.jsx와 같은 톤을 내도록 필요한 값만 옮겨 적었다(사이트 전체와 시각적으로
// 통일되게, AboutPage.jsx와도 완전히 같은 팔레트).
const T = {
  ebony: "#1B1009", ebony2: "#2E1B10",
  ivory: "#EBDDC4", ivoryHi: "#FAF2E2",
  ink: "#5A3A22", inkSoft: "#B8A78C",
  brass: "#C49A50", brassHi: "#ECCB86",
};

function Diamond({ x, y, size = 16, opacity = 0.18 }) {
  return <rect x={x} y={y} width={size} height={size} transform={"rotate(45 " + (x + size / 2) + " " + (y + size / 2) + ")"} fill="none" stroke={T.brass} strokeWidth="1.2" opacity={opacity} />;
}
// AboutPage.jsx의 Backdrop과 같은 계열의 옅은 와이어프레임 다이아몬드 배경 — 같은 톤을 낸다.
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
// (AboutPage.jsx의 Reveal과 동일) 스크롤로 뷰포트에 들어올 때마다(once:false) 살짝 떠오르며 나타난다.
function Reveal({ children, delay = 0, y = 16, once = false }) {
  return (
    <motion.div initial={{ opacity: 0, y }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once, amount: 0.25 }} transition={{ duration: 0.55, delay, ease: [0.22, 0.9, 0.32, 1] }}>
      {children}
    </motion.div>
  );
}
// 섹션 사이 구분선 — AboutPage.jsx의 SectionDivider와 같은 모티프(회전하는 브라스 다이아몬드).
function SectionDivider({ label }) {
  return (
    <Reveal y={0}>
      <div className="flex items-center" style={{ gap: 10, margin: "52px 0 28px", opacity: 0.9 }}>
        <div style={{ flex: 1, height: 1, background: "linear-gradient(90deg,transparent," + T.brass + ")" }} />
        <motion.svg width="14" height="14" viewBox="0 0 14 14" animate={{ rotate: 360 }} transition={{ duration: 8, repeat: Infinity, ease: "linear" }}><rect x="2" y="2" width="10" height="10" transform="rotate(45 7 7)" fill="none" stroke={T.brass} strokeWidth="1.4" /></motion.svg>
        <span style={{ fontSize: 11, fontWeight: 800, letterSpacing: ".14em", color: T.brassHi, whiteSpace: "nowrap" }}>{label}</span>
        <motion.svg width="14" height="14" viewBox="0 0 14 14" animate={{ rotate: -360 }} transition={{ duration: 8, repeat: Infinity, ease: "linear" }}><rect x="2" y="2" width="10" height="10" transform="rotate(45 7 7)" fill="none" stroke={T.brass} strokeWidth="1.4" /></motion.svg>
        <div style={{ flex: 1, height: 1, background: "linear-gradient(90deg," + T.brass + ",transparent)" }} />
      </div>
    </Reveal>
  );
}

// (AboutPage.jsx의 KineticWord/KineticTagline과 동일한 기법) 스크롤로 들어올 때마다(once:false) 단어
// 하나씩 다른 방향·크기로 튀어오른다 — /faq도 /about과 같은 "반응형 타이포그래피·애니메이션 중심"
// 인상을 주도록 그대로 재사용한다.
function KineticWord({ children, index, accent }) {
  return (
    <motion.span
      initial={{ opacity: 0, y: 40, scale: 0.82, rotate: index % 2 === 0 ? -4 : 4 }}
      whileInView={{ opacity: 1, y: 0, scale: 1, rotate: 0 }}
      viewport={{ once: false, amount: 0.6 }}
      transition={{ duration: 0.65, delay: index * 0.08, ease: [0.22, 0.9, 0.32, 1] }}
      style={{
        display: "inline-block",
        fontSize: "clamp(30px, 7.5vw, 64px)",
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
    { t: t("궁금한"), accent: true },
    { t: t("점"), accent: false },
  ];
  return (
    <div style={{ padding: "10px 4px 8px", textAlign: "center", display: "flex", flexWrap: "wrap", justifyContent: "center", gap: "0 .32em" }}>
      {words.map((w, i) => <KineticWord key={w.t} index={i} accent={w.accent}>{w.t}</KineticWord>)}
    </div>
  );
}

// ============================================================ FAQ 데이터 ============================================================
const FAQ_GROUPS = [
  {
    label: t("시작하기"),
    items: [
      { q: t("무료 여부"), a: t("오프닝 학습·엔진 분석·오프닝 도감·퍼즐 등 핵심 기능 모두 무료") },
      { q: t("회원가입 없이 이용"), a: t("게스트로도 대부분의 화면 이용 가능. 진도(도감 해금)·해결한 퍼즐·친구·실시간 대국처럼 계정에 저장되는 기능은 로그인 필요") },
    ],
  },
  {
    label: t("학습 · 도감"),
    items: [
      { q: t("학습 탭 기능"), a: t("체스판을 직접 두거나 PGN·FEN·chess.com 대국을 불러와 엔진 분석. 매 수의 정확도(최선/우수/실수/블런더 등급) 표시") },
      { q: t("오프닝 도감이란"), a: t("체스 오프닝을 트리 구조로 정리한 지도. 학습 탭에서 오프닝을 실제로 두면 그 갈래가 도감에 해금, 도감에서 각 오프닝의 정통 수순과 유래 확인") },
      { q: t("사용하는 엔진"), a: t("Stockfish 계열 엔진 사용. 설정 탭에서 가볍고 빠른 기본 엔진, 더 강력한 Stockfish 17.1 · 18 중 선택") },
    ],
  },
  {
    label: t("퍼즐"),
    items: [
      { q: t("퍼즐 생성 방식"), a: t("퍼즐 탭의 \"퍼즐 만들기\"에서 PGN·FEN 입력 또는 내 chess.com 대국 선택. 그 안의 실제 수(기물 희생·우위 점하기·실수 응징하기 등)로 직접 제작") },
      { q: t("퍼즐 비공개 설정"), a: t("퍼즐 만들기 마지막 단계 또는 이미 만든 퍼즐의 풀이 카드에서 언제든 공개/비공개 변경") },
      { q: t("다른 사람의 퍼즐 풀기"), a: t("공개 퍼즐은 퍼즐 탭 목록에서 누구나 풀 수 있고, 좋아요·리포스트·공유 가능") },
    ],
  },
  {
    label: t("실시간 대국"),
    items: [
      { q: t("실시간 대국"), a: t("PLAY 페이지에서 타임 컨트롤을 고른 뒤 \"대국 상대 찾기\"로 랜덤 매칭, 또는 \"친구와 플레이하기\"에서 친구에게 도전장 발송") },
      { q: t("채팅에서 대국 신청"), a: t("친구와의 채팅창에 /play 명령어 입력. 예: \"/play 10\"은 10분 대국, \"/play 15+10\"은 15분에 매 수마다 10초씩 증가. 상대가 수락하면 바로 대국 시작") },
      { q: t("매칭 대기 중 페이지 이탈"), a: t("대기열에 있었다면 매칭 자동 취소, 진행 중인 대국이었다면 기권 처리") },
    ],
  },
  {
    label: t("계정 · 데이터"),
    items: [
      { q: t("소셜 로그인 (Google · Apple · Facebook)"), a: t("로그인 창에서 바로 선택 가능. 로그인 후 \"계정 센터\"에서 여러 로그인 수단을 하나의 계정에 연결하면 어떤 수단으로든 같은 계정으로 로그인") },
      { q: t("계정 탈퇴 시 데이터"), a: t("계정 센터의 \"계정 탈퇴\"를 누르면 프로필·진도·퍼즐·친구·채팅 등 모든 데이터가 영구 삭제. 삭제 후에는 되돌릴 수 없음") },
      { q: t("다른 기기에서 진도 이어가기"), a: t("로그인하면 어느 기기에서든 같은 진도(도감 해금·해결한 퍼즐·XP 등) 이용") },
    ],
  },
  {
    label: t("기타"),
    items: [
      { q: t("버그 제보"), a: t("설정 탭의 \"문의 / FAQ\" 카드에서 이메일로 제보. 화면이 어디서 어떻게 달랐는지 함께 적으면 빠르게 확인") },
    ],
  },
];

function FaqItem({ q, a, open, onToggle }) {
  return (
    <div style={{ borderRadius: 12, border: "1px solid " + (open ? "rgba(196,154,80,.55)" : "rgba(196,154,80,.18)"), background: open ? "linear-gradient(180deg,rgba(46,27,16,.7),rgba(27,16,9,.3))" : "rgba(46,27,16,.28)", overflow: "hidden", transition: "border-color .2s ease" }}>
      <button onClick={onToggle} className="press" style={{ width: "100%", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, padding: "15px 18px", background: "transparent", border: "none", cursor: "pointer", textAlign: "left" }}>
        <span style={{ fontSize: 14.5, fontWeight: 800, color: open ? T.brassHi : T.ivoryHi, lineHeight: 1.4 }}>{q}</span>
        <motion.span animate={{ rotate: open ? 180 : 0 }} transition={{ duration: 0.25 }} style={{ flexShrink: 0, color: T.brass }}><ChevronDown size={18} /></motion.span>
      </button>
      <AnimatePresence initial={false}>
        {open && (
          <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.25, ease: [0.22, 0.9, 0.32, 1] }} style={{ overflow: "hidden" }}>
            <p style={{ margin: 0, padding: "0 18px 16px", fontSize: 13, lineHeight: 1.75, color: T.inkSoft }}>{a}</p>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

export default function FaqPage() {
  // "그룹인덱스-항목인덱스" 형식의 key 하나만 열어둔다(아코디언 — 한 번에 하나씩만 펼쳐져 있어야
  // 페이지가 끝없이 길어지지 않는다).
  const [openKey, setOpenKey] = useState(null);
  return (
    <div style={{ position: "relative", minHeight: "100vh", background: "linear-gradient(180deg,#241509,#1B0F07 40%,#1B1009)", color: T.ivory, fontFamily: "'IBM Plex Sans KR', 'Noto Sans Devanagari', 'Noto Sans JP', 'Noto Sans SC', sans-serif" }}>
      <Backdrop />
      <header style={{ position: "relative", zIndex: 2, borderBottom: "1px solid #000", background: "linear-gradient(180deg,#3A2516,#2A1810)" }}>
        <div className="flex items-center justify-between" style={{ maxWidth: 900, margin: "0 auto", padding: "14px 20px" }}>
          <a href="/" style={{ display: "inline-flex", alignItems: "center" }}>
            <img src="/OpenChessLogo.png" alt="OpenChess" style={{ display: "block", height: 34, width: "auto", filter: "drop-shadow(0 2px 3px rgba(0,0,0,.5))" }} />
          </a>
          <a href="/" className="press" style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "8px 16px", borderRadius: 999, background: "linear-gradient(180deg," + T.brass + ",#A8842F)", color: "#241509", fontWeight: 800, fontSize: 13, textDecoration: "none" }}>{tx("시작하기 {0}", <ArrowRight size={14} />)}
          </a>
        </div>
      </header>

      <div style={{ position: "relative", zIndex: 1, maxWidth: 720, margin: "0 auto", padding: "56px 20px 90px" }}>
        <Reveal><div className="flex items-center justify-center gap-2" style={{ marginBottom: 10 }}>
          <HelpCircle size={14} color={T.brass} />
          <span style={{ fontSize: 12, fontWeight: 800, color: T.brass, letterSpacing: ".1em" }}>{t("자주 묻는 질문")}</span>
        </div></Reveal>
        <KineticTagline />
        <Reveal delay={0.1}><p style={{ textAlign: "center", fontSize: 13.5, color: T.inkSoft, lineHeight: 1.75, maxWidth: 480, margin: "0 auto 8px" }}>{t("막히는 부분은 여기서 먼저 확인. 답이 없으면 맨 아래에서 문의")}</p></Reveal>

        {FAQ_GROUPS.map((g, gi) => (
          <div key={g.label}>
            <SectionDivider label={g.label} />
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {g.items.map((item, ii) => {
                const key = gi + "-" + ii;
                return (
                  <Reveal key={key} delay={Math.min(ii * 0.05, 0.2)}>
                    <FaqItem q={item.q} a={item.a} open={openKey === key} onToggle={() => setOpenKey((k) => (k === key ? null : key))} />
                  </Reveal>
                );
              })}
            </div>
          </div>
        ))}

        <Reveal delay={0.1}>
          <div style={{ marginTop: 60, padding: "28px 24px", borderRadius: 20, textAlign: "center", background: "linear-gradient(160deg, rgba(46,27,16,.6), rgba(27,16,9,.15))", border: "1px solid rgba(196,154,80,.22)" }}>
            <Sparkles size={18} color={T.brass} style={{ marginBottom: 8 }} />
            <div style={{ fontSize: 16, fontWeight: 800, color: T.ivoryHi, marginBottom: 6 }}>{t("원하는 답이 없나요?")}</div>
            <p style={{ fontSize: 12.5, color: T.inkSoft, marginBottom: 18, lineHeight: 1.6 }}>{t("문제나 궁금한 점을 이메일로 보내면 확인 후 답변")}</p>
            <a href="mailto:openchesskr@gmail.com?subject=%5BOpenChess%20%EB%AC%B8%EC%9D%98%5D" className="press" style={{ display: "inline-flex", alignItems: "center", gap: 8, padding: "12px 22px", borderRadius: 999, background: "linear-gradient(180deg," + T.brass + ",#A8842F)", color: "#241509", fontWeight: 800, fontSize: 13.5, textDecoration: "none", boxShadow: "0 4px 0 #7A5E22" }}>
              {tx("{0} 이메일로 문의하기", <Mail size={15} />)}</a>
          </div>
        </Reveal>

        <Reveal delay={0.1}>
          <div style={{ textAlign: "center", marginTop: 28 }}>
            <a href="/" className="press" style={{ display: "inline-flex", alignItems: "center", gap: 6, color: T.inkSoft, fontSize: 12.5, fontWeight: 700, textDecoration: "none" }}>
              {tx("{0} OpenChess로 돌아가기", <ArrowLeft size={13} />)}</a>
          </div>
        </Reveal>
      </div>
    </div>
  );
}
