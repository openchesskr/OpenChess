#!/usr/bin/env node
/** (v0.6.8, BUG-104 재발 방지) 정의되지 않은 이름을 쓰는 코드를 빌드 전에 찾는다.
 *  vite 빌드는 import에서 빠진 이름(예: achievableTitles)을 오류로 보지 않아, 배포 후 앱을 열 때 "화면 불러오기 실패"로만 드러났다.
 *  src/ 의 모든 .js·.jsx를 babel로 읽어, 어디에도 선언·import되지 않고 브라우저 전역도 아닌 이름을 실패로 보고한다.
 *  새 전역을 쓰면(드문 일) 아래 BROWSER_GLOBALS에 더한다.
 */
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const babel = require("@babel/core");
const traverse = require("@babel/traverse").default;
const BROWSER_GLOBALS = new Set(("window document navigator location history console localStorage sessionStorage indexedDB fetch Request Response Headers URL URLSearchParams FormData Blob File FileReader Image Audio AudioContext webkitAudioContext OfflineAudioContext Worker SharedWorker MessageChannel BroadcastChannel WebSocket EventSource XMLHttpRequest AbortController AbortSignal Event CustomEvent KeyboardEvent MouseEvent PointerEvent TouchEvent ErrorEvent PromiseRejectionEvent MessageEvent StorageEvent HTMLElement HTMLCanvasElement HTMLInputElement HTMLImageElement HTMLVideoElement HTMLAudioElement Element Node NodeList DOMParser DOMRect XMLSerializer MutationObserver ResizeObserver IntersectionObserver PerformanceObserver performance requestAnimationFrame cancelAnimationFrame requestIdleCallback cancelIdleCallback setTimeout clearTimeout setInterval clearInterval queueMicrotask structuredClone atob btoa alert confirm prompt open close crypto Intl Notification matchMedia getComputedStyle screen scrollTo scrollBy innerWidth innerHeight devicePixelRatio visualViewport caches CacheStorage ServiceWorker WebAssembly SpeechSynthesis SpeechSynthesisUtterance speechSynthesis Path2D OffscreenCanvas ImageData ImageBitmap createImageBitmap CanvasRenderingContext2D TextEncoder TextDecoder CompressionStream DecompressionStream ReadableStream WritableStream TransformStream Navigator Clipboard ClipboardItem ClipboardEvent DataTransfer DragEvent Selection Range MediaQueryList MediaRecorder MediaStream SpeechRecognition webkitSpeechRecognition WakeLock Vibrate vibrate OrientationEvent DeviceMotionEvent DeviceOrientationEvent Gamepad PaymentRequest Credential PublicKeyCredential CSS DOMException DOMMatrix DOMPoint isSecureContext origin self parent top frames globalThis Object Array String Number Boolean Symbol BigInt Math Date JSON RegExp Error TypeError RangeError SyntaxError ReferenceError EvalError URIError AggregateError Promise Proxy Reflect Map Set WeakMap WeakSet WeakRef FinalizationRegistry ArrayBuffer SharedArrayBuffer DataView Int8Array Uint8Array Uint8ClampedArray Int16Array Uint16Array Int32Array Uint32Array Float32Array Float64Array BigInt64Array BigUint64Array Atomics Function eval isNaN isFinite parseInt parseFloat encodeURIComponent decodeURIComponent encodeURI decodeURI escape unescape undefined NaN Infinity arguments require module exports process Buffer __dirname __filename import").split(" "));
const files = [];
(function walk(d) { for (const e of fs.readdirSync(d, { withFileTypes: true })) { const p = path.join(d, e.name); if (e.isDirectory()) walk(p); else if (/\.(jsx?|mjs)$/.test(e.name)) files.push(p); } })("src");
const problems = [];
for (const f of files) {
  const code = fs.readFileSync(f, "utf8");
  let ast;
  try { ast = babel.parseSync(code, { filename: f, sourceType: "module", babelrc: false, configFile: false, parserOpts: { plugins: ["jsx"] } }); }
  catch (e) { problems.push(f + ": 구문 오류 — " + e.message.split("\n")[0]); continue; }
  traverse(ast, {
    ReferencedIdentifier(p) {
      const n = p.node.name;
      if (p.isJSXIdentifier() && (/^[a-z]/.test(n) || n.includes("-"))) return; // <div> 같은 기본 태그
      if (p.scope.hasBinding(n) || BROWSER_GLOBALS.has(n)) return;
      const l = p.node.loc; problems.push(f + ":" + (l ? l.start.line : "?") + " — 정의되지 않은 이름 " + n);
    },
  });
}
if (problems.length) { console.error("check-undefined-refs 실패 (" + problems.length + "건):\n  " + problems.slice(0, 60).join("\n  ")); process.exit(1); }
console.log("✔ check-undefined-refs: " + files.length + "개 파일에 정의되지 않은 이름 없음");
