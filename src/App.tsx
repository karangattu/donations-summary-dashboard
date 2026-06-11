import React, { useState, useMemo } from 'react';
import Papa from 'papaparse';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, BarChart, Bar } from 'recharts';
import { Upload, Copy, FileText, DollarSign, Users, Gift, Search, CalendarDays } from 'lucide-react';

type DonationRow = Record<string, string | undefined>;
type DonorFilter = 'all' | 'major' | 'mid' | 'core' | 'entry' | 'repeat';
type ThresholdKey = 'major' | 'mid' | 'core';
type TimelineMode = 'all' | 'month' | 'range';

interface LevelThresholds {
  major: number;
  mid: number;
  core: number;
}

interface ParsedDonation {
  amount: number;
  date: string;
  dateSortValue: number;
  donorKey: string;
  donorName: string;
  city: string;
  state: string;
}

interface DonorSummary {
  key: string;
  name: string;
  city: string;
  state: string;
  giftCount: number;
  totalAmount: number;
  averageGift: number;
  largestGift: number;
  firstGift: string;
  lastGift: string;
  segment: Exclude<DonorFilter, 'all' | 'repeat'>;
}

interface SheetSummaryColumn {
  label: string;
  totalDonors: number;
  totalGifts: number;
  medianDonation: number;
  totalAmount: number;
  giftsUnder50: number;
  gifts50to100: number;
  gifts100to500: number;
  giftsOver500: number;
  sortValue: number;
}

interface MonthOption {
  value: string;
  label: string;
  sortValue: number;
}

const donorFilters: Array<{ id: DonorFilter; label: string }> = [
  { id: 'all', label: 'All donors' },
  { id: 'major', label: 'Major donors' },
  { id: 'mid', label: 'Mid-level' },
  { id: 'core', label: 'Core donors' },
  { id: 'entry', label: 'Entry donors' },
  { id: 'repeat', label: 'Repeat donors' },
];

const giftLevels = [
  { label: 'Under $50', min: 0, max: 50 },
  { label: '$50-$99', min: 50, max: 100 },
  { label: '$100-$249', min: 100, max: 250 },
  { label: '$250-$499', min: 250, max: 500 },
  { label: '$500-$999', min: 500, max: 1000 },
  { label: '$1,000+', min: 1000, max: Infinity },
];

const defaultLevelThresholds: LevelThresholds = {
  major: 1000,
  mid: 250,
  core: 100,
};

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
  'December',
];

const parseDonationFile = (file: File) => {
  return new Promise<DonationRow[]>((resolve, reject) => {
    Papa.parse<DonationRow>(file, {
      header: true,
      skipEmptyLines: true,
      complete: (results) => {
        resolve(results.data);
      },
      error: (error) => {
        reject(error);
      },
    });
  });
};

const getFieldValue = (row: DonationRow, fieldNames: string[]) => {
  for (const fieldName of fieldNames) {
    const value = row[fieldName]?.trim();
    if (value) return value;
  }

  return '';
};

const parseCurrency = (value: string) => {
  if (!value) return Number.NaN;
  return Number(value.replace(/[$,]/g, ''));
};

const getDateSortValue = (date: string) => {
  const timestamp = Date.parse(date);
  return Number.isNaN(timestamp) ? Number.MAX_SAFE_INTEGER : timestamp;
};

const formatCurrency = (amount: number) => {
  return '$' + amount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
};

const getMedian = (amounts: number[]) => {
  if (amounts.length === 0) return 0;

  const sortedAmounts = [...amounts].sort((a, b) => a - b);
  const middle = Math.floor(sortedAmounts.length / 2);
  return sortedAmounts.length % 2 !== 0
    ? sortedAmounts[middle]
    : (sortedAmounts[middle - 1] + sortedAmounts[middle]) / 2;
};

const getMonthBucket = (date: string) => {
  const parsedDate = new Date(date);
  if (Number.isNaN(parsedDate.getTime())) {
    return { key: 'unknown', label: 'Unknown Date', sortValue: Number.MAX_SAFE_INTEGER };
  }

  const year = parsedDate.getFullYear();
  const month = parsedDate.getMonth();
  return {
    key: `${year}-${String(month + 1).padStart(2, '0')}`,
    label: `${monthNames[month]} ${year}`,
    sortValue: new Date(year, month, 1).getTime(),
  };
};

const getDateInputSortValue = (dateValue: string, endOfDay = false) => {
  if (!dateValue) return null;

  const [year, month, day] = dateValue.split('-').map(Number);
  if (!year || !month || !day) return null;

  const parsedDate = endOfDay
    ? new Date(year, month - 1, day, 23, 59, 59, 999)
    : new Date(year, month - 1, day);
  const sortValue = parsedDate.getTime();

  return Number.isNaN(sortValue) ? null : sortValue;
};

const getAvailableMonthOptions = (donations: ParsedDonation[]): MonthOption[] => {
  const months = donations.reduce((acc, donation) => {
    const monthBucket = getMonthBucket(donation.date);
    if (monthBucket.key === 'unknown') return acc;

    acc[monthBucket.key] = {
      value: monthBucket.key,
      label: monthBucket.label,
      sortValue: monthBucket.sortValue,
    };
    return acc;
  }, {} as Record<string, MonthOption>);

  return Object.values(months).sort((a, b) => b.sortValue - a.sortValue);
};

const filterDonationsByTimeline = (
  donations: ParsedDonation[],
  timelineMode: TimelineMode,
  selectedMonth: string,
  startDate: string,
  endDate: string,
) => {
  if (timelineMode === 'all') return donations;

  if (timelineMode === 'month') {
    if (!selectedMonth) return donations;
    return donations.filter((donation) => getMonthBucket(donation.date).key === selectedMonth);
  }

  const startSortValue = getDateInputSortValue(startDate);
  const endSortValue = getDateInputSortValue(endDate, true);

  if (startSortValue === null && endSortValue === null) return donations;

  return donations.filter((donation) => {
    if (donation.dateSortValue === Number.MAX_SAFE_INTEGER) return false;
    if (startSortValue !== null && donation.dateSortValue < startSortValue) return false;
    if (endSortValue !== null && donation.dateSortValue > endSortValue) return false;
    return true;
  });
};

const getYearToDateMonthBuckets = (year: number, lastMonth: number) => {
  return Array.from({ length: lastMonth + 1 }, (_, month) => ({
    key: `${year}-${String(month + 1).padStart(2, '0')}`,
    label: `${monthNames[month]} ${year}`,
    sortValue: new Date(year, month, 1).getTime(),
  }));
};

