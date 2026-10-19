package Oahu.Foundation.Tests

import Oahu.Aux
import System
import System.Text
import Xunit

class Crc32Tests {
    @Theory
    @InlineData("", 0u)
    @InlineData("123456789", 0xcbf43926u)
    func Standard_Vectors_Match_Static_And_HashAlgorithm_Results(text string, expected uint32) {
        let bytes = Encoding.ASCII.GetBytes(text)
        Assert.Equal(expected, Crc32.Compute(bytes))
        using let algorithm = Crc32()
        Assert.Equal(expected.ToString("X8"), Convert.ToHexString(algorithm.ComputeHash(bytes)))
    }

    @Fact
    func Complemented_Result_Can_Seed_The_Next_Block() {
        let first = Crc32.Compute(Encoding.ASCII.GetBytes("1234"))
        let combined = Crc32.Compute(~first, Encoding.ASCII.GetBytes("56789"))
        Assert.Equal(Crc32.Compute(Encoding.ASCII.GetBytes("123456789")), combined)
    }
}
