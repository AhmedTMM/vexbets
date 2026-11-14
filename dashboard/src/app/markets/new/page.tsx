"use client";

import { NewMarketForm } from "@/components/NewMarketForm";

export default function NewMarketPage() {
  return (
    <div className="mx-auto max-w-3xl">
      <div className="panel p-6">
        <h1 className="mb-5 font-semibold text-xl tracking-tight">New market</h1>
        <NewMarketForm />
      </div>
    </div>
  );
}
