import { useRegisterShortcut } from './shortcuts'

export const useRegisterProjectSelectionShortcuts = (
  onSelectIndex: (index: number) => void,
) => {
  useRegisterShortcut('1', () => onSelectIndex(0))
  useRegisterShortcut('2', () => onSelectIndex(1))
  useRegisterShortcut('3', () => onSelectIndex(2))
  useRegisterShortcut('4', () => onSelectIndex(3))
  useRegisterShortcut('5', () => onSelectIndex(4))
  useRegisterShortcut('6', () => onSelectIndex(5))
  useRegisterShortcut('7', () => onSelectIndex(6))
  useRegisterShortcut('8', () => onSelectIndex(7))
  useRegisterShortcut('9', () => onSelectIndex(8))
}
