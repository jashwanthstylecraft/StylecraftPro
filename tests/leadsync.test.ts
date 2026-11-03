import { describe, it, expect, beforeEach, vi } from 'vitest'

// Minimal browser storage so the lead store can run under Node.
const mem = new Map<string, string>()
vi.stubGlobal('localStorage', {
  getItem: (k: string) => mem.get(k) ?? null, setItem: (k: string, v: string) => void mem.set(k, v),
  removeItem: (k: string) => void mem.delete(k), clear: () => mem.clear(),
})

const { LeadStore, newLead } = await import('../src/data/leads')

describe('syncPending', () => {
  beforeEach(() => { LeadStore.all.set([]) })

  it('sends only unsent leads and marks them sent', async () => {
    LeadStore.save(newLead({ name: 'A' }))
    LeadStore.save({ ...newLead({ name: 'B' }), sent: true })
    const send = vi.fn().mockResolvedValue({ kind: 'ok' })
    expect(await LeadStore.syncPending([], send)).toBe(1)
    expect(send.mock.calls[0][0].map((l: { name: string }) => l.name)).toEqual(['A'])
    expect(LeadStore.all.get().every(l => l.sent)).toBe(true)
  })

  it('keeps leads unsent when the send fails or throws', async () => {
    LeadStore.save(newLead({ name: 'A' }))
    expect(await LeadStore.syncPending([], vi.fn().mockResolvedValue({ kind: 'failed' }))).toBe(0)
    expect(await LeadStore.syncPending([], vi.fn().mockRejectedValue(new Error('x')))).toBe(0)
    expect(LeadStore.all.get()[0].sent).toBe(false)
  })

  it('does nothing when there is nothing to send', async () => {
    const send = vi.fn()
    expect(await LeadStore.syncPending([], send)).toBe(0)
    expect(send).not.toHaveBeenCalled()
  })
})
