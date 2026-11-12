// (v0.7.5, 사용자 요청) 새 레슨 커리큘럼 — 체스 기초 5단계 + 오프닝 레파토리 6단계. 단계마다 수 등급(좋음~탁월, 6단계는 이론)의 색과 아이콘을 쓴다(레슨 경로 화면).
//  레슨 id는 서버 코인 보상(economy_claim_chapter의 seedChapters)과 같아야 한다 — 바꾸면 supabase-setup.sql도 함께(check-lessons가 대조).
//  스텝 형식은 engine.js 머리말. 모든 포지션·정답은 scripts/check-lessons.mjs가 chess.js로 검증한다(합법·정답이 목표를 만족·힌트가 정답).
import { t } from "../i18n.js";
import { Chess } from "chess.js";
import { openingFamily, openingIdeaAt } from "../mecOpenings.js";

const START = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";
const KK = "4k3/8/8/8/8/8/8/4K3 w - - 0 1";
export const LESSON_REWARD = 20;   // 레슨 하나를 처음 끝내면 받는 코인(서버 seedChapters와 같아야 함)

// (v0.7.5, 사용자 요청) 단계 테마 = 수 등급 색·아이콘을 좋음 → 우수 → 최선 → 유일 → 탁월 순서로 그대로 쓴다(grade = lib/moveKinds.js QCOLOR의 키).
//  화면(app/lessons.jsx)이 grade 색에서 배경·칸·글자 색을 만든다. deco = 배경에 은은하게 깔리는 기물 실루엣 종류.
export const STAGES = [
  { id: "s1", grade: "good", deco: ["R", "N", "B"], title: () => t("첫걸음"), desc: () => t("체스판과 기물이 움직이는 방법") },
  { id: "s2", grade: "excellent", deco: ["K", "R", "P"], title: () => t("규칙 완성"), desc: () => t("체크·체크메이트와 특별한 규칙") },
  { id: "s3", grade: "best", deco: ["P", "N", "B"], title: () => t("오프닝 원칙"), desc: () => t("첫 수부터 좋은 습관") },
  { id: "s4", grade: "only", deco: ["N", "B", "Q"], title: () => t("전술 기초"), desc: () => t("기물을 얻는 기본 전술") },
  { id: "s5", grade: "brilliant", deco: ["Q", "R", "K"], title: () => t("마무리 기술"), desc: () => t("체크메이트 패턴과 엔드게임") },
  // (v0.7.5, 사용자 요청) 6단계: 주요 오프닝을 직접 두며 익힌다 — 다섯 등급 다음에 수 등급 "이론(책)"의 색·아이콘
  { id: "s6", grade: "book", deco: ["N", "B", "P"], title: () => t("오프닝 레파토리"), desc: () => t("주요 오프닝을 직접 두며 익히기") },
];

