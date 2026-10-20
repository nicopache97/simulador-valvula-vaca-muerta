import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import App from '../src/App'

describe('App', () => {
  it('renderiza el título y la versión v0.1.0', () => {
    render(<App />)
    expect(
      screen.getByRole('heading', { name: /simulador vaca muerta/i }),
    ).toBeInTheDocument()
    expect(screen.getByText('v0.1.0')).toBeInTheDocument()
  })
})
