// (v0.7.9, 사용자 요청) 레슨 연습 문제 보충 — 레슨마다 본문 뒤·복습 앞에 붙는 새 포지션 문제(수 두기). 레슨 분량(최소 1분)과
//  추가 학습 퍼즐 은행(scripts/build-lesson-puzzles.mjs — 레슨 문제의 대칭 변형)을 넉넉하게 한다. check-lessons가 모든 수를 검증한다.
//  스텝 형식은 curriculum.js와 같다: { kind: "move", fen, say, line: [{ goal, reply?, say? }], hint }
import { t } from "../i18n.js";

const M = (fen, say, goal, hint, more) => ({ kind: "move", fen, say, line: [{ goal, ...(more || {}) }], hint });

export const PRACTICE = {
  r_castle: () => [
    M("r1bqk2r/pppp1ppp/2n2n2/2b1p3/2B1P3/5N2/PPPP1PPP/RNBQK2R w KQkq - 4 5", t("킹사이드로 캐슬링하세요. 킹을 g1으로 옮기면 됩니다."), { castle: "k" }, "e1g1"),
    M("r3kbnr/pppqpppp/2n5/3p1b2/3P1B2/2N5/PPPQPPPP/R3KBNR w KQkq - 6 5", t("이번에는 퀸사이드로 캐슬링하세요. 킹을 c1으로 옮기면 룩이 d1으로 넘어옵니다."), { castle: "q" }, "e1c1"),
  ],
  o_safety: () => [
    M("r1bqkb1r/pppp1ppp/2n2n2/4p3/2B1P3/3P1N2/PPP2PPP/RNBQK2R w KQkq - 1 5", t("캐슬링으로 킹을 안전하게 하세요."), { castle: "k" }, "e1g1"),
    M("rnbqk2r/ppp1bppp/4pn2/3p4/2PP4/2N2N2/PP2PPPP/R1BQKB1R b KQkq - 3 5", t("캐슬링으로 킹을 안전하게 하세요."), { castle: "k" }, "e8g8"),
  ],
  st_doubled: () => [
    M("r1bqkbnr/pppp1ppp/2n5/1B2p3/4P3/5N2/PPPP1PPP/RNBQK2R w KQkq - 3 3", t("비숍으로 c6의 나이트를 잡으세요."), { uci: ["b5c6"] }, "b5c6"),
    M("r1bqk1nr/pppp1ppp/2n5/4p3/1b2P3/2N2N2/PPPP1PPP/R1BQKB1R b KQkq - 5 4", t("비숍으로 c3의 나이트를 잡아 백에게 더블폰을 만드세요."), { uci: ["b4c3"] }, "b4c3"),
  ],
};
