// (v0.8.0) 브라우저 탭 제목 — 예전엔 모든 화면이 "OpenChess" 하나라 탭·방문 기록·북마크에서 화면을 구분할 수 없었다.
//  탭 화면은 "분석 · OpenChess"처럼 화면 이름을 앞에 붙인다(이름은 이미 번역된 t() 값을 넘긴다).
import { useEffect } from "react";
export const SITE_NAME = "OpenChess";
export function pageTitle(name) { return name ? name + " · " + SITE_NAME : SITE_NAME; }
export function usePageTitle(name) {
  useEffect(() => { try { document.title = pageTitle(name); } catch { /* SSR·테스트 환경 */ } }, [name]);
}
