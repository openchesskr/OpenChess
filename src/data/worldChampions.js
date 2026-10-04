// (v0.6.3) 도감 "마스터" 모식도 데이터 — 역대 세계 체스 챔피언과, 그 챔피언에게 도전했다가 탈락한 마스터.
//  · 가운데 줄(lane "C")은 정통 계보(lineal): 1886 슈타이니츠 → … → 구케시. 1993~2006 분열기에는 왼쪽(L, PCA→클래식)·오른쪽(R, FIDE) 두 줄로 갈라졌다가 2006년 통합전에서 합쳐진다.
//  · 챔피언 한 번의 재위 = 노드 하나(같은 사람이 여러 번이면 노드도 여러 개). defenses = 그 재위 중 치른 타이틀전. sat: true인 상대는 "한 번도 정통 챔피언이 되지 못한 도전자"라 챔피언 옆 위성 노드로 그린다.
//  · 이름: name = 로마자(한국어 외 언어), ko = 한국어 표기(AI 초안 — 검수 필요). 점수는 "챔피언–도전자", 괄호는 타이브레이크. 확실하지 않은 점수는 null로 둔다(화면에서 생략).
//  · 기준 시점: 2026-10. 2026 세계선수권(구케시 vs 신다로프, 2026.11.24~12.12 제네바 예정)은 UPCOMING에 있고, 끝나면 CHAMPIONS·TRANSFERS를 갱신한다.
//  · 구조 검증: scripts/check-masters.mjs(prebuild).
export const CHAMPIONS = [
  { id: "steinitz", name: "Wilhelm Steinitz", ko: "빌헬름 슈타이니츠", cc: "AUT", from: 1886, to: 1894, lane: "C", defenses: [
    { y: 1886, opp: "Johannes Zukertort", ko: "요하네스 추커토르트", cc: "GBR", score: "12½–7½", sat: true, won: true },
    { y: 1889, opp: "Mikhail Chigorin", ko: "미하일 치고린", cc: "RUS", score: "10½–6½", sat: true },
    { y: 1891, opp: "Isidor Gunsberg", ko: "이시도르 군스베르크", cc: "GBR", score: "10½–8½", sat: true },
    { y: 1892, opp: "Mikhail Chigorin", ko: "미하일 치고린", cc: "RUS", score: "12½–10½", sat: true },
  ] },
  { id: "lasker", name: "Emanuel Lasker", ko: "에마누엘 라스커", cc: "GER", from: 1894, to: 1921, lane: "C", defenses: [
    { y: 1897, opp: "Wilhelm Steinitz", ko: "빌헬름 슈타이니츠", cc: "AUT", score: "12½–4½" },
    { y: 1907, opp: "Frank Marshall", ko: "프랭크 마셜", cc: "USA", score: "11½–3½", sat: true },
    { y: 1908, opp: "Siegbert Tarrasch", ko: "지크베르트 타라슈", cc: "GER", score: "10½–5½", sat: true },
    { y: 1909, opp: "David Janowski", ko: "다비드 야노프스키", cc: "FRA", score: "8–2", sat: true },
    { y: 1910, opp: "Carl Schlechter", ko: "카를 슐레히터", cc: "AUT", score: "5–5", sat: true, draw: true },
    { y: 1910, opp: "David Janowski", ko: "다비드 야노프스키", cc: "FRA", score: "9½–1½", sat: true },
  ] },
  { id: "capablanca", name: "José Raúl Capablanca", ko: "호세 라울 카파블랑카", cc: "CUB", from: 1921, to: 1927, lane: "C", defenses: [] },
  { id: "alekhine1", name: "Alexander Alekhine", ko: "알렉산드르 알레힌", cc: "FRA", from: 1927, to: 1935, lane: "C", defenses: [
    { y: 1929, opp: "Efim Bogoljubov", ko: "예핌 보골류보프", cc: "GER", score: "15½–9½", sat: true },
    { y: 1934, opp: "Efim Bogoljubov", ko: "예핌 보골류보프", cc: "GER", score: "15½–10½", sat: true },
  ] },
  { id: "euwe", name: "Max Euwe", ko: "막스 오이버", cc: "NED", from: 1935, to: 1937, lane: "C", defenses: [] },
  { id: "alekhine2", name: "Alexander Alekhine", ko: "알렉산드르 알레힌", cc: "FRA", from: 1937, to: 1946, lane: "C", defenses: [] },
  { id: "botvinnik1", name: "Mikhail Botvinnik", ko: "미하일 보트비니크", cc: "URS", from: 1948, to: 1957, lane: "C", defenses: [
    { y: 1948, opp: "Paul Keres", ko: "파울 케레스", cc: "EST", score: "10½/20", sat: true, tourney: true },
    { y: 1948, opp: "Samuel Reshevsky", ko: "새뮤얼 레셰프스키", cc: "USA", score: "10½/20", sat: true, tourney: true },
    { y: 1951, opp: "David Bronstein", ko: "다비드 브론슈타인", cc: "URS", score: "12–12", sat: true, draw: true },
    { y: 1954, opp: "Vasily Smyslov", ko: "바실리 스미슬로프", cc: "URS", score: "12–12", draw: true },
  ] },
  { id: "smyslov", name: "Vasily Smyslov", ko: "바실리 스미슬로프", cc: "URS", from: 1957, to: 1958, lane: "C", defenses: [] },
  { id: "botvinnik2", name: "Mikhail Botvinnik", ko: "미하일 보트비니크", cc: "URS", from: 1958, to: 1960, lane: "C", defenses: [] },
  { id: "tal", name: "Mikhail Tal", ko: "미하일 탈", cc: "LAT", from: 1960, to: 1961, lane: "C", defenses: [] },
  { id: "botvinnik3", name: "Mikhail Botvinnik", ko: "미하일 보트비니크", cc: "URS", from: 1961, to: 1963, lane: "C", defenses: [] },
  { id: "petrosian", name: "Tigran Petrosian", ko: "티그란 페트로시안", cc: "ARM", from: 1963, to: 1969, lane: "C", defenses: [
    { y: 1966, opp: "Boris Spassky", ko: "보리스 스파스키", cc: "URS", score: "12½–11½" },
  ] },
  { id: "spassky", name: "Boris Spassky", ko: "보리스 스파스키", cc: "URS", from: 1969, to: 1972, lane: "C", defenses: [] },
  { id: "fischer", name: "Bobby Fischer", ko: "바비 피셔", cc: "USA", from: 1972, to: 1975, lane: "C", defenses: [] },
  { id: "karpov1", name: "Anatoly Karpov", ko: "아나톨리 카르포프", cc: "URS", from: 1975, to: 1985, lane: "C", defenses: [
    { y: 1978, opp: "Viktor Korchnoi", ko: "빅토르 코르치노이", cc: "URS", score: "16½–15½", sat: true },
    { y: 1981, opp: "Viktor Korchnoi", ko: "빅토르 코르치노이", cc: "SUI", score: "11–7", sat: true },
  ] },
  { id: "kasparov1", name: "Garry Kasparov", ko: "가리 카스파로프", cc: "URS", from: 1985, to: 1993, lane: "C", defenses: [
    { y: 1986, opp: "Anatoly Karpov", ko: "아나톨리 카르포프", cc: "URS", score: "12½–11½" },
    { y: 1987, opp: "Anatoly Karpov", ko: "아나톨리 카르포프", cc: "URS", score: "12–12", draw: true },
    { y: 1990, opp: "Anatoly Karpov", ko: "아나톨리 카르포프", cc: "URS", score: "12½–11½" },
  ] },
  // ── 분열기(1993~2006): 왼쪽 = PCA→클래식 계보, 오른쪽 = FIDE 계보 ──
  { id: "kasparov2", name: "Garry Kasparov", ko: "가리 카스파로프", cc: "RUS", from: 1993, to: 2000, lane: "L", tag: "PCA", defenses: [
    { y: 1993, opp: "Nigel Short", ko: "나이절 쇼트", cc: "ENG", score: "12½–7½", sat: true },
    { y: 1995, opp: "Viswanathan Anand", ko: "비스와나탄 아난드", cc: "IND", score: "10½–7½" },
  ] },
  { id: "karpov2", name: "Anatoly Karpov", ko: "아나톨리 카르포프", cc: "RUS", from: 1993, to: 1999, lane: "R", tag: "FIDE", defenses: [
    { y: 1993, opp: "Jan Timman", ko: "얀 팀만", cc: "NED", score: "12½–8½", sat: true, won: true },
    { y: 1996, opp: "Gata Kamsky", ko: "가타 캄스키", cc: "USA", score: "10½–7½", sat: true },
    { y: 1998, opp: "Viswanathan Anand", ko: "비스와나탄 아난드", cc: "IND", score: "3–3 (2–0)" },
  ] },
  { id: "khalifman", name: "Alexander Khalifman", ko: "알렉산드르 할리프만", cc: "RUS", from: 1999, to: 2000, lane: "R", tag: "FIDE", defenses: [
    { y: 1999, opp: "Vladimir Akopian", ko: "블라디미르 아코피안", cc: "ARM", score: "3½–2½", sat: true, won: true },
  ] },
  { id: "kramnik1", name: "Vladimir Kramnik", ko: "블라디미르 크람니크", cc: "RUS", from: 2000, to: 2006, lane: "L", tag: "CLASSIC", defenses: [
    { y: 2004, opp: "Peter Leko", ko: "페터 레코", cc: "HUN", score: "7–7", sat: true, draw: true },
  ] },
  { id: "anand1", name: "Viswanathan Anand", ko: "비스와나탄 아난드", cc: "IND", from: 2000, to: 2002, lane: "R", tag: "FIDE", defenses: [
    { y: 2000, opp: "Alexei Shirov", ko: "알렉세이 시로프", cc: "ESP", score: "3½–½", sat: true, won: true },
  ] },
  { id: "ponomariov", name: "Ruslan Ponomariov", ko: "루슬란 포노마료프", cc: "UKR", from: 2002, to: 2004, lane: "R", tag: "FIDE", defenses: [
    { y: 2002, opp: "Vasyl Ivanchuk", ko: "바실 이반추크", cc: "UKR", score: "4½–2½", sat: true, won: true },
  ] },
  { id: "kasimdzhanov", name: "Rustam Kasimdzhanov", ko: "루스탐 카시므자노프", cc: "UZB", from: 2004, to: 2005, lane: "R", tag: "FIDE", defenses: [
    { y: 2004, opp: "Michael Adams", ko: "마이클 애덤스", cc: "ENG", score: "4½–3½", sat: true, won: true },
  ] },
  { id: "topalov", name: "Veselin Topalov", ko: "베셀린 토팔로프", cc: "BUL", from: 2005, to: 2006, lane: "R", tag: "FIDE", defenses: [] },
  // ── 통합 이후 ──
  { id: "kramnik2", name: "Vladimir Kramnik", ko: "블라디미르 크람니크", cc: "RUS", from: 2006, to: 2007, lane: "C", defenses: [] },
  { id: "anand2", name: "Viswanathan Anand", ko: "비스와나탄 아난드", cc: "IND", from: 2007, to: 2013, lane: "C", defenses: [
    { y: 2008, opp: "Vladimir Kramnik", ko: "블라디미르 크람니크", cc: "RUS", score: "6½–4½" },
    { y: 2010, opp: "Veselin Topalov", ko: "베셀린 토팔로프", cc: "BUL", score: "6½–5½", sat: true },
    { y: 2012, opp: "Boris Gelfand", ko: "보리스 겔판트", cc: "ISR", score: "6–6 (2½–1½)", sat: true },
  ] },
  { id: "carlsen", name: "Magnus Carlsen", ko: "마그누스 칼센", cc: "NOR", from: 2013, to: 2023, lane: "C", defenses: [
    { y: 2014, opp: "Viswanathan Anand", ko: "비스와나탄 아난드", cc: "IND", score: "6½–4½" },
    { y: 2016, opp: "Sergey Karjakin", ko: "세르게이 카르야킨", cc: "RUS", score: "6–6 (3–1)", sat: true },
    { y: 2018, opp: "Fabiano Caruana", ko: "파비아노 카루아나", cc: "USA", score: "6–6 (3–0)", sat: true },
    { y: 2021, opp: "Ian Nepomniachtchi", ko: "이안 네포므냐시", cc: "RUS", score: "7½–3½", sat: true },
  ] },
  { id: "ding", name: "Ding Liren", ko: "딩 리런", cc: "CHN", from: 2023, to: 2024, lane: "C", defenses: [
    { y: 2023, opp: "Ian Nepomniachtchi", ko: "이안 네포므냐시", cc: "RUS", score: "7–7 (2½–1½)", sat: true, won: true },
  ] },
  { id: "gukesh", name: "Gukesh Dommaraju", ko: "구케시 도마라주", cc: "IND", from: 2024, to: null, lane: "C", defenses: [] },
];

