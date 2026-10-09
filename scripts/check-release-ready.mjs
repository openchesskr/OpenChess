#!/usr/bin/env node
/** (v0.6.4) 스토어 출시 직전 점검 — 앱 링크 파일의 자리표시자가 실제 값으로 바뀌었는지 확인한다.
 *  prebuild에는 넣지 않는다(개발 중에는 자리표시자가 정상이라 빌드가 막히면 안 된다). 출시 빌드 전에 직접 실행한다: npm run check:release
 *  · public/.well-known/apple-app-site-association 의 TEAMID → Apple Developer 팀 ID(10자리)
 *  · public/.well-known/assetlinks.json 의 REPLACE_WITH_RELEASE_KEY_SHA256 → 릴리스 서명 키의 SHA-256 지문(Play Console의 앱 서명 키 인증서 지문) */
import { readFileSync } from "node:fs";
const rd = (p) => readFileSync(new URL("../" + p, import.meta.url), "utf8");
const fails = [];
try {
  for (const id of JSON.parse(rd("public/.well-known/apple-app-site-association")).applinks.details.flatMap((d) => d.appIDs || [])) if (!/^[A-Z0-9]{10}\./.test(id) || /^TEAMID\./.test(id)) fails.push("AASA appID가 실제 팀 ID가 아님: " + id);
} catch (e) { fails.push("AASA 읽기 실패: " + e.message); }
try {
  for (const a of JSON.parse(rd("public/.well-known/assetlinks.json"))) for (const f of a.target.sha256_cert_fingerprints || []) if (!/^([0-9A-F]{2}:){31}[0-9A-F]{2}$/i.test(f)) fails.push("assetlinks 지문이 SHA-256 형식(AA:BB:… 32바이트)이 아님: " + f);
} catch (e) { fails.push("assetlinks 읽기 실패: " + e.message); }
if (fails.length) { console.error("✖ check-release-ready 실패(출시 전 처리 필요):\n  " + fails.join("\n  ")); process.exit(1); }
console.log("✔ check-release-ready: 앱 링크 파일이 실제 값으로 채워져 있다");
