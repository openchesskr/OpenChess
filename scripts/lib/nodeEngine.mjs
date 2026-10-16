// (v0.6.7) Node용 UCI 엔진 어댑터, 앱의 분석 워커(src/app/common.jsx bootAnalysisWorker)와 같은 evaluateMulti 의미를 따른다.
// analyzeGame은 분석 풀이 비어 있으면 engine.evaluateMulti 하나로 폴백하므로(profile "node", urls []), 이 어댑터를 engine으로 넘기면
// 브라우저 없이도 앱의 실제 채점 코드(수 등급·정확도·희생 확인)를 그대로 돌릴 수 있다. 퍼포먼스 레이팅 보정(scripts/calibrate-performance.mjs)이 쓴다.
//
// 앱 워커와 맞춘 점(바꾸면 보정 결과가 앱과 어긋난다):
//  · "go depth D" 만 보낸다(movetime을 go에 넣지 않는다). movetime(mt)이 지나면 요청한 MultiPV 순위가 전부 나왔을 때 stop을 보낸다(150ms 간격 재확인).
//  · 하드 워치독: mt + hardBuffer(기본 4000ms) 안에 끝나지 않으면 지금까지의 줄로 확정하고 stop.
//  · 요청은 한 줄로 직렬 처리한다(analyzeGame의 희생 확인 평가가 같은 엔진에 동시에 들어온다).
//  · 결과 줄: { uci, pv, depth, cp, mate }, MultiPV 순위 오름차순.
import { spawn } from "node:child_process";

export function createNodeEngine({ bin, hashMB = 32, threads = 1 }) {
  const proc = spawn(process.execPath, [bin], { stdio: ["pipe", "pipe", "ignore"] });
  const queue = []; let running = false, swallowBest = 0, booted = false, buf = "", dead = false;
  const send = (c) => { if (!dead) proc.stdin.write(c + "\n"); };
  const settle = (job, val) => { if (job.settled) return; job.settled = true; clearTimeout(job.watch); clearTimeout(job.hardWatch); clearTimeout(job.softTimer); job.resolve(val); };
  const linesOf = (job) => Object.keys(job.lines).sort((a, b) => a - b).map((k) => job.lines[k]);

  function pump() {
    if (running || !queue.length || !booted) return; running = true;
    const job = queue[0];
    job.cmds.forEach(send);
    if (job.mt) {
      const trySoftStop = () => {
        if (queue[0] !== job || job.settled) return;
        if (Object.keys(job.lines).length >= job.multipvTarget) send("stop");
        else job.softTimer = setTimeout(trySoftStop, 150);
      };
      job.softTimer = setTimeout(trySoftStop, job.mt);
    }
    job.watch = setTimeout(() => {
      if (queue[0] !== job || job.settled) return;
      settle(job, linesOf(job));
      send("stop");
      job.hardWatch = setTimeout(() => { if (queue[0] !== job) return; queue.shift(); running = false; swallowBest++; pump(); }, 1500);
    }, job.mt ? job.mt + (job.hardBuffer != null ? job.hardBuffer : 4000) : 15000);
  }
  function handleLine(line) {
    if (!booted) { if (line === "readyok") { booted = true; pump(); } return; }
    const job = queue[0]; if (!job) return;
    if (line.startsWith("info")) {
      const sc = line.match(/score (cp|mate) (-?\d+)/), mp = line.match(/multipv (\d+)/);
      const pvIdx = line.indexOf(" pv "), pvList = pvIdx >= 0 ? line.slice(pvIdx + 4).trim().split(/\s+/) : null;
      const dm = line.match(/^info depth (\d+)/);
      if (mp && pvList && pvList.length && sc) job.lines[parseInt(mp[1], 10)] = { uci: pvList[0], pv: pvList, depth: dm ? parseInt(dm[1], 10) : null, cp: sc[1] === "cp" ? parseInt(sc[2], 10) : null, mate: sc[1] === "mate" ? parseInt(sc[2], 10) : null };
    }
    if (line.startsWith("bestmove")) {
      if (swallowBest > 0) { swallowBest--; return; }   // 워치독이 먼저 흘려보낸 작업의 뒤늦은 응답
      const done = queue.shift(); running = false;
      if (done) settle(done, linesOf(done));
      pump();
    }
  }
  proc.stdout.on("data", (d) => {
    buf += d; let i;
    while ((i = buf.indexOf("\n")) >= 0) { const line = buf.slice(0, i).trim(); buf = buf.slice(i + 1); if (line) handleLine(line); }
  });
  proc.on("exit", () => { dead = true; for (const j of queue) settle(j, linesOf(j)); });
  send("uci"); send("setoption name Hash value " + hashMB); if (threads > 1) send("setoption name Threads value " + threads); send("isready");

  return {
    profile: "node", urls: [],          // 분석 풀을 못 띄우게 해 analyzeGame이 아래 evaluateMulti로 폴백하게 한다
    // 풀 워커와 같은 인자 순서: (fen, depth, multipv, movetime, onLines, slot, hardBuffer)
    evaluateMulti(fen, d, multipv, mt, _onLines, _slot, hardBuffer) {
      return new Promise((resolve) => {
        queue.push({ resolve, lines: {}, mt, multipvTarget: multipv, hardBuffer, cmds: ["setoption name MultiPV value " + multipv, "position fen " + fen, "go depth " + d] });
        pump();
      });
    },
    newGame() { send("ucinewgame"); },
    close() { try { send("quit"); proc.kill(); } catch { /* 이미 종료 */ } },
  };
}
