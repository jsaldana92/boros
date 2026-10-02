import { useEffect, useRef } from 'react'
import { UserRound } from 'lucide-react'

export function Avatar({ blob, name }: { blob?: Blob; name: string }) {
  const imageRef = useRef<HTMLImageElement>(null)
  useEffect(() => {
    if (!blob) return
    const next = URL.createObjectURL(blob)
    if (imageRef.current) imageRef.current.src = next
    return () => URL.revokeObjectURL(next)
  }, [blob])
  return <span className="avatar">{blob ? <img ref={imageRef} alt={`${name} profile photo`} /> : <UserRound aria-label="Default avatar" size={25} />}</span>
}
