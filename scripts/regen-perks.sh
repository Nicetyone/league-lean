#!/usr/bin/env bash
# Regenerate lib/perk-data.js from CommunityDragon's current perks.json.
# Run this when a patch reshuffles rune IDs and your icons start showing as
# numbers, or when rune apply starts failing because new keystones got added.
#
#   bash scripts/regen-perks.sh

set -euo pipefail
cd "$(dirname "$0")/.."

URL="https://raw.communitydragon.org/latest/plugins/rcp-be-lol-game-data/global/default/v1/perks.json"
echo "Fetching $URL ..."
curl -sL "$URL" -o /tmp/perks.json

python3 - <<'PYEOF' > lib/perk-data.js
import json, re
d = json.load(open('/tmp/perks.json'))

# Map style name → numeric style id. These are stable.
STYLE_NAME_TO_ID = {
    "Precision":   8000,
    "Domination":  8100,
    "Sorcery":     8200,
    "Inspiration": 8300,
    "Resolve":     8400,
}

print("// Auto-generated from CommunityDragon perks.json. Static so it can never")
print("// fail at runtime. Re-run scripts/regen-perks.sh after a perk shake-up.")
print()
print("// id → icon URL (LCU local path).")
print("export const PERK_ICONS = {")
for e in sorted(d, key=lambda x: x['id']):
    icon = e.get('iconPath', '')
    if icon:
        print(f'  {e["id"]}: "{icon}",')
print("};")

print()
print("// id → owning rune-tree (style) id. Derived from /Styles/<TreeName>/ in the")
print("// icon path. Critical for rune-page apply: LCU rejects pages where the")
print("// primary perk's tree doesn't match `primaryStyleId`.")
print("export const PERK_TREE = {")
for e in sorted(d, key=lambda x: x['id']):
    icon = e.get('iconPath', '')
    pid = e['id']
    if pid >= 5000 and pid < 6000:
        # Stat shards — not part of any tree, skip.
        continue
    m = re.search(r'/Styles/([^/]+)/', icon or '')
    tree_name = m.group(1) if m else None
    tree_id = STYLE_NAME_TO_ID.get(tree_name)
    if tree_id is not None:
        print(f'  {pid}: {tree_id},')
    # else: skip (templates, deprecated, etc.)
print("};")
PYEOF

echo "Wrote lib/perk-data.js — $(wc -l < lib/perk-data.js) lines."
