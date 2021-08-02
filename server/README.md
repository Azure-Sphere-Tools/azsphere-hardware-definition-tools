# Language Server
This `server` project contains the source code for the Azure Sphere Hardware Language Server.
It is IDE agnostic and can be embedded within different IDE extensions to offer "language" support for hardware definition files.

The language server runs as a separate process which communicates with "clients" (i.e. an extension) via JSON-RPC to offer utilities like code completion. So while the language server "binaries" should be embedded in extensions using it, every extension will spawn it as a separate process to interact with it.

The `pack-server.sh` script can be run to pack the language server into a tarball under `packed/language-server.tar.gz` which can then be referenced and embedded by extensions that use it.