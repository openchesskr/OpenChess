import { jsx as _jsx, jsxs as _jsxs, Fragment } from "react/jsx-runtime";
import { lang } from "../i18n.js";
import { LANG_FONT_SCALE, scaleProps } from "../langScale.js";
// (v0.6.2) 언어별 글자 크기 보정을 걸어 둔 JSX 런타임 — vite.config.js의 jsxImportSource가 이 모듈을 가리킨다. 언어는 페이지를 열 때 한 번 정해지므로 배율도 한 번만 읽는다.
export const SCALE = LANG_FONT_SCALE[lang] || 1;
if (typeof document !== "undefined") document.documentElement.style.setProperty("--oc-fs-scale", String(SCALE));
export { Fragment };
export const jsx = (type, props, key) => _jsx(type, scaleProps(type, props, SCALE), key);
export const jsxs = (type, props, key) => _jsxs(type, scaleProps(type, props, SCALE), key);
