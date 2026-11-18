"""Emit the deployed producer's pinned Unicode category-C ranges; no bridge I/O.

Usage: python3 desktop/scripts/generate-bridge-producer-unicode.py >
 desktop/src/features/messages/lib/bridgeProducerUnicodeC.json
"""
import json
import unicodedata

if unicodedata.unidata_version != '15.0.0':
    raise SystemExit('Use Unicode 15.0.0, matching the observed producer; do not silently upgrade')
ranges = []
start = None
for codepoint in range(0x110000):
    excluded = unicodedata.category(chr(codepoint)).startswith('C')
    if excluded and start is None:
        start = codepoint
    elif not excluded and start is not None:
        ranges.append([start, codepoint - 1])
        start = None
if start is not None:
    ranges.append([start, 0x10FFFF])
print(json.dumps({'unicodeVersion': unicodedata.unidata_version,
                  'category': 'C', 'ranges': ranges}, separators=(',', ':')))
