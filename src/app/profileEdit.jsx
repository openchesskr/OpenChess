// (v0.7.5, 사용자 요청) 프로필 편집 — 새로 짠 편집 화면.
//  · 버그(BUG-156): 예전 편집 창(ProfileWindow, z-index 95)이 /user 페이지(z-index 300) 밑에 열려 점 세 개 → "프로필 편집"을 눌러도 아무것도 안 보였다.
//    이 화면은 App 루트에서 PROFILE_EDIT_Z(모든 페이지·도킹 창 위)로 연다(check-modal-layers가 /user 페이지보다 높은지 검사).
//  · 수정할 수 있는 정보만 보여 준다: 사진·이름·소개·대표 칭호 2개·자주 두는 첫 수·chess.com 계정. (티어·퍼즐 수 같은 읽기 전용 통계는 뺐다)
//  · 바꾸는 즉시 저장된다(setProfile → App이 서버·기기에 동기화). "완료"는 닫기.
import React, { useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import { T } from "../lib/theme.js";
import { SITE_FONT } from "../components/engineLines.jsx";
import { t, tx } from "../lib/i18n.js";
import { gmPhotoRingStyle, tierFromXp } from "../lib/tierSystem.js";
import { startBoard, boardFromSans, stripSuffix } from "../lib/chessRules.js";
import { chesscomChangeDaysLeft } from "../lib/chesscom.js";
import { Check, Camera, Trash2, RotateCcw } from "../components/ocIcons.jsx";
import { ChesscomLogo, fetchChesscomProfile, SeriesGlyph, TitleBadge, TITLE_SCALE, titleDef, sortTitlesByRank, featuredTitlesFor, FEATURED_TITLE_COUNT, useNarrow } from "./common.jsx";
import { ValidatedMoveInput } from "./social.jsx";

export const PROFILE_EDIT_Z = 440;   // /user 페이지(300)·안내 토스트(410)보다 위
const BIO_MAX = 60, NAME_MAX = 30;

function Section({ title, hint, right, children }) {
  return (
    <section style={{ padding: "18px 0", borderTop: "1px solid #E4D5B6" }}>
      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 10, marginBottom: hint ? 3 : 10 }}>
        <h3 style={{ margin: 0, fontSize: 12, fontWeight: 900, letterSpacing: ".06em", color: T.inkSoft }}>{title}</h3>
        {right}
      </div>
      {hint && <p style={{ margin: "0 0 10px", fontSize: 11.5, color: T.inkSoft, lineHeight: 1.5 }}>{hint}</p>}
      {children}
    </section>
  );
}
const field = { width: "100%", boxSizing: "border-box", padding: "10px 12px", borderRadius: 10, border: "1px solid #CDB98E", background: "#FFFDF8", color: T.ink, fontSize: 13.5, fontFamily: SITE_FONT, outline: "none" };
const ghostBtn = { display: "inline-flex", alignItems: "center", gap: 6, padding: "7px 11px", borderRadius: 9, border: "1px solid #CDB98E", background: "transparent", color: T.ink, fontSize: 12, fontWeight: 800, cursor: "pointer", fontFamily: SITE_FONT, whiteSpace: "nowrap" };
const darkBtn = { ...ghostBtn, border: "1px solid #000", background: "linear-gradient(180deg,#3A2516,#241509)", color: T.ivoryHi };

/** 대표 칭호 슬롯 하나 — 칭호 배너를 칸 폭에 맞춰 줄여 그린다. 비었으면 점선 자리. */
function FeaturedSlot({ id, index, auto }) {
  const [w, setW] = useState(0);
  const ref = React.useRef(null);
  React.useLayoutEffect(() => {
    const el = ref.current; if (!el) return undefined;
    setW(el.clientWidth);
    if (typeof ResizeObserver === "undefined") return undefined;
    const ro = new ResizeObserver(() => setW(el.clientWidth)); ro.observe(el); return () => ro.disconnect();
  }, []);
  const BASE_W = 260, BASE_H = 74 * TITLE_SCALE, k = w ? w / BASE_W : 0;
  return (
    <div style={{ flex: "1 1 0", minWidth: 0 }}>
      <div style={{ fontSize: 10.5, fontWeight: 800, color: T.inkSoft, marginBottom: 5 }}>{t("칭호 {0}", index + 1)}{auto && <span style={{ fontWeight: 600 }}> · {t("자동")}</span>}</div>
      <div ref={ref} style={{ height: k ? Math.round(BASE_H * k) : BASE_H * 0.5, borderRadius: 8, border: id ? "none" : "1.5px dashed #CDB98E" }}>
        {id && k > 0 && <div style={{ width: BASE_W, transform: `scale(${k})`, transformOrigin: "left top" }}><TitleBadge id={id} compact earned noPeek /></div>}
      </div>
    </div>
  );
}

