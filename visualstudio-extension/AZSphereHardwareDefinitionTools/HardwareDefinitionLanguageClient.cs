using Microsoft.VisualStudio.LanguageServer.Client;
using Microsoft.VisualStudio.Threading;
using Microsoft.VisualStudio.Utilities;
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
  public class HardwareDefinitionLanguageClient : ILanguageClient
  {
    public string Name => "AZ Sphere Hardware Definition Tools";

    public IEnumerable<string> ConfigurationSections => new[] { "AzureSphere" };

    public object InitializationOptions => null;

    public IEnumerable<string> FilesToWatch => new[] { "*.json", "CMakeLists.txt" };

    public event AsyncEventHandler<EventArgs> StartAsync;
    public event AsyncEventHandler<EventArgs> StopAsync;

    public async Task<Connection> ActivateAsync(CancellationToken token)
    {
      // call Task.Yield() to force extension activation to run asynchronously and avoid risk of blocking main thread
      await Task.Yield();


      ProcessStartInfo info = new ProcessStartInfo();
      info.FileName = "node";
      info.Arguments = languageServerArgs();
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

    private static string languageServerArgs()
    {
#if DEBUG
            string workingDirectory = Environment.CurrentDirectory;
            string extensionDirectory = Directory.GetParent(workingDirectory).Parent.FullName;
            var languageServerEntrypoint = Path.GetFullPath(Path.Combine(extensionDirectory, "..", "..", "server", "dist", "server.js"));
#else
      string extensionDirectory = Path.GetDirectoryName(Assembly.GetExecutingAssembly().Location);
      var languageServerEntrypoint = Path.Combine(extensionDirectory, "EmbeddedLanguageServer", "node_modules", "azsphere-hardware-definition-language-server", "dist", "server.js");
#endif
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
  }
}
