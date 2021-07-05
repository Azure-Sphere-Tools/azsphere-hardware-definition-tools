import * as path from "path";
import { URI } from "vscode-uri";
import { Range } from "vscode-languageserver-textdocument";

export function asURI(hwDefFilePath: string): string {
  return URI.file(path.resolve(hwDefFilePath)).toString();
}

export function range(startLine: number, startChar: number, endLine: number, endChar: number): Range {
  return { start: { line: startLine, character: startChar }, end: { line: endLine, character: endChar } };
}

/**
 * Returns a Range with arbitrary values.
 * Useful for when we need to provide a Range that we don't care about
 */
 export function anyRange(): Range {
  return { start: { line: 0, character: 0 }, end: { line: 0, character: 27 } };
}
