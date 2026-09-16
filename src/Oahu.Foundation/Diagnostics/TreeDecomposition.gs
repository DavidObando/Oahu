package Oahu.Aux.Diagnostics

import Oahu.Aux
import Oahu.Aux.Extensions
import System
import System.Collections
import System.Collections.Generic
import System.ComponentModel
import System.Diagnostics.CodeAnalysis
import System.IO
import System.Linq
import System.Reflection

class TreeDecomposition {
    shared {
        /// Custom marker/separator for description text. Will use default if `null`.
        prop DescriptionMarker string
    }
}

func (enumerable IEnumerable[object]?) FirstOfType[T class]() T? {
    return enumerable.OfType[T]().FirstOrDefault()
}

@UnconditionalSuppressMessage(
    "Trimming",
    "IL2075",
    Justification: "DeclaringType is expected to preserve interface metadata at runtime."
)
@UnconditionalSuppressMessage(
    "Trimming",
    "IL2070",
    Justification: "Interface types preserve property metadata at runtime."
)
func (pi PropertyInfo) GetCustomAttributesIncludingBaseInterfaces() IEnumerable[object] {
    return pi
        .GetCustomAttributes(true)
        .Union(
        pi.DeclaringType!!
            .GetInterfaces()
            .Select((it Type) -> it.GetProperty(pi.Name, pi.PropertyType)!!)
            .Where((p PropertyInfo) -> !p.IsNull())
            .SelectMany(
            func (p PropertyInfo) IEnumerable[object] {
                return p.GetCustomAttributes(true)
            }
        )
    )
        .Distinct()
        .ToList()
}

/// <summary>
/// <para>Decomposition of specified object into a text tree.</para>
/// <para>Iterates public properties in specified object.
/// One property name/value pair per text line.
/// Hierarchy levels are determined by property type.
/// Primitive types are written to the same hierarchy level.
/// Non-primitive types are written to the next lower hierarchy level, working recursively.
/// As an option, properties can additionally be grouped by implemented interfaces and their hierarchy.
/// Hierarchy levels are indicated through indentation.
/// Collections are decomposed by item, iterating <see cref="IEnumerable"/>.
/// Custom primitive types can be set by providing a generic argument, implementing <see cref="IPrimitiveTypes"/>.</para>
/// <para>Built-in primitive types as per definition here are not only the scalar types (int, double etc)
/// but also string, enum, and - important - all other .Net framework types in the System namespaces.
/// (The purpose of this facility is to decompose user types, not system types.)
/// Built-in primitive type handling can be overridden
/// by custom primimitive types.</para>
/// <para>Note: <see cref="AbstractPrimitiveTypes"/> can be used as a base class to implement <see cref="IPrimitiveTypes"/>.</para>
/// <para>Properties can be annotated with attributes. Recognized attributes are:</para>
/// <list type="bullet">
/// <item><see cref="DescriptionAttribute"/>to describe a property, must be activated with <see cref="EDumpFlags.InclDesc"/></item>
/// <item><see cref="BrowsableAttribute"/>to hide a property, if set to <c>false</c>.</item>
/// <item><see cref="DisplayNameAttribute"/>to override the property name.</item>
/// <item><see cref="DisplayItemNameAttribute"/>to override the item name in a collection.</item>
/// <item><see cref="TextFormatAttribute"/>to specify a format string.</item></list>
/// <item><see cref="ToStringAttribute"/>to specify a custom ToString() method with a type converter derived from <see cref="ToStringConverter"/>.</item></list>
/// <para>To be used as a singleton from extension methods, see <see cref="TreeDecompositionExtension"/> for details.</para>
/// </summary>
/// <typeparam name="T">Additional primitive types, implementing <see cref="IPrimitiveTypes"/></typeparam>
internal class TreeDecomposition[T IPrimitiveTypes init()] {
    private init() { }

    /// Dumps the specified object as a text tree. Will be used recursively.
    /// @param o The object to dump.
    /// @param tw The TextWriter output.
    /// @param ind The indentation.
    /// @param flags The output modifier flags.
    /// @param caption The optional caption for this indentation level.
    func Dump(
        o object,
        tw TextWriter,
        ind Indent,
        flags EDumpFlags = EDumpFlags.None,
        caption string? = nil
    ) -> DumpInternal(o, Stack[Type](), tw, ind, flags, caption, nil, nil, nil, false)

