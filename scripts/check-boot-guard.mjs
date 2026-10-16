// 흰 화면 방지 장치가 빠지지 않았는지 확인한다. (BUG-103)
//  · main.jsx가 앱을 AppErrorBoundary로 감싼다
//  · 배포 직후 파일을 못 찾는 경우(vite:preloadError)에 한 번 새로고침한다
//  · index.html이 어두운 배경과 #boot 화면, boot-guard.js를 갖고 있다
import { readFileSync } from "node:fs";
const rd = (p) => readFileSync(new URL("../" + p, import.meta.url), "utf8");
const fails = [];
const main = rd("src/main.jsx"), html = rd("index.html"), guard = rd("public/boot-guard.js");
if (!/<AppErrorBoundary>[\s\S]*<App \/>[\s\S]*<\/AppErrorBoundary>/.test(main)) fails.push("src/main.jsx: <App />이 AppErrorBoundary 안에 없음. 화면 그리기 오류가 나면 흰 화면으로 굳는다");
if (!/vite:preloadError/.test(main)) fails.push("src/main.jsx: vite:preloadError 처리가 없음. 배포 직후 예전 파일을 찾다 실패하면 흰 화면이 된다");
if (!/background:#1B1009/.test(html)) fails.push("index.html: 어두운 배경색이 없음. 앱이 뜨기 전에 흰 화면이 보인다");
if (!/id="boot"/.test(html) || !/boot-guard\.js/.test(html)) fails.push("index.html: #boot 화면 또는 boot-guard.js가 없음");
if (!/getElementById\("boot"\)/.test(guard) || !/location\.reload/.test(guard)) fails.push("public/boot-guard.js: 실패 안내 또는 새로고침 처리가 없음");
if (fails.length) { console.error("흰 화면 방지 검사 실패:\n- " + fails.join("\n- ")); process.exit(1); }
console.log("✔ check-boot-guard: 오류 방어막, 배포 직후 새로고침, 어두운 시작 화면이 모두 있다");
