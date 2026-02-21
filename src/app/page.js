"use client";

import React, { useEffect, useMemo, useState } from "react";
import { getAuth, onAuthStateChanged } from "firebase/auth";

import { app } from "./firebase";
import { Toast } from "../components/DesignSystem";
import { UiThemeProvider } from "../components/uiTheme";

import { useData } from "../hooks/useData";
import PatientFlow from "../components/Patient/PatientFlow";
import PatientLogin from "../components/Patient/PatientLogin";

import { logoutUser } from "../services/authService";
import styles from "../features/patient/styles/patientMobile.module.css";

export default function App() {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState({ msg: "", type: "" });

  // Patient-only UI theme: makes primary actions match the TopAppBar tone.
  const patientTheme = useMemo(
    () => ({
      buttonVariants: {
        primary:
          "bg-violet-950/95 text-white hover:bg-violet-950 shadow-lg shadow-black/10 border border-transparent",
        white:
          "bg-white text-violet-950 hover:bg-white/90 shadow-lg shadow-black/5 border-transparent",
      },
    }),
    []
  );

  // ✅ Paciente não carrega coleções sensíveis no client
  const { globalConfig } = useData(false);

  const showToast = (msg, type = "success") => setToast({ msg, type });

  // Observa autenticação
  useEffect(() => {
    const auth = getAuth(app);
    const unsub = onAuthStateChanged(auth, (u) => {
      setUser(u);
      setLoading(false);
    });
    return () => unsub();
  }, []);

  // ✅ Logout do paciente
  const handleLogoutAll = async () => {
    try {
      await logoutUser();
    } catch (e) {
      // ok, segue fluxo
    } finally {
      setUser(null);
    }
  };

  if (loading) {
    return (
      <div className="min-h-[100dvh] flex items-center justify-center text-slate-400">
        Carregando...
      </div>
    );
  }

  // 1) MODO PACIENTE LOGADO
  if (user) {
    return (
      <UiThemeProvider theme={patientTheme}>
        {toast?.msg && (
          <Toast
            message={toast.msg}
            type={toast.type}
            onClose={() => setToast({})}
          />
        )}

        <div className={`skin-patient ${styles.patientRoot}`}>
          <PatientFlow
            user={user}
            onLogout={handleLogoutAll}
            globalConfig={globalConfig}
            showToast={showToast}
          />
        </div>
      </UiThemeProvider>
    );
  }

  // 2) TELA DE LOGIN (PACIENTE)
  return (
    <UiThemeProvider theme={patientTheme}>
      {toast?.msg && (
        <Toast
          message={toast.msg}
          type={toast.type}
          onClose={() => setToast({})}
        />
      )}

      <div className={`skin-patient ${styles.patientRoot}`}>
        <PatientLogin />
      </div>
    </UiThemeProvider>
  );
}