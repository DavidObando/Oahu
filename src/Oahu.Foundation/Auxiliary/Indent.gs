package Oahu.Aux

import System.IO

/// Automatic indentation, managed as a resource
class Indent : IResource {
    private var inc uint32 = uint32(2)
    private var offset uint32 = uint32(0)
    private var indent int32
    private var output string = string.Empty

    init() { }

    init(inc uint32) {
        this.inc = inc
    }

    init(inc uint32?, offset uint32) {
        this.inc = inc ?? this.inc
        this.offset = offset
        BuildString()
    }

    prop Level int32 {
        get;
        private set;
    }

    func Acquire() {
        Level++
        indent += int32(inc)
        BuildString()
    }

    func Release() {
        Level--
        indent -= int32(inc)
        BuildString()
    }

    func InRange(level int32) bool {
        if level < 0 {
            return true
        } else {
            return Level <= level
        }
    }

    override func ToString() string -> output

    func Write(osm TextWriter) -> osm.Write(this)

    private func BuildString() -> output = String(' ', int32(offset) + indent)
}
