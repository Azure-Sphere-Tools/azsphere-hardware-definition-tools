using Microsoft.VisualStudio.LanguageServer.Client;
using Microsoft.VisualStudio.LanguageServer.Protocol;
using Microsoft.VisualStudio.Threading;
using Microsoft.VisualStudio.Utilities;
using Microsoft.VisualStudio.Workspace;
using Microsoft.VisualStudio.Workspace.Settings;
using Microsoft.VisualStudio.Workspace.VSIntegration.Contracts;
using Newtonsoft.Json;
using Newtonsoft.Json.Linq;
using StreamJsonRpc;
using System;
using System.Collections.Generic;
using System.ComponentModel.Composition;
using System.Diagnostics;
using System.IO;
using System.Reflection;
using System.Threading;
using System.Threading.Tasks;

namespace AZSphereHardwareDefinitionTools
{
  [ContentType(HardwareDefinitionLanguageContent.HARDWARE_DEFINITION)]
  [ContentType(HardwareDefinitionLanguageContent.CMAKELISTS)]
  [Export(typeof(ILanguageClient))]
  public class HardwareDefinitionLanguageClient : ILanguageClient, ILanguageClientCustomMessage2
  {
    public static HardwareDefinitionLanguageClient Instance;


    private const string EXTENSION_DIRECTORY = "visualstudio-extension";
    private const string ENTRYPOINT_FILE = "startServer.js";

    public string Name => "AZ Sphere Hardware Definition Tools";

    public IEnumerable<string> ConfigurationSections => new[] { "AzureSphere" };

    public object InitializationOptions => null;

    public IEnumerable<string> FilesToWatch => new[] { "*.json", "CMakeLists.txt" };

    public event AsyncEventHandler<EventArgs> StartAsync;
    public event AsyncEventHandler<EventArgs> StopAsync;

    public object MiddleLayer => DiagnosticsAdjustmentMiddleLayer.Instance;

    public object CustomMessageTarget { get; }

    public JsonRpc Rpc { get; private set; }
    
    public IVsFolderWorkspaceService WorkspaceService { get; }

    [ImportingConstructor]
    public HardwareDefinitionLanguageClient([Import] IVsFolderWorkspaceService wsService)
    {
      WorkspaceService = wsService;
      CustomMessageTarget = new CustomMessageHandler(wsService);
    }
    
    public async Task<Connection> ActivateAsync(CancellationToken token)
    {
      // call Task.Yield() to force extension activation to run asynchronously and avoid risk of blocking main thread
      await Task.Yield();


      ProcessStartInfo info = new ProcessStartInfo();
      info.FileName = "node";
      info.Arguments = LanguageServerArgs();
      info.RedirectStandardInput = true;
      info.RedirectStandardOutput = true;
      info.UseShellExecute = false;
      info.CreateNoWindow = true;

      Process process = new Process();
      process.StartInfo = info;

      if (process.Start())
      {
        return new Connection(process.StandardOutput.BaseStream, process.StandardInput.BaseStream);
      }

      return null;
    }

    private static string LanguageServerArgs()
    {
#if DEBUG
      // set entrypoint to language server source code in debug mode to enable language server breakpoints/debugging when running it from Visual Studio
      var languageServerEntrypoint = PathToLanguageServerSourceCode();
#else
      string extensionDirectory = Path.GetDirectoryName(Assembly.GetExecutingAssembly().Location);
      var languageServerEntrypoint = Path.Combine(extensionDirectory, "EmbeddedLanguageServer", "node_modules", "azsphere-hardware-definition-language-server", "dist", ENTRYPOINT_FILE);
#endif

      if (!File.Exists(languageServerEntrypoint))
      {
        throw new ArgumentException($"Language server entrypoint does not exist in path {languageServerEntrypoint}");
      }
      var debugArgs = "--nolazy --inspect=16009";
      return $"{debugArgs} \"{languageServerEntrypoint}\" --stdio --clientProcessId={Process.GetCurrentProcess().Id}";
    }

    public async Task OnLoadedAsync()
    {
      await StartAsync.InvokeAsync(this, EventArgs.Empty);
    }

    public Task OnServerInitializeFailedAsync(Exception e)
    {
      return Task.CompletedTask;
    }

    public Task OnServerInitializedAsync()
    {
      Instance = this;
      return Task.CompletedTask;
    }
    public Task AttachForCustomMessageAsync(JsonRpc rpc)
    {
      this.Rpc = rpc;
      return Task.CompletedTask;
    }

    #region Generate Pin Mapping commands
    public async Task<string[]> GetAvailablePinTypesAsync(string hwDefUri)
    {
      object[] args = { hwDefUri };
      var response = await Rpc.InvokeWithParameterObjectAsync<JToken>(Methods.WorkspaceExecuteCommandName, new ExecuteCommandParams { Command = "getAvailablePinTypes", Arguments = args });
      return response != null ? response.ToObject<string[]>() : new string[] { };
    }

    public async Task<string[]> GetAvailablePinsAsync(string hwDefUri, string pinTypeSelected)
    {
      object[] args = { hwDefUri, pinTypeSelected };
      var response = await Rpc.InvokeWithParameterObjectAsync<JToken>(Methods.WorkspaceExecuteCommandName, new ExecuteCommandParams { Command = "getAvailablePins", Arguments = args });
      return response != null ? response.ToObject<string[]>() : new string[] { };
    }

