const St = imports.gi.St;
const Main = imports.ui.main;
const Tweener = imports.ui.tweener;
const Panel = imports.ui.panel;
const ModalDialog = imports.ui.modalDialog;
const Clutter = imports.gi.Clutter;

const GLib = imports.gi.GLib;
const Lang = imports.lang;
const Mainloop = imports.mainloop;
const Me = imports.misc.extensionUtils.getCurrentExtension();
const Wpasup = Me.imports.wpasup;
const Lib = Me.imports.lib;


function chomp(raw_text)
{
    return raw_text.replace(/(\n|\r)+$/, '');
}

// global.log( msg )
// global.logError( msg )

function GnomeUi() {
    this._init();
}
GnomeUi.prototype = {
    _init: function() {
        this._settings = Lib.getSettings(Me);
        let button = new St.BoxLayout({ 
                              style_class: 'panel-button',
                              reactive: true,
                              can_focus: true,
                              // x_fill: true,
                              // y_fill: false,
                              track_hover: true 
                                });

        this._signals = new Array(5);

        /*
        if(typeof St.IconType != "undefined") {
        }
        */

        this._signals[0] = new St.Icon({ 
                                 // icon_name: 'system-run',
                                 icon_name: 'network-wireless-signal-none-symbolic',
                                 // icon_type: St.IconType.SYMBOLIC,
                                 style_class: 'system-status-icon' });
        this._signals[1] = new St.Icon({ 
                                 // icon_name: 'system-run',
                                 icon_name: 'network-wireless-signal-weak-symbolic',
                                 // icon_type: St.IconType.SYMBOLIC,
                                 style_class: 'system-status-icon' });
        this._signals[2] = new St.Icon({ 
                                 // icon_name: 'system-run',
                                 icon_name: 'network-wireless-signal-ok-symbolic',
                                 // icon_type: St.IconType.SYMBOLIC,
                                 style_class: 'system-status-icon' });
        this._signals[3] = new St.Icon({ 
                                 // icon_name: 'system-run',
                                 icon_name: 'network-wireless-signal-good-symbolic',
                                 // icon_type: St.IconType.SYMBOLIC,
                                 style_class: 'system-status-icon' });
        this._signals[4] = new St.Icon({ 
                                 // icon_name: 'system-run',
                                 icon_name: 'network-wireless-signal-excellent-symbolic',
                                 // icon_type: St.IconType.SYMBOLIC,
                                 style_class: 'system-status-icon' });
        this._error_icon = new St.Icon({ 
                                 // icon_name: 'system-run',
                                 icon_name: 'network-error-symbolic',
                                 // icon_type: St.IconType.SYMBOLIC,
                                 style_class: 'system-status-icon' });
        this._errors = {};
        this.build_error_diaolg();
        /*
        this._cicon = new St.Icon({ 
                                 // icon_name: 'system-run',
                                 icon_name: 'network-wireless-signal-excellent-symbolic',
                                 icon_type: St.IconType.SYMBOLIC,
                                 style_class: 'system-status-icon' });
        */
        //let pwpath = '/usr/share/icons/gnome/48x48/animations/process-working.png';
        let pwpath = "process-working.svg";
        this._spinner = new Panel.AnimatedIcon(pwpath, 24);//PANEL_ICON_SIZE);
        // tprint("nchildren = "+this._spinner._animations.get_n_children()+"  datadir="+global.datadir+"  _frame = "+this._spinner._frame);
        //icon.opacity = 0;
        // icon.show();
        this.lbl = new St.Label({ text: "" });

        // button.add_actor(this._spinner.actor);
        button.add_actor(this._signals[0]); // insert_child_at_index( this._dicon, 0 );
        this._current_icon = this._signals[0]; // _dicon;
        button.add_actor(this.lbl);
        button.connect('button-press-event', Lang.bind(this, this._onClick));

        this._button = button;
    },

    set_icon: function(icon) {
        this._button.replace_child(this._current_icon, icon );
        this._current_icon = icon;
    },

    build_error_diaolg: function(icon) {
        this._error_box = new ModalDialog.ModalDialog({});
        let hbox = new St.BoxLayout({ style: "padding: 10px; spacing: 10px"});
        this._error_lbl = new St.Label({text: "error"});
        this._error_box_icon = new St.Icon({ 
                                 // icon_name: 'system-run',
                                 icon_name: 'network-error-symbolic',
                                 icon_size: 96,
                                 // icon_type: St.IconType.SYMBOLIC,
                                 style_class: 'system-status-icon' });
        hbox.add( this._error_box_icon, { padding: 10, x_align: St.Align.MIDDLE } );
        hbox.add( this._error_lbl, { x_fill: true, x_expand: true} );
        this._error_box.contentLayout.add(hbox);
        this._error_box.setButtons( [
                {
                    label: "Close",
                    key: Clutter.KEY_Escape,
                    action: Lang.bind(this._error_box, this._error_box.close)
                }
            ] );
    },

    _onClick: function(actor, e) {
        let errmsg = Object.keys(this._errors).join("\n");
        if( chomp(errmsg) != "" ) {
            global.log("Errors(on-click):\n"+errmsg);
            this._error_lbl.set_text(errmsg);
            this._error_box.open(e.get_time());
            // Rebuilding _error_box in gambit to avoid UI crash...

            this.build_error_diaolg();

            /*
            this._err_dialog = new Gtk.MessageDialog({
                modal: true,
                buttons: Gtk.ButtonType.CLOSE,
                message_type: Gtk.MessageType.ERROR,
                text: errmsg
            });
            this._err_dialog.connect("response", Lang.bind(this, function(dlg,id) {
                this._err_dialog.destroy();
            });
            // this._err_dialog.connect("destroy", function() { this._err_dialog = null; });
            this._err_dialog.show();
            */
        }
        else if( this._settings.get_boolean("launch-on-click") ) {
            let [_,argv] = GLib.shell_parse_argv(this._settings.get_string("wifi-configurator-app"));
            global.log("launch-on-click is true, argv="+argv);
            GLib.spawn_async( 
                    null, 
                    argv,
                    null,
                    0,
                    null, null, null );
        }
        return true;
    },

    enable: function() {
        Main.panel._rightBox.insert_child_at_index(this._button, 0);
    },

    disable: function() {
        Main.panel._rightBox.remove_child(this._button);
    },

    disconnected: function( m ) {
        // this._button.replace_child(this._current_icon, this._dicon );
        // this._current_icon = this._dicon;
        this.set_icon( this._signals[0] );
        this.lbl.set_text("");
        this._errors = {};
    },

    pending: function( m, signal ) {
        // this._button.replace_child(this._current_icon, this._spinner.actor );
        // this._current_icon = this._spinner.actor;
        this.set_icon( this._spinner.actor );
        this._spinner.actor.hide();
        this._spinner.actor.show();
        this.lbl.set_text( m );
        this._errors = {};
    },

    connected: function( m, signal ) {
        // this._button.replace_child(this._current_icon, this._cicon );
        // this._current_icon = this._cicon;
        this.set_icon( this._signals[signal] );
        this.lbl.set_text( m );
        this._errors = {};
    },

    error_event: function( e ) {
        this._errors[e.message] = 1;
        this.set_icon( this._error_icon );
        this.lbl.set_text( "" );
    }

}

let my_socket_file = "/tmp/wparoam-"+GLib.get_user_name();

function init() {
    Lib.initTranslations(Me);
    return new Wpasup.WpaMain(new GnomeUi(), my_socket_file);
}

// vim:sw=4 ts=4 et

