const Gtk = imports.gi.Gtk;
const Gio = imports.gi.Gio;
const Me  = imports.misc.extensionUtils.getCurrentExtension();
const Lib = Me.imports.lib;

let settings

function init() {
    settings = Lib.getSettings(Me);
}

function buildPrefsWidget() {
    let frame = new Gtk.Box({orientation:  Gtk.Orientation.VERTICAL,
                             border_width: 10});
    let hbox = new Gtk.Box({orientation: Gtk.Orientation.HORIZONTAL});
    let checkbox = new Gtk.CheckButton();
    let hbox2 = new Gtk.Box({orientation: Gtk.Orientation.HORIZONTAL});
    let lbl = new Gtk.Label.new("Launch application on click: ");
    let editbox = new Gtk.Entry({width_chars:40});
    checkbox.set_active(settings.get_boolean("launch-on-click"));
    editbox.set_text(settings.get_string("wifi-configurator-app"));
    settings.bind("launch-on-click", checkbox, "active", Gio.SettingsBindFlags.DEFAULT);
    settings.bind("wifi-configurator-app", editbox, "text", Gio.SettingsBindFlags.DEFAULT);
    checkbox.connect("notify::active",function(cb) {
        //settings.set_boolean("launch-on-click", checkbox.active);
        editbox.set_sensitive(checkbox.active);
    });
    hbox2.add(lbl);
    hbox2.add(editbox);
    hbox.add(checkbox);
    hbox.add(hbox2);
    frame.add(hbox);
    frame.show_all();
    editbox.set_sensitive(settings.get_boolean("launch-on-click"));
    return frame;
}
// vim:sw=4 ts=4 et softtabstop=4
