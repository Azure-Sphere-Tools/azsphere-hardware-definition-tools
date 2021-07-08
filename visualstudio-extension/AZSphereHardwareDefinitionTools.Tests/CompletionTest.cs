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
  public class CompletionTest
  {
    [VsFact]
    public async Task CompletesAvailableMappingsOfSameType()
    {

      await TestUtils.LoadExtensionAsync();

      await TestUtils.OpenSolutionAsync("TestSolution.sln.test");

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
