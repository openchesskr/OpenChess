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
ok(FEED_KINDS.join() === "all,puzzle,legacy,game", "종류 토글: 전체·퍼즐·유산·대국");
{ // (v0.7.7) 대국 게시물은 유산 묶음에서 오지만 "유산"에서는 빠지고 "대국"에서만 보인다
  const G = [{ owner: "u", id: "g0", kind: "game", entry: { kind: "game" } }, { owner: "u", id: "l0", kind: "best", entry: { kind: "best" } }];
  ok(mixFeed([], G, "game").map((x) => x.post.id).join() === "g0" && mixFeed([], G, "legacy").map((x) => x.post.id).join() === "l0" && mixFeed([], G).length === 2, "대국 필터: 대국만 / 유산 필터: 대국 제외 / 전체: 모두");
}
// 경로
const rd = (f) => fs.readFileSync(new URL("../" + f, import.meta.url), "utf8");
const shell = rd("src/app/shell.jsx"), app = rd("src/App.jsx"), puz = rd("src/app/puzzle.jsx"), sql = rd("supabase-setup.sql");
ok(/\{ key: "puzzle", label: t\("소셜"\)/.test(shell), "탭 이름이 '소셜'이 아님");
ok(/puzzle: "\/social"/.test(shell) && /"\/social": "puzzle", "\/puzzle": "puzzle"/.test(shell), "주소 /social(예전 /puzzle도 소셜 탭)");
ok(/if \(\/\^\\\/puzzle\\\/\\d\{6\}-\\d\+\$\/\.test\(pathname/.test(shell), "퍼즐 풀이 고유 주소(/puzzle/번호-라인)는 그대로 소셜 탭으로 열려야 함");
ok(/<SocialFeed puzzles=\{feed\}/.test(puz) && !/gridTemplateColumns: "repeat\(auto-fill,minmax\(210px,1fr\)\)"/.test(puz), "퍼즐 탭이 격자 대신 인스타그램형 한 줄 피드(SocialFeed)를 써야 함");
ok(/openPost: \(link\) => openLegacyPost\(link\)/.test(app), "App이 유산 게시물 열기(openLegacyPost)를 LegacyActionsCtx.openPost로 내려 주지 않음");
ok(/create or replace function public\.social_legacy_feed\(/.test(sql) && /'social_legacy_feed'/.test(sql), "서버 유산 피드(social_legacy_feed)가 없거나 공개 권한 목록에 없음");
ok(/deletion_scheduled_at is null/.test((sql.match(/function public\.social_legacy_feed[\s\S]*?\$\$;/) || [""])[0]), "유산 피드가 탈퇴 유예 계정을 빼지 않음");
// (v0.7.6, 사용자 요청) 게시물 카드: 프로필 원에 색 고리 없음, 이름은 아이디, 숫자는 아이콘 바로 옆(따로 줄 없음), 유산도 리포스트
{ const sf = rd("src/app/socialFeed.jsx");
  ok(!/ring=|ring\b\s*\}/.test((sf.match(/function Avatar[\s\S]*?\n\}\n/) || [""])[0]) && !/<Avatar [^>]*ring=/.test(sf), "프로필 원에 색 고리(ring)가 다시 생김");
  ok(!/ownerInfo\.nickname/.test(sf), "유산 게시물 이름은 닉네임이 아니라 아이디(username)");
  ok(!/t\("좋아요 \{0\}개"/.test(sf) && /<Num n=\{likeCount\}/.test(sf) && /<Num n=\{repostCount\}/.test(sf) && /<Num n=\{shareCount\}/.test(sf), "좋아요·리포스트·공유 숫자는 아이콘 바로 옆(Num)에만");
  ok(/legacy_repost_toggle/.test(sf) && /A\.toggleRepost\(post\)/.test(sf), "유산 게시물 리포스트 버튼이 없음");
  ok(/export function ProfileSocial/.test(sf) && /sbRpc\("social_profile"/.test(sf), "/user 소셜 섹션(ProfileSocial)이 서버 social_profile을 쓰지 않음");
  const fn = (sql.match(/function public\.social_profile[\s\S]*?\$\$;/) || [""])[0];
  ok(/order by t desc/.test(fn) && /reposted_at as t/.test(fn) && /'social_profile'/.test(sql), "social_profile: 게시물 최신순·리포스트한 시각순, 공개 권한");
  ok(/z\.is_public or p_uid = auth\.uid\(\)/.test(fn), "social_profile: 비공개 퍼즐은 주인 본인에게만"); }
// (v0.7.7, 사용자 요청) 퍼즐·유산 게시물 형식 통일 — 같은 머리(PostHead: 프로필 사진·아이디·"종류 · 세부")와 같은 캡션, 같은 정사각 보드
{ const { readFileSync: rf } = await import("node:fs"); const sf = rf(new URL("../src/app/socialFeed.jsx", import.meta.url), "utf8");
  ok((sf.match(/head=\{<PostHead /g) || []).length === 2, "퍼즐·유산 게시물이 같은 머리(PostHead)를 쓰지 않음");
  ok(/const photo = usePhotoOf\(creator\)/.test(sf) && /<PostHead username=\{creator\} photo=\{photo\}/.test(sf), "퍼즐 게시물에 작성자 프로필 사진이 없음");
  ok(/const name = ownerInfo\.username \|\| DEFAULT_CREATOR/.test(sf) && !/ownerInfo\.nickname/.test(sf), "유산 게시물이 아이디 대신 닉네임을 씀");
  ok((sf.match(/<Caption name=/g) || []).length === 2, "퍼즐·유산 캡션 형식이 다름");
  ok(/<LegacyFrame \/>/.test(sf), "유산 미리보기의 남색 바탕·금색 액자가 사라짐(사용자 요청으로 유지)"); }
// (v0.7.8, 사용자 요청) 소셜 탭 개편 — 연속 출석 "n일", 검색창(번호로 풀기 통합)·필터를 머리줄로, 데스크톱 절반 분할, 게시물 날짜·키워드 박스, 퍼즐 테마별 배경, 티어 육각형
{ const fsR = rd;
  const pz = fsR("src/app/puzzle.jsx"), feed = fsR("src/app/socialFeed.jsx"), pc = fsR("src/app/postComposer.jsx"), bd = fsR("src/components/postBackdrops.jsx");
  ok(/\{t\("\{0\}일", n\)\}/.test(pc), "연속 출석 숫자 뒤에 \"일\"이 없음");
  const hdr = (pz.match(/const headerNode = \([\s\S]*?\n  \);/) || [""])[0];
  ok(/<StreakCount [^\n]*\n\s*<NewPostButton /.test(hdr) && !/searchBarNode/.test(hdr), "머리줄이 연속 출석(왼쪽)·새 게시물(오른쪽)이 아님");
  // (v0.8.0, 사용자 요청) 검색창·필터는 일일 퍼즐 캐러셀 아래(데스크톱·모바일 모두)
  ok(/\{storiesNode\}\s*\{searchRowNode\}/.test(pz) && /\{headerNode\}\{storiesNode\}\{searchRowNode\}/.test(pz) && /const searchRowNode = [^\n]*\{searchBarNode\}/.test(pz), "검색창·필터가 일일 퍼즐 캐러셀 바로 아래에 있지 않음");
  ok(pz.indexOf("const searchBarNode = (") > 0 && pz.indexOf("const searchBarNode = (") < pz.indexOf("const headerNode = ("), "headerNode가 searchBarNode보다 먼저 만들어짐(정의 전 참조)");
  ok(/aria-label=\{t\("오프닝\/생성자 검색 또는 퍼즐 번호\/일일 퍼즐 날짜 입력"\)\}/.test(pz)   /* (v0.8.0, BUG-204) 화면 안내(placeholder)는 짧게, 전체 설명은 aria-label */ && !/onChange=\{\(e\) => setNumInput\(e\.target\.value/.test(pz), "번호로 풀기 입력창이 검색창에 통합되지 않음");
  ok(/const numInput = useMemo\(\(\) => \{ const q = searchQuery\.trim\(\)/.test(pz) && /if \(e\.key === "Enter" && numInput\) solveByInput\(\)/.test(pz), "검색어가 번호·날짜면 번호로 풀기로 동작해야 함");
  ok(/gridTemplateColumns: "minmax\(0, 1fr\) minmax\(0, 1fr\)"[^}]*width: "calc\(100vw - 32px\)"/.test(pz), "데스크톱 소셜 탭이 뷰포트 절반으로 나뉘지 않음");
  ok(/date=\{createdAt === undefined \? "" : dateOrToday\(createdAt\)\} keywords=\{keywords\}/.test(feed) && /date=\{dateOrToday\(post\.savedAt\)\}/.test(feed) && /<KwBox key=/.test(feed), "게시물 좌하단 날짜(없으면 오늘, v0.7.9) + 키워드 박스가 없음");
  ok(!/>#\{labels\[k\] \|\| k\}</.test(feed), "퍼즐 테마를 # 대신 박스로 표기해야 함");
  ok(/const POST_BOARD_FRAC = 0\.9;/.test(feed) && /aspectRatio: PUZZLE_MEDIA_RATIO/.test(feed), "게시물 보드 크기(v0.7.9: 0.6 → 0.8, v0.8.0: 0.9)·세로로 긴 미디어 칸이 없음");
  // (v0.7.9, 사용자 요청) 퍼즐 테마별 효과 제거 — 배경·효과는 게시물 종류(퍼즐·유산·대국)별로 하나씩
  ok(!/PuzzleThemeBackdrop|puzzleBackdropTheme/.test(feed) && /<PuzzlePostBackdrop \/>/.test(feed) && /isGame \? <GamePostBackdrop \/> : <LegacyPostBackdrop /.test(feed)
    && ["PuzzlePostBackdrop", "LegacyPostBackdrop", "GamePostBackdrop"].every((f) => bd.includes("export function " + f + "(")) && /CONSTELLATIONS/.test(bd) && /function ElectricArc\(/.test(bd) && !/function Bracket\(/.test(bd) && !/FacetDiamond/.test(bd), "게시물 배경이 퍼즐·유산(별자리·전류, v0.8.0)·대국별로 나뉘지 않음(퍼즐 마름모·유산 코너 브래킷은 없앰)");
  ok(/creator = creator \|\| DEFAULT_CREATOR;/.test(feed) && /ownerInfo\.username \|\| DEFAULT_CREATOR/.test(feed) && /export const DEFAULT_CREATOR = "openchesskr";/.test(feed), "생성자 정보가 없는 게시물은 openchesskr로 보여야 함(v0.7.9)");
  ok(/<TierOctFrame tierKey=\{tier\.key\}/.test(pz) && /const octClip = /.test(pz) && /<TierBackdrop tierKey=\{tierKey\} on narrow=\{false\} compact \/>/.test(pz), "퍼즐 티어 박스가 팔각형 + 티어 여정 디자인(TierOctFrame·TierBackdrop)이 아님"); }
// (v0.7.8, 사용자 요청 2차) 게시물 ⋮ 메뉴(남: 신고·관심 없음 / 나: 삭제), 재생·풀기 버튼 제거, 오른쪽 영역(모바일 2페이지)·리더보드·친구 퍼즐 현황
{ const feed = rd("src/app/socialFeed.jsx"), pz = rd("src/app/puzzle.jsx"), side = rd("src/app/puzzleSide.jsx"), sql = rd("supabase-setup.sql");
  ok(/function PostMenu\(/.test(feed) && (feed.match(/menu=\{<PostMenu /g) || []).length === 2, "퍼즐·유산 게시물 모두 우상단 세로 점 메뉴(PostMenu)가 있어야 함");
  ok(/t\("신고하기"\)/.test(feed) && /t\("관심 없음"\)/.test(feed) && /t\("삭제"\)/.test(feed) && /<ReportSheet /.test(feed) && /userReport\(uid, null, reason/.test(feed), "메뉴: 남의 게시물은 신고·관심 없음, 내 게시물은 삭제");
  ok(!/t\("풀기"\)\}/.test(feed) && !/t\("재생"\)\}/.test(feed) && !/ctaBtn/.test(feed), "게시물에 재생·풀기 버튼이 남아 있음");
  ok(/filter\(\(it\) => !isHiddenPost\(it\.key\)/.test(feed) && /hidePost\(postKey\)/.test(feed), "관심 없음으로 숨긴 게시물을 피드에서 빼지 않음");
  ok(/<SwipePager pages=\{\[\s*\{ key: "feed"[\s\S]*\{ key: "side", node: <div style=\{\{ minWidth: 0 \}\}>\{sideNode\}/.test(pz), "모바일 오른쪽 영역이 옆으로 넘기는 2페이지가 아님");
  ok(/const sideNode = \(\s*<>\s*\{tierNode\}\s*<PuzzleSidePanels /.test(pz), "오른쪽 영역에 티어 박스 아래 리더보드·친구 현황이 없음");
  ok(/sbRpc\("leaderboard_top"/.test(side) && /sbRpc\("puzzle_rating_leaderboard"/.test(side) && /function FriendsPuzzle\(/.test(side), "퍼즐 XP·레이팅 리더보드·친구 퍼즐 현황이 없음");
  // (v0.8.0, 사용자 요청) 리더보드는 블록 하나에 종목별 좌우 넘김(일반 대국·미니게임 4종·퍼즐 XP·퍼즐 레이팅·칭호) + 전체/친구 토글, 이름은 "퍼즐 XP"처럼
  ok(/function Leaderboards\(/.test(side) && /scrollSnapType: "x mandatory"/.test(side) && ["chess", "coord", "knight", "attack", "rush", "xp", "rating", "titles"].every((k) => side.includes('{ key: "' + k + '"'))
    && /sbRpc\("minigame_leaderboard", \{[^}]*p_scope: scope/.test(side) && /\["friends", t\("친구"\)\]/.test(side) && !/리더보드"\)/.test(side.replace('t("리더보드")', "")), "리더보드가 한 블록 좌우 넘김 + 전체/친구 토글(종목명만 표기)이 아님");
  ok(/create or replace function public\.puzzle_rating_leaderboard\(/.test(sql) && /'puzzle_rating_leaderboard'/.test(sql), "퍼즐 레이팅 리더보드 RPC(또는 권한 목록)가 없음"); }
if (fails.length) { console.error("✗ check-social-feed 실패:\n  " + fails.join("\n  ")); process.exit(1); }
console.log("✓ check-social-feed: 소셜 탭(/social) 피드 섞기·종류 토글·유산 피드 RPC 유지");
