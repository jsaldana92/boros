export function chartScale(values: number[], top = 24, bottom = 220) {
  const min = values.reduce((a, b) => Math.min(a, b), Infinity), max = values.reduce((a, b) => Math.max(a, b), -Infinity)
  const pad = max === min ? Math.max(1, max * .05) : (max - min) * .1
  const lower = Math.max(0, min - pad), upper = max + pad
  return { y: (value: number) => bottom - (value - lower) / (upper - lower) * (bottom - top), ticks: [0, 1, 2, 3, 4].map((n) => ({ y: bottom - n / 4 * (bottom - top), value: lower + n / 4 * (upper - lower) })) }
}
