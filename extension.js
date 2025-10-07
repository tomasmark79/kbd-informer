/**
 * Keyboard Modifiers Status Extension
 * Shows keyboard modifier status in the top panel and displays notifications for key changes
 * Copyright (C) 2025 Tomáš Mark
 */

// Imports - GNOME Shell APIs
import St from 'gi://St';
import Clutter from 'gi://Clutter';
import GObject from 'gi://GObject';
import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import * as Config from 'resource:///org/gnome/shell/misc/config.js';
import GIRepository from 'gi://GIRepository';
import * as ExtensionUtils from 'resource:///org/gnome/shell/misc/extensionUtils.js';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import * as Layout from 'resource:///org/gnome/shell/ui/layout.js';
import { Extension } from 'resource:///org/gnome/shell/extensions/extension.js';

// Constants
const LOG_TAG = 'KMS-Ext:';
const UPDATE_INTERVAL_MS = 200;
const OSD_HIDE_TIMEOUT_MS = 1500;
const OSD_FADE_TIME_MS = 100;
const SHOW_OSD_ICON = true; // Set to true to show icon in OSD

// Debug logging
console.debug(`${LOG_TAG} Shell version: ${Config.PACKAGE_VERSION}`);

// Modifier masks mapping
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

/**
 * ModifierStateTracker - Tracks and manages keyboard modifier states
 */
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

/**
 * SettingsManager - Handles extension settings and symbol configuration
 */
