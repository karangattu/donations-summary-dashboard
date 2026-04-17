import React, { useState, useMemo } from 'react';
import Papa from 'papaparse';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { Upload, Copy, FileText, DollarSign, Users, Gift } from 'lucide-react';

interface Donation {
  'Contact ID': string;
  'Transaction Date': string;
  'Transaction Amount Subtotal': string;
  'First Name': string;
  'Last Name': string;
  'Email': string;
}

const App = () => {
  const [data, setData] = useState<Donation[]>([]);
  const [fileName, setFileName] = useState<string | null>(null);

  const handleFileUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      setFileName(file.name);
      Papa.parse(file, {
        header: true,
        skipEmptyLines: true,
        complete: (results) => {
          setData(results.data as Donation[]);
        },
      });
    }
  };

  const parsedData = useMemo(() => {
    return data.map(item => {
      const amountStr = item['Transaction Amount Subtotal'] || '0';
      const amount = parseFloat(amountStr.replace(/[$,]/g, ''));
      return {
        ...item,
        amount
      };
    }).filter(d => !isNaN(d.amount));
  }, [data]);

  const stats = useMemo(() => {
    if (parsedData.length === 0) return null;

    const totalDonors = new Set(parsedData.map(d => d['Contact ID'])).size;
    
    // Calculate Median
    const amounts = parsedData.map(d => d.amount).sort((a, b) => a - b);
    const MathMid = Math.floor(amounts.length / 2);
    const median = amounts.length === 0 ? 0 : (amounts.length % 2 !== 0 ? amounts[MathMid] : (amounts[MathMid - 1] + amounts[MathMid]) / 2);

    const giftsUnder50 = parsedData.filter(d => d.amount <= 50).length;
    const gifts50to100 = parsedData.filter(d => d.amount > 50 && d.amount <= 100).length;
    const gifts100to500 = parsedData.filter(d => d.amount > 100 && d.amount <= 500).length;
    const giftsOver500 = parsedData.filter(d => d.amount > 500).length;
    const totalAmount = parsedData.reduce((sum, d) => sum + d.amount, 0);

    // Daily trends
    const trendsByDate = parsedData.reduce((acc, curr) => {
      const date = curr['Transaction Date'];
      if (!acc[date]) acc[date] = 0;
      acc[date] += curr.amount;
      return acc;
    }, {} as Record<string, number>);

    const trendData = Object.entries(trendsByDate)
      .map(([date, amount]) => ({ date, amount }))
      .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

    return {
      totalDonors,
      median,
      giftsUnder50,
      gifts50to100,
      gifts100to500,
      giftsOver500,
      trendData,
      totalGifts: parsedData.length,
      totalAmount
    };

  }, [parsedData]);

  const copyTableToClipboard = () => {
    if (!stats) return;
    
    const text = `
Donation Summary Report

Total Donors: ${stats.totalDonors}
Median Donation: $${stats.median.toFixed(2)}
Total Amount: $${stats.totalAmount.toFixed(2)}

Breakdown:
Gifts $50 and under: ${stats.giftsUnder50}
Gifts $50 - $100: ${stats.gifts50to100}
Gifts $100 - $500: ${stats.gifts100to500}
Gifts over $500: ${stats.giftsOver500}
    `.trim();

    navigator.clipboard.writeText(text);
    alert('Summary copied to clipboard!');
  };

  const printReport = () => {
    window.print();
  };

  return (
    <div className="min-h-screen bg-neutral-50 text-neutral-900 p-8 font-sans">
      <div className="max-w-6xl mx-auto space-y-8">
        <header className="flex justify-between items-center mb-8 print:hidden">
          <div>
            <h1 className="text-3xl font-bold">Donations Summary Dashboard</h1>
            <p className="text-neutral-500 mt-1">Upload your donation CSV to view trends</p>
          </div>
          
          <div className="flex gap-4">
            <label className="flex items-center gap-2 bg-blue-600 text-white px-4 py-2 rounded-lg cursor-pointer hover:bg-blue-700 transition font-medium shadow-sm">
              <Upload className="w-5 h-5" />
              <span>{fileName ? 'Change CSV' : 'Upload CSV'}</span>
              <input type="file" accept=".csv" onChange={handleFileUpload} className="hidden" />
            </label>
            {stats && (
              <>
                <button onClick={copyTableToClipboard} className="flex items-center gap-2 bg-white border border-neutral-300 px-4 py-2 rounded-lg hover:bg-neutral-50 transition shadow-sm font-medium">
                  <Copy className="w-5 h-5" />
                  <span>Copy</span>
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
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-6">
              <StatCard title="Total Amount" value={'$' + stats.totalAmount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} icon={<DollarSign className="w-6 h-6 text-green-600" />} />
              <StatCard title="Total Donors" value={stats.totalDonors.toString()} icon={<Users className="w-6 h-6 text-blue-500" />} />
              <StatCard title="Median Donation" value={'$' + stats.median.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} icon={<DollarSign className="w-6 h-6 text-green-500" />} />
              <StatCard title="Total Gifts" value={stats.totalGifts.toString()} icon={<Gift className="w-6 h-6 text-purple-500" />} />
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              <div className="bg-white p-6 rounded-xl shadow-sm border border-neutral-200 col-span-1 lg:col-span-2">
                <h3 className="text-xl font-semibold mb-6">Donation Trends</h3>
                <div className="h-72">
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={stats.trendData}>
                      <defs>
                        <linearGradient id="colorAmount" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.2}/>
                          <stop offset="95%" stopColor="#3b82f6" stopOpacity={0}/>
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E5E7EB" />
                      <XAxis dataKey="date" tickLine={false} axisLine={false} tick={{fill: '#6B7280'}} dy={10} />
                      <YAxis tickLine={false} axisLine={false} tick={{fill: '#6B7280'}} dx={-10} tickFormatter={(value) => `$${value}`} />
                      <Tooltip 
                        contentStyle={{ borderRadius: '8px', border: '1px solid #E5E7EB', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }}
                        formatter={(value: any) => [`$${value.toFixed(2)}`, 'Amount']}
                      />
                      <Area type="monotone" dataKey="amount" stroke="#3b82f6" strokeWidth={3} fillOpacity={1} fill="url(#colorAmount)" />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              </div>

              <div className="bg-white p-6 rounded-xl shadow-sm border border-neutral-200">
                <h3 className="text-xl font-semibold mb-6">Gift Breakdown</h3>
                <div className="space-y-5">
                  <BreakdownRow label="Gifts $50 and under" count={stats.giftsUnder50} total={stats.totalGifts} />
                  <BreakdownRow label="Gifts $50 - $100" count={stats.gifts50to100} total={stats.totalGifts} />
                  <BreakdownRow label="Gifts $100 - $500" count={stats.gifts100to500} total={stats.totalGifts} />
                  <BreakdownRow label="Gifts over $500" count={stats.giftsOver500} total={stats.totalGifts} />
                </div>
              </div>
            </div>
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center p-20 bg-white rounded-xl shadow-sm border border-neutral-200 border-dashed print:hidden">
            <div className="bg-blue-50 p-4 rounded-full mb-4">
              <Upload className="w-8 h-8 text-blue-500" />
            </div>
            <h3 className="text-xl font-medium mb-2">No data uploaded</h3>
            <p className="text-neutral-500 text-center max-w-sm">Upload a CSV file containing your donation records to view your dashboard.</p>
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

const BreakdownRow = ({ label, count, total }: { label: string, count: number, total: number }) => {
  const percentage = total > 0 ? (count / total) * 100 : 0;
  return (
    <div>
      <div className="flex justify-between text-sm mb-2">
        <span className="font-medium text-neutral-700">{label}</span>
        <span className="font-bold text-neutral-900">{count} <span className="text-neutral-400 font-normal">({percentage.toFixed(1)}%)</span></span>
      </div>
      <div className="w-full bg-neutral-100 rounded-full h-2.5">
        <div className="bg-blue-600 h-2.5 rounded-full" style={{ width: `${percentage}%` }}></div>
      </div>
    </div>
  );
};

export default App;
