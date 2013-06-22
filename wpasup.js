const Gio = imports.gi.Gio;
const GLib = imports.gi.GLib;
const Mainloop = imports.mainloop;
const Lang = imports.lang;

const Me = function() {
        try      { return imports.misc.extensionUtils.getCurrentExtension().imports; }
        catch(e) { return ( imports.searchPath.unshift('.'), imports ); }
    }();

const Wpaproc = Me.wpaproc;

// Ping every second, scan every 15 seconds.
const PING_INTERVAL = 1000; // ms
const PINGS_PER_SCAN = 15;

// var wpa_gui_path = "/usr/sbin/wpa_gui";

// let wpasups = {}

let debug_hooks = false;

let runloophooks = {}
function debugRemoveHook(src, bExpired) {
    if( debug_hooks ) {
        let name = runloophooks[src];
        delete runloophooks[src];
        let n = Object.keys(runloophooks).length;
        let m = bExpired ? "hook-expired " : "hook-removed ";
        dlog( m + name + " id="+src + " count=" + n );
    }
}
function debugAddHook(name, src) {
    if( debug_hooks ) {
        runloophooks[src] = name;
        let n = Object.keys(runloophooks).length;
        dlog( "hook-added " + name + " id="+ src + " count=" + n );
    }
}
function debugReportHooks() {
    if( debug_hooks ) {
        let n = Object.keys(runloophooks).length;
        if( n>0 ) {
            dlog(n+" leaked hooks");
        }
        else {
            dlog("No leaked hooks.");
        }
        let i=0;
        for( src in runloophooks ) {
            i++;
            dlog(i+". Leaked hook "+runloophooks[src]+" id="+src);
        }
    }
}


let dlog = 
        function() { 
            try       { return global.log } 
            catch (e) { return print;     } }();

function member_of_group(group) {
	let retv = false;
	let command="id -nG";
	try {
		let [res, stdout, stderr, status] = GLib.spawn_command_line_sync(command);
		let groups=String(stdout).replace(/\n/,"").split(" ");
		retv = (-1!=groups.indexOf(group));
	} catch(e) {}
	return retv;
}

function discover_wpasup_socket() {
    let state = Wpaproc.wpasup_state()[0];
    let iface = state.iface;
    dlog("wpa-roam: monitoring "+iface);
    return state.path_to_socket;
}


function beginsWith(str,sub) {
    return str.substr(0,sub.length)==sub;

}

function zip() {
    var args = [].slice.call(arguments);
    var shortest = 
            args.length==0 
            ? [] 
            : args.reduce(function(a,b){
                            return a.length<b.length ? a : b
                          });

    return shortest.map(function(_,i){
                            return args.map(function(array){return array[i]})
                        });
}

/*
function MyGlobal() { this._init(); }
MyGlobal.prototype = {
    _init: function() { 
    },
    log: function(m) { print(m); }
}
if( ! global ) {
    var global = new MyGlobal();
}
*/

function WpaSup ( socfile ) {
    this._init(socfile);
}

