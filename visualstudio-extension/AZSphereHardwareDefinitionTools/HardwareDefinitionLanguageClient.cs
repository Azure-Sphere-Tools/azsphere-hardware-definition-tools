using Microsoft.VisualStudio.LanguageServer.Client;
using Microsoft.VisualStudio.Threading;
using Microsoft.VisualStudio.Utilities;
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

    private const string EXTENSION_DIRECTORY = "visualstudio-extension";

    public string Name => "AZ Sphere Hardware Definition Tools";

    public IEnumerable<string> ConfigurationSections => new[] { "AzureSphere" };

    public object InitializationOptions => null;

    public IEnumerable<string> FilesToWatch => new[] { "*.json", "CMakeLists.txt" };

    public event AsyncEventHandler<EventArgs> StartAsync;
    public event AsyncEventHandler<EventArgs> StopAsync;

    public object MiddleLayer => DiagnosticsAdjustmentMiddleLayer.Instance;

    public object CustomMessageTarget => null;


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
      var languageServerEntrypoint = Path.Combine(extensionDirectory, "EmbeddedLanguageServer", "node_modules", "azsphere-hardware-definition-language-server", "dist", "server.js");
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
      return Task.CompletedTask;
    }
    public Task AttachForCustomMessageAsync(JsonRpc rpc)
    {
      return Task.CompletedTask;
    }

    /// <summary>
    /// Finds the path to the source code of the language server
    /// </summary>
    /// <returns></returns>
    private static string PathToLanguageServerSourceCode()
    {
      string extensionDirectory = ExtensionPath();
      return Path.GetFullPath(Path.Combine(extensionDirectory, "..", "server", "dist", "server.js"));
    }

    public static string ExtensionPath()
    {
      string workingDirectory = Path.GetFullPath(Environment.CurrentDirectory);
      string extensionDirectory = workingDirectory.Substring(0, workingDirectory.LastIndexOf(EXTENSION_DIRECTORY) + EXTENSION_DIRECTORY.Length);
      return extensionDirectory;
    }
  }
}
