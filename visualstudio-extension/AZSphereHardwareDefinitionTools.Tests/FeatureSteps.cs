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
      RunSync(async () =>
      {
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

    [When("I run the \"Add pin mappings for Hardware Definition File\" command")]
    public void I_run_the_add_pin_mappings_command()
    {
      RunSync(async () =>
      {
        // wait until language client is ready
        await TestUtils.RetryWhile(
          () => HardwareDefinitionLanguageClient.Instance == null && HardwareDefinitionLanguageClient.Instance?.Rpc == null,
          async () => await TestUtils.SleepAsync(2000)
        );

        await TestUtils.ExecuteCommandAsync("Tools.AddpinmappingsforHardwareDefinitionFile");

        // wait until info bar is displayed and actions become available
        await TestUtils.RetryWhile(() => GeneratePinMappingsHandler.Instance.currentInfoBarActions == null, async () => await TestUtils.SleepAsync(2000));
      });
    }

    [When("I add (.+) pin mappings of type \"([^\"]+)\"")]
    public void I_add_pin_mappings_of_type(int pinCount, string pinType, World world)
    {
      var oldHwDefContent = TestUtils.GetFileText(world.CurrentlyOpenFile);
      RunSync(async () =>
      {
        GeneratePinMappingsHandler pinMappingCmdHandler = GeneratePinMappingsHandler.Instance;

        var selectPinTypeButtons = pinMappingCmdHandler.currentInfoBarActions;
        var buttonWithPinType = selectPinTypeButtons.FirstOrDefault(a => a.Text == pinType);
        Assert.True(buttonWithPinType != null, $"No button exists to add the desired pin type {pinType}");
        await Microsoft.VisualStudio.Shell.ThreadHelper.JoinableTaskFactory.SwitchToMainThreadAsync();
        pinMappingCmdHandler.OnPinTypeSelected(null, TestUtils.InfoBarActionEvent(buttonWithPinType));

        // wait until a new info bar is displayed and available actions change
        await TestUtils.RetryWhile(
          () => pinMappingCmdHandler.currentInfoBarActions == selectPinTypeButtons || pinMappingCmdHandler.currentInfoBarActions == null,
          async () => await TestUtils.SleepAsync(2000)
        );

        var selectPinCountButtons = pinMappingCmdHandler.currentInfoBarActions;
        var buttonWithPinCount = selectPinCountButtons.FirstOrDefault(a => a.Text == pinCount.ToString());
        Assert.True(buttonWithPinType != null, $"No button exists to add the desired number of pins {pinCount}");
        await Microsoft.VisualStudio.Shell.ThreadHelper.JoinableTaskFactory.SwitchToMainThreadAsync();
        pinMappingCmdHandler.OnPinMappingsSelected(null, TestUtils.InfoBarActionEvent(buttonWithPinCount));

        // wait for hw definition file content to change
        await TestUtils.RetryWhile(
          () => TestUtils.GetFileText(world.CurrentlyOpenFile) == oldHwDefContent,
          async () => await TestUtils.SleepAsync(2000)
        );
      });
    }

    [Then("\"([^\"]+)\" should contain the following pin mappings:")]
    public void should_contain_the_following_pin_mappings(string filename, ExpectedPinMapping[] expectedPinMappings)
    {
      RunSync(async () =>
      {
        await TestUtils.OpenFileAsync(filename);
        var hwDefContent = TestUtils.GetFileText(filename);
        var actualPinMappings = Newtonsoft.Json.Linq.JToken.Parse(hwDefContent)["Peripherals"].ToObject<ExpectedPinMapping[]>();
        Assert.Equal(expectedPinMappings, actualPinMappings);
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

  public class ExpectedPinMapping
  {
    public string Name { get; set; }
    public string Type { get; set; }
    public string Mapping { get; set; }

    public ExpectedPinMapping(string name, string type, string mapping)
    {
      Name = name.Replace("<empty>", "");
      Type = type;
      Mapping = mapping;
    }

    public override bool Equals(object obj)
    {
      return obj is ExpectedPinMapping mapping &&
             Name == mapping.Name &&
             Type == mapping.Type &&
             Mapping == mapping.Mapping;
    }

    public override int GetHashCode()
    {
      int hashCode = 553713152;
      hashCode = hashCode * -1521134295 + EqualityComparer<string>.Default.GetHashCode(Name);
      hashCode = hashCode * -1521134295 + EqualityComparer<string>.Default.GetHashCode(Type);
      hashCode = hashCode * -1521134295 + EqualityComparer<string>.Default.GetHashCode(Mapping);
      return hashCode;
    }
  }

  public class World
  {
    public string CurrentlyOpenFile { get; set; }
    public (int line, int character) CurrentCaretPosition { get; set; }
  }
}