WpaSup.prototype = {
    _init: function(socfile) {
        this.localSocketFile = socfile;
        this._reset();
        this._ping_src = null;
        this._scan_counter = 0;
        this._reboot_hook = null;
    },

    _reset: function() {
        let client = new Gio.SocketClient();
        client.set_socket_type(Gio.SocketType.DATAGRAM);
        this.client = client;
        this.handlers = [];
    },

    connect: function() {
        let bErr = false;
        try {
            let la = new Gio.UnixSocketAddress.new(this.localSocketFile);
            let ifaces = Wpaproc.wpasup_state();
            let con_errors = [];
            this.con = null;
            for( var i=0; i<ifaces.length; i++ ) {
                let wpasup = ifaces[i];
                try {
                    // dlog("Trying interface "+wpasup.iface+" at "+wpasup.path_to_socket);
                    let a = new Gio.UnixSocketAddress.new(wpasup.path_to_socket);
                    this.client.set_local_address(la);
                    GLib.unlink(this.localSocketFile);
                    this.con = this.client.connect(a,null);
                    break;
                }
                catch( e ) { con_errors.push({ 
                    e: e, 
                    group: wpasup.group,
                    iface: wpasup.iface
                }); }
            }
            if( !this.con ) {
                if( con_errors.length>0 ) {
                    let msgs = con_errors.map(function(ce) { 
                        return ce.group && !member_of_group(ce.group)
                             ? ce.iface+": "+GLib.get_user_name()+" not in group "+ce.group
                             : ce.iface+": "+ce.e.message; 
                    });
                    throw new Error(msgs.join(". "));
                }
                else {
                    throw Error("Unable to find wpa_supplicant");
                }
            }
            // dlog("connected "+this.con+" con_errors="+con_errors);
            this.outs = new Gio.DataOutputStream.new( this.con.get_output_stream() );
            let fd = this.con.get_socket().get_fd();
            this.ioc = GLib.IOChannel.unix_new( fd );
            // print ("connect this="+this);
            // wpasups[this.ioc] = this;
            if( this.src ) {
                //print("Remove watch");
                Mainloop.source_remove(this.src);
                debugRemoveHook(this.src);
            }
            if( this._ping_src ) {
                // print("remove ping");
                Mainloop.source_remove(this._ping_src);
                debugRemoveHook(this._ping_src);
            }
            this.src = GLib.io_add_watch( this.ioc, 
                                         GLib.PRIORITY_DEFAULT, 
                                         GLib.IOCondition.IN, 
                                         Lang.bind( this, this._input_ready),
                                         null, // user data
                                         null ); // notify 
            debugAddHook("_input_ready", this.src );
            this._ping_src = Mainloop.timeout_add( PING_INTERVAL, Lang.bind(this, this._send_ping) );
            debugAddHook("_ping_src", this._ping_src);
            // print("Added ping: "+this._ping_src);
            this.send("ATTACH",response_ignore);
            // this.ctl.update_status();
            if( "update_status" in this.ehandlers ) {
                this.ehandlers.update_status();
            }
            bErr = false;
            if( this._reboot_hook ) {
                debugRemoveHook(this._reboot_hook, true);
                this._reboot_hook = null;
            }
        }
        catch(e){
            dlog("Connection error: "+e.message);
            this._handle_error(e);
            bErr = true;
        }
        return bErr;
    },

    _mostly_shutdown: function() {
        try {
            this.con.close(null);
            this.con = null;
        } catch( e ) {}
        GLib.unlink(this.localSocketFile);
        if( this.src ) {
            Mainloop.source_remove(this.src);
            debugRemoveHook(this.src);
            this.src = null;
        }
        if( this._ping_src ) {
            Mainloop.source_remove(this._ping_src);
            debugRemoveHook(this._ping_src);
            this._ping_src = null;
        }
        this._reset();
    },

    shutdown: function() {
        this._mostly_shutdown();
        if( this._reboot_hook ) {
            Mainloop.source_remove(this._reboot_hook);
            debugRemoveHook(this._reboot_hook);
        }
    },

    send: function(cmd, handler) {
        this.handlers.push( handler );
        try {
            this.outs.put_string(cmd, null);
        }
        catch( e ) {
            dlog("Write error: "+e.message);
            this._handle_error(e);
        }
    },

    _handle_pong: function (m) {
        // print("-PONG- "+ (new Date()).getTime() + "  con="+this.con);
    },

    _send_ping: function() {
        this.send("PING", Lang.bind(this,this._handle_pong) );
        let bKeep = this.con ? true : false;
        // print("ping keep="+bKeep);
        if( this._scan_counter==0 ) {
            this._scan_counter = PINGS_PER_SCAN;
            this.send("SCAN", response_ignore);
        }
        this._scan_counter--;
        if (bKeep) 
            return true;
        else {
            debugRemoveHook(this._ping_src, true);
            this._ping_src = null;
            return false;
        }
    },

    _handle_response: function(m) {
        if( this.handlers.length==0 ) {
            // tprint("NO-HANDLE: "+m);
            return;
        }
        else {
            // tprint("RESPONSE: "+m);
        }
        
        // let oneoff = new OneOff( this.handlers[0], m );
        // oneoff.set();
        this.handlers[0](m);
        
        // let func = this.handlers[0];
        // func( m );
        let cnt = this.handlers.shift();
    },

    _input_ready: function(ioc,cond) {
        let bKeep = true;
        try {
            let fd = ioc.unix_get_fd();
            let uis = Gio.DataInputStream.new( Gio.UnixInputStream.new(fd,false) );
            uis.set_close_base_stream( false );
            let m = null;
            try {
                let ret = uis.fill(512,null /* Gio.Cancellable */); 
                m = String( uis.peek_buffer() );
            }
            catch( e ) {
                print ("WpaSup._input_ready() READ ERROR: "+ e);
            }
            // print ("input: "+m);
            let epre = m.match(/^<[0-9]*>/);
            if( epre!=null ) {
                // global.log("EVENT "+m);
                this._handle_event(fd, m.substr(epre[0].length));
            }
            else {
                // global.log("RESPONSE "+m);
                this._handle_response(m);
            }
        }
        catch(e) {
            dlog("Read error: "+ e.message);
            this._handle_error(e);
            bKeep = false;
            debugRemoveHook(this.src, true);
        }
        return bKeep; // keep source, false means remove
    },

    _handle_event: function( fd, m ) {
        // tprint("EVENT: "+m);
        let e = m.split(' ')[0];
        if( e in this.ehandlers )  {
            //let oneoff = new OneOff( Lang.bind(this.ehandlers, this.ehandlers[e]), m );
            //oneoff.set();
            this.ehandlers[e]( m );
        }
        // else { global.log("wpa-roam unhandled: "+m); }
        if( e == "CTRL-EVENT-SCAN-RESULTS" ) {
            this._scan_counter = PINGS_PER_SCAN;
        }
    },

    set_event_handler: function( ehandlers ) {
        this.ehandlers = ehandlers;
    },

    _handle_error: function(e) {
        // print("REBOOT in 10: "+e);
        this._mostly_shutdown();
        if( ! this._reboot_hook ) {
            this._reboot_hook = Mainloop.timeout_add( 10000, Lang.bind(this,this.connect) );
            debugAddHook("reboot", this._reboot_hook);
        }
        if( "error_event" in this.ehandlers ) {
            this.ehandlers.error_event(e);
        }
        else this._handle_event( this.fd, "CTRL-EVENT-DISCONNECTED " + e.message );
    },

    // set_on: function( e, func ) { this.ehandlers[e] = func; },

    localSocketFile: null,
    client: null,
    con:    null,
    outs:   null,
    ioc:    null,
    src:    null,
    handlers: [],
    ehandlers: null // {}
}

