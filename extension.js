/* 
Copyright (C) 2025 Tomáš Mark

This program is free software: you can redistribute it and/or modify
it under the terms of the GNU General Public License as published by
the Free Software Foundation, either version 3 of the License, or
(at your option) any later version.

This program is distributed in the hope that it will be useful,
but WITHOUT ANY WARRANTY; without even the implied warranty of
MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
GNU General Public License for more details.

You should have received a copy of the GNU General Public License
along with this program.  If not, see <http://www.gnu.org/licenses/>.
*/

import St from 'gi://St';
import Clutter from 'gi://Clutter';
import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import * as Config from 'resource:///org/gnome/shell/misc/config.js';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import { Extension } from 'resource:///org/gnome/shell/extensions/extension.js';

const LOG_TAG = 'KMS-Ext:';
const UPDATE_INTERVAL_MS = 200;

console.debug(`${LOG_TAG} Shell version: ${Config.PACKAGE_VERSION}`);

const MODIFIER_MASKS = {
    SHIFT: Clutter.ModifierType.SHIFT_MASK,
    LOCK: Clutter.ModifierType.LOCK_MASK,
    CONTROL: Clutter.ModifierType.CONTROL_MASK,
    MOD1: Clutter.ModifierType.MOD1_MASK,
    MOD2: Clutter.ModifierType.MOD2_MASK,
    MOD3: Clutter.ModifierType.MOD3_MASK,
    MOD4: Clutter.ModifierType.MOD4_MASK,
    MOD5: Clutter.ModifierType.MOD5_MASK,
};

class ModifierStateTracker {
    constructor() {
        this.reset();
    }

    reset() {
        this.currentState = 0;
        this.previousState = null;
    }

    updateState(newState) {
        this.previousState = this.currentState;
        this.currentState = newState;
    }

    hasStateChanged() {
        return this.currentState !== this.previousState;
    }

    isModifierActive(mask) {
        return (this.currentState & mask) !== 0;
    }

    getModifierChangeInfo(mask) {
        if (this.previousState === null) return null;

        const wasActive = (this.previousState & mask) !== 0;
        const isActive = (this.currentState & mask) !== 0;

        if (wasActive !== isActive) {
            return { wasActive, isActive };
        }
        return null;
    }
}

class SettingsManager {
    constructor(extension) {
        this._extension = extension;
        this._settings = null;
        this._settingsChangedId = null;
        this.symbols = {
            modifiers: []
        };
        this.showPanelIndicator = true;
        this.showOsdNotifications = true;
        this.keepIndicatorLeftmost = false;
    }

    initialize() {
        this._settings = this._extension.getSettings();
        this.loadSettings();

        this._settingsChangedId = this._settings.connect('changed', () => {
            this.loadSettings();
            // Notify extension of settings change
            if (this.onSettingsChanged) {
                this.onSettingsChanged();
            }
        });
    }

    loadSettings() {
        if (!this._settings) {
            console.warn(`${LOG_TAG} Settings object is null`);
            return;
        }

        this.showPanelIndicator = this._settings.get_boolean('show-panel-indicator');
        this.showOsdNotifications = this._settings.get_boolean('show-osd-notifications');
        this.keepIndicatorLeftmost = this._settings.get_boolean('keep-indicator-leftmost');
        this.symbols.modifiers = [
            [MODIFIER_MASKS.LOCK, this._settings.get_string('caps-symbol')],
            [MODIFIER_MASKS.SHIFT, this._settings.get_string('shift-symbol')],
            [MODIFIER_MASKS.CONTROL, this._settings.get_string('control-symbol')],
            [MODIFIER_MASKS.MOD4, this._settings.get_string('super-symbol')],
            [MODIFIER_MASKS.MOD1, this._settings.get_string('alt-symbol')],
            [MODIFIER_MASKS.MOD5, this._settings.get_string('altgr-symbol')],
            [MODIFIER_MASKS.MOD3, this._settings.get_string('scroll-symbol')],
            [MODIFIER_MASKS.MOD2, this._settings.get_string('num-symbol')],
        ];
    }

