import React, { useEffect, useLayoutEffect, useRef, useState } from "react";
import { Cpu } from "lucide-react";
import { GLYPH, MONO, useScramble, useGlitchFlicker } from "./OpenTextArt.jsx";
import { t, tx } from "../lib/i18n.js";

// (v0.7.2) 빠른 리뷰 전용 진입 연출 — 분석 진행률 0·25·50·75%마다 OPEN의 글자가 하나씩 켜지며
// OBSERVE → PRACTICE → EVALUATE → NEXT LEVEL 단어가 글리치와 함께 바뀐다. 분석이 끝나면
// NEXT LEVEL 확정 연출 뒤에 onDone을 불러 리뷰 화면으로 넘어간다. 이미 캐시돼 기다릴 일이 없었다면
// 연출 없이 곧바로 넘어간다. 애니메이션은 기기의 "애니메이션 줄이기"가 아니라 사이트 설정만 따른다.
// (v0.7.3) 단계는 분석 진행률이 아니라 시간 기준으로 한 칸씩 넘어간다 — 단계마다 최소 DWELL_MS씩 보여 줘서 분석이 빨리 끝나도 EVALUATE가 안 보이는 일이 없다.
const DWELL_MS = 700;
// (v0.7.4, 사용자 요청) 글자(O·P·E·N)가 거의 같은 시간씩 보이게 — 예전엔 분석 진행률(처음 25%가 엔진 준비로 가장 오래 걸림)에 맞춰 O가 대부분의 시간을 쓰고
// P·E·N이 1초 안에 몰려 지나갔다. 이제 단계 길이는 "예상 전체 시간 ÷ 4"(진행률로 계속 보정, MIN~MAX로 제한)로 정하고, 분석이 먼저 끝나면 남은 글자도 MIN씩 보여 준다.
const STAGE_MIN_MS = 1150, STAGE_MAX_MS = 6000, STAGE_DEFAULT_TOTAL_MS = 5200;
// (v0.7.3) 게이지 막대 아래에 단계마다 붙는 이름 — 막대가 차기 시작하면 노이즈에서 풀려 나오고, 글리치 중에는 특수문자가 깜빡인다.
const GAUGE_LABELS = ["OPENING", "PUZZLE", "ENDGAME", "NETWORK"];
const WORDS = [
  { k: "O", w: "OBSERVE" },
  { k: "P", w: "PRACTICE" },
  { k: "E", w: "EVALUATE" },
  { k: "N", w: "NEXT LEVEL" },
];
const KEYFRAMES = `
@keyframes qr-jit{0%{transform:translate(0,0) skewX(0)}12%{transform:translate(-5px,1px) skewX(-8deg)}24%{transform:translate(4px,-2px) skewX(6deg)}36%{transform:translate(-2px,2px) skewX(0)}48%{transform:translate(6px,0) skewX(-5deg)}60%{transform:translate(-4px,-1px) skewX(4deg)}78%{transform:translate(2px,1px) skewX(0)}100%{transform:translate(0,0) skewX(0)}}
@keyframes qr-slice-a{0%{clip-path:inset(8% 0 78% 0)}20%{clip-path:inset(52% 0 20% 0)}40%{clip-path:inset(30% 0 52% 0)}60%{clip-path:inset(72% 0 6% 0)}80%{clip-path:inset(14% 0 66% 0)}100%{clip-path:inset(44% 0 36% 0)}}
@keyframes qr-slice-b{0%{clip-path:inset(60% 0 16% 0)}25%{clip-path:inset(10% 0 74% 0)}50%{clip-path:inset(66% 0 8% 0)}75%{clip-path:inset(26% 0 52% 0)}100%{clip-path:inset(40% 0 40% 0)}}
@keyframes qr-scan{from{background-position:0 0}to{background-position:0 6px}}
@keyframes qr-out{0%{transform:scaleY(1);opacity:1}60%{transform:scaleY(.04) scaleX(1.08);opacity:1}100%{transform:scaleY(.01) scaleX(1.3);opacity:0}}
@keyframes qr-caret{50%{opacity:0}}
`;

