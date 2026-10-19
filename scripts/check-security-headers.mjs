#!/usr/bin/env node
/** (v0.7.0 보안, BUG-114) vercel.json의 보안 헤더 검사 — CSP를 실제로 '강제'하고 있는지, 스크립트를 느슨하게 만드는 값이 없는지.
 *  배경: 예전엔 CSP가 Report-Only라 아무것도 막지 못했다. 강제 적용 전에 실제 Chromium으로 엔진(WASM 워커)을 띄워 확인했고, 'wasm-unsafe-eval' 없이는 엔진이 전부 깨진다는 것을 확인했다.
 *  규칙: ① Content-Security-Policy(강제)가 있고 Report-Only만 있는 상태가 아니다 ② script-src에 'unsafe-inline'·'unsafe-eval'·와일드카드·https: 전체 허용이 없다
 *  ③ script-src의 외부 출처는 경로까지 좁힌 것만(CDN 전체 허용 금지) ④ object-src 'none'·frame-ancestors 'none'·base-uri 'self'·form-action 'self' ⑤ 필수 보안 헤더(nosniff·X-Frame-Options·HSTS·COOP)가 있다. */
import { readFileSync } from "node:fs";
const vj = JSON.parse(readFileSync(new URL("../vercel.json", import.meta.url), "utf8"));
const all = vj.headers.find((h) => h.source === "/(.*)");
const hv = (k) => (all && all.headers.find((h) => h.key.toLowerCase() === k.toLowerCase()) || {}).value;
const problems = [];
const csp = hv("Content-Security-Policy");
if (!csp) problems.push("Content-Security-Policy(강제)가 없다 — Report-Only는 아무것도 막지 못한다");
else {
  const dir = Object.fromEntries(csp.split(";").map((x) => x.trim()).filter(Boolean).map((x) => { const [k, ...v] = x.split(/\s+/); return [k, v]; }));
  const script = dir["script-src"] || dir["default-src"] || [];
  if (!dir["script-src"]) problems.push("script-src가 없다(default-src에 기대지 않는다)");
  for (const bad of ["'unsafe-inline'", "'unsafe-eval'", "*", "https:", "http:", "data:", "blob:"]) if (script.includes(bad)) problems.push("script-src에 " + bad + " 허용 금지");
  for (const v of script) if (/^https?:\/\//.test(v) && !/^https?:\/\/[^/]+\/.+/.test(v)) problems.push("script-src 외부 출처는 경로까지 좁혀야 한다(호스트 전체 허용 금지): " + v);
  if (!script.includes("'wasm-unsafe-eval'")) problems.push("script-src에 'wasm-unsafe-eval'이 없다 — 체스 엔진(WASM)이 전부 깨진다");
  if (!(dir["object-src"] || []).includes("'none'")) problems.push("object-src 'none' 필요");
  if (!(dir["frame-ancestors"] || []).includes("'none'")) problems.push("frame-ancestors 'none' 필요");
  if (!(dir["base-uri"] || []).includes("'self'")) problems.push("base-uri 'self' 필요");
  if (!(dir["form-action"] || []).includes("'self'")) problems.push("form-action 'self' 필요");
  if ((dir["connect-src"] || []).some((v) => v === "*" || v === "https:" || v === "http:")) problems.push("connect-src에 전체 허용(*, https:) 금지");
}
if (hv("Content-Security-Policy-Report-Only") && !csp) problems.push("Report-Only만 있다");
if ((hv("X-Content-Type-Options") || "").toLowerCase() !== "nosniff") problems.push("X-Content-Type-Options: nosniff 필요");
if (hv("X-Frame-Options") !== "DENY") problems.push("X-Frame-Options: DENY 필요");
if (!/max-age=\d{7,}/.test(hv("Strict-Transport-Security") || "")) problems.push("Strict-Transport-Security(max-age) 필요");
if (hv("Cross-Origin-Opener-Policy") !== "same-origin") problems.push("Cross-Origin-Opener-Policy: same-origin 필요");
if (problems.length) { console.error("✗ check-security-headers 실패:\n - " + problems.join("\n - ")); process.exit(1); }
console.log("✓ check-security-headers: CSP 강제 적용(script-src 엄격·WASM 허용·CDN은 경로 제한), 프레임·객체·base·form 제한, HSTS·nosniff·COOP 유지");
