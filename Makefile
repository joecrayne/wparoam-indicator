modules = extension.js lib.js prefs.js wpacons.js wpaproc.js wpasup.js metadata.json

schemas = schemas/org.gnome.shell.extensions.wparoam.gschema.xml

uuid = $(shell gjs -c "$$(sed 's/^/print (/; s/$$/.uuid)/' metadata.json)")


glib_schema_dir=/usr/share/glib-2.0/schemas
gnome_shell_extension_dir=/usr/share/gnome-shell/extensions

localprefix = $(HOME)/.local/share/gnome-shell/extensions

define newline


endef

all:

install:
	install -d $(DESTDIR)$(gnome_shell_extension_dir)/$(uuid)
	install -d $(DESTDIR)$(glib_schema_dir)
	$(foreach file,$(modules),install -m644 $(file) $(DESTDIR)$(gnome_shell_extension_dir)/$(uuid)/$(newline))
	$(foreach file,$(schemas),install -m644 $(file) $(DESTDIR)$(glib_schema_dir)/)

local-install:
	install -d $(localprefix)/$(uuid)
	install -d $(localprefix)/$(uuid)/locale
	install -d $(localprefix)/$(uuid)/schemas
	$(foreach file,$(modules),install -m644 $(file) $(localprefix)/$(uuid)/$(newline))
	$(foreach file,$(schemas),install -m644 $(file) $(localprefix)/$(uuid)/schemas/)
	glib-compile-schemas $(localprefix)/$(uuid)/schemas

zip-file:
	@echo TODO
