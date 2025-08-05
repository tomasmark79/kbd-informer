
# Keyboard Informer

A GNOME Shell extension that displays the status of keyboard modifier keys in the top panel and shows notifications when lock keys change state.

![GNOME Shell](https://img.shields.io/badge/GNOME%20Shell-45%2B-blue)
![License](https://img.shields.io/badge/License-GPL%20v3-green)

## Features

- **Panel Indicator**: Shows active modifier keys in the top panel using customizable symbols
- **Lock Key Notifications**: Displays OSD notifications when Caps Lock, Num Lock, or Scroll Lock state changes
- **Customizable Symbols**: Configure symbols for all modifier keys (Shift, Ctrl, Alt, Super, etc.)
- **Multi-monitor Support**: OSD notifications appear on all connected monitors
- **Lightweight**: Minimal performance impact with efficient state tracking

## Screenshots

*Panel indicator showing active modifiers:*

![Panel Indicator](screenshot-panel.png)

*OSD notification for lock key changes:*

![OSD Notification](screenshot-osd.png)

## Installation

### From GNOME Extensions Website
1. Visit [extensions.gnome.org](https://extensions.gnome.org/)
2. Search for "Keyboard Informer"
3. Click the toggle to install and enable

### Manual Installation
1. Download or clone this repository
2. Copy the extension folder to your extensions directory:
   ```bash
   cp -r kbd-informer@digitalspace.name ~/.local/share/gnome-shell/extensions/
   ```
3. Compile the GSettings schema:
   ```bash
   cd ~/.local/share/gnome-shell/extensions/kbd-informer@digitalspace.name/schemas
   glib-compile-schemas .
   ```
4. Restart GNOME Shell:
   - On Wayland: Log out and log back in
   - On X11: Press `Alt+F2`, type `r`, and press Enter
5. Enable the extension using GNOME Extensions app or command line:
   ```bash
   gnome-extensions enable kbd-informer@digitalspace.name
   ```

## Configuration

Open the extension preferences to customize:

- **Modifier Symbols**: Set custom symbols for each modifier key
- **Reset to Defaults**: Restore PC-style default symbols
- **Save Custom Settings**: Save your current symbol configuration

### Default Symbols (PC Style)
- Shift: `⇧`
- Caps Lock: `Caps Lock `
- Control: `⌃`
- Alt: `⎇`
- Num Lock: `Num Lock`
- Scroll Lock: `⇳`
- Super (Windows): `❖`
- AltGr: `⎈`

## Usage

### Panel Indicator
The extension automatically displays active modifier keys in the top panel. When you press and hold modifier keys, their symbols appear in the panel.

### Lock Key Notifications
When you toggle Caps Lock, Num Lock, or Scroll Lock, an OSD notification briefly appears showing the current state (On/Off).

## Customization

### Modifying OSD Appearance
You can customize the OSD notifications by editing the constants in `extension.js`:

```javascript
const OSD_HIDE_TIMEOUT_MS = 1500;  // How long OSD stays visible
const OSD_FADE_TIME_MS = 100;      // Fade animation duration
const SHOW_OSD_ICON = true;        // Show keyboard icon in OSD
```

### Panel Styling
The panel indicator uses CSS classes that can be customized in `stylesheet.css`:

```css
.panel-button .state-label {
    font-family: inherit;
    font-size: inherit;
    padding: 0 6px;
}
```

## Compatibility

- **GNOME Shell**: 45, 46, 47, 48
- **Operating Systems**: Linux distributions with GNOME Shell
- **Wayland/X11**: Both display protocols supported

## Development

### Building from Source
```bash
git clone https://github.com/tomasmark79/kbd-informer.git
cd kbd-informer
```

### Project Structure
```
kbd-informer@digitalspace.name/
├── extension.js           # Main extension code
├── prefs.js              # Preferences UI
├── metadata.json         # Extension metadata
├── stylesheet.css        # Custom styles
├── schemas/
│   └── org.gnome.shell.extensions.kbd-informer.gschema.xml
└── README.md
```

### Key Components
- **ModifierStateTracker**: Tracks keyboard modifier states
- **SettingsManager**: Handles extension preferences
- **PanelIndicator**: Manages the top panel display
- **ModifiersOSD**: Creates on-screen notifications
- **InputDeviceManager**: Interfaces with the input system

## Contributing

1. Fork the repository
2. Create a feature branch: `git checkout -b feature-name`
3. Make your changes
4. Test with your GNOME Shell version
5. Submit a pull request

### Reporting Issues
Please include:
- GNOME Shell version
- Extension version
- Steps to reproduce
- Any error messages from logs

## License

This project is licensed under the GNU General Public License v3.0 - see the [LICENSE](LICENSE) file for details.

## Changelog

### Version 1.0.0
- Initial release
- Panel indicator for active modifiers
- OSD notifications for lock keys
- Customizable modifier symbols
- Multi-monitor support

## Author

**Tomáš Mark** - *Initial work*

 - partially inspired by sneetsher/keyboard_modifiers_status

## Acknowledgments

- GNOME Shell developers for the extension APIs
- Community feedback and testing
- Icon design inspired by GNOME's design guidelines

---

*For support, please visit the [GitHub Issues](https://github.com/tomasmark79/kbd-informer/issues) page.*
