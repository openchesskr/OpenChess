// (v0.6.8) 칭호 정의·판정 — 화면(React) 코드와 분리한 순수 모듈. 새 칭호를 더하려면 TITLE_SERIES에 한 줄을 추가하면 된다.
//  · 칭호 하나 = 계열(series)의 한 단계. id는 "계열키:단계번호"(1부터). 예: "solve:3", "italian:5".
//  · 계열마다 5단계(희귀 계열은 1단계)의 기준값(mins)과 이름(names)을 가진다. 이름은 영어 고정(기존 칭호와 같음).
//  · 판정은 지표(metric) 값이 기준 이상인지로만 한다. 오프닝 계열만 "퍼즐 해결 + chess.com 플레이" 두 지표를 모두 요구한다.
//  · 지표 계산(computeTitleMetrics)은 App이 가진 값만 쓴다. 새 지표를 더하면 METRIC_KEYS·check-titles 검사에도 반영할 것.

// 오프닝 트리(도감)에서 대표 오프닝 이름으로 쓰는 13개 오프닝. 칭호의 오프닝 숙련 계열도 이 목록을 쓴다.
export const TITLE_OPENINGS = [
  { key: "italian", label: "Italian Game", rx: /italian/i },
  { key: "ruylopez", label: "Ruy Lopez", rx: /ruy ?lopez|spanish/i },
  { key: "scotch", label: "Scotch Game", rx: /scotch/i },
  { key: "sicilian", label: "Sicilian Defense", rx: /sicilian/i },
  { key: "carokann", label: "Caro-Kann Defense", rx: /caro.?kann/i },
  { key: "french", label: "French Defense", rx: /french/i },
  { key: "vienna", label: "Vienna Game", rx: /vienna/i },
  { key: "kingsgambit", label: "King's Gambit", rx: /king.?s gambit/i },
  { key: "benoni", label: "Benoni Defense", rx: /benoni/i },
  { key: "catalan", label: "Catalan Opening", rx: /catalan/i },
  { key: "grunfeld", label: "Grünfeld Defense", rx: /gr(u|ü)nfeld/i },
  { key: "london", label: "London System", rx: /london/i },
  { key: "queensgambit", label: "Queen's Gambit", rx: /queen.?s gambit/i },
];

// 칭호 전용으로 늘린 오프닝. 도감 트리 라벨(위 TITLE_OPENINGS)에는 영향을 주지 않는다. 집계는 먼저 맞는 오프닝 하나에만 센다 — Evans는 Italian 변형 이름 안에 있어 맨 앞에 둔다.
const EXTRA_BEFORE = [{ key: "evans", label: "Evans Gambit", rx: /evans/i }];
const EXTRA_AFTER = [
  { key: "english", label: "English Opening", rx: /english/i },
  { key: "reti", label: "Réti Opening", rx: /r[eé]ti/i },
  { key: "danish", label: "Danish Gambit", rx: /danish/i },
  { key: "pirc", label: "Pirc Defense", rx: /pirc|modern defen[cs]e/i },
  { key: "alekhine", label: "Alekhine's Defense", rx: /alekhine/i },
  { key: "scandinavian", label: "Scandinavian Defense", rx: /scandinavian|center counter/i },
  { key: "dutch", label: "Dutch Defense", rx: /dutch/i },
  { key: "slav", label: "Slav Defense", rx: /\bslav\b/i },
  { key: "kingsindian", label: "King's Indian Defense", rx: /king.?s indian/i },
  { key: "nimzo", label: "Nimzo-Indian Defense", rx: /nimzo/i },
  { key: "queensindian", label: "Queen's Indian Defense", rx: /queen.?s indian/i },
  { key: "philidor", label: "Philidor Defense", rx: /philidor/i },
  { key: "petrov", label: "Petrov's Defense", rx: /petrov|petroff|russian game/i },
];
export const OPENING_FAMILIES = [...EXTRA_BEFORE, ...TITLE_OPENINGS, ...EXTRA_AFTER];   // 집계 순서(먼저 맞는 오프닝에 센다)
const OPENING_DISPLAY = [...TITLE_OPENINGS, ...EXTRA_BEFORE, ...EXTRA_AFTER];          // 화면 표시 순서
// 오프닝을 두는 진영: 엠블럼 뒤 기물 색(백이 두는 오프닝은 흰 기물, 흑의 방어는 검은 기물)
const BLACK_SIDE = new Set(["sicilian", "carokann", "french", "benoni", "grunfeld", "pirc", "alekhine", "scandinavian", "dutch", "slav", "kingsindian", "nimzo", "queensindian", "philidor", "petrov"]);
export const openingSide = (key) => (BLACK_SIDE.has(key) ? "b" : "w");

