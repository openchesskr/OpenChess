#!/usr/bin/env node
/** (v0.7.9) 레슨 대화 데이터 생성 — scripts/lessonTalk/*.json(대사 + 5개 언어 번역 한 묶음)에서
 *   ① src/lib/lessons/curriculumTalkData.js(LINK·TEACH, t() 원문)를 만들고 ② 5개 언어 번역 카탈로그에 그 문장을 넣는다(있으면 값 갱신).
 *  묶음 형식: { "link": { 레슨 id: [[누구("m"|"k"), 한국어, en, es, hi, ja, zh], …] },
 *             "teach": { 레슨 id: { 질문 번호(0부터): [[누구, 한국어, en, es, hi, ja, zh], …] } } }
 *  실행: node scripts/build-lesson-talk.mjs [--check]  (--check: 파일을 쓰지 않고 최신인지만 확인 — check-lessons가 부른다)
 */
import { readFileSync, writeFileSync, readdirSync } from "node:fs";

const ROOT = new URL("..", import.meta.url).pathname;
const LANGS = ["en", "es", "hi", "ja", "zh"];
const OUT = ROOT + "src/lib/lessons/curriculumTalkData.js";

export function buildTalk() {
  const link = {}, teach = {}, tr = {}, strings = {};
  for (const f of readdirSync(ROOT + "scripts/lessonTalk").filter((x) => x.endsWith(".json")).sort()) {
    const d = JSON.parse(readFileSync(ROOT + "scripts/lessonTalk/" + f, "utf8"));
    Object.assign(link, d.link || {});
    for (const [id, qs] of Object.entries(d.teach || {})) teach[id] = { ...(teach[id] || {}), ...qs };
    // strings: 레슨 본문(curriculumCalc.js 등)의 새 문장 번역 — { 한국어: [en, es, hi, ja, zh] }
    for (const [ko, vals] of Object.entries(d.strings || {})) strings[ko] = vals;
  }
  const q = (s) => JSON.stringify(s);
  const reg = (line) => {
    const [who, ko, ...vals] = line;
    if (!["m", "k"].includes(who) || vals.length !== 5) throw new Error("대사 형식 오류: " + ko);
    tr[ko] = Object.fromEntries(LANGS.map((l, i) => [l, vals[i]]));
    return "[" + q(who) + ", t(" + q(ko) + ")]";
  };
  const js = ["// (v0.7.9) 자동 생성 — node scripts/build-lesson-talk.mjs (원본: scripts/lessonTalk/*.json, 대사 + 5개 언어 번역). 직접 고치지 말 것.", 'import { t } from "../i18n.js";', "", "export const LINK = {"];
  for (const id of Object.keys(link).sort()) js.push("  " + id + ": () => [" + link[id].map(reg).join(", ") + "],");
  js.push("};", "", "export const TEACH = {");
  for (const id of Object.keys(teach).sort()) js.push("  " + id + ": { " + Object.keys(teach[id]).sort((a, b) => a - b).map((k) => +k + ": () => [" + teach[id][k].map(reg).join(", ") + "]").join(", ") + " },");
  js.push("};", "");
  for (const [ko, vals] of Object.entries(strings)) { if (vals.length !== 5) throw new Error("번역 수 오류: " + ko); tr[ko] = Object.fromEntries(LANGS.map((l, i) => [l, vals[i]])); }
  return { js: js.join("\n"), tr, link, teach };
}

function syncCatalog(lang, tr) {
  const p = ROOT + "src/lib/i18n/" + lang + ".js";
  let s = readFileSync(p, "utf8"), add = "";
  for (const [ko, v] of Object.entries(tr)) {
    const kk = JSON.stringify(ko), vv = JSON.stringify(v[lang]);
    const re = new RegExp("\\n  " + kk.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + ': "(?:[^"\\\\]|\\\\.)*",?\\n');
    const m = re.exec(s);
    if (m) s = s.slice(0, m.index) + "\n  " + kk + ": " + vv + (m[0].trimEnd().endsWith(",") ? ",\n" : "\n") + s.slice(m.index + m[0].length);
    else add += "  " + kk + ": " + vv + ",\n";
  }
  if (add) { const i = s.trimEnd().lastIndexOf("};"); let body = s.slice(0, i).trimEnd(); if (!body.endsWith(",")) body += ","; s = body + "\n" + add + "};\n"; }
  return { p, s };
}

if (import.meta.url === "file://" + process.argv[1]) {
  const { js, tr, link, teach } = buildTalk();
  const check = process.argv.includes("--check");
  const stale = [];
  if (readFileSync(OUT, "utf8") !== js) stale.push("curriculumTalkData.js");
  for (const l of LANGS) { const { p, s } = syncCatalog(l, tr); if (readFileSync(p, "utf8") !== s) { stale.push(l + ".js"); if (!check) writeFileSync(p, s); } }
  if (check) { if (stale.length) { console.error("✗ 레슨 대화 데이터가 최신이 아님(" + stale.join(", ") + ") — node scripts/build-lesson-talk.mjs 실행"); process.exit(1); } }
  else writeFileSync(OUT, js);
  console.log("✔ build-lesson-talk: 연결 대사 " + Object.keys(link).length + "개 레슨 · 질문 앞 설명 " + Object.keys(teach).length + "개 레슨 · 문장 " + Object.keys(tr).length + "개" + (check ? " (최신)" : ""));
}
