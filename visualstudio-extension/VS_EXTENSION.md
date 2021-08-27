# Azure Sphere Hardware Definition Tools For Visual Studio Code
This extension makes it easier to validate, create and maintain [Hardware Definition files](https://docs.microsoft.com/en-us/azure-sphere/app-development/manage-hardware-dependencies) used for [Azure Sphere](https://docs.microsoft.com/en-us/azure-sphere/) IoT applications.

## Features
- [Hardware Definition Validation](#DiagnosticsGenerated)
- [Pin Mapping Suggestion](#PinSuggestion)
- [Pin Mapping Generation](#PinMappingGeneration)
- [Header Files Generation](#HeaderGeneration)
- [Hardware Definition Files Porting](#Porting)

<!-- ## Functionality And User Guide -->

### Diagnostics generated on pin mapping conflicts in hardware definition and application manifest files <span id='DiagnosticsGenerated'></span>
  > The extension provides diagnostics for errors or potential mistakes made in hardware definition files, such as missing imports, duplicate peripheral names, conflicting pin mappings which configure the same pin block differently, and more.

  > When an app_manifest file with partner applications is detected, you'll get notified about errors (such as peripherals using the same pin across applications) without having to deploy your code to a development board.


### Pin mapping suggestion for hardware definition files <span id='PinSuggestion'></span>
  > When adding Pin Mappings under a Hardware Definition's Peripherals, you can move the cursor behind the Mapping property and press **CTRL + SPACE** to get suggestions for all available pins that haven't been reserved yet.
  

### Command to generate pin mappings <span id='PinMappingGeneration'></span>
  > Add pin mappings automatically by running the following command from a hardware definition file: azsphere-hardware-definition-tools.generatePinMappings


### C Header file generation on hardware definition changes <span id='HeaderGeneration'></span>
  > When saving hardware definition files, C header files will be automatically generated through the Azure Sphere CLI.


### Command to port hardware definition files to different underlying hardware <span id='Porting'></span>
  > If you've written a hardware definition file for a given dev board/layout and would like to support another one, you can automatically port your existing hardware definition instead of rewriting it from scratch. To do so:
  > 1. Run the following command through the VS Code command palette while the current file is a hardware definition file: azsphere-hardware-definition-tools.porting
  > 2. Select the target hardware definition file needed to port.
  > 3. Select a hardware definition to port to from the Azure Sphere SDK or a customized one.
  > 4. A new file will then be generated based on the currently open hardware definition file with all of the mappings updated to match the hardware definition which has been ported to.
  
## Acknowledgments
> This extension is developed by a team of UCL (University College London) students including Omar Beyhum, Dorin Botan, Denoy Hossain, Tsung-Han Tsai, and Jiachen Weng in collaboration with Microsoft.


## Contributions
> This extension is open source and maintained under the [Azure Sphere Hardware Definition Tools](https://github.com/Azure-Sphere-Tools/azsphere-hardware-definition-tools) GitHub repository. Suggestions and contributions are more than welcome.

