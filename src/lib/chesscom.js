// (20차 UX3) chess.com 계정을 30일에 한 번만 재변경할 수 있도록 하는 어뷰징 방지 쿨다운.
// 개발자 모드에서는 테스트 편의를 위해 제외한다(호출부에서 별도 체크).
const CHESSCOM_CHANGE_COOLDOWN_MS = 30 * 24 * 60 * 60 * 1000;
export function chesscomChangeDaysLeft(changedAt) {
  if (!changedAt) return 0;
  const remainMs = CHESSCOM_CHANGE_COOLDOWN_MS - (Date.now() - changedAt);
  return remainMs > 0 ? Math.ceil(remainMs / 86400000) : 0;
}
// (버그 수정) chess.com API의 player 응답 중 "username" 필드는 항상 소문자로 정규화되어 온다(실제
// API로 여러 계정을 확인해도 대문자가 섞인 아이디조차 username 필드에서는 전부 소문자였음) — 그동안
// 이 필드를 그대로 화면에 표시해, 사용자가 chess.com에 실제로 등록한 대소문자와 무관하게 항상 전부
// 소문자로만 보였다(반복 신고된 "대소문자 구분이 안 된다" 버그의 근본 원인). 반면 "url" 필드
// (예: https://www.chess.com/member/Hikaru)의 마지막 경로 조각은 실제 표시 대소문자를 그대로
// 보존한다 — 여기서 그 조각을 잘라내 진짜 표시용 아이디로 쓰고, url 파싱이 실패하는 경우에만
// (형식이 바뀌었거나 없는 극단적인 경우) username 필드로 대체한다.
export function chesscomDisplayUsername(p, fallback) {
  if (p && typeof p.url === "string") {
    const m = p.url.match(/\/member\/([^/?#]+)/);
    if (m) { try { return decodeURIComponent(m[1]); } catch { return m[1]; } }
  }
  return p.username || fallback;
}
export function countryFlag(code) { if (!code || code.length !== 2) return ""; return code.toUpperCase().replace(/./g, (c) => String.fromCodePoint(127397 + c.charCodeAt(0))); }
// (19차 기능6) chess.com 게임의 ECO URL(예: https://www.chess.com/openings/Italian-Game-...) → 사람이 읽는 오프닝 이름.
// (버그 수정) chess.com ECO URL 슬러그는 하이픈으로만 이어진 밋밋한 문자열이라(예:
// "Italian-Game-Knight-Attack-Polerio-Bishop-Check-...") 그대로 공백만 채우면 마침표 없는 긴
// 나열이 되어 읽기 어려웠다. 실제 이름 데이터베이스가 없어 완벽히 재현할 수는 없지만, 오프닝
// 명명 관례에서 한 절(clause)을 끝맺는 데 흔히 쓰이는 일반 접미어(Defense·Attack·Variation 등)와
// 그 자체로 독립된 절이 되는 인명(Polerio·Bogoljubov 등)을 기준으로 나눠, 첫 절 뒤에는 ":"를,
// 나머지 절 사이에는 ","를 넣는다. 접미어/인명을 하나도 못 찾으면(즉 절이 하나뿐이면) 이전처럼
// 공백만 채운 문자열을 그대로 반환한다 — 무리하게 잘못 끊느니 안전하게 둔다.
export const OPENING_NAME_TERMINATORS = new Set(["Game", "Opening", "Defense", "Defence", "Attack", "Gambit", "Variation", "System", "Line", "Trap", "Check", "Countergambit", "Formation", "Exchange", "Advance", "Accepted", "Declined", "Deferred", "Refused", "Improved", "Reversed", "Delayed", "Mate", "Sacrifice"]);
const OPENING_NAME_EPONYMS = new Set(["Polerio", "Bogoljubov", "Blackburne", "Marshall", "Moller", "Möller", "Jerome", "Evans", "Traxler", "Lucena", "Philidor", "Steinitz", "Anderssen", "Boden", "Cochrane", "Kieseritzky", "Cunningham", "Krejcik", "Nimzowitsch", "Alekhine", "Rubinstein", "Tarrasch", "Chigorin", "Zukertort", "Colle", "Torre", "Trompowsky", "Veresov", "Benko", "Larsen", "Bronstein", "Botvinnik", "Najdorf", "Taimanov", "Sveshnikov", "Kalashnikov", "Winawer", "MacCutcheon", "Burn", "Levenfish", "Panov", "Shirov", "Gligoric", "Cozio", "Berlin", "Schliemann", "Zaitsev", "Breyer", "Rauzer", "Sozin", "Fischer", "Sokolsky", "Grob", "Staunton", "Morphy", "Greco", "Damiano", "Ponziani", "Owen", "Bird", "Reti", "Budapest", "Albin", "Tartakower", "Kasparov", "Karpov", "Petrosian", "Smyslov", "Euwe", "Lasker", "Capablanca", "Spassky", "Tal"]);
export function segmentOpeningWords(words) {
  const segs = []; let cur = [];
  for (let i = 0; i < words.length; i++) {
    const w = words[i]; cur.push(w);
    const bare = w.replace(/[^A-Za-z]/g, "");
    const next = words[i + 1] ? words[i + 1].replace(/[^A-Za-z]/g, "") : null;
    if (OPENING_NAME_TERMINATORS.has(bare)) { segs.push(cur.join(" ")); cur = []; }
    // 인명 바로 뒤에 접미어가 이어지면(예: "Blackburne Variation") 그 인명은 다음 절의 수식어일
    // 뿐이니 아직 끊지 않고, 접미어에서 끊는다. 접미어가 안 이어지면 인명 자체가 독립된 절이다.
    else if (OPENING_NAME_EPONYMS.has(bare) && !(next && OPENING_NAME_TERMINATORS.has(next))) { segs.push(cur.join(" ")); cur = []; }
  }
  if (cur.length) segs.push(cur.join(" "));
  return segs;
}
export function ecoOpeningName(ecoUrl) {
  if (!ecoUrl || typeof ecoUrl !== "string") return null;
  const m = ecoUrl.match(/\/openings\/([^/?#]+)/);
  if (!m) return null;
  const slug = decodeURIComponent(m[1]).replace(/-\d.*$/, "");
  const words = slug.split("-").filter(Boolean);
  if (!words.length) return null;
  const segs = segmentOpeningWords(words);
  if (segs.length <= 1) return words.join(" ").trim();
  return segs[0] + ": " + segs.slice(1).join(", ");
}
// (디자인) 레이팅 증감치 계산 — 같은 타임클래스(rapid/blitz/bullet 등)끼리 시간순으로 정렬해, 바로
// 직전 대국 대비 이번 대국에서의 레이팅 변화량을 구한다. 집중분석·프로필의 "최근 대국" 목록에서
// 공용으로 써서 두 화면의 표기를 통일한다.
export function computeRatingChanges(games) {
  const map = new Map();
  const byClass = {};
  for (const g of games || []) { if (!g.timeClass) continue; (byClass[g.timeClass] = byClass[g.timeClass] || []).push(g); }
  for (const arr of Object.values(byClass)) {
    const sorted = [...arr].sort((a, b) => (a.endTime || 0) - (b.endTime || 0));
    for (let i = 1; i < sorted.length; i++) {
      if (sorted[i].rating != null && sorted[i - 1].rating != null) map.set(sorted[i], sorted[i].rating - sorted[i - 1].rating);
    }
  }
  return map;
}
// (v0.2.6 성능) chess.com 대국 캐시 — 계정별로 이미 받은 대국 목록 + 다 받은 달(archive) 목록을
// localStorage에 저장해 둔다. 버전 번호를 키에 넣어 두면, 나중에 저장 구조가 바뀌어도 예전 캐시를
// 안전하게 무시(재요청)하게 할 수 있다. 다른 localStorage 캐시들(occ_bgm_on 등)과 같은 접두어·
// try/catch 관례를 따른다 — 캐시는 있으면 좋은 부가 기능일 뿐이라 실패해도 앱 동작에 지장이 없어야 한다.
// (v0.3.4 버그 수정) "리뷰한 대국만" 필터(reviewGameKey → white.username+black.username+endTime
// 조합)가, 분명 리뷰한 대국인데도 아무것도 안 뜨는 문제의 근본 원인 — game.white/black 객체는
// 원래 상대 쪽 정보까지 담도록 나중에 추가된 필드인데(바로 아래 주석 참고), 이 캐시 버전은 그
// 스키마 변경 때 함께 올라가지 않았다. 그 결과 아직 최신 달이 아니라서 다시 안 받아 온 옛 캐시
// 항목은 white/black 키 자체가 아예 없는 구버전 형태로 localStorage에 계속 남아 있을 수 있었다 —
// reviewGameKey(g)가 이런 게임에서는 null을 반환해, 리뷰를 열어도 reviewUnlocked에 전혀 기록되지
// 않고(티켓도 소모 안 됨) "리뷰한 대국만" 필터에서도 영원히 걸러졌다(=리뷰 기록이 저장 자체가
// 안 되는 것처럼 보인 원인). 버전을 올려 캐시 키를 바꾸면 옛 캐시가 자동으로 무시되고 모든 달을
// 새 스키마로 한 번 다시 받아 오므로, 이후로는 모든 대국이 항상 white/black을 갖게 된다.
// (v0.3.4 버그 수정) 게임 리뷰 고유 URL(사용자 요청)의 chess.com 대국 식별자로 쓰기 위해 게임마다
// chess.com 자신의 숫자 게임 ID(g.url 끝자리, 예: .../game/live/12345678 → 12345678)를 새로
// 저장한다 — 이 필드 하나가 스키마에 추가되므로 옛 캐시는 무시하고 한 번 다시 받아 온다.
export const CHESSCOM_CACHE_VERSION = 3;
export function chesscomCacheKey(u) { return "occ_chesscom_v" + CHESSCOM_CACHE_VERSION + "_" + u; }
// (v0.3.4 기능) chess.com 대국 URL(g.url, 예: "https://www.chess.com/game/live/12345678" 또는
// ".../game/daily/12345678")에서 끝자리 숫자 ID만 뽑는다 — 사용자 요청대로 이 게임 리뷰의 고유
// URL 식별자로 chess.com이 이미 발급한 이 값을 "그대로" 쓴다.
export function extractChesscomGameId(url) {
  if (!url) return null;
  const m = /\/(\d+)\/?(?:\?.*)?$/.exec(url);
  return m ? m[1] : null;
}
export function loadChesscomCache(u) {
  try {
    const raw = window.localStorage.getItem(chesscomCacheKey(u));
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || !Array.isArray(parsed.games) || !Array.isArray(parsed.fetchedMonths)) return null;
    return parsed;
  } catch { return null; }
}
export function saveChesscomCache(u, data) {
  try { window.localStorage.setItem(chesscomCacheKey(u), JSON.stringify(data)); } catch { /* 용량 초과 등은 무시 */ }
}