const summarizeSheetColumn = (label: string, donations: ParsedDonation[], sortValue: number): SheetSummaryColumn => {
  const donorIds = new Set(donations.map(donation => donation.donorKey).filter(Boolean));
  const amounts = donations.map(donation => donation.amount);

  return {
    label,
    totalDonors: donorIds.size,
    totalGifts: donations.length,
    medianDonation: getMedian(amounts),
    totalAmount: amounts.reduce((sum, amount) => sum + amount, 0),
    giftsUnder50: donations.filter(donation => donation.amount <= 50).length,
    gifts50to100: donations.filter(donation => donation.amount > 50 && donation.amount <= 100).length,
    gifts100to500: donations.filter(donation => donation.amount > 100 && donation.amount <= 500).length,
    giftsOver500: donations.filter(donation => donation.amount > 500).length,
    sortValue,
  };
};

const buildSheetSummaryColumns = (donations: ParsedDonation[]) => {
  const currentDate = new Date();
  const targetYear = currentDate.getFullYear();
  const lastMonth = currentDate.getMonth();
  const unknownDateDonations: ParsedDonation[] = [];
  const monthGroups = donations.reduce((acc, donation) => {
    const monthBucket = getMonthBucket(donation.date);
    if (monthBucket.key === 'unknown' || monthBucket.sortValue === Number.MAX_SAFE_INTEGER) {
      unknownDateDonations.push(donation);
      return acc;
    }

    const donationYear = new Date(donation.date).getFullYear();
    if (donationYear !== targetYear) {
      return acc;
    }

    if (!acc[monthBucket.key]) {
      acc[monthBucket.key] = {
        label: monthBucket.label,
        sortValue: monthBucket.sortValue,
        donations: [],
      };
    }

    acc[monthBucket.key].donations.push(donation);
    return acc;
  }, {} as Record<string, { label: string; sortValue: number; donations: ParsedDonation[] }>);

  const monthColumns = getYearToDateMonthBuckets(targetYear, lastMonth)
    .map(bucket => {
      const group = monthGroups[bucket.key];
      return summarizeSheetColumn(bucket.label, group?.donations ?? [], bucket.sortValue);
    })
    .sort((a, b) => a.sortValue - b.sortValue);
  const unknownDateColumn = unknownDateDonations.length > 0
    ? [summarizeSheetColumn('Unknown Date', unknownDateDonations, Number.MAX_SAFE_INTEGER)]
    : [];

  return [
    ...monthColumns,
    ...unknownDateColumn,
    summarizeSheetColumn('All', donations, Number.MAX_SAFE_INTEGER + 1),
  ];
};

const buildMonthlyTrendData = (donations: ParsedDonation[]) => {
  const currentDate = new Date();
  const targetYear = currentDate.getFullYear();
  const monthTotals = donations.reduce((acc, donation) => {
    const monthBucket = getMonthBucket(donation.date);
    if (monthBucket.key === 'unknown' || monthBucket.sortValue === Number.MAX_SAFE_INTEGER) {
      return acc;
    }

    const donationYear = new Date(donation.date).getFullYear();
    if (donationYear !== targetYear) {
      return acc;
    }

    acc[monthBucket.key] = (acc[monthBucket.key] ?? 0) + donation.amount;
    return acc;
  }, {} as Record<string, number>);

  return getYearToDateMonthBuckets(targetYear, currentDate.getMonth()).map(bucket => ({
    date: bucket.label.replace(` ${targetYear}`, ''),
    amount: monthTotals[bucket.key] ?? 0,
    dateSortValue: bucket.sortValue,
  }));
};

const buildGoogleSheetsTsv = (columns: SheetSummaryColumn[]) => {
  const currentDate = new Date();
  const currentYear = currentDate.getFullYear();
  const templateMonthColumns = getYearToDateMonthBuckets(currentYear, currentDate.getMonth()).map(bucket => ({
    ...bucket,
    column: columns.find(summaryColumn => summaryColumn.label === bucket.label) ??
      summarizeSheetColumn(bucket.label, [], bucket.sortValue),
  }));
  const valueColumns = templateMonthColumns.map(month => month.column);
  const monthLabels = templateMonthColumns.map(month => month.label);
  const countCell = (value: number) => `'${value}`;
  const rows = [
    ['', '', ...monthLabels],
    ['', 'Total donors this month', ...valueColumns.map(column => countCell(column.totalDonors))],
    ['Donations', 'Median donation amount', ...valueColumns.map(column => formatCurrency(column.medianDonation))],
    ['', 'Gifts $50 and under', ...valueColumns.map(column => countCell(column.giftsUnder50))],
    ['', 'Gifts $50 - $100', ...valueColumns.map(column => countCell(column.gifts50to100))],
    ['', 'Gifts $100 - $500', ...valueColumns.map(column => countCell(column.gifts100to500))],
    ['', 'Gifts over $500', ...valueColumns.map(column => countCell(column.giftsOver500))],
  ];

  return rows.map(row => row.join('\t')).join('\n');
};

const getDonorSegment = (amount: number, thresholds: LevelThresholds): DonorSummary['segment'] => {
  if (amount >= thresholds.major) return 'major';
  if (amount >= thresholds.mid) return 'mid';
  if (amount >= thresholds.core) return 'core';
  return 'entry';
};

const getSegmentLabel = (segment: DonorSummary['segment']) => {
  if (segment === 'major') return 'Major';
  if (segment === 'mid') return 'Mid-level';
  if (segment === 'core') return 'Core';
  return 'Entry';
};

const formatThreshold = (amount: number) => {
  return '$' + amount.toLocaleString(undefined, { maximumFractionDigits: 0 });
};

const getDonorLevelRange = (filter: DonorFilter, thresholds: LevelThresholds) => {
  if (filter === 'major') return `${formatThreshold(thresholds.major)}+ total`;
  if (filter === 'mid') return `${formatThreshold(thresholds.mid)}-${formatThreshold(Math.max(thresholds.mid, thresholds.major - 1))} total`;
  if (filter === 'core') return `${formatThreshold(thresholds.core)}-${formatThreshold(Math.max(thresholds.core, thresholds.mid - 1))} total`;
  if (filter === 'entry') return `< ${formatThreshold(thresholds.core)} total`;
  if (filter === 'repeat') return '2+ gifts';
  return 'All selected totals';
};

