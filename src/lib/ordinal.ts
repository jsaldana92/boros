export function ordinal(value: number) {
  const tail = value % 100
  return `${value}${tail >= 11 && tail <= 13 ? 'th' : ({ 1: 'st', 2: 'nd', 3: 'rd' } as Record<number, string>)[value % 10] ?? 'th'}`
}
