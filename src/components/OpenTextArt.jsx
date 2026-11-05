import React, { useEffect, useRef, useState } from "react";
import { motion, useInView } from "framer-motion";
import { t } from "../lib/i18n.js";

// /about 전용 텍스트 아트 모음 — OPEN의 네 글자에 단어를 하나씩 붙인 두 가지 풀이
//  (1) Observe · Practice · Evaluate · Next level : 학습 순환
//  (2) Opening · Puzzle · Endgame · Network       : 플랫폼 구성
// 블록 글자(█)가 노이즈에서 풀려 나오는 스크램블, 글자 하나씩 짚어 가는 하이라이트, 흐르는 마키,
// 한 수씩 두어지는 텍스트 보드를 이 파일 하나에 모았다. 애니메이션은 기기의 "애니메이션 줄이기" 설정이 아니라
// 사이트 설정만 따른다(check-reduced-motion 원칙).
const C = { neon: "#C49A50", neonHi: "#ECCB86", ink: "#B8A78C", ivory: "#FAF2E2", navy: "#1B1009", panel: "#2E1B10" };
export const MONO = "ui-monospace, SFMono-Regular, Menlo, Consolas, 'Courier New', monospace";
const CUT = "polygon(0 0, calc(100% - 16px) 0, 100% 16px, 100% 100%, 16px 100%, 0 calc(100% - 16px))";

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

// 노이즈에서 한 글자씩 풀려 나오는 문자열. run이 true가 되거나 text가 바뀔 때마다 다시 재생한다.
export function useScramble(text, run = true, ms = 34) {
  const [out, setOut] = useState(() => mix(text, 0));
  useEffect(() => {
    if (!run) { setOut(mix(text, 0)); return undefined; }
    let f = 0;
    const total = Math.max(10, Math.min(28, text.length));
    const id = setInterval(() => {
      f += 1;
      setOut(f >= total ? text : mix(text, Math.floor((text.length * f) / total)));
      if (f >= total) clearInterval(id);
    }, ms);
    return () => clearInterval(id);
  }, [text, run, ms]);
  return out;
}

// 화면에 들어올 때마다 풀려 나오는 한 줄 글자 — 챕터 머리말 등에 쓴다.
export function ScrambleText({ text, style, className }) {
  const ref = useRef(null);
  const seen = useInView(ref, { amount: 0.6 });
  const out = useScramble(text, seen);
  return <span ref={ref} className={className} style={{ fontFamily: MONO, ...style }}>{out}</span>;
}

// 블록 글자 하나. active면 네온으로 켜지고 나머지는 어둡게 가라앉는다.
function BlockLetter({ ch, active, run, onPick, index }) {
  const art = useScramble(GLYPH[ch].join("\n"), run, 30 + index * 4);
  return (
    <button type="button" onClick={onPick} aria-label={ch} className="press"
      style={{ background: "none", border: "none", padding: 0, cursor: "pointer", color: active ? C.neon : "#5A4128", transition: "color .3s, filter .3s, transform .3s",
        filter: active ? "drop-shadow(0 0 10px rgba(196,154,80,.65))" : "none", transform: active ? "translateY(-4px) skewX(-6deg)" : "skewX(-6deg)" }}>
      <pre style={{ margin: 0, fontFamily: MONO, fontWeight: 700, fontSize: "clamp(13px, 4.4vw, 30px)", lineHeight: 1, letterSpacing: 0, whiteSpace: "pre" }}>{art}</pre>
    </button>
  );
}

