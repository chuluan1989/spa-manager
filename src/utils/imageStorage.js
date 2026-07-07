import { isSupabaseConfigured, supabase } from '../lib/supabaseClient'

export const IMAGE_BUCKET = 'spa-images'

export const IMAGE_CATEGORIES = {
  AVATAR: 'avatars',
  CCCD_FRONT: 'cccd-front',
  CCCD_BACK: 'cccd-back',
  CONTRACT: 'contracts',
  RECEIPT: 'receipts',
  BRAND_LOGO: 'brand',
  ADMIN_AVATAR: 'admin-avatar',
}

const COMPRESS_THRESHOLD_BYTES = 2 * 1024 * 1024
const TARGET_COMPRESSED_BYTES = 1.5 * 1024 * 1024
const HARD_MAX_UPLOAD_BYTES = 15 * 1024 * 1024
const MAX_IMAGE_DIMENSION = 1920
const MIN_IMAGE_DIMENSION = 640
const MIN_JPEG_QUALITY = 0.4

export function isBase64Image(value) {
  return typeof value === 'string' && value.startsWith('data:image/')
}

export function isStorageImageUrl(value) {
  return typeof value === 'string' && /^https?:\/\//i.test(value)
}

function sanitizePathSegment(value) {
  return String(value ?? 'general')
    .trim()
    .replace(/[^a-zA-Z0-9_-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '') || 'general'
}

function isImageFile(file) {
  if (!file) return false
  if (file.type?.startsWith('image/')) return true
  return /\.(jpe?g|png|webp|gif|heic|heif)$/i.test(file.name ?? '')
}

function readFileAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result ?? ''))
    reader.onerror = () => reject(new Error('Không đọc được file ảnh'))
    reader.readAsDataURL(file)
  })
}

function loadImageElementFromUrl(src) {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => resolve(img)
    img.onerror = () => reject(new Error('File ảnh bị lỗi hoặc không đúng định dạng'))
    img.src = src
  })
}

/** Ưu tiên object URL — nhẹ hơn FileReader trên Safari iOS / Chrome Android. */
async function loadImageElementFromFile(file) {
  if (typeof URL !== 'undefined' && URL.createObjectURL) {
    const objectUrl = URL.createObjectURL(file)
    try {
      return await loadImageElementFromUrl(objectUrl)
    } catch {
      /* fallback FileReader bên dưới */
    } finally {
      URL.revokeObjectURL(objectUrl)
    }
  }

  const dataUrl = await readFileAsDataUrl(file)
  return loadImageElementFromUrl(dataUrl)
}

function estimateBlobBytes(blob) {
  return blob?.size ?? 0
}

function canvasToBlob(canvas, quality) {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (blob) resolve(blob)
        else reject(new Error('Không nén được ảnh'))
      },
      'image/jpeg',
      quality,
    )
  })
}

function drawToCanvas(img, width, height) {
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext('2d')
  ctx.drawImage(img, 0, 0, width, height)
  return canvas
}

async function compressImageElementToBlob(img) {
  let width = img.naturalWidth || img.width
  let height = img.naturalHeight || img.height

  if (!width || !height) {
    throw new Error('Không đọc được kích thước ảnh')
  }

  if (width > MAX_IMAGE_DIMENSION || height > MAX_IMAGE_DIMENSION) {
    if (width >= height) {
      height = Math.round((height * MAX_IMAGE_DIMENSION) / width)
      width = MAX_IMAGE_DIMENSION
    } else {
      width = Math.round((width * MAX_IMAGE_DIMENSION) / height)
      height = MAX_IMAGE_DIMENSION
    }
  }

  let quality = 0.85
  let canvas = drawToCanvas(img, width, height)
  let output = await canvasToBlob(canvas, quality)

  let guard = 0
  while (
    estimateBlobBytes(output) > TARGET_COMPRESSED_BYTES
    && (quality > MIN_JPEG_QUALITY || width > MIN_IMAGE_DIMENSION)
    && guard < 20
  ) {
    if (quality > MIN_JPEG_QUALITY) {
      quality = Math.max(MIN_JPEG_QUALITY, quality - 0.1)
    } else {
      width = Math.round(width * 0.85)
      height = Math.round(height * 0.85)
      canvas = drawToCanvas(img, width, height)
    }
    output = await canvasToBlob(canvas, quality)
    guard += 1
  }

  return output
}

