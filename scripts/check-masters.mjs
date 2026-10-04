#!/usr/bin/env node
/** (v0.6.3, 도감 "마스터") 세계 챔피언 모식도 안전장치
 *  ① 데이터(src/data/worldChampions.js): id 중복·끊긴 참조 없음, 타이틀 이동의 해가 받는 챔피언의 재위 시작과 같음, 정통 계보(C) 재위가 겹치지 않고 시간순,
 *     방어전 해가 그 재위 안, 점수 형식, 위성(탈락 도전자)은 정통 계보(C·L) 챔피언이 아닌 사람, 분열기 행·곧 열릴 타이틀전이 존재하는 챔피언을 가리킴.
 *  ② 배치(src/lib/masterTreeLayout.js): 노드끼리 겹치지 않고, 캔버스 안에 들어가고, 정통 계보가 위→아래 시간순, 모든 선의 양 끝 노드가 있음.
 *  ③ 팬 한계(clampMasterPan): 내용이 화면보다 작으면 고정, 크면 가장자리를 넘지 않음.
 *  ④ 연결: 도감에 "마스터" 탭과 MastersSchematic가 있고 오프닝·마스터가 같은 높이 계산(useFitPanelHeight)을 쓴다.
 *  실행: node scripts/check-masters.mjs */
import { readFileSync } from "node:fs";
const fails = [];
const eq = (a, b, m) => { if (JSON.stringify(a) !== JSON.stringify(b)) fails.push(m + ": " + JSON.stringify(a) + " ≠ " + JSON.stringify(b)); };
const { CHAMPIONS, TRANSFERS, SPLIT_ROWS, UPCOMING } = await import("../src/data/worldChampions.js");
const { MT, layoutMasters, satellitesOf, clampMasterPan, championAt, yearToY } = await import("../src/lib/masterTreeLayout.js");
const { TOURNAMENTS, TOURNAMENT_TYPES } = await import("../src/data/chessTournaments.js");

// ① 데이터
const ids = CHAMPIONS.map((c) => c.id); eq(new Set(ids).size, ids.length, "챔피언 id 중복");
const byId = new Map(CHAMPIONS.map((c) => [c.id, c]));
const N = "(?:\\d+(?:\\.5)?)"; const SCORE = new RegExp("^" + N + "–" + N + "(?: \\(" + N + "–" + N + "\\))?$|^" + N + "/\\d+$");
for (const c of CHAMPIONS) {
  if (!c.name || !c.ko || !c.cc || !["C", "L", "R"].includes(c.lane)) fails.push(c.id + ": 필수 필드(name·ko·cc·lane) 누락");
  if (!(c.from >= 1886) || (c.to != null && c.to < c.from)) fails.push(c.id + ": 재위 해 오류 " + c.from + "–" + c.to);
  for (const d of c.defenses || []) {
    if (!d.opp || !d.ko || !d.cc) fails.push(c.id + ": 방어전 상대 필드 누락 " + JSON.stringify(d));
    if (d.y < c.from || (c.to != null && d.y > c.to)) fails.push(c.id + ": 방어전 해(" + d.y + ")가 재위(" + c.from + "–" + c.to + ") 밖");
    if (!SCORE.test(d.score)) fails.push(c.id + ": 점수 형식 오류 \"" + d.score + "\"");
  }
}
const lineal = new Set(CHAMPIONS.filter((c) => c.lane !== "R").map((c) => c.name));
for (const c of CHAMPIONS) for (const d of c.defenses || []) if (d.sat && lineal.has(d.opp)) fails.push(c.id + ": 위성 " + d.opp + "은 정통 계보 챔피언 — sat 해제할 것(중복 노드)");
const laneC = CHAMPIONS.filter((c) => c.lane === "C");
for (let i = 1; i < laneC.length; i++) if (laneC[i].from < laneC[i - 1].to) fails.push("정통 계보 재위 겹침/역순: " + laneC[i - 1].id + "(" + laneC[i - 1].to + ") → " + laneC[i].id + "(" + laneC[i].from + ")");
for (const t of TRANSFERS) {
  const a = byId.get(t.from), b = byId.get(t.to);
  if (!a || !b) { fails.push("타이틀 이동 참조 오류 " + t.from + "→" + t.to); continue; }
  if (t.y !== b.from) fails.push("타이틀 이동 해(" + t.y + ")가 " + t.to + " 재위 시작(" + b.from + ")과 다름");
  if (t.score && !SCORE.test(t.score)) fails.push("이동 점수 형식 오류 " + t.score);
}
for (const c of CHAMPIONS.slice(1)) if (!TRANSFERS.some((t) => t.to === c.id)) fails.push(c.id + ": 들어오는 타이틀 이동 없음");
for (const c of CHAMPIONS) if (c.to != null && !TRANSFERS.some((t) => t.from === c.id)) fails.push(c.id + ": 재위가 끝났는데 나가는 타이틀 이동 없음");
for (const id of SPLIT_ROWS.flat().filter(Boolean)) if (!byId.has(id)) fails.push("분열기 행 id 없음: " + id);
const splitSet = new Set(SPLIT_ROWS.flat().filter(Boolean));
for (const c of CHAMPIONS) if ((c.lane !== "C") !== splitSet.has(c.id)) fails.push(c.id + ": lane(" + c.lane + ")과 분열기 행 소속이 다름");
if (!byId.has(UPCOMING.champ) || byId.get(UPCOMING.champ).to != null) fails.push("UPCOMING.champ은 현 챔피언(to=null)이어야 함");
eq(CHAMPIONS.filter((c) => c.to == null).length, 1, "현 챔피언은 정확히 1명");

