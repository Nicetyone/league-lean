#!/usr/bin/env bash
# Regenerate the bundled asset-id maps (perks, items, summoner spells) from
# CommunityDragon. Run this after a patch reshuffles content.
#
#   bash scripts/regen-assets.sh

set -euo pipefail
cd "$(dirname "$0")/.."

CDB="https://raw.communitydragon.org/latest/plugins/rcp-be-lol-game-data/global/default"

echo "Fetching CDragon manifests..."
curl -sLfo /tmp/perks.json  "$CDB/v1/perks.json"
curl -sLfo /tmp/items.json  "$CDB/v1/items.json"
curl -sLfo /tmp/spells.json "$CDB/v1/summoner-spells.json"

# perks → lib/perk-data.js (ICONS + TREE)
python3 - <<'PYEOF' > lib/perk-data.js
import json, re
d = json.load(open('/tmp/perks.json'))
STYLE_NAME_TO_ID = {
    "Precision":   8000, "Domination":  8100, "Sorcery":     8200,
    "Inspiration": 8300, "Resolve":     8400,
}
print("// Auto-generated from CDragon perks.json. Re-run scripts/regen-assets.sh after a patch.")
print()
print("export const PERK_ICONS = {")
for e in sorted(d, key=lambda x: x['id']):
    icon = e.get('iconPath', '')
    if icon: print(f'  {e["id"]}: "{icon}",')
print("};")
print()
print("export const PERK_TREE = {")
for e in sorted(d, key=lambda x: x['id']):
    icon = e.get('iconPath', '')
    if e['id'] >= 5000 and e['id'] < 6000: continue
    m = re.search(r'/Styles/([^/]+)/', icon or '')
    tree = STYLE_NAME_TO_ID.get(m.group(1) if m else None)
    if tree: print(f'  {e["id"]}: {tree},')
print("};")
PYEOF
echo "  lib/perk-data.js  $(grep -c '^  [0-9]' lib/perk-data.js) entries"

# items → lib/item-data.js
python3 - <<'PYEOF' > lib/item-data.js
import json
d = json.load(open('/tmp/items.json'))
print("// Auto-generated from CDragon items.json. Re-run scripts/regen-assets.sh after a patch.")
print("// Paths lowercased for case-safety; LCU serves either case on Windows.")
print("export const ITEM_ICONS = {")
for it in sorted(d, key=lambda x: x.get('id', 0)):
    icon = it.get('iconPath', '')
    if icon: print(f'  {it["id"]}: "{icon.lower()}",')
print("};")
PYEOF
echo "  lib/item-data.js  $(grep -c '^  [0-9]' lib/item-data.js) entries"

# summoner spells → lib/spell-data.js
python3 - <<'PYEOF' > lib/spell-data.js
import json
d = json.load(open('/tmp/spells.json'))
print("// Auto-generated from CDragon summoner-spells.json.")
print("export const SPELL_ICONS = {")
for s in sorted(d, key=lambda x: x.get('id', 0)):
    icon = s.get('iconPath', '')
    if icon: print(f'  {s["id"]}: "{icon.lower()}",')
print("};")
PYEOF
echo "  lib/spell-data.js  $(grep -c '^  [0-9]' lib/spell-data.js) entries"

echo "Done."
