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

import Gtk from 'gi://Gtk';
import Adw from 'gi://Adw';
import GLib from 'gi://GLib';
import { ExtensionPreferences, gettext as _ } from 'resource:///org/gnome/Shell/Extensions/js/extensions/prefs.js';

const LOG_TAG = 'KBD-Informer-Prefs:';

const CONFIG_KEYS = {
    modifiers: [
        'shift-symbol', 'caps-symbol', 'control-symbol', 'alt-symbol',
        'num-symbol', 'scroll-symbol', 'super-symbol', 'altgr-symbol'
    ]
};

let SYMBOL_PRESETS = null;

function getSymbolPresets(settingsManager = null) {
    if (!SYMBOL_PRESETS) {
        SYMBOL_PRESETS = {
            modifiers: new Map([
                [_('Symbols'), ['⇧', 'Caps', '^', '⎇', 'Num', '⇳', '❖', '⎇']],
            ])
        };
    }
    return SYMBOL_PRESETS;
}

class SettingsManager {
    constructor(extension) {
        this._extension = extension;
        this._settings = null;
        this._schema = null;
        this.currentSymbols = {};
        this.savedSymbols = {};
    }

    initialize() {
        this._settings = this._extension.getSettings();
        this._schema = this._settings.settings_schema;
        this._loadCurrentState();
    }

    _loadCurrentState() {
        const allKeys = CONFIG_KEYS.modifiers;
        this.currentSymbols = this._getSymbolsFromSettings(allKeys);
        this.savedSymbols = this._settings.get_value('saved-symbols').deep_unpack();

        console.debug(`${LOG_TAG} Current symbols: ${JSON.stringify(this.currentSymbols)}`);
        console.debug(`${LOG_TAG} Saved symbols: ${JSON.stringify(this.savedSymbols)}`);
    }

    _getSymbolsFromSettings(keys) {
        return Object.fromEntries(
            keys.map(key => [key, this._settings.get_string(key)])
        );
    }

    getSchemaDefaults(keys) {
        return keys.map(key => this._settings.get_default_value(key).deep_unpack());
    }

    getSchemaKey(key) {
        return this._schema.get_key(key);
    }

    setString(key, value) {
        this._settings.set_string(key, value);
        this.currentSymbols[key] = value;
    }

    connect(signal, callback) {
        return this._settings.connect(signal, callback);
    }

    setSavedSymbols(symbols) {
        this.savedSymbols = { ...symbols };
        this._settings.set_value('saved-symbols', new GLib.Variant('a{ss}', this.savedSymbols));
    }

    symbolsEqual(obj1, obj2) {
        const keys1 = Object.keys(obj1);
        const keys2 = Object.keys(obj2);

        if (keys1.length !== keys2.length) return false;

        return keys1.every(key => (obj1[key] ?? '') === (obj2[key] ?? ''));
    }

    currentDiffersFromSaved(keys) {
        return keys.some(key =>
            this.currentSymbols[key] !== (this.savedSymbols[key] ?? '')
        );
    }
}

class SimpleManager {
    constructor(settingsManager, keys, defaultValues) {
        this.settingsManager = settingsManager;
        this.keys = keys;
        this.defaultValues = defaultValues;
    }

    isCurrentEqualToDefault(entryManager) {
        return this.keys.every((key, i) =>
            entryManager.getEntryText(key) === this.defaultValues[i]
        );
    }

    isCurrentEqualToSaved(entryManager) {
        return this.keys.every(key =>
            entryManager.getEntryText(key) === this.settingsManager.currentSymbols[key]
        );
    }

    applyDefaults(entryManager) {
        console.debug(`${LOG_TAG} Applying defaults: ${this.defaultValues}`);

        this.keys.forEach((key, i) => {
            const value = this.defaultValues[i];
            entryManager.updateEntry(key, value);
        });
    }

    saveCurrentAsPreset(entryManager) {
        const entryTexts = entryManager.getAllEntryTexts(this.keys);

        console.debug(`${LOG_TAG} Saving entries to settings: ${JSON.stringify(entryTexts)}`);

        // Save entry values to settings
        this.keys.forEach(key => {
            const value = entryTexts[key];
            this.settingsManager.setString(key, value);
            this.settingsManager.savedSymbols[key] = value;
        });

        console.debug(`${LOG_TAG} Saving symbols to preset: ${JSON.stringify(this.settingsManager.savedSymbols)}`);
        this.settingsManager.setSavedSymbols(this.settingsManager.savedSymbols);
    }
}

class EntryManager {
    constructor() {
        this.entries = new Map();
    }

