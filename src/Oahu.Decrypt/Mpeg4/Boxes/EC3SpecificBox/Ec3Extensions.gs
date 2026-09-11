package Oahu.Decrypt.Mpeg4.Boxes.EC3SpecificBox

import System.IO

class Ec3Extensions {
    shared {
        /// ETSI TS 102 366 4.4.2.3 Table 4.3: Audio coding mode column 4 (Nfchans)
        let FfAc3ChannelsTab[]uint8 = []uint8{
            uint8(2),
            uint8(1),
            uint8(2),
            uint8(3),
            uint8(3),
            uint8(4),
            uint8(4),
            uint8(5)
        }
    }
}
