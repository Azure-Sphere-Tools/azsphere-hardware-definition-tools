import { Range, Position } from 'vscode-languageserver-textdocument';

export class HardwareDefinition {
	constructor(
		public uri: string,
		public schema: string | undefined,
		public pinMappings: PinMapping[] = [],
		public imports: HardwareDefinition[] = [],
		public unknownImports: UnknownImport[] = []
	) { }
}

export class PinMapping {
	constructor(
		public name: string,
		public type: string,
		public mapping: string | undefined,
		public appManifestValue: number | string | undefined,
		public range: Range,
		public comment: string | undefined = undefined,
	) { }

	/**
	 * 
	 * @returns true if the pin mapping is at the root hardware definition (usually mt3620.json) 
	 * i.e. has an AppManifestValue property
	 */
	public isRootMapping(): boolean {
		return this.appManifestValue != undefined;
	}
}

/**
 * An imported file which could not be found under the Azure Sphere SDK path or the importing hardware definition file's path
 */
export interface UnknownImport {
	fileName: string,
	sdkPath: string,
	hwDefinitionFilePath: string,
	start: number,
	end: number
}

export function toRange(text: string, start: number, end: number): Range {

	return {
		start: toPosition(text, start),
		end: toPosition(text, end)
	};
}


/*
* Based off of https://github.com/microsoft/vscode-languageserver-node
*/

export function toPosition(text: string, offset: number): Position {
	offset = Math.max(Math.min(offset, text.length), 0);

	const lineOffsets = computeLineOffsets(text, true);
	let low = 0, high = lineOffsets.length;
	if (high === 0) {
		return { line: 0, character: offset };
	}
	while (low < high) {
		const mid = Math.floor((low + high) / 2);
		if (lineOffsets[mid] > offset) {
			high = mid;
		} else {
			low = mid + 1;
		}
	}
	// low is the least x for which the line offset is larger than the current offset
	// or array.length if no line offset is larger than the current offset
	const line = low - 1;
	return { line, character: offset - lineOffsets[line] };
}

function computeLineOffsets(text: string, isAtLineStart: boolean, textOffset = 0): number[] {
	const result: number[] = isAtLineStart ? [textOffset] : [];
	for (let i = 0; i < text.length; i++) {
		const ch = text.charCodeAt(i);
		if (ch === CharCode.CarriageReturn || ch === CharCode.LineFeed) {
			if (ch === CharCode.CarriageReturn && i + 1 < text.length && text.charCodeAt(i + 1) === CharCode.LineFeed) {
				i++;
			}
			result.push(textOffset + i + 1);
		}
	}
	return result;
}

const enum CharCode {
	/**
	 * The `\n` character.
	 */
	LineFeed = 10,
	/**
	 * The `\r` character.
	 */
	CarriageReturn = 13,
}