class SettingsManager {
    constructor(extension) {
        this._extension = extension;
        this._settings = null;
        this._settingsChangedId = null;
        this.symbols = {
            modifiers: []
        };
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

        this.symbols.modifiers = [
            [MODIFIER_MASKS.SHIFT, this._settings.get_string('shift-symbol')],
            [MODIFIER_MASKS.LOCK, this._settings.get_string('caps-symbol')],
            [MODIFIER_MASKS.CONTROL, this._settings.get_string('control-symbol')],
            [MODIFIER_MASKS.MOD1, this._settings.get_string('alt-symbol')],
            [MODIFIER_MASKS.MOD2, this._settings.get_string('num-symbol')],
            [MODIFIER_MASKS.MOD3, this._settings.get_string('scroll-symbol')],
            [MODIFIER_MASKS.MOD4, this._settings.get_string('super-symbol')],
            [MODIFIER_MASKS.MOD5, this._settings.get_string('altgr-symbol')],
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

/**
 * Custom OSD window for keyboard modifiers display
 */
const ModifiersOSD = GObject.registerClass(
    class ModifiersOSD extends Clutter.Actor {
        _init(monitorIndex) {
            super._init({
                x_expand: true,
                y_expand: true,
                x_align: Clutter.ActorAlign.CENTER,
                y_align: Clutter.ActorAlign.END,
            });

            this._monitorIndex = monitorIndex;
            this._hideTimeoutId = 0;

            this._setupUI();
            this._reset();
            Main.uiGroup.add_child(this);
        }

        _setupUI() {
            // Add monitor constraint
            const constraint = new Layout.MonitorConstraint({ index: this._monitorIndex });
            this.add_constraint(constraint);

            // Main container with OSD styling
            this._container = new St.BoxLayout({
                style_class: 'osd-window',
                style: 'margin-bottom: 8em;',
                x_align: Clutter.ActorAlign.CENTER,
                y_align: Clutter.ActorAlign.CENTER,
                x_expand: true,
                vertical: !SHOW_OSD_ICON, // Vertical layout when no icon, horizontal when icon is shown
            });
            this.add_child(this._container);

            // Icon (conditionally shown based on SHOW_OSD_ICON constant)
            if (SHOW_OSD_ICON) {
                this._icon = new St.Icon({
                    icon_name: 'input-keyboard-symbolic',
                    icon_size: 24,
                    y_expand: true,
                });
                this._container.add_child(this._icon);
            }

            // Text content container
            // Use vertical: true for Gnome 46+ compatibility (Ubuntu 24.04)
            // Falls back gracefully if orientation property is still supported
            this._textContainer = new St.BoxLayout({
                vertical: true,
                y_align: Clutter.ActorAlign.CENTER,
                x_align: Clutter.ActorAlign.CENTER,
                x_expand: true,
            });
            this._container.add_child(this._textContainer);

            // Title label
            this._titleLabel = new St.Label({
                style: 'font-size: 1.1em; text-align: center;',
                x_align: Clutter.ActorAlign.CENTER,
                y_align: Clutter.ActorAlign.CENTER,
                x_expand: true,
            });
            this._textContainer.add_child(this._titleLabel);

            // Status label
            this._statusLabel = new St.Label({
                style: 'font-size: 1.0em; text-align: center;',
                x_align: Clutter.ActorAlign.CENTER,
                y_align: Clutter.ActorAlign.CENTER,
                x_expand: true,
            });
            this._textContainer.add_child(this._statusLabel);
        }

        show(title, status) {
            this._titleLabel.text = title;
            this._statusLabel.text = status;

            if (!this.visible) {
                this._showWithAnimation();
            }

            this._scheduleHide();
        }

        _showWithAnimation() {
            // Disable unredirect if available (not present in Gnome 46+)
            if (global.compositor && typeof global.compositor.disable_unredirect === 'function') {
                global.compositor.disable_unredirect();
            }
            
            super.show();
            this.opacity = 0;
            this.get_parent().set_child_above_sibling(this, null);

            this.ease({
                opacity: 255,
                duration: OSD_FADE_TIME_MS,
                mode: Clutter.AnimationMode.EASE_OUT_QUAD,
            });
        }

        _scheduleHide() {
            this._clearHideTimeout();
            this._hideTimeoutId = GLib.timeout_add(
                GLib.PRIORITY_DEFAULT,
                OSD_HIDE_TIMEOUT_MS,
                this._hide.bind(this)
            );
            GLib.Source.set_name_by_id(this._hideTimeoutId, '[gnome-shell] ModifiersOSD._hide');
        }

        cancel() {
            if (this._hideTimeoutId) {
                this._clearHideTimeout();
                this._hide();
            }
        }

        _hide() {
            this._hideTimeoutId = 0;
            this.ease({
                opacity: 0,
                duration: OSD_FADE_TIME_MS,
                mode: Clutter.AnimationMode.EASE_OUT_QUAD,
                onComplete: () => {
                    this._reset();
                    // Enable unredirect if available (not present in Gnome 46+)
                    if (global.compositor && typeof global.compositor.enable_unredirect === 'function') {
                        global.compositor.enable_unredirect();
                    }
                },
            });
            return GLib.SOURCE_REMOVE;
        }

        _reset() {
            super.hide();
            this._titleLabel.text = '';
            this._statusLabel.text = '';
        }

        _clearHideTimeout() {
            if (this._hideTimeoutId) {
                GLib.source_remove(this._hideTimeoutId);
                this._hideTimeoutId = 0;
            }
        }

        destroy() {
            this._clearHideTimeout();
            super.destroy();
        }
    });

/**
 * Manager for handling OSD windows across multiple monitors
 */
class ModifiersOSDManager {
    constructor() {
        this._osdWindows = [];
        this._monitorsChangedId = Main.layoutManager.connect(
            'monitors-changed',
            this._onMonitorsChanged.bind(this)
        );
        this._onMonitorsChanged();
    }

    _onMonitorsChanged() {
        const monitorCount = Main.layoutManager.monitors.length;

        // Create OSD windows for new monitors
        for (let i = 0; i < monitorCount; i++) {
            if (!this._osdWindows[i]) {
                this._osdWindows[i] = new ModifiersOSD(i);
            }
        }

        // Remove OSD windows for monitors that no longer exist
        for (let i = monitorCount; i < this._osdWindows.length; i++) {
            if (this._osdWindows[i]) {
                this._osdWindows[i].destroy();
                this._osdWindows[i] = null;
            }
        }

        this._osdWindows.length = monitorCount;
    }

    show(title, status) {
        this._osdWindows.forEach(osd => {
            if (osd) {
                osd.show(title, status);
            }
        });
    }

    hideAll() {
        this._osdWindows.forEach(osd => {
            if (osd) {
                osd.cancel();
            }
        });
    }

    destroy() {
        if (this._monitorsChangedId) {
            Main.layoutManager.disconnect(this._monitorsChangedId);
            this._monitorsChangedId = null;
        }

        this._osdWindows.forEach(osd => {
            if (osd) {
                osd.destroy();
            }
        });
        this._osdWindows = [];
    }
}

/**
 * Panel indicator for displaying modifier status
 */
class PanelIndicator {
    constructor() {
        this._indicator = null;
        this._label = null;
    }

    initialize() {
        this._indicator = new St.Bin({
            style_class: 'panel-button',
            reactive: false,
            can_focus: false,
            x_expand: true,
            y_expand: false,
            track_hover: false
        });

        this._label = new St.Label({
            style_class: 'state-label',
            text: ''
        });

        this._indicator.set_child(this._label);
        Main.panel._rightBox.insert_child_at_index(this._indicator, 0);
    }

    updateText(text) {
        if (this._label) {
            this._label.text = text;
        }
    }

    destroy() {
        if (this._indicator) {
            Main.panel._rightBox.remove_child(this._indicator);
            this._indicator.destroy_all_children();
            this._indicator.destroy();
            this._indicator = null;
            this._label = null;
        }
    }
}

/**
 * Input device manager for handling keyboard events
 */
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

        // Initialize components
        this._stateTracker = new ModifierStateTracker();
        this._settingsManager = new SettingsManager(this);
        this._osdManager = new ModifiersOSDManager();
        this._panelIndicator = new PanelIndicator();
        this._inputManager = new InputDeviceManager();

        // Setup settings
        this._settingsManager.onSettingsChanged = () => {
            this._stateTracker.previousState = null; // Force refresh
        };
        this._settingsManager.initialize();

        // Setup panel indicator
        this._panelIndicator.initialize();

        // Setup input device manager
        this._inputManager.initialize();

        // Start periodic updates
        this._updateTimeoutId = GLib.timeout_add(
            GLib.PRIORITY_DEFAULT,
            UPDATE_INTERVAL_MS,
            this._onUpdate.bind(this)
        );

        console.debug(`${LOG_TAG} Extension enabled successfully`);
    }

    disable() {
        console.debug(`${LOG_TAG} Disabling extension...`);

        // Stop periodic updates
        if (this._updateTimeoutId) {
            GLib.source_remove(this._updateTimeoutId);
            this._updateTimeoutId = null;
        }

        // Cleanup all components
        [
            this._inputManager,
            this._panelIndicator,
            this._osdManager,
            this._settingsManager
        ].forEach(component => {
            if (component) {
                component.destroy();
            }
        });

        // Reset references
        this._stateTracker = null;
        this._settingsManager = null;
        this._osdManager = null;
        this._panelIndicator = null;
        this._inputManager = null;

        console.debug(`${LOG_TAG} Extension disabled successfully`);
    }

    _onUpdate() {
        // Get current modifier state
        const currentState = this._inputManager.getCurrentModifierState();
        this._stateTracker.updateState(currentState);

        // Check if state has changed
        if (!this._stateTracker.hasStateChanged()) {
            return GLib.SOURCE_CONTINUE;
        }

        // Handle notifications for specific modifier changes
        this._handleModifierNotifications();

        // Update panel indicator
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

        // Collect active modifiers
        const activeModifiers = [];
        for (const [mask, symbol] of symbols.modifiers) {
            if (this._stateTracker.isModifierActive(mask)) {
                activeModifiers.push(symbol);
            }
        }

        // Build final indicator text - just join active modifiers with space
        const indicatorText = activeModifiers.join(' ');

        this._panelIndicator.updateText(indicatorText);
    }

    _showNotification(title, message) {
        try {
            this._osdManager.show(title, message);
        } catch (error) {
            console.error(`${LOG_TAG} Error showing OSD notification: ${error}`);
        }
    }
}
