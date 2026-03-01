using System;
using System.Globalization;
using System.Linq;
using System.Text;

namespace Oahu.Aux
{
  public class ArgParser
  {
    readonly string[] args;
    readonly bool ignoreCase;

    public ArgParser(string[] args)
    {
      this.args = args;
    }

    public ArgParser(string[] args, bool ignoreCase)
    {
      this.args = args;
      this.ignoreCase = ignoreCase;
    }

    public void Log()
    {
      foreach (string arg in args)
      {
        Logging.Log(1, arg);
      }
    }

    public virtual bool Exists(string tag)
    {
      if (args == null)
      {
        return false;
      }

      string key = "-" + tag;
      foreach (string arg in args)
      {
        if (arg.StartsWith(key, ignoreCase, CultureInfo.InvariantCulture))
        {
          return true;
        }
      }

      return false;
    }

    public virtual string FindArg(string tag)
    {
      string erg = null;
      if (args == null)
      {
        return erg;
      }

      string key = "-" + tag + "=";
      foreach (string arg in args)
      {
        if (arg.StartsWith(key, ignoreCase, CultureInfo.InvariantCulture))
        {
          if (arg.Length > key.Length)
          {
            erg = arg.Substring(key.Length, arg.Length - key.Length);
            break;
          }
        }
      }

      return erg;
    }

    public virtual bool HasArg(string tag)
    {
      if (args == null)
      {
        return false;
      }

      string key = "-" + tag;
      return args.Where(x => x.StartsWith(key, StringComparison.InvariantCultureIgnoreCase)).Any();
    }

    public string FindArg(string tag, string defaultArgVal)
    {
      string arg = FindArg(tag);
      if (arg == null || arg.Length == 0)
      {
        return defaultArgVal;
      }
      else
      {
        return arg;
      }
    }

    public bool? FindBooleanArg(string tag)
    {
      string arg = FindArg(tag);
      if (arg == null || arg.Length == 0)
      {
        return null;
      }

      bool value = string.Equals(arg, "true", StringComparison.InvariantCultureIgnoreCase) || arg == "1";
      return value;
    }

    public bool FindBooleanArg(string tag, bool defaultArgVal)
    {
      bool? arg = FindBooleanArg(tag);
      if (arg == null)
      {
        return defaultArgVal;
      }
      else
      {
        return arg.Value;
      }
    }

    public int? FindIntArg(string tag)
    {
      string arg = FindArg(tag);
      if (arg == null || arg.Length == 0)
      {
        return null;
      }

      if (!int.TryParse(arg, out int result))
      {
        return null;
      }

      return result;
    }

    public int FindIntArg(string tag, int defaultArgVal)
    {
      int? arg = FindIntArg(tag);
      if (arg == null)
      {
        return defaultArgVal;
      }
      else
      {
        return arg.Value;
      }
    }

    public uint? FindUIntArg(string tag)
    {
      string arg = FindArg(tag);
      if (arg == null || arg.Length == 0)
      {
        return null;
      }

      if (!uint.TryParse(arg, out uint result))
      {
        return null;
      }

      return result;
    }

    public uint FindUIntArg(string tag, uint defaultArgVal)
    {
      uint? arg = FindUIntArg(tag);
      if (arg == null)
      {
        return defaultArgVal;
      }
      else
      {
        return arg.Value;
      }
    }

    public double? FindFloatArg(string tag)
    {
      string arg = FindArg(tag);
      if (arg == null || arg.Length == 0)
      {
        return null;
      }

      if (!double.TryParse(arg, out double result))
      {
        return null;
      }

      return result;
    }

    public double FindFloatArg(string tag, double defaultArgVal)
    {
      double? arg = FindFloatArg(tag);
      if (arg == null)
      {
        return defaultArgVal;
      }
      else
      {
        return arg.Value;
      }
    }

    public TEnum? FindEnumArg<TEnum>(string tag) where TEnum : struct, Enum
    {
      string arg = FindArg(tag);
      if (arg == null || arg.Length == 0)
      {
        return null;
      }

      if (!Enum.TryParse<TEnum>(arg, out TEnum result))
      {
        return null;
      }

      return result;
    }

    public TEnum FindEnumArg<TEnum>(string tag, TEnum defaultArgVal) where TEnum : struct, Enum
    {
      TEnum? arg = FindEnumArg<TEnum>(tag);
      if (arg == null)
      {
        return defaultArgVal;
      }
      else
      {
        return arg.Value;
      }
    }
  }
}
