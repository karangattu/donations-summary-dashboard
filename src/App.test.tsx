import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import App from './App'
import Papa from 'papaparse'

vi.mock('papaparse', () => ({
  default: {
    parse: vi.fn()
  }
}))

describe('Donations Summary Dashboard', () => {
  it('renders initial upload state correctly', () => {
    render(<App />)
    expect(screen.getByText('No data uploaded')).toBeInTheDocument()
  })

  it('updates state after a successful file upload', async () => {
    render(<App />)
    const file = new File(['test'], 'test.csv', { type: 'text/csv' })
    const input = screen.getByLabelText(/Upload CSV/i)

    const PapaMock = vi.mocked(Papa.parse)
    PapaMock.mockImplementation((_f: any, config: any): any => {
      if (config.complete) {
        config.complete({
          data: [
            { 'Contact ID': '1', 'Transaction Date': '4/1/2026', 'Transaction Amount Subtotal': '$100.00' },
            { 'Contact ID': '2', 'Transaction Date': '4/2/2026', 'Transaction Amount Subtotal': '$25.00' }
          ],
          errors: [], meta: {}
        })
      }
    })

    fireEvent.change(input, { target: { files: [file] } })

    await waitFor(() => {
       expect(screen.getByText('Total Donors')).toBeInTheDocument()
       expect(screen.getByText('Change CSV')).toBeInTheDocument()
    })
  })
})
