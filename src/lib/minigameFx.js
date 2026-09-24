// ============================================================ 미니게임 효과음·진동 ============================================================
// (v0.5.3 기능, 사용자 요청: 미니게임 연출·사운드·피드백 강화) 카운트다운 틱·시작 신호·정답/오답·라운드
// 승패·최종 승리 팡파르 같은 짧은 효과음을 WebAudio 오실레이터로 즉석 합성한다 — 음원 파일을 public/에
// 추가하지 않는다(Vercel Deployment Storage 누적 문제, README 워크플로우 규칙 참고). 사이트 공통
// 효과음 설정(켜기/끄기·볼륨, prefs.js의 loadSfxPref/loadSfxVolume)을 그대로 따르고, 진동(모바일)도
// 효과음이 켜져 있을 때만 쓴다.
import { loadSfxPref, loadSfxVolume } from "./prefs.js";

let ctx = null;
function audio() {
  if (typeof window === "undefined") return null;
  const AC = window.AudioContext || window.webkitAudioContext;
  if (!AC) return null;
  if (!ctx) { try { ctx = new AC(); } catch { return null; } }
  if (ctx.state === "suspended") ctx.resume().catch(() => { });
  return ctx;
}

// notes: [[주파수Hz, 시작초, 길이초, 파형?, 음량배율?], ...]
function play(notes) {
  if (!loadSfxPref()) return;
  const ac = audio(); if (!ac) return;
  const vol = loadSfxVolume() * 0.32;
  const t0 = ac.currentTime + 0.01;
  for (const [freq, at, dur, type = "triangle", gain = 1, slideTo] of notes) {
    try {
      const o = ac.createOscillator(), g = ac.createGain();
      o.type = type;
      o.frequency.setValueAtTime(freq, t0 + at);
      if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, t0 + at + dur);
      g.gain.setValueAtTime(0.0001, t0 + at);
      g.gain.exponentialRampToValueAtTime(Math.max(0.0002, vol * gain), t0 + at + 0.012);
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + at + dur);
      o.connect(g); g.connect(ac.destination);
      o.start(t0 + at); o.stop(t0 + at + dur + 0.02);
    } catch { }
  }
}

const SOUNDS = {
  tick: () => play([[660, 0, 0.09, "square", 0.5]]),
  go: () => play([[880, 0, 0.12, "square", 0.6], [1320, 0.06, 0.22, "triangle", 0.7]]),
  correct: () => play([[784, 0, 0.09], [1175, 0.07, 0.16]]),
  wrong: () => play([[196, 0, 0.16, "sawtooth", 0.45, 140]]),
  tap: () => play([[520, 0, 0.05, "triangle", 0.45]]),
  roundWin: () => play([[659, 0, 0.1], [880, 0.09, 0.1], [1319, 0.18, 0.22]]),
  roundLose: () => play([[392, 0, 0.14, "triangle", 0.6], [294, 0.12, 0.26, "triangle", 0.6]]),
  roundDraw: () => play([[523, 0, 0.12, "triangle", 0.5], [523, 0.14, 0.16, "triangle", 0.5]]),
  win: () => play([[523, 0, 0.12], [659, 0.11, 0.12], [784, 0.22, 0.12], [1047, 0.33, 0.4, "triangle", 1.1], [784, 0.33, 0.4, "sine", 0.5]]),
  lose: () => play([[440, 0, 0.18, "triangle", 0.6], [370, 0.17, 0.18, "triangle", 0.6], [294, 0.34, 0.45, "triangle", 0.6]]),
  whoosh: () => play([[300, 0, 0.18, "sine", 0.35, 900]]),
  capture: () => play([[180, 0, 0.12, "square", 0.45, 90]]),
  warn: () => play([[988, 0, 0.07, "square", 0.35]]),
};

export function fx(name) { try { const s = SOUNDS[name]; if (s) s(); } catch { } }

export function buzz(pattern) {
  if (!loadSfxPref()) return;
  try { if (typeof navigator !== "undefined" && navigator.vibrate) navigator.vibrate(pattern); } catch { }
}
