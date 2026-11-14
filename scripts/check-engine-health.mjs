#!/usr/bin/env node
/** (v0.7.7, 사용자 제보 "사이트 전체 렉 · 엔진 연결이 수시로 끊겨 새로고침 · 모바일 성장 분석이 아예 안 됨" 재발 방지)
 *  ① 분석 풀 크기(src/lib/enginePool.js poolSizeFor): 휴대폰은 Lite 2개·대형 신경망 0개(메인 엔진으로 대신), 데스크톱은 코어 2개를 남기고 최대 8,
 *     기기 메모리의 1/4을 넘지 않는다. 예전엔 코어 수만큼(휴대폰 8개 ≈ 600MB, 대형 4개 ≈ 2.3GB) 띄워 브라우저가 워커·탭을 강제 종료했다.
 *  ② 풀 관리(src/app/common.jsx): 죽은 워커를 표시하고(dead) 풀에서 빼 새로 띄우며, 대형 신경망은 부팅 제한 시간을 그 프로필 값으로 준다.
 *     휴대폰은 앱 시작 때 풀을 미리 띄우지 않는다(src/App.jsx).
 *  ③ 메인 엔진 감시(src/app/shell.jsx useEngine): 숨긴 탭에서는 판정하지 않고, 타이머가 크게 밀리면 시계만 새로 시작하며, 부팅은 프로필의 부팅 제한 시간만큼
 *     기다리고(15초 고정 금지), readyok 누락은 두 번 연속일 때만, 재시작 상한에 걸려도 1분 뒤 다시 시도, 부팅 뒤 워커가 죽으면 곧바로 다시 띄운다.
 *  ④ 렌더링 비용: FadeIn은 기본으로 layout 측정을 하지 않고(layout=false), 엔진 라인 줄은 순위가 바뀔 때만 위치를 잰다(layoutDependency).
 *     화면 밖 영역(분석 탭 아래 성장 분석, 모바일 옆 페이지)은 OffscreenPause로 장식 애니메이션·반복 타이머를 멈춘다.
 *  npm run build 전에 prebuild로 자동 실행된다. 실행: node scripts/check-engine-health.mjs */
import { readFileSync } from "node:fs";
import { poolSizeFor } from "../src/lib/enginePool.js";
const rd = (p) => readFileSync(new URL("../" + p, import.meta.url), "utf8");
const fails = [];
const ok = (c, m) => { if (!c) fails.push(m); };

// ① 풀 크기
const eq = (args, want, why) => { const got = poolSizeFor(args); ok(got === want, why + ": " + JSON.stringify(args) + " → " + got + " (기대 " + want + ")"); };
eq({ cores: 8, heavy: false, constrained: true, memGB: 4 }, 2, "휴대폰 Lite 풀");
eq({ cores: 8, heavy: true, constrained: true, memGB: 6 }, 0, "휴대폰 대형 신경망은 풀 없음");
eq({ cores: 16, heavy: false, constrained: false, memGB: 8 }, 8, "데스크톱 Lite 상한 8");
eq({ cores: 4, heavy: false, constrained: false, memGB: 8 }, 2, "4코어 데스크톱은 2(화면·메인 엔진 몫 2코어)");
eq({ cores: 12, heavy: true, constrained: false, memGB: 8 }, 2, "데스크톱 대형 신경망 2");
eq({ cores: 12, heavy: true, constrained: false, memGB: 2 }, 0, "메모리 2GB면 대형 신경망 풀 없음");
for (let cores = 1; cores <= 64; cores++) for (const heavy of [false, true]) for (const constrained of [false, true]) {
  const n = poolSizeFor({ cores, heavy, constrained, memGB: 8 });
  ok(n <= (heavy ? 2 : 8), "풀이 상한을 넘음: " + JSON.stringify({ cores, heavy, constrained, n }));
  if (constrained) ok(n <= (heavy ? 0 : 2), "휴대폰 풀이 너무 큼: " + JSON.stringify({ cores, heavy, n }));
}

