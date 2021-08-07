using Community.VisualStudio.Toolkit;
using Microsoft.VisualStudio.Shell;
using System;
using System.Collections.Generic;
using System.Linq;
using System.Text;
using System.Threading.Tasks;

namespace AZSphereHardwareDefinitionTools
{
  class GeneratePinMappingsHandler : CommandHandler
  {
    public static GeneratePinMappingsHandler Instance = new GeneratePinMappingsHandler();

    public async System.Threading.Tasks.Task GeneratePinMappingsAsync()
    {
      CloseCurrentInfoBar();
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
      CloseCurrentInfoBar();

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
      CloseCurrentInfoBar();

      PinMappingActionContext selected = e.ActionItem.ActionContext;
      _ = System.Threading.Tasks.Task.Run(async () =>
      {
        await HardwareDefinitionLanguageClient.Instance.PostPinAmountToGenerateAsync(selected.CurrentFileUri, selected.PinMappingsToAdd, selected.PinType);
      });

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