function response_ignore(ok) {  } // print ("IGNORE-OK: "+ok); }


function fix_level(raw) {
    if( !raw || raw >= -20 ) return 4;
    else if( raw >= -60 ) return 3;
    else if( raw >= -80 ) return 2;
    else return 1;
}

function get_signal_level( results, bssid ) {
    let r = results ? results[bssid] : null;
    let raw = r ? r["signal level"] : 0;
    return fix_level(raw);
}

function EventHandler(wpasup,ui) {
    this._init(wpasup,ui);
}

EventHandler.prototype = {
    _init: function( wpasup, ui ) { 
        this.wpasup = wpasup;
        this.ui = ui;
        this._mode = 0; // disconnected
        this._netname = ""; 
        this._bssid = "";
        this._signal = 0;
        this._scan_results = {};
        this._update_status_src = null;
    },

    _response_status: function (stat) {
        let lines = stat.split('\n');
        let d = {};
        lines.forEach(function(kv) {
            let [k,v] =  kv.split('=');
            d[k] = v;
        } );
        // print( "STATUS:\n"+stat);
        let n = d["ssid"];
        if( n ) {
            //let oneoff = new OneOff( Lang.bind(this.ui, this.ui.update_connection_name), n );
            //oneoff.set();
            let addr = d["ip_address"];
            // print("response this._scan_results="+this._scan_results);
            let signal = get_signal_level( this._scan_results, d["bssid"] );
            if( addr ) {
                if( this._mode!=2 || this._bssid!=d["bssid"] || this._signal!=signal ) 
                    this.ui.connected( n, signal);
                this._mode = 2; 
                this._netname = n;
                this._bssid = d["bssid"];
                this._signal = signal;
                this._removeStatusTimer();
            }
            else {
                if( this._mode!=1 /* pending */  || this._netname!=n || this._signal!=signal) {
                    this.ui.pending( n, signal );
                }
                this._mode = 1;
                this._netname = n
                this._bssid = d["bssid"];
                this._signal = signal;
                if(!this._update_status_src) {
                    this._update_status_src = Mainloop.timeout_add( 200, Lang.bind( this, this.update_status ) );
                    debugAddHook("update_status", this._update_status_src);
                }
            }
        }
        else {
            //let oneoff  = new OneOff( Lang.bind(this.ui, this.ui.update_connection_name), "-" );
            //oneoff.set();
            this.ui.disconnected(""); // update_connection_name( "-" );
            this._mode = 0;
            this._netname = "";
            this._bssid = "";
            this._signal = 0;
            this._removeStatusTimer();
        }
    },

    disable: function() {
        this._removeStatusTimer();
    },

    _removeStatusTimer: function() {
        if(this._update_status_src) {
            Mainloop.source_remove(this._update_status_src);
            debugRemoveHook(this._update_status_src);
            this._update_status_src = null;
        }
    },


    _response_scan: function(results) {
        // print("scan-results:\n"+results);
        let lines = results.split('\n');
        let headers = lines.shift().split(' / ');
        // print("headers = "+headers);
        let split2 = function(s) { 
                        let xs = s.split('\t');
                        return xs.length<2 ? [] : xs;
        }
        let es = lines.map( function(s) { return zip(headers,split2(s)); } );
        es = es.map( function(r) { 
                let d={}; 
                r.forEach(function([k,v]) { d[k]=v; } );
                return d;
             } );
        let d = {}
        es.forEach( function(r) {
            if( "bssid" in r ) {
                let bssid = r["bssid"];
                d[bssid] = r;
            }
        });
        this._scan_results = d;
        this.update_status();
    },

    update_status: function() {
        // Lang.bind(this.wpasup, this.wpasup.send)("STATUS", Lang.bind(this,this._response_status));
        this.wpasup.send("STATUS", Lang.bind(this, this._response_status));
        return true;
    },

    error_event: function(e) {
        // print("ERROR EVENT: "+e);
        if( this.ui.error_event ) {
            this.ui.error_event(e);
            this._mode=0; // prevent disconnect notify to ui
        }
        Lang.bind(this,this["CTRL-EVENT-DISCONNECTED"])(e.message);
    },

    "CTRL-EVENT-CONNECTED" : function(m) {
        /*
        let oneoff = new OneOff( Lang.bind(this,update_status), null );
        oneoff.set();
        */
        // tprint("EVENT-con: "+m);
        if( this._mode!=2 /* connected */ ) 
            this.update_status(); // Lang.bind(this,this.update_status)();
    },

    "CTRL-EVENT-DISCONNECTED": function(m) {
        /*
        let oneoff  = new OneOff( Lang.bind(this.ui, this.ui.update_connection_name), "-" );
        oneoff.set();
        */
        if( this._mode!=0 /* disconnected */ )
            this.ui.disconnected(""); // update_connection_name("-");
        this._mode = 0;
        this._netname = "";
        this._bssid = "";
        this._signal = 0;
    },

    "Trying": function(m) {
        // Trying to associate with a0:21:b7:61:fb:9a (SSID='Samantha' freq=2437 MHz)
        let ms = m.match( /.* ([a-f0-9][a-f0-9]:[a-f0-9][a-f0-9]:[a-f0-9][a-f0-9]:[a-f0-9][a-f0-9]:[a-f0-9][a-f0-9]:[a-f0-9][a-f0-9]) \(SSID='(.*)' / );
        let bssid = ms[1];
        let ssid = ms[2];
        let signal = get_signal_level(this._scan_results, bssid);
        if( this._mode!=1 /* pending */  || this._netname!=ssid || this._bssid!=bssid
                || this._signal!=signal ) {
            // print("Trying this._scan_results="+this._scan_results);
            this.ui.pending( ssid, signal );
        }
        this._mode = 1;
        this._netname = ssid;
        this._bssid = bssid;
        this._signal = signal;
    },

    "CTRL-EVENT-SCAN-RESULTS": function(m) {
        this.wpasup.send("SCAN_RESULTS", Lang.bind(this,this._response_scan) );
    },
    
    // Associated with xx:xx:xx:xx:xx:xx
    // CTRL-EVENT-BSS-ADDED n xx:xx:xx:xx:xx:xx

    wpasup: null,
    ui: null
}

function WpaMain(ui, socketfile) { this._init(ui,socketfile); }
WpaMain.prototype = {

    _init: function (ui, wpasup_gs_socket) {
        this.wpasup = new WpaSup(wpasup_gs_socket);
        this.ctl = new EventHandler(this.wpasup, ui);
        this.wpasup.set_event_handler( this.ctl );
        this.ui = ui;
    },

    enable: function() {
        this.wpasup.connect();
        // this.wpasup.send("ATTACH",response_ignore);
        // this.ctl.update_status();
        this.ui.enable();
    },

    disable: function() {
        //dlog("Disabling wpa-roam");
        this.ui.disable();
        this.wpasup.shutdown();
        this.ctl.disable();
        debugReportHooks();
    },

    wpasup: null,
    ctl:    null
}

// vim:sw=4 ts=4 et softtabstop=4
