"use client";

import React, { useEffect, useState } from "react";
import { getAuth, onAuthStateChanged } from "firebase/auth";

import { app } from "./firebase";
import { Toast } from "../components/DesignSystem";

import { useData } from "../hooks/useData";
import PatientFlow from "../components/Patient/PatientFlow";
import PatientLogin from "../components/Patient/PatientLogin";

import { logoutUser } from "../services/authService";
import styles from "../features/patient/styles/patientMobile.module.css";

export default function App() {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState({ msg: "", type: "" });

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
      <>
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
      </>
    );
  }

  // 2) TELA DE LOGIN (PACIENTE)
  return (
    <>
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
    </>
  );
}