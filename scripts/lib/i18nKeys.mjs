// (v0.7.0, 다국어) 소스에서 t()/tx() 키를 뽑는 공용 도구 — check-i18n·번역 작업 스크립트가 같이 쓴다.
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const parser = require("@babel/parser");
const traverse = require("@babel/traverse").default;

const DEV = JSON.parse(readFileSync(new URL("../../src/lib/i18n/dev-only.json", import.meta.url), "utf8"));
const DEV_FUNCS = new Set(DEV.functions); const DEFERRED_FUNCS = new Set(DEV.deferredFunctions || []); const DEV_KEYS = new Set(DEV.keys);
export const SRC_ROOT = new URL("../../src/", import.meta.url).pathname;
export function listSourceFiles(dir = SRC_ROOT, out = []) {
  for (const n of readdirSync(dir)) {
    const p = join(dir, n);
    if (statSync(p).isDirectory()) { if (p.endsWith("/lib/i18n")) continue; listSourceFiles(p, out); }
    else if (/\.jsx?$/.test(n)) out.push(p);
  }
  return out;
}
/** 파일 하나에서 { keys: Map(key -> [line…]), dynamic: [line…], badBinding: [line…] }를 돌려준다. */
export function extractFromFile(file) {
  const src = readFileSync(file, "utf8");
  const ast = parser.parse(src, { sourceType: "module", plugins: ["jsx"] });
  const keys = new Map(), dynamic = [], badBinding = [], deferred = new Map(), txKinds = new Map();
  // 이 파일이 lucide-react에서 가져온 아이콘 이름 — tx()에 아이콘이 끼워진 자리를 알아내는 데 쓴다.
  const icons = new Set();
  for (const n of ast.program.body) if (n.type === "ImportDeclaration" && n.source.value === "lucide-react") n.specifiers.forEach((sp) => icons.add(sp.local.name));
  traverse(ast, {
    CallExpression(p) {
      const c = p.node.callee;
      if (c.type !== "Identifier" || (c.name !== "t" && c.name !== "tx")) return;
      const b = p.scope.getBinding(c.name);
      // t/tx가 i18n.js에서 import한 것이 아니면(지역 변수가 가림) 번역 호출이 실제로는 다른 함수를 부른다.
      const isImport = b && b.kind === "module" && b.path.parent.source && /i18n\.js$/.test(b.path.parent.source.value);
      const a = p.node.arguments[0];
      if (!isImport) { if (a && a.type === "StringLiteral" && /[가-힣]/.test(a.value)) badBinding.push(p.node.loc.start.line); return; }
      if (a && a.type === "StringLiteral" && !DEV_KEYS.has(a.value)) {
        // 자리표시자 번호별 종류: "icon"(lucide 아이콘 = 글자·숫자가 아님), "jsx"(그 밖의 요소), "str"(문자열 상수·t() 결과 = 숫자가 아님), "val"(그 밖의 식)
        const isStr = (x) => x.type === "StringLiteral" || x.type === "TemplateLiteral" || (x.type === "CallExpression" && x.callee.type === "Identifier" && (x.callee.name === "t" || x.callee.name === "tx")) || (x.type === "ConditionalExpression" && isStr(x.consequent) && isStr(x.alternate)) || (x.type === "ParenthesizedExpression" && isStr(x.expression));
        const kinds = p.node.arguments.slice(1).map((x) => x.type === "JSXElement" ? (x.openingElement.name.type === "JSXIdentifier" && icons.has(x.openingElement.name.name) ? "icon" : "jsx") : isStr(x) ? "str" : "val");
        const prev = txKinds.get(a.value) || []; kinds.forEach((kd, i) => { if (!prev[i] || prev[i] === "val" || kd === "icon") prev[i] = kd; }); txKinds.set(a.value, prev);
      }
      if (a && a.type === "StringLiteral") { if (DEV_KEYS.has(a.value)) return; const fn = p.findParent((x) => x.isFunctionDeclaration() && x.parentPath.isProgram()); if (fn && fn.node.id && DEV_FUNCS.has(fn.node.id.name)) return; if (fn && fn.node.id && DEFERRED_FUNCS.has(fn.node.id.name)) { const dl = deferred.get(a.value) || []; dl.push(p.node.loc.start.line); deferred.set(a.value, dl); return; } const l = keys.get(a.value) || []; l.push(p.node.loc.start.line); keys.set(a.value, l); }
      else dynamic.push(p.node.loc.start.line);
    },
  });
  return { keys, dynamic, badBinding, deferred, txKinds };
}
export function extractAll() {
  const byFile = {}; const all = new Map(); const deferredAll = new Set(); const txKinds = new Map();
  for (const f of listSourceFiles()) {
    const r = extractFromFile(f); const rel = relative(SRC_ROOT, f);
    byFile[rel] = r;
    for (const [k, kinds] of r.txKinds) { const prev = txKinds.get(k) || []; kinds.forEach((kd, i) => { if (!prev[i] || prev[i] === "val" || kd === "icon") prev[i] = kd; }); txKinds.set(k, prev); }
    for (const k of r.deferred.keys()) if (!all.has(k)) deferredAll.add(k);
    for (const [k, lines] of r.keys) { const e = all.get(k) || { files: new Set(), lines: [] }; e.files.add(rel); e.lines.push(...lines.map((l) => rel + ":" + l)); all.set(k, e); }
  }
  for (const k of all.keys()) deferredAll.delete(k);
  return { byFile, all, deferredAll, txKinds };
}
