#!/usr/bin/env node
/**
 * build-master-games.mjs — fetch-external-games.mjs가 만든 거대한 NDJSON(수백만 게임)을
 * 스트리밍으로 읽어, src/data/openings.json 에 이미 있는 오프닝 포지션(수순 접두사)에
 * 맞춰 대표 게임 몇 개만 골라 작은 인덱스로 압축한다. src/App.jsx의 "마스터 대국"
 * 목록(fetchAllMasterGames)에 Lichess 마스터 DB·개발자 추가분과 함께 구분 없이
 * 합쳐질 세 번째 소스로 쓰인다.
 *
 * 원본을 통째로 쓰지 않는 이유: 480만 게임 전체를 포지션별로 나누면(임의의 수순 접두사
 * 기준) 사실상 거의 모든 접두사가 유일해서(전술집·이벤트 게임 등은 "이론"과 무관하게
 * 갈라짐) 축소가 안 되고 오히려 커진다. 대신 refresh-data.mjs가 이미 만들어 둔, 실제로
 * 자주 채택돼 이름이 붙은 오프닝 트리의 노드(4천여 개)에만 게임을 매칭시킨다.
 *
 * 출력 형식(정규화): { games: [{white,black,whiteElo,blackElo,event,date,result,eco,moves}],
 * index: { "e4 e5": [게임 인덱스, ...] } }. 인덱스 배열에 게임 전체를 복사하지 않고
 * games 배열의 인덱스만 담는 이유 — 같은 고레이팅 게임(예: 유명 GM 대국)이 자기 자신의
 * 수순을 따라가는 여러 포지션(노드)에서 동시에 매칭될 수 있어, 복사해 넣으면(특히 moves
 * 필드까지 포함하면) 같은 큰 문자열이 수십 번 중복 저장돼 용량이 크게 부풀었다.
 *
 * (v0.3.1 변경) 예전엔 포지션당 대표 게임을 TOP_K개(기본 5, 이후 20)로만 잘라 저장했는데,
 * Lichess 마스터 DB가 얕은 오프닝 수순 밖에서는 게임을 거의 안 내려주는 탓에 깊은
 * 포지션(오프닝 트리 노드의 92%)에서는 이 정적 데이터가 사실상 유일한 소스가 되고, 그
 * 결과 실제 매칭 대국 수와 무관하게 화면엔 항상 그 상한만큼만 표시됐다.
 *
 * 처음엔 상한을 아예 없애 봤는데(MAX_PER_NODE=0), 실제 외부 대국 데이터베이스 전체(480만
 * 게임)로 돌려보니 "e4"·"d4"처럼 아주 얕은 노드가 유효 게임의 대부분(수백만 건)을 그대로
 * 흡수해 버려 `games` 배열이 감당 안 되는 크기로 불어났고, 결국 `JSON.stringify`가
 * `RangeError: Invalid string length`(V8 문자열 최대 길이 초과)로 터졌다 — "노드 수 ×
 * 노드당 개수"로 크기를 제한한다는 이 스크립트의 원래 설계 전제 자체가 무제한에서는
 * 깨진다. 그다음엔 깊이(ply)가 깊을수록 상한을 크게 주는 3단계(50/300/3000)를 시도했는데,
 * 이건 방향이 거꾸로였다 — 얕은 포지션("e4" 등)일수록 애초에 후보가 훨씬 많아 다양한
 * 갈래를 보여줄 가치가 크고, 깊은(=드문) 포지션은 매칭 게임 수 자체가 자연히 적어 작은
 * 상한으로도 사실상 전부 담긴다. 그래서 방향을 뒤집었다 — 얕을수록 상한을 크게, 깊을수록
 * 작게. 상한은 여전히 유한값(무제한 아님)이라 RangeError 위험은 없다 — 크래시는 "상한이
 * 아예 없을 때"만 났던 것이고, 상한이 있으면 그 값이 몇이든 그 이상으로는 절대 안 커진다.
 *
 * 사용법:
 *   node scripts/build-master-games.mjs external-games.ndjson [출력.json]
 *
 * 옵션(환경변수) — 포지션(오프닝 트리 노드)당 저장할 게임 수 상한, 레이팅 합 기준 상위 N개만 남김:
 *   CAP_SHALLOW=500    수순 길이(ply) 4 이하(예: "e4", "e4 e5", "d4 d5 c4") — 후보가 가장 많은 구간
 *   CAP_MID=150        ply 5~8
 *   CAP_DEEP=50        ply 9 이상 — 이 정도 깊이는 매칭 게임 수 자체가 자연히 적음
 */
import { createReadStream, writeFileSync, readFileSync } from "node:fs";
import { createInterface } from "node:readline";

const inPath = process.argv[2];
const outPath = process.argv[3] || "master-games.json";
if (!inPath) {
  console.error("사용법: node scripts/build-master-games.mjs <입력.ndjson> [출력.json]");
  process.exit(1);
}

const CAP_SHALLOW = +(process.env.CAP_SHALLOW || 500);
const CAP_MID = +(process.env.CAP_MID || 150);
const CAP_DEEP = +(process.env.CAP_DEEP || 50);
function capForPly(ply) {
  if (ply <= 4) return CAP_SHALLOW;
  if (ply <= 8) return CAP_MID;
  return CAP_DEEP;
}

