#!/usr/bin/env node
/** (v0.7.6, 사용자 요청) 소셜 탭(예전 퍼즐 탭) — 인스타그램 피드형 레이아웃 + 유산 게시물.
 *  · mixFeed: 퍼즐 2개마다 유산 1개, 한쪽이 바닥나면 나머지 이어 붙이기, 종류 토글(전체·퍼즐·유산), 순서 유지·중복 키 없음
 *  · 탭 이름 "소셜", 주소 /social(예전 /puzzle도 열림, 퍼즐 고유 주소 /puzzle/번호-라인은 그대로), 서버 유산 피드 RPC 공개 권한
 *  · 퍼즐 탭이 격자(PuzzleCard grid) 대신 SocialFeed 한 줄 피드를 쓰는지
 *  실행: node scripts/check-social-feed.mjs (prebuild로 자동 실행) */
import fs from "node:fs";
import { mixFeed, FEED_KINDS, PUZZLES_PER_LEGACY } from "../src/lib/socialMix.js";
const fails = []; const ok = (c, m) => { if (!c) fails.push(m); };
const P = Array.from({ length: 5 }, (_, i) => ({ id: "pz" + i })), L = Array.from({ length: 4 }, (_, i) => ({ owner: "u" + (i % 2), id: "p" + i }));
const all = mixFeed(P, L);
ok(all.map((x) => x.type[0]).join("") === "pplpplpll", "섞는 순서: 퍼즐 " + PUZZLES_PER_LEGACY + "개마다 유산 1개, 남은 쪽 이어 붙이기 (" + all.map((x) => x.type[0]).join("") + ")");
ok(all.length === 9 && new Set(all.map((x) => x.key)).size === 9, "모든 게시물이 한 번씩, 키 중복 없음");
ok(mixFeed(P, L, "puzzle").every((x) => x.type === "puzzle") && mixFeed(P, L, "legacy").length === 4, "종류 토글(퍼즐만·유산만)");
ok(mixFeed([], L).length === 4 && mixFeed(P, []).length === 5 && mixFeed(null, null).length === 0, "한쪽이 비어도 동작");
ok(mixFeed(P, L, "legacy")[0].post.id === "p0" && mixFeed(P, L)[0].p.id === "pz0", "각 목록의 순서(퍼즐 정렬·유산 최신순)를 지킴");
ok(FEED_KINDS.join() === "all,puzzle,legacy", "종류 토글: 전체·퍼즐·유산");
// 경로
const rd = (f) => fs.readFileSync(new URL("../" + f, import.meta.url), "utf8");
const shell = rd("src/app/shell.jsx"), app = rd("src/App.jsx"), puz = rd("src/app/puzzle.jsx"), sql = rd("supabase-setup.sql");
ok(/\{ key: "puzzle", label: t\("소셜"\)/.test(shell), "탭 이름이 '소셜'이 아님");
ok(/puzzle: "\/social"/.test(shell) && /"\/social": "puzzle", "\/puzzle": "puzzle"/.test(shell), "주소 /social(예전 /puzzle도 소셜 탭)");
ok(/if \(\/\^\\\/puzzle\\\/\\d\{6\}-\\d\+\$\/\.test\(pathname/.test(shell), "퍼즐 풀이 고유 주소(/puzzle/번호-라인)는 그대로 소셜 탭으로 열려야 함");
ok(/<SocialFeed puzzles=\{feed\}/.test(puz) && !/gridTemplateColumns: "repeat\(auto-fill,minmax\(210px,1fr\)\)"/.test(puz), "퍼즐 탭이 격자 대신 인스타그램형 한 줄 피드(SocialFeed)를 써야 함");
ok(/<PuzzleTab onOpenLegacy=\{openLegacyPost\}/.test(app), "App이 소셜 피드에 유산 게시물 열기(openLegacyPost)를 넘기지 않음");
ok(/create or replace function public\.social_legacy_feed\(/.test(sql) && /'social_legacy_feed'/.test(sql), "서버 유산 피드(social_legacy_feed)가 없거나 공개 권한 목록에 없음");
ok(/deletion_scheduled_at is null/.test((sql.match(/function public\.social_legacy_feed[\s\S]*?\$\$;/) || [""])[0]), "유산 피드가 탈퇴 유예 계정을 빼지 않음");
if (fails.length) { console.error("✗ check-social-feed 실패:\n  " + fails.join("\n  ")); process.exit(1); }
console.log("✓ check-social-feed: 소셜 탭(/social) 피드 섞기·종류 토글·유산 피드 RPC 유지");
