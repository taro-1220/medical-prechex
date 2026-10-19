import { useEffect, useState } from "react";
import { getAccessToken, getCurrentClinic, redirectToLogin } from "./clinic-auth";
import {
  resolveClinicGuard,
  resolveNoClinicDestination,
  type ClinicGuardViewState,
} from "./clinic-guard";
import type { Clinic } from "./types";

type Router = { replace: (href: string) => void };

export type UseClinicGuardResult = {
  state: ClinicGuardViewState;
  clinic: Clinic | null;
};

/**
 * /clinic配下の各画面（onboarding, pending-approval, templates）で共通のクリニック
 * 入室ガード。"login"（未ログイン・セッション切れ）はredirectToLoginで/loginへ、
 * "no-clinic"（認証済みだがクリニック未割当）は/clinicへ、自身で遷移させる。
 * 呼び出し側はstateが"ok"になるまで画面の中身を描画してはいけない
 * （shouldRenderClinicContentで判定する）。
 */
export function useClinicGuard(router: Router): UseClinicGuardResult {
  const [state, setState] = useState<ClinicGuardViewState>("checking");
  const [clinic, setClinic] = useState<Clinic | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const token = await getAccessToken();
      const currentClinic = token ? await getCurrentClinic() : null;
      const guard = resolveClinicGuard(token, currentClinic);
      if (cancelled) return;
      if (guard === "login") {
        redirectToLogin(router);
        setState("login");
        return;
      }
      if (guard === "no-clinic" || !currentClinic) {
        const isOpsAdmin = await fetchIsOpsAdmin(token);
        if (cancelled) return;
        router.replace(resolveNoClinicDestination(isOpsAdmin));
        setState("no-clinic");
        return;
      }
      setClinic(currentClinic);
      setState("ok");
    })();
    return () => {
      cancelled = true;
    };
  }, [router]);

  return { state, clinic };
}

/** /api/ops/meを呼び、isOpsAdminを返す。失敗時はnull（未確定）。 */
async function fetchIsOpsAdmin(token: string | null): Promise<boolean | null> {
  if (!token) return null;
  try {
    const res = await fetch("/api/ops/me", {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) return null;
    const data = await res.json();
    return typeof data.isOpsAdmin === "boolean" ? data.isOpsAdmin : null;
  } catch {
    return null;
  }
}
