import React, { Suspense, lazy } from "react";
import { createRoot } from "react-dom/client";
import "./index.css";
import App from "./App.jsx";

// (v0.1.2 기능) /about은 App(엔진 워커·Supabase 클라이언트 등 무거운 초기화를 포함)을 아예 거치지
// 않는 별도의 가벼운 소개 페이지로 분리한다 — vercel.json의 SPA rewrite 덕분에 /about으로 직접
// 접속해도 이 번들이 그대로 로드되고, 여기서 경로만 보고 어느 쪽을 렌더링할지 정한다.
// (v0.4.3 기능, 사용자 요청) /faq도 같은 이유로 같은 방식으로 분리 — 설정 탭에서 이 경로로 이동한다.
// (v0.5.7 성능) 예전엔 세 페이지를 모두 정적으로 import해, 메인 화면에 들어와도 소개 페이지(버전 기록 전체 포함, 약 33만 자)와
// FAQ를 함께 받았다. 두 페이지는 해당 경로에서만 받도록 동적 import로 나눈다. App은 거의 모든 방문이 들어오는 곳이라 정적으로
// 둔다 — 동적으로 바꾸면 진입 스크립트를 받은 뒤에야 App을 요청하게 돼 왕복이 한 번 늘어난다.
const AboutPage = lazy(() => import("./AboutPage.jsx"));
const FaqPage = lazy(() => import("./FaqPage.jsx"));

const path = window.location.pathname.replace(/\/$/, "") || "/";
createRoot(document.getElementById("root")).render(
  path === "/about" ? <Suspense fallback={null}><AboutPage /></Suspense> : path === "/faq" ? <Suspense fallback={null}><FaqPage /></Suspense> : <App />
);
