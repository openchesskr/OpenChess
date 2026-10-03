// (v0.6.3, 사용자 요청) 수 등급 이펙트 표시 범위 — 순수 로직(scripts/check-move-fx.mjs가 검사). 화면 쪽 이펙트 정의(MOVE_FX)는 src/app/common.jsx.
//  · "all": 모두 표시 · "key": 탁월한 수·유일한 수만 · "off": 표시하지 않음. 예전엔 불리언(moveFxOn)이었다.
export const MOVE_FX_MODES = ["all", "key", "off"];
export const DEFAULT_MOVE_FX_MODE = "all";
export const MOVE_FX_KEY_KINDS = ["brilliant", "only"];
// 이펙트가 있는 등급(수 체계 아이콘이 있는 모든 등급, "pending" 제외). common.jsx의 MOVE_FX 키와 같아야 한다.
export const MOVE_FX_KINDS = ["brilliant", "only", "best", "excellent", "good", "book", "inaccuracy", "mistake", "miss", "blunder"];
export function normalizeMoveFxMode(v) { return MOVE_FX_MODES.includes(v) ? v : DEFAULT_MOVE_FX_MODE; }
/* 저장값 해석 — moveFxMode가 있으면 그대로, 없고 예전 moveFxOn === false면 "off", 그 외엔 null(= 저장된 선택 없음, 기본값 유지). */
export function moveFxModeFromSaved(d) {
  if (!d) return null;
  if (MOVE_FX_MODES.includes(d.moveFxMode)) return d.moveFxMode;
  if (d.moveFxOn === false) return "off";
  return null;
}
/* 이 등급의 이펙트를 이 표시 범위에서 재생하는가 — Board·퍼즐·무한 체크메이트가 모두 이 함수 하나로 정한다. */
export function moveFxKindOn(mode, kind) {
  if (!MOVE_FX_KINDS.includes(kind) || mode === "off") return false;
  if (mode === "key") return MOVE_FX_KEY_KINDS.includes(kind);
  return true;
}
