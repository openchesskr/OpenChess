// (v0.6.2, 사용자 요청) 언어별 글자 크기 보정 — 앱의 글자 크기는 거의 전부 한국어 문구 길이에 맞춰 inline style(fontSize: 12 등)로 정해져 있어,
// 영어·스페인어·힌디어처럼 같은 뜻이 더 길게 나오는 언어에서는 줄바꿈·잘림·겹침으로 UI가 일그러졌다. 한국어가 아닌 모든 언어에서 inline fontSize를
// 언어별 배율만큼 일괄로 줄인다. 화면마다 고치는 대신 JSX 런타임 한 곳(src/lib/jsx/*)에서 DOM 요소의 style.fontSize를 보정하므로 새로 만드는 화면도 자동으로 적용된다.
// 배율은 글자 폭 기준 — 라틴 문자(영어·스페인어)가 가장 길고, 힌디어는 글자 높이가 커서 비슷하게, 일본어·중국어는 한국어와 글자 폭이 비슷해 조금만 줄인다.
// scripts/check-lang-scale.mjs가 배율·최소 크기·런타임 연결을 검사한다.
export const LANG_FONT_SCALE = { ko: 1, en: 0.88, es: 0.85, hi: 0.86, ja: 0.92, zh: 0.92 };
export const MIN_SCALED_PX = 8;   // 줄인 결과가 이보다 작아지지 않게(원래 이보다 작은 글자는 그대로)
export function scaleOnePx(px, scale) {
  if (!(px > MIN_SCALED_PX) || scale === 1) return px;
  return Math.max(MIN_SCALED_PX, Math.round(px * scale * 10) / 10);
}
// fontSize 값(숫자 px | "12px" | "clamp(9px, 2.2cqw, 14px)" 같은 px가 든 문자열) 보정. rem·em·%만 있는 값은 그대로 둔다.
export function scaleFontSize(fs, scale) {
  if (scale === 1 || fs == null) return fs;
  if (typeof fs === "number") return scaleOnePx(fs, scale);
  if (typeof fs === "string" && fs.includes("px")) return fs.replace(/(\d+(?:\.\d+)?)px/g, (m, n) => scaleOnePx(parseFloat(n), scale) + "px");
  return fs;
}
// framer-motion의 motion.div 등은 내부에서 DOM을 직접 만들어(우리 JSX 런타임을 거치지 않음) 호출 지점에서 보정해야 한다. 일반 컴포넌트는 style을 DOM 요소로 넘길 때 보정되므로 제외(이중 보정 방지).
const MOTION_SYMBOL = typeof Symbol !== "undefined" ? Symbol.for("motionComponentSymbol") : null;
export function isScalableType(type) { return typeof type === "string" || (!!type && typeof type === "object" && !!MOTION_SYMBOL && !!type[MOTION_SYMBOL]); }
// DOM 요소(type이 문자열)·motion 요소의 props.style.fontSize만 보정한 새 props를 돌려준다(바뀔 게 없으면 같은 객체).
export function scaleProps(type, props, scale) {
  if (scale === 1 || !props || !isScalableType(type)) return props;
  const st = props.style;
  if (!st || st.fontSize == null) return props;
  const fs = scaleFontSize(st.fontSize, scale);
  return fs === st.fontSize ? props : { ...props, style: { ...st, fontSize: fs } };
}
