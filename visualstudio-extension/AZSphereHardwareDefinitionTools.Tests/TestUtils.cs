using Community.VisualStudio.Toolkit;
using Community.VisualStudio.Toolkit.Shared;
using EnvDTE;
using Microsoft;
using Microsoft.VisualStudio.Shell;
using Microsoft.VisualStudio.Shell.TableControl;
using Microsoft.VisualStudio.Shell.TableManager;
using Microsoft.VisualStudio.Shell.Interop;
using Task = System.Threading.Tasks.Task;

using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Threading.Tasks;
using Microsoft.VisualStudio.Language.Intellisense.AsyncCompletion;
using Microsoft.VisualStudio.Language.Intellisense.AsyncCompletion.Data;
using Microsoft.VisualStudio.Imaging.Interop;

namespace AZSphereHardwareDefinitionTools.Tests
{
  class TestUtils
  {
    public static async Task LoadExtensionAsync()
    {
      await ThreadHelper.JoinableTaskFactory.SwitchToMainThreadAsync();
      var shell = (IVsShell7)ServiceProvider.GlobalProvider.GetService(typeof(SVsShell));
      Assumes.Present(shell);
      var guid = Guid.Parse(AZSphereHardwareDefinitionToolsPackage.PackageGuidString);
      await shell.LoadPackageAsync(ref guid);
    }

    public static async Task<WindowFrame> OpenFileAsync(string filename)
    {
      var doc = await VS.Documents.OpenAsync(FullFilePath(filename));
      await doc.ShowAsync();
      return doc;
    }

    public static string FullFilePath(string filename)
    {
      return Path.GetFullPath(Path.Combine(WorkingDir(), filename));
    }

    private static string WorkingDir()
    {
      return Path.Combine(HardwareDefinitionLanguageClient.ExtensionPath(), "testWorkingDir");
    }

    /// <summary>
    /// Creates a file under the "working directory" for the test
    /// </summary>
    /// <param name="relativePath">Path to the file relative to the test "working directory"</param>
    /// <param name="content">Content of the file to create</param>
    /// <returns></returns>
    public static void CreateFile(string relativePath, string content)
    {
      string fullPath = Path.Combine(WorkingDir(), relativePath);
      Directory.CreateDirectory(Path.GetDirectoryName(fullPath));
      File.WriteAllText(fullPath, content);
    }

    public static string GetFileText(string relativePath)
    {
      string fullPath = Path.Combine(WorkingDir(), relativePath);
      return File.ReadAllText(fullPath);
    }

    /// <summary>
    /// Sleeps for the specified milliseconds on a separate thread 
    /// </summary>
    /// <param name="mill"></param>
    /// <returns></returns>
    public static async Task SleepAsync(int mill)
    {
      await Task.Yield(); // call yield to make sure we don't run the sleep on the UI thread
      await Task.Run(() => System.Threading.Thread.Sleep(mill)).ConfigureAwait(false);
    }

    public static async Task RetryWhile(Func<bool> condition, Func<Task> retryFunc, int maxAttempts = 5)
    {
      int attempts = 0;
      while (attempts < maxAttempts && condition())
      {
        await retryFunc();
        attempts++;
      }
    }

    public static async Task<ServiceProvider> GetServiceProviderAsync()
    {
      await ThreadHelper.JoinableTaskFactory.SwitchToMainThreadAsync();
      return ServiceProvider.GlobalProvider;
    }

    public static async Task<DTE> GetDTEAsync()
    {
      await ThreadHelper.JoinableTaskFactory.SwitchToMainThreadAsync();
      var dte = ServiceProvider.GlobalProvider.GetService(typeof(DTE)) as DTE;
      Assumes.Present(dte);
      return dte;
    }

    /// <summary>
    /// Opens a Solution - usually needed before running e2e tests to enable Visual Studio functionalities
    /// </summary>
    /// <param name="slnFileName">Relative path to solution file in the test's "working directory"</param>
    /// <returns></returns>
    public static async Task OpenSolutionAsync(string slnFileName)
    {
      await ThreadHelper.JoinableTaskFactory.SwitchToMainThreadAsync();
      (await VS.Services.GetSolutionAsync()).OpenSolutionFile((uint)__VSSLNOPENOPTIONS.SLNOPENOPT_Silent, FullFilePath(slnFileName));

    }

    /// <summary>
    /// Closes the active Solution and deletes all files under the test's working directory - usually needed after running an e2e to prevent it from affecting others
    /// </summary>
    /// <returns></returns>
    public static async Task<bool> CloseSolutionAsync()
    {
      await ThreadHelper.JoinableTaskFactory.SwitchToMainThreadAsync();
      var solutionService = await VS.Services.GetSolutionAsync();
      var resultCode = solutionService.CloseSolutionElement((uint)__VSSLNCLOSEOPTIONS.SLNCLOSEOPT_DeleteProject, null, 0);
      if (Directory.Exists(WorkingDir()))
      {
        Directory.Delete(WorkingDir(), true);
      }
      return resultCode == Microsoft.VisualStudio.VSConstants.S_OK;

    }

