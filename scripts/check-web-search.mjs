#!/usr/bin/env node
/** (v0.7.8, 사용자 요청) 집중 분석 해설 화면 "커뮤니티" 블록의 웹 검색 검사.
 *   · 서버(api/_lib/websearch.js): 오프닝 이름 검증(허용 글자·길이 밖이면 이름 없이 수순으로), 검색어에 늘 체스 맥락, 응답 정리(http(s) 주소만, 태그 제거, 최대 개수)
 *   · 서버 처리기(api/_lib/webSearchHandler.js, api/youtube.js?web=1로 연결 — BUG-178 함수 개수 제한): 키 없으면 503, 수순 검증, IP·전체 호출 한도, 안전 검색
 *   · 화면: 커뮤니티 블록이 웹 검색 + 영상을 함께 보이고, 둘 다 꺼져 있으면 숨으며, 링크는 새 창(noopener)
 *  실행: node scripts/check-web-search.mjs (prebuild) */
import { readFileSync } from "node:fs";
import { parseNameParam, webQuery, cleanWebResults, WEB_MAX_RESULTS, WEB_DAILY_CAP, isPublicHttpUrl, extractPreview, PREVIEW_TIMEOUT_MS, PREVIEW_MAX_BYTES } from "../api/_lib/websearch.js";
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
// (v0.7.8) Tavily 응답 모양 — 사이트 이름은 주소의 호스트, 요약은 content
{ const r = cleanWebResults({ results: [{ title: "Ruy Lopez - Wikipedia", url: "https://en.wikipedia.org/wiki/Ruy_Lopez", content: "The Ruy Lopez &amp; more" }, { title: "x", url: "javascript:alert(1)", content: "" }] });
  ok(r.length === 1 && r[0].site === "en.wikipedia.org" && r[0].snippet === "The Ruy Lopez & more", "Tavily 응답 정리"); }
ok(WEB_DAILY_CAP * 31 <= 1000, "하루 상한이 Tavily 무료 1,000회/월을 넘음");
ok(cleanWebResults(null).length === 0 && cleanWebResults({ web: {} }).length === 0, "빈 응답");
const api = rd("api/_lib/webSearchHandler.js"), yt = rd("api/youtube.js"), block = rd("src/components/communityBlock.jsx");

// (v0.7.9) 구글식 미리보기 — 결과 수, 공개 주소만 열기(SSRF), <head>에서 이미지·아이콘·사이트 이름·게시일
ok(WEB_MAX_RESULTS >= 10, "검색 결과가 10개 미만(사용자 요청으로 늘림)");
for (const bad of ["http://127.0.0.1/", "https://localhost/a", "https://10.0.0.1/", "http://[::1]/", "https://169.254.169.254/latest", "https://metadata.internal/", "https://printer.local/", "https://example.com:8443/", "https://u:p@example.com/", "https://2130706433/", "https://0x7f000001/", "file:///etc/passwd", "ftp://example.com/"]) ok(!isPublicHttpUrl(bad), "내부·이상한 주소를 열면 안 됨: " + bad);
for (const good of ["https://en.wikipedia.org/wiki/Ruy_Lopez", "http://chess.com/x", "https://www.chessable.com:443/blog/"]) ok(isPublicHttpUrl(good), "공개 주소는 열어야 함: " + good);
ok(cleanWebResults({ results: [{ title: "x", url: "http://127.0.0.1/a", content: "" }, { title: "y", url: "https://lichess.org/opening", content: "" }] }).map((r) => r.site).join() === "lichess.org", "내부 주소 결과는 버림");
{ const wiki = '<!DOCTYPE html><html><head><meta charset="UTF-8"><title>Ruy Lopez - Wikipedia</title><link rel="icon" href="/static/favicon/wikipedia.ico"><link rel="apple-touch-icon" href="/static/apple-touch/wikipedia.png"><meta property="og:image" content="https://upload.wikimedia.org/wikipedia/commons/a/ab/Ruy.png"><meta property="og:site_name" content="Wikipedia"></head><body>';
  const p = extractPreview(wiki, "https://en.wikipedia.org/wiki/Ruy_Lopez");
  ok(p.image === "https://upload.wikimedia.org/wikipedia/commons/a/ab/Ruy.png" && p.siteName === "Wikipedia" && p.icon === "https://en.wikipedia.org/static/apple-touch/wikipedia.png", "위키백과 머리 부분에서 이미지·사이트 이름·큰 아이콘: " + JSON.stringify(p));
  const wp = "<head><meta name='twitter:image' content='//cdn.blog.com/i.jpg'/><meta property='article:published_time' content='2024-03-05T10:00:00+00:00'/><link rel='shortcut icon' href='https://blog.com/fav.png' sizes='32x32'/></head>";
  const q = extractPreview(wp, "https://blog.com/ruy-lopez/");
  ok(q.image === "https://cdn.blog.com/i.jpg" && q.date === "2024-03-05" && q.icon === "https://blog.com/fav.png" && q.siteName === null, "워드프레스식(작은따옴표·프로토콜 생략 주소·게시일): " + JSON.stringify(q));
  const evil = extractPreview('<meta property="og:image" content="http://127.0.0.1/x.png"><meta property="og:image" content="javascript:alert(1)">', "https://evil.com/");
  ok(evil.image === null && evil.icon === "https://evil.com/favicon.ico", "내부·http·스크립트 이미지 주소는 버리고 아이콘은 /favicon.ico로: " + JSON.stringify(evil));
  ok(extractPreview("", "https://a.com/").image === null && extractPreview(null, "https://a.com/").icon === null, "빈 HTML"); }