    destroy() {
        if (this._settings && this._settingsChangedId) {
            this._settings.disconnect(this._settingsChangedId);
            this._settingsChangedId = null;
        }
        this._settings = null;
    }
}

class PanelIndicator {
    constructor() {
        this._indicator = null;
        this._itemsBox = null;
        this._symbolsKey = '';
        this._visible = true;
        this._keepLeftmost = false;
    }

    initialize(visible, keepLeftmost) {
        this._visible = visible;
        this._keepLeftmost = keepLeftmost;
        this._indicator = new St.Bin({
            style_class: 'panel-button kbd-indicator',
            reactive: false,
            can_focus: false,
            x_expand: false,
            y_expand: false,
            y_align: Clutter.ActorAlign.CENTER,
            x_align: Clutter.ActorAlign.CENTER,
            track_hover: false
        });

        this._itemsBox = new St.BoxLayout({
            style_class: 'kbd-indicator-items',
            y_align: Clutter.ActorAlign.CENTER,
        });

        this._indicator.set_child(this._itemsBox);
        Main.panel._rightBox.insert_child_at_index(this._indicator, 0);
        this._indicator.visible = this._visible;
        this.ensurePosition();
    }

    setVisible(visible) {
        this._visible = visible;
        if (this._indicator)
            this._indicator.visible = visible;
    }

    setKeepLeftmost(keepLeftmost) {
        this._keepLeftmost = keepLeftmost;
        this.ensurePosition();
    }

    ensurePosition() {
        if (!this._visible || !this._keepLeftmost || !this._indicator)
            return;

        const rightBox = Main.panel._rightBox;
        if (rightBox.get_child_at_index(0) !== this._indicator)
            rightBox.set_child_at_index(this._indicator, 0);
    }

    updateSymbols(symbols) {
        // Keep the symbols current while hidden so they are correct immediately
        // when the panel indicator is enabled again.
        const symbolsKey = JSON.stringify(symbols);
        if (!this._itemsBox || this._symbolsKey === symbolsKey)
            return;

        this._symbolsKey = symbolsKey;
        this._itemsBox.destroy_all_children();

        for (const symbol of symbols.filter(Boolean)) {
            this._itemsBox.add_child(new St.Label({
                style_class: 'panel-status-menu-label state-label kbd-indicator-item',
                text: symbol,
                y_align: Clutter.ActorAlign.CENTER,
                x_align: Clutter.ActorAlign.CENTER,
            }));
        }
    }

    destroy() {
        if (this._indicator) {
            Main.panel._rightBox.remove_child(this._indicator);
            this._indicator.destroy_all_children();
            this._indicator.destroy();
            this._indicator = null;
            this._itemsBox = null;
            this._symbolsKey = '';
        }
    }
}

class InputDeviceManager {
    constructor() {
        this._seat = null;
    }

    initialize() {
        try {
            // Try Clutter 1.24+ API first
            this._seat = Clutter.get_default_backend().get_default_seat();
        } catch (e) {
            // Fallback to older DeviceManager API
            this._seat = Clutter.DeviceManager.get_default();
        }
    }

    getCurrentModifierState() {
        const [x, y, modifiers] = global.get_pointer();
        return typeof modifiers !== 'undefined' ? modifiers : 0;
    }

    destroy() {
        this._seat = null;
    }
}

/**
 * Main extension class
 */
export default class KeyboardModifiersStatusExtension extends Extension {
    constructor(metadata) {
        super(metadata);
        console.debug(`${LOG_TAG} Constructor completed for ${this.metadata.name}`);
    }

