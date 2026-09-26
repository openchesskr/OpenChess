#!/usr/bin/env node
/** (v0.5.6 재발 방지, BUGS.md BUG-009·BUG-010) 기기의 "애니메이션 줄이기"(prefers-reduced-motion) 검사 금지.
 *
 *  사이트 애니메이션이 이 기기 설정 때문에 조용히 꺼져 "고장 났다"는 제보가 여러 번 반복됐다(매칭 대기 궤도 아이콘,
 *  수 등급 이펙트, 플레이 탭 버튼 보드 등). 성능·배터리 때문에 켜 두는 경우가 많고 화면엔 아무 안내가 없어서다.
 *  OpenChess의 원칙: 애니메이션을 켜고 끄는 건 설정 탭(시각 효과)만 정하고, 기기 설정은 보지 않는다.
 *  src/ 코드(주석 제외)에서 prefers-reduced-motion 미디어 쿼리나 framer-motion의 useReducedMotion·reducedMotion을
 *  쓰면 실패한다. npm run build 전에 prebuild로 자동 실행된다. 실행: node scripts/check-reduced-motion.mjs
 */
import fs from "node:fs";
import path from "node:path";

const root = new URL("..", import.meta.url).pathname;
const bad = /prefers-reduced-motion|\buseReducedMotion\b|\breducedMotion\s*[:=]/;
const offenders = [];
const walk = (dir) => {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p);
    else if (/\.(jsx?|mjs|tsx?|css)$/.test(e.name)) {
      fs.readFileSync(p, "utf8").split("\n").forEach((line, i) => {
        const code = line.trim();
        if (code.startsWith("//") || code.startsWith("*") || code.startsWith("/*") || code.startsWith("{/*")) return;
        const noTail = code.replace(/\s\/\/.*$/, "");
        if (bad.test(noTail)) offenders.push(path.relative(root, p) + ":" + (i + 1));
      });
    }
  }
};
walk(path.join(root, "src"));

if (offenders.length) {
  console.error("✗ 기기의 '애니메이션 줄이기' 설정으로 애니메이션을 끄는 코드가 있어요 — 설정 탭(시각 효과) 토글로 다뤄 주세요(BUGS.md BUG-010):");
  offenders.forEach((o) => console.error("  " + o));
  process.exit(1);
}
console.log("✓ reduced-motion check: 기기 설정으로 애니메이션을 끄는 코드 없음");
