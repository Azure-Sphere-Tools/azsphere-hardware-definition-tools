import { partnerAppsToAddInSettings, AppManifest } from "../applicationManifest";
import * as assert from "assert";
import * as path from "path";
import { Parser } from "../parser";

const appManifestPath = path.resolve("my_app/app_manifest.json");

const getInitialPartnerAppSettings = () => new Map<string, string>([
  ["app-id-a", appManifestPath],
  ["app-id-b", ""],
  ["app-id-c", ""]
]); 
const appManifest = <AppManifest>new Parser().tryParseAppManifestFile(
  `{
    "ComponentId": "app-id-a",
    "Capabilities": {
      "Gpio": ["$TEMPLATE_LED"],
      "AllowedApplicationConnections": ["app-id-b", "app-id-c"]
    }
  }`
);

suite("partnerAppsToAddInSettings", async () => {

  test("partnerApplications fully filled", async () => {
    const initialSettings = getInitialPartnerAppSettings();

    const partnerAppsToAdd = await partnerAppsToAddInSettings(appManifestPath, appManifest, initialSettings);

    assert.strictEqual(Object.keys(partnerAppsToAdd).length, 0, "Shouldn't have any new apps to add when partnerApps fully filled");
  });

  test("Fills all partner apps if missing", async () => {
    const emptySettings = new Map<string, string>();

    const partnerAppsToAdd = await partnerAppsToAddInSettings(appManifestPath, appManifest, emptySettings);

    const expectedSettings = getInitialPartnerAppSettings();
    assert.deepStrictEqual(new Map(Object.entries(partnerAppsToAdd)), expectedSettings);
  });

  test("Adds app_manifest's 'ComponentId' if not listed in existing settings", async () => {
    const settingsWithComponentId = getInitialPartnerAppSettings();


    // remove componentId entry
    const settings = getInitialPartnerAppSettings();
    settings.delete("app-id-a");

    const partnerAppsToAdd = await partnerAppsToAddInSettings(appManifestPath, appManifest, settings);

    assert.strictEqual(Object.keys(partnerAppsToAdd).length, 1);
    assert.strictEqual(partnerAppsToAdd["app-id-a"], settingsWithComponentId.get("app-id-a"));
  });

  test("Adds app ids from app manifest if not in existing settings", async () => {
    const settings = getInitialPartnerAppSettings();
    // remove app c from settings
    settings.delete("app-id-c");

    const partnerAppsToAdd = await partnerAppsToAddInSettings(appManifestPath, appManifest, settings);

    assert.strictEqual(Object.keys(partnerAppsToAdd).length, 1);
    assert.strictEqual(partnerAppsToAdd["app-id-c"], "");
  });

  test("Does not update partner app ids already listed in settings file", async () => {
    const settings = getInitialPartnerAppSettings();
    settings.set("app-id-c", "path/to/some/appmanifest.json");

    const partnerAppsToAdd = await partnerAppsToAddInSettings(appManifestPath, appManifest, settings);

    const hasEntryForAppC = new Map(Object.entries(partnerAppsToAdd)).has("app-id-c"); 
    assert.strictEqual(hasEntryForAppC, false);
  });
});