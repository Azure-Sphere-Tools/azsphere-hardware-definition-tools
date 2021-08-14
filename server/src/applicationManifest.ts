import { Range } from 'vscode-languageserver-textdocument';

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
    public RecordMap: Map<string, AppPinKey<any>>,
  ) { }

  allowedAppConnectionsRange(): Range | undefined {
    return this.RecordMap.get("AllowedApplicationConnections")?.value.range;
  }
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

/**
 * Finds the app ids/app manifest paths that should be added in settings based on the given app manifest
 * @param appManifestPath Path to the given app manifest
 * @param appManifest App manifest under which to search for partner applications
 * @param partnerAppsFromSettings Map of app id to app manifest paths that already exists in the settings
 * @returns Record<string, string> where each key is an app id and its value is the path to the app manifest
 */
export const partnerAppsToAddInSettings = async (appManifestPath: string, appManifest: AppManifest, partnerAppsFromSettings: Map<string, string>): Promise<Record<string, string>> => {
  const {
    ComponentId,
    Capabilities: { AllowedApplicationConnections },
  } = appManifest;

  if (ComponentId && Array.isArray(AllowedApplicationConnections) && AllowedApplicationConnections.length) {
    const detectedPartnerApplicationIds = AllowedApplicationConnections.map(id => String(id));

      
      const applications: Record<string, string> = {};

      // add entries for each componentId in AllowedApplicationConnections, user will need to add path
      for (const id of detectedPartnerApplicationIds) {
        if (!partnerAppsFromSettings.has(id)) {
          applications[id] = "";
        }
      }
      
      // always keep the path to the current app manifest up to date
      if (!partnerAppsFromSettings.has(ComponentId) || partnerAppsFromSettings.get(ComponentId) !== appManifestPath) {
        applications[ComponentId] = appManifestPath;
      }

      return applications;
    }

  return {};
};