using System.IO;

namespace Oahu.Aux
{
  /// <summary>
  /// Automatic indentation, managed as a resource
  /// </summary>
  public class Indent : IResource
  {
    uint inc = 2;
    uint offset = 0;
    int indent;
    string output = string.Empty;

    public Indent()
    {
    }

    public Indent(uint inc) => this.inc = inc;

    public Indent(uint? inc, uint offset)
    {
      this.inc = inc ?? this.inc;
      this.offset = offset;
      BuildString();
    }

    public int Level { get; private set; }

    public void Acquire()
    {
      Level++;
      indent += (int)inc;
      BuildString();
    }

    public void Release()
    {
      Level--;
      indent -= (int)inc;
      BuildString();
    }

    public bool InRange(int level)
    {
      if (level < 0)
      {
        return true;
      }
      else
      {
        return Level <= level;
      }
    }

    public override string ToString() => output;

    public void Write(TextWriter osm) => osm.Write(this);

    private void BuildString() => output = new string(' ', (int)offset + indent);
  }
}
