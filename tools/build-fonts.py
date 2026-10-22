# Subset the two typefaces to what Spanish and English text needs, so the first frame can show the
# real handwriting (the files are small enough to preload). Outputs are committed to public/fonts/.
# Run: python -I tools/build-fonts.py   (needs fontTools; woff2 needs brotli:
#      python -m pip install --target data/cache/pylib brotli   — keeps it on D:, out of C:)
# Sources: the Fontsource packages in node_modules (OFL-1.1); the subsets keep their name table,
# so the copyright and licence travel inside each file; the full licences are in LICENSES/.
import os
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
for extra in ('data/cache/pylib', 'data/cache/media/pylib'):
    p = os.path.join(ROOT, extra)
    if os.path.isdir(p):
        sys.path.insert(0, p)

from fontTools import subset  # noqa: E402
from fontTools.ttLib import TTFont  # noqa: E402
from fontTools.varLib import instancer  # noqa: E402

# Basic latin + latin-1 (á é í ó ú ñ ü ¿ ¡ « » ·), general punctuation (– — ‘ ’ “ ” … •),
# the euro and minus signs, and the check mark used in the item card.
UNICODES = [*range(0x20, 0x7F), *range(0xA0, 0x100), *range(0x2010, 0x2028), *range(0x2030, 0x203B), 0x20AC, 0x2212, 0x2713]

# (source, output, fixed weight or None to keep the variable axis)
# Handwriting is drawn at one weight (520) everywhere, so it ships as a static instance; the print
# face keeps its axis because the interface uses several weights.
FONTS = [
    ('node_modules/@fontsource-variable/caveat/files/caveat-latin-wght-normal.woff2', 'public/fonts/caveat.woff2', 520),
    ('node_modules/@fontsource-variable/atkinson-hyperlegible-next/files/atkinson-hyperlegible-next-latin-wght-normal.woff2', 'public/fonts/atkinson.woff2', None),
]

os.makedirs(os.path.join(ROOT, 'public/fonts'), exist_ok=True)
for src, dst, weight in FONTS:
    font = TTFont(os.path.join(ROOT, src))
    if weight:
        font = instancer.instantiateVariableFont(font, {'wght': weight}, updateFontNames=False)
    opts = subset.Options()
    opts.flavor = 'woff2'
    opts.layout_features = ['*']  # keep Caveat's contextual alternates: they make it look written
    opts.name_IDs = ['*']
    opts.name_languages = ['*']
    opts.notdef_outline = True
    opts.hinting = False
    opts.desubroutinize = True
    sub = subset.Subsetter(opts)
    sub.populate(unicodes=UNICODES)
    sub.subset(font)
    out = os.path.join(ROOT, dst)
    font.flavor = 'woff2'
    font.save(out)
    print(f'{dst}: {os.path.getsize(os.path.join(ROOT, src))} -> {os.path.getsize(out)} bytes')
