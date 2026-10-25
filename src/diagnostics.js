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

/**
 * What a test beep tells you. `started`: the browser let the audio context run;
 * `advanced`: its clock moved afterwards (it does not when there is no working output).
 */
export function describeBeep ({ started, state, advanced }) {
  if (!started) {
    return `The browser did not let audio start (it is ${state ?? 'not created'}). It may be blocking sound for this site: check the site's sound permission and, in Brave, the Shields settings.`
  }
  if (!advanced) {
    return 'Audio says it is running, but its clock is not moving, so the browser has no working audio output to play to. Check the output device the browser is using.'
  }
  return 'The beep was sent to your audio output and the audio clock is running. If you heard nothing, the sound is being lost after the browser: volume, a muted tab, or the wrong output device.'
}