/**
 * Chuẩn hoá file ảnh thành Blob JPEG trước khi upload Storage.
 * Dùng canvas.toBlob + object URL — tương thích Safari iOS / Chrome Android.
 */
export async function prepareImageBlob(file, options = {}) {
  if (!file) {
    throw new Error('Không có file ảnh')
  }
  if (!isImageFile(file)) {
    throw new Error('Vui lòng chọn file ảnh (JPG, PNG, HEIC...)')
  }

  const maxBytes = options.maxBytes ?? HARD_MAX_UPLOAD_BYTES
  const compressThreshold = options.compressThreshold ?? COMPRESS_THRESHOLD_BYTES

  if (file.size > maxBytes) {
    throw new Error(`Ảnh quá lớn (tối đa ${Math.round(maxBytes / (1024 * 1024))}MB), vui lòng chọn ảnh khác`)
  }

  if (options.skipCompress && file.type === 'image/jpeg') {
    return file
  }

  if (file.size <= compressThreshold && file.type === 'image/jpeg') {
    return file
  }

  try {
    const img = await loadImageElementFromFile(file)
    return await compressImageElementToBlob(img)
  } catch {
    if (options.skipCompress) {
      return file
    }
    throw new Error('Không xử lý được ảnh. Vui lòng chọn JPG/PNG khác.')
  }
}

function mapUploadError(message = '') {
  const text = message.toLowerCase()
  if (text.includes('bucket not found') || text.includes('does not exist')) {
    return 'Bucket spa-images chưa được tạo. Vui lòng chạy migration 0011_storage_buckets.sql trên Supabase.'
  }
  if (text.includes('row-level security') || text.includes('policy')) {
    return 'Không có quyền upload ảnh. Kiểm tra policy Storage (migration 0011).'
  }
  if (text.includes('mime') || text.includes('content type')) {
    return 'Định dạng ảnh không được phép trên Storage.'
  }
  return message || 'Upload ảnh thất bại'
}

function buildObjectPath(category, entityId) {
  const safeCategory = sanitizePathSegment(category)
  const safeEntityId = sanitizePathSegment(entityId)
  const unique = `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`
  return `${safeCategory}/${safeEntityId}/${unique}.jpg`
}

export async function uploadImageBlob(blob, { category, entityId = 'general' } = {}) {
  if (!isSupabaseConfigured) {
    throw new Error('Supabase chưa cấu hình, không thể upload ảnh.')
  }
  if (!blob) {
    throw new Error('Không có dữ liệu ảnh để upload')
  }

  const path = buildObjectPath(category, entityId)
  const contentType = blob.type?.startsWith('image/') ? blob.type : 'image/jpeg'

  const { error: uploadError } = await supabase.storage.from(IMAGE_BUCKET).upload(path, blob, {
    contentType,
    upsert: false,
    cacheControl: '3600',
  })

  if (uploadError) {
    throw new Error(mapUploadError(uploadError.message))
  }

  const { data } = supabase.storage.from(IMAGE_BUCKET).getPublicUrl(path)
  if (!data?.publicUrl) {
    throw new Error('Upload ảnh thất bại: không lấy được URL')
  }

  return data.publicUrl
}

/**
 * Upload ảnh lên Supabase Storage và trả về public URL.
 * Không trả Base64 — chỉ URL sau khi upload thành công.
 */
export async function uploadImageFile(file, options = {}) {
  const {
    category = IMAGE_CATEGORIES.AVATAR,
    entityId = 'general',
    maxBytes,
    compressThreshold,
    skipCompress = false,
  } = options

  const blob = await prepareImageBlob(file, { maxBytes, compressThreshold, skipCompress })
  return uploadImageBlob(blob, { category, entityId })
}
