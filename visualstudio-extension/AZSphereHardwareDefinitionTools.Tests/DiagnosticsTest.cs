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
  // All integration test classes should be part of the SequentialIntegrationTests collection
  // to prevent them from running in parallel
  [Collection("SequentialIntegrationTests")]
  [VsTestSettings(Version = "2019")]
  public class DiagnosticsTest : IAsyncLifetime
  {
    // Open/close solution before/after each test to prevent them from affecting each other
    public async Task InitializeAsync()
    {
      await TestUtils.LoadExtensionAsync();

      await TestUtils.OpenSolutionAsync("TestSolution.sln.test");

    }

    async Task IAsyncLifetime.DisposeAsync()
    {
      await TestUtils.CloseSolutionAsync();
    }

    [VsFact]
    public async Task GeneratesDiagnostics()
    {

      var serviceProvider = await TestUtils.GetServiceProviderAsync();
      var dte = await TestUtils.GetDTEAsync();

      await TestUtils.OpenTestFixtureFileAsync("diagnostics.json");
      int expectedDiagnosticsCount = 4;
      int maxAttempts = 5;
      int attempts = 0;
      var errors = await TestUtils.GetErrorsAsync(dte, serviceProvider);
      while (errors.Count < expectedDiagnosticsCount && attempts < maxAttempts)
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
