import { homedir } from "os";
import * as path from "path";
import * as fs from "fs";
import { workspace, ExtensionContext, ExtensionMode, commands, window, InputBoxOptions, QuickPickItem } from "vscode";
import { LanguageClient, LanguageClientOptions, ServerOptions, TransportKind } from "vscode-languageclient/node";

let client: LanguageClient;

export function activate(context: ExtensionContext) {
  let serverModule;
  if (context.extensionMode == ExtensionMode.Development || context.extensionMode == ExtensionMode.Test) {
    // if in development/test mode, run language server directly from language server project to enable breakpoints on source code
    serverModule = context.asAbsolutePath(path.join("..", "server", "dist", "server.js"));
  } else {
    serverModule = context.asAbsolutePath(path.join("embedded-language-server", "node_modules", "azsphere-hardware-definition-language-server", "dist", "server.js"));
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
      { scheme: "file", language: "cmake" },
    ],
    synchronize: {
      // Notify the server about file changes to '.clientrc files contained in the workspace
      fileEvents: workspace.createFileSystemWatcher("**/.clientrc"),
    },
  };

  // Create the language client and start the client.
  client = new LanguageClient("azureSphereToolsLanguageServer", "AZ Sphere Hardware Language Server", serverOptions, clientOptions);

  // Start the client. This will also launch the server
  const disposable = client.start();

  context.subscriptions.push(
    disposable,
    commands.registerCommand("azsphere-hardware-definition-tools.availablePins", () => displayHwDefinitionList())
  );

  const BOARDS = [
    "Avnet MT3620 Starter Kit",
    "MT3620 reference development board",
    "Seeed MT3620 Mini Development Board",
    "Open new hardware definition"
  ];

  const fileExplorerOptions = {
    canSelectMany: false,
    filters: {
      'HardwareDefinitions': ['json']
    }
  };

  context.subscriptions.push(
    commands.registerCommand("azsphere-hardware-definition-tools.porting", () => {
      window.showQuickPick(BOARDS)
        .then(response => {
          if (response == BOARDS[BOARDS.length - 1]) {
            window.showOpenDialog(fileExplorerOptions)
              .then(response => {
                window.showInformationMessage(response[0].path);
              });
          } else {
            window.showInformationMessage(response);
          }
        });
    })
  );
}

const displayHwDefinitionList = async () => {
  const currentlyOpenTabfilePath: string = window.activeTextEditor?.document.uri.fsPath;
  commands.executeCommand("availablePins", currentlyOpenTabfilePath);
};

export function deactivate(): Thenable<void> | undefined {
  if (!client) {
    return undefined;
  }
  return client.stop();
}
