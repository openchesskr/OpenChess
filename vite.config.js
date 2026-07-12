import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
// 단일 스레드 Stockfish는 COOP/COEP가 필요 없지만, 멀티스레드 빌드(SharedArrayBuffer)를 쓰려면
// 교차 출처 격리가 되어야 한다 — 배포지(vercel.json)와 동일한 헤더를 로컬 개발 서버에도 달아 둔다.
// credentialless: require-corp과 달리 CORP 헤더가 없는 외부 이미지(구글 프로필 사진 등)도
// 자격증명 없이 그대로 불러올 수 있어, 격리를 켜면서도 기존 리소스가 깨질 위험을 줄인다.
const CROSS_ORIGIN_ISOLATION_HEADERS = {
  "Cross-Origin-Opener-Policy": "same-origin",
  "Cross-Origin-Embedder-Policy": "credentialless",
};
// base: Vercel/Netlify/Cloudflare(루트 도메인)는 "/", GitHub Pages 하위경로는 VITE_BASE 로 주입.
export default defineConfig({
  base: process.env.VITE_BASE || "/",
  plugins: [react()],
  server: { headers: CROSS_ORIGIN_ISOLATION_HEADERS },
  preview: { headers: CROSS_ORIGIN_ISOLATION_HEADERS },
});
