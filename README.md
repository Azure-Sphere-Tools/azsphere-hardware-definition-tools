# Azure Sphere Hardware Definition Tools
![build-badge](https://github.com/Azure-Sphere-Tools/azsphere-hardware-definition-tools/actions/workflows/build.yml/badge.svg)
![coverage-badge](https://img.shields.io/badge/dynamic/json?color=success&logo=mocha&logoColor=white&label=Coverage&query=total.statements.pct&url=https%3A%2F%2Fgithub.com%2FAzure-Sphere-Tools%2Fazsphere-hardware-definition-tools%2Freleases%2Fdownload%2Fbadges%2Fcoverage-summary.json)

## About

Azure Sphere Hardware Definition Tools extension for [Visual Studio](https://marketplace.visualstudio.com/items?itemName=ucl-ixn.azspherehardwaredefinitiontools) and [Visual Studio Code](https://marketplace.visualstudio.com/items?itemName=ucl-ixn.azsphere-hardware-definition-tools). 

## Features
- [Hardware Definition Validation](#DiagnosticsGenerated)
- [Pin Mapping Suggestion](#PinSuggestion)
- [Pin Mapping Generation](#PinMappingGeneration)
- [Header Files Generation](#HeaderGeneration)
- [Hardware Definition Files Porting](#Porting)

<!-- ## Functionality And User Guide -->

### Diagnostics generated on pin mapping conflicts in hardware definition and application manifest files <span id='DiagnosticsGenerated'></span>
  The extension provides diagnostics for errors or potential mistakes made in hardware definition files, such as missing imports, duplicate peripheral names, conflicting pin mappings which configure the same pin block differently, and more.

  When an app_manifest file with partner applications is detected, you'll get notified about errors (such as peripherals using the same pin across applications) without having to deploy your code to a development board.


### Pin mapping suggestion for hardware definition files <span id='PinSuggestion'></span>
  When adding Pin Mappings under a Hardware Definition's Peripherals, you can move the cursor behind the Mapping property and press **CTRL + SPACE** to get suggestions for all available pins that haven't been reserved yet.
  

### Command to generate pin mappings <span id='PinMappingGeneration'></span>
  Add pin mappings automatically by running the following command from a hardware definition file: azsphere-hardware-definition-tools.generatePinMappings


### C Header file generation on hardware definition changes <span id='HeaderGeneration'></span>
  When saving hardware definition files, C header files will be automatically generated through the Azure Sphere CLI.


### Command to port hardware definition files to different underlying hardware <span id='Porting'></span>
  If you've written a hardware definition file for a given dev board/layout and would like to support another one, you can automatically port your existing hardware definition instead of rewriting it from scratch. To do so:
  1. Run the following command through the VS Code command palette while the current file is a hardware definition file: azsphere-hardware-definition-tools.porting
  2. Select the target hardware definition file needed to port.
  3. Select a hardware definition to port to from the Azure Sphere SDK or a customized one.
  4. A new file will then be generated based on the currently open hardware definition file with all of the mappings updated to match the hardware definition which has been ported to.


## Structure

```
.
|
├── server // Language Server
│   └── src
│       └── startServer.ts // Language Server entry point
│
├── vscode-extension // The VS Code extension and its manifest
│   ├── src
│   │   ├── test // End to End tests for VS Code Extension / Server
│   │   └── extension.ts // VS Code Extension entry point
|   ├── embedded-language-server // Packaged version of the language server which is embedded in extension on publish
│   │
├── visualstudio-extension // The Visual Studio extension solution (includes extension and test projects)
│   ├── AZSphereHardwareDefinitionTools // The Visual Studio extension project
│   │   ├── HardwareDefinitionLanguageClient // Visual Studio Extension entry point
|   |   └── EmbeddedLanguageServer // Packaged version of the language server which is embedded in extension on publish
└── package.json // Shared compilation and testing tools for typescript projects
```

## Install

Install the latest version of the extension from the Marketplace (for [Visual Studio](https://marketplace.visualstudio.com/items?itemName=ucl-ixn.azspherehardwaredefinitiontools) or [Visual Studio Code](https://marketplace.visualstudio.com/items?itemName=ucl-ixn.azsphere-hardware-definition-tools)), or find all versions in [releases](https://github.com/Azure-Sphere-Tools/azsphere-hardware-definition-tools/releases).

## Debug

- Run `npm install` in the root folder. This installs all necessary npm modules in both the vscode-extension and server folder
- Open the root folder in VS Code.
- Press Ctrl+Shift+B to compile the VS Code extension and server.
- Switch to the Debug viewlet.
- Select `Launch Extension` from the drop down.
- Run the launch config.
- If you want to debug the server as well use the launch configuration `Attach to Server`
- In the [Extension Development Host] instance of VSCode, open a hardware definition file in 'json' language mode.
- Enter 2 pin mappings that map to the same target pin mapping.
