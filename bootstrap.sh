#!/bin/bash

# Keyboard Informer Extension Bootstrap Script
# Sets up development environment and installs the extension

set -e  # Exit on any error

EXTENSION_DIR="$(dirname "$0")"
EXTENSION_UUID="kbd-informer@digitalspace.name"
INSTALL_DIR="$HOME/.local/share/gnome-shell/extensions/$EXTENSION_UUID"

echo "🚀 Keyboard Informer Extension Bootstrap"
echo "========================================"

# Check GNOME Shell version
echo "📋 Checking GNOME Shell version..."
GNOME_VERSION=$(gnome-shell --version 2>/dev/null || echo "Unknown")
echo "   GNOME Shell: $GNOME_VERSION"

# Check if we're in the right directory
if [ ! -f "$EXTENSION_DIR/metadata.json" ]; then
    echo "❌ Error: metadata.json not found. Run this script from the extension directory."
    exit 1
fi

# Enable accessibility indicator (useful for testing)
echo "🔧 Enabling accessibility indicator..."
dconf write /org/gnome/desktop/a11y/always-show-universal-access-status true

# Install development dependencies
echo "📦 Installing development dependencies..."
if command -v dnf >/dev/null 2>&1; then
    sudo dnf install -y git make glib2-devel
elif command -v apt >/dev/null 2>&1; then
    sudo apt update
    sudo apt install -y git make glib2.0-dev
elif command -v pacman >/dev/null 2>&1; then
    sudo pacman -S --noconfirm git make glib2
elif command -v zypper >/dev/null 2>&1; then
    sudo zypper install -y git make glib2-devel
else
    echo "⚠️  Warning: Unknown package manager. Please install git, make, and glib2-dev manually."
fi

# Compile GSettings schema
echo "🔨 Compiling GSettings schema..."
cd "$EXTENSION_DIR/schemas"
glib-compile-schemas .
cd "$EXTENSION_DIR"

# Create installation directory
echo "📁 Setting up installation directory..."
mkdir -p "$(dirname "$INSTALL_DIR")"

# Install extension
echo "🔄 Installing extension..."
if [ "$EXTENSION_DIR" != "$INSTALL_DIR" ]; then
    # Copy if not already in the target location
    cp -r "$EXTENSION_DIR" "$INSTALL_DIR"
    echo "   Extension copied to: $INSTALL_DIR"
else
    echo "   Extension already in correct location: $INSTALL_DIR"
fi

# Check if extension is already enabled
if gnome-extensions list --enabled | grep -q "$EXTENSION_UUID"; then
    echo "🔄 Extension already enabled, reloading..."
    gnome-extensions disable "$EXTENSION_UUID" || true
    sleep 1
    gnome-extensions enable "$EXTENSION_UUID"
else
    echo "✅ Enabling extension..."
    gnome-extensions enable "$EXTENSION_UUID"
fi

# Check if running on Wayland
if [ "$XDG_SESSION_TYPE" = "wayland" ]; then
    echo "💡 Running on Wayland - you may need to log out and log back in for changes to take effect."
else
    echo "🔄 Restarting GNOME Shell (X11)..."
    # Try to restart GNOME Shell on X11
    if command -v busctl >/dev/null 2>&1; then
        busctl --user call org.gnome.Shell /org/gnome/Shell org.gnome.Shell Eval s 'Meta.restart("Restarting…")' || echo "⚠️  Could not restart GNOME Shell automatically"
    fi
fi

echo ""
echo "✅ Bootstrap completed successfully!"
echo ""
echo "📋 Next steps:"
echo "   • Open GNOME Extensions app to configure the extension"
echo "   • Or run: gnome-extensions prefs $EXTENSION_UUID"
echo "   • Check logs with: journalctl -f -o cat /usr/bin/gnome-shell"
echo ""
echo "🛠️  Development commands:"
echo "   • Disable: gnome-extensions disable $EXTENSION_UUID"
echo "   • Enable:  gnome-extensions enable $EXTENSION_UUID"
echo "   • Logs:    journalctl -f -o cat /usr/bin/gnome-shell | grep KMS-Ext"
