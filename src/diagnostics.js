// A plain-text account of the audio state, for working out why there is no
// sound: copy it into a bug report.

export function diagnosticsText ({ engine, session, player, win = window }) {
  const context = engine.context
  const audioSession = win.navigator?.audioSession?.type ?? 'not available'
  const lines = [
    `browser: ${win.navigator?.userAgent ?? 'unknown'}${win.navigator?.brave ? ' (Brave)' : ''}`,
    `secure page: ${win.isSecureContext}, offline worker: ${win.navigator?.serviceWorker?.controller ? 'active' : 'no'}`,
    context
      ? `audio: ${context.state}, ${context.sampleRate} Hz, clock ${context.currentTime.toFixed(2)} s, base latency ${(context.baseLatency ?? 0).toFixed(3)} s, output channels ${context.destination?.maxChannelCount ?? '?'}`
      : 'audio: not started yet (it starts on your first tap)',
    `audio session: ${audioSession}`,
    `instrument: ${session.status.state}${session.status.message ? ` (${session.status.message})` : ''}`,
    `address: ${session.iri}`,
    `problem: ${session.error ?? 'none'}`,
    `events sent: ${player.posted}, dropped by the plugin: ${session.diagnostics.dropped}`,
    `plugin error: ${session.diagnostics.processorError ?? 'none'}`
  ]
  return lines.join('\n')
}
