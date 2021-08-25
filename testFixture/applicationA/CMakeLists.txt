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
azsphere_target_hardware_definition(\${PROJECT_NAME} TARGET_DIRECTORY "../" TARGET_DEFINITION "application.json")
azsphere_target_add_image_package(\${PROJECT_NAME})
message("LOOK HERE \${TARGET_DIRECTORY}")`,