const openings = JSON.parse(readFileSync("src/data/openings.json", "utf8"));
const knownKeys = new Set(Object.keys(openings.tree).filter(Boolean)); // ""(시작 포지션)는 제외
console.log(`오프닝 트리 노드 ${knownKeys.size}개 로드 (src/data/openings.json)`);

// 동일 게임이 선수 폴더·이벤트 폴더 양쪽에 겹쳐 들어오는 경우가 있어(예: 카를센 대국이
// Carlsen.zip과 WijkaanZee 이벤트 파일에 둘 다 존재) 지문 해시로 걸러낸다.
function fnv1a(str) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}

const seen = new Set();       // 중복 게임 지문
const games = [];             // 유니크 게임 원본(전체, moves 포함) — 인덱스가 곧 id
const buckets = new Map();    // key -> [{gi, rating}, ...], 상위 capForPly(ply)개(레이팅순)로 유지
let total = 0, kept = 0, dup = 0;

function insert(key, gi, rating, cap) {
  let bucket = buckets.get(key);
  if (!bucket) { bucket = []; buckets.set(key, bucket); }
  bucket.push({ gi, rating });
  bucket.sort((a, b) => b.rating - a.rating);
  if (bucket.length > cap) bucket.length = cap;
}

const rl = createInterface({ input: createReadStream(inPath, "utf8"), crlfDelay: Infinity });

let skippedRating = 0;

rl.on("line", (line) => {
  if (!line) return;
  total++;
  let g;
  try { g = JSON.parse(line); } catch { return; }
  if (!g.moves) return;
  const moves = g.moves.split(" ");
  if (!moves.length) return;

  // (데이터 품질) 실사용 표본에서 확인된 문제: 사람 대국인데 헤더가 깨져 BlackElo가 204269 같은
  // 말도 안 되는 값으로 들어오거나(Events 폴더 일부 파일), TCEC 등 컴퓨터 엔진끼리의 대국이
  // Elo 3900대로 섞여 들어온다. 실제 인간 최고 레이팅은 2900을 넘지 않으므로, 둘 중 하나라도
  // 이 상한을 넘으면(엔진 대국이거나 헤더 손상) "마스터 대국"에서 아예 제외한다 — 그대로
  // 두면 레이팅 합산 정렬에서 항상 1위를 차지해 진짜 GM 대국들을 밀어낸다.
  const MAX_PLAUSIBLE_ELO = 2900;
  if ((g.whiteElo && g.whiteElo > MAX_PLAUSIBLE_ELO) || (g.blackElo && g.blackElo > MAX_PLAUSIBLE_ELO)) {
    skippedRating++;
    return;
  }

  const fp = fnv1a(`${g.white}|${g.black}|${g.date}|${g.result}|${moves.slice(0, 20).join(" ")}`);
  if (seen.has(fp)) { dup++; return; }
  seen.add(fp);
  kept++;

  const rating = (g.whiteElo || 0) + (g.blackElo || 0);
  let gi = -1; // 이 게임이 실제로 어느 노드든 top-K에 들 때만 games 배열에 등록(아래에서 지연 등록)

  const maxLen = Math.min(moves.length, openings.maxPly || 20);
  for (let ply = 1; ply <= maxLen; ply++) {
    const key = moves.slice(0, ply).join(" ");
    if (!knownKeys.has(key)) continue;
    const cap = capForPly(ply);
    const bucket = buckets.get(key);
    // 이미 그 노드의 상한만큼 채워져 있고 이 게임 레이팅이 최하위보다도 낮으면 games 배열
    // 등록조차 필요 없다(스캔 대상 노드가 매우 많아 이 체크가 성능에 크게 기여한다).
    if (bucket && bucket.length >= cap && rating <= bucket[bucket.length - 1].rating) continue;
    if (gi === -1) {
      gi = games.length;
      games.push({ white: g.white, black: g.black, whiteElo: g.whiteElo, blackElo: g.blackElo, event: g.event, date: g.date, result: g.result, eco: g.eco, moves: g.moves });
    }
    insert(key, gi, rating, cap);
  }

  if (total % 300000 === 0) {
    console.log(`처리 ${total}건 (유효 ${kept}, 중복 ${dup}, 매칭된 포지션 ${buckets.size}개, 후보 게임 ${games.length}개)`);
  }
});

rl.on("close", () => {
  // 상한에 밀려나 어떤 버킷에도 안 남은 게임이 있을 수 있어(뒤에 더 레이팅 높은 게임이 그
  // 자리를 밀어낸 경우), 실제로 참조되는 게임만 남기고 인덱스를 재배치한다.
  const used = new Set();
  for (const bucket of buckets.values()) for (const { gi } of bucket) used.add(gi);
  const remap = new Map();
  const finalGames = [];
  for (const gi of used) { remap.set(gi, finalGames.length); finalGames.push(games[gi]); }

  const index = {};
  for (const [key, bucket] of buckets) {
    index[key] = bucket.map(({ gi }) => remap.get(gi));
  }

  writeFileSync(outPath, JSON.stringify({ games: finalGames, index }));
  console.log(
    `완료: 전체 ${total}건 중 유효 ${kept}건(중복 ${dup}건, 레이팅 이상치 ${skippedRating}건 제외), ` +
    `오프닝 트리 노드 ${buckets.size}개(전체 ${knownKeys.size}개 중)에 매칭, ` +
    `유니크 게임 ${finalGames.length}개 → ${outPath}`
  );
});
