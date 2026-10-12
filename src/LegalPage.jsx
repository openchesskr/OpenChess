import React from "react";
import { ArrowLeft } from "lucide-react";
import { CONTACT_EMAIL } from "./lib/siteConfig.js";

import { t, tx, fmtDateOnly } from "./lib/i18n.js";
import LangSwitch from "./components/LangSwitch.jsx";
// (v0.6.0, 앱 출시 준비) 개인정보처리방침(/privacy)·이용약관(/terms). App을 거치지 않는 가벼운 정적 페이지로,
// main.jsx가 경로만 보고 이 컴포넌트를 렌더링한다(스토어 심사에서 로그인 없이 열리는 주소가 필요하다).
// 문구는 사이트 규칙대로 명사형·개조식. 시행일을 바꿀 때는 아래 EFFECTIVE 한 곳만 고친다.
const EFFECTIVE_ISO = "2026-10-01";
const T = { ebony: "#1B1009", ivory: "#EBDDC4", ivoryHi: "#FAF2E2", inkSoft: "#B8A78C", brass: "#C49A50" };

const PRIVACY = [
  { h: t("1. 수집 항목"), list: [
    t("계정: 이메일, 로그인 수단(이메일·Google·Apple·Facebook)의 계정 식별값, 아이디, 닉네임, 회원 번호(MID)"),
    t("프로필: 프로필 사진(선택), 소개, 연결한 chess.com 아이디(선택)"),
    t("서비스 이용 기록: 학습 진도, 퍼즐 풀이·제작 기록, 대국·미니게임 결과와 레이팅, 설정값, 친구 관계, 알림"),
    t("채팅: 친구와 주고받은 메시지, 신고·차단 내역(신고 시 해당 메시지 사본 포함)"),
    t("보드 사진 인식 기능 사용 시: 사용자가 올린 체스판 사진"),
    t("자동 수집: 접속 기록, 오류 로그 등 서비스 운영에 필요한 최소 정보"),
  ] },
  { h: t("2. 이용 목적"), list: [
    t("회원 식별·로그인 유지, 진도·기록 저장 및 기기 간 동기화"),
    t("대국 매칭, 레이팅 산정, 랭킹·프로필 표시, 친구·채팅 기능 제공"),
    t("신고 접수·검토, 부정 이용 방지, 서비스 안정성 확보"),
    t("문의 응대, 공지 전달"),
  ] },
  { h: t("3. 보유 기간"), list: [
    t("회원 탈퇴 시 계정 센터의 \"계정 탈퇴\"로 프로필·진도·퍼즐·친구·채팅 등 모든 데이터를 즉시 영구 삭제"),
    t("신고 내역은 부정 이용 대응을 위해 처리 완료 후 일정 기간 보관 후 삭제"),
    t("법령에서 보관을 요구하는 정보는 해당 기간 동안 보관"),
  ] },
  { h: t("4. 제3자 제공·처리 위탁"), list: [
    t("Supabase: 계정 인증, 데이터베이스 저장"),
    t("Vercel: 웹사이트·서버 기능 호스팅"),
    t("Google(Gemini API): 보드 사진 인식 기능 사용 시 업로드한 사진을 FEN 변환 목적으로만 전송. 사진은 서비스에 저장하지 않음"),
    t("Google(Gemini API): 자동 번역을 켠 이용자가 수 설명·프로필 소개글을 볼 때 해당 글을 번역 목적으로만 전송. 번역문은 작성자 정보 없이 30일 이내 보관 후 삭제하며, 채팅 메시지는 전송하지 않음"),
    t("Google·Apple·Facebook: 소셜 로그인 선택 시 해당 사업자의 인증 절차 이용"),
    t("chess.com·Lichess 공개 API: 사용자가 연결한 아이디로 공개 대국 기록 조회"),
    t("위 사업자 외에는 이용자 동의 없이 개인정보를 제공하지 않으며, 광고 목적으로 사용하지 않음"),
  ] },
  { h: t("5. 이용자 권리"), list: [
    t("프로필·설정은 앱에서 직접 열람·수정, 로그인 수단은 계정 센터에서 연결·해제"),
    t("계정 센터에서 언제든 계정 탈퇴·데이터 삭제 가능"),
    t("열람·정정·삭제·처리 정지 요청은 아래 문의처로 접수"),
  ] },
  { h: t("6. 아동 정보"), list: [
    t("만 14세 미만 아동의 가입은 받지 않음. 확인되면 계정과 데이터를 삭제"),
  ] },
  { h: t("7. 안전성 확보 조치"), list: [
    t("전송 구간 암호화(HTTPS), 행 단위 접근 제어(RLS)로 본인 데이터만 접근"),
    t("비밀번호는 인증 서비스가 암호화해 저장하며 운영자가 열람 불가"),
  ] },
  { h: t("8. 문의처"), list: [t("개인정보 관련 문의: {0}", CONTACT_EMAIL)] },
];

