// (v0.7.1, 사용자 요청) 집중 분석 해설 화면 하단 "영상" 블록 — 그 수까지의 PGN 수순으로 YouTube를 검색해 나온 영상을 나열한다.
// 누르면 YouTube(앱에서는 YouTube 앱 우선)로 연다 — 사이트 안에 동영상을 끼워 넣지 않으므로 CSP의 frame 제한은 그대로다.
import React, { useEffect, useState } from "react";
import { Youtube, RefreshCw } from "lucide-react";
import { T } from "../lib/theme.js";
import { t, tx, fmtDateOnly } from "../lib/i18n.js";
import { searchYoutube, youtubeWatchUrl, YT_MAX_PLIES } from "../lib/youtubeSearch.js";
import { SEQ_FONT } from "./engineLines.jsx";

const pgnText = (sans) => sans.map((s, i) => (i % 2 === 0 ? (i / 2 + 1) + ". " : "") + s).join(" ");

export function YoutubeVideosBlock({ sans }) {
  const key = (sans || []).join(" ");
  const [state, setState] = useState({ status: "loading", videos: [] });
  const [nonce, setNonce] = useState(0);
  useEffect(() => {
    let cancelled = false;
    setState({ status: "loading", videos: [] });
    searchYoutube(sans || []).then((r) => { if (!cancelled) setState(r); });
    return () => { cancelled = true; };
  }, [key, nonce]);
  // 서버에 API 키가 없거나 수순이 너무 길면 블록 자체를 숨긴다.
  if (state.status === "off" || !sans || !sans.length || sans.length > YT_MAX_PLIES) return null;
  return (
    <div style={{ background: T.paper, border: "1px solid #DCCBA8", borderRadius: 12, padding: 12, boxSizing: "border-box", marginTop: 10 }}>
      <div className="flex items-center gap-2" style={{ marginBottom: 2 }}>
        <Youtube size={15} style={{ color: "#E2453C" }} />
        <span style={{ fontSize: 12.5, fontWeight: 800, color: T.ink }}>{t("영상")}</span>
        {state.status === "ok" && state.videos.length > 0 && <span style={{ fontSize: 11.5, color: T.inkSoft }}>{state.videos.length}</span>}
      </div>
      {/* 검색한 수순 — 무엇으로 찾은 결과인지 보이게 */}
      <div title={pgnText(sans)} style={{ fontFamily: SEQ_FONT, fontSize: 10.5, color: T.inkSoft, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", marginBottom: 8 }}>{tx("검색: {0}", pgnText(sans))}</div>
      {state.status === "loading" ? (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }} aria-busy="true">
          {[0, 1, 2].map((i) => (
            <div key={i} className="flex" style={{ gap: 10 }}>
              <span className="skeleton" style={{ width: 112, height: 63, borderRadius: 8, background: "#EADCBF", flexShrink: 0 }} />
              <span style={{ flex: 1, display: "flex", flexDirection: "column", gap: 6, paddingTop: 4 }}>
                <span style={{ height: 10, width: "90%", borderRadius: 4, background: "#EADCBF" }} />
                <span style={{ height: 10, width: "55%", borderRadius: 4, background: "#EFE4CC" }} />
              </span>
            </div>
          ))}
        </div>
      ) : state.status !== "ok" ? (
        <div className="flex items-center justify-between" style={{ gap: 8 }}>
          <span style={{ fontSize: 12, color: T.inkSoft }}>{state.status === "busy" ? t("영상 검색 요청이 많음. 잠시 후 다시 시도") : t("영상을 불러오지 못함")}</span>
          <button onClick={() => setNonce((n) => n + 1)} className="press" aria-label={t("다시 시도")} title={t("다시 시도")} style={{ width: 28, height: 28, borderRadius: 8, border: "1px solid #C9B58C", background: "transparent", color: T.ink, cursor: "pointer", display: "inline-flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}><RefreshCw size={13} /></button>
        </div>
      ) : state.videos.length === 0 ? (
        <p style={{ fontSize: 12, color: T.inkSoft, margin: 0 }}>{t("관련 영상 없음")}</p>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          {state.videos.map((v) => (
            <a key={v.id} href={youtubeWatchUrl(v.id)} target="_blank" rel="noopener noreferrer" data-prefer-app="1" className="press"
              style={{ display: "flex", gap: 10, padding: 4, borderRadius: 10, textDecoration: "none", color: T.ink, alignItems: "flex-start" }}>
              <span style={{ position: "relative", width: 112, height: 63, borderRadius: 8, overflow: "hidden", flexShrink: 0, background: "#1a1410" }}>
                <img src={v.thumb} alt="" loading="lazy" referrerPolicy="no-referrer" style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} />
                <span aria-hidden="true" style={{ position: "absolute", right: 4, bottom: 4, width: 20, height: 14, borderRadius: 4, background: "rgba(226,69,60,.92)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                  <span style={{ width: 0, height: 0, borderTop: "3.5px solid transparent", borderBottom: "3.5px solid transparent", borderLeft: "6px solid #fff", marginLeft: 1 }} />
                </span>
              </span>
              <span style={{ minWidth: 0, flex: 1 }}>
                <span style={{ display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden", fontSize: 12.5, fontWeight: 700, lineHeight: 1.35, color: T.ink }}>{v.title}</span>
                <span style={{ display: "block", marginTop: 3, fontSize: 11, color: T.inkSoft, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                  {v.channel}{v.publishedAt ? " · " + fmtDateOnly(v.publishedAt, { year: "numeric", month: "short", day: "numeric" }) : ""}
                </span>
              </span>
            </a>
          ))}
        </div>
      )}
    </div>
  );
}
