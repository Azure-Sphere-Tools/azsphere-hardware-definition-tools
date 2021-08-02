import { Range } from 'vscode-languageserver-textdocument';

export class AppManifest {
	constructor(
		public ComponentId: string,
		public Capabilities: AppPin,
	) { }
}

export class AppPin {
	constructor(
		public Gpio: AppPinKey<[string | number]>  | undefined,
		public I2cMaster: AppPinKey<[string]> | undefined,
		public Pwm: AppPinKey<[string]> | undefined,
		public Uart: AppPinKey<[string]> | undefined,
		public SpiMaster: AppPinKey<[string]> | undefined,
		public Adc: AppPinKey<[string]> | undefined,
		public AllowedApplicationConnections: [string] | undefined
	) { }
}

export type AppPinKey<T> = {
	range: Range,
	key: {
		range: Range,
		text: string
	},
	value: {
		range: Range,
		text: T
	}
}