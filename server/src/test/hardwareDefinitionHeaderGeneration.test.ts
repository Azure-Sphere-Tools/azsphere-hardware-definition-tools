import path = require("path");
import * as assert from "assert";
import * as mockfs from "mock-fs";
import { getPinTypes, addPinMappings } from "../pinMappingGeneration";
import * as jsonc from "jsonc-parser";
import * as fs from "fs";
import { hwDefinitionHeaderGen } from "../hardwareDefinitionHeaderGeneration";
import { asURI } from "./testUtils";
import { TextDocument } from "vscode-languageserver-textdocument";
import { CodeActionParams, Diagnostic, Range } from "vscode-languageserver";
import { Position, TextEdit } from "vscode-languageserver-textdocument";

suite("hardwareDefinitionHeaderGeneration", () => {
  const hwDefPath = path.resolve("my_app/hardwareDef.json");

  const textDocument = {
    uri: asURI(hwDefPath),
    languageId: "",
    version: 0,
    getText: function (range?: Range): string {
      return "{{'Name': 'LED_RED', 'Type': 'Gpio', 'Mapping': 'GPIO0'},{'Name': 'LED_BLUE', 'Type': 'Gpio', 'Mapping': 'GPIO0'}}";
    },
    positionAt: function (offset: number): Position {
      throw new Error("Function not implemented.");
    },
    offsetAt: function (position: Position): number {
      throw new Error("Function not implemented.");
    },
    lineCount: 0
  };

  setup(() => {
    mockfs({  "my_app/my_application.json": JSON.stringify(textDocument), "my_app/inc/hw/hardwareDef.h": ""});
  });

  teardown(mockfs.restore);
  test("Run AzureSphere SDK header generation command", async () => {
    const outcome = await hwDefinitionHeaderGen(textDocument);
    if(!outcome) console.log("Hardware definition header generation AS command was not successful.");
    assert.ok(outcome);
    // if (actual) {
    //   assert.deepStrictEqual(actual, ["Gpio"]);
    // } else {
    //   assert.fail("Wrong pin type detected");
    // }
  });
});