// 대수(no): 정통 계보(C·L 줄)는 번호가 있고 같은 사람은 같은 번호, 새 사람마다 1씩 증가, FIDE 계보(R)는 번호 없음. 현 챔피언 번호 = 정통 챔피언 수.
const numbered = CHAMPIONS.filter((c) => c.lane !== "R");
for (const c of CHAMPIONS) if ((c.lane === "R") === (c.no != null)) fails.push(c.id + ": 대수(no)와 줄(lane) 불일치(FIDE 줄만 번호 없음)");
const noByName = new Map(); let lastNo = 0;
for (const c of numbered) {
  if (noByName.has(c.name)) { if (noByName.get(c.name) !== c.no) fails.push(c.id + ": 같은 사람인데 대수가 다름(" + c.no + " ≠ " + noByName.get(c.name) + ")"); }
  else { if (c.no !== lastNo + 1) fails.push(c.id + ": 대수가 연속되지 않음(" + c.no + ", 기대 " + (lastNo + 1) + ")"); noByName.set(c.name, c.no); lastNo = c.no; }
}
eq(CHAMPIONS.find((c) => c.to == null).no, new Set(numbered.map((c) => c.name)).size, "현 챔피언 대수 = 정통 챔피언 수");
const bySame = new Map(); for (const c of numbered) { if (!bySame.has(c.name)) bySame.set(c.name, []); bySame.get(c.name).push(c); }
for (const [name, list] of bySame) { const gaps = list.filter((c, i) => i === 0 || list[i - 1].to !== c.from); if (gaps.length > 1) for (const c of list) if (!c.reign) fails.push(name + ": 재위가 떨어져 여러 번이면 reign 번호 필요(" + c.id + ")"); }

// 순서 표기(영어 6th·1st·11th·22nd, 스페인어 6.º, 그 외 숫자)
const { ordinalParam } = await import("../src/lib/ordinal.js");
eq([1, 2, 3, 4, 6, 11, 12, 13, 18, 21, 22].map((n) => ordinalParam(n, "en")), ["1st", "2nd", "3rd", "4th", "6th", "11th", "12th", "13th", "18th", "21st", "22nd"], "영어 서수");
eq([ordinalParam(6, "es"), ordinalParam(6, "ko"), ordinalParam(6, "ja")], ["6.º", 6, 6], "그 외 언어 서수");