    @UnconditionalSuppressMessage(
        "Trimming",
        "IL2075",
        Justification: "Type metadata is preserved via TrimMode=partial."
    )
    @UnconditionalSuppressMessage(
        "Trimming",
        "IL2070",
        Justification: "Type metadata is preserved via TrimMode=partial."
    )
    @UnconditionalSuppressMessage(
        "Trimming",
        "IL2072",
        Justification: "Type metadata is preserved via TrimMode=partial."
    )
    private func DumpInternal(
        o object?,
        stack Stack[Type],
        tw TextWriter,
        ind Indent,
        flags EDumpFlags,
        caption string?,
        itemCaption string?,
        itemFormat CustomFormat?,
        oDesc string?,
        inEnum bool
    ) {
        var caption = caption
        if o == nil {
            return
        }
        // via reflection
        let objectType = o.GetType()
        stack.Push(objectType)
        if caption == nil && ind.Level == 0 {
            caption = objectType.Name
        }
        // caption
        Write(tw, ind, caption, flags, oDesc)
        // next level
        {
            using let _ = ResourceGuard(ind)
            // is it a collection?
            let isEnumerable = typeof(IEnumerable).IsAssignableFrom(objectType)
            if isEnumerable {
                DumpCollection(o, stack, objectType, tw, ind, flags, itemCaption, itemFormat)
            } else {
                // all public properties, including inherited ones
                var propInfos IEnumerable[PropertyInfo] = objectType.GetProperties(
                    BindingFlags.Public | BindingFlags.Instance
                )
                if flags.HasFlag(EDumpFlags.ByInterface) &&
                    (stack.Count < 2 || flags.HasFlag(EDumpFlags.ByInterfaceNestedTypes)) {
                    let interfaceHierarchy = objectType.GetInterfaceHierarchy()
                    if interfaceHierarchy.Count() > 0 {
                        for path in interfaceHierarchy {
                            DumpByPath(&propInfos, o, path, stack, tw, ind, flags, inEnum)
                        }
                        DumpProperties(o, propInfos, stack, tw, ind, flags, inEnum)
                    } else {
                        DumpProperties(o, propInfos, stack, tw, ind, flags, inEnum)
                    }
                } else {
                    DumpProperties(o, propInfos, stack, tw, ind, flags, inEnum)
                }
            }
        }
        stack.Pop()
    }

    @UnconditionalSuppressMessage(
        "Trimming",
        "IL2075",
        Justification: "Interface types are preserved via TrimMode=partial."
    )
    private func DumpByPath(
        ref propInfos IEnumerable[PropertyInfo],
        o object?,
        path IEnumerable[Type],
        stack Stack[Type],
        tw TextWriter,
        ind Indent,
        flags EDumpFlags,
        inEnum bool
    ) {
        let ifcType = path.Last()
        if !ifcType.IsInterface {
            return
        }
        let ifcPropInfos IEnumerable[PropertyInfo] = ifcType.GetProperties()
        if ifcPropInfos.Count() == 0 {
            return
        }
        let propNames = ifcPropInfos.Select((pi PropertyInfo) -> pi.Name)
        let filteredPropInfos = propInfos.Where((pi PropertyInfo) -> propNames.Contains(pi.Name))
        if filteredPropInfos.Count() == 0 {
            return
        }
        propInfos = propInfos.Except(filteredPropInfos)
        let sPath = path.ToHierarchyString()
        tw.WriteLine("$ind:$sPath")
        {
            using let _ = ResourceGuard(ind)
            DumpProperties(o, filteredPropInfos, stack, tw, ind, flags, inEnum)
        }
    }