function getSets() {
  return [
    { id: "loop", tab: t("학습 순환"), items: [
      { k: "O", w: "Observe", d: t("오프닝 도감과 마스터의 대국을 보며 흐름을 익힙니다.") },
      { k: "P", w: "Practice", d: t("대국과 퍼즐로 직접 두며 손에 익힙니다.") },
      { k: "E", w: "Evaluate", d: t("게임 리뷰가 내 수를 평가하고 실수를 짚어 줍니다.") },
      { k: "N", w: "Next level", d: t("경험치를 쌓아 티어를 올리고 다음 단계로 나아갑니다.") },
    ] },
    { id: "parts", tab: t("플랫폼 구성"), items: [
      { k: "O", w: "Opening", d: t("네 갈래 오프닝 트리에서 이론 수와 채택률을 봅니다.") },
      { k: "P", w: "Puzzle", d: t("내가 틀린 수가 퍼즐이 되어 다시 돌아옵니다.") },
      { k: "E", w: "Endgame", d: t("체크메이트와 백랭크 문제로 마무리 감각을 키웁니다.") },
      { k: "N", w: "Network", d: t("친구와 채팅하고 퍼즐을 공유하며 함께 성장합니다.") },
    ] },
  ];
}

// FC 온라인풍 선수 카드 느낌의 각진 카드. 바깥 레이어가 네온 테두리, 안쪽이 본체다.
function OpenCard({ item, no, active, onPick }) {
  return (
    <motion.button type="button" onClick={onPick} whileHover={{ y: -4 }} className="press"
      style={{ position: "relative", padding: 0, border: "none", cursor: "pointer", textAlign: "left", fontFamily: "inherit", clipPath: CUT,
        background: active ? "linear-gradient(135deg," + C.neonHi + "," + C.neon + ")" : "rgba(124,79,46,.55)", transition: "background .3s" }}>
      <div style={{ margin: 1.5, clipPath: CUT, padding: "18px 16px 16px", minHeight: 150, position: "relative", overflow: "hidden",
        background: active ? "linear-gradient(160deg,#3A2A18,#241509 70%)" : "linear-gradient(160deg,#3A2516,#20140B)" }}>
        <span aria-hidden="true" style={{ position: "absolute", right: -6, top: -14, fontSize: 96, fontWeight: 900, fontStyle: "italic", lineHeight: 1,
          color: "transparent", WebkitTextStroke: "1.5px " + (active ? "rgba(196,154,80,.55)" : "rgba(184,167,140,.18)") }}>{item.k}</span>
        <div style={{ position: "relative", fontFamily: MONO, fontSize: 11, fontWeight: 800, color: active ? C.neon : C.ink, letterSpacing: ".18em" }}>{"0" + no} ▸ {item.k}</div>
        <div style={{ position: "relative", fontSize: 22, fontWeight: 900, fontStyle: "italic", textTransform: "uppercase", color: C.ivory, margin: "6px 0 8px", letterSpacing: "-.01em" }}>{item.w}</div>
        <p style={{ position: "relative", margin: 0, fontSize: 12.5, lineHeight: 1.7, color: "#D9CBB0" }}>{item.d}</p>
        <div aria-hidden="true" style={{ position: "relative", marginTop: 12, height: 4, background: "rgba(184,167,140,.15)" }}>
          <motion.div initial={false} animate={{ width: active ? "100%" : no * 25 + "%" }} transition={{ duration: 0.5 }} style={{ height: "100%", background: "linear-gradient(90deg," + C.neon + "," + C.neonHi + ")", boxShadow: active ? "0 0 10px " + C.neon : "none" }} />
        </div>
      </div>
    </motion.button>
  );
}

