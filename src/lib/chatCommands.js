// (v0.5.7, 사용자 요청 "채팅 명령어 체계 정리") 채팅 명령어의 단일 출처 — 목록(자동완성·도움말)과 해석(ChatPanel의 send)이
// 모두 이 표를 쓴다. scripts/check-chat-commands.mjs가 해석 결과를 검사한다.
//
// 문법: /명령어 [종류] [값] — 예) /puzzle 123456, /review pgn 1.e4 e5, /play 15+10, /poll, /board <FEN>
// 예전 형식(/puzzle -num 123456, /review -recent·-PGN·-FEN)도 그대로 받는다(이미 익숙한 사용자를 위해).
// 결과: null(명령어가 아님 — 평범한 텍스트로 보냄) | { name, ...인자 } | { error, usage }(명령어는 맞는데 형식이 틀림 — 보내지 않음)

import { sanSrc, startBoard, boardFromSans, gameEndState, stripSuffix } from "./chessRules.js";

export const CHAT_COMMANDS = [
  { name: "puzzle", usage: "/puzzle <번호>", desc: "그 번호의 퍼즐을 공유해요", group: "공유", example: "/puzzle 123456" },
  { name: "legacy", usage: "/legacy <1~6>", desc: "내 유산을 공유해요(1~3 기본 칸, 4~6 그랜드마스터 보너스 칸)", group: "공유", example: "/legacy 1" },
  { name: "review", usage: "/review recent | pgn <코드> | fen <코드>", desc: "최근 chess.com 대국이나 PGN·FEN 리뷰를 공유해요", group: "공유", example: "/review recent" },
  { name: "poll", usage: "/poll [FEN]", desc: "\"여기서 뭐 둘래?\" 수 투표를 보내요(FEN을 비우면 포지션 고르기 창)", group: "공유", example: "/poll" },
  { name: "board", usage: "/board [FEN]", desc: "같이 보기 보드를 열어요 — 한 보드를 둘이 함께 둬요", group: "공유", example: "/board" },
  { name: "play", usage: "/play <분>[+<초>]", desc: "상대에게 실시간 대국을 신청해요 — 예: /play 3, /play 15+10", group: "대국", example: "/play 10" },
  { name: "blind", usage: "/blind", desc: "블라인드 대국을 준비해요 — 그 뒤 백을 맡을 사람이 1.e4처럼 첫 수를 보내면 시작", group: "대국", when: "blindIdle", example: "/blind" },
  { name: "resign", usage: "/resign", desc: "블라인드 대국을 기권해요", group: "블라인드 대국 중", when: "blindActive" },
  { name: "draw", usage: "/draw", desc: "무승부를 제안해요(상대도 /draw를 보내면 무승부)", group: "블라인드 대국 중", when: "blindActive" },
  { name: "eval", usage: "/eval", desc: "지금 포지션의 엔진 평가치를 보내요", group: "블라인드 대국 중", when: "blindActive" },
  { name: "help", usage: "/help", desc: "명령어 목록을 보여줘요(나에게만 보여요)", group: "기타" },
];
const BY_NAME = Object.fromEntries(CHAT_COMMANDS.map((c) => [c.name, c]));

// 지금 쓸 수 있는 명령어인지 — 블라인드 대국 전용 명령어는 대국 중에만, /blind는 대국 중이 아닐 때만.
export function chatCommandAvailable(c, ctx) {
  const active = !!(ctx && ctx.blindActive);
  if (c.when === "blindActive") return active;
  if (c.when === "blindIdle") return !active;
  return true;
}

const err = (name, msg) => ({ error: (msg ? msg + " " : "") + "사용법: " + BY_NAME[name].usage, usage: BY_NAME[name].usage, name });
// FEN처럼 보이는지(여덟 줄 배치) — 실제 유효성은 호출부가 parseFenFull로 다시 확인한다.
const FENISH = /^[pnbrqkPNBRQK1-8]+(\/[pnbrqkPNBRQK1-8]+){7}(\s|$)/;

