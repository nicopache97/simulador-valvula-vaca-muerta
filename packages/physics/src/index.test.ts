import { describe, expect, it } from 'vitest'
import { PHYSICS_SAMPLE_RATE_HZ } from './index'

describe('packages/physics placeholder', () => {
  it('expone la frecuencia de muestreo del motor (100 Hz)', () => {
    expect(PHYSICS_SAMPLE_RATE_HZ).toBe(100)
  })
})
