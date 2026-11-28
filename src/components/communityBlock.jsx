// (v0.7.8, 사용자 요청) 집중 분석 해설 화면의 "커뮤니티" 블록 — (v0.7.9) 댓글 블록 위에, 그 수의 오프닝 이름(없으면 그 수까지의 PGN 수순)으로 찾은
// 웹 검색 결과와 관련 YouTube 영상을 함께 보여 준다. 웹 검색은 api/youtube.js?web=1(api/_lib/webSearchHandler.js), 영상은 api/youtube.js(기존 "영상" 블록을 bare로 넣음).
// 서버에 두 키가 모두 없으면 블록 전체를 숨기고, 하나만 있으면 그 칸만 보인다. 링크는 새 창(noopener)으로 연다 — 사이트 안에 끼워 넣지 않는다.
import React, { useEffect, useState } from "react";
import { Globe, RefreshCw } from "./ocIcons.jsx";
import { BrassScrollArea } from "./brassScroll.jsx";
import { T } from "../lib/theme.js";
import { t, tx, fmtDateOnly } from "../lib/i18n.js";
import { searchWeb } from "../lib/webSearch.js";
import { searchYoutube, YT_MAX_PLIES } from "../lib/youtubeSearch.js";
import { YoutubeVideosBlock } from "./youtubeVideos.jsx";

