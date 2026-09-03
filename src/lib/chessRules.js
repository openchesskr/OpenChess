import { FILES } from "./theme.js";

/* ============================================================ 기보(SAN) 엔진 ============================================================ */
export function startBoard() {
  const b = Array.from({ length: 8 }, () => Array(8).fill(null));
  const back = ["R", "N", "B", "Q", "K", "B", "N", "R"];
  for (let c = 0; c < 8; c++) { b[0][c] = { c: "b", t: back[c] }; b[1][c] = { c: "b", t: "P" }; b[6][c] = { c: "w", t: "P" }; b[7][c] = { c: "w", t: back[c] }; }
  return b;
}
// (UI2) FEN 붙여넣기 미리보기용 — 기물 배치(1번째 필드)만 8x8 보드로 변환, 실패 시 null.
export function fenToBoard(fen) {
  const rows = (fen || "").trim().split(/\s+/)[0]?.split("/");
  if (!rows || rows.length !== 8) return null;
  const board = Array.from({ length: 8 }, () => Array(8).fill(null));
  for (let r = 0; r < 8; r++) {
    let c = 0;
    for (const ch of rows[r]) {
      if (/[1-8]/.test(ch)) { c += parseInt(ch, 10); continue; }
      if (c > 7) return null;
      const t = ch.toUpperCase();
      if (!"PNBRQK".includes(t)) return null;
      board[r][c] = { c: ch === t ? "w" : "b", t };
      c++;
    }
    if (c !== 8) return null;
  }
  return board;
}
export function looksLikeFen(s) { return /^[pnbrqkPNBRQK1-8]+(\/[pnbrqkPNBRQK1-8]+){7}\b/.test((s || "").trim()); }
// (사용자 요청) 분석 탭 메인 보드의 "FEN 모드" — 붙여넣은 FEN의 기물 배치뿐 아니라 차례·캐슬링
// 권리·앙파상까지 전부 읽어 그 위치에서부터 실제로 이어서 둘 수 있게 한다. 표준 시작 위치를 가정하는
// 공용 replaySans/boardFromSans(모듈 전역 캐시, 앱 전체가 표준 시작 위치를 전제로 공유)는 건드리지
// 않고, FEN 모드 전용으로 이 위치를 시드로 같은 저수준 함수(sanSrc/applySan/updateCastleRights/
// epTargetFromMoveInfo)를 재사용해 로컬로 재생한다.
export function parseFenFull(fen) {
  const board = fenToBoard(fen);
  if (!board) return null;
  const parts = (fen || "").trim().split(/\s+/);
  const turn = parts[1] === "b" ? "b" : "w";
  const castleField = parts[2] || "-";
  const rights = { K: castleField.includes("K"), Q: castleField.includes("Q"), k: castleField.includes("k"), q: castleField.includes("q") };
  const epField = parts[3];
  let ep = null;
  if (epField && /^[a-h][1-8]$/.test(epField)) ep = [8 - parseInt(epField[1], 10), FILES.indexOf(epField[0])];
  // (v0.3.4 기능) raw — 원본 FEN 문자열 그대로. 게임 리뷰 고유 URL의 식별자로 이 값을 그대로
  // 쓰고(사용자 요청: "fen 코드를 그대로 쓰고"), 딥링크로 돌아왔을 때도 이 문자열만 있으면
  // parseFenFull을 다시 호출해 완전히 같은 시작 위치를 복원할 수 있다.
  return { board, turn, rights, ep, raw: (fen || "").trim() };
}
// fenRoot에서 sans(그 위치부터 둔 수순)만큼 재생한 {board, rights, ep}를 돌려준다.
export function replayFromFen(fenRoot, sans) {
  let board = fenRoot.board, rights = fenRoot.rights, ep = fenRoot.ep;
  for (let i = 0; i < sans.length; i++) {
    const color = plyIsWhite(i, fenRoot.turn) ? "w" : "b";
    const info = sanSrc(board, sans[i], color);
    if (!info) break;
    rights = updateCastleRights(rights, info, color);
    ep = epTargetFromMoveInfo(info);
    board = applySan(board, sans[i], color);
  }
  return { board, rights, ep };
}
// legalDests의 캐슬링 판정은 지금 기물 배치(킹/룩이 원위치인지)만 볼 뿐 "캐슬링 권리를 실제로
// 아직 갖고 있는지"는 전혀 확인하지 않는다(앱이 항상 표준 시작 위치에서만 재생돼 왔으므로 이제껏
// 문제가 되지 않았다) — FEN 모드는 애초에 캐슬링 권리가 없는 위치로 시작할 수도 있으므로, 이 함수가
// FEN에서 유래한 rights로 한 번 더 걸러낸다.
export function fenLegalDests(fr, fc, color, board, rights, ep) {
  let dests = legalDests(board, fr, fc, color, ep);
  const p = board[fr][fc];
  if (p && p.t === "K" && fc === 4) {
    const rank = color === "w" ? 7 : 0;
    dests = dests.filter(([tr, tc]) => {
      if (tr !== rank) return true;
      if (tc === 6) return color === "w" ? rights.K : rights.k;
      if (tc === 2) return color === "w" ? rights.Q : rights.q;
      return true;
    });
  }
  return dests;
}
export function clearPath(b, r, c, dr, dc) {
  const sr = Math.sign(dr - r), sc = Math.sign(dc - c); let rr = r + sr, cc = c + sc;
  while (rr !== dr || cc !== dc) { if (b[rr][cc]) return false; rr += sr; cc += sc; } return true;
}
export function canMove(b, piece, color, r, c, dr, dc, isCap) {
  const ddr = dr - r, ddc = dc - c;
  if (piece === "N") { const a = Math.abs(ddr), bb = Math.abs(ddc); return (a === 1 && bb === 2) || (a === 2 && bb === 1); }
  if (piece === "B") return Math.abs(ddr) === Math.abs(ddc) && clearPath(b, r, c, dr, dc);
  if (piece === "R") return (ddr === 0 || ddc === 0) && clearPath(b, r, c, dr, dc);
  if (piece === "Q") return (ddr === 0 || ddc === 0 || Math.abs(ddr) === Math.abs(ddc)) && clearPath(b, r, c, dr, dc);
  if (piece === "K") return Math.abs(ddr) <= 1 && Math.abs(ddc) <= 1;
  if (piece === "P") {
    const dir = color === "w" ? -1 : 1, start = color === "w" ? 6 : 1;
    if (isCap) return ddr === dir && Math.abs(ddc) === 1;
    if (ddc !== 0) return false;
    if (ddr === dir) return !b[dr][dc];
    if (ddr === 2 * dir && r === start) return !b[r + dir][c] && !b[dr][dc];
    return false;
  }
  return false;
}
export function sanSrc(board, sanRaw, color) {
  let san = sanRaw.replace(/[+#!?]/g, "");
  const rank = color === "w" ? 7 : 0;
  if (san === "O-O") return { castle: "k", from: [rank, 4], to: [rank, 6] };
  if (san === "O-O-O") return { castle: "q", from: [rank, 4], to: [rank, 2] };
  let promo = null; const pm = san.match(/=([QRBN])$/); if (pm) { promo = pm[1]; san = san.replace(/=[QRBN]$/, ""); }
  let piece = "P", s = san; if ("KQRBN".includes(s[0])) { piece = s[0]; s = s.slice(1); }
  const isCap = s.includes("x"); s = s.replace("x", "");
  const dest = s.slice(-2); s = s.slice(0, -2);
  if (!/^[a-h][1-8]$/.test(dest)) return null;   // 불완전한 SAN(예: "Qd","Qxd") 방어 — 튕김 방지
  const dc = FILES.indexOf(dest[0]), dr = 8 - parseInt(dest[1], 10);
  let fHint = null, rHint = null;
  for (const ch of s) { if (FILES.includes(ch)) fHint = FILES.indexOf(ch); else if ("12345678".includes(ch)) rHint = 8 - parseInt(ch, 10); }
  for (let r = 0; r < 8; r++) for (let c = 0; c < 8; c++) {
    const p = board[r][c];
    if (!p || p.c !== color || p.t !== piece) continue;
    if (fHint !== null && c !== fHint) continue;
    if (rHint !== null && r !== rHint) continue;
    if (canMove(board, piece, color, r, c, dr, dc, isCap)) return { from: [r, c], to: [dr, dc], piece, promo, isCap };
  }
  return null;
}
export function applySan(board, sanRaw, color) {
  const info = sanSrc(board, sanRaw, color); const b = board.map((row) => row.slice()); if (!info) return b;
  if (info.castle) {
    const rank = color === "w" ? 7 : 0;
    if (info.castle === "k") { b[rank][6] = b[rank][4]; b[rank][4] = null; b[rank][5] = b[rank][7]; b[rank][7] = null; }
    else { b[rank][2] = b[rank][4]; b[rank][4] = null; b[rank][3] = b[rank][0]; b[rank][0] = null; }
    return b;
  }
  const [sr, sc] = info.from, [dr, dc] = info.to; const moving = b[sr][sc];
  if (info.piece === "P" && info.isCap && !b[dr][dc]) b[color === "w" ? dr + 1 : dr - 1][dc] = null;
  b[dr][dc] = info.promo ? { c: color, t: info.promo } : moving; b[sr][sc] = null; return b;
}
// (v0.2.3 성능) boardFromSans/sansToFen이 매번 sans 전체를 시작 포지션부터 처음부터 재생해, 학습
// 탭·리뷰 페이지에서 긴 기보를 두거나 포지션을 빠르게 넘길 때마다 호출 하나하나의 비용이 그 시점의
// 수순 길이만큼 커지고, 이 비용이 포지션을 옮길 때마다 누적돼 뒤쪽 수순으로 갈수록 체감 속도가
// 심각하게 느려졌다(엔진 평가·후보 수 계산 등 이 두 함수를 쓰는 모든 곳이 함께 영향을 받음). 모듈
// 스코프에 "마지막으로 재생한 경로"를 기억하는 캐시를 두고, 새 호출의 sans와 캐시된 경로의 공통
// 접두사(prefix)까지는 이미 계산해 둔 보드·캐슬링 권리·앙파상 상태를 그대로 재사용하고, 갈라지는
// 지점부터만 증분으로 적용한다 — 실제 진행(한 수씩 앞으로, 같은 위치에서 여러 후보 수를 평가하기
// 위해 sansToFen([...sans, san])을 후보 수마다 반복 호출하는 것 등)은 대부분 직전 호출과 긴 공통
// 접두사를 공유하므로 실질 비용이 거의 O(1)에 가까워진다. board는 항상 새로 만들어지고(applySan이
// 원본을 건드리지 않음) 캐시가 그 스냅샷을 그대로 들고 있어도 다른 곳에서 값을 바꿀 위험이 없다.
export let _replayCache = { sans: [], boards: [startBoard()], rights: [{ K: true, Q: true, k: true, q: true }], eps: [null] };
export function _commonPrefixLen(a, b) {
  const n = Math.min(a.length, b.length);
  let i = 0;
  while (i < n && a[i] === b[i]) i++;
  return i;
}
// sans까지 재생한 {board, rights, ep}를 반환한다. boardFromSans·sansToFen이 공유하는 단일 재생
// 경로라, 어느 한쪽으로 호출해도 다른 쪽 호출의 캐시를 그대로 재사용할 수 있다.
export function replaySans(sans) {
  const c = _replayCache;
  const start = _commonPrefixLen(c.sans, sans);
  let board = c.boards[start], rights = c.rights[start], ep = c.eps[start];
  const boards = c.boards.slice(0, start + 1), rightsArr = c.rights.slice(0, start + 1), eps = c.eps.slice(0, start + 1);
  for (let i = start; i < sans.length; i++) {
    const color = i % 2 === 0 ? "w" : "b";
    const info = sanSrc(board, sans[i], color);
    rights = updateCastleRights(rights, info, color);
    ep = epTargetFromMoveInfo(info);
    board = applySan(board, sans[i], color);
    boards.push(board); rightsArr.push(rights); eps.push(ep);
  }
  _replayCache = { sans: sans.slice(), boards, rights: rightsArr, eps };
  return { board, rights, ep };
}
export function boardFromSans(sans) { return replaySans(sans).board; }
// (버그 수정) sanSrc가 돌려주는 한 수의 from/to 정보(그 수를 두기 "직전" 보드 기준)만으로 그 수가
// 진짜 폰 더블 푸시였는지 판정한다 — epTarget과 analyzeGame의 FEN 생성 루프가 이 판정을 공유해,
// 둘의 기준이 서로 어긋나는 일이 없게 한다.
export function epTargetFromMoveInfo(info) {
  if (!info || info.castle || info.piece !== "P" || info.isCap) return null;
  const [fr] = info.from, [tr, tc] = info.to;
  if (Math.abs(tr - fr) !== 2) return null;
  return [(fr + tr) / 2, tc];
}
// (버그 수정) 직전 더블 푸시로 생기는 앙파상 타깃 칸 (없으면 null). SAN은 도착 칸만 담고 있어,
// 예전엔 "도착 랭크가 4/5랭크인 폰 수"이면 무조건 더블 푸시로 간주했다 — 그런데 폰이 한 칸씩 두
// 번(예: e2-e3, 그다음 턴에 e3-e4) 나눠 전진해도 마지막 수의 도착 칸은 똑같이 4랭크라 이 조건을
// 통과했고, 실제로는 스타팅 칸에서 두 칸을 한 번에 건너뛴 게 아닌데도 앙파상을 허용하는 버그가
// 있었다. 직전 수 바로 이전의 보드에서 실제 출발 칸을 구해, 정말로 두 칸을 건너뛰었는지 검증한다.
export function epTarget(sans) {
  if (!sans || !sans.length) return null;
  const lastRaw = sans[sans.length - 1];
  if (!/^[a-h][1-8]$/.test(lastRaw.replace(/[+#!?]/g, ""))) return null; // 기물 문자/캡처 없는 폰 전진만
  const moverColor = (sans.length - 1) % 2 === 0 ? "w" : "b";
  const prevBoard = boardFromSans(sans.slice(0, -1));
  return epTargetFromMoveInfo(sanSrc(prevBoard, lastRaw, moverColor));
}
export const sqName = (r, c) => FILES[c] + (8 - r);
// (버그 수정) FEN의 캐슬링 권리 필드 — 예전엔 실제 수순과 무관하게 항상 "KQkq"를 그대로 내보내,
// 킹이나 룩이 한 번이라도 움직였다가(캐슬링 권리는 영구히 사라짐) 제자리로 돌아와도 엔진은
// 캐슬링이 여전히 합법이라고 착각했다. 매 수마다(그 수를 두기 직전 보드에서 얻은 sanSrc 정보로)
// 킹/룩이 움직였는지, 또는 상대가 룩의 시작 칸을 그대로 점령(포획)했는지를 반영해 갱신한다 — 한
// 번 잃은 권리는 다시 생기지 않으므로 앞에서부터 한 번만 순서대로 훑으면 된다.
export function updateCastleRights(rights, info, color) {
  if (!info) return rights;
  if (info.castle) return color === "w" ? { ...rights, K: false, Q: false } : { ...rights, k: false, q: false };
  let next = info.piece === "K" ? (color === "w" ? { ...rights, K: false, Q: false } : { ...rights, k: false, q: false }) : rights;
  const homeFlag = (r, c) => (r === 7 && c === 0) ? "Q" : (r === 7 && c === 7) ? "K" : (r === 0 && c === 0) ? "q" : (r === 0 && c === 7) ? "k" : null;
  const fromFlag = homeFlag(info.from[0], info.from[1]); if (fromFlag && next[fromFlag]) next = { ...next, [fromFlag]: false };
  const toFlag = homeFlag(info.to[0], info.to[1]); if (toFlag && next[toFlag]) next = { ...next, [toFlag]: false };
  return next;
}
export function castleRightsStr(rights) { const s = (rights.K ? "K" : "") + (rights.Q ? "Q" : "") + (rights.k ? "k" : "") + (rights.q ? "q" : ""); return s || "-"; }
export function sansToUci(sans) {
  let b = startBoard(); const out = [];
  sans.forEach((s, i) => {
    const color = i % 2 === 0 ? "w" : "b"; const info = sanSrc(b, s, color);
    if (info) {
      if (info.castle) { const rank = color === "w" ? 7 : 0; out.push(FILES[4] + (8 - rank) + FILES[info.castle === "k" ? 6 : 2] + (8 - rank)); }
      else { const [fr, fc] = info.from, [tr, tc] = info.to; out.push(FILES[fc] + (8 - fr) + FILES[tc] + (8 - tr) + (info.promo ? info.promo.toLowerCase() : "")); }
    }
    b = applySan(b, s, color);
  });
  return out;
}
// (20차 기능5) 이미 만들어진 board를 그대로 FEN으로 직렬화 — sansToFen처럼 매번 sans 전체를
// 처음부터 재생(boardFromSans)하지 않아도 되므로, 이미 진행 중인 보드가 있는 호출부(analyzeGame 등)에서
// O(n²) 재생을 피할 수 있다. plyCount는 sans.length와 동일한 의미(선수 결정·풀무브 번호 계산용).
// (버그 수정) castleStr/epStr을 캐슬링 권리·앙파상 필드로 그대로 받는다 — 예전엔 이 두 필드가
// 항상 "KQkq -"로 하드코딩돼 있어, 엔진이 이미 사라진 캐슬링 권리를 합법으로 착각하거나 실제
// 앙파상 기회를 항상 놓쳤다. 호출부가 안 넘기면 "-"(권리 없음/대상 없음)로 안전하게 기본값을
// 둔다 — 예전 버그처럼 "일단 다 된다"고 잘못 알리는 대신, 모르면 "안 된다"고 보수적으로 답한다.
// (v0.3.4 기능) startColor — 표준 시작 위치(백이 0수째 둠)를 전제하던 이 함수를, 임의 FEN에서
// 시작한 리뷰(analyzeGame의 fenRoot)에서도 재사용할 수 있도록 시작 진영을 선택적으로 받는다.
// 안 넘기면(기존 모든 호출부) 예전과 완전히 같게 백이 시작한다고 본다 — 하위 호환.
export function boardToFen(b, plyCount, castleStr, epStr, startColor) {
  const rows = [];
  for (let r = 0; r < 8; r++) {
    let row = "", empty = 0;
    for (let c = 0; c < 8; c++) { const p = b[r][c]; if (!p) empty++; else { if (empty) { row += empty; empty = 0; } const ch = p.t; row += p.c === "w" ? ch : ch.toLowerCase(); } }
    if (empty) row += empty; rows.push(row);
  }
  const turn = plyIsWhite(plyCount, startColor || "w") ? "w" : "b";
  return rows.join("/") + " " + turn + " " + (castleStr || "-") + " " + (epStr || "-") + " 0 " + (Math.floor(plyCount / 2) + 1);
}
export function sansToFen(sans) {
  const { board, rights, ep } = replaySans(sans);
  return boardToFen(board, sans.length, castleRightsStr(rights), ep ? sqName(ep[0], ep[1]) : "-");
}
// (v0.3.5 기능) 사용자 요청 — v0.3.4에서 "이번 범위를 넘어선다"고 미뤄 둔 FEN 리뷰 관련 작업 중,
// 보드 조작(자유 탐색)·정확한 무승부 판정만 이번에 마저 지원한다(수의 등급·코치 코멘트 같은 MEC
// 채점까지는 여전히 범위 밖 — LearnTab의 기존 FEN 모드도 처음부터 같은 선을 긋고 있었다, goFen
// 참고). boardFromSans/sansToFen(둘 다 표준 시작 위치 전용, 모듈 전역 캐시로 최적화됨)을 그대로
// 두고, fenRoot가 있을 때만 이 보조 함수들로 갈아탄다 — fenRoot 재생은 호출 빈도가 낮아(자유 탐색
// 중에만) 캐시 없이 매번 replayFromFen을 불러도 무방하다.
export function boardOfRoot(fenRoot, sans) { return fenRoot ? replayFromFen(fenRoot, sans).board : boardFromSans(sans); }
export function fenOfRoot(fenRoot, sans) {
  if (!fenRoot) return sansToFen(sans);
  const r = replayFromFen(fenRoot, sans);
  return boardToFen(r.board, sans.length, castleRightsStr(r.rights), r.ep ? sqName(r.ep[0], r.ep[1]) : "-", fenRoot.turn);
}
export function colorOfRoot(fenRoot, plyCount) { return plyIsWhite(plyCount, fenRoot ? fenRoot.turn : "w") ? "w" : "b"; }
// (v0.2.9 기능) 실시간 분석(evaluateMulti)에 더 이상 depth 상한(예전엔 20)을 걸지 않기 위한 값 —
// 분석 탭·게임 리뷰(자유 탐색 엔진 라인·평가치 막대·수 체계 아이콘)가 공유한다. UCI "go depth N"은
// 프로토콜상 숫자가 필요하지만, 스톡피시 WASM이 movetime 몇 초~몇십 초 안에 실제로 도달할 수 있는
// depth(대체로 20~40대)보다 훨씬 큰 값을 줘서 사실상 도달 불가능한 상한으로 만든다 — 그러면 각 단계를
// 실제로 멈추는 건 depth가 아니라 movetime뿐이 되어, 주어진 시간 동안 depth가 막힘없이 계속 늘어난다.
export const MAX_SEARCH_DEPTH = 99;
/* UCI -> SAN (보드 기준). ep를 넘기면 앙파상 캡처도 올바르게 "x"를 붙인다. uci 5번째 글자(승진 기물,
   소문자)가 있으면 승진 기물로 반영한다 — 예전엔 이 글자를 아예 읽지 않아 언더프로모션 계속 수순이
   전부 퀸 승진으로 잘못 표기됐다. */
export function uciToSan(board, uci, color, ep) {
  if (!uci || uci.length < 4) return null;
  const fc = FILES.indexOf(uci[0]), fr = 8 - parseInt(uci[1], 10), tc = FILES.indexOf(uci[2]), tr = 8 - parseInt(uci[3], 10);
  if (fc < 0 || tc < 0 || !board[fr] || !board[fr][fc]) return null;
  const promo = uci.length > 4 ? uci[4].toUpperCase() : undefined;
  return buildSan(board, fr, fc, tr, tc, color, ep, promo);
}
// (v0.1.3 기능) MultiPV 한 줄의 UCI 수 목록(그 줄이 시작하는 위치 prevSans 기준)을 순서대로 SAN으로
// 바꾼다 — 분석 탭 엔진 라인(여러 수 앞까지 미리보기)에서 쓴다. 변환할 수 없는 수를 만나면(드묾)
// 거기서 멈추고 그때까지 변환된 수만 돌려준다.
// (버그 수정) 앙파상 타깃(ep)을 넘기지 않아 매 반복마다 uciToSan이 이를 일반 전진으로 오인했다 —
// isCap이 빠지며 SAN 자체는 만들어지지만(null 아님) 그 앙파상으로 실제로 사라지는 상대 폰이 이후
// 보드 재구성(boardFromSans)에는 반영되지 않아, 다음 반복의 uciToSan이 그 폰이 여전히 있다고 보고
// 완전히 다른(때로는 불가능한) 수로 오판해 null을 반환하며 그 지점에서 라인이 조용히 끊겼다. 매
// 반복마다 직전 수로 새로 생긴 ep 타깃을 계산해 다음 uciToSan 호출에 넘긴다.
// (v0.3.5 기능) fenRoot를 선택적으로 받는다 — 예전엔 항상 표준 시작 위치를 전제해(boardFromSans),
// FEN 리뷰의 실시간 엔진 라인 패널에 그대로 쓰면 PV가 엉뚱한(때로는 불법인) 표기로 보였다("범위가
// 커진다"고 미룬 항목). fenRoot 경로는 표준 경로가 쓰는 전역 재생 캐시(replaySans)가 없어 매번
// replayFromFen부터 다시 재생하지만, 이 함수는 최대 maxPlies(보통 15수 안팎)만 도는 짧은 루프라
// 비용은 무시할 만하다.
export function pvUciToSans(prevSans, uciList, maxPlies, fenRoot) {
  const sans = [];
  const cur = prevSans.slice();
  const n = Math.min(uciList.length, maxPlies || uciList.length);
  if (fenRoot) {
    let { board, ep } = replayFromFen(fenRoot, cur);
    for (let i = 0; i < n; i++) {
      const color = plyIsWhite(cur.length, fenRoot.turn) ? "w" : "b";
      const san = uciToSan(board, uciList[i], color, ep);
      if (!san) break;
      sans.push(san);
      cur.push(san);
      ep = epTargetFromMoveInfo(sanSrc(board, san, color));
      board = applySan(board, san, color);
    }
    return sans;
  }
  let ep = epTarget(cur);
  for (let i = 0; i < n; i++) {
    const color = cur.length % 2 === 0 ? "w" : "b";
    const board = boardFromSans(cur);
    const san = uciToSan(board, uciList[i], color, ep);
    if (!san) break;
    sans.push(san);
    cur.push(san);
    ep = epTargetFromMoveInfo(sanSrc(board, san, color));
  }
  return sans;
}
export function kingPos(board, color) { for (let r = 0; r < 8; r++) for (let c = 0; c < 8; c++) { const p = board[r][c]; if (p && p.c === color && p.t === "K") return [r, c]; } return null; }
export function isAttacked(board, tr, tc, byColor) {
  for (let r = 0; r < 8; r++) for (let c = 0; c < 8; c++) {
    const p = board[r][c]; if (!p || p.c !== byColor) continue;
    if (p.t === "P") { const dir = byColor === "w" ? -1 : 1; if (tr - r === dir && Math.abs(tc - c) === 1) return true; continue; }
    if (p.t === "K") { if (Math.abs(tr - r) <= 1 && Math.abs(tc - c) <= 1) return true; continue; }
    if (canMove(board, p.t, byColor, r, c, tr, tc, true)) return true;
  }
  return false;
}
export function exposesKing(board, fr, fc, tr, tc, color, ep) {
  const b = board.map((r) => r.slice()); const p = b[fr][fc];
  if (p.t === "P" && fc !== tc && !b[tr][tc] && ep && tr === ep[0] && tc === ep[1]) b[color === "w" ? tr + 1 : tr - 1][tc] = null;
  b[tr][tc] = p; b[fr][fc] = null;
  const kp = kingPos(b, color); if (!kp) return false;
  return isAttacked(b, kp[0], kp[1], color === "w" ? "b" : "w");
}
export function legalDests(board, fr, fc, color, ep) {
  const p = board[fr][fc]; if (!p || p.c !== color) return [];
  const opp = color === "w" ? "b" : "w";
  let out = [];
  for (let tr = 0; tr < 8; tr++) for (let tc = 0; tc < 8; tc++) {
    const tgt = board[tr][tc];
    if (tgt && tgt.c === color) continue;
    const isCap = !!tgt && tgt.c !== color;
    if (canMove(board, p.t, color, fr, fc, tr, tc, isCap)) out.push([tr, tc]);
    else if (p.t === "P" && !tgt && fc !== tc && ep && tr === ep[0] && tc === ep[1] && canMove(board, "P", color, fr, fc, tr, tc, true)) out.push([tr, tc]);
  }
  // 자기 킹을 체크에 노출시키는 수 제거
  out = out.filter(([tr, tc]) => !exposesKing(board, fr, fc, tr, tc, color, ep));
  // 캐슬링: 킹/룩 원위치 + 경로 비어있음 + 체크 통과/진입 금지
  if (p.t === "K" && fc === 4 && (fr === 7 || fr === 0) && !isAttacked(board, fr, 4, opp)) {
    if (board[fr][5] == null && board[fr][6] == null && board[fr][7] && board[fr][7].t === "R" && board[fr][7].c === color && !isAttacked(board, fr, 5, opp) && !isAttacked(board, fr, 6, opp)) out.push([fr, 6]);
    if (board[fr][3] == null && board[fr][2] == null && board[fr][1] == null && board[fr][0] && board[fr][0].t === "R" && board[fr][0].c === color && !isAttacked(board, fr, 3, opp) && !isAttacked(board, fr, 2, opp)) out.push([fr, 2]);
  }
  return out;
}
// (v0.2.3 기능) 스테일메이트·3회 동형 반복 판정을 위한 헬퍼들. positionKey는 국면 반복 비교에 쓰는
// 단순화된 키로, 기물 배치+다음 차례만 비교한다(캐슬링 권리·앙파상까지 엄밀히 구분하는 FIDE 규정과
// 완전히 같지는 않지만, 이 앱의 대국 길이·용도에서 그 둘이 달라 반복이 아닌데 반복으로 오판되는
// 경우는 실질적으로 없다). 합법수 존재 여부는 아래(체크메이트 기호 판정용) hasAnyLegalMove를 그대로
// 재사용한다 — 그 함수도 앙파상은 반영하지 않는 동일한 단순화라 두 판정 기준이 일관된다.
export function isInCheck(board, color) {
  const kp = kingPos(board, color); if (!kp) return false;
  return isAttacked(board, kp[0], kp[1], color === "w" ? "b" : "w");
}
export function positionKey(board, color) {
  let s = color;
  for (const row of board) for (const p of row) s += p ? p.c + p.t : ".";
  return s;
}
// sans가 나타내는 수순이 "지금" 스테일메이트·체크메이트·3회 동형 반복 중 하나로 이미 끝나 있는
// 국면인지 판정한다(진행 중이면 end: null). 분석 탭 메인 보드·리뷰 페이지 자유 탐색 양쪽에서 더
// 이상 수를 둘 수 없어야 하는 국면인지 확인하는 데 쓴다.
// (v0.3.5 버그 수정) fenRoot를 선택적으로 받는다 — 예전엔 항상 표준 시작 위치를 전제해, FEN 리뷰의
// 자유 탐색·분석 탭 FEN 모드에서는 이 판정 자체를 아예 꺼 둘 수밖에 없었다("범위 밖"으로 미룬
// 항목). fenRoot가 있으면 그 위치·그 차례부터 재생해 판정한다(생략 시 기존 표준 시작 위치 동작과
// 완전히 동일).
export function gameEndState(sans, fenRoot) {
  const startColor = fenRoot ? fenRoot.turn : "w";
  let board = fenRoot ? fenRoot.board : startBoard();
  const seen = new Map([[positionKey(board, startColor), 1]]);
  const n = sans ? sans.length : 0;
  for (let i = 0; i < n; i++) {
    const color = plyIsWhite(i, startColor) ? "w" : "b";
    board = applySan(board, sans[i], color);
    const nextColor = color === "w" ? "b" : "w";
    const key = positionKey(board, nextColor);
    seen.set(key, (seen.get(key) || 0) + 1);
  }
  const toMove = n === 0 ? startColor : (plyIsWhite(n - 1, startColor) ? "b" : "w");
  if (!hasAnyLegalMove(board, toMove)) return isInCheck(board, toMove) ? { end: "checkmate", color: toMove } : { end: "stalemate", color: toMove };
  if (n === 0) return { end: null };
  if (seen.get(positionKey(board, toMove)) >= 3) return { end: "threefold" };
  return { end: null };
}
// (v0.2.3 기능) 무승부로 기록된 대국(chess.com 동기화·마스터 대국 등)의 기보를 그대로 재생해 실제로
// 스테일메이트·3회 동형 반복으로 끝났는지 확인하고, 그 이름을 돌려준다. 둘 다 아니면(기권 없이 서로
// 합의했거나, 불충분한 기물·50수 규칙 등 이 앱이 별도로 판정하지 않는 경우) "합의 무승부"로 간주한다.
export function drawKindLabel(moves) {
  const end = moves && moves.length ? gameEndState(moves).end : null;
  return end === "stalemate" ? "스테일메이트" : end === "threefold" ? "3회 동형 반복" : "합의 무승부";
}
export function buildSanBare(board, fr, fc, tr, tc, color, ep, promo) {
  const p = board[fr][fc]; if (!p) return null;
  if (p.t === "K" && Math.abs(tc - fc) === 2) return tc > fc ? "O-O" : "O-O-O";
  const tgt = board[tr][tc];
  const isCap = (!!tgt && tgt.c !== color) || (p.t === "P" && fc !== tc && !tgt && !!ep && tr === ep[0] && tc === ep[1]);
  const dest = FILES[tc] + (8 - tr);
  if (p.t === "P") {
    let san = (isCap ? FILES[fc] + "x" : "") + dest;
    if ((color === "w" && tr === 0) || (color === "b" && tr === 7)) san += "=" + (promo && /^[QRBN]$/.test(promo) ? promo : "Q");
    return san;
  }
  let disamb = "";
  for (let r = 0; r < 8; r++) for (let c = 0; c < 8; c++) {
    if ((r === fr && c === fc)) continue;
    const o = board[r][c];
    if (o && o.c === color && o.t === p.t && canMove(board, p.t, color, r, c, tr, tc, isCap)) {
      disamb = (c !== fc) ? FILES[fc] : (8 - fr) + "";
    }
  }
  return p.t + disamb + (isCap ? "x" : "") + dest;
}
/* 상대에게 어떤 합법수라도 남아있는가 (체크메이트 판정용) */
export function hasAnyLegalMove(board, color) {
  for (let r = 0; r < 8; r++) for (let c = 0; c < 8; c++) {
    const p = board[r][c]; if (!p || p.c !== color) continue;
    if (legalDests(board, r, c, color, null).length) return true;
  }
  return false;
}
// (UI) 사용자 요청 — 지금 둘 수 있는 합법수 총 개수(승격은 목적지 1칸으로 뭉뚱그려 셈, 이 용도로는
// 충분하다). 1~2개뿐인 "사실상 강제된" 국면에서는 엔진 라인·평가치 박스를 깔끔하게 비우는 데 쓴다.
export function countLegalMoves(board, color, ep) {
  let n = 0;
  for (let r = 0; r < 8; r++) for (let c = 0; c < 8; c++) {
    const p = board[r][c]; if (!p || p.c !== color) continue;
    n += legalDests(board, r, c, color, ep).length;
  }
  return n;
}
/* 수가 만드는 체크(+)·체크메이트(#) 기호 */
export function checkSuffix(boardBefore, sanBare, color) {
  const after = applySan(boardBefore, sanBare, color);
  const enemy = color === "w" ? "b" : "w";
  const kp = kingPos(after, enemy); if (!kp) return "";
  if (!isAttacked(after, kp[0], kp[1], color)) return "";
  return hasAnyLegalMove(after, enemy) ? "+" : "#";
}
export const stripSuffix = (s) => (s || "").replace(/[+#]/g, "");
/* 임의의 SAN 에 현재 보드 기준 체크/체크메이트 기호를 부여(표기·매칭 일관성) */
export function decorateSan(boardBefore, sanRaw, color) {
  const bare = stripSuffix(sanRaw);
  const info = sanSrc(boardBefore, sanRaw, color);
  if (!info) return bare;
  return bare + checkSuffix(boardBefore, bare, color);
}
export function buildSan(board, fr, fc, tr, tc, color, ep, promo) {
  const bare = buildSanBare(board, fr, fc, tr, tc, color, ep, promo);
  if (!bare) return null;
  return bare + checkSuffix(board, bare, color);
}
/* (20차) 수순 전체를 시작 위치부터 재생하며 각 수에 체크(+)/체크메이트(#) 기호를 보정 —
   출처(과거 저장 퍼즐, 외부 PGN 등)와 무관하게 기보 '표시'가 항상 올바른 기호를 갖도록 한다.
   재생 불가능한 수를 만나면 그 이후는 원본 그대로 반환(깨진 보드 상태로 잘못 붙이지 않음). */
export function decorateLine(sans) {
  let b = startBoard(); let broken = false;
  return (sans || []).map((s, i) => {
    if (broken || !s) return s;
    const color = i % 2 === 0 ? "w" : "b";
    try {
      if (!sanSrc(b, s, color)) { broken = true; return s; }
      const d = decorateSan(b, s, color);
      b = applySan(b, s, color);
      return d || s;
    } catch { broken = true; return s; }
  });
}
// (사용자 요청, FEN 모드) startColor — 기본은 "w"(표준 시작 위치, 0번 수부터 백)라 기존 모든 호출부는
// 그대로 동작한다. FEN으로 시작한 위치가 흑 차례라면 startColor="b"를 넘겨, 그 위치에서 처음 두는
// 수(ply 0)부터 "1..."으로, 그다음 백의 응수를 "2."으로 표기한다(흑이 먼저 두면 백 차례에서 수
// 번호가 올라가는 표준 PGN 관례와 동일).
export function plyIsWhite(ply, startColor) { return (startColor === "b") ? (ply % 2 === 1) : (ply % 2 === 0); }
export function plyMoveNum(ply, startColor) { return Math.floor((ply + (startColor === "b" ? 1 : 0)) / 2) + 1; }
export function moveNumber(ply, startColor) { return plyMoveNum(ply, startColor) + (plyIsWhite(ply, startColor) ? "." : "..."); }
export const STANDARD_START_FEN = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";
export const EDITOR_EMPTY_FEN = "8/8/8/8/8/8/8/8 w - - 0 1";
