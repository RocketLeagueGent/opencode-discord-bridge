export function createQueue() {
  let tail = Promise.resolve()
  return {
    enqueue(fn) {
      const run = tail.then(fn)
      tail = run.catch(() => {})
      return run
    },
  }
}
