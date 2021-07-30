import { homedir } from "os";
import * as path from "path";
import { workspace, ExtensionContext, ExtensionMode, commands, window, InputBoxOptions, QuickPickItem } from "vscode";
import { LanguageClient, LanguageClientOptions, ServerOptions, TransportKind } from "vscode-languageclient/node";

let client: LanguageClient;

export function activate(context: ExtensionContext) {
  let serverModule: string;
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
    commands.registerCommand("azsphere-hardware-definition-tools.generatePinMappings", () => generatePinMappings())
  );
}

const generatePinMappings = async () => {
  const currentlyOpenTabfileUri: string = window.activeTextEditor?.document.uri.toString();
  const pinTypes: string[] = await commands.executeCommand("getAvailablePinTypes", currentlyOpenTabfileUri);

  await window
    .showQuickPick(pinTypes, {
      canPickMany: false,
      placeHolder: "Select a pin type to add",
    })
    .then(async (pinTypeSelected) => {
      if (!pinTypeSelected) {
        return;
      }

      const pinAmount: string[] = await commands.executeCommand("getAvailablePins", currentlyOpenTabfileUri, pinTypeSelected);

      // Map number of available pin mappings
      const pins = [...Array(pinAmount.length + 1)].map((_, i) => i.toString()).slice(1);

      window
        .showQuickPick(pins, {
          placeHolder: `Choose the number of ${pinTypeSelected} pins you want to add.`,
        })
        .then(async (pinAmountSelected) => {
          if (!pinAmountSelected) {
            return;
          }

          const pinsToAdd: string[] = pinAmount.slice(0, Number(pinAmountSelected));
          commands.executeCommand("postPinAmountToGenerate", currentlyOpenTabfileUri, pinsToAdd, pinTypeSelected);
        });
    });
};

export function deactivate(): Thenable<void> | undefined {
  if (!client) {
    return undefined;
  }
  return client.stop();
}
