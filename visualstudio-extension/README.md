# Visual Studio Extension
This `visualstudio-extension` project contains the source code for the Azure Sphere Hardware Tools Visual Studio extension.  
Its package.json also acts as the extension manifest, which specifies required metadata (extension name, entrypoint, dependencies, etc...).  


## Packaging and Publishing the extension
An extension installation file (.vsix) can be created by building the `AZSphereHardwareDefinitionTools` project in Visual Studio when using the `Release` Configuration (instead of `Debug`). After building the project, the generated vsix file can be found under `visualstudio-extension\AZSphereHardwareDefinitionTools\bin\Release\AZSphereHardwareDefinitionTools.vsix`.
This will bundle all files marked with `<IncludeInVSIX>true</IncludeInVSIX>` in the **`AZSphereHardwareDefinitionTools.csproj`** file.
Therefore, it is important that any files/resources that are **required by the extension at runtime** (e.g. Language Server binaries) be <u>added to the .csproj file.</u>

The extension makes use of the Azure Sphere Hardware Tools Language Server, defined in a separate `server` project. Before packaging the extension, the language server and its runtime dependencies must be copied under the `AZSphereHardwareDefinitionTools` project to be included in the extension. This is done in the `AZSphereHardwareDefinitionTools/EmbeddedLanguageServer/` directory which references a packed version of the language server.  
The `AZSphereHardwareDefinitionTools.csproj` file contains a "BeforeBuild" directive that automatically copies the language server and its dependencies to `EmbeddedLanguageServer/node_modules` before the extension is built, which ensures that we always include the language server in the extension.