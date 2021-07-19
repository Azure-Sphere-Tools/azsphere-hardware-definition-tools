import { CompletionItem, CompletionItemKind } from "vscode-languageserver/node";

import { Position } from "vscode-languageserver-textdocument";
import { HardwareDefinition, isInsideRange, PinMapping } from "./hardwareDefinition";
import { validateNamesAndMappings } from "./validator";

export function getPinMappingSuggestions(hwDefinition: HardwareDefinition, pinType = "Gpio"): string[] {
  let allPinMappings: PinMapping[] = [];
  const validPinMappings: string[] = [];
  for (const imported of hwDefinition.imports) {
    allPinMappings = allPinMappings.concat(imported.pinMappings);
  }
  const usedPinNames = new Set(hwDefinition.pinMappings.map((p) => p.mapping));
  const invalidPinMappings: Set<PinMapping> = new Set(validateNamesAndMappings(hwDefinition, true).map((diagnostic) => <PinMapping>diagnostic.data));

  for (const pinMapping of allPinMappings) {
    if (!invalidPinMappings.has(pinMapping) && pinMapping.type == pinType && !usedPinNames.has(pinMapping.name)) {
      validPinMappings.push(pinMapping.name);
    }
  }

  return validPinMappings;
}

export function pinMappingCompletionItemsAtPosition(hwDefinition: HardwareDefinition, caretPosition: Position): CompletionItem[] {
  const validPinMappings: CompletionItem[] = [];
  let caretIsInsidePinMapping = false;
  let pinMappingToComplete = undefined;
  for (const pinMapping of hwDefinition.pinMappings) {
    if (pinMapping.mappingPropertyRange && isInsideRange(caretPosition, pinMapping.mappingPropertyRange)) {
      caretIsInsidePinMapping = true;
      pinMappingToComplete = pinMapping;
      break;
    }
  }
  if (!caretIsInsidePinMapping || !pinMappingToComplete?.mappingPropertyRange) {
    return [];
  }
  for (const validPinMapping of getPinMappingSuggestions(hwDefinition, pinMappingToComplete.type)) {
    validPinMappings.push({
      label: `"${validPinMapping}"`,
      kind: CompletionItemKind.Value,
      preselect: true,
      textEdit: {
        range: pinMappingToComplete.mappingPropertyRange,
        newText: `"${validPinMapping}"`,
      },
    });
  }

  return validPinMappings;
}
