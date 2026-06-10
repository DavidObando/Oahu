// G# port of src/Oahu.Cli.App/Config/IConfigService.cs.

package Oahu.Cli.App.Experiment.Config

import System.Threading
import System.Threading.Tasks
import Oahu.Cli.App.Models

type IExpConfigService interface {
    func Path() string
    func LoadAsync(cancellationToken CancellationToken) Task[OahuConfig]
    func SaveAsync(config OahuConfig, cancellationToken CancellationToken) Task
}
