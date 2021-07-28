import { writeFile } from "fs/promises";
import * as jsonc from "jsonc-parser";
import { URI } from "vscode-uri";
import { HardwareDefinition } from "./hardwareDefinition";
import { displayErrorNotification } from "./server";

function checkHwDefinition(importedHwDef: HardwareDefinition): Set<string> {

  const pinTypes = new Set<string>();

  const Peripherals = importedHwDef.pinMappings;

  for (const peripheral of Peripherals) {
    const pinType = peripheral.type.value.text;
    if (!pinTypes.has(pinType)) pinTypes.add(pinType);
  }

  return pinTypes;
}

export async function getPinTypes(hwDefinition: HardwareDefinition): Promise<string[] | undefined> {

  try {
    if (hwDefinition.imports.length > 0) {
      const pinTypes = new Set<string>();
      for (const hwDefImport of hwDefinition.imports) {
        const pinTypesInImport = checkHwDefinition(hwDefImport);
        pinTypesInImport.forEach(p => pinTypes.add(p));
      }
      return Array.from(pinTypes);
    } else {
      displayErrorNotification(`Hardware Definition file does not have any imports to generate pins from.`);
    }
  } catch (err) {
    displayErrorNotification(`Import Hardware Definition not found - ${err}.`);
    return;
  }
}

export const addPinMappings = async (pinsToAdd: string[], pinType: string, hwDefUri: string, hwDefText: string) => {
  // Use currentFile passed by the test

  if (pinsToAdd && pinType) {
    const { Peripherals } = jsonc.parse(hwDefText);

    if (Peripherals) {
      pinsToAdd.forEach((pin) =>
        Peripherals.push({
          Name: "",
          Type: pinType,
          Mapping: pin,
        })
      );
    }

    const edits = jsonc.modify(hwDefText, ["Peripherals"], Peripherals, { formattingOptions: { insertSpaces: true } });
    try {
      await writeFile(URI.parse(hwDefUri).fsPath, jsonc.applyEdits(hwDefText, edits));
    } catch (err) {
      displayErrorNotification(`Failed to add new pin mappings to ${hwDefUri} - ${err}.`);
    }
  }
};
