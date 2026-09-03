import { startBoard, sanSrc, applySan, decorateLine, plyIsWhite, plyMoveNum } from "./chessRules.js";

// PGN 안에 명시된 결과 토큰("1-0"/"0-1"/"1/2-1/2"/"*")을 찾는다(없으면 null).
export function pgnResultToken(pgn) {
  const m = (pgn || "").match(/(1-0|0-1|1\/2-1\/2|\*)\s*(?:\r?\n|$)/);
  return m ? m[1] : null;
}
// (v0.2.3 기능) 개발자 마스터 대국 추가 폼의 "대국 결과" 자동 입력 — PGN에 명시된 결과 토큰을
// 우선 쓰고, 없거나 "*"(미정)면 마지막 수에 체크메이트 기호(#)가 있는지로 승패를 역산한다. 그마저
// 판정할 수 없으면 null을 돌려줘 개발자가 직접 선택하게 한다.
export function autoResultFromPgn(pgn, sans) {
  const token = pgnResultToken(pgn);
  if (token && token !== "*") return token;
  if (sans && sans.length && /#$/.test(sans[sans.length - 1])) {
    const moverWhite = (sans.length - 1) % 2 === 0;
    return moverWhite ? "1-0" : "0-1";
  }
  return null;
}
// (v0.2.3 기능) 대량 가져오기 — 외부에서 받은, 여러 대국이 이어 붙은 하나의 PGN 텍스트를
// 대국 단위로 쪼개고(각 대국은 "[Event"로 시작), 표준 PGN 헤더 태그(White/Black/*Elo/Date/Result)로
// 대국자·레이팅·연도·결과를 자동으로 채운다. 헤더가 없거나 불완전해도 SAN 파싱과 결과 자동 판정
// (autoResultFromPgn)이 그대로 동작한다.
export function pgnHeaderTag(pgnBlock, tag) {
  const m = pgnBlock.match(new RegExp("\\[" + tag + "\\s+\"([^\"]*)\"\\]"));
  return m ? m[1] : null;
}
export function splitPgnGames(text) {
  const parts = (text || "").split(/(?=\[Event\s)/).map((s) => s.trim()).filter(Boolean);
  return parts.length ? parts : ((text || "").trim() ? [text.trim()] : []);
}
// 대국 하나(PGN 블록)를 master_games_dev insert에 바로 쓸 수 있는 형태로 파싱한다. result를 끝내
// 판정하지 못하면(진행 중 표시 "*" 등) ok:false를 돌려줘 가져오기에서 건너뛴다(NOT NULL 제약).
export function parsePgnGameForImport(pgnBlock) {
  const white = pgnHeaderTag(pgnBlock, "White");
  const black = pgnHeaderTag(pgnBlock, "Black");
  const whiteElo = pgnHeaderTag(pgnBlock, "WhiteElo");
  const blackElo = pgnHeaderTag(pgnBlock, "BlackElo");
  const date = pgnHeaderTag(pgnBlock, "Date");
  const sans = parsePgnSans(pgnBlock);
  const year = date ? parseInt(date.slice(0, 4), 10) : null;
  const result = autoResultFromPgn(pgnBlock, sans);
  const ok = !!(white && black && sans.length && result);
  return {
    ok, whiteName: white || "?", whiteRating: whiteElo && /^\d+$/.test(whiteElo) ? parseInt(whiteElo, 10) : null,
    blackName: black || "?", blackRating: blackElo && /^\d+$/.test(blackElo) ? parseInt(blackElo, 10) : null,
    year: (year && year > 1000 && year < 2100) ? year : null,
    pgn: pgnBlock, sans, result,
  };
}
export function parsePgnMoves(pgn) {
  const noHeaders = pgn.replace(/^\[.*\]$/gm, "");
  const noComments = noHeaders.replace(/\{[^}]*\}/g, "").replace(/;[^\n]*/g, "");
  const noNags = noComments.replace(/\$\d+/g, "");
  const noMoveNums = noNags.replace(/\d+\.(\.\.)?/g, " ");
  const noResult = noMoveNums.replace(/(1-0|0-1|1\/2-1\/2|\*)\s*$/, "");
  return noResult.split(/\s+/).map((s) => s.trim()).filter(Boolean);
}
export function parsePgnSans(pgn) {
  const body = pgn.replace(/\[[^\]]*\]/g, " ").replace(/\{[^}]*\}/g, " ").replace(/\$\d+/g, " ");
  const toks = body.split(/\s+/);
  const out = [];
  for (let t of toks) {
    if (!t) continue;
    if (/^(1-0|0-1|1\/2-1\/2|\*)$/.test(t)) break;
    t = t.replace(/^\d+\.(\.\.)?/, "");
    if (!t) continue;
    // (20차) 체크(+)·체크메이트(#) 기호를 제거하지 않고 보존한다 — 기호를 지우면 보드 상단 기보·분석 창에서
    // 체크/메이트 표기가 사라지고, 접미사가 붙은 분석 탭 수순(buildSan)·스냅샷 트리 키와의 매칭도 어긋난다.
    if (/^[a-hKQRBNO][a-h1-8xKQRBNO\-+#=]*$/.test(t)) out.push(t);
  }
  return out;
}
/* 기보: "기보" 라벨 없이 굵은 흰색 텍스트만 */
// (UI4) 기보의 각 수를 누르면 그 포지션으로 바로 이동한다(onJump). onJump가 없으면 예전처럼 순수 텍스트로 표시.
export function sansToPgnText(sans, startColor) {
  // (20차) 표기 직전에 체크/체크메이트 기호를 보정 — 퍼즐 창 기보 등 어떤 출처의 수순이든 +/#가 올바르게 표시된다.
  const deco = decorateLine(sans);
  const parts = [];
  deco.forEach((san, i) => {
    if (plyIsWhite(i, startColor)) parts.push(plyMoveNum(i, startColor) + "." + san);
    else if (parts.length) parts[parts.length - 1] += " " + san;
    else parts.push(plyMoveNum(i, startColor) + "..." + san); // (FEN 모드) 흑이 먼저 두는 경우 첫 조각
  });
  return parts.join(" ");
}
// (v0.3.4 기능) 사용자 요청 — 채팅 "/review -PGN"·"/review -FEN" 명령어로 들어온 수순이 실제로
// 재생 가능한지(각 SAN이 그 시점에 실제로 둘 수 있는 합법적인 수인지) 미리 검증한다. parsePgnSans는
// 토큰 모양만 보고 걸러내므로(오타·불법수를 그대로 통과시킬 수 있음), sanSrc로 한 수씩 실제로
// 찾아보고 한 수라도 실패하면(=null) 그 즉시 무효로 판정한다 — 전송 전 검증에 쓴다.
export function sanSequenceValid(sans, fenRoot) {
  if (!sans.length) return true;
  let board = fenRoot ? fenRoot.board : startBoard();
  for (let i = 0; i < sans.length; i++) {
    const color = fenRoot ? (plyIsWhite(i, fenRoot.turn) ? "w" : "b") : (i % 2 === 0 ? "w" : "b");
    const info = sanSrc(board, sans[i], color);
    if (!info) return false;
    board = applySan(board, sans[i], color);
  }
  return true;
}
