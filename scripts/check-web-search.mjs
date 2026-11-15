#!/usr/bin/env node
/** (v0.7.8, 사용자 요청) 집중 분석 해설 화면 "커뮤니티" 블록의 웹 검색 검사.
 *   · 서버(api/_lib/websearch.js): 오프닝 이름 검증(허용 글자·길이 밖이면 이름 없이 수순으로), 검색어에 늘 체스 맥락, 응답 정리(http(s) 주소만, 태그 제거, 최대 개수)
 *   · 서버 처리기(api/_lib/webSearchHandler.js, api/youtube.js?web=1로 연결 — BUG-178 함수 개수 제한): 키 없으면 503, 수순 검증, IP·전체 호출 한도, 안전 검색
 *   · 화면: 커뮤니티 블록이 웹 검색 + 영상을 함께 보이고, 둘 다 꺼져 있으면 숨으며, 링크는 새 창(noopener)
 *  실행: node scripts/check-web-search.mjs (prebuild) */
import { readFileSync } from "node:fs";
import { parseNameParam, webQuery, cleanWebResults, WEB_MAX_RESULTS } from "../api/_lib/websearch.js";
const fails = []; const ok = (c, m) => { if (!c) fails.push(m); };
const rd = (f) => readFileSync(new URL("../" + f, import.meta.url), "utf8");

ok(parseNameParam("Ruy Lopez: Open, Riga Variation") === "Ruy Lopez: Open, Riga Variation", "Lichess 오프닝 이름 그대로");
ok(parseNameParam("Queen's Gambit Declined") === "Queen's Gambit Declined", "아포스트로피 허용");
ok(parseNameParam("  Sicilian   Defense ") === "Sicilian Defense", "공백 정리");
for (const bad of ["<script>", "buy cheap pills now!!!", "a".repeat(81), "12", "", null, 5, "chess site:evil.com", "Sicilian inurl:x", "Sicilian -wikipedia", "x\ny"]) ok(parseNameParam(bad) === null, "이상한 이름·검색 연산자 거부: " + JSON.stringify(bad));
ok(webQuery(["e4", "e5"], "King's Pawn Game") === "\"King's Pawn Game\" chess opening", "이름이 있으면 이름으로 검색");
ok(webQuery(["e4", "e5", "Nf3"], null) === "1. e4 e5 2. Nf3 chess opening", "이름이 없으면 PGN 수순으로 검색");
{ const r = cleanWebResults({ web: { results: [
    { title: "<strong>Riga</strong> &amp; more", url: "https://en.wikipedia.org/wiki/Ruy_Lopez", description: "The <b>Open</b> variation", profile: { name: "Wikipedia" } },
    { title: "bad", url: "javascript:alert(1)" }, { title: "ftp", url: "ftp://x.org/a" }, { title: "", url: "https://empty.org" }, { url: 5 },
    ...Array.from({ length: 10 }, (_, i) => ({ title: "T" + i, url: "https://www.site" + i + ".com/p", description: "d" })),
  ] } });
  ok(r.length === WEB_MAX_RESULTS, "최대 " + WEB_MAX_RESULTS + "개");
  ok(r[0].title === "Riga & more" && r[0].snippet === "The Open variation" && r[0].site === "Wikipedia", "태그 제거·엔티티 풀기·사이트 이름");
  ok(r.every((x) => /^https?:\/\//.test(x.url)), "http(s) 주소만");
  ok(r[1].site === "site0.com", "사이트 이름이 없으면 주소에서(www 제외)"); }
ok(cleanWebResults(null).length === 0 && cleanWebResults({ web: {} }).length === 0, "빈 응답");
const api = rd("api/_lib/webSearchHandler.js"), yt = rd("api/youtube.js"), block = rd("src/components/communityBlock.jsx");
ok(/process\.env\.BRAVE_SEARCH_API_KEY/.test(api) && /res\.status\(503\)\.json\(\{ error: "not_configured" \}\)/.test(api), "키가 없으면 503(블록이 조용히 숨음)");
ok(/parseMovesParam\(\(req\.query \|\| \{\}\)\.moves\)/.test(api) && /parseNameParam\(/.test(api), "서버가 수순·이름을 검증하지 않음");
ok(/\["websearch:ip:" \+ clientIp\(req\), 20, 60\], \["websearch:global", 400, 86400\]/.test(api) && /safesearch: "strict"/.test(api), "호출 한도·안전 검색이 없음");
ok(/if \(!sans \|\| !sans\.length \|\| sans\.length > YT_MAX_PLIES \|\| \(off\.web && off\.yt\)\) return null;/.test(block), "웹 검색·영상이 모두 꺼져 있으면 커뮤니티 블록을 숨겨야 함");
ok(/target="_blank" rel="noopener noreferrer nofollow"/.test(block) && !/<iframe/i.test(block), "웹 검색 링크는 새 창·noopener, 끼워 넣기 금지");
ok(/if \(\(req\.query \|\| \{\}\)\.web === "1"\) return webSearchHandler\(req, res\);/.test(yt) && yt.indexOf("webSearchHandler(req, res)") < yt.indexOf("process.env.YOUTUBE_API_KEY"), "api/youtube.js가 ?web=1을 YouTube 키 확인보다 먼저 웹 검색 처리기로 넘기지 않음");
ok(/apiUrl\("\/api\/youtube\?web=1&moves="/.test(rd("src/lib/webSearch.js")), "브라우저가 웹 검색을 /api/youtube?web=1로 부르지 않음");
if (fails.length) { console.error("✗ check-web-search 실패:\n  " + fails.join("\n  ")); process.exit(1); }
console.log("✓ check-web-search: 커뮤니티 블록 웹 검색 — 이름·수순 검증, 검색어, 응답 정리, 호출 한도, 화면 연결");
