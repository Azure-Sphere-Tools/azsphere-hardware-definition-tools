using Community.VisualStudio.Toolkit;
using Microsoft.VisualStudio.Shell;
using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Text;
using System.Threading.Tasks;
using System.Windows.Forms;

namespace AZSphereHardwareDefinitionTools
{
  class PortHardwareDefinitionHandler : CommandHandler
  {
    public static PortHardwareDefinitionHandler Instance = new PortHardwareDefinitionHandler();

    public async System.Threading.Tasks.Task PortHardwareDefinitionAsync()
    {
      CloseCurrentInfoBar();
      string currentFilePath = await CurrentFilePathAsync();
      string currentFileUri;
      try
      {
        currentFileUri = new Uri(currentFilePath).AbsoluteUri;

      } catch (Exception e) when (e is ArgumentNullException || e is UriFormatException)
      {
        await VS.MessageBox.ShowAsync("Open a Hardware Definition file to run the command", buttons: Microsoft.VisualStudio.Shell.Interop.OLEMSGBUTTON.OLEMSGBUTTON_OK);
        return;
      }

      if (HardwareDefinitionLanguageClient.Instance == null)
      {
        await CreateAndDisplayInfoBarAsync("Cannot port hardware definition while extension is still loading", currentFilePath);
        return;
      }
      var isValidHwDef = await HardwareDefinitionLanguageClient.Instance.ValidateHwDefinitionAsync(currentFileUri);
      if (!isValidHwDef) {
        await CreateAndDisplayInfoBarAsync("The current file is not a valid Hardware Definition. Open a valid Hardware Definition to port from", currentFilePath);
        return;
      }
      var odmHwDefinitions = await HardwareDefinitionLanguageClient.Instance.GetAvailableOdmHardwareDefinitionsAsync(currentFileUri);
      var actions = odmHwDefinitions.Select(odmHwDef => new InfoBarHyperlink(odmHwDef.Name, new OdmHardwareDefinitionActionContext(currentFilePath, odmHwDef.Path))).ToList();
      actions.Insert(0, new InfoBarHyperlink("Open new", new OdmHardwareDefinitionActionContext(currentFilePath, null)));
      await CreateAndDisplayInfoBarAsync("Select a hardware definition to port to", currentFilePath, actions, OnOdmHardwareDefSelected);
    }

    private void OnOdmHardwareDefSelected(object sender, InfoBarActionItemEventArgs e)
    {
      ThreadHelper.ThrowIfNotOnUIThread();
      CloseCurrentInfoBar();

      OdmHardwareDefinitionActionContext selected = e.ActionItem.ActionContext;
      if (selected.TargetHwDefPath == null)
      {
        using (OpenFileDialog openFileDialog = new OpenFileDialog())
        {
          openFileDialog.Filter = "json files (*.json)|*.json";
          openFileDialog.RestoreDirectory = true;

          if (openFileDialog.ShowDialog() == DialogResult.OK)
          {
            selected = new OdmHardwareDefinitionActionContext(selected.OriginalHwDefPath, openFileDialog.FileName);
          }
        }
      }
      _ = System.Threading.Tasks.Task.Run(async () =>
      {
        string originalHwDefFileName = Path.GetFileName(selected.OriginalHwDefPath);
        string portedPath = await HardwareDefinitionLanguageClient.Instance.PortHardwareDefinitionAsync(selected.OriginalHwDefPath, selected.TargetHwDefPath);
        if (portedPath != null)
        {

          var doc = await VS.Documents.OpenAsync(portedPath);
          await doc.ShowAsync();
          await CreateAndDisplayInfoBarAsync($"Successfully ported {originalHwDefFileName}", portedPath);
        } else
        {
          string targetHwDefFileName = Path.GetFileName(selected.TargetHwDefPath);
          await CreateAndDisplayInfoBarAsync($"Failed to port hardware definition file to {targetHwDefFileName} because it is invalid", await CurrentFilePathAsync());
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
