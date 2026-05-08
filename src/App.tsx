import React, { useState, useMemo } from 'react';
import Papa from 'papaparse';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, BarChart, Bar } from 'recharts';
import { Upload, Copy, FileText, DollarSign, Users, Gift, Search } from 'lucide-react';

type DonationRow = Record<string, string | undefined>;
type DonorFilter = 'all' | 'major' | 'mid' | 'core' | 'entry' | 'repeat';
type ThresholdKey = 'major' | 'mid' | 'core';

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
  if (filter === 'major') return `${formatThreshold(thresholds.major)}+ yearly`;
  if (filter === 'mid') return `${formatThreshold(thresholds.mid)}-${formatThreshold(Math.max(thresholds.mid, thresholds.major - 1))} yearly`;
  if (filter === 'core') return `${formatThreshold(thresholds.core)}-${formatThreshold(Math.max(thresholds.core, thresholds.mid - 1))} yearly`;
  if (filter === 'entry') return `< ${formatThreshold(thresholds.core)} yearly`;
  if (filter === 'repeat') return '2+ gifts';
  return 'All yearly totals';
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

  const updateThreshold = (key: ThresholdKey, value: string) => {
    const amount = Math.max(0, Number(value) || 0);
    setLevelThresholds((current) => ({ ...current, [key]: amount }));
  };

  const stats = useMemo(() => {
    if (parsedData.length === 0) return null;

    const donorSummaries = summarizeDonors(parsedData, levelThresholds);
    const totalDonors = donorSummaries.length;
    const amounts = parsedData.map(d => d.amount);
    const median = getMedian(amounts);
    const totalAmount = parsedData.reduce((sum, d) => sum + d.amount, 0);
    const repeatDonors = donorSummaries.filter(donor => donor.giftCount > 1).length;
    const largestGift = Math.max(...amounts, 0);

    const trendData = buildMonthlyTrendData(parsedData);

    const giftLevelData = giftLevels.map(level => {
      const gifts = parsedData.filter(donation => donation.amount >= level.min && donation.amount < level.max);
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
      averageGift: totalAmount / parsedData.length,
      repeatDonors,
      largestGift,
      trendData,
      totalGifts: parsedData.length,
      totalAmount,
      donorSummaries,
      giftLevelData,
      donorLevelData,
      sheetSummaryColumns: buildSheetSummaryColumns(parsedData),
    };

  }, [levelThresholds, parsedData]);

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
    <div className="min-h-screen bg-neutral-50 text-neutral-900 p-8 font-sans">
      <div className="max-w-6xl mx-auto space-y-8">
        <header className="flex flex-col md:flex-row md:justify-between md:items-center gap-4 mb-8 print:hidden">
          <div className="w-full md:w-auto">
            <h1 className="text-3xl font-bold">Donations Summary Dashboard</h1>
            <p className="text-neutral-500 mt-1">Upload one or more donation CSVs to view year-to-date trends</p>
          </div>
          
          <div className="flex flex-wrap gap-3 w-full md:w-auto">
            <label className="flex items-center gap-2 bg-blue-600 text-white px-4 py-2 rounded-lg cursor-pointer hover:bg-blue-700 transition font-medium shadow-sm">
              <Upload className="w-5 h-5" />
              <span>{fileName ? 'Change CSVs' : 'Upload CSVs'}</span>
              <input type="file" accept=".csv" multiple onChange={handleFileUpload} className="hidden" />
            </label>
            {stats && (
              <>
                <button onClick={copyTableToClipboard} className="flex items-center gap-2 bg-white border border-neutral-300 px-4 py-2 rounded-lg hover:bg-neutral-50 transition shadow-sm font-medium">
                  <Copy className="w-5 h-5" />
                  <span>Copy</span>
                </button>
                <button onClick={copySheetSummaryToClipboard} className="flex items-center gap-2 bg-white border border-neutral-300 px-4 py-2 rounded-lg hover:bg-neutral-50 transition shadow-sm font-medium">
                  <Copy className="w-5 h-5" />
                  <span>Copy Sheet TSV</span>
                </button>
                <button onClick={printReport} className="flex items-center gap-2 bg-white border border-neutral-300 px-4 py-2 rounded-lg hover:bg-neutral-50 transition shadow-sm font-medium">
                  <FileText className="w-5 h-5" />
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
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-5 gap-4">
              <StatCard title="Total Amount" value={formatCurrency(stats.totalAmount)} icon={<DollarSign className="w-6 h-6 text-green-600" />} />
              <StatCard title="Total Donors" value={stats.totalDonors.toString()} icon={<Users className="w-6 h-6 text-blue-500" />} />
              <StatCard title="Repeat Donors" value={stats.repeatDonors.toString()} icon={<Users className="w-6 h-6 text-indigo-500" />} />
              <StatCard title="Total Gifts" value={stats.totalGifts.toString()} icon={<Gift className="w-6 h-6 text-purple-500" />} />
              <StatCard title="Median Gift" value={formatCurrency(stats.median)} icon={<DollarSign className="w-6 h-6 text-emerald-500" />} />
            </div>

            <section className="bg-white p-5 rounded-lg shadow-sm border border-neutral-200 print:hidden">
              <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
                <div>
                  <h2 className="text-lg font-semibold">Explore Donor Levels</h2>
                  <p className="text-sm text-neutral-500 mt-1">{filteredDonors.length} donors shown from {stats.totalDonors} total · levels use yearly donor total</p>
                </div>
                <div className="relative w-full lg:w-80">
                  <Search className="w-4 h-4 text-neutral-400 absolute left-3 top-1/2 -translate-y-1/2" />
                  <input
                    type="search"
                    value={searchTerm}
                    onChange={(event) => setSearchTerm(event.target.value)}
                    placeholder="Search donor, ID, or city"
                    className="w-full border border-neutral-300 rounded-md pl-9 pr-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-3 mt-5">
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
                      className={`text-left border rounded-lg p-3 transition ${isActive ? 'border-blue-600 bg-blue-50' : 'border-neutral-200 bg-white hover:border-neutral-300'}`}
                      aria-pressed={isActive}
                    >
                      <span className="block text-sm font-semibold text-neutral-900">{filter.label}</span>
                      <span className="block text-xs text-neutral-500 mt-1">{getDonorLevelRange(filter.id, levelThresholds)}</span>
                      <span className="block text-2xl font-bold mt-1">{count}</span>
                    </button>
                  );
                })}
              </div>

              <div className="mt-5 border-t border-neutral-200 pt-5">
                <div className="flex flex-col lg:flex-row lg:items-end gap-4">
                  <div className="lg:w-64">
                    <h3 className="text-sm font-semibold text-neutral-900">Donor Level Thresholds</h3>
                    <p className="text-xs text-neutral-500 mt-1">Entry is below Core; individual gift bands stay separate.</p>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 flex-1">
                    <label className="block">
                      <span className="text-xs font-semibold text-neutral-600">Major minimum</span>
                      <input
                        type="number"
                        min="0"
                        step="25"
                        value={levelThresholds.major}
                        onChange={(event) => updateThreshold('major', event.target.value)}
                        className="mt-1 w-full border border-neutral-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                      />
                    </label>
                    <label className="block">
                      <span className="text-xs font-semibold text-neutral-600">Mid-level minimum</span>
                      <input
                        type="number"
                        min="0"
                        step="25"
                        value={levelThresholds.mid}
                        onChange={(event) => updateThreshold('mid', event.target.value)}
                        className="mt-1 w-full border border-neutral-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                      />
                    </label>
                    <label className="block">
                      <span className="text-xs font-semibold text-neutral-600">Core minimum</span>
                      <input
                        type="number"
                        min="0"
                        step="25"
                        value={levelThresholds.core}
                        onChange={(event) => updateThreshold('core', event.target.value)}
                        className="mt-1 w-full border border-neutral-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                      />
                    </label>
                  </div>
                </div>
              </div>
            </section>

            <div className="grid grid-cols-1 xl:grid-cols-5 gap-6">
              <section className="bg-white p-6 rounded-lg shadow-sm border border-neutral-200 xl:col-span-3">
                <h3 className="text-lg font-semibold mb-5">Giving Trend</h3>
                <div className="h-72">
                  <ResponsiveContainer width="100%" height="100%" minWidth={0} minHeight={288} initialDimension={{ width: 800, height: 288 }}>
                    <AreaChart data={stats.trendData}>
                      <defs>
                        <linearGradient id="colorAmount" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.2}/>
                          <stop offset="95%" stopColor="#3b82f6" stopOpacity={0}/>
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E5E7EB" />
                      <XAxis dataKey="date" interval={0} tickLine={false} axisLine={false} tick={{fill: '#6B7280', fontSize: 12}} dy={10} />
                      <YAxis tickLine={false} axisLine={false} tick={{fill: '#6B7280'}} dx={-10} tickFormatter={(value) => `$${value}`} />
                      <Tooltip 
                        contentStyle={{ borderRadius: '8px', border: '1px solid #E5E7EB', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }}
                        formatter={(value: unknown) => {
                          const amount = typeof value === 'number' ? value : Number(value);
                          return [`$${amount.toFixed(2)}`, 'Amount'];
                        }}
                      />
                      <Area type="monotone" dataKey="amount" stroke="#3b82f6" strokeWidth={3} fillOpacity={1} fill="url(#colorAmount)" />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
                <div className="mt-6 overflow-x-auto">
                  <table className="w-full min-w-[640px] text-sm">
                    <caption className="sr-only">Monthly giving summary</caption>
                    <thead>
                      <tr className="border-b border-neutral-200 text-left text-xs uppercase text-neutral-500">
                        <th className="py-2 pr-4 font-semibold">Period</th>
                        <th className="py-2 pr-4 font-semibold text-right">Donors</th>
                        <th className="py-2 pr-4 font-semibold text-right">Gifts</th>
                        <th className="py-2 pr-4 font-semibold text-right">Median</th>
                        <th className="py-2 font-semibold text-right">Amount</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-neutral-100">
                      {stats.sheetSummaryColumns.map((column) => (
                        <tr key={column.label} className={column.label === 'All' ? 'font-semibold text-neutral-950' : 'text-neutral-700'}>
                          <td className="py-2 pr-4 whitespace-nowrap">{column.label}</td>
                          <td className="py-2 pr-4 text-right">{column.totalDonors}</td>
                          <td className="py-2 pr-4 text-right">{column.totalGifts}</td>
                          <td className="py-2 pr-4 text-right">{formatCurrency(column.medianDonation)}</td>
                          <td className="py-2 text-right">{formatCurrency(column.totalAmount)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </section>

              <section className="bg-white p-6 rounded-lg shadow-sm border border-neutral-200 xl:col-span-2">
                <h3 className="text-lg font-semibold mb-5">Individual Gift Level Mix</h3>
                <div className="h-72">
                  <ResponsiveContainer width="100%" height="100%" minWidth={0} minHeight={288} initialDimension={{ width: 480, height: 288 }}>
                    <BarChart data={stats.giftLevelData} layout="vertical" margin={{ left: 18, right: 16 }}>
                      <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#E5E7EB" />
                      <XAxis type="number" tickLine={false} axisLine={false} tick={{fill: '#6B7280'}} />
                      <YAxis type="category" dataKey="name" width={76} tickLine={false} axisLine={false} tick={{fill: '#525252', fontSize: 12}} />
                      <Tooltip
                        contentStyle={{ borderRadius: '8px', border: '1px solid #E5E7EB', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }}
                        formatter={(value: unknown, name: unknown) => [
                          name === 'amount' ? formatCurrency(Number(value)) : String(value),
                          name === 'amount' ? 'Amount' : 'Gifts'
                        ]}
                      />
                      <Bar dataKey="gifts" fill="#2563eb" radius={[0, 4, 4, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </section>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
              <section className="bg-white p-6 rounded-lg shadow-sm border border-neutral-200">
                <h3 className="text-lg font-semibold mb-5">Donor Level Revenue</h3>
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

              <section className="bg-white rounded-lg shadow-sm border border-neutral-200 lg:col-span-3 overflow-hidden">
                <div className="p-6 border-b border-neutral-200 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                  <div>
                    <h3 className="text-lg font-semibold">Donor Investigation Table</h3>
                    <p className="text-sm text-neutral-500 mt-1">Sorted by yearly donor total, then gift count</p>
                  </div>
                  <span className="text-sm font-semibold text-neutral-700">{filteredDonors.length} matching donors</span>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="bg-neutral-50 text-neutral-500 border-b border-neutral-200">
                      <tr>
                        <th className="text-left font-semibold px-6 py-3">Donor</th>
                        <th className="text-right font-semibold px-4 py-3">Yearly Total</th>
                        <th className="text-right font-semibold px-4 py-3">Gifts</th>
                        <th className="text-right font-semibold px-4 py-3">Avg</th>
                        <th className="text-left font-semibold px-4 py-3">Level</th>
                        <th className="text-left font-semibold px-4 py-3">Latest</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-neutral-100">
                      {filteredDonors.slice(0, 50).map((donor) => (
                        <tr key={donor.key} className="hover:bg-neutral-50">
                          <td className="px-6 py-3 min-w-56">
                            <div className="font-semibold text-neutral-900">{donor.name}</div>
                            <div className="text-xs text-neutral-500">{donor.key}{donor.city ? ` · ${donor.city}${donor.state ? `, ${donor.state}` : ''}` : ''}</div>
                          </td>
                          <td className="px-4 py-3 text-right font-semibold">{formatCurrency(donor.totalAmount)}</td>
                          <td className="px-4 py-3 text-right">{donor.giftCount}</td>
                          <td className="px-4 py-3 text-right">{formatCurrency(donor.averageGift)}</td>
                          <td className="px-4 py-3">
                            <span className="inline-flex items-center rounded-md border border-neutral-200 bg-neutral-50 px-2 py-1 text-xs font-semibold">
                              {getSegmentLabel(donor.segment)}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-neutral-600 whitespace-nowrap">{donor.lastGift}</td>
                        </tr>
                      ))}
                      {filteredDonors.length === 0 && (
                        <tr>
                          <td className="px-6 py-8 text-center text-neutral-500" colSpan={6}>No donors match the current filters.</td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </section>
            </div>
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center p-20 bg-white rounded-xl shadow-sm border border-neutral-200 border-dashed print:hidden">
            <div className="bg-blue-50 p-4 rounded-full mb-4">
              <Upload className="w-8 h-8 text-blue-500" />
            </div>
            <h3 className="text-xl font-medium mb-2">No data uploaded</h3>
            <p className="text-neutral-500 text-center max-w-sm">Upload one or more CSV files containing your donation records to view your dashboard.</p>
            <p className="text-neutral-500 text-center max-w-sm mt-6 text-sm bg-neutral-50 p-3 rounded-lg border border-neutral-100">
              <span className="font-semibold text-neutral-700">Privacy Note:</span> All data is processed entirely in your web browser. No sensitive information is ever uploaded, sent to, or stored on any server.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

const StatCard = ({ title, value, icon }: { title: string, value: string, icon: React.ReactNode }) => (
  <div className="bg-white p-6 rounded-xl shadow-sm border border-neutral-200 flex items-center gap-4">
    <div className="p-4 bg-neutral-50 rounded-lg">
      {icon}
    </div>
    <div>
      <p className="text-sm font-semibold text-neutral-500 uppercase tracking-wider">{title}</p>
      <p className="text-3xl font-bold text-neutral-900 mt-1">{value}</p>
    </div>
  </div>
);

const BreakdownRow = ({ label, count, total, detail }: { label: string, count: number, total: number, detail?: string }) => {
  const percentage = total > 0 ? (count / total) * 100 : 0;
  return (
    <div>
      <div className="flex justify-between text-sm mb-2">
        <span className="font-medium text-neutral-700">{label}</span>
        <span className="font-bold text-neutral-900">
          {count} <span className="text-neutral-400 font-normal">({percentage.toFixed(1)}%)</span>
        </span>
      </div>
      {detail ? <div className="text-xs text-neutral-500 mb-2">{detail}</div> : null}
      <div className="w-full bg-neutral-100 rounded-full h-2.5">
        <div className="bg-blue-600 h-2.5 rounded-full" style={{ width: `${percentage}%` }}></div>
      </div>
    </div>
  );
};

export default App;
