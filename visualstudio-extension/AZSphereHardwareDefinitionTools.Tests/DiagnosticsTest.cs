using AZSphereHardwareDefinitionTools;
using EnvDTE;
using Microsoft;
using Microsoft.VisualStudio.Shell;
using System;
using System.IO;
using System.Linq;
using Xunit;
using Task = System.Threading.Tasks.Task;

namespace AZSphereHardwareDefinitionTools.Tests
{
  [VsTestSettings(Version = "2019")]
  public class DiagnosticsTest
  {

    [VsFact]
    public async Task GeneratesDiagnosticsAsync()
    {
      await TestUtils.LoadExtensionAsync();

      var serviceProvider = ServiceProvider.GlobalProvider;

      var dte = serviceProvider.GetService(typeof(DTE)) as DTE;
      Assumes.Present(dte);

      await TestUtils.OpenTestFixtureFileAsync(dte, "diagnostics.json");

      int expectedDiagnosticsCount = 4;
      int maxAttempts = 5;
      int attempts = 0;
      var errors = await TestUtils.GetErrorsAsync(dte, serviceProvider);
      while (errors.Count < expectedDiagnosticsCount || attempts < maxAttempts)
      {
        await TestUtils.SleepAsync(2000);
        errors = await TestUtils.GetErrorsAsync(dte, serviceProvider);
        attempts++;
      }

      Assert.Equal(expectedDiagnosticsCount, errors.Count);

      string[] expectedMessages = new string[] {
        "\"USER_BUTTON_A\" is already mapped",
        "Mapping USER_BUTTON_A is invalid. There is no imported pin mapping with that name.",
        "Mapping USER_BUTTON_A is invalid. There is no imported pin mapping with that name.",
        "Mapping USER_BUTTON_B is invalid. There is no imported pin mapping with that name."
      };
      foreach (string expectedMessage in expectedMessages)
      {
        Assert.Contains(errors, e => e.GetText().Contains(expectedMessage));
      }

    }
  }
}
