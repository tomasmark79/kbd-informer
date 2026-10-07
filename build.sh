#!/usr/bin/env bash
# Copyright (C) 2025–2026 Tomáš Mark
# SPDX-License-Identifier: GPL-3.0-or-later
set -euo pipefail
cd -- "$(dirname -- "${BASH_SOURCE[0]}")"

# Add only extension-specific runtime directories or files here.
extra_sources=()
# For existing projects, preserve the contents of the previous distribution ZIP.
package_license=false
package_compiled_schemas=false
install_extension=false
check_only=false
reference_zip=''
while (( $# )); do
    argument=$1
    case "$argument" in
        -b|--build|-r|--release) ;;
        -i|--install|-bi|-ri) install_extension=true ;;
        --check) check_only=true ;;
        --compare-zip)
            (( $# >= 2 )) || { echo 'Missing path after --compare-zip.' >&2; exit 1; }
            reference_zip=$2
            [[ -f "$reference_zip" ]] || { echo "Reference ZIP does not exist: $reference_zip" >&2; exit 1; }
            shift ;;
        -h|--help)
            echo 'Usage: ./build.sh [-b|-r] [-i|--install] [--check] [--compare-zip path]'
            echo 'With no options, validate sources and create dist/<uuid>.zip.'
            echo '-i always builds the current sources and installs the ZIP; --check only validates.'
            echo '--compare-zip checks file paths and contents before any requested installation.'
            exit 0 ;;
        *) echo "Unknown option: $argument" >&2; exit 1 ;;
    esac
    shift
done
if "$check_only" && [[ -n "$reference_zip" ]]; then
    echo '--compare-zip requires a build and cannot be combined with --check.' >&2; exit 1
fi
if "$check_only" && "$install_extension"; then
    echo '--check cannot be combined with --install.' >&2; exit 1
fi
for tool in python3 node; do
    command -v "$tool" >/dev/null || { echo "Missing command: $tool" >&2; exit 1; }
done
[[ -f extension.js ]] || { echo 'Missing extension.js. Use this build.sh inside an extension project.' >&2; exit 1; }
python3 - <<'PY'
import json
from pathlib import Path
import re
import xml.etree.ElementTree as ET
m = json.loads(Path('metadata.json').read_text())
for key in ('uuid', 'name', 'description', 'shell-version', 'url'):
    if not m.get(key):
        raise SystemExit(f'Missing metadata field: {key}')
if not isinstance(m['uuid'], str) or not re.fullmatch(r'[A-Za-z0-9_.-]+@[A-Za-z0-9_.-]+', m['uuid']):
    raise SystemExit('Invalid UUID.')
for key in ('name', 'description', 'url'):
    if not isinstance(m[key], str) or not m[key].strip():
        raise SystemExit(f'Metadata field {key} must be a non-empty string.')
from urllib.parse import urlsplit
url = urlsplit(m['url'])
if url.scheme not in ('https', 'http') or not url.netloc:
    raise SystemExit('The project URL must be a valid HTTP(S) URL.')
if m['uuid'].split('@')[1] == 'gnome.org':
    raise SystemExit('The gnome.org namespace requires explicit permission from the GNOME Foundation.')
if not isinstance(m['shell-version'], list) or not all(isinstance(v, str) and v.isdigit() for v in m['shell-version']):
    raise SystemExit('shell-version must be a list of version number strings.')
schema_ids = set()
for filename in Path('schemas').glob('*.gschema.xml'):
    for schema in ET.parse(filename).getroot().findall('schema'):
        schema_id = schema.get('id', '')
        if not schema_id.startswith('org.gnome.shell.extensions.'):
            raise SystemExit(f'Invalid schema ID prefix: {schema_id}')
        if filename.name != f'{schema_id}.gschema.xml':
            raise SystemExit(f'The XML filename does not match the schema ID: {filename}')
        path = schema.get('path')
        if path is not None and not path.startswith('/org/gnome/shell/extensions/'):
            raise SystemExit(f'Invalid schema path prefix: {filename}')
        schema_ids.add(schema_id)
if schema_id := m.get('settings-schema'):
    if schema_id not in schema_ids:
        raise SystemExit('settings-schema has no matching XML schema.')
