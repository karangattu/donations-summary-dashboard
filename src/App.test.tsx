import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react'
import App from './App'
import Papa from 'papaparse'

type DonationRow = Record<string, string>
const parseMeta: Papa.ParseMeta = {
  delimiter: ',',
  linebreak: '\n',
  aborted: false,
  truncated: false,
  cursor: 0
}

vi.mock('papaparse', () => ({
  default: {
    parse: vi.fn()
  }
}))

describe('Donations Summary Dashboard', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('renders initial upload state correctly', () => {
    render(<App />)
    expect(screen.getByText('No data uploaded')).toBeInTheDocument()
  })

  it('updates state after a successful file upload', async () => {
    render(<App />)
    const file = new File(['test'], 'test.csv', { type: 'text/csv' })
    const input = screen.getByLabelText(/Upload CSV/i)

    const PapaMock = vi.mocked(Papa.parse as unknown as (file: File, config: Papa.ParseConfig<DonationRow>) => void)
    PapaMock.mockImplementation((_file: File, config: Papa.ParseConfig<DonationRow>) => {
      if (config.complete) {
        config.complete({
          data: [
            { 'Contact ID': '1', 'Transaction Date': '4/1/2026', 'Transaction Amount Subtotal': '$100.00' },
            { 'Contact ID': '2', 'Transaction Date': '4/2/2026', 'Transaction Amount Subtotal': '$25.00' }
          ],
          errors: [], meta: parseMeta
        }, undefined)
      }
    })

    fireEvent.change(input, { target: { files: [file] } })

    await waitFor(() => {
       expect(screen.getByText('Total Donors')).toBeInTheDocument()
       expect(screen.getByText('Change CSVs')).toBeInTheDocument()
    })
  })

  it('aggregates donations from multiple monthly CSV files into one year view', async () => {
    render(<App />)
    const marchFile = new File(['march'], 'march.csv', { type: 'text/csv' })
    const aprilFile = new File(['april'], 'april.csv', { type: 'text/csv' })
    const input = screen.getByLabelText(/Upload CSV/i)

    const PapaMock = vi.mocked(Papa.parse as unknown as (file: File, config: Papa.ParseConfig<DonationRow>) => void)
    PapaMock.mockImplementation((file: File, config: Papa.ParseConfig<DonationRow>) => {
      if (!config.complete) return

      config.complete({
        data: file.name === 'march.csv'
          ? [
              { 'Contact ID': '1', 'Transaction Date': '3/1/2026', 'Transaction Amount Subtotal': '$100.00', 'First Name': 'A', 'Last Name': 'Donor' },
              { 'Contact ID': '2', 'Transaction Date': '3/2/2026', 'Transaction Amount Subtotal': '$25.00', 'First Name': 'B', 'Last Name': 'Donor' }
            ]
          : [
              { 'Contact ID': '1', 'Transaction Date': '4/1/2026', 'Transaction Amount Subtotal': '$50.00', 'First Name': 'A', 'Last Name': 'Donor' }
            ],
        errors: [], meta: parseMeta
      }, undefined)
    })

    fireEvent.change(input, { target: { files: [marchFile, aprilFile] } })

    await waitFor(() => {
      expect(screen.getAllByText('$175.00').length).toBeGreaterThan(0)
      expect(within(screen.getByText('Total Gifts').parentElement!).getByText('3')).toBeInTheDocument()
      expect(within(screen.getByText('Total Donors').parentElement!).getByText('2')).toBeInTheDocument()
      expect(screen.getByText('Donor Investigation Table')).toBeInTheDocument()
    })
  })

  it('shows year-to-date months in the visible giving trend when months have no gifts', async () => {
    render(<App />)
    const marchFile = new File(['march'], 'march.csv', { type: 'text/csv' })
    const mayFile = new File(['may'], 'may.csv', { type: 'text/csv' })
    const input = screen.getByLabelText(/Upload CSV/i)
    const currentYear = new Date().getFullYear()
    const currentMonth = new Date().getMonth()
    const currentMonthName = [
      'January',
      'February',
      'March',
      'April',
      'May',
      'June',
      'July',
      'August',
      'September',
      'October',
      'November',
      'December'
    ][currentMonth]

    const PapaMock = vi.mocked(Papa.parse as unknown as (file: File, config: Papa.ParseConfig<DonationRow>) => void)
    PapaMock.mockImplementation((file: File, config: Papa.ParseConfig<DonationRow>) => {
      if (!config.complete) return

      config.complete({
        data: file.name === 'march.csv'
          ? [
              { 'Contact ID': '1', 'Transaction Date': `3/1/${currentYear}`, 'Transaction Amount Subtotal': '$100.00', 'First Name': 'A', 'Last Name': 'Donor' }
            ]
          : [
              { 'Contact ID': '2', 'Transaction Date': `${currentMonth + 1}/1/${currentYear}`, 'Transaction Amount Subtotal': '$50.00', 'First Name': 'B', 'Last Name': 'Donor' }
            ],
        errors: [], meta: parseMeta
      }, undefined)
    })

    fireEvent.change(input, { target: { files: [marchFile, mayFile] } })

    await waitFor(() => {
      expect(screen.getByText('January')).toBeInTheDocument()
      expect(screen.getByText(currentMonthName)).toBeInTheDocument()
    })
  })

  it('supports donor exports with Donation Amount fields and ignored numbered columns', async () => {
    render(<App />)
    const donorExport = new File(['donors'], '2026_Donors___Sheet1_anonymized.csv', { type: 'text/csv' })
    const input = screen.getByLabelText(/Upload CSV/i)

    const PapaMock = vi.mocked(Papa.parse as unknown as (file: File, config: Papa.ParseConfig<DonationRow>) => void)
    PapaMock.mockImplementation((_file: File, config: Papa.ParseConfig<DonationRow>) => {
      if (!config.complete) return

      config.complete({
        data: [
          { Donor: 'A1', 'Donation Date': '1/2/2026', 'Donation Amount': '$100.00', 'First Name': 'Ada', 'Last Name': 'One', _1: '', _82: '' },
          { Donor: 'B2', 'Donation Date': 'TBA', 'Donation Amount': '$25.00', 'First Name': 'Ben', 'Last Name': 'Two', _1: '', _82: '' },
          { Donor: 'A1', 'Donation Date': '4/7/2026', 'Donation Amount': '$50.00', 'First Name': 'Ada', 'Last Name': 'One', _1: '', _82: '' }
        ],
        errors: [], meta: parseMeta
      }, undefined)
    })

    fireEvent.change(input, { target: { files: [donorExport] } })

    await waitFor(() => {
      expect(screen.getAllByText('$175.00').length).toBeGreaterThan(0)
      expect(within(screen.getByText('Total Gifts').parentElement!).getByText('3')).toBeInTheDocument()
      expect(within(screen.getByText('Total Donors').parentElement!).getByText('2')).toBeInTheDocument()
      expect(screen.getByText('Ada One')).toBeInTheDocument()
    })
  })

  it('lets users filter the donor table by level and repeat donors', async () => {
    render(<App />)
    const donorExport = new File(['donors'], 'donors.csv', { type: 'text/csv' })
    const input = screen.getByLabelText(/Upload CSV/i)

    const PapaMock = vi.mocked(Papa.parse as unknown as (file: File, config: Papa.ParseConfig<DonationRow>) => void)
    PapaMock.mockImplementation((_file: File, config: Papa.ParseConfig<DonationRow>) => {
      if (!config.complete) return

      config.complete({
        data: [
          { Donor: 'M1', 'Donation Date': '1/2/2026', 'Donation Amount': '$1,200.00', 'First Name': 'Major', 'Last Name': 'One', City: 'San Jose' },
          { Donor: 'D2', 'Donation Date': '2/2/2026', 'Donation Amount': '$300.00', 'First Name': 'Mid', 'Last Name': 'Two', City: 'Oakland' },
          { Donor: 'D3', 'Donation Date': '3/2/2026', 'Donation Amount': '$150.00', 'First Name': 'Core', 'Last Name': 'Three', City: 'Palo Alto' },
          { Donor: 'D4', 'Donation Date': '4/2/2026', 'Donation Amount': '$25.00', 'First Name': 'Entry', 'Last Name': 'Four', City: 'Campbell' },
          { Donor: 'D4', 'Donation Date': '5/2/2026', 'Donation Amount': '$25.00', 'First Name': 'Entry', 'Last Name': 'Four', City: 'Campbell' }
        ],
        errors: [], meta: parseMeta
      }, undefined)
    })

    fireEvent.change(input, { target: { files: [donorExport] } })

    await waitFor(() => {
      expect(screen.getByText('Donor Investigation Table')).toBeInTheDocument()
      expect(screen.getByText('Major One')).toBeInTheDocument()
      expect(screen.getByText('Entry Four')).toBeInTheDocument()
    })

    fireEvent.click(screen.getByRole('button', { name: /Major donors/i }))

    await waitFor(() => {
      expect(screen.getByText('Major One')).toBeInTheDocument()
      expect(screen.queryByText('Entry Four')).not.toBeInTheDocument()
    })

    fireEvent.click(screen.getByRole('button', { name: /Repeat donors/i }))

    await waitFor(() => {
      expect(screen.getByText('Entry Four')).toBeInTheDocument()
      expect(screen.queryByText('Major One')).not.toBeInTheDocument()
    })
  })

  it('lets users change donor level thresholds dynamically', async () => {
    render(<App />)
    const donorExport = new File(['donors'], 'donors.csv', { type: 'text/csv' })
    const input = screen.getByLabelText(/Upload CSV/i)

    const PapaMock = vi.mocked(Papa.parse as unknown as (file: File, config: Papa.ParseConfig<DonationRow>) => void)
    PapaMock.mockImplementation((_file: File, config: Papa.ParseConfig<DonationRow>) => {
      if (!config.complete) return

      config.complete({
        data: [
          { Donor: 'M1', 'Donation Date': '1/2/2026', 'Donation Amount': '$1,200.00', 'First Name': 'Major', 'Last Name': 'One' },
          { Donor: 'D2', 'Donation Date': '2/2/2026', 'Donation Amount': '$300.00', 'First Name': 'Mid', 'Last Name': 'Two' }
        ],
        errors: [], meta: parseMeta
      }, undefined)
    })

    fireEvent.change(input, { target: { files: [donorExport] } })

    await waitFor(() => {
      expect(screen.getByText('Major One')).toBeInTheDocument()
      expect(screen.getByLabelText('Major minimum')).toHaveValue(1000)
    })

    fireEvent.change(screen.getByLabelText('Major minimum'), { target: { value: '1500' } })
    fireEvent.click(screen.getByRole('button', { name: /Major donors/i }))

    await waitFor(() => {
      expect(screen.getByText('No donors match the current filters.')).toBeInTheDocument()
      expect(screen.queryByText('Major One')).not.toBeInTheDocument()
    })

    fireEvent.click(screen.getByRole('button', { name: /Mid-level/i }))

    await waitFor(() => {
      expect(screen.getByText('Major One')).toBeInTheDocument()
      expect(screen.getByText('Mid Two')).toBeInTheDocument()
    })
  })

  it('copies a Google Sheets friendly monthly TSV summary', async () => {
    const writeText = vi.fn()
    Object.assign(navigator, {
      clipboard: { writeText }
    })
    vi.spyOn(window, 'alert').mockImplementation(() => {})

    render(<App />)
    const donorExport = new File(['donors'], 'donors.csv', { type: 'text/csv' })
    const input = screen.getByLabelText(/Upload CSV/i)
    const now = new Date()
    const currentYear = now.getFullYear()
    const currentMonth = now.getMonth()
    const donationRows = currentMonth === 0
      ? [
          { Donor: 'D1', 'Donation Date': `1/2/${currentYear}`, 'Donation Amount': '$100.00', 'First Name': 'One', 'Last Name': 'Donor' },
          { Donor: 'D2', 'Donation Date': `1/3/${currentYear}`, 'Donation Amount': '$50.00', 'First Name': 'Two', 'Last Name': 'Donor' }
        ]
      : [
          { Donor: 'D1', 'Donation Date': `1/2/${currentYear}`, 'Donation Amount': '$100.00', 'First Name': 'One', 'Last Name': 'Donor' },
          { Donor: 'D2', 'Donation Date': `${currentMonth + 1}/3/${currentYear}`, 'Donation Amount': '$50.00', 'First Name': 'Two', 'Last Name': 'Donor' }
        ]

    const PapaMock = vi.mocked(Papa.parse as unknown as (file: File, config: Papa.ParseConfig<DonationRow>) => void)
    PapaMock.mockImplementation((_file: File, config: Papa.ParseConfig<DonationRow>) => {
      if (!config.complete) return

      config.complete({
        data: donationRows,
        errors: [], meta: parseMeta
      }, undefined)
    })

    fireEvent.change(input, { target: { files: [donorExport] } })

    await waitFor(() => {
      expect(screen.getByText('Copy Sheet TSV')).toBeInTheDocument()
    })

    fireEvent.click(screen.getByText('Copy Sheet TSV'))

    const copiedText = writeText.mock.calls[0][0] as string
    const rows = copiedText.split('\n')
    const monthNames = [
      'January',
      'February',
      'March',
      'April',
      'May',
      'June',
      'July',
      'August',
      'September',
      'October',
      'November',
      'December'
    ]
    const expectedMonths = monthNames.slice(0, currentMonth + 1).map(month => `${month} ${currentYear}`)
    const donationColumnCount = 2 + expectedMonths.length
    const currentMonthIndex = currentMonth + 2

    expect(rows[0]).toBe(['', '', ...expectedMonths].join('\t'))
    expect(rows.find(row => row.includes('Total donors this month'))?.split('\t')).toHaveLength(donationColumnCount)
    expect(rows.find(row => row.includes('Median donation amount'))?.split('\t')).toHaveLength(donationColumnCount)

    const donorRow = rows.find(row => row.includes('Total donors this month'))?.split('\t')
    const medianRow = rows.find(row => row.includes('Median donation amount'))?.split('\t')
    const under50Row = rows.find(row => row.includes('Gifts $50 and under'))?.split('\t')
    expect(donorRow?.[0]).toBe('')
    expect(medianRow?.[0]).toBe('Donations')
    expect(donorRow?.[2]).toBe(currentMonth === 0 ? "'2" : "'1")
    expect(donorRow?.[currentMonthIndex]).toBe(currentMonth === 0 ? "'2" : "'1")
    expect(medianRow?.[2]).toBe(currentMonth === 0 ? '$75.00' : '$100.00')
    expect(under50Row?.[2]).toBe(currentMonth === 0 ? "'1" : "'0")
  })

  it('makes unknown donation dates explicit in the copied monthly TSV summary', async () => {
    const writeText = vi.fn()
    Object.assign(navigator, {
      clipboard: { writeText }
    })
    vi.spyOn(window, 'alert').mockImplementation(() => {})

    render(<App />)
    const donorExport = new File(['donors'], 'donors.csv', { type: 'text/csv' })
    const input = screen.getByLabelText(/Upload CSV/i)
    const currentYear = new Date().getFullYear()
    const currentMonth = new Date().getMonth()
    const monthNames = [
      'January',
      'February',
      'March',
      'April',
      'May',
      'June',
      'July',
      'August',
      'September',
      'October',
      'November',
      'December'
    ]
    const expectedMonths = monthNames.slice(0, currentMonth + 1).map(month => `${month} ${currentYear}`)

    const PapaMock = vi.mocked(Papa.parse as unknown as (file: File, config: Papa.ParseConfig<DonationRow>) => void)
    PapaMock.mockImplementation((_file: File, config: Papa.ParseConfig<DonationRow>) => {
      if (!config.complete) return

      config.complete({
        data: [
          { Donor: 'D1', 'Donation Date': `1/2/${currentYear}`, 'Donation Amount': '$100.00', 'First Name': 'One', 'Last Name': 'Donor' },
          { Donor: 'D2', 'Donation Date': 'TBA', 'Donation Amount': '$50.00', 'First Name': 'Two', 'Last Name': 'Donor' }
        ],
        errors: [], meta: parseMeta
      }, undefined)
    })

    fireEvent.change(input, { target: { files: [donorExport] } })

    await waitFor(() => {
      expect(screen.getByText('Copy Sheet TSV')).toBeInTheDocument()
    })

    fireEvent.click(screen.getByText('Copy Sheet TSV'))

    const copiedText = writeText.mock.calls[0][0] as string
    const rows = copiedText.split('\n')

    expect(rows[0]).toBe(['', '', ...expectedMonths].join('\t'))

    const donorRow = rows.find(row => row.includes('Total donors this month'))?.split('\t')
    const medianRow = rows.find(row => row.includes('Median donation amount'))?.split('\t')
    const under50Row = rows.find(row => row.includes('Gifts $50 and under'))?.split('\t')

    // Only the January in-year donation is included; the TBA/unknown date donation is excluded.
    expect(donorRow?.[2]).toBe("'1")
    expect(medianRow?.[2]).toBe('$100.00')
    expect(under50Row?.[2]).toBe("'0")
    // No Unknown Date or All columns in the new format
    expect(rows[0].split('\t')).not.toContain('Unknown Date')
    expect(rows[0].split('\t')).not.toContain('All')
  })
})
