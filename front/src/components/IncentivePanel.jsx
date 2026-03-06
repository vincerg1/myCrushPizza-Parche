import React, { useEffect, useState, useMemo } from "react";
import api from "../setupAxios";
import "../styles/IncentivePanel.css";

export default function IncentivePanel() {

  const [incentives, setIncentives] = useState([]);
  const [pizzas, setPizzas] = useState([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [showForm, setShowForm] = useState(false);
  const [msg, setMsg] = useState("");

  const [form, setForm] = useState({
    name: "",
    triggerMode: "FIXED",
    fixedAmount: "",
    percentOverAvg: "",
    rewardPizzaId: "",
    active: false,
    startsAt: "",
    endsAt: "",
    daysActive: [],
    windowStart: "",
    windowEnd: "",
  });

  /* ───────────────────────── LOAD ───────────────────────── */

  const loadIncentives = async () => {
    setLoading(true);
    try {
      const { data } = await api.get("/api/incentives");
      setIncentives(Array.isArray(data) ? data : []);
    } catch {
      setIncentives([]);
    } finally {
      setLoading(false);
    }
  };

  const loadPizzas = async () => {
    try {
      const { data } = await api.get("/api/pizzas");
      const active = Array.isArray(data)
        ? data.filter((p) => p.status === "ACTIVE")
        : [];
      setPizzas(active);
    } catch {
      setPizzas([]);
    }
  };

  useEffect(() => {
    loadIncentives();
    loadPizzas();
  }, []);

  /* ───────────────────────── HELPERS ───────────────────────── */

  const onChange = (k, v) =>
    setForm((prev) => ({ ...prev, [k]: v }));

  const resetForm = () => {
    setEditingId(null);
    setMsg("");
    setForm({
      name: "",
      triggerMode: "FIXED",
      fixedAmount: "",
      percentOverAvg: "",
      rewardPizzaId: "",
      active: false,
      startsAt: "",
      endsAt: "",
      daysActive: [],
      windowStart: "",
      windowEnd: "",
    });
  };

  const toMinutes = (hhmm) => {
    if (!hhmm) return null;
    const [h, m] = hhmm.split(":").map(Number);
    if (!Number.isFinite(h) || !Number.isFinite(m)) return null;
    return h * 60 + m;
  };

  const minutesToHHMM = (mins) => {
    if (mins == null) return "";
    const h = Math.floor(mins / 60);
    const m = mins % 60;
    return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
  };

  /* ───────────────────────── GRID SCHEDULE ───────────────────────── */

  const allDays = ["Sun","Mon","Tue","Wed","Thu","Fri","Sat"];

  const hours = useMemo(() => {

    const set = new Set();

    incentives.forEach((inc) => {

      if (inc.windowStart == null || inc.windowEnd == null) return;

      const startHour = Math.floor(inc.windowStart / 60);
      const endHour = Math.ceil(inc.windowEnd / 60);

      for (let h = startHour; h < endHour; h++) {
        set.add(h);
      }

    });

    if (set.size === 0) return [];

    return Array.from(set).sort((a,b)=>a-b);

  }, [incentives]);

  const days = useMemo(()=>{

    const set = new Set();

    incentives.forEach((inc)=>{

      if (!inc.daysActive || inc.daysActive.length === 0) {
        for (let i=0;i<7;i++) set.add(i);
        return;
      }

      inc.daysActive.forEach(d => set.add(d));

    });

    return Array.from(set).sort((a,b)=>a-b);

  },[incentives]);

  const cellActive = (hour, dayIndex) => {

    const startMin = hour * 60;
    const endMin = startMin + 60;

    for (let idx = 0; idx < incentives.length; idx++) {

      const inc = incentives[idx];

      if (!inc.active) continue;

      const daysActive =
        inc.daysActive?.length
          ? inc.daysActive
          : [0,1,2,3,4,5,6];

      if (!daysActive.includes(dayIndex)) continue;

      if (inc.windowStart == null || inc.windowEnd == null)
        return { name: inc.name, color: idx + 1 };

      if (startMin < inc.windowEnd && endMin > inc.windowStart) {
        return { name: inc.name, color: idx + 1 };
      }

    }

    return null;
  };

  /* ───────────────────────── FORM OPEN/CLOSE ───────────────────────── */

  const openCreate = () => {
    resetForm();
    setShowForm(true);
  };

  const openEdit = (inc) => {
    setEditingId(inc.id);
    setForm({
      name: inc.name || "",
      triggerMode: inc.triggerMode || "FIXED",
      fixedAmount: inc.fixedAmount ?? "",
      percentOverAvg: inc.percentOverAvg ?? "",
      rewardPizzaId: inc.rewardPizzaId ?? "",
      active: !!inc.active,
      startsAt: inc.startsAt ? inc.startsAt.slice(0,16) : "",
      endsAt: inc.endsAt ? inc.endsAt.slice(0,16) : "",
      daysActive: Array.isArray(inc.daysActive) ? inc.daysActive : [],
      windowStart: minutesToHHMM(inc.windowStart),
      windowEnd: minutesToHHMM(inc.windowEnd),
    });

    setShowForm(true);
  };

  const closeForm = () => {
    resetForm();
    setShowForm(false);
  };

  /* ───────────────────────── SUBMIT ───────────────────────── */

  const submit = async (e) => {

    e.preventDefault();
    setMsg("");

    if (!form.name?.trim())
      return setMsg("Name required.");

    if (!form.rewardPizzaId)
      return setMsg("Select reward pizza.");

    if (form.triggerMode === "FIXED" && !Number(form.fixedAmount))
      return setMsg("Invalid fixed amount.");

    if (form.triggerMode === "SMART_AVG_TICKET" && !Number(form.percentOverAvg))
      return setMsg("Invalid percent over average.");

    setSaving(true);

    try {

      const payload = {
        name: form.name.trim(),
        triggerMode: form.triggerMode,
        rewardPizzaId: Number(form.rewardPizzaId),
        active: !!form.active,
        startsAt: form.startsAt || null,
        endsAt: form.endsAt || null,
        daysActive: form.daysActive,
        windowStart: toMinutes(form.windowStart),
        windowEnd: toMinutes(form.windowEnd),
        ...(form.triggerMode === "FIXED" && {
          fixedAmount: Number(form.fixedAmount),
        }),
        ...(form.triggerMode === "SMART_AVG_TICKET" && {
          percentOverAvg: Number(form.percentOverAvg),
        }),
      };

      if (editingId) {
        await api.patch(`/api/incentives/${editingId}`, payload);
      } else {
        await api.post("/api/incentives", payload);
      }

      await loadIncentives();
      closeForm();

    } catch (err) {

      const apiMsg =
        err?.response?.data?.error ||
        err?.response?.data?.message ||
        "Error saving incentive.";

      setMsg(apiMsg);

    } finally {
      setSaving(false);
    }
  };

  /* ───────────────────────── ACTIONS ───────────────────────── */

  const activate = async (id) => {
    await api.patch(`/api/incentives/${id}/activate`);
    await loadIncentives();
  };

  const remove = async (id) => {
    if (!window.confirm("Delete this incentive?")) return;
    await api.delete(`/api/incentives/${id}`);
    await loadIncentives();
  };

  /* ───────────────────────── RENDER ───────────────────────── */

  return (
    <div className="IncentivePanel">

      <div className="IncentivePanel-header">
        <h2>Incentives</h2>
        <button onClick={openCreate}>+ Add Incentive</button>
      </div>

      <div className="IncentivePanel-history">

        {loading && <div>Loading...</div>}

        {!loading &&
          incentives.map((i) => (

            <div key={i.id} className="IncentivePanel-row">

              <div>
                <strong>{i.name}</strong>

                <div>
                  {i.triggerMode === "FIXED"
                    ? `€${i.fixedAmount}`
                    : `${i.percentOverAvg}% over avg`}
                </div>
              </div>

              <div>
                <button
                  disabled={i.active}
                  onClick={() => activate(i.id)}
                >
                  {i.active ? "Active" : "Activate"}
                </button>

                <button onClick={() => openEdit(i)}>
                  Edit
                </button>

                <button onClick={() => remove(i.id)}>
                  Delete
                </button>
              </div>

            </div>
        ))}
      </div>

      {/* ───────────── SCHEDULE GRID ───────────── */}

      <div className="IncentivePanel-scheduleGrid">

        <h3>Active Schedule</h3>

        {hours.length === 0 && (
          <div className="IncentivePanel-noSchedule">
            No active schedule
          </div>
        )}

        {hours.length > 0 && (
        <table>

          <thead>
            <tr>
              <th>Hour</th>
              {days.map((dayIndex)=>(
                <th key={dayIndex}>{allDays[dayIndex]}</th>
              ))}
            </tr>
          </thead>

          <tbody>

            {hours.map((h)=>(

              <tr key={h}>

                <td className="hourCell">
                  {String(h).padStart(2,"0")}:00
                </td>

                {days.map((dayIndex)=>{

                  const active = cellActive(h,dayIndex);

                  return (
                    <td
                      key={dayIndex}
                      className={
                        active
                          ? `scheduleCell incentive-${active.color}`
                          : "scheduleCell"
                      }
                      title={active?.name || ""}
                    />
                  );

                })}

              </tr>

            ))}

          </tbody>

        </table>
        )}

      </div>

      {/* ───────────── FORM MODAL ───────────── */}

      {showForm && (
        <div className="IncentivePanel-modalOverlay">

          <div className="IncentivePanel-modal">

            <form onSubmit={submit}>

              <h3>
                {editingId
                  ? "Edit Incentive"
                  : "Create Incentive"}
              </h3>

              <input
                placeholder="Name"
                value={form.name}
                onChange={(e)=>onChange("name",e.target.value)}
              />

              <select
                value={form.triggerMode}
                onChange={(e)=>onChange("triggerMode",e.target.value)}
              >
                <option value="FIXED">Fixed amount</option>
                <option value="SMART_AVG_TICKET">
                  % over average
                </option>
              </select>

              {form.triggerMode === "FIXED" && (
                <input
                  type="number"
                  placeholder="Minimum amount"
                  value={form.fixedAmount}
                  onChange={(e)=>onChange("fixedAmount",e.target.value)}
                />
              )}

              {form.triggerMode === "SMART_AVG_TICKET" && (
                <input
                  type="number"
                  placeholder="% over average"
                  value={form.percentOverAvg}
                  onChange={(e)=>onChange("percentOverAvg",e.target.value)}
                />
              )}

              <select
                value={form.rewardPizzaId}
                onChange={(e)=>onChange("rewardPizzaId",e.target.value)}
              >
                <option value="">Select reward pizza…</option>

                {pizzas.map((p)=>(
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}

              </select>

              {/* DAYS */}

              <div>
                {allDays.map((d,idx)=>(
                  <label key={idx}>

                    <input
                      type="checkbox"
                      checked={form.daysActive.includes(idx)}
                      onChange={(e)=>{

                        if (e.target.checked){
                          onChange(
                            "daysActive",
                            [...form.daysActive, idx]
                          );
                        } else {
                          onChange(
                            "daysActive",
                            form.daysActive.filter(x=>x!==idx)
                          );
                        }

                      }}
                    />

                    {d}

                  </label>
                ))}
              </div>

              {/* TIME */}

              <div>

                <input
                  type="time"
                  value={form.windowStart}
                  onChange={(e)=>onChange("windowStart",e.target.value)}
                />

                <input
                  type="time"
                  value={form.windowEnd}
                  onChange={(e)=>onChange("windowEnd",e.target.value)}
                />

              </div>

              <label>
                <input
                  type="checkbox"
                  checked={form.active}
                  onChange={(e)=>onChange("active",e.target.checked)}
                />
                Activate on save
              </label>

              <div>

                <button
                  type="button"
                  onClick={closeForm}
                >
                  Cancel
                </button>

                <button disabled={saving}>
                  {saving ? "Saving..." : "Save"}
                </button>

              </div>

              {msg && <div>{msg}</div>}

            </form>

          </div>

        </div>
      )}

    </div>
  );
}