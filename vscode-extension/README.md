# VS Code Extension
This `vscode-extension` project contains the source code for the Azure Sphere Hardware Tools VS Code extension.  
Its package.json also acts as the extension manifest, which specifies required metadata (extension name, entrypoint, dependencies, etc...).  


## Packaging and Publishing the extension
An extension installation file (.vsix) can be created by running the ['vsce package'](https://www.npmjs.com/package/vsce) command from the root of this project.  
This will bundle **all files under the project, except those excluded in the `.vscodeignore` file.**
Therefore, it is important that any files/resources that are **not required by the extension at runtime** (e.g. typescript source code, tests) be <u>added to the .vscodeignore file.</u>

The extension makes use of the Azure Sphere Hardware Tools Language Server, defined in a separate `server` project. Before packaging the extension, the language server and its runtime dependencies must be copied under the `vscode-extension` project to be included in the extension. This is done in the `embedded-language-server/` directory which references a packed version of the language server.  
The 'vscode:prepublish' script in this project's `package.json` automatically copies the language server and its dependencies to `embedded-language-server/node_modules` before the `vsce package/publish` command runs, which ensures that we always include the language server in the extension.