package Oahu.Aux

import System
import System.Diagnostics
import System.IO
import System.Text

open class ProcessHost {
    protected prop Process Process? {
        get;
        private set;
    }

    /// Executes a process and passes its command-line output back after the process has exited
    protected func RunProcess(
        exePath string,
        parameters string,
        getStdErrorNotOutput bool = false,
        eventHandler DataReceivedEventHandler? = nil
    ) string? {
        if !File.Exists(exePath) {
            return nil
        }
        var result = string.Empty
        let async_ = eventHandler != nil
        {
            using let p = Process()
            p.StartInfo.UseShellExecute = false
            p.StartInfo.CreateNoWindow = true
            p.StartInfo.FileName = exePath
            p.StartInfo.Arguments = parameters
            if getStdErrorNotOutput {
                p.StartInfo.RedirectStandardError = true
            } else {
                p.StartInfo.RedirectStandardOutput = true
            }
            p.StartInfo.RedirectStandardInput = true
            if async_ {
                if getStdErrorNotOutput {
                    p.ErrorDataReceived += eventHandler
                } else {
                    p.OutputDataReceived += eventHandler
                }
            }
            let processOutputStringBuilder = StringBuilder()
            p.Start()
            try {
                p.PriorityClass = ProcessPriorityClass.BelowNormal
            } catch (Exception) { }
            Singleton[ProcessList].Instance!!.Add(p)
            Process = p
            if async_ {
                if getStdErrorNotOutput {
                    p.BeginErrorReadLine()
                } else {
                    p.BeginOutputReadLine()
                }
            }
            p.WaitForExit()
            Singleton[ProcessList].Instance!!.Remove(p)
            Process = nil
            if !async_ {
                if getStdErrorNotOutput {
                    result = p.StandardError.ReadToEnd()
                } else {
                    result = p.StandardOutput.ReadToEnd()
                }
            } else {
                if processOutputStringBuilder.Length > 0 {
                    result = processOutputStringBuilder.ToString()
                }
            }
        }
        return result
    }
}
