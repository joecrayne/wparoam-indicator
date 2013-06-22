const Gio = imports.gi.Gio;
const GLib = imports.gi.GLib;

function chomp(raw_text)
{
    return raw_text.replace(/(\n|\r)+$/, '');
}
function read_string_array(f) {
    let argv = [""]
    let bEof=false;
    while( !bEof ) {
        let c = null;
        try { c=f.read_byte(null); }
        catch(e) { 
            if( Gio.IOErrorEnum.prototype.isPrototypeOf(e) )
                bEof = true;
            else
                throw e;
            /*
            // _private_Gio_IOErrorEnum
            print("constructor.name: "+ e.constructor.name);
            // "Unexpected early end-of-stream"
            print("Exception message: "+e.message);
            // true
            print("proto: "+Gio.IOErrorEnum.prototype.isPrototypeOf(e));
            */
        }
        if( c ) argv[argv.length-1] += String.fromCharCode(c);
        else    argv.push("");
    }
    if(argv[argv.length-1]=="") argv.pop();
    if(argv[argv.length-1]=="") argv.pop();
    return argv;
}

function arraySplitOn(a,v) {
    let parts = []
    while(a.length>0) {
        let i = a.indexOf(v);
        if(i==-1) {
            parts.push(a);
            break;
        }
        else
            parts.push(a.slice(0,i));
        a = a.slice(i+1,a.length);
    }
    return parts;
}

function beginsWith(str,sub) {
    return str.substr(0,sub.length)==sub;
}

function parse_var(f, v) {
    let retv = null;
    for(;;) {
        let [x,cnt] = f.read_line(null); 
        if(x==null) break;
        x = String(x).replace( /#.*/, "" ).replace(/^[ 	]*/, "");
        if(! beginsWith(x,v+"=") ) continue;
        x = x.substr(v.length+1);
        // print ("x="+x);
        retv = x;
        break;
    }
    return retv;
}

function wpasup_state() {
    let state = []
    let proc = Gio.file_new_for_path("/proc");
    let ec = proc.enumerate_children("", Gio.FileQueryInfoFlags.NOFOLLOW_SYMLINKS, null);
    let f = null;
    while( (f = ec.next_file(null)) ) {
        let pid = f.get_name();
        if( ! pid.match( /^[0-9]*$/ ) ) continue;
        try {
            let commf = Gio.DataInputStream.new(Gio.file_new_for_path("/proc/"+pid+"/comm").read(null));
            // assume close_base_stream defaults to true
            commf.fill(1024,null);
            let comm = chomp( String(commf.peek_buffer()) );
            commf.close(null);
            if(comm!="wpa_supplicant") continue;
            //print( "pid="+pid+ "  comm="+comm);
            let argvf = Gio.DataInputStream.new(Gio.file_new_for_path("/proc/"+pid+"/cmdline").read(null));
            let argv = read_string_array(argvf);
            argvf.close(null);
            //argv.forEach(function(a) { print("arg=\""+a+"\""); });
            let global_ctl = null;
            let gi = argv.indexOf("-g");
            if( gi!=-1) {
                gi++;
                global_ctl = argv[gi];
            }
            let blocks = arraySplitOn(argv,"-N"); // argv.concat(["-N"]).concat(argv).concat(["-N"]).concat(argv), "-N" );
            blocks.forEach(function(b) { 
                //print("block="+b); 
                let i = b.indexOf("-i");
                if(i==-1) return;
                i++;
                let iface = b[i];
                let path_to_socket=null;
                let group = null;
                i = b.indexOf("-c");
                if(i!=-1) {
                    i++;
                    let path_to_conf = b[i];
                    //print("path_to_conf="+path_to_conf);
                    let conf = Gio.DataInputStream.new(Gio.file_new_for_path(path_to_conf).read(null));
                    let ctrl_interface = parse_var(conf, "ctrl_interface");
                    conf.close(null);
                    //print("ctrl_interface="+ctrl_interface);
                    let [_, ctrl_interface_vars] = GLib.shell_parse_argv(ctrl_interface);
                    ctrl_interface_vars = ctrl_interface_vars.map(
                        function(kv) { return kv.split("="); } );
                    let d = {};
                    try {
                        ctrl_interface_vars.forEach(function([k,v]) { d[k]=v; });
                    } catch(e) {}
                    ctrl_interface = d;
                    let dir_to_socket=d["DIR"];
                    //print("dir_to_socket="+dir_to_socket);
                    path_to_socket=dir_to_socket+"/"+iface;
                    group = d["GROUP"];
                }
                else if( -1!=(i=b.indexOf("-C")) ) {
                    i++;
                    path_to_socket=b[i];
                }
                else {
                    path_to_socket=global_ctl;
                }
                state.push( {
                    iface: iface,
                    path_to_socket: path_to_socket,
                    group: group
                } );
                //print("iface="+iface);
                //print("path_to_socket="+path_to_socket);
            });
        }
        catch(e) { print("Exception: "+e);}
    }
    
    return state;
}

/*
let state = wpasup_state();
state.forEach( function(b,i) {
    print("state["+i+"] = {");
    print("  iface="+b.iface);
    print("  path_to_socket="+b.path_to_socket);
    print("  group="+b.group);
    print("}");
});
*/

// vim:sw=4 ts=4 et softtabstop=4