    public static async Task ExecuteCommandAsync(string commandName)
    {
      await VS.Commands.ExecuteAsync(commandName);
    }


    public static InfoBarActionItemEventArgs InfoBarActionEvent(InfoBarActionItem selectedAction)
    {
      return new InfoBarActionItemEventArgs(new MockInfoBarUIElement(), new MockVsInfoBar(), selectedAction);
    }

    public static async Task<bool> MoveCaretAsync(int line, int character)
    {
      await ThreadHelper.JoinableTaskFactory.SwitchToMainThreadAsync();
      // Reload document to dismiss previous completion suggestions if they exist
      await ReloadCurrentDocumentAsync();

      var currentView = await VS.Documents.GetCurrentNativeTextViewAsync();
      var resultCode = currentView.SetCaretPos(line, character);
      return resultCode == Microsoft.VisualStudio.VSConstants.S_OK;
    }

    public static (int line, int character) OffsetAsPosition(string text, int offset)
    {
      offset = Math.Max(Math.Min(offset, text.Length), 0);

      int line = 0, character = 0;
      for (int charIndex = 0; charIndex < offset; charIndex++)
      {
        char currentChar = text[charIndex];
        if (currentChar == '\n' || currentChar == '\r')
        {
          if (currentChar == '\r' && text[charIndex + 1] == '\n') // if \r\n i.e. crlf, skip the extra char
          {
            charIndex++;
          }
          line++;
          character = 0;
        } else
        {
          character++;
        }
      }
      return (line, character);
    }

    public static async Task<IEnumerable<CompletionItem>> TriggerCompletionAsync(int maxAttempts = 5)
    {
      // yield to make sure we don't execute this method on UI thread
      await Task.Yield();
      var completionBroker = await VS.GetMefServiceAsync<IAsyncCompletionBroker>();
      
      EventHandler<CompletionTriggeredEventArgs> onCompletion = null;
      var completionFinished = new TaskCompletionSource<IEnumerable<CompletionItem>>();
      
      // define an event handler which will set the 'completionFinished' task result when a completion occurs
      onCompletion = (sender, e) =>
      {
        var completionItems = e.CompletionSession.GetComputedItems(System.Threading.CancellationToken.None).Items;
        completionFinished.SetResult(completionItems);
        // unsubscribe from the CompletionTriggered event after the event handler has been called once
        completionBroker.CompletionTriggered -= onCompletion;
      };

      // subscribe to the CompletionTriggered event
      completionBroker.CompletionTriggered += onCompletion;

      // trigger completion
      int attempts = 0;
      while (!completionFinished.Task.IsCompleted && attempts < maxAttempts)
      {
        await SleepAsync(2000);
        await VS.Commands.ExecuteAsync("Edit.CompleteWord");
        attempts++;
      }

      if (attempts == maxAttempts)
      {
        return new List<CompletionItem>();
      }
      return await completionFinished.Task;
    }

    public static async Task PressEscapeAsync()
    {
      await ThreadHelper.JoinableTaskFactory.SwitchToMainThreadAsync();
      System.Windows.Forms.SendKeys.Send("{ESC}");
    }

    public static async Task ReloadCurrentDocumentAsync()
    {
      await ThreadHelper.JoinableTaskFactory.SwitchToMainThreadAsync();
      (await VS.Documents.GetCurrentDocumentAsync()).Reload();
    }

    /// <summary>
    /// Retrieves the entries in the Error List table which contains the diagnostics sent by the language server.
    /// Note that the Error List can contain messages/warnings/errors from different sources, not just the language server (e.g. compilation errors)
    /// </summary>
    /// <param name="dte"></param>
    /// <param name="serviceProvider"></param>
    /// <returns></returns>
    public static async Task<IList<ITableEntryHandle>> GetErrorsAsync(DTE dte, ServiceProvider serviceProvider)
    {
      await ThreadHelper.JoinableTaskFactory.SwitchToMainThreadAsync();
      dte.ExecuteCommand("View.ErrorList", " ");
      var errorList = (IErrorList)serviceProvider.GetService(typeof(SVsErrorList));
      Assumes.Present(errorList);
      errorList.AreOtherErrorSourceEntriesShown = true;
      errorList.AreErrorsShown = true;
      errorList.AreWarningsShown = true;
      errorList.AreBuildErrorSourceEntriesShown = true;

      var args = await errorList.TableControl.ForceUpdateAsync();

      return args.AllEntries.ToList();
    }

