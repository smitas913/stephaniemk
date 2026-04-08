import { useState } from "react";
import Layout from "@/components/Layout";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import CustomerList from "./CustomerList";
import BookingLeads from "./BookingLeads";

export default function Clients() {
  const [tab, setTab] = useState("customers");

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
            <CustomerListInline />
          </TabsContent>
          <TabsContent value="leads">
            <BookingLeadsInline />
          </TabsContent>
        </Tabs>
      </div>
    </Layout>
  );
}

// Inline wrappers that render content without the Layout wrapper
// We need to refactor CustomerList and BookingLeads to support embedded mode
import { useSearchParams } from "react-router-dom";

function CustomerListInline() {
  // Render the full customer list page - it already includes Layout,
  // so we'll need to update it. For now, redirect approach:
  return <CustomerListContent />;
}

function BookingLeadsInline() {
  return <BookingLeadsContent />;
}

// We'll import the content-only versions
import CustomerListContent from "./CustomerListContent";
import BookingLeadsContent from "./BookingLeadsContent";
