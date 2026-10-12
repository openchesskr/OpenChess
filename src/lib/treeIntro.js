// (v0.6.6, 사용자 요청) 오프닝 트리·마스터 트리를 열 때의 시작 연출 — 정중앙 회로 칩에서 트리가 바깥으로 그려지며(배율 50%) 퍼진 뒤, 100%로 서서히 확대된다.
// 두 트리(src/app/dex.jsx · src/app/dexMasters.jsx)가 같은 상수·계산을 쓴다. CSS 키프레임(dex-intro-node/line/fade)은 App.jsx의 전역 <style>에 있다.
export const INTRO_FROM = 0.5;        // 처음 배율(표시 라벨 기준 50%) — 각 트리의 100% 배율(raw)에 곱한다
export const INTRO_DRAW_S = 1.5;      // 칩에서 화면 가장자리까지 퍼지는 데 걸리는 시간(초) — 이 뒤에 요소 하나의 등장 애니메이션(약 0.6초)이 더 걸린다
export const INTRO_HOLD_MS = 2300;    // 시작 후 이 시간이 지나면(그리기가 끝난 뒤) 확대를 시작한다
export const INTRO_ZOOM_MS = 1300;    // 50% → 100% 확대에 걸리는 시간
/** 50% 배율에서 화면에 보이는 반지름(논리 좌표 px) — 이보다 먼 요소는 어차피 안 보이므로 연출을 건너뛴다. */
export const introReach = (w, h, z) => Math.hypot(w, h) / 2 / Math.max(z, 0.05) * 1.05;
/** 칩에서 dist 떨어진 요소의 등장 지연(초). 화면 밖(reach 너머)이면 null — 연출 없이 그대로 둔다. */
export function introDelay(dist, reach) { return dist > reach ? null : Math.max(0, dist) / reach * INTRO_DRAW_S; }
/** 확대 곡선(천천히 시작해 천천히 끝남). k: 0~1 */
export const introEase = (k) => (k < 0.5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2);
