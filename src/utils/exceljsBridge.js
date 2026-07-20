import { EXCEL_EXPORT_USER_ERROR } from './payrollExportErrors'

/**
 * Load ExcelJS from the official browser build shipped under /vendor
 * (copied from exceljs@4.4.0 dist). Avoids Vite/Rolldown circular chunks
 * when bundling the UMD `browser` entry of package root `exceljs`.
 */
let excelJsPromise = null

export default async function loadExcelJS() {
  if (typeof globalThis.ExcelJS?.Workbook === 'function') {
    return globalThis.ExcelJS
  }

  if (!excelJsPromise) {
    excelJsPromise = new Promise((resolve, reject) => {
      const existing = document.querySelector('script[data-exceljs-vendor="1"]')
      if (existing) {
        existing.addEventListener('load', () => {
          if (typeof globalThis.ExcelJS?.Workbook === 'function') resolve(globalThis.ExcelJS)
          else reject(new Error(EXCEL_EXPORT_USER_ERROR))
        })
        existing.addEventListener('error', () => reject(new Error(EXCEL_EXPORT_USER_ERROR)))
        return
      }

      const script = document.createElement('script')
      script.src = `${import.meta.env.BASE_URL}vendor/exceljs.min.js`
      script.async = true
      script.dataset.exceljsVendor = '1'
      script.onload = () => {
        if (typeof globalThis.ExcelJS?.Workbook === 'function') resolve(globalThis.ExcelJS)
        else reject(new Error(EXCEL_EXPORT_USER_ERROR))
      }
      script.onerror = () => reject(new Error(EXCEL_EXPORT_USER_ERROR))
      document.head.appendChild(script)
    }).catch((error) => {
      excelJsPromise = null
      throw error
    })
  }

  return excelJsPromise
}
