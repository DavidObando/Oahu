package Oahu.Decrypt.Mpeg4.Descriptors

import System.IO

class DescriptorFactory {
    shared {
        func CreateDescriptor(file Stream) BaseDescriptor {
            let header = DescriptorHeader(file)
            return switch header.TagID {
                case 3: cast[BaseDescriptor](ES_Descriptor(file, header))
                case 4: cast[BaseDescriptor](DecoderConfigDescriptor(file, header))
                case 5: cast[BaseDescriptor](AudioSpecificConfig(file, header))
                case 6: cast[BaseDescriptor](SLConfigDescriptor(file, header))
                default: cast[BaseDescriptor](UnknownDescriptor(file, header))
            }
        }
    }
}
