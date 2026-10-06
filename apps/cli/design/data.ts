// Deliberately local: this preview never imports config, credentials, or an API client.
export type DemoInvoice = {
  number: string;
  client: string;
  email: string;
  status: "draft" | "sent" | "overdue" | "paid";
  total: number;
  balance: number;
  due: string;
  items: { description: string; quantity: number; rate: number; amount: number }[];
};

// Money is in euro cents. The fixed date keeps the design and tests reproducible.
export const today = "2026-10-05";
export const clients = [
  { name: "Oxide Studio", email: "billing@oxide.example", currency: "EUR" },
  { name: "Linear Forms", email: "accounts@linear.example", currency: "EUR" },
  { name: "Good Company", email: "hello@good.example", currency: "EUR" },
];

export const invoices: DemoInvoice[] = [
  {
    number: "INV-0042",
    client: "Oxide Studio",
    email: clients[0].email,
    status: "overdue",
    total: 480000,
    balance: 480000,
    due: "2026-09-28",
    items: [{ description: "September development", quantity: 40, rate: 12000, amount: 480000 }],
  },
  {
    number: "INV-0043",
    client: "Linear Forms",
    email: clients[1].email,
    status: "sent",
    total: 320000,
    balance: 200000,
    due: "2026-10-12",
    items: [{ description: "Product design", quantity: 20, rate: 16000, amount: 320000 }],
  },
  {
    number: "INV-0044",
    client: "Good Company",
    email: clients[2].email,
    status: "draft",
    total: 150000,
    balance: 150000,
    due: "2026-11-04",
    items: [{ description: "Brand workshop", quantity: 1, rate: 150000, amount: 150000 }],
  },
  {
    number: "INV-0041",
    client: "Oxide Studio",
    email: clients[0].email,
    status: "paid",
    total: 240000,
    balance: 0,
    due: "2026-09-30",
    items: [{ description: "Discovery", quantity: 20, rate: 12000, amount: 240000 }],
  },
];