if 'version' in m and (type(m['version']) is not int or m['version'] < 1):
    raise SystemExit('version must be a positive integer; extensions.gnome.org manages it for GNOME distribution.')
if list(Path('po').glob('*.po')):
    domain = m.get('gettext-domain', '')
    if not isinstance(domain, str) or not re.fullmatch(r'[A-Za-z0-9_.@+-]+', domain):
        raise SystemExit('Translations require a valid gettext-domain in metadata.')
PY
shopt -s nullglob
sources=(*.js)
schemas=(schemas/*.gschema.xml)
translations=(po/*.po)
for source in "${sources[@]}"; do
    node --input-type=module --check < "$source"
done
if (( ${#schemas[@]} )); then
    command -v glib-compile-schemas >/dev/null || { echo 'Missing glib-compile-schemas.' >&2; exit 1; }
    glib-compile-schemas --strict --dry-run schemas
fi
if (( ${#translations[@]} )); then
    command -v msgfmt >/dev/null || { echo 'Missing msgfmt.' >&2; exit 1; }
    for translation in "${translations[@]}"; do msgfmt --check --output-file=/dev/null "$translation"; done
fi
if "$check_only"; then echo 'Validation passed.'; exit 0; fi
command -v zip >/dev/null || { echo 'Missing zip.' >&2; exit 1; }
if "$install_extension"; then
    command -v gnome-extensions >/dev/null || { echo 'Missing gnome-extensions.' >&2; exit 1; }
fi
uuid=$(python3 -c 'import json; print(json.load(open("metadata.json"))["uuid"])')
stage=$(mktemp -d)
trap 'rm -rf -- "$stage"' EXIT
cp -- "${sources[@]}" metadata.json "$stage/"
for optional in stylesheet.css; do
    if [[ -f "$optional" ]]; then cp -- "$optional" "$stage/"; fi
done
if "$package_license" && [[ -f LICENSE ]]; then cp -- LICENSE "$stage/"; fi
for resource in "${extra_sources[@]}"; do
    cp -R -- "$resource" "$stage/"
done
if (( ${#schemas[@]} )); then
    mkdir "$stage/schemas"
    cp -- "${schemas[@]}" "$stage/schemas/"
    glib-compile-schemas --strict "$stage/schemas"
    if ! "$package_compiled_schemas"; then rm -- "$stage/schemas/gschemas.compiled"; fi
fi
if (( ${#translations[@]} )); then
    domain=$(python3 -c 'import json; print(json.load(open("metadata.json"))["gettext-domain"])')
    for translation in "${translations[@]}"; do
        language=$(basename -- "$translation" .po)
        destination="$stage/locale/$language/LC_MESSAGES"
        mkdir -p "$destination"
        msgfmt --check --output-file="$destination/$domain.mo" "$translation"
    done
fi
mkdir -p dist
(cd "$stage" && zip -qr extension.zip .)
mv -- "$stage/extension.zip" "dist/$uuid.zip"
echo "Built: $PWD/dist/$uuid.zip"
if [[ -n "$reference_zip" ]]; then
    python3 - "$reference_zip" "dist/$uuid.zip" <<'PYCOMPARE'
import sys
import zipfile

def contents(path):
    with zipfile.ZipFile(path) as archive:
        files = [item.filename for item in archive.infolist() if not item.is_dir()]
        if len(files) != len(set(files)):
            raise SystemExit(f'Duplicate files in ZIP: {path}')
        return {name: archive.read(name) for name in files}

old, new = map(contents, sys.argv[1:])
added = sorted(new.keys() - old.keys())
removed = sorted(old.keys() - new.keys())
changed = sorted(name for name in old.keys() & new.keys() if old[name] != new[name])
for label, names in [('Added', added), ('Removed', removed), ('Changed', changed)]:
    if names:
        print(f'{label}: {", ".join(names)}', file=sys.stderr)
if added or removed or changed:
    raise SystemExit('ZIP contents differ; installation was not performed.')
print(f'MATCH: all {len(old)} files have the same paths and contents as the reference ZIP.')
PYCOMPARE
fi
if "$install_extension"; then
    gnome-extensions install --force "dist/$uuid.zip"
    echo "Installed: $uuid"
    echo "After a fresh login, enable with: gnome-extensions enable $uuid"
fi
