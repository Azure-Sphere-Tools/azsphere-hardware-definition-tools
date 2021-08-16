import { Range } from 'vscode-languageserver-textdocument';
import { readFile, writeFile, appendFile, mkdir } from "fs/promises";
import * as fs from "fs";
import * as path from "path";
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
    public Gpio: AppPinKey<(string | number)[]> | undefined,
    public I2cMaster: AppPinKey<(string | number)[]> | undefined,
    public Pwm: AppPinKey<(string | number)[]> | undefined,
    public Uart: AppPinKey<(string | number)[]> | undefined,
    public SpiMaster: AppPinKey<(string | number)[]> | undefined,
    public Adc: AppPinKey<(string | number)[]> | undefined,
    public AllowedApplicationConnections: string[] | undefined,
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


export const addAppManifestPathsToSettings = async (appManifestPath: string, appManifest: AppManifest, settingsPath: string, logger: Logger = console): Promise<string[]> => {
  const {
    ComponentId,
    Capabilities: { AllowedApplicationConnections },
  } = appManifest;

  if (ComponentId && Array.isArray(AllowedApplicationConnections) && AllowedApplicationConnections.length) {
    const detectedPartnerApplicationIds = AllowedApplicationConnections.map(id => String(id));

    if (!fs.existsSync(settingsPath)) {
      try {
        const settingsDir = path.dirname(settingsPath);
        if (!fs.existsSync(settingsDir)) {
          await mkdir(settingsDir, { recursive: true });
        }
        await appendFile(settingsPath, "{}", { flag: "wx" });
      } catch (e: any) {
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
    if (!applications[ComponentId] || applications[ComponentId] !== appManifestPath) {
      applications[ComponentId] = appManifestPath;
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
      } catch (e: any) {
        logger.error(e);
        return [];
      }
    }

    return detectedPartnerApplicationIds;
  }

  return [];
};