    private func DumpProperties(
        o object?,
        propInfos IEnumerable[PropertyInfo],
        stack Stack[Type],
        tw TextWriter,
        ind Indent,
        flags EDumpFlags,
        inEnum bool
    ) {
        for propInfo in propInfos {
            // skip indexed
            let isIndexed = propInfo.GetIndexParameters().Length > 0
            if isIndexed {
                continue
            }
            // value
            let propValue object? = propInfo.GetValue(o)
            // skip null
            if !flags.HasFlag(EDumpFlags.InclNullVals) {
                if propValue == nil {
                    continue
                } else if propValue is string sPropValue {
                    if sPropValue.IsNullOrWhiteSpace() {
                        continue
                    }
                }
            }
            // recursive types only allowed to maximum depth, exceeding instance will be handled as primitive type
            let isRecursive = stack.Where((t Type) -> t == propInfo.PropertyType).Count() > 20
            // check for modification attributes
            var attrs IEnumerable[object]? = nil
            if flags.HasFlag(EDumpFlags.InherInterfaceAttribs) {
                attrs = propInfo.GetCustomAttributesIncludingBaseInterfaces()
            } else {
                attrs = propInfo.GetCustomAttributes(true)
            }
            // shall be ignored?
            let browsable BrowsableAttribute? = attrs.FirstOfType[BrowsableAttribute]()
            if !(browsable?.Browsable ?? true) {
                continue
            }
            // name
            var propName = propInfo.Name
            // alternative name
            let displName DisplayNameAttribute? = attrs.FirstOfType[DisplayNameAttribute]()
            if displName != nil {
                propName = displName.DisplayName
            }
            // alternative item name for collection
            let itemName string? = attrs.FirstOfType[DisplayItemNameAttribute]()?.Name
            // optional custom formats
            let customFormat CustomFormat? = GetCustomFormat(attrs)
            // optional description
            let desc string? = GetDesc(propInfo, attrs, flags, inEnum)
            // actual type
            let propType Type? = propValue?.GetType()
            // how to dump
            if IsPrimitiveType(propType) || isRecursive {
                // this level, as primitive
                Write(tw, ind, propName, propValue, customFormat, desc, flags.HasFlag(EDumpFlags.DescOnTop))
            } else {
                // deeper level, recursive call
                DumpInternal(propValue, stack, tw, ind, flags, propName, itemName, customFormat, desc, inEnum)
            }
        }
    }

    private func GetDesc(propInfo PropertyInfo, attrs IEnumerable[object]?, flags EDumpFlags, inEnum bool) string? {
        if !flags.HasFlag(EDumpFlags.InclDesc) || (inEnum && !flags.HasFlag(EDumpFlags.InclDescInEnum)) {
            return nil
        }
        var desc string? = attrs.FirstOfType[DescriptionAttribute]()?.Description
        if desc.IsNull() {
            desc = GetTypeDesc(propInfo.PropertyType, flags, inEnum)
        }
        return desc
    }

    private func GetTypeDesc(type Type, flags EDumpFlags, inEnum bool) string? {
        if !flags.HasFlag(EDumpFlags.InclDesc) || !flags.HasFlag(EDumpFlags.InclTypeDesc) ||
            (inEnum && !flags.HasFlag(EDumpFlags.InclDescInEnum)) {
            return nil
        }
        let attrs = type.GetCustomAttributes(true)
        return attrs.FirstOfType[DescriptionAttribute]()?.Description
    }

    private func DumpCollection(
        o object?,
        stack Stack[Type],
        @DynamicallyAccessedMembers(DynamicallyAccessedMemberTypes.Interfaces) objectType Type,
        tw TextWriter,
        ind Indent,
        flags EDumpFlags,
        itemCaption string?,
        itemFormat CustomFormat?
    ) {
        var itemCaption = itemCaption
        // item type
        let itemType = objectType
            .GetInterfaces()
            .Where((t Type) -> t.IsGenericType && t.GetGenericTypeDefinition().Equals(typeof(IEnumerable[_])))
            .Select((t Type) -> t.GetGenericArguments()[0])
            .FirstOrDefault() ??
            typeof(object)
        let desc string? = GetTypeDesc(itemType, flags, true)
        // if (!desc.IsNull())
        //  ; // for debug
        let isPrimitive = IsPrimitiveType(itemType)
        if flags.HasFlag(EDumpFlags.WithItmCnt) {
            if itemCaption.IsNullOrWhiteSpace() {
                if isPrimitive {
                    itemCaption = "#"
                } else {
                    itemCaption = itemType.Name + " "
                }
            } else {
                itemCaption += " "
            }
        } else if itemCaption.IsNullOrWhiteSpace() && !isPrimitive {
            itemCaption = itemType.Name
        }
        var i = 0
        // hard cast
        for item in cast[IEnumerable](o) {
            i++
            var caption string?
            if flags.HasFlag(EDumpFlags.WithItmCnt) {
                caption = "$itemCaption$i"
            } else {
                caption = itemCaption
            }
            if isPrimitive {
                // this level, as primitive
                Write(tw, ind, caption, item, itemFormat, desc, flags.HasFlag(EDumpFlags.DescOnTop))
            } else {
                // deeper level, recursive call
                DumpInternal(item, stack, tw, ind, flags, caption, itemCaption, itemFormat, desc, true)
            }
        }
    }

    private open class CustomFormat { }

    private open class CustomFormatString : CustomFormat {
        let Format string?

        init(format string?) {
            Format = format
        }
    }

    private class CustomToString : CustomFormatString {
        let Converter ToStringConverter?

        init(converter ToStringConverter?, format string?) : base(format) {
            Converter = converter
        }
    }