export const TITLE_CATEGORIES = [
  { key: "opening", label: "오프닝 숙련" },
  { key: "activity", label: "활동" },
  { key: "game", label: "대국·레이팅" },
  { key: "rare", label: "히든 칭호" },
];

// 오프닝 계열 공통 기준: 퍼즐 해결 수(mins) + chess.com 해당 오프닝 플레이 수(ccMins)를 모두 채워야 한다.
const OPENING_MINS = [1, 2, 4, 8, 15];   // (v0.6.9) 퍼즐 해결 수 대폭 완화(기존 3·10·25·60·120)
const OPENING_CC_MINS = [10, 30, 100, 300, 1000];
const OPENING_NAMES = ["초급", "중급", "상급", "마스터", "그랜드마스터"];   // 기존 5단계(Beginner·Intermediate·Advanced·Master·GrandMaster). 화면에서는 common.jsx titleNameText가 언어별로 번역한다

// icon은 common.jsx의 TITLE_ICONS가 lucide 아이콘으로 바꾼다(여기는 이름만).
const S = (key, cat, label, icon, metric, mins, names) => ({ key, cat, label, icon, metric, mins, names });
export const TITLE_SERIES = [
  ...OPENING_DISPLAY.map((f) => ({ key: f.key, cat: "opening", label: f.label, icon: "Compass", metric: "opening", mins: OPENING_MINS, ccMins: OPENING_CC_MINS, names: OPENING_NAMES })),
  // 활동
  S("solve", "activity", "퍼즐 솔버", "Puzzle", "solved", [1, 10, 50, 200, 1000], ["루키", "전술가", "문제 해결사", "퍼즐 달인", "퍼즐 전설"]),
  S("daily", "activity", "데일리 스트릭", "Flame", "dailyBest", [3, 7, 14, 30, 100], ["워밍업", "주간 단골", "2주 연속", "먼슬리 루틴", "이터널 플레임"]),
  S("dex", "activity", "오프닝 라이브러리", "BookOpen", "unlocked", [10, 50, 200, 500, 1500], ["책장 넘기기", "책벌레", "아키비스트", "학자", "대사서"]),
  S("community", "activity", "커뮤니티", "Heart", "community", [1, 10, 50, 200, 1000], ["뉴페이스", "서포터즈", "치어리더", "후원자", "앰배서더"]),
  S("friends", "activity", "소셜 서클", "Users", "friends", [1, 3, 10, 25, 50], ["버디", "트리오", "스쿼드", "모임", "인플루언서"]),
  S("coins", "activity", "보물창고", "Coins", "coins", [100, 500, 2000, 5000, 20000], ["푼돈", "저축가", "뱅커", "타이쿤", "용의 보물"]),
  // 대국·레이팅
  S("tier", "game", "티어", "Trophy", "tierIndex", [1, 2, 3, 4, 6], ["브론즈 등반가", "실버 등반가", "골드 등반가", "다이아몬드 등반가", "그랜드마스터 승천자"]),
  S("prating", "game", "퍼즐 레이팅", "Target", "puzzleRating", [1000, 1400, 1800, 2200, 2600], ["떠오르는 별", "날카로운 눈", "예리한 감각", "엘리트", "신동"]),
  S("ccplayed", "game", "플레이 로그", "Swords", "ccPlayed", [10, 50, 200, 1000, 5000], ["신참", "단골", "베테랑", "노력파", "마라토너"]),
  S("ccwins", "game", "승리", "Medal", "ccWins", [5, 25, 100, 500, 2000], ["퍼스트 블러드", "승자", "정복자", "군벌", "멈출 수 없는"]),
  S("ccrating", "game", "피크 레이팅", "TrendingUp", "ccBestRating", [800, 1200, 1600, 2000, 2400], ["등반가", "도전자", "챌린저", "전문가", "마스터 클래스"]),
  S("ccstreak", "game", "연승", "Zap", "ccWinStreak", [3, 5, 8, 12, 20], ["모멘텀", "불타는 중", "폭주", "저거너트", "무적"]),
  S("ccmate", "game", "체크메이트", "Crown", "ccMates", [1, 10, 50, 200, 1000], ["피니셔", "클로저", "집행자", "암살자", "저승사자"]),
  S("ccquick", "game", "전격전", "Rocket", "ccQuickWins", [1, 5, 20, 50, 200], ["기습", "날쌘 손", "번개", "폭풍", "빛의 속도"]),
  S("ccmarathon", "game", "지구력", "Hourglass", "ccLongWins", [1, 5, 20, 50, 150], ["긴 승부", "인내심", "강철 의지", "마라톤", "불멸의 대국"]),
  S("ccwhite", "game", "백의 길", "Sun", "ccWhiteWins", [10, 50, 200, 500, 2000], ["퍼스트 무버", "이니셔티브", "템포", "지배", "새벽빛"]),
  S("ccblack", "game", "흑의 길", "Moon", "ccBlackWins", [10, 50, 200, 500, 2000], ["맞받아치기", "수비수", "기다리는 사냥꾼", "밤의 군림", "이클립스"]),
  S("ccgiant", "game", "거인 사냥꾼", "Sword", "ccGiantWins", [1, 5, 20, 50, 150], ["언더독", "업셋", "자이언트 킬러", "용 사냥꾼", "다윗"]),
  S("ccdraw", "game", "피스메이커", "Handshake", "ccDraws", [1, 10, 40, 100, 300], ["휴전", "외교관", "협상가", "스테일메이트 현자", "평정심"]),
  S("ccblitz", "game", "블리츠 러시", "Timer", "ccBlitzWins", [10, 50, 200, 800, 3000], ["퀵 스타트", "스피드스터", "플래시", "타임 브레이커", "블리츠 킹"]),
  S("ccrapid", "game", "래피드 클래식", "Clock", "ccRapidWins", [5, 25, 100, 400, 1500], ["페이스 메이커", "메트로놈", "클래식 장인", "래피드 거장", "래피드 황제"]),
  S("ccpromo", "game", "프로모션 마스터", "ChevronsUp", "ccPromos", [1, 5, 20, 60, 200], ["폰 러너", "라이징 폰", "퀸 메이커", "사령관", "폰 스톰"]),
  // 히든(= 옛 "희귀", 한 단계짜리 한정·업적 칭호 + 칭호 수집). 안 얻은 동안은 해금 조건을 화면에 보이지 않는다(내부 키는 rare 그대로).
  S("r_night", "rare", "올빼미", "MoonStar", "ccNight", [30], ["자정 너머"]),
  S("r_explorer", "rare", "탐험가", "Compass", "ccOpenings", [50], ["개척자"]),
  S("r_onetrick", "rare", "외길 인생", "Target", "ccTopOpening", [150], ["한 우물"]),
  S("r_year", "rare", "나이트의 해", "Flame", "dailyBest", [365], ["멈추지 않는 습관"]),
  S("r_perfect", "rare", "완벽주의자", "Gem", "solved", [3000], ["무결점"]),
  S("r_prodigy", "rare", "퍼즐 신동", "Star", "puzzleRating", [3000], ["인간을 넘어서"]),
  S("r_streak", "rare", "무패 가도", "Flame", "ccWinStreak", [30], ["무패"]),
  S("r_peak", "rare", "정점", "Crown", "ccBestRating", [2600], ["정상"]),
  S("collect", "rare", "컬렉터", "Library", "titlesEarned", [15, 40, 90, 150, 220], ["컬렉터", "큐레이터", "감정가", "완성주의자", "명예의 전당"]),
];