    enable() {
        console.debug(`${LOG_TAG} Enabling extension...`);

        this._stateTracker = new ModifierStateTracker();
        this._settingsManager = new SettingsManager(this);
        this._osdIcon = new Gio.ThemedIcon({name: 'input-keyboard-symbolic'});
        this._panelIndicator = new PanelIndicator();
        this._inputManager = new InputDeviceManager();
        this._settingsManager.onSettingsChanged = () => {
            this._stateTracker.previousState = null; // Force refresh
            this._panelIndicator.setVisible(
                this._settingsManager.showPanelIndicator
            );
            this._panelIndicator.setKeepLeftmost(
                this._settingsManager.keepIndicatorLeftmost
            );
        };
        this._settingsManager.initialize();
        this._panelIndicator.initialize(
            this._settingsManager.showPanelIndicator,
            this._settingsManager.keepIndicatorLeftmost
        );
        this._inputManager.initialize();
        this._updateTimeoutId = GLib.timeout_add(
            GLib.PRIORITY_DEFAULT,
            UPDATE_INTERVAL_MS,
            this._onUpdate.bind(this)
        );

        console.debug(`${LOG_TAG} Extension enabled successfully`);
    }

    disable() {
        console.debug(`${LOG_TAG} Disabling extension...`);

        if (this._updateTimeoutId) {
            GLib.source_remove(this._updateTimeoutId);
            this._updateTimeoutId = null;
        }

        [
            this._inputManager,
            this._panelIndicator,
            this._settingsManager
        ].forEach(component => {
            if (component) {
                component.destroy();
            }
        });


        this._stateTracker = null;
        this._settingsManager = null;
        // Shell owns the shared OSD and its hide timer; leave it to expire.
        this._osdIcon = null;
        this._panelIndicator = null;
        this._inputManager = null;

        console.debug(`${LOG_TAG} Extension disabled successfully`);
    }

    _onUpdate() {
        this._panelIndicator.ensurePosition();

        const currentState = this._inputManager.getCurrentModifierState();
        this._stateTracker.updateState(currentState);

        if (!this._stateTracker.hasStateChanged()) {
            return GLib.SOURCE_CONTINUE;
        }

        this._handleModifierNotifications();
        this._updatePanelIndicator();

        return GLib.SOURCE_CONTINUE;
    }

    _handleModifierNotifications() {
        if (this._stateTracker.previousState === null) {
            return; // Skip notifications on first run
        }

        // Check for Caps Lock changes
        const capsChange = this._stateTracker.getModifierChangeInfo(MODIFIER_MASKS.LOCK);
        if (capsChange) {
            const message = capsChange.isActive ? 'On' : 'Off';
            this._showNotification(message, 'Caps');
        }

        // Check for Num Lock changes
        const numChange = this._stateTracker.getModifierChangeInfo(MODIFIER_MASKS.MOD2);
        if (numChange) {
            const message = numChange.isActive ? 'On' : 'Off';
            this._showNotification(message, 'Num');
        }

        // Check for Scroll Lock changes
        const scrollChange = this._stateTracker.getModifierChangeInfo(MODIFIER_MASKS.MOD3);
        if (scrollChange) {
            const message = scrollChange.isActive ? 'On' : 'Off';
            this._showNotification(message, 'Scroll');
        }
    }

    _updatePanelIndicator() {
        const symbols = this._settingsManager.symbols;

        const activeModifiers = [];
        for (const [mask, symbol] of symbols.modifiers) {
            if (this._stateTracker.isModifierActive(mask)) {
                activeModifiers.push(symbol);
            }
        }

        this._panelIndicator.updateSymbols(activeModifiers);
    }

    _showNotification(status, keyName) {
        if (!this._settingsManager.showOsdNotifications)
            return;

        try {
            const label = `${keyName} Lock: ${status}`;
            // GNOME 50+ uses showAll(); older versions use monitor index -1.
            // A null level hides the volume/brightness bar.
            if (typeof Main.osdWindowManager.showAll === 'function')
                Main.osdWindowManager.showAll(this._osdIcon, label, null);
            else
                Main.osdWindowManager.show(-1, this._osdIcon, label, null);
        } catch (error) {
            console.error(`${LOG_TAG} Error showing OSD notification: ${error}`);
        }
    }
}
