import React from "react";
import { ArrowLeft } from "lucide-react";
import { CONTACT_EMAIL } from "./lib/siteConfig.js";

// (v0.6.0, 앱 출시 준비) 개인정보처리방침(/privacy)·이용약관(/terms). App을 거치지 않는 가벼운 정적 페이지로,
// main.jsx가 경로만 보고 이 컴포넌트를 렌더링한다(스토어 심사에서 로그인 없이 열리는 주소가 필요하다).
// 문구는 사이트 규칙대로 명사형·개조식. 시행일을 바꿀 때는 아래 EFFECTIVE 한 곳만 고친다.
const EFFECTIVE = "2026년 10월 1일";
const T = { ebony: "#1B1009", ivory: "#EBDDC4", ivoryHi: "#FAF2E2", inkSoft: "#B8A78C", brass: "#C49A50" };

const PRIVACY = [
  { h: "1. 수집 항목", list: [
    "계정: 이메일, 로그인 수단(이메일·Google·Apple·Facebook)의 계정 식별값, 아이디, 닉네임, 회원 번호(MID)",
    "프로필: 프로필 사진(선택), 소개, 연결한 chess.com 아이디(선택)",
    "서비스 이용 기록: 학습 진도, 퍼즐 풀이·제작 기록, 대국·미니게임 결과와 레이팅, 설정값, 친구 관계, 알림",
    "채팅: 친구와 주고받은 메시지, 신고·차단 내역(신고 시 해당 메시지 사본 포함)",
    "보드 사진 인식 기능 사용 시: 사용자가 올린 체스판 사진",
    "자동 수집: 접속 기록, 오류 로그 등 서비스 운영에 필요한 최소 정보",
  ] },
  { h: "2. 이용 목적", list: [
    "회원 식별·로그인 유지, 진도·기록 저장 및 기기 간 동기화",
    "대국 매칭, 레이팅 산정, 랭킹·프로필 표시, 친구·채팅 기능 제공",
    "신고 접수·검토, 부정 이용 방지, 서비스 안정성 확보",
    "문의 응대, 공지 전달",
  ] },
  { h: "3. 보유 기간", list: [
    "회원 탈퇴 시 계정 센터의 \"계정 탈퇴\"로 프로필·진도·퍼즐·친구·채팅 등 모든 데이터를 즉시 영구 삭제",
    "신고 내역은 부정 이용 대응을 위해 처리 완료 후 일정 기간 보관 후 삭제",
    "법령에서 보관을 요구하는 정보는 해당 기간 동안 보관",
  ] },
  { h: "4. 제3자 제공·처리 위탁", list: [
    "Supabase: 계정 인증, 데이터베이스 저장",
    "Vercel: 웹사이트·서버 기능 호스팅",
    "Google(Gemini API): 보드 사진 인식 기능 사용 시 업로드한 사진을 FEN 변환 목적으로만 전송. 사진은 서비스에 저장하지 않음",
    "Google·Apple·Facebook: 소셜 로그인 선택 시 해당 사업자의 인증 절차 이용",
    "chess.com·Lichess 공개 API: 사용자가 연결한 아이디로 공개 대국 기록 조회",
    "위 사업자 외에는 이용자 동의 없이 개인정보를 제공하지 않으며, 광고 목적으로 사용하지 않음",
  ] },
  { h: "5. 이용자 권리", list: [
    "프로필·설정은 앱에서 직접 열람·수정, 로그인 수단은 계정 센터에서 연결·해제",
    "계정 센터에서 언제든 계정 탈퇴·데이터 삭제 가능",
    "열람·정정·삭제·처리 정지 요청은 아래 문의처로 접수",
  ] },
  { h: "6. 아동 정보", list: [
    "만 14세 미만 아동의 가입은 받지 않음. 확인되면 계정과 데이터를 삭제",
  ] },
  { h: "7. 안전성 확보 조치", list: [
    "전송 구간 암호화(HTTPS), 행 단위 접근 제어(RLS)로 본인 데이터만 접근",
    "비밀번호는 인증 서비스가 암호화해 저장하며 운영자가 열람 불가",
  ] },
  { h: "8. 문의처", list: ["개인정보 관련 문의: " + CONTACT_EMAIL] },
];

