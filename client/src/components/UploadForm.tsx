import { useRef, useState } from 'react'
import { uploadPdf } from '../api'

const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']

interface Props {
  serverUrl: string
  onUploaded: (id: string) => void
}

export function UploadForm({ serverUrl, onUploaded }: Props) {
  const fileRef = useRef<HTMLInputElement>(null)
  const [fileLabel, setFileLabel] = useState('')
  const [uploading, setUploading] = useState(false)
  const [showSettings, setShowSettings] = useState(false)
  const [srvUrl, setSrvUrl] = useState(serverUrl || 'http://localhost:8000/v1')

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const files = fileRef.current?.files
    if (!files || files.length === 0) return alert('Select a file')

    setUploading(true)
    const fd = new FormData(e.currentTarget)
    fd.delete('file')
    for (const file of Array.from(files)) {
      fd.append('file', file)
    }
    fd.set('server_url', srvUrl)
    try {
      const { id } = await uploadPdf(fd)
      onUploaded(id)
      setFileLabel('')
      if (fileRef.current) fileRef.current.value = ''
    } catch (err) {
      alert('Upload failed')
    } finally {
      setUploading(false)
    }
  }

  return (
    <div className="border-b border-gray-100 p-4">
      <div className="mb-2.5 text-[10px] font-bold uppercase tracking-wide text-gray-400">
        New Upload
      </div>
      <form onSubmit={handleSubmit}>
        <div className="mb-2 flex gap-2">
          <div className="flex-1">
            <label className="mb-0.5 block text-[11px] font-semibold text-gray-500">Company</label>
            <select name="company" className="w-full rounded border border-gray-300 px-2 py-1.5 text-sm">
              <option value="schneider">Schneider</option>
              <option value="legrand">Legrand</option>
              <option value="siemens">Siemens</option>
            </select>
          </div>
          <div className="flex-1">
            <label className="mb-0.5 block text-[11px] font-semibold text-gray-500">Year</label>
            <input type="number" name="year" defaultValue={2025} min={2020} max={2030}
              className="w-full rounded border border-gray-300 px-2 py-1.5 text-sm" />
          </div>
          <div className="flex-1">
            <label className="mb-0.5 block text-[11px] font-semibold text-gray-500">Month</label>
            <select name="month" defaultValue={7} className="w-full rounded border border-gray-300 px-2 py-1.5 text-sm">
              {MONTHS.map((m, i) => <option key={i} value={i + 1}>{m}</option>)}
            </select>
          </div>
        </div>

        <label className="mb-2 flex cursor-pointer items-center justify-center rounded-md border-2 border-dashed border-gray-300 p-3.5 text-sm text-gray-400 transition-colors hover:border-blue-400">
          <input ref={fileRef} type="file" name="file" accept=".pdf,.png,.jpg,.jpeg" multiple className="hidden"
            onChange={(e) => {
              const files = e.target.files
              if (!files || files.length === 0) setFileLabel('')
              else if (files.length === 1) setFileLabel(files[0].name)
              else setFileLabel(`${files.length} files selected`)
            }} />
          {fileLabel
            ? <span className="font-semibold text-gray-900">{fileLabel}</span>
            : 'Drop PDF or images'}
        </label>

        <button type="submit" disabled={uploading}
          className="w-full rounded bg-blue-500 py-2 text-sm font-semibold text-white transition-colors hover:bg-blue-600 disabled:bg-blue-300">
          {uploading ? 'Uploading...' : 'Upload & Parse'}
        </button>
      </form>

      <button onClick={() => setShowSettings(!showSettings)}
        className="mt-1.5 text-[11px] text-blue-500 hover:underline">
        Settings {showSettings ? '▴' : '▾'}
      </button>
      {showSettings && (
        <div className="mt-2">
          <label className="mb-0.5 block text-[11px] font-semibold text-gray-500">Parse Server URL</label>
          <input type="text" value={srvUrl} onChange={(e) => setSrvUrl(e.target.value)}
            className="w-full rounded border border-gray-300 px-2 py-1.5 text-sm" />
        </div>
      )}
    </div>
  )
}
