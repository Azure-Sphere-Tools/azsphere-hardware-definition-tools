# Azure Sphere Hardware Definition Tools For Visual Studio Code

## Feature
- [Diagnostics Generated](#DiagnosticsGenerated)
- [Pin Mapping Suggestion](#PinSuggestion)
- [Json Schema Suggestion](#JsonSuggestion)
- [Header Files Generation](#HeaderGeneration)
- [Hardware Definition Files Porting](#Porting)

## Functionality And User Guide
VS Code extension includes a Language Server to validate hardware definition files. The functions and corresponding instructions will be introduced in detail:

* Diagnostics generated on pin mapping conflicts in hardware definition and application manifest files. <span id='DiagnosticsGenerated'></span>

  > When a hardware definition file is opened, the following types of conflicts are generated for diagnostic information
  >- Pin mapping name is used multiple times.
  >- The nonexitstent pin is mapped. (Support Quick Fix)
  >- The same pin is mapped multiple times. (Support Quick Fix)
  >- The pin is indirectly imported from the hardware definition files.
  >- The pin mapping whose appManifestValue and type do not match.
  >- The pin mapping whose pin block is already configured as a different type by other pin mapping. (Support Quick Fix)
  >- The imported file can not be found.

  > When an app_manifest file is open and the partner application has been detected, the following types of conflicts are generated for diagnostic information.
  >- The same pin is used mutiple times in cross applications.
  >- The pin happen the pin block conflict in cross applications.


- Pin mapping suggestion for hardware definition files. <span id='PinSuggestion'></span>

  > When filling in the Peripherals Pin Mapping, the user can move the cursor behind the Mapping and press **CTRL + ESC (Windows) or Alt/Option + ESC (macOS)** to get the suggestion of all available pins
  

- Json Schema suggestion for hardware definition files. <span id='JsonSuggestion'></span>
- Header file generation automatically after hardware definition be changed. <span id='HeaderGeneration'></span>
- Hardware definition files port to different underlying hardware. <span id='Porting'></span>