#!/bin/bash

# GNOME Shell Extension Release Builder
# Creates a zip file ready for submission to extensions.gnome.org
# Copyright (C) 2025 Tomáš Mark

set -e  # Exit on any error

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Script directory (where the extension is located)
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

# Extension info
EXTENSION_UUID="kbd-informer@digitalspace.name"
ZIP_NAME="${EXTENSION_UUID}.zip"

echo -e "${BLUE}GNOME Shell Extension Release Builder${NC}"
echo -e "${BLUE}=====================================${NC}"
echo

# Check if we're in the right directory
if [[ ! -f "metadata.json" || ! -f "extension.js" ]]; then
    echo -e "${RED}Error: metadata.json or extension.js not found!${NC}"
    echo "Make sure you're running this script from the extension directory."
    exit 1
fi

echo -e "${YELLOW}Checking extension files...${NC}"

# Required files check
REQUIRED_FILES=("metadata.json" "extension.js")
OPTIONAL_FILES=("prefs.js" "stylesheet.css" "schemas/")

for file in "${REQUIRED_FILES[@]}"; do
    if [[ ! -f "$file" ]]; then
        echo -e "${RED}Error: Required file '$file' not found!${NC}"
        exit 1
    fi
    echo -e "${GREEN}✓${NC} Found required file: $file"
done

for file in "${OPTIONAL_FILES[@]}"; do
    if [[ -e "$file" ]]; then
        echo -e "${GREEN}✓${NC} Found optional file/directory: $file"
    fi
done

# Validate metadata.json
echo -e "${YELLOW}Validating metadata.json...${NC}"
if ! python3 -m json.tool metadata.json > /dev/null 2>&1; then
    echo -e "${RED}Error: metadata.json is not valid JSON!${NC}"
    exit 1
fi
echo -e "${GREEN}✓${NC} metadata.json is valid JSON"

# Check for required metadata fields
REQUIRED_FIELDS=("uuid" "name" "description" "shell-version" "url")
for field in "${REQUIRED_FIELDS[@]}"; do
    if ! grep -q "\"$field\"" metadata.json; then
        echo -e "${RED}Error: Required field '$field' not found in metadata.json!${NC}"
        exit 1
    fi
    echo -e "${GREEN}✓${NC} Found required field: $field"
done

# Validate and compile GSettings schema if present
if [[ -d "schemas" ]]; then
    echo -e "${YELLOW}Validating and compiling GSettings schemas...${NC}"
    
    # Check for duplicate schema files (common mistake)
    SCHEMA_FILES=($(find . -name "*.gschema.xml" -type f))
    if [[ ${#SCHEMA_FILES[@]} -gt 1 ]]; then
        echo -e "${RED}Error: Multiple schema files found!${NC}"
        echo "Found files:"
        printf '%s\n' "${SCHEMA_FILES[@]}"
        echo "Only one schema file should exist in schemas/ directory"
        exit 1
    fi
    
    # Check if schema file exists
    SCHEMA_FILE="schemas/org.gnome.shell.extensions.kbd-informer.gschema.xml"
    if [[ -f "$SCHEMA_FILE" ]]; then
        echo -e "${GREEN}✓${NC} Found schema file: $SCHEMA_FILE"
        
        # Validate schema XML
        if ! xmllint --noout "$SCHEMA_FILE" 2>/dev/null; then
            echo -e "${RED}Error: Schema XML is not valid!${NC}"
            exit 1
        fi
        echo -e "${GREEN}✓${NC} Schema XML is valid"
        
        # Check schema path compliance
        if grep -q 'path="/org/gnome/shell/extensions/kbd-informer/"' "$SCHEMA_FILE"; then
            echo -e "${GREEN}✓${NC} Schema path is compliant with guidelines"
        else
            echo -e "${RED}Error: Schema path is not compliant!${NC}"
            echo "Expected: path=\"/org/gnome/shell/extensions/kbd-informer/\""
            exit 1
        fi
        
        # Compile schemas
        echo -e "${YELLOW}Compiling GSettings schemas...${NC}"
        if ! glib-compile-schemas schemas/ 2>/dev/null; then
            echo -e "${RED}Error: Failed to compile schemas!${NC}"
            exit 1
        fi
        echo -e "${GREEN}✓${NC} Schemas compiled successfully"
    else
        echo -e "${YELLOW}Warning: No schema file found in schemas/directory${NC}"
    fi
fi

# Remove old zip file if it exists
if [[ -f "$ZIP_NAME" ]]; then
    echo -e "${YELLOW}Removing old zip file...${NC}"
    rm "$ZIP_NAME"
fi

# Create zip file with only required files
echo -e "${YELLOW}Creating release zip file...${NC}"

# Files to include in the zip
FILES_TO_ZIP=()

# Always include required files
FILES_TO_ZIP+=("extension.js" "metadata.json")

# Include optional files if they exist
[[ -f "prefs.js" ]] && FILES_TO_ZIP+=("prefs.js")
[[ -f "stylesheet.css" ]] && FILES_TO_ZIP+=("stylesheet.css")
[[ -d "schemas" ]] && FILES_TO_ZIP+=("schemas/")

# Create the zip
if zip -r "$ZIP_NAME" "${FILES_TO_ZIP[@]}" \
    -x "schemas/.git*" \
    -x ".git*" \
    -x "*.po" \
    -x "*.pot" \
    -x "build-release.sh" \
    -x "README.md" \
    -x "LICENSE" \
    -x "bootstrap.sh" \
    -x "screenshot*.png" \
    > /dev/null 2>&1; then
    
    echo -e "${GREEN}✓${NC} Zip file created successfully: $ZIP_NAME"
else
    echo -e "${RED}Error: Failed to create zip file!${NC}"
    exit 1
fi

# Show zip contents
echo -e "${YELLOW}Zip file contents:${NC}"
unzip -l "$ZIP_NAME"

# Show file size
ZIP_SIZE=$(du -h "$ZIP_NAME" | cut -f1)
echo
echo -e "${GREEN}Release zip created successfully!${NC}"
echo -e "${BLUE}File:${NC} $ZIP_NAME"
echo -e "${BLUE}Size:${NC} $ZIP_SIZE"
echo -e "${BLUE}Location:${NC} $(pwd)/$ZIP_NAME"
echo
echo -e "${GREEN}This zip file is ready for submission to extensions.gnome.org${NC}"
