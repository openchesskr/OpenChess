#!/usr/bin/env python3
"""(v0.6.9) 기본 기물(public/{White,Black} *.png)에서 스킨 세트 기물 이미지를 만든다 → public/pieces/<세트>/<white|black>-<기물>.webp

실루엣(알파)과 분할선·포인트 삼각형(금색 선) 구조는 기본 스킨 그대로 두고, 아래 요소만 세트마다 바꾼다.
  · 몸통 색감과 질감(상아 결·대리석 무늬·자기 균열·헤어라인 금속·벨벳)
  · 면(facet)마다 살짝 다른 명암(조명) — 분할선으로 나뉜 면을 하나씩 찾아 칠한다
  · 분할선·삼각형 포인트의 금속 램프(황동·청동·코발트·사파이어·로즈골드)
  · 퀸 끝 공 같은 작은 원형 부분은 보석(gem)으로
실행: python3 scripts/build-skin-pieces.py   (numpy·scipy·Pillow 필요. 결과 이미지는 저장소에 커밋한다 — 빌드에서는 실행하지 않는다)
새 세트를 더하려면 SETS에 한 항목을 추가하고 이 스크립트를 다시 돌린 뒤 theme.js의 PIECE_SKINS·SKIN_SETS에 연결한다(check-skins가 파일 존재를 확인).
"""
import os, sys
import numpy as np
from PIL import Image
from scipy import ndimage as ndi

ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..")
PUB = os.path.join(ROOT, "public")
NAMES = {"P": "Pawn", "N": "Knight", "B": "Bishop", "R": "Rook", "Q": "Queen", "K": "King"}
S = 2   # 가로·세로 배율(원본 80px 폭 → 160px)


def hexc(h):
    h = h.lstrip("#"); return np.array([int(h[i:i + 2], 16) for i in (0, 2, 4)], dtype=np.float32)


def ramp(t, stops):
    """t(0~1 배열) → stops(색 목록)을 따라 보간한 색 (…,3)."""
    cols = [hexc(c) for c in stops]; n = len(cols) - 1
    x = np.clip(t, 0, 1) * n; i = np.minimum(x.astype(int), n - 1); f = (x - i)[..., None]
    arr = np.stack(cols)
    return arr[i] * (1 - f) + arr[i + 1] * f


def noise(shape, cell, seed, aniso=(1.0, 1.0)):
    """부드러운 난수 장(0~1). cell = 무늬 한 칸의 픽셀 크기, aniso = (세로 늘임, 가로 늘임)."""
    rng = np.random.default_rng(seed)
    h, w = shape
    gh, gw = max(2, int(h / (cell * aniso[0])) + 3), max(2, int(w / (cell * aniso[1])) + 3)
    g = rng.random((gh, gw)).astype(np.float32)
    z = ndi.zoom(g, (h / (gh - 1.0) * 1.0, w / (gw - 1.0) * 1.0), order=3)[:h, :w]
    if z.shape != (h, w):
        z = np.pad(z, ((0, h - z.shape[0]), (0, w - z.shape[1])), mode="edge")
    return (z - z.min()) / (np.ptp(z) + 1e-6)


def fbm(shape, base, seed, octaves=3, aniso=(1.0, 1.0)):
    out = np.zeros(shape, np.float32); amp = 1.0; tot = 0.0
    for o in range(octaves):
        out += amp * noise(shape, max(2.0, base / (2 ** o)), seed + 17 * o, aniso); tot += amp; amp *= 0.5
    return out / tot


# ───────────────────────── 세트 정의 ─────────────────────────
# body[w/b]: 몸통 기본색, tex(shape, color, seed) → 몸통에 곱할 (…,3) 배율(1 근처). metal[w/b]: 분할선·삼각형 색 램프(어두운 → 밝은). gem[w/b]: 보석색.
def tex_ivory(shape, color, seed):
    if color == "w":   # 상아: 세로 결 + 미세한 얼룩
        g = fbm(shape, 14, seed, 3, (4.0, 1.0)); f = fbm(shape, 3, seed + 5, 2)
        m = 1 + 0.07 * (g - 0.5) * 2 + 0.03 * (f - 0.5) * 2
        return np.stack([m * 1.0, m * 0.99, m * 0.96], -1)
    h, w = shape; yy, xx = np.mgrid[0:h, 0:w].astype(np.float32)   # 흑단: 짙은 세로 줄무늬
    warp = fbm(shape, 20, seed, 3, (3.0, 1.0))
    ring = 0.5 + 0.5 * np.sin((xx / S) * 1.15 + warp * 9.0)
    m = 1 + 0.55 * (ring - 0.5) * (0.5 + 0.5 * warp)
    return np.stack([m * 1.12, m * 0.98, m * 0.92], -1)


