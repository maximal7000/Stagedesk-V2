import { useEffect, useId, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { FileText, Hourglass, ImageOff, Trash2, Upload } from 'lucide-react'
import { toast } from 'sonner'
import { PageHeader, Button, EmptyState, StatusBadge } from '../../../ui'
import { useUser } from '../../../../contexts/UserContext'
import SidePanel from '../shared/SidePanel'
import ConfirmDialog from '../shared/ConfirmDialog'
import UndoToast from '../shared/UndoToast'
import { useMediaFiles } from '../shared/useMediaFiles'
import { errorText } from '../shared/errorText'
import { fileMeta, mediaStatus, uploadKind, uploadProblem } from './mediaData'
import * as api from '../shared/api'

// Running uploads carry their own number: two files with the same name stay apart
let uploadSeq = 0

const STATUS_TONE = { processing: 'info', ready: 'positive', failed: 'danger' }

function StatusLine({ file }) {
  const status = mediaStatus(file)
  if (file.status === 'failed') return <p className="text-xs text-bad line-clamp-2" data-media-status="failed">{status}</p>
  return <span data-media-status={file.status}><StatusBadge label={status} tone={STATUS_TONE[file.status] ?? 'neutral'} dot /></span>
}

function Thumb({ url, orientation, status, name, className = '' }) {
  return (
    <div className={`relative bg-raised rounded-md overflow-hidden flex items-center justify-center ${className}`}>
      {url ? (
        <img src={url} alt="" className={`max-w-full max-h-full ${orientation === 'portrait' ? 'h-full' : 'w-full'} object-contain`} />
      ) : status === 'processing' ? (
        <Hourglass className="w-6 h-6 text-fg-subtle" aria-label={`${name} wird vorbereitet`} />
      ) : status === 'failed' ? (
        <ImageOff className="w-6 h-6 text-fg-subtle" aria-hidden="true" />
      ) : (
        <FileText className="w-6 h-6 text-fg-subtle" aria-hidden="true" />
      )}
    </div>
  )
}

function Tile({ file, onOpen }) {
  return (
    <li data-media={file.id}>
      <button type="button" onClick={onOpen}
        className="w-full text-left bg-surface rounded-lg p-3 hover:bg-raised transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-accent">
        <Thumb url={file.first_page_url} orientation={file.orientation} status={file.status} name={file.name} className="aspect-video" />
        <div className="mt-3 text-sm font-semibold text-fg truncate">{file.name}</div>
        <div className="text-xs text-fg-muted mt-0.5">{fileMeta(file)}</div>
        <div className="mt-2 min-h-5"><StatusLine file={file} /></div>
      </button>
    </li>
  )
}

function DetailPanel({ file, detail, error, canOpenViews, onClose, onDelete }) {
  const pages = detail?.pages ?? []
  return (
    <SidePanel eyebrow="Datei" title={file.name} onClose={onClose} width="max-w-2xl" data-media-panel
      footer={(
        <>
          <Button variant="danger" icon={Trash2} onClick={onDelete}>In den Papierkorb</Button>
          <span className="flex-1" />
          <Button variant="ghost" onClick={onClose}>Schließen</Button>
        </>
      )}>
      <div className="space-y-6">
        <div>
          <div className="text-sm text-fg-muted">{fileMeta(detail ?? file)}</div>
          <div className="mt-2"><StatusLine file={detail ?? file} /></div>
        </div>
        <section>
          <h3 className="text-sm font-medium text-fg mb-2">Verwendet in</h3>
          {error ? (
            <p className="text-sm text-bad">Details konnten nicht geladen werden. {errorText(error, '')}</p>
          ) : !detail ? null : detail.used_in.length ? (
            <ul className="space-y-1">
              {detail.used_in.map((u) => (
                <li key={u.view_id} className="text-sm">
                  {canOpenViews ? (
                    <Link to={`/signage-admin/views/${u.view_id}`} className="text-fg hover:underline underline-offset-2 focus:outline-none focus-visible:underline">{u.name}</Link>
                  ) : <span className="text-fg">{u.name}</span>}
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-fg-subtle">In keiner Ansicht. Medien-Ansichten wählen ihre Dateien unter Ansichten.</p>
          )}
        </section>
        <section>
          <h3 className="text-sm font-medium text-fg mb-2">Seiten</h3>
          {pages.length ? (
            <ul className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              {pages.map((p) => (
                <li key={p.index}>
                  <Thumb url={p.url} orientation={p.orientation} status="ready" name={`Seite ${p.index + 1}`}
                    className={p.orientation === 'portrait' ? 'aspect-[3/4]' : 'aspect-video'} />
                  <div className="text-xs text-fg-muted mt-1">Seite {p.index + 1} · {p.orientation === 'portrait' ? 'Hochformat' : 'Querformat'}</div>
                </li>
              ))}
            </ul>
          ) : detail ? (
            <p className="text-sm text-fg-subtle">
              {detail.status === 'processing' ? 'Die Seiten werden gerade vorbereitet.' : 'Keine Seiten vorhanden.'}
            </p>
          ) : null}
        </section>
      </div>
    </SidePanel>
  )
}

export default function Media() {
  const { hasPermission } = useUser()
  const { files, error, reload, polling } = useMediaFiles()
  const inputId = useId()
  const inputRef = useRef(null)
  const [dragOver, setDragOver] = useState(false)
  const [uploading, setUploading] = useState([])
  const [openId, setOpenId] = useState(null)
  const [detail, setDetail] = useState(null)
  const [detailError, setDetailError] = useState(null)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [deleted, setDeleted] = useState(null)

  const openFile = files?.find((f) => f.id === openId) ?? null
  const openStatus = openFile?.status

  // Load the detail on open and again when its status in the list changes (processing finished)
  useEffect(() => {
    if (openId == null) return undefined
    let alive = true
    api.getFile(openId)
      .then((d) => { if (alive) { setDetail(d); setDetailError(null) } })
      .catch((e) => { if (alive) setDetailError(e) })
    return () => { alive = false }
  }, [openId, openStatus])

  const show = (id) => {
    setDetail(null)
    setDetailError(null)
    setOpenId(id)
  }
  const closePanel = () => {
    setOpenId(null)
    setDetail(null)
  }

  const upload = async (list) => {
    const chosen = [...list]
    for (const file of chosen) {
      const problem = uploadProblem(file)
      if (problem) {
        toast.error(problem)
        continue
      }
      const entry = { id: ++uploadSeq, name: file.name }
      setUploading((u) => [...u, entry])
      try {
        await api.uploadFile(file, { name: file.name.replace(/\.[^.]+$/, ''), kind: uploadKind(file) })
      } catch (e) {
        toast.error(`„${file.name}“ wurde nicht hochgeladen. ${errorText(e)}`)
      }
      setUploading((u) => u.filter((x) => x.id !== entry.id))
    }
    await reload()
  }

  const onDrop = (e) => {
    e.preventDefault()
    setDragOver(false)
    if (e.dataTransfer?.files?.length) upload(e.dataTransfer.files)
  }

  const trash = async () => {
    const target = openFile
    try {
      await api.deleteFile(target.id)
      setConfirmDelete(false)
      closePanel()
      setDeleted({ id: target.id, name: target.name })
      await reload()
    } catch (e) {
      toast.error(errorText(e))
    }
  }

  const askDelete = () => {
    if (detail?.used_in?.length) setConfirmDelete(true)
    else trash()
  }

  const undoDelete = async () => {
    try {
      await api.restoreFromTrash('media', deleted.id)
      toast.success(`„${deleted.name}“ ist wiederhergestellt.`)
      await reload()
    } catch (e) {
      toast.error(errorText(e))
    }
  }

  const state = error && !files ? 'error' : files ? 'ready' : 'loading'
  const count = files ? (files.length === 1 ? '1 Datei' : `${files.length} Dateien`) : null

  return (
    <div data-admin-page="media" data-state={state} data-polling={polling ? '' : undefined}>
      <PageHeader title="Medien" meta={count}
        actions={<Button variant="primary" icon={Upload} onClick={() => inputRef.current?.click()}>Datei hochladen</Button>} />
      <input ref={inputRef} id={inputId} type="file" multiple accept="application/pdf,image/*" className="sr-only" tabIndex={-1}
        aria-label="Datei wählen" onChange={(e) => { upload(e.target.files); e.target.value = '' }} />

      <div onDragOver={(e) => { e.preventDefault(); setDragOver(true) }} onDragLeave={() => setDragOver(false)} onDrop={onDrop}
        data-dropzone data-drag-over={dragOver ? '' : undefined}
        className={`rounded-lg border-2 border-dashed px-6 py-8 text-center transition-colors ${dragOver ? 'border-accent bg-raised' : 'border-line bg-surface'}`}>
        <Upload className="w-6 h-6 text-fg-subtle mx-auto mb-3" aria-hidden="true" />
        <p className="text-sm text-fg">
          Dateien hierher ziehen oder{' '}
          <button type="button" onClick={() => inputRef.current?.click()} className="text-accent-fg font-medium hover:underline underline-offset-2 focus:outline-none focus-visible:underline">
            Datei wählen
          </button>
        </p>
        <p className="text-xs text-fg-subtle mt-1">PDF oder Bild, höchstens 50 MB und 50 Seiten pro Datei. Jede Seite wird für 4K vorbereitet.</p>
        {uploading.length > 0 && (
          <ul className="text-sm text-fg-muted mt-3" role="status" aria-label="Lädt hoch">
            {uploading.map((u) => <li key={u.id}>Lädt hoch: {u.name}</li>)}
          </ul>
        )}
      </div>

      <div className="mt-6">
        {error && !files ? (
          <div className="bg-surface rounded-lg px-4 py-3 text-sm text-bad">
            Medien konnten nicht geladen werden. {errorText(error, '')}
          </div>
        ) : files && files.length === 0 ? (
          <div className="bg-surface rounded-lg"><EmptyState icon={FileText} title="Noch keine Dateien" /></div>
        ) : files ? (
          <ul className="grid gap-4 grid-cols-2 md:grid-cols-3 xl:grid-cols-4">
            {files.map((f) => <Tile key={f.id} file={f} onOpen={() => show(f.id)} />)}
          </ul>
        ) : null}
      </div>

      {openFile && (
        <DetailPanel file={openFile} detail={detail} error={detailError} canOpenViews={hasPermission('signage.setup')}
          onClose={closePanel} onDelete={askDelete} />
      )}
      {confirmDelete && openFile && (
        <ConfirmDialog title={`„${openFile.name}“ in den Papierkorb legen?`} tone="danger" confirmLabel="In den Papierkorb"
          body={`Die Datei wird in ${detail.used_in.length === 1 ? 'einer Ansicht' : `${detail.used_in.length} Ansichten`} verwendet und fehlt dort danach.`}
          onConfirm={trash} onCancel={() => setConfirmDelete(false)} />
      )}
      {deleted && (
        <UndoToast key={deleted.id} message={`„${deleted.name}“ ist im Papierkorb.`} onUndo={undoDelete} onClose={() => setDeleted(null)} />
      )}
    </div>
  )
}
