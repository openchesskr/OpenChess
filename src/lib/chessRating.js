// (v0.6.2) 일반 체스 대국 레이팅은 타임 컨트롤 분류(불렛·블리츠·래피드·스탠다드)마다 따로 쌓는다.
// 분류 기준은 서버(supabase-setup.sql _chess_tc_category)와 반드시 같아야 한다 — scripts/check-chess-rating.mjs가 두 값을 대조한다.
// 예상 대국 시간 = 초기시간(초) + 40 × 증가시간(초) (리체스 방식). 이 값이 BULLET_MAX 미만이면 불렛, BLITZ_MAX 미만이면 블리츠, RAPID_MAX 미만이면 래피드, 그 이상은 스탠다드.
export const TC_BULLET_MAX_SEC = 180;
export const TC_BLITZ_MAX_SEC = 480;
export const TC_RAPID_MAX_SEC = 1500;
export const CHESS_RATING_CATS = ["bullet", "blitz", "rapid", "standard"];
export const CHESS_RATING_GAMES = CHESS_RATING_CATS.map((c) => "chess_" + c);
// TIME_CONTROLS의 cat(한국어 고정 값) → 분류 키
export const TC_CAT_KEY = { "불렛": "bullet", "블리츠": "blitz", "래피드": "rapid", "스탠다드": "standard" };
// time_control 키("초기초-증가초", 예 "300-2")의 분류. 형식이 이상하면 래피드(기본 시간 제어와 같음).
export function chessTcCategory(key) {
  const m = /^(\d+)-(\d+)$/.exec(key || "");
  if (!m) return "rapid";
  const est = parseInt(m[1], 10) + 40 * parseInt(m[2], 10);
  return est < TC_BULLET_MAX_SEC ? "bullet" : est < TC_BLITZ_MAX_SEC ? "blitz" : est < TC_RAPID_MAX_SEC ? "rapid" : "standard";
}
// minigame_stats.game 값 — 이 타임 컨트롤로 둔 대국의 레이팅이 쌓이는 행
export function chessRatingGame(key) { return "chess_" + chessTcCategory(key); }
// 'chess_*'(타임 컨트롤별) 레이팅 행인지. 예전 단일 'chess' 행은 더 이상 화면에 쓰지 않는다.
export function isChessRatingGame(game) { return typeof game === "string" && CHESS_RATING_GAMES.includes(game); }
// 분류 키 → TIME_CONTROLS.cat(한국어 고정 값) — 화면에 보일 때는 tcCatLabel로 번역한다.
export const TC_KEY_CAT = { bullet: "불렛", blitz: "블리츠", rapid: "래피드", standard: "스탠다드" };
