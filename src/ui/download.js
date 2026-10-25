// Hand a file to the browser's download.

export function downloadBytes (bytes, filename, type = 'audio/midi') {
  const url = URL.createObjectURL(new Blob([bytes], { type }))
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  link.rel = 'noopener'
  document.body.append(link)
  link.click()
  link.remove()
  // Revoked later: some browsers start the download after the click returns.
  setTimeout(() => URL.revokeObjectURL(url), 10000)
}
