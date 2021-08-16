# Azure Sphere Hardware Definition Tools For Visual Studio Code

## Feature
- [Diagnostics Generated](#DiagnosticsGenerated)
- [Pin Mapping Suggestion](#PinSuggestion)
- [Pin Mapping Generation](#PinMappingGeneration)
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

  > When filling in the Peripherals Pin Mapping, the user can move the cursor behind the Mapping and press **CTRL + ESC** to get the suggestion of all available pins.
  

- Language server command to request available pin mappings <span id='PinMappingGeneration'></span>

  > Add pin mappings automatically by running the following command from a hardware definition file: azsphere-hardware-definition-tolls.generatePinMappings

- Header file generation automatically after hardware definition be changed. <span id='HeaderGeneration'></span>

  > When saving hardware definition files, C header files will be automatically generated through the Azure Sphere CLI.

- Hardware definition files port to different underlying hardware. <span id='Porting'></span>

  > When the server receives a porting request with the paths to the app level/ODM level hw  definitions, a ported app level hw definition will be generated to a new file. 
  > 1. Run the following command through the VS Code command palette while the current file is a hardware definition file: azsphere-hardware-definition-tools.porting
  > 2. Select the target hardware definition file needed to port.
  > 3. Select a existing hardware definition from the Azure Sphere SDK or a customized one.
  > 4. A new file will then be generated based on the currently open hardware definition file with all of the mappings updated to match the hardware definition which has been ported to.
  
