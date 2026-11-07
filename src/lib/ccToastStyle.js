// (v0.7.4) chess.com 최근 대국 알림(ChesscomGameToast)과 학습 탭 최근 대국 박스가 같이 쓰는 오프닝·전적 줄의 스타일.
// 승률 칩 테두리색은 도감 전적 칩과 같은 규칙: 표본 3판 미만이거나 승률이 없으면 회갈색, 60% 이상 초록, 40% 이상 노랑, 그 아래 빨강.
import { T } from "./theme.js";
export const CC_TOAST_LABEL_FONT = "'Playfair Display', 'Nanum Myeongjo', serif";
export const ccWrColor = (n, wr) => (n < 3 || wr == null ? "#8A7458" : wr >= 60 ? T.best : wr >= 40 ? T.inaccuracy : T.blunder);