const TERMS = [
  { h: "1. 목적", list: ["이 약관은 OpenChess가 제공하는 체스 학습·대국·퍼즐 서비스의 이용 조건과 운영자·이용자의 권리와 의무를 정함"] },
  { h: "2. 계정", list: [
    "이용자는 정확한 정보로 가입하고 계정을 직접 관리",
    "계정 공유·양도·판매 금지",
    "탈퇴는 계정 센터에서 언제든 가능하며 탈퇴 즉시 데이터 삭제",
  ] },
  { h: "3. 이용자 콘텐츠", list: [
    "닉네임·프로필 사진·소개·채팅·퍼즐 이름 등 이용자가 올린 콘텐츠의 책임은 작성자에게 있음",
    "공개로 설정한 퍼즐·프로필은 다른 이용자에게 표시",
  ] },
  { h: "4. 금지 행위", list: [
    "욕설·혐오·성적·폭력적 표현, 괴롭힘, 스팸, 사칭",
    "엔진·외부 도움으로 대국 결과를 조작하는 행위(치팅), 매칭·레이팅 악용",
    "서비스 취약점 악용, 자동화 도구를 이용한 과도한 요청",
    "타인의 개인정보 수집·노출",
  ] },
  { h: "5. 신고·차단·제재", list: [
    "모든 이용자는 채팅 메시지·프로필을 신고하고 다른 이용자를 차단 가능. 차단하면 서로 메시지·친구 요청·도전장 전송 불가",
    "운영자는 신고를 검토해 콘텐츠 삭제, 이용 제한, 계정 정지 등을 조치",
    "부적절한 콘텐츠 신고는 앱 안의 신고 기능 또는 " + CONTACT_EMAIL + "로 접수",
  ] },
  { h: "6. 서비스 변경·중단", list: [
    "운영자는 서비스를 개선·변경할 수 있으며 중대한 변경은 공지",
    "점검·장애·천재지변 등으로 서비스가 일시 중단될 수 있음",
    "분석·레이팅·정확도 수치는 참고용이며 정확성을 보증하지 않음",
  ] },
  { h: "7. 책임 제한", list: [
    "운영자는 이용자 간 분쟁, 이용자의 귀책으로 생긴 손해에 책임지지 않음",
    "무료로 제공되는 서비스의 데이터 손실에 대해 고의·중과실이 없는 한 책임지지 않음",
  ] },
  { h: "8. 문의 및 준거법", list: ["문의: " + CONTACT_EMAIL, "이 약관은 대한민국 법령에 따라 해석"] },
];

export default function LegalPage({ kind }) {
  const isPrivacy = kind === "privacy";
  const title = isPrivacy ? "개인정보처리방침" : "이용약관";
  const sections = isPrivacy ? PRIVACY : TERMS;
  const other = isPrivacy ? { href: "/terms", label: "이용약관" } : { href: "/privacy", label: "개인정보처리방침" };
  return (
    <div style={{ minHeight: "100vh", background: "linear-gradient(180deg,#241509,#1B0F07 40%,#1B1009)", color: T.ivory, fontFamily: "'IBM Plex Sans KR', 'Noto Sans Devanagari', 'Noto Sans JP', 'Noto Sans SC', sans-serif" }}>
      <header style={{ borderBottom: "1px solid #000", background: "linear-gradient(180deg,#3A2516,#2A1810)" }}>
        <div style={{ maxWidth: 760, margin: "0 auto", padding: "14px 20px" }}>
          <a href="/" style={{ display: "inline-flex", alignItems: "center" }}>
            <img src="/OpenChessLogo.png" alt="OpenChess" style={{ display: "block", height: 34, width: "auto" }} />
          </a>
        </div>
      </header>
      <main style={{ maxWidth: 760, margin: "0 auto", padding: "44px 20px 80px" }}>
        <h1 style={{ fontSize: 26, fontWeight: 900, color: T.ivoryHi, margin: "0 0 6px" }}>{title}</h1>
        <p style={{ fontSize: 12.5, color: T.inkSoft, margin: "0 0 30px" }}>시행일: {EFFECTIVE}</p>
        {sections.map((s) => (
          <section key={s.h} style={{ marginBottom: 26 }}>
            <h2 style={{ fontSize: 15.5, fontWeight: 800, color: T.brass, margin: "0 0 10px" }}>{s.h}</h2>
            <ul style={{ margin: 0, paddingLeft: 18, display: "flex", flexDirection: "column", gap: 6 }}>
              {s.list.map((t) => <li key={t} style={{ fontSize: 13.5, lineHeight: 1.75, color: T.ivory }}>{t}</li>)}
            </ul>
          </section>
        ))}
        <div style={{ display: "flex", gap: 18, marginTop: 40, flexWrap: "wrap" }}>
          <a href={other.href} style={{ color: T.brass, fontSize: 13, fontWeight: 700, textDecoration: "none" }}>{other.label} 보기</a>
          <a href="/" style={{ display: "inline-flex", alignItems: "center", gap: 6, color: T.inkSoft, fontSize: 13, fontWeight: 700, textDecoration: "none" }}><ArrowLeft size={13} /> OpenChess로 돌아가기</a>
        </div>
      </main>
    </div>
  );
}
