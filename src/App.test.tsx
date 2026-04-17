import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import App from './App'
import Papa from 'papaparse'

// Mock papaparse
vi.mock('papaparse', () => ({
  default: {
    parse: vi.fn()
  }
}))

describe('Donations Summary Dashboard', () => {
  it('renders initial upload state correctly', () => {
    render(<App />)
    expect(screen.getByText('No data uploaded')).toBeInTheDocument()
    expect(screen.getByText('Upload a CSV file containing your donation records to view your dashboard.')).toBeInTheDocument()
  })

  it('updates state after a successful file upload', async () => {
    render(<App />)

    const file = new File(['header,value\ntest,100'], 'test.csv', { type: 'text/csv' })

    const input = screen.getByLabelText(/Upload CSV/i)

    // Override Papa.parse implementation for this test
    const PapaMock = vi.mocked(Papa.parse)
    PapaMock.mockImplementation((file, config) => {
      if (config.complete) {
        config.complete({
          data: [
            {
              'Contact ID': '101',
              'Transaction Date': '4/1/2026',
              'Transaction Amount Subtotal': '$100.00',
              'First Name': 'John',
              'Last Name': 'Doe',
              'Email': 'john@example.com'
            },
            {
               'Contact ID': '102',
               'Transaction Date': '4/2/2026',
               'Transaction Amount Subtotal': '$25.00',
               'First Name': 'Jane',
               'Last Name': 'Doe',
               'Email': 'jane@example.com'
            }
          ],
          errors: [],
          meta: { delimiter: ',', linebreak: '\n', aborted: false, truncated: false, cursor: 0 }
        })
      }
      return Papa
    })

    fireEvent.change(input, { target: { files: [file] } })

    // UI should switch to the dashboard view
    await waitFor(() => {
       expect(screen.getByText('Total Donors')).toBeInTheDocument()
       expect(screen.getByText('2')).toBeInTheDocument() // 2 unique donors
       expect(screen.getByText('Median Donation')).toBeInTheDocument()
       // Median between 25 and 100 is 62.50
       expect(screen.getByText('$62.50')).toBeInTheDocument()
       expect(screen.getByText('Total Gifts')).toBeInTheDocument()
       expect(screen.getByText('Change CSV')).toBeInTheDocument()
    })
  })
})
