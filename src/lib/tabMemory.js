// (v0.7.5, 사용자 요청) 탭 사이를 오가도 각 탭의 화면 상태·이동 경로를 그대로 유지한다.
//  탭은 떠날 때 언마운트되므로(분석·퍼즐·학습·설정), 화면 안의 useState는 돌아오면 처음 값으로 되돌아갔다(예: 분석 보드 뒤집기).
//  · useTabMemory(key, init): useState와 똑같이 쓰되, 값을 모듈 메모리 + sessionStorage에 남겨 다시 마운트돼도(같은 탭 세션 안의 새로고침 포함) 이어진다.
//    키는 "탭.항목" 꼴로 짓는다(예: "analysis.flip"). 값은 JSON으로 저장할 수 있어야 한다.
//  · 탭마다 마지막 하위 주소(예: 도감 /master)와 스크롤 위치를 기억해, 탭 막대로 돌아오면 그 주소·위치로 복귀한다(App.jsx switchTab).
import { useCallback, useState } from "react";

const SS_KEY = "oc_tab_mem_v1";
let mem = null;
function load() {
  if (mem) return mem;
  mem = new Map();
  try { const raw = window.sessionStorage.getItem(SS_KEY); if (raw) for (const [k, v] of Object.entries(JSON.parse(raw))) mem.set(k, v); } catch { }
  return mem;
}
let saveTimer = null;
function persist() {
  if (saveTimer) return;
  saveTimer = setTimeout(() => {
    saveTimer = null;
    try { window.sessionStorage.setItem(SS_KEY, JSON.stringify(Object.fromEntries(load()))); } catch { }
  }, 120);
}
export function readTabMemory(key, fallback) { const m = load(); return m.has(key) ? m.get(key) : fallback; }
export function writeTabMemory(key, value) { const m = load(); if (value === undefined) m.delete(key); else m.set(key, value); persist(); }
/** useState와 같은 모양. 탭이 언마운트됐다 다시 마운트돼도 마지막 값으로 시작한다. */
export function useTabMemory(key, init) {
  const [v, setV] = useState(() => { const m = load(); return m.has(key) ? m.get(key) : (typeof init === "function" ? init() : init); });
  const set = useCallback((next) => {
    setV((prev) => { const val = typeof next === "function" ? next(prev) : next; writeTabMemory(key, val); return val; });
  }, [key]);
  return [v, set];
}
// ── 탭별 마지막 주소·스크롤 위치 ──
export function rememberTabPlace(tab, path, scrollY) {
  if (!tab) return;
  if (path) writeTabMemory("nav.path." + tab, path);
  if (Number.isFinite(scrollY)) writeTabMemory("nav.scroll." + tab, Math.max(0, Math.round(scrollY)));
}
export const tabLastPath = (tab) => readTabMemory("nav.path." + tab, null);
export const tabLastScroll = (tab) => readTabMemory("nav.scroll." + tab, 0);
