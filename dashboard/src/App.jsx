import { useEffect, useState } from "react";
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
} from "recharts";

const API_URL = import.meta.env.VITE_API_URL || "http://localhost:4000";

// Demo contract ID — replace with your real deployed contract ID
// (must match one of CONTRACT_IDS in ingestion/.env).
const DEMO_CONTRACT_ID =
  import.meta.env.VITE_DEMO_CONTRACT_ID ||
  "CBQHNAXSI55GX2GN6D67GK7BHVPSLJUGZQEU7WJ5LKR5PNUCGLIMAO4E";

export default function App() {
  const [events, setEvents] = useState([]);
  const [volume, setVolume] = useState([]);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const [eventsRes, volumeRes] = await Promise.all([
          fetch(`${API_URL}/events?contract=${DEMO_CONTRACT_ID}&limit=25`),
          fetch(`${API_URL}/events/volume?contract=${DEMO_CONTRACT_ID}`),
        ]);

        if (!eventsRes.ok || !volumeRes.ok) {
          throw new Error("API request failed");
        }

        const eventsJson = await eventsRes.json();
        const volumeJson = await volumeRes.json();

        if (!cancelled) {
          setEvents(eventsJson.data);
          setVolume(
            volumeJson.data.map((row) => ({
              time: new Date(row.bucket).toLocaleString(),
              count: Number(row.count),
            })),
          );
          setLoading(false);
        }
      } catch (err) {
        if (!cancelled) {
          setError(err.message);
          setLoading(false);
        }
      }
    }

    load();
    const interval = setInterval(load, 10000); // poll every 10s for "live" feed
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, []);

  return (
    <div
      style={{
        fontFamily: "system-ui, sans-serif",
        padding: "2rem",
        maxWidth: 900,
        margin: "0 auto",
      }}
    >
      <h1>Soroban Indexer — Example Dashboard</h1>
      <p style={{ color: "#666" }}>
        Live feed and event volume for contract <code>{DEMO_CONTRACT_ID}</code>. This is a reference
        consumer proving the ingestion → API pipeline works end to end — not a polished product.
      </p>

      {loading && <p>Loading…</p>}
      {error && (
        <p style={{ color: "crimson" }}>
          Couldn't reach the API at {API_URL}: {error}
        </p>
      )}

      {!loading && !error && (
        <>
          <h2>Event volume (per hour)</h2>
          <div style={{ height: 250 }}>
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={volume}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="time" hide />
                <YAxis allowDecimals={false} />
                <Tooltip />
                <Line type="monotone" dataKey="count" stroke="#4f46e5" dot={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>

          <h2>Recent events</h2>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr style={{ textAlign: "left", borderBottom: "1px solid #ddd" }}>
                <th>Ledger</th>
                <th>Event type</th>
                <th>Adapter</th>
                <th>Decoded</th>
              </tr>
            </thead>
            <tbody>
              {events.length === 0 && (
                <tr>
                  <td colSpan={4} style={{ padding: "1rem 0", color: "#666" }}>
                    No events indexed yet — make sure the ingestion service is running and pointed
                    at this contract ID.
                  </td>
                </tr>
              )}
              {events.map((evt) => (
                <tr key={evt.id} style={{ borderBottom: "1px solid #eee" }}>
                  <td>{evt.ledger_sequence}</td>
                  <td>{evt.event_type}</td>
                  <td>{evt.adapter_name ?? "—"}</td>
                  <td>
                    <code style={{ fontSize: "0.8em" }}>
                      {JSON.stringify(evt.decoded ?? evt.value)}
                    </code>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}
    </div>
  );
}
