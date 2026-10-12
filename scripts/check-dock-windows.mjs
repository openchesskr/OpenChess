#!/usr/bin/env node
/** (v0.6.5) 데스크톱 도킹 창(채팅·검색·친구 동시 사용) 검사.
 *  ① fitDock — 화면 폭이 모자라면 오래된 펼친 창부터 접고, 방금 연 창은 보호하며, 띄운(float) 창은 건드리지 않는다.
 *  ② 연결 — App 헤더 버튼이 데스크톱에서는 dock.open으로 창을 열고(좁은 화면은 기존 모달), 모달 3종이 docked 모드(백드롭 없음)와 onOpenChat를 지원한다.
 *  실행: node scripts/check-dock-windows.mjs  (prebuild)
 */
import { build } from "esbuild";
import { readFileSync, mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
const ROOT = new URL("../", import.meta.url).pathname;
const dir = mkdtempSync(join(ROOT, "node_modules/.dock-check-")), out = join(dir, "dock.mjs");
await build({ entryPoints: [join(ROOT, "src/components/DockWindows.jsx")], bundle: true, platform: "node", format: "esm", outfile: out, jsx: "automatic", logLevel: "error", external: ["react", "react-dom", "lucide-react"], define: { "import.meta.env": "{}" } });
const { fitDock } = await import(out); rmSync(dir, { recursive: true, force: true });
const fails = [];
const mk = (n, extra = {}) => Array.from({ length: n }, (_, i) => ({ id: "w" + i, type: "chat", min: false, float: null, ...extra }));
const widthOf = (l) => { const d = l.filter((w) => !w.float); return d.reduce((a, w) => a + (w.min ? 210 : 340), 0) + 10 * Math.max(0, d.length - 1); };
{ const r = fitDock(mk(3), 1400, "w2"); if (r.some((w) => w.min)) fails.push("1400px에 창 3개는 모두 펼쳐져야 함"); }
{ const r = fitDock(mk(5), 1000, "w4"); if (widthOf(r) > 1000 - 32) fails.push("폭 초과: " + widthOf(r)); if (r.find((w) => w.id === "w4").min) fails.push("방금 연 창이 접힘"); if (!r[0].min) fails.push("가장 오래된 창부터 접혀야 함"); }
{ const l = mk(4); l[1].float = { x: 10, y: 10 }; const r = fitDock(l, 900, "w3"); const f = r.find((w) => w.id === "w1"); if (!f || f.min) fails.push("띄운(float) 창은 접거나 지우면 안 됨"); }
{ const r = fitDock(mk(12), 900, "w11"); if (!r.some((w) => w.id === "w11")) fails.push("방금 연 창이 사라짐"); if (widthOf(r) > 900 - 32) fails.push("과다 창을 줄이지 못함"); }
const app = readFileSync(join(ROOT, "src/App.jsx"), "utf8"), soc = readFileSync(join(ROOT, "src/app/social.jsx"), "utf8");
for (const k of ["search", "friends", "chats"]) if (!new RegExp('dock\\.enabled\\) dock\\.open\\(\\{ id: "' + k + '"').test(app)) fails.push("헤더 버튼(" + k + ")이 데스크톱에서 도킹 창을 열지 않음");
if (!/<DockHost dock=\{dock\}/.test(app)) fails.push("App에 DockHost 없음");
for (const [name, re] of [["UserSearchModal", /export function UserSearchModal\(\{[^)]*docked/], ["ChatsModal", /export function ChatsModal\(\{ docked, onOpenChat/], ["FriendsModal", /export function FriendsModal\(\{ docked, onOpenChat/], ["ChatWindow", /export function ChatWindow\(/]]) if (!re.test(soc)) fails.push(name + " docked 지원 누락");
if (!/dock\.enabled\) \{ dock\.open\(\{ id: "profile:"/.test(app) || !/<UserProfilePage docked/.test(app)) fails.push("데스크톱에서 다른 유저 프로필이 도킹 창으로 열리지 않음");
if (!/export function UserProfilePage\(\{ docked/.test(soc)) fails.push("UserProfilePage docked 지원 누락");
if ((soc.match(/style=\{docked \? dockedOuter/g) || []).length < 3) fails.push("모달 3종의 docked 바깥 틀(백드롭 제거) 누락");
if (fails.length) { console.error("✗ 도킹 창 검사 실패:\n" + fails.map((x) => "  - " + x).join("\n")); process.exit(1); }
console.log("✓ 도킹 창: 폭 맞춤(오래된 창부터 접기)·float 보호·헤더 연결·프로필 창·모달 docked 지원");
