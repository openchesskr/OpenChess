#!/usr/bin/env node
/** (v0.6.5) 선수별 PGN 대국 모음(players/*.zip) → 마스터 상세 프로필(src/data/masterProfiles.json).
 *  입력: --src <players 폴더>  (scripts/fetch-pgn-archive.mjs --only players/ 로 받은 zip. 시스템 unzip 필요. 저장소에는 올리지 않는다)
 *  출력: src/data/masterProfiles.json  { p: { "성|이름첫글자": 프로필 } } — 도감 마스터 상세 카드가 처음 열 때 지연 로드
 *  프로필 항목(모두 그 선수의 시점):
 *   n(대국 수) · y0/y1(첫·마지막 대국 연도) · wdl[승,무,패] · w/b[백·흑 전적 [승,무,패]] · peak[최고 엘로, 연도] · elo[[연도, 그 해 최고 엘로]…](5년 이상 비어 있으면 그대로)
 *   fm(백 첫 수 [수, 판수, 점수율%]) · e4/d4(검은색으로 1.e4·1.d4에 둔 응수 [수, 판수, 점수율%]) · ecoW/ecoB(백·흑으로 자주 둔 ECO [코드, 이름, 판수, 점수율%])
 *   len(평균 수 길이=한 수는 백·흑 한 쌍) · draw(무승부 %) · opp(자주 만난 상대 [이름, 판수, 승, 무, 패]) · ev(자주 나온 대회 [이름, 판수, 첫 연도, 마지막 연도]) · best(엘로 높은 상대를 이긴 대국 6판 [연도, 대회, 상대, 상대 엘로, 색, 수순 부호])
 *  선수 이름 표기는 build-pgn-tournaments와 같은 규칙(lib/pgnParse.mjs normalizeNames)으로 합친다. 열 때 이름 매칭 키는 build-db-masters.mjs와 같은 "성(영문 소문자)|이름 첫 글자".
 *  실행: node scripts/build-master-profiles.mjs --src <폴더>
 */
import { readdirSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import { join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { parsePgn, norm, normalizeNames } from "./lib/pgnParse.mjs";
import { computeProfile, ecoNameTable } from "./lib/masterProfileStats.mjs";

const argv = process.argv.slice(2), opt = (n, d) => { const i = argv.indexOf("--" + n); return i >= 0 ? argv[i + 1] : d; };
if (!opt("src") || !existsSync(resolve(opt("src")))) { console.error("사용법: node scripts/build-master-profiles.mjs --src <players 폴더>"); process.exit(1); }
const SRC = resolve(opt("src")), ROOT = new URL("../", import.meta.url).pathname;
const asciiKey = (s) => String(s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z ]/g, "").trim();
const resCode = (r) => (r === "1-0" ? "W" : r === "0-1" ? "B" : r === "1/2-1/2" ? "D" : "?");
const eloOf = (s) => { const n = parseInt(s, 10); return n > 0 ? n : 0; };
const yearOf = (d) => { const m = /^(\d{4})/.exec(d || ""); return m ? +m[1] : 0; };

const ecoName = ecoNameTable(JSON.parse(readFileSync(join(ROOT, "src/data/openings.json"), "utf8")).tree);

// 1) 모든 zip 풀어 파싱
const zips = readdirSync(SRC).filter((f) => f.endsWith(".zip")).sort();
const data = [];
for (const z of zips) {
  const r = spawnSync("unzip", ["-p", join(SRC, z)], { maxBuffer: 1 << 30 });
  if (r.status !== 0) { console.warn("풀기 실패:", z); continue; }
  data.push({ file: z.replace(/\.zip$/, ""), games: parsePgn(r.stdout.toString("utf8")) });
}
console.log("zip " + data.length + "개, 대국 " + data.reduce((a, d) => a + d.games.length, 0) + "판");

// (v0.7.7 BUG-167) 원본 PGN의 선수 칸에 두 사람이 붙은 값("Nakamura, Hikaru:Hodgson,Jeremy")이 있다 — 앞사람만 쓴다(그대로 두면 "Hikaru:Hodgson,Jeremy Nakamura"로 보였다).
for (const d of data) for (const g of d.games) for (const tg of ["White", "Black"]) if (typeof g.tags[tg] === "string" && g.tags[tg].includes(":")) g.tags[tg] = g.tags[tg].split(":")[0].trim();
// 2) 이름 합치기(전체 상대 포함)
const counts = new Map();
for (const d of data) for (const g of d.games) for (const k of [g.tags.White, g.tags.Black]) counts.set(k, (counts.get(k) || 0) + 1);
const canon = normalizeNames(counts); const cn = (s) => canon.get(s) || s;

// 3) 선수별 프로필
// 쉼표 없는 표기에서 성을 잘못 짚는 이름(성이 둘째 낱말 이후인 경우)
const NAME_FIX = { "Carlos Torre Repetto": "Torre Repetto, Carlos" };
const keyOfName = (name) => { const i = name.indexOf(","); const sur = i >= 0 ? name.slice(0, i) : name.split(" ")[0], giv = i >= 0 ? name.slice(i + 1) : name.split(" ").slice(1).join(" "); return asciiKey(sur) + "|" + asciiKey(giv).slice(0, 1); };
const profiles = {}; const summary = [];
for (const d of data) {
  // 이 파일의 주인공 = 가장 자주 나오는 대표 이름
  const c = new Map(); for (const g of d.games) for (const k of [cn(g.tags.White), cn(g.tags.Black)]) c.set(k, (c.get(k) || 0) + 1);
  const subject0 = [...c.entries()].sort((a, b) => b[1] - a[1])[0][0], subject = NAME_FIX[subject0] || subject0, subKey = keyOfName(subject0 === subject ? subject : subject);
  const recs = [];
  for (const g of d.games) {
    const w = cn(g.tags.White), b = cn(g.tags.Black), key0 = keyOfName(subject0), isW = keyOfName(w) === subKey || keyOfName(w) === key0, isB = keyOfName(b) === subKey || keyOfName(b) === key0;
    if (!isW && !isB) continue;
    recs.push({ isW, res: resCode(g.tags.Result), y: yearOf(g.tags.Date), myElo: eloOf(isW ? g.tags.WhiteElo : g.tags.BlackElo), oppElo: eloOf(isW ? g.tags.BlackElo : g.tags.WhiteElo), opp: isW ? b : w, moves: g.moves, eco: g.tags.ECO || "", ev: g.tags.Event });
  }
  // (v0.7.5) 계산은 scripts/lib/masterProfileStats.mjs(저장소 DB로 보충하는 build-master-profiles-db와 공용)
  const P = computeProfile(subject, recs, ecoName);
  if (!P) { console.warn("대국이 너무 적어 건너뜀:", d.file, recs.length); continue; }
  if (profiles[subKey]) { console.warn("키 충돌 — 대국이 더 많은 쪽 유지:", subKey, profiles[subKey].name, "/", subject); if (profiles[subKey].n >= P.n) continue; }
  profiles[subKey] = P; summary.push([subject, P.n, P.y0 + "–" + P.y1]);
}
const OUT = resolve(opt("out", join(ROOT, "src/data/masterProfiles.json")));   // (v0.7.5) --out: 검증용 다른 위치에 쓰기
writeFileSync(OUT, JSON.stringify({ p: profiles }));
const size = readFileSync(OUT).length;
console.log("프로필 " + Object.keys(profiles).length + "명, 파일 " + (size / 1024).toFixed(0) + "KB");
summary.sort((a, b) => b[1] - a[1]).slice(0, 8).forEach((s) => console.log("  " + s.join(" · ")));
