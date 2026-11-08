export function nest(a: boolean, b: boolean, c: boolean, d: boolean, e: boolean) {
  let count = 0;
  if (a) {
    if (b) {
      if (c) {
        if (d) {
          if (e) {
            count += 1;
          }
        }
      }
    }
  }
  return count;
}
