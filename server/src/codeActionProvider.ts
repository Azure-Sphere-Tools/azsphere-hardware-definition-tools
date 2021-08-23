import { CodeAction, CodeActionParams, CodeActionKind, Position, Diagnostic} from 'vscode-languageserver';
import { DiagnosticCode } from "./diagnostics";
import { HardwareDefinition, isInsideRange, PinMapping } from "./hardwareDefinition";

export const QUICKFIX_DUPLICATE_MSG = 'is already mapped';
export const QUICKFIX_INVALID_MSG = 'is invalid. There is no imported pin mapping with that name.';
export const QUICKFIX_PINBLCOK_MSG = 'configured as';

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
    if (pinMapping.mapping?.value.range && isInsideRange(warnPosition, pinMapping.range)) {
      pinMappingToComplete = pinMapping;
      break;
    }
  }
  return pinMappingToComplete;
}


export function findWarningCodeAction(codeActions: CodeAction[], warningTitle: string, diag: Diagnostic, parms: CodeActionParams, pinMappingToComplete: PinMapping): void{
  if(!pinMappingToComplete || !pinMappingToComplete.mapping?.value.range){
    return;
  }
  codeActions.push({
    title: warningTitle,
    kind: CodeActionKind.QuickFix,
    diagnostics: [diag],
    edit: {
      changes: {
        [parms.textDocument.uri]: [{
          range: pinMappingToComplete.mapping.value.range,  newText: `""`
        }]
      }
    }
  });
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
      if(!pinMappingToComplete || !pinMappingToComplete.mapping){
        return [];
      }

      if (diag.code === DiagnosticCode.DUPLICATE_MAPPING) {
        findWarningCodeAction(codeActions, "Delete the Duplicate pin mapping", diag, parms, pinMappingToComplete);
        return;
      }

      if (diag.code === DiagnosticCode.NONEXISTENT_MAPPING) {
        findWarningCodeAction(codeActions, "Delete the Invalid pin mapping", diag, parms, pinMappingToComplete);
        return;
      }

      if (diag.code === DiagnosticCode.PIN_BLOCK_CONFLICT) {
        findWarningCodeAction(codeActions, "Assign pin mapping to a pin on a different pin block", diag, parms, pinMappingToComplete);
        return;
      }
    });
    return codeActions;
}