    addEntry(key, entry, changeCallback) {
        const changeId = entry.connect('changed', () => {
            console.debug(`${LOG_TAG} Entry changed ${key}: -> ${entry.text}`);
            changeCallback();
        });

        this.entries.set(key, { entry, changeId });
        console.debug(`${LOG_TAG} Added entry for ${key}: ${entry.text}`);
    }

    updateEntry(key, value) {
        const entryData = this.entries.get(key);
        if (!entryData) return;

        const { entry, changeId } = entryData;

        if (entry.text === value) {
            return;
        }

        // Block signal to prevent recursion
        entry.block_signal_handler(changeId);
        console.debug(`${LOG_TAG} Updating entry ${key}: ${entry.text} -> ${value}`);
        entry.text = value;
        entry.unblock_signal_handler(changeId);
    }

    getEntry(key) {
        const entryData = this.entries.get(key);
        return entryData ? entryData.entry : null;
    }

    getEntryText(key) {
        const entry = this.getEntry(key);
        return entry ? entry.text : '';
    }

    getAllEntryTexts(keys) {
        const texts = {};
        keys.forEach(key => {
            texts[key] = this.getEntryText(key);
        });
        return texts;
    }
}

class DialogManager {
    static showSwitchConfirmation(window, title, keys, settingsManager, onConfirm, onCancel) {
        console.debug(`${LOG_TAG} Showing switch confirmation dialog`);

        const dialog = new Adw.MessageDialog({
            transient_for: window,
            modal: true,
            heading: _('Unsaved custom symbols'),
            body: _('Switching presets will discard your custom symbols. Do you want to save before switching?'),
        });

        // Create comparison table if there are differences
        const grid = DialogManager._createComparisonGrid(title, keys, settingsManager);
        if (grid) {
            dialog.set_extra_child(grid);
        }

        // Add response buttons
        dialog.add_response('cancel', _('Cancel'));
        dialog.add_response('save', _('Save'));
        dialog.add_response('switch', _('Switch'));
        dialog.set_response_appearance('save', Adw.ResponseAppearance.SUGGESTED);
        dialog.set_response_appearance('switch', Adw.ResponseAppearance.DESTRUCTIVE);
        dialog.set_default_response('cancel');
        dialog.set_close_response('cancel');

        dialog.connect('response', (_dialog, response) => {
            console.debug(`${LOG_TAG} Dialog response: ${response}`);

            switch (response) {
                case 'cancel':
                    onCancel();
                    break;
                case 'save':
                    onConfirm(true);
                    break;
                case 'switch':
                    onConfirm(false);
                    break;
            }

            dialog.destroy();
        });

        dialog.show();
    }

    static _createComparisonGrid(title, keys, settingsManager) {
        const schema = settingsManager._schema;
        let hasChanges = false;

        const grid = new Gtk.Grid({
            column_spacing: 12,
            row_spacing: 12,
            halign: Gtk.Align.CENTER,
            hexpand: true,
            margin_top: 12,
            margin_bottom: 12,
            margin_start: 12,
            margin_end: 12,
        });

        const headers = [title, _('Custom'), _('Saved')];
        headers.forEach((header, col) => {
            const label = new Gtk.Label({
                label: header,
                halign: Gtk.Align.CENTER,
                hexpand: true,
                width_chars: Math.max(6, header.length),
            });
            label.add_css_class('heading');
            grid.attach(label, col, 0, 1, 1);
        });

        let row = 1;
        keys.forEach(key => {
            const current = settingsManager.currentSymbols[key] ?? '';
            const saved = settingsManager.savedSymbols[key] ?? '';

            if (current !== saved) {
                hasChanges = true;
                const schemaKey = schema.get_key(key);
                const cells = [_(schemaKey.get_summary()), current, saved];

                cells.forEach((value, col) => {
                    const label = new Gtk.Label({
                        label: value,
                        halign: Gtk.Align.CENTER,
                        hexpand: true,
                    });

                    if (col === 0) {
                        label.add_css_class('heading');
                    }

                    grid.attach(label, col, row, 1, 1);
                });

                row++;
            }
        });

        return hasChanges ? grid : null;
    }
}

class GroupBuilder {
    constructor(settingsManager, page) {
        this.settingsManager = settingsManager;
        this.page = page;
    }

    createGroup(title, description, keys, defaultValues) {
        console.debug(`${LOG_TAG} Creating group: ${title}`);

        const group = new Adw.PreferencesGroup({ title, description });
        const entryManager = new EntryManager();
        const simpleManager = new SimpleManager(this.settingsManager, keys, defaultValues);

        const { resetButton, saveButton, headerBox } = this._createControlButtons();
        group.set_header_suffix(headerBox);

        this._setupButtonLogic(resetButton, saveButton, entryManager, simpleManager);

        this._createEntryRows(group, keys, entryManager, () => {
            this._updateButtonStates(resetButton, saveButton, entryManager, simpleManager);
        });

        this.page.add(group);
        console.debug(`${LOG_TAG} Group created: ${title}`);
    }