    public async Task PostPinAmountToGenerateAsync(string hwDefUri, string[] pinsToAdd, string pinTypeSelected)
    {
      object[] args = { hwDefUri, pinsToAdd, pinTypeSelected };
      await Rpc.InvokeWithParameterObjectAsync<JToken>(Methods.WorkspaceExecuteCommandName, new ExecuteCommandParams { Command = "postPinAmountToGenerate", Arguments = args }); 
    }
    #endregion


    #region Port Hardware Definition commands
    public async Task<bool> ValidateHwDefinitionAsync(string hwDefUri)
    {
      object[] args = { hwDefUri };
      var response = await Rpc.InvokeWithParameterObjectAsync<JToken>(Methods.WorkspaceExecuteCommandName, new ExecuteCommandParams { Command = "validateHwDefinition", Arguments = args });
      return response != null ? response.ToObject<bool>() : false;
    }

    public async Task<OdmHardwareDefinitionsCommandResponse[]> GetAvailableOdmHardwareDefinitionsAsync(string hwDefUri)
    {
      object[] args = { hwDefUri };
      var response = await Rpc.InvokeWithParameterObjectAsync<JToken>(Methods.WorkspaceExecuteCommandName, new ExecuteCommandParams { Command = "getAvailableOdmHardwareDefinitions", Arguments = args });
      return response != null ? response.ToObject<OdmHardwareDefinitionsCommandResponse[]>() : new OdmHardwareDefinitionsCommandResponse[] { };
    }

    public async Task<string> PortHardwareDefinitionAsync(string originalHwDefPath, string targetHwDefPath)
    {
      object[] args = { originalHwDefPath, targetHwDefPath };
      var response = await Rpc.InvokeWithParameterObjectAsync<JToken>(Methods.WorkspaceExecuteCommandName, new ExecuteCommandParams { Command = "portHardwareDefinition", Arguments = args });
      return response != null ? response.ToObject<string>() : null;
    }
    #endregion

    /// <summary>
    /// Finds the path to the source code of the language server
    /// </summary>
    /// <returns></returns>
    private static string PathToLanguageServerSourceCode()
    {
      string extensionDirectory = ExtensionPath();
      return Path.GetFullPath(Path.Combine(extensionDirectory, "..", "server", "dist", ENTRYPOINT_FILE));
    }

    public static string ExtensionPath()
    {
      string workingDirectory = Path.GetFullPath(Environment.CurrentDirectory);
      string extensionDirectory = workingDirectory.Substring(0, workingDirectory.LastIndexOf(EXTENSION_DIRECTORY) + EXTENSION_DIRECTORY.Length);
      return extensionDirectory;
    }

    public class OdmHardwareDefinitionsCommandResponse
    {
      [JsonProperty("name")]
      public string Name { get; set; }

      [JsonProperty("path")]
      public string Path { get; set; }
    }
  }

  /// <summary>
  /// Custom Language Server Message Handler to support customized notifications/requests like updating the partner app settings.
  /// </summary>
  public class CustomMessageHandler
  {
    private const string PARTNER_APPS_SETTINGS_KEY = "AzureSphere.partnerApplications";

    public IVsFolderWorkspaceService WorkspaceService { get; }

    public CustomMessageHandler(IVsFolderWorkspaceService workspaceService)
    {
      WorkspaceService = workspaceService;
    }


    [JsonRpcMethod("hardwareDefinitions/updatePartnerApps")]
    public async Task OnUpdatePartnerAppsAsync(JToken arg)
    {
      var newPartnerApps = arg.ToObject<PartnerAppsSettings>();

      var ws = WorkspaceService.CurrentWorkspace;
      var manager = ws.GetSettingsManager();

      using (IWorkspaceSettingsPersistance workspaceSettingsPersistance = await manager.GetPersistanceAsync(true))
      {
        var settingsWriter = await workspaceSettingsPersistance.GetWriter(SettingsTypes.Generic);
        var partnerApps = settingsWriter.Property(PARTNER_APPS_SETTINGS_KEY, new PartnerAppsSettings { appIdsToPaths = new Dictionary<string, string>() });
        foreach (var partnerApp in newPartnerApps.appIdsToPaths)
        {
          partnerApps.appIdsToPaths[partnerApp.Key] = partnerApp.Value;
        }
        settingsWriter.SetProperty(PARTNER_APPS_SETTINGS_KEY, partnerApps);
      }
    }
  }

  /// <summary>
  /// Represents the partnerApplications settings. Must be implemented as a struct to be written by the workspace settings manager.
  /// </summary>
  [JsonConverter(typeof(PartnerAppJsonConverter))]
  struct PartnerAppsSettings
  {
    public Dictionary<string, string> appIdsToPaths;
  }
  class PartnerAppJsonConverter : JsonConverter<PartnerAppsSettings>
  {
    public override PartnerAppsSettings ReadJson(JsonReader reader, Type objectType, PartnerAppsSettings existingValue, bool hasExistingValue, JsonSerializer serializer)
    {
      var partnerApps = serializer.Deserialize<Dictionary<string, string>>(reader);
      return new PartnerAppsSettings { appIdsToPaths = partnerApps };
    }

    public override void WriteJson(JsonWriter writer, PartnerAppsSettings value, JsonSerializer serializer)
    {
      serializer.Serialize(writer, value.appIdsToPaths);
    }
  }
}
