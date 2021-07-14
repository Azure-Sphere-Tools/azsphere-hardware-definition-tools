using Microsoft.VisualStudio.LanguageServer.Client;
using Newtonsoft.Json.Linq;
using System;
using System.Threading.Tasks;

namespace AZSphereHardwareDefinitionTools
{
  /// <summary>
  /// Language Server middle layer which can intercept messages between client/server and modify them.
  /// </summary>
  public class DiagnosticsAdjustmentMiddleLayer : ILanguageClientMiddleLayer
  {
    internal readonly static DiagnosticsAdjustmentMiddleLayer Instance = new DiagnosticsAdjustmentMiddleLayer();

    private DiagnosticsAdjustmentMiddleLayer() { }

    public bool CanHandle(string methodName)
    {
      return methodName == "textDocument/publishDiagnostics";
    }

    public async Task HandleNotificationAsync(string methodName, JToken methodParam, Func<JToken, Task> sendNotification)
    {
      if (methodName == "textDocument/publishDiagnostics")
      {
        var diagnosticsToFilter = (JArray)methodParam["diagnostics"];
        // increment the start character of diagnostics by 1 otherwise Visual Studio underlines multiple entries
        foreach (var diagnostic in diagnosticsToFilter)
        {
          var diagnosticRangeStart = diagnostic["range"]["start"];
          //diagnosticRangeStart["character"].Replace(diagnosticRangeStart.Value<int>("character") + 1);

        }
      }
      await sendNotification(methodParam);
    }


    public async Task<JToken> HandleRequestAsync(string methodName, JToken methodParam, Func<JToken, Task<JToken>> sendRequest)
    {
      return await sendRequest(methodParam);
    }
  }
}
