// (v0.6.3) 도감 "마스터" 모식도 오른쪽 열 — 세계선수권 외의 권위 있는 체스 대회. 시작 연도(from)로 세계 챔피언 재위 행에 맞춰 위→아래 연도순으로 놓는다.
//  · type: elite(슈퍼 토너먼트) · cycle(세계선수권 사이클) · team(팀 대회) · speed(속기·블리츠·프리스타일·온라인) · women(여자 대회) · historic(역사적 대회)
//  · from = 처음 열린 해, to = 마지막으로 열린 해(없으면 지금도 이어짐), freq: annual | biennial | oneoff (생략 가능)
//  · place/placeKo = 개최지(도시) + cc(나라 코드). place: "various"(매번 다름) · "online"
//  · 우승자 기록은 넣지 않았다(검증 가능한 출처 확보 후 추가). name = 로마자, ko = 한국어 표기(AI 초안 — 검수 필요).
//  · 구조 검증: scripts/check-masters.mjs(prebuild).
export const TOURNAMENT_TYPES = ["elite", "cycle", "team", "speed", "women", "historic"];
export const TOURNAMENTS = [
  { id: "hastings", name: "Hastings International Chess Congress", ko: "헤이스팅스 국제 체스 대회", type: "historic", from: 1895, freq: "annual", place: "Hastings", placeKo: "헤이스팅스", cc: "ENG" },
  { id: "womenWcc", name: "Women's World Championship", ko: "여자 세계선수권", type: "women", from: 1927, place: "various", cc: "" },
  { id: "olympiad", name: "Chess Olympiad", ko: "체스 올림피아드", type: "team", from: 1927, freq: "biennial", place: "various", cc: "" },
  { id: "nottingham", name: "Nottingham 1936", ko: "노팅엄 1936", type: "historic", from: 1936, to: 1936, freq: "oneoff", place: "Nottingham", placeKo: "노팅엄", cc: "ENG" },
  { id: "tata", name: "Tata Steel Chess", ko: "타타 스틸 체스", type: "elite", from: 1938, freq: "annual", place: "Wijk aan Zee", placeKo: "베이크안제이", cc: "NED" },
  { id: "avro", name: "AVRO 1938", ko: "AVRO 1938", type: "historic", from: 1938, to: 1938, freq: "oneoff", place: "Netherlands", placeKo: "네덜란드", cc: "NED" },
  { id: "candidates", name: "Candidates Tournament", ko: "후보자 토너먼트", type: "cycle", from: 1950, freq: "biennial", place: "various", cc: "" },
  { id: "zurich", name: "Zürich 1953 (Candidates)", ko: "취리히 1953(후보자)", type: "cycle", from: 1953, to: 1953, freq: "oneoff", place: "Zürich", placeKo: "취리히", cc: "SUI" },
  { id: "euroTeam", name: "European Team Championship", ko: "유럽 팀 선수권", type: "team", from: 1957, place: "various", cc: "" },
  { id: "womenOlympiad", name: "Women's Chess Olympiad", ko: "여자 체스 올림피아드", type: "women", from: 1957, freq: "biennial", place: "various", cc: "" },
  { id: "dortmund", name: "Dortmund Sparkassen Chess Meeting", ko: "도르트문트 슈파르카센", type: "elite", from: 1973, freq: "annual", place: "Dortmund", placeKo: "도르트문트", cc: "GER" },
  { id: "linares", name: "Linares", ko: "리나레스", type: "historic", from: 1978, to: 2010, place: "Linares", placeKo: "리나레스", cc: "ESP" },
  { id: "worldTeam", name: "World Team Championship", ko: "세계 팀 선수권", type: "team", from: 1985, place: "various", cc: "" },
  { id: "worldCup", name: "FIDE World Cup", ko: "FIDE 월드컵", type: "cycle", from: 2005, place: "various", cc: "" },
  { id: "rapidBlitz", name: "World Rapid & Blitz Championships", ko: "세계 래피드·블리츠 선수권", type: "speed", from: 2012, freq: "annual", place: "various", cc: "" },
  { id: "norway", name: "Norway Chess", ko: "노르웨이 체스", type: "elite", from: 2013, freq: "annual", place: "Stavanger", placeKo: "스타방에르", cc: "NOR" },
  { id: "sinquefield", name: "Sinquefield Cup", ko: "싱큐필드 컵", type: "elite", from: 2013, freq: "annual", place: "St. Louis", placeKo: "세인트루이스", cc: "USA" },
  { id: "gashimov", name: "Gashimov Memorial (Shamkir)", ko: "가시모프 추모 대회(샤므키르)", type: "elite", from: 2014, place: "Shamkir", placeKo: "샤므키르", cc: "AZE" },
  { id: "speedChess", name: "Speed Chess Championship", ko: "스피드 체스 챔피언십", type: "speed", from: 2016, freq: "annual", place: "online", cc: "" },
  { id: "grandSwiss", name: "FIDE Grand Swiss", ko: "FIDE 그랜드 스위스", type: "cycle", from: 2019, freq: "biennial", place: "various", cc: "" },
  { id: "superbet", name: "Superbet Chess Classic (Grand Chess Tour)", ko: "슈퍼벳 체스 클래식(그랜드 체스 투어)", type: "elite", from: 2019, freq: "annual", place: "Bucharest", placeKo: "부쿠레슈티", cc: "ROU" },
  { id: "cct", name: "Champions Chess Tour", ko: "챔피언스 체스 투어", type: "speed", from: 2020, place: "online", cc: "" },
  { id: "womenWorldCup", name: "Women's World Cup", ko: "여자 월드컵", type: "women", from: 2021, place: "various", cc: "" },
  { id: "freestyle", name: "Freestyle Chess Grand Slam Tour", ko: "프리스타일 체스 그랜드슬램 투어", type: "speed", from: 2025, place: "various", cc: "" },
];
