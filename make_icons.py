"""Generate PNG app icons from icon.svg layout."""
import struct, zlib, os

OUT = os.path.dirname(os.path.abspath(__file__))

def png(path, w, h, rgba):
    def chunk(t, d):
        c = t + d
        return c + struct.pack(">I", zlib.crc32(c) & 0xffffffff)
    raw = b""
    for y in range(h):
        raw += b"\x00" + rgba[y * w * 4:(y + 1) * w * 4]
    sig = b"\x89PNG\r\n\x1a\n"
    ihdr = struct.pack(">IIBBBBB", w, h, 8, 6, 0, 0, 0)
    data = sig + chunk(b"IHDR", ihdr) + chunk(b"IDAT", zlib.compress(raw, 9)) + chunk(b"IEND", b"")
    with open(path, "wb") as f:
        f.write(data)

def lerp(a, b, t): return int(a + (b - a) * t)

def make(size):
    radius = int(size * 112 / 512)
    c1 = (29, 158, 117)
    c2 = (15, 110, 86)
    cx = cy = size / 2
    r = size * 150 / 512 / 2
    sw = max(2, int(size * 18 / 512))
    pw = max(3, int(size * 20 / 512))
    px, py = cx, cy - size * 50 / 512
    px2, py2 = cx + size * 40 / 512, cy

    def in_round_rect(x, y):
        if x < radius and y < radius:
            return (x - radius) ** 2 + (y - radius) ** 2 <= radius * radius
        if x > size - radius and y < radius:
            return (x - (size - radius)) ** 2 + (y - radius) ** 2 <= radius * radius
        if x < radius and y > size - radius:
            return (x - radius) ** 2 + (y - (size - radius)) ** 2 <= radius * radius
        if x > size - radius and y > size - radius:
            return (x - (size - radius)) ** 2 + (y - (size - radius)) ** 2 <= radius * radius
        return True

    rgba = bytearray(size * size * 4)
    for y in range(size):
        for x in range(size):
            i = (y * size + x) * 4
            if not in_round_rect(x, y):
                rgba[i:i+4] = b"\x00\x00\x00\x00"
                continue
            t = (x + y) / (2 * size)
            r_, g_, b_ = lerp(c1[0], c2[0], t), lerp(c1[1], c2[1], t), lerp(c1[2], c2[2], t)
            dx, dy = x - cx, y - cy
            dist = (dx * dx + dy * dy) ** 0.5
            on_ring = abs(dist - r) <= sw / 2
            ang_p = (x - cx) * 0 + (y - cy)
            on_hour = (abs(dx) <= pw / 2) and (py <= y <= cy) and False
            on_hour_v = (abs(dx) <= pw / 2) and (cy <= y <= cy + (cy - py2 if False else 0))
            on_min = (abs(dy) <= pw / 2) and (cx <= x <= cx + (py2 - cx))
            draw = False
            if on_ring: draw = True
            if (abs(dx) <= pw / 2) and (py <= y <= cy): draw = True
            if (abs(dy) <= pw / 2) and (cx <= x <= px2): draw = True
            if (dx * dx + dy * dy) <= (size * 14 / 512 / 2) ** 2 + 1: draw = True
            if draw:
                rgba[i:i+4] = bytes([255, 255, 255, 255])
            else:
                rgba[i:i+4] = bytes([r_, g_, b_, 255])
    png(os.path.join(OUT, f"icon-{size}.png"), size, size, bytes(rgba))
    print(f"icon-{size}.png done")

if __name__ == "__main__":
    make(192)
    make(512)