def tex_marble(shape, color, seed):
    h, w = shape; yy, xx = np.mgrid[0:h, 0:w].astype(np.float32)
    warp = fbm(shape, 26, seed, 4)
    v = np.abs(np.sin((xx * 0.55 + yy * 0.35) / S * 0.55 + warp * 7.5))
    vein = np.clip((0.16 - v) / 0.16, 0, 1) ** 1.6
    v2 = np.abs(np.sin((xx * -0.3 + yy * 0.7) / S * 0.9 + warp * 11 + 2.0)); vein2 = np.clip((0.07 - v2) / 0.07, 0, 1) ** 1.8
    cloud = fbm(shape, 18, seed + 9, 3)
    if color == "w":
        m = 1 - 0.20 * vein - 0.12 * vein2 + 0.03 * (cloud - 0.5) * 2
        return np.stack([m * 0.98, m * 1.0, m * 1.02], -1)
    m = 1 + 0.9 * vein + 0.5 * vein2 + 0.10 * (cloud - 0.5) * 2
    return np.stack([m * 0.98, m * 1.04, m * 1.0], -1)


def tex_porcelain(shape, color, seed):
    h, w = shape
    # 균열(craquelure): 점 무리의 보로노이 경계선을 가늘게
    rng = np.random.default_rng(seed)
    n = 12 if color == "w" else 16
    pts = np.stack([rng.random(n) * h, rng.random(n) * w], 1)
    yy, xx = np.mgrid[0:h, 0:w]
    d = np.stack([np.hypot(yy - p[0], xx - p[1]) for p in pts], 0)
    srt = np.sort(d, 0); edge = srt[1] - srt[0]
    crack = np.clip(1 - edge / (1.6 * S), 0, 1) ** 1.5
    gloss = fbm(shape, 30, seed + 3, 2)
    if color == "w":
        m = 1 - 0.07 * crack + 0.025 * (gloss - 0.5) * 2
        return np.stack([m * 0.99, m * 1.0, m * 1.01], -1)
    m = 1 + 0.22 * crack + 0.10 * (gloss - 0.5) * 2   # 청자: 균열이 옅은 선으로
    return np.stack([m * 0.97, m * 1.03, m * 1.0], -1)


def tex_brushed(shape, color, seed):
    fine = fbm(shape, 2.2, seed, 2, (0.25, 3.5)); wide = fbm(shape, 12, seed + 4, 2, (1.0, 4.0))
    amp = 0.07 if color == "w" else 0.12
    m = 1 + amp * (fine - 0.5) * 2 + 0.04 * (wide - 0.5) * 2
    return np.stack([m * 0.99, m * 1.0, m * 1.03], -1)


def tex_pearl(shape, color, seed):
    if color == "w":   # 진주: 느린 무지갯빛 번짐
        a = fbm(shape, 34, seed, 3); b = fbm(shape, 30, seed + 8, 3)
        return np.stack([1 + 0.035 * (a - 0.5) * 2 + 0.01, 1 - 0.01 + 0.02 * (b - 0.5) * 2, 1 + 0.045 * (b - a)], -1)
    n = fbm(shape, 1.8, seed, 2); soft = fbm(shape, 22, seed + 6, 3)   # 벨벳: 고운 입자 + 느린 명암
    m = 1 + 0.10 * (n - 0.5) * 2 + 0.10 * (soft - 0.5) * 2
    return np.stack([m * 1.05, m * 0.97, m * 0.99], -1)


