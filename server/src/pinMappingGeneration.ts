import { readFile, writeFile } from "fs/promises";
import * as jsonc from "jsonc-parser";
import path = require("path");
import { URI } from "vscode-uri";
import { displayErrorNotification, getText } from "./server";

export const my_appmanifest = { text: "", uri: "" };

const checkHwDefinition = async (Path: string): Promise<string[] | undefined> => {
  if (!Path.endsWith(".json")) {
    displayErrorNotification("The current file is not a valid Hardware Definition (Must be a JSON file).");
    return;
  }
  const text = await getText(Path).catch((err) => {
    displayErrorNotification(`The Hardware Definition you are trying to import does not exist (Check its file path) - ${err}`);
    return;
  });
  const pinTypes: string[] = [];

  if (text) {
    const { Peripherals } = jsonc.parse(text);

    if (Peripherals) {
      for (const peripheral of Peripherals) {
        const { Type } = peripheral;
        if (!pinTypes.includes(Type)) pinTypes.push(Type);
      }

      return pinTypes;
    } else {
      displayErrorNotification("The imported Hardware Definition does not have any pins defined.");
    }
  } else {
    displayErrorNotification("Error parsing current odm.json file.");
    return;
  }
};

export const getPinTypes = async (uri: string) => {
  const text = await getText(uri);

  if (text) {
    const {
      Imports: [{ Path }],
    } = jsonc.parse(text);

    if (Path) {
      my_appmanifest.text = text;
      my_appmanifest.uri = uri;

      return checkHwDefinition(path.resolve(path.join(path.dirname(URI.parse(uri).fsPath)), Path));
    } else {
      displayErrorNotification("Import Hardware Definition not found.");
    }
  }
};

export const addPinMappings = async (pinsToAdd: string[], pinType: string, testCurrentFile?: any) => {
  // Use currentFile passed by the test
  const { text, uri } = testCurrentFile ?? my_appmanifest;

  if (text && uri && pinsToAdd && pinType) {
    const { Peripherals } = jsonc.parse(text);

    if (Peripherals) {
      pinsToAdd.forEach((pin) =>
        Peripherals.push({
          Name: "",
          Type: pinType,
          Mapping: pin,
        })
      );
    }

    const edits = jsonc.modify(text, ["Peripherals"], Peripherals, { formattingOptions: { insertSpaces: true } });
    try {
      await writeFile(uri, jsonc.applyEdits(text, edits));
    } catch (err) {
      displayErrorNotification(`Failed to add new pin mappings to ${uri} - ${err}.`);
    }
  }
};
