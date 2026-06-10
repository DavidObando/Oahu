// G# port of src/Oahu.Cli.App/Doctor/IDoctorService.cs.
// Reuses the C# Oahu.Cli.App.Doctor.{DoctorReport, DoctorCheck, DoctorSeverity, DoctorOptions}
// public surface from the referenced assembly so we don't have to redeclare those record
// types in G# (gsharp#671 currently blocks `List[ExpDoctorEntry]` field declarations).
// Skipped: DoctorService.cs (~340L) and FileDiagnosticService.cs (~506L) — HttpClient
// probes, ILogger DI, Audible API reachability checks — exceed the 0.1.516 interop surface.

package Oahu.Cli.App.Experiment.Doctor

import System
import System.Threading
import System.Threading.Tasks
import Oahu.Cli.App.Doctor

type IExpDoctorService interface {
    func RunAsync(options DoctorOptions, ct CancellationToken) Task[DoctorReport]
}
