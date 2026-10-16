// (v0.6.7) 앱 맨 위 오류 방어막. 화면을 그리다 에러가 나면 React가 트리를 통째로 내려서 흰 화면만 남는데, 대신 안내 화면과 새로고침 버튼을 보여준다.
// 배포 직후 예전 파일을 찾다가 실패한 경우(청크 로드 실패)는 한 번만 자동으로 새로고침한다.
import React from "react";
import { t } from "../lib/i18n.js";

const CHUNK_ERR = /Loading chunk|Loading CSS chunk|dynamically imported module|Importing a module script failed|error loading dynamically|Unable to preload|MIME type/i;
const KEY = "oc_chunk_reload_at";

// 청크 로드 실패면 60초 안에 한 번만 새로고침한다(계속 실패해도 무한 새로고침이 되지 않게). 새로고침했으면 true.
export function reloadOnceForChunkError(err) {
  const msg = String((err && (err.message || err.reason && err.reason.message)) || err || "");
  if (!CHUNK_ERR.test(msg)) return false;
  try {
    const last = Number(window.sessionStorage.getItem(KEY) || 0);
    if (Date.now() - last < 60000) return false;
    window.sessionStorage.setItem(KEY, String(Date.now()));
  } catch { }
  window.location.reload();
  return true;
}

export class AppErrorBoundary extends React.Component {
  constructor(props) { super(props); this.state = { err: null, open: false }; }
  static getDerivedStateFromError(err) { return { err }; }
  componentDidCatch(err, info) {
    try { console.error("[OpenChess] render error", err, info && info.componentStack); } catch { }
    reloadOnceForChunkError(err);
  }
  render() {
    const { err, open } = this.state;
    if (!err) return this.props.children;
    const box = { minHeight: "100vh", background: "#1B1009", color: "#EBDDC4", display: "flex", alignItems: "center", justifyContent: "center", padding: 24, fontFamily: "'IBM Plex Sans KR','Noto Sans KR',sans-serif" };
    return (
      <div style={box}>
        <div style={{ maxWidth: 360, textAlign: "center" }}>
          <div style={{ fontSize: 18, fontWeight: 800, marginBottom: 8 }}>{t("화면 불러오기 실패")}</div>
          <div style={{ fontSize: 13, lineHeight: 1.6, opacity: 0.8, marginBottom: 18 }}>{t("일시적인 문제 발생. 새로고침하면 대부분 해결.")}</div>
          <button onClick={() => window.location.reload()} style={{ padding: "11px 26px", borderRadius: 10, border: "none", background: "linear-gradient(180deg,#D4AF55,#A8842F)", color: "#241509", fontWeight: 800, fontSize: 14, cursor: "pointer" }}>{t("새로고침")}</button>
          <div style={{ marginTop: 16 }}>
            <button onClick={() => this.setState({ open: !open })} style={{ background: "none", border: "none", color: "#EBDDC4", opacity: 0.6, fontSize: 11.5, cursor: "pointer", textDecoration: "underline" }}>{t("오류 내용 보기")}</button>
          </div>
          {open && <pre style={{ marginTop: 8, padding: 10, borderRadius: 8, background: "rgba(0,0,0,.35)", fontSize: 10.5, textAlign: "left", whiteSpace: "pre-wrap", wordBreak: "break-all", maxHeight: 160, overflow: "auto" }}>{String((err && (err.stack || err.message)) || err).slice(0, 800)}</pre>}
        </div>
      </div>
    );
  }
}
