import * as assert from "assert";
import { isInsideRange, toRange, toPosition } from "../hardwareDefinition";
import { Position, Range } from "vscode-languageserver-textdocument";


suite("isInsideRange", () => {
  // For every test case, ranges are representend by "<>" and the caret by "|".
  // We check assert whether the caret is inside or outside a given range.
  test("Returns true if caret position is inside single-line range", () => {
    const testCases: Record<string, string> = {
      case_1: "<|    >",
      case_2: "<  |  >",
      case_3: "<    |>",

    };
    for (const testCaseName in testCases) {
      const testCase = testCases[testCaseName];
      const caret = caretPosition(testCase);
      const range = testCaseRange(testCase);
      assert.ok(isInsideRange(caret, range), `"${testCaseName}" failed`);

    }
  });


  test("Returns true if caret position is inside multi-line range", () => {
    const testCases: any = {
      case_1:
        `
        <|    
                 >
        `,
      case_2:
        `
        <          |
                 >
        `,
      case_3:
        `
        <    
           |     >
        `,
      case_4:
        `
        <    
                    |     
                 >
        `,
      case_5:
        `
        <         
                |>
        `
    };

    for (const testCaseName in testCases) {
      const testCase = testCases[testCaseName];
      const caret = caretPosition(testCase);
      const range = testCaseRange(testCase);
      assert.ok(isInsideRange(caret, range), `"${testCaseName}" failed`);
    }
  });

  test("Returns false if caret position is outside single-line range", () => {
    const testCases: any = {
      case_1: "|<     >",
      case_2: " <     >|",
      case_3: " <     >     |"
    };

    for (const testCaseName in testCases) {
      const testCase = testCases[testCaseName];
      const caret = caretPosition(testCase);
      const range = testCaseRange(testCase);
      assert.strictEqual(isInsideRange(caret, range), false, `"${testCaseName}" failed`);

    }
  });


  test("Returns false if caret position is outside multi-line range", () => {
    const testCases: any = {
      case_1:
        `
        |<    
              >
        `,
      case_2:
        `
           | 
        <         
              >
        `,
      case_3:
        `
        <          
              >|
        `,
      case_4:
        `
        <          
              >
           |    
        `
    };
    for (const testCaseName in testCases) {
      const testCase = testCases[testCaseName];
      const caret = caretPosition(testCase);
      const range = testCaseRange(testCase);
      assert.strictEqual(isInsideRange(caret, range), false, `"${testCaseName}" failed`);
    }
  });
});



function caretPosition(testCase: string): Position {
  return toPosition(testCase, testCase.indexOf("|"));
}

function testCaseRange(testCase: string): Range {
  return toRange(testCase, testCase.indexOf("<"), testCase.indexOf(">"));
}