ok(PREVIEW_TIMEOUT_MS <= 3000 && PREVIEW_MAX_BYTES <= 262144, "미리보기는 페이지당 3초·256KB 안쪽");
ok(/redirect: "manual"/.test(api) && /if \(!isPublicHttpUrl\(cur\)\) return null;/.test(api) && /hop < 4/.test(api), "리디렉트마다 공개 주소인지 다시 확인해야 함(최대 3번)");
ok(/withPreviews\(cleanWebResults\(/.test(api), "검색 결과에 미리보기를 붙이지 않음");
ok(/<WebResultCard key=\{r\.url\} r=\{r\} \/>/.test(block) && /referrerPolicy="no-referrer"/.test(block), "웹 검색 결과가 미리보기 카드로 그려지지 않음(이미지는 no-referrer)");
{ const an = rd("src/app/analysis.jsx"); const c = an.indexOf("<CommunityBlock sans={focusVideoSans}"), m = an.indexOf("<MoveExplainBlock moveKey={mkKey}");
  ok(c > 0 && m > 0 && c < m, "커뮤니티 블록이 댓글 블록보다 위에 있어야 함(v0.7.9 사용자 요청)"); }
ok(/process\.env\.TAVILY_API_KEY/.test(api) && /api\.tavily\.com\/search/.test(api) && /search_depth: "basic"/.test(api) && !/BRAVE/.test(api) && /res\.status\(503\)\.json\(\{ error: "not_configured" \}\)/.test(api), "키가 없으면 503(블록이 조용히 숨음)");
ok(/parseMovesParam\(\(req\.query \|\| \{\}\)\.moves\)/.test(api) && /parseNameParam\(/.test(api), "서버가 수순·이름을 검증하지 않음");
ok(/\["websearch:ip:" \+ clientIp\(req\), 20, 60\], \["websearch:global", WEB_DAILY_CAP, 86400\]/.test(api), "호출 한도가 없음");
ok(/if \(off\.web && off\.yt && !dev\) return null;/.test(block), "웹 검색·영상이 모두 꺼져 있으면 일반 사용자에게는 커뮤니티 블록을 숨겨야 함(개발자에게는 진단 표시, BUG-190)");
ok(/target="_blank" rel="noopener noreferrer nofollow"/.test(block) && !/<iframe/i.test(block), "웹 검색 링크는 새 창·noopener, 끼워 넣기 금지");
ok(/if \(\(req\.query \|\| \{\}\)\.web === "1"\) return webSearchHandler\(req, res\);/.test(yt) && yt.indexOf("webSearchHandler(req, res)") < yt.indexOf("process.env.YOUTUBE_API_KEY"), "api/youtube.js가 ?web=1을 YouTube 키 확인보다 먼저 웹 검색 처리기로 넘기지 않음");
ok(/apiUrl\("\/api\/youtube\?web=1&moves="/.test(rd("src/lib/webSearch.js")), "브라우저가 웹 검색을 /api/youtube?web=1로 부르지 않음");
if (fails.length) { console.error("✗ check-web-search 실패:\n  " + fails.join("\n  ")); process.exit(1); }
console.log("✓ check-web-search: 커뮤니티 블록 웹 검색 — 이름·수순 검증, 검색어, 응답 정리, 호출 한도, 화면 연결");