// ② 배치
// 대회 데이터
{
  const tids = TOURNAMENTS.map((r) => r.id); eq(new Set(tids).size, tids.length, "대회 id 중복");
  for (const id of tids) if (byId.has(id)) fails.push("대회 id가 챔피언 id와 겹침: " + id);
  TOURNAMENTS.forEach((r, i) => {
    if (!r.name || !r.ko) fails.push(r.id + ": 이름(name·ko) 누락");
    if (!TOURNAMENT_TYPES.includes(r.type)) fails.push(r.id + ": 알 수 없는 종류 " + r.type);
    if (!(r.from >= 1850 && r.from <= 2030) || (r.to != null && r.to < r.from)) fails.push(r.id + ": 연도 오류 " + r.from + "–" + r.to);
    if (r.freq && !["annual", "biennial", "oneoff"].includes(r.freq)) fails.push(r.id + ": freq 오류 " + r.freq);
    if (!["various", "online"].includes(r.place) && !r.placeKo) fails.push(r.id + ": 도시 개최 대회는 placeKo 필요");
    if (i && r.from < TOURNAMENTS[i - 1].from) fails.push(r.id + ": 대회 목록이 시작 연도순이 아님");
  });
  for (const ty of TOURNAMENT_TYPES) if (!TOURNAMENTS.some((r) => r.type === ty)) fails.push("대회 종류 " + ty + "에 해당하는 대회가 없음");
  eq([championAt(CHAMPIONS, 1895)?.id, championAt(CHAMPIONS, 1938)?.id, championAt(CHAMPIONS, 2013)?.id, championAt(CHAMPIONS, 2025)?.id, championAt(CHAMPIONS, 1947)], ["lasker", "alekhine2", "carlsen", "gukesh", null], "개최 당시 챔피언");
  eq(championAt(CHAMPIONS, 2003)?.id, "kramnik1", "분열기는 정통(클래식) 줄 챔피언 기준");
  const anc = [{ year: 1900, y: 100 }, { year: 1910, y: 200 }];
  eq([yearToY(anc, 1890), yearToY(anc, 1905), yearToY(anc, 1999)], [100, 150, 200], "연도→높이 보간");
}
const L = layoutMasters(CHAMPIONS, TRANSFERS, SPLIT_ROWS, UPCOMING, TOURNAMENTS);
eq(L.nodes.filter((n) => n.kind === "champ").length, CHAMPIONS.length, "챔피언 노드 수");
eq(L.nodes.filter((n) => n.kind === "sat").length, CHAMPIONS.reduce((n, c) => n + satellitesOf(c).length, 0), "위성 노드 수");
for (let i = 0; i < L.nodes.length; i++) {
  const a = L.nodes[i];
  if (a.x < 0 || a.y < 0 || a.x + a.w > L.width || a.y + a.h > L.height) fails.push("노드가 캔버스 밖: " + a.id);
  for (let j = i + 1; j < L.nodes.length; j++) { const b = L.nodes[j]; if (a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h) fails.push("노드 겹침: " + a.id + " ↔ " + b.id); }
}
const yOf = (id) => L.byNodeId.get(id).y;
for (let i = 1; i < laneC.length; i++) if (yOf(laneC[i].id) <= yOf(laneC[i - 1].id)) fails.push("정통 계보가 위→아래 시간순이 아님: " + laneC[i - 1].id + " → " + laneC[i].id);
for (const e of L.edges) if (!e.a || !e.b) fails.push("선의 끝 노드 없음: " + e.from + "→" + e.to);
for (const t of TRANSFERS) { const a = L.byNodeId.get(t.from), b = L.byNodeId.get(t.to); if (b.y + 1 < a.y) fails.push("타이틀 이동이 위로 거슬러 올라감: " + t.from + "→" + t.to); }
const lx = (id) => L.byNodeId.get(id).x;
if (!(lx("kasparov2") < lx("karpov2"))) fails.push("분열기: 왼쪽(PCA·클래식) 줄이 오른쪽(FIDE) 줄보다 오른쪽에 있음");

// 대회 열: 모든 챔피언·도전자 노드의 오른쪽, 연도순으로 위→아래, 개최 연도의 챔피언 행 높이 근처(아래로만 밀림, 지나치게 벗어나지 않음)
{
  const tours = L.nodes.filter((n) => n.kind === "tour"), others = L.nodes.filter((n) => n.kind !== "tour");
  eq(tours.length, TOURNAMENTS.length, "대회 노드 수");
  const maxRight = Math.max(...others.map((n) => n.x + n.w));
  for (const n of tours) {
    if (n.x < maxRight) fails.push("대회 노드가 왼쪽 노드와 같은 열을 침범: " + n.id);
    if (n.y + 1 < n.anchorY - MT.TOUR_H / 2) fails.push("대회 노드가 개최 연도 높이보다 위로 올라감: " + n.id);
    if (n.y - (n.anchorY - MT.TOUR_H / 2) > 400) fails.push("대회 노드가 개최 연도 높이에서 너무 멀리 밀림(" + Math.round(n.y - (n.anchorY - MT.TOUR_H / 2)) + "px): " + n.id);
  }
  for (let i = 1; i < tours.length; i++) if (tours[i].y < tours[i - 1].y + tours[i - 1].h) fails.push("대회 노드가 연도순 위→아래가 아니거나 겹침: " + tours[i].id);
  if (!L.rail || L.rail.x >= Math.min(...tours.map((n) => n.x))) fails.push("대회 열 세로선(rail)이 카드 왼쪽에 없음");
}

