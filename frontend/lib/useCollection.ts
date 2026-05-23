"use client"

import { useCallback, useMemo, useState } from "react"

export interface CollectionItem {
  id: string
  name: string
  short_name: string
}

export function useCollection() {
  // Map preserves insertion order and gives O(1) lookup by id
  const [itemMap, setItemMap] = useState<Map<string, CollectionItem>>(new Map())

  const toggle = useCallback((item: CollectionItem) => {
    setItemMap(prev => {
      const next = new Map(prev)
      if (next.has(item.id)) next.delete(item.id)
      else next.set(item.id, item)
      return next
    })
  }, [])

  const remove = useCallback((id: string) => {
    setItemMap(prev => {
      const next = new Map(prev)
      next.delete(id)
      return next
    })
  }, [])

  const clear = useCallback(() => setItemMap(new Map()), [])

  const isInCollection = useCallback((id: string) => itemMap.has(id), [itemMap])

  const list = useMemo(() => Array.from(itemMap.values()), [itemMap])
  const ids  = useMemo(() => Array.from(itemMap.keys()),   [itemMap])

  return { list, ids, toggle, remove, clear, isInCollection }
}
