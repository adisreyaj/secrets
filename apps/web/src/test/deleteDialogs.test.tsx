import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { DeleteEnvironmentDialog } from '../components/environment/DeleteEnvironmentDialog'
import { DeleteProjectDialog } from '../components/projects/DeleteProjectDialog'

describe('delete dialogs', () => {
  it('requires exact project name before enabling delete action', () => {
    const onConfirm = vi.fn(async () => {})

    render(
      <DeleteProjectDialog
        open
        projectName="Alpha"
        deleting={false}
        error={null}
        onOpenChange={() => {}}
        onConfirm={onConfirm}
      />,
    )

    const deleteButton = screen.getByRole('button', { name: 'Delete project' })
    expect(deleteButton).toHaveProperty('disabled', true)

    fireEvent.change(screen.getByPlaceholderText('Alpha'), {
      target: { value: 'Alpha' },
    })

    expect(deleteButton).toHaveProperty('disabled', false)
    fireEvent.click(deleteButton)
    expect(onConfirm).toHaveBeenCalledWith('Alpha')
  })

  it('requires explicit last-environment acknowledgement', () => {
    const onConfirm = vi.fn(async () => {})

    render(
      <DeleteEnvironmentDialog
        open
        environmentName="prod"
        isLastEnvironment
        deleting={false}
        error={null}
        onOpenChange={() => {}}
        onConfirm={onConfirm}
      />,
    )

    const deleteButton = screen.getByRole('button', {
      name: 'Delete environment',
    })

    fireEvent.change(screen.getByPlaceholderText('prod'), {
      target: { value: 'prod' },
    })
    expect(deleteButton).toHaveProperty('disabled', true)

    fireEvent.click(
      screen.getByRole('checkbox', {
        name: /I understand this will remove the final environment/i,
      }),
    )

    expect(deleteButton).toHaveProperty('disabled', false)
    fireEvent.click(deleteButton)

    expect(onConfirm).toHaveBeenCalledWith({
      confirmText: 'prod',
      forceLastEnvironment: true,
    })
  })
})
