// (v0.6.7) 정확도 계산 코드의 지문. 퍼포먼스 레이팅 곡선(src/data/performanceCurve.json)은 "그때의 정확도 계산"으로 보정한 값이라,
// 정확도 계산(승률 변환·손실→정확도 변환·날카로움 보정·조화평균·감점 배율)이 바뀌면 곡선이 낡는다. 보정 시점의 지문을 곡선 파일에 담아 두고,
// scripts/check-performance-rating.mjs(prebuild)가 현재 지문과 다르면 빌드를 막는다 — 정확도를 고치고 곡선을 다시 맞추는 걸 잊을 수 없다.
// 주석·공백은 지문에서 뺀다(주석을 고쳐도 곡선은 낡지 않는다). 한계: 수 등급 판정(gradeMoveKind·analyzeGame의 noPenalty 등)이 바뀌어
// 정확도가 달라지는 경우는 이 지문이 못 잡는다 — 그런 변경 뒤에도 곡선을 다시 맞춰야 한다.
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";

const strip = (s) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "").replace(/\s+/g, " ").trim();

export function accuracyFingerprint(root = new URL("../../", import.meta.url)) {
  const src = readFileSync(new URL("src/lib/moveQuality.js", root), "utf8");
  const win = src.match(/export function winPctFromCp[^\n]*\n/);
  const from = src.indexOf("const NEW_ACC_DECAY");
  if (!win || from < 0) throw new Error("moveQuality.js에서 정확도 계산 구간(winPctFromCp·NEW_ACC_DECAY)을 찾지 못함 — accuracyFingerprint.mjs를 고칠 것");
  return createHash("sha1").update(strip(win[0]) + "\n" + strip(src.slice(from))).digest("hex").slice(0, 16);
}
