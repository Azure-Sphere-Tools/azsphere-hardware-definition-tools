using System;
using System.Collections.Generic;
using System.Linq;
using System.Text;
using System.Threading.Tasks;
using Xunit;

namespace AZSphereHardwareDefinitionTools.Tests
{
  public class PinMappingGenerationTest : FeatureTestBase
  {
    [VsFact]
    public async Task PinMappingGenerationFeature()
    {
      await TestScenariosUnderFeatureAsync("PinMappingGeneration.feature");
    }
  }
}
