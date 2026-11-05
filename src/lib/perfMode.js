import { useSyncExternalStore } from "react";

// (v0.7.2) 저사양 기기 성능 모드 — 장식 애니메이션 때문에 렉이 걸리지 않게 한다.
//  · 구형 기기(CPU 2코어 이하·메모리 2GB 이하·데이터 절약)는 처음부터 가벼운 모드로 시작한다.
//  · 그 밖의 기기는 접속 직후 약 20초 동안 실제 프레임 간격을 재서, 느리면(평균 32ms 초과가 연속 3구간) 가벼운 모드로 바꾼다. 한 번 바뀌면 이 탭에서는 유지한다.
//  · 가벼운 모드: <html data-perf="lite">(index.css가 블러·필터·무한 CSS 애니메이션을 끈다) + 코드 쪽 LOOP()=0(무한 반복 모션 1회로) + 스크램블·마우스 효과 생략 + 엔진 라인 갱신 간격 확대.
//  · 직접 고르기: localStorage "oc_perf_mode" = "lite" | "full" | "auto"(기본). 기기의 "애니메이션 줄이기" 설정은 보지 않는다(check-reduced-motion 원칙) — 기기 성능만 본다.
const KEY = "oc_perf_mode";
let lite = false;
let started = false;
const subs = new Set();

function apply(v) {
  if (lite === v) return;
  lite = v;
  try { if (typeof document !== "undefined") document.documentElement.setAttribute("data-perf", v ? "lite" : "full"); } catch { }
  subs.forEach((f) => f());
}
const readPref = () => { try { return localStorage.getItem(KEY) || "auto"; } catch { return "auto"; } };
function weakDevice() {
  try {
    const n = navigator, c = n.connection;
    return (n.hardwareConcurrency || 8) <= 2 || (n.deviceMemory || 8) <= 2 || !!(c && c.saveData);
  } catch { return false; }
}

export const isLite = () => lite;
/** 무한 반복 모션(framer-motion repeat)용: 가벼운 모드에선 한 번만 재생한다. */
export const LOOP = () => (lite ? 0 : Infinity);
/** 실시간 엔진 라인 화면 갱신 최소 간격(ms) */
export const engineLineGapMs = () => (lite ? 280 : 90);
export function usePerfLite() {
  return useSyncExternalStore((f) => { subs.add(f); return () => subs.delete(f); }, () => lite, () => false);
}

export function initPerfMode() {
  if (started || typeof window === "undefined") return;
  started = true;
  const pref = readPref();
  if (pref === "lite") { apply(true); return; }
  if (pref === "full") { apply(false); return; }
  if (weakDevice()) { apply(true); return; }
  apply(false);
  // 프레임 간격 측정: 60프레임씩 묶어 평균을 낸다. 250ms 넘게 벌어진 간격(탭 전환 등)은 건너뛴다.
  let last = 0, sum = 0, n = 0, bad = 0, windows = 0;
  const stopAt = performance.now() + 20000;
  const tick = (now) => {
    if (lite || now > stopAt) return;
    if (document.hidden) { last = 0; requestAnimationFrame(tick); return; }
    if (last) {
      const d = now - last;
      if (d < 250) { sum += d; n++; }
      if (n >= 60) { bad = sum / n > 32 ? bad + 1 : 0; sum = 0; n = 0; windows++; if (bad >= 3) { apply(true); return; } }
    }
    last = now;
    requestAnimationFrame(tick);
  };
  // 첫 화면이 그려지는 동안의 초기 부하는 제외하고 1.2초 뒤부터 잰다.
  setTimeout(() => requestAnimationFrame(tick), 1200);
}