    _createControlButtons() {
        const headerBox = new Gtk.Box({ spacing: 6 });

        const resetButton = Gtk.Button.new_with_label(_('Reset to defaults'));
        resetButton.valign = Gtk.Align.CENTER;

        const saveButton = Gtk.Button.new_with_label(_('Save'));
        saveButton.add_css_class('suggested-action');
        saveButton.valign = Gtk.Align.CENTER;

        headerBox.append(resetButton);
        headerBox.append(saveButton);

        return { resetButton, saveButton, headerBox };
    }

    _setupButtonLogic(resetButton, saveButton, entryManager, simpleManager) {
        const updateButtonStates = () => {
            this._updateButtonStates(resetButton, saveButton, entryManager, simpleManager);
        };

        // Handle reset button
        resetButton.connect('clicked', () => {
            console.debug(`${LOG_TAG} Reset button clicked`);
            simpleManager.applyDefaults(entryManager);
            updateButtonStates();
        });

        // Handle save button
        saveButton.connect('clicked', () => {
            console.debug(`${LOG_TAG} Save button clicked`);
            simpleManager.saveCurrentAsPreset(entryManager);
            updateButtonStates();
        });

        // Handle external changes to saved symbols
        this.settingsManager.connect('changed::saved-symbols', () => {
            console.debug(`${LOG_TAG} Saved symbols changed externally`);
            const newSavedSymbols = this.settingsManager._settings.get_value('saved-symbols').deep_unpack();

            if (!this.settingsManager.symbolsEqual(this.settingsManager.savedSymbols, newSavedSymbols)) {
                this.settingsManager.savedSymbols = newSavedSymbols;
                updateButtonStates();
            }
        });

        // Initial update
        updateButtonStates();
    }

    _updateButtonStates(resetButton, saveButton, entryManager, simpleManager) {
        const isDefault = simpleManager.isCurrentEqualToDefault(entryManager);
        const isSaved = simpleManager.isCurrentEqualToSaved(entryManager);

        resetButton.sensitive = !isDefault;
        saveButton.sensitive = !isSaved;

        console.debug(`${LOG_TAG} Button states - Reset enabled: ${!isDefault}, Save enabled: ${!isSaved}`);
    }

    _createEntryRows(group, keys, entryManager, onEntryChanged) {
        keys.forEach(key => {
            const schemaKey = this.settingsManager.getSchemaKey(key);
            if (!schemaKey) {
                console.warn(`${LOG_TAG} Schema doesn't contain key: ${key}`);
                return;
            }

            const entry = new Gtk.Entry({
                text: this.settingsManager.currentSymbols[key] || ''
            });

            const row = new Adw.ActionRow({
                title: _(schemaKey.get_summary())
            });

            row.add_suffix(entry);
            row.activatable_widget = entry;
            group.add(row);

            // Setup entry change handling - only update button states, don't save to settings
            entryManager.addEntry(key, entry, onEntryChanged);

            // Handle external settings changes
            this.settingsManager.connect(`changed::${key}`, () => {
                const newValue = this.settingsManager._settings.get_string(key);
                const currentValue = this.settingsManager.currentSymbols[key];

                if (currentValue !== newValue) {
                    console.debug(`${LOG_TAG} External change for ${key}: ${currentValue} -> ${newValue}`);
                    this.settingsManager.currentSymbols[key] = newValue;
                    entryManager.updateEntry(key, newValue);
                    onEntryChanged();
                }
            });
        });
    }
}

// Main Preferences Class
export default class KeyboardInformerPreferences extends ExtensionPreferences {
    fillPreferencesWindow(window) {
        console.debug(`${LOG_TAG} Initializing preferences window`);

        this.settingsManager = new SettingsManager(this);
        this.settingsManager.initialize();

        const page = new Adw.PreferencesPage();
        const groupBuilder = new GroupBuilder(this.settingsManager, page);

        this._createPreferenceGroups(groupBuilder);

        window.add(page);
        window.show();

        console.debug(`${LOG_TAG} Preferences window initialized`);
    }

    _createPreferenceGroups(groupBuilder) {
        const symbolPresets = getSymbolPresets(this.settingsManager);

        groupBuilder.createGroup(
            _('Symbols for modifier keys'),
            _('Sets the symbols displayed for modifier keys when they are pressed.'),
            CONFIG_KEYS.modifiers,
            symbolPresets.modifiers.get(_('Symbols'))
        );
    }
}

export function init() {
    return new KeyboardInformerPreferences();
}