SETS = {
    "ivory": {   # 상아와 흑단
        "body": {"w": "#EADBBB", "b": "#2A211D"}, "tex": tex_ivory, "light": 0.06, "facet": 0.050,
        "metal": {"w": ["#7A5418", "#B98A35", "#E9CC83", "#FFF0BE"], "b": ["#9A6E22", "#D2A446", "#F1D58E", "#FFF3CA"]},
        "gem": {"w": ["#8E5A12", "#D79A2E", "#FFE2A0"], "b": ["#8E5A12", "#D79A2E", "#FFE2A0"]},
    },
    "marble": {   # 대리석과 청동
        "body": {"w": "#E9E8E2", "b": "#33403B"}, "tex": tex_marble, "light": 0.05, "facet": 0.045,
        "metal": {"w": ["#4F2F18", "#8C5A2F", "#C58C57", "#EBC08C"], "b": ["#2F6F5E", "#5FA58F", "#A5DCC6", "#DDF6EA"]},
        "gem": {"w": ["#4F2F18", "#B87A44", "#F1C79A"], "b": ["#2F6F5E", "#6DB59C", "#D3F0E3"]},
    },
    "porcelain": {   # 백자와 청자
        "body": {"w": "#F3F5F2", "b": "#466B5E"}, "tex": tex_porcelain, "light": 0.05, "facet": 0.040,
        "metal": {"w": ["#14307A", "#24479F", "#4C74CE", "#9DB9F0"], "b": ["#9AA7A2", "#CBD5D1", "#EEF3F0", "#FFFFFF"]},
        "gem": {"w": ["#14307A", "#3A62BE", "#BBD0F8"], "b": ["#9AA7A2", "#DCE5E1", "#FFFFFF"]},
    },
    "silver": {   # 은과 사파이어
        "body": {"w": "#D7DCE4", "b": "#313846"}, "tex": tex_brushed, "light": 0.07, "facet": 0.055,
        "metal": {"w": ["#0E2A78", "#1E4DB5", "#4F86E8", "#A9CBFF"], "b": ["#5A86D0", "#8CB4F2", "#C6DCFF", "#F2F8FF"]},
        "gem": {"w": ["#0E2A78", "#2F66D0", "#B3D0FF"], "b": ["#3A66BC", "#86B0F0", "#E6F0FF"]},
    },
    "rose": {   # 로즈 골드와 와인
        "body": {"w": "#EDD1CA", "b": "#5A1D2B"}, "tex": tex_pearl, "light": 0.06, "facet": 0.050,
        "metal": {"w": ["#8A4A42", "#C2756A", "#EBAA9A", "#FFDCCD"], "b": ["#B76E62", "#E29C8C", "#F8CBB9", "#FFEADF"]},
        "gem": {"w": ["#8A3A44", "#C9566A", "#FFC4CE"], "b": ["#B76E62", "#EDA999", "#FFE6DC"]},
    },
}


# ───────────────────────── 분해·합성 ─────────────────────────
def decompose(img):
    a = np.asarray(img.convert("RGBA"), np.float32)
    alpha = a[..., 3] / 255.0; rgb = a[..., :3]
    sat = (rgb.max(-1) - rgb.min(-1)) / 255.0
    g = np.clip(sat / 0.42, 0, 1) * (alpha > 0.02)   # 금색(선·삼각형) 비중
    # 금색 밝기(0=어두운 금, 1=밝은 금): 삼각형 그라디언트를 램프에 옮기기 위해
    lum = rgb.max(-1) / 255.0
    t = np.clip((lum - 0.62) / (0.97 - 0.62), 0, 1)
    return alpha, g, t


def up(arr, mode=Image.BICUBIC):
    im = Image.fromarray(arr.astype(np.float32), mode="F")
    return np.asarray(im.resize((arr.shape[1] * S, arr.shape[0] * S), mode), np.float32)


def facets(alpha, g):
    """분할선으로 나뉜 면을 찾는다 → (라벨 맵, 면 정보 목록). 선 위 픽셀은 가장 가까운 면의 라벨을 갖게 채운다."""
    body = (alpha > 0.5) & (g < 0.35)
    lab, n = ndi.label(body)
    idx = ndi.distance_transform_edt(lab == 0, return_distances=False, return_indices=True)
    filled = lab[idx[0], idx[1]]
    infos = []
    for i in range(1, n + 1):
        ys, xs = np.nonzero(lab == i)
        if len(ys) == 0: infos.append(None); continue
        bw, bh = xs.max() - xs.min() + 1, ys.max() - ys.min() + 1
        infos.append({"area": len(ys), "cy": ys.mean(), "cx": xs.mean(), "round": len(ys) / float(bw * bh), "aspect": bw / float(bh), "top": ys.min()})
    return filled, infos


