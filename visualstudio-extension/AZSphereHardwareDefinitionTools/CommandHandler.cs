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
  abstract class CommandHandler
  {
    protected InfoBar currentInfoBar;

    /// <summary>
    /// Returns the path to the currently open file
    /// </summary>
    /// <returns>Null if no file is currently open</returns>
    protected async Task<string> CurrentFilePathAsync()
    {
      try
      {
        return (await VS.Documents.GetCurrentDocumentAsync())?.FilePath;
      } catch (System.Runtime.InteropServices.COMException)
      {
        // occurs when no file is currently open
        return null;
      }
    }

    /// <summary>
    /// 
    /// </summary>
    /// <param name="message">InfoBar main message</param>
    /// <param name="currentFilePath">Path to the file where the InfoBar is displayed</param>
    /// <param name="actions">Action buttons/links to add to the InfoBar</param>
    /// <param name="eventHandler">The callback to execute when an ActionItem from the displayed InfoBar is selected</param>
    /// <returns></returns>
    protected async System.Threading.Tasks.Task CreateAndDisplayInfoBarAsync(string message, string currentFilePath, IEnumerable<InfoBarActionItem> actions = null, EventHandler<InfoBarActionItemEventArgs> eventHandler = null)
    {
      CloseCurrentInfoBar();
      if (actions == null)
      {
        actions = new InfoBarActionItem[] { };
      }
      
      var infoBarElement = VS.InfoBar.CreateInfoBar(currentFilePath, new InfoBarModel(message, actions));
      currentInfoBar = infoBarElement;

      if (eventHandler != null)
      {
        infoBarElement.ActionItemClicked += eventHandler;
      }

      await currentInfoBar.TryShowInfoBarUIAsync();
    }

    protected void CloseCurrentInfoBar()
    {
      if (currentInfoBar != null && currentInfoBar.IsVisible)
      {
        currentInfoBar?.Close();
      }
    }
  }
}
