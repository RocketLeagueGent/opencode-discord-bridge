export function createSpeechQueue({ synthesize, convert, speakQueue, isJoined }) {
  let tail = Promise.resolve()

  return {
    async enqueue(text) {
      const task = tail.then(async () => {
        if (!isJoined()) return false
        try {
          const wav = await synthesize(text)
          const { pcm } = convert(wav)
          const queue = typeof speakQueue === "function" ? speakQueue() : speakQueue
          if (!queue) return false
          return queue.enqueue(pcm)
        } catch (err) {
          return false
        }
      })
      tail = task.catch(() => {})
      return task
    },
  }
}

export function createSpeakQueue({ player, createResource, isJoined }) {
  const pending = []
  let active = null

  function startNext() {
    if (active) return
    const entry = pending.shift()
    if (!entry) return
    if (!isJoined()) {
      entry.resolve(false)
      startNext()
      return
    }

    active = entry
    const finish = (played) => {
      if (active !== entry) return
      player.off("stateChange", onStateChange)
      player.off("error", onError)
      active = null
      entry.resolve(played && isJoined())
      startNext()
    }
    const onStateChange = (_oldState, newState) => {
      if (newState.status === "idle") finish(true)
    }
    const onError = () => finish(false)

    player.on("stateChange", onStateChange)
    player.once("error", onError)
    try {
      player.play(createResource(entry.pcm))
    } catch {
      finish(false)
    }
  }

  return {
    enqueue(pcm) {
      return new Promise((resolve) => {
        if (!isJoined()) {
          resolve(false)
          return
        }
        pending.push({ pcm, resolve })
        startNext()
      })
    },
    clear() {
      for (const entry of pending.splice(0)) entry.resolve(false)
      if (active) player.stop(true)
    },
  }
}
