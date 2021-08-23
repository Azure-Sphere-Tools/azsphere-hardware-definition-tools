using System;
using System.IO;
using System.Linq;
using System.Reflection;
using System.Threading.Tasks;
using TickSpec;
using Xunit;

namespace AZSphereHardwareDefinitionTools.Tests
{

  /// <summary>
  /// Base for e2e cucumber tests. Each feature is split into its own test file so they can be visualized separately under XUnit test reports.
  /// All e2e test classes should be part of the SequentialIntegrationTests collection to prevent them from running in parallel.
  /// </summary>
  [Collection("SequentialIntegrationTests")]
  [VsTestSettings(Version = "2019")]
  public abstract class FeatureTestBase : IAsyncLifetime
  {


    // Open/close solution before/after each test to prevent them from affecting each other
    public async Task InitializeAsync()
    {
      await TestUtils.LoadExtensionAsync();
      TestUtils.CreateFile("TestSolution.sln.test", SOLUTION_FILE_CONTENT);
      await TestUtils.OpenSolutionAsync("TestSolution.sln.test");
    }

    async Task IAsyncLifetime.DisposeAsync()
    {
      await TestUtils.CloseSolutionAsync();
    }

    private const string TEST_PROJ_DIRECTORY = "AZSphereHardwareDefinitionTools.Tests";
    private static readonly string workingDirectory = Path.GetFullPath(Environment.CurrentDirectory);

    private static string FeatureFilesDir()
    {
      string testProjDir = workingDirectory.Substring(0, workingDirectory.LastIndexOf(TEST_PROJ_DIRECTORY) + TEST_PROJ_DIRECTORY.Length);
      return Path.GetFullPath(Path.Combine(testProjDir, "../../features"));
    }

    public async Task TestScenariosUnderFeatureAsync(string featureFile)
    {
      var assembly = Assembly.GetExecutingAssembly();
      var definitions = new StepDefinitions(assembly.GetTypes());
      var feature = definitions.GenerateFeature(Path.Combine(FeatureFilesDir(), featureFile));
      foreach (var scenario in feature.Scenarios)
      {
        if (scenario.Tags.Contains("ignore"))
        {
          throw new ArgumentException(scenario.Name + " ignored. Ignored scenarios are not supported.");
        }
        await InitializeAsync();

        scenario.Action.Invoke();

        await TestUtils.CloseSolutionAsync();
      }
    }

    private static readonly string SOLUTION_FILE_CONTENT =
@"
Microsoft Visual Studio Solution File, Format Version 12.00
# Example Solution File used for Visual Studio e2e tests
VisualStudioVersion = 16.0.31410.357
MinimumVisualStudioVersion = 10.0.40219.1
Project(""{2150E333-8FDC-42A3-9474-1A3956D46DE8}"") = ""Solution Items"", ""Solution Items"", ""{71E15EAF-FBC5-403D-A889-3F769B370274}""
EndProject
Global

  GlobalSection(SolutionConfigurationPlatforms) = preSolution

    Debug|Any CPU = Debug | Any CPU

    Release|Any CPU = Release | Any CPU
    EndGlobalSection

  GlobalSection(SolutionProperties) = preSolution
    HideSolutionNode = FALSE

  EndGlobalSection
  GlobalSection(ExtensibilityGlobals) = postSolution
    SolutionGuid = { D8029BC4 - EE27 - 432D - 8991 - AB186C848D0D }

  EndGlobalSection
EndGlobal
";
  }
}