// (v0.7.3) 안전 영역 안에 들어오도록 자식을 비율 유지한 채 줄여서 보여 준다. 블록 글자(█)는 기기·폰트마다 폭이 달라
// (일부 안드로이드는 █가 전각 폭) 고정 글자 크기로는 모바일에서 OPEN이 잘렸다 — 실제 폭을 재서 필요한 만큼만 줄인다.
function FitBox({ children }) {
  const outer = useRef(null), inner = useRef(null);
  const [fit, setFit] = useState({ s: 1, h: null });
  useLayoutEffect(() => {
    const measure = () => {
      const o = outer.current, i = inner.current;
      if (!o || !i) return;
      const natW = i.scrollWidth, natH = i.offsetHeight, avail = o.clientWidth;
      if (!natW || !avail) return;
      const s = Math.min(1, avail / natW);
      setFit((p) => (Math.abs(p.s - s) < 0.003 && p.h === natH * s ? p : { s, h: natH * s }));
    };
    measure();
    let ro = null;
    if (typeof ResizeObserver !== "undefined") { ro = new ResizeObserver(measure); ro.observe(outer.current); }
    window.addEventListener("resize", measure);
    return () => { if (ro) ro.disconnect(); window.removeEventListener("resize", measure); };
  }, []);
  return (
    <div ref={outer} style={{ width: "100%", height: fit.h == null ? undefined : fit.h, display: "flex", justifyContent: "center" }}>
      <div ref={inner} style={{ width: "max-content", flex: "0 0 auto", transform: "scale(" + fit.s + ")", transformOrigin: "center top" }}>{children}</div>
    </div>
  );
}

function GlitchLetter({ ch, on, glitch, colors, font }) {
  const base = GLYPH[ch].join("\n");
  const art = useGlitchFlicker(base, glitch && on, 70, 0.16);
  return (
    <div style={{ position: "relative", color: on ? colors.brassHi : "rgba(143,116,76,.45)", transform: "skewX(-6deg)", filter: on ? "drop-shadow(0 0 8px rgba(196,154,80,.6))" : "none", transition: "color .25s, filter .25s" }}>
      <pre style={font}>{art}</pre>
      {glitch && on && (
        <>
          <pre aria-hidden="true" style={{ ...font, position: "absolute", left: 0, top: 0, color: "#D9736A", transform: "translateX(-4px)", mixBlendMode: "screen", animation: "qr-slice-a .42s steps(5) 1" }}>{art}</pre>
          <pre aria-hidden="true" style={{ ...font, position: "absolute", left: 0, top: 0, color: "#6FA8DC", transform: "translateX(4px)", mixBlendMode: "screen", animation: "qr-slice-b .42s steps(5) 1" }}>{art}</pre>
        </>
      )}
    </div>
  );
}

function GlitchLetters({ glitch, lit, colors }) {
  const font = { margin: 0, fontFamily: MONO, fontWeight: 700, fontSize: 20, lineHeight: 1, whiteSpace: "pre" };
  return (
    <FitBox>
      <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "center", gap: 14, animation: glitch ? "qr-jit .42s steps(2) 1" : "none" }}>
        {["O", "P", "E", "N"].map((ch, i) => <GlitchLetter key={ch} ch={ch} on={lit.includes(i)} glitch={glitch} colors={colors} font={font} />)}
      </div>
    </FitBox>
  );
}