// ── 텍스트 보드: 이탈리안 게임의 첫 수들을 한 수씩 두며 반복 ──
const START = [
  "♜♞♝♛♚♝♞♜", "♟♟♟♟♟♟♟♟", "........", "........", "........", "........", "♟♟♟♟♟♟♟♟", "♜♞♝♛♚♝♞♜",
].map((r) => r.split(""));
const MOVES = [["e2", "e4", "1.e4"], ["e7", "e5", "e5"], ["g1", "f3", "2.Nf3"], ["b8", "c6", "Nc6"], ["f1", "c4", "3.Bc4"], ["g8", "f6", "Nf6"]];
const sq = (a) => [8 - parseInt(a[1], 10), a.charCodeAt(0) - 97];
function boardAt(n) {
  const b = START.map((r) => r.slice());
  let last = null;
  for (let i = 0; i < n; i++) {
    const [f, to] = MOVES[i];
    const [fr, fc] = sq(f), [tr, tc] = sq(to);
    b[tr][tc] = b[fr][fc]; b[fr][fc] = ".";
    last = [f, to];
  }
  return { b, last };
}
export function AsciiBoard() {
  const [n, setN] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setN((v) => (v >= MOVES.length + 2 ? 0 : v + 1)), 950);
    return () => clearInterval(id);
  }, []);
  const shown = Math.min(n, MOVES.length);
  const { b, last } = boardAt(shown);
  const hot = new Set(last || []);
  return (
    <div style={{ fontFamily: MONO, fontSize: 15, lineHeight: 1.45, color: C.ink, display: "inline-block", textAlign: "left", padding: "14px 16px", clipPath: CUT, background: "linear-gradient(160deg,#3A2516,#20140B)", boxShadow: "inset 0 0 0 1px rgba(124,79,46,.6)" }}>
      <div style={{ color: C.neon, fontSize: 11, fontWeight: 800, letterSpacing: ".16em", marginBottom: 6 }}>┌─ LIVE ▸ ITALIAN GAME</div>
      {b.map((row, r) => (
        <div key={r} style={{ whiteSpace: "pre" }}>
          <span style={{ opacity: 0.5 }}>{8 - r} </span>
          {row.map((p, c) => {
            const name = String.fromCharCode(97 + c) + (8 - r);
            const isWhite = r > 3 && p !== ".";
            const isHot = hot.has(name);
            return <span key={c} style={{ display: "inline-block", width: "1.5em", textAlign: "center", color: p === "." ? "rgba(184,167,140,.28)" : isWhite ? C.ivory : C.neon, background: isHot ? "rgba(196,154,80,.22)" : "transparent", textShadow: isHot ? "0 0 8px " + C.neon : "none" }}>{p === "." ? ((r + c) % 2 ? "·" : " ") : p + "︎"}</span>;
          })}
        </div>
      ))}
      <div style={{ whiteSpace: "pre", opacity: 0.5 }}>{"  a b c d e f g h".replace(/ /g, " ")}</div>
      <div style={{ marginTop: 8, fontSize: 12, minHeight: 18, color: C.neonHi }}>
        {MOVES.slice(0, shown).map((m) => m[2]).join(" ")}<span className="open-caret">▌</span>
      </div>
    </div>
  );
}

// ── 흐르는 글자 띠 ──
export function AsciiMarquee({ reverse = false, dim = false }) {
  const unit = "░▒▓█ OBSERVE ▸ PRACTICE ▸ EVALUATE ▸ NEXT LEVEL █▓▒░  ♜  OPENING ◆ PUZZLE ◆ ENDGAME ◆ NETWORK  ♞  ";
  return (
    <div aria-hidden="true" style={{ overflow: "hidden", whiteSpace: "nowrap", borderTop: "1px solid rgba(196,154,80,.25)", borderBottom: "1px solid rgba(196,154,80,.25)", background: "rgba(27,16,9,.7)", padding: "9px 0", transform: "skewY(-1.2deg)" }}>
      <div style={{ display: "inline-block", fontFamily: MONO, fontWeight: 800, fontStyle: "italic", fontSize: 13, letterSpacing: ".14em", color: dim ? "rgba(184,167,140,.55)" : C.neon, animation: (reverse ? "open-marquee-r" : "open-marquee") + " 46s linear infinite" }}>
        {unit.repeat(4)}
      </div>
    </div>
  );
}

