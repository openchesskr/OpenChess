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
const { WINNERS, COUNTRY_KO } = await import("../src/data/chessTournamentWinners.js");
const { EVENT_RULES } = await import("./lib/tournamentEvents.mjs");
const { Chess } = await import("chess.js");
import { readFileSync as rf } from "node:fs";

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
// 대회 우승 기록·마스터 대국 DB 색인(src/data/tournamentIndex.json — scripts/build-tournament-index.mjs 산출)
{
  const idx = JSON.parse(rf("src/data/tournamentIndex.json", "utf8"));
  const ids = TOURNAMENTS.map((r) => r.id);
  for (const id of Object.keys(WINNERS)) if (!ids.includes(id)) fails.push("WINNERS에 없는 대회 id: " + id);
  for (const id of Object.keys(EVENT_RULES)) if (!ids.includes(id)) fails.push("EVENT_RULES에 없는 대회 id: " + id);
  for (const id of ids) {
    if (!EVENT_RULES[id]) fails.push(id + ": DB 이벤트 매칭 규칙(EVENT_RULES) 없음");
    if (!idx.byId[id]) { fails.push(id + ": tournamentIndex.json에 없음 — node scripts/build-tournament-index.mjs 다시 실행"); continue; }
    const r = TOURNAMENTS.find((x) => x.id === id), list = WINNERS[id] || [];
    list.forEach(([y, names], i) => {
      if (!Array.isArray(names) || !names.length) fails.push(id + " " + y + ": 우승자 이름 없음");
      if (y < r.from || y > (r.to ?? 2030)) fails.push(id + " " + y + ": 우승 연도가 대회 기간(" + r.from + "–" + (r.to ?? "") + ") 밖");
      if (i && y < list[i - 1][0]) fails.push(id + ": 우승 기록이 연도순이 아님(" + y + ")");
      if (r.type === "team") for (const n of names) if (!COUNTRY_KO[n]) fails.push(id + " " + y + ": 나라 이름 번역(COUNTRY_KO) 없음 — " + n);
      const ck = idx.byId[id].winnerCheck[y];
      if (ck === undefined) fails.push(id + " " + y + ": 색인에 대조 결과가 없음 — 우승 기록을 고친 뒤 node scripts/build-tournament-index.mjs를 다시 실행할 것");
      if (ck === "conflict") fails.push(id + " " + y + ": 우승자(" + names.join("/") + ")가 마스터 대국 DB의 그 연도 출전자 중에 없음(입력 오류 후보)");
    });
    // 대표 대국은 도감에서 바로 열리므로 전부 합법 수순이어야 한다.
    for (const g of idx.byId[id].top) { try { const c = new Chess(); for (const san of g.m.split(" ")) c.move(san); } catch { fails.push(id + ": 대표 대국 " + g.id + "의 기보가 합법이 아님"); } }
  }
}
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
const IDX = JSON.parse(rf("src/data/tournamentIndex.json", "utf8"));
const EDITIONS = {}; for (const [id, v] of Object.entries(IDX.byId)) EDITIONS[id] = v.editions.map((e) => e[0]);
const EDS = {}; for (const [id, v] of Object.entries(IDX.byId)) EDS[id] = v.editions;
const FIDE = JSON.parse(rf("src/data/fideRankings.json", "utf8")), DBM = JSON.parse(rf("src/data/dbMasters.json", "utf8"));
const L = layoutMasters(CHAMPIONS, TRANSFERS, SPLIT_ROWS, UPCOMING, TOURNAMENTS, EDS, null, FIDE, DBM.masters);
eq(L.nodes.filter((n) => n.kind === "champ").length, CHAMPIONS.length, "챔피언 노드 수");
eq(L.nodes.filter((n) => n.kind === "sat").length, CHAMPIONS.reduce((n, c) => n + satellitesOf(c).length, 0), "위성 노드 수");
for (let i = 0; i < L.nodes.length; i++) {
  const a = L.nodes[i];
  if (a.x < 0 || a.y < 0 || a.x + a.w > L.width || a.y + a.h > L.height) fails.push("노드가 캔버스 밖: " + a.id);
  for (let j = i + 1; j < L.nodes.length; j++) { const b = L.nodes[j]; if (a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h) fails.push("노드 겹침: " + a.id + " ↔ " + b.id); }
}
const yOf = (id) => L.byNodeId.get(id).y;
for (let i = 1; i < laneC.length; i++) if (yOf(laneC[i].id) <= yOf(laneC[i - 1].id)) fails.push("정통 계보가 위→아래 시간순이 아님: " + laneC[i - 1].id + " → " + laneC[i].id);
for (const e of L.edges) if ((!e.a || !e.b) && e.kind !== "wseg") fails.push("선의 끝 노드 없음: " + e.from + "→" + e.to);
for (const t of TRANSFERS) { const a = L.byNodeId.get(t.from), b = L.byNodeId.get(t.to); if (b.y + 1 < a.y) fails.push("타이틀 이동이 위로 거슬러 올라감: " + t.from + "→" + t.to); }
const lx = (id) => L.byNodeId.get(id).x;
if (!(lx("kasparov2") < lx("karpov2"))) fails.push("분열기: 왼쪽(PCA·클래식) 줄이 오른쪽(FIDE) 줄보다 오른쪽에 있음");

