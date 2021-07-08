import { parseCommandsParams } from "../cMakeLists";
import * as assert from "assert";
import * as mockfs from "mock-fs";
import { URI } from "vscode-uri";
import * as path from "path";

suite("CMakeLists Infer", () => {
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
      "my_application/HardwareDefinitions/template_appliance.json": "file_content",
    });
    const CMAKEListsPath = "my_application/CMakeLists.txt";

    const fullPath: string | undefined = parseCommandsParams(path.resolve(CMAKEListsPath));

    const expectedPath = "my_application/HardwareDefinitions/template_appliance.json";
    if (fullPath) {
      assert.strictEqual(path.resolve(fullPath), path.resolve(expectedPath));
    } else {
      assert.fail(`Path was undefined`);
    }
  });
});

function asURI(hwDefFilePath: string): string {
  return URI.file(path.resolve(hwDefFilePath)).toString();
}
