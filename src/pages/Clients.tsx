import { useState } from "react";
import { useSearchParams } from "react-router-dom";
import Layout from "@/components/Layout";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import CustomerList from "./CustomerList";
import BookingLeads from "./BookingLeads";

export default function Clients() {
  const [searchParams, setSearchParams] = useSearchParams();
  const tab = searchParams.get("tab") || "customers";

  const setTab = (value: string) => {
    setSearchParams({ tab: value }, { replace: true });
  };

  return (
    <Layout>
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold text-foreground">Clients</h1>
        </div>
        <Tabs value={tab} onValueChange={setTab}>
          <TabsList>
            <TabsTrigger value="customers">Customers</TabsTrigger>
            <TabsTrigger value="leads">Leads</TabsTrigger>
          </TabsList>
          <TabsContent value="customers">
            <CustomerList embedded />
          </TabsContent>
          <TabsContent value="leads">
            <BookingLeads embedded />
          </TabsContent>
        </Tabs>
      </div>
    </Layout>
  );
}