// 챔피언 사이 타이틀 이동 — from/to는 CHAMPIONS의 id. kind: match(맞대결) | tournament(토너먼트) | forfeit(몰수승) | split(분열) | unify(통합 합류) | knockout(녹아웃)
export const TRANSFERS = [
  { from: "steinitz", to: "lasker", y: 1894, score: "12–7", kind: "match" },
  { from: "lasker", to: "capablanca", y: 1921, score: "9–5", kind: "match" },
  { from: "capablanca", to: "alekhine1", y: 1927, score: "18½–15½", kind: "match" },
  { from: "alekhine1", to: "euwe", y: 1935, score: "15½–14½", kind: "match" },
  { from: "euwe", to: "alekhine2", y: 1937, score: "15½–9½", kind: "match" },
  { from: "alekhine2", to: "botvinnik1", y: 1948, score: null, kind: "tournament" },
  { from: "botvinnik1", to: "smyslov", y: 1957, score: "12½–9½", kind: "match" },
  { from: "smyslov", to: "botvinnik2", y: 1958, score: "12½–10½", kind: "match" },
  { from: "botvinnik2", to: "tal", y: 1960, score: "12½–8½", kind: "match" },
  { from: "tal", to: "botvinnik3", y: 1961, score: "13–8", kind: "match" },
  { from: "botvinnik3", to: "petrosian", y: 1963, score: "12½–9½", kind: "match" },
  { from: "petrosian", to: "spassky", y: 1969, score: "12½–10½", kind: "match" },
  { from: "spassky", to: "fischer", y: 1972, score: "12½–8½", kind: "match" },
  { from: "fischer", to: "karpov1", y: 1975, score: null, kind: "forfeit" },
  { from: "karpov1", to: "kasparov1", y: 1985, score: "13–11", kind: "match" },
  { from: "kasparov1", to: "kasparov2", y: 1993, score: null, kind: "split" },
  { from: "kasparov1", to: "karpov2", y: 1993, score: null, kind: "split" },
  { from: "kasparov2", to: "kramnik1", y: 2000, score: "8½–6½", kind: "match" },
  { from: "karpov2", to: "khalifman", y: 1999, score: null, kind: "knockout" },
  { from: "khalifman", to: "anand1", y: 2000, score: "3½–½", kind: "knockout" },
  { from: "anand1", to: "ponomariov", y: 2002, score: "4½–2½", kind: "knockout" },
  { from: "ponomariov", to: "kasimdzhanov", y: 2004, score: "4½–3½", kind: "knockout" },
  { from: "kasimdzhanov", to: "topalov", y: 2005, score: null, kind: "tournament" },
  { from: "kramnik1", to: "kramnik2", y: 2006, score: "6–6 (2½–1½)", kind: "unify" },
  { from: "topalov", to: "kramnik2", y: 2006, score: null, kind: "unify", loser: true },
  { from: "kramnik2", to: "anand2", y: 2007, score: null, kind: "tournament" },
  { from: "anand2", to: "carlsen", y: 2013, score: "6½–3½", kind: "match" },
  { from: "carlsen", to: "ding", y: 2023, score: null, kind: "vacated" },
  { from: "ding", to: "gukesh", y: 2024, score: "7½–6½", kind: "match" },
];

// 분열기를 가로로 맞춘 행(위→아래). 한 행에 왼쪽(L)·오른쪽(R) 칸이 함께 놓이고, 나머지 챔피언은 한 줄(C)로 한 행씩 쌓인다.
export const SPLIT_ROWS = [
  ["kasparov2", "karpov2"], [null, "khalifman"], ["kramnik1", "anand1"], [null, "ponomariov"], [null, "kasimdzhanov"], [null, "topalov"],
];

// 곧 열리는 타이틀전(데이터는 끝나면 위 표로 옮긴다).
export const UPCOMING = { champ: "gukesh", name: "Javokhir Sindarov", opp: "Javokhir Sindarov", ko: "자보히르 신다로프", cc: "UZB", date: "2026.11.24–12.12" };
