package Oahu.Decrypt.Mpeg4.Boxes.EC3SpecificBox

/// ETSI TS 102 366 Table F.6.1: chan_loc field bit assignments
enum ChannelLocation {
    Lc_Rc_Pair,
    Lrs_Rrs_Pair,
    Cs,
    Ts,
    Lsd_Rsd_Pair,
    Lw_Rw_Pair,
    Lvh_Rvh_Pair,
    Cvh,
    LFE2
}
