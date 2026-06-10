// G# port of src/Oahu.Cli.App/Queue/IQueueService.cs.

package Oahu.Cli.App.Experiment.Queue

import System.Collections.Generic
import System.Threading
import System.Threading.Tasks
import Oahu.Cli.App.Models

type IExpQueueService interface {
    func ListAsync(ct CancellationToken) Task[IReadOnlyList[QueueEntry]]
    func AddAsync(entry QueueEntry, ct CancellationToken) Task[bool]
    func RemoveAsync(asin string, ct CancellationToken) Task[bool]
    func MoveAsync(asin string, delta int32, ct CancellationToken) Task[bool]
    func ClearAsync(ct CancellationToken) Task
}