const TERMS = [
  { h: t("1. 목적"), list: [t("이 약관은 OpenChess가 제공하는 체스 학습·대국·퍼즐 서비스의 이용 조건과 운영자·이용자의 권리와 의무를 정함")] },
  { h: t("2. 계정"), list: [
    t("이용자는 정확한 정보로 가입하고 계정을 직접 관리"),
    t("계정 공유·양도·판매 금지"),
    t("탈퇴는 계정 센터에서 언제든 가능하며 탈퇴 즉시 데이터 삭제"),
  ] },
  { h: t("3. 이용자 콘텐츠"), list: [
    t("닉네임·프로필 사진·소개·채팅·퍼즐 이름 등 이용자가 올린 콘텐츠의 책임은 작성자에게 있음"),
    t("공개로 설정한 퍼즐·프로필은 다른 이용자에게 표시"),
  ] },
  { h: t("4. 금지 행위"), list: [
    t("욕설·혐오·성적·폭력적 표현, 괴롭힘, 스팸, 사칭"),
    t("엔진·외부 도움으로 대국 결과를 조작하는 행위(치팅), 매칭·레이팅 악용"),
    t("서비스 취약점 악용, 자동화 도구를 이용한 과도한 요청"),
    t("타인의 개인정보 수집·노출"),
  ] },
  { h: t("5. 신고·차단·제재"), list: [
    t("모든 이용자는 채팅 메시지·프로필을 신고하고 다른 이용자를 차단 가능. 차단하면 서로 메시지·친구 요청·도전장 전송 불가"),
    t("운영자는 신고를 검토해 콘텐츠 삭제, 이용 제한, 계정 정지 등을 조치"),
    t("부적절한 콘텐츠 신고는 앱 안의 신고 기능 또는 {0}로 접수", CONTACT_EMAIL),
  ] },
  { h: t("6. 서비스 변경·중단"), list: [
    t("운영자는 서비스를 개선·변경할 수 있으며 중대한 변경은 공지"),
    t("점검·장애·천재지변 등으로 서비스가 일시 중단될 수 있음"),
    t("분석·레이팅·정확도 수치는 참고용이며 정확성을 보증하지 않음"),
  ] },
  { h: t("7. 책임 제한"), list: [
    t("운영자는 이용자 간 분쟁, 이용자의 귀책으로 생긴 손해에 책임지지 않음"),
    t("무료로 제공되는 서비스의 데이터 손실에 대해 고의·중과실이 없는 한 책임지지 않음"),
  ] },
  { h: t("8. 문의 및 준거법"), list: [t("문의: {0}", CONTACT_EMAIL), t("이 약관은 대한민국 법령에 따라 해석")] },
];

// (v0.6.4) 계정·데이터 삭제 안내(/account-deletion) — Google Play 데이터 삭제 요청 주소, App Store 계정 삭제 안내로 쓴다. 로그인 없이 열려야 한다.
// 삭제 대상 목록은 supabase-setup.sql의 delete_own_account가 실제로 지우는 것과 같아야 한다(scripts/check-account-deletion.mjs가 함수 쪽을 검사).
const DELETION = [
  { h: t("1. 앱·웹에서 직접 삭제"), list: [
    t("OpenChess에 로그인한 뒤 설정 탭에서 계정 센터 열기"),
    t("계정 센터 아래쪽의 \"계정 탈퇴\"를 누르고 아이디를 입력해 확인"),
    t("확인하면 즉시 삭제되며 되돌릴 수 없음"),
  ] },
  { h: t("2. 삭제되는 데이터"), list: [
    t("계정 정보(이메일, 로그인 수단 연결, 아이디, 닉네임, 회원 번호)와 프로필 사진·소개"),
    t("학습 진도, 퍼즐 풀이 기록과 직접 만든 퍼즐, 대국·미니게임 기록과 레이팅"),
    t("친구 관계, 채팅 메시지, 알림, 신고·차단 내역"),
    t("진행 중이던 대국은 기권 처리되어 상대에게 승리로 기록된 뒤 삭제"),
  ] },
  { h: t("3. 삭제 후에도 남는 정보"), list: [
    t("상대의 통계에 이미 반영된 승패·레이팅 변동 수치는 남지만 탈퇴한 이용자를 알아볼 수 없음"),
    t("법령에서 보관을 요구하는 정보는 해당 기간 동안 보관"),
  ] },
  { h: t("4. 로그인할 수 없는 경우"), list: [
    t("가입한 이메일 주소에서 {0}로 \"계정 삭제 요청\"과 아이디(또는 회원 번호)를 보내기", CONTACT_EMAIL),
    t("본인 확인 후 삭제하고 처리 결과를 회신"),
  ] },
  { h: t("5. 문의처"), list: [t("문의: {0}", CONTACT_EMAIL)] },
];

