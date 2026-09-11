import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import {
  ensureAppFolder,
  forgetConnected,
  isGoogleDriveConfigured,
  requestAccessToken,
  wasDriveConnected,
} from "./googleDrive";

interface GoogleDriveShape {
  isConfigured: boolean;
  isConnected: boolean;
  isConnecting: boolean;
  error: string | null;
  connect: () => Promise<void>;
  disconnect: () => void;
  getAccessToken: () => Promise<string>;
  getFolderId: (token: string) => Promise<string>;
}

const GoogleDriveContext = createContext<GoogleDriveShape | null>(null);

export function GoogleDriveProvider({ children }: { children: ReactNode }) {
  const [isConnected, setIsConnected] = useState(false);
  const [isConnecting, setIsConnecting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const tokenRef = useRef<{ token: string; expiresAt: number } | null>(null);

  useEffect(() => {
    if (!isGoogleDriveConfigured || !wasDriveConnected()) return;
    // Försök återuppta anslutningen tyst (utan popup) om användaren tidigare kopplat in Drive.
    requestAccessToken(false)
      .then((token) => {
        tokenRef.current = { token, expiresAt: Date.now() + 55 * 60 * 1000 };
        setIsConnected(true);
      })
      .catch(() => {
        // Tyst återanslutning misslyckades (t.ex. session utgången) – kräver ny inloggning.
      });
  }, []);

  const connect = useCallback(async () => {
    setIsConnecting(true);
    setError(null);
    try {
      const token = await requestAccessToken(true);
      tokenRef.current = { token, expiresAt: Date.now() + 55 * 60 * 1000 };
      setIsConnected(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Kunde inte ansluta till Google Drive.");
    } finally {
      setIsConnecting(false);
    }
  }, []);

  const disconnect = useCallback(() => {
    tokenRef.current = null;
    forgetConnected();
    setIsConnected(false);
  }, []);

  const getAccessToken = useCallback(async (): Promise<string> => {
    if (tokenRef.current && tokenRef.current.expiresAt > Date.now()) {
      return tokenRef.current.token;
    }
    const token = await requestAccessToken(false);
    tokenRef.current = { token, expiresAt: Date.now() + 55 * 60 * 1000 };
    setIsConnected(true);
    return token;
  }, []);

  const getFolderId = useCallback(async (token: string) => ensureAppFolder(token), []);

  return (
    <GoogleDriveContext.Provider
      value={{ isConfigured: isGoogleDriveConfigured, isConnected, isConnecting, error, connect, disconnect, getAccessToken, getFolderId }}
    >
      {children}
    </GoogleDriveContext.Provider>
  );
}

export function useGoogleDrive() {
  const ctx = useContext(GoogleDriveContext);
  if (!ctx) throw new Error("useGoogleDrive must be used within GoogleDriveProvider");
  return ctx;
}
