import { json } from '@codemirror/lang-json'
import { placeholder as placeholderExtension } from '@codemirror/view'
import { oneDark } from '@codemirror/theme-one-dark'
import CodeMirror from '@uiw/react-codemirror'
import * as React from 'react'

import { useTheme } from '../../lib/theme'
import { cn } from '../../lib/utils'

type JsonCodeEditorProps = {
  id?: string
  value: string
  onChange: (value: string) => void
  placeholder?: string
  className?: string
  disabled?: boolean
}

const JsonCodeEditor = ({
  id,
  value,
  onChange,
  placeholder,
  className,
  disabled,
}: JsonCodeEditorProps) => {
  const { resolvedTheme } = useTheme()
  const extensions = React.useMemo(
    () => [json(), ...(placeholder ? [placeholderExtension(placeholder)] : [])],
    [placeholder],
  )

  return (
    <div
      className={cn(
        'border-input bg-background focus-within:ring-ring min-h-40 overflow-hidden rounded-md border transition-colors focus-within:ring-1',
        disabled ? 'cursor-not-allowed opacity-50' : null,
      )}
    >
      <CodeMirror
        id={id}
        value={value}
        onChange={onChange}
        editable={!disabled}
        theme={resolvedTheme === 'dark' ? oneDark : 'light'}
        basicSetup={{
          lineNumbers: false,
          foldGutter: false,
          highlightActiveLine: false,
          highlightActiveLineGutter: false,
        }}
        extensions={extensions}
        className={cn(
          'h-full min-h-40 [&_.cm-content]:min-h-full [&_.cm-content]:p-3 [&_.cm-content]:font-mono [&_.cm-content]:text-xs [&_.cm-content]:leading-5 [&_.cm-editor]:h-full [&_.cm-editor]:min-h-40 [&_.cm-editor]:bg-transparent [&_.cm-editor]:outline-none [&_.cm-gutters]:hidden [&_.cm-line]:px-0 [&_.cm-scroller]:h-full [&_.cm-scroller]:min-h-40 [&_.cm-scroller]:font-mono [&_.cm-scroller]:text-xs',
          className,
        )}
      />
    </div>
  )
}

export { JsonCodeEditor }
