// (v0.7.9 성능, 번역 파일 분할) 번역 문장을 "첫 화면용(core)"과 "나중에 받아도 되는 것(rest)"으로 나눈다.
// 예전엔 한국어가 아닌 사용자가 첫 화면 전에 번역 전체(영어 약 750KB, 힌디어 약 1.2MB)를 받았다. 그중 절반 이상은 지연 로딩 탭·창
// (src/app/lazyScreens.jsx·main.jsx의 /about 등)에서만 쓰는 문장이다.
//
// 규칙(보수적): 어떤 문장이 rest가 되려면
//   1. "지연 영역" 파일(afterFullCatalog(() => import("…"))로 여는 파일에서 정적·동적 import로 닿는 파일 중, 첫 화면 쪽에서는 닿지 않는 것)의
//      문자열 리터럴로 등장하고,
//   2. 그 밖의 어떤 src 파일(첫 화면 코드, 다른 동적 청크, 데이터 JSON, 아무도 안 쓰는 파일까지)에도 문자열 리터럴로 등장하지 않아야 한다.
// 소스 어디에도 없는 문장(서버 데이터·동적 키)은 core에 남는다. 지연 영역은 afterFullCatalog가 rest를 받은 뒤에야 실행되므로
// rest의 문장이 필요한 코드는 항상 rest가 준비된 뒤에 돈다.
// 사용처: vite.config.js의 i18nSplitPlugin(빌드), scripts/check-i18n-split.mjs(검사).
import { readFileSync, readdirSync, statSync, existsSync } from "node:fs";
import { join, dirname, relative } from "node:path";
import { pathToFileURL } from "node:url";

const STATIC_RE = /^[ \t]*(?:import|export)\b[^;]*?\bfrom\s*["'](\.{1,2}\/[^"']+)["']|^[ \t]*import\s*["'](\.{1,2}\/[^"']+)["']/gm;
const DYNAMIC_RE = /\bimport\(\s*["'](\.{1,2}\/[^"']+)["']\s*\)/g;
const GATED_RE = /\bafterFullCatalog\(\s*\(\)\s*=>\s*import\(\s*["'](\.{1,2}\/[^"']+)["']\s*\)\s*\)/g;
const LIT_RE = /"((?:[^"\\\n]|\\.)*)"|'((?:[^'\\\n]|\\.)*)'|`((?:[^`\\]|\\.)*)`/g;
const HANGUL = /[가-힣]/;

function listSrc(root) {
  const out = [];
  (function walk(rel) {
    for (const n of readdirSync(join(root, rel))) {
      const p = rel + "/" + n;
      if (statSync(join(root, p)).isDirectory()) { if (p !== "src/lib/i18n") walk(p); }
      else if (/\.(jsx?|json)$/.test(n)) out.push(p);
    }
  })("src");
  return out;
}
function resolve(root, from, spec) {
  const b = join(dirname(from), spec.split("?")[0]);
  for (const c of [b, b + ".js", b + ".jsx"]) if (existsSync(join(root, c)) && statSync(join(root, c)).isFile()) return relative(root, join(root, c));
  return null;
}

