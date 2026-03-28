'use client';
import { useRouter } from 'next/navigation';

export default function InvestmentsPage() {
  const router = useRouter();
  return (
    <div className="p-6 max-w-2xl mx-auto text-center py-20">
      <p className="text-ink-700 mb-4">
        Sector investments have been replaced by the company lending system.
        Fund businesses through loans in the <strong>Queue</strong> tab.
      </p>
      <div className="flex gap-3 justify-center">
        <button
          onClick={() => router.push('/loans')}
          className="bg-gold-500 hover:bg-gold-400 text-parch-50 font-bold text-sm px-4 py-2 rounded"
        >
          View Loan Queue
        </button>
        <button
          onClick={() => router.push('/world-map')}
          className="border border-parch-300 text-ink-700 hover:border-gold-400 hover:text-gold-400 text-sm px-4 py-2 rounded"
        >
          World Map
        </button>
      </div>
    </div>
  );
}
