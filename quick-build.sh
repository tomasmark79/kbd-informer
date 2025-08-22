#!/bin/bash

# Quick release builder for GNOME Shell Extension
# Simple version without extensive validation

set -e

EXTENSION_UUID="kbd-informer@digitalspace.name"
ZIP_NAME="${EXTENSION_UUID}.zip"

echo "Building release zip for $EXTENSION_UUID..."

# Remove old zip
rm -f "$ZIP_NAME"

# Compile schemas if present
if [[ -d "schemas" ]]; then
    echo "Compiling schemas..."
    glib-compile-schemas schemas/
fi

# Create zip with required files
echo "Creating zip file..."
zip -r "$ZIP_NAME" \
    extension.js \
    metadata.json \
    prefs.js \
    stylesheet.css \
    schemas/ \
    -x "schemas/.git*" -x ".git*" -x "*.po" -x "*.pot" \
    > /dev/null

echo "✓ Release zip created: $ZIP_NAME ($(du -h "$ZIP_NAME" | cut -f1))"
echo "Ready for submission to extensions.gnome.org"