// ② 풀 관리
const common = rd("src/app/common.jsx");
ok(/export function analyzePoolSize\(profile\)[\s\S]{0,300}poolSizeFor\(/.test(common), "analyzePoolSize가 poolSizeFor를 쓰지 않음");
ok(!/Math\.max\(2, Math\.min\(cores, 32\)\)/.test(common), "분석 풀이 다시 코어 수만큼(최대 32) 띄워짐");
ok(/if \(handle\) handle\.dead = true;/.test(common) && /const alive = ws\.filter\(\(w\) => w && !w\.dead\)/.test(common), "죽은 풀 워커를 표시·제외하지 않음");
ok(/bootAnalysisWorker\(urls, poolBootTimeout\(prof\)\)/.test(common), "풀 워커 부팅에 프로필 부팅 제한 시간을 쓰지 않음(대형 신경망은 4초 안에 부팅 못 함)");
ok(/if \(isConstrainedDevice\(\)\) return undefined;\s*\n\s*const boot = \(\) =>/.test(rd("src/App.jsx")), "휴대폰에서도 앱 시작 때 분석 풀을 미리 띄움");

// ③ 메인 엔진 감시
const shell = rd("src/app/shell.jsx");
const wd = (shell.match(/const reboot = \(why\) => \{[\s\S]*?return \(\) => \{ clearInterval\(iv\)/) || [""])[0];
ok(wd, "useEngine 감시 블록을 찾지 못함");
ok(/document\.visibilityState === "hidden"\) return;/.test(wd), "숨긴 탭에서도 엔진 감시가 판정함(돌아오는 순간 멀쩡한 엔진을 재시작)");
ok(/gap > 12000\) \{ resetClocks\(\); return; \}/.test(wd), "타이머가 크게 밀린 뒤(기기 잠듦) 시계를 새로 시작하지 않음");
ok(/loadingSinceRef\.current > bootBudgetRef\.current/.test(wd) && !/loadingSinceRef\.current > 15000/.test(wd), "부팅 감시가 프로필 부팅 제한 시간 대신 고정 15초를 씀(큰 신경망 다운로드 중 재시작)");
ok(/missRef\.current >= 2/.test(wd), "readyok 한 번 누락으로 재시작함");
ok(/rebootCountRef\.current >= 6\) \{ if \(now - lastRebootRef\.current < 60000\) return; rebootCountRef\.current = 0; \}/.test(wd), "재시작 상한에 걸리면 영구히 꺼짐(새로고침 필요)");
ok(/crashed[\s\S]{0,400}setBootNonce\(\(n\) => n \+ 1\)/.test(shell), "부팅 뒤 메인 엔진 워커가 죽어도 곧바로 다시 띄우지 않음");

// ④ 렌더링 비용
ok(/export const FadeIn = React\.forwardRef\(function FadeIn\(\{[^}]*layout = false/.test(common), "FadeIn의 layout 기본값이 켜짐(다시 그릴 때마다 강제 레이아웃)");
ok(/<motion\.div layout layoutDependency=\{slotIdx\}/.test(rd("src/components/engineLines.jsx")), "엔진 라인 줄이 평가치 갱신마다 위치를 다시 잼(layoutDependency 없음)");
ok(/<OffscreenPause visible=\{i === idx\}>/.test(rd("src/components/swipePager.jsx")), "모바일 옆 페이지가 보이지 않을 때도 애니메이션이 돎");
ok(/<OffscreenPause style=/.test(rd("src/app/growthHome.jsx")), "분석 탭 아래 성장 분석이 화면 밖에서도 애니메이션이 돎");
ok(/\.oc-paused[^{]*\{ animation-play-state: paused !important; \}/.test(rd("src/index.css")), "oc-paused CSS 규칙이 없음");
const gm = rd("src/app/growthMotion.jsx");
ok(/if \(!demo \|\| !onScreen\) return undefined;/.test(gm), "성장 분석 데모 보드가 화면 밖에서도 반복 재생됨");

// ⑤ 모바일 + 대형 신경망: 자동 리뷰(성장 분석)는 Lite 풀로
ok(/const reviewEngine = useMemo\([\s\S]{0,400}isConstrainedDevice\(\)[\s\S]{0,200}QUICK_REVIEW_ENGINE[\s\S]{0,200}useAutoReview\(\{[^}]*engine: reviewEngine/.test(rd("src/app/growth.jsx")), "휴대폰에서 대형 신경망을 고르면 성장 분석 자동 리뷰가 메인 엔진 하나로만 돌아 판마다 몇 분씩 걸림");
ok(/if \(size > 0 && isConstrainedDevice\(\)\)/.test(common), "휴대폰에서 풀 없는 프로필을 부를 때 다른 풀(자동 리뷰 Lite 풀)을 죽임");
if (fails.length) { console.error("✖ check-engine-health 실패:\n  " + fails.join("\n  ")); process.exit(1); }
console.log("✔ check-engine-health: 분석 풀 크기가 기기에 맞고(휴대폰 Lite 2·대형 0), 죽은 워커 교체·엔진 감시 오탐 방지·화면 밖 애니메이션 정지·layout 측정 절감이 유지된다");
