import * as assert from "assert";
import path = require("path");
import { Connection, TextDocuments } from "vscode-languageserver";
import { TextDocument } from "vscode-languageserver-textdocument";
import { LanguageServer } from "../server";
import { asURI } from "./testUtils";

suite("LanguageServer", () => {

  test("Initializes with proper capabilities", async () => {
    const server = new LanguageServer(<Connection><unknown>undefined, <TextDocuments<TextDocument>><unknown>undefined, console);
    const initResult = server.onInitialize({
      rootUri: "",
      processId: 1,
      capabilities: {
        workspace: {
          configuration: true,
          workspaceFolders: true
        },
        textDocument: {
          moniker: {},
          codeAction: { codeActionLiteralSupport: { codeActionKind: { valueSet: [] } } }
        }
      },
      workspaceFolders: [ {name: "Test Workspace Folder", uri: asURI(path.join(__dirname, "sometestfolder"))}]
    });

    assert.ok(initResult.capabilities.workspace?.workspaceFolders?.supported);
    assert.ok(initResult.capabilities.codeActionProvider);
    const expectedDeclaredCommands = [
      "getAvailablePins",
      "getAvailablePinTypes",
      "postPinAmountToGenerate",
      "validateHwDefinition",
      "getAvailableOdmHardwareDefinitions",
      "portHardwareDefinition"
    ];
    assert.deepStrictEqual(initResult.capabilities.executeCommandProvider?.commands, expectedDeclaredCommands);
  });
});
