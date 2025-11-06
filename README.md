# Expense Tracker Dashboard

NetSuite expense tracking dashboard for Encore Landscape Management. Displays Q4 2025 expenses with KPI cards and detailed table view.

## Setup Instructions

### 1. Environment Variables

Create a `.env.local` file in the root directory:

```bash
cp .env.local.example .env.local
```

Then fill in your Supabase credentials from your 'expense-tracker' project:

```env
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
```

**Where to find these:**
- Go to your Supabase project: https://supabase.com/dashboard/project/expense-tracker
- Click on Settings → API
- Copy the Project URL, anon/public key, and service_role key

### 2. Install Dependencies

```bash
npm install
```

### 3. Run Development Server

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

## Features

### Current
- ✅ KPI cards showing total expenses by branch
- ✅ Clean table view with all expense details
- ✅ Filter by branch, vendor, department, and date range
- ✅ Data fetched from Supabase
- ✅ Responsive design

### Coming Next
- 🔄 NetSuite API integration
- 🔄 Sync button functionality
- 🔄 Real-time updates
- 🔄 Export to CSV

## Project Structure

```
expense-dashboard/
├── app/
│   ├── page.tsx          # Main dashboard page
│   ├── layout.tsx        # Root layout
│   └── globals.css       # Global styles
├── components/
│   ├── KPICard.tsx       # KPI card component
│   ├── ExpenseTable.tsx  # Expense table component
│   └── FilterBar.tsx     # Filter controls
├── lib/
│   └── supabase.ts       # Supabase client
└── types/
    └── expense.ts        # TypeScript types
```

## Next Steps

1. **Test the Dashboard**: Once you add your Supabase credentials and run `npm run dev`, you should see the dashboard (it will be empty until we add the NetSuite sync)

2. **NetSuite Integration**: We'll set up NetSuite API credentials and create the sync endpoint

3. **Add Sample Data**: Want to add some test data to see how it looks? Let me know!

## Tech Stack

- **Next.js 15** - React framework with App Router
- **TypeScript** - Type safety
- **Tailwind CSS** - Styling
- **Supabase** - Database
- **date-fns** - Date formatting
