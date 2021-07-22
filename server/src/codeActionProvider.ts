import { CodeAction, CodeActionParams, CodeActionKind, Position, Diagnostic} from 'vscode-languageserver';
import { DUPLICATE_MAPPING_WARNING_CODE, NONEXISTENT_MAPPING_ERROR_CODE, PIN_BLOCK_CONFLICT_WARNING_CODE } from "./diagnostics";
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
    if (pinMapping.mappingPropertyRange && isInsideRange(warnPosition, pinMapping.range)) {
      pinMappingToComplete = pinMapping;
      break;
    }
  }
  return pinMappingToComplete;
}


export function findWarningCodeAction(codeActions: CodeAction[], warningTitle: string, diag: Diagnostic, parms: CodeActionParams, pinMappingToComplete: PinMapping): void{
  if(!pinMappingToComplete || !pinMappingToComplete.mappingPropertyRange){
    return;
  }
  codeActions.push({
    title: warningTitle,
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

      if (diag.code === DUPLICATE_MAPPING_WARNING_CODE) {
        findWarningCodeAction(codeActions, "Delete the Duplicate pin mapping", diag, parms, pinMappingToComplete);
        return;
      }

      if (diag.code === NONEXISTENT_MAPPING_ERROR_CODE) {
        findWarningCodeAction(codeActions, "Delete the Invalid pin mapping", diag, parms, pinMappingToComplete);
        return;
      }

      if (diag.code === PIN_BLOCK_CONFLICT_WARNING_CODE) {
        findWarningCodeAction(codeActions, "Assign pin mapping to a pin on a different pin block", diag, parms, pinMappingToComplete);
        return;
      }
    });
    return codeActions;
}
