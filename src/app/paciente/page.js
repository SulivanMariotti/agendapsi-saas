"use client";

import React, { useEffect, useMemo, useState } from "react";
import { getAuth, onAuthStateChanged } from "firebase/auth";

import { patientApp } from "../firebasePatient";
import { Toast } from "../../components/DesignSystem";
import { UiThemeProvider } from "../../components/uiTheme";

import PatientLogin from "../../components/Patient/PatientLogin";
import AgendaPsiPatientFlow from "../../components/Patient/AgendaPsiPatientFlow";
import { logoutPatientUser } from "../../services/authService";
import styles from "../../features/patient/styles/patientMobile.module.css";

export default function PatientAppPage() {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState({ msg: "", type: "" });

  // Patient-only UI theme: makes primary actions match the TopAppBar tone.
  const patientTheme = useMemo(
    () => ({
      buttonVariants: {
        primary:
          "bg-violet-950/95 text-white hover:bg-violet-950 active:bg-violet-900/95 shadow-lg shadow-black/10 border border-transparent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-200/60 focus-visible:ring-offset-2 focus-visible:ring-offset-white",
        white:
          "bg-white text-violet-950 hover:bg-white/95 active:bg-slate-50 shadow-lg shadow-black/5 border-transparent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-200/60 focus-visible:ring-offset-2 focus-visible:ring-offset-white",
      },
    }),
    []
  );

  // Observa autenticação do paciente (Firebase Auth no app secundário)
  useEffect(() => {
    const auth = getAuth(patientApp);
    const unsub = onAuthStateChanged(auth, (u) => {
      setUser(u);
      setLoading(false);
    });
    return () => unsub();
  }, []);

  const handleLogoutAll = async () => {
    try {
      await logoutPatientUser();
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

  // 1) Paciente logado
  if (user) {
    return (
      <UiThemeProvider theme={patientTheme}>
        {toast?.msg && (
          <Toast message={toast.msg} type={toast.type} onClose={() => setToast({})} />
        )}

        <div className={`skin-patient ${styles.patientRoot}`}>
          <AgendaPsiPatientFlow user={user} onLogout={handleLogoutAll} />
        </div>
      </UiThemeProvider>
    );
  }

  // 2) Tela de login (paciente)
  return (
    <UiThemeProvider theme={patientTheme}>
      {toast?.msg && (
        <Toast message={toast.msg} type={toast.type} onClose={() => setToast({})} />
      )}

      <div className={`skin-patient ${styles.patientRoot}`}>
        <PatientLogin />
      </div>
    </UiThemeProvider>
  );
}
