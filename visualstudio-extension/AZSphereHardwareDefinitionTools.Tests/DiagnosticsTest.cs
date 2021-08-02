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
    ServiceProvider serviceProvider;
    DTE dte;

    // Open/close solution before/after each test to prevent them from affecting each other
    public async Task InitializeAsync()
    {
      await TestUtils.LoadExtensionAsync();

      await TestUtils.OpenSolutionAsync("TestSolution.sln.test");

      serviceProvider = await TestUtils.GetServiceProviderAsync();
      dte = await TestUtils.GetDTEAsync();
    }

    async Task IAsyncLifetime.DisposeAsync()
    {
      await TestUtils.CloseSolutionAsync();
    }

    [VsFact]
    public async Task NonexistentMapping()
    {
      await TestUtils.OpenTestFixtureFileAsync("diagnostics.json");
      int expectedDiagnosticsCount = 5;
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

      /*
        Collection below does not include:

       "USER_BUTTON_A is also mapped to SAMPLE_BUTTON_2. (line 19, char 18)"
       "USER_BUTTON_A is also mapped to SAMPLE_BUTTON_1. (line 14, char 18)"
      */
      string[] expectedMessages = new string[] {
        "Peripheral USER_BUTTON_A not found.",
        "Peripheral USER_BUTTON_A not found.",
        "Peripheral USER_BUTTON_B not found."
      };

      foreach (string expectedMessage in expectedMessages)
      {
        Assert.Contains(errors, e => e.GetText().Equals(expectedMessage));
      }
    }

    [VsFact]
    public async Task DuplicateMapping()
    {
      await TestUtils.OpenTestFixtureFileAsync("diagnostics.json");
      int expectedDiagnosticsCount = 5;
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


      /*
        Collection below does not include:
                                                                             
        "Peripheral USER_BUTTON_A not found."
        "Peripheral USER_BUTTON_A not found."
        "Peripheral USER_BUTTON_B not found."
      */
      string[] expectedMessages = new string[] {
        "USER_BUTTON_A is also mapped to SAMPLE_BUTTON_2. (line 19, char 18)",
        "USER_BUTTON_A is also mapped to SAMPLE_BUTTON_1. (line 14, char 18)"
      };

      foreach (string expectedMessage in expectedMessages)
      {
        Assert.Contains(errors, e => e.GetText().Equals(expectedMessage));
      }
    }

    [VsFact]
    public async Task PinBlock()
    {
      await TestUtils.OpenTestFixtureFileAsync("pinblock.json");
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
        "MT3620_RDB_PWM_CONTROLLER0 configured as Gpio by MT3620_RDB_LED1_BLUE",
        "MT3620_RDB_ISU0_SPI configured as I2cMaster by MT3620_RDB_ISU0_I2C",
        "MT3620_GPIO5 cannot be used as Pwm",
        "MT3620_PWM_CONTROLLER1 cannot be used as Gpio"
      };

      foreach (string expectedMessage in expectedMessages)
      {         
        Assert.Contains(errors, e => e.GetText().StartsWith(expectedMessage));
      }
    }
  }
}
