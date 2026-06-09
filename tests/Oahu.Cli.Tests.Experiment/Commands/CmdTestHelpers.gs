package Oahu.Cli.Tests.Experiment.Commands

type E2ECmdResult class {
    prop Exit int32 { get; set; }
    prop Stdout string { get; set; }
    prop Stderr string { get; set; }

    init(exit int32, stdout string, stderr string) {
        Exit = exit
        Stdout = stdout
        Stderr = stderr
    }
}