export function parseChatCommand(body, ctx) {
  const s = (body || "").trim();
  const m = /^\/([a-zA-Z]+)(?:\s+([\s\S]*))?$/.exec(s);
  if (!m) return null;
  const name = m[1].toLowerCase();
  const rest = (m[2] || "").trim();
  const c = BY_NAME[name];
  if (!c) return null; // 모르는 "/…"는 평범한 텍스트로(예: 이모티콘처럼 쓰는 "/ㅅ/")
  if (!chatCommandAvailable(c, ctx)) {
    if (c.when === "blindActive") return { error: "블라인드 대국 중에만 쓸 수 있어요. 먼저 /blind로 대국을 준비하세요.", name };
    return { error: "이미 블라인드 대국이 진행 중이에요. /resign이나 /draw로 끝낸 뒤 다시 준비하세요.", name };
  }
  switch (name) {
    case "help": case "blind": case "resign": case "draw": case "eval":
      return rest ? err(name, "이 명령어는 뒤에 아무것도 붙이지 않아요.") : { name };
    case "puzzle": {
      const pm = /^(?:-num\s+)?#?(\d{1,7})$/i.exec(rest);
      return pm ? { name, no: parseInt(pm[1], 10) } : err(name, "퍼즐 번호(숫자)를 적어 주세요.");
    }
    case "legacy": {
      const lm = /^([1-6])$/.exec(rest);
      return lm ? { name, slot: parseInt(lm[1], 10) } : err(name, "1~6 중 하나를 적어 주세요.");
    }
    case "review": {
      const rm = /^-?(recent|pgn|fen)(?:\s+([\s\S]+))?$/i.exec(rest);
      if (!rm) return err(name);
      const kind = rm[1].toLowerCase(), code = (rm[2] || "").trim();
      if (kind === "recent") return code ? err(name) : { name, kind };
      if (!code) return err(name, (kind === "pgn" ? "PGN" : "FEN") + " 코드를 붙여 주세요.");
      return { name, kind, code };
    }
    case "play": {
      // (예전 동작 유지, 사용자 제보로 고친 것) 인자가 올바른 시간 형식이 아니면 명령어로 보지 않고 평범한 문장으로 보낸다
      // — "/play 아무개랑 하고 싶다" 같은 말을 막지 않으려는 것. 형식 검사는 호출부(parsePlayCommandArg)가 한다.
      if (!rest) return err(name, "시간(분)을 적어 주세요.");
      if (!/^\d{1,3}(\s*\+\s*\d{1,3})?$/.test(rest)) return null;
      return { name, arg: rest };
    }
    case "poll": case "board": {
      if (!rest) return { name, fen: null };
      return FENISH.test(rest) ? { name, fen: rest } : err(name, "FEN 형식이 아니에요.");
    }
    default:
      return null;
  }
}

// 자동완성 — 입력이 "/"로 시작하고 아직 명령어 이름을 치는 중(공백 전)이면 이름이 그걸로 시작하는 명령어들,
// 이름 뒤 공백까지 쳤으면 그 명령어 하나(쓰는 법 힌트)를 돌려준다.
export function chatCommandSuggestions(text, ctx) {
  const s = text || "";
  if (!s.startsWith("/")) return { mode: "none", items: [] };
  const sp = s.indexOf(" ");
  const typed = (sp < 0 ? s.slice(1) : s.slice(1, sp)).toLowerCase();
  const avail = CHAT_COMMANDS.filter((c) => chatCommandAvailable(c, ctx));
  if (sp >= 0) {
    const c = avail.find((x) => x.name === typed);
    return c ? { mode: "hint", items: [c] } : { mode: "none", items: [] };
  }
  const items = avail.filter((c) => c.name.startsWith(typed));
  return { mode: "list", items, exact: items.some((c) => c.name === typed) };
}