// (v0.7.4, 사용자 요청) 게이지 한 칸이 가득 차는 순간, 그 칸 아래 이름이 글리치와 함께 바뀐다 — OPENING→OBSERVE, PUZZLE→PRACTICE, ENDGAME→EVALUATE, NETWORK→NEXT LEVEL.
function GaugeLabel({ idle, final, full, on, glitch, colors }) {
  const [burst, setBurst] = useState(false);
  const firstRef = useRef(true);
  useEffect(() => {
    if (firstRef.current) { firstRef.current = false; return undefined; }
    if (!full) return undefined;
    setBurst(true);
    const id = setTimeout(() => setBurst(false), 750);
    return () => clearTimeout(id);
  }, [full]);
  const text = full ? final : idle;
  const word = useScramble(text, on || full, 26, full ? 1 : 0);
  const shown = useGlitchFlicker(word, burst || (glitch && on), 70, burst ? 0.45 : 0.22);
  const hot = burst || (glitch && on);
  return (
    <div style={{ marginTop: 6, fontFamily: MONO, fontSize: full ? 10.5 : 9.5, fontWeight: 900, letterSpacing: ".08em", whiteSpace: "nowrap", textAlign: "center", color: full ? colors.text : on ? colors.brassHi : colors.soft, opacity: on || full ? 1 : 0.45,
      transform: burst ? "translateX(1.5px) skewX(-8deg)" : "none",
      textShadow: hot ? "-2px 0 #D9736A, 2px 0 #6FA8DC" : full ? "0 0 10px rgba(236,203,134,.7)" : on ? "0 0 8px rgba(196,154,80,.55)" : "none", transition: "color .25s, opacity .25s, font-size .2s" }}>{on || full ? shown : text}</div>
  );
}

// 한 글자(단계)가 보이는 시간 — 예상 전체 시간 ÷ 4(진행률로 보정), MIN~MAX 제한. 분석이 끝났으면 남은 단계는 MIN씩.
function stageLen(pct, done, elapsed) {
  if (done) return STAGE_MIN_MS;
  const est = pct >= 0.08 ? elapsed / pct : Math.max(STAGE_DEFAULT_TOTAL_MS, elapsed * 2.2);   // 아직 진행률이 없으면(엔진 준비 중) 지금까지 걸린 시간에 비례해 늘린다
  return Math.max(STAGE_MIN_MS, Math.min(STAGE_MAX_MS, est / 4));
}

