#!/usr/bin/env node
/** (v0.7.6, 사용자 요청) 마스터 페이지 /master/<slug> — 주소표(src/data/masterSlugs.json)와 이름 → 주소 연결, 화면 연결을 검사한다.
 *  · 모든 마스터 프로필에 주소가 하나씩, 주소는 겹치지 않고 소문자·하이픈 형식, 이름이 비어 있지 않음
 *  · 같은 선수의 여러 표기("Carlsen,M" · "Carlsen, Magnus" · "Magnus Carlsen")가 같은 주소(magnus-carlsen)로, 프로필 없는 이름은 링크 없음
 *  · App 라우팅(주소로 바로 열기·뒤로 가기)과 마스터 통계·대국·스타일·도감 카드의 이름 링크
 *  실행: node scripts/check-master-pages.mjs (prebuild로 자동 실행). 주소표는 scripts/build-master-slugs.mjs가 만든다(이미 정한 주소는 바꾸지 않음). */
import { registerHooks } from "node:module";
import fs from "node:fs";
registerHooks({ load(url, ctx, next) { return url.endsWith(".json") ? next(url, { ...ctx, importAttributes: { type: "json" } }) : next(url, ctx); } });
const { masterBySlug, slugForName, parseMasterPath, MASTER_SLUG_RE, masterDisplayName } = await import("../src/lib/masterPages.js");
const rd = (f) => fs.readFileSync(new URL("../" + f, import.meta.url), "utf8");
const fails = []; const ok = (c, m) => { if (!c) fails.push(m); };
const slugs = JSON.parse(rd("src/data/masterSlugs.json")).bySlug, profiles = JSON.parse(rd("src/data/masterProfiles.json")).p;
const keys = Object.values(slugs).map((v) => v.key);
ok(new Set(keys).size === keys.length, "한 프로필에 주소가 둘 이상");
for (const k of Object.keys(profiles)) ok(keys.includes(k), "프로필 '" + k + "'에 주소가 없음 — node scripts/build-master-slugs.mjs 실행");
for (const [s, v] of Object.entries(slugs)) { ok(MASTER_SLUG_RE.test(s), "주소 형식이 틀림: " + s); ok(v.name && v.name.trim().length >= 3, "이름이 비어 있음: " + s); ok(v.key in profiles, "주소 '" + s + "'의 프로필이 없음"); }
for (const n of ["Carlsen,M", "Carlsen, Magnus", "Magnus Carlsen", "Carlsen, M NOR"]) ok(slugForName(n) === "magnus-carlsen", "'" + n + "' → magnus-carlsen이 아님(" + slugForName(n) + ")");
ok(slugForName("Garry Kasparov") === "garry-kasparov" && slugForName("Anand, V") === "viswanathan-anand", "챔피언·이니셜 표기 연결");
ok(slugForName("Nobody, Unknown") === null && slugForName("") === null, "프로필 없는 이름은 링크 없음");
ok(parseMasterPath("/master/magnus-carlsen") === "magnus-carlsen" && parseMasterPath("/master/MAGNUS-CARLSEN") === "magnus-carlsen" && parseMasterPath("/master/no-such-player") === null && parseMasterPath("/user/ABCDE1234") === null, "주소 해석");
ok(masterBySlug("magnus-carlsen").name === "Magnus Carlsen", "magnus-carlsen 이름");
ok(masterDisplayName("Nakamura, Hikaru:Hodgson,Jeremy") === "Hikaru Nakamura" && slugForName("Nakamura, Hikaru:Hodgson,Jeremy") === "hikaru-nakamura", "BUG-167: 이름 칸에 다른 사람이 붙은 옛 표기는 앞사람으로");
const app = rd("src/App.jsx");
ok(/useState\(\(\) => \(typeof window !== "undefined" \? parseMasterPath\(window\.location\.pathname\)/.test(app), "App: /master/<slug> 주소로 바로 들어오면 열려야 함");
ok(/setMasterSlug\(parseMasterPath\(p\)\)/.test(app), "App: 뒤로/앞으로 가기에 마스터 페이지가 반응해야 함");
ok(/setMasterPageHandler\(/.test(app) && /<MasterPage key=\{masterSlug\}/.test(app), "App: 마스터 페이지 열기 처리기·화면이 없음");
for (const [f, re, what] of [["src/app/analysis.jsx", /<MasterNameLink name=\{name\}>\{fullPlayerName\(name\)\}<\/MasterNameLink>/, "마스터 통계·대국의 선수 이름"],
  ["src/app/growth.jsx", /<MasterNameLink name=\{picked\.name\}>/, "마스터 스타일의 마스터 이름"],
  ["src/app/dexMasters.jsx", /<MasterNameLink name=\{profName\}>/, "도감 마스터 카드 제목"],
  ["src/components/masterProfile.jsx", /<MasterNameLink name=\{n\}>/, "자주 만난 상대"]]) ok(re.test(rd(f)), f + ": " + what + "이 마스터 페이지로 이어지지 않음");
if (fails.length) { console.error("✗ check-master-pages 실패:\n  " + fails.join("\n  ")); process.exit(1); }
console.log("✓ check-master-pages: 마스터 " + keys.length + "명 고유 주소(/master/<slug>), 이름 표기 → 주소 연결, 라우팅·이름 링크 유지");
