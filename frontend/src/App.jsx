import { useEffect, useState } from "react";
import { useStore } from "./store";
import { CATEGORIES } from "./endpoints";
import Banner from "./components/Banner";
import KeyBar from "./components/KeyBar";
import Sidebar from "./components/Sidebar";
import KeysTab from "./tabs/KeysTab";
import CategoryTab from "./tabs/CategoryTab";
import HistoryTab from "./tabs/HistoryTab";
import SettingsTab from "./tabs/SettingsTab";

export default function App() {
  const { loadAll, toast } = useStore();
  const [tab, setTab] = useState("keys");
  const [err, setErr] = useState(null);

  useEffect(() => {
    loadAll().catch((e) => setErr(e.message));
  }, [loadAll]);

  // Cross-component tab navigation: any child can request a tab switch by
  // dispatching window CustomEvent "wb:navtab" with detail=tabId.
  useEffect(() => {
    const onNav = (e) => setTab(e.detail);
    window.addEventListener("wb:navtab", onNav);
    return () => window.removeEventListener("wb:navtab", onNav);
  }, []);

  const isCategory = CATEGORIES.some((c) => c.id === tab);

  const toastColor =
    toast?.kind === "error"
      ? "bg-danger-600"
      : toast?.kind === "success"
      ? "bg-ok-600"
      : "bg-ink-800";

  return (
    <div className="h-full flex flex-col bg-ink-50">
      <Banner />
      <KeyBar />
      <div className="flex flex-1 min-h-0">
        <Sidebar tab={tab} setTab={setTab} />
        <main className="flex-1 overflow-y-auto px-6 py-6">
          {err && (
            <div className="callout-warn mb-4">
              백엔드 연결 실패: {err} — uvicorn 이 127.0.0.1:8000 에서 실행 중인지 확인하세요.
            </div>
          )}
          {tab === "keys" && <KeysTab />}
          {isCategory && <CategoryTab key={tab} categoryId={tab} />}
          {tab === "history" && <HistoryTab />}
          {tab === "settings" && <SettingsTab />}
        </main>
      </div>

      {toast && (
        <div
          role="status"
          aria-live="polite"
          className={`fixed bottom-4 right-4 z-50 px-4 py-2.5 rounded-control shadow-pop text-sm text-white ${toastColor}`}
        >
          {toast.msg}
        </div>
      )}
    </div>
  );
}