// 레슨: { id, stage, icon(lucide 이름 또는 "piece:R"), title, sub, steps }
const L = (id, stage, icon, title, sub, steps) => ({ id, stage, icon, title, sub, steps });
const LESSONS = [
  // ── 1. 첫걸음 ──
  L("b_board", "s1", "Grid3x3", () => t("체스판과 좌표"), () => t("칸의 이름 읽기"), () => [
    { kind: "read", fen: START, say: t("체스판은 가로 8칸, 세로 8칸으로 모두 64칸입니다. 백은 아래쪽, 흑은 위쪽에서 시작합니다.") },
    { kind: "read", fen: KK, marks: ["e1", "e2", "e3", "e4", "e5", "e6", "e7", "e8"], say: t("세로줄은 파일이라고 부르며 왼쪽부터 a에서 h까지 이름이 있습니다. 강조된 줄이 e파일입니다.") },
    { kind: "read", fen: KK, marks: ["e4"], say: t("가로줄은 랭크라고 부르며 아래부터 1에서 8까지 번호가 있습니다. 파일과 랭크를 합쳐 e4처럼 칸 이름을 읽습니다.") },
    { kind: "tap", fen: KK, tap: ["d5"], say: t("d5 칸을 눌러 보세요.") },
    { kind: "tap", fen: KK, tap: ["g2"], say: t("이번에는 g2 칸을 눌러 보세요.") },
  ]),
  L("b_rook", "s1", "piece:R", () => t("룩"), () => t("가로·세로로 곧게"), () => [
    { kind: "read", fen: "4k3/8/8/8/3R4/8/8/4K3 w - - 0 1", marksFrom: "d4", say: t("룩은 가로와 세로로 원하는 만큼 곧게 움직입니다. 다른 기물을 뛰어넘을 수는 없습니다.") },
    { kind: "move", fen: "4k3/8/8/8/3R4/8/8/4K3 w - - 0 1", say: t("룩을 a4로 옮기세요."), line: [{ goal: { uci: ["d4a4"] } }], hint: "d4a4" },
    { kind: "move", fen: "4k3/8/1p6/8/8/8/1R6/4K3 w - - 0 1", say: t("룩으로 흑 폰을 잡으세요. 상대 기물이 있는 칸으로 가면 그 기물을 잡습니다."), line: [{ goal: { uci: ["b2b6"] } }], hint: "b2b6" },
    { kind: "choice", fen: "4k3/8/8/8/8/2R5/8/4K3 w - - 0 1", say: t("c3의 룩이 한 번에 갈 수 없는 칸은 어디일까요?"), options: ["c8", "h3", "d4"], answer: 2 },
  ]),
  L("b_bishop", "s1", "piece:B", () => t("비숍"), () => t("대각선으로 멀리"), () => [
    { kind: "read", fen: "4k3/8/8/8/3B4/8/8/4K3 w - - 0 1", marksFrom: "d4", say: t("비숍은 대각선으로 원하는 만큼 움직입니다. 처음 놓인 칸의 색을 끝까지 벗어나지 못합니다.") },
    { kind: "move", fen: "4k3/8/6n1/8/8/8/2B5/4K3 w - - 0 1", say: t("비숍으로 흑 나이트를 잡으세요."), line: [{ goal: { uci: ["c2g6"] } }], hint: "c2g6" },
    { kind: "choice", say: t("밝은 칸의 비숍이 어두운 칸으로 갈 수 있을까요?"), options: [t("갈 수 있다"), t("갈 수 없다")], answer: 1 },
  ]),
  L("b_queen", "s1", "piece:Q", () => t("퀸"), () => t("가장 강한 기물"), () => [
    { kind: "read", fen: "4k3/8/8/8/3Q4/8/8/4K3 w - - 0 1", marksFrom: "d4", say: t("퀸은 룩과 비숍을 합친 기물입니다. 가로·세로·대각선 어느 쪽으로든 원하는 만큼 움직입니다.") },
    { kind: "move", fen: "4k3/r7/8/8/8/8/8/Q3K3 w - - 0 1", say: t("퀸으로 흑 룩을 잡으세요."), line: [{ goal: { uci: ["a1a7"] } }], hint: "a1a7" },
    { kind: "move", fen: "4k3/8/8/5b2/8/8/8/1Q2K3 w - - 0 1", say: t("이번에는 대각선으로 흑 비숍을 잡으세요."), line: [{ goal: { uci: ["b1f5"] } }], hint: "b1f5" },
  ]),
  L("b_knight", "s1", "piece:N", () => t("나이트"), () => t("L자로 뛰어넘기"), () => [
    { kind: "read", fen: "4k3/8/8/8/3N4/8/8/4K3 w - - 0 1", marksFrom: "d4", say: t("나이트는 한 방향으로 두 칸, 옆으로 한 칸 L자로 움직입니다. 다른 기물을 뛰어넘을 수 있는 유일한 기물입니다.") },
    { kind: "tap", fen: "4k3/8/8/8/3N4/8/8/4K3 w - - 0 1", tapFrom: "d4", say: t("d4의 나이트가 갈 수 있는 칸을 모두 눌러 보세요.") },
    { kind: "move", fen: "4k3/8/8/8/8/5p2/5PPP/4K1N1 w - - 0 1", say: t("나이트로 f3의 폰을 잡으세요. 앞을 막은 폰은 그냥 뛰어넘습니다."), line: [{ goal: { uci: ["g1f3"] } }], hint: "g1f3" },
  ]),
  L("b_pawn", "s1", "piece:P", () => t("폰"), () => t("전진, 잡기, 승격"), () => [
    { kind: "read", fen: "4k3/8/8/8/8/8/4P3/4K3 w - - 0 1", marks: ["e3", "e4"], say: t("폰은 앞으로 한 칸 전진합니다. 처음 움직일 때만 두 칸까지 나아갈 수 있습니다.") },
    { kind: "move", fen: "4k3/8/8/8/8/8/4P3/4K3 w - - 0 1", say: t("폰을 두 칸 전진시키세요."), line: [{ goal: { uci: ["e2e4"] } }], hint: "e2e4" },
    { kind: "move", fen: "4k3/8/8/3n4/4P3/8/8/4K3 w - - 0 1", say: t("폰은 대각선 앞의 기물만 잡습니다. 흑 나이트를 잡으세요."), line: [{ goal: { uci: ["e4d5"] } }], hint: "e4d5" },
    { kind: "move", fen: "8/4P1k1/8/8/8/8/8/4K3 w - - 0 1", say: t("끝 랭크에 닿은 폰은 다른 기물로 승격합니다. 폰을 퀸으로 승격시키세요."), line: [{ goal: { promote: "q" } }], hint: "e7e8q" },
  ]),
  L("b_king", "s1", "piece:K", () => t("킹"), () => t("가장 소중한 기물"), () => [
    { kind: "read", fen: "4k3/8/8/8/3K4/8/8/8 w - - 0 1", marksFrom: "d4", say: t("킹은 모든 방향으로 한 칸씩 움직입니다. 킹을 잃으면 게임이 끝나므로 가장 소중한 기물입니다.") },
    { kind: "tap", fen: "k7/4r3/8/8/3K4/8/8/8 w - - 0 1", tapFrom: "d4", say: t("킹은 공격받는 칸으로 갈 수 없습니다. 흑 룩이 지키는 e파일을 피해, 킹이 갈 수 있는 칸을 모두 눌러 보세요.") },
  ]),
  // ── 2. 규칙 완성 ──
  L("r_check", "s2", "Zap", () => t("체크"), () => t("킹을 공격하기"), () => [
    { kind: "read", fen: "4k3/8/8/8/8/8/8/R3K3 w - - 0 1", say: t("상대 킹을 공격하는 것을 체크라고 합니다. 체크를 받은 쪽은 반드시 다음 수로 체크에서 벗어나야 합니다.") },
    { kind: "move", fen: "4k3/8/8/8/8/8/8/R3K3 w - - 0 1", say: t("룩으로 흑 킹에게 체크를 거세요."), line: [{ goal: { check: true } }], hint: "a1a8" },
    { kind: "move", fen: "4k3/8/8/8/8/8/3q4/4K2R w - - 0 1", say: t("백 킹이 체크를 받았습니다. 체크를 건 퀸을 잡아 벗어나세요."), line: [{ goal: { uci: ["e1d2"] } }], hint: "e1d2" },
    { kind: "choice", say: t("체크에서 벗어나는 방법이 아닌 것은?"), options: [t("킹을 피한다"), t("사이를 막는다"), t("체크를 건 기물을 잡는다"), t("상대 킹에게 체크를 건다")], answer: 3 },
  ]),
  L("r_mate", "s2", "Crown", () => t("체크메이트"), () => t("게임을 끝내는 수"), () => [
    { kind: "read", fen: "6k1/5ppp/8/8/8/8/8/R5K1 w - - 0 1", say: t("체크를 어떤 방법으로도 벗어날 수 없으면 체크메이트이며, 그 수로 게임이 끝납니다.") },
    { kind: "move", fen: "6k1/5ppp/8/8/8/8/8/R5K1 w - - 0 1", say: t("한 수로 체크메이트하세요."), line: [{ goal: { mate: true } }], hint: "a1a8" },
    { kind: "move", fen: "7k/8/6K1/8/8/8/8/Q7 w - - 0 1", say: t("퀸으로 체크메이트하세요. 백 킹이 도망칠 칸을 막아 주고 있습니다."), line: [{ goal: { mate: true } }], hint: "a1a8" },
  ]),
  L("r_stalemate", "s2", "Scale", () => t("스테일메이트"), () => t("무승부가 되는 막힌 상황"), () => [
    { kind: "read", fen: "7k/5Q2/6K1/8/8/8/8/8 b - - 0 1", say: t("차례인 쪽이 체크를 받지 않았는데 둘 수 있는 수가 하나도 없으면 스테일메이트이며, 무승부입니다.") },
    { kind: "choice", fen: "7k/5Q2/6K1/8/8/8/8/8 b - - 0 1", say: t("흑 차례인 이 포지션의 결과는?"), options: [t("백의 체크메이트 승리"), t("스테일메이트 무승부"), t("흑이 계속 둔다")], answer: 1 },
    { kind: "move", fen: "7k/8/5QK1/8/8/8/8/8 w - - 0 1", say: t("스테일메이트를 피하고 체크메이트하세요. Qf7은 스테일메이트입니다."), line: [{ goal: { mate: true } }], hint: "f6f8" },
  ]),
  L("r_castle", "s2", "Castle", () => t("캐슬링"), () => t("킹을 안전하게"), () => [
    { kind: "read", fen: "r3k2r/pppppppp/8/8/8/8/PPPPPPPP/R3K2R w KQkq - 0 1", marks: ["g1", "f1"], say: t("캐슬링은 킹을 룩 쪽으로 두 칸 옮기고, 룩을 킹 너머 옆 칸으로 옮기는 특별한 수입니다. 킹을 안전하게 하고 룩을 싸움에 참여시킵니다.") },
    { kind: "move", fen: "r3k2r/pppppppp/8/8/8/8/PPPPPPPP/R3K2R w KQkq - 0 1", say: t("킹사이드로 캐슬링하세요. 킹을 g1으로 옮기면 됩니다."), line: [{ goal: { castle: "k" } }], hint: "e1g1" },
    { kind: "choice", say: t("캐슬링할 수 없는 경우는?"), options: [t("킹이나 그 룩이 이미 움직였을 때"), t("킹이 체크를 받고 있을 때"), t("둘 다")], answer: 2 },
  ]),
  L("r_enpassant", "s2", "MoveDiagonal", () => t("앙파상"), () => t("지나간 폰 잡기"), () => [
    { kind: "read", fen: "4k3/8/8/3pP3/8/8/8/4K3 w - d6 0 1", marks: ["d6"], say: t("두 칸 전진한 상대 폰이 내 폰 바로 옆에 서면, 바로 다음 수에 한해 그 폰이 지나간 칸으로 잡을 수 있습니다. 이것이 앙파상입니다.") },
    { kind: "move", fen: "4k3/8/8/3pP3/8/8/8/4K3 w - d6 0 1", say: t("앙파상으로 d5의 폰을 잡으세요."), line: [{ goal: { uci: ["e5d6"] } }], hint: "e5d6" },
  ]),
  L("r_values", "s2", "Coins", () => t("기물의 가치"), () => t("무엇이 더 소중한가"), () => [
    { kind: "read", fen: START, say: t("기물의 가치를 흔히 폰 1, 나이트 3, 비숍 3, 룩 5, 퀸 9점으로 셉니다. 킹은 값을 매길 수 없습니다.") },
    { kind: "choice", say: t("어느 쪽이 더 가치 있을까요?"), options: [t("룩 하나"), t("나이트 하나와 폰 하나")], answer: 0 },
    { kind: "move", fen: "4k3/8/3q4/8/4N3/8/5n2/4K3 w - - 0 1", say: t("나이트로 두 기물 중 하나를 잡을 수 있습니다. 더 가치 있는 기물을 잡으세요."), line: [{ goal: { uci: ["e4d6"] } }], hint: "e4d6" },
  ]),
  // ── 3. 오프닝 원칙 ──
  L("o_center", "s3", "Target", () => t("중앙 장악"), () => t("가운데 네 칸"), () => [
    { kind: "read", fen: START, marks: ["d4", "e4", "d5", "e5"], say: t("가운데 네 칸이 중앙입니다. 중앙에 선 폰과 기물은 더 많은 칸을 지배하고 어느 쪽으로든 빨리 갈 수 있습니다.") },
    { kind: "move", fen: START, say: t("중앙 폰 하나를 두 칸 전진시키세요."), line: [{ goal: { uci: ["e2e4", "d2d4"] } }], hint: "e2e4" },
  ]),
  L("o_develop", "s3", "Rocket", () => t("기물 전개"), () => t("나이트와 비숍 먼저"), () => [
    { kind: "read", fen: "rnbqkbnr/pppp1ppp/8/4p3/4P3/8/PPPP1PPP/RNBQKBNR w KQkq - 0 2", say: t("오프닝에서는 나이트와 비숍을 빨리 꺼내 싸움에 참여시킵니다. 이것을 전개라고 합니다.") },
    { kind: "move", fen: "rnbqkbnr/pppp1ppp/8/4p3/4P3/8/PPPP1PPP/RNBQKBNR w KQkq - 0 2", say: t("e5 폰을 공격하면서 나이트를 전개하세요."),
      line: [{ goal: { uci: ["g1f3"] }, reply: "b8c6" }, { goal: { uci: ["f1c4", "f1b5"] }, say: t("흑도 나이트로 지켰습니다. 이제 비숍을 활발한 칸으로 전개하세요.") }], hint: "g1f3" },
  ]),
  L("o_safety", "s3", "Shield", () => t("킹 안전"), () => t("일찍 캐슬링하기"), () => [
    { kind: "read", fen: "r1bqk1nr/pppp1ppp/2n5/2b1p3/2B1P3/5N2/PPPP1PPP/RNBQK2R w KQkq - 4 4", say: t("기물을 전개해 길이 열리면 일찍 캐슬링해 킹을 안전한 곳으로 옮기는 것이 좋습니다.") },
    { kind: "move", fen: "r1bqk1nr/pppp1ppp/2n5/2b1p3/2B1P3/5N2/PPPP1PPP/RNBQK2R w KQkq - 4 4", say: t("캐슬링으로 킹을 안전하게 하세요."), line: [{ goal: { castle: "k" } }], hint: "e1g1" },
    { kind: "choice", say: t("오프닝에서 퀸을 너무 일찍 꺼내면 어떻게 될까요?"), options: [t("상대가 기물을 전개하며 퀸을 쫓아 시간을 잃기 쉽다"), t("항상 빨리 이긴다"), t("아무 상관이 없다")], answer: 0 },
  ]),
  L("o_trap", "s3", "ShieldAlert", () => t("빠른 메이트 막기"), () => t("f7을 노리는 공격"), () => [
    { kind: "read", fen: "r1bqkbnr/pppp1ppp/2n5/4p2Q/2B1P3/8/PPPP1PPP/RNB1K1NR b KQkq - 3 3", marks: ["f7"], say: t("백의 퀸과 비숍이 함께 f7을 노립니다. f7은 처음에 킹만 지키는 약한 칸입니다.") },
    { kind: "move", fen: "r1bqkbnr/pppp1ppp/2n5/4p2Q/2B1P3/8/PPPP1PPP/RNB1K1NR b KQkq - 3 3", say: t("흑 차례입니다. Qxf7 메이트를 막으세요."), line: [{ goal: { safe: true } }], hint: "g7g6" },
  ]),
  // ── 4. 전술 기초 ──
  L("t_hanging", "s4", "HandCoins", () => t("공짜 기물"), () => t("지켜지지 않는 기물 잡기"), () => [
    { kind: "read", fen: "4k3/2p5/3b4/7n/8/8/8/3QK3 w - - 0 1", say: t("아무도 지키지 않는 기물을 공짜 기물이라고 합니다. 잡기 전에 그 기물을 지키는 상대 기물이 있는지 먼저 확인하세요.") },
    { kind: "move", fen: "4k3/2p5/3b4/7n/8/8/8/3QK3 w - - 0 1", say: t("d6의 비숍은 c7 폰이 지킵니다. 지켜지지 않는 기물을 잡으세요."), line: [{ goal: { uci: ["d1h5"] } }], hint: "d1h5" },
  ]),
  L("t_fork", "s4", "GitFork", () => t("포크"), () => t("두 기물을 한 번에"), () => [
    { kind: "read", fen: "r3k3/8/8/1N6/8/8/8/4K3 w - - 0 1", say: t("한 기물이 상대 기물 두 개 이상을 동시에 공격하는 것을 포크라고 합니다. 나이트가 특히 잘합니다.") },
    { kind: "move", fen: "r3k3/8/8/1N6/8/8/8/4K3 w - - 0 1", say: t("나이트로 킹과 룩을 동시에 공격하세요."),
      line: [{ goal: { uci: ["b5c7"] }, reply: "e8e7" }, { goal: { uci: ["c7a8"] }, say: t("킹이 피했습니다. 이제 룩을 잡으세요.") }], hint: "b5c7" },
  ]),
  L("t_pin", "s4", "Pin", () => t("핀"), () => t("움직일 수 없게 묶기"), () => [
    { kind: "read", fen: "4k3/3n4/8/8/8/8/8/4KB2 w - - 0 1", say: t("공격받은 기물이 움직이면 그 뒤의 더 중요한 기물이 잡히는 상태를 핀이라고 합니다.") },
    { kind: "move", fen: "4k3/3n4/8/8/8/8/8/4KB2 w - - 0 1", say: t("비숍으로 d7의 나이트를 흑 킹 앞에 묶으세요."), line: [{ goal: { uci: ["f1b5"] } }], hint: "f1b5" },
    { kind: "choice", fen: "4k3/3n4/8/1B6/8/8/8/4K3 b - - 0 1", say: t("핀에 걸린 d7의 나이트는 움직일 수 있을까요?"), options: [t("움직일 수 있다"), t("움직이면 킹이 공격받으므로 움직일 수 없다")], answer: 1 },
  ]),
  L("t_skewer", "s4", "ArrowRightLeft", () => t("스큐어"), () => t("앞을 비키게 하고 뒤를 잡기"), () => [
    { kind: "read", fen: "8/1q6/8/3k4/8/5P2/8/1B4K1 w - - 0 1", say: t("앞의 중요한 기물을 공격해 비키게 만든 뒤, 그 뒤의 기물을 잡는 전술이 스큐어입니다.") },
    { kind: "move", fen: "8/1q6/8/3k4/8/5P2/8/1B4K1 w - - 0 1", say: t("비숍으로 흑 킹에게 체크를 걸어, 킹과 퀸을 한 줄에 세우세요."),
      line: [{ goal: { uci: ["b1e4"] }, reply: "d5d6" }, { goal: { uci: ["e4b7"] }, say: t("킹이 비켰습니다. 뒤에 있던 퀸을 잡으세요.") }], hint: "b1e4" },
  ]),
  L("t_discovered", "s4", "Eye", () => t("디스커버드 어택"), () => t("숨은 공격 열기"), () => [
    { kind: "read", fen: "q3k3/8/8/8/4B3/8/8/4RK2 w - - 0 1", say: t("앞의 기물이 비키면서 뒤에 있던 기물의 공격 길이 열리는 것을 디스커버드 어택이라고 합니다.") },
    { kind: "move", fen: "q3k3/8/8/8/4B3/8/8/4RK2 w - - 0 1", say: t("비숍을 움직여 e1 룩의 체크를 열면서, 동시에 흑 퀸을 잡으세요."), line: [{ goal: { uci: ["e4a8"] } }], hint: "e4a8" },
  ]),
  // ── 5. 마무리 기술(체크메이트 패턴) ──
  L("m_backrank", "s5", "PanelBottom", () => t("백랭크 메이트"), () => t("자기 폰에 갇힌 킹"), () => [
    { kind: "read", fen: "6k1/5ppp/8/8/8/8/5PPP/3R2K1 w - - 0 1", say: t("킹 앞의 폰들이 막혀 킹이 끝 랭크에 갇히면, 룩이나 퀸 하나로 체크메이트할 수 있습니다.") },
    { kind: "move", fen: "6k1/5ppp/8/8/8/8/5PPP/3R2K1 w - - 0 1", say: t("백랭크 메이트를 완성하세요."), line: [{ goal: { mate: true } }], hint: "d1d8" },
    { kind: "choice", say: t("백랭크 메이트를 미리 막는 흔한 방법은?"), options: [t("킹 앞 폰 하나를 전진시켜 숨 쉴 칸을 만든다"), t("킹을 구석에 더 붙인다"), t("룩을 모두 교환한다")], answer: 0 },
  ]),
  L("m_queen", "s5", "Crown", () => t("퀸과 킹의 메이트"), () => t("킹이 퀸을 지켜 주기"), () => [
    { kind: "read", fen: "7k/8/6K1/8/8/8/1Q6/8 w - - 0 1", say: t("퀸이 상대 킹 바로 옆에 붙어도, 내 킹이 퀸을 지켜 주면 상대 킹은 퀸을 잡지 못합니다.") },
    { kind: "move", fen: "7k/8/6K1/8/8/8/1Q6/8 w - - 0 1", say: t("킹의 도움을 받아 퀸으로 체크메이트하세요."), line: [{ goal: { mate: true } }], hint: "b2g7" },
    { kind: "move", fen: "k7/8/1K6/8/8/8/8/7Q w - - 0 1", say: t("멀리서도 됩니다. 퀸으로 체크메이트하세요."), line: [{ goal: { mate: true } }], hint: "h1h8" },
  ]),
  L("m_ladder", "s5", "Rows3", () => t("두 룩 사다리"), () => t("한 줄씩 밀어붙이기"), () => [
    { kind: "read", fen: "4k3/8/8/8/8/8/R7/1R4K1 w - - 0 1", say: t("두 룩이 한 줄씩 번갈아 막으면 상대 킹을 끝 랭크까지 밀어붙일 수 있습니다. 사다리 메이트라고 합니다.") },
    { kind: "move", fen: "4k3/8/8/8/8/8/R7/1R4K1 w - - 0 1", say: t("먼저 a룩으로 7랭크를 막으세요."),
      line: [{ goal: { uci: ["a2a7"] }, reply: "e8d8" }, { goal: { mate: true }, say: t("이제 다른 룩으로 8랭크에서 체크메이트하세요.") }], hint: "a2a7" },
  ]),
  L("m_smothered", "s5", "Shell", () => t("질식 메이트"), () => t("나이트의 한 방"), () => [
    { kind: "read", fen: "6rk/6pp/8/6N1/8/8/8/6K1 w - - 0 1", say: t("킹이 자기 기물에 둘러싸여 움직일 칸이 없으면, 나이트의 체크 하나로 끝납니다. 이것이 질식 메이트입니다.") },
    { kind: "move", fen: "6rk/6pp/8/6N1/8/8/8/6K1 w - - 0 1", say: t("나이트로 질식 메이트를 완성하세요."), line: [{ goal: { mate: true } }], hint: "g5f7" },
  ]),
  // ── 5. 마무리 기술(엔드게임) ──
  L("e_square", "s5", "Square", () => t("폰의 정사각형"), () => t("킹이 폰을 따라잡을까"), () => [
    { kind: "read", fen: "8/8/8/k7/8/8/5P2/7K w - - 0 1", marks: ["f4", "f8", "b8", "b4"], say: t("폰에서 승격 칸까지를 한 변으로 하는 정사각형을 그려 보세요. 상대 킹이 그 안에 들어오지 못하면 폰은 혼자 승격합니다.") },
    { kind: "choice", fen: "8/8/8/k7/8/8/5P2/7K w - - 0 1", say: t("백 차례입니다. f폰이 두 칸 전진하면 흑 킹이 따라잡을 수 있을까요?"), options: [t("따라잡을 수 있다"), t("따라잡을 수 없다")], answer: 1 },
    { kind: "move", fen: "8/8/8/k7/8/8/5P2/7K w - - 0 1", say: t("폰을 두 칸 전진시켜 승격 경주를 시작하세요."), line: [{ goal: { uci: ["f2f4"] } }], hint: "f2f4" },
  ]),
  L("e_opposition", "s5", "ArrowUpDown", () => t("오퍼지션"), () => t("킹끼리 마주 보기"), () => [
    { kind: "read", fen: "8/8/4k3/8/8/4K3/4P3/8 w - - 0 1", say: t("두 킹이 한 칸을 사이에 두고 마주 보는데 상대가 둘 차례라면, 오퍼지션을 잡았다고 합니다. 상대 킹은 길을 비켜야 합니다.") },
    { kind: "move", fen: "8/8/4k3/8/8/4K3/4P3/8 w - - 0 1", say: t("킹을 움직여 오퍼지션을 잡으세요."), line: [{ goal: { uci: ["e3e4"] } }], hint: "e3e4" },
  ]),
  L("e_rookmate", "s5", "Flag", () => t("룩 엔드게임 마무리"), () => t("킹과 룩으로 끝내기"), () => [
    { kind: "read", fen: "6k1/8/6K1/8/8/8/8/R7 w - - 0 1", say: t("상대 킹이 끝 랭크로 밀려나고 내 킹이 마주 서면, 룩 하나로 체크메이트할 수 있습니다.") },
    { kind: "move", fen: "6k1/8/6K1/8/8/8/8/R7 w - - 0 1", say: t("룩으로 체크메이트하세요."), line: [{ goal: { mate: true } }], hint: "a1a8" },
  ]),
];

