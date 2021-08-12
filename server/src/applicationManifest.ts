import { Range } from 'vscode-languageserver-textdocument';
import { readFile, writeFile, appendFile, mkdir } from "fs/promises";
import * as fs from "fs";
import * as path from "path";
import { URI } from "vscode-uri";
import * as jsonc from "jsonc-parser";
import { Logger } from "./utils";

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
		public AllowedApplicationConnections: [string] | undefined,
		public RecordMap: Map<string, any>
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


export const addAppManifestPathsToSettings = async (uri: string, settingsPath: string, logger: Logger = console): Promise<string[]> => {
  if (uri && settingsPath) {
    const app_manifestPath = URI.parse(uri).fsPath;
    const {
      ComponentId,
      Capabilities: { AllowedApplicationConnections },
    } = jsonc.parse(await readFile(app_manifestPath, "utf8"));

    if (ComponentId && Array.isArray(AllowedApplicationConnections) && AllowedApplicationConnections.length) {
      const detectedPartnerApplicationIds = AllowedApplicationConnections.map(id => String(id));

      if (!fs.existsSync(settingsPath)) {
        try {
					const settingsDir = path.dirname(settingsPath);
					if (!fs.existsSync(settingsDir)) {
						await mkdir(settingsDir, { recursive: true });
					}
          await appendFile(settingsPath, "{}", { flag: "wx" });
        } catch (e) {
          logger.error(e);
          return [];
        }
      }
      const settingsTxt = await readFile(settingsPath, "utf8");
      const settings = jsonc.parse(settingsTxt);
      const applications: Record<string, unknown> = {};
      const partnerApplicationsFromSettings = settings["AzureSphere.partnerApplications"];
      // add all partner applications from settings
      if (partnerApplicationsFromSettings) {
        for (const appId in partnerApplicationsFromSettings) {
          const partnerAppManifestPath = partnerApplicationsFromSettings[appId];
          applications[appId] = partnerAppManifestPath;

        }
      }

      let settingsShouldBeUpdated = false;

      // always keep the path to the current app manifest up to date
      if (!applications[ComponentId] || applications[ComponentId] !== app_manifestPath) {
        applications[ComponentId] = app_manifestPath;
        settingsShouldBeUpdated = true;
      }

      // add entries for each componentId in AllowedApplicationConnections, user will need to add path
      for (const id of AllowedApplicationConnections) {
        if (applications[id] === null || applications[id] === undefined) {
          applications[id] = "";
          settingsShouldBeUpdated = true;
        }
      }

      if (settingsShouldBeUpdated) {
        const edits = jsonc.modify(settingsTxt, ["AzureSphere.partnerApplications"], applications, { formattingOptions: { insertSpaces: true } });
        try {
          await writeFile(settingsPath, jsonc.applyEdits(settingsTxt, edits));
        } catch (e) {
          logger.error(e);
          return [];
        }
      }

      return detectedPartnerApplicationIds;
    }
  }
  return [];
};