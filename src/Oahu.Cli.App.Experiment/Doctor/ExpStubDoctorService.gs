// A minimal in-G# DoctorService that always reports a single Ok check.
// Provides a sanity-testable IExpDoctorService implementation without re-implementing
// the heavy probe stack from C# DoctorService (~340L) or FileDiagnosticService (~506L).

package Oahu.Cli.App.Experiment.Doctor

import System
import System.Collections.Generic
import System.Threading
import System.Threading.Tasks
import Oahu.Cli.App.Doctor

type ExpStubDoctorService class : IExpDoctorService {
    func RunAsync(options DoctorOptions, ct CancellationToken) Task[DoctorReport] {
        ct.ThrowIfCancellationRequested()
        var list = List[DoctorCheck]()
        list.Add(DoctorCheck("stub", "Experimental stub", DoctorSeverity.Ok, "ok", nil))
        return Task.FromResult(DoctorReport(list))
    }
}