// ── 6. 오프닝 레파토리 ── 오프닝 MEC(lib/mecOpenings.js)의 수마다의 의도·계열 이름·중반 계획을 그대로 문장으로 쓴다(새 번역 없이 MEC와 항상 같은 내용).
//  [id, MEC 계열, 학습자 진영, 주요 수순(SAN), 이름 맞히기의 오답 계열 2개, (선택) MEC에 설명이 없는 수의 보충 설명 {수 번호(0부터): 문장}]. 수순은 레파토리 항목을 지나가도록 골랐다(check-lessons가 합법·설명 유무 검사).
const OPENINGS = [
  ["op_italian", "italian", "w", "e4 e5 Nf3 Nc6 Bc4 Bc5 c3 Nf6 d3", ["ruy", "scotch"]],
  ["op_ruy", "ruy", "w", "e4 e5 Nf3 Nc6 Bb5 a6 Ba4 Nf6 O-O Be7 Re1 b5 Bb3", ["italian", "scotch"]],
  ["op_scotch", "scotch", "w", "e4 e5 Nf3 Nc6 d4 exd4 Nxd4", ["italian", "petrov"]],
  ["op_qgd", "qgd", "w", "d4 d5 c4 e6 Nc3 Nf6 Bg5", ["london", "slav"]],
  ["op_london", "london", "w", "d4 d5 Bf4", ["qgd", "catalan"]],
  ["op_najdorf", "najdorf", "b", "e4 c5 Nf3 d6 d4 cxd4 Nxd4 Nf6 Nc3 a6", ["dragon", "french"]],
  ["op_french", "french", "b", "e4 e6 d4 d5 e5 c5", ["caro", "sicilian"]],
  ["op_caro", "caro", "b", "e4 c6 d4 d5 Nc3 dxe4 Nxe4 Bf5", ["french", "scandi"], { 5: () => t("d5 폰으로 e4를 잡아 중앙의 긴장을 풉니다. 백 나이트를 e4로 끌어낸 뒤 비숍을 f5로 전개해 템포를 얻습니다.") }],
  ["op_scandi", "scandi", "b", "e4 d5 exd5 Qxd5 Nc3 Qa5", ["caro", "alekhine"]],
  ["op_slav", "slav", "b", "d4 d5 c4 c6 Nf3 Nf6 Nc3 dxc4", ["qgd", "semiSlav"], { 5: () => t("나이트를 전개해 d5를 한 번 더 지키고 백의 e4 진출을 막습니다.") }],
  ["op_kid", "kid", "b", "d4 Nf6 c4 g6 Nc3 Bg7 e4 d6", ["grunfeld", "nimzo"]],
  ["op_nimzo", "nimzo", "b", "d4 Nf6 c4 e6 Nc3 Bb4", ["qid", "kid"]],
  ["op_grunfeld", "grunfeld", "b", "d4 Nf6 c4 g6 Nc3 d5", ["kid", "benoni"]],
];
function openingLesson([id, fam, side, line, wrong, extra = {}], k) {
  const famName = () => (openingFamily(fam) || {}).name || fam;
  return { motif: fam, line, side, ...L(id, "s6", "BookOpen", famName, () => (side === "w" ? t("백으로 두기") : t("흑으로 두기")), () => {
    const sans = line.split(" "), c = new Chess(), ucis = [];
    for (const s of sans) { const m = c.move(s); ucis.push(m.from + m.to + (m.promotion || "")); }
    const first = side === "w" ? 0 : 1;   // 학습자의 첫 수 번호
    const startC = new Chess(); if (first) startC.move(sans[0]);
    const goals = [];
    for (let i = first; i < sans.length; i += 2) {
      const idea = (j) => (extra[j] ? extra[j]() : openingIdeaAt(sans.slice(0, j + 1)));
      const mine = idea(i) || t("이 오프닝의 다음 수를 두세요.");
      // 바로 앞 상대 수(백의 첫 수 또는 응수)의 의도를 먼저 알려 주고, 이어서 둘 수의 의도를 알려 준다
      const before = i > 0 ? idea(i - 1) : null;
      const say = before ? t("상대의 수는 {0}입니다.", sans[i - 1]) + " " + before + " " + t("다음 수의 의도는 이렇습니다.") + " " + mine : mine;
      goals.push({ goal: { uci: [ucis[i]] }, hint: ucis[i], reply: ucis[i + 1], say });
    }
    goals[goals.length - 1].reply = undefined;
    const endC = new Chess(); for (const s of sans) endC.move(s);   // 수순은 항상 학습자의 수로 끝난다(check-lessons)
    const fam0 = openingFamily(fam) || {};
    const opts = [famName(), ...wrong.map((w) => (openingFamily(w) || {}).name || w)];
    const ans = k % 3;   // 정답 위치를 레슨마다 바꾼다
    const options = [...opts.slice(1)]; options.splice(ans, 0, opts[0]);
    return [
      { kind: "read", fen: startC.fen(), say: t("{0}의 주요 수순을 {1}으로 직접 두어 봅니다. 수마다 코치가 그 수의 의도를 알려 줍니다.", famName(), side === "w" ? t("백") : t("흑")) },
      { kind: "move", fen: startC.fen(), say: goals[0].say, line: goals, hint: goals[0].hint },
      { kind: "read", fen: endC.fen(), say: fam0.plan || t("주요 수순을 끝까지 두었습니다.") },
      { kind: "choice", fen: endC.fen(), say: t("지금 둔 오프닝의 이름은?"), options, answer: ans },
    ];
  }) };   // motif: 오프닝 계열, line·side: 주요 수순과 학습자 진영(레슨 경로 배경의 기보·대표 기물에 쓴다)
}
LESSONS.push(...OPENINGS.map(openingLesson));

let _cache = null;
/** 모든 레슨(순서대로) — 단계 정보 포함. steps는 처음 열 때 만든다(번역 반영). */
export function allLessons() {
  if (_cache) return _cache;
  _cache = LESSONS.map((l, i) => ({ id: l.id, stage: l.stage, icon: l.icon, motif: l.motif || null, line: l.line || null, side: l.side || null, index: i, title: l.title, sub: l.sub, steps: l.steps }));
  return _cache;
}
export const stageOf = (id) => STAGES.find((s) => s.id === id) || STAGES[0];
export const lessonById = (id) => allLessons().find((l) => l.id === id) || null;
export const lessonsOfStage = (sid) => allLessons().filter((l) => l.stage === sid);
