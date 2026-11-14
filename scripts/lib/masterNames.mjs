// (v0.7.5) 마스터 대국 DB의 선수 표기 묶기 공용 도구 — 도감 선수 목록(build-db-masters)과 DB 기반 프로필 보충(build-master-profiles-db)이 같은 규칙으로 같은 사람을 찾는다.
//  "Carlsen,M" · "Carlsen, Magnus"는 성 + 이름 첫 글자 키("carlsen|m")로 합친다. 나라 코드·마침표는 지우고, 쉼표 없는 "Ding Liren"은 첫 낱말을 성으로 본다.
//  (v0.7.7 BUG-152) 이름 끝의 숫자("Fedoseev,Vl3" · "Sokolov,And1")는 FIDE가 동명이인을 가르는 표지라 지우지 않고 키에 남긴다("fedoseev|v#3").
//  예전엔 숫자를 지워 1997~98년의 "Fedoseev, Vladimir"(2375)와 1995년생 GM "Fedoseev,Vl3"이 한 사람이 됐다. 숫자 없는 표기가 같은 사람의
//  다른 표기일 수도 있어, 숫자 표지가 하나뿐이고 활동 연도가 겹치면(finish 단계) 다시 합친다.
export const ascii = (s) => String(s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z ]/g, "").trim();
export const clean = (raw) => String(raw).replace(/\d+/g, "").replace(/\s+[A-Z]{3}$/, "").replace(/\.$/, "").replace(/\s+/g, " ").trim();
export const split = (raw0) => { const raw = clean(raw0), i = raw.indexOf(","); if (i >= 0) return [raw.slice(0, i).trim(), raw.slice(i + 1).trim()]; const t = raw.split(" "); return t.length > 1 ? [t[0], t.slice(1).join(" ")] : [raw, ""]; };
/** FIDE 동명이인 표지(이름 끝 숫자, 1~9) — 없으면 "". */
export const fideTag = (raw) => { const m = /[A-Za-z.](\d)\s*(?:[A-Z]{3})?$/.exec(String(raw || "").trim()); return m ? m[1] : ""; };
export const personKey = (raw) => { const [sur, giv] = split(raw), tag = fideTag(raw); return ascii(sur) + "|" + ascii(giv).slice(0, 1) + (tag ? "#" + tag : ""); };

/** 선수 표기 묶음. add(원래 표기, 엘로)로 쌓고 finish()로 복합 성 합치기까지 끝낸 Map(key → { sur, names, games, elo })과 resolve(원래 표기 → 최종 key)를 돌려준다. */
export function peopleIndex() {
  const people = new Map(), alias = new Map();
  const add = (raw, elo, year) => {
    if (!raw || raw === "?") return;
    const [sur, giv] = split(raw), key = personKey(raw);
    let p = people.get(key); if (!p) { p = { sur, names: new Map(), games: 0, elo: 0, y0: 0, y1: 0 }; people.set(key, p); }
    const nm = sur + (giv ? ", " + giv : ""); p.names.set(nm, (p.names.get(nm) || 0) + 1); p.games++;
    const e = parseInt(elo, 10); if (e > p.elo) p.elo = e;
    const y = parseInt(year, 10); if (y > 1000) { if (!p.y0 || y < p.y0) p.y0 = y; if (y > p.y1) p.y1 = y; }
  };
  const absorb = (from, to) => { const p = people.get(from), q = people.get(to); for (const [n, c] of p.names) q.names.set(n, (q.names.get(n) || 0) + c); q.games += p.games; q.elo = Math.max(q.elo, p.elo); if (p.y0 && (!q.y0 || p.y0 < q.y0)) q.y0 = p.y0; if (p.y1 > q.y1) q.y1 = p.y1; people.delete(from); alias.set(from, to); };
  // 활동 연도가 겹치거나 3년 안으로 이어지면 같은 사람으로 볼 수 있다. 연도를 모르면(0) 겹친다고 본다(예전 동작).
  const near = (a, b) => !a.y0 || !b.y0 || (a.y0 <= b.y1 + 3 && b.y0 <= a.y1 + 3);
  const finish = () => {
    // (v0.7.7 BUG-152) 숫자 표지 없는 표기("Fedoseev, Vladimir")는, 같은 성·이름 첫 글자의 숫자 표지가 하나뿐이고 활동 연도가 겹칠 때만 그 사람에 합친다.
    //  표지가 둘 이상이거나 연도가 동떨어지면 별개의 사람으로 남긴다.
    const tagged = new Map();
    for (const k of people.keys()) { const i = k.indexOf("#"); if (i > 0) { const b = k.slice(0, i); if (!tagged.has(b)) tagged.set(b, []); tagged.get(b).push(k); } }
    for (const [base, list] of tagged) if (list.length === 1 && people.has(base) && near(people.get(base), people.get(list[0]))) absorb(base, list[0]);
    // 복합 성의 앞부분만 쓴 표기("Dominguez, L" ↔ "Dominguez Perez, Leinier")는 같은 사람으로 합친다(앞부분 + 이름 첫 글자가 같고 후보가 하나일 때).
    // 후보 찾기를 "첫 낱말 + 이름 첫 글자" 표로 미리 묶어 둔다(모든 쌍을 비교하던 방식은 선수 4만 명에서 수십 분 걸렸다). 결과는 예전 방식과 같다:
    // 후보 = 키가 "sur + 공백"으로 시작하고 같은 이름 첫 글자 — 그런 키의 첫 낱말은 반드시 sur의 첫 낱말이므로 그 묶음 안에서만 찾으면 된다.
    const byHead = new Map();
    for (const k of people.keys()) { const [s, i] = k.split("|"); const h = s.split(" ")[0] + "|" + i; if (!byHead.has(h)) byHead.set(h, []); byHead.get(h).push(k); }
    for (const key of [...people.keys()]) {
      if (!people.has(key)) continue;
      const [sur, ini] = key.split("|"); if (!sur) continue;
      const pool = byHead.get(sur.split(" ")[0] + "|" + ini) || [];
      const cands = pool.filter((k) => k !== key && people.has(k) && k.startsWith(sur + " "));
      if (cands.length === 1) absorb(key, cands[0]);
    }
    return people;
  };
  const resolve = (raw) => { let k = personKey(raw); while (alias.has(k)) k = alias.get(k); return k; };
  return { add, finish, resolve, people };
}
/** 대표 표기 — "성, 이름" 꼴. 기본은 예전처럼 가장 긴 표기(같으면 자주 나온 쪽).
 *  (v0.7.7 BUG-170) 그런데 가장 긴 표기가 이름 첫 글자만 같은 다른 사람이나 한두 번 나온 오기일 때가 있었다
 *  (Garry Kasparov 771판이 2판짜리 "Kasparov,Georgy"로, Anatoly Karpov가 1판짜리 "Karpov, Alexander"로, Levon Aronian이 "Aronian,Laurel"로 표시).
 *  표기마다 "그 이름과 어긋나지 않는, 이름을 적은 표기"(이름의 앞부분 Gar → Garry, Ana → Anatoly)의 판수를 더한 지지도를 매겨,
 *  가장 긴 표기가 드물게(3판 이하·1% 미만) 나왔고 지지도도 최고 지지도의 절반에 못 미칠 때만 지지도가 가장 큰 표기(같으면 긴 쪽)로 바꾼다. */
