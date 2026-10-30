#!/usr/bin/env node
/** (v0.6.8) 칭호 정의·판정 검사 — src/lib/titles.js.
 *   ① 계열 키·칭호 id가 겹치지 않고, 기준값이 단계마다 커지며, 이름 수 = 기준값 수 = 5 이하
 *   ② 모든 계열의 아이콘이 common.jsx TITLE_ICONS에 있고, 모든 지표가 titleCondText에 조건 문구를 가짐(화면에서 조건이 빈칸이 되지 않게)
 *   ③ 지표가 전부 0이면 칭호 0개, 전부 충분하면 모든 칭호, 옛 형식 id("italian:C")는 걸러진다
 *   ④ chess.com 집계(ccTitleStats)가 연승·메이트·빠른 승리·장기전·강자 격파를 정확히 센다
 */
import fs from "node:fs";
import { TITLE_CATEGORIES, TITLE_SERIES, TITLE_OPENINGS, OPENING_FAMILIES, ALL_TITLE_IDS, seriesAccent, titleDef, sanitizeTitleSet, achievableTitles, computeTitleMetrics, ccTitleStats } from "../src/lib/titles.js";
const fails = []; const fail = (m) => fails.push(m);
const keys = new Set();
for (const s of TITLE_SERIES) {
  if (keys.has(s.key)) fail("계열 키 중복: " + s.key); keys.add(s.key);
  if (s.mins.length < 1 || s.mins.length > 5) fail(s.key + ": 단계는 1~5개");
  if (s.names.length !== s.mins.length) fail(s.key + ": 이름 수와 기준값 수가 다름");
  for (let i = 1; i < s.mins.length; i++) if (!(s.mins[i] > s.mins[i - 1])) fail(s.key + ": 기준값이 커지지 않음");
  if (s.metric === "opening") { if (!s.ccMins || s.ccMins.length !== s.mins.length) fail(s.key + ": ccMins 필요"); else for (let i = 1; i < s.ccMins.length; i++) if (!(s.ccMins[i] > s.ccMins[i - 1])) fail(s.key + ": ccMins가 커지지 않음"); }
}
if (new Set(ALL_TITLE_IDS).size !== ALL_TITLE_IDS.length) fail("칭호 id 중복");
const common = fs.readFileSync(new URL("../src/app/common.jsx", import.meta.url), "utf8");
const iconBlock = (common.match(/const TITLE_ICONS = \{([^}]*)\}/) || [])[1] || "";
for (const s of TITLE_SERIES) if (!new RegExp("\\b" + s.icon + "\\b").test(iconBlock)) fail(s.key + ": 아이콘 " + s.icon + "이 TITLE_ICONS에 없음");
for (const m of new Set(TITLE_SERIES.map((s) => s.metric))) if (!common.includes('case "' + m + '":')) fail("지표 " + m + "의 조건 문구(titleCondText)가 없음");
// 오프닝마다 엠블럼(국기·이니셜)이 있어야 하고, 모든 계열에 포인트 색이 있어야 한다
const emb = fs.readFileSync(new URL("../src/components/titleEmblems.jsx", import.meta.url), "utf8");
for (const f of OPENING_FAMILIES) if (!new RegExp("^  " + f.key + ": (\\{|glyph\\(|INDIA,)", "m").test(emb)) fail("오프닝 " + f.key + "의 엠블럼이 titleEmblems.jsx에 없음");
for (const s of TITLE_SERIES) if (!/^#[0-9A-Fa-f]{6}$/.test(seriesAccent(s.key)) || seriesAccent(s.key) === "#7A5A34" && s.key !== "dex") fail(s.key + ": 포인트 색(ACCENT)이 없음");
// (v0.6.9) 인디언 디펜스 계열 엠블럼은 모두 인도 국기(INDIA), 오프닝 칭호의 퍼즐 기준은 낮게 유지, 희귀 갈래의 이름은 "히든 칭호"
for (const f of OPENING_FAMILIES) if (/indian/i.test(f.label) && !new RegExp("^  " + f.key + ": INDIA,", "m").test(emb)) fail(f.label + " 엠블럼이 인도 국기(INDIA)가 아님");
for (const s of TITLE_SERIES) if (s.cat === "opening" && s.mins[4] > 20) fail(s.key + ": 오프닝 칭호 퍼즐 기준(5단계 " + s.mins[4] + ")이 너무 높음(20 이하)");
if (!TITLE_CATEGORIES.some((c) => c.key === "rare" && c.label === "히든 칭호")) fail("희귀 갈래의 이름이 \"히든 칭호\"가 아님");
if (!/hiddenLock/.test(common) || !/t\("히든 칭호"\)/.test(common)) fail("히든 칭호가 해금 조건 대신 \"히든 칭호\"만 표시하지 않음(common.jsx hiddenLock)");
const dexSrc = fs.readFileSync(new URL("../src/app/dex.jsx", import.meta.url), "utf8");
if (!/seriesDisplayLabel\(cur, earnedOf\(cur\)\)/.test(dexSrc) || !/masked=\{x\.cat === "rare" && !n\}/.test(dexSrc)) fail("업적 화면이 못 얻은 히든 칭호 계열의 이름·아이콘을 \"???\"로 가리지 않음");
if (!/const nameText = hiddenLock \? "\?\?\?"/.test(common)) fail("칭호 배너가 못 얻은 히든 칭호의 이름을 \"???\"로 가리지 않음");
// (v0.6.9) 친구 창·/user 페이지 연결: 친구 줄 점 3개 메뉴, 프로필은 /user 페이지로, 토글은 /user 헤더, 아이디 옆 왕관·개발자 표시 없음
const socialSrc = fs.readFileSync(new URL("../src/app/social.jsx", import.meta.url), "utf8");
if (!/<FriendMenu /.test(socialSrc)) fail("친구 목록 줄에 점 3개 메뉴(FriendMenu)가 없음");
if (!/const viewProfileUid = \(uid\) => openProfile\(/.test(socialSrc) || /setSel\(/.test(socialSrc)) fail("친구 박스 클릭이 /user 페이지로 연결되지 않음(친구 창 안 프로필 화면이 남아 있음)");
if (!/\{pub && statsViewToggle\(statsView, setStatsView, 1\.1\)\}/.test(socialSrc)) fail("/user 페이지 헤더 우상단에 플랫폼 분리 토글이 없음");
if (/@\{\(pub && pub\.displayId\) \|\| pubUsername\}\{roleIcon/.test(socialSrc)) fail("/user 페이지 아이디 옆에 왕관·개발자 표시가 남아 있음");
// (v0.6.9) 프로필의 장착 칭호를 누르면 도감 업적 화면으로 가서 그 칭호를 흔든다(titleNav → dex.jsx → TitleBadge spot)
const titleNavSrc = fs.readFileSync(new URL("../src/lib/titleNav.js", import.meta.url), "utf8");
if (!/export const takeTitleNav/.test(titleNavSrc) || !/setTitleNav\(id\); switchTab\("dex"/.test(appSrc0())) fail("칭호 이동 요청(titleNav)이 App과 연결되지 않음");
if (!/spot=\{spot === id\}/.test(dexSrc) || !/data-title-id=\{id\}/.test(common)) fail("업적 화면이 칭호를 흔들어 보여 주지 않음(spot)");
if (!/onClick=\{onOpenTitle \? \(\) => onOpenTitle\(pub\.title\)/.test(socialSrc)) fail("/user 페이지의 장착 칭호를 눌러도 도감으로 이동하지 않음");
function appSrc0() { return fs.readFileSync(new URL("../src/App.jsx", import.meta.url), "utf8"); }
// 배너 연출(업적 달성·기물 움직임)이 쓰는 CSS 키프레임이 App.jsx 스타일에 모두 있어야 한다
const appSrc = fs.readFileSync(new URL("../src/App.jsx", import.meta.url), "utf8");
const used = new Set([...common.matchAll(/animation: [^"`]*?(title[A-Za-z]+)/g)].map((m) => m[1]));
for (const k of used) if (!appSrc.includes("@keyframes " + k + "{")) fail("키프레임 " + k + "이 App.jsx 스타일에 없음");
// 오프닝 5단계 이름(초급·중급·상급·마스터·그랜드마스터)은 titleNameText가 t()로 번역한다 — 빠지면 영어가 아닌 언어에서 한글이 그대로 보인다
for (const nm of ["초급", "중급", "상급", "마스터", "그랜드마스터"]) if (!common.includes('t("' + nm + '")')) fail("titleNameText에 t(\"" + nm + "\")가 없음");
// 오프닝 밖 계열의 이름·칭호 이름(한국어 원문)은 common.jsx 번역 표에 t("원문")으로 모두 있어야 한다 — 빠지면 다른 언어에서 한글이 그대로 보인다
for (const s of TITLE_SERIES) { if (s.cat === "opening") continue; for (const k of [s.label, ...s.names]) if (!common.includes('t("' + k + '")')) fail("번역 표에 t(\"" + k + "\")가 없음(" + s.key + ")"); }
// ③ 판정
const zero = computeTitleMetrics({});
if (achievableTitles(zero).size !== 0) fail("지표가 모두 0인데 칭호가 열림");
const big = computeTitleMetrics({ solved: 1e6, puzzleRating: 3500, tierIndex: 6, dailyBest: 1e4, unlocked: 1e5, community: 1e5, friends: 1e4, coins: 1e7,
  cc: { ccPlayed: 1e5, ccWins: 1e5, ccDraws: 1e5, ccWhiteWins: 1e5, ccBlackWins: 1e5, ccBestRating: 3500, ccWinStreak: 1e3, ccMates: 1e5, ccQuickWins: 1e5, ccLongWins: 1e5, ccGiantWins: 1e5, ccNight: 1e5, ccOpenings: 1e4, ccTopOpening: 1e5, ccBlitzWins: 1e5, ccRapidWins: 1e5, ccPromos: 1e5 },
  openingSolved: Object.fromEntries(OPENING_FAMILIES.map((f) => [f.key, 1e5])), openingCc: Object.fromEntries(OPENING_FAMILIES.map((f) => [f.key, 1e6])) });
const all = achievableTitles(big);
for (const id of ALL_TITLE_IDS) if (!all.has(id)) fail("충분한 지표인데 열리지 않는 칭호: " + id);
// 오프닝은 두 지표를 모두 요구
const half = achievableTitles(computeTitleMetrics({ openingSolved: { italian: 500 }, openingCc: { italian: 0 } }));
if (half.has("italian:1")) fail("오프닝 칭호가 chess.com 플레이 없이 열림");
// 칭호 수집은 나머지 칭호 수로 판정
const few = achievableTitles(computeTitleMetrics({ solved: 1 }));
if (few.has("collect:1")) fail("칭호 1개로 칭호 수집이 열림");
const sane = sanitizeTitleSet(["italian:C", "solve:2", "nope:1", "solve:9", "solve:x", null]);
if (sane.size !== 1 || !sane.has("solve:2")) fail("옛 형식·없는 id가 걸러지지 않음: " + [...sane]);
if (titleDef("solve:3").name !== "문제 해결사") fail("titleDef 이름");
// ④ chess.com 집계
const mv = (n, last) => Array.from({ length: n }, (_, i) => (i === n - 1 && last ? last : "e4"));
const G = (o) => ({ moves: mv(40), color: "w", result: "win", rating: 1500, endTime: 1000, white: { rating: 1500 }, black: { rating: 1500 }, opening: "A", ...o });
const st = ccTitleStats([
  G({ endTime: 1, moves: mv(30, "Qh7#") }),                   // 메이트·빠른 승리(60플라이 이하)
  G({ endTime: 2, moves: mv(130), color: "b", black: { rating: 1500 }, white: { rating: 1650 } }), // 장기전·흑 승·강자 격파
  G({ endTime: 3 }),                                         // 연승 3
  G({ endTime: 4, result: "loss" }),                         // 연승 끊김
  G({ endTime: 5, result: "draw", opening: "B" }),
  G({ endTime: 6, rating: 1720 }),
]);
const exp = { ccPlayed: 6, ccWins: 4, ccDraws: 1, ccWhiteWins: 3, ccBlackWins: 1, ccBestRating: 1720, ccWinStreak: 3, ccMates: 1, ccQuickWins: 3, ccLongWins: 1, ccGiantWins: 1, ccOpenings: 2, ccTopOpening: 5 };
for (const [k, v] of Object.entries(exp)) if (st[k] !== v) fail("ccTitleStats." + k + " = " + st[k] + " (기대 " + v + ")");
// (v0.6.9) 블리츠·래피드 승리, 내가 승격한 대국(상대의 승격은 세지 않음)
const st2 = ccTitleStats([
  G({ endTime: 1, timeClass: "blitz" }), G({ endTime: 2, timeClass: "blitz", result: "loss" }), G({ endTime: 3, timeClass: "rapid" }), G({ endTime: 4, timeClass: "bullet" }),
  G({ endTime: 5, moves: ["e4", "e5", "a4", "d5", "a5", "d4", "a6", "d3", "axb7", "dxc2", "bxa8=Q"] }),   // 백 승격(내가 백) → 1
  G({ endTime: 6, color: "b", moves: ["e4", "e5", "a4", "d5", "a5", "d4", "a6", "d3", "axb7", "dxc2", "bxa8=Q"] }),   // 백의 승격만 있고 나는 흑이라 같은 수열의 흑 승격은 없음 → 0
]);
for (const [k, v] of Object.entries({ ccBlitzWins: 1, ccRapidWins: 1, ccPromos: 1 })) if (st2[k] !== v) fail("ccTitleStats." + k + " = " + st2[k] + " (기대 " + v + ")");
if (ccTitleStats([]).ccPlayed !== 0 || ccTitleStats(null).ccWins !== 0) fail("빈 목록 집계");
if (fails.length) { console.error("check-titles 실패 (" + fails.length + "건):\n  " + fails.join("\n  ")); process.exit(1); }
console.log("✔ check-titles: 계열 " + TITLE_SERIES.length + "개 · 칭호 " + ALL_TITLE_IDS.length + "개, 조건 문구·아이콘·판정·chess.com 집계 정상");
