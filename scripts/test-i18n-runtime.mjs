#!/usr/bin/env node
/** (v0.7.0, 다국어) i18n 런타임 회귀 테스트 — t()/tx()의 복수형·한국어 조사·소문자화가 언어별로 맞게 나오는지 확인한다.
 *  배경: tx()가 복수형 표지를 처리하지 않아 영어 화면에 "suggested {0|move|moves}"가 그대로 보인 적이 있다(BUG-047).
 *  언어는 모듈이 처음 불릴 때 정해지므로 언어마다 자식 프로세스를 따로 띄워 검사한다. 실행: node scripts/test-i18n-runtime.mjs */
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const which = process.argv[2];
if (!which) {
  let fail = 0;
  for (const code of ["ko", "en", "es", "hi", "ja", "zh"]) {
    const r = spawnSync(process.execPath, [fileURLToPath(import.meta.url), code], { encoding: "utf8" });
    if (r.status !== 0) { fail++; console.error("✗ i18n 런타임(" + code + ")\n" + (r.stdout + r.stderr).trim()); }
  }
  if (fail) process.exit(1);
  console.log("✔ test-i18n-runtime: ko·en·es·hi·ja·zh — 복수형·조사·소문자화 정상");
} else {
  const store = { occ_lang: which, occ_lang_auto: "0" };
  globalThis.window = { localStorage: { getItem: (k) => store[k] ?? null, setItem: (k, v) => { store[k] = String(v); }, removeItem: (k) => { delete store[k]; }, key: (i) => Object.keys(store)[i], get length() { return Object.keys(store).length; } }, location: { reload() {} } };
  globalThis.document = { documentElement: { lang: "", style: { setProperty() {} } }, createElement: () => ({}), head: { appendChild() {} } };
  Object.defineProperty(globalThis, "navigator", { value: { languages: ["en"], language: "en" }, configurable: true });
  const { t, tx, lcLatin } = await import("../src/lib/i18n.js");
  const { createElement: h } = await import("react");
  const { renderToStaticMarkup } = await import("react-dom/server");
  const html = (n) => renderToStaticMarkup(n);
  const errs = [];
  const eq = (name, got, want) => { if (got !== want) errs.push(name + ": " + JSON.stringify(got) + " ≠ " + JSON.stringify(want)); };
  const icon = h("i", { className: "ic" });
  const num = (n) => h("b", null, n);
  if (which === "ko") {
    eq("ko 조사(받침 있음)", html(tx("상대 {0:이/가} 미끼를 물음", "룩")), "상대 룩이 미끼를 물음");
    eq("ko 조사(받침 없음)", html(tx("상대 {0:이/가} 미끼를 물음", "나이트")), "상대 나이트가 미끼를 물음");
    eq("ko t 조사", t("내가 만든 {0:이/가} 오늘의 퍼즐로 선정", "퍼즐 #5"), "내가 만든 퍼즐 #5가 오늘의 퍼즐로 선정");
    eq("ko 소문자화 없음", lcLatin("Queen"), "Queen");
  } else {
    // 같은 키로: t(숫자)·tx(요소 안의 숫자)·tx(아이콘) 세 경로가 모두 복수형을 해석해야 한다
    const want = { en: ["1 move", "2 moves", "Suggested move"], es: ["1 jugada", "2 jugadas", "Jugada sugerida"], hi: ["1 चाल", "2 चालें", "सुझाई गई चाल"], ja: ["1手", "2手", "推奨手"], zh: ["1 步", "2 步", "推荐着法"] }[which];
    eq(which + " t 단수", t("{0}수", 1), want[0]);
    eq(which + " t 복수", t("{0}수", 2), want[1]);
    eq(which + " tx 단수", html(tx("{0}수", num(1))).replace(/<\/?b>/g, ""), want[0]);
    eq(which + " tx 복수(요소 안 숫자)", html(tx("{0}수", num(2))).replace(/<\/?b>/g, ""), want[1]);
    eq(which + " tx 아이콘 라벨", html(tx("{0} 수 추천", icon)).replace('<i class="ic"></i>', "").trim(), want[2]);
    if (which === "hi") eq("hi 0은 단수", t("{0}수", 0), "0 चाल");
    if (which === "en" || which === "es") { eq(which + " lcLatin", lcLatin("Queen"), "queen"); eq(which + " lcLatin 한 글자", lcLatin("X"), "x"); }
    else eq(which + " lcLatin 그대로", lcLatin("Queen"), "Queen");
    if (which === "en") { eq("en 분석 버튼 대문자", html(tx("{0} 분석", icon)).replace('<i class="ic"></i>', "").trim(), "Analyze"); eq("en 이름 자리 문구", t("{0} 수 계산 중", "MILKU"), "MILKU is calculating a move"); }
  }
  if (errs.length) { console.error(errs.join("\n")); process.exit(1); }
}
