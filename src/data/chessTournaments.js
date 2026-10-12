// (v0.6.5) 도감 "마스터" 대회 목록 = 손으로 쓴 대회(chessTournaments.manual.js — 한국어 이름·우승 기록 등 검수한 것) + PGN Mentor 대회 파일에서 자동으로 만든 시리즈(tournamentsAuto.js).
// 손으로 쓴 대회와 같은 대회는 자동 시리즈로 중복되지 않는다(scripts/build-pgn-tournaments.mjs가 연결). 구조 검증: scripts/check-masters.mjs(prebuild).
import { TOURNAMENT_TYPES as BASE_TYPES, TOURNAMENTS as MANUAL } from "./chessTournaments.manual.js";
import { AUTO_TOURNAMENTS } from "./tournamentsAuto.js";
export const TOURNAMENT_TYPES = [...BASE_TYPES, "general"];   // general = 위 종류에 들지 않는 일반 대회(오픈·지역 대회 등)
export const TOURNAMENTS = [...MANUAL, ...AUTO_TOURNAMENTS];
