// (v0.6.0, 앱 출시 준비) 사이트·API 주소를 한 곳에서 정한다.
//  · SITE_URL: 사용자에게 내보내는 공유·초대 링크의 대표 주소. 앱(웹뷰) 안에서는 window.location.origin이
//    capacitor://localhost 같은 값이라 링크가 깨지므로, 링크는 항상 이 값으로 만든다.
//  · API_BASE: /api/* 서버리스 함수의 기준 주소. 웹은 빈 문자열(같은 출처), 앱 빌드는 VITE_API_BASE로 지정.
export const SITE_URL = "https://openchess.kr";
export const CONTACT_EMAIL = "openchesskr@gmail.com";
const RAW_API_BASE = (typeof import.meta !== "undefined" && import.meta.env && import.meta.env.VITE_API_BASE) || "";
export const API_BASE = RAW_API_BASE.replace(/\/+$/, "");
export function apiUrl(path) { return API_BASE + path; }
export function siteUrl(path) { return SITE_URL + path; }
