using Community.VisualStudio.Toolkit;
using Microsoft.VisualStudio.Shell;
using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Text;
using System.Threading.Tasks;

namespace AZSphereHardwareDefinitionTools
{
  class PortHardwareDefinitionHandler : CommandHandler
  {
    public static PortHardwareDefinitionHandler Instance = new PortHardwareDefinitionHandler();

    public async System.Threading.Tasks.Task PortHardwareDefinitionAsync()
    {
      CloseCurrentInfoBar();
      string currentFilePath = await CurrentFilePathAsync();
      string currentFileUri = new Uri(currentFilePath).AbsoluteUri;

      if (HardwareDefinitionLanguageClient.Instance == null)
      {
        await CreateAndDisplayInfoBarAsync("Cannot port hardware definition while extension is still loading", currentFilePath, new InfoBarActionItem[] { });
        return;
      }

      var odmHwDefinitions = await HardwareDefinitionLanguageClient.Instance.GetAvailableOdmHardwareDefinitionsAsync(currentFileUri);
      var actions = odmHwDefinitions.Select(odmHwDef => new InfoBarHyperlink(odmHwDef.Name, new OdmHardwareDefinitionActionContext(currentFilePath, odmHwDef.Path))).ToList();
      if (actions.Count > 0)
      {
        await CreateAndDisplayInfoBarAsync("Select a hardware definition to port to", currentFilePath, actions, OnOdmHardwareDefSelected);
      }
    }

    private void OnOdmHardwareDefSelected(object sender, InfoBarActionItemEventArgs e)
    {
      ThreadHelper.ThrowIfNotOnUIThread();
      CloseCurrentInfoBar();

      OdmHardwareDefinitionActionContext selected = e.ActionItem.ActionContext;
      _ = System.Threading.Tasks.Task.Run(async () =>
      {
        string originalHwDefFileName = Path.GetFileName(selected.OriginalHwDefPath);
        string portedPath = await HardwareDefinitionLanguageClient.Instance.PortHardwareDefinitionAsync(selected.OriginalHwDefPath, selected.TargetHwDefPath);
        if (portedPath != null)
        {

          var doc = await VS.Documents.OpenAsync(portedPath);
          await doc.ShowAsync();
          await CreateAndDisplayInfoBarAsync($"Successfully ported {originalHwDefFileName}", portedPath, new InfoBarActionItem[] { });
        } else
        {
          await CreateAndDisplayInfoBarAsync($"Failed to port hardware definition file {originalHwDefFileName}", await CurrentFilePathAsync(), new InfoBarActionItem[] { });
        }
      });

    }
  }

  /// <summary>
  /// Info related to a selected ODM Hardware Definition
  /// </summary>
  class OdmHardwareDefinitionActionContext
  {
    internal string OriginalHwDefPath { get; }
    internal string TargetHwDefPath { get; }

    internal OdmHardwareDefinitionActionContext(string originalHwDefPath, string targetHwDefPath)
    {
      OriginalHwDefPath = originalHwDefPath;
      TargetHwDefPath = targetHwDefPath;
    }
  }
}
