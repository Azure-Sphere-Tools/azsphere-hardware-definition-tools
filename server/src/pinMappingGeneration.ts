import { readFile, writeFile } from "fs/promises";
import * as jsonc from "jsonc-parser";
import { URI } from "vscode-uri";
import { displayErrorNotification } from "./server";

export const currentFile = {
  text: "",
  uri: "",
};

const checkHwDefinition = async (uri: string): Promise<string | undefined> => {
  if (!uri.endsWith(".json")) {
    displayErrorNotification("The current file is not a valid Hardware Definition (Must be a JSON file).");
    return;
  }
  const currentFilePath = URI.parse(uri).fsPath;
  const text = await readFile(currentFilePath, "utf8");

  if (!text) {
    displayErrorNotification("Error reading current file");
    return;
  }
  currentFile.text = text;
  currentFile.uri = currentFilePath;

  return text;
};

export const getPinTypes = async (uri: string) => {
  const text = await checkHwDefinition(uri);
  const pinTypes: string[] = [];

  if (text) {
    const { Peripherals } = jsonc.parse(text);

    for (const peripheral of Peripherals) {
      const { Type } = peripheral;
      if (!pinTypes.includes(Type)) pinTypes.push(Type);
    }

    return pinTypes;
  } else {
    displayErrorNotification("Error parsing current odm.json file.");
    return;
  }
};

export const addPinMappings = async (pinsToAdd: string[], pinType: string, testCurrentFile?: any) => {
  // Use currentFile passed by the test
  const { text, uri } = testCurrentFile ?? currentFile;
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
    } catch (e) {
      console.error(e);
      return [];
    }
  }
};
