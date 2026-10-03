import { useEffect, useRef } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { measurements } from '../../db/measurements'

export function BlobImage({ blob, alt }: { blob: Blob; alt: string }) {
  const ref = useRef<HTMLImageElement>(null)
  useEffect(() => {
    const url = URL.createObjectURL(blob)
    if (ref.current) ref.current.src = url
    return () => URL.revokeObjectURL(url)
  }, [blob])
  return <img className="progress-photo" ref={ref} alt={alt} />
}
// Only mounted for one opened editor/viewer. The history list never reads blobs.
export function SavedPhoto({ profileId, entryId }: { profileId: string; entryId: string }) {
  const result = useLiveQuery(async () => {
    try { return { photo: await measurements.photo(profileId, entryId), error: '' } }
    catch (error) { return { error: (error as Error).message } }
  }, [profileId, entryId])
  return !result ? <p role="status">Loading photo…</p> : result.error ? <p role="alert">{result.error}</p> : result.photo ? <BlobImage blob={result.photo.blob} alt="Saved progress photo" /> : <p>No saved photo.</p>
}
