package Oahu.Common.Util

interface IUpdateSettings {
    prop OnlineUpdate EOnlineUpdate {
        get;
    }
}

class UpdateSettings : IUpdateSettings {
    private var _onlineUpdate EOnlineUpdate = EOnlineUpdate.PromptForDownload

    prop OnlineUpdate EOnlineUpdate {
        get {
            return _onlineUpdate
        }
        set {
            _onlineUpdate = value
        }
    }
}
