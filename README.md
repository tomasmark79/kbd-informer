# Keyboard Informer

Shows active keyboard modifiers in the GNOME top panel and native OSD notifications
when Caps Lock, Num Lock or Scroll Lock changes state. Symbols are configurable;
the indicator can stay at the far left of the status icons. Supports multiple monitors.

![OSD notification](screenshot-osd.png)
![Panel indicator](screenshot-panel.png)

## Requirements

Declared GNOME Shell versions: **45–50**, as listed in `metadata.json`.
Build tools: Bash, Python 3, Node.js (syntax checks), zip and `glib-compile-schemas`.
Local installation also requires `gnome-extensions`.

## Installation

Install from [GNOME Extensions](https://extensions.gnome.org/extension/8500/keyboard-informer/),
or build and install from source:

```bash
git clone https://github.com/tomasmark79/kbd-informer.git
cd kbd-informer
./build.sh --install
```

On Wayland, log out and back in when needed to load changed JavaScript, then enable:

```bash
gnome-extensions enable kbd-informer@digitalspace.name
```

Installation updates the user copy without enabling the extension or logging you out.

## Usage

Modifier states appear in the top panel; lock key changes trigger GNOME OSD notifications.
Configure symbols, indicator visibility and position in Preferences:

```bash
gnome-extensions prefs kbd-informer@digitalspace.name
```

## Development

```bash
./build.sh --check
./build.sh
```

The output is `dist/kbd-informer@digitalspace.name.zip`. `-b` and `-r` are build aliases;
`-i` and `-ri` build the current sources and install them.

To confirm the package matches the existing local reference archive:

```bash
./build.sh --compare-zip kbd-informer@digitalspace.name.zip
```

This checks every file path and its contents, including metadata. ZIP timestamps and
compression may differ. The original archive remains available as the reference.
The package preserves its existing layout without LICENSE or a compiled schema;
the schema is validated during the build and compiled by GNOME during installation.

For runtime changes, verify modifier states, lock key notifications, preferences,
multiple monitors and repeated disable/enable in GNOME. Build checks alone do not
confirm behavior on every declared Shell version.

Report problems in the [issue tracker](https://github.com/tomasmark79/kbd-informer/issues).

## License

Copyright © 2025 Tomáš Mark. [GPL-3.0-or-later](LICENSE).

[GitHub](https://github.com/tomasmark79/kbd-informer) · [Donate via PayPal](https://paypal.me/TomasMark)
