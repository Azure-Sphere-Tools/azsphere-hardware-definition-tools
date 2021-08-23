import { CompletionItem, CompletionItemKind } from "vscode-languageserver/node";

import { Position } from "vscode-languageserver-textdocument";
import { HardwareDefinition, isInsideRange, PinMapping } from "./hardwareDefinition";
import { scanHardwareDefinition } from "./validator";

export function getPinMappingSuggestions(hwDefinition: HardwareDefinition, pinType: string): string[] {
  const hwDefScan = scanHardwareDefinition(hwDefinition, true);
  let allPinMappings: PinMapping[] = [];
  const validPinMappings: string[] = [];
  for (const imported of hwDefinition.imports) {
    allPinMappings = allPinMappings.concat(imported.hardwareDefinition.pinMappings);
  }
  const usedPinNames = new Set(hwDefinition.pinMappings.map((p) => p.mapping?.value.text));

  for (const pinMapping of allPinMappings) {
    const pinName = pinMapping.name.value.text;
    const pinAppManifestValue = <string | number>hwDefScan.getAppManifestValue(pinName);

    const pinNotUsed = !usedPinNames.has(pinName);
    const pinControllerConfiguredDifferently = hwDefScan.controllerConfiguredAsDifferentType(pinType, pinAppManifestValue);
    if (pinMapping.type.value.text == pinType && pinNotUsed && !pinControllerConfiguredDifferently) {
      validPinMappings.push(pinName);
    }
  }
  return validPinMappings;
}

export function pinMappingCompletionItemsAtPosition(hwDefinition: HardwareDefinition, caretPosition: Position): CompletionItem[] {
  const validPinMappings: CompletionItem[] = [];
  let caretIsInsidePinMapping = false;
  let pinMappingToComplete = undefined;
  for (const pinMapping of hwDefinition.pinMappings) {
    if (pinMapping.mapping && isInsideRange(caretPosition, pinMapping.mapping.value.range)) {
      caretIsInsidePinMapping = true;
      pinMappingToComplete = pinMapping;
      break;
    }
  }
  if (!caretIsInsidePinMapping || !pinMappingToComplete?.mapping) {
    return [];
  }
  for (const validPinMapping of getPinMappingSuggestions(hwDefinition, pinMappingToComplete.type.value.text)) {
    validPinMappings.push({
      label: `"${validPinMapping}"`,
      kind: CompletionItemKind.Value,
      preselect: true,
      textEdit: {
        range: pinMappingToComplete.mapping.value.range,
        newText: `"${validPinMapping}"`,
      },
    });
  }

  return validPinMappings;
}
