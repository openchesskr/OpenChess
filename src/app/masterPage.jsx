// (v0.7.6, 사용자 요청) 마스터 페이지 /master/<slug> — /user 프로필 페이지처럼 한 그랜드마스터의 정보를 한 화면에 모은다.
//  · 머리: 국기·이름(영문 전체 이름 + 한국어 표기)·고유 주소 복사, 핵심 숫자(최고 레이팅·수록 대국·활동 기간·점수율)
//  · 본문: 도감 마스터 카드의 상세 통계(components/masterProfile.jsx — 전적·첫 수·오프닝·자주 만난 상대(그 상대의 페이지로 이어짐)·대회·대표 대국)
//  · 주소표는 lib/masterPages.js(masterSlugs.json). 마스터 통계·마스터 대국·마스터 스타일·도감 카드의 이름을 누르면 이 페이지가 열린다(components/masterLink.jsx).
import { useEffect, useMemo, useState } from "react";
import { T } from "../lib/theme.js";
import { SITE_FONT } from "../components/engineLines.jsx";
import { ChevronLeft, Copy, Check } from "../components/ocIcons.jsx";
import MasterProfile from "../components/masterProfile.jsx";
import { masterBySlug, masterPath } from "../lib/masterPages.js";
import { loadMasterProfiles } from "../lib/tournamentData.js";
import { masterName, masterFlag } from "../data/masterNames.js";
import { siteUrl } from "../lib/siteConfig.js";
import { useNarrow } from "./common.jsx";
import { t } from "../lib/i18n.js";

const pct = (a, n) => (n ? Math.round((a / n) * 100) : 0);

function Stat({ label, value, sub }) {
  return (
    <div style={{ flex: "1 1 120px", minWidth: 0, borderRadius: 12, background: "rgba(255,255,255,.06)", border: "1px solid rgba(236,203,134,.22)", padding: "10px 12px" }}>
      <div style={{ fontSize: 11, fontWeight: 800, color: "#CDBA98" }}>{label}</div>
      <div style={{ fontSize: 22, fontWeight: 900, color: T.ivoryHi, fontFamily: SITE_FONT, fontVariantNumeric: "tabular-nums", lineHeight: 1.2, marginTop: 3, whiteSpace: "nowrap" }}>{value}</div>
      {sub && <div style={{ fontSize: 10.5, color: "#A8987C", marginTop: 2 }}>{sub}</div>}
    </div>
  );
}

