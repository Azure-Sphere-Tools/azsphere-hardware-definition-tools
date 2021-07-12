using AZSphereHardwareDefinitionTools;
using EnvDTE;
using Microsoft;
using Microsoft.VisualStudio.Shell;
using System;
using System.IO;
using System.Linq;
using System.Threading.Tasks;
using Xunit;
using Task = System.Threading.Tasks.Task;

namespace AZSphereHardwareDefinitionTools.Tests
{
  [Collection("SequentialIntegrationTests")]
  [VsTestSettings(Version = "2019")]
  public class CompletionTest : IAsyncLifetime
  {

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
    public async Task CompletesAvailableMappingsOfSameType()
    {
      await TestUtils.OpenTestFixtureFileAsync("completion/completion.json");
      await TestUtils.MoveCaretAsync(10, 53);
      var gpioCompletionItems = await TestUtils.TriggerCompletionAsync();
      Assert.Single(gpioCompletionItems);
      Assert.Equal("\"ODM_GPIO1\"", gpioCompletionItems.First().InsertText);

      // Press escape to dismiss previous completion suggestions
      await TestUtils.PressEscapeAsync();

      await TestUtils.MoveCaretAsync(12, 51);
      var pwmCompletionItems = await TestUtils.TriggerCompletionAsync();
      Assert.Single(pwmCompletionItems);
      Assert.Equal("\"ODM_PWM0\"", pwmCompletionItems.First().InsertText);

    }
  }
}