// 대회 열: 챔피언 줄 오른쪽에 연도순 위→아래(챔피언 블록보다 큰 블록), 각 허브 오른쪽으로 연도 블록이 한 줄로 이어지고, 연도 블록을 펼치면 그 아래에 그 연도 대진표 영역이 생기며 아래 대회가 밀려난다
{
  const tours = L.nodes.filter((n) => n.kind === "tour"), others = L.nodes.filter((n) => n.kind === "champ" || n.kind === "sat" || n.kind === "upcoming");
  eq(tours.length, TOURNAMENTS.length, "대회 허브 수");
  eq(L.nodes.filter((n) => n.kind === "player").length, 0, "접힌 상태에는 대진표 노드가 없음");
  const maxRight = Math.max(...others.map((n) => n.x + n.w));
  for (const n of tours) {
    if (n.w < MT.CH_W || n.h < MT.CH_H) fails.push("대회 허브가 챔피언 블록보다 작음: " + n.id);
    if (n.x < maxRight) fails.push("대회 허브가 챔피언 열을 침범: " + n.id);
  }
  for (let i = 1; i < tours.length; i++) if (tours[i].y < tours[i - 1].y + tours[i - 1].h) fails.push("대회 허브가 연도순 위→아래가 아니거나 겹침: " + tours[i].id);
  if (!L.rail || L.rail.x >= Math.min(...tours.map((n) => n.x))) fails.push("대회 열 세로선(rail)이 허브 왼쪽에 없음");
  for (const t of TOURNAMENTS) {
    const hub = L.byNodeId.get("tour:" + t.id), hy = hub.y + hub.h / 2;
    const eds = L.nodes.filter((n) => n.kind === "edition" && n.tourId === t.id).sort((a, b) => a.x - b.x);
    if (!eds.length) fails.push("연도 블록이 없음: " + t.id);
    if (!eds.some((e) => e.year === t.from)) fails.push("시작 연도 블록이 없음: " + t.id);
    for (let i = 0; i < eds.length; i++) {
      if (Math.abs(eds[i].y + eds[i].h / 2 - hy) > 1) fails.push("연도 블록이 허브와 같은 줄이 아님: " + t.id);
      if (eds[i].x < hub.x + hub.w) fails.push("연도 블록이 허브보다 왼쪽: " + t.id);
      if (i > 0 && eds[i].year <= eds[i - 1].year) fails.push("연도 블록이 연도순이 아니거나 중복: " + t.id);
    }
  }
  // 펼침: 연도 블록 아래에 대진표 영역 → 겹침 없음, 아래 대회가 그 높이만큼 밀림, 캔버스가 커짐
  for (const key of ["hastings:1895", "tata:2000", "candidates:2024"]) {
    const [tid, yr] = key.split(":");
    const E = layoutMasters(CHAMPIONS, TRANSFERS, SPLIT_ROWS, UPCOMING, TOURNAMENTS, EDS, key, FIDE, DBM.masters);
    const open = E.nodes.find((n) => n.kind === "edition" && n.open);
    if (!open || open.tourId !== tid || open.year !== +yr) { if (EDS[tid] && EDS[tid].some((e) => e[0] === +yr)) fails.push("펼친 연도 블록이 표시되지 않음: " + key); continue; }
    const pan = E.panels[0];
    eq(E.panels.length, 1, "펼침은 한 번에 하나: " + key);
    if (!(pan.y >= open.y + open.h)) fails.push("대진표 영역이 연도 블록 아래가 아님: " + key);
    const names = (EDS[tid].find((e) => e[0] === +yr) || [])[3] || [];
    eq(E.nodes.filter((n) => n.kind === "player").length, names.length, "대진표 노드 수: " + key);
    for (const n of E.nodes) if (pan.x < n.x + n.w && n.x < pan.x + pan.w && pan.y < n.y + n.h && n.y < pan.y + pan.h && n.kind !== "player") fails.push("대진표 영역이 노드와 겹침: " + key + " ↔ " + n.id);
    for (let i = 0; i < E.nodes.length; i++) for (let j = i + 1; j < E.nodes.length; j++) { const a = E.nodes[i], b = E.nodes[j]; if (a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h) fails.push("펼친 상태 노드 겹침: " + a.id + " ↔ " + b.id); }
    const later = TOURNAMENTS.slice().sort((a, b) => a.from - b.from).filter((t) => t.from > TOURNAMENTS.find((x) => x.id === tid).from);
    if (later.length && !(E.byNodeId.get("tour:" + later[0].id).y >= pan.y + pan.h - 1)) fails.push("아래 대회가 대진표 영역만큼 밀리지 않음: " + key);
  }
}

