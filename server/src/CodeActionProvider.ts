import { Range } from "jsonc-parser";
import { CodeAction, CodeActionParams, DiagnosticSeverity, CodeActionKind, DiagnosticRelatedInformation, Position} from 'vscode-languageserver';
import { HardwareDefinition, isInsideRange, PinMapping } from "./hardwareDefinition";

export const QUICKFIX_DUPLICATE_MSG = 'is already mapped';

/**
 * find the pin mapping for the warning line
 * @export
 * @param {Position} warnPosition
 * @param {HardwareDefinition} hwDefinition
 * @returns {PinMapping}
 */
export function findPinMappingRange(warnPosition:Position, hwDefinition: HardwareDefinition): PinMapping | undefined{
  let pinMappingToComplete;
  for (const pinMapping of hwDefinition.pinMappings) {
    if (pinMapping.mappingPropertyRange && isInsideRange(warnPosition, pinMapping.range)) {
      pinMappingToComplete = pinMapping;
      break;
    }
  }
  return pinMappingToComplete;
}

/**
 * Provide quickfix only for:
 * When the pin mapping is duplicate 
 * @export
 * @param {HardwareDefinition} hwDefinition
 * @param {CodeActionParams} parms
 * @returns {CodeAction[]}
 */
export function quickfix(hwDefinition: HardwareDefinition, parms: CodeActionParams): CodeAction[]{
    const diagnostics = parms.context.diagnostics;
    if (!diagnostics || diagnostics.length === 0) {
        return [];
    }
    const codeActions: CodeAction[] = [];
    diagnostics.forEach((diag) => {
      const pinMappingToComplete = findPinMappingRange(diag.range.start,hwDefinition);
      if(!pinMappingToComplete || !pinMappingToComplete.mappingPropertyRange){
        return [];
      }

      if (diag.severity === DiagnosticSeverity.Warning && diag.message.includes(QUICKFIX_DUPLICATE_MSG)) {
        codeActions.push({
          title: "Delete the Duplicate pin mapping",
          kind: CodeActionKind.QuickFix,
          diagnostics: [diag],
          edit: {
            changes: {
              [parms.textDocument.uri]: [{
                range: pinMappingToComplete.mappingPropertyRange,  newText: `""`
              }]
            }
          }
        });
        return;
      }
    });

    console.log(codeActions);
    return codeActions;
}
