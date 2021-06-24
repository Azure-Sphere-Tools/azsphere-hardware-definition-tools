# Azure Sphere Hardware Tools extension Proof of Concept

Proof of Concept based on sample code from https://code.visualstudio.com/api/language-extensions/language-server-extension-guide

## Functionality

This Language Server works for json files. It has the following language features:
- Diagnostics regenerated on each file change or configuration change
- Json Schema suggestion for hardware definition files

It also includes an End-to-End test.

## Structure

```
.
├── vscode-extension // The VS Code extension and its manifest
│   ├── src
│   │   ├── test // End to End tests for VS Code Extension / Server
│   │   └── extension.ts // VS Code Extension entry point
|   ├── embedded-language-server // Packaged version of the language server which is embedded in extension on publish 
├── package.json // Shared compilation and testing tools for typescript projects
└── server // Language Server
    └── src
        └── server.ts // Language Server entry point
```

## Running the Sample

- Run `npm install` in this folder. This installs all necessary npm modules in both the vscode-extension and server folder
- Open VS Code on this folder.
- Press Ctrl+Shift+B to compile the VS Code extension and server.
- Switch to the Debug viewlet.
- Select `Launch Extension` from the drop down.
- Run the launch config.
- If you want to debug the server as well use the launch configuration `Attach to Server`
- In the [Extension Development Host] instance of VSCode, open a hardware definition file in 'json' language mode.
  - Enter 2 pin mappings that map to the same target pin mapping.
