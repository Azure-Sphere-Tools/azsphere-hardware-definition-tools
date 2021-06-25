import { TextDocument, Range } from 'vscode-languageserver-textdocument';

export class HardwareDefinition {
	constructor(
		public schema: string | undefined,
		public pinMappings: PinMapping[] = [],
		public imports: HardwareDefinition[] = [],
		public unknownImports: UnknownImport[] = []
	){}
}

export class PinMapping {
	
	constructor(
		public name: string, 
		public type: string, 
		public mapping: string | undefined, 
		public appManifestValue: number | string | undefined,
		public comment: string | undefined,
		public range: Range
	){}

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

export function toRange(textDocument: TextDocument, start: number, end: number): Range {
	return {
		start: textDocument.positionAt(start),
		end: textDocument.positionAt(end)
	};
}