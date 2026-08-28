# Donors Summary Dashboard

A React application for processing and summarizing donation CSV files entirely in the browser.

## Getting Started

```bash
npm install
npm run dev
npm run build
npm test
```

## Monthly Projections CSV Format

You can upload monthly projections in either vertical or horizontal format.

### Option 1: Vertical (Recommended)

```csv
Month,Projected Amount
January,$10,000.00
February,$12,000.00
March,$15,000.00
April,$10,000.00
May,$12,000.00
June,$15,000.00
July,$10,000.00
August,$10,000.00
September,$12,000.00
October,$15,000.00
November,$18,000.00
December,$25,000.00
```

*Month column accepts full names (`January`), short names (`Jan`), or numbers (`1`-`12`).*

### Option 2: Horizontal

```csv
Jan,Feb,Mar,Apr,May,Jun,Jul,Aug,Sep,Oct,Nov,Dec
$10000,$12000,$15000,$10000,$12000,$15000,$10000,$10000,$12000,$15000,$18000,$25000
```