// 열 이름 라벨: 북(챔피언)·동(대회)·서(DB 선수)·남(FIDE 세 갈래) 6개, 노드와 겹치지 않고 캔버스 안
{
  eq(L.labels.map((l) => l.key).sort(), ["champs", "db", "fide-blitz", "fide-rapid", "fide-standard", "tours"], "열 이름 라벨");
  for (const l of L.labels) {
    if (l.x < 0 || l.y < 0 || l.x + l.w > L.width) fails.push("열 이름 라벨이 캔버스 밖: " + l.key);
    for (const n of L.nodes) if (l.x < n.x + n.w && n.x < l.x + l.w && l.y < n.y + n.h && n.y < l.y + l.h) fails.push("열 이름 라벨(" + l.key + ")이 노드와 겹침: " + n.id);
  }
}
// 중심 회로 칩(오프닝 트리와 같은 디자인): 동서남북 4갈래 — 북=역대 챔피언(최근이 칩 가까이), 동=주요 대회, 남=FIDE 세 갈래, 서=DB 마스터(알파벳순)
{
  const C = L.chip, byDir = Object.fromEntries(L.traces.map((t) => [t.dir, t]));
  eq(Object.keys(byDir).sort(), ["E", "N", "S", "W"], "회로선 4갈래");
  const end = (t) => t.pts[t.pts.length - 1], len = (t) => t.pts.reduce((m, q, i) => (i ? m + Math.abs(q[0] - t.pts[i - 1][0]) + Math.abs(q[1] - t.pts[i - 1][1]) : 0), 0);
  for (const t of L.traces) if (len(t) < 250) fails.push("첫 회로선이 너무 짧음(" + t.dir + " " + Math.round(len(t)) + "px)");
  // 북: 챔피언은 모두 칩 위, 최근 챔피언(마지막)이 칩 가장 가까이, 과거로 갈수록 위. 선은 가장 가까운 노드 아래 가운데에 닿는다.
  const champNodes = CHAMPIONS.map((c) => L.byNodeId.get(c.id));
  for (const n of [...champNodes, ...L.nodes.filter((n) => n.kind === "sat" || n.kind === "upcoming")]) if (!(n.y + n.h < C.cy - C.size / 2)) fails.push("챔피언 줄이 칩 위쪽이 아님: " + n.id);
  eq(end(byDir.N), [C.cx, L.lastChamp.y + L.lastChamp.h], "북쪽 선은 칩에서 가장 가까운 챔피언 노드 아래에 닿음");
  eq(L.lastChamp.id, UPCOMING ? "upcoming" : CHAMPIONS[CHAMPIONS.length - 1].id, "칩에 가장 가까운 노드");
  // 동: 일직선, 대회 열 가운데 = 칩 높이
  eq(byDir.E.pts.length, 2, "동쪽 선은 꺾임 없는 일직선");
  eq(end(byDir.E), [L.rail.x, C.cy], "동쪽 선은 칩과 같은 높이에서 대회 세로선에 닿음");
  if (Math.abs((L.rail.y1 + L.rail.y2) / 2 - C.cy) > 1) fails.push("대회 열의 가운데가 중심 회로 칩과 같은 높이가 아님");
  // 서: 칩 높이의 일직선이 모든 세로선을 지나고, DB 선수는 3개 열(앞 열이 칩에 가깝다)에 알파벳(성) 순으로 이어진다 — 열마다 같은 길이(짝수 줄)라 직선이 노드를 가로지르지 않는다
  const dbn = L.nodes.filter((n) => n.kind === "dbm").sort((a, b) => a.index - b.index);
  eq(dbn.length, DBM.masters.length, "서쪽 DB 마스터 노드 수");
  eq(DBM.masters.length >= 900, true, "DB 마스터는 900명");
  eq(byDir.W.pts.length, 2, "서쪽 선은 꺾임 없는 일직선");
  eq(end(byDir.W), [L.wrails[0].x, C.cy], "서쪽 선은 칩과 같은 높이에서 첫 세로선에 닿음");
  eq(L.wrails.length, 3, "DB 선수 열 수");
  for (let k = 0; k < L.wrails.length; k++) {
    const w = L.wrails[k], col = dbn.filter((n) => n.col === k);
    if (!(w.y1 < C.cy && C.cy < w.y2)) fails.push("칩 높이가 DB 열 안쪽이 아님: " + k);
    if (k && !(w.x < L.wrails[k - 1].x - 200)) fails.push("DB 열이 앞 열의 서쪽이 아님: " + k);
    for (const n of col) { if (!(n.x + n.w < w.x)) fails.push("DB 선수 노드가 세로선 오른쪽: " + n.id); if (n.y < C.cy && C.cy < n.y + n.h) fails.push("서쪽 직선이 DB 노드를 가로지름: " + n.id); }
    eq(Math.round((col[0].y + col[col.length - 1].y + col[0].h) / 2) , Math.round(C.cy), "DB 열 가운데가 칩 높이: " + k);
  }
  for (let i = 1; i < dbn.length; i++) { if (dbn[i].col === dbn[i - 1].col && !(dbn[i].y > dbn[i - 1].y)) fails.push("DB 선수가 위→아래가 아님"); if (DBM.masters[i][0] !== dbn[i].dbm.name) fails.push("DB 선수 순서 불일치"); if (dbn[i].col < dbn[i - 1].col) fails.push("DB 열 순서가 거꾸로"); }
  { const key = (nm) => { const i = nm.indexOf(","); const sur = (i < 0 ? nm : nm.slice(0, i)); return sur.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z ]/g, "").trim(); };
    for (let i = 1; i < DBM.masters.length; i++) if (key(DBM.masters[i][0]) < key(DBM.masters[i - 1][0])) fails.push("dbMasters.json이 성 기준 알파벳 순이 아님: " + DBM.masters[i - 1][0] + " → " + DBM.masters[i][0]);
    const elos = DBM.masters.map((m) => m[2]); if (!elos.every((e) => e >= 2500)) fails.push("DB 마스터 최고 엘로가 2500 미만인 선수가 있음"); }
  // 남: 칩 아래 선 → 분기점에서 세 갈래(스탠다드·래피드·블리츠, 불렛 없음) → 각 줄에 1위부터 100위까지
  eq(L.south.cols.map((c) => c.key), ["standard", "rapid", "blitz"], "남쪽 세 갈래(FIDE는 불렛 레이팅이 없다)");
  eq(end(byDir.S), [C.cx, L.south.jy], "남쪽 선은 분기점까지");
  eq([L.south.bus.x1 < C.cx, L.south.bus.x2 > C.cx], [true, true], "분기선이 칩 가운데를 가로지름");
  for (const col of L.south.cols) {
    const list = L.nodes.filter((n) => n.kind === "fide" && n.list === col.key).sort((a, b) => a.rank - b.rank);
    eq(list.map((n) => n.rank), Array.from({ length: 100 }, (_, i) => i + 1), "순위 1부터 100까지: " + col.key);
    eq(list.map((n) => n.fide.rating).every((v, i, a) => i === 0 || v <= a[i - 1]), true, "레이팅이 1위부터 내림차순: " + col.key);
    if (!(list[0].y > L.south.jy)) fails.push("FIDE 1위가 분기점 아래가 아님: " + col.key);
    eq(Math.round(list[0].x + list[0].w / 2), Math.round(col.cx), "첫 노드가 갈래 선 아래: " + col.key);
    for (let i = 1; i < list.length; i++) if (!(list[i].y >= list[i - 1].y + list[i - 1].h)) fails.push("FIDE 노드 겹침: " + col.key + " " + list[i].rank);
  }
  eq(FIDE.month, FIDE.month.match(/^[A-Z][a-z]+ \d{4}$/)?.[0], "FIDE 목록의 월 표기");
  // 이름 표기: DB 선수·FIDE 순위 선수 전원의 한국어 표기가 있다(이니셜뿐인 이름은 성만)
  { const KO = JSON.parse(rf("src/data/masterKo.json", "utf8")).names, miss = [];
    for (const m of DBM.masters) if (!KO[m[0]] || !/[가-힣]/.test(KO[m[0]][0])) miss.push(m[0]);
    const keyOf = (nm) => { const i = nm.indexOf(","); const a = (x) => x.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z ]/g, "").trim(); return a(i < 0 ? nm : nm.slice(0, i)) + "|" + a(i < 0 ? "" : nm.slice(i + 1)).slice(0, 1); };
    const have = new Set(Object.keys(KO).map(keyOf));
    for (const l of Object.values(FIDE.lists)) for (const r of l) if (!KO[r[2]] && !have.has(keyOf(r[2]))) miss.push(r[2]);
    if (miss.length) fails.push("한국어 표기가 없는 선수 " + miss.length + "명: " + miss.slice(0, 5).join(" · ")); }
  // 화면 연결: 회로 효과 클래스·칩·선택 경로
  const src = rf("src/app/dexMasters.jsx", "utf8");
  for (const needle of ["dex-chip-surge", "dex-surge-node", "dex-surge-line", "dex-current-line", "회로에 전류 흘리기", "SCHEMATIC_ELECTRIC", "DEX_ELECTRIC_FLOW_SPEED", "DEX_SELECT_FLOW_SPEED", "fideRankings.json", "dbMasters.json"]) if (!src.includes(needle)) fails.push("마스터 트리에 필요한 요소 없음: " + needle);
}

