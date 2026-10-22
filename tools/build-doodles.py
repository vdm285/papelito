# The aisle doodles: each aisle's emoji, drawn with Google's monochrome Noto Emoji (SIL OFL 1.1),
# so they look like pencil drawings in the ink of the page instead of colour stickers that differ
# on every phone. Subset to exactly the aisles' emoji; committed to public/fonts/doodles.woff2.
# Items have no doodle since 2026-10-22 (the owner's choice: only some words had one), so the
# per-item emoji the dictionary still carries are left out of the font.
# Run after `npm run dict`: python -I tools/build-doodles.py
# Source font: google/fonts ofl/notoemoji/NotoEmoji[wght].ttf, fetched once into data/cache/fonts/.
import json
import os
import sys
import urllib.request

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
for extra in ('data/cache/pylib', 'data/cache/media/pylib'):
    p = os.path.join(ROOT, extra)
    if os.path.isdir(p):
        sys.path.insert(0, p)

from fontTools import subset  # noqa: E402
from fontTools.ttLib import TTFont  # noqa: E402
from fontTools.varLib import instancer  # noqa: E402

URL = 'https://raw.githubusercontent.com/google/fonts/main/ofl/notoemoji/NotoEmoji%5Bwght%5D.ttf'
CACHE = os.path.join(ROOT, 'data/cache/fonts/NotoEmoji-wght.ttf')
MEDIA = os.path.join(ROOT, 'data/cache/media/dl/fonts/files/noto-emoji__NotoEmoji-wght.ttf')

if not os.path.exists(CACHE):
    os.makedirs(os.path.dirname(CACHE), exist_ok=True)
    if os.path.exists(MEDIA):
        with open(MEDIA, 'rb') as f, open(CACHE, 'wb') as g:
            g.write(f.read())
    else:
        urllib.request.urlretrieve(URL, CACHE)

with open(os.path.join(ROOT, 'public/dict/es-MX.json'), encoding='utf8') as f:
    d = json.load(f)
emoji = set()
for a in d.get('aisles', []):
    if isinstance(a, dict) and a.get('emoji'):
        emoji.add(a['emoji'])

# every code point of every emoji (sequences keep their ZWJ and need the font's ligatures)
cps = {0x200D, 0xFE0E, 0xFE0F}
for e in emoji:
    cps.update(ord(c) for c in e)

font = TTFont(CACHE)
font = instancer.instantiateVariableFont(font, {'wght': 400}, updateFontNames=False)
opts = subset.Options()
opts.flavor = 'woff2'
opts.layout_features = ['*']
opts.name_IDs = ['*']
opts.name_languages = ['*']
opts.hinting = False
sub = subset.Subsetter(opts)
sub.populate(unicodes=sorted(cps))
sub.subset(font)
cmap = font.getBestCmap()
missing = sorted(e for e in emoji if any(ord(c) not in cmap for c in e if ord(c) not in (0x200D, 0xFE0E, 0xFE0F)))
out = os.path.join(ROOT, 'public/fonts/doodles.woff2')
font.flavor = 'woff2'
font.save(out)
print(f'{len(emoji)} emoji, {len(cps)} code points -> {out}: {os.path.getsize(out)} bytes')
if missing:
    print('not in Noto Emoji (shown with the phone\'s own emoji):', ' '.join(missing))
