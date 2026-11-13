// (v0.7.6, BUG-165) 리뷰 화면이 받는 대국 객체의 모양을 한 곳에서 맞춘다.
// 리뷰 화면(ReviewPage·openReview)은 수 목록을 game.sans로 읽는데, 서버 공유 캐시(reviewed_games.data, /api/review-put의 sanitizeGame)와
// chess.com 대국 객체는 같은 목록을 game.moves에 둔다. 이 차이 때문에 채팅의 "리뷰 보기"와 /review/(숫자) 링크가 아무 반응 없이 끝났다.
// scripts/check-review-ui.mjs가 시험한다.
export function normalizeReviewGame(game) {
  if (!game || typeof game !== "object") return null;
  if (Array.isArray(game.sans)) return game;
  if (Array.isArray(game.moves) && game.moves.every((s) => typeof s === "string")) return { ...game, sans: game.moves };
  return game;
}
