// A level meter on a plugin's output: is it actually making sound?

export function createMeter (context, node) {
  const analyser = context.createAnalyser()
  analyser.fftSize = 1024
  // An analyser only runs while it is connected towards the output, so it goes through a gain of zero.
  const silent = context.createGain()
  silent.gain.value = 0
  node.connect(analyser)
  analyser.connect(silent)
  silent.connect(context.destination)
  const samples = new Float32Array(analyser.fftSize)

  return {
    node,
    read () {
      analyser.getFloatTimeDomainData(samples)
      let peak = 0
      for (const value of samples) peak = Math.max(peak, Math.abs(value))
      return peak
    },
    dispose () {
      try { node.disconnect(analyser) } catch { /* already gone */ }
      silent.disconnect()
    }
  }
}