export default function LegalPage({ kind }) {
  const isPrivacy = kind === "privacy", isDelete = kind === "account-deletion";
  const title = isDelete ? t("계정 및 데이터 삭제 안내") : isPrivacy ? t("개인정보처리방침") : t("이용약관");
  const sections = isDelete ? DELETION : isPrivacy ? PRIVACY : TERMS;
  const other = isPrivacy ? { href: "/terms", label: t("이용약관") } : { href: "/privacy", label: t("개인정보처리방침") };
  const deletionLink = { href: "/account-deletion", label: t("계정 및 데이터 삭제 안내") };
  return (
    <div style={{ minHeight: "100vh", background: "linear-gradient(180deg,#241509,#1B0F07 40%,#1B1009)", color: T.ivory, fontFamily: "'IBM Plex Sans KR', 'Noto Sans Devanagari', 'Noto Sans JP', 'Noto Sans SC', sans-serif" }}>
      <header style={{ borderBottom: "1px solid #000", background: "linear-gradient(180deg,#3A2516,#2A1810)" }}>
        <div className="flex items-center justify-between" style={{ maxWidth: 760, margin: "0 auto", padding: "14px 20px" }}>
          <a href="/" style={{ display: "inline-flex", alignItems: "center" }}>
            <img src="/OpenChessLogo.png" alt="OpenChess" style={{ display: "block", height: 34, width: "auto" }} />
          </a>
          <LangSwitch />
        </div>
      </header>
      <main style={{ maxWidth: 760, margin: "0 auto", padding: "44px 20px 80px" }}>
        <h1 style={{ fontSize: 26, fontWeight: 900, color: T.ivoryHi, margin: "0 0 6px" }}>{title}</h1>
        <p style={{ fontSize: 12.5, color: T.inkSoft, margin: "0 0 30px" }}>{t("시행일: {0}", fmtDateOnly(EFFECTIVE_ISO, { year: "numeric", month: "long", day: "numeric" }))}</p>
        {sections.map((s) => (
          <section key={s.h} style={{ marginBottom: 26 }}>
            <h2 style={{ fontSize: 15.5, fontWeight: 800, color: T.brass, margin: "0 0 10px" }}>{s.h}</h2>
            <ul style={{ margin: 0, paddingLeft: 18, display: "flex", flexDirection: "column", gap: 6 }}>
              {s.list.map((t) => <li key={t} style={{ fontSize: 13.5, lineHeight: 1.75, color: T.ivory }}>{t}</li>)}
            </ul>
          </section>
        ))}
        <div style={{ display: "flex", gap: 18, marginTop: 40, flexWrap: "wrap" }}>
          <a href={other.href} style={{ color: T.brass, fontSize: 13, fontWeight: 700, textDecoration: "none" }}>{tx("{0} 보기", other.label)}</a>
          {!isDelete && <a href={deletionLink.href} style={{ color: T.brass, fontSize: 13, fontWeight: 700, textDecoration: "none" }}>{tx("{0} 보기", deletionLink.label)}</a>}
          <a href="/" style={{ display: "inline-flex", alignItems: "center", gap: 6, color: T.inkSoft, fontSize: 13, fontWeight: 700, textDecoration: "none" }}>{tx("{0} OpenChess로 돌아가기", <ArrowLeft size={13} />)}</a>
        </div>
      </main>
    </div>
  );
}
