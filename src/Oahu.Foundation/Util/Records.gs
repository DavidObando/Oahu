package Oahu.Common.Util

import System

interface IPackageInfo {
    prop AppName string {
        get;
    }

    prop Version Version? {
        get;
    }

    prop Preview bool {
        get;
    }

    prop DefaultApp bool {
        get;
    }

    prop Desc string {
        get;
    }
}

open data class ProgressMessage(
    ItemCount int32?,
    IncItem int32?,
    IncStepsPerCent int32?,
    IncStepsPerMille int32?,
    Asin string? = nil
) { }

open data class UpdateInteractionMessage(Kind EUpdateInteract, PckInfo IPackageInfo) { }

open data class PackageInfo {
    prop Url string {
        get;
        init;
    }

    prop AppName string {
        get;
        init;
    }

    prop Version string {
        get;
        init;
    }

    prop Preview bool {
        get;
        init;
    }

    prop Desc string {
        get;
        init;
    }

    prop Md5 string {
        get;
        init;
    }
}

open data class PackageInfoLocal : PackageInfo, IPackageInfo {
    init() { }

    init(pi PackageInfo) {
        let TryParse = func (s string) Version? {
            let succ = Version.TryParse(s, out var version)
            return if succ {
                version
            } else {
                default(Version?)
            }
        }
        Url = pi.Url
        AppName = pi.AppName
        Version = TryParse(pi.Version)
        Preview = pi.Preview
        Desc = pi.Desc
        Md5 = pi.Md5
    }

    prop Version Version? {
        get;
        init;
    }

    prop SetupFile string {
        get;
        init;
    }

    prop DefaultApp bool {
        get;
        init;
    }
}
