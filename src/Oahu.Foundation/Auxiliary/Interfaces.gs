package Oahu.Aux

import System.Diagnostics

interface IProcessList {
    func Add(process Process) bool;

    func Remove(process Process) bool;
}

interface IUserSettings { }

interface IInitSettings {
    func Init();
}
