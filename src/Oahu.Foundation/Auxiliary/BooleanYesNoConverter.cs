using System;
using System.Collections.Generic;
using System.ComponentModel;
using System.Globalization;
using System.Resources;
using Oahu.Aux.Extensions;

namespace Oahu.Aux
{
  public class BooleanYesNoConverter : BooleanConverter
  {
    const string TRUE = "Yes";
    const string FALSE = "No";

    private ResourceManager resourceManager;
    Dictionary<string, bool> reverseLookup;

    protected ResourceManager ResourceManager
    {
      get => resourceManager;
      set
      {
        resourceManager = value;
        InitReverseLookup();
      }
    }

    public override bool CanConvertTo(ITypeDescriptorContext context, Type destinationType)
    {
      if (destinationType != typeof(string))
      {
        return base.CanConvertTo(context, destinationType);
      }
      else
      {
        return true;
      }
    }

    public override object ConvertTo(ITypeDescriptorContext context, CultureInfo culture, object value, Type destinationType)
    {
#if TRACE && EXTRA
      Log.WriteLine ($"{nameof (ConvertTo)}: \"{value}\", from: {value.GetType ().Name}, to: {destinationType.Name}");
#endif
      switch (value)
      {
        default:
          return base.ConvertTo(context, culture, value, destinationType);
        case bool val:
          return ToDisplayString(val);
      }
    }

    public override object ConvertFrom(ITypeDescriptorContext context, CultureInfo culture, object value)
    {
#if TRACE && EXTRA
      Log.WriteLine ($"{nameof (ConvertFrom)}: \"{value}\", from: {value.GetType ().Name}");
#endif
      if (!(reverseLookup is null))
      {
        if (value is string s)
        {
          bool succ = reverseLookup.TryGetValue(s, out bool b);
          if (succ)
          {
            return b;
          }
        }
      }

      return base.ConvertFrom(context, culture, value);
    }

    private string ToDisplayString(bool value)
    {
      string s = value ? TRUE : FALSE;
      return ResourceManager.GetStringEx(s);
    }

    private void InitReverseLookup()
    {
      reverseLookup = new Dictionary<string, bool>();
      InitReverseLookup(false);
      InitReverseLookup(true);
    }

    private void InitReverseLookup(bool value) => reverseLookup.Add(ToDisplayString(value), value);
  }
}
