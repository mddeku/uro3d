import { create } from "zustand";
import type { Series, ImportIssue, ViewState } from "../types/imaging";
const initialView: ViewState = {
  slice: 0,
  center: 40,
  width: 400,
  zoom: 1,
  pan: [0, 0],
  tool: "window",
};
interface State {
  series: Series[];
  active: string;
  issues: ImportIssue[];
  demo: boolean;
  hidePatient: boolean;
  view: ViewState;
  setView: (v: Partial<ViewState>) => void;
  select: (id: string) => void;
  setStudy: (series: Series[], issues: ImportIssue[], demo: boolean) => void;
  reset: () => void;
  clear: () => void;
  setHidePatient: (v: boolean) => void;
}
export const useWorkstation = create<State>((set, get) => ({
  series: [],
  active: "",
  issues: [],
  demo: false,
  hidePatient: true,
  view: initialView,
  setView: (v) => set((s) => ({ view: { ...s.view, ...v } })),
  select: (id) => {
    const s = get().series.find((s) => s.id === id);
    if (s) {
      const f = s.frames[Math.floor(s.frames.length / 2)];
      set({
        active: id,
        view: {
          ...initialView,
          slice: Math.floor(s.frames.length / 2),
          center: f.center,
          width: f.width,
        },
      });
    }
  },
  setStudy: (series, issues, demo) => {
    set({ series, issues, demo, active: "" });
    if (series.length) get().select(series[0].id);
  },
  reset: () => {
    const f = get().series.find((s) => s.id === get().active)?.frames[
      get().view.slice
    ];
    set({
      view: {
        ...initialView,
        slice: get().view.slice,
        center: f?.center ?? 40,
        width: f?.width ?? 400,
      },
    });
  },
  clear: () =>
    set({ series: [], active: "", issues: [], demo: false, view: initialView }),
  setHidePatient: (hidePatient) => set({ hidePatient }),
}));
