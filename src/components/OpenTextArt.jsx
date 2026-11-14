import React, { useEffect, useRef, useState } from "react";
import { useOnScreen } from "./offscreenPause.jsx";
import { useInView } from "framer-motion";
import { isLite } from "../lib/perfMode.js";

// 텍스트 아트 공용 도구 — 블록 글자(GLYPH)·노이즈에서 풀려 나오는 스크램블(useScramble·ScrambleText)·글리치·흐르는 글자 띠(AsciiMarquee).
// (v0.7.5, 사용자 요청) /about의 "네 글자에 담은 OpenChess" 구간(OpenSection: 학습 순환·플랫폼 구성 풀이, 카드, 텍스트 보드)은 지웠다.
// 애니메이션은 기기의 "애니메이션 줄이기" 설정이 아니라 사이트 설정만 따른다(check-reduced-motion 원칙).
const C = { neon: "#C49A50", neonHi: "#ECCB86", ink: "#B8A78C", ivory: "#FAF2E2", navy: "#1B1009", panel: "#2E1B10" };
export const MONO = "ui-monospace, SFMono-Regular, Menlo, Consolas, 'Courier New', monospace";

// ── 블록 글자(5줄, N만 7칸) ──
export const GLYPH = {
  O: [" ████ ", "██  ██", "██  ██", "██  ██", " ████ "],
  P: ["█████ ", "██  ██", "█████ ", "██    ", "██    "],
  E: ["██████", "██    ", "█████ ", "██    ", "██████"],
  N: ["██   ██", "███  ██", "██ █ ██", "██  ███", "██   ██"],
};
const NOISE = "░▒▓█▀▄▌▐#%&@01<>/\\|=+*";
const noiseChar = () => NOISE[Math.floor(Math.random() * NOISE.length)];
const mix = (text, keep) => {
  let o = "";
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    o += i < keep || /\s/.test(ch) ? ch : noiseChar();
  }
  return o;
};

// (v0.7.3) 글리치가 켜진 동안 글자 일부가 노이즈 문자(░▒▓█#%&@…)로 바뀌며 깜빡인다 — /about의 스크램블과 같은 문자 집합.
// rate는 한 번에 바뀌는 글자 비율. 공백·줄바꿈은 그대로 둔다. 가벼운 모드에서는 바꾸지 않는다.
export function useGlitchFlicker(text, active, ms = 70, rate = 0.2) {
  const [out, setOut] = useState(text);
  useEffect(() => {
    if (!active || isLite()) { setOut(text); return undefined; }
    const roll = () => { let o = ""; for (let i = 0; i < text.length; i++) { const ch = text[i]; o += /\s/.test(ch) || Math.random() > rate ? ch : noiseChar(); } setOut(o); };
    roll();
    const id = setInterval(roll, ms);
    return () => { clearInterval(id); setOut(text); };
  }, [text, active, ms, rate]);
  return active ? out : text;
}

// 노이즈에서 한 글자씩 풀려 나오는 문자열. run이 true가 되거나 text가 바뀔 때마다 다시 재생한다.
export function useScramble(text, run = true, ms = 34, nonce = 0) {
  const [out, setOut] = useState(() => mix(text, 0));
  useEffect(() => {
    if (isLite()) { setOut(text); return undefined; } // 가벼운 모드: 풀려 나오는 연출 없이 바로 최종 글자
    if (!run) { setOut(mix(text, 0)); return undefined; }
    let f = 0;
    const total = Math.max(10, Math.min(28, text.length));
    const id = setInterval(() => {
      f += 1;
      setOut(f >= total ? text : mix(text, Math.floor((text.length * f) / total)));
      if (f >= total) clearInterval(id);
    }, ms);
    return () => clearInterval(id);
  }, [text, run, ms, nonce]);
  return out;
}

// 화면에 들어올 때마다 풀려 나오는 한 줄 글자 — 챕터 머리말 등에 쓴다.
export function ScrambleText({ text, style, className, loopMs = 0 }) {
  const ref = useRef(null);
  const seen = useInView(ref, { amount: 0.6 });
  // loopMs가 있으면 화면에 보이는 동안 그 간격마다 글자가 다시 노이즈에서 풀려 나온다(자동 반복).
  const [round, setRound] = useState(0);
  const onScreen = useOnScreen();   // (v0.7.7 렉 수정) 감싼 영역이 화면 밖이면 반복을 멈춘다
  useEffect(() => { if (!loopMs || !seen || !onScreen || isLite()) return undefined; const id = setInterval(() => setRound((v) => v + 1), loopMs); return () => clearInterval(id); }, [loopMs, seen, onScreen]);
  const out = useScramble(text, seen, 34, round);
  return <span ref={ref} className={className} style={{ fontFamily: MONO, ...style }}>{out}</span>;
}

// ── 흐르는 글자 띠 ──
export function AsciiMarquee({ reverse = false, dim = false }) {
  const unit = "░▒▓█ OBSERVE ▸ PRACTICE ▸ EVALUATE ▸ NEXT LEVEL █▓▒░  ♜  OPENING ◆ PUZZLE ◆ ENDGAME ◆ NETWORK  ♞  ";
  return (
    <>
    {/* (v0.7.5) 띠의 흐름 애니메이션 — 예전엔 OPEN 구간(OpenSection)의 <style>에 함께 있었는데 그 구간을 지우며 이리 옮겼다 */}
    <style>{"@keyframes open-marquee{to{transform:translateX(-50%)}}@keyframes open-marquee-r{from{transform:translateX(-50%)}to{transform:translateX(0)}}"}</style>
    <div aria-hidden="true" style={{ overflow: "hidden", whiteSpace: "nowrap", borderTop: "1px solid rgba(196,154,80,.25)", borderBottom: "1px solid rgba(196,154,80,.25)", background: "rgba(27,16,9,.7)", padding: "9px 0", transform: "skewY(-1.2deg)" }}>
      <div className="open-marquee-run" style={{ display: "inline-block", fontFamily: MONO, fontWeight: 800, fontStyle: "italic", fontSize: 13, letterSpacing: ".14em", color: dim ? "rgba(184,167,140,.55)" : C.neon, animation: (reverse ? "open-marquee-r" : "open-marquee") + " 46s linear infinite" }}>
        {unit.repeat(4)}
      </div>
    </div>
    </>
  );
}