// 계열별 포인트 색(배너 바탕에 은은하게 섞임). 오프닝은 상징하는 국기·인물 색, 나머지는 계열 성격에 맞춘 색.
const ACCENT = { italian: "#1E7A44", ruylopez: "#A8202A", scotch: "#1F5FA8", sicilian: "#C8761A", carokann: "#3A3A58", french: "#2A4F9A", vienna: "#B02A36", kingsgambit: "#8A2A3A", benoni: "#2A6A86", catalan: "#B8921A", grunfeld: "#2A7A52", london: "#B02A36", queensgambit: "#7A3E8A", evans: "#2E7A4A", english: "#2A3F7A", reti: "#2A5FA0", danish: "#B02A36", pirc: "#6A3A8A", alekhine: "#2A4A7A", scandinavian: "#2A5FA0", dutch: "#C0561F", slav: "#2A4F9A", kingsindian: "#C8761A", nimzo: "#2A6A86", queensindian: "#2A6A6A", philidor: "#4A4A6A", petrov: "#8A2A3A",
  solve: "#2E6B8A", daily: "#B8501F", dex: "#7A5A34", community: "#A33A5E", friends: "#3E7A4C", coins: "#A5821E", tier: "#5B3E8A", prating: "#2A7A7A", ccplayed: "#7A2E2E", ccwins: "#8A6B1F", ccrating: "#2E5E8A", ccstreak: "#C0561F", ccmate: "#6E1F40", ccquick: "#2A6E8A", ccmarathon: "#4A4A70", ccwhite: "#8A8672", ccblack: "#2A2A38", ccgiant: "#5E7A2E", ccdraw: "#4A6E6A", ccblitz: "#C0561F", ccrapid: "#2E6E8E", ccpromo: "#7A4A9A", r_streak: "#B8501F", r_peak: "#8A6B1F",
  r_night: "#3A2E7A", r_explorer: "#2A6A5A", r_onetrick: "#7A2A2A", r_year: "#B8501F", r_perfect: "#2A7A8A", r_prodigy: "#6A2A7A", collect: "#5B3E8A" };
