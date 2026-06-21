package Oahu.Cli.Tests.Commands

class E2ECmdResult {
    prop Exit int32
    prop Stdout string
    prop Stderr string

    init(exit int32, stdout string, stderr string) {
        Exit = exit
        Stdout = stdout
        Stderr = stderr
    }
}
