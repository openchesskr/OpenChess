// (v0.7.4, 사용자 요청) 플레이 퀘스트 — 일반 대국·미니게임에서 조건을 달성하면 클리어되는 퀘스트(일일 퀘스트 아래 블록). 순수 함수라 scripts/check-play-quest.mjs가 시험한다.
// (v0.7.6, 사용자 요청) 날마다 초기화하지 않는 한 번짜리 목표로 바꾸고, 클리어하면 퀘스트당 코인 보상(PLAY_QUEST_COINS)을 준다.
//  · 로그인: 진행 값은 서버가 직접 센다(supabase-setup.sql play_quest_status — 서버가 검증해 저장한 끝난 대국·미니게임 대전). 보상도 서버(economy_claim_play_quest)가
//    그 값을 다시 확인한 뒤에만 준다. 브라우저가 센 숫자로는 코인이 나오지 않는다(BUG-113 원칙).
//  · 로그인 전: 이 기기에서 대국·미니게임이 끝날 때마다 쌓는 값(applyPlayEvent)만 보여 준다(보상 없음).
import { t } from "./i18n.js";

export const GAME_MIN_PLIES = 20;     // 일반 대국은 20수(양쪽 합) 이상 두고 끝나야 인정 — 바로 기권해도 클리어되는 것을 막는다(서버 _play_quest_counts와 같은 값)
export const LONG_GAME_PLIES = 80;    // "40수 이상" = 양쪽 합 80수
export const PLAY_QUEST_COINS = 50;   // 1장 퀘스트당 보상 코인 — 장마다 다르면 퀘스트의 coins를 쓴다. 서버 economy_params().playQuests와 같아야 한다(check-play-quest)

const kindsOf = (s) => (Array.isArray(s.kinds) ? s.kinds.length : Number.isInteger(s.kinds) ? s.kinds : 0);
const METRIC = { game: (s) => s.game, win: (s) => s.win, long: (s) => s.long, mg: (s) => s.mg, kinds: kindsOf, mgwin: (s) => s.mgwin || 0 };
// (v0.7.8, 사용자 요청) "장" 단위 — 한 장의 퀘스트를 모두 클리어해야 다음(더 어려운) 장이 열린다. 진행 값(metric)은 장과 상관없이 처음부터 쌓인 누적 값이다.
//  key: 보상 수령 키(서버 economy_params().playQuests의 키와 같음, 1장은 예전 키 그대로) · metric: 진행 필드(서버 _play_quest_counts 키) · target · coins
const q = (chapter, key, metric, target, coins, title) => ({ chapter, key, metric, target, coins, title, count: METRIC[metric] });
export const PLAY_QUEST_CHAPTERS = [
  [
    q(1, "game", "game", 1, 50, () => t("일반 대국 1판 끝까지 두기")),
    q(1, "win", "win", 1, 50, () => t("일반 대국에서 승리하기")),
    q(1, "long", "long", 1, 50, () => t("40수 이상 이어진 대국 마치기")),
    q(1, "mg", "mg", 2, 50, () => t("미니게임 2판 플레이하기")),
    q(1, "kinds", "kinds", 2, 50, () => t("서로 다른 미니게임 2종 플레이하기")),
  ],
  [
    q(2, "ctwogame", "game", 5, 80, () => t("일반 대국 {0}판 끝까지 두기", 5)),
    q(2, "ctwowin", "win", 3, 80, () => t("일반 대국에서 {0}번 승리하기", 3)),
    q(2, "ctwolong", "long", 3, 80, () => t("40수 이상 이어진 대국 {0}판 마치기", 3)),
    q(2, "ctwomg", "mg", 5, 80, () => t("미니게임 {0}판 플레이하기", 5)),
    q(2, "ctwokinds", "kinds", 4, 80, () => t("미니게임 4종 모두 플레이하기")),
  ],
  [
    q(3, "cthreegame", "game", 20, 120, () => t("일반 대국 {0}판 끝까지 두기", 20)),
    q(3, "cthreewin", "win", 10, 120, () => t("일반 대국에서 {0}번 승리하기", 10)),
    q(3, "cthreelong", "long", 8, 120, () => t("40수 이상 이어진 대국 {0}판 마치기", 8)),
    q(3, "cthreemg", "mg", 15, 120, () => t("미니게임 {0}판 플레이하기", 15)),
    q(3, "cthreemgwin", "mgwin", 5, 120, () => t("미니게임 대전에서 {0}번 승리하기", 5)),
  ],
];
export const PLAY_QUESTS_ALL = PLAY_QUEST_CHAPTERS.flat();
export const PLAY_QUESTS = PLAY_QUEST_CHAPTERS[0];   // 1장(예전 플레이 퀘스트 그대로)
export const emptyPlayQuest = () => ({ game: 0, win: 0, long: 0, mg: 0, mgwin: 0, kinds: [] });

