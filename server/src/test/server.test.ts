import * as assert from "assert";
import { findFullPath, parseCommandsParams } from "../server";
import * as mockfs from "mock-fs";
import * as path from "path";

suite("findFullPath", () => {
  // unmock the file system after each test
  teardown(mockfs.restore);

  test("Returns undefined if file not found under hardware definition path or sdk path", () => {
    mockfs({
      "my_application/hardware_defs": {
        "mt3620.json": "file_content",
      },
      "azsphere/sdk/HardwareDefinitions": {
        "mt3620.json": "file_content",
      },
    });
    const importedFilePath = "does_not_exist.json";

    const fullPath = findFullPath(
      importedFilePath,
      "my_application/hardware_defs",
      "azsphere/sdk"
    );

    assert.strictEqual(fullPath, undefined);
  });

  test('Looks under "HardwareDefinitions" directory in sdk path', () => {
    mockfs({
      "azsphere/sdk/HardwareDefinitions": {
        "mt3620.json": "file_contents",
      },
    });
    const importedFilePath = "mt3620.json";

    const fullPath = findFullPath(
      importedFilePath,
      "any/hwdef/path",
      "azsphere/sdk"
    );

    const expectedPath = "azsphere/sdk/HardwareDefinitions/mt3620.json";
    if (fullPath) {
      assert.strictEqual(path.resolve(fullPath), path.resolve(expectedPath));
    } else {
      assert.fail(`Path was undefined`);
    }
  });

  test("Prioritizes hardware definition path over sdk path", () => {
    mockfs({
      "my_application/hardware_defs": {
        "mt3620.json": "file_content",
      },
      "azsphere/sdk/HardwareDefinitions": {
        "mt3620.json": "file_contents",
      },
    });
    const importedFilePath = "mt3620.json";

    const fullPath = findFullPath(
      importedFilePath,
      "my_application/hardware_defs",
      "azsphere/sdk"
    );

    const expectedPath = "my_application/hardware_defs/mt3620.json";
    if (fullPath) {
      assert.strictEqual(path.resolve(fullPath), path.resolve(expectedPath));
    } else {
      assert.fail(`Path was undefined`);
    }
  });
});

suite("CMAKELists Infer", () => {
  test("Azuresphere Target Hardware Definition specified in CMakeLists", () => {
    mockfs({
      my_application: {
        "CMakeLists.txt": `
			cmake_minimum_required (VERSION 3.10)
			
			project (Blink C)
			
			azsphere_configure_tools(TOOLS_REVISION "21.04")
			azsphere_configure_api(TARGET_API_SET "9")
			find_path(
				TARGET_DIRECTORY
				NAMES "myfile.txt"
				PATHS "HardwareDefinitions" "./"
				NO_DEFAULT_PATH NO_CMAKE_FIND_ROOT_PATH)
			# Create executable
			add_executable (\${PROJECT_NAME} main.c)
			target_link_libraries (\${PROJECT_NAME} applibs pthread gcc_s c)
			azsphere_target_hardware_definition(\${PROJECT_NAME} TARGET_DIRECTORY "HardwareDefinitions/" TARGET_DEFINITION "template_appliance.json")
			
			azsphere_target_add_image_package(\${PROJECT_NAME})
			
			message("LOOK HERE \${TARGET_DIRECTORY}")`,
      },
      "my_application/HardwareDefinitions/template_appliance.json":
        "file_content",
    });
    const CMAKEListsPath = "my_application/CMakeLists.txt";

    const fullPath: string | undefined = parseCommandsParams(
      path.resolve(CMAKEListsPath)
    );

    const expectedPath =
      "my_application/HardwareDefinitions/template_appliance.json";
    if (fullPath) {
      assert.strictEqual(path.resolve(fullPath), path.resolve(expectedPath));
    } else {
      assert.fail(`Path was undefined`);
    }
  });
});