def render(color, name, st):
    src = Image.open(os.path.join(PUB, ("White " if color == "w" else "Black ") + name + ".png"))
    alpha, g, t = decompose(src)
    H, W = alpha.shape
    lab, infos = facets(alpha, g)
    # 2배 확대
    A, G, T = up(alpha), np.clip(up(g), 0, 1), np.clip(up(t), 0, 1)
    L = np.asarray(Image.fromarray(lab.astype(np.int32), mode="I").resize((W * S, H * S), Image.NEAREST))
    h, w = A.shape
    seed = (ord(name[0]) * 31 + (7 if color == "b" else 3)) * 13
    base = hexc(st["body"][color])
    yy, xx = np.mgrid[0:h, 0:w].astype(np.float32)
    # 조명: 위·왼쪽이 밝고 아래·오른쪽이 어둡다
    light = 1 + st["light"] * (0.5 - yy / h) * 2 * 0.6 + st["light"] * (0.5 - xx / w) * 0.8
    # 면마다 다른 명암(분할선으로 나뉜 면이 보석처럼 살짝 다르게 반짝)
    rng = np.random.default_rng(seed)
    delta = np.zeros(len(infos) + 1, np.float32)
    for i, inf in enumerate(infos, start=1):
        if inf is None: continue
        lit = 0.5 - inf["cy"] / H * 0.6 - (inf["cx"] / W - 0.5) * 0.4
        delta[i] = (rng.random() - 0.5) * 2 * st["facet"] + lit * st["facet"] * 0.8
    facet_mult = 1 + delta[L]
    tex = st["tex"]((h, w), color, seed)
    body = base[None, None, :] * (light * facet_mult)[..., None] * tex
    # 보석(작고 둥근 면): 퀸 끝 공·킹 십자 가운데
    gem_ids = [i for i, inf in enumerate(infos, start=1) if inf and inf["area"] < 120 and inf["round"] > 0.62 and 0.6 < inf["aspect"] < 1.7 and inf["top"] < H * 0.35]
    if gem_ids:
        gm = np.isin(L, gem_ids) & (G < 0.5)
        cy = {i: infos[i - 1]["cy"] * S for i in gem_ids}; cx = {i: infos[i - 1]["cx"] * S for i in gem_ids}
        gt = np.zeros((h, w), np.float32)
        for i in gem_ids:   # 중심에서 왼쪽 위로 치우친 하이라이트
            m = (L == i)
            d = np.hypot(yy - (cy[i] - 2.0), xx - (cx[i] - 2.0)); gt = np.where(m, 1 - np.clip(d / (9.0 * S / 2), 0, 1), gt)
        gcol = ramp(gt, st["gem"][color])
        body = np.where(gm[..., None], gcol, body)
    # 금속(선·삼각형): 원본 삼각형의 밝기 변화를 램프로 옮긴다. 선은 램프 중간~밝은 쪽.
    metal = ramp(0.25 + 0.75 * T, st["metal"][color])
    metal = metal * (1 + st["light"] * 0.6 * (0.5 - yy / h))[..., None]
    out = body * (1 - G[..., None]) + metal * G[..., None]
    rgba = np.concatenate([np.clip(out, 0, 255), (np.clip(A, 0, 1) * 255)[..., None]], -1).astype(np.uint8)
    return Image.fromarray(rgba, "RGBA")


def main():
    only = sys.argv[1:]
    for sid, st in SETS.items():
        if only and sid not in only: continue
        d = os.path.join(PUB, "pieces", sid); os.makedirs(d, exist_ok=True)
        for color, cname in (("w", "white"), ("b", "black")):
            for key, nm in NAMES.items():
                img = render(color, nm, st)
                img.save(os.path.join(d, f"{cname}-{nm.lower()}.webp"), "WEBP", quality=92, method=6)
        print("✔", sid)


if __name__ == "__main__":
    main()
