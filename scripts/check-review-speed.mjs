#!/usr/bin/env node
/** (v0.7.1) 리뷰 속도 3단계·빠른 리뷰 검사(src/lib/prefs.js, App.jsx, review.jsx).
 *   · 더 빠르게 15 / 평균 20 / 더 정확하게 25, 빠른 리뷰는 속도와 상관없이 15
 *   · 평균의 depth가 common.jsx REVIEW_DEPTH와 같다(공유 캐시·퍼포먼스 레이팅이 이 깊이를 기준으로 한다)
 *   · 옛 저장값 이전: 옛 "fast"(=depth 20)는 "평균"으로, 옛 "accurate"는 그대로 — 업데이트만으로 리뷰가 얕아지지 않게
 *   · 빠른 리뷰면 App이 Lite 엔진으로 부팅하고, 리뷰는 표준 깊이 미만 결과를 공유 캐시에 올리지 않는다
 *  npm run build 전에 prebuild로 자동 실행된다. 실행: node scripts/check-review-speed.mjs
 */
import { readFileSync } from "node:fs";
const store = new Map();
globalThis.window = { localStorage: { getItem: (k) => (store.has(k) ? store.get(k) : null), setItem: (k, v) => store.set(k, String(v)), removeItem: (k) => store.delete(k) } };
const P = await import("../src/lib/prefs.js");
const fails = [];
const eq = (label, got, want) => { if (JSON.stringify(got) !== JSON.stringify(want)) fails.push(label + ": " + JSON.stringify(got) + " ≠ " + JSON.stringify(want)); };

eq("속도별 depth", P.REVIEW_SPEED_DEPTH, { fast: 15, normal: 20, accurate: 25 });
eq("빠른 리뷰는 15 고정", P.REVIEW_SPEEDS.map((s) => P.reviewDepthFor(s, true)), [15, 15, 15]);
eq("빠른 리뷰 끄면 선택한 속도", P.REVIEW_SPEEDS.map((s) => P.reviewDepthFor(s, false)), [15, 20, 25]);
eq("모르는 값은 평균", P.reviewDepthFor("weird", false), 20);
eq("빠른 리뷰 엔진", P.QUICK_REVIEW_ENGINE, "lite");
const common = readFileSync(new URL("../src/app/common.jsx", import.meta.url), "utf8");
const m = /export const REVIEW_DEPTH = (\d+);/.exec(common);
eq("평균 depth = REVIEW_DEPTH", P.REVIEW_SPEED_DEPTH.normal, m ? Number(m[1]) : null);

// 저장값 이전
store.clear(); eq("처음이면 평균", P.loadReviewSpeedPref(), "normal");
store.clear(); store.set("occ_review_speed_pref", "fast"); eq("옛 fast(=20) → 평균", P.loadReviewSpeedPref(), "normal");
store.clear(); store.set("occ_review_speed_pref", "accurate"); eq("옛 accurate 유지", P.loadReviewSpeedPref(), "accurate");
store.clear(); P.saveReviewSpeedPref("fast"); eq("새 fast 저장·복원", P.loadReviewSpeedPref(), "fast");
store.clear(); store.set("occ_review_speed_pref", "accurate"); P.saveReviewSpeedPref("fast"); eq("새 값이 옛 값보다 우선", P.loadReviewSpeedPref(), "fast");
store.clear(); eq("빠른 리뷰 기본 꺼짐", P.loadQuickReviewPref(), false);
P.saveQuickReviewPref(true); eq("빠른 리뷰 저장", P.loadQuickReviewPref(), true);

// 연결(정적 검사)
const app = readFileSync(new URL("../src/App.jsx", import.meta.url), "utf8");
if (!/const activeEnginePref = quickReview \? QUICK_REVIEW_ENGINE : enginePref;/.test(app) || !/useEngine\(activeEnginePref\)/.test(app)) fails.push("App.jsx: 빠른 리뷰일 때 Lite 엔진으로 부팅하는 연결이 없음");
if (!/quick=\{quickReview\}/.test(app)) fails.push("App.jsx: ReviewPage에 quick이 전달되지 않음");
const rv = readFileSync(new URL("../src/app/review.jsx", import.meta.url), "utf8");
if (!/const reviewDepth = reviewDepthFor\(reviewSpeed, quick\);/.test(rv)) fails.push("review.jsx: 리뷰 depth를 reviewDepthFor로 정하지 않음");
if ((rv.match(/reviewDepth >= REVIEW_DEPTH/g) || []).length < 2) fails.push("review.jsx: 표준 깊이 미만 결과를 공유 캐시에 올리지 않는 조건이 빠짐");

if (fails.length) { console.error("✗ 리뷰 속도·빠른 리뷰 검사 실패:"); fails.forEach((x) => console.error("  · " + x)); process.exit(1); }
console.log("✓ review speed check: 15/20/25·빠른 리뷰 15 고정·Lite 엔진, 옛 저장값 이전, 공유 캐시는 표준 깊이 이상만");
