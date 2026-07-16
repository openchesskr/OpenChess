import React from "react";
import { GraduationCap, Library, Puzzle, Target, Crown, Users, ArrowRight, Sparkles } from "lucide-react";

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
    <div className="flex items-start" style={{ gap: 12, flexDirection: align === "right" ? "row-reverse" : "row" }}>
      {avatar}{bubble}
    </div>
  );
}

// 섹션 사이 구분선 — 사이트 전역 장식(브라스 다이아몬드)과 같은 모티프 + 워드마크 반복.
function SectionDivider() {
  return (
    <div className="flex items-center" style={{ gap: 10, margin: "56px 0", opacity: 0.75 }}>
      <div style={{ flex: 1, height: 1, background: "linear-gradient(90deg,transparent," + T.brass + ")" }} />
      <svg width="14" height="14" viewBox="0 0 14 14"><rect x="2" y="2" width="10" height="10" transform="rotate(45 7 7)" fill="none" stroke={T.brass} strokeWidth="1.4" /></svg>
      <span style={{ fontSize: 10, fontWeight: 800, letterSpacing: ".22em", color: T.brass }}>OPENCHESS</span>
      <svg width="14" height="14" viewBox="0 0 14 14"><rect x="2" y="2" width="10" height="10" transform="rotate(45 7 7)" fill="none" stroke={T.brass} strokeWidth="1.4" /></svg>
      <div style={{ flex: 1, height: 1, background: "linear-gradient(90deg," + T.brass + ",transparent)" }} />
    </div>
  );
}

