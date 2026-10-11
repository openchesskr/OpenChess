#!/usr/bin/env node
/** (BUG-077·BUG-078 재발 방지) 리뷰 코치(MEC)가 실제 포지션과 모순되는 문장을 내지 않는지, 실제 대국 표본에 mecFacts를 돌려 검사한다.
 *  · 상대 기물을 잡는 수에 "안 잡았지만"류 문장 금지 / 잡은 기물이 바로 되잡히는 수에 "수비자 제거" 금지
 *  · 앞 문장과 뒤 문장이 마침표 없이 붙은 문장("…나이트 전개 당장 …") 금지
 *  · "지켜 주는 기물 없이 … 공짜로"는 실제로 지키는 기물이 없을 때만
 *  · 잡는 수의 대표 문장은 잡은 결과(캡처·획득·되잡기·교환·수비자 제거·체크메이트 등)를 말해야 한다
 *  실행: node scripts/check-mec-facts.mjs  (prebuild)
 */
import { build } from "esbuild";
import { readFileSync, mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { Chess } from "chess.js";
import { decodeMoves } from "../src/lib/moveCodec.js";

const ROOT = new URL("../", import.meta.url).pathname;
const dir = mkdtempSync(join(ROOT, "node_modules/.mec-check-"));   // 번들이 react 등을 찾을 수 있게 프로젝트 안에 둔다
const out = join(dir, "common.mjs");
await build({ entryPoints: [join(ROOT, "src/app/common.jsx")], bundle: true, platform: "node", format: "esm", outfile: out, jsx: "automatic", logLevel: "error",
  loader: { ".jsx": "jsx", ".js": "jsx", ".png": "dataurl", ".json": "json", ".svg": "dataurl" }, external: ["react", "react-dom", "@supabase/*", "lucide-react", "chess.js"], define: { "import.meta.env": "{}" } });
const { mecFacts } = await import(out);
rmSync(dir, { recursive: true, force: true });

const fails = [];
const games = [];
for (const f of ["norway", "candidates", "dortmund"]) {
  const d = JSON.parse(readFileSync(join(ROOT, "src/data/tournaments/" + f + ".json"), "utf8"));
  games.push(...d.eds.flatMap((e) => e.g).filter((g) => typeof g[5] === "string" && g[5].length > 60).slice(0, 25));
}
let n = 0;
for (const g of games) {
  const sans = decodeMoves(g[5]).slice(0, 70);
  for (let p = 0; p < sans.length; p++) {
    const color = p % 2 ? "b" : "w", san = sans[p];
    const c = new Chess(); for (let i = 0; i < p; i++) c.move(sans[i]);
    const mv = c.move(san); n++;
    const to = {};
    const text = (mecFacts(sans.slice(0, p), san, color, "good", null, 0, to, null)[0] || "");
    const tag = (p % 2 ? Math.floor(p / 2) + 1 + "..." : Math.floor(p / 2) + 1 + ".") + san + " → " + text;
    if (mv.captured && /안 잡았|잡을 수 있었지만|잡지 않았/.test(text)) fails.push("잡는 수에 '안 잡았다' 문장: " + tag);
    if (mv.captured && /수비자 제거/.test(text)) {
      const recap = c.moves({ verbose: true }).some((m) => m.to === mv.to && m.captured);
      if (recap) fails.push("되잡히는 수에 '수비자 제거': " + tag);
    }
    if (/전개 (당장|폰|상대|퀸|룩|비숍|나이트|킹|이 수|현재)|적절한 칸 (당장|현재|상대|이 수|퀸|폰|룩|비숍|나이트)/.test(text)) fails.push("문장 사이 마침표 없음: " + tag);
    if (/지켜 주는 기물 없이/.test(text)) {
      const d2 = new Chess(c.fen()); const defenders = d2.attackers ? d2.attackers(mv.to, color) : null;
      if (defenders && defenders.length) fails.push("지키는 기물이 있는데 '지켜 주는 기물 없이': " + tag);
    }
    if (mv.captured && !mv.flags.includes("e") && !/캡처|획득|되잡|교환|수비자 제거|체크메이트|!!|!$|손해|손실|위협|위험|겨눔|폰끼리|폰과|폰이|제안|수락|거절|대치/.test(text) && text) fails.push("잡는 수인데 잡은 결과를 말하지 않음: " + tag);
  }
}
if (fails.length) { console.error("✗ MEC 문장 모순 " + fails.length + "건 (표본 " + n + "수)\n" + fails.slice(0, 12).map((x) => "  - " + x).join("\n")); process.exit(1); }
console.log("✓ MEC 문장 일관성 (표본 " + n + "수, 모순 0건)");
