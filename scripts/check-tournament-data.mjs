#!/usr/bin/env node
/** (v0.6.5) 대회 대국 데이터·마스터 프로필 무결성 검사(prebuild) — scripts/build-pgn-tournaments.mjs · build-master-profiles.mjs 산출물을 지킨다.
 *  ① 대회 데이터(src/data/tournaments/<id>.json): 모든 대회 목록 항목(자동 대회)에 파일이 있고, 회차가 연도순이며, 대국이 가리키는 선수 번호·결과값·라운드·단계가 유효하다.
 *     선수 점수(pl의 점수×2·대국 수)가 본 경기 대국에서 다시 계산한 값과 같다(저장된 점수와 대국이 어긋나면 순위표가 거짓말을 한다).
 *  ② 수순 압축(moveCodec): 표본 대국을 복원해 합법 수순이고, 다시 압축하면 같은 부호가 나온다(chess.js 수 생성이 바뀌어 부호가 깨지는 것을 막는다).
 *  ③ 색인(tournamentIndex.json)·검색 색인(tournamentSearch.json)이 대회 데이터와 맞는다(대국 수, 대표 대국은 대회마다 1판만 복원해 합법 확인, 대회 번호 유효).
 *  ④ 화면 계산(src/lib/tournamentView.js): 라운드로빈 크로스테이블의 칸 수 = 본 경기 대국 수 × 2, 녹아웃 대진표는 마지막 라운드가 결승이고 우승자가 나온다.
 *  ⑤ 마스터 프로필(masterProfiles.json): 전적 합 = 대국 수, 대표 대국 합법, 챔피언 이름으로 프로필이 찾아진다(masterProfile.js), 대회 출전 기록이 연결된다.
 *  ⑥ 연결·용량: 도감 마스터 화면이 회차 화면·프로필·검색을 쓰고, 데이터 용량이 상한(Vercel 배포 저장 용량 규칙)을 넘지 않는다.
 *  실행: node scripts/check-tournament-data.mjs
 */
import { readFileSync, readdirSync, statSync, existsSync } from "node:fs";
import { Chess } from "chess.js";
import { encodeMoves, decodeMoves } from "../src/lib/moveCodec.js";
import { standings, crosstable, bracket, winnerOf, mainGames, filterGames } from "../src/lib/tournamentView.js";
import { findProfile, playedTournaments, candidateKeys } from "../src/lib/masterProfile.js";
const { TOURNAMENTS } = await import("../src/data/chessTournaments.js");
const { CHAMPIONS } = await import("../src/data/worldChampions.js");
const url = (p) => new URL("../" + p, import.meta.url);
const rj = (p) => JSON.parse(readFileSync(url(p), "utf8"));
const fails = [];
const eq = (a, b, m) => { if (JSON.stringify(a) !== JSON.stringify(b)) fails.push(m + ": " + JSON.stringify(a) + " ≠ " + JSON.stringify(b)); };

