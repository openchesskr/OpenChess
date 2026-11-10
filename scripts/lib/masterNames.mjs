// (v0.7.5) 마스터 대국 DB의 선수 표기 묶기 공용 도구 — 도감 선수 목록(build-db-masters)과 DB 기반 프로필 보충(build-master-profiles-db)이 같은 규칙으로 같은 사람을 찾는다.
//  "Carlsen,M" · "Carlsen, Magnus"는 성 + 이름 첫 글자 키("carlsen|m")로 합친다. 끝의 숫자("Fedoseev,Vl3")·나라 코드·마침표는 지우고, 쉼표 없는 "Ding Liren"은 첫 낱말을 성으로 본다.
export const ascii = (s) => String(s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z ]/g, "").trim();
export const clean = (raw) => String(raw).replace(/\d+/g, "").replace(/\s+[A-Z]{3}$/, "").replace(/\.$/, "").replace(/\s+/g, " ").trim();
export const split = (raw0) => { const raw = clean(raw0), i = raw.indexOf(","); if (i >= 0) return [raw.slice(0, i).trim(), raw.slice(i + 1).trim()]; const t = raw.split(" "); return t.length > 1 ? [t[0], t.slice(1).join(" ")] : [raw, ""]; };
export const personKey = (raw) => { const [sur, giv] = split(raw); return ascii(sur) + "|" + ascii(giv).slice(0, 1); };

/** 선수 표기 묶음. add(원래 표기, 엘로)로 쌓고 finish()로 복합 성 합치기까지 끝낸 Map(key → { sur, names, games, elo })과 resolve(원래 표기 → 최종 key)를 돌려준다. */
export function peopleIndex() {
  const people = new Map(), alias = new Map();
  const add = (raw, elo) => {
    if (!raw || raw === "?") return;
    const [sur, giv] = split(raw), key = ascii(sur) + "|" + ascii(giv).slice(0, 1);
    let p = people.get(key); if (!p) { p = { sur, names: new Map(), games: 0, elo: 0 }; people.set(key, p); }
    const nm = sur + (giv ? ", " + giv : ""); p.names.set(nm, (p.names.get(nm) || 0) + 1); p.games++;
    const e = parseInt(elo, 10); if (e > p.elo) p.elo = e;
  };
  const finish = () => {
    // 복합 성의 앞부분만 쓴 표기("Dominguez, L" ↔ "Dominguez Perez, Leinier")는 같은 사람으로 합친다(앞부분 + 이름 첫 글자가 같고 후보가 하나일 때).
    // 후보 찾기를 "첫 낱말 + 이름 첫 글자" 표로 미리 묶어 둔다(모든 쌍을 비교하던 방식은 선수 4만 명에서 수십 분 걸렸다). 결과는 예전 방식과 같다:
    // 후보 = 키가 "sur + 공백"으로 시작하고 같은 이름 첫 글자 — 그런 키의 첫 낱말은 반드시 sur의 첫 낱말이므로 그 묶음 안에서만 찾으면 된다.
    const byHead = new Map();
    for (const k of people.keys()) { const [s, i] = k.split("|"); const h = s.split(" ")[0] + "|" + i; if (!byHead.has(h)) byHead.set(h, []); byHead.get(h).push(k); }
    for (const [key, p] of [...people]) {
      const [sur, ini] = key.split("|"); if (!sur) continue;
      const pool = byHead.get(sur.split(" ")[0] + "|" + ini) || [];
      const cands = pool.filter((k) => k !== key && people.has(k) && k.startsWith(sur + " ")).map((k) => [k, people.get(k)]);
      if (cands.length === 1) { const q = cands[0][1]; for (const [n, c] of p.names) q.names.set(n, (q.names.get(n) || 0) + c); q.games += p.games; q.elo = Math.max(q.elo, p.elo); people.delete(key); alias.set(key, cands[0][0]); }
    }
    return people;
  };
  const resolve = (raw) => { const k = personKey(raw); return alias.get(k) || k; };
  return { add, finish, resolve, people };
}
/** 가장 긴 표기(같으면 자주 나온 쪽) — "성, 이름" 꼴. */
export const bestName = (p) => [...p.names.entries()].sort((a, b) => b[0].length - a[0].length || b[1] - a[1])[0][0];
