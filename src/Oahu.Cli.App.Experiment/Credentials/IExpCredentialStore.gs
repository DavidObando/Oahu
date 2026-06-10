package Oahu.Cli.App.Experiment.Credentials

import System.Collections.Generic
import System.Threading
import System.Threading.Tasks

type IExpCredentialStore interface {
    func Provider() string
    func GetAsync(account string, ct CancellationToken) Task[string]
    func SetAsync(account string, secret string, ct CancellationToken) Task
    func DeleteAsync(account string, ct CancellationToken) Task[bool]
    func ListAccountsAsync(ct CancellationToken) Task[IReadOnlyList[string]]
}

