// (v0.7.8, 사용자 요청) 집중 분석 해설 화면의 "커뮤니티" 블록 — 댓글 블록 아래에, 그 수의 오프닝 이름(없으면 그 수까지의 PGN 수순)으로 찾은
// 웹 검색 결과와 관련 YouTube 영상을 함께 보여 준다. 웹 검색은 api/youtube.js?web=1(api/_lib/webSearchHandler.js), 영상은 api/youtube.js(기존 "영상" 블록을 bare로 넣음).
// 서버에 두 키가 모두 없으면 블록 전체를 숨기고, 하나만 있으면 그 칸만 보인다. 링크는 새 창(noopener)으로 연다 — 사이트 안에 끼워 넣지 않는다.
import React, { useEffect, useState } from "react";
import { Users, Globe, RefreshCw } from "./ocIcons.jsx";
import { T } from "../lib/theme.js";
import { t, tx } from "../lib/i18n.js";
import { searchWeb } from "../lib/webSearch.js";
import { searchYoutube, YT_MAX_PLIES } from "../lib/youtubeSearch.js";
import { YoutubeVideosBlock } from "./youtubeVideos.jsx";

function WebResults({ sans, name }) {
  const key = (sans || []).join(" ") + "|" + (name || "");
  const [st, setSt] = useState({ status: "loading", results: [], query: "" });
  const [nonce, setNonce] = useState(0);
  useEffect(() => {
    let off = false;
    setSt({ status: "loading", results: [], query: "" });
    searchWeb(sans || [], name || "").then((r) => { if (!off) setSt(r); });
    return () => { off = true; };
  }, [key, nonce]);   // eslint-disable-line react-hooks/exhaustive-deps
  if (st.status === "off") return null;
  return (
    <div>
      <div className="flex items-center gap-2" style={{ marginBottom: 2 }}>
        <Globe size={14} style={{ color: T.brass }} />
        <span style={{ fontSize: 12.5, fontWeight: 800, color: T.ink }}>{t("웹 검색")}</span>
        {st.status === "ok" && st.results.length > 0 && <span style={{ fontSize: 11.5, color: T.inkSoft }}>{st.results.length}</span>}
      </div>
      {st.query && <div title={st.query} style={{ fontSize: 10.5, color: T.inkSoft, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", marginBottom: 8 }}>{tx("검색: {0}", st.query)}</div>}
      {st.status === "loading" ? (
        <div style={{ display: "flex", flexDirection: "column", gap: 10, marginTop: 6 }} aria-busy="true">
          {[0, 1, 2].map((i) => (
            <div key={i} style={{ display: "flex", flexDirection: "column", gap: 5 }}>
              <span className="skeleton" style={{ height: 11, width: "70%", borderRadius: 4, background: "#EADCBF" }} />
              <span style={{ height: 9, width: "35%", borderRadius: 4, background: "#EFE4CC" }} />
              <span style={{ height: 9, width: "95%", borderRadius: 4, background: "#EFE4CC" }} />
            </div>
          ))}
        </div>
      ) : st.status !== "ok" ? (
        <div className="flex items-center justify-between" style={{ gap: 8 }}>
          <span style={{ fontSize: 12, color: T.inkSoft }}>{st.status === "busy" ? t("검색 요청이 많음. 잠시 후 다시 시도") : t("검색 결과를 불러오지 못함")}</span>
          <button onClick={() => setNonce((n) => n + 1)} className="press" aria-label={t("다시 시도")} title={t("다시 시도")} style={{ width: 28, height: 28, borderRadius: 8, border: "1px solid #C9B58C", background: "transparent", color: T.ink, cursor: "pointer", display: "inline-flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}><RefreshCw size={14} /></button>
        </div>
      ) : st.results.length === 0 ? (
        <p style={{ fontSize: 12, color: T.inkSoft, margin: 0 }}>{t("관련 웹 문서 없음")}</p>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
          {st.results.map((r) => (
            <a key={r.url} href={r.url} target="_blank" rel="noopener noreferrer nofollow" className="press" style={{ display: "block", padding: "6px 4px", borderRadius: 8, textDecoration: "none", color: T.ink }}>
              <span style={{ display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden", fontSize: 12.5, fontWeight: 700, lineHeight: 1.35, color: "#2E6FB0" }}>{r.title}</span>
              <span style={{ display: "block", marginTop: 1, fontSize: 10.5, color: T.best, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{r.site}</span>
              {r.snippet && <span style={{ display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden", marginTop: 2, fontSize: 11.5, lineHeight: 1.45, color: T.inkSoft }}>{r.snippet}</span>}
            </a>
          ))}
        </div>
      )}
    </div>
  );
}

/* sans: 그 수까지의 수순(SAN), name: 그 수의 오프닝 이름(없으면 null — 수순으로 검색) */
export function CommunityBlock({ sans, name }) {
  const key = (sans || []).join(" ") + "|" + (name || "");
  const [off, setOff] = useState({ web: false, yt: false });
  useEffect(() => {
    let dead = false;
    setOff({ web: false, yt: false });
    Promise.all([searchWeb(sans || [], name || ""), searchYoutube(sans || [])]).then(([w, y]) => { if (!dead) setOff({ web: w.status === "off", yt: y.status === "off" }); });
    return () => { dead = true; };
  }, [key]);   // eslint-disable-line react-hooks/exhaustive-deps
  if (!sans || !sans.length || sans.length > YT_MAX_PLIES || (off.web && off.yt)) return null;
  return (
    <div style={{ background: T.paper, border: "1px solid #DCCBA8", borderRadius: 12, padding: 12, boxSizing: "border-box", marginTop: 10 }}>
      <div className="flex items-center gap-2" style={{ marginBottom: 10 }}>
        <Users size={15} style={{ color: T.brass }} />
        <span style={{ fontSize: 14, fontWeight: 800, color: T.ink }}>{t("커뮤니티")}</span>
        {name && <span style={{ fontSize: 11.5, color: T.inkSoft, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{name}</span>}
      </div>
      {!off.web && <WebResults sans={sans} name={name} />}
      <YoutubeVideosBlock sans={sans} bare first={off.web} />
    </div>
  );
}
