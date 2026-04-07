'use client'
import { useEffect, useState, useRef } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import toast from 'react-hot-toast'
import * as XLSX from 'xlsx'

type Product = { id: string; name: string; price: number; quantity: number; image_url: string }
type ImportedRow = { name: string; price: number; quantity: number; image_url?: string }
type ImportPreview = { valid: ImportedRow[]; errors: { row: number; reason: string }[] }

const inputCls = "w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#000080]/20 focus:border-[#000080] transition-all"
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
  const [uploadingImage, setUploadingImage] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const imageUploadRef = useRef<HTMLInputElement>(null)
  const router = useRouter()
  const supabase = createClient()

  useEffect(() => { checkAdmin() }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const checkAdmin = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { router.push('/login'); return }
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

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = (evt) => {
      try {
        const data = new Uint8Array(evt.target?.result as ArrayBuffer)
        const workbook = XLSX.read(data, { type: 'array' })
        const sheet = workbook.Sheets[workbook.SheetNames[0]]
        const rows: Record<string, unknown>[] = XLSX.utils.sheet_to_json(sheet, { defval: '' })
        const valid: ImportedRow[] = []
        const errors: { row: number; reason: string }[] = []
        rows.forEach((row, idx) => {
          const rowNum = idx + 2
          const n = Object.fromEntries(Object.entries(row).map(([k, v]) => [k.trim().toLowerCase().replace(/\s+/g, '_'), v]))
          const name = String(n['name'] ?? '').trim()
          const price = parseFloat(String(n['price'] ?? ''))
          const quantity = parseInt(String(n['quantity'] ?? ''), 10)
          const image_url = String(n['image_url'] ?? '').trim() || undefined
          if (!name) { errors.push({ row: rowNum, reason: 'Missing name' }); return }
          if (isNaN(price) || price < 0) { errors.push({ row: rowNum, reason: `Invalid price` }); return }
          if (isNaN(quantity) || quantity < 0) { errors.push({ row: rowNum, reason: `Invalid quantity` }); return }
          valid.push({ name, price, quantity, image_url })
        })
        setImportPreview({ valid, errors })
      } catch { toast.error('Failed to parse file') }
    }
    reader.readAsArrayBuffer(file)
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
          <p className="text-sm text-gray-500 mt-0.5">{products.length} items in catalogue</p>
        </div>
        <div className="flex gap-2">
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
            className="flex items-center gap-2 px-4 py-2 rounded-xl bg-[#000080] text-white text-sm font-semibold hover:bg-[#1F51FF] transition-colors"
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
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6 mb-6">
          <h2 className="font-bold text-gray-900 mb-1">Import from Excel</h2>
          <p className="text-sm text-gray-500 mb-4">Columns: <code className="bg-gray-100 px-1 rounded text-xs">name</code>, <code className="bg-gray-100 px-1 rounded text-xs">price</code>, <code className="bg-gray-100 px-1 rounded text-xs">quantity</code>, <code className="bg-gray-100 px-1 rounded text-xs">image_url</code></p>
          <div className="flex flex-wrap gap-3 mb-4">
            <label className="cursor-pointer flex items-center gap-2 px-4 py-2 border border-gray-200 rounded-xl text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13" />
              </svg>
              Choose File
              <input ref={fileInputRef} type="file" accept=".xlsx,.xls" onChange={handleFileChange} className="hidden" />
            </label>
            <button onClick={downloadTemplate} className="text-sm text-[#000080] hover:underline font-medium">
              Download template →
            </button>
          </div>

          {importPreview && (
            <div className="space-y-3">
              {importPreview.errors.length > 0 && (
                <div className="bg-red-50 border border-red-100 rounded-xl p-4">
                  <p className="font-semibold text-red-700 text-sm mb-2">{importPreview.errors.length} row(s) with errors:</p>
                  <ul className="text-sm text-red-600 space-y-0.5">
                    {importPreview.errors.map(e => <li key={e.row}>Row {e.row}: {e.reason}</li>)}
                  </ul>
                </div>
              )}
              {importPreview.valid.length > 0 && (
                <>
                  <p className="text-sm font-semibold text-emerald-700">{importPreview.valid.length} product(s) ready to import</p>
                  <div className="overflow-x-auto rounded-xl border border-gray-100">
                    <table className="w-full text-sm">
                      <thead className="bg-gray-50 text-left">
                        <tr>
                          {['Name', 'Price', 'Qty', 'Image'].map(h => <th key={h} className="px-4 py-2.5 text-xs font-semibold text-gray-500 uppercase tracking-wider">{h}</th>)}
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-50">
                        {importPreview.valid.map((p, i) => (
                          <tr key={i} className="hover:bg-gray-50">
                            <td className="px-4 py-2.5 font-medium">{p.name}</td>
                            <td className="px-4 py-2.5">{p.price}K L.L</td>
                            <td className="px-4 py-2.5">{p.quantity}</td>
                            <td className="px-4 py-2.5 text-gray-400 truncate max-w-[160px] text-xs">{p.image_url || '—'}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  <div className="flex gap-2">
                    <button onClick={handleConfirmImport} disabled={importing} className="px-4 py-2 rounded-xl bg-emerald-600 text-white text-sm font-semibold hover:bg-emerald-700 disabled:opacity-50 transition-colors">
                      {importing ? 'Importing…' : `Import ${importPreview.valid.length} Products`}
                    </button>
                    <button onClick={() => { setImportPreview(null); setShowImport(false); if (fileInputRef.current) fileInputRef.current.value = '' }} className="px-4 py-2 rounded-xl border border-gray-200 text-sm font-medium text-gray-600 hover:bg-gray-50 transition-colors">
                      Cancel
                    </button>
                  </div>
                </>
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
              <div className="mt-2 flex items-center gap-2">
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
                <span className="text-xs text-gray-400">or paste URL manually</span>
              </div>
              <div className="mt-2 w-16 h-16 rounded-lg border border-gray-100 overflow-hidden bg-gray-50">
                <img src={formData.image_url || MARKET_LOGO_PLACEHOLDER} alt="Preview" className="w-full h-full object-cover" />
              </div>
            </div>
            <div className="flex gap-2 pt-1">
              <button type="submit" className="px-5 py-2.5 rounded-xl bg-[#000080] text-white text-sm font-semibold hover:bg-[#1F51FF] transition-colors">
                {editingProduct ? 'Update Product' : 'Add Product'}
              </button>
              <button type="button" onClick={() => { setShowForm(false); setEditingProduct(null); setFormData({ name: '', price: '', quantity: '', image_url: '' }) }} className="px-5 py-2.5 rounded-xl border border-gray-200 text-sm font-medium text-gray-600 hover:bg-gray-50 transition-colors">
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
                  <p className="text-lg font-bold text-[#000080]">{product.price}K L.L</p>
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
