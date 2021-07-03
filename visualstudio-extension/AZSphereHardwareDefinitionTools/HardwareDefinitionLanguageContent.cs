using Microsoft.VisualStudio.LanguageServer.Client;
using Microsoft.VisualStudio.Utilities;
using System.ComponentModel.Composition;

namespace AZSphereHardwareDefinitionTools
{
  /// <summary>
  /// Defines the type of files (content type) that the extension is interested in analyzing.
  /// Each content type is assigned a name and associated with a file extension.
  /// </summary>
  public class HardwareDefinitionLanguageContent
  {
    public const string HARDWARE_DEFINITION = "json";
    public const string CMAKELISTS = "cmakelists";

    [Export]
    [Name(HARDWARE_DEFINITION)]
    [BaseDefinition(CodeRemoteContentDefinition.CodeRemoteContentTypeName)]
    internal static ContentTypeDefinition HardwareDefinitionContentType;

    [Export]
    [FileExtension(".json")]
    [ContentType(HARDWARE_DEFINITION)]
    internal static FileExtensionToContentTypeDefinition HardwareDefinitionFileExtension;


    [Export]
    [Name(CMAKELISTS)]
    [BaseDefinition(CodeRemoteContentDefinition.CodeRemoteContentTypeName)]
    internal static ContentTypeDefinition CMakeListsContentType;

    [Export]
    [FileExtension("CMakeLists.txt")]
    [ContentType("cmakelists")]
    internal static FileExtensionToContentTypeDefinition CMakeListsFileExtension;
  }
}
