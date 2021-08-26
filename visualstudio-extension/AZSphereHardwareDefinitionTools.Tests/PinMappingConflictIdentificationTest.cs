using System;
using System.IO;
using System.Linq;
using System.Reflection;
using System.Threading.Tasks;
using Xunit;

namespace AZSphereHardwareDefinitionTools.Tests
{
  public class PinMappingConflictIdentificationTest : FeatureTestBase
  {
    [VsFact]
    public async Task PinMappingConflictIdentificationFeature()
    {
      await TestScenariosUnderFeatureAsync("PinMappingConflictIdentification.feature");
    }
  }
}
