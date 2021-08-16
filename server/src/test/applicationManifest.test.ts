import { addAppManifestPathsToSettings } from "../applicationManifest";
import * as assert from "assert";
import * as mockfs from "mock-fs";
import * as path from "path";
import { rm } from "fs/promises";
import * as fs from "fs";
import * as jsonc from "jsonc-parser";
import { URI } from "vscode-uri";
import { Parser } from "../parser";

const settingsPath = "my_app/.workplace/settings.json";
const app_manifestUri = URI.file(path.resolve("my_app/app_manifest.json"));

suite("addAppManifestPathsToSettings", async () => {
  const obj = {
    "my_app/.workplace/settings.json": `{
      "AzureSphere.partnerApplications": {
        "app-id-a": ${JSON.stringify(app_manifestUri.fsPath)},
        "app-id-b": "",
        "app-id-c": ""
      }`,

    "my_app/app_manifest.json": `{
      "ComponentId": "app-id-a",
      "Capabilities": {
        "Gpio": ["$TEMPLATE_LED"],
        "AllowedApplicationConnections": ["app-id-b", "app-id-c"]
      }
    }`,
  };

  setup(() => {
    mockfs(obj);
  });
  teardown(mockfs.restore);


  test("partnerApplications fully filled", async () => {
    const initialSettings = jsonc.parse(fs.readFileSync(settingsPath, { encoding: "utf8" }));
    const actualSettings = await addAppManifestPathsAndReturnSettings();

    if (actualSettings) {
      assert.deepStrictEqual(actualSettings, initialSettings);
    } else {
      assert.fail(`settings.json was not the same`);
    }
  });

  test("Fills 'partnerApplications' if missing", async () => {
    const [initialSettings, settings] = getSettings();

    delete settings["AzureSphere.partnerApplications"];
    saveSettings(settings);

    const actualSettings = await addAppManifestPathsAndReturnSettings();

    if (actualSettings) {
      assert.deepStrictEqual(actualSettings["AzureSphere.partnerApplications"], initialSettings["AzureSphere.partnerApplications"]);
    } else {
      assert.fail("settings.json did not contain the property partnerApplications");
    }
  });

  test("Adds app_manifest's 'ComponentId' if not listed in 'partnerApplications'", async () => {
    const [initialSettings, settings] = getSettings();

    // remove componentId entry
    delete settings["AzureSphere.partnerApplications"]["app-id-a"];
    saveSettings(settings);

    const actualSettings = await addAppManifestPathsAndReturnSettings();

    if (actualSettings["AzureSphere.partnerApplications"]) {
      assert.deepStrictEqual(actualSettings["AzureSphere.partnerApplications"], initialSettings["AzureSphere.partnerApplications"]);
    } else {
      assert.fail("settings.json did not contain the ComponentId path alongside its app_manifest.json path");
    }
  });

  test("Adds app ids from app manifest if not listed under 'partnerApplications'", async () => {
    const [initialSettings, settings] = getSettings();

    // remove AllowedApplicationConnections key
    delete settings["AzureSphere.partnerApplications"]["app-id-c"];
    saveSettings(settings);

    const actualSettings = await addAppManifestPathsAndReturnSettings();

    if (actualSettings["AzureSphere.partnerApplications"]) {
      assert.deepStrictEqual(actualSettings["AzureSphere.partnerApplications"], initialSettings["AzureSphere.partnerApplications"]);
    } else {
      assert.fail("settings.json did not contain all the AllowedApplicationConnections specified in the app_manifest");
    }
  });

  test("Does not update partner app ids already listed in settings file", async () => {
    const [expectedSettings, _] = getSettings();
    expectedSettings["AzureSphere.partnerApplications"]["app-id-c"] = "path/to/some/appmanifest.json";
    saveSettings(expectedSettings);

    const actualSettings = await addAppManifestPathsAndReturnSettings();

    if (actualSettings["AzureSphere.partnerApplications"]) {
      assert.deepStrictEqual(actualSettings["AzureSphere.partnerApplications"], expectedSettings["AzureSphere.partnerApplications"]);
    } else {
      assert.fail("settings.json did not contain all the AllowedApplicationConnections specified in the app_manifest");
    }
  });

  test("Handles non-existent settings file", async () => {
    const [expectedSettings, _] = getSettings();

    // delete settings file
    await rm(settingsPath);

    const actualSettings = await addAppManifestPathsAndReturnSettings();

    if (actualSettings["AzureSphere.partnerApplications"]) {
      assert.deepStrictEqual(actualSettings["AzureSphere.partnerApplications"], expectedSettings["AzureSphere.partnerApplications"]);
    } else {
      assert.fail("settings.json did not contain all the AllowedApplicationConnections specified in the app_manifest");
    }
  });
});

function getSettings(): any[] {
  const initialSettings = jsonc.parse(fs.readFileSync(settingsPath, { encoding: "utf8" }));
  const settings = JSON.parse(JSON.stringify(initialSettings));

  return [initialSettings, settings];
}

/**
 * Tries to add app manifest paths to the settings under settingsPath
 * @returns the actual settings that were modified
 */
async function addAppManifestPathsAndReturnSettings(): Promise<any> {
  const appManifestPath = app_manifestUri.fsPath;
  const appManifest = new Parser().tryParseAppManifestFile(fs.readFileSync(appManifestPath, { encoding: "utf8" }));
  assert.ok(appManifest);
  await addAppManifestPathsToSettings(appManifestPath, appManifest, path.resolve(settingsPath));
  return jsonc.parse(fs.readFileSync(settingsPath, { encoding: "utf8" }));
}

/**
 * Saves settings under settingsPath
 * @param modifiedSettings The settings to save under settingsPath
 */
function saveSettings(modifiedSettings: any) {
  fs.writeFileSync(settingsPath, JSON.stringify(modifiedSettings), {encoding: "utf8"});
}