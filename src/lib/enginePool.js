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
