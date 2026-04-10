'use client'
import { useEffect, useState, useRef } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import toast from 'react-hot-toast'
import * as XLSX from 'xlsx'

type Product = { id: string; name: string; price: number; quantity: number; image_url: string }
type ImportedRow = { name: string; price: number; quantity: number; image_url?: string }
type ImportPreview = { valid: ImportedRow[]; errors: { row: number; reason: string }[] }
type ColumnMap = { name: string; price: string; quantity: string }

const inputCls = "w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#1B2D72]/20 focus:border-[#1B2D72] transition-all"
const MARKET_LOGO_PLACEHOLDER = '/favicon.ico'
const PRODUCT_IMAGES_BUCKET = 'product-images'

export default function ManageProducts() {
  const [products, setProducts] = useState<Product[]>([])
  const [loading, setLoading] = useState(true)
  const [isAdmin, setIsAdmin] = useState(false)
  const [editingProduct, setEditingProduct] = useState<Product | null>(null)
  const [formData, setFormData] = useState({ name: '', price: '', quantity: '', image_url: '' })
  const [showForm, setShowForm] = useState(false)
  const [showImport, setShowImport] = useState(false)
  const [importPreview, setImportPreview] = useState<ImportPreview | null>(null)
  const [importing, setImporting] = useState(false)
  const [aiParsing, setAiParsing] = useState(false)
  const [workbook, setWorkbook] = useState<XLSX.WorkBook | null>(null)
  const [sheetNames, setSheetNames] = useState<string[]>([])
  const [selectedSheet, setSelectedSheet] = useState<string>('')
  const [sheetColumns, setSheetColumns] = useState<string[]>([])
  const [columnMap, setColumnMap] = useState<ColumnMap>({ name: '', price: '', quantity: '' })
  const [uploadingImage, setUploadingImage] = useState(false)
  const [searchingImage, setSearchingImage] = useState(false)
  const [imagePickerUrls, setImagePickerUrls] = useState<string[]>([])
  const [bulkImagesRunning, setBulkImagesRunning] = useState(false)
  const [bulkImagesProgress, setBulkImagesProgress] = useState({ current: 0, total: 0 })
  const fileInputRef = useRef<HTMLInputElement>(null)
  const imageUploadRef = useRef<HTMLInputElement>(null)
  const router = useRouter()
  const supabase = createClient()

  useEffect(() => { checkAdmin() }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const checkAdmin = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { router.push('/auth/login'); return }
      const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single()
      if (profile?.role !== 'admin') { toast.error('Access denied'); router.push('/'); return }
      setIsAdmin(true)
      fetchProducts()
    } catch { router.push('/') }
  }

  const fetchProducts = async () => {
    setLoading(true)
    try {
      const { data, error } = await supabase.from('products').select('*').order('created_at', { ascending: false })
      if (error) throw error
      setProducts(data || [])
    } catch { toast.error('Failed to load products') }
    finally { setLoading(false) }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    const productData = {
      name: formData.name,
      price: parseFloat(formData.price),
      quantity: parseInt(formData.quantity),
      image_url: formData.image_url || null,
    }
    try {
      if (editingProduct) {
        const { error } = await supabase.from('products').update(productData).eq('id', editingProduct.id)
        if (error) throw error
        toast.success('Product updated!')
      } else {
        const { error } = await supabase.from('products').insert([productData])
        if (error) throw error
        toast.success('Product added!')
      }
      setFormData({ name: '', price: '', quantity: '', image_url: '' })
      setEditingProduct(null)
      setShowForm(false)
      setImagePickerUrls([])
      fetchProducts()
    } catch { toast.error('Failed to save product') }
  }

  const handleDelete = async (id: string, name: string) => {
    if (!confirm(`Delete "${name}"?`)) return
    try {
      const { error } = await supabase.from('products').delete().eq('id', id)
      if (error) throw error
      toast.success('Product deleted')
      fetchProducts()
    } catch { toast.error('Failed to delete') }
  }

  const handleEdit = (product: Product) => {
    setEditingProduct(product)
    setFormData({ name: product.name, price: product.price.toString(), quantity: product.quantity.toString(), image_url: product.image_url || '' })
    setShowForm(true)
    setShowImport(false)
  }

  // Auto-detect which column likely maps to each field
  const autoDetect = (cols: string[]): ColumnMap => {
    const find = (hints: string[]) =>
      cols.find(c => hints.some(h => c.toLowerCase().replace(/[\s_-]/g, '').includes(h))) ?? ''
    return {
      name: find(['name', 'product', 'item', 'description', 'title', 'produit', 'article']),
      price: find(['price', 'cost', 'unitprice', 'rate', 'prix', 'tarif', 'amount']),
      quantity: find(['quantity', 'qty', 'stock', 'count', 'qte', 'quantite', 'units']),
    }
  }

  const loadSheet = (wb: XLSX.WorkBook, sheetName: string) => {
    const sheet = wb.Sheets[sheetName]
    const rows: unknown[][] = XLSX.utils.sheet_to_json(sheet, { defval: '', header: 1 })
    // First non-empty row as headers
    const headers = (rows[0] ?? []).map(h => String(h ?? '').trim()).filter(Boolean)
    setSheetColumns(headers)
    setColumnMap(autoDetect(headers))
    setImportPreview(null)
  }

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = (evt) => {
      try {
        const data = new Uint8Array(evt.target?.result as ArrayBuffer)
        const wb = XLSX.read(data, { type: 'array' })
        setWorkbook(wb)
        setSheetNames(wb.SheetNames)
        const first = wb.SheetNames[0]
        setSelectedSheet(first)
        loadSheet(wb, first)
      } catch { toast.error('Failed to parse file') }
    }
    reader.readAsArrayBuffer(file)
  }

  const handleSheetChange = (name: string) => {
    setSelectedSheet(name)
    if (workbook) loadSheet(workbook, name)
  }

  const buildPreview = () => {
    if (!workbook || !selectedSheet) return
    if (!columnMap.name || !columnMap.price || !columnMap.quantity) {
      toast.error('Please map Name, Price, and Quantity columns')
      return
    }
    const sheet = workbook.Sheets[selectedSheet]
    const rows: Record<string, unknown>[] = XLSX.utils.sheet_to_json(sheet, { defval: '' })
    const valid: ImportedRow[] = []
    const errors: { row: number; reason: string }[] = []
    rows.forEach((row, idx) => {
      const rowNum = idx + 2
      const name = String(row[columnMap.name] ?? '').trim()
      const price = parseFloat(String(row[columnMap.price] ?? ''))
      const quantity = parseInt(String(row[columnMap.quantity] ?? ''), 10)
      if (!name) { errors.push({ row: rowNum, reason: 'Missing name' }); return }
      if (isNaN(price) || price < 0) { errors.push({ row: rowNum, reason: 'Invalid price' }); return }
      if (isNaN(quantity) || quantity < 0) { errors.push({ row: rowNum, reason: 'Invalid quantity' }); return }
      valid.push({ name, price, quantity })
    })
    setImportPreview({ valid, errors })
  }

  const parseWithAI = async () => {
    if (!workbook || !selectedSheet) return
    setAiParsing(true)
    try {
      const sheet = workbook.Sheets[selectedSheet]
      const sheetCsv = XLSX.utils.sheet_to_csv(sheet)
      const res = await fetch('/api/parse-excel-sheet', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sheetCsv }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'AI parsing failed')
      const products: ImportedRow[] = data.products
      if (!products.length) {
        toast.error('AI found no products in this sheet')
        return
      }
      setImportPreview({ valid: products, errors: [] })
      toast.success(`AI extracted ${products.length} products`)
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'AI parsing failed')
    } finally {
      setAiParsing(false)
    }
  }

  const handleConfirmImport = async () => {
    if (!importPreview?.valid.length) return
    setImporting(true)
    try {
      const { error } = await supabase.from('products').insert(importPreview.valid.map(p => ({ ...p, image_url: p.image_url || null })))
      if (error) throw error
      toast.success(`${importPreview.valid.length} products imported!`)
      setImportPreview(null)
      setShowImport(false)
      setWorkbook(null)
      setSheetNames([])
      setSelectedSheet('')
      setSheetColumns([])
      setColumnMap({ name: '', price: '', quantity: '' })
      if (fileInputRef.current) fileInputRef.current.value = ''
      fetchProducts()
    } catch { toast.error('Import failed') }
    finally { setImporting(false) }
  }

  const downloadTemplate = () => {
    const ws = XLSX.utils.aoa_to_sheet([['name', 'price', 'quantity', 'image_url'], ['Sample Product', 15, 100, ''], ['Another Product', 25, 50, '']])
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'Products')
    XLSX.writeFile(wb, 'products_template.xlsx')
  }

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    setUploadingImage(true)
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) throw new Error('You must be logged in to upload images')

      const ext = file.name.split('.').pop()?.toLowerCase() || 'jpg'
      const baseName = file.name.replace(/\.[^.]+$/, '')
      const safeName = baseName.replace(/[^a-zA-Z0-9._-]/g, '-')
      const normalizedExt = ext === 'jpeg' ? 'jpg' : ext
      const filePath = `products/${user.id}/${Date.now()}-${safeName}.${normalizedExt}`

      const { error: uploadError } = await supabase.storage
        .from(PRODUCT_IMAGES_BUCKET)
        .upload(filePath, file, { upsert: false, contentType: file.type || 'image/jpeg' })
      if (uploadError) throw uploadError

      const { data } = supabase.storage.from(PRODUCT_IMAGES_BUCKET).getPublicUrl(filePath)
      if (!data?.publicUrl) throw new Error('Failed to get public URL')

      setFormData((prev) => ({ ...prev, image_url: data.publicUrl }))
      toast.success('Image uploaded')
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown upload error'
      console.error('Image upload error:', error)
      toast.error(`Image upload failed: ${message}`)
    } finally {
      setUploadingImage(false)
      if (imageUploadRef.current) imageUploadRef.current.value = ''
    }
  }

  const handleSearchImage = async () => {
    if (!formData.name.trim()) { toast.error('Enter a product name first'); return }
    setSearchingImage(true)
    setImagePickerUrls([])
    try {
      const res = await fetch('/api/search-product-image', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ productName: formData.name }),
      })
      const data = await res.json() as { imageUrls?: string[]; error?: string }
      if (!res.ok || !data.imageUrls?.length) throw new Error(data.error ?? 'No images found')
      setImagePickerUrls(data.imageUrls)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Image search failed')
    } finally {
      setSearchingImage(false)
    }
  }

  const handleBulkFillAllImages = async () => {
    if (!products.length) {
      toast.error('No products to process')
      return
    }
    const confirmed = confirm(
      'This will look up images from Open Food Facts for every product in the catalogue. ' +
        'When a match is found, the product image will be replaced. ' +
        'Products with no match stay unchanged. ' +
        'Continue?',
    )
    if (!confirmed) return

    setBulkImagesRunning(true)
    setBulkImagesProgress({ current: 0, total: products.length })
    let updated = 0
    let skipped = 0
    let errors = 0

    for (let i = 0; i < products.length; i++) {
      const p = products[i]
      setBulkImagesProgress({ current: i + 1, total: products.length })
      try {
        const res = await fetch('/api/admin/fill-product-image', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ productId: p.id }),
        })
        const data = (await res.json()) as {
          ok?: boolean
          status?: string
          error?: string
        }
        if (!res.ok || !data.ok) {
          errors += 1
          continue
        }
        if (data.status === 'updated') updated += 1
        else if (data.status === 'skipped') skipped += 1
        else errors += 1
      } catch {
        errors += 1
      }
      await new Promise((r) => setTimeout(r, 150))
    }

    setBulkImagesRunning(false)
    setBulkImagesProgress({ current: 0, total: 0 })
    toast.success(`Images: ${updated} updated, ${skipped} no match, ${errors} failed`)
    fetchProducts()
  }

  if (!isAdmin) return null
  if (loading) return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
      {Array.from({ length: 6 }).map((_, i) => (
        <div key={i} className="bg-white rounded-2xl border border-gray-100 overflow-hidden animate-pulse">
          <div className="h-44 bg-gray-100" />
          <div className="p-4 space-y-2">
            <div className="h-4 bg-gray-100 rounded w-3/4" />
            <div className="h-4 bg-gray-100 rounded w-1/2" />
          </div>
        </div>
      ))}
    </div>
  )

  return (
    <div>
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3 mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Products</h1>
          <p className="text-sm text-gray-500 mt-0.5">
            {products.length} items in catalogue
            {bulkImagesRunning && bulkImagesProgress.total > 0 && (
              <span className="ml-2 text-[#1B2D72] font-medium">
                · Auto-fill {bulkImagesProgress.current}/{bulkImagesProgress.total}
              </span>
            )}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={handleBulkFillAllImages}
            disabled={bulkImagesRunning || products.length === 0}
            className="flex items-center gap-2 px-4 py-2 rounded-xl border border-violet-200 bg-violet-50 text-sm font-medium text-violet-800 hover:bg-violet-100 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            {bulkImagesRunning ? (
              <>
                <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
                </svg>
                Filling images…
              </>
            ) : (
              <>
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                </svg>
                Auto-fill all images
              </>
            )}
          </button>
          <button
            onClick={() => { setShowImport(!showImport); setShowForm(false); setImportPreview(null); if (fileInputRef.current) fileInputRef.current.value = '' }}
            className="flex items-center gap-2 px-4 py-2 rounded-xl border border-gray-200 text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
            </svg>
            Import Excel
          </button>
          <button
            onClick={() => { setEditingProduct(null); setFormData({ name: '', price: '', quantity: '', image_url: '' }); setShowForm(!showForm); setShowImport(false) }}
            className="flex items-center gap-2 px-4 py-2 rounded-xl bg-[#1B2D72] text-white text-sm font-semibold hover:bg-[#00AECC] transition-colors"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
            {showForm ? 'Cancel' : 'Add Product'}
          </button>
        </div>
      </div>

      {/* Import Panel */}
      {showImport && (
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6 mb-6 space-y-5">
          <div>
            <h2 className="font-bold text-gray-900">Import from Excel</h2>
            <p className="text-sm text-gray-400 mt-0.5">Supports multi-tab files. Pick a sheet, map the columns, then preview.</p>
          </div>

          {/* Step 1 — File picker */}
          <div className="flex flex-wrap gap-3 items-center">
            <label className="cursor-pointer flex items-center gap-2 px-4 py-2 border border-gray-200 rounded-xl text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
              </svg>
              {sheetNames.length ? 'Change File' : 'Choose File'}
              <input ref={fileInputRef} type="file" accept=".xlsx,.xls,.ods" onChange={handleFileChange} className="hidden" />
            </label>
            <button onClick={downloadTemplate} className="text-sm text-[#1B2D72] hover:underline font-medium">
              Download template →
            </button>
          </div>

          {/* Step 2 — Sheet selector */}
          {sheetNames.length > 0 && (
            <div>
              <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Sheet / Tab</label>
              <div className="flex flex-wrap gap-2">
                {sheetNames.map(s => (
                  <button
                    key={s}
                    onClick={() => handleSheetChange(s)}
                    className={`px-3 py-1.5 rounded-lg text-sm font-medium border transition-all ${
                      selectedSheet === s
                        ? 'bg-[#1B2D72] text-white border-[#1B2D72]'
                        : 'bg-white text-gray-600 border-gray-200 hover:border-gray-300'
                    }`}
                  >
                    {s}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Step 3 — Column mapping */}
          {sheetColumns.length > 0 && (
            <div>
              <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Map Columns</label>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                {(['name', 'price', 'quantity'] as const).map(field => (
                  <div key={field}>
                    <label className="block text-xs font-medium text-gray-500 mb-1 capitalize">
                      {field} <span className="text-red-400">*</span>
                    </label>
                    <select
                      value={columnMap[field]}
                      onChange={e => setColumnMap(prev => ({ ...prev, [field]: e.target.value }))}
                      className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#1B2D72]/20 focus:border-[#1B2D72] transition-all bg-white"
                    >
                      <option value="">— select column —</option>
                      {sheetColumns.map(col => (
                        <option key={col} value={col}>{col}</option>
                      ))}
                    </select>
                  </div>
                ))}
              </div>
              <div className="mt-3 flex flex-wrap gap-2 items-center">
                <button
                  onClick={buildPreview}
                  disabled={!columnMap.name || !columnMap.price || !columnMap.quantity}
                  className="px-4 py-2 rounded-xl bg-[#1B2D72] text-white text-sm font-semibold hover:bg-[#00AECC] disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                >
                  Preview Import
                </button>
                <span className="text-xs text-gray-400">or</span>
                <button
                  onClick={parseWithAI}
                  disabled={aiParsing}
                  className="flex items-center gap-2 px-4 py-2 rounded-xl bg-violet-600 text-white text-sm font-semibold hover:bg-violet-700 disabled:opacity-50 transition-colors"
                >
                  {aiParsing ? (
                    <>
                      <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z"/>
                      </svg>
                      Parsing…
                    </>
                  ) : (
                    <>
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
                      </svg>
                      Parse with AI
                    </>
                  )}
                </button>
                <span className="text-xs text-gray-400">AI works even without standard headers</span>
              </div>
            </div>
          )}

          {/* Step 4 — Editable Preview */}
          {importPreview && (
            <div className="space-y-3">
              {importPreview.errors.length > 0 && (
                <div className="bg-red-50 border border-red-100 rounded-xl p-4">
                  <p className="font-semibold text-red-700 text-sm mb-2">{importPreview.errors.length} row(s) skipped:</p>
                  <ul className="text-sm text-red-600 space-y-0.5 max-h-32 overflow-y-auto">
                    {importPreview.errors.map(e => <li key={e.row}>Row {e.row}: {e.reason}</li>)}
                  </ul>
                </div>
              )}
              {importPreview.valid.length > 0 ? (
                <>
                  <div className="flex items-center justify-between">
                    <p className="text-sm font-semibold text-emerald-700">{importPreview.valid.length} product(s) — edit any cell before importing</p>
                    <button
                      onClick={() => setImportPreview(prev => prev ? { ...prev, valid: [...prev.valid, { name: '', price: 0, quantity: 0 }] } : prev)}
                      className="flex items-center gap-1 text-xs font-semibold text-[#1B2D72] hover:underline"
                    >
                      <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                      </svg>
                      Add row
                    </button>
                  </div>
                  <div className="overflow-x-auto rounded-xl border border-gray-100 max-h-72 overflow-y-auto">
                    <table className="w-full text-sm">
                      <thead className="bg-gray-50 text-left sticky top-0 z-10">
                        <tr>
                          <th className="px-3 py-2.5 text-xs font-semibold text-gray-500 uppercase tracking-wider">Name</th>
                          <th className="px-3 py-2.5 text-xs font-semibold text-gray-500 uppercase tracking-wider w-28">Price (K L.L)</th>
                          <th className="px-3 py-2.5 text-xs font-semibold text-gray-500 uppercase tracking-wider w-20">Qty</th>
                          <th className="px-3 py-2.5 w-8" />
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-50">
                        {importPreview.valid.map((p, i) => (
                          <tr key={i} className="group">
                            <td className="px-2 py-1.5">
                              <input
                                type="text"
                                value={p.name}
                                onChange={e => setImportPreview(prev => {
                                  if (!prev) return prev
                                  const valid = [...prev.valid]
                                  valid[i] = { ...valid[i], name: e.target.value }
                                  return { ...prev, valid }
                                })}
                                className="w-full border border-transparent hover:border-gray-200 focus:border-[#1B2D72] rounded-lg px-2 py-1 text-sm focus:outline-none focus:ring-1 focus:ring-[#1B2D72]/20 transition-all"
                              />
                            </td>
                            <td className="px-2 py-1.5">
                              <input
                                type="number"
                                min={0}
                                step="0.001"
                                value={p.price}
                                onChange={e => setImportPreview(prev => {
                                  if (!prev) return prev
                                  const valid = [...prev.valid]
                                  valid[i] = { ...valid[i], price: parseFloat(e.target.value) || 0 }
                                  return { ...prev, valid }
                                })}
                                className="w-full border border-transparent hover:border-gray-200 focus:border-[#1B2D72] rounded-lg px-2 py-1 text-sm focus:outline-none focus:ring-1 focus:ring-[#1B2D72]/20 transition-all"
                              />
                            </td>
                            <td className="px-2 py-1.5">
                              <input
                                type="number"
                                min={0}
                                value={p.quantity}
                                onChange={e => setImportPreview(prev => {
                                  if (!prev) return prev
                                  const valid = [...prev.valid]
                                  valid[i] = { ...valid[i], quantity: parseInt(e.target.value) || 0 }
                                  return { ...prev, valid }
                                })}
                                className="w-full border border-transparent hover:border-gray-200 focus:border-[#1B2D72] rounded-lg px-2 py-1 text-sm focus:outline-none focus:ring-1 focus:ring-[#1B2D72]/20 transition-all"
                              />
                            </td>
                            <td className="px-2 py-1.5 text-right">
                              <button
                                onClick={() => setImportPreview(prev => prev ? { ...prev, valid: prev.valid.filter((_, idx) => idx !== i) } : prev)}
                                className="opacity-0 group-hover:opacity-100 text-red-400 hover:text-red-600 transition-all p-1 rounded"
                                title="Remove row"
                              >
                                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                                </svg>
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  <div className="flex gap-2">
                    <button onClick={handleConfirmImport} disabled={importing} className="px-4 py-2 rounded-xl bg-emerald-600 text-white text-sm font-semibold hover:bg-emerald-700 disabled:opacity-50 transition-colors">
                      {importing ? 'Importing…' : `Import ${importPreview.valid.length} Products`}
                    </button>
                    <button
                      onClick={() => {
                        setImportPreview(null); setShowImport(false); setWorkbook(null)
                        setSheetNames([]); setSelectedSheet(''); setSheetColumns([])
                        setColumnMap({ name: '', price: '', quantity: '' })
                        if (fileInputRef.current) fileInputRef.current.value = ''
                      }}
                      className="px-4 py-2 rounded-xl border border-gray-200 text-sm font-medium text-gray-600 hover:bg-gray-50 transition-colors"
                    >
                      Cancel
                    </button>
                  </div>
                </>
              ) : (
                <p className="text-sm text-gray-500">No valid rows found with the selected mapping.</p>
              )}
            </div>
          )}
        </div>
      )}

      {/* Add/Edit Form */}
      {showForm && (
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6 mb-6">
          <h2 className="font-bold text-gray-900 mb-5">{editingProduct ? 'Edit Product' : 'Add New Product'}</h2>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">Product Name *</label>
              <input type="text" required value={formData.name} onChange={e => setFormData({ ...formData, name: e.target.value })} className={inputCls} placeholder="Enter product name" />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">Price (K L.L) *</label>
                <input type="number" step="0.01" required value={formData.price} onChange={e => setFormData({ ...formData, price: e.target.value })} className={inputCls} placeholder="0" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">Quantity *</label>
                <input type="number" required value={formData.quantity} onChange={e => setFormData({ ...formData, quantity: e.target.value })} className={inputCls} placeholder="0" />
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">Image URL <span className="text-gray-400 font-normal">(optional)</span></label>
              <input type="url" value={formData.image_url} onChange={e => setFormData({ ...formData, image_url: e.target.value })} className={inputCls} placeholder="https://example.com/image.jpg" />
              <div className="mt-2 flex items-center gap-2 flex-wrap">
                <button
                  type="button"
                  onClick={handleSearchImage}
                  disabled={searchingImage || !formData.name.trim()}
                  className="px-3 py-2 rounded-lg border border-[#1B2D72] text-xs font-semibold text-[#1B2D72] hover:bg-[#1B2D72] hover:text-white disabled:opacity-40 disabled:cursor-not-allowed transition-colors flex items-center gap-1.5"
                >
                  {searchingImage ? (
                    <>
                      <svg className="w-3.5 h-3.5 animate-spin" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
                      </svg>
                      Searching...
                    </>
                  ) : (
                    <>
                      <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <circle cx="11" cy="11" r="8" strokeWidth="2" />
                        <path strokeLinecap="round" strokeWidth="2" d="M21 21l-4.35-4.35" />
                      </svg>
                      Find Image Online
                    </>
                  )}
                </button>
                <button
                  type="button"
                  onClick={() => imageUploadRef.current?.click()}
                  disabled={uploadingImage}
                  className="px-3 py-2 rounded-lg border border-gray-200 text-xs font-semibold text-gray-700 hover:bg-gray-50 disabled:opacity-50 transition-colors"
                >
                  {uploadingImage ? 'Uploading...' : 'Upload Image'}
                </button>
                <input
                  ref={imageUploadRef}
                  type="file"
                  accept="image/*"
                  onChange={handleImageUpload}
                  className="hidden"
                />
              </div>
              {/* Image picker */}
              {imagePickerUrls.length > 0 && (
                <div className="mt-3 p-3 bg-gray-50 rounded-xl border border-gray-100">
                  <div className="flex items-center justify-between mb-2">
                    <p className="text-xs font-semibold text-gray-600">{imagePickerUrls.length} images found — pick one</p>
                    <button type="button" onClick={() => setImagePickerUrls([])} className="text-gray-400 hover:text-gray-600 transition-colors">
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                      </svg>
                    </button>
                  </div>
                  <div className="grid grid-cols-4 gap-2 sm:grid-cols-6">
                    {imagePickerUrls.map((url, i) => (
                      <button
                        key={i}
                        type="button"
                        onClick={() => { setFormData(prev => ({ ...prev, image_url: url })); setImagePickerUrls([]) }}
                        className={`relative aspect-square rounded-lg overflow-hidden border-2 transition-all hover:scale-105 ${formData.image_url === url ? 'border-[#1B2D72]' : 'border-transparent hover:border-[#00AECC]'}`}
                      >
                        <img src={url} alt={`Option ${i + 1}`} className="w-full h-full object-cover" />
                      </button>
                    ))}
                  </div>
                </div>
              )}
              <div className="mt-2 w-16 h-16 rounded-lg border border-gray-100 overflow-hidden bg-gray-50">
                <img src={formData.image_url || MARKET_LOGO_PLACEHOLDER} alt="Preview" className="w-full h-full object-cover" />
              </div>
            </div>
            <div className="flex gap-2 pt-1">
              <button type="submit" className="px-5 py-2.5 rounded-xl bg-[#1B2D72] text-white text-sm font-semibold hover:bg-[#00AECC] transition-colors">
                {editingProduct ? 'Update Product' : 'Add Product'}
              </button>
              <button type="button" onClick={() => { setShowForm(false); setEditingProduct(null); setFormData({ name: '', price: '', quantity: '', image_url: '' }); setImagePickerUrls([]) }} className="px-5 py-2.5 rounded-xl border border-gray-200 text-sm font-medium text-gray-600 hover:bg-gray-50 transition-colors">
                Cancel
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Products Grid */}
      {products.length === 0 ? (
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-12 text-center">
          <div className="w-14 h-14 bg-gray-50 rounded-2xl flex items-center justify-center mx-auto mb-4">
            <svg className="w-7 h-7 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
            </svg>
          </div>
          <p className="font-semibold text-gray-700">No products yet</p>
          <p className="text-sm text-gray-400 mt-1">Click "Add Product" to get started</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {products.map((product) => (
            <div key={product.id} className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden hover:shadow-md transition-all group">
              <div className="h-44 bg-gray-50 relative overflow-hidden">
                {product.image_url ? (
                  <img src={product.image_url} alt={product.name} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300" />
                ) : (
                  <img src={MARKET_LOGO_PLACEHOLDER} alt="Market logo" className="w-full h-full object-contain p-6 opacity-90" />
                )}
                {product.quantity === 0 && (
                  <span className="absolute top-2 right-2 bg-red-100 text-red-600 text-xs font-semibold px-2 py-0.5 rounded-full">Out of stock</span>
                )}
              </div>
              <div className="p-4">
                <h3 className="font-semibold text-gray-900 truncate">{product.name}</h3>
                <div className="flex items-center justify-between mt-1 mb-3">
                  <p className="text-lg font-bold text-[#1B2D72]">{product.price}K L.L</p>
                  <p className={`text-xs font-medium px-2 py-0.5 rounded-full ${product.quantity > 0 ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-600'}`}>
                    {product.quantity > 0 ? `${product.quantity} in stock` : 'Out of stock'}
                  </p>
                </div>
                <div className="flex gap-2">
                  <button onClick={() => handleEdit(product)} className="flex-1 py-2 rounded-xl bg-gray-50 border border-gray-100 text-sm font-semibold text-gray-700 hover:bg-gray-100 transition-colors">
                    Edit
                  </button>
                  <button onClick={() => handleDelete(product.id, product.name)} className="flex-1 py-2 rounded-xl bg-red-50 border border-red-100 text-sm font-semibold text-red-600 hover:bg-red-100 transition-colors">
                    Delete
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
