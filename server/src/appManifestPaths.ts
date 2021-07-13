import { readFile, writeFile, appendFile } from "fs/promises";
import * as fs from "fs";
import { URI } from "vscode-uri";
import * as jsonc from "jsonc-parser";

export const addAppManifestPathsToSettings = async (uri: string, settingsPath: string, logError = console.error): Promise<string[]> => {
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
          await appendFile(settingsPath, "{}", { flag: "wx" });
        } catch (e) {
          logError(e);
          return [];
        }
      }
      const settingsTxt = await readFile(settingsPath, "utf8");
      const settings = jsonc.parse(settingsTxt);
      let applications: Record<string, unknown> = {};
      const partnerApplications = settings["AzureSphere.partnerApplications"];
      // add default application if !partnerApplications key, object with id as ComponentId doesn't exist, (ComponentId exists but path is not defined), path is defined but has changed
      if (!partnerApplications) {
        applications = { [ComponentId]: app_manifestPath };
      } else if (!partnerApplications[ComponentId] || !!partnerApplications.ComponentId || partnerApplications.ComponentId !== app_manifestPath) {
        applications[ComponentId] = app_manifestPath;
      }

      // add entries for each componentId in AllowedApplicationConnections, user will need to add path
      for (const id of AllowedApplicationConnections) {
        if (!applications[id]) {
          applications[id] = "";
        }
      }

      const edits = jsonc.modify(settingsTxt, ["AzureSphere.partnerApplications"], applications, { formattingOptions: { insertSpaces: true } });
      try {
        await writeFile(settingsPath, jsonc.applyEdits(settingsTxt, edits));
      } catch (e) {
        logError(e);
        return [];
      }
      return detectedPartnerApplicationIds;
    }
  }
  return [];
};