// 마스터 트리 배율: 예전 75%(0.5625)가 새 100%, 25%p 격자·핀치 스냅
{
  const G = await import("../src/lib/schematicGeometry.js");
  eq(G.MASTER_ZOOM_LABEL_BASE, G.SCHEMATIC_ZOOM_LABEL_BASE * 0.75, "마스터 100% = 예전 75%");
  eq(G.MASTER_ZOOM_LABEL_BASE, 0.5625, "마스터 100%의 실제 배율");
  eq([G.masterZoomLabel(0.5625), G.masterZoomLabel(G.MASTER_ZOOM_MIN), G.masterZoomLabel(G.MASTER_ZOOM_MAX)], ["100%", "25%", "200%"], "마스터 배율 라벨");
  eq([G.snapMasterZoom(0.01), G.snapMasterZoom(99), G.snapMasterZoom(0.58) === G.MASTER_ZOOM_LABEL_BASE], [G.MASTER_ZOOM_MIN, G.MASTER_ZOOM_MAX, true], "마스터 배율 스냅");
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
if (!/onOpenGame=\{onOpenGame\}/.test(readFileSync("src/App.jsx", "utf8")) || !/<MastersSchematic[^>]*onOpenGame=\{onOpenGame\}/.test(dex)) fails.push("대표 대국을 열 onOpenGame이 App → CollectionTab → MastersSchematic로 연결되지 않음");
if (/className="no-pan press" onClick=\{\(\) => onPick/.test(mast)) fails.push("노드가 no-pan이라 노드 위에서 끌기·핀치가 안 됨(오프닝 트리처럼 노드 위에서도 끌려야 함)");
if (!/pinchRef/.test(mast) || !/setPointerCapture/.test(mast)) fails.push("마스터 모식도에 두 손가락 핀치 확대·축소가 없음");
if (!/snapMasterZoom/.test(mast) || /snapSchematicZoom|SCHEMATIC_ZOOM_STEP/.test(mast)) fails.push("마스터 모식도가 마스터 전용 배율(MASTER_ZOOM_*)이 아니라 오프닝 배율을 씀");
if (/위에서 아래로 시간순/.test(mast) || /const hint\b/.test(mast)) fails.push("마스터 모식도 위쪽 안내 문구가 다시 생김(열 이름 라벨로 대체)");
if (!/역대 세계 챔피언/.test(mast) || !/주요 대회/.test(mast)) fails.push("열 이름 라벨 문구(역대 세계 챔피언·주요 대회) 없음");
if (!/inlineTabs/.test(dex)) fails.push("데스크톱 탭 알약이 검색 줄에 합쳐지지 않음(모식도 높이 확보)");
if (fails.length) { console.error("✖ check-masters 실패:\n  " + fails.join("\n  ")); process.exit(1); }
console.log("✔ check-masters: 챔피언 " + CHAMPIONS.length + "명·타이틀 이동 " + TRANSFERS.length + "건·위성 " + L.nodes.filter((n) => n.kind === "sat").length + "명 데이터 정합, 노드 겹침 0, 시간순 배치, 팬 한계, 도감 연결이 유지된다");
