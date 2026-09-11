package Oahu.Cli.Tests

import Oahu.Audible.Json
import System
import System.Linq
import System.Reflection
import Xunit

/// Audible returns every failed validator in one denial payload, so the classifier has to decide
/// which reason actually characterises the response. Getting this wrong is destructive: a false
/// positive marks a purchased title unavailable and hides it from the library.
class LicenseDenialClassificationTests {
    @Fact
    func OwnershipRejection_IsEntitlementDenial() {
        Assert.True(IsEntitlementDenial(Denied(("Ownership", "NotEntitled"))))
    }

    /// The September 2026 regression: Audible throttled the customer, the ownership validator
    /// reported CustomerThrottled, and matching on validation type alone deleted books the
    /// customer had bought days earlier.
    @Fact
    func ThrottledOwnershipRejection_IsNotEntitlementDenial() {
        Assert.False(IsEntitlementDenial(Denied(("Ownership", "CustomerThrottled"))))
    }

    @Fact
    func ThrottlingVetoesOtherReasonsInSamePayload() {
        // Verbatim shape of the real denial: throttling suppresses the customer's plans and rights,
        // so the surrounding validators are reporting on an identity Audible never resolved.
        let license = Denied(
            ("Membership", "RequesterEligibility"),
            ("Ownership", "CustomerThrottled"),
            ("Client", "RequesterEligibility"),
            ("AYCL", "ContentEligibility")
        )
        Assert.False(IsEntitlementDenial(license))
    }

    @Fact
    func RejectionReasonMatchIsCaseInsensitive() {
        Assert.False(IsEntitlementDenial(Denied(("Ownership", "customerthrottled"))))
    }

    @Fact
    func NonOwnershipReasons_AreNotEntitlementDenial() {
        Assert.False(IsEntitlementDenial(Denied(("Membership", "RequesterEligibility"))))
    }

    @Fact
    func NoReasons_IsNotEntitlementDenial() {
        Assert.False(IsEntitlementDenial(ContentLicense{StatusCode: "Denied"}))
    }

    shared {
        private func IsEntitlementDenial(license ContentLicense) bool {
            let type = typeof(ContentLicense).Assembly.GetType("Oahu.Core.AudibleApi", throwOnError: true)!!
            let method = type.GetMethod("IsEntitlementDenial", BindingFlags.NonPublic | BindingFlags.Static)!!
            return bool(method.Invoke(nil, []object{license})!!)
        }

        private func Denied(
            reasons ...(ValidationType string, RejectionReason string)
        ) ContentLicense -> ContentLicense{
            StatusCode: "Denied",
            LicenseDenialReasons: reasons.Select(
                (r(ValidationType string, RejectionReason string)) -> LicenseDenialReason{
                    ValidationType: r.ValidationType,
                    RejectionReason: r.RejectionReason,
                    Message: "test"
                }
            )
                .ToArray()
        }
    }
}
