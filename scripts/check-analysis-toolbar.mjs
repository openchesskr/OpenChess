#!/usr/bin/env node
/** (v0.6.4) 분석 탭 보드 위 버튼 줄과 보드 편집 화면, 프로필 카드 헤더의 레이아웃 규칙.
 *  ① 버튼 줄 순서는 복사 → 편집(펜 아이콘 + "편집" 글자) → 리뷰, 오른쪽 정렬. 예전의 FEN/PGN 붙여넣기 버튼은 없다(보드 편집 화면의 "불러오기"로 통합).
 *  ② 보드 편집 화면이 FEN은 편집 보드로, PGN은 분석 탭 기보로 불러온다(loadImport → pushSnap / onLoadPgn).
 *  ③ 프로필 카드 헤더(@아이디 + 프로필 편집 + 통계 토글)는 좁은 화면에서 겹치지 않게 줄바꿈·말줄임 규칙을 지킨다(BUG-067). */
import { readFileSync } from "node:fs";
const rd = (p) => readFileSync(new URL("../" + p, import.meta.url), "utf8");
const fails = [];
const learn = rd("src/app/learn.jsx"), social = rd("src/app/social.jsx");
// ①
const iCopy = learn.indexOf("<NotationTools sans={sans}"), iEdit = learn.indexOf('title={t("보드 편집")} aria-label={t("보드 편집")}'), iRev = learn.indexOf("<BestMoveJumpButton title={t(\"기보 분석(리뷰)\")}");
if (!(iCopy > 0 && iEdit > iCopy && iRev > iEdit)) fails.push("분석 탭 버튼 순서가 복사 → 편집 → 리뷰가 아님");
if (!/<Pencil size=\{13\} \/>\{t\("편집"\)\}/.test(learn)) fails.push("편집 버튼이 펜 아이콘 + \"편집\" 글자가 아님");
if (/ClipboardPaste size=\{13\} \/><\/button>/.test(learn) || /title=\{t\("FEN\/PGN 붙여넣기"\)\}/.test(learn)) fails.push("분석 탭 상단에 붙여넣기 버튼이 남아 있음(보드 편집 화면으로 통합했음)");
if (/NotationTools sans=\{sans\}[^>]*onLoad/.test(learn)) fails.push("NotationTools가 다시 붙여넣기 기능(onLoadPgn/onLoadFen)을 받음");
// ②
const ed = learn.slice(learn.indexOf("function BoardEditorModal("));
if (!/const loadImport = /.test(ed) || !/pushSnap\(\{ board: p\.board, turn: p\.turn, rights: p\.rights, ep: p\.ep \|\| null \}\); setImportErr\(""\)/.test(ed) || !/onLoadPgn\(moves\)/.test(ed)) fails.push("보드 편집 화면에 FEN/PGN 불러오기(loadImport)가 없음");
if (!/onLoadPgn=\{\(moves\) => \{ onLoadPgn\(moves\); setEditorOpen\(false\); \}\}/.test(learn)) fails.push("편집 화면의 PGN 불러오기가 분석 탭 기보로 연결되지 않음");
// ③
const hdr = social.match(/flexWrap: "wrap", gap: "8px 10px" \}\}>[\s\S]{0,900}?flex: "1 1 150px", minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap"/g) || [];
if (hdr.length < 2) fails.push("프로필 카드 헤더 2곳(내 프로필·유저 검색 모달)이 줄바꿈·말줄임 규칙을 따르지 않음: " + hdr.length);
if (fails.length) { console.error("✖ check-analysis-toolbar 실패:\n  " + fails.join("\n  ")); process.exit(1); }
console.log("✔ check-analysis-toolbar: 복사·편집·리뷰 순서와 편집 화면 불러오기 통합, 프로필 헤더 줄바꿈 규칙이 유지된다");
