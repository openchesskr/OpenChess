import React from "react";
import { createRoot } from "react-dom/client";
import "./index.css";
import App from "./App.jsx";
import AboutPage from "./AboutPage.jsx";
import FaqPage from "./FaqPage.jsx";

// (v0.1.2 기능) /about은 App(엔진 워커·Supabase 클라이언트 등 무거운 초기화를 포함)을 아예 거치지
// 않는 별도의 가벼운 소개 페이지로 분리한다 — vercel.json의 SPA rewrite 덕분에 /about으로 직접
// 접속해도 이 번들이 그대로 로드되고, 여기서 경로만 보고 어느 쪽을 렌더링할지 정한다.
// (v0.4.3 기능, 사용자 요청) /faq도 같은 이유로 같은 방식으로 분리 — 설정 탭에서 이 경로로 이동한다.
const path = window.location.pathname.replace(/\/$/, "") || "/";
createRoot(document.getElementById("root")).render(
  path === "/about" ? <AboutPage /> : path === "/faq" ? <FaqPage /> : <App />
);