const n = (v) => (Number.isInteger(v) && v >= 0 && v <= 999 ? v : 0);
// 이 기기의 진행값 검증 — 모양이 틀리면 0/빈 값(옛 버전의 date 필드는 무시하고 숫자는 그대로 이어 간다: 더는 날마다 초기화하지 않는다)
export function normalizePlayQuest(s) {
  if (!s || typeof s !== "object") return emptyPlayQuest();
  return { game: n(s.game), win: n(s.win), long: n(s.long), mg: n(s.mg), mgwin: n(s.mgwin), kinds: Array.isArray(s.kinds) ? [...new Set(s.kinds.filter((k) => typeof k === "string" && /^[a-z]{2,16}$/.test(k)))].slice(0, 12) : [] };
}
// 서버 play_quest_status 응답 검증 — { game, win, long, mg, kinds(숫자), claimed: [키] }. 모양이 틀리면 null(화면은 이 기기 값으로 대신한다).
export function normalizeServerPlayQuest(r) {
  if (!r || typeof r !== "object" || !Number.isInteger(r.game)) return null;
  const keys = new Set(PLAY_QUESTS_ALL.map((q) => q.key));
  return { game: n(r.game), win: n(r.win), long: n(r.long), mg: n(r.mg), mgwin: n(r.mgwin), kinds: n(r.kinds), claimed: Array.isArray(r.claimed) ? r.claimed.filter((k) => keys.has(k)) : [], server: true };
}
/* 이벤트: { type: "game", won: bool, plies: number } | { type: "minigame", game: "coord"|"knight"|"rush"|"attack", won?: bool(실시간 대전에서 이겼는지) } */
export function applyPlayEvent(state, ev) {
  const s = normalizePlayQuest(state);
  if (!ev || typeof ev !== "object") return s;
  if (ev.type === "game") {
    if (!Number.isFinite(ev.plies) || ev.plies < GAME_MIN_PLIES) return s;
    return { ...s, game: s.game + 1, win: s.win + (ev.won ? 1 : 0), long: s.long + (ev.plies >= LONG_GAME_PLIES ? 1 : 0) };
  }
  if (ev.type === "minigame") {
    const kinds = typeof ev.game === "string" && /^[a-z]{2,16}$/.test(ev.game) && !s.kinds.includes(ev.game) ? [...s.kinds, ev.game] : s.kinds;
    return { ...s, mg: s.mg + 1, mgwin: s.mgwin + (ev.won === true ? 1 : 0), kinds };
  }
  return s;
}
export const questDone = (q, s) => q.count(s) >= q.target;
export const clearedCount = (s, chapter = 1) => (PLAY_QUEST_CHAPTERS[chapter - 1] || []).filter((q) => questDone(q, s)).length;
export const chapterDone = (s, chapter) => clearedCount(s, chapter) === (PLAY_QUEST_CHAPTERS[chapter - 1] || []).length;
// 장 n이 열렸는지 — 1장은 늘 열림, 그 뒤는 앞 장을 모두 클리어해야 열린다(서버 economy_claim_play_quest도 같은 규칙으로 보상을 막는다).
export const chapterUnlocked = (s, chapter) => chapter <= 1 || (chapter <= PLAY_QUEST_CHAPTERS.length && chapterUnlocked(s, chapter - 1) && chapterDone(s, chapter - 1));
// 지금 진행 중인 장 — 열린 장 중 아직 다 못 깬 첫 장(전부 깼으면 마지막 장)
export function currentChapter(s) {
  for (let c = 1; c <= PLAY_QUEST_CHAPTERS.length; c++) if (!chapterDone(s, c)) return c;
  return PLAY_QUEST_CHAPTERS.length;
}
// 서버 값에서 클리어했지만 아직 보상을 받지 않은 퀘스트 키(App이 자동으로 수령을 요청한다) — 열린 장의 퀘스트만
export const unclaimedKeys = (s) => (s && s.server ? PLAY_QUESTS_ALL.filter((q) => chapterUnlocked(s, q.chapter) && questDone(q, s) && !s.claimed.includes(q.key)).map((q) => q.key) : []);

// 간단한 이벤트 통로 — play.jsx가 알리고 App이 구독한다(두 파일이 서로 import하지 않게).
const listeners = new Set();
export function emitPlayEvent(ev) { listeners.forEach((f) => { try { f(ev); } catch { /* 한 구독자의 오류가 다른 구독자를 막지 않게 */ } }); }
export function onPlayEvent(f) { listeners.add(f); return () => listeners.delete(f); }