// ── 본체: OPEN 글자 + 풀이 전환 + 카드 ──
export function OpenSection() {
  const sets = getSets();
  const [si, setSi] = useState(0);
  const [active, setActive] = useState(0);
  const [hold, setHold] = useState(false);
  const ref = useRef(null);
  const seen = useInView(ref, { amount: 0.25 });
  const set = sets[si];
  const item = set.items[active];

  // 글자를 순서대로 짚어 간다. 직접 누르면 잠시 멈춘다.
  useEffect(() => {
    if (!seen || hold) return undefined;
    const id = setInterval(() => setActive((v) => (v + 1) % 4), 2600);
    return () => clearInterval(id);
  }, [seen, hold]);
  useEffect(() => {
    if (!hold) return undefined;
    const id = setTimeout(() => setHold(false), 9000);
    return () => clearTimeout(id);
  }, [hold, active, si]);

  const pick = (i) => { setActive(i); setHold(true); };
  const word = useScramble(item.w.toUpperCase(), seen, 26);

  return (
    <section ref={ref} id="open" style={{ position: "relative", margin: "8px 0 76px", scrollMarginTop: 80 }}>
      <style>{"@keyframes open-marquee{to{transform:translateX(-50%)}}@keyframes open-marquee-r{from{transform:translateX(-50%)}to{transform:translateX(0)}}@keyframes open-caret{50%{opacity:0}}.open-caret{animation:open-caret 1s steps(1) infinite;color:" + C.neon + "}"}</style>
      <div style={{ textAlign: "center", marginBottom: 22 }}>
        <div style={{ fontFamily: MONO, fontSize: 11, fontWeight: 800, color: C.neon, letterSpacing: ".22em" }}>
          <ScrambleText text="[ O · P · E · N ]" />
        </div>
        <h2 style={{ margin: "10px 0 8px", fontSize: "clamp(26px, 4.4vw, 38px)", fontWeight: 900, fontStyle: "italic", color: C.ivory, letterSpacing: "-.02em", lineHeight: 1.2 }}>{t("네 글자에 담은 OpenChess")}</h2>
        <p style={{ margin: 0, fontSize: 13.5, color: C.ink, lineHeight: 1.8 }}>{t("OPEN의 글자마다 단어를 하나씩 붙였습니다. 글자를 눌러 보세요.")}</p>
      </div>

      <div className="flex items-center justify-center" style={{ gap: 8, marginBottom: 26, flexWrap: "wrap" }}>
        {sets.map((s, i) => {
          const on = i === si;
          return (
            <button key={s.id} type="button" onClick={() => { setSi(i); setActive(0); setHold(true); }} className="press"
              style={{ clipPath: "polygon(10px 0, 100% 0, calc(100% - 10px) 100%, 0 100%)", padding: "9px 26px", border: "none", cursor: "pointer", fontFamily: "inherit", fontSize: 13, fontWeight: 900, fontStyle: "italic",
                background: on ? "linear-gradient(180deg," + C.neonHi + "," + C.neon + ")" : "rgba(124,79,46,.4)", color: on ? "#241509" : C.ink }}>{s.tab}</button>
          );
        })}
      </div>

      <div className="flex items-center justify-center flex-wrap" style={{ gap: 30, marginBottom: 30 }}>
        <div>
          <div className="flex items-end justify-center" style={{ gap: "clamp(8px, 2.2vw, 20px)" }}>
            {["O", "P", "E", "N"].map((ch, i) => <BlockLetter key={ch} ch={ch} index={i} run={seen} active={i === active} onPick={() => pick(i)} />)}
          </div>
          <div style={{ marginTop: 18, textAlign: "center", minHeight: 74 }}>
            <div style={{ fontFamily: MONO, fontSize: "clamp(20px, 4.6vw, 30px)", fontWeight: 900, fontStyle: "italic", color: C.neonHi, textShadow: "0 0 18px rgba(196,154,80,.45)", letterSpacing: ".04em" }}>
              <span style={{ color: C.neon }}>{item.k}</span> ▸ {word}<span className="open-caret">▌</span>
            </div>
            <p style={{ margin: "8px auto 0", maxWidth: 380, fontSize: 13.5, color: "#D9CBB0", lineHeight: 1.75 }}>{item.d}</p>
          </div>
        </div>
        <AsciiBoard />
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(210px, 1fr))", gap: 14 }}>
        {set.items.map((it, i) => <OpenCard key={set.id + it.k} item={it} no={i + 1} active={i === active} onPick={() => pick(i)} />)}
      </div>
    </section>
  );
}
