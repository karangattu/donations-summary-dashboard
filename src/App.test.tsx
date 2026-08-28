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
      const givingTrendSection = screen.getByText('Giving Trend').closest('section')!
      expect(within(givingTrendSection).getByText('January')).toBeInTheDocument()
      expect(within(givingTrendSection).getByText(currentMonthName)).toBeInTheDocument()
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
      expect(screen.getAllByText('Ada One').length).toBeGreaterThan(0)
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
      expect(screen.getAllByText('Major One').length).toBeGreaterThan(0)
      expect(screen.getAllByText('Entry Four').length).toBeGreaterThan(0)
    })

    fireEvent.click(screen.getByRole('button', { name: /Major donors/i }))

    await waitFor(() => {
      const donorTable = screen.getByText('Donor Investigation Table').closest('section')!
      expect(within(donorTable).getAllByText('Major One').length).toBeGreaterThan(0)
      expect(within(donorTable).queryByText('Entry Four')).not.toBeInTheDocument()
    })

    fireEvent.click(screen.getByRole('button', { name: /Repeat donors/i }))

    await waitFor(() => {
      const donorTable = screen.getByText('Donor Investigation Table').closest('section')!
      expect(within(donorTable).getByText('Entry Four')).toBeInTheDocument()
      expect(within(donorTable).queryByText('Major One')).not.toBeInTheDocument()
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
      expect(screen.getAllByText('Major One').length).toBeGreaterThan(0)
      expect(screen.getByLabelText('Major minimum')).toHaveValue(1000)
    })

    fireEvent.change(screen.getByLabelText('Major minimum'), { target: { value: '1500' } })
    fireEvent.click(screen.getByRole('button', { name: /Major donors/i }))

    await waitFor(() => {
      expect(screen.getByText('No donors match the current filters.')).toBeInTheDocument()
      const donorTable = screen.getByText('Donor Investigation Table').closest('section')!
      expect(within(donorTable).queryByText('Major One')).not.toBeInTheDocument()
    })

    fireEvent.click(screen.getByRole('button', { name: /Mid-level/i }))

    await waitFor(() => {
      const donorTable = screen.getByText('Donor Investigation Table').closest('section')!
      expect(within(donorTable).getByText('Major One')).toBeInTheDocument()
      expect(within(donorTable).getByText('Mid Two')).toBeInTheDocument()
    })
  })

  it('updates dashboard data when users select a month or date range', async () => {
    render(<App />)
    const donorExport = new File(['donors'], 'timeline.csv', { type: 'text/csv' })
    const input = screen.getByLabelText(/Upload CSV/i)
    const currentYear = new Date().getFullYear()

    const PapaMock = vi.mocked(Papa.parse as unknown as (file: File, config: Papa.ParseConfig<DonationRow>) => void)
    PapaMock.mockImplementation((_file: File, config: Papa.ParseConfig<DonationRow>) => {
      if (!config.complete) return

      config.complete({
        data: [
          { Donor: 'J1', 'Donation Date': `1/5/${currentYear}`, 'Donation Amount': '$100.00', 'First Name': 'January', 'Last Name': 'Donor' },
          { Donor: 'F1', 'Donation Date': `2/10/${currentYear}`, 'Donation Amount': '$200.00', 'First Name': 'February', 'Last Name': 'Donor' },
          { Donor: 'M1', 'Donation Date': `3/5/${currentYear}`, 'Donation Amount': '$300.00', 'First Name': 'March', 'Last Name': 'Start' },
          { Donor: 'M2', 'Donation Date': `3/20/${currentYear}`, 'Donation Amount': '$400.00', 'First Name': 'March', 'Last Name': 'End' }
        ],
        errors: [], meta: parseMeta
      }, undefined)
    })

    fireEvent.change(input, { target: { files: [donorExport] } })

    await waitFor(() => {
      expect(screen.getAllByText('$1,000.00').length).toBeGreaterThan(0)
      expect(screen.getAllByText('January Donor').length).toBeGreaterThan(0)
      expect(screen.getAllByText('March End').length).toBeGreaterThan(0)
    })

    fireEvent.change(screen.getByLabelText('Timeline type'), { target: { value: 'month' } })
    fireEvent.change(screen.getByLabelText('Month'), { target: { value: `${currentYear}-02` } })

    await waitFor(() => {
      expect(screen.getAllByText('$200.00').length).toBeGreaterThan(0)
      expect(within(screen.getByText('Total Gifts').parentElement!).getByText('1')).toBeInTheDocument()
      expect(screen.getAllByText('February Donor').length).toBeGreaterThan(0)
      const donorTable = screen.getByText('Donor Investigation Table').closest('section')!
      const recordsTable = screen.getByText('All Records').closest('section')!
      expect(within(donorTable).queryByText('January Donor')).not.toBeInTheDocument()
      expect(within(donorTable).queryByText('March Start')).not.toBeInTheDocument()
      expect(within(recordsTable).queryByText('January Donor')).not.toBeInTheDocument()
      expect(within(recordsTable).queryByText('March Start')).not.toBeInTheDocument()
    })

    fireEvent.change(screen.getByLabelText('Timeline type'), { target: { value: 'range' } })
    fireEvent.change(screen.getByLabelText('Start date'), { target: { value: `${currentYear}-03-01` } })
    fireEvent.change(screen.getByLabelText('End date'), { target: { value: `${currentYear}-03-10` } })

    await waitFor(() => {
      expect(screen.getAllByText('$300.00').length).toBeGreaterThan(0)
      expect(within(screen.getByText('Total Gifts').parentElement!).getByText('1')).toBeInTheDocument()
      expect(screen.getAllByText('March Start').length).toBeGreaterThan(0)
      const donorTable = screen.getByText('Donor Investigation Table').closest('section')!
      const recordsTable = screen.getByText('All Records').closest('section')!
      expect(within(donorTable).queryByText('February Donor')).not.toBeInTheDocument()
      expect(within(donorTable).queryByText('March End')).not.toBeInTheDocument()
      expect(within(recordsTable).queryByText('February Donor')).not.toBeInTheDocument()
      expect(within(recordsTable).queryByText('March End')).not.toBeInTheDocument()
    })
  })

  it('shows all individual records in the All Records table and filters by month', async () => {
    render(<App />)
    const donorExport = new File(['donors'], 'records.csv', { type: 'text/csv' })
    const input = screen.getByLabelText(/Upload CSV/i)
    const currentYear = new Date().getFullYear()

    const PapaMock = vi.mocked(Papa.parse as unknown as (file: File, config: Papa.ParseConfig<DonationRow>) => void)
    PapaMock.mockImplementation((_file: File, config: Papa.ParseConfig<DonationRow>) => {
      if (!config.complete) return

      config.complete({
        data: [
          { Donor: 'J1', 'Donation Date': `1/5/${currentYear}`, 'Donation Amount': '$100.00', 'First Name': 'January', 'Last Name': 'Donor', City: 'Austin', St: 'TX' },
          { Donor: 'F1', 'Donation Date': `2/10/${currentYear}`, 'Donation Amount': '$200.00', 'First Name': 'February', 'Last Name': 'Donor', City: 'Dallas', St: 'TX' },
          { Donor: 'M1', 'Donation Date': `3/5/${currentYear}`, 'Donation Amount': '$300.00', 'First Name': 'March', 'Last Name': 'Start', City: 'Houston', St: 'TX' },
          { Donor: 'M2', 'Donation Date': `3/20/${currentYear}`, 'Donation Amount': '$400.00', 'First Name': 'March', 'Last Name': 'End', City: 'Austin', St: 'TX' }
        ],
        errors: [], meta: parseMeta
      }, undefined)
    })

    fireEvent.change(input, { target: { files: [donorExport] } })

    await waitFor(() => {
      expect(screen.getByText('All Records')).toBeInTheDocument()
      expect(screen.getByText('4 individual donations in selected timeline')).toBeInTheDocument()
      const recordsTable = screen.getByText('All Records').closest('section')!
      expect(within(recordsTable).getByText('January Donor')).toBeInTheDocument()
      expect(within(recordsTable).getByText('February Donor')).toBeInTheDocument()
      expect(within(recordsTable).getByText('March Start')).toBeInTheDocument()
      expect(within(recordsTable).getByText('March End')).toBeInTheDocument()
    })

    fireEvent.change(screen.getByLabelText('Timeline type'), { target: { value: 'month' } })
    fireEvent.change(screen.getByLabelText('Month'), { target: { value: `${currentYear}-03` } })

    await waitFor(() => {
      expect(screen.getByText('2 individual donations in selected timeline')).toBeInTheDocument()
      const recordsTable = screen.getByText('All Records').closest('section')!
      expect(within(recordsTable).getByText('March Start')).toBeInTheDocument()
      expect(within(recordsTable).getByText('March End')).toBeInTheDocument()
      expect(within(recordsTable).queryByText('January Donor')).not.toBeInTheDocument()
      expect(within(recordsTable).queryByText('February Donor')).not.toBeInTheDocument()
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

  it('parses and displays Notes/Interactions under the donor name', async () => {
    render(<App />)
    const file = new File(['test'], 'test.csv', { type: 'text/csv' })
    const input = screen.getByLabelText(/Upload CSV/i)

    const PapaMock = vi.mocked(Papa.parse as unknown as (file: File, config: Papa.ParseConfig<DonationRow>) => void)
    PapaMock.mockImplementation((_file: File, config: Papa.ParseConfig<DonationRow>) => {
      if (config.complete) {
        config.complete({
          data: [
            { 'Contact ID': '1', 'Transaction Date': '4/1/2026', 'Transaction Amount Subtotal': '$100.00', 'First Name': 'John', 'Last Name': 'Doe', 'Notes/Interactions': 'Interested in major giving' },
            { 'Contact ID': '2', 'Transaction Date': '4/2/2026', 'Transaction Amount Subtotal': '$25.00', 'First Name': 'Jane', 'Last Name': 'Smith', 'Notes/Interactions': '' }
          ],
          errors: [], meta: parseMeta
        }, undefined)
      }
    })

    fireEvent.change(input, { target: { files: [file] } })

    await waitFor(() => {
      expect(screen.getByText('Donor Investigation Table')).toBeInTheDocument()
    })

    const donorTable = screen.getByText('Donor Investigation Table').closest('section')!
    expect(within(donorTable).getByText('John Doe')).toBeInTheDocument()
    expect(within(donorTable).getByText('Interested in major giving')).toBeInTheDocument()

    const allRecordsTab = screen.getByRole('button', { name: /all records/i })
    fireEvent.click(allRecordsTab)

    const recordsTable = screen.getByText('All Records').closest('section')!
    expect(within(recordsTable).getByText('John Doe')).toBeInTheDocument()
    expect(within(recordsTable).getByText('Interested in major giving')).toBeInTheDocument()
  })

  const uploadInsightsData = async (rows: DonationRow[]) => {
    render(<App />)
    const file = new File(['test'], 'insights.csv', { type: 'text/csv' })
    const input = screen.getByLabelText(/Upload CSV/i)

    const PapaMock = vi.mocked(Papa.parse as unknown as (file: File, config: Papa.ParseConfig<DonationRow>) => void)
    PapaMock.mockImplementation((_file: File, config: Papa.ParseConfig<DonationRow>) => {
      if (!config.complete) return
      config.complete({ data: rows, errors: [], meta: parseMeta }, undefined)
    })

    fireEvent.change(input, { target: { files: [file] } })
    await waitFor(() => expect(screen.getByText('Insights & Patterns')).toBeInTheDocument())
    return screen.getByText('Insights & Patterns').closest('section')!
  }

  it('renders an Insights & Patterns section with callouts and a month-over-month breakdown', async () => {
    const currentYear = new Date().getFullYear()
    const section = await uploadInsightsData([
      { Donor: 'A', 'Donation Date': `1/5/${currentYear}`, 'Donation Amount': '$100.00', 'First Name': 'Alpha', 'Last Name': 'One' },
      { Donor: 'B', 'Donation Date': `2/5/${currentYear}`, 'Donation Amount': '$300.00', 'First Name': 'Beta', 'Last Name': 'Two' },
      { Donor: 'A', 'Donation Date': `3/5/${currentYear}`, 'Donation Amount': '$500.00', 'First Name': 'Alpha', 'Last Name': 'One' }
    ])

    expect(within(section).getByText('Peak giving month')).toBeInTheDocument()
    expect(within(section).getByText('Month-over-month breakdown')).toBeInTheDocument()
    expect(within(section).getByText('New donors acquired')).toBeInTheDocument()
    expect(within(section).getByText('Strongest month-over-month growth')).toBeInTheDocument()
  })

  it('counts new vs returning donors and computes month-over-month growth', async () => {
    const currentYear = new Date().getFullYear()
    const section = await uploadInsightsData([
      { Donor: 'A', 'Donation Date': `1/5/${currentYear}`, 'Donation Amount': '$100.00', 'First Name': 'Alpha', 'Last Name': 'One' },
      { Donor: 'B', 'Donation Date': `2/5/${currentYear}`, 'Donation Amount': '$300.00', 'First Name': 'Beta', 'Last Name': 'Two' },
      { Donor: 'A', 'Donation Date': `3/5/${currentYear}`, 'Donation Amount': '$500.00', 'First Name': 'Alpha', 'Last Name': 'One' }
    ])

    const newDonorsCard = within(section).getByTestId('new-donors')
    expect(within(newDonorsCard).getByText('2')).toBeInTheDocument()

    const growthCard = within(section).getByTestId('strongest-growth')
    expect(within(growthCard).getByText('+200%')).toBeInTheDocument()

    const rows = within(section).getAllByRole('row')
    const februaryRow = rows.find(row => within(row).queryByText('February'))
    expect(februaryRow).toBeTruthy()
    expect(within(februaryRow!).getByText('+200%')).toBeInTheDocument()
  })

  it('highlights the top donor of the year in a callout and key donor card', async () => {
    const currentYear = new Date().getFullYear()
    const section = await uploadInsightsData([
      { Donor: 'A', 'Donation Date': `1/5/${currentYear}`, 'Donation Amount': '$600.00', 'First Name': 'Alpha', 'Last Name': 'One' },
      { Donor: 'B', 'Donation Date': `2/5/${currentYear}`, 'Donation Amount': '$100.00', 'First Name': 'Beta', 'Last Name': 'Two' }
    ])

    const topDonorCallout = within(section).getByTestId('top-donor')
    expect(within(topDonorCallout).getByText('Top donor this year')).toBeInTheDocument()
    expect(within(topDonorCallout).getByText('$600.00')).toBeInTheDocument()

    const topTotalCard = within(section).getByTestId('key-donor-top-total')
    expect(within(topTotalCard).getByText('Alpha One')).toBeInTheDocument()
    expect(within(topTotalCard).getByText('$600.00')).toBeInTheDocument()
  })

  it('detects the longest consecutive-month giving streak', async () => {
    const currentYear = new Date().getFullYear()
    const section = await uploadInsightsData([
      { Donor: 'S', 'Donation Date': `1/5/${currentYear}`, 'Donation Amount': '$50.00', 'First Name': 'Steady', 'Last Name': 'Giver' },
      { Donor: 'S', 'Donation Date': `2/5/${currentYear}`, 'Donation Amount': '$50.00', 'First Name': 'Steady', 'Last Name': 'Giver' },
      { Donor: 'S', 'Donation Date': `3/5/${currentYear}`, 'Donation Amount': '$50.00', 'First Name': 'Steady', 'Last Name': 'Giver' }
    ])

    const streakCallout = within(section).getByTestId('longest-streak')
    expect(within(streakCallout).getByText('Longest giving streak')).toBeInTheDocument()
    expect(within(streakCallout).getByText('3 months')).toBeInTheDocument()

    const loyalCard = within(section).getByTestId('key-donor-loyal')
    expect(within(loyalCard).getByText('Steady Giver')).toBeInTheDocument()
  })

  it('flags lapsed donors who gave earlier but not in the last two months', async () => {
    const currentMonth = new Date().getMonth()
    if (currentMonth < 2) return
    const currentYear = new Date().getFullYear()
    const recentMonth = currentMonth + 1

    const section = await uploadInsightsData([
      { Donor: 'L1', 'Donation Date': `1/5/${currentYear}`, 'Donation Amount': '$50.00', 'First Name': 'Lapsed', 'Last Name': 'Donor' },
      { Donor: 'R1', 'Donation Date': `${recentMonth}/5/${currentYear}`, 'Donation Amount': '$100.00', 'First Name': 'Recent', 'Last Name': 'Donor' }
    ])

    expect(within(section).getByText(/Lapsed donors/)).toBeInTheDocument()
    expect(within(section).getAllByText('Lapsed Donor').length).toBeGreaterThan(0)
  })

  it('matches current year donors with historical master list by name and email, and displays multi-year trend', async () => {
    render(<App />)
    const currentYear = new Date().getFullYear()

    const currentFile = new File(['current'], 'current.csv', { type: 'text/csv' })
    const historicalFile = new File(['historical'], 'Major donor master list skeleton.csv', { type: 'text/csv' })

    const uploadCurrentInput = screen.getAllByLabelText(/Upload CSV/i)[0]
    const uploadHistoricalInput = screen.getAllByLabelText(/Upload Master List/i)[0]

    const PapaMock = vi.mocked(Papa.parse as unknown as (file: File, config: Papa.ParseConfig<DonationRow>) => void)
    PapaMock.mockImplementation((file: File, config: Papa.ParseConfig<DonationRow>) => {
      if (!config.complete) return

      if (file.name === 'current.csv') {
        config.complete({
          data: [
            { Donor: 'M1', 'Donation Date': `4/1/${currentYear}`, 'Donation Amount': '$15,000.00', 'First Name': 'Mickey', 'Last Name': 'Mouse', Email: 'mickey@disney.com' },
            { Donor: 'D2', 'Donation Date': `4/2/${currentYear}`, 'Donation Amount': '$500.00', 'First Name': 'Donald', 'Last Name': 'Duck', Email: 'donald@disney.com' }
          ],
          errors: [], meta: parseMeta
        }, undefined)
      } else {
        config.complete({
          data: [
            {
              Name: 'Mickey Mouse',
              'First gift': '2025',
              '2022': '$0.00',
              '2023': '$0.00',
              '2024': '$0.00',
              '2025': '$12,912.50',
              'Notes about the donor': 'VIP Major Donor',
              Email: 'mickey@disney.com',
              City: 'San Francisco',
              Address: '4th King St',
              Phone: '555-0100'
            }
          ],
          errors: [], meta: parseMeta
        }, undefined)
      }
    })

    fireEvent.change(uploadCurrentInput, { target: { files: [currentFile] } })
    fireEvent.change(uploadHistoricalInput, { target: { files: [historicalFile] } })

    await waitFor(() => {
      expect(screen.getByText('Historical & Multi-Year Trends')).toBeInTheDocument()
      expect(screen.getByText(/1 of 2 active donors matched/)).toBeInTheDocument()
      expect(screen.getByText('Multi-Year Revenue Trajectory')).toBeInTheDocument()
    })

    const donorTable = screen.getByText('Donor Investigation Table').closest('section')!
    expect(within(donorTable).getByText('Mickey Mouse')).toBeInTheDocument()
    expect(within(donorTable).getByText('Upgraded (+16%)')).toBeInTheDocument()
    expect(within(donorTable).getByText(`New in ${currentYear}`)).toBeInTheDocument()
  })

  it('expands donor row to reveal full multi-year history, historical notes, and contact info', async () => {
    render(<App />)
    const currentYear = new Date().getFullYear()

    const currentFile = new File(['current'], 'current.csv', { type: 'text/csv' })
    const historicalFile = new File(['historical'], 'master.csv', { type: 'text/csv' })

    const uploadCurrentInput = screen.getAllByLabelText(/Upload CSV/i)[0]
    const uploadHistoricalInput = screen.getAllByLabelText(/Upload Master List/i)[0]

    const PapaMock = vi.mocked(Papa.parse as unknown as (file: File, config: Papa.ParseConfig<DonationRow>) => void)
    PapaMock.mockImplementation((file: File, config: Papa.ParseConfig<DonationRow>) => {
      if (!config.complete) return

      if (file.name === 'current.csv') {
        config.complete({
          data: [
            { Donor: 'M1', 'Donation Date': `4/1/${currentYear}`, 'Donation Amount': '$15,000.00', 'First Name': 'Mickey', 'Last Name': 'Mouse', Email: 'mickey@disney.com' }
          ],
          errors: [], meta: parseMeta
        }, undefined)
      } else {
        config.complete({
          data: [
            {
              Name: 'Mickey Mouse',
              'First gift': '2025',
              '2022': '$0.00',
              '2023': '$0.00',
              '2024': '$0.00',
              '2025': '$12,912.50',
              'Notes about the donor': 'Founding supporter',
              Email: 'mickey@disney.com',
              City: 'San Francisco',
              Address: '4th King St',
              Phone: '555-0100'
            }
          ],
          errors: [], meta: parseMeta
        }, undefined)
      }
    })

    fireEvent.change(uploadCurrentInput, { target: { files: [currentFile] } })
    fireEvent.change(uploadHistoricalInput, { target: { files: [historicalFile] } })

    await waitFor(() => {
      expect(screen.getByText('Historical & Multi-Year Trends')).toBeInTheDocument()
    })

    const toggleButton = screen.getByLabelText('Toggle history for Mickey Mouse')
    fireEvent.click(toggleButton)

    await waitFor(() => {
      expect(screen.getByText(/Mickey Mouse — Giving History/)).toBeInTheDocument()
    })

    expect(screen.getAllByText(/Founding supporter/).length).toBeGreaterThan(0)
    expect(screen.getAllByText('mickey@disney.com').length).toBeGreaterThan(0)
    expect(screen.getByText('555-0100')).toBeInTheDocument()
    expect(screen.getByText(/4th King St, San Francisco/)).toBeInTheDocument()
    expect(screen.getAllByText('$12,912.50').length).toBeGreaterThan(0)
  })

  it('allows filtering by historical trajectory and switching to the Master List tab', async () => {
    render(<App />)
    const currentYear = new Date().getFullYear()

    const currentFile = new File(['current'], 'current.csv', { type: 'text/csv' })
    const historicalFile = new File(['historical'], 'master.csv', { type: 'text/csv' })

    const uploadCurrentInput = screen.getAllByLabelText(/Upload CSV/i)[0]
    const uploadHistoricalInput = screen.getAllByLabelText(/Upload Master List/i)[0]

    const PapaMock = vi.mocked(Papa.parse as unknown as (file: File, config: Papa.ParseConfig<DonationRow>) => void)
    PapaMock.mockImplementation((file: File, config: Papa.ParseConfig<DonationRow>) => {
      if (!config.complete) return

      if (file.name === 'current.csv') {
        config.complete({
          data: [
            { Donor: 'M1', 'Donation Date': `4/1/${currentYear}`, 'Donation Amount': '$15,000.00', 'First Name': 'Mickey', 'Last Name': 'Mouse', Email: 'mickey@disney.com' },
            { Donor: 'D2', 'Donation Date': `4/2/${currentYear}`, 'Donation Amount': '$500.00', 'First Name': 'Donald', 'Last Name': 'Duck', Email: 'donald@disney.com' }
          ],
          errors: [], meta: parseMeta
        }, undefined)
      } else {
        config.complete({
          data: [
            {
              Name: 'Mickey Mouse',
              'First gift': '2025',
              '2025': '$12,000.00',
              Email: 'mickey@disney.com'
            },
            {
              Name: 'Goofy Dog',
              'First gift': '2023',
              '2023': '$1,000.00',
              Email: 'goofy@disney.com'
            }
          ],
          errors: [], meta: parseMeta
        }, undefined)
      }
    })

    fireEvent.change(uploadCurrentInput, { target: { files: [currentFile] } })
    fireEvent.change(uploadHistoricalInput, { target: { files: [historicalFile] } })

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /Master List \(2\)/i })).toBeInTheDocument()
    })

    fireEvent.click(screen.getByRole('button', { name: /Upgraded/i }))

    await waitFor(() => {
      const donorTable = screen.getByText('Donor Investigation Table').closest('section')!
      expect(within(donorTable).getByText('Mickey Mouse')).toBeInTheDocument()
      expect(within(donorTable).queryByText('Donald Duck')).not.toBeInTheDocument()
    })

    fireEvent.click(screen.getByRole('button', { name: /Master List \(2\)/i }))

    await waitFor(() => {
      expect(screen.getByText('Historical Master List')).toBeInTheDocument()
      expect(screen.getByText('Goofy Dog')).toBeInTheDocument()
      expect(screen.getByText(`Not given in ${currentYear}`)).toBeInTheDocument()
    })
  })
})
