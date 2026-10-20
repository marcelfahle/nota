import type en from "../../messages/en.json";

declare module "next-intl" {
  interface AppConfig {
    Locale: "de" | "en";
    Messages: typeof en;
  }
}
