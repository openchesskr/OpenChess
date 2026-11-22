// (v0.8.0, BUG-206) 분석 탭 렉 재발 방지 — prebuild.
// 휴대폰 분석 탭에서 수를 두면 보드가 잠깐 사라질 만큼 밀리던 원인을 구조로 막는다.
//  ① useMergedMoves(analysis.jsx)의 후보 수 평가(live)는 queueLive로 모아서만 반영한다 — 엔진 진행 줄마다 setMoves를 부르면
//     분석 탭 전체(보드·수 블록)가 초당 10번 넘게 다시 그려진다.
//  ② 엔진 평가·라인 스트리밍(mkThr)은 공용 박자(onTick)에 올린다 — 각자 타이머를 쓰면 한 번 그릴 것을 여러 번에 나눠 그린다.
//  ③ PieceGlyph는 React.memo — 보드가 다시 그려져도 바뀌지 않은 기물 32개를 다시 그리지 않는다.
//  ④ 렌더마다 도는 layout effect에서 레이아웃 값(scrollHeight·offsetWidth 등)을 읽지 않는다: 의존성에 children(매번 새 JSX)을 둔
//     useLayoutEffect는 금지. 넘침·폭 재기는 ResizeObserver 알림 안에서(ClampText·KeywordScroll·MarqueeText).
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const read = (f) => readFileSync(path.join(ROOT, f), "utf8");
const fails = [];
const ok = (cond, msg) => { if (!cond) fails.push(msg); };

const an = read("src/app/analysis.jsx");
const hookStart = an.indexOf("function useMergedMoves(");
const hookEnd = an.indexOf("\nfunction ", hookStart + 10);
const hook = an.slice(hookStart, hookEnd > 0 ? hookEnd : undefined);
ok(hookStart > 0, "useMergedMoves를 찾지 못함");
ok(/const queueLive = useCallback\(/.test(hook) && /const onTick = useCallback\(/.test(hook), "useMergedMoves에 queueLive·onTick(모아서 반영) 없음");
ok(!/setMoves\(\(prev\) => prev\.map\(\(\w+\) => [^\n]*\blive: /.test(hook), "useMergedMoves에서 후보 수 평가(live)를 setMoves로 바로 반영함 — queueLive(key, {수: 값})로 모아서 반영할 것");
ok(/const mkThr = \(fn\) => \{[^\n]*onTick\(/.test(hook), "엔진 평가·라인 스트리밍(mkThr)이 공용 박자(onTick)를 쓰지 않음");
ok(!/\bthrottled\(/.test(an.replace(/\/\/[^\n]*/g, "")), "analysis.jsx에 각자 타이머를 쓰는 throttled()가 다시 생김 — onTick을 쓸 것");

const pc = read("src/components/pieces.jsx");
ok(/export const PieceGlyph = React\.memo\(/.test(pc), "PieceGlyph가 React.memo가 아님(보드가 다시 그려질 때 기물 32개를 매번 다시 그림)");

function* walk(d) { for (const e of readdirSync(d, { withFileTypes: true })) { const p = path.join(d, e.name); if (e.isDirectory()) yield* walk(p); else if (/\.jsx?$/.test(e.name)) yield p; } }
for (const f of walk(path.join(ROOT, "src"))) {
  const src = readFileSync(f, "utf8"); const rel = path.relative(ROOT, f).split(path.sep).join("/");
  const re = /useLayoutEffect\(\(\) => \{/g; let m;
  while ((m = re.exec(src))) {
    let i = m.index + m[0].length, depth = 1;
    for (; i < src.length && depth > 0; i++) { if (src[i] === "{") depth++; else if (src[i] === "}") depth--; }
    const after = src.slice(i, i + 80);
    const deps = (after.match(/^\s*,\s*\[([^\]]*)\]/) || [])[1];
    const body = src.slice(m.index, i);
    const line = src.slice(0, m.index).split("\n").length;
    if (deps != null && /\bchildren\b/.test(deps)) fails.push(`${rel}:${line} useLayoutEffect 의존성에 children — 매 렌더마다 실행된다(레이아웃 읽기는 ResizeObserver로)`);
    if (deps == null && /\b(scrollHeight|scrollWidth|offsetWidth|offsetHeight|getBoundingClientRect)\b/.test(body)) fails.push(`${rel}:${line} 의존성 없는 useLayoutEffect에서 레이아웃 값을 읽음 — 렌더마다 강제 레이아웃`);
  }
}
for (const [f, name] of [["src/app/analysis.jsx", "function ClampText("], ["src/components/keywordScroll.jsx", "export function KeywordScroll("], ["src/components/keywordScroll.jsx", "export function MarqueeText("]]) {
  const s = read(f); const i = s.indexOf(name); const body = s.slice(i, s.indexOf("\n}\n", i));
  ok(i > 0 && /new ResizeObserver\(/.test(body) && !/useLayoutEffect\(/.test(body), `${name.replace(/^export /, "")}: 넘침·폭 재기는 ResizeObserver 알림 안에서만(useLayoutEffect에서 바로 읽지 말 것)`);
}

if (fails.length) { console.error("✘ check-render-perf:\n  " + fails.join("\n  ")); process.exit(1); }
console.log("✔ check-render-perf: 후보 수 평가 모아서 반영·공용 박자, PieceGlyph memo, 렌더마다 강제 레이아웃 없음");
