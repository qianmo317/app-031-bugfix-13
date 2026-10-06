// 极简内存版 localStorage（无浏览器环境的测试桩）
export function memoryStorage(): Storage {
  const map = new Map<string, string>()
  return {
    get length(): number {
      return map.size
    },
    clear(): void {
      map.clear()
    },
    getItem(key: string): string | null {
      return map.has(key) ? map.get(key)! : null
    },
    key(index: number): string | null {
      return [...map.keys()][index] ?? null
    },
    removeItem(key: string): void {
      map.delete(key)
    },
    setItem(key: string, value: string): void {
      map.set(key, String(value))
    }
  }
}