// ③ 팬 한계
const small = { width: 400, height: 300 }, big = { width: 2000, height: 5000 };
eq(clampMasterPan({ x: -999, y: -999 }, 1, 800, 600, small), { x: 200, y: 20 }, "작은 내용은 가로 가운데·세로 위 고정");
eq(clampMasterPan({ x: 500, y: 500 }, 1, 800, 600, big), { x: 20, y: 20 }, "큰 내용: 왼쪽·위 한계");
eq(clampMasterPan({ x: -9999, y: -99999 }, 1, 800, 600, big), { x: 800 - 2000 - 20, y: 600 - 5000 - 20 }, "큰 내용: 오른쪽·아래 한계(바닥에서 멈춤)");
eq(clampMasterPan({ x: -300, y: -300 }, 1, 800, 600, big), { x: -300, y: -300 }, "범위 안은 그대로");

// 월계수 가지: 잎이 SVG 영역(viewBox)에 잘리지 않고, 양쪽이 서로 거울상이다.
const { laurelBranch, laurelExtent } = await import("../src/lib/laurel.js");
for (const side of [1, -1]) {
  const b = laurelBranch({ side, len: 36, leaves: 7, leaf: 7.5 }), e = laurelExtent(b);
  if (e.minX < 0 || e.minY < 0 || e.maxX > b.width || e.maxY > b.height) fails.push("월계수 가지(side " + side + ")의 잎이 viewBox 밖으로 나가 잘림: " + JSON.stringify(e) + " / " + b.width + "×" + b.height);
}
{
  const a = laurelBranch({ side: 1 }), m = laurelBranch({ side: -1 });
  eq(a.leaves.length, m.leaves.length, "좌우 가지 잎 수");
  a.leaves.forEach((l, i) => { const r = m.leaves[i]; if (Math.abs(l.x + r.x - a.width) > 1e-6 || Math.abs(l.y - r.y) > 1e-6) fails.push("좌우 가지가 거울상이 아님(잎 " + i + ")"); });
}

// ④ 연결
const dex = readFileSync("src/app/dex.jsx", "utf8"), mast = readFileSync("src/app/dexMasters.jsx", "utf8");
if (!/\["masters", t\("마스터"\)\]/.test(dex) || !/<MastersSchematic /.test(dex)) fails.push("도감에 마스터 탭·MastersSchematic 연결이 없음");
if (!/useFitPanelHeight\(boxRef, vertical\)/.test(dex) || !/useFitPanelHeight\(boxRef, vertical\)/.test(mast)) fails.push("오프닝·마스터 모식도가 같은 높이 계산(useFitPanelHeight)을 쓰지 않음");
const { SCHEMATIC_DRAG_MULT } = await import("../src/lib/schematicGeometry.js");
eq(SCHEMATIC_DRAG_MULT, 1, "드래그 감도 기준값");
if (!/SCHEMATIC_DRAG_MULT/.test(mast) || /const SCHEMATIC_DRAG_MULT\s*=/.test(dex) || !/SCHEMATIC_DRAG_MULT, DEX_SELECT_FLOW_SPEED/.test(dex)) fails.push("오프닝·마스터 모식도가 같은 드래그 감도(SCHEMATIC_DRAG_MULT)를 공유하지 않음");
if (!/<Laurel side=\{1\} \/>[\s\S]*<Laurel side=\{-1\} \/>/.test(mast) || !/overflow: "visible"/.test(mast)) fails.push("챔피언 블록 월계수: 왼쪽 side=1·오른쪽 side=-1(잎 끝이 안쪽) 또는 overflow visible 누락");
if (/ChevronsUp|ChevronsDown/.test(mast)) fails.push("마스터 모식도 좌상단 이동 버튼이 다시 생김");
if (!/inlineTabs/.test(dex)) fails.push("데스크톱 탭 알약이 검색 줄에 합쳐지지 않음(모식도 높이 확보)");
if (fails.length) { console.error("✖ check-masters 실패:\n  " + fails.join("\n  ")); process.exit(1); }
console.log("✔ check-masters: 챔피언 " + CHAMPIONS.length + "명·타이틀 이동 " + TRANSFERS.length + "건·위성 " + L.nodes.filter((n) => n.kind === "sat").length + "명 데이터 정합, 노드 겹침 0, 시간순 배치, 팬 한계, 도감 연결이 유지된다");
