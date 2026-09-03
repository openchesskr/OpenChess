export const ROOT_ORDER = ["e4", "d4"];
export const DIR_OF_ROOT = { e4: "N", d4: "S" };
export const SCHEMATIC_BOX_W = 98, SCHEMATIC_BOX_H = 44;
// (v0.0.6) 예전엔 실제 CSS 배율 1.0을 "100%"라고 표시했는데, 다들 첫 화면에서 곧장 75%로 축소해야
// 편하게 보인다는 피드백이 이어졌다 — 그 "75%"를 새 기준(100%)으로 다시 정의한다. zoom 상태 값
// 자체는 여전히 실제 CSS scale()에 그대로 쓰이는 값이고(좌표 계산 코드는 손댈 필요 없음), 그 값의
// 25%p 격자(0.1875 = 0.25 × 0.75)와 화면 표시 라벨만 이 기준에 맞춰 다시 잡는다.
export const SCHEMATIC_ZOOM_LABEL_BASE = 0.75;
export function schematicZoomLabel(z) { return Math.round((z / SCHEMATIC_ZOOM_LABEL_BASE) * 100) + "%"; }
// (기능) 사이트 전체 모식도(도감 오프닝 트리·퍼즐 모식도·개발자 트리 에디터)의 확대/축소를
// 새 기준 25%p 단위(라벨 25~200%)로만 고정한다 — 버튼 클릭은 물론 핀치·휠 같은 연속 제스처로 나온
// 값도 이 함수로 가장 가까운 단계에 스냅해, 어디서든 항상 8단계(25/50/75/100/125/150/175/200%) 중
// 하나로만 보이게 한다.
export const SCHEMATIC_ZOOM_STEP = 0.25 * SCHEMATIC_ZOOM_LABEL_BASE, SCHEMATIC_ZOOM_MIN = SCHEMATIC_ZOOM_STEP, SCHEMATIC_ZOOM_MAX = 2 * SCHEMATIC_ZOOM_LABEL_BASE;
export function snapSchematicZoom(z) {
  const clamped = Math.min(SCHEMATIC_ZOOM_MAX, Math.max(SCHEMATIC_ZOOM_MIN, z));
  return Math.round(clamped / SCHEMATIC_ZOOM_STEP) * SCHEMATIC_ZOOM_STEP;
}
// (사용자 요청) 퍼즐 모식도(PuzzleSchematic)는 v0.3.2에서 블록 크기를 약 50% 키웠는데(104→156 등),
// 위 SCHEMATIC_ZOOM_LABEL_BASE(도감 오프닝 트리와 공유하는 기준)는 그대로라 다들 기본 배율(100%)이
// 너무 확대돼 보여 매번 50%까지 직접 축소해야 편하게 봤다 — 그 "50%"를 퍼즐 모식도만의 새 기준
// (100%)으로 재정의한다. 오프닝 트리·개발자 트리 에디터가 공유하는 SCHEMATIC_* 상수는 그대로 두고
// (건드리면 그 둘의 배율까지 함께 바뀐다), 퍼즐 모식도 전용 상수를 따로 둔다 — raw CSS scale 값은
// 정확히 SCHEMATIC_ZOOM_LABEL_BASE의 절반(0.375)이라, PuzzleSchematic 입장에서는 "예전에 50%라고
// 부르던 배율 그대로"가 이제 "100%"라고 표시될 뿐, 좌표 계산 코드는 손댈 필요가 없다.
export const PUZZLE_ZOOM_LABEL_BASE = SCHEMATIC_ZOOM_LABEL_BASE / 2;
export function puzzleZoomLabel(z) { return Math.round((z / PUZZLE_ZOOM_LABEL_BASE) * 100) + "%"; }
export const PUZZLE_ZOOM_STEP = 0.25 * PUZZLE_ZOOM_LABEL_BASE, PUZZLE_ZOOM_MIN = PUZZLE_ZOOM_STEP, PUZZLE_ZOOM_MAX = 2 * PUZZLE_ZOOM_LABEL_BASE;
export function snapPuzzleZoom(z) {
  const clamped = Math.min(PUZZLE_ZOOM_MAX, Math.max(PUZZLE_ZOOM_MIN, z));
  return Math.round(clamped / PUZZLE_ZOOM_STEP) * PUZZLE_ZOOM_STEP;
}
// (버그 수정) 확대/축소 버튼·휠·핀치가 pan은 그대로 두고 zoom만 바꾸다 보니, 화면 좌상단(콘텐츠
// 원점)을 기준으로 확대/축소가 일어났다 — 원점에서 멀리 떨어진 곳(팬으로 옮겨온 화면 중앙, 또는
// 핀치 중심)을 보고 있을 때는 그 지점이 배율만큼 훌쩍 밀려나 트리 전체가 화면 밖으로 사라진
// 것처럼 보이는 버그의 원인이었다. 확대/축소 전 그 화면 좌표 아래 있던 콘텐츠 좌표를 구해, 배율이
// 바뀐 뒤에도 같은 화면 좌표에 그대로 남아 있도록 pan을 함께 보정한다(표준 "지점 기준 확대" 공식).
export function anchoredZoomPan(pan, zoom, nextZoom, anchorX, anchorY) {
  const cx = (anchorX - pan.x) / zoom, cy = (anchorY - pan.y) / zoom;
  return { x: anchorX - cx * nextZoom, y: anchorY - cy * nextZoom };
}
// (v0.1.2 기능) 모식도(퍼즐/도감 오프닝 트리)를 블록이 하나도 없는 빈 공간까지 계속 드래그·휠로
// 팬할 수 있던 것을 막는다. 도감의 나침반형 레이아웃은 네 팔(N/S/E/W) 사이 귀퉁이가 항상 비어
// 있고 트리 자체도 가지마다 성기게 뻗어 있어, 콘텐츠 전체(또는 팔 하나)의 사각 바운딩 박스만으로
// "한계 안"을 정의하면 그 박스 안의 실제로는 비어 있는 자리까지 허용해 버린다 — 그래서 블록
// 목록(items) 자체를 기준으로, "지금 화면에 실제 블록이 하나라도 온전히 걸쳐 있는지"를 직접 훑어
// 검사한다. 이미 하나라도 보이면 그대로 두고(자유 팬 유지), 하나도 안 보이면(빈 공간까지 팬한
// 경우) 화면 중심에 가장 가까운 블록을 찾아 그 블록이 온전히 보이도록 좌표를 스냅한다.
// (v0.1.2 기능) 도감 오프닝 트리 캔버스 좌상단에는 검색창이 떠 있어(대략 이 높이만큼), 팬 한계가
// 스냅한 블록이 그 뒤에 가려지지 않도록 유효 뷰포트 상단을 이만큼 안으로 줄인다.
export const SCHEMATIC_TOP_INSET = 44;
// (사용자 요청) 예전엔 나침반 중심 회로 칩을 "실제로 화면에 보이는 범위의 절반"(visibleBoxCenter,
// 박스가 뷰포트보다 커서 잘릴 때를 대비한 보정)에 맞췄으나, 이제 모식도 박스 자신이 항상 뷰포트
// 안에 통째로 들어오도록 높이가 동적으로 계산되므로(OpeningSchematic의 panelH) 그런 보정이 필요
// 없어졌다 — 박스 자신의 정중앙(rect.width/2, rect.height/2)에 그대로 맞춘다.
export function clampPanAxis(p, viewportSize, min, max, minVisible) {
  const lo = minVisible - max, hi = (viewportSize - minVisible) - min;
  if (lo > hi) return (lo + hi) / 2;
  return Math.max(lo, Math.min(hi, p));
}
// (v0.1.3 버그 수정) "화면에 실제 블록이 있는지"를 블록이 100% 온전히 다 들어와야 참으로 치도록
// 판정하고 있었다 — 뷰포트 크기가 격자 간격(colW/rowH)의 배수와 딱 맞아떨어지지 않는 이상(거의
// 항상 그렇다) 드래그 도중 어느 블록도 한 픽셀의 오차 없이 완전히 다 보이지 않는 순간이 매 프레임
// 존재하고, 그때마다 이 함수가 false를 반환해 clampSchematicPan이 "빈 공간으로 나갔다"고 오판해
// 가장 가까운 블록으로 계속 스냅해버렸다 — 그 결과 화면 끝(진짜 빈 공간)이 아닌데도 팬이 매 순간
// 튕겨 돌아와 스크롤 자체가 안 되는 것처럼 보였다. "블록이 화면에 있다"는 판정은 완전 포함이 아니라
// 뷰포트와 블록의 사각형이 조금이라도 겹치는지(교차 여부)만으로 충분하다 — 어떤 블록과도 전혀 겹치지
// 않을 때(진짜로 빈 공간까지 나갔을 때)만 스냅이 개입한다.
export function schematicItemVisible(pan, zoom, viewportW, viewportH, it, boxW, boxH, insetTop) {
  const left = pan.x + it.x * zoom, right = left + boxW * zoom;
  const top = pan.y + it.y * zoom, bottom = top + boxH * zoom;
  return right > 0 && left < viewportW && bottom > insetTop && top < viewportH;
}
// (v0.1.2 기능) insetTop — 검색창 등 캔버스 위에 떠 있는 UI가 뷰포트 상단을 가리는 만큼, 스냅 대상
// 블록이 그 뒤에 숨어버리지 않도록 "화면에 보인다"고 칠 유효 영역의 위쪽을 그만큼 안으로 줄인다.
// (버그 수정) 나침반형(방사형) 오프닝 트리는 네 팔(N/S/E/W) 사이 부채꼴 틈이 화면 규모에 비해
// 아주 넓다 — 기존엔 "지금 화면에 블록이 하나라도 걸쳐 있는지"를 매 프레임 다시 훑어, 하나도 안
// 걸치면 곧장 가장 가까운 블록으로 좌표를 스냅했다. 그런데 대각선으로 드래그하면 그 팔 사이 빈
// 부채꼴을 순간적으로 지나가는 프레임이 흔했고, 그때마다 이 판정이 "빈 공간까지 나갔다"고 오판해
// 드래그 도중 갑자기 엉뚱한 좌표로 튀는 것처럼 보였다(사용자 표현: "드래그가 잘 되지 않다가 갑자기
// 다른 좌표로 순간이동"). 격자형(퍼즐) 레이아웃은 빈틈이 좁아 이 방식이 잘 맞지만, 방사형 레이아웃엔
// 안 맞는다 — items 배열 대신 전체 콘텐츠의 사각 바운딩 박스({minX,maxX,minY,maxY})를 넘기면,
// 그 박스 테두리에서만 부드럽게(연속적으로) 멈추고 중간에 스냅이 끼어들지 않는다.
export function clampSchematicPan(pan, zoom, viewportW, viewportH, items, boxW, boxH, insetTop = 0) {
  if (!items) return pan;
  if (!Array.isArray(items)) {
    const { minX, maxX, minY, maxY } = items;
    return {
      x: clampPanAxis(pan.x, viewportW, minX * zoom, (maxX + boxW) * zoom, boxW * zoom),
      y: clampPanAxis(pan.y - insetTop, viewportH - insetTop, minY * zoom, (maxY + boxH) * zoom, boxH * zoom) + insetTop,
    };
  }
  if (!items.length) return pan;
  for (const it of items) { if (schematicItemVisible(pan, zoom, viewportW, viewportH, it, boxW, boxH, insetTop)) return pan; }
  // 화면 중심(가려진 영역을 뺀 실제 유효 뷰포트 기준)이 콘텐츠 좌표계에서 지금 가리키는 지점에
  // 가장 가까운 블록을 찾는다.
  const ccx = (viewportW / 2 - pan.x) / zoom, ccy = (insetTop + (viewportH - insetTop) / 2 - pan.y) / zoom;
  let nearest = items[0], bestD = Infinity;
  for (const it of items) {
    const dx = it.x + boxW / 2 - ccx, dy = it.y + boxH / 2 - ccy;
    const d = dx * dx + dy * dy;
    if (d < bestD) { bestD = d; nearest = it; }
  }
  return {
    x: clampPanAxis(pan.x, viewportW, nearest.x * zoom, (nearest.x + boxW) * zoom, boxW * zoom),
    y: clampPanAxis(pan.y - insetTop, viewportH - insetTop, nearest.y * zoom, (nearest.y + boxH) * zoom, boxH * zoom) + insetTop,
  };
}
export const SCHEMATIC_ELECTRIC = "#22D3F0";
// (사용자 요청) "한번에 변하지 말고 전기가 흐르는 것처럼 거리 비례로 약 0.3~1초 정도 동안 중심부부터
// 천천히 파란색으로 변해가도록" — 선택 경로는 클릭한 노드까지의 거리(targetR)를 이 속도로 나눠
// 총 애니메이션 길이를 정하고(0.3~1초 사이로 clamp), 경로 위 각 지점은 그 지점까지의 거리 비율만큼
// 지연시켜(가까운 지점부터 먼저) 중심에서 바깥으로 흘러나가는 것처럼 보이게 한다.
export const DEX_SELECT_FLOW_SPEED = 9000; // 논리 좌표 px/s 기준
// (사용자 요청) "중심부 회로를 눌렀을 때도 모든 방향으로 같은 속도로 서서히 중심부부터 파란색으로
// 변하도록" — 기존엔 depth(정수 단계 수)에 비례한 지연을 썼는데, 깊이별 반지름 증가폭이 서로 달라
// 실제로는 방향마다 체감 속도가 달랐다. 노드의 실제 반지름(r)을 이 고정 속도로 나눠, 어느 방향이든
// 물리적으로 똑같은 속도(px/s)로 퍼져나가도록 한다.
export const DEX_ELECTRIC_FLOW_SPEED = 9000;
export const schematicCoord = (it) => ({ x: it.x, y: it.y });
// (기능) 부모→자식 연결선의 ㄱ자(elbow) 꺾임 좌표 — 트리 선(edges) 렌더링과, 검색으로 오프닝을
// 골랐을 때 그 선을 그대로 따라가는 이동 애니메이션(OpeningSchematic의 buildFlightWaypoints)이
// 정확히 같은 경로를 그리도록 계산 로직을 하나로 공유한다.
export function schematicElbow(p, c) {
  const boxW = SCHEMATIC_BOX_W, boxH = SCHEMATIC_BOX_H;
  const pc = schematicCoord(p), cc2 = schematicCoord(c);
  // (v0.3.2 개편) 나침반 네 팔이 방사형(radial)으로 바뀌면서, 축 정렬을 전제하던 기존 ㄱ자(elbow)
  // 꺾임 연결선은 더 이상 부모·자식의 실제 위치 관계와 맞지 않는다 — 중심 회로 칩을 기준으로 사방
  // 어느 각도로도 뻗어나갈 수 있으므로, 부모 중심에서 자식 중심으로 곧은 직선을 긋는다(검색 이동
  // 애니메이션도 이 좌표를 그대로 따라가므로 함께 자연스러운 방사형 경로가 된다).
  return [[pc.x + boxW / 2, pc.y + boxH / 2], [cc2.x + boxW / 2, cc2.y + boxH / 2]];
}
