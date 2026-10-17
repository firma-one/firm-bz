import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, act } from '@testing-library/react'
import { ToastProvider, useToast, type Toast } from './toast'

/** A button per toast to raise, so each test can add toasts the way the app does. */
function Raise({ toasts }: { toasts: Omit<Toast, 'id'>[] }) {
  const { addToast } = useToast()
  return <>{toasts.map((t) => <button key={t.title} onClick={() => addToast(t)}>raise {t.title}</button>)}</>
}

function SecondRaise({ onUndo }: { onUndo: () => void }) {
  const { addToast } = useToast()
  return <button onClick={() => addToast({ type: 'success', title: 'Moved to Bin', message: 'b.pdf moved', action: { label: 'Undo', onClick: onUndo } })}>raise second</button>
}

const renderWith = (...toasts: Omit<Toast, 'id'>[]) =>
  render(<ToastProvider><Raise toasts={toasts} /></ToastProvider>)

const raise = (title: string) => fireEvent.click(screen.getByRole('button', { name: `raise ${title}` }))
const region = () => screen.queryByRole('region', { name: 'Notifications' })
const live = (politeness: 'polite' | 'assertive') => document.querySelector(`[aria-live="${politeness}"]`)!

beforeEach(() => vi.useFakeTimers())
afterEach(() => vi.useRealTimers())

describe('Toast', () => {
  it('announces a success politely and closes it after its duration', () => {
    renderWith({ type: 'success', title: 'Saved', message: 'Your changes are in.' })
    raise('Saved')
    expect(region()?.textContent).toContain('Saved')
    expect(live('polite').textContent).toBe('Saved. Your changes are in.')
    expect(live('assertive').textContent).toBe('')
    act(() => { vi.advanceTimersByTime(8000) })
    expect(region()).toBeNull()
  })

  it('announces a failure at once and keeps it until dismissed', () => {
    renderWith({ type: 'error', title: 'Upload failed' })
    raise('Upload failed')
    expect(live('assertive').textContent).toBe('Upload failed')
    act(() => { vi.advanceTimersByTime(60_000) })
    expect(region()?.textContent).toContain('Upload failed')
    fireEvent.click(screen.getByRole('button', { name: 'Dismiss' }))
    expect(region()).toBeNull()
  })

  it('waits while the pointer is on it, then takes the rest of its time', () => {
    renderWith({ type: 'info', title: 'Moved', duration: 4000 })
    raise('Moved')
    act(() => { vi.advanceTimersByTime(3000) })
    fireEvent.mouseEnter(region()!)
    act(() => { vi.advanceTimersByTime(10_000) })
    expect(region()).not.toBeNull()
    fireEvent.mouseLeave(region()!)
    act(() => { vi.advanceTimersByTime(900) })
    expect(region()).not.toBeNull()
    act(() => { vi.advanceTimersByTime(100) })
    expect(region()).toBeNull()
  })

  it('runs its action and closes', () => {
    const undo = vi.fn()
    renderWith({ type: 'success', title: 'Moved to Done', action: { label: 'Undo', onClick: undo } })
    raise('Moved to Done')
    fireEvent.click(screen.getByRole('button', { name: 'Undo' }))
    expect(undo).toHaveBeenCalledTimes(1)
    expect(region()).toBeNull()
  })

  it('has no action button unless one is given', () => {
    renderWith({ type: 'success', title: 'Link copied' })
    raise('Link copied')
    expect(screen.getAllByRole('button').map((b) => b.textContent || b.getAttribute('aria-label'))).toEqual(['raise Link copied', 'Dismiss'])
  })

  it('a newer toast with the same title replaces the older one', () => {
    const first = vi.fn()
    const second = vi.fn()
    render(
      <ToastProvider>
        <Raise toasts={[
          { type: 'success', title: 'Moved to Bin', message: 'a.pdf moved', action: { label: 'Undo', onClick: first } },
        ]} />
        <SecondRaise onUndo={second} />
      </ToastProvider>
    )
    raise('Moved to Bin')
    fireEvent.click(screen.getByRole('button', { name: 'raise second' }))
    expect(region()!.textContent).toContain('b.pdf moved')
    expect(region()!.textContent).not.toContain('a.pdf moved')
    fireEvent.click(screen.getByRole('button', { name: 'Undo' }))
    expect(second).toHaveBeenCalled()
    expect(first).not.toHaveBeenCalled()
  })

  it('sits beside the docked panes', () => {
    renderWith({ type: 'success', title: 'Saved' })
    raise('Saved')
    expect(region()!.style.right).toContain('var(--right-pane-dock-width, 0px)')
    expect(region()!.style.right).toContain('var(--ai-chat-dock-width, 0px)')
  })
})