// ① 대회 데이터
const dir = url("src/data/tournaments/"), files = readdirSync(dir).filter((f) => f.endsWith(".json"));
const ids = new Set(files.map((f) => f.replace(/\.json$/, "")));
for (const t of TOURNAMENTS) if (t.auto && !ids.has(t.id)) fails.push(t.id + ": 자동 대회인데 데이터 파일이 없음");
for (const id of ids) if (!TOURNAMENTS.some((t) => t.id === id)) fails.push(id + ": 대회 데이터 파일이 있는데 대회 목록에 없음(남은 파일 — build-pgn-tournaments가 폴더를 다시 만든다)");
const FMT = new Set(["rr", "swiss", "ko", "match", "list"]);
let totalGames = 0, sample = [], k = 0;
const data = new Map();
for (const f of files) {
  const d = JSON.parse(readFileSync(new URL(f, dir), "utf8")); const id = f.replace(/\.json$/, ""); data.set(id, d);
  if (d.id !== id || !Array.isArray(d.eds) || !d.eds.length) { fails.push(id + ": 데이터 형식 오류"); continue; }
  d.eds.forEach((e, i) => {
    const where = id + "/" + e.k;
    if (i && e.y < d.eds[i - 1].y) fails.push(where + ": 회차가 연도순이 아님");
    if (!FMT.has(e.fmt)) fails.push(where + ": 알 수 없는 형식 " + e.fmt);
    if (!(e.y >= 1850 && e.y <= 2030)) fails.push(where + ": 연도 오류 " + e.y);
    const n = e.pl.length, sc = e.pl.map(() => [0, 0]);
    for (const g of e.g) {
      const [r, b, w, bl, res, code, , st] = g;
      if (!(w >= 0 && w < n && bl >= 0 && bl < n) || w === bl) { fails.push(where + ": 대국의 선수 번호 오류 " + JSON.stringify(g.slice(0, 5))); break; }
      if (![-1, 0, 1, 2].includes(res)) { fails.push(where + ": 결과값 오류 " + res); break; }
      if (!(r >= 0 && b >= 0) || (st != null && !(st >= 1 && st <= e.evs.length))) { fails.push(where + ": 라운드·단계 오류 " + JSON.stringify(g.slice(0, 5)) + " " + st); break; }
      if (!st) { sc[w][1]++; sc[bl][1]++; if (res === 2) sc[w][0] += 2; else if (res === 0) sc[bl][0] += 2; else if (res === 1) { sc[w][0]++; sc[bl][0]++; } }
      totalGames++; if (code && (k++ % 400 === 0)) sample.push({ where, code });
    }
    e.pl.forEach((p, j) => { if (p[3] !== sc[j][0] || p[4] !== sc[j][1]) fails.push(where + ": " + p[0] + " 점수·대국 수가 대국에서 다시 계산한 값(" + sc[j][0] / 2 + "/" + sc[j][1] + ")과 다름(" + p[3] / 2 + "/" + p[4] + ")"); });
    for (let j = 1; j < n; j++) if (e.pl[j][3] > e.pl[j - 1][3]) { fails.push(where + ": 선수가 점수 순이 아님"); break; }
  });
}
// ② 수순 압축 표본
let sOk = 0;
for (const s of sample) {
  const sans = decodeMoves(s.code);
  try { const c = new Chess(); for (const m of sans) c.move(m); } catch { fails.push(s.where + ": 복원한 수순이 합법이 아님"); continue; }
  if (encodeMoves(sans).code !== s.code) { fails.push(s.where + ": 복원 후 다시 압축한 부호가 다름"); continue; }
  sOk++;
}
if (sample.length < 150) fails.push("수순 표본이 너무 적음(" + sample.length + ")");
// ③ 색인
const idx = rj("src/data/tournamentIndex.json"), search = rj("src/data/tournamentSearch.json");
for (const [id, d] of data) {
  const x = idx.byId[id]; if (!x) { fails.push(id + ": tournamentIndex.json에 없음"); continue; }
  const games = d.eds.reduce((a, e) => a + e.g.length, 0);
  if (x.games !== games) fails.push(id + ": 색인의 대국 수(" + x.games + ")가 데이터(" + games + ")와 다름");
  for (const g of x.top.slice(0, 1)) { if (!g.mc) { fails.push(id + ": 대표 대국 " + g.id + "에 mc(압축 수순)가 없음"); continue; } try { const c = new Chess(); for (const m of decodeMoves(g.mc)) c.move(m); } catch { fails.push(id + ": 대표 대국 " + g.id + "가 합법이 아님"); } }
}
for (const [name, list] of Object.entries(search.p)) for (const [t] of list) if (!search.t[t]) { fails.push("검색 색인 " + name + ": 대회 번호 오류 " + t); break; }
for (const t of search.t) if (!ids.has(t)) fails.push("검색 색인의 대회가 데이터에 없음: " + t);
// ④ 화면 계산
{
  let rr = 0, ko = 0;
  for (const d of data.values()) for (const e of d.eds) {
    if (e.fmt === "rr" && rr < 40) { rr++; const ct = crosstable(e), cells = ct.cells.flat().reduce((a, c) => a + c.length, 0), main = mainGames(e).filter(({ g }) => g[4] >= 0).length; if (cells !== main * 2) fails.push(d.id + "/" + e.k + ": 크로스테이블 칸 수(" + cells + ") ≠ 본 경기 대국 수×2(" + main * 2 + ")"); }
    if (e.fmt === "ko" && ko < 20) { ko++; const br = bracket(e), w = winnerOf(e); if (br.length < 2) fails.push(d.id + "/" + e.k + ": 녹아웃 대진표 라운드가 2개 미만"); if (!w && br.length) { /* 결승이 무승부(타이브레이크 자료 없음)면 우승자 없음은 허용 */ } }
  }
  const wc = data.get("worldCup"), e23 = wc && wc.eds.find((e) => e.y === 2023);
  if (!e23) fails.push("월드컵 2023 회차가 없음"); else { eq([e23.fmt, (winnerOf(e23) || {}).names], ["ko", ["Carlsen, M"]], "월드컵 2023 대진표·우승자"); const br = bracket(e23); eq(br[br.length - 1].matches.filter((m) => m.bronze).length, 1, "월드컵 2023 3·4위전 구분"); }
  const hs = data.get("hastings"), h61 = hs && hs.eds.find((e) => e.y === 1961); if (!h61) fails.push("헤이스팅스 1961 회차가 없음"); else eq([h61.fmt, standings(h61).length, (winnerOf(h61) || {}).names], ["rr", 10, ["Botvinnik, Mikhail"]], "헤이스팅스 1961");
  const fg = filterGames(h61 || { g: [], pl: [], evs: [] }, { text: "botvinnik" }); if (!fg.length) fails.push("대국 목록 필터가 동작하지 않음");
}
// ⑤ 마스터 프로필
{
  const prof = rj("src/data/masterProfiles.json"), keys = Object.keys(prof.p);
  if (keys.length < 200) fails.push("마스터 프로필이 너무 적음(" + keys.length + ")");
  for (const [key, p] of Object.entries(prof.p)) {
    if (p.wdl[0] + p.wdl[1] + p.wdl[2] !== p.n) fails.push(key + ": 승무패 합 ≠ 대국 수");
    if (p.w.reduce((a, b) => a + b, 0) + p.b.reduce((a, b) => a + b, 0) !== p.n) fails.push(key + ": 백·흑 전적 합 ≠ 대국 수");
    for (const b of p.best.slice(0, 1)) { try { const c = new Chess(); for (const m of decodeMoves(b[5])) c.move(m); } catch { fails.push(key + ": 대표 대국이 합법이 아님"); } }
  }
  const search2 = search; let found = 0, tf = 0;
  for (const c of CHAMPIONS.filter((x) => x.id !== "steinitz")) { if (findProfile(prof, c.name)) found++; if (playedTournaments(search2, c.name, 3).length) tf++; }
  if (found < 15) fails.push("챔피언 중 프로필이 찾아지는 사람이 너무 적음(" + found + ")");
  if (tf < 10) fails.push("챔피언 중 대회 출전 기록이 연결되는 사람이 너무 적음(" + tf + ")");
  eq(candidateKeys("Magnus Carlsen")[0], "carlsen|m", "프로필 키 규칙");
  eq(findProfile(prof, "Bobby Fischer") ? findProfile(prof, "Bobby Fischer").name.startsWith("Fischer") : false, true, "애칭 이름 프로필 찾기(Bobby Fischer)");
  if (findProfile(prof, "Susan Polgar") && findProfile(prof, "Judit Polgar") && findProfile(prof, "Susan Polgar") === findProfile(prof, "Judit Polgar")) fails.push("성이 같은 폴가르 자매 프로필이 한 사람으로 합쳐짐");
}
// ⑥ 연결·용량
{
  const dm = readFileSync(url("src/app/dexMasters.jsx"), "utf8");
  for (const [re, m] of [[/import EditionView from "..\/components\/tournamentView.jsx"/, "회차 화면 연결"], [/import MasterProfile from "..\/components\/masterProfile.jsx"/, "마스터 프로필 연결"], [/hasTournamentData\(n\.tourId\)/, "연도 블록 → 회차 화면"], [/tournamentsOfPlayerQuery/, "선수 이름 검색"], [/aria-label=\{t\("대회·개최지·선수 검색"\)\}/, "대회 검색 입력"]]) if (!re.test(dm)) fails.push("dexMasters.jsx: " + m + "이(가) 없음");
  const sizeOf = (p) => statSync(url(p)).size, dirSize = files.reduce((a, f) => a + statSync(new URL(f, dir)).size, 0);
  const LIM = { dir: 20 * 1048576, prof: 1048576, idx: 2 * 1048576, search: 600 * 1024 };
  if (dirSize > LIM.dir) fails.push("대회 데이터 용량 " + (dirSize / 1048576).toFixed(1) + "MB > 상한 20MB — 배포 저장 용량 규칙(README)");
  if (sizeOf("src/data/masterProfiles.json") > LIM.prof) fails.push("masterProfiles.json 용량 상한 초과");
  if (sizeOf("src/data/tournamentIndex.json") > LIM.idx) fails.push("tournamentIndex.json 용량 상한 초과 — 대표 대국은 압축 부호(mc)로");
  if (sizeOf("src/data/tournamentSearch.json") > LIM.search) fails.push("tournamentSearch.json 용량 상한 초과");
  if (existsSync(url("src/data/tournamentsAuto.json"))) fails.push("tournamentsAuto.json이 남아 있음(js로 바뀜)");
}
if (fails.length) { console.error("✖ check-tournament-data 실패 (" + fails.length + "건):\n  " + fails.slice(0, 30).join("\n  ") + (fails.length > 30 ? "\n  … 외 " + (fails.length - 30) + "건" : "")); process.exit(1); }
console.log("✔ check-tournament-data: 대회 " + files.length + "곳·대국 " + totalGames + "판의 점수·선수 참조가 맞고, 수순 표본 " + sOk + "판이 합법·왕복 복원되며, 색인·검색·프로필·화면 계산·용량 상한이 유지된다");
