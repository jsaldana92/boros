// Delay revocation until the browser has consumed the click. Page teardown also
// releases document-owned URLs; canceling preparation never creates one.
export function startDownload(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob), link = document.createElement('a')
  try { link.href = url; link.download = filename; document.body.append(link); link.click() }
  catch (error) { URL.revokeObjectURL(url); throw error }
  finally { link.remove() }
  setTimeout(() => URL.revokeObjectURL(url), 60000)
}