    public static List<string> ErrorsAsString(IList<ITableEntryHandle> errorItems, __VSERRORCATEGORY minimumSeverity = __VSERRORCATEGORY.EC_MESSAGE)
    {

      var list = new List<string>();

      foreach (var item in errorItems)
      {
        if (item.GetCategory() > minimumSeverity)
        {
          continue;
        }


        var source = item.GetBuildTool();
        var document = Path.GetFileName(item.GetPath() ?? item.GetDocumentName()) ?? "<unknown>";
        var line = item.GetLine() ?? -1;
        var column = item.GetColumn() ?? -1;
        var errorCode = item.GetErrorCode() ?? "<unknown>";
        var text = item.GetText() ?? "<unknown>";

        var severity = "unknown";
        if (item.GetCategory() == __VSERRORCATEGORY.EC_ERROR)
        {
          severity = "error";
        }
        else if (item.GetCategory() == __VSERRORCATEGORY.EC_WARNING)
        {
          severity = "warning";
        }
        else if (item.GetCategory() == __VSERRORCATEGORY.EC_MESSAGE)
        {
          severity = "info";
        }

        var message = $"({source}) {document}({line + 1}, {column + 1}): {severity} {errorCode}: {text}";
        list.Add(message);
      }

      return list
          .OrderBy(x => x, StringComparer.OrdinalIgnoreCase)
          .ThenBy(x => x, StringComparer.Ordinal).ToList();
    }
  }

  public static class ErrorListExtensions
  {
    public static __VSERRORCATEGORY GetCategory(this ITableEntry tableEntry)
    {
      return tableEntry.GetValueOrDefault(StandardTableKeyNames.ErrorSeverity, (__VSERRORCATEGORY)(-1));
    }

    public static string GetBuildTool(this ITableEntry tableEntry)
    {
      return tableEntry.GetValueOrDefault(StandardTableKeyNames.BuildTool, "<unknown>");
    }

    public static string GetPath(this ITableEntry tableEntry)
    {
      return tableEntry.GetValueOrDefault<string>(StandardTableKeyNames.Path, null);
    }

    public static string GetDocumentName(this ITableEntry tableEntry)
    {
      return tableEntry.GetValueOrDefault<string>(StandardTableKeyNames.DocumentName, null);
    }

    public static int? GetLine(this ITableEntry tableEntry)
    {
      return tableEntry.GetValueOrNull<int>(StandardTableKeyNames.Line);
    }

    public static int? GetColumn(this ITableEntry tableEntry)
    {
      return tableEntry.GetValueOrNull<int>(StandardTableKeyNames.Column);
    }

    public static string GetErrorCode(this ITableEntry tableEntry)
    {
      return tableEntry.GetValueOrDefault<string>(StandardTableKeyNames.ErrorCode, null);
    }

    public static string GetText(this ITableEntry tableEntry)
    {
      return tableEntry.GetValueOrDefault<string>(StandardTableKeyNames.Text, null);
    }

    private static T GetValueOrDefault<T>(this ITableEntry tableEntry, string keyName, T defaultValue)
    {
      if (!tableEntry.TryGetValue(keyName, out T value))
      {
        value = defaultValue;
      }

      return value;
    }

    private static T? GetValueOrNull<T>(this ITableEntry tableEntry, string keyName)
        where T : struct
    {
      if (!tableEntry.TryGetValue(keyName, out T value))
      {
        return null;
      }

      return value;
    }
  }

  class MockVsInfoBar : IVsInfoBar
  {
    public ImageMoniker Image => throw new NotImplementedException();

    public bool IsCloseButtonVisible => throw new NotImplementedException();

    public IVsInfoBarTextSpanCollection TextSpans => throw new NotImplementedException();

    public IVsInfoBarActionItemCollection ActionItems => throw new NotImplementedException();
  }

  class MockInfoBarUIElement : IVsInfoBarUIElement
  {
    public int get_DataSource(out IVsUISimpleDataSource ppDataSource)
    {
      throw new NotImplementedException();
    }

    public int put_DataSource(IVsUISimpleDataSource pDataSource)
    {
      throw new NotImplementedException();
    }

    public int TranslateAccelerator(IVsUIAccelerator pAccel)
    {
      throw new NotImplementedException();
    }

    public int GetUIObject(out object ppUnk)
    {
      throw new NotImplementedException();
    }

    public int Close()
    {
      throw new NotImplementedException();
    }

    public int Advise(IVsInfoBarUIEvents eventSink, out uint cookie)
    {
      throw new NotImplementedException();
    }

    public int Unadvise(uint cookie)
    {
      throw new NotImplementedException();
    }
  }
}
