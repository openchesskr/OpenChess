#!/usr/bin/env node
/** (v0.5.7, 사용자 요청 "채팅 명령어 체계 정리") src/lib/chatCommands.js의 해석 결과를 고정한다.
 *   · parseChatCommand — 새 문법(/puzzle 123, /review pgn …)과 예전 문법(-num·-recent·-PGN·-FEN)이 같은 결과를 내는지,
 *     형식이 틀리면 보내지 않고 사용법을 돌려주는지, "/play 아무개랑…"·"/ㅅ/" 같은 평범한 문장은 명령어로 잡지 않는지.
 *   · chatCommandSuggestions — 자동완성 목록·힌트, 블라인드 대국 전용 명령어가 상황에 맞게만 뜨는지.
 *   · deriveBlindGame — /blind 준비(armed) 뒤의 첫 수로만 시작, 옛 메시지는 예전 규칙, 무승부 합의·기권·연속 수 무시.
 *  npm run build 전에 prebuild로 자동 실행된다. 실행: node scripts/check-chat-commands.mjs
 */
import { parseChatCommand as P, chatCommandSuggestions as S, deriveBlindGame, CHAT_COMMANDS } from "../src/lib/chatCommands.js";

const fails = [];
const eq = (label, got, want) => {
  const g = JSON.stringify(got), w = JSON.stringify(want);
  if (g !== w) fails.push(label + "\n    받은 값: " + g + "\n    기대 값: " + w);
};
const isErr = (label, got) => { if (!got || !got.error) fails.push(label + " — 오류(사용법 안내)여야 하는데 " + JSON.stringify(got)); };
const IDLE = { blindActive: false }, ACTIVE = { blindActive: true };

// ── 해석 ──
eq("평범한 문장", P("안녕", IDLE), null);
eq("모르는 /명령어는 문장", P("/ㅅ/", IDLE), null);
eq("모르는 영문 /명령어도 문장", P("/foo bar", IDLE), null);
eq("/puzzle 번호", P("/puzzle 123456", IDLE), { name: "puzzle", no: 123456 });
eq("/puzzle -num 예전 문법", P("/puzzle -num 42", IDLE), { name: "puzzle", no: 42 });
eq("/puzzle #번호", P("/Puzzle #7", IDLE), { name: "puzzle", no: 7 });
isErr("/puzzle 숫자 아님", P("/puzzle abc", IDLE));
isErr("/puzzle 빈 값", P("/puzzle", IDLE));
eq("/legacy 3", P("/legacy 3", IDLE), { name: "legacy", slot: 3 });
isErr("/legacy 7", P("/legacy 7", IDLE));
eq("/review recent", P("/review recent", IDLE), { name: "review", kind: "recent" });
eq("/review -recent 예전 문법", P("/review -recent", IDLE), { name: "review", kind: "recent" });
eq("/review pgn", P("/review pgn 1.e4 e5", IDLE), { name: "review", kind: "pgn", code: "1.e4 e5" });
eq("/review -PGN 예전 문법", P("/review -PGN 1.e4 e5", IDLE), { name: "review", kind: "pgn", code: "1.e4 e5" });
const FEN0 = "rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1";
eq("/review -FEN 예전 문법", P("/review -FEN " + FEN0, IDLE), { name: "review", kind: "fen", code: FEN0 });
isErr("/review pgn 코드 없음", P("/review pgn", IDLE));
isErr("/review recent 뒤 군더더기", P("/review recent 123", IDLE));
isErr("/review 종류 모름", P("/review xyz", IDLE));
eq("/play 10", P("/play 10", IDLE), { name: "play", arg: "10" });
eq("/play 15+10", P("/play 15+10", IDLE), { name: "play", arg: "15+10" });
eq("/play 뒤 문장은 평범한 텍스트", P("/play 아무개랑 하고 싶다", IDLE), null);
isErr("/play 빈 값", P("/play", IDLE));
eq("/poll 비우면 고르기 창", P("/poll", IDLE), { name: "poll", fen: null });
eq("/board FEN", P("/board " + FEN0, IDLE), { name: "board", fen: FEN0 });
isErr("/board FEN 아님", P("/board hello", IDLE));
eq("/help", P("/help", IDLE), { name: "help" });
isErr("/help 뒤 군더더기", P("/help me", IDLE));
eq("/blind (대기 중)", P("/blind", IDLE), { name: "blind" });
isErr("/blind (대국 중)", P("/blind", ACTIVE));
eq("/resign (대국 중)", P("/resign", ACTIVE), { name: "resign" });
isErr("/resign (대국 아님)", P("/resign", IDLE));
isErr("/draw (대국 아님)", P("/draw", IDLE));
eq("/eval (대국 중)", P("/eval", ACTIVE), { name: "eval" });

// 모든 명령어에 사용법·설명이 있다(도움말 카드가 빈 줄을 그리지 않도록).
for (const c of CHAT_COMMANDS) if (!c.usage || !c.desc || !c.group) fails.push("명령어 표 항목이 비었다: " + c.name);