// (v0.4.8 기능) 사용자 요청 — 채팅으로 SAN 기보를 입력해 "블라인드 대국"을 진행한다. 서버에 별도
// 상태를 두지 않고, 대화 기록(msgs) 자체가 유일한 진실 공급원이다 — 두 참가자 모두 항상 같은 msgs를
// 보므로(realtime 구독), 이 함수 하나로 각자 독립적으로 계산해도 항상 같은 결론에 도달한다.
//
// "1.e4"처럼 수순 접두사(백은 "N.", 흑은 "N...")가 붙은 SAN 하나만 담긴 메시지가 나타나면 그
// 시점부터 대국이 시작되고(그 메시지를 보낸 사람이 백), 그 뒤로는 다음 차례에 맞는 접두사+SAN
// 메시지만 실제 수로 인식한다 — 그 사이 다른 잡담 메시지는 그냥 건너뛴다(수가 아니므로 무시).
// 체크메이트·스테일메이트·3회 동형 반복이면 gameEndState로 자동 종료되고, /resign·/draw 명령어로도
// 끝난다. 대국이 끝난 뒤 새로운 "1.xxx" 메시지가 나타나면 그 시점부터 새 대국이 다시 시작된다(=
// 블라인드 대국 모드가 자동으로 꺼졌다 다시 켜지는 것과 같은 효과).
export function blindMoveToken(body, ply) {
  const s = (body || "").trim();
  const num = Math.floor(ply / 2) + 1;
  const prefix = num + (ply % 2 === 0 ? "." : "...");
  if (!s.startsWith(prefix)) return null;
  const rest = s.slice(prefix.length).trim();
  if (!rest || /\s/.test(rest)) return null;
  if (!/^[a-hKQRBNO][a-h1-8xKQRBNO\-+#=]*$/.test(rest)) return null;
  return stripSuffix(rest);
}
// (v0.5.7, 사용자 결정) 블라인드 대국은 "/blind"로 준비(armed)한 뒤의 첫 "1.xx" 수로만 시작한다 — 예전엔 "1.e4" 한 줄로 곧장
// 시작돼, 대화 중 우연히 보낸 수 표기도 대국이 돼 버렸다. 이 시각 이전 메시지(이미 오가던 옛 대국)는 예전 규칙(바로 시작)을 그대로 인정한다.
export const BLIND_EXPLICIT_SINCE = "2026-09-27T00:00:00+09:00";
export function deriveBlindGame(msgs) {
  // (버그 수정, 사용자 제보) 예전엔 방금 수를 둔 바로 그 사람이 연달아 또 수를 인식시킬 수 있었다
  // (다음 차례 접두사+SAN 형식만 맞으면 보낸 사람이 누구인지는 전혀 확인하지 않았기 때문) — 그래서
  // 한 사람이 양쪽 수를 혼자 다 입력해도 정상 진행된 것처럼 보였다. lastMoveUid로 직전 수를 둔
  // 사람을 기억해, 같은 사람이 연달아 보낸 메시지는 수로 인식하지 않는다(상대가 실제로 수를 갱신할
  // 때까지 내 채팅은 SAN으로 해석되지 않는다).
  let sans = null, active = false, result = null, whiteFromUid = null, lastMoveUid = null;
  // (버그 수정, 사용자 제보) /draw가 누가 보내든 곧바로 대국을 끝내버려, 상대의 동의 없이도 원하는
  // 쪽이 즉시 무승부로 끝낼 수 있었다 — 이제 첫 /draw는 "제안"으로만 기록되고(drawOfferUid),
  // 상대방이 "다시" /draw를 보내야(즉 제안자가 아닌 사람이 보내야) 비로소 무승부로 끝난다. 같은
  // 사람이 다시 /draw를 보내는 건 중복 제안이라 아무 효과가 없고, 누군가 실제 수를 두면 그 사이
  // 걸려 있던 제안은 자동으로 취소된다(수를 두는 것으로 거절한 셈).
  let drawOfferUid = null;
  let armed = false;
  const explicitSince = Date.parse(BLIND_EXPLICIT_SINCE);
  for (const m of msgs) {
    if (m.pvp_invite_id != null || m.puzzle_no != null || m.legacy_slot != null || m.review_id != null || m.share_reward) continue;
    const body = (m.body || "").trim();
    if (!body) continue;
    if (!active) {
      if (/^\/blind\s*$/i.test(body)) { armed = true; continue; }
      const legacy = !(Date.parse(m.created_at) >= explicitSince); // 시각을 못 읽으면(테스트 데이터 등) 옛 규칙
      const tok = (armed || legacy) ? blindMoveToken(body, 0) : null;
      if (tok && sanSrc(startBoard(), tok, "w")) { sans = [tok]; active = true; armed = false; result = null; whiteFromUid = m.from_uid; lastMoveUid = m.from_uid; drawOfferUid = null; }
      continue;
    }
    if (/^\/resign\s*$/i.test(body)) { active = false; result = { kind: "resign", loserUid: m.from_uid }; continue; }
    if (/^\/draw\s*$/i.test(body)) {
      if (drawOfferUid && drawOfferUid !== m.from_uid) { active = false; result = { kind: "draw" }; }
      else { drawOfferUid = m.from_uid; }
      continue;
    }
    const ply = sans.length;
    const tok = blindMoveToken(body, ply);
    if (!tok) continue;
    if (m.from_uid === lastMoveUid) continue;
    const color = ply % 2 === 0 ? "w" : "b";
    const board = boardFromSans(sans);
    if (!sanSrc(board, tok, color)) continue;
    sans.push(tok); lastMoveUid = m.from_uid; drawOfferUid = null;
    const end = gameEndState(sans).end;
    if (end === "checkmate") { active = false; result = { kind: "checkmate", winnerColor: color }; }
    else if (end === "stalemate") { active = false; result = { kind: "stalemate" }; }
    else if (end === "threefold") { active = false; result = { kind: "threefold" }; }
  }
  return { active, armed: !active && armed, sans: sans || [], result, whiteFromUid, drawOfferUid };
}
