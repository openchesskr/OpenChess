#!/usr/bin/env node
/** (v0.7.5, 사용자 요청) 기보 용지(chess.com 기보 용지 등) 인식 보정 검사 — api/_lib/scoresheet.js
 *  손글씨 판독에서 흔한 오류(0-0, 소문자 기물, 잡기 표시 누락, 긴 표기, b↔6 같은 글자 혼동)를 체스 규칙으로 바로잡고,
 *  고칠 수 없는 칸에서는 지어내지 않고 멈추는지, PGN 머리 정보가 안전하게 만들어지는지 확인한다.
 *  실행: node scripts/check-scoresheet.mjs (prebuild) */
import { repairScoresheet, scoresheetPgn, normalizeToken } from "../api/_lib/scoresheet.js";
import { readFileSync } from "node:fs";
const fails = [];
const eq = (label, got, want) => { if (JSON.stringify(got) !== JSON.stringify(want)) fails.push(label + ": " + JSON.stringify(got) + " ≠ " + JSON.stringify(want)); };
// 1) 깨끗한 판독
let r = repairScoresheet([{ no: 1, white: "e4", black: "e5" }, { no: 2, white: "Nf3", black: "Nc6" }, { no: 3, white: "Bb5", black: "a6" }]);
eq("깨끗한 기보", r.sans, ["e4", "e5", "Nf3", "Nc6", "Bb5", "a6"]); eq("고친 수 없음", r.fixed.length, 0); eq("끝까지", r.stoppedAt, null);
// 2) 흔한 손글씨 오류: 소문자 기물, 잡기 표시 누락, 0-0, 긴 표기, b↔6 혼동, 순서 뒤섞임
r = repairScoresheet([
  { no: 3, white: "Bb5", black: "a6" }, { no: 1, white: "e2-e4", black: "e5" }, { no: 2, white: "nf3", black: "Nc6" },
  { no: 4, white: "Ba4", black: "Nf6" }, { no: 5, white: "0-0", black: "Be7" }, { no: 6, white: "Re1", black: "b5" }, { no: 7, white: "B63", black: "d6" },
  { no: 8, white: "c3", black: "0-0" }, { no: 9, white: "h3", black: "Na5" }, { no: 10, white: "Bc2", black: "c5" }, { no: 11, white: "d4", black: "Qc7" }, { no: 12, white: "Nbd2", black: "cd4" },
]);
eq("루이 로페즈 수순 복원", r.sans.join(" "), "e4 e5 Nf3 Nc6 Bb5 a6 Ba4 Nf6 O-O Be7 Re1 b5 Bb3 d6 c3 O-O h3 Na5 Bc2 c5 d4 Qc7 Nbd2 cxd4");
eq("끝까지 이어짐", r.stoppedAt, null);
if (!r.fixed.some((f) => f.raw === "B63" && f.san === "Bb3")) fails.push("B63 → Bb3 보정이 기록되지 않음");
// 3) 고칠 수 없는 칸에서 멈춤(지어내지 않음)
r = repairScoresheet([{ no: 1, white: "e4", black: "e5" }, { no: 2, white: "Zz9", black: "Nc6" }]);
eq("판독 불가에서 멈춤", r.sans, ["e4", "e5"]); eq("멈춘 위치", r.stoppedAt, { ply: 2, raw: "Zz9" });
// 4) 빈 칸 중간 → 멈춤, 결과 표기에서 끝
r = repairScoresheet([{ no: 1, white: "d4", black: "" }, { no: 2, white: "c4", black: "e6" }]);
eq("중간 빈 칸에서 멈춤", r.stoppedAt, { ply: 1, raw: "" });
r = repairScoresheet([{ no: 1, white: "f3", black: "e5" }, { no: 2, white: "g4", black: "Qh4#" }, { no: 3, white: "0-1", black: "" }]);
eq("결과 표기에서 끝", r.sans, ["f3", "e5", "g4", "Qh4#"]); eq("결과는 멈춤 아님", r.stoppedAt, null);
// 5) 승격 표기
eq("승격 표기 정리", normalizeToken("e8q"), "e8=Q");
// 6) PGN 머리 정보: 따옴표·대괄호 제거, 결과 형식 제한
const pgn = scoresheetPgn(["e4", "e5"], { white: 'Kim "the] rook"', black: "Lee", result: "1-0", event: "Club", date: "2026.11.12" });
if (!/\[White "Kim the rook"\]/.test(pgn) || !/\[Result "1-0"\]/.test(pgn) || !/1\. e4 e5 1-0$/.test(pgn)) fails.push("PGN 머리 정보 형식: " + pgn);
if (!/\[Result "\*"\]/.test(scoresheetPgn(["e4"], { result: "drop table" }))) fails.push("이상한 결과 값은 *로");
// 7) 서버 연결: 스캔 API가 기보 용지 종류·보정 모듈을 쓰고, 클라이언트가 sheet 결과를 불러오기 칸으로 받는다
const api = readFileSync(new URL("../api/scan-board.js", import.meta.url), "utf8");
if (!/"scoresheet"/.test(api) || !/repairScoresheet\(/.test(api) || !/sheet_moves/.test(api)) fails.push("api/scan-board.js가 기보 용지를 처리하지 않음");
const ui = readFileSync(new URL("../src/app/analysis.jsx", import.meta.url), "utf8");
if (!/data\.sheet/.test(ui)) fails.push("보드 편집기가 기보 용지 결과(data.sheet)를 처리하지 않음");
if (fails.length) { console.error("✗ check-scoresheet 실패 (" + fails.length + "건)\n  " + fails.join("\n  ")); process.exit(1); }
console.log("✔ check-scoresheet: 기보 용지 판독 보정(표기·글자 혼동·긴 표기·멈춤)·PGN 머리 정보·서버/화면 연결 정상");
