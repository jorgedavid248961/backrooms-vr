"""Genera las texturas PBR del Nivel 1 (bodega de concreto) en assets/level1/.

Texturas 1024x1024 repetibles sin costuras (ruido filtrado por FFT):
  wall_color/normal/rough.jpg, floor_color/normal/rough.jpg, ceil_color/normal/rough.jpg
Uso: python tools/gen_level1_textures.py
Puedes reemplazar cualquiera por una textura fotográfica (p. ej. de ambientCG)
con el mismo nombre y el juego la usará sin cambiar código.
"""
import os
import numpy as np
from PIL import Image

S = 1024
OUT = os.path.join(os.path.dirname(__file__), '..', 'assets', 'level1')
rng = np.random.default_rng(7)


def fbm(beta=2.0, seed=None, lo=1.0):
    """Ruido 1/f^beta periódico (tileable) normalizado a 0..1."""
    r = np.random.default_rng(seed)
    w = r.standard_normal((S, S))
    f = np.fft.fft2(w)
    ky = np.fft.fftfreq(S)[:, None] * S
    kx = np.fft.fftfreq(S)[None, :] * S
    k = np.sqrt(kx * kx + ky * ky)
    k[0, 0] = 1
    amp = 1.0 / np.maximum(k, lo) ** (beta / 2)
    amp[0, 0] = 0
    n = np.real(np.fft.ifft2(f * amp))
    n -= n.min(); n /= n.max()
    return n


def band(seed, f0, f1):
    """Ruido de banda (detalle a una escala concreta)."""
    r = np.random.default_rng(seed)
    f = np.fft.fft2(r.standard_normal((S, S)))
    ky = np.fft.fftfreq(S)[:, None] * S
    kx = np.fft.fftfreq(S)[None, :] * S
    k = np.sqrt(kx * kx + ky * ky)
    m = ((k >= f0) & (k <= f1)).astype(float)
    n = np.real(np.fft.ifft2(f * m))
    n -= n.min(); n /= n.max()
    return n


def normal_from_height(h, strength):
    dx = (np.roll(h, -1, 1) - np.roll(h, 1, 1)) * strength
    dy = (np.roll(h, -1, 0) - np.roll(h, 1, 0)) * strength
    n = np.dstack([-dx, dy, np.ones_like(h)])
    n /= np.linalg.norm(n, axis=2, keepdims=True)
    return ((n * 0.5 + 0.5) * 255).astype(np.uint8)


def disc_mask(cx, cy, r):
    yy, xx = np.mgrid[0:S, 0:S]
    dx = np.minimum(abs(xx - cx), S - abs(xx - cx))
    dy = np.minimum(abs(yy - cy), S - abs(yy - cy))
    return np.sqrt(dx * dx + dy * dy) < r


def save(name, arr):
    Image.fromarray(arr).save(os.path.join(OUT, name), quality=86, optimize=True)


def rgb(gray, tint):
    return np.clip(np.dstack([gray * tint[0], gray * tint[1], gray * tint[2]]), 0, 255).astype(np.uint8)


def concrete(seed, base, tint, pores=True):
    large = fbm(2.6, seed)
    mid = band(seed + 1, 12, 60)
    fine = band(seed + 2, 120, 512)
    h = large * 0.45 + mid * 0.35 + fine * 0.2
    gray = base + (large - 0.5) * 60 + (mid - 0.5) * 30 + (fine - 0.5) * 26
    if pores:
        holes = band(seed + 3, 200, 512) > 0.83
        gray[holes] -= 35
        h[holes] -= 0.25
    return gray, h


os.makedirs(OUT, exist_ok=True)

# ---------- Pared: concreto de encofrado con agujeros de tensores y chorreados ----------
g, h = concrete(11, 118, (1.0, 0.985, 0.95))
for i in (0, S // 2):  # juntas del encofrado
    g[:, i:i + 3] -= 30; h[:, i:i + 3] -= 0.3
    g[i:i + 3, :] -= 22; h[i:i + 3, :] -= 0.25
for cx in (S // 4, 3 * S // 4):
    for cy in (S // 4, 3 * S // 4):
        m = disc_mask(cx, cy, 13); g[m] -= 55; h[m] -= 0.6
        ring = disc_mask(cx, cy, 22) & ~m; g[ring] -= 12
# Chorreados de humedad (verticales y periódicos).
streak = np.zeros((S, S))
for _ in range(14):
    x = rng.integers(0, S); w = rng.integers(3, 18); a = rng.uniform(0.1, 0.45)
    col = np.exp(-((np.arange(S) - x + S // 2) % S - S // 2) ** 2 / (2 * w * w))
    streak += a * col[None, :] * np.clip((fbm(2.2, 100 + _) - 0.35) * 2.2, 0, 1)
streak = np.clip(streak, 0, 1)
g -= streak * 55
wall_rough = np.clip(0.88 - streak * 0.45 + (band(13, 40, 200) - 0.5) * 0.1, 0.2, 1)
save('wall_color.jpg', rgb(g, (1.0, 0.985, 0.95)))
save('wall_normal.jpg', normal_from_height(h, 9))
save('wall_rough.jpg', (wall_rough * 255).astype(np.uint8))

# ---------- Suelo: concreto pulido con grietas, aceite y zonas mojadas ----------
g, h = concrete(21, 104, (1.0, 0.98, 0.94), pores=False)
g += (band(22, 300, 512) - 0.5) * 18
for i in (0, S // 2):
    g[:, i:i + 4] -= 38; h[:, i:i + 4] -= 0.5
    g[i:i + 4, :] -= 38; h[i:i + 4, :] -= 0.5
# Grietas: caminatas aleatorias.
for _ in range(7):
    x, y = rng.integers(0, S, 2).astype(float); ang = rng.uniform(0, 2 * np.pi)
    for step in range(rng.integers(150, 420)):
        ang += rng.normal(0, 0.25); x = (x + np.cos(ang) * 1.5) % S; y = (y + np.sin(ang) * 1.5) % S
        xi, yi = int(x), int(y)
        g[yi, xi] -= 45; h[yi, xi] -= 0.8
        g[(yi + 1) % S, xi] -= 20
wet = np.clip((fbm(2.8, 24) - 0.58) * 4, 0, 1)
oil = np.clip((fbm(3.0, 25) - 0.7) * 5, 0, 1)
g = g - wet * 32 - oil * 40
floor_rough = np.clip(0.72 - wet * 0.62 - oil * 0.3 + (band(26, 100, 400) - 0.5) * 0.12, 0.04, 1)
save('floor_color.jpg', rgb(g, (1.0, 0.98, 0.94)))
save('floor_normal.jpg', normal_from_height(h, 6))
save('floor_rough.jpg', (floor_rough * 255).astype(np.uint8))

# ---------- Techo: losa de concreto con manchas de goteras ----------
g, h = concrete(31, 96, (1.0, 0.99, 0.97))
leak = np.clip((fbm(2.4, 32) - 0.55) * 3, 0, 1)
g -= leak * 40
g[:, 0:5] -= 40; h[:, 0:5] -= 0.6
save('ceil_color.jpg', rgb(g, (1.0, 0.97, 0.9)))
save('ceil_normal.jpg', normal_from_height(h, 7))
save('ceil_rough.jpg', (np.clip(0.9 - leak * 0.4, 0, 1) * 255).astype(np.uint8))
print('ok')