    shared {
        private var primitveTypes IPrimitiveTypes = T()
        private var $default TreeDecomposition[T]?

        prop Default TreeDecomposition[T]? {
            get {
                if $default == nil {
                    $default = TreeDecomposition[T]()
                }
                return $default!!
            }
        }

        private func GetCustomFormat(attrs IEnumerable[object]?) CustomFormat? {
            var customFormat CustomFormat? = nil
            let toStringAttr ToStringAttribute? = attrs.FirstOfType[ToStringAttribute]()
            if toStringAttr.IsNull() {
                let format string? = attrs.FirstOfType[TextFormatAttribute]()?.Format
                if !format.IsNull() {
                    customFormat = CustomFormatString(format)
                }
            } else if !toStringAttr!!.Converter.IsNull() {
                customFormat = CustomToString(toStringAttr!!.Converter, toStringAttr!!.Format)
            }
            return customFormat
        }

        private func IsPrimitiveType(type Type?) bool {
            // determine what defines a primitive type
            if type == nil {
                return true
            }
            // simple cases
            let isBuiltInPrimitive = type.IsPrimitive ||
                type == typeof(decimal) ||
                type == typeof(string) ||
                type.IsEnum
            // "catch all"
            var isSystemType = type.Namespace!!.StartsWith("System")
            // but not if it is enumerable
            let isEnumerableSystemType = typeof(IEnumerable).IsAssignableFrom(type)
            if isEnumerableSystemType {
                isSystemType = false
            }
            // type.IsPrimitive ||
            // type == typeof (decimal) ||
            // type == typeof (string) ||
            // type == typeof (DateTime) ||
            // type == typeof (DateTimeOffset) ||
            // type == typeof (TimeSpan);
            // ||  Nullable.GetUnderlyingType (type) != null;
            let isAddedPrimitive = primitveTypes.IsPrimitiveType(type)
            let isPrimitive = isBuiltInPrimitive || isSystemType || isAddedPrimitive
            return isPrimitive
        }

        private func Write(tw TextWriter, ind Indent, value string?, flags EDumpFlags, desc string? = nil) {
            if value.IsNullOrWhiteSpace() {
                return
            }
            let (m1, m2) = Mkr()
            let c = if flags.HasFlag(EDumpFlags.ByInterface) {
                string.Empty
            } else {
                ":"
            }
            if desc.IsNullOrWhiteSpace() {
                tw.WriteLine("$ind$value$c")
            } else if flags.HasFlag(EDumpFlags.DescOnTop) {
                tw.WriteLine()
                tw.WriteLine(ind.ToString() + m1 + desc)
                tw.WriteLine("$ind$value$c")
            } else {
                tw.WriteLine("$ind$value$m2$desc")
            }
        }

        private func Write(
            tw TextWriter,
            ind Indent,
            name string?,
            value object?,
            format CustomFormat?,
            desc string? = nil,
            descOnTop bool = false
        ) {
            let (m1, m2) = Mkr()
            var sValue string?
            if !format.IsNull() {
                try {
                    switch format {
                        case c is CustomToString {
                            sValue = c.Converter!!.ToString(value, c.Format)
                        }
                        case s is CustomFormatString {
                            sValue = string.Format("{0:${s.Format}}", value)
                        }
                        default {
                            sValue = value!!.ToString()
                        }
                    }
                } catch {
                    sValue = value!!.ToString()
                }
            } else {
                sValue = primitveTypes.ToString(value)
                if sValue == nil && value!!.GetType().IsEnum {
                    sValue = primitveTypes.ToString[Enum](value)
                }
                if sValue == nil {
                    sValue = value!!.ToString()
                }
            }
            if name.IsNullOrWhiteSpace() {
                tw.WriteLine(ind.ToString() + sValue)
            } else if desc.IsNullOrWhiteSpace() {
                tw.WriteLine(Snamval(ind, name, sValue))
            } else if descOnTop {
                tw.WriteLine()
                tw.WriteLine(ind.ToString() + m1 + desc)
                tw.WriteLine(Snamval(ind, name, sValue))
            } else {
                tw.WriteLine(Snamval(ind, name, sValue) + m2 + desc)
            }
        }

        private func Mkr()(M1 string, M2 string) {
            let m = TreeDecomposition.DescriptionMarker ?? "!"
            let m1 = m + " "
            let m2 = "  " + m1
            return (m1, m2)
        }

        private func Snamval(ind Indent, name string?, sValue string?) string -> "$ind$name = $sValue"
    }
}
