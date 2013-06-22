imports.searchPath.unshift('.');
const Wpasup = imports.wpasup;
const Mainloop = imports.mainloop;
const GLib = imports.gi.GLib;

function ConsoleUi() {
    this._init();
}
ConsoleUi.prototype = {
    _init: function() {
    },

    enable: function() {
    },

    disable: function() {
    },

    disconnected: function( m ) {
        print( "DISCONNECTED." );
    },

    pending: function( m, signal ) {
        print( "PENDING: "+m+" (signal="+signal+")" );
    },

    connected: function( m, signal ) {
        print( "CONNECTED: "+m+" (signal="+signal+")" );
    },

    error_event: function( e ) {
        print("ERROR: "+e.message);
    }

}


let my_socket_file = "/tmp/wpacons-"+GLib.get_user_name();

function Main() {
    let quit_time = 0;
    try {
        if(ARGV.length>0) {
            quit_time = parseInt(ARGV[0]);
        }
    } catch(e) {}
    let obj = new Wpasup.WpaMain(new ConsoleUi(), my_socket_file);
    obj.enable();
    if( quit_time > 0 ) {
        print("Quitting in "+quit_time+" miliseconds.");
        Mainloop.timeout_add( quit_time, function() { Mainloop.quit("wpasup-gs"); });
    }
    Mainloop.run("wpasup-gs");
    obj.disable();
}

Main();

// vim:sw=4 ts=4 et