export function MasterPage({ slug, onClose, onOpenGame, onOpenGameAnalyze, onOpenTour }) {
  const info = masterBySlug(slug);
  const [prof, setProf] = useState(undefined);
  const [copied, setCopied] = useState(false);
  const narrow = useNarrow(640);
  useEffect(() => { let off = false; loadMasterProfiles().then((x) => { if (!off) setProf(x); }); return () => { off = true; }; }, []);
  useEffect(() => { try { window.scrollTo(0, 0); } catch { } }, [slug]);
  const p = prof && info ? prof.p[info.key] : null;
  const raw = p ? p.name.split(":")[0] : "";
  const ko = raw ? masterName(raw, "ko") : "";
  const flag = raw ? masterFlag(raw) : "";
  const score = useMemo(() => (p ? pct(p.wdl[0] + p.wdl[1] / 2, p.wdl[0] + p.wdl[1] + p.wdl[2]) : null), [p]);
  const copy = async () => { try { await navigator.clipboard.writeText(siteUrl(masterPath(slug))); setCopied(true); setTimeout(() => setCopied(false), 1500); } catch { } };
  return (
    <div role="dialog" aria-label={info ? info.name : t("마스터")} style={{ position: "fixed", inset: 0, zIndex: 300, background: T.paper, overflowY: "auto", WebkitOverflowScrolling: "touch" }}>
      <div className="flex items-center justify-between" style={{ padding: "14px 16px", borderBottom: "1px solid #E4D5B6", position: "sticky", top: 0, background: T.paper, zIndex: 5, gap: 8 }}>
        <div className="flex items-center gap-2" style={{ minWidth: 0 }}>
          <button onClick={onClose} aria-label={t("뒤로")} className="press" style={{ width: 30, height: 30, borderRadius: 9, background: T.ebony2, color: T.ivory, border: "1px solid #000", cursor: "pointer", display: "inline-flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}><ChevronLeft size={16} /></button>
          <span style={{ fontSize: 15, fontWeight: 800, color: T.ink, fontFamily: SITE_FONT, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>/master/{slug}</span>
        </div>
        <button onClick={copy} className="press" aria-label={t("고유 주소 복사")} title={t("고유 주소 복사")} style={{ display: "inline-flex", alignItems: "center", gap: 6, height: 30, padding: "0 11px", borderRadius: 9, border: "1px solid " + T.brass, background: "transparent", color: T.ink, fontSize: 12, fontWeight: 800, cursor: "pointer", flexShrink: 0 }}>
          {copied ? <Check size={14} /> : <Copy size={14} />}{copied ? t("복사됨") : t("링크 복사")}
        </button>
      </div>
      <div style={{ maxWidth: 820, margin: "0 auto", padding: narrow ? "14px 14px 40px" : "20px 20px 48px" }}>
        {!info ? (
          <p style={{ fontSize: 13, color: T.inkSoft, textAlign: "center", marginTop: 40 }}>{t("없는 마스터 페이지")}</p>
        ) : (
          <>
            <section style={{ borderRadius: 18, background: "linear-gradient(160deg,#3A2516,#241509 60%,#1B0F07)", border: "1px solid #4A3322", padding: narrow ? 16 : 22, boxShadow: "0 10px 26px -14px rgba(0,0,0,.7)" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
                <span aria-hidden="true" style={{ width: narrow ? 56 : 68, height: narrow ? 56 : 68, borderRadius: "50%", flexShrink: 0, display: "inline-flex", alignItems: "center", justifyContent: "center", background: "rgba(236,203,134,.12)", border: "1px solid rgba(236,203,134,.35)", fontSize: narrow ? 30 : 36 }}>{flag || "♔"}</span>
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontSize: 10.5, fontWeight: 800, letterSpacing: ".22em", color: T.brassHi }}>GRANDMASTER</div>
                  <h1 style={{ margin: "2px 0 0", fontSize: narrow ? 24 : 30, fontWeight: 900, color: T.ivoryHi, lineHeight: 1.15, letterSpacing: "-.02em", wordBreak: "keep-all" }}>{info.name}</h1>
                  {ko && ko !== info.name && <div style={{ fontSize: 13.5, fontWeight: 700, color: "#CDBA98", marginTop: 3 }}>{ko}</div>}
                </div>
              </div>
              {p && (
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 16 }}>
                  <Stat label={t("최고 레이팅")} value={p.peak[0] > 0 ? p.peak[0] : "–"} sub={p.peak[1] ? String(p.peak[1]) : null} />
                  <Stat label={t("수록 대국")} value={p.n.toLocaleString("en-US")} sub={t("승 {0}, 무 {1}, 패 {2}", p.wdl[0], p.wdl[1], p.wdl[2])} />
                  <Stat label={t("활동 기간")} value={p.y0 + "–" + p.y1} />
                  <Stat label={t("점수율")} value={score + "%"} />
                </div>
              )}
            </section>
            <section style={{ marginTop: 14, borderRadius: 16, background: T.ivoryHi, border: "1px solid #DCCBA8", padding: narrow ? "4px 14px 16px" : "6px 20px 20px" }}>
              {prof === undefined ? <p style={{ fontSize: 12, color: T.inkSoft, marginTop: 12 }}>{t("불러오는 중…")}</p>
                : <MasterProfile name={raw} profileKey={info.key} hideHead onOpenGame={onOpenGame} onOpenGameAnalyze={onOpenGameAnalyze} onOpenTour={onOpenTour} />}
            </section>
          </>
        )}
      </div>
    </div>
  );
}