// 기능 소개 한 줄(이미지 액자 ↔ 텍스트, 좌우 번갈아 배치) — 참고 이미지의 "대사+삽화" 레이아웃을
// 그대로 빌리되, 액자·색은 사이트의 금색 광택(GLOSS_BORDER) 스타일을 그대로 쓴다.
function FeatureRow({ Icon, eyebrow, title, desc, quote, img, reverse }) {
  return (
    <div className="flex items-center flex-wrap" style={{ gap: 32, flexDirection: reverse ? "row-reverse" : "row" }}>
      <div style={{ flex: "0 0 auto", width: 200, maxWidth: "100%", margin: "0 auto" }}>
        <div style={{ position: "relative", borderRadius: 16, overflow: "hidden", ...GLOSS_BORDER, background: "linear-gradient(160deg,#3A2516,#20140B)", padding: 18, display: "flex", alignItems: "center", justifyContent: "center" }}>
          <img src={img} alt="" style={{ width: "100%", maxWidth: 150, filter: "drop-shadow(0 6px 14px rgba(0,0,0,.5))" }} />
        </div>
      </div>
      <div style={{ flex: "1 1 300px", minWidth: 260 }}>
        <div className="flex items-center gap-2" style={{ marginBottom: 8 }}>
          <span style={{ width: 30, height: 30, borderRadius: 9, background: "rgba(196,154,80,.15)", border: "1px solid " + T.brass, display: "inline-flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}><Icon size={15} color={T.brassHi} /></span>
          <span style={{ fontSize: 11, fontWeight: 800, color: T.brass, letterSpacing: ".08em" }}>{eyebrow}</span>
        </div>
        <h3 style={{ fontSize: 21, fontWeight: 900, color: T.ivoryHi, margin: "0 0 10px" }}>{title}</h3>
        <p style={{ fontSize: 13, color: T.inkSoft, lineHeight: 1.75, margin: "0 0 12px" }}>{desc}</p>
        {quote && <p style={{ fontSize: 12.5, color: T.brassHi, fontWeight: 700, fontStyle: "italic", margin: 0, opacity: .9 }}>&ldquo;{quote}&rdquo;</p>}
      </div>
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
      <div className="flex items-end" style={{ gap: 14, minWidth: 560, padding: "6px 2px 2px" }}>
        {tiers.map((t, i) => (
          <div key={t.key} className="flex flex-col items-center" style={{ gap: 6, flex: 1 }}>
            <div style={{ width: 56 + i * 3, height: 56 + i * 3, display: "flex", alignItems: "center", justifyContent: "center", ...GOLD_DISC }}>
              <img src={t.img} alt={t.label} style={{ width: "72%", height: "72%", objectFit: "contain" }} />
            </div>
            <span style={{ fontSize: 9.5, fontWeight: 800, color: T.brassHi, whiteSpace: "nowrap" }}>{t.label}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

export default function AboutPage() {
  return (
    <div style={{ position: "relative", minHeight: "100vh", background: "linear-gradient(180deg,#241509,#1B0F07 40%,#1B1009)", color: T.ivory, fontFamily: "'Noto Sans KR', sans-serif", overflowX: "hidden" }}>
      <Backdrop />
      <header style={{ position: "relative", zIndex: 1, borderBottom: "1px solid #000", background: "linear-gradient(180deg,#3A2516,#2A1810)" }}>
        <div className="flex items-center justify-between" style={{ maxWidth: 1000, margin: "0 auto", padding: "14px 20px" }}>
          <img src="/OpenChessLogo.png" alt="OpenChess" style={{ display: "block", height: 34, width: "auto", filter: "drop-shadow(0 2px 3px rgba(0,0,0,.5))" }} />
          <a href="/" className="press" style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "8px 16px", borderRadius: 999, background: "linear-gradient(180deg," + T.brass + ",#A8842F)", color: "#241509", fontWeight: 800, fontSize: 13, textDecoration: "none" }}>
            시작하기 <ArrowRight size={14} />
          </a>
        </div>
      </header>

      <main style={{ position: "relative", zIndex: 1, maxWidth: 1000, margin: "0 auto", padding: "56px 20px 72px" }}>
        {/* 히어로 — 마스코트 큰 이미지 + 타이틀/태그라인/CTA */}
        <section className="flex items-center flex-wrap" style={{ gap: 36, marginBottom: 8 }}>
          <div style={{ flex: "1 1 320px", minWidth: 280 }}>
            <div className="flex items-center gap-2" style={{ marginBottom: 12 }}>
              <Sparkles size={14} color={T.brass} />
              <span style={{ fontSize: 12, fontWeight: 800, color: T.brass, letterSpacing: ".08em" }}>무료 체스 오프닝 학습·연습 애플리케이션</span>
            </div>
            <h1 style={{ fontSize: 36, fontWeight: 900, color: T.ivoryHi, lineHeight: 1.28, margin: "0 0 16px" }}>오프닝을 배우고,<br />내 실수를 퍼즐로<br />복습하세요.</h1>
            <p style={{ fontSize: 14, color: T.inkSoft, lineHeight: 1.75, margin: "0 0 26px", maxWidth: 440 }}>
              엔진 분석 기반 학습, 오프닝 트리 도감, 실전 실수에서 자동 생성되는 전술 퍼즐, 퀘스트와 티어 시스템까지 — MILKU·KOKOA와 함께 체스를 더 깊이 익혀보세요.
            </p>
            <a href="/" className="press" style={{ display: "inline-flex", alignItems: "center", gap: 8, padding: "13px 24px", borderRadius: 999, background: "linear-gradient(180deg," + T.brass + ",#A8842F)", color: "#241509", fontWeight: 800, fontSize: 14, textDecoration: "none", boxShadow: "0 4px 0 #7A5E22" }}>
              무료로 시작하기 <ArrowRight size={16} />
            </a>
          </div>
          <div style={{ flex: "0 0 auto", width: 260, maxWidth: "100%", margin: "0 auto", position: "relative" }}>
            <div style={{ width: 260, height: 260, maxWidth: "100%", aspectRatio: "1/1", display: "flex", alignItems: "center", justifyContent: "center", ...GOLD_DISC }}>
              <img src="/emoji/milku_2.png" alt="MILKU" style={{ width: "78%", height: "78%", objectFit: "contain", filter: "drop-shadow(0 10px 22px rgba(0,0,0,.55))" }} />
            </div>
          </div>
        </section>

        <SectionDivider />

        {/* 소개 말풍선 */}
        <section style={{ maxWidth: 640, margin: "0 auto 8px" }}>
          <SpeechBubble src="/emoji/milku_1.png" name="MILKU 코치">
            안녕하세요! 저는 MILKU예요. OpenChess에서는 그냥 체스를 두는 게 아니라, 왜 그 수가 좋았는지·나빴는지까지 함께 살펴봐요. 아래에서 하나씩 소개해 드릴게요.
          </SpeechBubble>
        </section>

        <SectionDivider />

        {/* 기능 소개 — 좌우 번갈아 배치 */}
        <section className="flex flex-col" style={{ gap: 52 }}>
          {FEATURES.map((f, i) => <FeatureRow key={f.title} {...f} reverse={i % 2 === 1} />)}
        </section>

        <SectionDivider />

        {/* 티어 쇼케이스 */}
        <section>
          <div className="flex items-center gap-2" style={{ marginBottom: 6, justifyContent: "center" }}>
            <Crown size={16} color={T.brassHi} />
            <span style={{ fontSize: 11, fontWeight: 800, color: T.brass, letterSpacing: ".08em" }}>티어</span>
          </div>
          <h3 style={{ fontSize: 21, fontWeight: 900, color: T.ivoryHi, margin: "0 0 8px", textAlign: "center" }}>아이언부터 그랜드마스터까지</h3>
          <p style={{ fontSize: 13, color: T.inkSoft, lineHeight: 1.75, margin: "0 0 24px", textAlign: "center", maxWidth: 480, marginLeft: "auto", marginRight: "auto" }}>
            랭크 게임처럼 7단계 티어로 나뉜 경험치 시스템이에요. 퍼즐을 풀수록 경험치가 쌓이고 티어가 오릅니다.
          </p>
          <TierStrip />
        </section>

        <SectionDivider />

        {/* 친구 말풍선 */}
        <section style={{ maxWidth: 640, margin: "0 auto" }}>
          <SpeechBubble src="/emoji/kokoa_3.png" name="KOKOA 코치" align="right">
            친구를 추가하고 채팅하며, 서로 얼마나 풀었는지·어떤 칭호를 얻었는지 프로필에서 확인해 보세요. 퍼즐을 공유하면 친구가 풀었을 때 저도 경험치를 조금 나눠 받아요.
          </SpeechBubble>
        </section>

        {/* 마무리 CTA */}
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
      </main>

      <footer style={{ position: "relative", zIndex: 1, borderTop: "1px solid #000", padding: "20px", textAlign: "center" }}>
        <span style={{ fontSize: 11, color: T.inkSoft }}>© OpenChess</span>
      </footer>
    </div>
  );
}
