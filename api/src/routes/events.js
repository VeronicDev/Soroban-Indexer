import { Router } from "express";
import { listEvents, getEventById, parseListParams, eventVolumeByHour } from "../db.js";
import { logError } from "../logger.js";

export const eventsRouter = Router();

// GET /events?contract=&type=&from=&to=&limit=&offset=
eventsRouter.get("/", async (req, res) => {
  try {
    const { contract, type, from, to } = req.query;
    const { limit, offset } = parseListParams(req.query);

    const events = await listEvents({ contract, type, from, to, limit, offset });

    res.json({
      data: events,
      pagination: { limit, offset, count: events.length },
    });
  } catch (err) {
    logError("GET /events error", err, { query: req.query });
    res.status(500).json({ error: "internal_error" });
  }
});

// GET /events/volume?contract= — used by the example dashboard's chart
eventsRouter.get("/volume", async (req, res) => {
  try {
    const { contract } = req.query;
    if (!contract) {
      return res.status(400).json({ error: "contract query param is required" });
    }
    const buckets = await eventVolumeByHour(contract);
    res.json({ data: buckets });
  } catch (err) {
    logError("GET /events/volume error", err, { query: req.query });
    res.status(500).json({ error: "internal_error" });
  }
});

// GET /events/:id
eventsRouter.get("/:id", async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id)) {
      return res.status(400).json({ error: "id must be an integer" });
    }

    const event = await getEventById(id);
    if (!event) {
      return res.status(404).json({ error: "not_found" });
    }

    res.json({ data: event });
  } catch (err) {
    logError("GET /events/:id error", err, { id: req.params.id });
    res.status(500).json({ error: "internal_error" });
  }
});