// ── 자동완성 ──
eq("'/' 아님", S("hi", IDLE).mode, "none");
eq("'/' 전체 목록(대기 중)", S("/", IDLE).items.map((c) => c.name), ["puzzle", "legacy", "review", "poll", "board", "play", "blind", "help"]);
eq("'/' 전체 목록(대국 중)", S("/", ACTIVE).items.map((c) => c.name), ["puzzle", "legacy", "review", "poll", "board", "play", "resign", "draw", "eval", "help"]);
eq("'/p' 좁히기", S("/p", IDLE).items.map((c) => c.name), ["puzzle", "poll", "play"]);
eq("'/play' 정확히 일치", S("/play", IDLE).exact, true);
eq("'/pla' 아직 일치 아님", S("/pla", IDLE).exact, false);
eq("'/play ' 힌트", [S("/play ", IDLE).mode, S("/play ", IDLE).items.map((c) => c.name)], ["hint", ["play"]]);
eq("'/resign ' 대국 아니면 힌트 없음", S("/resign ", IDLE).mode, "none");

// ── 블라인드 대국 상태 ──
const A = "uidA", B = "uidB";
const NEW = "2026-09-28T12:00:00+09:00", OLD = "2026-09-01T12:00:00+09:00";
const msg = (from, body, at = NEW) => ({ from_uid: from, body, created_at: at });
const G = (list) => { const g = deriveBlindGame(list); return { active: g.active, armed: g.armed, sans: g.sans, result: g.result, white: g.whiteFromUid }; };

eq("새 규칙: /blind 없이 1.e4는 대국 아님", G([msg(A, "1.e4")]), { active: false, armed: false, sans: [], result: null, white: null });
eq("옛 메시지: 1.e4로 바로 시작", G([msg(A, "1.e4", OLD)]), { active: true, armed: false, sans: ["e4"], result: null, white: A });
eq("시각 없는 메시지는 옛 규칙", G([{ from_uid: A, body: "1.e4" }]).active, true);
eq("/blind만 보내면 준비됨", G([msg(A, "/blind")]), { active: false, armed: true, sans: [], result: null, white: null });
eq("/blind 뒤 잡담은 준비 유지", G([msg(A, "/blind"), msg(B, "좋아")]).armed, true);
eq("/blind 뒤 첫 수로 시작(보낸 사람이 백)", G([msg(A, "/blind"), msg(B, "1.e4")]), { active: true, armed: false, sans: ["e4"], result: null, white: B });
eq("불가능한 첫 수는 시작 아님", G([msg(A, "/blind"), msg(B, "1.e5")]), { active: false, armed: true, sans: [], result: null, white: null });
eq("같은 사람이 연달아 둔 수는 무시", G([msg(A, "/blind"), msg(A, "1.e4"), msg(A, "1...e5")]).sans, ["e4"]);
eq("번갈아 두면 진행", G([msg(A, "/blind"), msg(A, "1.e4"), msg(B, "1...e5"), msg(A, "2.Nf3")]).sans, ["e4", "e5", "Nf3"]);
const drawGame = [msg(A, "/blind"), msg(A, "1.e4"), msg(B, "1...e5"), msg(A, "/draw")];
eq("/draw 한 번은 제안만", G(drawGame).active, true);
eq("같은 사람의 /draw 반복은 무효", G([...drawGame, msg(A, "/draw")]).active, true);
eq("상대가 /draw로 받으면 무승부", G([...drawGame, msg(B, "/draw")]).result, { kind: "draw" });
eq("수를 두면 제안 취소", G([...drawGame, msg(A, "2.Nf3"), msg(B, "/draw")]).active, true);
eq("/resign은 기권", G([msg(A, "/blind"), msg(A, "1.e4"), msg(B, "/resign")]).result, { kind: "resign", loserUid: B });
eq("끝난 뒤엔 다시 /blind가 필요", G([msg(A, "/blind"), msg(A, "1.e4"), msg(B, "/resign"), msg(A, "1.d4")]).active, false);
eq("끝난 뒤 /blind로 새 대국", G([msg(A, "/blind"), msg(A, "1.e4"), msg(B, "/resign"), msg(B, "/blind"), msg(A, "1.d4")]).sans, ["d4"]);
const mate = [msg(A, "/blind"), msg(A, "1.f3"), msg(B, "1...e5"), msg(A, "2.g4"), msg(B, "2...Qh4#")];
eq("체크메이트로 자동 종료", G(mate).result, { kind: "checkmate", winnerColor: "b" });

if (fails.length) {
  console.error("✖ check-chat-commands: " + fails.length + "건 실패\n  · " + fails.join("\n  · "));
  process.exit(1);
}
console.log("✔ check-chat-commands: 명령어 해석·자동완성·블라인드 대국 상태 모두 통과");
