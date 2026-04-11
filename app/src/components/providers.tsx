"use client";

import {
  type FC,
  type ReactNode,
  createContext,
  useEffect,
  useContext,
  useMemo,
  useState,
} from "react";
import {
  ConnectionProvider,
  WalletProvider,
} from "@solana/wallet-adapter-react";
import { WalletModalProvider } from "@solana/wallet-adapter-react-ui";
import {
  NETWORKS,
  DEFAULT_NETWORK,
  type NetworkId,
} from "../lib/constants";
import {
  COPY,
  DEFAULT_LANGUAGE,
  type AppCopy,
  type AppLanguage,
} from "../lib/i18n";
import "@solana/wallet-adapter-react-ui/styles.css";

import { Buffer } from "buffer";
if (typeof window !== "undefined") {
  (window as unknown as Record<string, unknown>).Buffer = Buffer;
}

type NetworkContextType = {
  network: NetworkId;
  setNetwork: (id: NetworkId) => void;
};

type LanguageContextType = {
  language: AppLanguage;
  setLanguage: (language: AppLanguage) => void;
  copy: AppCopy;
};

type ThemeMode = "light" | "dark";

type ThemeContextType = {
  theme: ThemeMode;
  setTheme: (theme: ThemeMode) => void;
};

const NetworkContext = createContext<NetworkContextType>({
  network: DEFAULT_NETWORK,
  setNetwork: () => {},
});

const LanguageContext = createContext<LanguageContextType>({
  language: DEFAULT_LANGUAGE,
  setLanguage: () => {},
  copy: COPY[DEFAULT_LANGUAGE],
});

const ThemeContext = createContext<ThemeContextType>({
  theme: "light",
  setTheme: () => {},
});

export const useNetwork = () => useContext(NetworkContext);
export const useLanguage = () => useContext(LanguageContext);
export const useTheme = () => useContext(ThemeContext);

export const AppProviders: FC<{ children: ReactNode }> = ({ children }) => {
  const [network, setNetwork] = useState<NetworkId>(DEFAULT_NETWORK);
  const [language, setLanguage] = useState<AppLanguage>(DEFAULT_LANGUAGE);
  const [theme, setTheme] = useState<ThemeMode>("light");
  const endpoint = NETWORKS[network];
  const wallets = useMemo(() => [], []);
  const copy = useMemo(() => COPY[language], [language]);

  useEffect(() => {
    const storedTheme = window.localStorage.getItem("dfl-theme");
    if (storedTheme === "light" || storedTheme === "dark") {
      setTheme(storedTheme);
    }
  }, []);

  useEffect(() => {
    document.documentElement.lang = language;
  }, [language]);

  useEffect(() => {
    document.documentElement.classList.toggle("dark", theme === "dark");
    window.localStorage.setItem("dfl-theme", theme);
  }, [theme]);

  return (
    <ThemeContext.Provider value={{ theme, setTheme }}>
      <LanguageContext.Provider value={{ language, setLanguage, copy }}>
        <NetworkContext.Provider value={{ network, setNetwork }}>
          <ConnectionProvider endpoint={endpoint}>
            <WalletProvider wallets={wallets} autoConnect>
              <WalletModalProvider>{children}</WalletModalProvider>
            </WalletProvider>
          </ConnectionProvider>
        </NetworkContext.Provider>
      </LanguageContext.Provider>
    </ThemeContext.Provider>
  );
};
