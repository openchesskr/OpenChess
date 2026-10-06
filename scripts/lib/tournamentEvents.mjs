// (v0.6.3) 마스터 대국 DB(public/master-games.json)의 event 문자열을 도감 대회(src/data/chessTournaments.js)에 연결하는 규칙.
// DB는 대회명이 일관되지 않고(서로 다른 event 17,969개) 표기가 대회·연도마다 달라, 대회마다 포함(include)·제외(exclude) 정규식과 연도 범위를 둔다.
// 제외 규칙의 핵심: 같은 이름이 들어간 블리츠·속기·챌린저스·오픈·여자부·하위 그룹(B·C)은 본 대회로 세지 않는다.
const NOT_MAIN = /blitz|rapid|armageddon|\btb\b|play-?in|prelim|women|girls|\bu\d\d\b|youth|junior|senior|online|internet|simul|blindfold/i;
export const EVENT_RULES = {
  hastings: { include: /^(\d+(st|nd|rd|th) )?hastings/i, exclude: /challengers|\bop\b|open|women|blitz|rapid|premier reserves/i },
  womenWcc: { include: /women.*world (champ|ch)|world (champ|ch).*women|\bwwch\b/i, exclude: /rapid|blitz|team|cup|u\d\d/i },
  olympiad: { include: /olympiad/i, exclude: /women|youth|u\d\d|girls|online|school|junior|senior|blind|\bw\b/i },
  nottingham: { include: /^nottingham$/i, years: [1936, 1936] },
  tata: { include: /hoogovens|corus|tata steel|^wijk/i, exclude: /blitz|rapid|india|\bind\b|challeng|corus [b-d]\b|hoogovens-?[b-d]\b|hoogovens op|\bop\b|open|5'|women|gp[b-d]\b|gm[b-d]\b|\btb\b/i },
  avro: { include: /^avro$/i, years: [1938, 1938] },
  candidates: { include: /candidates/i, exclude: /women|blitz|online|u16|\bger\b|sccf|summer|fed|internet/i },
  zurich: { include: /^z(u|ü)rich( candidates| 1953)?$/i, years: [1953, 1953] },
  euroTeam: { include: /european teams?/i, exclude: /women|u\d\d|youth/i },
  womenOlympiad: { include: /olympiad.*women|women.*olympiad/i, exclude: /youth|u\d\d/i },
  dortmund: { include: /^dortmund(-a)?$/i },
  linares: { include: /^linares( ?\d+th)?$/i },
  worldTeam: { include: /world teams?( champ(ionships?)?|ch)?\b/i, exclude: /women|china|dutch|rapid|blitz|youth|u\d\d/i },
  norway: { include: /norway chess/i, exclude: new RegExp(NOT_MAIN.source + "|open|qualifier", "i") },
  sinquefield: { include: /sinquefield( cup)?/i, exclude: /\btb\b|gct|blitz|rapid/i },
  gashimov: { include: /gashimov|shamkir/i, exclude: /blitz|rapid|women|\btb\b/i },
  rapidBlitz: { include: /^(fide )?world (rapid|blitz)( championships?)?( \d{4})?$/i, exclude: /women|team|youth|u\d\d/i },
  speedChess: { include: /speed chess championship/i, exclude: /women|junior/i },
  worldCup: { include: /^(fide )?world cup( \d{4})?$/i, exclude: /women|blindfold|esports|rapid|gp/i },
  grandSwiss: { include: /grand swiss/i, exclude: /women/i },
  superbet: { include: /superbet (chess )?classic/i, exclude: /blitz|rapid|\btb\b/i },
  cct: { include: /meltwater|champions chess tour|chessable masters|airthings|opera euro|skilling|aimchess|julius baer|oslo esports|magnus carlsen invitational/i, exclude: /women|junior|u\d\d/i },
  womenWorldCup: { include: /women.*world cup|world cup.*women/i },
  freestyle: { include: /freestyle|weissenhaus (freestyle|grand slam)|chess960 grand slam/i, exclude: /young/i },
};
export function matchTournament(id, event, year) {
  const r = EVENT_RULES[id]; if (!r || !event) return false;
  if (r.years && (year == null || year < r.years[0] || year > r.years[1])) return false;
  return r.include.test(event) && !(r.exclude && r.exclude.test(event));
}