export const seriesAccent = (key) => ACCENT[key] || "#7A5A34";
export const TITLE_TIER_COUNT = 5;
export const titleId = (seriesKey, tier) => seriesKey + ":" + tier;
const SERIES_BY_KEY = new Map(TITLE_SERIES.map((s) => [s.key, s]));
export const seriesOf = (key) => SERIES_BY_KEY.get(key) || null;
/** id → { id, series, tier(1~), min, ccMin, name, label, rare } 또는 null(없는 칭호). */
export function titleDef(id) {
  if (typeof id !== "string") return null;
  const i = id.lastIndexOf(":"); if (i < 0) return null;
  const s = SERIES_BY_KEY.get(id.slice(0, i)); const tier = Number(id.slice(i + 1));
  if (!s || !Number.isInteger(tier) || tier < 1 || tier > s.mins.length) return null;
  return { id, series: s, tier, min: s.mins[tier - 1], ccMin: s.ccMins ? s.ccMins[tier - 1] : 0, name: s.names[tier - 1], label: s.label, rare: s.cat === "rare" && s.mins.length === 1 };
}
export const validTitleId = (id) => !!titleDef(id);
export const sanitizeTitleSet = (arr) => new Set((Array.isArray(arr) ? arr : []).filter(validTitleId));
export const ALL_TITLE_IDS = TITLE_SERIES.flatMap((s) => s.mins.map((_, i) => titleId(s.key, i + 1)));
/** 알림·팝업에 쓰는 이름 한 줄: "Italian Game Initiate", "Puzzles Tactician". */
export function titleLabel(id) { const d = titleDef(id); return d ? d.label + " " + d.name : ""; }

