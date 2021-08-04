using Community.VisualStudio.Toolkit;
using Microsoft.VisualStudio.Shell;
using System;
using System.Collections.Generic;
using System.Linq;
using System.Text;
using System.Threading.Tasks;

namespace AZSphereHardwareDefinitionTools
{
  class PinMappingGenerator
  {
    public static PinMappingGenerator Instance = new PinMappingGenerator();

    private InfoBar currentInfoBar;
    
    public async System.Threading.Tasks.Task GeneratePinMappingsAsync()
    {
      currentInfoBar?.Close();
      string currentFilePath = await CurrentFilePathAsync();
      string currentFileUri = new Uri(currentFilePath).AbsoluteUri;

      if (HardwareDefinitionLanguageClient.Instance == null)
      {
        await CreateAndDisplayInfoBarAsync("Cannot generate pin mappings while extension is still loading", currentFilePath, new InfoBarActionItem[] { });
        return;
      }

      var pinTypes = await HardwareDefinitionLanguageClient.Instance.GetAvailablePinTypesAsync(currentFileUri);
      var actions = pinTypes.Select(p => new InfoBarButton(p, new PinTypeActionContext(currentFileUri, p))).ToList();
      if (actions.Count > 0)
      {
        await CreateAndDisplayInfoBarAsync("Select pin type to add", currentFilePath, actions, OnPinTypeSelected);
      }
    }

    private void OnPinTypeSelected(object sender, InfoBarActionItemEventArgs e)
    {
      ThreadHelper.ThrowIfNotOnUIThread();
      currentInfoBar?.Close();

      PinTypeActionContext selected = e.ActionItem.ActionContext;
      _ = System.Threading.Tasks.Task.Run(async () =>
      {
        var availablePins = await HardwareDefinitionLanguageClient.Instance.GetAvailablePinsAsync(selected.CurrentFileUri, selected.PinType);
        var actions = availablePins.Select((pin, index) =>
        {
          int numberOfPinsToAdd = index + 1;
          return new InfoBarHyperlink(numberOfPinsToAdd.ToString(), new PinMappingActionContext(selected.CurrentFileUri, availablePins.Take(numberOfPinsToAdd).ToArray(), selected.PinType));
        }).ToList();
        if (actions.Count > 0)
        {
          await CreateAndDisplayInfoBarAsync($"Choose the number of {selected.PinType} pins you want to add", await CurrentFilePathAsync(), actions, OnPinMappingsSelected);
        }
      });

    }

    private void OnPinMappingsSelected(object sender, InfoBarActionItemEventArgs e)
    {
      ThreadHelper.ThrowIfNotOnUIThread();
      currentInfoBar?.Close();

      PinMappingActionContext selected = e.ActionItem.ActionContext;
      _ = System.Threading.Tasks.Task.Run(async () =>
      {
        await HardwareDefinitionLanguageClient.Instance.PostPinAmountToGenerateAsync(selected.CurrentFileUri, selected.PinMappingsToAdd, selected.PinType);
      });

    }

    /// <summary>
    /// 
    /// </summary>
    /// <param name="message">InfoBar main message</param>
    /// <param name="currentFilePath">Path to the file where the InfoBar is displayed</param>
    /// <param name="actions">Action buttons/links to add to the InfoBar</param>
    /// <param name="eventHandler">The callback to execute when an ActionItem from the displayed InfoBar is selected</param>
    /// <returns></returns>
    private async System.Threading.Tasks.Task CreateAndDisplayInfoBarAsync(string message, string currentFilePath, IEnumerable<InfoBarActionItem> actions, EventHandler<InfoBarActionItemEventArgs> eventHandler = null)
    {
      var infoBarElement = VS.InfoBar.CreateInfoBar(currentFilePath, new InfoBarModel(message, actions));
      currentInfoBar = infoBarElement;

      if (eventHandler != null)
      {
        infoBarElement.ActionItemClicked += eventHandler;
      }

      await currentInfoBar.TryShowInfoBarUIAsync();
    }

    private static async Task<string> CurrentFilePathAsync()
    {
      return (await VS.Documents.GetCurrentDocumentAsync()).FilePath;
    }
  }

  /// <summary>
  /// Info related to a selected Pin Type
  /// </summary>
  class PinTypeActionContext
  {
    internal string CurrentFileUri { get; }
    internal string PinType { get; }

    internal PinTypeActionContext(string currentFileUri, string pinType)
    {
      CurrentFileUri = currentFileUri;
      PinType = pinType;
    }
  }

  /// <summary>
  /// Info related to a selected amount of Pin Mappings to add
  /// </summary>
  class PinMappingActionContext
  {
    internal string CurrentFileUri { get; }


    internal string[] PinMappingsToAdd { get; }
    internal string PinType { get; }

    internal PinMappingActionContext(string currentFileUri, string[] pinMappingsToAdd, string pinType)
    {
      CurrentFileUri = currentFileUri;
      PinMappingsToAdd = pinMappingsToAdd;
      PinType = pinType;
    }
  }
}
