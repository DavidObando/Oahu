using System;
using System.Linq;
using System.Reflection;
using Oahu.Audible.Json;
using Xunit;

namespace Oahu.Cli.Tests
{
  /// <summary>
  /// Audible returns every failed validator in one denial payload, so the classifier has to decide
  /// which reason actually characterises the response. Getting this wrong is destructive: a false
  /// positive marks a purchased title unavailable and hides it from the library.
  /// </summary>
  public class LicenseDenialClassificationTests
  {
    private static bool IsEntitlementDenial(ContentLicense license)
    {
      Type type = typeof(Oahu.Audible.Json.ContentLicense).Assembly
        .GetType("Oahu.Core.AudibleApi", throwOnError: true)!;

      MethodInfo method = type.GetMethod(
        "IsEntitlementDenial",
        BindingFlags.NonPublic | BindingFlags.Static)!;

      return (bool)method.Invoke(null, new object[] { license })!;
    }

    private static ContentLicense Denied(params (string ValidationType, string RejectionReason)[] reasons) =>
      new()
      {
        StatusCode = "Denied",
        LicenseDenialReasons = reasons
          .Select(r => new LicenseDenialReason
          {
            ValidationType = r.ValidationType,
            RejectionReason = r.RejectionReason,
            Message = "test",
          })
          .ToArray(),
      };

    [Fact]
    public void OwnershipRejection_IsEntitlementDenial()
    {
      Assert.True(IsEntitlementDenial(Denied(("Ownership", "NotEntitled"))));
    }

    /// <summary>
    /// The September 2026 regression: Audible throttled the customer, the ownership validator
    /// reported CustomerThrottled, and matching on validation type alone deleted books the
    /// customer had bought days earlier.
    /// </summary>
    [Fact]
    public void ThrottledOwnershipRejection_IsNotEntitlementDenial()
    {
      Assert.False(IsEntitlementDenial(Denied(("Ownership", "CustomerThrottled"))));
    }

    [Fact]
    public void ThrottlingVetoesOtherReasonsInSamePayload()
    {
      // Verbatim shape of the real denial: throttling suppresses the customer's plans and rights,
      // so the surrounding validators are reporting on an identity Audible never resolved.
      var license = Denied(
        ("Membership", "RequesterEligibility"),
        ("Ownership", "CustomerThrottled"),
        ("Client", "RequesterEligibility"),
        ("AYCL", "ContentEligibility"));

      Assert.False(IsEntitlementDenial(license));
    }

    [Fact]
    public void RejectionReasonMatchIsCaseInsensitive()
    {
      Assert.False(IsEntitlementDenial(Denied(("Ownership", "customerthrottled"))));
    }

    [Fact]
    public void NonOwnershipReasons_AreNotEntitlementDenial()
    {
      Assert.False(IsEntitlementDenial(Denied(("Membership", "RequesterEligibility"))));
    }

    [Fact]
    public void NoReasons_IsNotEntitlementDenial()
    {
      Assert.False(IsEntitlementDenial(new ContentLicense { StatusCode = "Denied" }));
    }
  }
}
