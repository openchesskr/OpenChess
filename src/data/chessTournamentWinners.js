// (v0.6.3) 도감 "마스터" 대회 카드의 역대 우승 기록 — 사람이 취합해 입력한 값(출처: 공개 기록을 검색으로 모아 대조한 것이라 검수 필요).
//  · WINNERS[id] = [[연도, [우승자…]], …] 연도순. 공동 우승은 이름 여러 개. 확실하지 않은 연도는 넣지 않았다(비어 있음 = 모름).
//  · 팀 대회(올림피아드)는 나라 이름(영문 국가명)을 쓴다 — 화면 번역은 COUNTRY_KO.
//  · 이 값은 scripts/build-tournament-index.mjs가 마스터 대국 DB와 대조한다(출전자 중에 있는지): 결과는 src/data/tournamentIndex.json의 winnerCheck(ok·conflict·nodata)에 남고,
//    scripts/check-masters.mjs가 conflict가 하나라도 있으면 빌드를 막는다.
//  · WINNER_KIND: titleChanges = "챔피언이 바뀐 해"만 적은 목록(여자 세계선수권), 그 외는 해마다 우승자.
export const WINNER_KIND = { womenWcc: "titleChanges" };
export const COUNTRY_KO = { Hungary: "헝가리", Poland: "폴란드", "United States": "미국", Germany: "독일", Yugoslavia: "유고슬라비아", "Soviet Union": "소련", Russia: "러시아", Ukraine: "우크라이나", Armenia: "아르메니아", China: "중국", Uzbekistan: "우즈베키스탄", India: "인도" };
const olymp = (c, ...ys) => ys.map((y) => [y, [c]]);
export const WINNERS = {
  tata: [
    [1993, ["Anatoly Karpov"]], [1994, ["Predrag Nikolic"]], [1995, ["Alexey Dreev"]], [1996, ["Vasyl Ivanchuk"]], [1997, ["Valery Salov"]], [1999, ["Garry Kasparov"]],
    [2000, ["Garry Kasparov"]], [2001, ["Garry Kasparov"]], [2002, ["Evgeny Bareev"]], [2003, ["Viswanathan Anand"]], [2004, ["Viswanathan Anand"]], [2005, ["Peter Leko"]],
    [2006, ["Viswanathan Anand", "Veselin Topalov"]], [2007, ["Levon Aronian", "Veselin Topalov", "Teimour Radjabov"]], [2008, ["Levon Aronian", "Magnus Carlsen"]], [2009, ["Sergey Karjakin"]], [2010, ["Magnus Carlsen"]],
    [2011, ["Hikaru Nakamura"]], [2012, ["Levon Aronian"]], [2013, ["Magnus Carlsen"]], [2014, ["Levon Aronian"]], [2015, ["Magnus Carlsen"]], [2016, ["Magnus Carlsen"]], [2017, ["Wesley So"]],
    [2018, ["Magnus Carlsen"]], [2019, ["Magnus Carlsen"]], [2020, ["Fabiano Caruana"]], [2021, ["Jorden van Foreest"]], [2022, ["Magnus Carlsen"]], [2023, ["Anish Giri"]], [2024, ["Wei Yi"]],
    [2025, ["Praggnanandhaa Rameshbabu"]], [2026, ["Nodirbek Abdusattorov"]],
  ],
  norway: [
    [2013, ["Sergey Karjakin"]], [2014, ["Sergey Karjakin"]], [2015, ["Veselin Topalov"]], [2016, ["Magnus Carlsen"]], [2017, ["Levon Aronian"]], [2018, ["Fabiano Caruana"]], [2019, ["Magnus Carlsen"]],
    [2020, ["Magnus Carlsen"]], [2021, ["Magnus Carlsen"]], [2022, ["Magnus Carlsen"]], [2023, ["Hikaru Nakamura"]], [2024, ["Magnus Carlsen"]], [2025, ["Magnus Carlsen"]],
  ],
  sinquefield: [
    [2013, ["Magnus Carlsen"]], [2014, ["Fabiano Caruana"]], [2015, ["Levon Aronian"]], [2016, ["Wesley So"]], [2017, ["Maxime Vachier-Lagrave"]], [2018, ["Magnus Carlsen", "Fabiano Caruana", "Levon Aronian"]],
    [2019, ["Ding Liren"]], [2021, ["Maxime Vachier-Lagrave"]], [2022, ["Alireza Firouzja"]], [2023, ["Fabiano Caruana"]], [2024, ["Alireza Firouzja"]], [2025, ["Wesley So"]],
  ],
  gashimov: [[2014, ["Magnus Carlsen"]], [2015, ["Magnus Carlsen"]], [2016, ["Shakhriyar Mamedyarov"]], [2017, ["Shakhriyar Mamedyarov"]], [2018, ["Magnus Carlsen"]], [2019, ["Magnus Carlsen"]]],
  superbet: [[2021, ["Shakhriyar Mamedyarov"]], [2022, ["Maxime Vachier-Lagrave"]], [2023, ["Fabiano Caruana"]], [2024, ["Fabiano Caruana"]], [2025, ["Praggnanandhaa Rameshbabu"]]],
  candidates: [
    [1950, ["David Bronstein"]], [1953, ["Vasily Smyslov"]], [1956, ["Vasily Smyslov"]], [1959, ["Mikhail Tal"]], [1962, ["Tigran Petrosian"]], [1965, ["Boris Spassky"]], [1968, ["Boris Spassky"]],
    [1971, ["Bobby Fischer"]], [1974, ["Anatoly Karpov"]], [1977, ["Viktor Korchnoi"]], [1980, ["Viktor Korchnoi"]], [1983, ["Garry Kasparov"]], [1990, ["Anatoly Karpov"]],
    [2011, ["Boris Gelfand"]], [2013, ["Magnus Carlsen"]], [2014, ["Viswanathan Anand"]], [2016, ["Sergey Karjakin"]], [2018, ["Fabiano Caruana"]], [2020, ["Ian Nepomniachtchi"]],
    [2022, ["Ian Nepomniachtchi"]], [2024, ["Gukesh Dommaraju"]], [2026, ["Javokhir Sindarov"]],
  ],
  worldCup: [[2005, ["Levon Aronian"]], [2007, ["Gata Kamsky"]], [2009, ["Boris Gelfand"]], [2011, ["Peter Svidler"]], [2013, ["Vladimir Kramnik"]], [2015, ["Sergey Karjakin"]], [2017, ["Levon Aronian"]], [2019, ["Teimour Radjabov"]], [2021, ["Jan-Krzysztof Duda"]], [2023, ["Magnus Carlsen"]], [2025, ["Javokhir Sindarov"]]],
  grandSwiss: [[2019, ["Wang Hao"]], [2021, ["Alireza Firouzja"]], [2023, ["Vidit Gujrathi"]], [2025, ["Anish Giri"]]],
  linares: [
    [1988, ["Jan Timman"]], [1989, ["Vasyl Ivanchuk"]], [1990, ["Garry Kasparov"]], [1991, ["Vasyl Ivanchuk"]], [1992, ["Garry Kasparov"]], [1993, ["Garry Kasparov"]], [1994, ["Anatoly Karpov"]], [1995, ["Vasyl Ivanchuk"]],
    [1997, ["Garry Kasparov"]], [1998, ["Viswanathan Anand"]], [1999, ["Garry Kasparov"]], [2000, ["Vladimir Kramnik", "Garry Kasparov"]], [2001, ["Garry Kasparov"]], [2002, ["Garry Kasparov"]],
    [2003, ["Peter Leko", "Vladimir Kramnik"]], [2004, ["Vladimir Kramnik"]], [2005, ["Veselin Topalov", "Garry Kasparov"]], [2006, ["Levon Aronian"]], [2007, ["Viswanathan Anand"]], [2008, ["Viswanathan Anand"]],
    [2009, ["Alexander Grischuk", "Vasyl Ivanchuk"]], [2010, ["Veselin Topalov"]],
  ],
  dortmund: [
    [1973, ["Heikki Westerinen"]], [1974, ["Laszlo Szabo"]], [1975, ["Heikki Westerinen"]], [1976, ["Oleg Romanishin"]], [1977, ["Jan Smejkal"]], [1978, ["Ulf Andersson"]], [1979, ["Tamaz Giorgadze"]],
    [1980, ["Raymond Keene"]], [1981, ["Gennady Kuzmin"]], [1982, ["Vlastimil Hort"]], [1983, ["Mihai Suba"]], [1984, ["Yehuda Gruenfeld"]], [1985, ["Yuri Razuvaev"]], [1986, ["Zoltan Ribli"]],
    [1987, ["Yuri Balashov"]], [1988, ["Smbat Lputian"]], [1989, ["Efim Geller"]], [1990, ["Alexander Chernin"]], [1991, ["Igor Stohl"]], [1992, ["Garry Kasparov"]], [1993, ["Anatoly Karpov"]],
    [1994, ["Jeroen Piket"]], [1995, ["Vladimir Kramnik"]], [1996, ["Vladimir Kramnik"]], [1997, ["Vladimir Kramnik"]], [1998, ["Vladimir Kramnik"]], [1999, ["Peter Leko"]], [2000, ["Vladimir Kramnik"]],
    [2001, ["Vladimir Kramnik"]], [2002, ["Peter Leko"]], [2003, ["Viorel Bologan"]], [2004, ["Viswanathan Anand"]], [2005, ["Arkadij Naiditsch"]], [2006, ["Vladimir Kramnik"]], [2007, ["Vladimir Kramnik"]],
    [2008, ["Peter Leko"]], [2009, ["Vladimir Kramnik"]], [2010, ["Ruslan Ponomariov"]], [2011, ["Vladimir Kramnik"]], [2012, ["Fabiano Caruana"]], [2013, ["Michael Adams"]], [2014, ["Fabiano Caruana"]],
    [2015, ["Fabiano Caruana"]], [2016, ["Maxime Vachier-Lagrave"]], [2017, ["Radoslaw Wojtaszek"]], [2018, ["Ian Nepomniachtchi"]], [2019, ["Leinier Dominguez"]],
  ],
  nottingham: [[1936, ["Mikhail Botvinnik", "Jose Raul Capablanca"]]],
  avro: [[1938, ["Paul Keres", "Reuben Fine"]]],
  zurich: [[1953, ["Vasily Smyslov"]]],
  womenWorldCup: [[2021, ["Alexandra Kosteniuk"]], [2023, ["Aleksandra Goryachkina"]], [2025, ["Divya Deshmukh"]]],
  womenWcc: [
    [1927, ["Vera Menchik"]], [1950, ["Lyudmila Rudenko"]], [1953, ["Elisaveta Bykova"]], [1956, ["Olga Rubtsova"]], [1958, ["Elisaveta Bykova"]], [1962, ["Nona Gaprindashvili"]], [1978, ["Maia Chiburdanidze"]],
    [1991, ["Xie Jun"]], [1996, ["Susan Polgar"]], [1999, ["Xie Jun"]], [2001, ["Zhu Chen"]], [2004, ["Antoaneta Stefanova"]], [2006, ["Xu Yuhua"]], [2008, ["Alexandra Kosteniuk"]], [2010, ["Hou Yifan"]],
    [2012, ["Anna Ushenina"]], [2013, ["Hou Yifan"]], [2015, ["Mariya Muzychuk"]], [2016, ["Hou Yifan"]], [2017, ["Tan Zhongyi"]], [2018, ["Ju Wenjun"]],
  ],
  olympiad: [
    ...olymp("Hungary", 1927, 1928), ...olymp("Poland", 1930), ...olymp("United States", 1931, 1933, 1935, 1937), ...olymp("Germany", 1939), ...olymp("Yugoslavia", 1950),
    ...olymp("Soviet Union", 1952, 1954, 1956, 1958, 1960, 1962, 1964, 1966, 1968, 1970, 1972, 1974), ...olymp("United States", 1976), ...olymp("Hungary", 1978), ...olymp("Soviet Union", 1980, 1982, 1984, 1986, 1988, 1990),
    ...olymp("Russia", 1992, 1994, 1996, 1998, 2000, 2002), ...olymp("Ukraine", 2004), ...olymp("Armenia", 2006, 2008), ...olymp("Ukraine", 2010), ...olymp("Armenia", 2012), ...olymp("China", 2014),
    ...olymp("United States", 2016), ...olymp("China", 2018), ...olymp("Uzbekistan", 2022), ...olymp("India", 2024),
  ],
};
