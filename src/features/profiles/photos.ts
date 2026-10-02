import { photoSchema, type PreparedPhoto } from '../../schemas/profile'

export async function preparePhoto(file: File): Promise<PreparedPhoto> {
  photoSchema.pick({ blob: true }).parse({ blob: file })
  let bitmap: ImageBitmap
  try { bitmap = await createImageBitmap(file) } catch { throw new Error('This file is not a readable image. Choose a JPEG, PNG, or WebP photo.') }
  try {
    return photoSchema.parse({ blob: file, width: bitmap.width, height: bitmap.height })
  } finally { bitmap.close() }
}
