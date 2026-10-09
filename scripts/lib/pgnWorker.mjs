// (v0.6.5) build-pgn-tournaments의 작업자 — 파일 목록을 받아 파싱하고 수순을 압축해 돌려준다(chess.js 검증이 느려 4개로 나눠 돈다).
import { parentPort, workerData } from "node:worker_threads";
import { readFileSync } from "node:fs";
import { parsePgn } from "./pgnParse.mjs";
import { encodeMoves } from "../../src/lib/moveCodec.js";

const out = [];
for (const f of workerData.files) {
  const games = parsePgn(readFileSync(f, "utf8")).map((g) => {
    const t = g.tags, enc = encodeMoves(g.moves);
    return { ev: t.Event || "", site: t.Site || "", date: t.Date || "", round: t.Round || "", white: t.White || "", black: t.Black || "", result: t.Result || "", we: t.WhiteElo || "", be: t.BlackElo || "", wt: t.WhiteTitle || "", bt: t.BlackTitle || "", eco: t.ECO || "", code: enc.code, n: enc.n, total: g.moves.length };
  });
  out.push({ file: f, games });
  parentPort.postMessage({ progress: f });
}
parentPort.postMessage({ done: out });
