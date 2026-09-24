import { T } from "./theme.js";

// 수 등급(brilliant~blunder)별 색·표 행 순서·배지 이미지 — 리뷰 화면(App.jsx)과 공유 이미지
// 카드(shareCard.js)가 반드시 같은 기준을 써야 숫자·색이 어긋나지 않으므로 한곳에 둔다.
export const QCOLOR = { brilliant: T.brilliant, best: T.best, only: T.only, excellent: T.excellent, good: T.good, inaccuracy: T.inaccuracy, miss: "#C8562F", mistake: T.mistake, blunder: T.blunder, book: T.book, pending: T.inkSoft };
export const ANALYSIS_KIND_ROWS = [["brilliant", "탁월합니다"], ["only", "매우 좋아요"], ["best", "최고"], ["excellent", "우수합니다"], ["good", "좋습니다"], ["book", "이론"], ["inaccuracy", "부정확"], ["mistake", "실수"], ["miss", "놓친 수"], ["blunder", "블런더"]];
// (21차) 직접 제작한 원형 배지 이미지(chess.com 스타일). "유일한 수"는 chess.com이 "Great Move"라
// 부르는 자리라 Great 이미지를 쓴다. "Inaccuarcy"는 실제 업로드된 파일명의 오타를 그대로 반영한 것.
export const BADGE_ICON_SRC = {
  brilliant: "/Move Classifications_Brilliant.png",
  only: "/Move Classifications_Great.png",
  best: "/Move Classifications_Best.png",
  excellent: "/Move Classifications_Excellent.png",
  good: "/Move Classifications_Good.png",
  book: "/Move Classifications_Book.png",
  inaccuracy: "/Move Classifications_Inaccuarcy.png",
  mistake: "/Move Classifications_Mistake.png",
  blunder: "/Move Classifications_Blunder.png",
  miss: "/Move Classifications_Miss.png",
};
