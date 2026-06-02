"""
Generate pixel art assets for Plunder & Peril.
All output: 64×64 PNG with transparency, pixel art style.
"""

from PIL import Image, ImageDraw
import os

OUT = os.path.join(os.path.dirname(__file__), '..', 'src', 'assets')

def save(name, img):
    path = os.path.join(OUT, name)
    img.save(path, 'PNG')
    print(f'  ✓ {name}  ({img.size[0]}×{img.size[1]})')

def px(draw, x, y, color):
    """Set a single pixel."""
    draw.point((x, y), fill=color)

def rect(draw, x1, y1, x2, y2, color):
    """Fill a rectangle."""
    draw.rectangle([x1, y1, x2, y2], fill=color)

# ─────────────────────────────────────────────────────────────────
# 1. ⚓ Porto icon — 64×64, anchor on water
# ─────────────────────────────────────────────────────────────────
def make_port_icon():
    img = Image.new('RGBA', (64, 64), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)

    # Water base
    rect(d, 4, 28, 60, 60, (26, 78, 128, 200))

    # Anchor ring (top circle)
    d.ellipse([22, 8, 42, 28], outline=(200, 170, 80, 255), width=3)

    # Anchor vertical bar
    rect(d, 29, 24, 35, 48, (180, 150, 60, 255))

    # Anchor crossbar
    rect(d, 14, 34, 50, 38, (180, 150, 60, 255))

    # Anchor bottom curve (arc)
    d.arc([18, 36, 46, 56], 180, 0, fill=(180, 150, 60, 255), width=3)

    # Bottom tips
    rect(d, 8, 48, 18, 52, (180, 150, 60, 255))
    rect(d, 46, 48, 56, 52, (180, 150, 60, 255))

    # Gold glow
    d.ellipse([12, 2, 52, 58], outline=(255, 215, 0, 60), width=1)

    return img

# ─────────────────────────────────────────────────────────────────
# 2. Wood UI Button — 128×32, distressed wood
# ─────────────────────────────────────────────────────────────────
def make_wood_button():
    img = Image.new('RGBA', (128, 32), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)

    # Wood base
    colors = [(60, 40, 20), (80, 55, 30), (70, 45, 25), (90, 60, 35)]
    for y in range(32):
        col = colors[y % len(colors)]
        rect(d, 0, y, 127, y + 1, col)

    # Wood grain (horizontal streaks)
    for y in range(3, 30, 6):
        r = 50 + (y * 7) % 40
        g = 35 + (y * 5) % 25
        b = 15 + (y * 3) % 15
        d.line([(4, y), (124, y)], fill=(r, g, b, 60), width=1)

    # Border
    d.rectangle([0, 0, 127, 31], outline=(140, 100, 50, 200), width=2)

    # Inner highlight (top edge)
    d.line([(2, 1), (125, 1)], fill=(160, 120, 70, 100))
    # Shadow (bottom edge)
    d.line([(2, 30), (125, 30)], fill=(30, 20, 10, 100))

    # Corner rivets
    for rx, ry in [(4, 4), (124, 4), (4, 28), (124, 28)]:
        d.ellipse([rx - 2, ry - 2, rx + 2, ry + 2], fill=(160, 130, 60, 200))

    return img

# ─────────────────────────────────────────────────────────────────
# 3. Reef sprite — 64×64, coral reef
# ─────────────────────────────────────────────────────────────────
def make_reef():
    img = Image.new('RGBA', (64, 64), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)

    # Sandy base
    rect(d, 8, 40, 56, 60, (160, 140, 80, 180))

    # Coral branches
    def coral(cx, cy, color, size):
        # Main stalk
        rect(d, cx - 2, cy - size, cx + 2, cy, color)
        # Branches
        rect(d, cx - 6, cy - size + 4, cx - 2, cy - size + 7, color)
        rect(d, cx + 2, cy - size + 2, cx + 6, cy - size + 5, color)
        # Top blob
        d.ellipse([cx - 4, cy - size - 4, cx + 4, cy - size + 2], fill=color)

    # Coral 1 — orange
    coral(18, 50, (200, 120, 50, 220), 16)
    # Coral 2 — pink
    coral(30, 52, (200, 100, 120, 200), 12)
    # Coral 3 — yellow
    coral(40, 48, (180, 160, 60, 200), 14)
    # Coral 4 — small red
    coral(50, 50, (180, 60, 60, 180), 10)

    # Seaweed
    for sx, sc in [(12, (40, 120, 60)), (48, (50, 100, 50))]:
        d.arc([sx - 2, 36, sx + 2, 58], 180, 0, fill=(*sc, 150), width=2)

    # Water surface shimmer
    d.ellipse([4, 4, 60, 44], outline=(100, 180, 220, 40), width=1)

    return img

# ─────────────────────────────────────────────────────────────────
# 4. Player/AI team indicator — small pennant/flag icons
#    (Used as overlay on ships to show ownership at a glance)
# ─────────────────────────────────────────────────────────────────
def make_team_pennant(color, label):
    """32×16 pixel art team pennant."""
    img = Image.new('RGBA', (32, 16), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)

    if color == 'blue':
        # Player — blue pennant
        cols = [(40, 100, 200), (60, 130, 230), (80, 160, 255)]
        tip = (255, 215, 0)  # gold tip
    else:
        # AI — red pennant
        cols = [(200, 40, 40), (230, 60, 60), (255, 80, 80)]
        tip = (80, 80, 80)  # dark tip

    # Flag body
    for x in range(4, 30):
        i = min(x - 4, len(cols) - 1)
        d.line([(x, 2), (x, 13)], fill=(*cols[i % len(cols)], 220))

    # Pole
    rect(d, 2, 1, 4, 15, (140, 120, 80, 220))

    # Gold tip on player flag
    d.point((3, 1), fill=(*tip, 220))

    # Wave effect — offset rows
    offsets = [0, -1, 0, 1, 0, -1, 0, 1]
    for i, off in enumerate(offsets):
        if 4 + i * 3 < 30:
            d.line([(4 + i * 3, 2 + off), (4 + i * 3, 13 + off)],
                   fill=(*cols[i % len(cols)], 100))

    return img

# ─────────────────────────────────────────────────────────────────
# Generate all assets
# ─────────────────────────────────────────────────────────────────
print('Generating pixel art assets...\n')

print('1. ⚓ Porto icon')
port_icon = make_port_icon()
save('port_icon.png', port_icon)

print('2. 🪵 Wood button')
wood_btn = make_wood_button()
save('wood_button.png', wood_btn)

print('3. 🪸 Reef sprite')
reef = make_reef()
save('reef.png', reef)

print('4. 🚩 Team pennants')
player_pennant = make_team_pennant('blue', 'player')
save('pennant_player.png', player_pennant)
ai_pennant = make_team_pennant('red', 'ai')
save('pennant_ai.png', ai_pennant)

print('\n✨ Done! 5 assets generated.')
