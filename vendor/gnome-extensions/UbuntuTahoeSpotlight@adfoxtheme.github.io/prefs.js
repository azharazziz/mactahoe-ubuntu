import Adw from 'gi://Adw';
import Gdk from 'gi://Gdk';
import Gtk from 'gi://Gtk';
import GLib from 'gi://GLib';
import { ExtensionPreferences } from 'resource:///org/gnome/Shell/Extensions/js/extensions/prefs.js';

export default class UbuntuTahoeSpotlightPreferences extends ExtensionPreferences {
    fillPreferencesWindow(window) {
        const settings = this.getSettings();
        const language = GLib.get_language_names().some(name => /^vi([_-]|$)/i.test(name))
            ? 'vi'
            : 'en';
        const text = (vietnamese, english) => language === 'vi' ? vietnamese : english;

        const page = new Adw.PreferencesPage({
            title: text('UbuntuTahoe Spotlight', 'UbuntuTahoe Spotlight'),
            icon_name: 'system-search-symbolic',
        });
        window.add(page);

        const group = new Adw.PreferencesGroup({
            title: text('Phím tắt', 'Keyboard shortcut'),
            description: text(
                'Bấm Ghi phím tắt, sau đó nhấn tổ hợp phím bạn muốn dùng.',
                'Select Record shortcut, then press the key combination you want to use.'
            ),
        });
        page.add(group);

        const shortcutRow = new Adw.ActionRow({
            title: text('Phím tắt mở Spotlight', 'Open Spotlight'),
        });
        const shortcutLabel = new Gtk.Label({
            label: settings.get_strv('toggle-spotlight')[0] || '<Super><Alt>f',
            selectable: true,
            valign: Gtk.Align.CENTER,
        });
        shortcutRow.add_suffix(shortcutLabel);

        const recordButton = new Gtk.Button({
            label: text('Ghi phím tắt', 'Record shortcut'),
            valign: Gtk.Align.CENTER,
        });
        shortcutRow.add_suffix(recordButton);
        group.add(shortcutRow);

        const statusRow = new Adw.ActionRow({
            title: '',
            visible: false,
        });
        const statusLabel = new Gtk.Label({
            wrap: true,
            xalign: 0,
            hexpand: true,
        });
        statusRow.add_suffix(statusLabel);
        group.add(statusRow);

        let recording = false;
        const setRecording = active => {
            recording = active;
            recordButton.label = active
                ? text('Tekan tombol… (Esc untuk batal)', 'Press keys… (Esc to cancel)')
                : text('Ghi phím tắt', 'Record shortcut');
        };

        recordButton.connect('clicked', () => {
            setRecording(!recording);
            statusRow.visible = false;
        });

        const keyController = new Gtk.EventControllerKey();
        keyController.set_propagation_phase(Gtk.PropagationPhase.CAPTURE);
        keyController.connect('key-pressed', (_controller, keyval, _keycode, state) => {
            if (!recording)
                return false;

            if (keyval === Gdk.KEY_Escape) {
                setRecording(false);
                return true;
            }

            const modifiers = state & Gtk.accelerator_get_default_mod_mask();
            if (!modifiers || !Gtk.accelerator_valid(keyval, modifiers))
                return true;

            const accelerator = Gtk.accelerator_name(keyval, modifiers);
            settings.set_strv('toggle-spotlight', [accelerator]);
            shortcutLabel.label = accelerator;
            statusRow.visible = false;
            setRecording(false);
            return true;
        });
        window.add_controller(keyController);

        window.connect('close-request', () => {
            if (recording)
                setRecording(false);
            return false;
        });
    }
}