export default function QuickReviewIntro({ done, gradedCount, total, colors, onDone }) {
  const pct = total ? Math.min(1, gradedCount / total) : 0;
    // 화면에 보이는 단계(shown)는 목표(target)를 향해 한 칸씩, 단계마다 최소 DWELL_MS를 채우고 넘어간다.
  const [shown, setShown] = useState(0);
  const [glitch, setGlitch] = useState(true);
  const [finale, setFinale] = useState(false);
  const [leaving, setLeaving] = useState(false);
  const waitedRef = useRef(false);
  const mountedAt = useRef(Date.now());
  if (!done) waitedRef.current = true;

  const stageStartRef = useRef(Date.now());
  useEffect(() => { stageStartRef.current = Date.now(); }, [shown]);
  // 지금 단계의 경과(0~0.96) — 게이지 칸이 단계 시간 동안 차오르다가 다음 단계가 시작될 때 가득 찬다.
  const [frac, setFrac] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setFrac(Math.min(0.96, (Date.now() - stageStartRef.current) / stageLen(pct, done, Date.now() - mountedAt.current))), 90);
    return () => clearInterval(id);
  }, [pct, done]);
  useEffect(() => {
    if (shown >= 3) return undefined;
    if (shown >= 2 && !done) return undefined;   // EVALUATE는 분석이 끝날 때까지 머문다(NEXT LEVEL은 끝나야 켜짐)
    const len = stageLen(pct, done, Date.now() - mountedAt.current);
    const remaining = Math.max(0, len - (Date.now() - stageStartRef.current));
    const id = setTimeout(() => setShown((v) => Math.min(3, v + 1)), remaining);
    return () => clearTimeout(id);
  }, [shown, pct, done]);

  // 단계가 바뀔 때마다 글리치 한 번, 그리고 가끔 불규칙하게 잔글리치.
  useEffect(() => {
    setGlitch(true);
    const id = setTimeout(() => setGlitch(false), 440);
    return () => clearTimeout(id);
  }, [shown, finale]);
  useEffect(() => {
    if (done) return undefined;
    const id = setInterval(() => { setGlitch(true); setTimeout(() => setGlitch(false), 260); }, 2300);
    return () => clearInterval(id);
  }, [done]);

  // 끝났을 때: 기다린 적이 없으면(캐시 등) 바로 넘기고, 기다렸다면 NEXT LEVEL까지 보여 준 뒤 확정 연출로 넘긴다.
  useEffect(() => {
    if (!done) return undefined;
    if (!waitedRef.current || Date.now() - mountedAt.current < 250) { onDone(); return undefined; }
    return undefined;
  }, [done]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!done || !waitedRef.current || shown < 3) return undefined;
    setFinale(true);
    const t1 = setTimeout(() => setLeaving(true), STAGE_MIN_MS);
    const t2 = setTimeout(onDone, STAGE_MIN_MS + 270);
    return () => { clearTimeout(t1); clearTimeout(t2); };
  }, [done, shown]); // eslint-disable-line react-hooks/exhaustive-deps

  const lit = finale ? [0, 1, 2, 3] : Array.from({ length: shown + 1 }, (_, i) => i);
  const pctText = Math.round(pct * 100);

  return (
    <div style={{ flex: "1 1 auto", display: "flex", alignItems: "center", justifyContent: "center", padding: "24px max(24px, env(safe-area-inset-right)) 24px max(24px, env(safe-area-inset-left))", position: "relative", overflow: "hidden", boxSizing: "border-box", minWidth: 0 }}>
      <style>{KEYFRAMES}</style>
      <div aria-hidden="true" style={{ position: "absolute", inset: 0, pointerEvents: "none", opacity: 0.35, backgroundImage: "repeating-linear-gradient(0deg, rgba(0,0,0,.35) 0px, rgba(0,0,0,.35) 1px, transparent 1px, transparent 3px)", animation: "qr-scan .5s linear infinite" }} />
      <div style={{ position: "relative", width: "100%", maxWidth: 340, minWidth: 0, textAlign: "center", animation: leaving ? "qr-out .27s ease-in forwards" : "none" }}>
        {/* (v0.7.4, 사용자 요청) OPEN 위쪽 UI는 모두 없앴다 — 단계 단어는 아래 게이지 이름이 글리치와 함께 바뀌며 보여 준다. */}
        <GlitchLetters glitch={glitch} lit={lit} colors={colors} />
        <div data-phase={shown} style={{ display: "flex", gap: 4, margin: "22px 0 0" }} role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={pctText} aria-label={t("빠른 리뷰 분석 중")}>
          {WORDS.map((w, i) => {
            const real = Math.max(0, Math.min(1, pct * 4 - i));
            const fill = finale ? 1 : i < shown ? 1 : i === shown ? Math.max(frac, real) : 0;
            const full = fill >= 1;
            return (
              <div key={w.k} style={{ flex: 1 }}>
                <div style={{ height: 6, background: colors.panel, border: "1px solid " + colors.border, overflow: "hidden", transform: "skewX(-18deg)" }}>
                  <div style={{ height: "100%", width: fill * 100 + "%", background: "linear-gradient(90deg," + colors.brass + "," + colors.brassHi + ")", transition: "width .2s linear" }} />
                </div>
                <GaugeLabel idle={GAUGE_LABELS[i]} final={w.w} full={full} on={fill > 0 || shown >= i} glitch={glitch} colors={colors} />
              </div>
            );
          })}
        </div>
        {/* (v0.7.4, 사용자 요청) 분석 중 n%는 게이지 이름(OPENING…)에서 더 떨어뜨려 아래에 둔다. */}
        {/* (v0.7.3) 예전엔 헤더에 있던 "분석 중 n%"를 진행 막대 아래로 옮겼다. */}
        <div className="flex items-center justify-center gap-1" style={{ marginTop: 34, fontSize: 11.5, fontWeight: 700, color: colors.soft }}>{tx("{0} 분석 중 {1}", <Cpu size={12} />, pctText)}%</div>
      </div>
    </div>
  );
}
