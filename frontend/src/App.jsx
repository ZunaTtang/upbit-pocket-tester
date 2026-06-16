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

  const isCategory = CATEGORIES.some((c) => c.id === tab);

  return (
    <div className="h-full flex flex-col">
      <Banner />
      <KeyBar />
      <div className="flex flex-1 min-h-0">
        <Sidebar tab={tab} setTab={setTab} />
        <main className="flex-1 overflow-y-auto p-5">
          {err && (
            <div className="mb-4 text-sm text-rose-700 bg-rose-50 border border-rose-200 rounded p-3">
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
          className={`fixed bottom-4 right-4 z-50 px-4 py-2 rounded shadow-lg text-sm text-white ${
            toast.kind === "error" ? "bg-rose-600" : toast.kind === "success" ? "bg-emerald-600" : "bg-slate-700"
          }`}
        >
          {toast.msg}
        </div>
      )}
    </div>
  );
}