const normalizeDonation = (row: DonationRow): ParsedDonation => {
  const firstName = getFieldValue(row, ['First Name']);
  const lastName = getFieldValue(row, ['Last Name']);
  const email = getFieldValue(row, ['Email']);
  const donorId = getFieldValue(row, ['Contact ID', 'Donor']);
  const donorName = `${firstName} ${lastName}`.trim() || donorId || email || 'Unknown';
  const donorKey = donorId || email || donorName;
  const date = getFieldValue(row, ['Transaction Date', 'Donation Date']) || 'Unknown Date';
  const amount = parseCurrency(getFieldValue(row, ['Transaction Amount Subtotal', 'Donation Amount']));

  return {
    amount,
    date,
    dateSortValue: getDateSortValue(date),
    donorKey,
    donorName,
    city: getFieldValue(row, ['City']),
    state: getFieldValue(row, ['St', 'ST', 'State']),
  };
};

const summarizeDonors = (donations: ParsedDonation[], thresholds: LevelThresholds) => {
  const donors = donations.reduce((acc, donation) => {
    const existing = acc[donation.donorKey] ?? {
      key: donation.donorKey,
      name: donation.donorName,
      city: donation.city,
      state: donation.state,
      giftCount: 0,
      totalAmount: 0,
      averageGift: 0,
      largestGift: 0,
      firstGift: donation.date,
      lastGift: donation.date,
      firstGiftSortValue: donation.dateSortValue,
      lastGiftSortValue: donation.dateSortValue,
      segment: 'entry' as DonorSummary['segment'],
    };

    existing.giftCount += 1;
    existing.totalAmount += donation.amount;
    existing.largestGift = Math.max(existing.largestGift, donation.amount);

    if (donation.dateSortValue < existing.firstGiftSortValue) {
      existing.firstGift = donation.date;
      existing.firstGiftSortValue = donation.dateSortValue;
    }

    if (donation.dateSortValue >= existing.lastGiftSortValue) {
      existing.lastGift = donation.date;
      existing.lastGiftSortValue = donation.dateSortValue;
    }

    existing.city ||= donation.city;
    existing.state ||= donation.state;
    acc[donation.donorKey] = existing;
    return acc;
  }, {} as Record<string, DonorSummary & { firstGiftSortValue: number; lastGiftSortValue: number }>);

  return Object.values(donors).map((donor) => ({
    key: donor.key,
    name: donor.name,
    city: donor.city,
    state: donor.state,
    giftCount: donor.giftCount,
    totalAmount: donor.totalAmount,
    averageGift: donor.totalAmount / donor.giftCount,
    largestGift: donor.largestGift,
    firstGift: donor.firstGift,
    lastGift: donor.lastGift,
    segment: getDonorSegment(donor.totalAmount, thresholds),
  })).sort((a, b) => b.totalAmount - a.totalAmount || b.giftCount - a.giftCount);
};

