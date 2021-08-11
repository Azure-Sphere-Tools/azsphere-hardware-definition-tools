# Azure Sphere Hardware Definition Tools

## Functionality

This projects includes a Language Server, VS Code extension, and Visual Studio extension to validate hardware definition files. It has the following features:
- Diagnostics generated on pin mapping conflicts in hardware definition files
- Json Schema suggestion for hardware definition files


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

## Running the VS Code Extension

- Run `npm install` in this folder. This installs all necessary npm modules in both the vscode-extension and server folder
- Open VS Code on this folder.
- Press Ctrl+Shift+B to compile the VS Code extension and server.
- Switch to the Debug viewlet.
- Select `Launch Extension` from the drop down.
- Run the launch config.
- If you want to debug the server as well use the launch configuration `Attach to Server`
- In the [Extension Development Host] instance of VSCode, open a hardware definition file in 'json' language mode.
  - Enter 2 pin mappings that map to the same target pin mapping.