/** 파일별 import 정보: { static: [...], dynamic: [...](게이트 없는 것), gated: [...] } */
function edgesOf(root, f, cache) {
  if (cache.has(f)) return cache.get(f);
  const e = { static: [], dynamic: [], gated: [] };
  if (/\.jsx?$/.test(f)) {
    const src = readFileSync(join(root, f), "utf8");
    for (const m of src.matchAll(STATIC_RE)) { const t = resolve(root, f, m[1] || m[2]); if (t) e.static.push(t); }
    const gated = new Set();
    for (const m of src.matchAll(GATED_RE)) { const t = resolve(root, f, m[1]); if (t) { e.gated.push(t); gated.add(m.index); } }
    for (const m of src.matchAll(DYNAMIC_RE)) {
      const t = resolve(root, f, m[1]);
      if (!t) continue;
      // afterFullCatalog(() => import("…")) 안의 import()는 게이트된 것으로 센다(바로 앞 60자 안에 afterFullCatalog가 있으면).
      if (/afterFullCatalog\(\s*\(\)\s*=>\s*$/.test(src.slice(Math.max(0, m.index - 60), m.index))) continue;
      e.dynamic.push(t);
    }
  }
  cache.set(f, e);
  return e;
}
function closure(root, starts, cache, { followGated }) {
  const seen = new Set(starts), q = [...starts];
  while (q.length) {
    const f = q.shift();
    const e = edgesOf(root, f, cache);
    for (const t of [...e.static, ...e.dynamic, ...(followGated ? e.gated : [])]) if (!seen.has(t)) { seen.add(t); q.push(t); }
  }
  return seen;
}
function literalsOf(root, files) {
  const set = new Set();
  for (const f of files) {
    const text = readFileSync(join(root, f), "utf8");
    if (!HANGUL.test(text)) continue;
    for (const m of text.matchAll(LIT_RE)) {
      const raw = m[1] ?? m[2] ?? m[3];
      if (!raw || !HANGUL.test(raw)) continue;
      set.add(raw);
      if (raw.includes("\\")) { try { set.add(JSON.parse('"' + raw.replace(/(^|[^\\])"/g, '$1\\"') + '"')); } catch { /* 해석 불가한 이스케이프는 원문만 */ } }
    }
  }
  return set;
}

/** 소스를 훑어 나누기 기준을 만든다. 반환: { gatedStarts, lazyFiles, isRest(key) } */
export function computeI18nSplit(root) {
  const cache = new Map();
  const all = listSrc(root);
  const outsideReach = closure(root, ["src/main.jsx"], cache, { followGated: false });
  const gatedStarts = new Set();
  for (const f of all) for (const t of edgesOf(root, f, cache).gated) gatedStarts.add(t);
  const lazyReach = closure(root, [...gatedStarts], cache, { followGated: true });
  const lazyFiles = new Set([...lazyReach].filter((f) => !outsideReach.has(f) && !f.startsWith("src/lib/i18n/")));
  const outsideFiles = all.filter((f) => !lazyFiles.has(f));
  const lazyLits = literalsOf(root, [...lazyFiles]);
  const outsideLits = literalsOf(root, outsideFiles);
  return { gatedStarts: [...gatedStarts], lazyFiles: [...lazyFiles], outsideCount: outsideFiles.length, isRest: (k) => lazyLits.has(k) && !outsideLits.has(k) };
}

/** 카탈로그(키 → 번역)를 core/rest로 나눈다. */
export function splitCatalog(catalog, isRest) {
  const core = {}, rest = {};
  for (const [k, v] of Object.entries(catalog)) (isRest(k) ? rest : core)[k] = v;
  return { core, rest };
}

/** Vite 플러그인: src/lib/i18n/<언어>.js?part=core|rest 를 나눈 카탈로그로 바꿔 준다.
 *  빌드에서만 나눈다. 개발 서버는 core=전체·rest=빈 객체(소스를 고칠 때마다 다시 훑지 않도록). Node에서 i18n.js를 직접 import하면
 *  ?part= 쿼리가 무시돼 두 쪽 모두 전체 카탈로그다(test-i18n-runtime 등). */
export function i18nSplitPlugin(root) {
  let isBuild = false, split = null;
  const ID_RE = /[\\/]src[\\/]lib[\\/]i18n[\\/](en|hi|ja|zh|es)\.js\?part=(core|rest)$/;
  return {
    name: "oc-i18n-split",
    enforce: "pre",
    configResolved(c) { isBuild = c.command === "build"; },
    buildStart() { split = null; },
    async load(id) {
      const m = ID_RE.exec(id);
      if (!m) return null;
      const file = id.slice(0, id.indexOf("?"));
      this.addWatchFile(file);
      const catalog = (await import(pathToFileURL(file).href + "?mtime=" + statSync(file).mtimeMs)).default;
      let out;
      if (!isBuild) out = m[2] === "core" ? catalog : {};
      else {
        split ||= computeI18nSplit(root);
        out = splitCatalog(catalog, split.isRest)[m[2]];
      }
      // 큰 객체는 JS 객체 리터럴보다 JSON.parse가 빨리 해석된다.
      return "export default JSON.parse(" + JSON.stringify(JSON.stringify(out)) + ");";
    },
  };
}
