export function add(left: number, right: number) {
  return left + right
}

export function format(value: string) {
  return "[" + value + "]"
}

export function compute(values: number[]) {
  return values.reduce((total, value) => add(total, value), 0)
}
