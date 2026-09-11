package Oahu.Aux.Diagnostics

import System
import System.Collections.Generic
import System.Diagnostics.CodeAnalysis
import System.Linq
import System.Text

internal class TypeExtension {
    shared {
        @UnconditionalSuppressMessage(
            "Trimming",
            "IL2072",
            Justification: "Interface types returned by GetInterfaces preserve their own interface metadata."
        )
        func FindLeaves(
            @DynamicallyAccessedMembers(DynamicallyAccessedMemberTypes.Interfaces) type Type,
            path IList[Type],
            leaves IDictionary[Type, List[Type]]
        ) {
            if type.IsInterface {
                path.Add(type)
                let succ = leaves.TryGetValue(type, out var p)
                if !succ || path.Count > p.Count {
                    leaves[type] = path.ToList()
                }
            }
            let ifcTypes = type.GetInterfaces()
            for ifcType in ifcTypes {
                FindLeaves(ifcType, path.ToList(), leaves)
            }
        }

        func Sort(leavesDict Dictionary[Type, List[Type]]) List[List[Type]] {
            let rawlist = leavesDict
                .Select((kvp KeyValuePair[Type, List[Type]]) -> kvp.Value)
                .OrderBy((k List[Type]) -> k.Count)
                .ToList()
            let list = List[List[Type]]()
            while rawlist.Count() > 0 {
                let path = rawlist.Last()
                rawlist.RemoveAt(rawlist.Count - 1)
                list.Add(path)
                if path.Count < 2 {
                    continue
                }
                let p = path.ToList()
                while p.Count > 1 {
                    p.RemoveAt(p.Count - 1)
                    let deriv = p[p.Count - 1]
                    let dpath List[Type]? = rawlist.Where((k List[Type]) -> k.Last() == deriv).FirstOrDefault()
                    if dpath == nil {
                        break
                    }
                    rawlist.Remove(dpath)
                    list.Add(dpath)
                }
            }
            return list
        }
    }
}

func (root Type) GetInterfaceHierarchy() IEnumerable[IEnumerable[Type]] {
    let leavesDict = Dictionary[Type, List[Type]]()
    TypeExtension.FindLeaves(root, List[Type](), leavesDict)
    let list = TypeExtension.Sort(leavesDict)
    return list
}

func (path IEnumerable[Type]) ToHierarchyString() string {
    let sb = StringBuilder()
    for t in path {
        if sb.Length > 0 {
            sb.Append(':')
        }
        sb.Append(t.Name)
    }
    return sb.ToString()
}