// ── 지표 계산 ──
/** chess.com 대국 목록 → 칭호용 집계. 대국 수천 건도 한 번 훑는다. g: { moves, color, result, rating, endTime, white, black, opening }. */
export function ccTitleStats(games) {
  const o = { ccPlayed: 0, ccWins: 0, ccDraws: 0, ccWhiteWins: 0, ccBlackWins: 0, ccBestRating: 0, ccWinStreak: 0, ccMates: 0, ccQuickWins: 0, ccLongWins: 0, ccGiantWins: 0, ccNight: 0, ccOpenings: 0, ccTopOpening: 0, ccBlitzWins: 0, ccRapidWins: 0, ccPromos: 0 };
  if (!games || !games.length) return o;
  const byTime = games.slice().sort((a, b) => (a.endTime || 0) - (b.endTime || 0));
  const opens = new Map(); let run = 0;
  for (const g of byTime) {
    o.ccPlayed++;
    if (g.rating != null && g.rating > o.ccBestRating) o.ccBestRating = g.rating;
    const mv = g.moves || [];
    if (g.opening) opens.set(g.opening, (opens.get(g.opening) || 0) + 1);
    { const me = g.color === "w" ? 0 : 1; if (mv.some((x, i) => i % 2 === me && x.includes("="))) o.ccPromos++; }   // 내가 승격한 대국
    if (g.endTime) { const h = new Date(g.endTime * 1000).getHours(); if (h < 5) o.ccNight++; }
    if (g.result === "win") {
      o.ccWins++; run++; if (g.timeClass === "blitz") o.ccBlitzWins++; else if (g.timeClass === "rapid") o.ccRapidWins++; if (run > o.ccWinStreak) o.ccWinStreak = run;
      if (g.color === "w") o.ccWhiteWins++; else o.ccBlackWins++;
      const last = mv[mv.length - 1]; if (last && last.endsWith("#")) o.ccMates++;
      if (mv.length <= 60) o.ccQuickWins++;
      if (mv.length >= 120) o.ccLongWins++;
      const opp = g.color === "w" ? (g.black && g.black.rating) : (g.white && g.white.rating);
      if (opp != null && g.rating != null && opp - g.rating >= 100) o.ccGiantWins++;
    } else { run = 0; if (g.result === "draw") o.ccDraws++; }
  }
  o.ccOpenings = opens.size; for (const v of opens.values()) if (v > o.ccTopOpening) o.ccTopOpening = v;
  return o;
}
/** inp: { solved, puzzleRating, tierIndex, dailyBest, unlocked, community, friends, coins, cc(ccTitleStats 결과), openingSolved{key:n}, openingCc{key:n} } → 지표 객체. */
export function computeTitleMetrics(inp) {
  const m = { solved: inp.solved || 0, puzzleRating: inp.puzzleRating || 0, tierIndex: inp.tierIndex || 0, dailyBest: inp.dailyBest || 0, unlocked: inp.unlocked || 0, community: inp.community || 0, friends: inp.friends || 0, coins: inp.coins || 0, ...(inp.cc || ccTitleStats(null)), titlesEarned: 0 };
  m.openingSolved = inp.openingSolved || {}; m.openingCc = inp.openingCc || {};
  return m;
}
const reached = (s, i, m) => {
  if (s.metric === "opening") return (m.openingSolved[s.key] || 0) >= s.mins[i] && (m.openingCc[s.key] || 0) >= s.ccMins[i];
  return (m[s.metric] || 0) >= s.mins[i];
};
/** 지표 → 지금 달성한 칭호 id 집합. 칭호 수집 계열은 나머지 칭호 수를 센 뒤 마지막에 판정한다. */
export function achievableTitles(m) {
  const out = new Set(); const meta = [];
  for (const s of TITLE_SERIES) { if (s.metric === "titlesEarned") { meta.push(s); continue; } s.mins.forEach((_, i) => { if (reached(s, i, m)) out.add(titleId(s.key, i + 1)); }); }
  const n = out.size;
  for (const s of meta) s.mins.forEach((min, i) => { if (n >= min) out.add(titleId(s.key, i + 1)); });
  return out;
}
/** 그 칭호 계열의 현재 진행 값(화면 표시·조건 문구용). 오프닝은 퍼즐 해결 수. */
export function seriesProgress(s, m, earnedCount) {
  if (s.metric === "opening") return (m.openingSolved || {})[s.key] || 0;
  if (s.metric === "titlesEarned") return earnedCount || 0;
  return m[s.metric] || 0;
}