const App = () => {
  const [data, setData] = useState<DonationRow[]>([]);
  const [fileName, setFileName] = useState<string | null>(null);
  const [activeFilter, setActiveFilter] = useState<DonorFilter>('all');
  const [searchTerm, setSearchTerm] = useState('');
  const [levelThresholds, setLevelThresholds] = useState<LevelThresholds>(defaultLevelThresholds);
  const [timelineMode, setTimelineMode] = useState<TimelineMode>('all');
  const [selectedMonth, setSelectedMonth] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [activeTab, setActiveTab] = useState<'donors' | 'records'>('donors');
  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files ?? []);
    if (files.length === 0) return;

    setFileName(files.length === 1 ? files[0].name : `${files.length} CSV files`);

    try {
      const rowsByFile = await Promise.all(files.map(parseDonationFile));
      setData(rowsByFile.flat());
    } catch (error) {
      console.error('Failed to parse donation CSV', error);
      alert('Unable to parse one or more CSV files.');
    }
  };

  const parsedData = useMemo(() => {
    return data.map(normalizeDonation).filter(d => !Number.isNaN(d.amount));
  }, [data]);

  const availableMonths = useMemo(() => getAvailableMonthOptions(parsedData), [parsedData]);
  const activeSelectedMonth = availableMonths.some(month => month.value === selectedMonth)
    ? selectedMonth
    : availableMonths[0]?.value ?? '';

  const timelineData = useMemo(() => {
    return filterDonationsByTimeline(parsedData, timelineMode, activeSelectedMonth, startDate, endDate);
  }, [activeSelectedMonth, endDate, parsedData, startDate, timelineMode]);

  const updateThreshold = (key: ThresholdKey, value: string) => {
    const amount = Math.max(0, Number(value) || 0);
    setLevelThresholds((current) => ({ ...current, [key]: amount }));
  };

  const stats = useMemo(() => {
    if (parsedData.length === 0) return null;

    const donorSummaries = summarizeDonors(timelineData, levelThresholds);
    const totalDonors = donorSummaries.length;
    const amounts = timelineData.map(d => d.amount);
    const median = getMedian(amounts);
    const totalAmount = timelineData.reduce((sum, d) => sum + d.amount, 0);
    const repeatDonors = donorSummaries.filter(donor => donor.giftCount > 1).length;
    const largestGift = Math.max(...amounts, 0);

    const trendData = buildMonthlyTrendData(timelineData);

    const giftLevelData = giftLevels.map(level => {
      const gifts = timelineData.filter(donation => donation.amount >= level.min && donation.amount < level.max);
      return {
        name: level.label,
        gifts: gifts.length,
        amount: gifts.reduce((sum, donation) => sum + donation.amount, 0),
      };
    });

    const donorLevelData = donorFilters
      .filter(filter => filter.id !== 'all' && filter.id !== 'repeat')
      .map(filter => {
        const donors = donorSummaries.filter(donor => donor.segment === filter.id);
        return {
          id: filter.id,
          name: filter.label,
          donors: donors.length,
          amount: donors.reduce((sum, donor) => sum + donor.totalAmount, 0),
        };
      });

    return {
      totalDonors,
      median,
      averageGift: timelineData.length > 0 ? totalAmount / timelineData.length : 0,
      selectedGiftCount: timelineData.length,
      allGiftCount: parsedData.length,
      repeatDonors,
      largestGift,
      trendData,
      totalGifts: timelineData.length,
      totalAmount,
      donorSummaries,
      giftLevelData,
      donorLevelData,
      sheetSummaryColumns: buildSheetSummaryColumns(timelineData),
    };

  }, [levelThresholds, parsedData.length, timelineData]);

  const filteredDonors = useMemo(() => {
    if (!stats) return [];

    const normalizedSearch = searchTerm.trim().toLowerCase();
    return stats.donorSummaries.filter((donor) => {
      const matchesFilter =
        activeFilter === 'all' ||
        (activeFilter === 'repeat' && donor.giftCount > 1) ||
        donor.segment === activeFilter;
      const matchesSearch = !normalizedSearch ||
        donor.name.toLowerCase().includes(normalizedSearch) ||
        donor.key.toLowerCase().includes(normalizedSearch) ||
        donor.city.toLowerCase().includes(normalizedSearch);

      return matchesFilter && matchesSearch;
    });
  }, [activeFilter, searchTerm, stats]);

  const sortedRecords = useMemo(() => {
    return [...timelineData].sort((a, b) => {
      if (a.dateSortValue === b.dateSortValue) return b.amount - a.amount;
      return a.dateSortValue - b.dateSortValue;
    });
  }, [timelineData]);

  const copyRecordsToClipboard = () => {
    if (sortedRecords.length === 0) return;

    const header = 'Date\tDonor\tAmount\tCity\tState';
    const rows = sortedRecords.map(record =>
      `${record.date}\t${record.donorName}\t${formatCurrency(record.amount)}\t${record.city}\t${record.state}`
    );
    navigator.clipboard.writeText([header, ...rows].join('\n'));
    alert('All records copied to clipboard!');
  };

  const copyTableToClipboard = () => {
    if (!stats) return;
    
    const text = `
Donation Summary Report

Total Donors: ${stats.totalDonors}
Median Donation: $${stats.median.toFixed(2)}
Total Amount: $${stats.totalAmount.toFixed(2)}
Repeat Donors: ${stats.repeatDonors}
Donor Levels:
Major: ${getDonorLevelRange('major', levelThresholds)}
Mid-level: ${getDonorLevelRange('mid', levelThresholds)}
Core: ${getDonorLevelRange('core', levelThresholds)}
Entry: ${getDonorLevelRange('entry', levelThresholds)}

Gift Levels:
${stats.giftLevelData.map(level => `${level.name}: ${level.gifts} gifts, $${level.amount.toFixed(2)}`).join('\n')}
    `.trim();

    navigator.clipboard.writeText(text);
    alert('Summary copied to clipboard!');
  };

  const copySheetSummaryToClipboard = () => {
    if (!stats) return;

    navigator.clipboard.writeText(buildGoogleSheetsTsv(stats.sheetSummaryColumns));
    alert('Google Sheets summary copied to clipboard!');
  };

  const printReport = () => {
    window.print();
  };

  return (
    <div className="min-h-screen bg-slate-50/50 text-neutral-800 p-6 sm:p-8 font-sans antialiased selection:bg-blue-100">
      <div className="max-w-6xl mx-auto space-y-6">
        <header className="flex flex-col md:flex-row md:justify-between md:items-center gap-4 pb-6 border-b border-neutral-200/80 print:hidden">
          <div>
            <h1 className="text-3xl font-extrabold text-neutral-900 tracking-tight bg-gradient-to-r from-blue-600 to-indigo-600 bg-clip-text text-transparent">
              Donors Summary Dashboard
            </h1>
            <div className="text-neutral-500 text-sm mt-1 font-medium flex items-center gap-2">
              {fileName ? (
                <span className="inline-flex items-center gap-1.5 text-neutral-700 bg-neutral-100 px-2.5 py-0.5 rounded-full text-xs font-semibold">
                  <span className="w-1.5 h-1.5 bg-green-500 rounded-full animate-pulse" />
                  Active: {fileName}
                </span>
              ) : (
                <span>Upload one or more donation CSVs to view donation trends</span>
              )}
            </div>
          </div>
          
          <div className="flex flex-wrap gap-2 w-full md:w-auto">
            <label className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white px-4 py-2.5 rounded-xl cursor-pointer transition active:scale-95 font-semibold text-sm shadow-sm">
              <Upload className="w-4 h-4" />
              <span>{fileName ? 'Change CSVs' : 'Upload CSVs'}</span>
              <input type="file" accept=".csv" multiple onChange={handleFileUpload} className="hidden" />
            </label>
            {stats && (
              <>
                <button onClick={copyTableToClipboard} className="flex items-center gap-2 bg-white border border-neutral-200 px-4 py-2.5 rounded-xl hover:bg-neutral-50 hover:border-neutral-300 transition active:scale-95 text-sm font-semibold text-neutral-700 shadow-sm">
                  <Copy className="w-4 h-4 text-neutral-500" />
                  <span>Copy</span>
                </button>
                <button onClick={copySheetSummaryToClipboard} className="flex items-center gap-2 bg-white border border-neutral-200 px-4 py-2.5 rounded-xl hover:bg-neutral-50 hover:border-neutral-300 transition active:scale-95 text-sm font-semibold text-neutral-700 shadow-sm">
                  <Copy className="w-4 h-4 text-neutral-500" />
                  <span>Copy Sheet TSV</span>
                </button>
                <button onClick={printReport} className="flex items-center gap-2 bg-white border border-neutral-200 px-4 py-2.5 rounded-xl hover:bg-neutral-50 hover:border-neutral-300 transition active:scale-95 text-sm font-semibold text-neutral-700 shadow-sm">
                  <FileText className="w-4 h-4 text-neutral-500" />
                  <span>Print PDF</span>
                </button>
              </>
            )}
          </div>
        </header>

        {/* Print Header */}
        <div className="hidden print:block mb-8">
          <h1 className="text-4xl font-bold text-center">Donations Summary Report</h1>
        </div>

        {stats ? (
          <div className="space-y-6">
            <section className="bg-white p-6 rounded-2xl border border-neutral-200/60 shadow-[0_2px_8px_rgba(0,0,0,0.03)] print:hidden">
              <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6">
                <div className="flex items-center gap-3">
                  <div className="p-3 bg-blue-50 text-blue-600 rounded-xl">
                    <CalendarDays className="w-6 h-6" />
                  </div>
                  <div>
                    <h2 className="text-lg font-bold text-neutral-900">Timeline Filter</h2>
                    <p className="text-sm text-neutral-500 mt-0.5">
                      Showing <span className="font-semibold text-neutral-800">{stats.selectedGiftCount}</span> of <span className="font-semibold text-neutral-800">{stats.allGiftCount}</span> gifts
                    </p>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 w-full lg:w-auto lg:min-w-[720px]">
                  <label className="flex flex-col gap-1.5 cursor-pointer">
                    <span className="text-xs font-bold text-neutral-500 uppercase tracking-wider">Timeline type</span>
                    <select
                      value={timelineMode}
                      onChange={(event) => setTimelineMode(event.target.value as TimelineMode)}
                      className="w-full border border-neutral-200 rounded-xl px-3 py-2 text-sm bg-neutral-50 hover:bg-neutral-100/70 focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all font-semibold py-2.5"
                    >
                      <option value="all">All data</option>
                      <option value="month">Month</option>
                      <option value="range">Date range</option>
                    </select>
                  </label>

                  <label className="flex flex-col gap-1.5 cursor-pointer">
                    <span className="text-xs font-bold text-neutral-500 uppercase tracking-wider">Month</span>
                    <select
                      value={activeSelectedMonth}
                      onChange={(event) => setSelectedMonth(event.target.value)}
                      disabled={timelineMode !== 'month' || availableMonths.length === 0}
                      className="w-full border border-neutral-200 rounded-xl px-3 py-2 text-sm bg-neutral-50 disabled:bg-neutral-100 disabled:text-neutral-400 focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all font-semibold py-2.5"
                    >
                      {availableMonths.length === 0 ? (
                        <option value="">No dated gifts</option>
                      ) : (
                        availableMonths.map(month => (
                          <option key={month.value} value={month.value}>{month.label}</option>
                        ))
                      )}
                    </select>
                  </label>

                  <label className="flex flex-col gap-1.5 cursor-pointer">
                    <span className="text-xs font-bold text-neutral-500 uppercase tracking-wider">Start date</span>
                    <input
                      type="date"
                      value={startDate}
                      onChange={(event) => setStartDate(event.target.value)}
                      disabled={timelineMode !== 'range'}
                      className="w-full border border-neutral-200 rounded-xl px-3 py-2 text-sm bg-neutral-50 disabled:bg-neutral-100 disabled:text-neutral-400 focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all font-semibold py-2.5"
                    />
                  </label>

                  <label className="flex flex-col gap-1.5 cursor-pointer">
                    <span className="text-xs font-bold text-neutral-500 uppercase tracking-wider">End date</span>
                    <input
                      type="date"
                      value={endDate}
                      onChange={(event) => setEndDate(event.target.value)}
                      disabled={timelineMode !== 'range'}
                      className="w-full border border-neutral-200 rounded-xl px-3 py-2 text-sm bg-neutral-50 disabled:bg-neutral-100 disabled:text-neutral-400 focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all font-semibold py-2.5"
                    />
                  </label>
                </div>
              </div>
            </section>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-4">
              <StatCard title="Total Amount" value={formatCurrency(stats.totalAmount)} icon={<DollarSign className="w-5 h-5 text-emerald-600" />} />
              <StatCard title="Total Donors" value={stats.totalDonors.toString()} icon={<Users className="w-5 h-5 text-blue-600" />} />
              <StatCard title="Repeat Donors" value={stats.repeatDonors.toString()} icon={<Users className="w-5 h-5 text-indigo-600" />} />
              <StatCard title="Total Gifts" value={stats.totalGifts.toString()} icon={<Gift className="w-5 h-5 text-purple-600" />} />
              <StatCard title="Median Gift" value={formatCurrency(stats.median)} icon={<DollarSign className="w-5 h-5 text-teal-600" />} />
            </div>

            <div className="grid grid-cols-1 xl:grid-cols-5 gap-6">
              <section className="bg-white p-6 rounded-2xl border border-neutral-200/60 shadow-[0_2px_8px_rgba(0,0,0,0.03)] xl:col-span-3 flex flex-col justify-between">
                <div>
                  <h3 className="text-lg font-bold text-neutral-900 mb-5">Giving Trend</h3>
                  <div className="h-72">
                    <ResponsiveContainer width="100%" height="100%" minWidth={0} minHeight={288} initialDimension={{ width: 800, height: 288 }}>
                      <AreaChart data={stats.trendData}>
                        <defs>
                          <linearGradient id="colorAmount" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="5%" stopColor="#4f46e5" stopOpacity={0.15}/>
                            <stop offset="95%" stopColor="#4f46e5" stopOpacity={0}/>
                          </linearGradient>
                        </defs>
                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#F3F4F6" />
                        <XAxis dataKey="date" interval={0} tickLine={false} axisLine={false} tick={{fill: '#9CA3AF', fontSize: 11}} dy={10} />
                        <YAxis tickLine={false} axisLine={false} tick={{fill: '#9CA3AF', fontSize: 11}} dx={-10} tickFormatter={(value) => `$${value}`} />
                        <Tooltip 
                          contentStyle={{ borderRadius: '12px', border: '1px solid #E5E7EB', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.05)' }}
                          formatter={(value: unknown) => {
                            const amount = typeof value === 'number' ? value : Number(value);
                            return [`$${amount.toFixed(2)}`, 'Amount'];
                          }}
                        />
                        <Area type="monotone" dataKey="amount" stroke="#4f46e5" strokeWidth={2.5} fillOpacity={1} fill="url(#colorAmount)" />
                      </AreaChart>
                    </ResponsiveContainer>
                  </div>
                </div>
                
                <div className="mt-6 border border-neutral-200 rounded-xl overflow-hidden">
                  <div className="overflow-x-auto max-h-72 overflow-y-auto">
                    <table className="w-full text-sm">
                      <caption className="sr-only">Monthly giving summary</caption>
                      <thead>
                        <tr className="bg-neutral-50 border-b border-neutral-200 text-left text-xs uppercase font-bold text-neutral-500">
                          <th className="py-3 px-4 font-bold">Period</th>
                          <th className="py-3 px-4 font-bold text-right">Donors</th>
                          <th className="py-3 px-4 font-bold text-right">Gifts</th>
                          <th className="py-3 px-4 font-bold text-right">Median</th>
                          <th className="py-3 px-4 font-bold text-right">Amount</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-neutral-100 bg-white">
                        {stats.sheetSummaryColumns.map((column) => (
                          <tr key={column.label} className={column.label === 'All' ? 'bg-blue-50/30 font-bold text-blue-900 border-t border-neutral-200' : 'text-neutral-600 font-medium hover:bg-neutral-50/50'}>
                            <td className="py-2.5 px-4 whitespace-nowrap">{column.label}</td>
                            <td className="py-2.5 px-4 text-right">{column.totalDonors}</td>
                            <td className="py-2.5 px-4 text-right">{column.totalGifts}</td>
                            <td className="py-2.5 px-4 text-right">{formatCurrency(column.medianDonation)}</td>
                            <td className="py-2.5 px-4 text-right font-bold text-neutral-900">{formatCurrency(column.totalAmount)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </section>

              <div className="xl:col-span-2 flex flex-col gap-6">
                <section className="bg-white p-6 rounded-2xl border border-neutral-200/60 shadow-[0_2px_8px_rgba(0,0,0,0.03)]">
                  <h3 className="text-lg font-bold text-neutral-900 mb-5">Donor Level Revenue</h3>
                  <div className="space-y-4">
                    {stats.donorLevelData.map(level => (
                      <BreakdownRow
                        key={level.id}
                        label={level.name}
                        count={level.donors}
                        total={stats.totalDonors}
                        detail={`${getDonorLevelRange(level.id, levelThresholds)} · ${formatCurrency(level.amount)}`}
                      />
                    ))}
                  </div>
                </section>

                <section className="bg-white p-6 rounded-2xl border border-neutral-200/60 shadow-[0_2px_8px_rgba(0,0,0,0.03)]">
                  <h3 className="text-lg font-bold text-neutral-900 mb-5">Individual Gift Level Mix</h3>
                  <div className="h-72">
                    <ResponsiveContainer width="100%" height="100%" minWidth={0} minHeight={288} initialDimension={{ width: 480, height: 288 }}>
                      <BarChart data={stats.giftLevelData} layout="vertical" margin={{ left: 18, right: 16 }}>
                        <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#F3F4F6" />
                        <XAxis type="number" tickLine={false} axisLine={false} tick={{fill: '#9CA3AF', fontSize: 11}} />
                        <YAxis type="category" dataKey="name" width={76} tickLine={false} axisLine={false} tick={{fill: '#525252', fontSize: 11}} />
                        <Tooltip
                          contentStyle={{ borderRadius: '12px', border: '1px solid #E5E7EB', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.05)' }}
                          formatter={(value: unknown, name: unknown) => [
                            name === 'amount' ? formatCurrency(Number(value)) : String(value),
                            name === 'amount' ? 'Amount' : 'Gifts'
                          ]}
                        />
                        <Bar dataKey="gifts" fill="#4f46e5" radius={[0, 4, 4, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </section>
              </div>
            </div>

            {/* Detailed Data Explorer (Tabbed View) */}
            <div className="bg-white rounded-2xl shadow-[0_2px_8px_rgba(0,0,0,0.03)] border border-neutral-200/60 overflow-hidden">
              <div className="border-b border-neutral-200 p-6 flex flex-col md:flex-row md:items-center md:justify-between gap-4">
                <div>
                  <h3 className="text-xl font-bold text-neutral-900">Detailed Data Explorer</h3>
                  <p className="text-sm text-neutral-500 mt-1">Investigate individual donor histories or view raw donation records</p>
                </div>
                <div className="flex bg-neutral-100 p-1 rounded-xl w-fit">
                  <button
                    onClick={() => setActiveTab('donors')}
                    className={`px-4 py-2 rounded-lg text-sm font-semibold transition-all duration-200 ${
                      activeTab === 'donors'
                        ? 'bg-white text-blue-600 shadow-sm'
                        : 'text-neutral-500 hover:text-neutral-900'
                    }`}
                  >
                    Donor Investigation Table ({filteredDonors.length})
                  </button>
                  <button
                    onClick={() => setActiveTab('records')}
                    className={`px-4 py-2 rounded-lg text-sm font-semibold transition-all duration-200 ${
                      activeTab === 'records'
                        ? 'bg-white text-blue-600 shadow-sm'
                        : 'text-neutral-500 hover:text-neutral-900'
                    }`}
                  >
                    All Records ({sortedRecords.length})
                  </button>
                </div>
              </div>

              <section className={`p-6 space-y-6 ${activeTab === 'donors' ? 'block' : 'hidden'}`}>
                {/* Top Bar: Search and Thresholds */}
                <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center gap-6 pb-6 border-b border-neutral-100">
                  <label className="w-full lg:max-w-md flex flex-col gap-1.5 cursor-pointer">
                    <span className="text-xs font-bold text-neutral-500 uppercase tracking-wider">Search Donors</span>
                    <div className="relative w-full">
                      <Search className="w-4 h-4 text-neutral-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                      <input
                        type="search"
                        value={searchTerm}
                        onChange={(event) => setSearchTerm(event.target.value)}
                        placeholder="Search donor, ID, or city"
                        className="w-full border border-neutral-200 rounded-xl pl-10 pr-4 py-2 text-sm bg-neutral-50 hover:bg-neutral-100/70 focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all py-2.5"
                      />
                    </div>
                  </label>

                  {/* Thresholds */}
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 w-full lg:w-auto lg:min-w-[540px]">
                    <label className="flex flex-col gap-1.5 cursor-pointer">
                      <span className="text-xs font-bold text-neutral-500 uppercase tracking-wider">Major minimum</span>
                      <input
                        type="number"
                        min="0"
                        step="25"
                        value={levelThresholds.major}
                        onChange={(event) => updateThreshold('major', event.target.value)}
                        className="w-full border border-neutral-200 rounded-xl px-3 py-2 text-sm bg-neutral-50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all font-semibold py-2.5"
                      />
                    </label>
                    <label className="flex flex-col gap-1.5 cursor-pointer">
                      <span className="text-xs font-bold text-neutral-500 uppercase tracking-wider">Mid-level minimum</span>
                      <input
                        type="number"
                        min="0"
                        step="25"
                        value={levelThresholds.mid}
                        onChange={(event) => updateThreshold('mid', event.target.value)}
                        className="w-full border border-neutral-200 rounded-xl px-3 py-2 text-sm bg-neutral-50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all font-semibold py-2.5"
                      />
                    </label>
                    <label className="flex flex-col gap-1.5 cursor-pointer">
                      <span className="text-xs font-bold text-neutral-500 uppercase tracking-wider">Core minimum</span>
                      <input
                        type="number"
                        min="0"
                        step="25"
                        value={levelThresholds.core}
                        onChange={(event) => updateThreshold('core', event.target.value)}
                        className="w-full border border-neutral-200 rounded-xl px-3 py-2 text-sm bg-neutral-50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all font-semibold py-2.5"
                      />
                    </label>
                  </div>
                </div>

                {/* Filter Buttons */}
                <div>
                  <span className="text-xs font-bold text-neutral-500 uppercase tracking-wider block mb-3">Filter by Level</span>
                  <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-3">
                    {donorFilters.map((filter) => {
                      const isActive = activeFilter === filter.id;
                      const count = filter.id === 'all'
                        ? stats.totalDonors
                        : filter.id === 'repeat'
                          ? stats.repeatDonors
                          : stats.donorSummaries.filter(donor => donor.segment === filter.id).length;

                      return (
                        <button
                          key={filter.id}
                          type="button"
                          onClick={() => setActiveFilter(filter.id)}
                          className={`text-left border rounded-xl p-4 transition-all duration-300 active:scale-[0.98] ${
                            isActive
                              ? 'border-blue-500 bg-blue-50/50 shadow-sm ring-1 ring-blue-500'
                              : 'border-neutral-200 bg-white hover:border-neutral-300 hover:shadow-sm'
                          }`}
                          aria-pressed={isActive}
                        >
                          <span className="block text-sm font-bold text-neutral-800">{filter.label}</span>
                          <span className="block text-[11px] text-neutral-400 font-medium mt-0.5">{getDonorLevelRange(filter.id, levelThresholds)}</span>
                          <span className="block text-2xl font-extrabold text-neutral-900 mt-2">{count}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Table */}
                <div className="border border-neutral-200/80 rounded-xl overflow-hidden shadow-sm">
                  <div className="p-4 bg-neutral-50 border-b border-neutral-200 flex justify-between items-center">
                    <h3 className="text-sm font-bold text-neutral-800">Donor Investigation Table</h3>
                    <span className="text-xs font-semibold text-neutral-500 bg-white border border-neutral-200 px-2.5 py-1 rounded-full shadow-sm">
                      {filteredDonors.length} matching donors
                    </span>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead className="bg-neutral-50 text-neutral-500 border-b border-neutral-200 text-left">
                        <tr>
                          <th className="font-semibold px-6 py-3">Donor</th>
                          <th className="font-semibold px-4 py-3 text-right">Timeline Total</th>
                          <th className="font-semibold px-4 py-3 text-right">Gifts</th>
                          <th className="font-semibold px-4 py-3 text-right">Avg</th>
                          <th className="font-semibold px-4 py-3">Level</th>
                          <th className="font-semibold px-4 py-3">Latest</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-neutral-100 bg-white">
                        {filteredDonors.slice(0, 50).map((donor) => (
                          <tr key={donor.key} className="hover:bg-neutral-50/80 transition-colors">
                            <td className="px-6 py-3.5 min-w-56">
                              <div className="font-bold text-neutral-950">{donor.name}</div>
                              <div className="text-xs text-neutral-400 mt-0.5 font-medium">
                                {donor.key}
                                {donor.city ? ` · ${donor.city}${donor.state ? `, ${donor.state}` : ''}` : ''}
                              </div>
                            </td>
                            <td className="px-4 py-3.5 text-right font-bold text-neutral-900">{formatCurrency(donor.totalAmount)}</td>
                            <td className="px-4 py-3.5 text-right font-semibold text-neutral-600">{donor.giftCount}</td>
                            <td className="px-4 py-3.5 text-right font-medium text-neutral-600">{formatCurrency(donor.averageGift)}</td>
                            <td className="px-4 py-3.5">
                              <span className={`inline-flex items-center rounded-lg px-2.5 py-1 text-xs font-bold border ${
                                donor.segment === 'major'
                                  ? 'bg-emerald-50 border-emerald-200 text-emerald-700'
                                  : donor.segment === 'mid'
                                    ? 'bg-blue-50 border-blue-200 text-blue-700'
                                    : donor.segment === 'core'
                                      ? 'bg-indigo-50 border-indigo-200 text-indigo-700'
                                      : 'bg-neutral-50 border-neutral-200 text-neutral-700'
                              }`}>
                                {getSegmentLabel(donor.segment)}
                              </span>
                            </td>
                            <td className="px-4 py-3.5 text-neutral-500 font-medium whitespace-nowrap">{donor.lastGift}</td>
                          </tr>
                        ))}
                        {filteredDonors.length === 0 && (
                          <tr>
                            <td className="px-6 py-12 text-center text-neutral-400 font-medium border-0" colSpan={6}>
                              No donors match the current filters.
                            </td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
              </section>

              <section className={`p-6 space-y-4 ${activeTab === 'records' ? 'block' : 'hidden'}`}>
                <div className="flex justify-between items-center pb-4 border-b border-neutral-100">
                  <div>
                    <h3 className="text-lg font-bold text-neutral-900">All Records</h3>
                    <p className="text-xs text-neutral-400 font-medium mt-0.5">
                      {sortedRecords.length} individual donation{sortedRecords.length !== 1 ? 's' : ''} in selected timeline
                    </p>
                  </div>
                  <button
                    onClick={copyRecordsToClipboard}
                    disabled={sortedRecords.length === 0}
                    className="flex items-center gap-2 bg-white border border-neutral-200 px-4 py-2 rounded-xl hover:bg-neutral-50 hover:border-neutral-300 transition active:scale-95 text-sm font-semibold text-neutral-700 disabled:opacity-50 shadow-sm"
                  >
                    <Copy className="w-4 h-4 text-neutral-500" />
                    <span>Copy TSV</span>
                  </button>
                </div>

                <div className="border border-neutral-200 rounded-xl overflow-hidden shadow-sm">
                  <div className="overflow-x-auto max-h-[500px] overflow-y-auto">
                    <table className="w-full text-sm">
                      <thead className="bg-neutral-50 text-neutral-500 border-b border-neutral-200 text-left sticky top-0 z-10">
                        <tr>
                          <th className="font-semibold px-6 py-3 bg-neutral-50">Date</th>
                          <th className="font-semibold px-4 py-3 bg-neutral-50">Donor</th>
                          <th className="font-semibold px-4 py-3 text-right bg-neutral-50">Amount</th>
                          <th className="font-semibold px-4 py-3 bg-neutral-50">City</th>
                          <th className="font-semibold px-4 py-3 bg-neutral-50">State</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-neutral-100 bg-white">
                        {sortedRecords.map((record, index) => (
                          <tr key={`${record.donorKey}-${record.date}-${record.amount}-${index}`} className="hover:bg-neutral-50/80 transition-colors">
                            <td className="px-6 py-3.5 whitespace-nowrap text-neutral-600 font-medium">{record.date}</td>
                            <td className="px-4 py-3.5">
                              <div className="font-bold text-neutral-900">{record.donorName}</div>
                              <div className="text-xs text-neutral-400 mt-0.5 font-medium">{record.donorKey}</div>
                            </td>
                            <td className="px-4 py-3.5 text-right font-bold text-neutral-900">{formatCurrency(record.amount)}</td>
                            <td className="px-4 py-3.5 text-neutral-500 font-medium">{record.city || '—'}</td>
                            <td className="px-4 py-3.5 text-neutral-500 font-medium">{record.state || '—'}</td>
                          </tr>
                        ))}
                        {sortedRecords.length === 0 && (
                          <tr>
                            <td className="px-6 py-12 text-center text-neutral-400 font-medium border-0" colSpan={5}>
                              No records in the selected timeline.
                            </td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
              </section>
            </div>
          </div>
        ) : (
          <div className="relative overflow-hidden bg-white rounded-3xl border border-neutral-200/60 shadow-[0_8px_30px_rgb(0,0,0,0.02)] p-8 md:p-12 lg:p-16 max-w-4xl mx-auto print:hidden">
            <div className="absolute top-0 right-0 -mt-24 -mr-24 w-96 h-96 bg-blue-50 rounded-full blur-3xl opacity-60 pointer-events-none" />
            <div className="absolute bottom-0 left-0 -mb-24 -ml-24 w-96 h-96 bg-indigo-50 rounded-full blur-3xl opacity-60 pointer-events-none" />

            <div className="relative flex flex-col items-center text-center max-w-2xl mx-auto">
              <div className="inline-flex items-center justify-center p-4 bg-gradient-to-tr from-blue-500 to-indigo-600 text-white rounded-2xl shadow-lg shadow-blue-500/20 mb-6">
                <Upload className="w-8 h-8" />
              </div>
              <h2 className="text-3xl font-extrabold text-neutral-900 tracking-tight sm:text-4xl">
                No data uploaded
              </h2>
              <p className="mt-4 text-base text-neutral-500 leading-relaxed">
                Get started by uploading your donation CSV records.
              </p>

              <div className="mt-8 flex flex-col sm:flex-row gap-3 w-full justify-center">
                <label className="flex items-center justify-center gap-2 bg-neutral-900 text-white px-6 py-3 rounded-xl cursor-pointer hover:bg-neutral-800 active:scale-95 transition-all duration-200 font-semibold shadow-md shadow-neutral-900/10">
                  <Upload className="w-4.5 h-4.5" />
                  <span>Select CSV Files</span>
                  <input type="file" accept=".csv" multiple onChange={handleFileUpload} className="hidden" />
                </label>
              </div>

              <div className="mt-12 grid grid-cols-1 sm:grid-cols-3 gap-6 text-left border-t border-neutral-100 pt-8 w-full">
                <div className="flex gap-3">
                  <div className="mt-1 flex items-center justify-center w-6 h-6 rounded-full bg-blue-50 text-blue-600 text-xs font-bold shrink-0">1</div>
                  <div>
                    <h4 className="font-bold text-neutral-900 text-sm">Upload CSVs</h4>
                    <p className="text-xs text-neutral-500 mt-1">Accepts multiple standard monthly reports.</p>
                  </div>
                </div>
                <div className="flex gap-3">
                  <div className="mt-1 flex items-center justify-center w-6 h-6 rounded-full bg-blue-50 text-blue-600 text-xs font-bold shrink-0">2</div>
                  <div>
                    <h4 className="font-bold text-neutral-900 text-sm">Segment Donors</h4>
                    <p className="text-xs text-neutral-500 mt-1">Configure thresholds to map major & core givers.</p>
                  </div>
                </div>
                <div className="flex gap-3">
                  <div className="mt-1 flex items-center justify-center w-6 h-6 rounded-full bg-blue-50 text-blue-600 text-xs font-bold shrink-0">3</div>
                  <div>
                    <h4 className="font-bold text-neutral-900 text-sm">Analyze & Export</h4>
                    <p className="text-xs text-neutral-500 mt-1">Export TSV direct to Google Sheets format.</p>
                  </div>
                </div>
              </div>

              <div className="mt-8 text-xs text-neutral-400 bg-neutral-50 px-4 py-2.5 rounded-lg border border-neutral-100/80 max-w-md">
                <span className="font-semibold text-neutral-600">Privacy Note:</span> All data is processed entirely in your web browser. No sensitive information is ever uploaded, sent to, or stored on any server.
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

const StatCard = ({ title, value, icon }: { title: string, value: string, icon: React.ReactNode }) => (
  <div className="bg-white p-6 rounded-2xl border border-neutral-200/60 shadow-[0_2px_8px_rgba(0,0,0,0.02)] hover:shadow-[0_8px_30px_rgb(0,0,0,0.04)] transition-all duration-300 flex flex-col justify-between relative overflow-hidden group">
    <span className="text-xs font-bold text-neutral-400 uppercase tracking-wider">{title}</span>
    <div className="absolute top-5 right-5 p-2.5 bg-neutral-50 text-neutral-500 rounded-xl group-hover:bg-blue-50 group-hover:text-blue-600 transition-colors duration-300">
      {icon}
    </div>
    <div className="mt-4">
      <p className="text-2xl lg:text-3xl font-extrabold text-neutral-955 text-neutral-950 tracking-tight break-words">{value}</p>
    </div>
  </div>
);

const BreakdownRow = ({ label, count, total, detail }: { label: string, count: number, total: number, detail?: string }) => {
  const percentage = total > 0 ? (count / total) * 100 : 0;
  return (
    <div>
      <div className="flex justify-between text-sm mb-1.5">
        <span className="font-semibold text-neutral-700">{label}</span>
        <span className="font-bold text-neutral-900">
          {count} <span className="text-neutral-400 font-medium">({percentage.toFixed(1)}%)</span>
        </span>
      </div>
      {detail ? <div className="text-xs text-neutral-400 mb-2 font-medium">{detail}</div> : null}
      <div className="w-full bg-neutral-100 rounded-full h-2">
        <div className="bg-gradient-to-r from-blue-500 to-indigo-600 h-2 rounded-full transition-all duration-500" style={{ width: `${percentage}%` }}></div>
      </div>
    </div>
  );
};

export default App;
