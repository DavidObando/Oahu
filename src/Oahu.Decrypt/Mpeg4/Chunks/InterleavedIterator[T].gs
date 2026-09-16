package Oahu.Decrypt.Mpeg4.Chunks

import Oahu.Decrypt.Mpeg4.Boxes
import System
import System.Collections
import System.Collections.Generic
import System.Diagnostics.CodeAnalysis
import System.Linq

class EnumerableExtensions {
    private class InterleavedIterator[T] : IEnumerable[T] {
        init(enumerables[]IEnumerable[T], comparer Comparer[T]) {
            Enumerables = enumerables
            Comparer = comparer
        }

        private prop Enumerables[]IEnumerable[T] {
            get;
            init;
        }

        private prop Comparer Comparer[T] {
            get;
            init;
        }

        func GetEnumerator() IEnumerator[T] {
            let enumerators = Enumerables
                .Select((e IEnumerable[T]) -> e.GetEnumerator())
                .Select(
                (e IEnumerator[T]) -> if e.MoveNext() {
                    e
                } else {
                    default(IEnumerator[T]?)
                }
            )
                .ToArray()
            while GetNextValue(enumerators, out var currentIndex, out var currentEnumerator) {
                yield currentEnumerator!!.Current
                if !currentEnumerator!!.MoveNext() {
                    enumerators[currentIndex] = nil
                }
            }
        }

        private func (IEnumerable) GetEnumerator() IEnumerator -> GetEnumerator()

        private func GetNextValue(
            enumerators[]IEnumerator[T]?,
            out minIndex int32,
            @NotNullWhen(true) out minValue IEnumerator[T]?
        ) bool {
            minIndex = -1
            minValue = nil
            for var i = 0; i < enumerators.Length; i++ {
                if enumerators[i] is IEnumerator[T]ei &&
                    (minValue == nil || Comparer.Compare(minValue.Current, ei.Current) > 0) {
                    minIndex, minValue = i, ei
                }
            }
            return minIndex != -1
        }
    }

    shared {
        func ChunkEntries(track TrakBox) IEnumerable[ChunkEntry] -> ChunkEntryList(track)

        func InterleaveBy[TSource, TResult, TKey IComparable[TKey]](
            source IEnumerable[TSource],
            selector(TSource) -> IEnumerable[TResult],
            keySelector(TResult) -> TKey
        ) IEnumerable[TResult] {
            ArgumentNullException.ThrowIfNull(source, "source")
            ArgumentNullException.ThrowIfNull(selector, "selector")
            ArgumentNullException.ThrowIfNull(keySelector, "keySelector")
            let comparer = Comparer[TResult].Create((x TResult, y TResult) -> keySelector(x).CompareTo(keySelector(y)))
            return InterleavedIterator[TResult](source.Select((s TSource) -> selector(s)).ToArray(), comparer)
        }
    }
}

func (track TrakBox) ChunkEntries() IEnumerable[ChunkEntry] -> EnumerableExtensions.ChunkEntries(track)

func (source IEnumerable[TSource]) InterleaveBy[TSource, TResult, TKey IComparable[TKey]](
    selector(TSource) -> IEnumerable[TResult],
    keySelector(TResult) -> TKey
) IEnumerable[TResult] {
    return EnumerableExtensions.InterleaveBy[TSource, TResult, TKey](source, selector, keySelector)
}
