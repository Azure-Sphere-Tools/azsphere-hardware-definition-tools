import { Range, Position } from 'vscode-languageserver-textdocument';

export class HardwareDefinition {
	constructor(
		public uri: string,
		public schema: string | undefined,
		public pinMappings: PinMapping[] = [],
		public imports: Import[] = [],
		public unknownImports: UnknownImport[] = [],
		public sdkDefined: boolean = false
	) { }
}

export type Import = {
	hardwareDefinition: HardwareDefinition,
	range: Range,
	key: {
		range: Range,
		text: string
	},
	value: {
		range: Range,
		text: string
	}
}

/**
 * An imported file which could not be found under the Azure Sphere SDK path or the importing hardware definition file's path
 */
export interface UnknownImport {
	fileName: string,
	sdkPath: string,
	hwDefinitionFilePath: string,
	range: Range
}

export type PinMappingKey<T> = {
	range: Range,
	key: {
		range: Range,
		text: T
	},
	value: {
		range: Range,
		text: T
	}
}

export class PinMapping {
	constructor(
		public range: Range,
		public name: PinMappingKey<string>,
		public type: PinMappingKey<string>,
		public mapping?: PinMappingKey<string>,
		public appManifestValue?: PinMappingKey<string | number>,
		public comment?: PinMappingKey<string>
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

export function toRange(text: string, start: number, end: number, lineOffsets?: number[]): Range {
	return {
		start: toPosition(text, start, lineOffsets),
		end: toPosition(text, end, lineOffsets)
	};
}

export function isInsideRange(position: Position, range: Range) {
	// same line and greater character OR greater line
	const afterRangeStart =
		(position.line == range.start.line && position.character >= range.start.character)
		|| position.line > range.start.line;

	if (afterRangeStart) {
		// same line and smaller character OR smaller line
		const beforeRangeEnd =
			(position.line == range.end.line && position.character <= range.end.character)
			|| position.line < range.end.line;

		return afterRangeStart && beforeRangeEnd;
	}
	return false;
}


/*
* Based off of https://github.com/microsoft/vscode-languageserver-node
*/

export function toPosition(text: string, offset: number, lineOffsets?: number[]): Position {
	offset = Math.max(Math.min(offset, text.length), 0);

	lineOffsets = lineOffsets ?? computeLineOffsets(text, true);
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

export function computeLineOffsets(text: string, isAtLineStart: boolean, textOffset = 0): number[] {
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
