export function tangled(items: number[], flag: boolean): number {
  let total = 0;
  for (const item of items) {
    if (item > 0) {
      if (flag) {
        for (let index = 0; index < item; index++) {
          if (index % 2 === 0) {
            total += index;
          } else if (index % 3 === 0) {
            total -= index;
          }
        }
      }
    }
  }
  return total;
}
