using Microsoft.VisualStudio.LanguageServer.Client;
using Microsoft.VisualStudio.Utilities;
using System.ComponentModel.Composition;

namespace AZSphereHardwareDefinitionTools
{
    public class HardwareDefinitionLanguageContent
    {
        [Export]
        [Name("json")]
        [BaseDefinition(CodeRemoteContentDefinition.CodeRemoteContentTypeName)]
        internal static ContentTypeDefinition HardwareDefinitionContentType;

        [Export]
        [FileExtension(".json")]
        [ContentType("json")]
        internal static FileExtensionToContentTypeDefinition HardwareDefinitionFileExtension;


        [Export]
        [Name("cmake")]
        [BaseDefinition(CodeRemoteContentDefinition.CodeRemoteContentTypeName)]
        internal static ContentTypeDefinition CMakeListsContentType;

        [Export]
        [FileExtension("CMakeLists.txt")]
        [ContentType("cmake")]
        internal static FileExtensionToContentTypeDefinition CMakeListsFileExtension;
    }
}
