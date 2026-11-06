import React, { useEffect, useRef, useState } from "react";
import { GLYPH, MONO, useScramble } from "./OpenTextArt.jsx";

// (v0.7.2) 빠른 리뷰 전용 진입 연출 — 분석 진행률 0·25·50·75%마다 OPEN의 글자가 하나씩 켜지며
// OBSERVE → PRACTICE → EVALUATE → NEXT LEVEL 단어가 글리치와 함께 바뀐다. 분석이 끝나면
// NEXT LEVEL 확정 연출 뒤에 onDone을 불러 리뷰 화면으로 넘어간다. 이미 캐시돼 기다릴 일이 없었다면
// 연출 없이 곧바로 넘어간다. 애니메이션은 기기의 "애니메이션 줄이기"가 아니라 사이트 설정만 따른다.
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

function GlitchLetters({ glitch, lit, colors }) {
  return (
    <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "center", gap: "clamp(8px, 3vw, 16px)", animation: glitch ? "qr-jit .42s steps(2) 1" : "none" }}>
      {["O", "P", "E", "N"].map((ch, i) => {
        const on = lit.includes(i);
        const art = GLYPH[ch].join("\n");
        const font = { margin: 0, fontFamily: MONO, fontWeight: 700, fontSize: "clamp(13px, 4.6vw, 22px)", lineHeight: 1, whiteSpace: "pre" };
        return (
          <div key={ch} style={{ position: "relative", color: on ? colors.brassHi : "rgba(143,116,76,.45)", transform: "skewX(-6deg)", filter: on ? "drop-shadow(0 0 8px rgba(196,154,80,.6))" : "none", transition: "color .25s, filter .25s" }}>
            <pre style={font}>{art}</pre>
            {glitch && on && (
              <>
                <pre aria-hidden="true" style={{ ...font, position: "absolute", left: 0, top: 0, color: "#D9736A", transform: "translateX(-4px)", mixBlendMode: "screen", animation: "qr-slice-a .42s steps(5) 1" }}>{art}</pre>
                <pre aria-hidden="true" style={{ ...font, position: "absolute", left: 0, top: 0, color: "#6FA8DC", transform: "translateX(4px)", mixBlendMode: "screen", animation: "qr-slice-b .42s steps(5) 1" }}>{art}</pre>
              </>
            )}
          </div>
        );
      })}
    </div>
  );
}

export default function QuickReviewIntro({ done, gradedCount, total, depth, label, colors, onDone }) {
  const pct = total ? Math.min(1, gradedCount / total) : 0;
  const phase = done ? 3 : Math.min(3, Math.floor(pct * 4));
  const [glitch, setGlitch] = useState(true);
  const [finale, setFinale] = useState(false);
  const [leaving, setLeaving] = useState(false);
  const waitedRef = useRef(false);
  const mountedAt = useRef(Date.now());
  if (!done) waitedRef.current = true;

  // 단계가 바뀔 때마다 글리치 한 번, 그리고 가끔 불규칙하게 잔글리치.
  useEffect(() => {
    setGlitch(true);
    const id = setTimeout(() => setGlitch(false), 440);
    return () => clearTimeout(id);
  }, [phase, finale]);
  useEffect(() => {
    if (done) return undefined;
    const id = setInterval(() => { setGlitch(true); setTimeout(() => setGlitch(false), 260); }, 2300);
    return () => clearInterval(id);
  }, [done]);

  // 끝났을 때: 기다린 적이 없으면(캐시 등) 바로 넘기고, 기다렸다면 NEXT LEVEL 확정 연출 뒤에 넘긴다.
  useEffect(() => {
    if (!done) return undefined;
    if (!waitedRef.current || Date.now() - mountedAt.current < 250) { onDone(); return undefined; }
    setFinale(true);
    const t1 = setTimeout(() => setLeaving(true), 650);
    const t2 = setTimeout(onDone, 920);
    return () => { clearTimeout(t1); clearTimeout(t2); };
  }, [done]); // eslint-disable-line react-hooks/exhaustive-deps

  const lit = finale ? [0, 1, 2, 3] : Array.from({ length: phase + 1 }, (_, i) => i);
  const cur = WORDS[phase];
  const word = useScramble(cur.w, true, 24);

  return (
    <div style={{ flex: "1 1 auto", display: "flex", alignItems: "center", justifyContent: "center", padding: 24, position: "relative", overflow: "hidden" }}>
      <style>{KEYFRAMES}</style>
      <div aria-hidden="true" style={{ position: "absolute", inset: 0, pointerEvents: "none", opacity: 0.35, backgroundImage: "repeating-linear-gradient(0deg, rgba(0,0,0,.35) 0px, rgba(0,0,0,.35) 1px, transparent 1px, transparent 3px)", animation: "qr-scan .5s linear infinite" }} />
      <div style={{ position: "relative", width: "100%", maxWidth: 340, textAlign: "center", animation: leaving ? "qr-out .27s ease-in forwards" : "none" }}>
        <div style={{ fontFamily: MONO, fontSize: 10.5, fontWeight: 800, letterSpacing: ".22em", color: colors.soft, marginBottom: 16 }}>QUICK REVIEW // DEPTH {depth}</div>
        <GlitchLetters glitch={glitch} lit={lit} colors={colors} />
        <div style={{ marginTop: 20, minHeight: 34, fontFamily: MONO, fontSize: "clamp(18px, 5vw, 24px)", fontWeight: 900, fontStyle: "italic", letterSpacing: ".06em", color: colors.brassHi, textShadow: glitch ? "-2px 0 #D9736A, 2px 0 #6FA8DC" : "0 0 14px rgba(196,154,80,.45)" }}>
          <span style={{ color: colors.brass }}>{cur.k}</span> ▸ {word}<span style={{ animation: "qr-caret 1s steps(1) infinite", color: colors.brass }}>▌</span>
        </div>
        <div style={{ display: "flex", gap: 4, margin: "18px 0 0" }} role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(pct * 100)} aria-label={label}>
          {WORDS.map((w, i) => {
            const fill = finale ? 1 : Math.max(0, Math.min(1, pct * 4 - i));
            return (
              <div key={w.k} style={{ flex: 1 }}>
                <div style={{ height: 6, background: colors.panel, border: "1px solid " + colors.border, overflow: "hidden", transform: "skewX(-18deg)" }}>
                  <div style={{ height: "100%", width: fill * 100 + "%", background: "linear-gradient(90deg," + colors.brass + "," + colors.brassHi + ")", transition: "width .2s linear" }} />
                </div>
                <div style={{ marginTop: 4, fontFamily: MONO, fontSize: 9.5, fontWeight: 800, color: fill > 0 ? colors.brass : colors.soft, opacity: fill > 0 ? 1 : 0.5 }}>{w.k}</div>
              </div>
            );
          })}
        </div>
        <div style={{ marginTop: 6, fontSize: 11.5, fontWeight: 700, color: colors.soft }}>{label} · {Math.min(gradedCount, total)} / {total}</div>
      </div>
    </div>
  );
}
