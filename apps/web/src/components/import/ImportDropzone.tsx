import { useState } from 'react'

export const ImportDropzone = ({
  fileName,
  onFileSelected,
}: {
  fileName: string
  onFileSelected: (file: File) => void
}) => {
  const [dragging, setDragging] = useState(false)

  return (
    <div
      className={`bg-secondary relative flex items-center justify-center rounded-2xl border border-dashed px-4 py-6 text-xs transition ${
        dragging
          ? 'border-emerald-400 bg-emerald-50 text-emerald-700'
          : 'border-border text-muted-foreground'
      }`}
      onDragOver={(event) => {
        event.preventDefault()
        setDragging(true)
      }}
      onDragLeave={() => setDragging(false)}
      onDrop={(event) => {
        event.preventDefault()
        setDragging(false)
        const file = event.dataTransfer.files?.[0]
        if (file) {
          onFileSelected(file)
        }
      }}
    >
      <input
        type="file"
        accept=".env,.env.*"
        onChange={(event) => {
          const file = event.target.files?.[0]
          if (file) {
            onFileSelected(file)
          }
        }}
        className="absolute inset-0 cursor-pointer opacity-0"
      />
      <div className="grid gap-2 text-center">
        <span className="text-foreground/90 text-base font-semibold tracking-normal normal-case">
          Choose a file or drag it here
        </span>
        <span className="text-muted-foreground text-xs">
          {fileName || 'Drop your .env to auto-fill'}
        </span>
      </div>
    </div>
  )
}