// (v0.7.9, 사용자 요청) 구글 검색 결과처럼 — 사이트 아이콘·이름·주소 경로 한 줄, 파란 제목, 게시일 — 요약, 오른쪽 미리보기 이미지.
// 이미지·아이콘은 서버가 결과 페이지의 og:image·아이콘을 읽어 준다(api/_lib/webSearchHandler.js withPreviews). 못 불러오면 그 칸만 뺀다(아이콘은 글자 배지).
const crumbsOf = (url) => {
  try {
    const u = new URL(url);
    const segs = u.pathname.split("/").filter(Boolean).slice(0, 3).map((x) => { try { return decodeURIComponent(x); } catch { return x; } }).map((x) => (x.length > 24 ? x.slice(0, 22) + "…" : x));
    return [u.protocol + "//" + u.hostname, ...segs].join(" › ");
  } catch { return url; }
};
function SiteIcon({ src, site }) {
  const [bad, setBad] = useState(false);
  const letter = (site || "?").replace(/^www\./, "").charAt(0).toUpperCase();
  return (
    <span aria-hidden="true" style={{ width: 28, height: 28, borderRadius: "50%", flexShrink: 0, background: "#F3EADB", border: "1px solid #E4D5B6", display: "inline-flex", alignItems: "center", justifyContent: "center", overflow: "hidden", boxSizing: "border-box" }}>
      {src && !bad ? <img src={src} alt="" width={18} height={18} loading="lazy" referrerPolicy="no-referrer" onError={() => setBad(true)} style={{ width: 18, height: 18, objectFit: "contain", display: "block" }} />
        : <span style={{ fontSize: 12, fontWeight: 800, color: T.brass }}>{letter}</span>}
    </span>
  );
}
function WebResultCard({ r }) {
  const [imgBad, setImgBad] = useState(false);
  const showImg = !!r.image && !imgBad;
  return (
    <a href={r.url} target="_blank" rel="noopener noreferrer nofollow" className="press oc-serp" style={{ display: "block", padding: "10px 6px", borderRadius: 10, textDecoration: "none", color: T.ink }}>
      <span style={{ display: "flex", alignItems: "center", gap: 9, minWidth: 0 }}>
        <SiteIcon src={r.icon} site={r.site} />
        <span style={{ minWidth: 0, flex: 1, display: "flex", flexDirection: "column" }}>
          <span style={{ fontSize: 12.5, fontWeight: 700, color: T.ink, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", lineHeight: 1.3 }}>{r.site}</span>
          <span style={{ fontSize: 10.5, color: T.inkSoft, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", lineHeight: 1.35 }}>{crumbsOf(r.url)}</span>
        </span>
      </span>
      <span style={{ display: "flex", gap: 12, marginTop: 6, alignItems: "flex-start" }}>
        <span style={{ minWidth: 0, flex: 1 }}>
          <span className="oc-serp-title" style={{ display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden", fontSize: 15, fontWeight: 600, lineHeight: 1.3, color: "#2E6FB0" }}>{r.title}</span>
          {(r.date || r.snippet) && (
            <span style={{ display: "-webkit-box", WebkitLineClamp: 3, WebkitBoxOrient: "vertical", overflow: "hidden", marginTop: 4, fontSize: 12, lineHeight: 1.5, color: T.inkSoft }}>
              {r.date && <span style={{ color: "#8A7860" }}>{fmtDateOnly(r.date, { year: "numeric", month: "short", day: "numeric" })}{r.snippet ? " · " : ""}</span>}{r.snippet}
            </span>
          )}
        </span>
        {showImg && (
          <span style={{ width: 92, height: 92, borderRadius: 10, overflow: "hidden", flexShrink: 0, background: "#EADCBF", border: "1px solid #E4D5B6", boxSizing: "border-box" }}>
            <img src={r.image} alt="" loading="lazy" referrerPolicy="no-referrer" onError={() => setImgBad(true)} style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} />
          </span>
        )}
      </span>
    </a>
  );
}
const SERP_CSS = ".oc-serp:hover .oc-serp-title{text-decoration:underline}.oc-serp:focus-visible{outline:2px solid #2E6FB0;outline-offset:1px}";

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
      <style>{SERP_CSS}</style>
      <div className="flex items-center gap-2" style={{ marginBottom: 2 }}>
        <Globe size={14} style={{ color: T.brass }} />
        <span style={{ fontSize: 12.5, fontWeight: 800, color: T.ink }}>{t("웹 검색")}</span>
        {st.status === "ok" && st.results.length > 0 && <span style={{ fontSize: 11.5, color: T.inkSoft }}>{st.results.length}</span>}
      </div>
      {st.query && <div title={st.query} style={{ fontSize: 10.5, color: T.inkSoft, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", marginBottom: 8 }}>{tx("검색: {0}", st.query)}</div>}
      {st.status === "loading" ? (
        <div style={{ display: "flex", flexDirection: "column", gap: 10, marginTop: 6 }} aria-busy="true">
          {[0, 1, 2].map((i) => (
            <div key={i} style={{ display: "flex", flexDirection: "column", gap: 6, padding: "0 6px" }}>
              <span style={{ display: "flex", alignItems: "center", gap: 9 }}>
                <span style={{ width: 28, height: 28, borderRadius: "50%", background: "#EADCBF", flexShrink: 0 }} />
                <span style={{ flex: 1, display: "flex", flexDirection: "column", gap: 4 }}><span style={{ height: 9, width: "30%", borderRadius: 4, background: "#EADCBF" }} /><span style={{ height: 8, width: "55%", borderRadius: 4, background: "#EFE4CC" }} /></span>
              </span>
              <span style={{ display: "flex", gap: 12 }}>
                <span style={{ flex: 1, display: "flex", flexDirection: "column", gap: 6 }}>
                  <span className="skeleton" style={{ height: 13, width: "75%", borderRadius: 4, background: "#EADCBF" }} />
                  <span style={{ height: 9, width: "95%", borderRadius: 4, background: "#EFE4CC" }} />
                  <span style={{ height: 9, width: "80%", borderRadius: 4, background: "#EFE4CC" }} />
                </span>
                <span style={{ width: 92, height: 72, borderRadius: 10, background: "#EFE4CC", flexShrink: 0 }} />
              </span>
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
        <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          {st.results.map((r) => <WebResultCard key={r.url} r={r} />)}
        </div>
      )}
    </div>
  );
}

/* sans: 그 수까지의 수순(SAN), name: 그 수의 오프닝 이름(없으면 null — 수순으로 검색), dev: 개발자·공동개발자(서버 설정 진단 표시)
   (v0.7.8 BUG-189) 수순이 40수(YT_MAX_PLIES)를 넘으면 블록 전체를 숨기던 것을, 앞 40수(오프닝 부분)로 검색하도록 바꿨다 — 실전 대국 21수째부터 블록이 사라졌다.
   (v0.7.8 BUG-190) 서버 키가 없으면(503) 아무 표시 없이 숨어서 원인을 알 수 없었다 — 개발자에게는 어떤 환경변수가 없는지 보여 준다. */
// (v0.8.1, 사용자 요청) "커뮤니티" 제목 줄을 없앴다(집중 분석 페이지 버튼 이름이 "커뮤니티"가 됐다). scrollH를 주면 블록이 그 높이로 고정되고 안쪽만
//  황동 스크롤바로 스크롤된다 — 아래 댓글 블록과 같은 높이로 맞춘다.
export function CommunityBlock({ sans, name, dev = false, scrollH = null }) {
  const q = Array.isArray(sans) ? sans.slice(0, YT_MAX_PLIES) : [];
  const key = q.join(" ") + "|" + (name || "");
  const [off, setOff] = useState({ web: false, yt: false });
  useEffect(() => {
    let dead = false;
    setOff({ web: false, yt: false });
    Promise.all([searchWeb(q, name || ""), searchYoutube(q)]).then(([w, y]) => { if (!dead) setOff({ web: w.status === "off", yt: y.status === "off" }); });
    return () => { dead = true; };
  }, [key]);   // eslint-disable-line react-hooks/exhaustive-deps
  if (!q.length) return null;
  const missing = [off.yt && "YOUTUBE_API_KEY", off.web && "TAVILY_API_KEY"].filter(Boolean);
  if (off.web && off.yt && !dev) return null;
  const body = (
    <>
      {dev && missing.length > 0 && (
        <p style={{ fontSize: 11.5, color: T.blunder, margin: "0 0 8px", lineHeight: 1.5 }}>{t("개발자 안내: 이 배포에 서버 환경변수 {0}이 없어 검색을 숨겼습니다. Vercel 환경변수(이 배포 환경 범위)에 추가한 뒤 다시 배포하세요.", missing.join(", "))}</p>
      )}
      {!off.web && <WebResults sans={q} name={name} />}
      <YoutubeVideosBlock sans={q} bare first={off.web} />
    </>
  );
  const card = { background: T.paper, border: "1px solid #DCCBA8", borderRadius: 12, boxSizing: "border-box", marginBottom: 10 };
  if (scrollH) return <BrassScrollArea outerStyle={card} style={{ height: scrollH, padding: 12, boxSizing: "border-box", borderRadius: 12 }}>{body}</BrassScrollArea>;
  return <div style={{ ...card, padding: 12 }}>{body}</div>;
}
