// Hono environment type — shared by all routers and middleware
export type AppEnv = {
  Variables: {
    userId: number;
    userRole: string;
    sessionId: string;
  };
};
