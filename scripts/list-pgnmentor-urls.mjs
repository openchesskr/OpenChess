#!/usr/bin/env node
/**
 * list-pgnmentor-urls.mjs — fetch-pgnmentor.mjs가 필요로 하는 pgnmentor-urls.json(다운로드
 * URL 목록)을 pgnmentor.com의 색인 페이지(players.html/events.html/openings.html)를 긁어
 * 자동으로 만든다. 이 파일은 저장소에 없다 — pgnmentor.com 자체가 이 샌드박스에서 접속이
 * 막혀 있어(fetch-pgnmentor.mjs 헤더 참고) 개발자가 로컬 PC에서 이 스크립트부터 실행해야 한다.
 *
 * 사용법:
 *   node scripts/list-pgnmentor-urls.mjs [출력.json]
 *
 * 옵션(환경변수):
 *   PGNMENTOR_COOKIE=""   files.html 등 색인 페이지 접근에 로그인 세션이 필요하면 지정
 *                         (fetch-pgnmentor.mjs와 동일한 값 재사용 가능)
 */
const outPath = process.argv[2] || "pgnmentor-urls.json";
const COOKIE = process.env.PGNMENTOR_COOKIE || "";
const BASE = "https://www.pgnmentor.com/";
// 이 세 색인 페이지에 선수·이벤트·오프닝별 다운로드 링크(대부분 .zip, 일부 .pgn)가 나열돼 있다.
const INDEX_PAGES = ["players.html", "events.html", "openings.html"];

async function fetchText(path) {
  const headers = COOKIE ? { Cookie: COOKIE } : {};
  const res = await fetch(BASE + path, { headers });
  if (!res.ok) throw new Error(`HTTP ${res.status} (${path})`);
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
  const html = await fetchText(page);
  const links = extractLinks(html);
  for (const link of links) {
    const abs = /^https?:\/\//i.test(link) ? link : BASE + link.replace(/^\//, "");
    urls.add(abs);
  }
  console.log(`  → 링크 ${links.length}개 발견 (누적 유니크 ${urls.size}개)`);
}

if (urls.size === 0) {
  console.error("링크를 하나도 못 찾음 — pgnmentor.com이 색인 페이지 구조를 바꿨을 수 있음. HTML을 직접 확인해 보세요.");
  process.exit(1);
}

const { writeFileSync } = await import("node:fs");
writeFileSync(outPath, JSON.stringify([...urls], null, 2));
console.log(`완료: ${urls.size}개 URL → ${outPath}`);
