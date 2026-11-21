// (v0.7.9, BUG-198) 도감 모식도(오프닝·마스터)처럼 아주 큰 캔버스(가로세로 10만 px 가까이)를 transform으로 움직이는 화면의 레이어 힌트.
//  예전엔 캔버스에 will-change: transform을 늘 걸어 두었다. 그러면 브라우저가 레이어를 "처음 올린 배율"로 래스터한 뒤 배율이 바뀌어도
//  다시 그리지 않는데, 확대해 둔 상태(예: 200%)에서 25%로 줄이면 화면에 보이는 범위가 그 높은 해상도로 16배 넓어져 GPU 타일 메모리를
//  넘기고, 이동할 때 트리 일부 타일이 그려지지 않은 채(빈 칸) 보였다.
//  지금은 조작(드래그·휠·애니메이션) 중에만 will-change를 걸고, 잠시 멈추면 풀어 현재 배율로 다시 래스터되게 한다.
//  조작 도중 배율이 처음 올린 배율에서 1.5배 넘게 달라지면 힌트를 한 번 풀었다 다시 걸어 새 배율로 레이어를 다시 만든다.
const IDLE_MS = 220, RESCALE = 1.5;
export function createLayerHint() {
  let timer = null, promotedZ = 0, el = null;
  const release = () => { timer = null; if (el) el.style.willChange = "auto"; promotedZ = 0; };
  return {
    /** 캔버스를 움직일 때마다 부른다(el: 캔버스 DOM, z: 지금 배율). */
    touch(node, z) {
      if (!node) return;
      el = node;
      if (promotedZ && (z / promotedZ > RESCALE || promotedZ / z > RESCALE)) { node.style.willChange = "auto"; promotedZ = 0; }
      if (!promotedZ) {
        promotedZ = z;
        // 풀었던 힌트를 같은 프레임에 다시 걸면 브라우저가 변화를 못 볼 수 있어 다음 프레임에 건다.
        if (node.style.willChange === "auto" && typeof requestAnimationFrame === "function") requestAnimationFrame(() => { if (promotedZ && el) el.style.willChange = "transform"; });
        else node.style.willChange = "transform";
      }
      if (timer) clearTimeout(timer);
      timer = setTimeout(release, IDLE_MS);
    },
    dispose() { if (timer) clearTimeout(timer); timer = null; },
  };
}
