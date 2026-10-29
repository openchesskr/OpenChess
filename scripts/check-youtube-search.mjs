#!/usr/bin/env node
/** (v0.7.1) 집중 분석 해설 화면 "영상" 블록 검사.
 *   · 서버(api/_lib/youtube.js): 수순 검증(불법·과대·이상한 글자 거절), PGN 검색어 모양, 응답 정리(영상 id·썸네일 주소 확인, 최대 개수)
 *   · 클라이언트와 서버의 최대 수순 길이가 같다
 *   · 해설 페이지에 댓글 블록과 영상 블록이 함께 있고, 영상 블록은 사이트 안에 동영상을 끼워 넣지 않는다(iframe 없음)
 *  npm run build 전에 prebuild로 자동 실행된다. 실행: node scripts/check-youtube-search.mjs
 */
import { readFileSync } from "node:fs";
import { parseMovesParam, pgnQuery, cleanResults, YT_MAX_PLIES, YT_MAX_RESULTS } from "../api/_lib/youtube.js";
import { YT_MAX_PLIES as CLIENT_MAX } from "../src/lib/youtubeSearch.js";

const fails = [];
const ok = (label, cond) => { if (!cond) fails.push(label); };
const eq = (label, got, want) => ok(label + ": " + JSON.stringify(got) + " ≠ " + JSON.stringify(want), JSON.stringify(got) === JSON.stringify(want));

eq("수순 읽기", parseMovesParam("e4,e5,Nf3"), ["e4", "e5", "Nf3"]);
eq("체크 기호 표준화", parseMovesParam("e4,e5,Qh5,Nc6,Bc4,Nf6,Qxf7"), ["e4", "e5", "Qh5", "Nc6", "Bc4", "Nf6", "Qxf7#"]);
for (const [label, v] of [["불법 수순", "e4,e4"], ["빈 값", ""], ["글자 아님", 5], ["배열", ["e4"]], ["검색어 끼워 넣기", "e4,buy cheap"], ["공백", "e4 e5"], ["너무 김", Array(YT_MAX_PLIES + 1).fill("Nf3").join(",")], ["스크립트", "<script>"]]) ok(label + " → null", parseMovesParam(v) === null);
eq("PGN 검색어", pgnQuery(["e4", "e5", "Nf3", "Nc6", "Bb5"]), "1. e4 e5 2. Nf3 Nc6 3. Bb5");
eq("홀수 수", pgnQuery(["d4"]), "1. d4");
const many = Array.from({ length: 12 }, (_, i) => ({ id: { videoId: ("abcdefghij" + i).slice(-11).padStart(11, "x") }, snippet: { title: "T &amp; &#39;" + i, channelTitle: "C", publishedAt: "2024-05-06T01:02:03Z", thumbnails: { medium: { url: "https://i.ytimg.com/vi/x/mq.jpg" } } } }));
const r = cleanResults({ items: [{ id: { videoId: "bad id!" }, snippet: {} }, { id: { videoId: "dQw4w9WgXcQ" }, snippet: { title: "x", thumbnails: { medium: { url: "javascript:alert(1)" } } } }, ...many] });
ok("최대 " + YT_MAX_RESULTS + "개", r.length === YT_MAX_RESULTS);
ok("이상한 id 제외", r.every((v) => /^[A-Za-z0-9_-]{11}$/.test(v.id)));
ok("위험한 썸네일은 ytimg 기본 주소로", r[0].id === "dQw4w9WgXcQ" && r[0].thumb === "https://i.ytimg.com/vi/dQw4w9WgXcQ/mqdefault.jpg");
ok("제목 엔티티 풀기", r[1].title === "T & '0" && r[1].publishedAt === "2024-05-06");
eq("빈 응답", cleanResults(null), []);
ok("클라이언트·서버 최대 수순 길이 같음", CLIENT_MAX === YT_MAX_PLIES);

const learn = readFileSync(new URL("../src/app/learn.jsx", import.meta.url), "utf8");
const block = readFileSync(new URL("../src/components/youtubeVideos.jsx", import.meta.url), "utf8");
ok("해설 페이지에 댓글 블록 + 영상 블록", /<MoveExplainBlock [^>]*\/>\s*<YoutubeVideosBlock sans=\{focusVideoSans\} \/>/.test(learn));
ok("댓글 블록 제목이 \"댓글\"", learn.includes('{t("댓글")}</span>'));
ok("영상 블록에 iframe 없음(CSP frame 제한 유지)", !/<iframe/i.test(block));
ok("영상 링크는 새 창·noopener", /target="_blank" rel="noopener noreferrer"/.test(block));

if (fails.length) { console.error("✗ YouTube 영상 블록 검사 실패:"); fails.forEach((x) => console.error("  · " + x)); process.exit(1); }
console.log("✓ youtube search check: 수순 검증·PGN 검색어·응답 정리, 해설 페이지의 댓글+영상 블록 연결");
