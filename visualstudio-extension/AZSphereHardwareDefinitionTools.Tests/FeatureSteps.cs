using Microsoft.VisualStudio.Shell.Interop;
using System;
using System.Collections.Generic;
using System.Linq;
using System.Text;
using System.Threading.Tasks;
using TickSpec;
using Xunit;

namespace AZSphereHardwareDefinitionTools.Tests
{
  public class FeatureSteps
  {
    private readonly IInstanceProvider instanceProvider;

    public FeatureSteps(IInstanceProvider instanceProvider)
    {
      this.instanceProvider = instanceProvider;
    }

    private static readonly string _hwDefSchemaProperty = "\"$schema\": \"https://raw.githubusercontent.com/Azure-Sphere-Tools/hardware-definition-schema/master/hardware-definition-schema.json\"";
    [Given("a hardware definition file \"([^\"]+)\":")]
    public void a_hardware_definition_file(string fileName, string fileContent)
    {
      int indexOfClosingBracket = fileContent.LastIndexOf('}');
      if (indexOfClosingBracket != -1)
      {
        // add schema property to prevent suggestion popup which blocks main thread
        fileContent = fileContent.Insert(indexOfClosingBracket, "," + _hwDefSchemaProperty);
      }
      TestUtils.CreateFile(fileName, fileContent);
    }


    [When("I open \"([^\"]+)\"")]
    public void I_open(string filename)
    {
      RunSync(async () => await TestUtils.OpenFileAsync(filename));
      instanceProvider.RegisterInstance(typeof(World), new World { CurrentlyOpenFile = filename });
    }

    [Then(@"I should get the following diagnostics:")]
    public void I_should_get_the_following_diagnostics(ExpectedDiagnostic[] expectedDiagnostics)
    {
      RunSync(async () =>
      {
        var serviceProvider = await TestUtils.GetServiceProviderAsync();
        var dte = await TestUtils.GetDTEAsync();

        int expectedDiagnosticsCount = expectedDiagnostics.Length;
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

        foreach (var row in expectedDiagnostics)
        {
          __VSERRORCATEGORY expectedSeverity = row.Severity;
          string expectedMessage = row.Message;

          var matchingError = errors.FirstOrDefault(e => e.GetText().Contains(expectedMessage) && e.GetCategory() == expectedSeverity);
          Assert.True(matchingError != null, $"No diagnostic generated with severity {expectedSeverity} and message {expectedMessage}");
        }
      });
    }

    [When("I move my caret to (.+)")]
    public void I_move_my_caret_to(string textToMoveTo, World world)
    {
      RunSync(async () => {
        string fileText = TestUtils.GetFileText(world.CurrentlyOpenFile);
        (int line, int character) = TestUtils.OffsetAsPosition(fileText, fileText.IndexOf(textToMoveTo));
        await TestUtils.MoveCaretAsync(line, character);
        world.CurrentCaretPosition = (line, character);
      });
    }

    [Then("I should get the following suggestions:")]
    public void I_should_get_the_following_suggestions(Table suggestionsTable)
    {
      var expectedSuggestions = suggestionsTable.Raw.Select(row => row[0]).ToArray();
      RunSync(async () =>
      {
        var actualCompletionItems = await TestUtils.TriggerCompletionAsync();
        var actualSuggestions = actualCompletionItems.Select(item => item.InsertText).ToArray();
        
        Assert.Equal(expectedSuggestions, actualSuggestions);
      });
    }

    /// <summary>
    /// Blocks until an async function finishes to ensure that all Feature steps are run synchronously (TickSpec library limitation)
    /// </summary>
    private static T RunSync<T>(Func<Task<T>> asyncFunc)
    {
      return Task.Run(asyncFunc).ConfigureAwait(false).GetAwaiter().GetResult();
    }
    private static void RunSync(Func<Task> asyncFunc)
    {
      Task.Run(asyncFunc).ConfigureAwait(false).GetAwaiter().GetResult();
    }
  }

  /// <summary>
  /// Represents a row for the expected diagnostics step's table. TickSpec will automatically convert the table to an array of this class.
  /// </summary>
  public class ExpectedDiagnostic
  {
    public __VSERRORCATEGORY Severity { get; set; }
    public string Message { get; set; }

    public ExpectedDiagnostic(string severity, string message)
    {
      Severity = StringAsCategory(severity);
      Message = message;
    }

    private static __VSERRORCATEGORY StringAsCategory(string severity)
    {
      switch (severity)
      {
        case "Error":
          return __VSERRORCATEGORY.EC_ERROR;
        case "Warning":
          return __VSERRORCATEGORY.EC_WARNING;
        default:
          return __VSERRORCATEGORY.EC_MESSAGE;
      }
    }
  }

  public class World
  {
    public string CurrentlyOpenFile { get; set; }
    public (int line, int character) CurrentCaretPosition { get; set; }
  }
}
