// (v0.6.2 BUG-054) 분석 풀(getAnalysisPool)이 통째로 없을 때(부팅 실패·4초 부팅 제한 초과 — 신경망이 큰 프로필의 모바일) poolWorker가 돌려주는
// 대체 엔진. useEngine 인스턴스는 풀 워커와 evaluateMulti 인자 순서가 달라
//   엔진:   (fen, d, multipv, mt, onProgress, onLines, slot)
//   풀 워커: (fen, d, multipv, mt, onLines, slot, hardBuffer)
// 호출부가 풀 워커 기준으로 부르면 onLines 자리에 slot 문자열이 들어가 TypeError가 나고, try/catch에 삼켜져 엔진 라인·평가치·후보 수가 영영
// 비어 있었다(분석 탭 FEN 모드의 0.00). 풀 워커와 같은 인자 순서의 어댑터로 감싸 풀 워커를 쓰는 모든 호출부가 폴백에서도 같은 코드로 동작한다.
// scripts/check-engine-pool-fallback.mjs가 인자 순서를 검사한다.
const poolFallbackCache = new WeakMap();
export function poolFallbackWorker(engine) {
  if (!engine) return engine;
  let a = poolFallbackCache.get(engine);
  if (!a) {
    a = {
      evaluate: (fen, d, onProgress, mt, slot) => engine.evaluate(fen, d, onProgress, mt, slot),
      evaluateMulti: (fen, d, multipv, mt, onLines, slot) => engine.evaluateMulti(fen, d, multipv, mt, undefined, onLines, slot),
      terminate() { },
    };
    poolFallbackCache.set(engine, a);
  }
  return a;
}

// (v0.7.7 렉·엔진 끊김·모바일 성장 분석 수정) 분석 풀 크기 — 설명은 src/app/common.jsx analyzePoolSize 위 주석.
export const POOL_WORKER_MB = { light: 90, heavy: 600 };
export function isConstrainedDevice() {
  if (typeof navigator === "undefined") return false;
  const ua = navigator.userAgent || "";
  const mobileUA = /Android|iPhone|iPad|iPod|Mobile/i.test(ua) || (navigator.maxTouchPoints > 1 && /Macintosh/.test(ua));   // iPadOS는 Mac처럼 보고한다
  const mem = navigator.deviceMemory;
  return mobileUA || (typeof mem === "number" && mem <= 4);
}
export function poolSizeFor({ cores = 4, heavy = false, constrained = false, memGB = null } = {}) {
  let n = heavy ? (constrained ? 0 : 2) : (constrained ? 2 : Math.max(2, Math.min(cores - 2, 8)));
  if (typeof memGB === "number" && memGB > 0) n = Math.min(n, Math.floor((memGB * 1024 * 0.25) / (heavy ? POOL_WORKER_MB.heavy : POOL_WORKER_MB.light)));
  return Math.max(heavy ? 0 : 1, n);
}
