package Oahu.Decrypt.Mpeg4.Boxes.AC4SpecificBox

import System
import System.Collections.Generic
import System.Text
import System.Threading.Tasks

/// ETSI TS 103 190-2 E.10.14 presentation_channel_mask_v1
/// Values from A.3 Table A.27: Speaker layouts and speaker indices, column 12 (speaker group indices)
@Flags
enum ChannelGroups {
    Left_Right = 1,
    Center,
    LeftSurround_RightSurround = 4,
    LeftBack_RightBack = 8,
    TopFrontLeft_TopFrontRight = 16,
    TopBackLeft_TopBackRight = 32,
    LFE = 64,
    TopLeft_TopRight = 128,
    TopSideLeft_TopSideRight = 256,
    TopFrontCentre = 512,
    Tfc = 1024,
    TopCenter = 2048,
    LFE2 = 4096,
    BottomFrontLeft_BottomFrontRight = 8192,
    BottomFrontCentre = 16384,
    BackCenter = 32768,
    LeftScreen_RightScreen = 65536,
    LeftWide_RightWide = 131072,
    VerticalHeightLeft_VerticalHeightRight = 262144,
    NOT_CHANNEL_CODED = 8388608
}
