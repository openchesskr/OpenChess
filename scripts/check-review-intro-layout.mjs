#!/usr/bin/env node
/** (v0.5.7, 사용자 요청 "리뷰 진입 정확도 그래프 화면이 뷰포트에 한 번에 안 보인다") 리뷰 대기 화면 배치(src/lib/reviewIntroLayout.js)를
 *  여러 화면 크기에서 검사한다 — 예전엔 고정 크기를 위에서부터 쌓아 폰에서 진행 막대가 화면 밖으로 밀렸다.
 *   · 세로형(한 열): 삽화 + 상태 줄 + 평가치 그래프 + 정확도 그래프 2개 + 진행 줄 + 간격의 합이 영역 높이를 넘지 않는다
 *   · 가로형(두 열): 왼쪽 열(삽화·상태·진행)과 오른쪽 열(그래프 3개) 각각의 합이 영역 높이를, 두 열 폭의 합이 영역 폭을 넘지 않는다
 *   · 그래프는 정해진 하한 이상, 삽화는 보이면 최소 높이 이상이고 비율(1300×731)을 지킨다
 *  npm run build 전에 prebuild로 자동 실행된다. 실행: node scripts/check-review-intro-layout.mjs
 */
import { RI, reviewIntroLayout } from "../src/lib/reviewIntroLayout.js";

const fails = [];
// 헤더(약 56~68px)와 바깥 여백을 뺀 실제 영역 크기 — 흔한 폰·태블릿·노트북·모니터
const viewports = [
  [320, 568], [360, 640], [375, 667], [390, 844], [393, 873], [412, 915], [430, 932], [360, 780],
  [768, 1024], [820, 1180], [1024, 768], [1180, 820], [1280, 720], [1366, 768], [1440, 900], [1536, 864], [1920, 1080], [2560, 1440],
  [900, 500], [1200, 600], [700, 900],
];
for (const [vw, vh] of viewports) {
  const narrow = vw < 720;
  const w = vw - (narrow ? 28 : 48), h = vh - (narrow ? 56 : 68) - (narrow ? 24 : 36);
  const L = reviewIntroLayout(w, h);
  const tag = vw + "×" + vh + " (" + L.mode + ")";
  const acc = (a) => a + RI.ACC_EXTRA;
  if (L.carH && L.carH < (L.mode === "row" ? 80 : RI.MIN_CAR)) fails.push(tag + " — 삽화가 너무 작다: " + L.carH);
  if (L.carH && Math.abs(L.carW / L.carH - RI.IMG_AR) > 0.05 && L.carW < (L.mode === "row" ? L.leftW : L.colW)) fails.push(tag + " — 삽화 비율이 틀어졌다");
  if (L.accH < 48 || L.evalH < 40) fails.push(tag + " — 그래프가 하한보다 작다: acc " + L.accH + ", eval " + L.evalH);
  if (L.mode === "col") {
    const total = (L.carH ? L.carH + RI.GAP : 0) + RI.STATUS + (L.evalH + RI.EVAL_PAD) + 2 * acc(L.accH) + RI.PROG + 4 * RI.GAP;
    if (total > h + 0.5) fails.push(tag + " — 한 열 합 " + total + "px > 영역 " + h + "px (아래가 잘림)");
    if (L.colW > w + 0.5) fails.push(tag + " — 열 폭 " + L.colW + " > " + w);
    if (vw <= 430 && vh >= 780 && !L.carH) fails.push(tag + " — 보통 크기 폰에서 삽화가 사라졌다");
  } else {
    const right = (L.evalH + RI.EVAL_PAD) + 2 * acc(L.accH) + 2 * RI.GAP;
    const left = (L.carH ? L.carH + RI.GAP : 0) + RI.STATUS + RI.GAP + RI.PROG;
    if (right > h + 0.5) fails.push(tag + " — 오른쪽 열 합 " + right + "px > 영역 " + h + "px");
    if (left > h + 0.5) fails.push(tag + " — 왼쪽 열 합 " + left + "px > 영역 " + h + "px");
    if (L.leftW + L.rightW + 28 > w + 0.5) fails.push(tag + " — 두 열 폭 합이 영역을 넘는다");
    if (L.carW > L.leftW + 0.5) fails.push(tag + " — 삽화 폭이 왼쪽 열을 넘는다");
  }
}
// 데스크톱 가로형 모니터는 두 열, 폰은 한 열
if (reviewIntroLayout(1392, 796).mode !== "row") fails.push("1440×900 데스크톱이 두 열 배치가 아니다");
if (reviewIntroLayout(362, 764).mode !== "col") fails.push("390×844 폰이 한 열 배치가 아니다");

if (fails.length) {
  console.error("✖ check-review-intro-layout: " + fails.length + "건\n  · " + fails.join("\n  · "));
  process.exit(1);
}
console.log("✔ check-review-intro-layout: " + viewports.length + "개 화면 크기에서 리뷰 대기 화면이 영역 안에 다 들어간다");
