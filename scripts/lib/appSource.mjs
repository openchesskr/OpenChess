// (v0.6.0, App.jsx 분할) 검사 스크립트가 "App 코드 전체"를 문자열로 봐야 할 때 쓴다.
// App.jsx가 src/App.jsx + src/app/*.jsx(탭·기능별 파일)로 나뉘어 있어, 한 파일만 읽으면 함수를 못 찾는다.
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

const SRC = new URL("../../src/", import.meta.url).pathname;
export const APP_FILES = ["App.jsx", ...readdirSync(join(SRC, "app")).filter((f) => /\.jsx?$/.test(f)).sort().map((f) => "app/" + f)];
/** 모든 App 파일을 이어붙인 문자열(App.jsx가 맨 앞). */
export function readAppSource() { return APP_FILES.map((f) => readFileSync(join(SRC, f), "utf8")).join("\n"); }
