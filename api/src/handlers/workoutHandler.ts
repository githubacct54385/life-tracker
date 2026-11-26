import { Hono } from "hono";
import { TIME_ZONE_HEADER, saveWorkoutGoalRequestSchema, saveWorkoutRequestSchema, workoutGoalSchema, workoutListResponseSchema, workoutRecordSchema } from "@life-tracker/shared";
import type { WorkoutService } from "../services/workoutService.js";
import { errorTypeOf, type Logger } from "../telemetry/logger.js";

export interface WorkoutDeps {
  logger: Logger;
  workouts: WorkoutService;
}

const parseId = (raw: string): number | undefined => (/^[1-9]\d{0,15}$/.test(raw) ? Number(raw) : undefined);

/** Routes under /api/workouts. The owner has already been checked by the app's middleware (every route, every method). */
export function workoutRoutes({ logger, workouts }: WorkoutDeps): Hono {
  const routes = new Hono();

  routes.get("/", async (c) => {
    const list = await workouts.list();
    logger.info("workouts.list", { rowCount: list.length });
    return c.json(workoutListResponseSchema.parse({ workouts: list }));
  });

  // The goal routes come before "/:id", so "goal" is never read as a workout id.
  routes.get("/goal", async (c) => c.json(workoutGoalSchema.parse({ perWeek: await workouts.goal() })));

  routes.put("/goal", async (c) => {
    const body = saveWorkoutGoalRequestSchema.safeParse(await c.req.json().catch(() => undefined));
    if (!body.success) return c.json({ error: "invalid_request" }, 400);
    return c.json(workoutGoalSchema.parse({ perWeek: await workouts.setGoal(body.data.perWeek) }));
  });

  routes.post("/", async (c) => {
    const body = saveWorkoutRequestSchema.safeParse(await c.req.json().catch(() => undefined));
    if (!body.success) return c.json({ error: "invalid_request" }, 400);
    return c.json(workoutRecordSchema.parse(await workouts.log(body.data, c.req.header(TIME_ZONE_HEADER))), 201);
  });

  routes.put("/:id", async (c) => {
    const id = parseId(c.req.param("id"));
    const body = saveWorkoutRequestSchema.safeParse(await c.req.json().catch(() => undefined));
    if (id === undefined || !body.success) return c.json({ error: "invalid_request" }, 400);
    const updated = await workouts.edit(id, body.data);
    return updated ? c.json(workoutRecordSchema.parse(updated)) : c.json({ error: "not_found" }, 404);
  });

  routes.delete("/:id", async (c) => {
    const id = parseId(c.req.param("id"));
    if (id === undefined) return c.json({ error: "invalid_request" }, 400);
    try {
      return (await workouts.remove(id)) ? c.body(null, 204) : c.json({ error: "not_found" }, 404);
    } catch (error) {
      logger.error("workouts.delete_failed", { errorType: errorTypeOf(error) });
      return c.json({ error: "internal" }, 500);
    }
  });

  return routes;
}
