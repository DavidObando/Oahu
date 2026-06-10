// Sanity tests for ExpStubDoctorService + Doctor reuse of C# types.

package Oahu.Cli.Tests.Experiment.Doctor

import Xunit
import System
import System.Threading
import Oahu.Cli.App.Doctor
import Oahu.Cli.App.Experiment.Doctor

type ExpStubDoctorServiceTests class {
    @Fact
    func Run_Returns_One_Check() {
        var svc = ExpStubDoctorService()
        var report = svc.RunAsync(DoctorOptions(), CancellationToken.None).Result
        Assert.Equal[int32](1, report.Checks.Count)
    }

    @Fact
    func Run_Reports_Ok_Check() {
        var svc = ExpStubDoctorService()
        var report = svc.RunAsync(DoctorOptions(), CancellationToken.None).Result
        Assert.Equal[DoctorSeverity](DoctorSeverity.Ok, report.Checks[0].Severity)
    }

    @Fact
    func Run_HasErrors_False() {
        var svc = ExpStubDoctorService()
        var report = svc.RunAsync(DoctorOptions(), CancellationToken.None).Result
        Assert.False(report.HasErrors)
    }

    @Fact
    func Run_HasWarnings_False() {
        var svc = ExpStubDoctorService()
        var report = svc.RunAsync(DoctorOptions(), CancellationToken.None).Result
        Assert.False(report.HasWarnings)
    }

    @Fact
    func Implements_Interface() {
        var svc = ExpStubDoctorService()
        Assert.IsAssignableFrom[IExpDoctorService](svc)
    }
}