const givenToks = (n) => { const i = n.indexOf(","); return i < 0 ? [] : ascii(n.slice(i + 1).replace(/-/g, " ")).split(" ").filter(Boolean); };
const fits = (y, x) => {   // 표기 y가 표기 x와 어긋나지 않는가(같은 사람의 줄인 표기일 수 있는가)
  if (!y.length) return true; if (!x.length) return false;
  if (x[0].startsWith(y[0]) && y.length === 1) return true;
  const yj = y.join(""), xi = x.map((w) => w[0]).join("");
  if (xi.startsWith(yj)) return true;                                   // 머리글자: "PH" ↔ Peter Heine
  return y.every((w, k) => x[k] && x[k].startsWith(w));                 // 낱말별 앞부분: "Lars B" ↔ Lars Bo
};
export const bestName = (p) => {
  const all = [...p.names.entries()].map(([n, c]) => ({ n, c, t: givenToks(n) }));
  const byLen = (a, b) => b.n.length - a.n.length || b.c - a.c;
  const longest = [...all].sort(byLen)[0];
  // 머리글자뿐인 표기(이름 2글자 이하: "L"·"PH")는 여러 후보를 똑같이 지지하므로 셈에서 뺀다 — 이름을 적은 표기만 센다.
  const sup = (x) => all.reduce((s, y) => s + (y.t.join("").length >= 3 && fits(y.t, x.t) ? y.c : 0), 0);
  let best = longest, bestSup = sup(longest);
  for (const x of all) { const v = sup(x); if (v > bestSup || (v === bestSup && byLen(x, best) < 0)) { best = x; bestSup = v; } }
  // 가장 긴 표기가 그 선수 대국의 1% 미만·3판 이하로만 나온 표기(오기·다른 사람)일 때만 바꾼다 — 대표 이름은 한국어 표기표·주소의 키라 함부로 바꾸지 않는다.
  if (sup(longest) * 2 >= bestSup || longest.c > 3 || longest.c >= p.games * 0.01) return longest.n;
  // 고른 표기를 줄이지 않고 더 길게 쓴 표기가 있으면 그쪽("Alexa" → "Alexander", "Gawain" → "Gawain C B")
  const ext = all.filter((x) => x.n.length > best.n.length && fits(best.t, x.t)).sort(byLen);
  return ext.length ? ext[0].n : best.n;
};
