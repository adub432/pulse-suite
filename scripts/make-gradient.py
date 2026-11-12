# Regenerate /tmp/pulse-test/gradient.png — 320x240 test photo with real content
# (gradient + shapes, so depth/glitch/cook have something to work on).
from PIL import Image, ImageDraw
import math

W, H = 320, 240
img = Image.new('RGB', (W, H))
px = img.load()
for y in range(H):
    for x in range(W):
        r = int(20 + 200 * (x / W) + 40 * math.sin(y / 30))
        g = int(30 + 120 * (y / H))
        b = int(120 + 120 * (1 - x / W) + 60 * math.sin(x / 40))
        px[x, y] = (max(0, min(255, r)), max(0, min(255, g)), max(0, min(255, b)))
d = ImageDraw.Draw(img)
d.ellipse([200, 40, 290, 130], fill=(255, 220, 90))       # bright sun (near)
d.rectangle([30, 150, 130, 210], fill=(30, 200, 120))     # green block
d.polygon([(150, 200), (190, 120), (230, 200)], fill=(200, 60, 140))  # magenta triangle
d.ellipse([60, 30, 110, 80], fill=(240, 240, 240))        # white circle
img.save('/tmp/pulse-test/gradient.png')
print('gradient.png written')
