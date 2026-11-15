// (v0.7.8, 사용자 요청) 소셜 탭 게시물 "관심 없음" — 고른 게시물을 이 기기의 피드에서 숨긴다(서버에 보내지 않는 개인 취향 설정).
//  키: 퍼즐 "p:<id>", 유산·대국 "l:<owner>:<id>"(socialMix.js의 피드 항목 key와 같다). 최대 500개(오래된 것부터 지움). 저장소가 막혀 있으면 이 세션에서만 숨긴다.
const STORE_KEY = "oc_social_hidden_v1", MAX = 500;
let hidden = null; const subs = new Set();
function load() {
  if (hidden) return hidden;
  try { const a = JSON.parse(localStorage.getItem(STORE_KEY) || "[]"); hidden = new Set(Array.isArray(a) ? a.filter((x) => typeof x === "string").slice(-MAX) : []); }
  catch { hidden = new Set(); }
  return hidden;
}
function save() { try { localStorage.setItem(STORE_KEY, JSON.stringify([...hidden].slice(-MAX))); } catch { /* 이 세션에서만 */ } subs.forEach((f) => { try { f(); } catch { /* ignore */ } }); }
export const isHiddenPost = (key) => load().has(key);
export function hidePost(key) { if (!key) return; load(); hidden.delete(key); hidden.add(key); while (hidden.size > MAX) hidden.delete(hidden.values().next().value); save(); }
export function unhidePost(key) { load(); if (hidden.delete(key)) save(); }
export function onHiddenChange(f) { subs.add(f); return () => subs.delete(f); }
