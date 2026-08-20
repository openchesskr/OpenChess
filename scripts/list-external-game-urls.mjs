#!/usr/bin/env node
/**
 * list-external-game-urls.mjs — fetch-external-games.mjs가 필요로 하는 source-urls.json(다운로드
 * URL 목록)을 그 사이트의 색인 페이지를 긁어 자동으로 만든다. 이 파일은 저장소에 없다 — 그
 * 사이트 자체가 이 샌드박스에서 접속이 막혀 있어(fetch-external-games.mjs 헤더 참고) 개발자가
 * 로컬 PC에서 이 스크립트부터 실행해야 한다.
 *
 * 사용법:
 *   node scripts/list-external-game-urls.mjs [출력.json]
 *
 * 옵션(환경변수):
 *   SOURCE_BASE_URL=""    색인 페이지·다운로드 링크의 기준이 되는 사이트 주소(필수)
 *   SOURCE_COOKIE=""      색인 페이지 접근에 로그인 세션이 필요하면 지정
 *                         (fetch-external-games.mjs와 동일한 값 재사용 가능)
 *   SOURCE_PAGES=""       색인 페이지 경로를 쉼표로 직접 지정(추측이 틀렸을 때 덮어쓰기용).
 *                         예: SOURCE_PAGES="files.html"
 *
 * (주의) 이 샌드박스는 그 사이트 접속이 막혀 있어 실제 색인 페이지 경로를 코드 작성 시점에
 * 직접 확인하지 못했다 — 아래 기본 경로는 추측이라 404가 날 수 있다. 그런 경우 404 난 페이지는
 * 건너뛰고 계속 진행하며, SOURCE_PAGES로 실제 경로를 알려주면 된다.
 */
const outPath = process.argv[2] || "source-urls.json";
const COOKIE = process.env.SOURCE_COOKIE || "";
const BASE = process.env.SOURCE_BASE_URL || "";
if (!BASE) {
  console.error("SOURCE_BASE_URL 환경변수로 대상 사이트 주소를 지정하세요. 예:\n" +
    '  $env:SOURCE_BASE_URL="https://example.com/"; node scripts/list-external-game-urls.mjs');
  process.exit(1);
}
const INDEX_PAGES = process.env.SOURCE_PAGES
  ? process.env.SOURCE_PAGES.split(",").map((s) => s.trim()).filter(Boolean)
  : ["files.html", "players.html", "events.html", "openings.html", "index.html"];

async function fetchText(path) {
  const headers = COOKIE ? { Cookie: COOKIE } : {};
  const res = await fetch(BASE + path, { headers });
  if (!res.ok) { console.warn(`  건너뜀: HTTP ${res.status} (${path})`); return null; }
  return res.text();
}

// href="players/Carlsen.zip" 같은 상대 경로를 그대로 쓰고, 이미 절대 URL이면 유지한다.
function extractLinks(html) {
  const out = [];
  const re = /href\s*=\s*"([^"]+\.(?:zip|pgn))"/gi;
  let m;
  while ((m = re.exec(html))) out.push(m[1]);
  return out;
}

const urls = new Set();
for (const page of INDEX_PAGES) {
  console.log(`색인 페이지 조회: ${page}`);
  let html;
  try { html = await fetchText(page); } catch (e) { console.warn(`  건너뜀: ${e.message}`); continue; }
  if (html == null) continue;
  const links = extractLinks(html);
  for (const link of links) {
    const abs = /^https?:\/\//i.test(link) ? link : BASE + link.replace(/^\//, "");
    urls.add(abs);
  }
  console.log(`  → 링크 ${links.length}개 발견 (누적 유니크 ${urls.size}개)`);
}

if (urls.size === 0) {
  console.error(
    "링크를 하나도 못 찾음 — 기본 색인 페이지 경로(files.html/players.html/events.html/openings.html/index.html)가 " +
    "전부 404였을 가능성이 큼. 브라우저로 그 사이트를 열어 실제 목록 페이지 경로를 확인한 뒤, " +
    "SOURCE_PAGES 환경변수로 지정해서 다시 실행하세요. 예:\n" +
    '  $env:SOURCE_PAGES="실제경로.html"; node scripts/list-external-game-urls.mjs source-urls.json'
  );
  process.exit(1);
}

const { writeFileSync } = await import("node:fs");
writeFileSync(outPath, JSON.stringify([...urls], null, 2));
console.log(`완료: ${urls.size}개 URL → ${outPath}`);
