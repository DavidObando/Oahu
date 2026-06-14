package Oahu.Cli.Tests.Commands

class E2ECmdResult {
    prop Exit int32 { get; set; }
    prop Stdout string { get; set; }
    prop Stderr string { get; set; }

    init(exit int32, stdout string, stderr string) {
        Exit = exit
        Stdout = stdout
        Stderr = stderr
    }
}