export function ProfileEditSheet({ onClose, profile, setProfile, totalXp, earnedTitles, chesscom, isDev, isCodev, devOn, codevOn }) {
  const narrow = useNarrow(640);
  const set = (patch) => setProfile((p) => ({ ...p, ...patch }));
  useEffect(() => {
    const onKey = (e) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey); return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  // ── 사진 ──
  const onPhotoFile = (e) => {
    const f = e.target.files && e.target.files[0]; if (!f) return;
    const r = new FileReader();
    r.onload = () => {
      const img = new Image();
      img.onload = () => {
        const sc = Math.min(1, 256 / Math.max(img.width, img.height));
        const w = Math.round(img.width * sc), h = Math.round(img.height * sc);
        const cv = document.createElement("canvas"); cv.width = w; cv.height = h;
        cv.getContext("2d").drawImage(img, 0, 0, w, h);
        set({ photo: cv.toDataURL("image/jpeg", 0.85) });   // 256px로 줄여 저장(서버는 data:image만 받는다)
      };
      img.src = r.result;
    };
    r.readAsDataURL(f);
    e.target.value = "";
  };
  const gm = tierFromXp(totalXp || 0).tier.key === "grandmaster";

  // ── 대표 칭호 ──
  const earned = earnedTitles instanceof Set ? earnedTitles : new Set(earnedTitles || []);
  const ranked = useMemo(() => sortTitlesByRank(earned), [earned]);
  const picked = (Array.isArray(profile.featuredTitles) ? profile.featuredTitles : []).filter((id) => earned.has(id)).slice(0, FEATURED_TITLE_COUNT);
  const shown = featuredTitlesFor(picked, earned);
  const togglePick = (id) => {
    let next = picked.includes(id) ? picked.filter((x) => x !== id) : picked.length < FEATURED_TITLE_COUNT ? [...picked, id] : [picked[0], id];
    set({ featuredTitles: next });
  };

  // ── 자주 두는 첫 수 ──
  const fm = profile.firstMoves || { white: "", black: {} };
  const setFM = (patch) => set({ firstMoves: { ...fm, ...patch } });
  // chess.com 기록이 있으면 아직 빈 칸만 가장 많이 둔 수로 채운다(예전 편집기와 같은 규칙)
  useEffect(() => {
    if (!chesscom || chesscom.status !== "ready" || !chesscom.games || !chesscom.games.length) return;
    const topMove = (games, ply) => { const c = {}; for (const g of games) { const s = g.moves && g.moves[ply]; if (s) c[stripSuffix(s)] = (c[stripSuffix(s)] || 0) + 1; } const b = Object.entries(c).sort((a, b2) => b2[1] - a[1])[0]; return b ? b[0] : null; };
    const patch = {};
    if (!fm.white) { const w = topMove(chesscom.games.filter((g) => g.color === "w"), 0); if (w) patch.white = w; }
    const cur = fm.black || {}, bp = {};
    ["e4", "d4", "c4", "Nf3"].forEach((w) => { if (cur[w]) return; const b = topMove(chesscom.games.filter((g) => g.color === "b" && g.moves && stripSuffix(g.moves[0]) === w), 1); if (b) bp[w] = b; });
    if (Object.keys(bp).length) patch.black = { ...cur, ...bp };
    if (Object.keys(patch).length) setFM(patch);
  }, [chesscom && chesscom.status, chesscom && chesscom.games]);   // eslint-disable-line react-hooks/exhaustive-deps

  // ── chess.com 계정 ──
  const [cc, setCc] = useState(profile.chesscom || "");
  const [ccState, setCcState] = useState("idle");   // idle | checking | failed
  const [pending, setPending] = useState(null);
  useEffect(() => { setCc(profile.chesscom || ""); }, [profile.chesscom]);
  const linked = !!profile.chesscom;
  const bypass = (isDev && devOn) || (isCodev && codevOn);
  const daysLeft = bypass ? 0 : chesscomChangeDaysLeft(profile.chesscomChangedAt);
  const verify = async () => {
    const name = cc.trim(); if (!name) return;
    setCcState("checking");
    try { setPending(await fetchChesscomProfile(name)); setCcState("idle"); }
    catch { setCcState("failed"); setTimeout(() => setCcState("idle"), 1700); }
  };
  const confirmLink = () => { set({ chesscom: (pending && pending.username) || cc.trim(), chesscomChangedAt: Date.now() }); setPending(null); };
  const unlink = () => { if (daysLeft > 0) return; set({ chesscom: "" }); setCc(""); };

  const panel = narrow
    ? { position: "absolute", left: 0, right: 0, bottom: 0, maxHeight: "94vh", borderRadius: "18px 18px 0 0" }
    : { position: "relative", width: "min(560px, calc(100vw - 32px))", maxHeight: "88vh", borderRadius: 18 };
  return (
    <div className="oc-modal-bg" onClick={onClose} role="presentation"
      style={{ position: "fixed", inset: 0, zIndex: PROFILE_EDIT_Z, background: "rgba(14,8,3,.62)", backdropFilter: "blur(3px)", WebkitBackdropFilter: "blur(3px)", display: "flex", alignItems: "center", justifyContent: "center" }}>
      <motion.div role="dialog" aria-modal="true" aria-label={t("프로필 편집")} onClick={(e) => e.stopPropagation()}
        initial={narrow ? { y: 40, opacity: 0 } : { y: 14, opacity: 0, scale: 0.98 }} animate={{ y: 0, opacity: 1, scale: 1 }} transition={{ duration: 0.22, ease: [0.2, 0.8, 0.2, 1] }}
        style={{ ...panel, display: "flex", flexDirection: "column", overflow: "hidden", background: T.paper, border: "1px solid #CDB98E", boxShadow: "0 30px 70px -20px rgba(0,0,0,.75)" }}>
        {/* 머리줄 */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, padding: "14px 18px", borderBottom: "1px solid #E4D5B6", background: "linear-gradient(180deg,#F6EEDC,#EFE3C9)" }}>
          <div style={{ fontSize: 16, fontWeight: 900, color: T.ink, letterSpacing: "-.01em" }}>{t("프로필 편집")}</div>
          <button onClick={onClose} className="press" style={{ ...darkBtn, padding: "8px 16px", fontSize: 13 }}><Check size={15} />{t("완료")}</button>
        </div>
        <div style={{ overflowY: "auto", padding: "4px 18px 22px", WebkitOverflowScrolling: "touch" }}>
          {/* 사진·이름·소개 */}
          <div style={{ display: "flex", gap: 16, alignItems: "flex-start", padding: "18px 0" }}>
            <div style={{ position: "relative", flexShrink: 0 }}>
              {profile.photo
                ? <img src={profile.photo} alt="" style={{ width: 88, height: 88, borderRadius: 22, objectFit: "cover", border: "1px solid #C9B58C", display: "block", ...(gmPhotoRingStyle(gm) || {}) }} />
                : <span style={{ width: 88, height: 88, borderRadius: 22, background: "linear-gradient(160deg," + T.brassHi + "," + T.brass + " 55%,#8A6A2F)", color: "#241509", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 900, fontSize: 36 }}>{(profile.nickname || "?")[0].toUpperCase()}</span>}
              <label className="press" title={t("사진 변경")} aria-label={t("사진 변경")} style={{ position: "absolute", right: -6, bottom: -6, width: 34, height: 34, borderRadius: 11, display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", background: "linear-gradient(180deg,#3A2516,#241509)", color: T.brassHi, border: "2px solid " + T.paper, boxShadow: "0 4px 10px rgba(0,0,0,.35)" }}>
                <Camera size={17} />
                <input type="file" accept="image/*" onChange={onPhotoFile} style={{ display: "none" }} />
              </label>
            </div>
            <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: 10 }}>
              <div>
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, fontWeight: 800, color: T.inkSoft, marginBottom: 4 }}><span>{t("이름")}</span><span style={{ fontWeight: 600 }}>{(profile.nickname || "").length}/{NAME_MAX}</span></div>
                <input value={profile.nickname || ""} maxLength={NAME_MAX} onChange={(e) => set({ nickname: e.target.value.slice(0, NAME_MAX) })} placeholder={t("표시 이름")} style={{ ...field, fontSize: 15, fontWeight: 800 }} />
              </div>
              <div>
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, fontWeight: 800, color: T.inkSoft, marginBottom: 4 }}><span>{t("소개")}</span><span style={{ fontWeight: 600 }}>{(profile.bio || "").length}/{BIO_MAX}</span></div>
                <textarea value={profile.bio || ""} maxLength={BIO_MAX} rows={2} onChange={(e) => set({ bio: e.target.value.replace(/\n/g, " ").slice(0, BIO_MAX) })} placeholder={t("예: 시칠리안을 좋아하는 클럽 플레이어")} style={{ ...field, resize: "none", lineHeight: 1.45 }} />
              </div>
              {profile.photo && <button onClick={() => set({ photo: "" })} className="press" style={{ ...ghostBtn, alignSelf: "flex-start", color: T.blunder, borderColor: "rgba(200,69,59,.45)" }}><Trash2 size={13} />{t("사진 제거")}</button>}
            </div>
          </div>

          {/* 대표 칭호 */}
          <Section title={t("대표 칭호")} hint={t("프로필 업적 섹션에 보일 칭호 2개. 고르지 않으면 등급 높은 칭호로 채움")}
            right={picked.length > 0 && <button onClick={() => set({ featuredTitles: null })} className="press" style={{ ...ghostBtn, padding: "5px 9px", fontSize: 11 }}><RotateCcw size={12} />{t("자동으로")}</button>}>
            <div style={{ display: "flex", gap: 10, marginBottom: 12 }}>
              {Array.from({ length: FEATURED_TITLE_COUNT }, (_, i) => <FeaturedSlot key={i + ":" + (shown[i] || "")} id={shown[i] || null} index={i} auto={!!shown[i] && !picked.includes(shown[i])} />)}
            </div>
            {ranked.length === 0 ? (
              <p style={{ margin: 0, fontSize: 12, color: T.inkSoft, textAlign: "center", padding: "14px 0", border: "1px dashed #CDB98E", borderRadius: 10 }}>{t("아직 획득한 칭호 없음")}</p>
            ) : (
              <div role="listbox" aria-multiselectable="true" aria-label={t("대표 칭호")} style={{ display: "grid", gridTemplateColumns: narrow ? "1fr" : "1fr 1fr", gap: 6, maxHeight: 260, overflowY: "auto", paddingRight: 2 }}>
                {ranked.map((id) => {
                  const d = titleDef(id), on = picked.includes(id), slot = picked.indexOf(id);
                  return (
                    <button key={id} role="option" aria-selected={on} onClick={() => togglePick(id)} className="press"
                      style={{ display: "flex", alignItems: "center", gap: 9, padding: "7px 9px", borderRadius: 10, cursor: "pointer", textAlign: "left", fontFamily: SITE_FONT,
                        border: "1.5px solid " + (on ? T.brass : "#E2D3B3"), background: on ? "rgba(196,154,80,.16)" : "#FFFDF8" }}>
                      <SeriesGlyph series={d.series} size={26} />
                      <span style={{ flex: 1, minWidth: 0 }}>
                        <span style={{ display: "block", fontSize: 12.5, fontWeight: 800, color: T.ink, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{d.name}</span>
                        <span style={{ display: "block", fontSize: 10.5, color: T.inkSoft, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{d.label}{d.rare ? " · " + t("희귀") : " · " + t("{0}단계", d.tier)}</span>
                      </span>
                      <span style={{ width: 22, height: 22, borderRadius: 7, flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11, fontWeight: 900,
                        background: on ? T.brass : "transparent", color: "#241509", border: on ? "none" : "1.5px solid #CDB98E" }}>{on ? slot + 1 : ""}</span>
                    </button>
                  );
                })}
              </div>
            )}
          </Section>

          {/* 자주 두는 첫 수 */}
          <Section title={t("자주 두는 첫 수")} hint={chesscom && chesscom.status === "ready" ? t("chess.com 기록으로 자동 입력, 직접 수정 가능") : t("생략 가능")}>
            <div style={{ display: "grid", gridTemplateColumns: narrow ? "1fr" : "1fr 1fr", gap: 8 }}>
              <label style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <span style={{ width: 62, flexShrink: 0, fontSize: 12, fontWeight: 800, color: T.ink }}>{t("백")}</span>
                <span style={{ flex: 1, minWidth: 0 }}><ValidatedMoveInput value={fm.white || ""} onCommit={(v) => setFM({ white: v })} board={startBoard()} color="w" placeholder={t("예: e4")} style={{ ...field, padding: "8px 10px" }} /></span>
              </label>
              {["e4", "d4", "c4", "Nf3"].map((w) => (
                <label key={w} style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <span style={{ width: 62, flexShrink: 0, fontSize: 12, fontWeight: 700, color: T.inkSoft, fontFamily: SITE_FONT }}>{t("흑")} vs 1.{w}</span>
                  <span style={{ flex: 1, minWidth: 0 }}><ValidatedMoveInput value={(fm.black || {})[w] || ""} onCommit={(v) => setFM({ black: { ...(fm.black || {}), [w]: v } })} board={boardFromSans([w])} color="b" placeholder={t("응수")} style={{ ...field, padding: "8px 10px" }} /></span>
                </label>
              ))}
            </div>
          </Section>

          {/* chess.com 계정 */}
          <Section title={<span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>{tx("{0} 계정", <ChesscomLogo height={15} />)}</span>} hint={t("최근 기보로 수별 전적·승률과 오프닝 실수를 집중 분석 모드에서 분석")}>
            {linked ? (
              <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                <span style={{ flex: "1 1 160px", display: "inline-flex", alignItems: "center", gap: 7, padding: "9px 12px", borderRadius: 10, background: "rgba(63,122,58,.12)", border: "1px solid rgba(63,122,58,.4)", color: T.ink, fontSize: 13, fontWeight: 800, minWidth: 0 }}>
                  <Check size={15} color="#3F7A3A" /><span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{profile.chesscom}</span>
                </span>
                <button onClick={unlink} disabled={daysLeft > 0} className="press" style={{ ...ghostBtn, opacity: daysLeft > 0 ? 0.55 : 1, cursor: daysLeft > 0 ? "default" : "pointer" }}>{t("계정 변경")}</button>
                {daysLeft > 0 && <p style={{ width: "100%", margin: "2px 0 0", fontSize: 11, color: T.inkSoft }}>{tx("계정 변경은 30일에 한 번만 가능, {0}일 후 변경 가능", daysLeft)}</p>}
              </div>
            ) : (
              <div style={{ display: "flex", gap: 8 }}>
                <input value={cc} onChange={(e) => setCc(e.target.value)} onKeyDown={(e) => e.key === "Enter" && verify()} placeholder={t("chess.com 사용자명")} style={{ ...field, flex: 1, minWidth: 0 }} />
                <button onClick={verify} disabled={ccState === "checking" || !cc.trim()} className="press" style={{ ...darkBtn, padding: "9px 16px", ...(ccState === "failed" ? { background: T.blunder, color: "#fff" } : {}), opacity: !cc.trim() ? 0.55 : 1 }}>
                  {ccState === "checking" ? t("확인 중…") : ccState === "failed" ? t("연동 실패") : t("연동하기")}
                </button>
              </div>
            )}
          </Section>
        </div>
      </motion.div>
      {/* chess.com 계정 확인 */}
      {pending && (
        <div onClick={(e) => { e.stopPropagation(); setPending(null); }} style={{ position: "fixed", inset: 0, zIndex: PROFILE_EDIT_Z + 1, background: "rgba(0,0,0,.55)", display: "flex", alignItems: "center", justifyContent: "center", padding: 18 }}>
          <div onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true" style={{ maxWidth: 320, width: "100%", background: "linear-gradient(180deg,#F2E8D5,#E2D2B2)", borderRadius: 16, padding: 20, border: "1px solid #CDB98E", boxShadow: "0 20px 50px -10px rgba(0,0,0,.7)" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 12 }}>
              {pending.avatar ? <img src={pending.avatar} alt="" style={{ width: 46, height: 46, borderRadius: 10 }} /> : <span style={{ width: 46, height: 46, borderRadius: 10, background: T.brass, color: "#241509", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 800 }}>{(pending.username || "?")[0].toUpperCase()}</span>}
              <div style={{ fontSize: 16, fontWeight: 800, color: T.ink }}>{pending.username}</div>
            </div>
            <p style={{ fontSize: 12.5, color: T.ink, fontWeight: 600, margin: "0 0 14px" }}>{t("이 계정이 맞나요?")}</p>
            <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
              <button onClick={() => setPending(null)} className="press" style={ghostBtn}>{t("아니요")}</button>
              <button onClick={confirmLink} className="press" style={{ ...ghostBtn, border: "none", background: "linear-gradient(180deg,#3C8A3C,#2E6E2E)", color: "#fff" }}>{t("이 계정으로 연동")}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
