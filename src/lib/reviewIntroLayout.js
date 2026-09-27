// (v0.5.7, 사용자 요청) 게임 리뷰 대기(정확도 그래프) 화면 배치 — 헤더 아래 실제로 쓸 수 있는 영역(w×h, px)에서 각 요소 크기를 계산한다.
// App.jsx의 ReviewAccuracyRevealAnim 위 주석 참고. 요소 높이 상수는 그 화면의 실제 마크업과 맞춰 둔 값이다:
//   STATUS 상태 문구 줄, PROG 진행 막대 줄, GAP 요소 사이 간격, ACC_EXTRA 정확도 그래프의 이름표(17+3)+분석 중 줄(3+14),
//   EVAL_PAD 평가치 그래프 상자의 위아래 안쪽 여백(6+6), IMG_AR 삽화 비율(1300×731), MIN_CAR 삽화를 보여 줄 최소 높이.
export const RI = { STATUS: 20, PROG: 16, GAP: 10, ACC_EXTRA: 37, EVAL_PAD: 12, IMG_AR: 1300 / 731, MIN_CAR: 96 };
const riClamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
export function reviewIntroLayout(w0, h0) {
  const w = Math.max(240, Math.floor(w0 || 0)), h = Math.max(240, Math.floor(h0 || 0));
  if (w >= 760 && w / h >= 1.15) {
    const totalW = Math.min(w, 1180), gapX = 28;
    const leftW = Math.round((totalW - gapX) * 0.46), rightW = totalW - gapX - leftW;
    const hh = h - 16; // 오른쪽 열이 영역 위아래 끝에 딱 붙지 않게 조금 남긴다
    const evalH = riClamp(Math.round(hh * 0.2), 60, 150);
    const accH = riClamp(Math.floor((hh - (evalH + RI.EVAL_PAD) - 2 * RI.ACC_EXTRA - 2 * RI.GAP) / 2), 64, 180);
    let carH = Math.min(Math.round(leftW / RI.IMG_AR), h - RI.STATUS - RI.PROG - 2 * RI.GAP);
    if (carH < 80) carH = 0;
    return { mode: "row", totalW, leftW, rightW, evalH, accH, carH, carW: Math.min(leftW, Math.round(carH * RI.IMG_AR)) };
  }
  // 세로로 긴 태블릿은 한 열을 조금 넓게(최대 680) — 폭 520에 고정하면 아래위가 많이 남았다.
  const colW = Math.min(w, Math.round(riClamp(520 + (h - 800) * 0.4, 520, 680)));
  let evalH = riClamp(Math.round(colW * 0.2875), 56, 110), accH = 116;
  const fixed = () => RI.STATUS + (evalH + RI.EVAL_PAD) + 2 * (accH + RI.ACC_EXTRA) + RI.PROG + 4 * RI.GAP;
  const carMax = Math.min(Math.round(colW / RI.IMG_AR), h > 1000 ? 320 : 240);
  let carH = h - fixed() - RI.GAP;
  if (carH < RI.MIN_CAR) {
    const need = RI.MIN_CAR - carH, room = 2 * (accH - 72) + (evalH - 56);
    if (need <= room) {
      const k = need / room;
      accH = Math.floor(accH - (accH - 72) * k); evalH = Math.floor(evalH - (evalH - 56) * k);
      carH = h - fixed() - RI.GAP;
    } else {
      carH = 0;
      const rest = h - (RI.STATUS + RI.EVAL_PAD + 2 * RI.ACC_EXTRA + RI.PROG + 4 * RI.GAP);
      evalH = riClamp(Math.floor(rest * 0.26), 40, evalH);
      accH = riClamp(Math.floor((rest - evalH) / 2), 48, 116);
    }
  } else if (carH > carMax) {
    // 남는 높이는 그래프에 나눠 준다(정확도 그래프 최대 180, 평가치 그래프 최대 140) — 나머지는 위아래 가운데 정렬 여백.
    let extra = carH - carMax;
    carH = carMax;
    const addAcc = Math.min(180 - accH, Math.floor(extra * 0.35));
    accH += addAcc; extra -= 2 * addAcc;
    evalH = Math.min(140, evalH + Math.max(0, Math.floor(extra * 0.3)));
  }
  carH = Math.max(0, Math.floor(carH));
  return { mode: "col", colW, evalH, accH, carH, carW: carH ? Math.min(colW, Math.round(carH * RI.IMG_AR)) : 0 };
}
