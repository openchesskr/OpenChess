// (v0.6.3) 도감 "마스터" 선수 이름 옆 국기 이모티콘 — FIDE 3글자 연맹 코드(NOR·URS …) 또는 ISO 3166-1 alpha-2(NO)를 국기 이모티콘으로.
//  · 소련(URS·SU)은 계승국 러시아, 유고(YUG·YU)는 세르비아, 체코슬로바키아(TCH·CS)는 체코 국기로 표시한다(소련·유고 국기 이모티콘은 없다).
//  · 잉글랜드·스코틀랜드·웨일스는 영국 하위 국기(태그 시퀀스) — 지원하지 않는 환경(예: Windows)에서는 국기 대신 글자나 검은 깃발로 보일 수 있다.
const FIDE_TO_ISO = {
  AFG: "AF", ALB: "AL", ALG: "DZ", AND: "AD", ANG: "AO", ARG: "AR", ARM: "AM", ARU: "AW", AUS: "AU", AUT: "AT", AZE: "AZ", BAN: "BD", BAR: "BB", BEL: "BE", BER: "BM", BHR: "BH", BIH: "BA", BLR: "BY", BOL: "BO", BRA: "BR", BRU: "BN", BUL: "BG",
  CAM: "KH", CAN: "CA", CHI: "CL", CHN: "CN", COL: "CO", CRC: "CR", CRO: "HR", CUB: "CU", CYP: "CY", CZE: "CZ", DEN: "DK", DOM: "DO", ECU: "EC", EGY: "EG", ENG: "GB-ENG", ESA: "SV", ESP: "ES", EST: "EE", ETH: "ET", FAI: "FO", FIN: "FI", FRA: "FR",
  GBR: "GB", GEO: "GE", GER: "DE", GHA: "GH", GRE: "GR", GUA: "GT", HAI: "HT", HKG: "HK", HON: "HN", HUN: "HU", INA: "ID", IND: "IN", IRI: "IR", IRL: "IE", IRQ: "IQ", ISL: "IS", ISR: "IL", ITA: "IT", JAM: "JM", JOR: "JO", JPN: "JP",
  KAZ: "KZ", KEN: "KE", KGZ: "KG", KOR: "KR", KOS: "XK", KSA: "SA", KUW: "KW", LAO: "LA", LAT: "LV", LBA: "LY", LIB: "LB", LIE: "LI", LTU: "LT", LUX: "LU", MAC: "MO", MAR: "MA", MAS: "MY", MDA: "MD", MEX: "MX", MGL: "MN", MKD: "MK", MLD: "MV", MLT: "MT", MNE: "ME", MON: "MC", MRI: "MU", MYA: "MM",
  NCA: "NI", NED: "NL", NEP: "NP", NGR: "NG", NIR: "GB", NOR: "NO", NZL: "NZ", OMA: "OM", PAK: "PK", PAN: "PA", PAR: "PY", PER: "PE", PHI: "PH", PLE: "PS", POL: "PL", POR: "PT", PRK: "KP", PUR: "PR", QAT: "QA", ROU: "RO", RSA: "ZA", RUS: "RU",
  SCO: "GB-SCT", SEN: "SN", SGP: "SG", SLO: "SI", SMR: "SM", SRB: "RS", SRI: "LK", SUD: "SD", SUI: "CH", SVK: "SK", SWE: "SE", SYR: "SY", THA: "TH", TJK: "TJ", TKM: "TM", TPE: "TW", TRI: "TT", TUN: "TN", TUR: "TR", UAE: "AE", UGA: "UG", UKR: "UA", URS: "RU", URU: "UY", USA: "US", UZB: "UZ",
  VEN: "VE", VIE: "VN", WLS: "GB-WLS", YEM: "YE", YUG: "RS", TCH: "CZ", ZIM: "ZW",
};
const ISO_ALIAS = { SU: "RU", YU: "RS", CS: "CZ", DD: "DE", UK: "GB" };
const regional = (c) => String.fromCodePoint(...[...c].map((ch) => 0x1F1E6 + ch.charCodeAt(0) - 65));
const subdivision = (c) => String.fromCodePoint(0x1F3F4, ...[...c.replace("-", "").toLowerCase()].map((ch) => 0xE0000 + ch.charCodeAt(0)), 0xE007F);   // GB-ENG → 🏴 + 태그 gbeng + 취소 태그
export function isoOf(code) {
  const c = String(code || "").trim().toUpperCase();
  if (!c) return null;
  if (FIDE_TO_ISO[c]) return FIDE_TO_ISO[c];
  if (/^GB-[A-Z]{3}$/.test(c)) return c;
  if (/^[A-Z]{2}$/.test(c)) return ISO_ALIAS[c] || c;
  return null;
}
export function flagEmoji(code) {
  if (String(code || "").trim().toUpperCase() === "FID") return "\u{1F3F3}\uFE0F";   // FIDE 깃발(중립 선수) — 국가 국기가 없어 흰 깃발
  const iso = isoOf(code);
  if (!iso) return "";
  return iso.includes("-") ? subdivision(iso) : regional(iso);
}
