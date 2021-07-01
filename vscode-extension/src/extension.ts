import * as path from "path";
import { workspace, ExtensionContext, ExtensionMode } from "vscode";

import {
  LanguageClient,
  LanguageClientOptions,
  ServerOptions,
  TransportKind,
} from "vscode-languageclient/node";

let client: LanguageClient;

export function activate(context: ExtensionContext) {
  let serverModule;
  if (
    context.extensionMode == ExtensionMode.Development ||
    context.extensionMode == ExtensionMode.Test
  ) {
    // if in development/test mode, run language server directly from language server project to enable breakpoints on source code
    serverModule = context.asAbsolutePath(
      path.join("..", "server", "dist", "server.js")
    );
  } else {
    serverModule = context.asAbsolutePath(
      path.join(
        "embedded-language-server",
        "node_modules",
        "azsphere-hardware-definition-language-server",
        "dist",
        "server.js"
      )
    );
  }

  console.log(
    `Extension running in ${ExtensionMode[context.extensionMode]} mode. 
    Running language server from ${serverModule}`
  );
  // The debug options for the server
  // --inspect=16009: runs the server in Node's Inspector mode so VS Code can attach to the server for debugging
  const debugOptions = { execArgv: ["--nolazy", "--inspect=16009"] };

  // If the extension is launched in debug mode then the debug server options are used
  // Otherwise the run options are used
  const serverOptions: ServerOptions = {
    run: { module: serverModule, transport: TransportKind.ipc },
    debug: {
      module: serverModule,
      transport: TransportKind.ipc,
      options: debugOptions,
    },
  };

  // Options to control the language client
  const clientOptions: LanguageClientOptions = {
    // Register the server for json documents and CMakeLists.txt
    documentSelector: [
      { scheme: "file", language: "json" },
      { scheme: "file", language: "plaintext" },
      { scheme: "file", language: "cmake" }
    ],
    synchronize: {
      // Notify the server about file changes to '.clientrc files contained in the workspace
      fileEvents: workspace.createFileSystemWatcher("**/.clientrc"),
    },
  };

  // Create the language client and start the client.
  client = new LanguageClient(
    "azureSphereToolsLanguageServer",
    "AZ Sphere Hardware Language Server",
    serverOptions,
    clientOptions
  );

  // Start the client. This will also launch the server
  client.start();
}

export function deactivate(): Thenable<void> | undefined {
  if (!client) {
    return undefined;
  }
  return client.stop();
}
